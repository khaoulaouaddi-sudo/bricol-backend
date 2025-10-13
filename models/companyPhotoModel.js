const pool = require("../db");

const CompanyPhotoModel = {
  async getAllByCompany(companyId) {
    const q = `SELECT * FROM company_photos WHERE company_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [companyId]);
    return rows;
  },

  async create({ company_id, image_url }) {
    const q = `INSERT INTO company_photos (company_id, image_url) VALUES ($1,$2) RETURNING *;`;
    const { rows } = await pool.query(q, [company_id, image_url]);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM company_photos WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  }
};

module.exports = CompanyPhotoModel;