const express = require("express");
const router = express.Router();
const PC = require("../controllers/companyPhotoController");
const { auth, checkRole, ensureCompanyPhotoOwner } = require("../middleware/authMiddleware");
const { limitCompanyPhotos } = require("../middleware/photoMiddleware");
const { body, param } = require("express-validator");
const validate = require("../middleware/validate");

// Liste par company
router.get("/company/:companyId",
  [ param("companyId").isInt({ min: 1 }).withMessage("companyId invalide") ],
  validate,
  PC.getAllByCompany
);

// Création (company owner)
router.post("/",
  auth,
  checkRole("company"),
  ensureCompanyPhotoOwner,
  limitCompanyPhotos,
  [
    body("company_id").isInt({ min: 1 }).withMessage("company_id invalide"),
    body("image_url")
      .isString().trim().isLength({ max: 1024 }).withMessage("image_url trop longue")
      .isURL({ protocols: ["http","https"], require_protocol: true, allow_underscores: true })
      .withMessage("image_url doit être une URL http(s)")
      .bail()
      // accepte .jpg .jpeg .png .webp (+ query string éventuelle)
      .matches(/\.(?:png|jpe?g|webp)(?:\?.*)?$/i).withMessage("image_url doit se terminer par .png/.jpg/.jpeg/.webp"),
  ],
  validate,
  PC.create
);

// Suppression (owner ou admin)
router.delete("/:id",
  auth,
  checkRole("company","admin"),
  ensureCompanyPhotoOwner,
  [ param("id").isInt({ min: 1 }).withMessage("id invalide") ],
  validate,
  PC.delete
);

module.exports = router;
