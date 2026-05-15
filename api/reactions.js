const pool = require('./_db');

// Facebook-маягийн reaction. Хэрэглэгч node бүрт зөвхөн нэг reaction өгөх боломжтой.
// Actions:
//   POST { action: 'get', node_id, email? }              → { ok, counts: {like:N,...}, mine }
//   POST { action: 'getMany', node_ids: [..], email? }   → { ok, items: [{node_id, counts, mine}] }
//   POST { action: 'set', node_id, email, reaction }     → upsert (reaction нь null/'' бол устгана)

const ALLOWED = new Set(['like', 'love', 'haha', 'wow', 'sad', 'angry']);

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS node_reactions (
        id BIGSERIAL PRIMARY KEY,
        node_id INT NOT NULL,
        user_email TEXT NOT NULL,
        reaction TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(node_id, user_email)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_nr_node ON node_reactions(node_id)`).catch(()=>{});

    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    const action = body.action;

    if (action === 'get') {
      const { node_id, email } = body;
      if (!node_id) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `SELECT reaction, COUNT(*)::int AS n FROM node_reactions WHERE node_id=$1 GROUP BY reaction`,
        [parseInt(node_id)]
      );
      const counts = {};
      r.rows.forEach((row) => { counts[row.reaction] = row.n; });
      let mine = null;
      if (email) {
        const m = await pool.query(`SELECT reaction FROM node_reactions WHERE node_id=$1 AND user_email=$2`, [parseInt(node_id), String(email).toLowerCase()]);
        mine = m.rows[0] ? m.rows[0].reaction : null;
      }
      return res.json({ ok: true, counts, mine });
    }

    if (action === 'getMany') {
      const ids = Array.isArray(body.node_ids) ? body.node_ids.map(Number).filter(Number.isFinite) : [];
      if (!ids.length) return res.json({ ok: true, items: [] });
      const email = body.email ? String(body.email).toLowerCase() : null;
      const r = await pool.query(
        `SELECT node_id, reaction, COUNT(*)::int AS n FROM node_reactions WHERE node_id = ANY($1::int[]) GROUP BY node_id, reaction`,
        [ids]
      );
      const byNode = {};
      r.rows.forEach((row) => {
        if (!byNode[row.node_id]) byNode[row.node_id] = {};
        byNode[row.node_id][row.reaction] = row.n;
      });
      let mineByNode = {};
      if (email) {
        const m = await pool.query(
          `SELECT node_id, reaction FROM node_reactions WHERE node_id = ANY($1::int[]) AND user_email=$2`,
          [ids, email]
        );
        m.rows.forEach((row) => { mineByNode[row.node_id] = row.reaction; });
      }
      const items = ids.map((id) => ({
        node_id: id,
        counts: byNode[id] || {},
        mine: mineByNode[id] || null,
      }));
      return res.json({ ok: true, items });
    }

    if (action === 'set') {
      const { node_id, email, reaction } = body;
      if (!node_id || !email) return res.status(400).json({ ok: false });
      const em = String(email).toLowerCase();
      if (!reaction) {
        await pool.query(`DELETE FROM node_reactions WHERE node_id=$1 AND user_email=$2`, [parseInt(node_id), em]);
        return res.json({ ok: true, mine: null });
      }
      if (!ALLOWED.has(reaction)) return res.status(400).json({ ok: false, error: 'invalid reaction' });
      await pool.query(
        `INSERT INTO node_reactions (node_id, user_email, reaction) VALUES ($1, $2, $3)
         ON CONFLICT (node_id, user_email) DO UPDATE SET reaction = EXCLUDED.reaction, updated_at = NOW()`,
        [parseInt(node_id), em, reaction]
      );
      // Return updated counts for this node
      const r = await pool.query(
        `SELECT reaction, COUNT(*)::int AS n FROM node_reactions WHERE node_id=$1 GROUP BY reaction`,
        [parseInt(node_id)]
      );
      const counts = {};
      r.rows.forEach((row) => { counts[row.reaction] = row.n; });
      return res.json({ ok: true, mine: reaction, counts });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[reactions]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
