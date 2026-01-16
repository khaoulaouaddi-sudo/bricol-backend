// routes/companyProfiles.js
const express = require("express");
const router = express.Router();
const CompanyProfileController = require("../controllers/companyProfileController");
const { auth, checkRole, ensureCompanyProfileOwner } = require("../middleware/authMiddleware");

router.get("/", CompanyProfileController.getAll);
router.get("/:id", CompanyProfileController.getById);

//router.post("/", auth, checkRole("company", "admin"), ensureCompanyProfileOwner, CompanyProfileController.create);
router.post("/", auth, checkRole("visitor","company","admin"), CompanyProfileController.create);
router.put("/:id", auth, checkRole("company", "admin"), ensureCompanyProfileOwner, CompanyProfileController.update);
router.delete("/:id", auth, checkRole("company", "admin"), ensureCompanyProfileOwner, CompanyProfileController.delete);

module.exports = router;