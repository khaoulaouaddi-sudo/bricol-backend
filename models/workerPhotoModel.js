const pool = require("../db");

const WorkerPhotoModel = {
  async getAll() {
    const q = `SELECT * FROM worker_photos ORDER BY created_at DESC;`;
    const { rows } = await pool.query(q);
    return rows;
  },

  async getById(id) {
    const q = `SELECT * FROM worker_photos WHERE id = $1;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async create({ profile_id, image_url, caption = null, is_cover = false }) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      if (is_cover === true) {
        await client.query(
          `UPDATE worker_photos SET is_cover = false
           WHERE profile_id = $1 AND is_cover = true;`,
          [profile_id]
        );
      }

      const q = `
        INSERT INTO worker_photos (profile_id, image_url, caption, is_cover)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `;
      const { rows } = await client.query(q, [profile_id, image_url, caption, is_cover]);
      await client.query("COMMIT");
      return rows[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async update(id, { caption, is_cover }) {
    const existing = await this.getById(id);
    if (!existing) return null;

    const nextCaption = caption === undefined ? existing.caption : caption;
    const nextCover = is_cover === undefined ? existing.is_cover : is_cover;

    if (nextCover === true && existing.is_cover !== true) {
      return await this.setCover(id, { caption: nextCaption });
    }

    const q = `
      UPDATE worker_photos
      SET caption = $2,
          is_cover = $3
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [id, nextCaption, nextCover]);
    return rows[0];
  },

  async setCover(photoId, { caption } = {}) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: r1 } = await client.query(
        `SELECT * FROM worker_photos WHERE id = $1 FOR UPDATE;`,
        [photoId]
      );
      const photo = r1[0];
      if (!photo) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `UPDATE worker_photos
         SET is_cover = false
         WHERE profile_id = $1 AND id <> $2 AND is_cover = true;`,
        [photo.profile_id, photoId]
      );

      const nextCaption = caption === undefined ? photo.caption : caption;

      const { rows: r2 } = await client.query(
        `UPDATE worker_photos
         SET is_cover = true,
             caption = $2
         WHERE id = $1
         RETURNING *;`,
        [photoId, nextCaption]
      );

      await client.query("COMMIT");
      return r2[0];
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async deleteAndAutoReassignCover(id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: r1 } = await client.query(
        `SELECT * FROM worker_photos WHERE id = $1 FOR UPDATE;`,
        [id]
      );
      const target = r1[0];
      if (!target) {
        await client.query("ROLLBACK");
        return { deleted: false };
      }

      await client.query(`DELETE FROM worker_photos WHERE id = $1;`, [id]);

      if (target.is_cover) {
        const { rows: r2 } = await client.query(
          `SELECT id
           FROM worker_photos
           WHERE profile_id = $1
           ORDER BY created_at DESC, id DESC
           LIMIT 1
           FOR UPDATE;`,
          [target.profile_id]
        );
        if (r2[0]) {
          await client.query(`UPDATE worker_photos SET is_cover = true WHERE id = $1;`, [r2[0].id]);
        }
      }

      await client.query("COMMIT");
      return { deleted: true };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async delete(id) {
    const q = `DELETE FROM worker_photos WHERE id = $1 RETURNING id;`;
    const { rows } = await pool.query(q, [id]);
    return rows[0];
  },

  async getByProfile(profileId) {
    const q = `
      SELECT *
      FROM worker_photos
      WHERE profile_id = $1
      ORDER BY is_cover DESC, created_at DESC, id DESC;
    `;
    const { rows } = await pool.query(q, [profileId]);
    return rows;
  },
  async updateById(id, { is_cover, caption }) {
    const q = `
      UPDATE worker_photos
      SET
        is_cover = COALESCE($2, is_cover),
        caption  = COALESCE($3, caption)
      WHERE id = $1
      RETURNING *;
    `;
    const { rows } = await pool.query(q, [id, is_cover ?? null, caption ?? null]);
    return rows[0];
  },

  async setCover(id) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows: r1 } = await client.query(
        `SELECT id, profile_id FROM worker_photos WHERE id = $1`,
        [id]
      );
      const row = r1[0];
      if (!row) {
        await client.query("ROLLBACK");
        return null;
      }

      await client.query(
        `UPDATE worker_photos SET is_cover = FALSE WHERE profile_id = $1`,
        [row.profile_id]
      );

      const { rows: r2 } = await client.query(
        `UPDATE worker_photos SET is_cover = TRUE WHERE id = $1 RETURNING *`,
        [id]
      );

      await client.query("COMMIT");
      return r2[0];
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }

};

module.exports = WorkerPhotoModel;
