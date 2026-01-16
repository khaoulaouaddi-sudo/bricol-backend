const express = require("express");
const router = express.Router();
const PC = require("../controllers/workerPhotoController");
const { auth, checkRole, ensureWorkerPhotoOwner } = require("../middleware/authMiddleware");
const { body, param } = require("express-validator");
const validate = require("../middleware/validate");

// Liste par profil
router.get(
  "/profile/:profileId",
  [param("profileId").isInt({ min: 1 }).withMessage("profileId invalide")],
  validate,
  PC.getByProfile
);

// PATCH (owner ou admin) : caption / set cover
router.patch(
  "/:id",
  auth,
  checkRole("worker", "admin"), 
  ensureWorkerPhotoOwner,
  [
    param("id").isInt({ min: 1 }).withMessage("id invalide"),
    body("caption").optional({ nullable: true }).isString().trim().isLength({ max: 300 }).withMessage("caption trop longue"),
    body("is_cover").optional().isBoolean().withMessage("is_cover doit être boolean"),
  ],
  validate,
  PC.patch
);

// Suppression (owner ou admin)
router.delete(
  "/:id",
  auth,
  checkRole("worker", "admin"),
  ensureWorkerPhotoOwner,
  [param("id").isInt({ min: 1 }).withMessage("id invalide")],
  validate,
  PC.delete
);

module.exports = router;
