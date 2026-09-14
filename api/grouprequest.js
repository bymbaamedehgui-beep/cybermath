const pool = require('./_db');
const { sendTelegram } = require('./_telegram');
const { secretMissing, requireAdmin, requireUser, rateLimit, clientIp } = require('./_guard');

// Telegram HTML parse_mode-д хэрэглэгчийн текстийг escape хийнэ
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function clip(v, n) { return v == null || v === '' ? null : String(v).slice(0, n); }

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (secretMissing(res)) return;
    const body = req.body || {};
    const action = body.action;

    // Эрхийн шалгалт — хүснэгт үүсгэхээс ӨМНӨ
    if ((req.method === 'POST' && (action === 'list' || action === 'quote')) || req.method === 'DELETE') {
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
    }
    let me = null;
    if (req.method === 'POST' && action === 'myList') {
      me = requireUser(req);
      if (!me) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
    }

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
      // Хэрэглэгчээс шинэ хүсэлт илгээх (нэвтрэлтгүй хэвээр, IP/имэйлээр хязгаарлана)
      if (action === 'submit') {
        const { type, email, contact_name, phone, school_name, user_count, note } = body;
        if (!type || !email || !user_count) {
          return res.status(400).json({ ok: false, error: 'Шаардлагатай талбар дутуу' });
        }
        if (['friends', 'school'].indexOf(type) === -1) {
          return res.status(400).json({ ok: false, error: 'Багцын төрөл буруу' });
        }
        const cleanEmail = String(email).trim().toLowerCase();
        if (cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
          return res.status(400).json({ ok: false, error: 'Имэйл буруу' });
        }
        const cnt = parseInt(user_count) || 0;
        if (cnt < 2 || cnt > 5000) {
          return res.status(400).json({ ok: false, error: 'Хэрэглэгчийн тоо 2-5000 байх ёстой' });
        }
        const okIp = await rateLimit('gr:ip:' + clientIp(req), 5, 3600);
        const okEm = okIp && await rateLimit('gr:em:' + cleanEmail, 3, 3600);
        if (!okIp || !okEm) {
          return res.status(429).json({ ok: false, error: 'Хэт олон хүсэлт. Түр хүлээгээд дахин оролдоно уу.' });
        }

        const r = await pool.query(
          `INSERT INTO group_requests
           (type, requester_email, contact_name, phone, school_name, user_count, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [
            type,
            cleanEmail,
            clip(contact_name, 100),
            clip(phone, 30),
            clip(school_name, 200),
            cnt,
            clip(note, 1000),
          ]
        );

        const row = r.rows[0];
        // Telegram админд мэдэгдэх
        const label = type === 'school' ? 'Сургуулийн багц' : 'Найзууд багц';
        const msg = [
          `<b>${label}</b> — шинэ хүсэлт #${row.id}`,
          `<b>Илгээгч:</b> ${esc(row.requester_email)}`,
          row.contact_name ? `<b>Нэр:</b> ${esc(row.contact_name)}` : null,
          row.phone ? `<b>Утас:</b> ${esc(row.phone)}` : null,
          row.school_name ? `<b>Сургууль:</b> ${esc(row.school_name)}` : null,
          `<b>Хэрэглэгч:</b> ${row.user_count}`,
          row.note ? `<b>Тайлбар:</b> ${esc(row.note)}` : null,
        ].filter(Boolean).join('\n');
        sendTelegram(msg).catch(()=>{});

        return res.json({ ok: true, request: row });
      }

      // Хэрэглэгч өөрийн хүсэлтийн статус харах — имэйлийг токеноос (promo_code агуулдаг тул)
      if (action === 'myList') {
        const r = await pool.query(
          `SELECT id, type, user_count, status, promo_code, price_quote, admin_note, created_at, updated_at
           FROM group_requests WHERE LOWER(requester_email)=LOWER($1)
           ORDER BY created_at DESC LIMIT 20`,
          [me.email]
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
        // promo_codes-д байхгүй кодыг хэрэглэгчид өгөхгүй ("Код буруу" гарахаас сэргийлнэ)
        if (promo_code) {
          const pc = await pool.query('SELECT 1 FROM promo_codes WHERE UPPER(code)=UPPER($1) LIMIT 1', [String(promo_code).trim()])
            .catch(() => ({ rows: [] }));
          if (!pc.rows.length) return res.status(400).json({ ok: false, error: 'Промо код promo_codes-д олдсонгүй. Эхлээд кодыг үүсгэнэ үү.' });
        }
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
      const { id } = body;
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
