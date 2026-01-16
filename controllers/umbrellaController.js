// controllers/umbrellaController.js
const Umbrella = require("../models/umbrellaModel");

/**
 * GET /umbrellas
 * Query: ?type=worker|company (label adapté)
 */
async function listUmbrellas(req, res) {
  try {
    const t = req.query.type;
    const type = t === "worker" || t === "company" ? t : null;
    const data = await Umbrella.getAll({ type });
    res.json(data);
  } catch (err) {
    console.error("listUmbrellas error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

/**
 * GET /umbrellas/:slug
 * Query: ?type=worker|company
 */
async function getUmbrellaBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const t = req.query.type;
    const type = t === "worker" || t === "company" ? t : null;

    const data = await Umbrella.getBySlug(slug, { type });
    if (!data) return res.status(404).json({ msg: "Famille introuvable" });
    res.json(data);
  } catch (err) {
    console.error("getUmbrellaBySlug error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = {
  listUmbrellas,
  getUmbrellaBySlug,
};
