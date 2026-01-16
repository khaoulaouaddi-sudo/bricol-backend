// controllers/oauthController.js — flux Google/Facebook aligné auth (JWT + refresh en DB)
const fetch = require("node-fetch");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");


// ====== ENV & constantes (mêmes que authController) ======
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

// ====== helpers ======
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

function parseRefreshToMs(s) {
  const m = String(s).match(/^(\d+)([smhd])$/i);
  if (!m) return 30 * 24 * 60 * 60 * 1000;
  const n = parseInt(m[1], 10);
  const u = m[2].toLowerCase();
  const mult = u === "s" ? 1000 : u === "m" ? 60 * 1000 : u === "h" ? 3600 * 1000 : 24 * 3600 * 1000;
  return n * mult;
}

function msFromExpClaim(token) {
  const decoded = jwt.decode(token);
  const expSec = decoded?.exp;
  if (!expSec) return null;
  const ms = expSec * 1000 - Date.now();
  return ms > 0 ? ms : 0;
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

async function insertRefreshRow(jti, userId, req, refreshToken) {
  const ttlMs = msFromExpClaim(refreshToken) ?? parseRefreshToMs(REFRESH_EXPIRES_IN);
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

async function loadAuthUser(userId) {
  const { rows } = await pool.query(
    `SELECT id, name, email, role, token_version, is_active, suspended_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function assertNotSuspended(user) {
  // admin: BD-only pour suspension admin, mais on laisse login admin OK
  if (user.role !== "admin" && (user.is_active === false || user.suspended_at)) {
    const err = new Error("suspended");
    err.status = 403;
    throw err;
  }
}

async function touchLastLoginNow(userId) {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [userId]);
}

/**
 * ✅ RIGIDE: trouve ou crée un user OAuth, en garantissant:
 * - si on crée: auth_provider_primary = provider, password_hash = NULL OK
 * - si on merge par email sur un legacy "local + password_hash NULL": on corrige en provider
 * - email_verified_at si provider dit email vérifié
 * - transaction pour éviter les races
 */
async function findOrCreateOAuthUser({ provider, provider_user_id, email, name, emailVerified }) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Trouver par provider
    let userId = null;
    {
      const r = await client.query(
        `SELECT user_id
         FROM user_providers
         WHERE provider = $1 AND provider_user_id = $2
         LIMIT 1`,
        [provider, provider_user_id]
      );
      userId = r.rows[0]?.user_id ?? null;
    }

    // 2) Sinon, fusion par email
    if (!userId && email) {
      const r = await client.query(
        `SELECT id, auth_provider_primary, password_hash, email_verified_at
         FROM users
         WHERE lower(email) = lower($1)
         LIMIT 1
         FOR UPDATE`,
        [email]
      );
      const row = r.rows[0];

      if (row) {
        userId = row.id;

        // ✅ Cas legacy dangereux : local + password NULL => on corrige
        if (row.auth_provider_primary === "local" && row.password_hash == null) {
          await client.query(
            `UPDATE users SET auth_provider_primary = $2 WHERE id = $1`,
            [userId, provider]
          );
        }

        // ✅ Si provider confirme email vérifié et pas encore marqué chez nous
        if (emailVerified && !row.email_verified_at) {
          await client.query(
            `UPDATE users SET email_verified_at = NOW() WHERE id = $1`,
            [userId]
          );
        }
      }
    }

    // 3) Sinon, créer l’utilisateur OAuth (IMPORTANT: auth_provider_primary = provider)
    if (!userId) {
      const r = await client.query(
        `INSERT INTO users (name, email, auth_provider_primary, email_verified_at, password_hash)
         VALUES ($1, $2, $3, ${emailVerified ? "NOW()" : "NULL"}, NULL)
         RETURNING id`,
        [name, email, provider]
      );
      userId = r.rows[0].id;
    }

    // 4) Lier provider (UPSERT idempotent) — TOUJOURS avec le même client
    await client.query(
      `INSERT INTO user_providers (user_id, provider, provider_user_id, email)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (provider, provider_user_id)
       DO UPDATE SET user_id = EXCLUDED.user_id, email = EXCLUDED.email`,
      [userId, provider, provider_user_id, email]
    );

    await client.query("COMMIT");
    return { id: userId };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}


// ====== Controllers ======

async function google(req, res) {
  try {
    const { id_token } = req.body || {};
    if (!id_token) return res.status(400).json({ msg: "id_token requis" });

    const infoRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(id_token)}`
    );
    if (!infoRes.ok) return res.status(401).json({ msg: "id_token invalide" });

    const info = await infoRes.json();

    const provider_user_id = info.sub;
    const email = info.email ? info.email : null;
    const emailVerified = String(info.email_verified) !== "false"; // tokeninfo renvoie parfois "true"/"false"
    const name = info.name || info.given_name || "Utilisateur";

    if (!provider_user_id) return res.status(400).json({ msg: "sub manquant" });

    // ✅ rigide: find/create + auth_provider_primary correct
    const user = await findOrCreateOAuthUser({
      provider: "google",
      provider_user_id,
      email,
      name,
      emailVerified,
    });

    const authUser = await loadAuthUser(user.id);
    if (!authUser) return res.status(401).json({ msg: "Utilisateur introuvable" });

    await assertNotSuspended(authUser);
    await touchLastLoginNow(authUser.id);

    const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    const refreshToken = signRefreshToken(jti, authUser);
    const { ttlMs } = await insertRefreshRow(jti, authUser.id, req, refreshToken);
    setRefreshCookie(res, refreshToken, ttlMs);

    const accessToken = signAccessToken(authUser);

    const body = {
      access_token: accessToken,
      user: { id: authUser.id, name: authUser.name, email: authUser.email, role: authUser.role },
    };
    if (INCLUDE_REFRESH_IN_LOGIN_RESPONSE) body.refresh_token = refreshToken;

    return res.json(body);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ msg: "Compte suspendu ou désactivé" });
    console.error("oauth google err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function facebook(req, res) {
  try {
    let { access_token, email } = req.body || {};
    if (!access_token) return res.status(400).json({ msg: "access_token requis" });

    const r = await fetch(
      `https://graph.facebook.com/me?fields=id,name,email&access_token=${encodeURIComponent(access_token)}`
    );
    if (!r.ok) return res.status(401).json({ msg: "access_token invalide" });

    const info = await r.json();

    const provider_user_id = info.id;
    const nameFb = info.name || "Utilisateur Facebook";
    const emailFromFb = info.email || null;

    // Facebook peut ne pas fournir l'email -> on exige le champ email dans body si absent
    if (!emailFromFb && !email) {
      return res.status(400).json({ msg: "Facebook n'a pas fourni d'email; passez 'email' dans le body." });
    }
    if (!email) email = emailFromFb;
    if (!provider_user_id) return res.status(400).json({ msg: "id manquant" });

    // Facebook ne garantit pas toujours un flag "verified" via ce endpoint
    const emailVerified = true; // si tu préfères strict: mets false et utilise un flow de vérification mail.

    const user = await findOrCreateOAuthUser({
      provider: "facebook",
      provider_user_id,
      email,
      name: nameFb,
      emailVerified,
    });

    const authUser = await loadAuthUser(user.id);
    if (!authUser) return res.status(401).json({ msg: "Utilisateur introuvable" });

    await assertNotSuspended(authUser);
    await touchLastLoginNow(authUser.id);

    const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString("hex");
    const refreshToken = signRefreshToken(jti, authUser);
    const { ttlMs } = await insertRefreshRow(jti, authUser.id, req, refreshToken);
    setRefreshCookie(res, refreshToken, ttlMs);

    const accessToken = signAccessToken(authUser);

    const body = {
      access_token: accessToken,
      user: { id: authUser.id, name: authUser.name, email: authUser.email, role: authUser.role },
    };
    if (INCLUDE_REFRESH_IN_LOGIN_RESPONSE) body.refresh_token = refreshToken;

    return res.json(body);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ msg: "Compte suspendu ou désactivé" });
    console.error("oauth facebook err:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}

module.exports = { google, facebook };
