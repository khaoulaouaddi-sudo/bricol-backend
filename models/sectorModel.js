// models/searchModel.js
const pool = require("../db");

// Utilitaires: résolutions slug -> id
async function resolveCity(input) {
  if (!input) return null;
  if (/^\d+$/.test(String(input))) return Number(input);
  const { rows } = await pool.query(
    `SELECT id FROM public.cities WHERE slug = $1 LIMIT 1`,
    [String(input)]
  );
  return rows[0]?.id ?? null;
}

async function resolveSector(input) {
  if (!input) return null;
  if (/^\d+$/.test(String(input))) return Number(input);
  const { rows } = await pool.query(
    `SELECT id FROM public.sectors WHERE slug = $1 LIMIT 1`,
    [String(input)]
  );
  return rows[0]?.id ?? null;
}

async function resolveUmbrellaSlug(slug) {
  if (!slug) return null;
  // chez toi: sector_families = umbrellas
  const { rows } = await pool.query(
    `SELECT id FROM public.sector_families WHERE slug = $1 LIMIT 1`,
    [String(slug)]
  );
  return rows[0]?.id ?? null;
}

async function search({ city, sector, umbrella, type, page = 1, limit = 20 }) {
  const cityId = await resolveCity(city);
  const sectorId = await resolveSector(sector);
  const umbrellaId = await resolveUmbrellaSlug(umbrella);

  // pagination safe
  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const pageNum = Math.max(Number(page) || 1, 1);
  const offsetNum = (pageNum - 1) * limitNum;

  // bind helper (pour garder tes binds dynamiques)
  const values = {};
  let idx = 0;
  const bind = (k, v) => {
    if (v !== null && v !== undefined) {
      idx += 1;
      values[k] = { i: idx, v };
      return `$${idx}`;
    }
    return null;
  };

  const cityBind = cityId !== null ? bind("city", cityId) : null;
  const sectorBind = sectorId !== null ? bind("sector", sectorId) : null;
  const umbrellaBind = (!sectorId && umbrellaId !== null) ? bind("umbrella", umbrellaId) : null;

  const whereWorker = `
    ${cityBind ? `AND wp.city_id = ${cityBind}` : ``}
    ${sectorBind ? `AND s.id = ${sectorBind}` : (umbrellaBind ? `AND s.umbrella_id = ${umbrellaBind}` : ``)}
  `;

  const whereCompany = `
    ${cityBind ? `AND cp.city_id = ${cityBind}` : ``}
    ${sectorBind ? `AND sc.sector_id = ${sectorBind}` : (umbrellaBind ? `AND sc.umbrella_id = ${umbrellaBind}` : ``)}
  `;

  // ✅ Worker: 1 profil = 1 ligne, + description, + cover_url via LATERAL
  const sqlWorker = `
    SELECT
      'worker' AS profile_type,
      wp.id     AS profile_id,
      wp.title  AS title_or_name,
      wp.description AS description,
      c.id      AS city_id, c.slug AS city_slug, c.name_fr AS city_name,
      s.id      AS sector_id, s.slug AS sector_slug, s.name AS sector_name,
      sf.slug   AS umbrella_slug, sf.name_fr AS umbrella_name,
      wp.verification_status, wp.trust_badge,
      ph.image_url AS cover_url,
      wp.created_at
    FROM public.worker_profiles wp
    JOIN public.sectors s ON s.id = wp.sector_id
    LEFT JOIN public.sector_families sf ON sf.id = s.umbrella_id
    JOIN public.cities c ON c.id = wp.city_id

    LEFT JOIN LATERAL (
      SELECT wp2.image_url
      FROM public.worker_photos wp2
      WHERE wp2.profile_id = wp.id
      ORDER BY wp2.is_cover DESC, wp2.created_at DESC
      LIMIT 1
    ) ph ON TRUE

    WHERE 1=1
    ${whereWorker}
  `;

  // ✅ Company: éviter doublons => on choisit 1 secteur via LATERAL (1ère ligne)
  // + description, + cover_url via LATERAL (company_photos)
  const sqlCompany = `
    SELECT
      'company' AS profile_type,
      cp.id     AS profile_id,
      cp.name   AS title_or_name,
      cp.description AS description,
      c.id      AS city_id, c.slug AS city_slug, c.name_fr AS city_name,

      sc.sector_id   AS sector_id,
      sc.sector_slug AS sector_slug,
      sc.sector_name AS sector_name,

      sc.umbrella_slug  AS umbrella_slug,
      sc.umbrella_name  AS umbrella_name,

      NULL::text AS verification_status,
      NULL::bool AS trust_badge,

      ph.image_url AS cover_url,

      cp.created_at
    FROM public.company_profiles cp
    JOIN public.cities c ON c.id = cp.city_id

    JOIN LATERAL (
      SELECT
        s.id AS sector_id,
        s.slug AS sector_slug,
        s.name AS sector_name,
        sf.slug AS umbrella_slug,
        sf.name_fr AS umbrella_name,
        s.umbrella_id AS umbrella_id
      FROM public.company_sectors cs
      JOIN public.sectors s ON s.id = cs.sector_id
      LEFT JOIN public.sector_families sf ON sf.id = s.umbrella_id
      WHERE cs.company_id = cp.id
      ORDER BY cs.id ASC
      LIMIT 1
    ) sc ON TRUE

    LEFT JOIN LATERAL (
      SELECT cp2.image_url
      FROM public.company_photos cp2
      WHERE cp2.company_id = cp.id
      ORDER BY cp2.is_cover DESC, cp2.created_at DESC
      LIMIT 1
    ) ph ON TRUE

    WHERE 1=1
    ${whereCompany}
  `;

  let sqlUnion;
  if (type === "worker") sqlUnion = sqlWorker;
  else if (type === "company") sqlUnion = sqlCompany;
  else sqlUnion = `${sqlWorker} UNION ALL ${sqlCompany}`;

  const sqlPaged = `
    WITH base AS (
      ${sqlUnion}
    )
    SELECT * FROM base
    ORDER BY created_at DESC
    LIMIT ${limitNum} OFFSET ${offsetNum};
  `;

  const sqlCount = `
    WITH base AS (
      ${sqlUnion}
    )
    SELECT COUNT(*)::int AS total FROM base;
  `;

  const arrValues = Object.values(values)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.v);

  const [rowsRes, countRes] = await Promise.all([
    pool.query(sqlPaged, arrValues),
    pool.query(sqlCount, arrValues),
  ]);

  const items = rowsRes.rows.map((r) => ({
    profile_type: r.profile_type,
    profile_id: r.profile_id,
    title_or_name: r.title_or_name,
    description: r.description,
    cover_url: r.cover_url,

    city: r.city_id ? { id: r.city_id, slug: r.city_slug, name_fr: r.city_name } : null,
    sector: r.sector_id ? { id: r.sector_id, slug: r.sector_slug, name_fr: r.sector_name } : null,
    umbrella: r.umbrella_slug ? { slug: r.umbrella_slug, name_fr: r.umbrella_name } : null,

    badges:
      r.profile_type === "worker"
        ? { verification_status: r.verification_status, trust_badge: r.trust_badge }
        : null,

    created_at: r.created_at,
  }));

  const total = countRes.rows[0]?.total ?? 0;

  return {
    items,
    meta: {
      page: pageNum,
      limit: limitNum,
      total,
      has_more: offsetNum + items.length < total,
    },
  };
}

module.exports = { search };
