// controllers/workerPhotoController.js
const WP = require("../models/workerPhotoModel");

const WorkerPhotoController = {
  async getAll(req, res) {
    try { const rows = await WP.getAll(); res.json(rows); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getById(req, res) {
    try { const r = await WP.getById(req.params.id); if (!r) return res.status(404).json({ msg: "Photo non trouvée" }); res.json(r); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async create(req, res) {
    try { const created = await WP.create(req.body); res.status(201).json(created); } catch (err) { console.error(err); if (err.code === "23503") return res.status(400).json({ msg: "profile_id invalide" }); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async delete(req, res) {
    try { const d = await WP.delete(req.params.id); if (!d) return res.status(404).json({ msg: "Photo non trouvée" }); res.json({ msg: "Photo supprimée" }); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getByProfile(req, res) {
    try { const rows = await WP.getByProfile(req.params.profileId || req.params.id); res.json(rows); } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  }
};

module.exports = WorkerPhotoController;