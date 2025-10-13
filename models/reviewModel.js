// models/reviewModel.js
const pool = require("../db");

const ReviewModel = {
  async getAll() {
    const q = `
      SELECT r.*, 
             target.name AS target_user_name, 
             rev.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users target ON r.target_user_id = target.id
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q);
    return rows;
  },

  async getById(id) {
    const q = `
      SELECT r.*, 
             target.name AS target_user_name, 
             rev.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users target ON r.target_user_id = target.id
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      WHERE r.id = $1;
    `;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async getByTargetUser(targetUserId) {
    const q = `
      SELECT r.*, rev.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      WHERE r.target_user_id = $1
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q, [targetUserId]);
    return rows;
  },

  async getByReviewer(reviewerId) {
    const q = `
      SELECT r.*, target.name AS target_user_name
      FROM reviews r
      LEFT JOIN users target ON r.target_user_id = target.id
      WHERE r.reviewer_id = $1
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q, [reviewerId]);
    return rows;
  },

  async create({ target_user_id, reviewer_id, rating, comment }) {
    const q = `
      INSERT INTO reviews (target_user_id, reviewer_id, rating, comment)
      VALUES ($1,$2,$3,$4)
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [target_user_id, reviewer_id, rating, comment]);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM reviews WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },
async update(id, { rating, comment }) {
    const q = `
      UPDATE reviews
      SET rating = $1, comment = $2
      WHERE id = $3
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [rating, comment, id]);
    return rows[0];
  }
};

module.exports = ReviewModel;