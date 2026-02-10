const Sector = require("../models/sectorModel");

const { resolveLang, pickLang } = require("../utils/i18n");
function addDisplaysToSector(lang, s, type = null) {
  // Compat: certains appels renvoient déjà { label, label_ar } (liste),
  // d’autres (getBySlug) renvoient les colonnes worker_label_*/company_label_*.
  const labelFr =
    s.label ??
    (type === "worker"
      ? (s.worker_label_fr || s.name)
      : type === "company"
        ? (s.company_label_fr || s.name)
        : s.name);

  const labelAr =
    s.label_ar ??
    (type === "worker"
      ? (s.worker_label_ar || s.name_ar || s.name)
      : type === "company"
        ? (s.company_label_ar || s.name_ar || s.name)
        : (s.name_ar || s.name));

  return {
    ...s,
    label: s.label ?? labelFr,
    label_ar: s.label_ar ?? labelAr,
    display_name: pickLang(lang, s.name, s.name_ar),
    display_label: pickLang(lang, labelFr, labelAr),
  };
}

async function listSectors(req, res) {
  try {
    const umbrellaSlug = req.query.umbrella || null;
    const qType = (req.query.type || "").toLowerCase();
    const type = qType === "worker" || qType === "company" ? qType : null;
     const lang = resolveLang(req);

    const data = await Sector.getAll({ umbrellaSlug, type });
    res.json((data || []).map((s) => addDisplaysToSector(lang, s, type)));
  } catch (err) {
    console.error("listSectors error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

async function getSectorBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const qType = (req.query.type || "").toLowerCase();
    const type = qType === "worker" || qType === "company" ? qType : null;
    const lang = resolveLang(req);

    const sector = await Sector.getBySlug(slug);
    if (!sector) return res.status(404).json({ msg: "Secteur introuvable" });

   res.json(addDisplaysToSector(lang, sector, type));
  } catch (err) {
    console.error("getSectorBySlug error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

async function listSectorsByUmbrella(req, res) {
  try {
    const umbrellaSlug = req.params.umbrellaSlug;
    if (!umbrellaSlug) return res.status(400).json({ msg: "umbrella requis" });

    const qType = (req.query.type || "").toLowerCase();
    const type = qType === "worker" || qType === "company" ? qType : null;

    const lang = resolveLang(req);

    const items = await Sector.getByUmbrellaSlug(umbrellaSlug, { type });
    res.json((items || []).map((s) => addDisplaysToSector(lang, s, type)));
  } catch (err) {
    console.error("listSectorsByUmbrella error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = {
  listSectors,
  getSectorBySlug,
  listSectorsByUmbrella,
};
