const pool = require("../db");

const CompanySectorModel = {
  async getAllByCompany(companyId) {
    const q = `SELECT * FROM company_sectors WHERE company_id = $1 ORDER BY id;`;
    const { rows } = await pool.query(q, [companyId]);
    return rows;
  },

  async create({ company_id, sector }) {
    const q = `INSERT INTO company_sectors (company_id, sector) VALUES ($1,$2) RETURNING *;`;
    const { rows } = await pool.query(q, [company_id, sector]);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM company_sectors WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  }
};

module.exports = CompanySectorModel;