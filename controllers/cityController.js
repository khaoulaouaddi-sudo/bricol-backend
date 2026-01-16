const City = require("../models/cityModel");

async function listCities(req, res) {
  try {
    const q = (req.query.q || "").trim();
    const limit = req.query.limit || 20;
    const rows = await City.list({ q: q || undefined, limit });
    res.json(rows);
  } catch (e) { console.error("listCities error:", e); res.status(500).json({ msg: "Erreur serveur" }); }
}

async function getCity(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ msg: "id invalide" });
    const city = await City.getById(id);
    if (!city) return res.status(404).json({ msg: "Ville introuvable" });
    res.json(city);
  } catch (e) { console.error("getCity error:", e); res.status(500).json({ msg: "Erreur serveur" }); }
}

module.exports = { listCities, getCity };
