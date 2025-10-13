// controllers/messageController.js
const pool = require("../db");
const Message = require("../models/messageModel");

function toInt(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const MessageController = {
  // GET /messages/inbox?page=&limit=
  async inbox(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ msg: "Auth requise" });
      const page = Math.max(1, toInt(req.query.page, 1));
      const limit = Math.max(1, Math.min(50, toInt(req.query.limit, 20)));
      const rows = await Message.inbox(userId, { page, limit });
      res.json(rows);
    } catch (err) {
      console.error("inbox err:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // GET /messages/outbox?page=&limit=
  async outbox(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ msg: "Auth requise" });
      const page = Math.max(1, toInt(req.query.page, 1));
      const limit = Math.max(1, Math.min(50, toInt(req.query.limit, 20)));
      const rows = await Message.outbox(userId, { page, limit });
      res.json(rows);
    } catch (err) {
      console.error("outbox err:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // GET /messages/thread/:otherUserId?page=&limit=
  async thread(req, res) {
    try {
      const me = req.user?.id;
      if (!me) return res.status(401).json({ msg: "Auth requise" });
      const other = toInt(req.params.otherUserId, 0);
      if (!other) return res.status(400).json({ msg: "otherUserId invalide" });

      const page = Math.max(1, toInt(req.query.page, 1));
      const limit = Math.max(1, Math.min(100, toInt(req.query.limit, 50)));

      const rows = await Message.thread(me, other, { page, limit });
      res.json(rows);
    } catch (err) {
      console.error("thread err:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  },

  // POST /messages  { receiver_id, content }
  async create(req, res) {
    try {
      const sender_id = req.user?.id;
      if (!sender_id) return res.status(401).json({ msg: "Auth requise" });

      const { receiver_id, content } = req.body || {};
      const rid = toInt(receiver_id, 0);
      if (!rid) return res.status(400).json({ msg: "receiver_id invalide" });
      if (!content || !String(content).trim()) {
        return res.status(400).json({ msg: "content requis" });
      }
      if (rid === sender_id) {
        return res.status(400).json({ msg: "Impossible d'envoyer un message à soi-même" });
      }

      // vérifier que le destinataire existe
      const { rows: rx } = await pool.query(`SELECT 1 FROM users WHERE id=$1`, [rid]);
      if (!rx.length) return res.status(404).json({ msg: "Destinataire introuvable" });

      const msg = await Message.create({
        sender_id,
        receiver_id: rid,
        content: String(content).trim(),
      });
      res.status(201).json(msg);
    } catch (err) {
      console.error("create message err:", err);
      if (err.code === "23514") {
        // CHECK constraint (ex: messages_no_self)
        return res.status(400).json({ msg: "Règle métier violée" });
      }
      if (err.code === "23503") {
        // FK violation
        return res.status(400).json({ msg: "Utilisateur inexistant" });
      }
      res.status(500).json({ error: "Erreur serveur" });
    }
  },
};

module.exports = MessageController;
