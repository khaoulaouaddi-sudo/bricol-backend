// controllers/uploadController.js
// Upload d'images vers Cloudinary puis retour d'une URL publique

const streamifier = require("streamifier");
const { cloudinary, ensureCloudinaryConfigured } = require("../utils/cloudinary");

// POST /uploads/image  (multipart/form-data, champ: file)
async function uploadImage(req, res) {
  try {
    ensureCloudinaryConfigured();

    if (!req.file) {
      return res.status(400).json({ msg: "Fichier manquant (champ 'file')" });
    }

    const userId = req.user?.id;
    const folderBase = process.env.CLOUDINARY_FOLDER || "bricol";
    const folder = userId ? `${folderBase}/u${userId}` : folderBase;

    // Upload via stream (multer memory storage)
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: "image",
          // Optimisations auto (garde l'image légère)
          transformation: [
            { width: 1600, height: 1600, crop: "limit" },
            { quality: "auto" },
            { fetch_format: "auto" },
          ],
        },
        (error, uploaded) => {
          if (error) return reject(error);
          return resolve(uploaded);
        }
      );

      streamifier.createReadStream(req.file.buffer).pipe(uploadStream);
    });

    const url = result?.secure_url || result?.url;
    if (!url) {
      return res.status(500).json({ msg: "Upload réussi mais URL introuvable." });
    }

    return res.status(201).json({ url });
  } catch (err) {
    console.error("uploadImage error:", err);
    if (err?.code === "CLOUDINARY_NOT_CONFIGURED") {
      return res.status(500).json({ msg: err.message, code: err.code });
    }
    return res.status(500).json({ msg: "Erreur lors de l'upload de l'image" });
  }
}

module.exports = { uploadImage };
