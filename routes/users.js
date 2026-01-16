// routes/users.js
const express = require("express");
const router = express.Router();

const UC = require("../controllers/userController");
const { auth, checkRole } = require("../middleware/authMiddleware");
const ensureActiveUser = require("../middleware/ensureActiveUser");

// ===== Self (utilisateur connecté) =====
// NOTE: garder /me AVANT /:id (sinon /me sera interprété comme :id)
router.get("/me", auth, ensureActiveUser, UC.getMe);
router.patch("/me", auth, ensureActiveUser, UC.updateMe);
router.get("/me/profiles", auth, ensureActiveUser, UC.getMyProfiles);


// ===== Admin-only =====
router.get("/", auth, checkRole("admin"), UC.getAll);
router.get("/:id", auth, checkRole("admin"), UC.getById);
router.post("/", auth, checkRole("admin"), UC.create);
router.put("/:id", auth, checkRole("admin"), UC.update);
router.delete("/:id", auth, checkRole("admin"), UC.delete);

// routes relationnelles (ADMIN-ONLY)
router.get("/:id/ads", auth, checkRole("admin"), UC.getAds);
router.get("/:id/messages", auth, checkRole("admin"), UC.getMessages);
router.get("/:id/reviews/written", auth, checkRole("admin"), UC.getReviewsWritten);
router.get("/:id/reviews/received", auth, checkRole("admin"), UC.getReviewsReceived);
router.get("/:id/profiles", auth, checkRole("admin"), UC.getProfiles);

module.exports = router;
