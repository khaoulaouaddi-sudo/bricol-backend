// routes/reviews.js
const express = require("express");
const router = express.Router();
const RC = require("../controllers/reviewController");
const { auth } = require("../middleware/authMiddleware");
const { body, param, query } = require("express-validator");
const validate = require("../middleware/validate");
const { validateReviewCreate, canModifyReview, checkUniqueReview } = require("../middleware/reviewMiddleware");
// (optionnel) rate limit per-user sur création d'avis
const { rateLimit } = require("../middleware/rateLimitMiddleware");

// LIST
router.get("/",
  [
    query("user_id").optional().isInt({ min:1 }),
    query("page").optional().isInt({ min:1 }),
    query("limit").optional().isInt({ min:1, max:50 }),
  ],
  validate,
  RC.getAll
);

// DETAIL
router.get("/:id", [ param("id").isInt({ min:1 }) ], validate, RC.getById);

// CREATE
router.post("/",
  auth,
  [
    body("target_user_id").isInt({ min:1 }),
    body("rating").isInt({ min:1, max:5 }),
    body("comment").optional().isString().isLength({ max:2000 }),
  ],
  validate,
  validateReviewCreate,            // anti auto-review + target exist + etc.
  rateLimit("reviews", 5, 24 * 60 * 60 * 1000), // optionnel (5/j)
  RC.create,
  checkUniqueReview                // 23505 -> 400 message clair
);

// UPDATE
router.put("/:id",
  auth,
  [
    param("id").isInt({ min:1 }),
    body("rating").optional().isInt({ min:1, max:5 }),
    body("comment").optional().isString().isLength({ max:2000 }),
  ],
  validate,
  canModifyReview,
  RC.update
);

// DELETE
router.delete("/:id", auth, [ param("id").isInt({ min:1 }) ], validate, canModifyReview, RC.delete);

module.exports = router;
