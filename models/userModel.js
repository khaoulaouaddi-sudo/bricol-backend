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
    const q = `SELECT * FROM worker_profiles WHERE user_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [userId]);
    return rows;
  },

  async getByEmail(email) {
    const q = `SELECT * FROM users WHERE email = $1 LIMIT 1`;
    const { rows } = await pool.query(q, [email]);
    return rows[0];
  }
};

module.exports = UserModel;