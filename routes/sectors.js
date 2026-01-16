// routes/sectors.js
// Public, lecture seule.
// Conseil: garde /umbrellas sur un routeur séparé (routes/umbrellas.js) déjà ajouté.

const express = require("express");
const router = express.Router();
const SectorController = require("../controllers/sectorController");

// Liste plate des secteurs (filtrable par umbrella, labels adaptables par type)
router.get("/", SectorController.listSectors);

// Détail d'un secteur par slug
router.get("/:slug", SectorController.getSectorBySlug);

// (Optionnel) Liste des secteurs d'une umbrella donnée
// Eviter conflit avec "/:slug" en plaçant cette route AVANT, ou utiliser un path plus spécifique.
router.get("/by-umbrella/:umbrellaSlug", SectorController.listSectorsByUmbrella);

module.exports = router;
