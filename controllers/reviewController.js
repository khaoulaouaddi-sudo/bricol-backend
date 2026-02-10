// controllers/reviewController.js
const Review = require("../models/reviewModel");

const ReviewController = {
  async getByWorkerProfile(req, res) {
    try {
      const workerProfileId = Number(req.params.workerProfileId);
      const rows = await Review.getByWorkerProfile(workerProfileId);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async getByCompanyProfile(req, res) {
    try {
      const companyProfileId = Number(req.params.companyProfileId);
      const rows = await Review.getByCompanyProfile(companyProfileId);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async getMineForWorkerProfile(req, res) {
    try {
      const reviewerId = req.user?.id;
      const workerProfileId = Number(req.params.workerProfileId);
      const review = await Review.getMineForWorkerProfile(workerProfileId, reviewerId);
      res.json({ review });
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async getMineForCompanyProfile(req, res) {
    try {
      const reviewerId = req.user?.id;
      const companyProfileId = Number(req.params.companyProfileId);
      const review = await Review.getMineForCompanyProfile(companyProfileId, reviewerId);
      res.json({ review });
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  // ✅ NEW: all reviews written by current user (for /history)
 
async getMine(req, res) {
  try {
    const reviewerId = req.user?.id;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    // lang depuis query ou header (sans hypothèse)
    const qLang = String(req.query.lang || "").toLowerCase();
    const hLang = String(req.headers["x-bricol-lang"] || "").toLowerCase();
    const lang = qLang === "ar" || hLang === "ar" ? "ar" : "fr";

    const items = await Review.getMineByReviewer(reviewerId, { limit, offset }, lang);
    res.json({ items, meta: { limit, offset, count: items.length } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
},


  async createForWorkerProfile(req, res, next) {
    try {
      const { reviewer_id, target_worker_profile_id, rating, comment } = req.body || {};
      const created = await Review.createForWorkerProfile({
        reviewer_id,
        target_worker_profile_id,
        rating,
        comment,
      });
      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  },

  async createForCompanyProfile(req, res, next) {
    try {
      const { reviewer_id, target_company_profile_id, rating, comment } = req.body || {};
      const created = await Review.createForCompanyProfile({
        reviewer_id,
        target_company_profile_id,
        rating,
        comment,
      });
      return res.status(201).json(created);
    } catch (err) {
      return next(err);
    }
  },

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const rating = req.body?.rating;
      const comment = req.body?.comment;

      const updated = await Review.update(id, { rating, comment });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async delete(req, res) {
    try {
      const id = Number(req.params.id);
      await Review.delete(id);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  },
};

module.exports = ReviewController;
