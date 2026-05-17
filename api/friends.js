const pool = require('./_db');

// Найзын систем
// Actions:
//   request  { email, target }              → найзын хүсэлт илгээх
//   accept   { email, requester }           → хүсэлтийг хүлээж авах (би хүлээн авагч)
//   decline  { email, requester }           → татгалзах
//   remove   { email, target }              → найзын холбоог салгах
//   list     { email }                      → найзууд + хүлээгдэж буй хүсэлтүүд
//   search   { email, query }               → нэр/email-ээр хүн хайх (хувийн user-уудаас)

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friendships (
        id BIGSERIAL PRIMARY KEY,
        requester_email TEXT NOT NULL,
        receiver_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(requester_email, receiver_email)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fs_req ON friendships(requester_email)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fs_recv ON friendships(receiver_email)`).catch(()=>{});

    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    const action = body.action;
    const email = body.email ? String(body.email).toLowerCase() : null;
    if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

    if (action === 'request') {
      const target = String(body.target || '').toLowerCase();
      if (!target || target === email) return res.status(400).json({ ok: false, error: 'Invalid target' });
      // Шалгах: target нь user бүртгэлтэй юу
      const u = await pool.query(`SELECT email FROM users WHERE LOWER(email)=$1`, [target]);
      if (!u.rows.length) return res.json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      // Аль хэдийн үүссэн уу
      const ex = await pool.query(
        `SELECT * FROM friendships WHERE (requester_email=$1 AND receiver_email=$2) OR (requester_email=$2 AND receiver_email=$1)`,
        [email, target]
      );
      if (ex.rows.length) {
        const f = ex.rows[0];
        if (f.status === 'accepted') return res.json({ ok: false, error: 'Аль хэдийн найз байна' });
        if (f.requester_email === email) return res.json({ ok: false, error: 'Хүсэлт илгээгдсэн' });
        // Тэр хүн надад илгээсэн → шууд accept хийнэ
        await pool.query(`UPDATE friendships SET status='accepted', updated_at=NOW() WHERE id=$1`, [f.id]);
        return res.json({ ok: true, autoAccepted: true });
      }
      await pool.query(`INSERT INTO friendships (requester_email, receiver_email) VALUES ($1, $2)`, [email, target]);
      return res.json({ ok: true });
    }

    if (action === 'accept' || action === 'decline') {
      const requester = String(body.requester || '').toLowerCase();
      if (!requester) return res.status(400).json({ ok: false });
      if (action === 'accept') {
        const r = await pool.query(
          `UPDATE friendships SET status='accepted', updated_at=NOW() WHERE requester_email=$1 AND receiver_email=$2 AND status='pending' RETURNING id`,
          [requester, email]
        );
        if (!r.rows.length) return res.json({ ok: false, error: 'Not found' });
      } else {
        await pool.query(`DELETE FROM friendships WHERE requester_email=$1 AND receiver_email=$2 AND status='pending'`, [requester, email]);
      }
      return res.json({ ok: true });
    }

    if (action === 'remove') {
      const target = String(body.target || '').toLowerCase();
      await pool.query(
        `DELETE FROM friendships WHERE (requester_email=$1 AND receiver_email=$2) OR (requester_email=$2 AND receiver_email=$1)`,
        [email, target]
      );
      return res.json({ ok: true });
    }

    if (action === 'list') {
      // accepted найзууд
      const friends = await pool.query(
        `SELECT u.email, u.first_name, u.last_name, u.avatar, u.profile_image, u.xp, u.grade
         FROM friendships f
         JOIN users u ON LOWER(u.email) = CASE WHEN f.requester_email=$1 THEN f.receiver_email ELSE f.requester_email END
         WHERE (f.requester_email=$1 OR f.receiver_email=$1) AND f.status='accepted'
         ORDER BY u.xp DESC`,
        [email]
      );
      // Надаас илгээсэн pending
      const sent = await pool.query(
        `SELECT u.email, u.first_name, u.last_name, u.avatar
         FROM friendships f JOIN users u ON LOWER(u.email)=f.receiver_email
         WHERE f.requester_email=$1 AND f.status='pending'`,
        [email]
      );
      // Надад ирсэн pending
      const incoming = await pool.query(
        `SELECT u.email, u.first_name, u.last_name, u.avatar
         FROM friendships f JOIN users u ON LOWER(u.email)=f.requester_email
         WHERE f.receiver_email=$1 AND f.status='pending'`,
        [email]
      );
      return res.json({ ok: true, friends: friends.rows, sent: sent.rows, incoming: incoming.rows });
    }

    if (action === 'search') {
      const q = String(body.query || '').trim().toLowerCase();
      if (q.length < 2) return res.json({ ok: true, users: [] });
      const r = await pool.query(
        `SELECT email, first_name, last_name, avatar, grade, xp
         FROM users
         WHERE LOWER(email) <> $1
           AND (LOWER(email) LIKE $2 OR LOWER(first_name) LIKE $2 OR LOWER(last_name) LIKE $2)
         ORDER BY xp DESC LIMIT 12`,
        [email, '%' + q + '%']
      );
      return res.json({ ok: true, users: r.rows });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[friends]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
