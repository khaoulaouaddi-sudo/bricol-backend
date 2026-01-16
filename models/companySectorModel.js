const pool = require("../db");

const CompanySectorModel = {
  // joinLabels -> joint fields de sectors pour l’affichage
  async getAllByCompany(companyId, { joinLabels = true } = {}) {
    if (joinLabels) {
      const q = `
        SELECT
          cs.id,
          cs.company_id,
          cs.sector_id,
          s.slug,
          s.name,
          s.worker_label_fr,
          s.company_label_fr
        FROM company_sectors cs
        LEFT JOIN sectors s ON s.id = cs.sector_id
        WHERE cs.company_id = $1
        ORDER BY COALESCE(s.company_label_fr, s.name) ASC NULLS LAST, cs.id ASC
      `;
      const { rows } = await pool.query(q, [companyId]);
      return rows;
    }

    const { rows } = await pool.query(
      `SELECT id, company_id, sector_id
       FROM company_sectors
       WHERE company_id = $1
       ORDER BY id ASC`,
      [companyId]
    );
    return rows;
  },

  // create via sector_id uniquement
  async create({ company_id, sector_id }) {
    const sid = sector_id ? parseInt(sector_id, 10) : null;
    if (!sid) throw new Error("sector_id requis");

    const ins = await pool.query(
      `INSERT INTO company_sectors (company_id, sector_id)
       VALUES ($1, $2)
       ON CONFLICT (company_id, sector_id) DO NOTHING
       RETURNING id, company_id, sector_id`,
      [company_id, sid]
    );
    if (ins.rows[0]) return ins.rows[0];

    const sel = await pool.query(
      `SELECT id, company_id, sector_id
       FROM company_sectors
       WHERE company_id = $1 AND sector_id = $2
       LIMIT 1`,
      [company_id, sid]
    );
    return sel.rows[0];
  },

  // suppression REST: composite (companyId + sectorId)
  async deleteByCompanyAndSector(companyId, sectorId) {
    const { rows } = await pool.query(
      `DELETE FROM company_sectors
       WHERE company_id = $1 AND sector_id = $2
       RETURNING id`,
      [companyId, sectorId]
    );
    return rows[0];
  },
};

module.exports = CompanySectorModel;
