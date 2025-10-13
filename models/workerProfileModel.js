// models/workerProfileModel.js
const pool = require("../db");

const WorkerProfileModel = {
  async getAll() {
    const q = `
      SELECT wp.*, u.name AS user_name, u.profile_photo AS user_photo
      FROM worker_profiles wp
      LEFT JOIN users u ON wp.user_id = u.id
      ORDER BY wp.created_at DESC;
    `;
    const { rows } = await pool.query(q);
    return rows;
  },

  async getById(id) {
    const q = `
      SELECT wp.*, u.name AS user_name, u.profile_photo AS user_photo
      FROM worker_profiles wp
      LEFT JOIN users u ON wp.user_id = u.id
      WHERE wp.id = $1;
    `;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async create(data) {
    const { user_id, title, description, skills, experience, location, available, verification_status, trust_badge } = data;
    const q = `
      INSERT INTO worker_profiles (user_id, title, description, skills, experience, location, available, verification_status, trust_badge)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *;
    `;
    const values = [user_id, title, description || null, skills || null, experience || null, location || null, available ?? true, verification_status || 'non_verifie', trust_badge ?? false];
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async update(id, data) {
    const allowed = ["title","description","skills","experience","location","available","verification_status","trust_badge"];
    const fields = []; const values = []; let idx = 1;
    for (const k of Object.keys(data)) {
      if (allowed.includes(k)) { fields.push(`${k} = $${idx++}`); values.push(data[k]); }
    }
    if (fields.length === 0) return null;
    const q = `UPDATE worker_profiles SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP WHERE id = $${idx} RETURNING *;`;
    values.push(id);
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM worker_profiles WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async getPhotos(profileId) {
    const q = `SELECT * FROM worker_photos WHERE profile_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [profileId]);
    return rows;
  },

  async getReviewsForProfile(profileId) {
    // On mappe via user_id de ce profil vers reviews.target_user_id
    const q = `
      SELECT r.*, rev.name AS reviewer_name
      FROM worker_profiles wp
      JOIN reviews r ON r.target_user_id = wp.user_id
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      WHERE wp.id = $1
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q, [profileId]);
    return rows;
  }
};

module.exports = WorkerProfileModel;