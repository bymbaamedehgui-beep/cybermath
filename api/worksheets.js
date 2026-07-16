// Хэвлэсэн дасгалын багцыг санах (DB). Хаанаас ч хариуг шалгах боломжтой.
const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_sets (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        items JSONB NOT NULL DEFAULT '[]',
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`ALTER TABLE ws_sets ADD COLUMN IF NOT EXISTS note TEXT`).catch(()=>{});

    // GET — жагсаалт эсвэл нэг багц
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const code = req.query.code;
      if (code) {
        const r = await pool.query('SELECT * FROM ws_sets WHERE id=$1', [parseInt(code)]);
        return res.json({ ok: true, set: r.rows[0] || null });
      }
      const r = await pool.query(
        `SELECT id, title, note, created_at, jsonb_array_length(items) AS count
         FROM ws_sets ORDER BY id DESC LIMIT 200`);
      return res.json({ ok: true, sets: r.rows });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'save') {
        const title = String(b.title || 'Дасгал').slice(0, 160);
        const note = b.note ? String(b.note).slice(0, 500) : null;
        const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
        if (!items.length) return res.status(400).json({ ok: false, error: 'Бодлого алга' });
        const r = await pool.query(
          'INSERT INTO ws_sets (title, items, note) VALUES ($1,$2,$3) RETURNING id, created_at',
          [title, JSON.stringify(items), note]
        );
        return res.json({ ok: true, code: r.rows[0].id });
      }
      if (b.action === 'delete') {
        if (!b.code) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_sets WHERE id=$1', [parseInt(b.code)]);
        return res.json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    res.status(405).json({ ok: false });
  } catch (e) {
    console.error('[worksheets]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
