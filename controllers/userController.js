// controllers/userController.js
const bcrypt = require("bcryptjs");
const User = require("../models/userModel");

const UserController = {
  async getAll(req, res) {
    try {
      const users = await User.getAll();
      res.json(users);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getById(req, res) {
    try {
      const user = await User.getById(req.params.id);
      if (!user) return res.status(404).json({ msg: "User not found" });
      res.json(user);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

 async create(req, res) {
  try {
    const { 
      name, email, password, phone, role, 
      profile_photo, facebook_url, instagram_url, 
      tiktok_url, google_id, facebook_id 
    } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ msg: "name, email et password requis" });
    }

    // ✅ Validation du rôle
    const validRoles = ["visitor", "worker", "admin", "company"];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ msg: "Invalid role. Must be visitor, worker, admin or company" });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const user = await User.create({
      name, email, password_hash, phone, role,
      profile_photo, facebook_url, instagram_url,
      tiktok_url, google_id, facebook_id
    });

    res.status(201).json(user);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(400).json({ msg: "Email déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
},

async update(req, res) {
  try {
    const data = { ...req.body };

    // ✅ Validation du rôle si on tente de le modifier
    if (data.role) {
      const validRoles = ["visitor", "worker", "admin", "company"];
      if (!validRoles.includes(data.role)) {
        return res.status(400).json({ msg: "Invalid role. Must be visitor, worker, admin or company" });
      }
    }

    if (data.password) {
      data.password_hash = await bcrypt.hash(data.password, 10);
      delete data.password;
    }

    const updated = await User.update(req.params.id, data);

    if (!updated) {
      return res.status(404).json({ msg: "User not found or no fields provided" });
    }

    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.code === "23505") {
      return res.status(400).json({ msg: "Email déjà utilisé" });
    }
    res.status(500).json({ error: "Erreur serveur" });
  }
},

  async delete(req, res) {
    try {
      const d = await User.delete(req.params.id);
      if (!d) return res.status(404).json({ msg: "User not found" });
      res.json({ msg: "User supprimé" });
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  // relations
  async getAds(req, res) {
    try {
      const ads = await User.getAdsByUser(req.params.id);
      res.json(ads);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getMessages(req, res) {
    try {
      const msgs = await User.getMessagesByUser(req.params.id);
      res.json(msgs);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getReviewsWritten(req, res) {
    try {
      const revs = await User.getReviewsWrittenBy(req.params.id);
      res.json(revs);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getReviewsReceived(req, res) {
    try {
      const revs = await User.getReviewsForWorker(req.params.id);
      res.json(revs);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  },

  async getProfiles(req, res) {
    try {
      const profiles = await User.getProfilesByUser(req.params.id);
      res.json(profiles);
    } catch (err) { console.error(err); res.status(500).json({ error: "Erreur serveur" }); }
  }
};

module.exports = UserController;