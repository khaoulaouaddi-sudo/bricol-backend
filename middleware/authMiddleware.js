// middleware/authMiddleware.js
const jwt = require("jsonwebtoken");
const pool = require("../db");

// Vérifie la présence et validité du JWT
function auth(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) return res.status(401).json({ msg: "Token manquant" });

  jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
    if (err) return res.status(401).json({ msg: "Token invalide" });

    try {
      const q = `
        SELECT id, name, email, role, is_active, suspended_at, token_version, email_verified_at
        FROM users
        WHERE id = $1
      `;
      const { rows } = await pool.query(q, [decoded.id]);
      if (!rows[0]) return res.status(401).json({ msg: "Utilisateur non trouvé" });

      const user = rows[0];

 // IMPORTANT: token_version check (invalidation sessions)
      const tvToken = Number(decoded.token_version ?? 0);
      const tvDb = Number(user.token_version ?? 0);
      if (tvToken !== tvDb) {
        return res.status(401).json({ msg: "Session révoquée, reconnectez-vous." });
      }

      // ✅ AJOUT : bloquer comptes désactivés / suspendus (centralisé)
      if (user.is_active === false || user.suspended_at) {
        return res.status(403).json({
          msg: "Compte désactivé ou suspendu",
          code: "ACCOUNT_SUSPENDED",
        });
      }

      req.user = user;
      next();
    } catch (dbErr) {
      console.error(dbErr);
      res.status(500).json({ msg: "Erreur serveur" });
    }
  });
}

function checkRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ msg: "Non authentifié" });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ msg: "Accès interdit : rôle insuffisant" });
    }
    next();
  };
}


// Alias clair : seul admin peut gérer les Ads
const ensureAdminAds = checkRole("admin");

// Middleware : empêcher reviews invalides (doublon conceptuel avec validate, mais garde utile)

async function preventSelfReview(req, res, next) {
  try {
    const reviewer_id = req.user?.id;
    const target_user_id_raw = req.body.target_user_id;

    if (target_user_id_raw === undefined || target_user_id_raw === null) {
      return res.status(400).json({ msg: "target_user_id requis" });
    }
    const target_user_id = Number(target_user_id_raw);
    if (!Number.isInteger(target_user_id) || target_user_id <= 0) {
      return res.status(400).json({ msg: "target_user_id doit être un entier positif" });
    }

    if (reviewer_id === target_user_id) {
      return res.status(400).json({ msg: "Impossible de s’auto-évaluer" });
    }


   // Vérifier que la cible n’est pas un visitor
    const q = "SELECT role FROM users WHERE id = $1";
    const { rows } = await pool.query(q, [target_user_id]);
    if (rows.length === 0) {
      return res.status(404).json({ msg: "Utilisateur cible introuvable" });
    }

    const targetRole = rows[0].role;
    if (targetRole === "visitor") {
      return res.status(400).json({ msg: "Impossible de laisser une review sur un visiteur" });
    }

    // injecter reviewer_id pour la suite (sécurité)
    req.body.reviewer_id = reviewer_id;

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

/* -------- Ownership helpers -------- */

// Vérifie qu’un worker modifie son propre worker_profile (via req.params.id ou req.body.user_id)
async function ensureWorkerProfileOwner(req, res, next) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    if (role === "admin") return next();

    // prioritaire: id du profil en paramètre
    const profileId = req.params.id;
    if (profileId) {
      const q = "SELECT user_id FROM worker_profiles WHERE id = $1";
      const { rows } = await pool.query(q, [profileId]);
      if (!rows[0]) return res.status(404).json({ msg: "Profil introuvable" });
      if (rows[0].user_id !== userId) return res.status(403).json({ msg: "Non propriétaire du profil" });
      return next();
    }

    // sinon: user_id dans le body (création)
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ msg: "user_id requis" });
    if (user_id !== userId) return res.status(403).json({ msg: "user_id ne correspond pas à l’utilisateur connecté" });

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

// Vérifie qu’un worker supprime/ajoute une worker_photo de son propre profil
// Vérifie qu’un worker ajoute ou supprime des photos de son propre worker_profile
async function ensureWorkerPhotoOwner(req, res, next) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;

    // ADMIN = bypass complet
    if (role === "admin") return next();
    /* ------------------------------------------------
     CAS 1 : opérations sur /worker-photos/:id (DELETE, PATCH)
     ici req.params.id = ID PHOTO
  -------------------------------------------------- */
if ((req.method === "DELETE" || req.method === "PATCH") && req.route.path === "/:id") {
  const photoId = req.params.id;

  const q = `
    SELECT wp.user_id
    FROM worker_photos p
    JOIN worker_profiles wp ON wp.id = p.profile_id
    WHERE p.id = $1
  `;
  const { rows } = await pool.query(q, [photoId]);

  if (!rows[0]) return res.status(404).json({ msg: "Photo introuvable" });
  if (rows[0].user_id !== userId) {
    return res.status(403).json({ msg: "Non propriétaire de la photo" });
  }

  return next();
}

    /* ------------------------------------------------
       CAS 2 : POST /worker-profiles/:profileId/photos
       Ici req.params.id = ID DU PROFIL
    -------------------------------------------------- */

    const profileId =
      req.body.profile_id ||      // ancien format
      req.params.profileId ||     // /profile/:profileId
      req.params.id;              // /worker-profiles/:id/photos  <-- notre cas

    if (!profileId) {
      return res.status(400).json({ msg: "profile_id manquant" });
    }

    const q2 = `
      SELECT user_id
      FROM worker_profiles
      WHERE id = $1
    `;
    const { rows } = await pool.query(q2, [profileId]);

    if (!rows[0]) return res.status(404).json({ msg: "Profil introuvable" });
    if (rows[0].user_id !== userId) {
      return res.status(403).json({ msg: "Non propriétaire du profil" });
    }

    return next();

  } catch (err) {
    console.error("ensureWorkerPhotoOwner error:", err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

// Vérifie qu’une company modifie son propre company_profile
async function ensureCompanyProfileOwner(req, res, next) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (role === "admin") return next();

    const profileId = req.params.id;
    if (profileId) {
      const q = "SELECT user_id FROM company_profiles WHERE id = $1";
      const { rows } = await pool.query(q, [profileId]);
      if (!rows[0]) return res.status(404).json({ msg: "Company introuvable" });
      if (rows[0].user_id !== userId) return res.status(403).json({ msg: "Non propriétaire de ce company_profile" });
      return next();
    }

    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ msg: "user_id requis" });
    if (user_id !== userId) return res.status(403).json({ msg: "user_id ne correspond pas à l’utilisateur connecté" });

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

// Vérifie qu’une company manipule ses company_photos
async function ensureCompanyPhotoOwner(req, res, next) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (role === "admin") return next();

    if (req.params.id) {
      const q = `
        SELECT cp.user_id
        FROM company_photos p
        JOIN company_profiles cp ON cp.id = p.company_id
        WHERE p.id = $1
      `;
      const { rows } = await pool.query(q, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ msg: "Photo introuvable" });
      if (rows[0].user_id !== userId) return res.status(403).json({ msg: "Non propriétaire de la photo" });
      return next();
    }

    const { company_id } = req.body;
    if (!company_id) return res.status(400).json({ msg: "company_id requis" });

    const q2 = "SELECT user_id FROM company_profiles WHERE id = $1";
    const { rows } = await pool.query(q2, [company_id]);
    if (!rows[0]) return res.status(404).json({ msg: "Company introuvable" });
    if (rows[0].user_id !== userId) return res.status(403).json({ msg: "Non propriétaire de ce company_profile" });

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

// Vérifie que la company possède le sector (DELETE)
async function ensureCompanySectorOwner(req, res, next) {
  try {
    const userId = req.user?.id;
    const role = req.user?.role;
    if (role === "admin") return next();

    // DELETE /company-sectors/:id  -> on remonte vers company_id -> owner
    if (req.params.id) {
      const q = `
        SELECT cp.user_id
        FROM company_sectors cs
        JOIN company_profiles cp ON cp.id = cs.company_id
        WHERE cs.id = $1
      `;
      const { rows } = await pool.query(q, [req.params.id]);
      if (!rows[0]) return res.status(404).json({ msg: "Sector introuvable" });
      if (rows[0].user_id !== userId) return res.status(403).json({ msg: "Non propriétaire de ce sector" });
      return next();
    }

    // POST : body.company_id
    const { company_id } = req.body;
    if (!company_id) return res.status(400).json({ msg: "company_id requis" });

    const q2 = "SELECT user_id FROM company_profiles WHERE id = $1";
    const { rows } = await pool.query(q2, [company_id]);
    if (!rows[0]) return res.status(404).json({ msg: "Company introuvable" });
    if (rows[0].user_id !== userId) return res.status(403).json({ msg: "Non propriétaire de ce company_profile" });

    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

// Vérifie que l'utilisateur courant est propriétaire du company_profile :companyId (admin bypass)
async function ensureCompanyOwnerFromParam(req, res, next) {
  try {
    const role = req.user?.role;
    if (role === "admin") return next();

    const userId = req.user?.id;
    const companyId = parseInt(req.params.companyId, 10);
    if (!Number.isInteger(companyId)) {
      return res.status(400).json({ msg: "companyId invalide" });
    }

    const { rows } = await pool.query(
      `SELECT user_id FROM company_profiles WHERE id = $1`,
      [companyId]
    );
    if (!rows[0]) return res.status(404).json({ msg: "Company introuvable" });
    if (rows[0].user_id !== userId) {
      return res.status(403).json({ msg: "Non propriétaire de ce company_profile" });
    }

    next();
  } catch (err) {
    console.error("ensureCompanyOwnerFromParam error:", err);
    res.status(500).json({ msg: "Erreur serveur" });
  }
}

module.exports = {
  auth,
  checkRole,
  ensureAdminAds,
  preventSelfReview,
  ensureWorkerProfileOwner,
  ensureWorkerPhotoOwner,
  ensureCompanyProfileOwner,
  ensureCompanyPhotoOwner,
  ensureCompanySectorOwner,
 ensureCompanyOwnerFromParam,
};