// controllers/adController.js
const Ad = require("../models/adModel");

const AdController = {
  async getAll(req, res) {
    try {
      const rows = await Ad.getAll(req.query); // page, limit, sort_by, sort_dir, type, user_id
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(err.status || 500).json({ error: err.message || "Erreur serveur" });
    }
  },
// ---- à AJOUTER dans AdController ----
async getByUser(req, res) {
  try {
    // réutilise la pagination/tri de getAll via req.query et filtre user_id
    const rows = await Ad.getAll({ ...req.query, user_id: req.params.userId });
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
},

async search(req, res) {
  try {
    const rows = await Ad.search(req.query || {}); // nécessite la méthode Ad.search ci-dessous
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur serveur" });
  }
},

  async getById(req, res) {
    try {
      const r = await Ad.getById(req.params.id);
      if (!r) return res.status(404).json({ msg: "Ad not found" });
      res.json(r);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async create(req, res) {
    try {
      const { user } = req; // injecté par auth
      // Par défaut, l'auteur est l'utilisateur connecté
      let user_id = user?.id;

      // Si tu veux laisser un admin créer pour un autre user :
      if (user?.role === "admin" && req.body.user_id) {
        user_id = req.body.user_id;
      }

      const { title, description, price, type, location, image_url } = req.body;
      const row = await Ad.create({ user_id, title, description, price, type, location, image_url });
      res.status(201).json(row);
    } catch (err) {
      console.error(err);
      if (err.status) return res.status(err.status).json({ msg: err.message });
      if (err.code === "23503") return res.status(400).json({ msg: "user_id invalide (FK)" });
      if (err.code === "23514") return res.status(400).json({ msg: "Violation d'une contrainte CHECK" });
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async update(req, res) {
    try {
      const updated = await Ad.update(req.params.id, req.body);
      if (!updated) return res.status(404).json({ msg: "Ad not found or nothing to update" });
      res.json(updated);
    } catch (err) {
      console.error(err);
      if (err.status) return res.status(err.status).json({ msg: err.message });
      if (err.code === "23514") return res.status(400).json({ msg: "Violation d'une contrainte CHECK" });
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async delete(req, res) {
    try {
      const d = await Ad.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "Ad not found" });
      res.json({ msg: "Ad deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  }
};

module.exports = AdController;