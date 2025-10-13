// routes/messages.js
const express = require("express");
const router = express.Router();
const MC = require("../controllers/messageController");
const { auth } = require("../middleware/authMiddleware");
const { body, param, query } = require("express-validator");
const validate = require("../middleware/validate");

// Inbox / Outbox / Thread
router.get("/inbox",
  auth,
  [
    query("page").optional().isInt({ min:1 }),
    query("limit").optional().isInt({ min:1, max:50 }),
  ],
  validate,
  MC.inbox
);

router.get("/outbox",
  auth,
  [
    query("page").optional().isInt({ min:1 }),
    query("limit").optional().isInt({ min:1, max:50 }),
  ],
  validate,
  MC.outbox
);

router.get("/thread/:otherUserId",
  auth,
  [
    param("otherUserId").isInt({ min:1 }),
    query("page").optional().isInt({ min:1 }),
    query("limit").optional().isInt({ min:1, max:100 }),
  ],
  validate,
  MC.thread
);

// Create
router.post("/",
  auth,
  [
    body("receiver_id").isInt({ min:1 }),
    body("content").isString().trim().isLength({ min:1, max:2000 }),
  ],
  validate,
  MC.create
);

module.exports = router;
