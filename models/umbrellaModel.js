// models/umbrellaModel.js
const pool = require("../db");

/**
 * Liste toutes les familles avec leurs secteurs.
 * Option: type = 'worker' | 'company' (adapte le label des secteurs)
 *
 * Compat: on garde les champs existants (name, label) + on ajoute *_ar et label_ar.
 */
async function getAll({ type = null } = {}) {
  const sql = `
    SELECT
      sf.id        AS family_id,
      sf.slug      AS family_slug,
      sf.name_fr   AS family_name,
      sf.name_ar   AS family_name_ar,

      s.id         AS sector_id,
      s.slug       AS sector_slug,
      s.name       AS sector_name,
      s.name_ar    AS sector_name_ar,

      s.worker_label_fr,
      s.company_label_fr,
      s.worker_label_ar,
      s.company_label_ar

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
        name: r.family_name,          // compat (FR)
        name_ar: r.family_name_ar,    // nouveau
        sectors: [],
      });
    }

    if (r.sector_id) {
      const labelFr =
        type === "worker"
          ? (r.worker_label_fr || r.sector_name)
          : type === "company"
          ? (r.company_label_fr || r.sector_name)
          : r.sector_name;

      const labelAr =
        type === "worker"
          ? (r.worker_label_ar || r.sector_name_ar || r.sector_name)
          : type === "company"
          ? (r.company_label_ar || r.sector_name_ar || r.sector_name)
          : (r.sector_name_ar || r.sector_name);

      families.get(r.family_slug).sectors.push({
        id: r.sector_id,
        slug: r.sector_slug,

        name: r.sector_name,           // compat (FR)
        name_ar: r.sector_name_ar,     // nouveau

        label: labelFr,                // compat (FR, utilisé par le front actuel)
        label_ar: labelAr,             // nouveau
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
    SELECT id, slug, name_fr, name_ar
    FROM public.sector_families
    WHERE slug = $1
    LIMIT 1
  `;
  const famRes = await pool.query(famSql, [slug]);
  const fam = famRes.rows[0];
  if (!fam) return null;

  const secSql = `
    SELECT
      s.id,
      s.slug,
      s.name,
      s.name_ar,
      s.worker_label_fr,
      s.company_label_fr,
      s.worker_label_ar,
      s.company_label_ar
    FROM public.sectors s
    WHERE s.umbrella_id = $1
    ORDER BY s.name ASC
  `;
  const secRes = await pool.query(secSql, [fam.id]);

  const sectors = secRes.rows.map((s) => {
    const labelFr =
      type === "worker"
        ? (s.worker_label_fr || s.name)
        : type === "company"
        ? (s.company_label_fr || s.name)
        : s.name;

    const labelAr =
      type === "worker"
        ? (s.worker_label_ar || s.name_ar || s.name)
        : type === "company"
        ? (s.company_label_ar || s.name_ar || s.name)
        : (s.name_ar || s.name);

    return {
      id: s.id,
      slug: s.slug,

      name: s.name,          // compat (FR)
      name_ar: s.name_ar,    // nouveau

      label: labelFr,        // compat (FR)
      label_ar: labelAr,     // nouveau
    };
  });

  return {
    id: fam.id,
    slug: fam.slug,

    name: fam.name_fr,       // compat (FR)
    name_ar: fam.name_ar,    // nouveau

    sectors,
  };
}

module.exports = {
  getAll,
  getBySlug,
};
