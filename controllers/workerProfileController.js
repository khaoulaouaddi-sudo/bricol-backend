// controllers/workerProfileController.js
const pool = require("../db");
const WP = require("../models/workerProfileModel");
const { resolveLang } = require("../utils/i18n");


// helpers de cast robustes
function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const WorkerProfileController = {
  // Liste (pas de param id !)
  async getAll(req, res) {
    try {
      const lang = resolveLang(req);
      const rows = await WP.getAll(lang);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // controllers/workerProfileController.js
async getById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (id === null) return res.status(400).json({ msg: "id invalide" });

    // ✅ Lire la langue depuis la query (compat avec ton front qui envoie ?lang=ar)
     const lang = resolveLang(req);

    // 1) Récupérer profil (localisé)
    const profile = await WP.getById(id, lang);
    if (!profile) {
      return res.status(404).json({ msg: "Profil introuvable" });
    }

    // 2) Récupérer photos
    const photos = await WP.getPhotos(id);

    // 3) Ajouter photos dans le profil
    profile.photos = photos;

    return res.json(profile);
  } catch (err) {
    console.error("getById error:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
},


// ✅ AJOUT — lecture privée du profil (inclut champs diplôme)
async getPrivateById(req, res) {
  try {
    const id = toInt(req.params.id);
    if (id === null) return res.status(400).json({ msg: "id invalide" });

    const profile = await WP.getByIdPrivate(id);
    if (!profile) return res.status(404).json({ msg: "Profil introuvable" });

    const photos = await WP.getPhotos(id);
    profile.photos = photos;

    return res.json(profile);
  } catch (err) {
    console.error("getPrivateById error:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
},

// ✅ AJOUT — soumettre un diplôme (URL Cloudinary PDF)
async submitDiploma(req, res) {
  try {
    const id = toInt(req.params.id);
    if (id === null) return res.status(400).json({ msg: "id invalide" });

    let { diploma_file_url } = req.body || {};
    diploma_file_url = typeof diploma_file_url === "string" ? diploma_file_url.trim() : "";

    if (!diploma_file_url) {
      return res.status(400).json({ msg: "diploma_file_url est requis" });
    }
    if (!/^https?:\/\/.+/i.test(diploma_file_url)) {
      return res.status(400).json({ msg: "diploma_file_url doit être une URL http(s)" });
    }

    const current = await WP.getDiplomaMeta(id);
    if (!current) return res.status(404).json({ msg: "Profil introuvable" });

    // Blocage après approval (sauf admin — ici admin passe aussi, mais on bloque quand même par règle produit)
    if (current.diploma_status === "approved") {
      return res.status(403).json({ msg: "Diplôme déjà vérifié : modification interdite" });
    }

    const updated = await WP.submitDiploma(id, diploma_file_url);
    return res.json(updated);
  } catch (err) {
    console.error("submitDiploma error:", err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
},

  // Création robuste (JWT, casting, transaction)
  async create(req, res) {
    const client = await pool.connect();
    try {
      const authUserId = req.user?.id;
      if (!authUserId) return res.status(401).json({ msg: "Non authentifié" });

      const {
        title,
        description,
        skills,
        experience,
        location,
        available,                // booléen optionnel
        verification_status,      // ex. 'non_verifie' (défaut DB)
        trust_badge,              // booléen optionnel (défaut DB)
        city_id,
        sector_id
      } = req.body;

      if (!title || !title.trim()) {
        return res.status(400).json({ msg: "title requis" });
      }

      const cityId  = toInt(city_id);
      const sectorId = toInt(sector_id);

      await client.query("BEGIN");

      // INSERT avec city_id / sector_id
      const q = `
        INSERT INTO worker_profiles
          (user_id, title, description, skills, experience, location, available, verification_status, trust_badge, city_id, sector_id)
        VALUES
          ($1,      $2,    $3,          $4,     $5,         $6,       COALESCE($7, TRUE),
           COALESCE($8, 'non_verifie'), COALESCE($9, FALSE), $10,     $11)
        RETURNING id;
      `;
      const { rows } = await client.query(q, [
        authUserId,
        title.trim(),
        description ?? null,
        skills ?? null,
        experience ?? null,
        location ?? null,
        typeof available === "boolean" ? available : null,
        verification_status ?? null,
        typeof trust_badge === "boolean" ? trust_badge : null,
        cityId,
        sectorId,
      ]);
      const createdId = rows[0].id;

      await client.query("COMMIT");

      // renvoyer la fiche enrichie
      const lang = resolveLang(req);
      const full = await WP.getById(createdId, lang);
      return res.status(201).json(full);
    } catch (err) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      console.error(err);

      // limite 7 profils (trigger DB) -> 23514 / message
      if (err.code === "23514" || String(err.message || "").includes("MAX_WORKER_PROFILES_REACHED")) {
        return res.status(409).json({ msg: "Vous avez atteint la limite maximale de 7 profils artisans." });
      }
      // FK user_id
      if (err.code === "23503") {
        return res.status(400).json({ msg: "user_id invalide" });
      }
      res.status(500).json({ error: "Erreur serveur" });
    } finally {
      client.release();
    }
  },

  async update(req, res) {
    try {
      const id = toInt(req.params.id);
      if (id === null) return res.status(400).json({ msg: "id invalide" });

      // autoriser aussi maj city_id/sector_id si présents
      const payload = { ...req.body };
      const cityId  = toInt(payload.city_id);
      const sectorId = toInt(payload.sector_id);
      if (payload.hasOwnProperty("city_id"))  payload.city_id  = cityId;
      if (payload.hasOwnProperty("sector_id")) payload.sector_id = sectorId;

      const p = await WP.update(id, payload);
      if (!p) return res.status(404).json({ msg: "Profil non trouvé ou aucun champ fourni" });
      res.json(p);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async delete(req, res) {
    try {
      const id = toInt(req.params.id);
      if (id === null) return res.status(400).json({ msg: "id invalide" });
      const d = await WP.delete(id);
      if (!d) return res.status(404).json({ msg: "Profil non trouvé" });
      res.json({ msg: "Profil supprimé" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getPhotos(req, res) {
    try {
      const id = toInt(req.params.id);
      if (id === null) return res.status(400).json({ msg: "id invalide" });
      const photos = await WP.getPhotos(id);
      res.json(photos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getReviews(req, res) {
    try {
      const id = toInt(req.params.id);
      if (id === null) return res.status(400).json({ msg: "id invalide" });
      const reviews = await WP.getReviewsForProfile(id);
      res.json(reviews);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async search(req, res) {
    try {
      const city_id   = req.query.city_id   ? parseInt(req.query.city_id, 10)   : null;
      const sector_id = req.query.sector_id ? parseInt(req.query.sector_id, 10) : null;
      const q         = (req.query.q || "").trim();
      const limit     = Math.min(parseInt(req.query.limit || "20", 10), 50);
      const page      = Math.max(parseInt(req.query.page  || "1", 10), 1);

      const rows = await WP.searchByFiltersPaged({ city_id, sector_id, q, limit, page });
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
};

module.exports = WorkerProfileController;
