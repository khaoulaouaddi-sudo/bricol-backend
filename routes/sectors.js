// routes/sectors.js
// Public, lecture seule.
// Conseil: garde /umbrellas sur un routeur séparé (routes/umbrellas.js) déjà ajouté.

const express = require("express");
const router = express.Router();
const SectorController = require("../controllers/sectorController");

// Liste plate des secteurs (filtrable par umbrella, labels adaptables par type)
router.get("/", SectorController.listSectors);

// (Optionnel) Liste des secteurs d'une umbrella donnée
// IMPORTANT: cette route doit être AVANT "/:slug" sinon "/by-umbrella" est capturé comme un slug.
router.get("/by-umbrella/:umbrellaSlug", SectorController.listSectorsByUmbrella);

// Détail d'un secteur par slug
router.get("/:slug", SectorController.getSectorBySlug);

module.exports = router;
