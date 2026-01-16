const pool = require("../db");
const ReviewModel = require("../models/reviewModel");

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
