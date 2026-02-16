const City = require("../models/cityModel");

const { resolveLang, pickLang } = require("../utils/i18n");


async function listCities(req, res) {
  try {
    const q = (req.query.q || "").trim();
    const limit = req.query.limit || 100;

    const lang = resolveLang(req);

    const rows = await City.list({ q: q || undefined, limit });

    // ✅ Ajout non-cassant
    const out = rows.map((c) => ({
      ...c,
      display_name: pickLang(lang, c.name_fr, c.name_ar),
    }));

    res.json(out);
  } catch (e) {
    console.error("listCities error:", e);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

async function getCity(req, res) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ msg: "id invalide" });

    const lang = resolveLang(req);

    const city = await City.getById(id);
    if (!city) return res.status(404).json({ msg: "Ville introuvable" });

    res.json({
      ...city,
      display_name: pickLang(lang, city.name_fr, city.name_ar),
    });
  } catch (e) {
    console.error("getCity error:", e);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

module.exports = { listCities, getCity };
