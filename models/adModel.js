// models/adModel.js
const pool = require("../db");

// Petites validations applicatives
const ALLOWED_TYPES = new Set(["product", "service"]);

function normalizePagination({ page, limit }) {
  const p = Math.max(parseInt(page || 1, 10), 1);
  const l = Math.min(Math.max(parseInt(limit || 10, 10), 1), 100);
  return { offset: (p - 1) * l, limit: l, page: p };
}

function normalizeSort({ sort_by, sort_dir }) {
  const allowed = new Set(["created_at", "price", "title"]);
  const by = allowed.has(sort_by) ? sort_by : "created_at";
  const dir = (String(sort_dir || "desc").toLowerCase() === "asc") ? "ASC" : "DESC";
  return { by, dir };
}

function validateAdInput({ title, type, price }) {
  if (!title || String(title).trim().length < 3) {
    const e = new Error("Titre invalide (>= 3 caractères)"); e.status = 400; throw e;
  }
  if (type && !ALLOWED_TYPES.has(String(type))) {
    const e = new Error("Type invalide (product|service)"); e.status = 400; throw e;
  }
  if (price != null) {
    const n = Number(price);
    if (Number.isNaN(n) || n < 0) {
      const e = new Error("Prix invalide (nombre >= 0)"); e.status = 400; throw e;
    }
  }
}

const AdModel = {
  async getAll(query = {}) {
    const { offset, limit } = normalizePagination(query);
    const { by, dir } = normalizeSort(query);
    // filtre simple optionnel
    const where = [];
    const params = [];
    let idx = 1;

    if (query.type && ALLOWED_TYPES.has(query.type)) {
      where.push(`type = $${idx++}`); params.push(query.type);
    }
    if (query.user_id) {
      where.push(`user_id = $${idx++}`); params.push(query.user_id);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const q = `
      SELECT id, user_id, title, description, price, type, location, image_url, created_at, updated_at
      FROM ads
      ${whereSql}
      ORDER BY ${by} ${dir}
      LIMIT $${idx++} OFFSET $${idx}
    `;
    params.push(limit, offset);

    const { rows } = await pool.query(q, params);
    return rows;
  },

  async getById(id) {
    const q = `
      SELECT id, user_id, title, description, price, type, location, image_url, created_at, updated_at
      FROM ads WHERE id = $1
    `;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async create({ user_id, title, description, price, type, location, image_url }) {
    validateAdInput({ title, type, price });

    const q = `
      INSERT INTO ads (user_id, title, description, price, type, location, image_url)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      RETURNING id, user_id, title, description, price, type, location, image_url, created_at, updated_at
    `;
    const values = [
      user_id,
      title.trim(),
      description || null,
      price != null ? Number(price) : null,
      type || null,
      location || null,
      image_url || null,
    ];
    const { rows } = await pool.query(q, values);
    return rows[0];
  },

  async update(id, data) {
    // whitelist + validation
    const allowed = ["title","description","price","type","location","image_url"];
    const updates = {};
    for (const k of Object.keys(data || {})) {
      if (allowed.includes(k)) updates[k] = data[k];
    }
    if (updates.title || updates.type || (updates.price != null)) {
      validateAdInput({ title: updates.title ?? "ok", type: updates.type, price: updates.price });
    }

    const fields = [];
    const values = [];
    let idx = 1;
    for (const [k, v] of Object.entries(updates)) {
      fields.push(`${k} = $${idx++}`);
      values.push(k === "price" && v != null ? Number(v) : v);
    }
    if (!fields.length) return null;

    const q = `
      UPDATE ads
      SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idx}
      RETURNING id, user_id, title, description, price, type, location, image_url, created_at, updated_at
    `;
    values.push(id);
    const { rows } = await pool.query(q, values);
    return rows[0];
  },
// ---- à AJOUTER dans AdModel ----
async search(query = {}) {
  const { offset, limit } = normalizePagination(query);
  const { by, dir } = normalizeSort(query);

  const where = [];
  const params = [];
  let idx = 1;

  // recherche plein-texte simple sur title/description
  if (query.q && String(query.q).trim()) {
    where.push(`(title ILIKE $${idx} OR description ILIKE $${idx})`);
    params.push(`%${query.q.trim()}%`);
    idx++;
  }
  if (query.type && ALLOWED_TYPES.has(String(query.type))) {
    where.push(`type = $${idx++}`);
    params.push(query.type);
  }
  if (query.user_id) {
    where.push(`user_id = $${idx++}`);
    params.push(query.user_id);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const q = `
    SELECT id, user_id, title, description, price, type, location, image_url, created_at, updated_at
    FROM ads
    ${whereSql}
    ORDER BY ${by} ${dir}
    LIMIT $${idx++} OFFSET $${idx}
  `;
  params.push(limit, offset);

  const { rows } = await pool.query(q, params);
  return rows;
},

  async delete(id) {
    const q = `DELETE FROM ads WHERE id = $1 RETURNING id`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  }
};

module.exports = AdModel;