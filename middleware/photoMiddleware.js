// middleware/photoMiddleware.js
const pool = require("../db");

// ✅ Helper: récupère un entier depuis params/body
function readInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Limite de photos pour les workers (par défaut 5)
async function limitWorkerPhotos(req, res, next) {
  try {
    // ✅ Solution A: on lit d'abord depuis l'URL (REST), sinon fallback body
    // Cas possibles selon tes routes:
    // - POST /worker-profiles/:id/photos        => req.params.id
    // - POST /worker-profiles/:profileId/photos => req.params.profileId
    const profileId =
      readInt(req.params?.profileId) ??
      readInt(req.params?.id) ??
      readInt(req.body?.profile_id);

    if (!profileId) {
      // ✅ Réponse explicite (évite un bug silencieux)
      return res.status(400).json({
        msg: "profile_id manquant (paramètre d’URL attendu : /worker-profiles/:id/photos)",
      });
    }

    const q = "SELECT COUNT(*) FROM worker_photos WHERE profile_id = $1";
    const { rows } = await pool.query(q, [profileId]);

    if (parseInt(rows[0].count, 10) >= 5) {
      return res.status(400).json({ msg: "Limite de 5 photos atteinte pour ce worker" });
    }

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

// Limite de photos pour les companies (par défaut 10)
async function limitCompanyPhotos(req, res, next) {
  try {
    const { company_id } = req.body;
    const q = "SELECT COUNT(*) FROM company_photos WHERE company_id = $1";
    const { rows } = await pool.query(q, [company_id]);

    if (parseInt(rows[0].count, 10) >= 10) {
      return res.status(400).json({ msg: "Limite de 10 photos atteinte pour cette company" });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

module.exports = {
  limitWorkerPhotos,
  limitCompanyPhotos,
};
