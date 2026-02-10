// controllers/companyProfileController.js
const pool = require("../db");
const CompanyProfile = require("../models/companyProfileModel");
const { resolveLang } = require("../utils/i18n");

// Utils de casting robustes
function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}
function toIntArray(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    const n = Number.parseInt(v, 10);
    if (Number.isInteger(n) && n > 0) out.push(n);
  }
  return out;
}

const CompanyProfileController = {
  async getAll(req, res) {
    try {
      const lang = resolveLang(req);
      const companies = await CompanyProfile.getAll(lang);
      res.json(companies);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // controllers/companyProfileController.js
async getById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (id === null) return res.status(400).json({ msg: "id invalide" });

    const lang = resolveLang(req);

    const profile = await CompanyProfile.getById(id, lang);
    if (!profile) {
      return res.status(404).json({ msg: "Profil introuvable" });
    }

  const photos = await CompanyProfile.getPhotos(id);
    profile.photos = photos;

    return res.json(profile);
  } catch (err) {
    console.error("company getById error:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
},


  // Création transactionnelle robuste
  async create(req, res) {
    const client = await pool.connect();
    try {
      // 1) Utilisateur authentifié via JWT (injecté par le middleware)
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ msg: "Non authentifié" });

      // 2) Lecture & casting des champs
      const {
        name,
        description,
        sector_main,
        location,
        website,
        phone,
        email,
        city_id, // string/number accepté
        sector_ids, // string[]/number[] accepté
      } = req.body;

      if (!name || !name.trim()) {
        return res.status(400).json({ msg: "name requis" });
      }

      const castCityId = toInt(city_id);
      const castSectorIds = toIntArray(sector_ids);

      await client.query("BEGIN");

      // 3) INSERT company_profiles avec le MÊME client (pas de pool.query ici)
      const insertCompanyQ = `
        INSERT INTO company_profiles (user_id, name, description, sector_main, location, website, phone, email)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *;
      `;
      const { rows: createdRows } = await client.query(insertCompanyQ, [
        userId,
        name.trim(),
        description ?? null,
        sector_main ?? null,
        location ?? null,
        website ?? null,
        phone ?? null,
        email ?? null,
      ]);
      const created = createdRows[0];

      // 4) Ville optionnelle (si id valide)
      if (castCityId !== null) {
        await client.query(
          `UPDATE company_profiles SET city_id = $1 WHERE id = $2`,
          [castCityId, created.id]
        );
      }

      // 5) Secteurs optionnels (si liste non vide)
      if (castSectorIds.length > 0) {
        // IMPORTANT:
        // - On ne remplit plus un champ texte "sector" ici.
        // - On n'insère que (company_id, sector_id).
        // - La liste UI/Front doit donc fournir sector_ids (IDs existants dans sectors).
        const insertSectorsQ = `
          INSERT INTO company_sectors (company_id, sector_id)
          SELECT $1, s.id
          FROM sectors s
          WHERE s.id = ANY($2::int[])
          ON CONFLICT DO NOTHING;
        `;
        await client.query(insertSectorsQ, [created.id, castSectorIds]);
      }

      await client.query("COMMIT");

      // 6) Relire la fiche complète (avec city + sectors) via le modèle
      const lang = resolveLang(req);
      const full = await CompanyProfile.getById(created.id, lang);
      return res.status(201).json(full);
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch (_) {}
      console.error(err);
      if (err.code === "23505") {
        // Par ex. contrainte UNIQUE sur user_id dans company_profiles
        return res
          .status(409)
          .json({ msg: "Un profil entreprise existe déjà pour cet utilisateur" });
      }
      res.status(500).json({ error: "Erreur serveur" });
    } finally {
      client.release();
    }
  },

  async update(req, res) {
    try {
      const updated = await CompanyProfile.update(req.params.id, req.body);
      if (!updated)
        return res
          .status(404)
          .json({ msg: "Company not found or no fields provided" });
    const lang = resolveLang(req);
    const full = await CompanyProfile.getById(Number(req.params.id), lang);
    res.json(full || updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async delete(req, res) {
    try {
      const d = await CompanyProfile.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "Company not found" });
      res.json({ msg: "Company deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
};

module.exports = CompanyProfileController;
