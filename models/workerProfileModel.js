// models/workerProfileModel.js
const pool = require("../db");

const WorkerProfileModel = {
 async getAll(lang = "fr") {
  const q = `
    SELECT
      wp.*,
      u.name          AS user_name,
      u.profile_photo AS user_photo,

      -- ✅ ville JSON localisée
      (
        SELECT jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name_fr', c.name_fr,
          'name_ar', c.name_ar,
          'display_name', CASE WHEN $1 = 'ar' THEN c.name_ar ELSE c.name_fr END
        )
        FROM cities c
        WHERE c.id = wp.city_id
      ) AS city,

      -- ✅ secteur JSON localisé
      (
        SELECT jsonb_build_object(
          'id', s.id,
          'slug', s.slug,
          'name', s.name,
          'name_ar', s.name_ar,
          'worker_label_fr', s.worker_label_fr,
          'worker_label_ar', s.worker_label_ar,
          'company_label_fr', s.company_label_fr,
          'company_label_ar', s.company_label_ar,
          'display_name', CASE WHEN $1 = 'ar' THEN COALESCE(s.name_ar, s.name) ELSE s.name END,
          'display_label', CASE
            WHEN $1 = 'ar' THEN COALESCE(s.worker_label_ar, s.name_ar, s.name)
            ELSE COALESCE(s.worker_label_fr, s.name)
          END
        )
        FROM sectors s
        WHERE s.id = wp.sector_id
      ) AS sector

    FROM worker_profiles wp
    LEFT JOIN users u ON wp.user_id = u.id
    ORDER BY wp.created_at DESC;
  `;
  const { rows } = await pool.query(q, [lang === "ar" ? "ar" : "fr"]);
  return rows;
},


 async getById(id, lang = "fr") {
  const q = `
    SELECT
      wp.*,
      u.name           AS user_name,
      u.profile_photo  AS user_photo,
      u.phone          AS user_phone,
      u.facebook_url   AS user_facebook,
      u.instagram_url  AS user_instagram,
      u.tiktok_url     AS user_tiktok,
      u.email          AS user_email,

      -- ✅ ville JSON localisée
      (
        SELECT jsonb_build_object(
          'id', c.id,
          'slug', c.slug,
          'name_fr', c.name_fr,
          'name_ar', c.name_ar,
          'display_name', CASE WHEN $2 = 'ar' THEN c.name_ar ELSE c.name_fr END
        )
        FROM cities c
        WHERE c.id = wp.city_id
      ) AS city,

      -- ✅ secteur JSON localisé
      (
        SELECT jsonb_build_object(
          'id', s.id,
          'slug', s.slug,
          'name', s.name,
          'name_ar', s.name_ar,
          'worker_label_fr', s.worker_label_fr,
          'worker_label_ar', s.worker_label_ar,
          'company_label_fr', s.company_label_fr,
          'company_label_ar', s.company_label_ar,
          'display_name', CASE WHEN $2 = 'ar' THEN COALESCE(s.name_ar, s.name) ELSE s.name END,
          'display_label', CASE
            WHEN $2 = 'ar' THEN COALESCE(s.worker_label_ar, s.name_ar, s.name)
            ELSE COALESCE(s.worker_label_fr, s.name)
          END
        )
        FROM sectors s
        WHERE s.id = wp.sector_id
      ) AS sector

    FROM worker_profiles wp
    LEFT JOIN users u ON wp.user_id = u.id
    WHERE wp.id = $1;
  `;
  const { rows } = await pool.query(q, [id, lang === "ar" ? "ar" : "fr"]);
  return rows[0];
},


  // create: gardé pour compat, mais la création transactionnelle se fait dans le controller
  async create(data) {
    const {
      user_id, title, description, skills, experience, location,
      available, verification_status, trust_badge, city_id, sector_id
    } = data;

    const q = `
      INSERT INTO worker_profiles
        (user_id, title, description, skills, experience, location, available, verification_status, trust_badge, city_id, sector_id)
      VALUES
        ($1,      $2,    $3,          $4,     $5,         $6,       COALESCE($7, TRUE),
         COALESCE($8,'non_verifie'), COALESCE($9, FALSE), $10,      $11)
      RETURNING *;
    `;
    const values = [
      user_id,
      title,
      description || null,
      skills || null,
      experience || null,
      location || null,
      typeof available === "boolean" ? available : null,
      verification_status || null,
      typeof trust_badge === "boolean" ? trust_badge : null,
      city_id ?? null,
      sector_id ?? null
    ];
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async update(id, data) {
    const allowed = [
      "title","description","skills","experience","location",
      "available","verification_status","trust_badge",
      "city_id","sector_id"
    ];
    const fields = [];
    const values = [];
    let idx = 1;

    for (const k of Object.keys(data)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = $${idx++}`);
        values.push(data[k]);
      }
    }
    if (fields.length === 0) return null;

    values.push(id);
    const q = `
      UPDATE worker_profiles
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
      RETURNING *;
    `;
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async delete(id) {
    const q = `DELETE FROM worker_profiles WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async getPhotos(profileId) {
    const q = `SELECT * FROM worker_photos WHERE profile_id = $1 ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q, [profileId]);
    return rows;
  },

  async getReviewsForProfile(profileId) {
    const q = `
      SELECT r.*, rev.name AS reviewer_name
      FROM worker_profiles wp
      JOIN reviews r ON r.target_user_id = wp.user_id
      LEFT JOIN users rev ON r.reviewer_id = rev.id
      WHERE wp.id = $1
      ORDER BY r.created_at DESC;
    `;
    const { rows } = await pool.query(q, [profileId]);
    return rows;
  },

  async searchByFiltersPaged({ city_id = null, sector_id = null, q = "", limit = 20, page = 1 } = {}) {
    const lim = Math.min(Number(limit) || 20, 50);
    const p   = Math.max(Number(page)  || 1, 1);
    const off = (p - 1) * lim;

    const sql = `
      SELECT
  wp.id, wp.user_id, wp.title, wp.description, wp.skills, wp.experience, wp.location,
  wp.available, wp.created_at, wp.updated_at, wp.verification_status, wp.trust_badge,
  wp.sector_id, wp.city_id,
  u.name          AS user_name,
  u.profile_photo AS user_photo,
  s.name          AS sector_name,
  c.name_fr       AS city_name
      FROM worker_profiles wp
      LEFT JOIN users   u ON u.id = wp.user_id
      LEFT JOIN sectors s ON s.id = wp.sector_id
      LEFT JOIN cities  c ON c.id = wp.city_id
      WHERE
        ($1::int IS NULL OR wp.city_id   = $1)
        AND ($2::int IS NULL OR wp.sector_id = $2)
        AND (
          $3::text IS NULL
          OR LOWER(COALESCE(wp.title,''))       LIKE LOWER('%' || $3 || '%')
          OR LOWER(COALESCE(wp.description,'')) LIKE LOWER('%' || $3 || '%')
          OR LOWER(COALESCE(wp.skills,''))      LIKE LOWER('%' || $3 || '%')
          OR LOWER(COALESCE(wp.experience,''))  LIKE LOWER('%' || $3 || '%')
        )
      ORDER BY wp.created_at DESC
      LIMIT ${lim} OFFSET ${off};
    `;

    const params = [
      city_id ? Number(city_id) : null,
      sector_id ? Number(sector_id) : null,
      q && q.trim() ? q.trim() : null,
    ];

    const { rows } = await pool.query(sql, params);
    return rows;
  },

  async countForUser(userId) {
    const q = `SELECT COUNT(*)::int AS c FROM worker_profiles WHERE user_id = $1;`;
    const { rows } = await pool.query(q, [userId]);
    return rows[0]?.c || 0;
  },

// ✅ AJOUT — profil privé (inclut les champs diplôme)
async getByIdPrivate(id) {
  const q = `
    SELECT
      wp.*,
      u.name           AS user_name,
      u.profile_photo  AS user_photo,
      u.phone          AS user_phone,
      u.facebook_url   AS user_facebook,
      u.instagram_url  AS user_instagram,
      u.tiktok_url     AS user_tiktok,
      u.email          AS user_email,
      (
        SELECT jsonb_build_object('id', c.id, 'slug', c.slug, 'name_fr', c.name_fr)
        FROM cities c
        WHERE c.id = wp.city_id
      ) AS city,
      (
        SELECT jsonb_build_object('id', s.id, 'slug', s.slug, 'name', s.name)
        FROM sectors s
        WHERE s.id = wp.sector_id
      ) AS sector
    FROM worker_profiles wp
    LEFT JOIN users u ON wp.user_id = u.id
    WHERE wp.id = $1;
  `;
  const { rows } = await pool.query(q, [id]);
  return rows[0] || null;
},

// ✅ AJOUT — lire état diplôme (pour blocage approved)
async getDiplomaMeta(profileId) {
  const q = `
    SELECT id, diploma_status
    FROM worker_profiles
    WHERE id = $1;
  `;
  const { rows } = await pool.query(q, [profileId]);
  return rows[0] || null;
},

// ✅ AJOUT — soumission diplôme (pending + reset review)
async submitDiploma(profileId, diploma_file_url) {
  const q = `
    UPDATE worker_profiles
    SET
      diploma_file_url = $1,
      diploma_status = 'pending',
      diploma_verified_at = NULL,
      diploma_reviewed_by = NULL,
      diploma_rejection_reason = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING
      id, user_id,
      diploma_file_url, diploma_status, diploma_verified_at, diploma_reviewed_by, diploma_rejection_reason;
  `;
  const { rows } = await pool.query(q, [diploma_file_url, profileId]);
  return rows[0] || null;
}



};

module.exports = WorkerProfileModel;
