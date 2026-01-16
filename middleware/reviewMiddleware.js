// middleware/reviewMiddleware.js
const pool = require("../db");

/**
 * Create review for worker profile:
 * - reviewer_id vient du token
 * - target = req.params.workerProfileId
 * - vérifie existence du profil
 * - anti auto-review (owner du profil)
 * - nettoie le body
 */
async function validateCreateWorkerReview(req, res, next) {
  try {
    const reviewer_id = req.user?.id;
    if (!reviewer_id) return res.status(401).json({ msg: "Non authentifié" });

    const workerProfileId = Number(req.params.workerProfileId);
    if (!Number.isInteger(workerProfileId) || workerProfileId < 1) {
      return res.status(400).json({ msg: "workerProfileId invalide" });
    }

    const note = Number(req.body?.rating);
    if (!Number.isFinite(note) || note < 1 || note > 5) {
      return res.status(400).json({ msg: "La note doit être entre 1 et 5" });
    }

    const comment = req.body?.comment ? String(req.body.comment).trim() : null;
    if (comment && comment.length > 500) {
      return res.status(400).json({ msg: "Le commentaire ne doit pas dépasser 500 caractères" });
    }

    const { rows } = await pool.query(`SELECT user_id FROM worker_profiles WHERE id = $1`, [
      workerProfileId,
    ]);
    if (rows.length === 0) return res.status(404).json({ msg: "Profil worker introuvable" });

    const ownerUserId = rows[0].user_id;
    if (ownerUserId === reviewer_id) {
      return res.status(400).json({ msg: "Impossible de laisser un avis sur votre propre profil" });
    }

    req.body = {
      target_worker_profile_id: workerProfileId,
      rating: note,
      comment,
      reviewer_id,
    };

    next();
  } catch (err) {
    console.error("validateCreateWorkerReview error:", err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function validateCreateCompanyReview(req, res, next) {
  try {
    const reviewer_id = req.user?.id;
    if (!reviewer_id) return res.status(401).json({ msg: "Non authentifié" });

    const companyProfileId = Number(req.params.companyProfileId);
    if (!Number.isInteger(companyProfileId) || companyProfileId < 1) {
      return res.status(400).json({ msg: "companyProfileId invalide" });
    }

    const note = Number(req.body?.rating);
    if (!Number.isFinite(note) || note < 1 || note > 5) {
      return res.status(400).json({ msg: "La note doit être entre 1 et 5" });
    }

    const comment = req.body?.comment ? String(req.body.comment).trim() : null;
    if (comment && comment.length > 500) {
      return res.status(400).json({ msg: "Le commentaire ne doit pas dépasser 500 caractères" });
    }

    const { rows } = await pool.query(`SELECT user_id FROM company_profiles WHERE id = $1`, [
      companyProfileId,
    ]);
    if (rows.length === 0) return res.status(404).json({ msg: "Profil entreprise introuvable" });

    const ownerUserId = rows[0].user_id;
    if (ownerUserId === reviewer_id) {
      return res.status(400).json({ msg: "Impossible de laisser un avis sur votre propre profil" });
    }

    req.body = {
      target_company_profile_id: companyProfileId,
      rating: note,
      comment,
      reviewer_id,
    };

    next();
  } catch (err) {
    console.error("validateCreateCompanyReview error:", err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

/**
 * author OR admin
 */
async function canModifyReview(req, res, next) {
  try {
    const reviewId = Number(req.params.id);
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const { rows } = await pool.query(`SELECT reviewer_id FROM reviews WHERE id = $1`, [reviewId]);
    if (rows.length === 0) return res.status(404).json({ msg: "Review introuvable" });

    if (rows[0].reviewer_id !== userId && userRole !== "admin") {
      return res.status(403).json({ msg: "Accès refusé" });
    }

    next();
  } catch (err) {
    console.error("canModifyReview error:", err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

/**
 * Error middleware after create endpoints:
 * - unique violation => 1 review per user per profile
 * - rating check
 * - trigger anti auto-review
 */
function sqlReviewErrorHandler(err, req, res, next) {
  if (!err) return next();

  if (err.code === "23505") {
    if (err.constraint === "unique_reviewer_worker_profile") {
      return res.status(400).json({ msg: "Vous avez déjà laissé un avis pour ce profil worker" });
    }
    if (err.constraint === "unique_reviewer_company_profile") {
      return res.status(400).json({ msg: "Vous avez déjà laissé un avis pour ce profil entreprise" });
    }
    return res.status(400).json({ msg: "Doublon interdit" });
  }

  if (err.code === "23514") {
    if (err.constraint === "reviews_rating_check") {
      return res.status(400).json({ msg: "La note doit être entre 1 et 5" });
    }

    // trigger anti auto-review : pas de constraint, donc on lit le message
    const msg = String(err.message || "").toLowerCase();
    if (msg.includes("propre profil") || msg.includes("votre propre profil")) {
      return res.status(400).json({ msg: "Impossible de laisser un avis sur votre propre profil" });
    }

    return res.status(400).json({ msg: "Règle métier violée" });
  }

  if (err.code === "23503") {
    return res.status(404).json({ msg: "Profil cible introuvable" });
  }

  next(err);
}

module.exports = {
  validateCreateWorkerReview,
  validateCreateCompanyReview,
  canModifyReview,
  sqlReviewErrorHandler,
};
