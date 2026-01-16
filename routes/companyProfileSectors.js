// routes/companyProfileSectors.js
const express = require("express");
// IMPORTANT: mergeParams => récupère :companyId du parent
const router = express.Router({ mergeParams: true });

const CSC = require("../controllers/companySectorController");
const { auth, checkRole, ensureCompanyOwnerFromParam } = require("../middleware/authMiddleware");




// Lister les secteurs d’une company
router.get(
  "/",
  auth,
  checkRole("company", "admin"),
  ensureCompanyOwnerFromParam,
  CSC.listCompanySectors
);

// Lier un secteur à une company (sector_id recommandé ; sector texte compat)
router.post(
  "/",
  auth,
  checkRole("company", "admin"),
  ensureCompanyOwnerFromParam,
  CSC.addCompanySector
);

// Délier un secteur (par sectorId)
router.delete(
  "/:sectorId",
  auth,
  checkRole("company", "admin"),
  ensureCompanyOwnerFromParam,
  CSC.removeCompanySector
);

module.exports = router;
