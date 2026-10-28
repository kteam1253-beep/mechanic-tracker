'use strict';
const fs = require('node:fs');

async function createStorage({url, file, key, defaults, createPool}) {
  const local = () => fs.existsSync(file)
    ? {...defaults(), ...JSON.parse(fs.readFileSync(file, 'utf8'))} : defaults();
  if (!url) return {
    state: local(),
    async save(state) {
      fs.writeFileSync(file + '.tmp', JSON.stringify(state, null, 2));
      fs.renameSync(file + '.tmp', file);
    },
    async close() {},
  };
  const pool = (createPool || require('mysql2/promise').createPool)(url);
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS police_repairs_state (
      guild_id VARCHAR(32) PRIMARY KEY,
      payload JSON NOT NULL,
      revision BIGINT UNSIGNED NOT NULL DEFAULT 0
    )`);
    let [rows] = await pool.execute('SELECT payload, revision FROM police_repairs_state WHERE guild_id = ?', [key]);
    if (!rows.length) {
      await pool.execute('INSERT IGNORE INTO police_repairs_state (guild_id, payload) VALUES (?, ?)', [key, JSON.stringify(local())]);
      [rows] = await pool.execute('SELECT payload, revision FROM police_repairs_state WHERE guild_id = ?', [key]);
    }
    let revision = rows[0].revision;
    const payload = rows[0].payload;
    const state = {...defaults(), ...(typeof payload === 'string' ? JSON.parse(payload) : payload)};
    let pending = Promise.resolve();
    return {
      state,
      save(value) {
        const snapshot = JSON.stringify(value);
        // Preserve write order. A failed write blocks later snapshots until restart.
        pending = pending.then(async () => {
          const [result] = await pool.execute(
            'UPDATE police_repairs_state SET payload = ?, revision = revision + 1 WHERE guild_id = ? AND revision = ?',
            [snapshot, key, revision]);
          if (result.affectedRows !== 1) throw new Error('Druga instanca bota promijenila je podatke. Pokreni samo jednu repliku.');
          revision = Number(revision) + 1;
        });
        return pending;
      },
      async close() { try { await pending; } finally { await pool.end(); } },
    };
  } catch (error) {
    await pool.end();
    throw error;
  }
}
module.exports = {createStorage};
