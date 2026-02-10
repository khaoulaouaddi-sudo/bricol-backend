// controllers/umbrellaController.js
const Umbrella = require("../models/umbrellaModel");
const { resolveLang, pickLang } = require("../utils/i18n");



function addDisplaysToUmbrellas(lang, data) {
  return (data || []).map((fam) => ({
    ...fam,
    display_name: pickLang(lang, fam.name, fam.name_ar),
    sectors: (fam.sectors || []).map((s) => ({
      ...s,
      display_name: pickLang(lang, s.name, s.name_ar),
      display_label: pickLang(lang, s.label, s.label_ar),
    })),
  }));
}

/**
 * GET /umbrellas
 * Query: ?type=worker|company
 * + Query: ?lang=fr|ar  (optionnel)
 */
async function listUmbrellas(req, res) {
  try {
    const t = req.query.type;
    const type = t === "worker" || t === "company" ? t : null;

     const lang = resolveLang(req);

    const data = await Umbrella.getAll({ type });
    res.json(addDisplaysToUmbrellas(lang, data));
  } catch (err) {
    console.error("listUmbrellas error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

/**
 * GET /umbrellas/:slug
 * Query: ?type=worker|company
 * + Query: ?lang=fr|ar
 */
async function getUmbrellaBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const t = req.query.type;
    const type = t === "worker" || t === "company" ? t : null;

     const lang = resolveLang(req);

    const data = await Umbrella.getBySlug(slug, { type });
    if (!data) return res.status(404).json({ msg: "Famille introuvable" });

    // data est un objet (pas un tableau) → on applique la même logique
    const out = {
      ...data,
      display_name: pickLang(lang, data.name, data.name_ar),
      sectors: (data.sectors || []).map((s) => ({
        ...s,
        display_name: pickLang(lang, s.name, s.name_ar),
        display_label: pickLang(lang, s.label, s.label_ar),
      })),
    };

    res.json(out);
  } catch (err) {
    console.error("getUmbrellaBySlug error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

module.exports = {
  listUmbrellas,
  getUmbrellaBySlug,
};
