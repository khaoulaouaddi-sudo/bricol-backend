// utils/tokens.js
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const pool = require("../db");

const ACCESS_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "1h";
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";

function signAccessToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

async function issueTokens(user, req) {
  // access
  const accessToken = signAccessToken(user);

  // refresh (avec jti)
  const jti = uuidv4();
  const refreshToken = jwt.sign(
    { id: user.id, role: user.role, jti },
    process.env.REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN }
  );

  // exp = seconde epoch => date
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
  // 1) vérifier la signature/exp du JWT refresh
  const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
  const { id: userId, jti } = payload;

  // 2) vérifier en base que le refresh n’est pas révoqué/expiré
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE jti=$1 AND user_id=$2 LIMIT 1`,
    [jti, userId]
  );
  if (!rows.length) throw new Error("refresh_not_found");

  const row = rows[0];
  if (row.revoked_at) throw new Error("refresh_revoked");
  if (new Date(row.expires_at) < new Date()) throw new Error("refresh_expired");

  return { userId, jti, payload };
}

async function revokeRefresh(jti) {
  await pool.query(`UPDATE refresh_tokens SET revoked_at=now() WHERE jti=$1 AND revoked_at IS NULL`, [jti]);
}

module.exports = {
  signAccessToken,
  issueTokens,
  verifyAndLoadRefresh,
  revokeRefresh,
};