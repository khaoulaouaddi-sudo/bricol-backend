const WP = require("../models/workerPhotoModel");

const WorkerPhotoController = {
  async getAll(req, res) {
    try {
      const rows = await WP.getAll();
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getById(req, res) {
    try {
      const r = await WP.getById(req.params.id);
      if (!r) return res.status(404).json({ msg: "Photo non trouvée" });
      res.json(r);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // création bulk (déjà chez toi) — petite amélioration : 1 seule cover max
  async create(req, res) {
    try {
      const profileId = req.params.id;
      const photos = req.body.photos;

      if (!Array.isArray(photos) || photos.length === 0) {
        return res.status(400).json({ msg: "Liste de photos invalide" });
      }

      // normaliser : max une cover
      let coverUsed = false;

      const created = [];
      for (const p of photos) {
        if (!p?.url) continue;

        const wantsCover = !!p.is_cover;
        const is_cover = wantsCover && !coverUsed;
        if (is_cover) coverUsed = true;

        const photo = await WP.create({
          profile_id: profileId,
          image_url: p.url,
          caption: p.caption ?? null,
          is_cover,
        });

        created.push(photo);
      }

      return res.status(201).json({ photos: created });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

    async patch(req, res) {
    try {
      const id = Number(req.params.id);
      const { is_cover, caption } = req.body || {};

      if (is_cover === true) {
        const updated = await WP.setCover(id);
        if (!updated) return res.status(404).json({ msg: "Photo non trouvée" });

        if (typeof caption === "string") {
          const u2 = await WP.updateById(id, { caption });
          return res.json(u2);
        }
        return res.json(updated);
      }

      const updated = await WP.updateById(id, {
        caption: typeof caption === "string" ? caption : null,
        is_cover: null,
      });
      if (!updated) return res.status(404).json({ msg: "Photo non trouvée" });

      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },


  async delete(req, res) {
    try {
      const out = await WP.deleteAndAutoReassignCover(req.params.id);
      if (!out.deleted) return res.status(404).json({ msg: "Photo non trouvée" });
      res.json({ msg: "Photo supprimée" });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  async getByProfile(req, res) {
    try {
      const rows = await WP.getByProfile(req.params.profileId || req.params.id);
      res.json(rows);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
};

module.exports = WorkerPhotoController;
