// middleware/photoMiddleware.js
const pool = require("../db");

// Limite de photos pour les workers (par défaut 5)
async function limitWorkerPhotos(req, res, next) {
  try {
    const { profile_id } = req.body;
    const q = "SELECT COUNT(*) FROM worker_photos WHERE profile_id = $1";
    const { rows } = await pool.query(q, [profile_id]);

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