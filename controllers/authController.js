// controllers/authController.js
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const pool = require("../db");

// Durées par défaut si absentes du .env
const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

// Helpers internes (pas de dépendance externe)
function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

// Émet access + refresh, enregistre le refresh en DB (rotation gérée ailleurs)
async function issueTokens(user, req) {
  // 1) access
  const accessToken = signAccessToken(user);

  // 2) refresh (avec jti)
  const jti = crypto.randomUUID();
  const refreshToken = jwt.sign(
    { id: user.id, role: user.role, jti },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );

  // 3) enregistrer le refresh en DB (expire_at = exp du JWT)
  const decoded = jwt.decode(refreshToken);
  const expSeconds = decoded?.exp;
  const expiresAt = expSeconds ? new Date(expSeconds * 1000) : null;

  await pool.query(
    `INSERT INTO refresh_tokens (jti, user_id, expires_at, user_agent, ip)
     VALUES ($1,$2,$3,$4,$5)`,
    [jti, user.id, expiresAt, req?.headers?.["user-agent"] || null, req?.ip || null]
  );

  return { accessToken, refreshToken };
}

async function verifyAndLoadRefresh(refreshToken) {
  // 1) vérifier la signature/expiration
  const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  const { id: userId, jti } = payload;

  // 2) vérifier l'existence et l'état en DB
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE jti=$1 AND user_id=$2 LIMIT 1`,
    [jti, userId]
  );
  if (!rows.length) throw new Error("refresh_not_found");

  const row = rows[0];
  if (row.revoked_at) throw new Error("refresh_revoked");
  if (new Date(row.expires_at) < new Date()) throw new Error("refresh_expired");

  return { userId, jti };
}

async function revokeRefresh(jti) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at=now() WHERE jti=$1 AND revoked_at IS NULL`,
    [jti]
  );
}

const AuthController = {
  // POST /auth/login
  async login(req, res) {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ msg: "email et password requis" });
      }

      const { rows } = await pool.query(
        `SELECT * FROM users WHERE email=$1 LIMIT 1`,
        [email.toLowerCase()]
      );
      if (!rows.length) return res.status(401).json({ msg: "Identifiants invalides" });

      const user = rows[0];

      // Si le compte est OAuth-only (pas de password), on refuse le login local
      if (!user.password_hash) {
        return res.status(401).json({ msg: "Ce compte utilise la connexion OAuth" });
      }

      const ok = await bcrypt.compare(password, user.password_hash);
      if (!ok) return res.status(401).json({ msg: "Identifiants invalides" });

      await pool.query(`UPDATE users SET last_login_at=now() WHERE id=$1`, [user.id]);

      const { accessToken, refreshToken } = await issueTokens(user, req);

      return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token: accessToken, // alias pour compat Postman existant
        user: { id: user.id, name: user.name, role: user.role },
      });
    } catch (err) {
      console.error("login err:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // POST /auth/refresh  { refresh_token }
  async refresh(req, res) {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) return res.status(400).json({ msg: "refresh_token requis" });

      const { userId, jti } = await verifyAndLoadRefresh(refresh_token);

      // Charger l'utilisateur
      const { rows } = await pool.query(
        `SELECT id, name, role FROM users WHERE id=$1 LIMIT 1`,
        [userId]
      );
      if (!rows.length) {
        await revokeRefresh(jti); // sécurité
        return res.status(401).json({ msg: "Utilisateur inexistant" });
      }
      const user = rows[0];

      // Rotation : révoquer l'ancien refresh et émettre un nouveau couple
      await revokeRefresh(jti);
      const { accessToken, refreshToken } = await issueTokens(user, req);

      return res.json({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } catch (err) {
      console.error("refresh err:", err.message || err);
      return res.status(401).json({ msg: "Refresh invalide ou expiré" });
    }
  },

  // POST /auth/logout  { refresh_token }
  async logout(req, res) {
    try {
      const { refresh_token } = req.body;
      if (!refresh_token) return res.status(400).json({ msg: "refresh_token requis" });

      const { jti } = await verifyAndLoadRefresh(refresh_token);
      await revokeRefresh(jti);

      return res.json({ msg: "Déconnecté" });
    } catch (err) {
      console.error("logout err:", err.message || err);
      // si déjà révoqué/expiré, on ne révèle rien → 200
      return res.status(200).json({ msg: "Déjà déconnecté" });
    }
  },
};

module.exports = AuthController;