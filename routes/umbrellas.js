// routes/umbrellas.js
const express = require("express");
const router = express.Router();
const UmbrellaController = require("../controllers/umbrellaController");

// Public, lecture seule
router.get("/", UmbrellaController.listUmbrellas);
router.get("/:slug", UmbrellaController.getUmbrellaBySlug);

module.exports = router;
