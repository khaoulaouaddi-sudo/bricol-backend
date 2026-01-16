// routes/uploads.js
const express = require("express");
const multer = require("multer");
const { auth } = require("../middleware/authMiddleware");
const { uploadImage } = require("../controllers/uploadController");

const router = express.Router();

// Stockage en mémoire (pas de fichiers sur Render)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024), // 5MB par défaut
  },
  fileFilter: (req, file, cb) => {
    const ok = /^image\/(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.mimetype);
    if (!ok) return cb(new Error("Type de fichier non supporté"));
    return cb(null, true);
  },
});

// POST /uploads/image  (form-data: file)
router.post("/image", auth, upload.single("file"), uploadImage);

module.exports = router;
