// routes/workerProfiles.js
const express = require("express");
const router = express.Router();
const WPC = require("../controllers/workerProfileController");
const WPhoto = require("../controllers/workerPhotoController");
const { auth, checkRole, ensureWorkerProfileOwner,ensureWorkerPhotoOwner} = require("../middleware/authMiddleware");
const { limitWorkerPhotos } = require("../middleware/photoMiddleware"); // <-- AJOUT OBLIGATOIRE


router.get("/", WPC.getAll);

router.get("/search", WPC.search);
// ✅ AJOUT (privé owner/admin) — doit être AVANT "/:id"
router.get("/:id/private", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.getPrivateById);

// (public)
router.get("/:id", WPC.getById);

//router.post("/", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.create);
router.post("/", auth, checkRole("worker", "admin","visitor"), WPC.create);
router.put("/:id", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.update);
router.delete("/:id", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.delete);

// ✅ AJOUT — soumission diplôme (URL Cloudinary PDF)
router.patch("/:id/diploma", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.submitDiploma);


// relations
router.get("/:id/photos", WPC.getPhotos);
router.get("/:id/reviews", WPC.getReviews);
router.post(
  "/:id/photos",
  auth,
  checkRole("worker", "admin","visitor"),
  ensureWorkerPhotoOwner,
  limitWorkerPhotos,      // <-- IMPORTANT : limite de photos
  WPhoto.create           // <-- accepte une LISTE
);

module.exports = router;