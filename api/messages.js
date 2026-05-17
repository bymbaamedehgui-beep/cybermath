const pool = require('./_db');

// 1-on-1 чат
// Actions:
//   send         { from, to, text }         → мессеж илгээх
//   conversation { user1, user2, since? }   → 2 хүний хооронд яриа татах
//   unread       { email }                  → шинэ мессеж байгаа эсэхийг шалгах
//   markRead     { email, from }            → from-ийг бичиж дууссан гэх

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        sender_email TEXT NOT NULL,
        receiver_email TEXT NOT NULL,
        text TEXT NOT NULL,
        read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cm_pair ON chat_messages(sender_email, receiver_email, id DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cm_unread ON chat_messages(receiver_email, read)`).catch(()=>{});

    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    const action = body.action;

    if (action === 'send') {
      const from = String(body.from || '').toLowerCase();
      const to = String(body.to || '').toLowerCase();
      const text = String(body.text || '').slice(0, 2000).trim();
      if (!from || !to || !text || from === to) return res.status(400).json({ ok: false, error: 'Missing fields' });
      // Найз эсэхийг шалгах
      const fr = await pool.query(
        `SELECT 1 FROM friendships WHERE status='accepted' AND ((requester_email=$1 AND receiver_email=$2) OR (requester_email=$2 AND receiver_email=$1))`,
        [from, to]
      );
      if (!fr.rows.length) return res.json({ ok: false, error: 'Найз биш байна' });
      const r = await pool.query(
        `INSERT INTO chat_messages (sender_email, receiver_email, text) VALUES ($1, $2, $3) RETURNING id, created_at`,
        [from, to, text]
      );
      return res.json({ ok: true, message: { id: r.rows[0].id, from: from, to: to, text: text, created_at: r.rows[0].created_at, read: false } });
    }

    if (action === 'conversation') {
      const u1 = String(body.user1 || '').toLowerCase();
      const u2 = String(body.user2 || '').toLowerCase();
      const since = body.since ? parseInt(body.since) : 0;
      if (!u1 || !u2) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `SELECT id, sender_email, receiver_email, text, read, created_at
         FROM chat_messages
         WHERE ((sender_email=$1 AND receiver_email=$2) OR (sender_email=$2 AND receiver_email=$1))
           AND ($3::bigint = 0 OR id > $3::bigint)
         ORDER BY id ASC LIMIT 500`,
        [u1, u2, since]
      );
      return res.json({ ok: true, messages: r.rows });
    }

    if (action === 'unread') {
      const email = String(body.email || '').toLowerCase();
      if (!email) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `SELECT sender_email, COUNT(*)::int AS n FROM chat_messages WHERE receiver_email=$1 AND read=false GROUP BY sender_email`,
        [email]
      );
      const map = {};
      r.rows.forEach(function(row){ map[row.sender_email] = row.n; });
      return res.json({ ok: true, unread: map });
    }

    if (action === 'markRead') {
      const email = String(body.email || '').toLowerCase();
      const from = String(body.from || '').toLowerCase();
      if (!email || !from) return res.status(400).json({ ok: false });
      await pool.query(`UPDATE chat_messages SET read=true WHERE receiver_email=$1 AND sender_email=$2 AND read=false`, [email, from]);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[messages]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
