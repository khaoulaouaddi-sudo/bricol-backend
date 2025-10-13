// middleware/errorHandler.js
module.exports = function errorHandler(err, req, res, next) {
  // JSON mal formé
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ msg: "JSON invalide" });
  }

  // JWT (selon la lib que tu utilises)
  if (err.name === "TokenExpiredError") {
    return res.status(401).json({ msg: "Token expiré" });
  }
  if (err.name === "JsonWebTokenError") {
    return res.status(401).json({ msg: "Token invalide" });
  }

  // Violation contrainte SQL (exemples)
  if (err.code === "23505") { // unique_violation
    return res.status(400).json({ msg: "Doublon interdit" });
  }
  if (err.code === "23503") { // foreign_key_violation
    return res.status(400).json({ msg: "Référence invalide" });
  }
  if (err.code === "23514") { // check_violation
    return res.status(400).json({ msg: "Règle métier violée" });
  }

  console.error("GLOBAL ERROR:", err);
  res.status(500).json({ msg: "Erreur serveur" });
};
