// models/companyProfileModel.js
const pool = require("../db");

const CompanyProfileModel = {
  async getAll(lang = "fr") {
    const q = `
      SELECT
        cp.*,
        u.name          AS user_name,
        u.profile_photo AS user_photo,

        -- ville JSON localisée
        (
          SELECT jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'name_fr', c.name_fr,
            'name_ar', c.name_ar,
            'display_name', CASE WHEN $1 = 'ar' THEN c.name_ar ELSE c.name_fr END
          )
          FROM cities c
          WHERE c.id = cp.city_id
        ) AS city,

        -- secteurs JSON (multiples) via company_sectors
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'slug', s.slug,
                'name', s.name,
                'name_ar', s.name_ar,
                'umbrella_id', s.umbrella_id,
                'worker_label_fr', s.worker_label_fr,
                'worker_label_ar', s.worker_label_ar,
                'company_label_fr', s.company_label_fr,
                'company_label_ar', s.company_label_ar,
                'display_name', CASE WHEN $1 = 'ar' THEN COALESCE(s.name_ar, s.name) ELSE s.name END,
                'display_label', CASE
                  WHEN $1 = 'ar' THEN COALESCE(s.company_label_ar, s.name_ar, s.name)
                  ELSE COALESCE(s.company_label_fr, s.name)
                END
              )
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'::jsonb
          )
          FROM company_sectors cs
          JOIN sectors s ON s.id = cs.sector_id
          WHERE cs.company_id = cp.id
        ) AS sectors

      FROM company_profiles cp
      LEFT JOIN users u ON cp.user_id = u.id
      ORDER BY cp.created_at DESC;
    `;
    const { rows } = await pool.query(q, [lang === "ar" ? "ar" : "fr"]);
    return rows;
  },

  async getPhotos(companyId) {
    const q = `
      SELECT id, image_url, caption, is_cover, created_at
      FROM company_photos
      WHERE company_id = $1
      ORDER BY is_cover DESC, created_at DESC, id DESC;
    `;
    const { rows } = await pool.query(q, [companyId]);
    return rows;
  },

  async getById(id, lang = "fr") {
    const q = `
      SELECT
        cp.*,
        u.name           AS user_name,
        u.profile_photo  AS user_photo,

        -- ville JSON localisée
        (
          SELECT jsonb_build_object(
            'id', c.id,
            'slug', c.slug,
            'name_fr', c.name_fr,
            'name_ar', c.name_ar,
            'display_name', CASE WHEN $2 = 'ar' THEN c.name_ar ELSE c.name_fr END
          )
          FROM cities c
          WHERE c.id = cp.city_id
        ) AS city,

        -- secteurs JSON (multiples) via company_sectors
        (
          SELECT COALESCE(
            jsonb_agg(
              jsonb_build_object(
                'id', s.id,
                'slug', s.slug,
                'name', s.name,
                'name_ar', s.name_ar,
                'umbrella_id', s.umbrella_id,
                'worker_label_fr', s.worker_label_fr,
                'worker_label_ar', s.worker_label_ar,
                'company_label_fr', s.company_label_fr,
                'company_label_ar', s.company_label_ar,
                'display_name', CASE WHEN $2 = 'ar' THEN COALESCE(s.name_ar, s.name) ELSE s.name END,
                'display_label', CASE
                  WHEN $2 = 'ar' THEN COALESCE(s.company_label_ar, s.name_ar, s.name)
                  ELSE COALESCE(s.company_label_fr, s.name)
                END
              )
            ) FILTER (WHERE s.id IS NOT NULL),
            '[]'::jsonb
          )
          FROM company_sectors cs
          JOIN sectors s ON s.id = cs.sector_id
          WHERE cs.company_id = cp.id
        ) AS sectors

      FROM company_profiles cp
      LEFT JOIN users u ON cp.user_id = u.id
      WHERE cp.id = $1;
    `;
    const { rows } = await pool.query(q, [id, lang === "ar" ? "ar" : "fr"]);
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
  },
};

module.exports = CompanyProfileModel;
