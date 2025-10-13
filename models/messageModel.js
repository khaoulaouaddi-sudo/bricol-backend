// models/messageModel.js
const pool = require("../db");

function normPageLimit(page, limit, max = 50) {
  const p = Math.max(1, parseInt(page, 10) || 1);
  const l = Math.max(1, Math.min(max, parseInt(limit, 10) || 20));
  return { p, l, off: (p - 1) * l };
}

const MessageModel = {
  async create({ sender_id, receiver_id, content }) {
    const q = `
      INSERT INTO messages (sender_id, receiver_id, content)
      VALUES ($1,$2,$3)
      RETURNING id, sender_id, receiver_id, content, created_at
    `;
    const { rows } = await pool.query(q, [sender_id, receiver_id, content]);
    return rows[0];
  },

  async inbox(userId, { page = 1, limit = 20 } = {}) {
    const { p, l, off } = normPageLimit(page, limit, 50);
    const q = `
      SELECT m.*, s.name AS sender_name, r.name AS receiver_name
      FROM messages m
      LEFT JOIN users s ON s.id = m.sender_id
      LEFT JOIN users r ON r.id = m.receiver_id
      WHERE m.receiver_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(q, [userId, l, off]);
    return rows;
  },

  async outbox(userId, { page = 1, limit = 20 } = {}) {
    const { p, l, off } = normPageLimit(page, limit, 50);
    const q = `
      SELECT m.*, s.name AS sender_name, r.name AS receiver_name
      FROM messages m
      LEFT JOIN users s ON s.id = m.sender_id
      LEFT JOIN users r ON r.id = m.receiver_id
      WHERE m.sender_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    const { rows } = await pool.query(q, [userId, l, off]);
    return rows;
  },

  async thread(me, other, { page = 1, limit = 50 } = {}) {
    const { p, l, off } = normPageLimit(page, limit, 100);
    const q = `
      SELECT m.*, s.name AS sender_name, r.name AS receiver_name
      FROM messages m
      LEFT JOIN users s ON s.id = m.sender_id
      LEFT JOIN users r ON r.id = m.receiver_id
      WHERE (m.sender_id = $1 AND m.receiver_id = $2)
         OR (m.sender_id = $2 AND m.receiver_id = $1)
      ORDER BY m.created_at ASC
      LIMIT $3 OFFSET $4
    `;
    const { rows } = await pool.query(q, [me, other, l, off]);
    return rows;
  },
};

module.exports = MessageModel;
