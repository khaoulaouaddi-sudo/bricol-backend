// models/sectorModel.js
// Lecture seule. Fournit une liste des secteurs (avec famille/umbrella) et un label contextuel.

const pool = require("../db");

function pickLabel(row, type) {
  if (type === "worker") return row.worker_label_fr || row.name;
  if (type === "company") return row.company_label_fr || row.name;
  return row.name;
}

async function getAll({ umbrellaSlug = null, type = null } = {}) {
  const values = [];
  const where = [];

  if (umbrellaSlug) {
    values.push(String(umbrellaSlug));
    where.push(`sf.slug = $${values.length}`);
  }

  const sql = `
    SELECT
      s.id,
      s.slug,
      s.name,
      s.worker_label_fr,
      s.company_label_fr,
      s.name_ar,
      s.worker_label_ar,
      s.company_label_ar,
      sf.slug AS umbrella_slug,
      sf.name_fr AS umbrella_name_fr,
      sf.name_ar AS umbrella_name_ar
    FROM public.sectors s
    JOIN public.sector_families sf ON sf.id = s.umbrella_id
    ${where.length ? `WHERE ${where.join(" AND ")}` : ``}
    ORDER BY sf.name_fr ASC, s.name ASC;
  `;

  const { rows } = await pool.query(sql, values);

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    label: pickLabel(r, type),
    // Champs AR disponibles (ne cassent pas le front si non utilisés)
    name_ar: r.name_ar,
    label_ar:
      type === "worker"
        ? (r.worker_label_ar || r.name_ar || null)
        : type === "company"
          ? (r.company_label_ar || r.name_ar || null)
          : (r.name_ar || null),
    umbrella: {
      slug: r.umbrella_slug,
      name: r.umbrella_name_fr,
      name_ar: r.umbrella_name_ar,
    },
  }));
}

async function getBySlug(slug) {
  const { rows } = await pool.query(
    `
    SELECT
      s.id,
      s.slug,
      s.name,
      s.worker_label_fr,
      s.company_label_fr,
      s.name_ar,
      s.worker_label_ar,
      s.company_label_ar,
      sf.id   AS umbrella_id,
      sf.slug AS umbrella_slug,
      sf.name_fr AS umbrella_name_fr,
      sf.name_ar AS umbrella_name_ar
    FROM public.sectors s
    JOIN public.sector_families sf ON sf.id = s.umbrella_id
    WHERE s.slug = $1
    LIMIT 1;
    `,
    [String(slug)]
  );

  const r = rows[0];
  if (!r) return null;

  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    name_ar: r.name_ar,
    worker_label_fr: r.worker_label_fr,
    company_label_fr: r.company_label_fr,
    worker_label_ar: r.worker_label_ar,
    company_label_ar: r.company_label_ar,
    umbrella: {
      id: r.umbrella_id,
      slug: r.umbrella_slug,
      name: r.umbrella_name_fr,
      name_ar: r.umbrella_name_ar,
    },
  };
}

async function getByUmbrellaSlug(umbrellaSlug, { type = null } = {}) {
  const { rows } = await pool.query(
    `
    SELECT
      s.id,
      s.slug,
      s.name,
      s.worker_label_fr,
      s.company_label_fr,
      s.name_ar,
      s.worker_label_ar,
      s.company_label_ar,
      sf.slug AS umbrella_slug,
      sf.name_fr AS umbrella_name_fr,
      sf.name_ar AS umbrella_name_ar
    FROM public.sectors s
    JOIN public.sector_families sf ON sf.id = s.umbrella_id
    WHERE sf.slug = $1
    ORDER BY s.name ASC;
    `,
    [String(umbrellaSlug)]
  );

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    label: pickLabel(r, type),
    name_ar: r.name_ar,
    label_ar:
      type === "worker"
        ? (r.worker_label_ar || r.name_ar || null)
        : type === "company"
          ? (r.company_label_ar || r.name_ar || null)
          : (r.name_ar || null),
    umbrella: {
      slug: r.umbrella_slug,
      name: r.umbrella_name_fr,
      name_ar: r.umbrella_name_ar,
    },
  }));
}

module.exports = {
  getAll,
  getBySlug,
  getByUmbrellaSlug,
};
