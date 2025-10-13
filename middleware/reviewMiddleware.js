// middleware/reviewMiddleware.js
const pool = require("../db");

/**
 * Valide les données d'une review lors de la création.
 * - Le reviewer_id vient du token (req.user.id).
 * - rating forcé en nombre, entre 1 et 5.
 * - commentaire optionnel, max 500 chars.
 */
function validateReviewCreate(req, res, next) {
  const reviewer_id = req.user?.id;
  const { target_user_id, rating, comment } = req.body || {};

  if (!reviewer_id) {
    return res.status(401).json({ msg: "Non authentifié" });
  }

  const targetId = Number(target_user_id);
  if (!Number.isInteger(targetId) || targetId < 1) {
    return res.status(400).json({ msg: "target_user_id invalide" });
  }

  const note = Number(rating);
  if (!Number.isFinite(note) || note < 1 || note > 5) {
    return res.status(400).json({ msg: "La note doit être entre 1 et 5" });
  }

  if (reviewer_id === targetId) {
    return res.status(400).json({ msg: "Impossible de laisser un avis sur vous-même" });
  }

  if (comment && String(comment).length > 500) {
    return res.status(400).json({ msg: "Le commentaire ne doit pas dépasser 500 caractères" });
  }

  // 🔒 On reconstruit le body (on jette les champs non autorisés : id, reviewer_id, created_at, etc.)
  req.body = {
    target_user_id: targetId,
    rating: note,
    comment: comment ? String(comment).trim() : null,
    reviewer_id, // vient du token, pas du client
  };

  next();
}

/**
 * Vérifie que l'utilisateur courant peut modifier/supprimer la review :
 * - auteur de la review OU admin
 */
async function canModifyReview(req, res, next) {
  try {
    const reviewId = req.params.id;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    const { rows } = await pool.query(
      `SELECT reviewer_id FROM reviews WHERE id = $1`,
      [reviewId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ msg: "Review introuvable" });
    }

    const review = rows[0];
    if (review.reviewer_id !== userId && userRole !== "admin") {
      return res.status(403).json({ msg: "Vous n'avez pas le droit de modifier/supprimer cette review" });
    }

    next();
  } catch (err) {
    console.error("Erreur canModifyReview:", err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

/**
 * Gestion des erreurs SQL spécifiques (middleware d'erreur)
 * - doublon (unique reviewer_id + target_user_id)
 * - rating hors bornes (check)
 * - auto-review (check)
 */
function sqlDuplicateReviewHandler(err, req, res, next) {
  if (!err) return next();

  // unique_violation
  if (err.code === "23505" && err.constraint === "unique_reviewer_target") {
    return res.status(400).json({ msg: "Vous avez déjà laissé un avis pour cet utilisateur" });
  }

  // check_violation: rating
  if (err.code === "23514" && err.constraint === "reviews_rating_check") {
    return res.status(400).json({ msg: "La note doit être entre 1 et 5" });
  }

  // check_violation: no self review
  if (err.code === "23514" && err.constraint === "no_self_review") {
    return res.status(400).json({ msg: "Impossible de laisser un avis sur vous-même" });
  }

  next(err);
}





/**
 * Alias compat pour d’anciennes routes qui appellent encore checkUniqueReview.
 * Redirige vers le handler ci-dessus.
 */
function checkUniqueReview(err, req, res, next) {
  return sqlDuplicateReviewHandler(err, req, res, next);
}

module.exports = {
  validateReviewCreate,
  canModifyReview,
  sqlDuplicateReviewHandler,
  checkUniqueReview, // laissé pour compat
};
