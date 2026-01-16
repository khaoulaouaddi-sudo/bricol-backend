// controllers/searchController.js
const Search = require("../models/searchModel");

async function search(req, res) {
  try {
    const { city, sector, umbrella, type } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const t = (type || "").toLowerCase();
    const safeType = t === "worker" || t === "company" ? t : undefined;

    const data = await Search.search({
      city,
      sector,
      umbrella,
      type: safeType,
      page,
      limit,
    });

    return res.json(data);
  } catch (err) {
    console.error("GET /search error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

async function selected(req, res) {
  try {
    const limit = Number(req.query.limit) || 12;
    const data = await Search.selectedProfiles({ limit });
    return res.json(data);
  } catch (err) {
    console.error("GET /search/selected error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = { search, selected };
