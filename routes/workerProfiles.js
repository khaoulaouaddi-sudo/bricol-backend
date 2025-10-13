// routes/workerProfiles.js
const express = require("express");
const router = express.Router();
const WPC = require("../controllers/workerProfileController");
const { auth, checkRole, ensureWorkerProfileOwner } = require("../middleware/authMiddleware");

router.get("/", WPC.getAll);
router.get("/:id", WPC.getById);

router.post("/", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.create);
router.put("/:id", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.update);
router.delete("/:id", auth, checkRole("worker", "admin"), ensureWorkerProfileOwner, WPC.delete);

// relations
router.get("/:id/photos", WPC.getPhotos);
router.get("/:id/reviews", WPC.getReviews);

module.exports = router;