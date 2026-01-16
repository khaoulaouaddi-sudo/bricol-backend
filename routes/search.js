// routes/search.js
const router = require("express").Router();
const searchController = require("../controllers/searchController");

// search
router.get("/", searchController.search);

// home selected
router.get("/selected", searchController.selected);

module.exports = router;
