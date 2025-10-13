// routes/ads.js (version finale)
const express = require("express");
const router = express.Router();
const AC = require("../controllers/adController");
const { auth, checkRole } = require("../middleware/authMiddleware");
const { body, query, param } = require("express-validator");
const validate = require("../middleware/validate");

// spécifiques AVANT /:id
router.get("/search",
  [
    query("q").optional().isString().trim().isLength({ max: 120 }),
    query("type").optional().isIn(["service","product"]),
    query("page").optional().isInt({ min:1 }),
    query("limit").optional().isInt({ min:1, max:50 }),
    query("sort_by").optional().isIn(["created_at","price","title"]),
    query("sort_dir").optional().isIn(["asc","desc"]),
  ],
  validate,
  AC.search
);

router.get("/user/:userId", [ param("userId").isInt({ min:1 }) ], validate, AC.getByUser);

// liste + détail
router.get("/", AC.getAll);
router.get("/:id", [ param("id").isInt({ min:1 }) ], validate, AC.getById);

// écriture (admin)
router.post("/",
  auth, checkRole("admin"),
  [
    body("title").isString().trim().isLength({ min:3, max:120 }),
    body("description").optional().isString().isLength({ max:2000 }),
    body("price").optional().isFloat({ min:0 }),
    body("type").isIn(["service","product"]),
    body("location").optional().isString().isLength({ max:120 }),
    body("image_url").optional().isURL(),
  ],
  validate,
  AC.create
);

router.put("/:id",
  auth, checkRole("admin"),
  [
    param("id").isInt({ min:1 }),
    body("title").optional().isString().trim().isLength({ min:3, max:120 }),
    body("description").optional().isString().isLength({ max:2000 }),
    body("price").optional().isFloat({ min:0 }),
    body("type").optional().isIn(["service","product"]),
    body("location").optional().isString().isLength({ max:120 }),
    body("image_url").optional().isURL(),
  ],
  validate,
  AC.update
);

router.delete("/:id", auth, checkRole("admin"), [ param("id").isInt({ min:1 }) ], validate, AC.delete);

module.exports = router;
