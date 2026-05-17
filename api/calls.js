const pool = require('./_db');

// WebRTC signaling — DB-аар offer/answer/ICE дамжуулна.
// Аудио бодит урсгал нь peer-to-peer тул DB-руу очдоггүй.
//
// Actions:
//   signal  { from, to, type, payload }       → дохио үлдээх
//   poll    { email, since? }                 → надад зориулсан шинэ дохиог татна
//   end     { from, to }                      → дуудлагын төгсгөл

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS call_signals (
        id BIGSERIAL PRIMARY KEY,
        from_email TEXT NOT NULL,
        to_email TEXT NOT NULL,
        type TEXT NOT NULL,
        payload JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cs_to ON call_signals(to_email, id DESC)`).catch(()=>{});
    // 1 минутаас өмнөх дохиог цэвэрлэх (cleanup)
    await pool.query(`DELETE FROM call_signals WHERE created_at < NOW() - INTERVAL '2 minutes'`).catch(()=>{});

    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    const action = body.action;

    if (action === 'signal') {
      const from = String(body.from || '').toLowerCase();
      const to = String(body.to || '').toLowerCase();
      const type = String(body.type || '');
      if (!from || !to || !type) return res.status(400).json({ ok: false });
      const payload = body.payload || null;
      const r = await pool.query(
        `INSERT INTO call_signals (from_email, to_email, type, payload) VALUES ($1, $2, $3, $4) RETURNING id`,
        [from, to, type, payload ? JSON.stringify(payload) : null]
      );
      return res.json({ ok: true, id: r.rows[0].id });
    }

    if (action === 'poll') {
      const email = String(body.email || '').toLowerCase();
      const since = body.since ? parseInt(body.since) : 0;
      if (!email) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `SELECT id, from_email, to_email, type, payload, created_at
         FROM call_signals
         WHERE to_email=$1 AND ($2::bigint = 0 OR id > $2::bigint)
         ORDER BY id ASC LIMIT 100`,
        [email, since]
      );
      // Татсаны дараа устгана (one-shot signal)
      const ids = r.rows.map(x => x.id);
      if (ids.length) {
        await pool.query(`DELETE FROM call_signals WHERE id = ANY($1::bigint[])`, [ids]).catch(()=>{});
      }
      return res.json({ ok: true, signals: r.rows });
    }

    if (action === 'end') {
      const from = String(body.from || '').toLowerCase();
      const to = String(body.to || '').toLowerCase();
      if (!from || !to) return res.status(400).json({ ok: false });
      await pool.query(
        `INSERT INTO call_signals (from_email, to_email, type) VALUES ($1, $2, 'end')`,
        [from, to]
      );
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[calls]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
