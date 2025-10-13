const express = require("express");
const router = express.Router();
const AuthController = require("../controllers/authController");
const { auth } = require("../middleware/authMiddleware");

// login
router.post("/login", AuthController.login);

// refresh access token avec refresh token valide (dans Authorization: Bearer <refresh>)
router.post("/refresh", AuthController.refresh);

// logout (révoque le refresh token courant)
router.post("/logout", auth, AuthController.logout);

module.exports = router;
