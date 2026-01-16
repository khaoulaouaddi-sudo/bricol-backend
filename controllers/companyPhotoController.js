const CompanyPhoto = require("../models/companyPhotoModel");

const CompanyPhotoController = {
  async getAllByCompany(req, res) {
    try {
      const photos = await CompanyPhoto.getAllByCompany(req.params.companyId);
      res.json(photos);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async create(req, res) {
    try {
      const { company_id, image_url, caption, is_cover } = req.body;
      if (!company_id || !image_url) {
        return res.status(400).json({ msg: "company_id et image_url requis" });
      }

      // Si on crée une photo avec is_cover=true, on force l’unicité de cover
      if (is_cover === true) {
        // créer d’abord
        const photo = await CompanyPhoto.create({ company_id, image_url, caption: caption ?? null, is_cover: false });
        // puis la passer cover => unset autres
        const updated = await CompanyPhoto.setCover(photo.id);
        return res.status(201).json(updated);
      }

      const photo = await CompanyPhoto.create({ company_id, image_url, caption: caption ?? null, is_cover: false });
      res.status(201).json(photo);
    } catch (err) {
      console.error(err);
      if (err.code === "23503") {
        return res.status(400).json({ msg: "company_id invalide" });
      }
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async patch(req, res) {
    try {
      const id = Number(req.params.id);
      const { is_cover, caption } = req.body || {};

      // 1) couverture
      if (is_cover === true) {
        const updated = await CompanyPhoto.setCover(id);
        if (!updated) return res.status(404).json({ msg: "Photo non trouvée" });

        // si caption en même temps (optionnel)
        if (typeof caption === "string") {
          const u2 = await CompanyPhoto.updateById(id, { caption });
          return res.json(u2);
        }
        return res.json(updated);
      }

      // 2) caption seule (ou patch neutre)
      const updated = await CompanyPhoto.updateById(id, {
        caption: typeof caption === "string" ? caption : null,
        is_cover: null,
      });
      if (!updated) return res.status(404).json({ msg: "Photo non trouvée" });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async delete(req, res) {
    try {
      const d = await CompanyPhoto.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "Photo non trouvée" });
      res.json({ msg: "Photo supprimée" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
};

module.exports = CompanyPhotoController;
