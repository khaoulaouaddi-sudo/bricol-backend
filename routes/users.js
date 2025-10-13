// routes/users.js
const express = require("express");
const router = express.Router();
const UC = require("../controllers/userController");

router.get("/", UC.getAll);
router.get("/:id", UC.getById);
router.post("/", UC.create);
router.put("/:id", UC.update);
router.delete("/:id", UC.delete);

// routes relationnelles
router.get("/:id/ads", UC.getAds);
router.get("/:id/messages", UC.getMessages);
router.get("/:id/reviews/written", UC.getReviewsWritten); // avis écrits par l'user
router.get("/:id/reviews/received", UC.getReviewsReceived); // avis reçus (si worker)
router.get("/:id/profiles", UC.getProfiles);

module.exports = router;