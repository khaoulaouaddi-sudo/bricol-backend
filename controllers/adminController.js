const pool = require("../db");
const ReviewModel = require("../models/reviewModel");
const User = require("../models/userModel");
const WP = require("../models/workerProfileModel");

function toInt(v) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function audit(req, { action, target_user_id = null, target_type = null, target_id = null, metadata = null }) {
  await pool.query(
    `INSERT INTO admin_audit_logs (admin_user_id, action, target_user_id, target_type, target_id, metadata)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [req.user.id, action, target_user_id, target_type, target_id, metadata]
  );
}

async function getUserRole(userId) {
  const { rows } = await pool.query(`SELECT role FROM users WHERE id=$1`, [userId]);
  return rows[0]?.role || null;
}

function normalizeStatus(v, fallback = "pending") {
  const allowed = new Set(["not_submitted", "pending", "approved", "rejected"]);
  const s = String(v || "").trim();
  return allowed.has(s) ? s : fallback;
}


function parsePagination(req) {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(5, Number(req.query.limit || 20)));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

const AdminController = {
  async dashboard(req, res) {
    try {
      const [
        usersCount,
        workersCount,
        companiesCount,
        adsCount,
        reviewsCount,
        messagesCount,
      ] = await Promise.all([
        pool.query(`SELECT COUNT(*)::int AS c FROM users`),
        pool.query(`SELECT COUNT(*)::int AS c FROM worker_profiles`),
        pool.query(`SELECT COUNT(*)::int AS c FROM company_profiles`),
        pool.query(`SELECT COUNT(*)::int AS c FROM ads`),
        pool.query(`SELECT COUNT(*)::int AS c FROM reviews`),
        pool.query(`SELECT COUNT(*)::int AS c FROM messages`),
      ]);

      const recentUsers = await pool.query(
        `SELECT id, name, email, role, last_login_at, created_at, is_active, suspended_at
         FROM users
         ORDER BY created_at DESC
         LIMIT 10`
      );

      const recentLogins = await pool.query(
        `SELECT id, name, email, role, last_login_at
         FROM users
         WHERE last_login_at IS NOT NULL
         ORDER BY last_login_at DESC
         LIMIT 10`
      );

      const recentReviews = await pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, r.reviewer_id,
                r.target_worker_profile_id, r.target_company_profile_id,
                u.name AS reviewer_name
         FROM reviews r
         LEFT JOIN users u ON u.id = r.reviewer_id
         ORDER BY r.created_at DESC
         LIMIT 10`
      );

      return res.json({
        stats: {
          users: usersCount.rows[0].c,
          worker_profiles: workersCount.rows[0].c,
          company_profiles: companiesCount.rows[0].c,
          ads: adsCount.rows[0].c,
          reviews: reviewsCount.rows[0].c,
          messages: messagesCount.rows[0].c,
        },
        recent: {
          users: recentUsers.rows,
          logins: recentLogins.rows,
          reviews: recentReviews.rows,
        },
      });
    } catch (err) {
      console.error("admin dashboard err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async listUsers(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req);
      const q = (req.query.q || "").trim();
      const status = (req.query.status || "").trim(); // "active" | "suspended" | ""

      const where = [];
      const params = [];
      let i = 1;

      if (q) {
        where.push(`(LOWER(name) LIKE LOWER($${i}) OR LOWER(email) LIKE LOWER($${i}))`);
        params.push(`%${q}%`);
        i++;
      }

      if (status === "active") {
        where.push(`(is_active = TRUE AND suspended_at IS NULL)`);
      } else if (status === "suspended") {
        where.push(`(is_active = FALSE OR suspended_at IS NOT NULL)`);
      }

      // pas obligatoire, mais pratique : exclure admins de la liste “actionnable”
      const baseWhere = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM users ${baseWhere}`, params);
      const total = totalR.rows[0].c;

      params.push(limit, offset);

      const listR = await pool.query(
        `SELECT id, name, email, role, is_active, suspended_at, last_login_at, created_at
         FROM users
         ${baseWhere}
         ORDER BY created_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        params
      );

      return res.json({
        items: listR.rows,
        meta: { page, limit, total },
      });
    } catch (err) {
      console.error("admin listUsers err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async suspendUser(req, res) {
    try {
      const userId = Number(req.params.id);
      const { force_logout } = req.body || {};

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      const role = await getUserRole(userId);
      if (!role) return res.status(404).json({ msg: "Utilisateur introuvable" });

      // BD-only pour admins
      if (role === "admin") return res.status(403).json({ msg: "Action interdite sur un admin (BD-only)" });

      await pool.query("BEGIN");
      try {
        await pool.query(
          `UPDATE users
           SET is_active = FALSE,
               suspended_at = NOW()
           WHERE id = $1`,
          [userId]
        );

        if (force_logout === true) {
          await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);
        }

        await audit(req, {
          action: "SUSPEND_USER",
          target_user_id: userId,
          metadata: { force_logout: force_logout === true },
        });

        await pool.query("COMMIT");
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }

      return res.json({ ok: true });
    } catch (err) {
      console.error("admin suspendUser err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async unsuspendUser(req, res) {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      const role = await getUserRole(userId);
      if (!role) return res.status(404).json({ msg: "Utilisateur introuvable" });
      if (role === "admin") return res.status(403).json({ msg: "Action interdite sur un admin (BD-only)" });

      await pool.query(
        `UPDATE users
         SET is_active = TRUE,
             suspended_at = NULL
         WHERE id = $1`,
        [userId]
      );

      await audit(req, { action: "UNSUSPEND_USER", target_user_id: userId });

      return res.json({ ok: true });
    } catch (err) {
      console.error("admin unsuspendUser err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async revokeSessions(req, res) {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      const role = await getUserRole(userId);
      if (!role) return res.status(404).json({ msg: "Utilisateur introuvable" });
      if (role === "admin") return res.status(403).json({ msg: "Action interdite sur un admin (BD-only)" });

      await pool.query(`UPDATE users SET token_version = token_version + 1 WHERE id = $1`, [userId]);

      await audit(req, { action: "REVOKE_SESSIONS", target_user_id: userId });

      return res.json({ ok: true });
    } catch (err) {
      console.error("admin revokeSessions err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async listReviews(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req);

      const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM reviews`);
      const total = totalR.rows[0].c;

      const r = await pool.query(
        `SELECT r.id, r.rating, r.comment, r.created_at, r.reviewer_id,
                r.target_worker_profile_id, r.target_company_profile_id,
                u.name AS reviewer_name
         FROM reviews r
         LEFT JOIN users u ON u.id = r.reviewer_id
         ORDER BY r.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return res.json({ items: r.rows, meta: { page, limit, total } });
    } catch (err) {
      console.error("admin listReviews err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async deleteReview(req, res) {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ msg: "id invalide" });

      const deleted = await ReviewModel.delete(id);
      if (!deleted) return res.status(404).json({ msg: "Review introuvable" });

      await audit(req, { action: "DELETE_REVIEW", target_type: "review", target_id: id });

      return res.json({ ok: true });
    } catch (err) {
      console.error("admin deleteReview err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async listPhotos(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req);
      const type = String(req.query.type || "worker"); // worker|company
      if (!["worker", "company"].includes(type)) return res.status(400).json({ msg: "type invalide" });

      const table = type === "worker" ? "worker_photos" : "company_photos";
      const fk = type === "worker" ? "profile_id" : "company_id";

      const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
      const total = totalR.rows[0].c;

      const r = await pool.query(
        `SELECT id, ${fk} AS profile_id, image_url, caption, is_cover, created_at
         FROM ${table}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return res.json({ items: r.rows, meta: { page, limit, total } });
    } catch (err) {
      console.error("admin listPhotos err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async deletePhoto(req, res) {
    try {
      const type = String(req.params.type);
      const id = Number(req.params.id);
      if (!["worker", "company"].includes(type)) return res.status(400).json({ msg: "type invalide" });
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ msg: "id invalide" });

      const table = type === "worker" ? "worker_photos" : "company_photos";
      const del = await pool.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
      if (del.rowCount === 0) return res.status(404).json({ msg: "Photo introuvable" });

      await audit(req, { action: "DELETE_PHOTO", target_type: `${type}_photo`, target_id: id });

      return res.json({ ok: true });
    } catch (err) {
      console.error("admin deletePhoto err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  // =========================
  // Identity (CIN) moderation
  // =========================
  async listIdentityRequests(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req);
      const status = normalizeStatus(req.query.status, "pending");
      const q = (req.query.q || "").trim();

      const where = ["identity_status = $1"];
      const params = [status];
      let i = 2;

      if (q) {
        where.push(`(LOWER(name) LIKE LOWER($${i}) OR LOWER(email) LIKE LOWER($${i}) OR LOWER(COALESCE(cin,'')) LIKE LOWER($${i}))`);
        params.push(`%${q}%`);
        i++;
      }

      const baseWhere = `WHERE ${where.join(" AND ")}`;

      const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM users ${baseWhere}`, params);
      const total = totalR.rows[0].c;

      params.push(limit, offset);

      const listR = await pool.query(
        `SELECT
           id, name, email,
           cin, cin_photo_url,
           identity_status, identity_verified, identity_verified_at,
           identity_reviewed_by, identity_rejection_reason,
           updated_at, created_at
         FROM users
         ${baseWhere}
         ORDER BY updated_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        params
      );

      return res.json({ items: listR.rows, meta: { page, limit, total } });
    } catch (err) {
      console.error("admin listIdentityRequests err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async approveUserIdentity(req, res) {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      await pool.query("BEGIN");
      try {
        const cur = await pool.query(
          `SELECT identity_status FROM users WHERE id=$1`,
          [userId]
        );
        if (cur.rowCount === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({ msg: "Utilisateur introuvable" });
        }

        // Option sécurité: n’approuver que pending
        if (cur.rows[0].identity_status !== "pending") {
          await pool.query("ROLLBACK");
          return res.status(400).json({ msg: "Statut identité non 'pending'" });
        }

        const up = await pool.query(
          `UPDATE users
           SET identity_status='approved',
               identity_verified=TRUE,
               identity_verified_at=NOW(),
               identity_reviewed_by=$2,
               identity_rejection_reason=NULL,
               updated_at=NOW()
           WHERE id=$1
           RETURNING id, cin, cin_photo_url, identity_status, identity_verified, identity_verified_at, identity_reviewed_by, identity_rejection_reason`,
          [userId, req.user.id]
        );

        await audit(req, {
          action: "APPROVE_IDENTITY",
          target_user_id: userId,
          target_type: "user_identity",
          target_id: userId,
        });

        await pool.query("COMMIT");
        return res.json(up.rows[0]);
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }
    } catch (err) {
      console.error("admin approveUserIdentity err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async rejectUserIdentity(req, res) {
    try {
      const userId = Number(req.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!reason) return res.status(400).json({ msg: "reason est requis" });

      await pool.query("BEGIN");
      try {
        const cur = await pool.query(
          `SELECT identity_status FROM users WHERE id=$1`,
          [userId]
        );
        if (cur.rowCount === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({ msg: "Utilisateur introuvable" });
        }

        if (cur.rows[0].identity_status !== "pending") {
          await pool.query("ROLLBACK");
          return res.status(400).json({ msg: "Statut identité non 'pending'" });
        }

        const up = await pool.query(
          `UPDATE users
           SET identity_status='rejected',
               identity_verified=FALSE,
               identity_verified_at=NULL,
               identity_reviewed_by=$2,
               identity_rejection_reason=$3,
               updated_at=NOW()
           WHERE id=$1
           RETURNING id, cin, cin_photo_url, identity_status, identity_verified, identity_verified_at, identity_reviewed_by, identity_rejection_reason`,
          [userId, req.user.id, reason]
        );

        await audit(req, {
          action: "REJECT_IDENTITY",
          target_user_id: userId,
          target_type: "user_identity",
          target_id: userId,
          metadata: { reason },
        });

        await pool.query("COMMIT");
        return res.json(up.rows[0]);
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }
    } catch (err) {
      console.error("admin rejectUserIdentity err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  // =========================
  // Diploma moderation
  // =========================
  async listDiplomaRequests(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req);
      const status = normalizeStatus(req.query.status, "pending");
      const q = (req.query.q || "").trim();

      const where = ["wp.diploma_status = $1"];
      const params = [status];
      let i = 2;

      if (q) {
        where.push(`(LOWER(u.name) LIKE LOWER($${i}) OR LOWER(u.email) LIKE LOWER($${i}) OR LOWER(COALESCE(wp.title,'')) LIKE LOWER($${i}))`);
        params.push(`%${q}%`);
        i++;
      }

      const baseWhere = `WHERE ${where.join(" AND ")}`;

      const totalR = await pool.query(
        `SELECT COUNT(*)::int AS c
         FROM worker_profiles wp
         LEFT JOIN users u ON u.id = wp.user_id
         ${baseWhere}`,
        params
      );
      const total = totalR.rows[0].c;

      params.push(limit, offset);

      const listR = await pool.query(
        `SELECT
           wp.id, wp.user_id, wp.title,
           wp.city_id, wp.sector_id,
           wp.diploma_file_url, wp.diploma_status, wp.diploma_verified_at,
           wp.diploma_reviewed_by, wp.diploma_rejection_reason,
           wp.updated_at, wp.created_at,
           u.name AS user_name, u.email AS user_email
         FROM worker_profiles wp
         LEFT JOIN users u ON u.id = wp.user_id
         ${baseWhere}
         ORDER BY wp.updated_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        params
      );

      return res.json({ items: listR.rows, meta: { page, limit, total } });
    } catch (err) {
      console.error("admin listDiplomaRequests err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async approveWorkerDiploma(req, res) {
    try {
      const profileId = Number(req.params.id);
      if (!Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      await pool.query("BEGIN");
      try {
        const cur = await pool.query(
          `SELECT diploma_status, user_id FROM worker_profiles WHERE id=$1`,
          [profileId]
        );
        if (cur.rowCount === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({ msg: "Profil introuvable" });
        }

        if (cur.rows[0].diploma_status !== "pending") {
          await pool.query("ROLLBACK");
          return res.status(400).json({ msg: "Statut diplôme non 'pending'" });
        }

        const up = await pool.query(
          `UPDATE worker_profiles
           SET diploma_status='approved',
               diploma_verified_at=NOW(),
               diploma_reviewed_by=$2,
               diploma_rejection_reason=NULL,
               updated_at=NOW()
           WHERE id=$1
           RETURNING id, user_id, diploma_file_url, diploma_status, diploma_verified_at, diploma_reviewed_by, diploma_rejection_reason`,
          [profileId, req.user.id]
        );

        await audit(req, {
          action: "APPROVE_DIPLOMA",
          target_user_id: cur.rows[0].user_id,
          target_type: "worker_diploma",
          target_id: profileId,
        });

        await pool.query("COMMIT");
        return res.json(up.rows[0]);
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }
    } catch (err) {
      console.error("admin approveWorkerDiploma err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },

  async rejectWorkerDiploma(req, res) {
    try {
      const profileId = Number(req.params.id);
      if (!Number.isInteger(profileId) || profileId <= 0) {
        return res.status(400).json({ msg: "id invalide" });
      }

      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
      if (!reason) return res.status(400).json({ msg: "reason est requis" });

      await pool.query("BEGIN");
      try {
        const cur = await pool.query(
          `SELECT diploma_status, user_id FROM worker_profiles WHERE id=$1`,
          [profileId]
        );
        if (cur.rowCount === 0) {
          await pool.query("ROLLBACK");
          return res.status(404).json({ msg: "Profil introuvable" });
        }

        if (cur.rows[0].diploma_status !== "pending") {
          await pool.query("ROLLBACK");
          return res.status(400).json({ msg: "Statut diplôme non 'pending'" });
        }

        const up = await pool.query(
          `UPDATE worker_profiles
           SET diploma_status='rejected',
               diploma_verified_at=NULL,
               diploma_reviewed_by=$2,
               diploma_rejection_reason=$3,
               updated_at=NOW()
           WHERE id=$1
           RETURNING id, user_id, diploma_file_url, diploma_status, diploma_verified_at, diploma_reviewed_by, diploma_rejection_reason`,
          [profileId, req.user.id, reason]
        );

        await audit(req, {
          action: "REJECT_DIPLOMA",
          target_user_id: cur.rows[0].user_id,
          target_type: "worker_diploma",
          target_id: profileId,
          metadata: { reason },
        });

        await pool.query("COMMIT");
        return res.json(up.rows[0]);
      } catch (e) {
        await pool.query("ROLLBACK");
        throw e;
      }
    } catch (err) {
      console.error("admin rejectWorkerDiploma err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },


  async listAuditLogs(req, res) {
    try {
      const { page, limit, offset } = parsePagination(req);

      const totalR = await pool.query(`SELECT COUNT(*)::int AS c FROM admin_audit_logs`);
      const total = totalR.rows[0].c;

      const r = await pool.query(
        `SELECT l.id, l.action, l.target_user_id, l.target_type, l.target_id, l.metadata, l.created_at,
                u.name AS admin_name, u.email AS admin_email
         FROM admin_audit_logs l
         LEFT JOIN users u ON u.id = l.admin_user_id
         ORDER BY l.created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      return res.json({ items: r.rows, meta: { page, limit, total } });
    } catch (err) {
      console.error("admin listAuditLogs err:", err);
      return res.status(500).json({ msg: "Erreur serveur" });
    }
  },
};

module.exports = AdminController;
