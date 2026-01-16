// utils/cloudinary.js
// Centralise la config Cloudinary (storage externe pour les images)

const cloudinary = require("cloudinary").v2;

function ensureCloudinaryConfigured() {
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  if (!name || !key || !secret) {
    const missing = [
      !name ? "CLOUDINARY_CLOUD_NAME" : null,
      !key ? "CLOUDINARY_API_KEY" : null,
      !secret ? "CLOUDINARY_API_SECRET" : null,
    ].filter(Boolean);

    const msg = `Cloudinary non configuré. Variables manquantes: ${missing.join(", ")}`;
    const err = new Error(msg);
    err.code = "CLOUDINARY_NOT_CONFIGURED";
    throw err;
  }

  cloudinary.config({
    cloud_name: name,
    api_key: key,
    api_secret: secret,
  });
}

module.exports = {
  cloudinary,
  ensureCloudinaryConfigured,
};
