const Search = require("../models/searchModel");
const { resolveLang, pickLang } = require("../utils/i18n");


function addDisplaysToSearchResult(lang, data) {
  const items = (data.items || []).map((it) => {
    const city = it.city
      ? { ...it.city, display_name: pickLang(lang, it.city.name_fr, it.city.name_ar) }
      : null;

    const sector = it.sector
      ? {
         ...it.sector,
          display_name: pickLang(lang, it.sector.name, it.sector.name_ar),
          display_label: pickLang(lang, it.sector.label, it.sector.label_ar),
        }
      : null;

    const umbrella = it.umbrella
      ? { ...it.umbrella, display_name: pickLang(lang, it.umbrella.name, it.umbrella.name_ar) }
      : null;

    return { ...it, city, sector, umbrella };
  });

  return { ...data, items };
}

async function search(req, res) {
  try {
    const { city, sector, umbrella, type } = req.query;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 20;

    const t = (type || "").toLowerCase();
    const safeType = t === "worker" || t === "company" ? t : undefined;

    const lang = resolveLang(req);

    const data = await Search.search({
      city,
      sector,
      umbrella,
      type: safeType,
      page,
      limit,
    });

    return res.json(addDisplaysToSearchResult(lang, data));
  } catch (err) {
    console.error("GET /search error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

async function selected(req, res) {
  try {
    const limit = Number(req.query.limit) || 12;
    const lang = resolveLang(req);

    const data = await Search.selectedProfiles({ limit });

    // On ajoute display_name sur sector si dispo
    const out = {
      ...data,
      items: (data.items || []).map((it) => ({
        ...it,
        sector: it.sector
          ? { ...it.sector, display_name: pickLang(lang, it.sector.name, it.sector.name_ar) }
          : null,
      })),
    };

    return res.json(out);
  } catch (err) {
    console.error("GET /search/selected error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = { search, selected };
