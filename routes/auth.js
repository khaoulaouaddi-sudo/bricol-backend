const express = require("express");
const router = express.Router();

const AuthController = require("../controllers/authController");
const { auth } = require("../middleware/authMiddleware");
const { rateLimit } = require("../middleware/rateLimitMiddleware");

// Rate limits (in-memory: OK dev. En prod => Redis store recommandé)
const rlRegister = rateLimit("auth:register", 10, 15 * 60 * 1000);
const rlLogin = rateLimit("auth:login", 20, 15 * 60 * 1000);
const rlForgot = rateLimit("auth:forgot", 10, 15 * 60 * 1000);
const rlReset = rateLimit("auth:reset", 10, 15 * 60 * 1000);
const rlRefresh = rateLimit("auth:refresh", 60, 15 * 60 * 1000);

router.post("/register", rlRegister, AuthController.register);
router.post("/verify-email", AuthController.verifyEmail);

router.post("/login", rlLogin, AuthController.login);
router.post("/refresh", rlRefresh, AuthController.refresh);

router.post("/forgot-password", rlForgot, AuthController.forgotPassword);
router.post("/reset-password", rlReset, AuthController.resetPassword);

router.post("/logout", AuthController.logout);

module.exports = router;
