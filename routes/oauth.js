// routes/oauth.js
const express = require("express");
const router = express.Router();
const OAuthController = require("../controllers/oauthController");

// Mobile : envoie un id_token Google
router.post("/google", OAuthController.google);

// Mobile : envoie un access_token Facebook
router.post("/facebook", OAuthController.facebook);

module.exports = router;