// controllers/authController.js — Auth solide (register + verify email + login + refresh + forgot/reset)
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

const { validatePasswordStrength } = require("../utils/passwordPolicy");
const { sendMail, isMailerDisabled } = require("../utils/mailer");

// ===== ENV =====
const ACCESS_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

const COOKIE_NAME = process.env.COOKIE_NAME || "bricol_refresh_token";
const COOKIE_SECURE = process.env.COOKIE_SECURE === "true";
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || "Lax";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || undefined;

const INCLUDE_REFRESH_IN_LOGIN_RESPONSE =
  (process.env.INCLUDE_REFRESH_IN_LOGIN_RESPONSE ?? "true") === "true";

const ROTATE_REFRESH = process.env.ROTATE_REFRESH === "true";

// Si true => on bloque login local tant que email_verified_at est NULL
const REQUIRE_EMAIL_VERIFICATION = (process.env.REQUIRE_EMAIL_VERIFICATION ?? "true") === "true";

// Durées tokens
const EMAIL_VERIFY_TTL_MIN = Number(process.env.EMAIL_VERIFY_TTL_MIN || 60 * 24); // 24h
const RESET_TTL_MIN = Number(process.env.RESET_TTL_MIN || 60); // 1h

const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "http://localhost:3000";

// ===== helpers =====
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, token_version: user.token_version || 0 },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

function signRefreshToken(jti, user) {
  return jwt.sign(
    { id: user.id, role: user.role, jti, token_version: user.token_version || 0 },
    REFRESH_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );
}

function setRefreshCookie(res, token, maxAgeMs) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: "/",
    maxAge: maxAgeMs ?? undefined,
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: COOKIE_SAMESITE,
    domain: COOKIE_DOMAIN,
    path: "/",
  });
}

function msFromExpClaim(token) {
  const decoded = jwt.decode(token);
  const expSec = decoded?.exp;
  if (!expSec) return null;
  const ms = expSec * 1000 - Date.now();
  return ms > 0 ? ms : 0;
}

function readIncomingRefresh(req) {
  const fromCookie = req.cookies?.[COOKIE_NAME];
  if (fromCookie) return fromCookie;

  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const t = authHeader.slice(7).trim();
    if (t) return t;
  }

  const fromBody = req.body?.refresh_token;
  if (fromBody) return fromBody;

  return null;
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input)).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

async function getUserByEmail(email) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, password_hash, token_version, is_active, suspended_at, email_verified_at
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [email]
  );
  return rows[0] || null;
}

async function getUserById(id) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, token_version, is_active, suspended_at, email_verified_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function insertRefreshRow(jti, userId, req, refreshToken) {
  const ttlMs = msFromExpClaim(refreshToken) ?? 30 * 24 * 60 * 60 * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);
  const userAgent = req.headers["user-agent"] || null;
  const ip = req.ip || null;

  await pool.query(
    `INSERT INTO refresh_tokens (jti, user_id, expires_at, user_agent, ip)
     VALUES ($1, $2, $3, $4, $5)`,
    [jti, userId, expiresAt, userAgent, ip]
  );

  return { expiresAt, ttlMs };
}

async function revokeRefresh(jti) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE jti = $1 AND revoked_at IS NULL`,
    [jti]
  );
}

async function revokeAllRefreshForUser(userId) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId]
  );
}

async function verifyAndLoadRefreshOrThrow(token) {
  let payload;
  try {
    payload = jwt.verify(token, REFRESH_SECRET);
  } catch {
    const err = new Error("invalid_refresh");
    err.status = 401;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT jti, user_id, expires_at, revoked_at
     FROM refresh_tokens
     WHERE jti = $1`,
    [payload.jti]
  );

  const row = rows[0];
  if (!row || row.revoked_at) {
    const err = new Error("revoked_or_missing_refresh");
    err.status = 401;
    throw err;
  }
  if (new Date(row.expires_at) < new Date()) {
    const err = new Error("expired_refresh");
    err.status = 401;
    throw err;
  }

  return payload;
}

function assertNotSuspended(user) {
  if (user.role !== "admin" && (user.is_active === false || user.suspended_at)) {
    const err = new Error("suspended");
    err.status = 403;
    throw err;
  }
}

// ===== Email templates =====
function verificationEmailHtml({ name, verifyUrl }) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Bienvenue ${name || ""} sur Bricola</h2>
      <p>Confirme ton email en cliquant ici :</p>
      <p><a href="${verifyUrl}">Confirmer mon email</a></p>
      <p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
    </div>
  `;
}

function resetEmailHtml({ resetUrl }) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5">
      <h2>Réinitialisation du mot de passe</h2>
      <p>Pour choisir un nouveau mot de passe :</p>
      <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
      <p>Si tu n'es pas à l'origine de cette demande, ignore cet email.</p>
    </div>
  `;
}

// ===== Controllers =====

async function register(req, res) {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ msg: "Champs requis: name, email, password" });
    }

    const policy = validatePasswordStrength(password);
    if (!policy.ok) {
      return res.status(400).json({ msg: "Mot de passe faible", issues: policy.issues });
    }

    const existing = await getUserByEmail(email);
    if (existing) {
      // anti-enumération (optionnel). Ici on reste clair mais safe:
      return res.status(400).json({ msg: "Email déjà utilisé" });
    }

    const hash = await bcrypt.hash(String(password), 10);

    await pool.query("BEGIN");
    let userId;
    try {
      const ins = await pool.query(
        `INSERT INTO users (name, email, password_hash, role, auth_provider_primary, email_verified_at)
         VALUES ($1, $2, $3, 'visitor', 'local', NULL)
         RETURNING id, name, email, role`,
        [name, email, hash]
      );
      userId = ins.rows[0].id;

      // créer token de vérification email
      const rawToken = randomToken(32);
      const tokenHash = sha256(rawToken);
      const expiresAt = new Date(Date.now() + EMAIL_VERIFY_TTL_MIN * 60 * 1000);

      await pool.query(
        `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [userId, tokenHash, expiresAt]
      );

      await pool.query("COMMIT");

      const verifyUrl = `${PUBLIC_APP_URL}/verify-email?token=${rawToken}`;

      // envoi email (ou fallback dev)
      try {
        const info = await sendMail({
          to: email,
          subject: "Bricola - Confirme ton email",
          html: verificationEmailHtml({ name, verifyUrl }),
        });

        if (info?.disabled) {
          return res.status(201).json({
            msg: "Compte créé. (MAILER_DISABLED) Utilise ce lien pour vérifier l'email.",
            verify_url: verifyUrl,
          });
        }

        return res.status(201).json({ msg: "Compte créé. Vérifie ton email pour activer la connexion." });
      } catch (mailErr) {
        // compte créé mais email pas envoyé => on renvoie lien en dev
        console.error("register mail error:", mailErr);
        return res.status(201).json({
          msg: "Compte créé. Impossible d'envoyer l'email (SMTP).",
          verify_url: verifyUrl,
        });
      }
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }
  } catch (err) {
    console.error("register err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function verifyEmail(req, res) {
  try {
    const { token } = req.body || {};
    if (!token) return res.status(400).json({ msg: "token requis" });

    const tokenHash = sha256(token);

    const r = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM email_verification_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );
    if (r.rowCount === 0) return res.status(400).json({ msg: "Token invalide" });

    const row = r.rows[0];
    if (row.used_at) return res.status(400).json({ msg: "Token déjà utilisé" });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ msg: "Token expiré" });

    await pool.query("BEGIN");
    try {
      await pool.query(`UPDATE users SET email_verified_at = NOW() WHERE id = $1`, [row.user_id]);
      await pool.query(`UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    return res.json({ msg: "Email confirmé. Vous pouvez vous connecter." });
  } catch (err) {
    console.error("verifyEmail err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ msg: "Email et mot de passe requis" });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(401).json({ msg: "Email ou mot de passe invalide" });

    const ok = await bcrypt.compare(String(password), user.password_hash || "");
    if (!ok) return res.status(401).json({ msg: "Email ou mot de passe invalide" });

    assertNotSuspended(user);

    if (REQUIRE_EMAIL_VERIFICATION && user.role !== "admin" && !user.email_verified_at) {
      return res.status(403).json({ msg: "Veuillez confirmer votre email avant de vous connecter." });
    }

    await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    // Refresh
    const jti = crypto.randomUUID ? crypto.randomUUID() : randomToken(16);
    const refreshToken = signRefreshToken(jti, user);
    const { ttlMs } = await insertRefreshRow(jti, user.id, req, refreshToken);
    setRefreshCookie(res, refreshToken, ttlMs);

    // Access
    const access_token = signAccessToken(user);

    const body = {
      access_token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
    if (INCLUDE_REFRESH_IN_LOGIN_RESPONSE) body.refresh_token = refreshToken;

    return res.json(body);
  } catch (err) {
    console.error("login err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function refresh(req, res) {
  try {
    const incoming = readIncomingRefresh(req);
    if (!incoming) {
      return res.status(400).json({ msg: "refresh_token requis (cookie, Authorization: Bearer ou body)" });
    }

    const payload = await verifyAndLoadRefreshOrThrow(incoming);

    const user = await getUserById(payload.id);
    if (!user) return res.status(401).json({ msg: "Utilisateur introuvable" });

    assertNotSuspended(user);

    // token_version check
    const tvToken = Number(payload.token_version ?? 0);
    const tvDb = Number(user.token_version ?? 0);
    if (tvToken !== tvDb) {
      return res.status(401).json({ msg: "Session révoquée, veuillez vous reconnecter." });
    }

    // throttle last_login_at (optionnel : ici simple)
    await pool.query(
      `UPDATE users
       SET last_login_at = NOW()
       WHERE id = $1 AND (last_login_at IS NULL OR last_login_at < NOW() - INTERVAL '15 minutes')`,
      [user.id]
    );

    if (ROTATE_REFRESH) {
      await revokeRefresh(payload.jti);

      const newJti = crypto.randomUUID ? crypto.randomUUID() : randomToken(16);
      const newRefresh = signRefreshToken(newJti, user);
      const { ttlMs } = await insertRefreshRow(newJti, user.id, req, newRefresh);
      setRefreshCookie(res, newRefresh, ttlMs);

      const access_token = signAccessToken(user);
      const out = { access_token };
      if (INCLUDE_REFRESH_IN_LOGIN_RESPONSE) out.refresh_token = newRefresh;
      return res.json(out);
    }

    const access_token = signAccessToken(user);
    return res.json({ access_token });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ msg: "Refresh invalide" });
    console.error("refresh err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function logout(req, res) {
  try {
    const incoming = readIncomingRefresh(req);
    if (incoming) {
      try {
        const payload = jwt.verify(incoming, REFRESH_SECRET);
        await revokeRefresh(payload.jti);
      } catch {}
    }
    clearRefreshCookie(res);
    return res.json({ ok: true });
  } catch (err) {
    console.error("logout err:", err);
    try { clearRefreshCookie(res); } catch {}
    return res.json({ ok: true });
  }
}

async function forgotPassword(req, res) {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ msg: "email requis" });

    // réponse neutre anti-enumération
    const neutral = { msg: "Si un compte existe, un email a été envoyé." };

    const u = await getUserByEmail(email);
    if (!u) return res.json(neutral);

    // créer token reset (hashé en DB)
    const rawToken = randomToken(32);
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TTL_MIN * 60 * 1000);

    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [u.id, tokenHash, expiresAt]
    );

    const resetUrl = `${PUBLIC_APP_URL}/reset-password?token=${rawToken}`;

    try {
      const info = await sendMail({
        to: u.email,
        subject: "Bricola - Réinitialisation du mot de passe",
        html: resetEmailHtml({ resetUrl }),
      });

      if (info?.disabled) {
        return res.json({ ...neutral, reset_url: resetUrl });
      }

      return res.json(neutral);
    } catch (mailErr) {
      console.error("forgotPassword mail error:", mailErr);
      // fallback pour test
      return res.json({ ...neutral, reset_url: resetUrl });
    }
  } catch (err) {
    console.error("forgotPassword err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function resetPassword(req, res) {
  try {
    const { token, password } = req.body || {};
    if (!token || !password) return res.status(400).json({ msg: "token et password requis" });

    const policy = validatePasswordStrength(password);
    if (!policy.ok) {
      return res.status(400).json({ msg: "Mot de passe faible", issues: policy.issues });
    }

    const tokenHash = sha256(token);

    const r = await pool.query(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1
       LIMIT 1`,
      [tokenHash]
    );

    if (r.rowCount === 0) return res.status(400).json({ msg: "Token invalide" });

    const row = r.rows[0];
    if (row.used_at) return res.status(400).json({ msg: "Token déjà utilisé" });
    if (new Date(row.expires_at).getTime() < Date.now()) return res.status(400).json({ msg: "Token expiré" });

    const hash = await bcrypt.hash(String(password), 10);

    await pool.query("BEGIN");
    try {
      // password update + invalidate sessions
      await pool.query(
        `UPDATE users
         SET password_hash = $1,
             token_version = token_version + 1
         WHERE id = $2`,
        [hash, row.user_id]
      );

      await pool.query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);
      await revokeAllRefreshForUser(row.user_id);

      await pool.query("COMMIT");
    } catch (e) {
      await pool.query("ROLLBACK");
      throw e;
    }

    return res.json({ msg: "Mot de passe réinitialisé. Vous pouvez vous connecter." });
  } catch (err) {
    console.error("resetPassword err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

module.exports = {
  register,
  verifyEmail,
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
};
