const pool = require('./_db');

// "Үзэгчид" lifeline — Мянгат тоглоомын аль ч хэрэглэгч идэвхтэй хэрэглэгчдээс
// 30 секундын дотор санал асууж болдог. Хариулт бүрийг 0-3 индексээр өгнө.
//
// Actions:
//   create  { email, question, options } → { ok, pollId, expiresAt }
//   active  { email }                    → { ok, poll | null }      (бусдын идэвхтэй санал асуулга)
//   vote    { email, pollId, optionIdx } → { ok }
//   result  { pollId }                   → { ok, votes, totalVotes, expiresAt }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audience_polls (
        id BIGSERIAL PRIMARY KEY,
        asker_email TEXT NOT NULL,
        question TEXT NOT NULL,
        options JSONB NOT NULL,
        votes JSONB NOT NULL DEFAULT '[0,0,0,0]'::jsonb,
        voters JSONB NOT NULL DEFAULT '[]'::jsonb,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ap_expires ON audience_polls(expires_at DESC)`).catch(()=>{});

    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    const action = body.action;

    if (action === 'create') {
      const { email, question, options } = body;
      if (!email || !question || !Array.isArray(options) || options.length !== 4) {
        return res.status(400).json({ ok: false, error: 'Missing fields' });
      }
      // Хуучин идэвхтэй санал асуулгуудаа дуусгана (нэг asker нэг л идэвхтэй санал асуулгатай)
      await pool.query(`UPDATE audience_polls SET expires_at=NOW() WHERE asker_email=$1 AND expires_at > NOW()`, [email]);
      const r = await pool.query(
        `INSERT INTO audience_polls (asker_email, question, options, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 seconds') RETURNING id, expires_at`,
        [email, String(question).slice(0, 1500), JSON.stringify(options.slice(0, 4).map(o => String(o).slice(0, 500)))]
      );
      return res.json({ ok: true, pollId: r.rows[0].id, expiresAt: r.rows[0].expires_at });
    }

    if (action === 'active') {
      const { email } = body;
      // Бусдын идэвхтэй санал асуулгыг сонгох (хэрэв нэвтэрсэн бол өөрийгөө хасна, мөн саналаа өгөгсдийг хасна)
      const r = await pool.query(
        `SELECT id, asker_email, question, options, expires_at
         FROM audience_polls
         WHERE expires_at > NOW()
           AND ($1::text IS NULL OR asker_email <> $1)
           AND ($1::text IS NULL OR NOT (voters::jsonb ? $1))
         ORDER BY id DESC LIMIT 1`,
        [email || null]
      );
      if (!r.rows.length) return res.json({ ok: true, poll: null });
      return res.json({ ok: true, poll: r.rows[0] });
    }

    if (action === 'vote') {
      const { email, pollId, optionIdx } = body;
      const idx = parseInt(optionIdx);
      if (!email || !pollId || isNaN(idx) || idx < 0 || idx > 3) return res.status(400).json({ ok: false });
      // Atomic increment + voter-list append, only if not yet voted and not expired
      const r = await pool.query(
        `UPDATE audience_polls
         SET votes = jsonb_set(votes, ARRAY[$2::text], to_jsonb((votes->>$2)::int + 1)),
             voters = voters || to_jsonb($3::text)
         WHERE id=$1 AND expires_at > NOW() AND NOT (voters::jsonb ? $3)
         RETURNING id`,
        [pollId, String(idx), email]
      );
      if (!r.rows.length) return res.json({ ok: false, error: 'already voted or expired' });
      return res.json({ ok: true });
    }

    if (action === 'result') {
      const { pollId } = body;
      if (!pollId) return res.status(400).json({ ok: false });
      const r = await pool.query(`SELECT votes, voters, expires_at FROM audience_polls WHERE id=$1`, [pollId]);
      if (!r.rows.length) return res.status(404).json({ ok: false });
      const votes = r.rows[0].votes;
      const voters = r.rows[0].voters || [];
      const total = Array.isArray(votes) ? votes.reduce((a, b) => a + (parseInt(b) || 0), 0) : 0;
      return res.json({ ok: true, votes, totalVotes: total, voters: voters.length, expiresAt: r.rows[0].expires_at });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[audience]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
