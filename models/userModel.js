// models/userModel.js
const pool = require("../db");

const UserModel = {
  async getAll() {
    const q = `SELECT id, name, email, phone, role, profile_photo, facebook_url, instagram_url, tiktok_url, google_id, facebook_id, created_at FROM users ORDER BY id;`;
    const { rows } = await pool.query(q);
    return rows;
  },

  async getById(id) {
    const q = `SELECT id, name, email, phone, role, profile_photo, facebook_url, instagram_url, tiktok_url, google_id, facebook_id, created_at FROM users WHERE id = $1;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async create(data) {
    const {
      name, email, password_hash, phone, role,
      profile_photo, facebook_url, instagram_url, tiktok_url,
      google_id, facebook_id
    } = data;

    const q = `
      INSERT INTO users
      (name, email, password_hash, phone, role, profile_photo, facebook_url, instagram_url, tiktok_url, google_id, facebook_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, name, email, phone, role, profile_photo, facebook_url, instagram_url, tiktok_url, google_id, facebook_id, created_at;
    `;
    const values = [name, email, password_hash, phone || null, role || "visitor", profile_photo || null, facebook_url || null, instagram_url || null, tiktok_url || null, google_id || null, facebook_id || null];
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async update(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;
    for (const key of Object.keys(data)) {
      if (["name","email","password_hash","phone","role","profile_photo","facebook_url","instagram_url","tiktok_url","google_id","facebook_id"].includes(key)) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) return null;
    const q = `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, name, email, phone, role, profile_photo, facebook_url, instagram_url, tiktok_url, google_id, facebook_id, created_at;`;
    values.push(id);
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM users WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  // Relations
  async getAdsByUser(userId) {
    const q = `SELECT id, user_id, title, description, price, type, location, image_url, created_at, updated_at FROM ads WHERE user_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [userId]);
    return rows;
  },

  async getMessagesByUser(userId) {
    const q = `
      SELECT m.*, s.name AS sender_name, r.name AS receiver_name
      FROM messages m
      LEFT JOIN users s ON m.sender_id = s.id
      LEFT JOIN users r ON m.receiver_id = r.id
      WHERE m.sender_id = $1 OR m.receiver_id = $1
      ORDER BY m.created_at DESC;
    `;
    const { rows } = await pool.query(q, [userId]);
    return rows;
  },

  async getReviewsWrittenBy(userId) {
    const q = `
      SELECT r.*, target.name AS worker_name, rev.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users target ON r.target_user_id = target.id
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      WHERE r.reviewer_id = $1
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q, [userId]);
    return rows;
  },

  async getReviewsForWorker(userId) {
    const q = `
      SELECT r.*, rev.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      WHERE r.target_user_id = $1
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q, [userId]);
    return rows;
  },

  async getProfilesByUser(userId) {
    const q = `
      WITH workers AS (
        SELECT 
          wp.id,
          'worker'::text AS profile_type,
          wp.created_at,
          wp.title AS title_or_name,
          jsonb_build_object(
            'slug', c.slug,
            'name_fr', c.name_fr
          ) AS city,
          jsonb_build_object(
            'slug', s.slug,
            'name', s.name
          ) AS sector,
          jsonb_build_object(
            'slug', f.slug,
            'name', f.name_fr
          ) AS umbrella,
          jsonb_build_object(
            'verification_status', wp.verification_status,
            'trust_badge', wp.trust_badge
          ) AS badges
        FROM worker_profiles wp
        LEFT JOIN cities c   ON c.id = wp.city_id
        LEFT JOIN sectors s  ON s.id = wp.sector_id
        LEFT JOIN sector_families f ON f.id = s.umbrella_id
        WHERE wp.user_id = $1
      ),
      companies AS (
        SELECT
          cp.id,
          'company'::text AS profile_type,
          cp.created_at,
          cp.name AS title_or_name,
          jsonb_build_object(
            'slug', c.slug,
            'name_fr', c.name_fr
          ) AS city,
          NULL::jsonb AS sector,
          NULL::jsonb AS umbrella,
          NULL::jsonb AS badges
        FROM company_profiles cp
        LEFT JOIN cities c ON c.id = cp.city_id
        WHERE cp.user_id = $1
      )
      SELECT * FROM workers
      UNION ALL
      SELECT * FROM companies
      ORDER BY created_at DESC, id DESC;
    `;
    const { rows } = await pool.query(q, [userId]);
    return rows;
  },


  async getByEmail(email) {
    const q = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
    const { rows } = await pool.query(q, [email]);
    return rows[0];
  },
async findByProvider({ provider, provider_user_id }) {
  const q = `
    SELECT u.*
    FROM user_providers up
    JOIN users u ON u.id = up.user_id
    WHERE up.provider = $1 AND up.provider_user_id = $2
    LIMIT 1;
  `;
  const { rows } = await pool.query(q, [provider, provider_user_id]);
  return rows[0] || null;
},

async linkProvider({ user_id, provider, provider_user_id, email = null }) {
  const q = `
    INSERT INTO user_providers (user_id, provider, provider_user_id, email)
    VALUES ($1,$2,$3,$4)
    ON CONFLICT (provider, provider_user_id) DO UPDATE
    SET email = EXCLUDED.email
    RETURNING *;
  `;
  const { rows } = await pool.query(q, [user_id, provider, provider_user_id, email]);
  return rows[0];
}
};

module.exports = UserModel;