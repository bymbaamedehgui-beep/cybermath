const pool = require('./_db');
const { sendTelegram } = require('./_telegram');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS group_requests (
        id BIGSERIAL PRIMARY KEY,
        type TEXT NOT NULL,
        requester_email TEXT NOT NULL,
        contact_name TEXT,
        phone TEXT,
        school_name TEXT,
        user_count INT NOT NULL DEFAULT 1,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        promo_code TEXT,
        price_quote INT,
        admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gr_status ON group_requests(status, created_at DESC)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_gr_email ON group_requests(LOWER(requester_email))`).catch(()=>{});

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // Хэрэглэгчээс шинэ хүсэлт илгээх
      if (action === 'submit') {
        const { type, email, contact_name, phone, school_name, user_count, note } = body;
        if (!type || !email || !user_count) {
          return res.status(400).json({ ok: false, error: 'Шаардлагатай талбар дутуу' });
        }
        if (['friends', 'school'].indexOf(type) === -1) {
          return res.status(400).json({ ok: false, error: 'Багцын төрөл буруу' });
        }
        const cnt = parseInt(user_count) || 0;
        if (cnt < 2 || cnt > 5000) {
          return res.status(400).json({ ok: false, error: 'Хэрэглэгчийн тоо 2-5000 байх ёстой' });
        }

        const r = await pool.query(
          `INSERT INTO group_requests
           (type, requester_email, contact_name, phone, school_name, user_count, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            type,
            String(email).toLowerCase(),
            contact_name || null,
            phone || null,
            school_name || null,
            cnt,
            note || null,
          ]
        );

        const row = r.rows[0];
        // Telegram админд мэдэгдэх
        const label = type === 'school' ? '🏫 Сургуулийн багц' : '👥 Найзууд багц';
        const msg = [
          `<b>${label}</b> — шинэ хүсэлт #${row.id}`,
          `<b>Илгээгч:</b> ${row.requester_email}`,
          row.contact_name ? `<b>Нэр:</b> ${row.contact_name}` : null,
          row.phone ? `<b>Утас:</b> ${row.phone}` : null,
          row.school_name ? `<b>Сургууль:</b> ${row.school_name}` : null,
          `<b>Хэрэглэгч:</b> ${row.user_count}`,
          row.note ? `<b>Тайлбар:</b> ${row.note}` : null,
        ].filter(Boolean).join('\n');
        sendTelegram(msg).catch(()=>{});

        return res.json({ ok: true, request: row });
      }

      // Хэрэглэгч өөрийн хүсэлтийн статус харах
      if (action === 'myList') {
        const { email } = body;
        if (!email) return res.status(400).json({ ok: false });
        const r = await pool.query(
          `SELECT id, type, user_count, status, promo_code, price_quote, admin_note, created_at, updated_at
           FROM group_requests WHERE LOWER(requester_email)=LOWER($1)
           ORDER BY created_at DESC LIMIT 20`,
          [email]
        );
        return res.json({ ok: true, requests: r.rows });
      }

      // Админ — бүх хүсэлт жагсаалт (filter: status)
      if (action === 'list') {
        const status = body.status || null;
        const r = status
          ? await pool.query('SELECT * FROM group_requests WHERE status=$1 ORDER BY created_at DESC LIMIT 500', [status])
          : await pool.query('SELECT * FROM group_requests ORDER BY created_at DESC LIMIT 500');
        return res.json({ ok: true, requests: r.rows });
      }

      // Админ — хүсэлтэд хариу өгөх (promo код + үнэ + статус)
      if (action === 'quote') {
        const { id, promo_code, price_quote, admin_note, status } = body;
        if (!id) return res.status(400).json({ ok: false });
        const newStatus = status || 'quoted';
        const r = await pool.query(
          `UPDATE group_requests
           SET promo_code=$2, price_quote=$3, admin_note=$4, status=$5, updated_at=NOW()
           WHERE id=$1 RETURNING *`,
          [id, promo_code || null, price_quote || null, admin_note || null, newStatus]
        );
        return res.json({ ok: true, request: r.rows[0] });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM group_requests WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[grouprequest]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
