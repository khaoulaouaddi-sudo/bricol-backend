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

async function resolveUmbrella(input) {
  if (!input) return null;
  if (/^\d+$/.test(String(input))) return Number(input);
  const { rows } = await pool.query(
    `SELECT id FROM public.sector_families WHERE slug = $1 LIMIT 1`,
    [String(input)]
  );
  return rows[0]?.id ?? null;
}

async function search({ city, sector, umbrella, type, page = 1, limit = 20 }) {
  const cityId = await resolveCity(city);
  const sectorId = await resolveSector(sector);
  const umbrellaId = await resolveUmbrella(umbrella);

  const values = {};
  let idx = 0;

  function bind(key, v) {
    idx += 1;
    values[key] = { i: idx, v };
    return `$${idx}`;
  }

  const cityBind = cityId !== null ? bind("city", cityId) : null;
  const sectorBind = sectorId !== null ? bind("sector", sectorId) : null;
  const umbrellaBind =
    !sectorId && umbrellaId !== null ? bind("umbrella", umbrellaId) : null;

  const whereWorker = `
    ${cityBind ? `AND wp.city_id = ${cityBind}` : ``}
    ${
      sectorBind
        ? `AND s.id = ${sectorBind}`
        : umbrellaBind
        ? `AND s.umbrella_id = ${umbrellaBind}`
        : ``
    }
  `;

  const whereCompany = `
    ${cityBind ? `AND cp.city_id = ${cityBind}` : ``}
    ${
      sectorBind
        ? `AND EXISTS (
            SELECT 1
            FROM public.company_sectors cs2
            JOIN public.sectors s2 ON s2.id = cs2.sector_id
            WHERE cs2.company_id = cp.id
              AND s2.id = ${sectorBind}
          )`
        : umbrellaBind
        ? `AND EXISTS (
            SELECT 1
            FROM public.company_sectors cs2
            JOIN public.sectors s2 ON s2.id = cs2.sector_id
            WHERE cs2.company_id = cp.id
              AND s2.umbrella_id = ${umbrellaBind}
          )`
        : ``
    }
  `;

  const limitNum = Math.min(Math.max(Number(limit) || 20, 1), 50);
  const offsetNum = (Math.max(Number(page) || 1, 1) - 1) * limitNum;

  // Branches SQL
  const sqlWorker = `
    SELECT
      'worker' AS profile_type,
      wp.id     AS profile_id,
      wp.title  AS title_or_name,

      c.id      AS city_id,
      c.slug    AS city_slug,
      c.name_fr AS city_name,
      c.name_ar AS city_name_ar,

      s.id      AS sector_id,
      s.slug    AS sector_slug,
      s.name    AS sector_name,
      s.name_ar AS sector_name_ar,
      COALESCE(s.worker_label_fr, s.name) AS sector_label_fr,
      COALESCE(s.worker_label_ar, s.name_ar, s.name) AS sector_label_ar,

      sf.slug   AS umbrella_slug,
      sf.name_fr AS umbrella_name,
      sf.name_ar AS umbrella_name_ar,

      -- ✅ FIX UNION: sqlCompany a "sectors" => sqlWorker doit aussi l'avoir (même position/type)
      NULL::jsonb AS sectors,

      wp.verification_status, wp.trust_badge,
      wp.created_at,

      ph.image_url AS cover_url,

      rv.reviews_avg,
      rv.reviews_count

    FROM public.worker_profiles wp
    JOIN public.sectors s ON s.id = wp.sector_id
    LEFT JOIN public.sector_families sf ON sf.id = s.umbrella_id
    JOIN public.cities c ON c.id = wp.city_id

    -- Photo à afficher : cover si existe, sinon la plus récente
    LEFT JOIN LATERAL (
      SELECT p.image_url
      FROM public.worker_photos p
      WHERE p.profile_id = wp.id
      ORDER BY p.is_cover DESC, p.created_at DESC, p.id DESC
      LIMIT 1
    ) ph ON true

    -- Reviews agrégées
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE ROUND(AVG(r.rating)::numeric, 1)
        END AS reviews_avg,
        COUNT(*)::int AS reviews_count
      FROM public.reviews r
      WHERE r.target_worker_profile_id = wp.id
    ) rv ON true

    WHERE 1=1
    ${whereWorker}
  `;

  const sqlCompany = `
    SELECT
      'company' AS profile_type,
      cp.id     AS profile_id,
      cp.name   AS title_or_name,

      c.id      AS city_id,
      c.slug    AS city_slug,
      c.name_fr AS city_name,
      c.name_ar AS city_name_ar,

      -- ✅ Secteur "principal" (1 seul) pour compat avec le front actuel
      s1.sector_id,
      s1.sector_slug,
      s1.sector_name,
      s1.sector_name_ar,
      s1.sector_label_fr,
      s1.sector_label_ar,

      s1.umbrella_slug,
      s1.umbrella_name,
      s1.umbrella_name_ar,

      -- ✅ Tous les secteurs de l'entreprise (liste)
      COALESCE(sectors_agg.sectors, '[]'::jsonb) AS sectors,

      NULL::text AS verification_status, NULL::bool AS trust_badge,
      cp.created_at,

      ph.image_url AS cover_url,

      rv.reviews_avg,
      rv.reviews_count

    FROM public.company_profiles cp
    JOIN public.cities c ON c.id = cp.city_id

    -- ✅ Tous les secteurs agrégés (pas de doublons)
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(DISTINCT jsonb_build_object(
        'id', s.id,
        'slug', s.slug,
        'name', s.name,
        'name_ar', s.name_ar,
        'label_fr', COALESCE(s.company_label_fr, s.name),
        'label_ar', COALESCE(s.company_label_ar, s.name_ar, s.name)
      )) AS sectors
      FROM public.company_sectors cs
      JOIN public.sectors s ON s.id = cs.sector_id
      WHERE cs.company_id = cp.id
    ) sectors_agg ON true

    -- ✅ Un secteur principal (le premier) + umbrella
    LEFT JOIN LATERAL (
      SELECT
        s.id      AS sector_id,
        s.slug    AS sector_slug,
        s.name    AS sector_name,
        s.name_ar AS sector_name_ar,
        COALESCE(s.company_label_fr, s.name) AS sector_label_fr,
        COALESCE(s.company_label_ar, s.name_ar, s.name) AS sector_label_ar,
        sf.slug   AS umbrella_slug,
        sf.name_fr AS umbrella_name,
        sf.name_ar AS umbrella_name_ar
      FROM public.company_sectors cs
      JOIN public.sectors s ON s.id = cs.sector_id
      LEFT JOIN public.sector_families sf ON sf.id = s.umbrella_id
      WHERE cs.company_id = cp.id
      ORDER BY cs.id ASC
      LIMIT 1
    ) s1 ON true

    -- Photo à afficher : cover si existe, sinon la plus récente
    LEFT JOIN LATERAL (
      SELECT p.image_url
      FROM public.company_photos p
      WHERE p.company_id = cp.id
      ORDER BY p.is_cover DESC, p.created_at DESC, p.id DESC
      LIMIT 1
    ) ph ON true

    -- Reviews agrégées
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE ROUND(AVG(r.rating)::numeric, 1)
        END AS reviews_avg,
        COUNT(*)::int AS reviews_count
      FROM public.reviews r
      WHERE r.target_company_profile_id = cp.id
    ) rv ON true

    WHERE 1=1
    ${whereCompany}
  `;

  // Sélection selon "type"
  let sqlUnion;
  if (type === "worker") {
    sqlUnion = sqlWorker;
  } else if (type === "company") {
    sqlUnion = sqlCompany;
  } else {
    sqlUnion = `${sqlWorker} UNION ALL ${sqlCompany}`;
  }

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

  const arrValues = Array.from(Object.values(values))
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

    city: {
      id: r.city_id,
      slug: r.city_slug,
      name_fr: r.city_name, // existant
      name_ar: r.city_name_ar, // nouveau
    },

    sector: {
      id: r.sector_id,
      slug: r.sector_slug,
      name: r.sector_name, // existant
      name_ar: r.sector_name_ar, // nouveau
    },

    sectors: r.profile_type === "company" ? (r.sectors ?? []) : undefined,

    umbrella: r.umbrella_slug
      ? {
          slug: r.umbrella_slug,
          name: r.umbrella_name, // existant
          name_ar: r.umbrella_name_ar, // nouveau
        }
      : null,

    badges:
      r.profile_type === "worker"
        ? {
            verification_status: r.verification_status,
            trust_badge: r.trust_badge,
          }
        : null,

    cover_url: r.cover_url ?? null,
    reviews_avg: r.reviews_avg === null ? null : Number(r.reviews_avg),
    reviews_count: Number(r.reviews_count ?? 0),
    created_at: r.created_at,
  }));

  const total = countRes.rows[0]?.total ?? 0;
  const pageNum = Math.max(Number(page) || 1, 1);

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

async function selectedProfiles({ limit = 12 } = {}) {
  const take = Math.min(Math.max(Number(limit) || 12, 1), 12);
  const wantBest = Math.floor(take / 2);
  const wantLatest = take - wantBest;

  const baseUnion = `
    SELECT
      'worker' AS profile_type,
      wp.id    AS profile_id,
      u.name   AS display_name,
      s.slug   AS sector_slug,
      s.name   AS sector_name,
      s.name_ar AS sector_name_ar,
      COALESCE(s.worker_label_fr, s.name) AS sector_label_fr,
      COALESCE(s.worker_label_ar, s.name_ar, s.name) AS sector_label_ar,
      wp.created_at,
      ph.image_url AS cover_url,
      rv.reviews_avg,
      rv.reviews_count
    FROM public.worker_profiles wp
    LEFT JOIN public.users u ON u.id = wp.user_id
    LEFT JOIN public.sectors s ON s.id = wp.sector_id
    LEFT JOIN LATERAL (
      SELECT p.image_url
      FROM public.worker_photos p
      WHERE p.profile_id = wp.id
      ORDER BY p.is_cover DESC, p.created_at DESC, p.id DESC
      LIMIT 1
    ) ph ON true
    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE ROUND(AVG(r.rating)::numeric, 1)
        END AS reviews_avg,
        COUNT(*)::int AS reviews_count
      FROM public.reviews r
      WHERE r.target_worker_profile_id = wp.id
    ) rv ON true

    UNION ALL

    SELECT
      'company' AS profile_type,
      cp.id     AS profile_id,
      cp.name   AS display_name,
      s1.sector_slug,
      s1.sector_name,
      s1.sector_name_ar,
      s1.sector_label_fr,
      s1.sector_label_ar,
      cp.created_at,
      ph.image_url AS cover_url,
      rv.reviews_avg,
      rv.reviews_count
    FROM public.company_profiles cp

    -- ✅ FIX: un seul secteur par company (sinon duplication via JOIN company_sectors)
    LEFT JOIN LATERAL (
      SELECT
        s.slug AS sector_slug,
        s.name AS sector_name,
        s.name_ar AS sector_name_ar,
        COALESCE(s.company_label_fr, s.name) AS sector_label_fr,
        COALESCE(s.company_label_ar, s.name_ar, s.name) AS sector_label_ar
      FROM public.company_sectors cs
      JOIN public.sectors s ON s.id = cs.sector_id
      WHERE cs.company_id = cp.id
      ORDER BY cs.id ASC
      LIMIT 1
    ) s1 ON true

    LEFT JOIN LATERAL (
      SELECT p.image_url
      FROM public.company_photos p
      WHERE p.company_id = cp.id
      ORDER BY p.is_cover DESC, p.created_at DESC, p.id DESC
      LIMIT 1
    ) ph ON true

    LEFT JOIN LATERAL (
      SELECT
        CASE WHEN COUNT(*) = 0 THEN NULL
             ELSE ROUND(AVG(r.rating)::numeric, 1)
        END AS reviews_avg,
        COUNT(*)::int AS reviews_count
      FROM public.reviews r
      WHERE r.target_company_profile_id = cp.id
    ) rv ON true
  `;

  const bestLimit = Math.max(wantBest * 5, 20);
  const latestLimit = Math.max(wantLatest * 5, 20);
  const randomLimit = 60;

  const [bestRes, latestRes, randomRes] = await Promise.all([
    pool.query(
      `WITH base AS (${baseUnion})
       SELECT * FROM base
       WHERE COALESCE(reviews_count, 0) > 0
       ORDER BY reviews_avg DESC NULLS LAST, reviews_count DESC, created_at DESC
       LIMIT $1;`,
      [bestLimit]
    ),
    pool.query(
      `WITH base AS (${baseUnion})
       SELECT * FROM base
       ORDER BY created_at DESC
       LIMIT $1;`,
      [latestLimit]
    ),
    pool.query(
      `WITH base AS (${baseUnion})
       SELECT * FROM base
       ORDER BY random()
       LIMIT $1;`,
      [randomLimit]
    ),
  ]);

  const normalize = (r) => ({
    profile_type: r.profile_type,
    profile_id: Number(r.profile_id),
    display_name: r.display_name ?? null,
    sector:
      r.sector_slug || r.sector_name
        ? {
            slug: r.sector_slug ?? null,
            name: r.sector_name ?? null,
            name_ar: r.sector_name_ar ?? null,
            label: r.sector_label_fr ?? null,
            label_ar: r.sector_label_ar ?? null,
          }
        : null,
    cover_url: r.cover_url ?? null,
    reviews_avg: r.reviews_avg === null ? null : Number(r.reviews_avg),
    reviews_count: Number(r.reviews_count ?? 0),
    created_at: r.created_at,
  });

  const best = bestRes.rows.map(normalize);
  const latest = latestRes.rows.map(normalize);
  const random = randomRes.rows.map(normalize);

  const out = [];
  const seen = new Set();
  const keyOf = (p) => `${p.profile_type}:${p.profile_id}`;

  for (const p of best) {
    if (out.length >= wantBest) break;
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }

  for (const p of latest) {
    if (out.length >= wantBest + wantLatest) break;
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }

  for (const p of random) {
    if (out.length >= take) break;
    const k = keyOf(p);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }

  return { items: out.slice(0, take) };
}

module.exports = { search, selectedProfiles };
