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
      const { company_id, image_url } = req.body;
      if (!company_id || !image_url) {
        return res.status(400).json({ msg: "company_id et image_url requis" });
      }
      const photo = await CompanyPhoto.create({ company_id, image_url });
      res.status(201).json(photo);
    } catch (err) {
      console.error(err);
      if (err.code === "23503") {
        return res.status(400).json({ msg: "company_id invalide" });
      }
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
