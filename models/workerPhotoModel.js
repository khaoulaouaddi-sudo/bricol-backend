// models/workerPhotoModel.js
const pool = require("../db");

const WorkerPhotoModel = {
  async getAll() {
    const q = `SELECT * FROM worker_photos ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q);
    return rows;
  },

  async getById(id) {
    const q = `SELECT * FROM worker_photos WHERE id = $1;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async create({ profile_id, image_url }) {
    const q = `INSERT INTO worker_photos (profile_id, image_url) VALUES ($1,$2) RETURNING *;`;
    const { rows } = await pool.query(q, [profile_id, image_url]);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM worker_photos WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async getByProfile(profileId) {
    const q = `SELECT * FROM worker_photos WHERE profile_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [profileId]);
    return rows;
  }
};

module.exports = WorkerPhotoModel;