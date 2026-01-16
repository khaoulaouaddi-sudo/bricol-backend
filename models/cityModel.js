const pool = require("../db");

const City = {
  async list({ q, limit = 20 }) {
    const lim = Math.min(parseInt(limit || 20, 10), 100);
    if (q && q.trim()) {
      const term = `%${q.toLowerCase().trim()}%`;
      const { rows } = await pool.query(
        `SELECT id, slug, name_fr, name_ar, region
         FROM cities
         WHERE LOWER(name_fr) LIKE $1 OR LOWER(slug) LIKE $1
         ORDER BY name_fr ASC
         LIMIT $2`,
        [term, lim]
      );
      return rows;
    }
    const { rows } = await pool.query(
      `SELECT id, slug, name_fr, name_ar, region
       FROM cities
       ORDER BY name_fr ASC
       LIMIT $1`,
       [lim]
    );
    return rows;
  },

  async getById(id) {
    const { rows } = await pool.query(
      `SELECT id, slug, name_fr, name_ar, region, lat, lng
       FROM cities
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] || null;
  },
};

module.exports = City;
