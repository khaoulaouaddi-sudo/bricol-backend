// controllers/sectorController.js
// Tient compte de la relation umbrella (sector_families)
// et reste 100% lecture seule.

const Sector = require("../models/sectorModel");

/**
 * GET /sectors
 * Query params:
 *  - umbrella: slug (ex. batiment, transport, ...)
 *  - type: 'worker' | 'company' (pour adapter le 'label' retourné)
 *
 * Remarque:
 *   L'endpoint /umbrellas (dédié) existe pour la vue groupée.
 *   Ici on reste sur une liste plate filtrable par umbrella si souhaité.
 */
async function listSectors(req, res) {
  try {
    const umbrellaSlug = req.query.umbrella || null;
    const qType = (req.query.type || "").toLowerCase();
    const type = qType === "worker" || qType === "company" ? qType : null;

    const data = await Sector.getAll({ umbrellaSlug, type });
    res.json(data);
  } catch (err) {
    console.error("listSectors error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

/**
 * GET /sectors/:slug
 * Détail d'un secteur (avec sa famille).
 */
async function getSectorBySlug(req, res) {
  try {
    const slug = req.params.slug;
    const sector = await Sector.getBySlug(slug);
    if (!sector) return res.status(404).json({ msg: "Secteur introuvable" });
    res.json(sector);
  } catch (err) {
    console.error("getSectorBySlug error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
}

/**
 * (Optionnel) GET /sectors/by-umbrella/:umbrellaSlug
 * Liste plate des secteurs d'une famille donnée (labels contextuels possibles).
 * Query: ?type=worker|company
 */
async function listSectorsByUmbrella(req, res) {
  try {
    const umbrellaSlug = req.params.umbrellaSlug;
    if (!umbrellaSlug) return res.status(400).json({ msg: "umbrella requis" });

    const qType = (req.query.type || "").toLowerCase();
    const type = qType === "worker" || qType === "company" ? qType : null;

    const items = await Sector.getByUmbrellaSlug(umbrellaSlug, { type });
    res.json(items);
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
