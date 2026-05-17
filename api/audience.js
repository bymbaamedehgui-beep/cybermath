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
    // Хуучин схемийн NULL утгуудыг засах migration (idempotent)
    await pool.query(`ALTER TABLE audience_polls ALTER COLUMN votes SET DEFAULT '[0,0,0,0]'::jsonb`).catch(()=>{});
    await pool.query(`ALTER TABLE audience_polls ALTER COLUMN voters SET DEFAULT '[]'::jsonb`).catch(()=>{});
    await pool.query(`UPDATE audience_polls SET votes='[0,0,0,0]'::jsonb WHERE votes IS NULL`).catch(()=>{});
    await pool.query(`UPDATE audience_polls SET voters='[]'::jsonb WHERE voters IS NULL`).catch(()=>{});
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
      // slice хязгаарыг өргөн (KaTeX HTML 1 фракц ~800 char-тай тул өмнө нь тасрах байсан)
      const r = await pool.query(
        `INSERT INTO audience_polls (asker_email, question, options, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '60 seconds') RETURNING id, expires_at`,
        [email, String(question).slice(0, 50000), JSON.stringify(options.slice(0, 4).map(o => String(o).slice(0, 10000)))]
      );
      return res.json({ ok: true, pollId: r.rows[0].id, expiresAt: r.rows[0].expires_at });
    }

    if (action === 'active') {
      const emailLc = body.email ? String(body.email).toLowerCase() : null;
      // Бусдын идэвхтэй санал асуулгыг сонгох (хэрэв нэвтэрсэн бол өөрийгөө хасна, мөн саналаа өгөгсдийг хасна)
      const r = await pool.query(
        `SELECT id, asker_email, question, options, expires_at
         FROM audience_polls
         WHERE expires_at > NOW()
           AND ($1::text IS NULL OR LOWER(asker_email) <> $1)
           AND ($1::text IS NULL OR NOT (voters::jsonb ? $1))
         ORDER BY id DESC LIMIT 1`,
        [emailLc]
      );
      if (!r.rows.length) return res.json({ ok: true, poll: null });
      return res.json({ ok: true, poll: r.rows[0] });
    }

    if (action === 'vote') {
      const { email, pollId, optionIdx } = body;
      const idx = parseInt(optionIdx);
      if (!email) return res.status(400).json({ ok: false, error: 'Нэвтрэн орно уу' });
      if (!pollId) return res.status(400).json({ ok: false, error: 'pollId дутуу' });
      if (isNaN(idx) || idx < 0 || idx > 3) return res.status(400).json({ ok: false, error: 'optionIdx буруу' });
      const emailLc = String(email).toLowerCase();
      // SELECT current state
      const cur = await pool.query(
        `SELECT votes, voters, expires_at < NOW() AS expired FROM audience_polls WHERE id=$1`,
        [pollId]
      );
      if (!cur.rows.length) return res.json({ ok: false, error: 'Санал асуулга олдсонгүй' });
      if (cur.rows[0].expired) return res.json({ ok: false, error: 'Хугацаа дууссан' });
      let votes = cur.rows[0].votes;
      let voters = cur.rows[0].voters;
      if (typeof votes === 'string') { try { votes = JSON.parse(votes); } catch (_) { votes = null; } }
      if (typeof voters === 'string') { try { voters = JSON.parse(voters); } catch (_) { voters = null; } }
      if (!Array.isArray(votes) || votes.length !== 4) votes = [0, 0, 0, 0];
      if (!Array.isArray(voters)) voters = [];
      if (voters.includes(emailLc)) return res.json({ ok: false, error: 'Та аль хэдийн санал өгсөн' });
      votes[idx] = (parseInt(votes[idx]) || 0) + 1;
      voters.push(emailLc);
      const upd = await pool.query(
        `UPDATE audience_polls SET votes=$1::jsonb, voters=$2::jsonb WHERE id=$3 AND expires_at > NOW() RETURNING id`,
        [JSON.stringify(votes), JSON.stringify(voters), pollId]
      );
      if (!upd.rows.length) return res.json({ ok: false, error: 'Бүртгэгдэхэд алдаа гарлаа' });
      return res.json({ ok: true });
    }

    if (action === 'result') {
      const { pollId } = body;
      if (!pollId) return res.status(400).json({ ok: false });
      const r = await pool.query(`SELECT votes, voters, expires_at FROM audience_polls WHERE id=$1`, [pollId]);
      if (!r.rows.length) return res.status(404).json({ ok: false });
      // Defensive: pg jsonb-уудыг string-аар буцаах магадлал бий, JSON parse хийе
      let votes = r.rows[0].votes;
      let voters = r.rows[0].voters;
      if (typeof votes === 'string') { try { votes = JSON.parse(votes); } catch (_) { votes = [0,0,0,0]; } }
      if (typeof voters === 'string') { try { voters = JSON.parse(voters); } catch (_) { voters = []; } }
      if (!Array.isArray(votes)) votes = [0,0,0,0];
      if (!Array.isArray(voters)) voters = [];
      // votes-ийн утгуудыг тоо болгож хатуу tab-руу хөрвүүлэх
      votes = votes.map(v => parseInt(v) || 0);
      const total = votes.reduce((a, b) => a + b, 0);
      return res.json({ ok: true, votes, totalVotes: total, voters: voters.length, expiresAt: r.rows[0].expires_at });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[audience]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
