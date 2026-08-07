// Хэвлэсэн дасгалын багцыг санах (DB). Хаанаас ч хариуг шалгах боломжтой.
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sendVerifyEmail, sendFeedbackReply } = require('./_email');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

// Дасгалын төвийн нэвтрэлт — имэйл + нууц үг + баталгаажуулах код (тусдаа ws_login)
function wsSign(email) { return jwt.sign({ email: String(email).toLowerCase(), ws: true }, JWT_SECRET, { expiresIn: '400d' }); }
function wsEmailFromToken(t) { try { const d = jwt.verify(String(t || ''), JWT_SECRET); return (d && d.ws && d.email) ? String(d.email).toLowerCase() : null; } catch (e) { return null; } }
// Санал хүсэлтийн мөрүүдэд харилцан ярианы thread-ийг нэг багц query-ээр хавсаргана
async function attachThreads(rows) {
  const ids = rows.map(f => f.id);
  let byFb = {};
  if (ids.length) {
    const m = await pool.query('SELECT fb_id, sender, text, created_at FROM ws_feedback_msg WHERE fb_id = ANY($1) ORDER BY created_at ASC', [ids]);
    m.rows.forEach(x => { (byFb[x.fb_id] = byFb[x.fb_id] || []).push({ sender: x.sender, text: x.text, at: x.created_at }); });
  }
  return rows.map(f => {
    let thread = byFb[f.id] || [];
    if (thread.length === 0 && f.reply) thread = [{ sender: 'admin', text: f.reply, at: f.replied_at }]; // хуучин ганц reply
    return { id: f.id, message: f.message, contact: f.contact, created_at: f.created_at, replied_at: f.replied_at, thread };
  });
}
function gen6() { return Math.floor(100000 + Math.random() * 900000).toString(); }
async function ensureWsLogin() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_login (
    email TEXT PRIMARY KEY,
    pass_hash TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    code TEXT,
    code_exp TIMESTAMPTZ,
    name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS name TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS phone TEXT`).catch(()=>{});
}

// Зөвхөн админы JWT (admin:true) эсэхийг шалгах
function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const d = jwt.verify(auth.slice(7), JWT_SECRET);
    return !!(d && d.admin);
  } catch (e) { return false; }
}

// Санал хүсэлт ирэхэд Telegram-аар мэдэгдэх (env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    return await r.json();   // { ok, result: { message_id, ... } }
  } catch (e) { console.error('[telegram]', e.message); return null; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
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
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_titles (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_hidden (
        slug TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_order (
        grp TEXT NOT NULL,
        slug TEXT NOT NULL,
        pos INT NOT NULL,
        PRIMARY KEY (grp, slug)
      )`);
    // Сэдвийг анги хооронд зөөх / хувилах — байршлын өөрчлөлт
    // kind='add'  → тухайн бүлэгт нэмж байрлуулсан (зөөсний очих тал эсвэл хувилсан)
    // kind='remove' → эх бүлгээс хассан (зөөсний гарах тал)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_place (
        grp TEXT NOT NULL,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (grp, slug, kind)
      )`);
    // Багшийн 4 оронтой PIN (имэйлээр) — тэмдэглэл устгах эрх
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_pins (
        email TEXT PRIMARY KEY,
        pin TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Хэрэглэгчийн санал хүсэлт
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_feedback (
        id BIGSERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        contact TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`ALTER TABLE ws_feedback ADD COLUMN IF NOT EXISTS reply TEXT`);
    await pool.query(`ALTER TABLE ws_feedback ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE ws_feedback ADD COLUMN IF NOT EXISTS tg_msg_id BIGINT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_feedback_msg (
      id BIGSERIAL PRIMARY KEY,
      fb_id BIGINT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fbmsg_fb ON ws_feedback_msg(fb_id)`);
    // Тохиргоо (announce гэх мэт key/value)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_settings (
        skey TEXT PRIMARY KEY,
        sval TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);

    // GET — жагсаалт эсвэл нэг багц эсвэл сэдвийн нэр/нуусан/дараалал
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (req.query.titles) {
        const r = await pool.query('SELECT slug, title FROM ws_titles');
        const map = {};
        r.rows.forEach(x => { map[x.slug] = x.title; });
        const h = await pool.query('SELECT slug FROM ws_hidden');
        const o = await pool.query('SELECT grp, slug FROM ws_order ORDER BY grp, pos');
        const order = {};
        o.rows.forEach(x => { (order[x.grp] = order[x.grp] || []).push(x.slug); });
        const p = await pool.query('SELECT grp, slug, kind FROM ws_place');
        const place = { add: {}, remove: {} };
        p.rows.forEach(x => {
          const bucket = x.kind === 'remove' ? place.remove : place.add;
          (bucket[x.grp] = bucket[x.grp] || []).push(x.slug);
        });
        const ann = await pool.query(`SELECT sval FROM ws_settings WHERE skey='announce'`);
        const announce = ann.rows.length ? (ann.rows[0].sval || '') : '';
        return res.json({ ok: true, titles: map, hidden: h.rows.map(x => x.slug), order: order, place: place, announce: announce });
      }
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

      // ── Дасгалын төвийн нэвтрэлт: бүртгэл → код → баталгаажуулах → нэвтрэх ──
      if (['ws_register','ws_verify','ws_login','ws_resend','ws_forgot','ws_reset'].indexOf(b.action) >= 0) {
        await ensureWsLogin();
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Зөв имэйл оруулна уу' });

        if (b.action === 'ws_login') {
          const r = await pool.query('SELECT pass_hash, verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, notFound: true, error: 'Бүртгэлгүй имэйл' });
          const okp = await bcrypt.compare(String(b.pass || ''), r.rows[0].pass_hash);
          if (!okp) return res.status(401).json({ ok: false, error: 'Нууц үг буруу' });
          if (!r.rows[0].verified) return res.status(403).json({ ok: false, needVerify: true, error: 'Имэйл баталгаажаагүй' });
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_register') {
          const pass = String(b.pass || '');
          const name = b.name ? String(b.name).trim().slice(0, 80) : null;
          const phone = b.phone ? String(b.phone).trim().slice(0, 20) : null;
          if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });
          const ex = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]);
          if (ex.rows.length && ex.rows[0].verified) return res.status(400).json({ ok: false, existed: true, error: 'Энэ имэйл бүртгэлтэй байна. Нэвтэрнэ үү.' });
          const code = gen6(), exp = new Date(Date.now() + 10 * 60 * 1000), hash = await bcrypt.hash(pass, 10);
          await pool.query(
            `INSERT INTO ws_login (email, pass_hash, verified, code, code_exp, name, phone) VALUES ($1,$2,FALSE,$3,$4,$5,$6)
             ON CONFLICT (email) DO UPDATE SET pass_hash=EXCLUDED.pass_hash, code=EXCLUDED.code, code_exp=EXCLUDED.code_exp, name=EXCLUDED.name, phone=EXCLUDED.phone`,
            [email, hash, code, exp.toISOString(), name, phone]);
          try { await sendVerifyEmail(email, code, name || ''); } catch (e) { console.error('[ws mail]', e.message); }
          return res.json({ ok: true, needVerify: true });
        }
        if (b.action === 'ws_forgot') {
          const r = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Бүртгэлгүй имэйл' });
          const code = gen6(), exp = new Date(Date.now() + 10 * 60 * 1000);
          await pool.query('UPDATE ws_login SET code=$2, code_exp=$3 WHERE email=$1', [email, code, exp.toISOString()]);
          try { await sendVerifyEmail(email, code, ''); } catch (e) {}
          return res.json({ ok: true });
        }
        if (b.action === 'ws_reset') {
          const pass = String(b.pass || '');
          if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });
          const r = await pool.query('SELECT code, code_exp FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Бүртгэлгүй' });
          if (String(r.rows[0].code) !== String(b.code || '')) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
          if (new Date(r.rows[0].code_exp) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
          const hash = await bcrypt.hash(pass, 10);
          await pool.query('UPDATE ws_login SET pass_hash=$2, verified=TRUE, code=NULL WHERE email=$1', [email, hash]);
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_verify') {
          const r = await pool.query('SELECT code, code_exp, verified, name, phone FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
          if (r.rows[0].verified) return res.json({ ok: true, token: wsSign(email), email: email });
          if (String(r.rows[0].code) !== String(b.code || '')) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
          if (new Date(r.rows[0].code_exp) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
          await pool.query('UPDATE ws_login SET verified=TRUE, code=NULL WHERE email=$1', [email]);
          // Шинэ хэрэглэгч бүртгүүлсэн — Telegram мэдэгдэл
          try {
            const u = r.rows[0];
            const msg = '🆕 <b>Дасгалын төв — шинэ бүртгэл</b>\n\n'
              + '👤 ' + (u.name || '(нэргүй)') + '\n'
              + '📧 ' + email + (u.phone ? ('\n📱 ' + u.phone) : '');
            sendTelegram(msg).catch(() => {});
          } catch (e) {}
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_resend') {
          const r = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Бүртгэлгүй' });
          if (r.rows[0].verified) return res.json({ ok: true, alreadyVerified: true });
          const code = gen6(), exp = new Date(Date.now() + 10 * 60 * 1000);
          await pool.query('UPDATE ws_login SET code=$2, code_exp=$3 WHERE email=$1', [email, code, exp.toISOString()]);
          try { await sendVerifyEmail(email, code, ''); } catch (e) {}
          return res.json({ ok: true, needVerify: true });
        }
      }

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
      // Дасгалын төвийн нэгдсэн 4 оронтой PIN — тэмдэглэл устгах эрх (нэг удаа үүсгэнэ)
      const WS_PIN_KEY = '*';
      if (b.action === 'pinStatus') {
        const r = await pool.query('SELECT 1 FROM ws_pins WHERE email=$1', [WS_PIN_KEY]);
        return res.json({ ok: true, hasPin: r.rows.length > 0 });
      }
      if (b.action === 'setPin') {
        const pin = String(b.pin || '');
        if (!/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: '4 оронтой PIN оруулна уу' });
        const ex = await pool.query('SELECT pin FROM ws_pins WHERE email=$1', [WS_PIN_KEY]);
        if (ex.rows.length) return res.json({ ok: true, existed: true });   // нэг удаа үүсгэнэ
        await pool.query('INSERT INTO ws_pins (email, pin) VALUES ($1,$2)', [WS_PIN_KEY, pin]);
        return res.json({ ok: true, created: true });
      }
      if (b.action === 'delete') {
        if (!b.code) return res.status(400).json({ ok: false });
        // PIN заавал шаардана (админ ч мөн адил)
        const pin = String(b.pin || '');
        if (!/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN шаардлагатай' });
        const pr = await pool.query('SELECT pin FROM ws_pins WHERE email=$1', [WS_PIN_KEY]);
        if (!pr.rows.length || pr.rows[0].pin !== pin) return res.status(403).json({ ok: false, error: 'PIN буруу байна' });
        await pool.query('DELETE FROM ws_sets WHERE id=$1', [parseInt(b.code)]);
        return res.json({ ok: true });
      }
      // Санал хүсэлт — нээлттэй (Telegram-аар мэдэгдэнэ)
      if (b.action === 'feedback') {
        const message = String(b.message || '').trim().slice(0, 2000);
        const contact = b.contact ? String(b.contact).trim().slice(0, 160) : null;
        if (message.length < 2) return res.status(400).json({ ok: false, error: 'Санал хүсэлтээ бичнэ үү' });
        const ins = await pool.query('INSERT INTO ws_feedback (message, contact) VALUES ($1,$2) RETURNING id', [message, contact]);
        const fbId = ins.rows[0].id;
        const tg = '📩 <b>CyberMath — Шинэ санал хүсэлт</b>\n\n' + message +
          (contact ? ('\n\n👤 ' + contact) : '') +
          '\n\n<i>↩ Энэ мессежид Reply бичвэл хэрэглэгчид имэйлээр хариу очно</i>';
        const tgRes = await sendTelegram(tg);
        const mid = tgRes && tgRes.result && tgRes.result.message_id;
        if (mid) { try { await pool.query('UPDATE ws_feedback SET tg_msg_id=$2 WHERE id=$1', [fbId, mid]); } catch (e) {} }
        return res.json({ ok: true });
      }
      // Хэрэглэгч өөрийн явуулсан хүсэлт + админы хариуг харах (нэвтэрсэн хэрэглэгч)
      if (b.action === 'feedback_mine') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.json({ ok: true, feedback: [] });
        const r = await pool.query(
          'SELECT id, message, contact, reply, replied_at, created_at FROM ws_feedback WHERE lower(contact)=$1 ORDER BY created_at DESC LIMIT 50',
          [email]);
        return res.json({ ok: true, feedback: await attachThreads(r.rows) });
      }
      // Хэрэглэгч өөрийн санал хүсэлтэд нэмэлт зурвас бичих (нэвтэрсэн)
      if (b.action === 'feedback_add') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const id = parseInt(b.id, 10);
        const text = String(b.text || '').trim().slice(0, 2000);
        if (!id || text.length < 1) return res.status(400).json({ ok: false, error: 'Зурвасаа бичнэ үү' });
        const r = await pool.query('SELECT id FROM ws_feedback WHERE id=$1 AND lower(contact)=$2', [id, email]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
        await pool.query('INSERT INTO ws_feedback_msg (fb_id, sender, text) VALUES ($1,$2,$3)', [id, 'user', text]);
        const tg = '💬 <b>Хэрэглэгчийн шинэ зурвас</b> (' + email + ')\n\n' + text +
          '\n\n<i>↩ Энэ мессежид Reply бичээд хариулна уу</i>';
        const tr = await sendTelegram(tg);
        const mid = tr && tr.result && tr.result.message_id;
        if (mid) { try { await pool.query('UPDATE ws_feedback SET tg_msg_id=$2 WHERE id=$1', [id, mid]); } catch (e) {} }
        return res.json({ ok: true });
      }
      // Мэдээллийн зурвас (announce) авах — нээлттэй
      if (b.action === 'getAnnounce') {
        const r = await pool.query(`SELECT sval FROM ws_settings WHERE skey='announce'`);
        return res.json({ ok: true, announce: r.rows.length ? (r.rows[0].sval || '') : '' });
      }
      // Мэдээлэл тохируулах + санал хүсэлт харах — ЗӨВХӨН АДМИН
      if (b.action === 'setAnnounce') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const text = String(b.text || '').slice(0, 500);
        await pool.query(
          `INSERT INTO ws_settings (skey, sval, updated_at) VALUES ('announce',$1,NOW())
           ON CONFLICT (skey) DO UPDATE SET sval=EXCLUDED.sval, updated_at=NOW()`, [text]);
        return res.json({ ok: true, announce: text });
      }
      if (b.action === 'feedback_list') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const r = await pool.query('SELECT id, message, contact, reply, replied_at, created_at FROM ws_feedback ORDER BY created_at DESC LIMIT 300');
        return res.json({ ok: true, feedback: await attachThreads(r.rows) });
      }
      // Санал хүсэлтэд хариу бичих — ЗӨВХӨН АДМИН (олон зурвас; имэйлтэй бол имэйлээр илгээнэ)
      if (b.action === 'feedback_reply') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        const reply = String(b.reply || '').trim().slice(0, 2000);
        if (!id || reply.length < 1) return res.status(400).json({ ok: false, error: 'Хариу бичнэ үү' });
        const r = await pool.query('SELECT contact, message FROM ws_feedback WHERE id=$1', [id]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
        await pool.query('INSERT INTO ws_feedback_msg (fb_id, sender, text) VALUES ($1,$2,$3)', [id, 'admin', reply]);
        await pool.query('UPDATE ws_feedback SET reply=$2, replied_at=NOW() WHERE id=$1', [id, reply]);
        const contact = String(r.rows[0].contact || '').trim();
        let mailed = false;
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
          try { await sendFeedbackReply(contact, reply, r.rows[0].message); mailed = true; } catch (e) { console.error('[fb reply mail]', e.message); }
        }
        return res.json({ ok: true, mailed: mailed });
      }
      // Санал хүсэлт устгах — ЗӨВХӨН АДМИН
      if (b.action === 'feedback_delete') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'id дутуу' });
        await pool.query('DELETE FROM ws_feedback_msg WHERE fb_id=$1', [id]);
        await pool.query('DELETE FROM ws_feedback WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      // Нэр өөрчлөх / нуух / сэргээх / дараалал — ЗӨВХӨН АДМИН
      if (['setTitle', 'resetTitle', 'hideTopic', 'unhideTopic', 'setOrder',
           'moveTopic', 'dupTopic', 'removePlacement'].indexOf(b.action) >= 0) {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ өөрчилнө' });
      }
      const clip = (s) => String(s || '').slice(0, 120);
      if (b.action === 'moveTopic') {
        const slug = clip(b.slug), from = clip(b.from), to = clip(b.to);
        if (!slug || !from || !to) return res.status(400).json({ ok: false, error: 'slug/from/to дутуу' });
        if (from === to) return res.json({ ok: true });
        // эх бүлгээс хас
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'remove') ON CONFLICT DO NOTHING`, [from, slug]);
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='add'`, [from, slug]);
        // очих бүлэгт нэм
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, [to, slug]);
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='remove'`, [to, slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'dupTopic') {
        const slug = clip(b.slug), to = clip(b.to);
        if (!slug || !to) return res.status(400).json({ ok: false, error: 'slug/to дутуу' });
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, [to, slug]);
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='remove'`, [to, slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'removePlacement') {
        const slug = clip(b.slug), grp = clip(b.grp);
        if (!slug || !grp) return res.status(400).json({ ok: false, error: 'slug/grp дутуу' });
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='add'`, [grp, slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'setOrder') {
        const grp = String(b.grp || '').slice(0, 120);
        const slugs = Array.isArray(b.slugs) ? b.slugs.slice(0, 200) : null;
        if (!grp || !slugs) return res.status(400).json({ ok: false, error: 'grp/slugs дутуу' });
        await pool.query('DELETE FROM ws_order WHERE grp=$1', [grp]);
        for (let i = 0; i < slugs.length; i++) {
          await pool.query('INSERT INTO ws_order (grp, slug, pos) VALUES ($1,$2,$3)',
            [grp, String(slugs[i]).slice(0, 120), i]);
        }
        return res.json({ ok: true });
      }
      if (b.action === 'hideTopic') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false });
        await pool.query('INSERT INTO ws_hidden (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING', [slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'unhideTopic') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_hidden WHERE slug=$1', [slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'setTitle') {
        const slug = String(b.slug || '').slice(0, 120);
        const title = String(b.title || '').trim().slice(0, 160);
        if (!slug || !title) return res.status(400).json({ ok: false, error: 'slug/title дутуу' });
        await pool.query(
          `INSERT INTO ws_titles (slug, title, updated_at) VALUES ($1,$2,NOW())
           ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, updated_at=NOW()`,
          [slug, title]
        );
        return res.json({ ok: true });
      }
      if (b.action === 'resetTitle') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_titles WHERE slug=$1', [slug]);
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
