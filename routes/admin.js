const express = require("express");
const router = express.Router();

const { auth, checkRole } = require("../middleware/authMiddleware");
const AdminController = require("../controllers/adminController");

router.use(auth, checkRole("admin"));

// Dashboard
router.get("/dashboard", AdminController.dashboard);

// Users
router.get("/users", AdminController.listUsers);
router.patch("/users/:id/suspend", AdminController.suspendUser);
router.patch("/users/:id/unsuspend", AdminController.unsuspendUser);
router.post("/users/:id/revoke-sessions", AdminController.revokeSessions);

// Moderation
router.get("/reviews", AdminController.listReviews);
router.delete("/reviews/:id", AdminController.deleteReview);

router.get("/photos", AdminController.listPhotos); // type=worker|company
router.delete("/photos/:type/:id", AdminController.deletePhoto); // type=worker|company

// Audit logs
router.get("/audit-logs", AdminController.listAuditLogs);

module.exports = router;
