// routes/companySectors.js
const express = require("express");
const router = express.Router();
const CompanySectorController = require("../controllers/companySectorController");
const { auth, checkRole, ensureCompanySectorOwner } = require("../middleware/authMiddleware");

router.get("/company/:companyId", CompanySectorController.getAllByCompany);
router.post("/", auth, checkRole("company", "admin"), ensureCompanySectorOwner, CompanySectorController.create);
router.delete("/:id", auth, checkRole("company", "admin"), ensureCompanySectorOwner, CompanySectorController.delete);

module.exports = router;