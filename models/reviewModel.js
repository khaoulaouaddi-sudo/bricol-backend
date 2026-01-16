// models/reviewModel.js
const pool = require("../db");

const ReviewModel = {
  async getByWorkerProfile(workerProfileId) {
    const q = `
      SELECT r.*, u.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE r.target_worker_profile_id = $1
      ORDER BY r.created_at DESC, r.id DESC;
    `;
    const { rows } = await pool.query(q, [workerProfileId]);
    return rows;
  },

  async getByCompanyProfile(companyProfileId) {
    const q = `
      SELECT r.*, u.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE r.target_company_profile_id = $1
      ORDER BY r.created_at DESC, r.id DESC;
    `;
    const { rows } = await pool.query(q, [companyProfileId]);
    return rows;
  },

  async getMineForWorkerProfile(workerProfileId, reviewerId) {
    const q = `
      SELECT r.*, u.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE r.target_worker_profile_id = $1 AND r.reviewer_id = $2
      LIMIT 1;
    `;
    const { rows } = await pool.query(q, [workerProfileId, reviewerId]);
    return rows[0] || null;
  },

  async getMineForCompanyProfile(companyProfileId, reviewerId) {
    const q = `
      SELECT r.*, u.name AS reviewer_name
      FROM reviews r
      LEFT JOIN users u ON u.id = r.reviewer_id
      WHERE r.target_company_profile_id = $1 AND r.reviewer_id = $2
      LIMIT 1;
    `;
    const { rows } = await pool.query(q, [companyProfileId, reviewerId]);
    return rows[0] || null;
  },

  // ✅ NEW: list all reviews written by a reviewer (for /history)
  async getMineByReviewer(reviewerId, { limit = 50, offset = 0 } = {}) {
    const q = `
      (
        SELECT
          r.id,
          r.rating,
          r.comment,
          r.created_at,
          r.updated_at,
          'worker'::text AS target_type,
          r.target_worker_profile_id AS target_profile_id,
          u2.name AS target_name,
          s.name AS sector_name,
          s.slug AS sector_slug,
          ph.image_url AS cover_url
        FROM reviews r
        JOIN worker_profiles wp ON wp.id = r.target_worker_profile_id
        LEFT JOIN users u2 ON u2.id = wp.user_id
        LEFT JOIN sectors s ON s.id = wp.sector_id
        LEFT JOIN LATERAL (
          SELECT p.image_url
          FROM worker_photos p
          WHERE p.profile_id = wp.id
          ORDER BY p.is_cover DESC, p.created_at DESC, p.id DESC
          LIMIT 1
        ) ph ON true
        WHERE r.reviewer_id = $1
          AND r.target_worker_profile_id IS NOT NULL
      )
      UNION ALL
      (
        SELECT
          r.id,
          r.rating,
          r.comment,
          r.created_at,
          r.updated_at,
          'company'::text AS target_type,
          r.target_company_profile_id AS target_profile_id,
          cp.name AS target_name,
          s.name AS sector_name,
          s.slug AS sector_slug,
          ph.image_url AS cover_url
        FROM reviews r
        JOIN company_profiles cp ON cp.id = r.target_company_profile_id
        LEFT JOIN LATERAL (
          SELECT s2.*
          FROM company_sectors cs
          JOIN sectors s2 ON s2.id = cs.sector_id
          WHERE cs.company_id = cp.id
          ORDER BY s2.id ASC
          LIMIT 1
        ) s ON true
        LEFT JOIN LATERAL (
          SELECT p.image_url
          FROM company_photos p
          WHERE p.company_id = cp.id
          ORDER BY p.is_cover DESC, p.created_at DESC, p.id DESC
          LIMIT 1
        ) ph ON true
        WHERE r.reviewer_id = $1
          AND r.target_company_profile_id IS NOT NULL
      )
      ORDER BY updated_at DESC NULLS LAST, created_at DESC, id DESC
      LIMIT $2 OFFSET $3;
    `;
    const { rows } = await pool.query(q, [reviewerId, limit, offset]);
    return rows;
  },

  async createForWorkerProfile({ reviewer_id, target_worker_profile_id, rating, comment }) {
    const q = `
      INSERT INTO reviews (reviewer_id, target_worker_profile_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [
      reviewer_id,
      target_worker_profile_id,
      rating,
      comment ?? null,
    ]);
    return rows[0];
  },

  async createForCompanyProfile({ reviewer_id, target_company_profile_id, rating, comment }) {
    const q = `
      INSERT INTO reviews (reviewer_id, target_company_profile_id, rating, comment)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [
      reviewer_id,
      target_company_profile_id,
      rating,
      comment ?? null,
    ]);
    return rows[0];
  },

  async update(id, { rating, comment }) {
    const q = `
      UPDATE reviews
      SET
        rating = COALESCE($2, rating),
        comment = COALESCE($3, comment),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [id, rating ?? null, comment ?? null]);
    return rows[0] || null;
  },

  async delete(id) {
    const q = `DELETE FROM reviews WHERE id = $1;`;
    await pool.query(q, [id]);
    return true;
  },
};

module.exports = ReviewModel;
