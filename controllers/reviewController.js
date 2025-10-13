// controllers/reviewController.js
const pool = require("../db");
const Review = require("../models/reviewModel");

const ReviewController = {
  async getAll(req, res) {
    try {
      const r = await Review.getAll();
      res.json(r);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getById(req, res) {
    try {
      const r = await Review.getById(req.params.id);
      if (!r) return res.status(404).json({ msg: "Review not found" });
      res.json(r);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getByReviewer(req, res) {
    try {
      const rows = await Review.getByReviewer(req.params.reviewerId);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getByTargetUser(req, res) {
    try {
      const rows = await Review.getByTargetUser(req.params.targetUserId || req.params.id);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // IMPORTANT : propriété d'objet (pas "function create(...)") + pool importé
  async create(req, res, next) {
    try {
      // Ces champs ont été nettoyés par validateReviewCreate (middleware)
      const { reviewer_id, target_user_id, rating, comment } = req.body || {};

      // Ceinture + bretelles : on recheck l'auto-review
      if (reviewer_id === target_user_id) {
        return res.status(400).json({ msg: "Impossible de laisser un avis sur vous-même" });
      }

      // Vérifier que la cible existe
      const { rows: u } = await pool.query(`SELECT 1 FROM users WHERE id = $1`, [target_user_id]);
      if (!u.length) return res.status(404).json({ msg: "Utilisateur cible introuvable" });

      // Insérer la review
      const { rows } = await pool.query(
        `INSERT INTO reviews (reviewer_id, target_user_id, rating, comment)
         VALUES ($1,$2,$3,$4)
         RETURNING id, reviewer_id, target_user_id, rating, comment, created_at, updated_at`,
        [reviewer_id, target_user_id, rating, comment]
      );

      return res.status(201).json(rows[0]);
    } catch (err) {
      // Laisse le middleware d'erreurs SQL (checkUniqueReview/sqlDuplicateReviewHandler) formater les 23505/23514
      return next(err);
    }
  },

  async delete(req, res) {
    try {
      const d = await Review.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "Review not found" });
      res.json({ msg: "Review deleted" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async update(req, res) {
    try {
      const { rating, comment } = req.body;
      if (rating === undefined && !comment) {
        return res.status(400).json({ msg: "Au moins rating ou comment requis" });
      }
      const updated = await Review.update(req.params.id, { rating, comment });
      if (!updated) return res.status(404).json({ msg: "Review not found" });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
};

module.exports = ReviewController;
