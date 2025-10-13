const express = require("express");
const router = express.Router();
const PC = require("../controllers/workerPhotoController");
const { auth, checkRole, ensureWorkerPhotoOwner } = require("../middleware/authMiddleware");
const { limitWorkerPhotos } = require("../middleware/photoMiddleware");
const { body, param } = require("express-validator");
const validate = require("../middleware/validate");

// Liste par profil
router.get("/profile/:profileId",
  [ param("profileId").isInt({ min: 1 }).withMessage("profileId invalide") ],
  validate,
  PC.getByProfile
);

// Création (worker owner)
router.post("/",
  auth,
  checkRole("worker"),
  ensureWorkerPhotoOwner,
  limitWorkerPhotos,
  [
    body("profile_id").isInt({ min: 1 }).withMessage("profile_id invalide"),
    body("image_url")
      .isString().trim().isLength({ max: 1024 }).withMessage("image_url trop longue")
      .isURL({ protocols: ["http","https"], require_protocol: true, allow_underscores: true })
      .withMessage("image_url doit être une URL http(s)")
      .bail()
      .matches(/\.(?:png|jpe?g|webp)(?:\?.*)?$/i).withMessage("image_url doit se terminer par .png/.jpg/.jpeg/.webp"),
  ],
  validate,
  PC.create
);

// Suppression (owner ou admin)
router.delete("/:id",
  auth,
  checkRole("worker","admin"),
  ensureWorkerPhotoOwner,
  [ param("id").isInt({ min: 1 }).withMessage("id invalide") ],
  validate,
  PC.delete
);

module.exports = router;
