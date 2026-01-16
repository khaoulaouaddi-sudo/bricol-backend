const pool = require("../db");

const CompanyPhotoModel = {
  async getAllByCompany(companyId) {
    const q = `SELECT * FROM company_photos WHERE company_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [companyId]);
    return rows;
  },

  async create({ company_id, image_url, caption = null, is_cover = false }) {
    const q = `
      INSERT INTO company_photos (company_id, image_url, caption, is_cover)
      VALUES ($1,$2,$3,$4)
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [company_id, image_url, caption, is_cover]);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM company_photos WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  // ✅ PATCH cover + caption
  async updateById(id, { is_cover, caption }) {
    const q = `
      UPDATE company_photos
      SET
        is_cover = COALESCE($2, is_cover),
        caption  = COALESCE($3, caption)
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [id, is_cover ?? null, caption ?? null]);
    return rows[0];
  },

  // ✅ Met cette photo en couverture (et enlève la couverture des autres photos de la même company)
  async setCover(id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: r1 } = await client.query(
        `SELECT id, company_id FROM company_photos WHERE id = $1`,
        [id]
      );
      const row = r1[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `UPDATE company_photos SET is_cover = FALSE WHERE company_id = $1`,
        [row.company_id]
      );

      const { rows: r2 } = await client.query(
        `UPDATE company_photos SET is_cover = TRUE WHERE id = $1 RETURNING *`,
        [id]
      );

      await client.query("COMMIT");
      return r2[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
};

module.exports = CompanyPhotoModel;
