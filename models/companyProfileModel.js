const pool = require("../db");

const CompanyProfileModel = {
  async getAll() {
    const q = `
      SELECT cp.*, u.name AS user_name, u.email
      FROM company_profiles cp
      JOIN users u ON cp.user_id = u.id
      ORDER BY cp.created_at DESC;
    `;
    const { rows } = await pool.query(q);
    return rows;
  },

  async getById(id) {
    const q = `
      SELECT cp.*, u.name AS user_name, u.email
      FROM company_profiles cp
      JOIN users u ON cp.user_id = u.id
      WHERE cp.id = $1;
    `;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async create({ user_id, name, description, sector_main, location, website, phone, email }) {
    const q = `
      INSERT INTO company_profiles (user_id, name, description, sector_main, location, website, phone, email)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [user_id, name, description, sector_main, location, website, phone, email]);
    return rows[0];
  },

  async update(id, data) {
    const fields = [];
    const values = [];
    let idx = 1;

    for (let key in data) {
      fields.push(`${key} = $${idx++}`);
      values.push(data[key]);
    }
    if (fields.length === 0) return null;

    values.push(id);
    const q = `UPDATE company_profiles SET ${fields.join(", ")} WHERE id = $${idx} RETURNING *;`;
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM company_profiles WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  }
};

module.exports = CompanyProfileModel;