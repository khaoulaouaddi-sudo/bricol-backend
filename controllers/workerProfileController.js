// controllers/workerProfileController.js
const WP = require("../models/workerProfileModel");

const WorkerProfileController = {
  async getAll(req, res) {
    try { const rows = await WP.getAll(); res.json(rows); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getById(req, res) {
    try { const row = await WP.getById(req.params.id); if (!row) return res.status(404).json({ msg: "Profil non trouvé" }); res.json(row); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async create(req, res) {
    try { const newP = await WP.create(req.body); res.status(201).json(newP); } catch (err) { console.error(err); if (err.code === "23503") return res.status(400).json({ msg: "user_id invalide" }); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async update(req, res) {
    try { const p = await WP.update(req.params.id, req.body); if (!p) return res.status(404).json({ msg: "Profil non trouvé ou aucun champ fourni" }); res.json(p); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async delete(req, res) {
    try { const d = await WP.delete(req.params.id); if (!d) return res.status(404).json({ msg: "Profil non trouvé" }); res.json({ msg: "Profil supprimé" }); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getPhotos(req, res) {
    try { const photos = await WP.getPhotos(req.params.id); res.json(photos); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getReviews(req, res) {
    try { const reviews = await WP.getReviewsForProfile(req.params.id); res.json(reviews); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  }
};

module.exports = WorkerProfileController;