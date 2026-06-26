// SUMMER CAMP — бүртгэлийн API. Neon Postgres дээр camp_registrations хүснэгт.
// Хэрэглэгч бүртгэл илгээх (public) + админ удирдах (нууц үгээр).
const pool = require('./_db');
const { sendTelegram } = require('./_telegram');

const ADMIN_PASS = process.env.CAMP_ADMIN_PASS || 'mathtour2026';
const STATUSES = ['new', 'contacted', 'confirmed', 'paid', 'cancelled'];

function isAdmin(body) {
  return body && typeof body.pass === 'string' && body.pass === ADMIN_PASS;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS camp_registrations (
        id BIGSERIAL PRIMARY KEY,
        child_name TEXT NOT NULL,
        grade TEXT,
        parent_name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        stream TEXT,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        admin_note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_camp_status ON camp_registrations(status, created_at DESC)`).catch(()=>{});

    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    const body = req.body || {};
    const action = body.action;

    // ---- Хэрэглэгч: шинэ бүртгэл илгээх (нээлттэй) ----
    if (action === 'submit') {
      const { child, grade, parent, phone, email, stream, note } = body;
      if (!child || !parent || !phone) {
        return res.status(400).json({ ok: false, error: 'Нэр, эцэг эх, утас шаардлагатай' });
      }
      const r = await pool.query(
        `INSERT INTO camp_registrations (child_name, grade, parent_name, phone, email, stream, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, created_at`,
        [
          String(child).slice(0, 120),
          grade ? String(grade).slice(0, 40) : null,
          String(parent).slice(0, 120),
          String(phone).slice(0, 40),
          email ? String(email).slice(0, 120) : null,
          stream ? String(stream).slice(0, 80) : null,
          note ? String(note).slice(0, 1000) : null,
        ]
      );
      const row = r.rows[0];
      const msg = [
        `<b>🏕 SUMMER CAMP — шинэ бүртгэл</b> #${row.id}`,
        `<b>Сурагч:</b> ${child} (${grade || '-'})`,
        `<b>Эцэг эх:</b> ${parent}`,
        `<b>Утас:</b> ${phone}`,
        email ? `<b>И-мэйл:</b> ${email}` : null,
        stream ? `<b>Ээлж:</b> ${stream}` : null,
        note ? `<b>Тэмдэглэл:</b> ${note}` : null,
      ].filter(Boolean).join('\n');
      sendTelegram(msg).catch(()=>{});
      return res.json({ ok: true, id: row.id });
    }

    // ---- Админ үйлдлүүд (нууц үг шаардана) ----
    if (action === 'login') {
      return res.json({ ok: isAdmin(body) });
    }

    if (!isAdmin(body)) {
      return res.status(401).json({ ok: false, error: 'Нэвтрэх эрхгүй' });
    }

    if (action === 'list') {
      const status = body.status && STATUSES.indexOf(body.status) !== -1 ? body.status : null;
      const r = status
        ? await pool.query('SELECT * FROM camp_registrations WHERE status=$1 ORDER BY created_at DESC LIMIT 1000', [status])
        : await pool.query('SELECT * FROM camp_registrations ORDER BY created_at DESC LIMIT 1000');
      // статусын тоо
      const stats = await pool.query(`SELECT status, COUNT(*)::int AS c FROM camp_registrations GROUP BY status`);
      return res.json({ ok: true, items: r.rows, stats: stats.rows });
    }

    if (action === 'setStatus') {
      const { id, status, admin_note } = body;
      if (!id || STATUSES.indexOf(status) === -1) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `UPDATE camp_registrations SET status=$2, admin_note=COALESCE($3, admin_note), updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [id, status, admin_note ?? null]
      );
      return res.json({ ok: true, item: r.rows[0] });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM camp_registrations WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[camp]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
