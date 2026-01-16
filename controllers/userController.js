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
  },

// +AJOUT — retourne l'utilisateur courant via l'access token (JWT)
   async getMe(req, res) {
    try {
      const userId = req.user?.id; // injecté par le middleware auth
      if (!userId) return res.status(401).json({ msg: "Non authentifié" });

      const me = await User.getById(userId); // réutilise ton modèle
      if (!me) return res.status(404).json({ msg: "Utilisateur introuvable" });

      return res.json(me);
    } catch (e) {
      console.error("GET /users/me error:", e);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },
async getMyProfiles(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ msg: "Non authentifié" });

    const profiles = await User.getProfilesByUser(userId);
    return res.json(profiles);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
},

async updateMe(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ msg: "Non authentifié" });

    // ✅ whitelist des champs modifiables par l'utilisateur
    const data = { ...req.body };

    // champs autorisés
    const allowed = [
      "name",
      "phone",
      "profile_photo",
      "facebook_url",
      "instagram_url",
      "tiktok_url",
    ];

    // on garde uniquement ce qui est autorisé
    const safe = {};
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(data, k)) safe[k] = data[k];
    }

    const updated = await User.update(userId, safe);
    if (!updated) return res.status(400).json({ msg: "Aucun champ valide à mettre à jour" });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ msg: "Erreur serveur" });
  }
}


};

module.exports = UserController;