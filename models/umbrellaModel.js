// models/umbrellaModel.js
const pool = require("../db");

/**
 * Liste toutes les familles avec leurs secteurs.
 * Option: type = 'worker' | 'company' (adapte le label des secteurs)
 */
async function getAll({ type = null } = {}) {
  const sql = `
    SELECT
      sf.id        AS family_id,
      sf.slug      AS family_slug,
      sf.name_fr   AS family_name,
      s.id         AS sector_id,
      s.slug       AS sector_slug,
      s.name       AS sector_name,
      s.worker_label_fr,
      s.company_label_fr
    FROM public.sector_families sf
    LEFT JOIN public.sectors s ON s.umbrella_id = sf.id
    ORDER BY sf.name_fr ASC, s.name ASC
  `;
  const { rows } = await pool.query(sql);

  const families = new Map();
  for (const r of rows) {
    if (!families.has(r.family_slug)) {
      families.set(r.family_slug, {
        id: r.family_id,
        slug: r.family_slug,
        name: r.family_name,
        sectors: [],
      });
    }
    if (r.sector_id) {
      families.get(r.family_slug).sectors.push({
        id: r.sector_id,
        slug: r.sector_slug,
        name: r.sector_name,
        label:
          type === "worker"
            ? (r.worker_label_fr || r.sector_name)
            : type === "company"
            ? (r.company_label_fr || r.sector_name)
            : r.sector_name,
      });
    }
  }
  return Array.from(families.values());
}

/**
 * Détail d’une famille par slug, avec ses secteurs.
 */
async function getBySlug(slug, { type = null } = {}) {
  const famSql = `
    SELECT id, slug, name_fr
    FROM public.sector_families
    WHERE slug = $1
    LIMIT 1
  `;
  const famRes = await pool.query(famSql, [slug]);
  const fam = famRes.rows[0];
  if (!fam) return null;

  const secSql = `
    SELECT
      s.id, s.slug, s.name, s.worker_label_fr, s.company_label_fr
    FROM public.sectors s
    WHERE s.umbrella_id = $1
    ORDER BY s.name ASC
  `;
  const secRes = await pool.query(secSql, [fam.id]);

  const sectors = secRes.rows.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    label:
      type === "worker"
        ? (s.worker_label_fr || s.name)
        : type === "company"
        ? (s.company_label_fr || s.name)
        : s.name,
  }));

  return {
    id: fam.id,
    slug: fam.slug,
    name: fam.name_fr,
    sectors,
  };
}

module.exports = {
  getAll,
  getBySlug,
};
