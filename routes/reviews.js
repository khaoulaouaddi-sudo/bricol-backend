// routes/reviews.js
const express = require("express");
const router = express.Router();

const RC = require("../controllers/reviewController");
const { auth } = require("../middleware/authMiddleware");
const { body, param, query } = require("express-validator");
const validate = require("../middleware/validate");
const { rateLimit } = require("../middleware/rateLimitMiddleware");

const {
  validateCreateWorkerReview,
  validateCreateCompanyReview,
  canModifyReview,
  sqlReviewErrorHandler,
} = require("../middleware/reviewMiddleware");

// =======================
// LIST (public)
// =======================
router.get(
  "/worker/:workerProfileId",
  [param("workerProfileId").isInt({ min: 1 })],
  validate,
  RC.getByWorkerProfile
);

router.get(
  "/company/:companyProfileId",
  [param("companyProfileId").isInt({ min: 1 })],
  validate,
  RC.getByCompanyProfile
);

// =======================
// MINE (auth) — per target
// =======================
router.get(
  "/worker/:workerProfileId/mine",
  auth,
  [param("workerProfileId").isInt({ min: 1 })],
  validate,
  RC.getMineForWorkerProfile
);

router.get(
  "/company/:companyProfileId/mine",
  auth,
  [param("companyProfileId").isInt({ min: 1 })],
  validate,
  RC.getMineForCompanyProfile
);

// =======================
// MINE (auth) — ALL my reviews (✅ NEW for /history)
// =======================
router.get(
  "/mine",
  auth,
  [
    query("limit").optional().isInt({ min: 1, max: 100 }),
    query("offset").optional().isInt({ min: 0, max: 100000 }),
  ],
  validate,
  RC.getMine
);

// =======================
// CREATE (auth)
// =======================
router.post(
  "/worker/:workerProfileId",
  auth,
  rateLimit({ windowMs: 60_000, max: 20 }),
  [param("workerProfileId").isInt({ min: 1 })],
  validate,
  validateCreateWorkerReview,
  RC.createForWorkerProfile,
  sqlReviewErrorHandler
);

router.post(
  "/company/:companyProfileId",
  auth,
  rateLimit({ windowMs: 60_000, max: 20 }),
  [param("companyProfileId").isInt({ min: 1 })],
  validate,
  validateCreateCompanyReview,
  RC.createForCompanyProfile,
  sqlReviewErrorHandler
);

// =======================
// UPDATE / DELETE (auth) by review id
// =======================
router.put(
  "/:id",
  auth,
  [
    param("id").isInt({ min: 1 }),
    body("rating").optional().isInt({ min: 1, max: 5 }),
    body("comment").optional().isString().isLength({ max: 2000 }),
  ],
  validate,
  canModifyReview,
  RC.update
);

router.delete(
  "/:id",
  auth,
  [param("id").isInt({ min: 1 })],
  validate,
  canModifyReview,
  RC.delete
);

module.exports = router;
