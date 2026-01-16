const express = require("express");
const router = express.Router();
const CC = require("../controllers/cityController");

router.get("/", CC.listCities);   // /cities?q=cas&limit=20
router.get("/:id", CC.getCity);   // /cities/5

module.exports = router;
