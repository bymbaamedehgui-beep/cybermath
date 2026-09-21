// Хэвлэсэн дасгалын багцыг санах (DB). Хаанаас ч хариуг шалгах боломжтой.
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendFeedbackReply } = require('./_email');
const { rateLimit, clientIp } = require('./_guard');
const sms = require('./_sms');
const tg = require('./_telegram');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

// Дасгалын төвийн нэвтрэлт — имэйл + нууц үг + баталгаажуулах код (тусдаа ws_login)
function wsSign(email) { return jwt.sign({ email: String(email).toLowerCase(), ws: true }, JWT_SECRET, { expiresIn: '400d' }); }
// env WS_TOKEN_IAT_MIN (epoch сек) тавьсан бол түүнээс өмнө олгосон ws токеныг хүчингүй гэж үзнэ (тавиагүй бол нөлөөгүй)
function wsIatOk(d) {
  const min = parseInt(process.env.WS_TOKEN_IAT_MIN || '', 10);
  if (!Number.isFinite(min) || min <= 0) return true;
  return !!d && typeof d.iat === 'number' && d.iat >= min;
}
function wsEmailFromToken(t) { try { const d = jwt.verify(String(t || ''), JWT_SECRET); return (d && d.ws && d.email && wsIatOk(d)) ? String(d.email).toLowerCase() : null; } catch (e) { return null; } }

// ── Код/имэйлийн хязгаар ──
const MSG_CODE_BAD = 'Код буруу эсвэл хугацаа нь дууссан байна';
const MSG_CODE_DEAD = 'Код хүчингүй боллоо. Шинэ код авна уу.';
const MSG_TOO_MANY = 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.';
const MSG_PENDING = 'Энэ имэйлд саяхан код илгээсэн. Утсанд ирсэн кодыг оруулна уу. Дугаараа буруу бичсэн бол 10 минутын дараа дахин бүртгүүлнэ үү.';
const CODE_MAX_ATTEMPTS = 5;

// Нууц үг сэргээх кодыг илгээж болох утас (спек §6.2): SMS/админаар батлагдсан, эсвэл SMS-ээс өмнө имэйлээр
// батлагдсан (verified) мөрийн хүчинтэй утас. Баталгаажаагүй мөрийн утас зөвхөн тухайн бүртгэлийн verify кодод ашиглагдана.
function wsUsablePhone(row) {
  if (!row) return null;
  const pn = sms.normalizePhone(row.phone);
  if (!pn.ok) return null;
  if (row.phone_verified_at) return pn.local;
  if (sms.trustLegacyPhone() && row.verified === true) return pn.local;
  return null;
}
// Enumeration-д мэдрэг endpoint (ws_forgot / ws_resend): бодит илгээлттэй ижил хэлбэр
function wsAccepted(masked, extra) { return Object.assign({ ok: true }, extra || {}, { sms: true, masked: masked }); }

// IP-г rate limit-ийн түлхүүр болгох: IPv4 бүтэн хаяг (::ffff: → IPv4), IPv6 эхний 4 бүлэг (/64).
// Түүхий IP хадгалахгүйн тулд sha256-ийн эхний 16 hex-ийг ашиглана.
function expandV6(s) {
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? Math.max(0, 8 - head.length - tail.length) : 0;
  const groups = head.concat(new Array(fill).fill('0'), tail);
  if (groups.length !== 8) return null;
  return groups.map(g => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16).toString(16) : g);
}
function ipKey(ip) {
  let s = String(ip || '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/%.*$/, '');
  let v;
  if (!s || s === 'unknown') v = 'noip';
  else {
    const m4 = s.match(/^(?:::ffff:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (m4) v = m4[1];
    else if (s.indexOf(':') >= 0) { const g = expandV6(s); v = g ? g.slice(0, 4).join(':') : s.slice(0, 64); }
    else v = s.slice(0, 64);
  }
  return crypto.createHash('sha256').update('ip|' + v).digest('hex').slice(0, 16);
}
// Хязгааруудыг дарааллаар шалгана; давсан бол мессеж, эс бөгөөс null (DB алдаа → rateLimit false → хаана)
async function firstLimitHit(checks) {
  for (const c of checks) { if (!(await rateLimit(c[0], c[1], c[2]))) return c[3]; }
  return null;
}
// Илгээж чадаагүй кодыг хүчингүй болгоно (хэрэглэгч аваагүй код хүчинтэй үлдэхгүй)
async function dropCode(email, code) {
  try { await pool.query('UPDATE ws_login SET code=NULL, code_exp=NULL WHERE email=$1 AND code=$2', [email, code]); } catch (e) { sms.logErr('[ws dropCode]', e); }
}
// SMS кодыг ws_login-д бичнэ (api/_sms.js sendCode-ийн store). onlyUnverified: бүртгэлийн код дахин илгээх
function wsCodeStore(email, onlyUnverified) {
  return async function (code) {
    const exp = new Date(Date.now() + 10 * 60 * 1000);
    const r = await pool.query(
      'UPDATE ws_login SET code=$2, code_exp=$3, code_attempts=0 WHERE email=$1' + (onlyUnverified ? ' AND verified=FALSE' : '') + ' RETURNING email',
      [email, code, exp.toISOString()]);
    if (!r.rows.length) throw new Error('ws code store: row missing');
  };
}
// Хүчинтэй код байвал хугацааг 10 минутаар сунгаж ТЭР кодыг буцаана (sendCode-ийн reuse). Оролдлого тэглэхгүй.
// codeAttempt нь оролдлого CODE_MAX_ATTEMPTS-аас хэтэрмэгц кодыг устгадаг тул тийм код дахин ашиглагдахгүй.
function wsCodeReuse(email, onlyUnverified) {
  return async function () {
    const r = await pool.query(
      'UPDATE ws_login SET code_exp=$2 WHERE email=$1' + (onlyUnverified ? ' AND verified=FALSE' : '')
        + ' AND code IS NOT NULL AND code_exp > NOW() AND COALESCE(code_attempts,0) < $3 RETURNING code',
      [email, new Date(Date.now() + 10 * 60 * 1000).toISOString(), CODE_MAX_ATTEMPTS]);
    return r.rows.length ? r.rows[0].code : null;
  };
}
// Худалдан авсан/олгосон эрхтэй имэйл эсэх (хугацаа дууссан ч тооцно). Хүснэгт үүсээгүй (42P01) бол алгасна, бусад DB алдаа → throw
const WS_ENTITLED_SQL = [
  'SELECT 1 FROM ws_access WHERE LOWER(email)=$1 LIMIT 1',
  'SELECT 1 FROM ws_grade_access WHERE LOWER(email)=$1 LIMIT 1',
  'SELECT 1 FROM ws_purchases WHERE LOWER(email)=$1 LIMIT 1',
  'SELECT 1 FROM ws_pending WHERE LOWER(email)=$1 AND granted LIMIT 1',
  'SELECT 1 FROM ws_event_regs WHERE LOWER(email)=$1 AND paid LIMIT 1',
];
async function wsEntitled(email) {
  for (const q of WS_ENTITLED_SQL) {
    try { const r = await pool.query(q, [email]); if (r.rows.length) return true; }
    catch (e) { if (e && e.code === '42P01') continue; throw e; }
  }
  return false;
}
// SMS нь имэйлийн эзэмшлийг батлахгүй: эрхтэй имэйлийн БАТАЛГААЖААГҮЙ мөрийг утсаар идэвхжүүлэхгүй (админ шалгана).
// Хаасан бол хариуг бичээд true буцаана.
async function wsClaimBlocked(res, email) {
  let ent;
  try { ent = await wsEntitled(email); }
  catch (e) { sms.logErr('[ws entitled]', e); sms.failJson(res, sms.mkFail('SMS_UNAVAILABLE')); return true; }
  if (!ent) return false;
  await sms.notify('tg:sms:claim', 3600, 'WS: эрхтэй имэйлд дансгүйгээр утсаар код хүсэв: ' + sms.maskEmail(email), 10);
  sms.failJson(res, sms.mkFail('NEED_ADMIN'));
  return true;
}
// ws_verify ба ws_reset-ийн кодын шалгалт. Амжилттай бол { ok:true, code } (дуудагч code=$2 нөхцөлтэй UPDATE хийнэ)
async function codeAttempt(email, ipk, input) {
  const code = String(input == null ? '' : input).trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, status: 400, error: MSG_CODE_BAD };
  const lim = await firstLimitHit([
    ['wscode:em:' + email, 10, 86400, MSG_TOO_MANY],
    ['wscode:ip:' + ipk, 30, 900, MSG_TOO_MANY],
  ]);
  if (lim) return { ok: false, status: 429, error: lim };
  const r = await pool.query(
    'UPDATE ws_login SET code_attempts=COALESCE(code_attempts,0)+1 WHERE email=$1 AND code IS NOT NULL RETURNING code, code_exp, code_attempts',
    [email]);
  if (!r.rows.length) return { ok: false, status: 400, error: MSG_CODE_BAD };
  const row = r.rows[0];
  const stored = String(row.code == null ? '' : row.code);
  if (Number(row.code_attempts) > CODE_MAX_ATTEMPTS) {
    await pool.query('UPDATE ws_login SET code=NULL, code_exp=NULL WHERE email=$1 AND code=$2', [email, stored]);
    return { ok: false, status: 400, error: MSG_CODE_DEAD };
  }
  if (!/^\d{6}$/.test(stored)) return { ok: false, status: 400, error: MSG_CODE_BAD };
  const expMs = row.code_exp ? new Date(row.code_exp).getTime() : NaN;
  if (!Number.isFinite(expMs) || expMs < Date.now()) return { ok: false, status: 400, error: MSG_CODE_BAD };
  // Хоёулаа 6 оронтой ASCII тул урт ижил
  if (!crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(code))) return { ok: false, status: 400, error: MSG_CODE_BAD };
  return { ok: true, code: stored };
}
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
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS code_attempts INT NOT NULL DEFAULT 0`).catch(()=>{});
  // SMS кодоор эсвэл админ баталгаажуулсан утас (спек §6.2). Одоогийн утсыг тэмдэглэхгүй.
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_ws_login_phone ON ws_login(phone)`).catch(()=>{});
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
    await pool.query(`ALTER TABLE ws_sets ADD COLUMN IF NOT EXISTS owner TEXT`).catch(()=>{});
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
    // Ажлын хуудас бүрийн сэтгэгдэл ба reaction (slug-аар түлхүүрлэнэ)
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_comments (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT,
      email TEXT,
      body TEXT NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wsc_slug ON ws_comments(slug)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_reactions (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      user_key TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(slug, user_key)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wsr_slug ON ws_reactions(slug)`);
    // Сургалт (Event) — зарлал + бүртгэл + төлбөр
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      descr TEXT,
      price INT DEFAULT 20000,
      slots JSONB DEFAULT '[]'::jsonb,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_event_regs (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      slot TEXT,
      amount INT,
      paid BOOLEAN DEFAULT FALSE,
      invoice_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      UNIQUE(event_id, email)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wser_event ON ws_event_regs(event_id)`);
    // Ээлжит хичээлийн төлөвлөгөө (багш бүр өөрийн, хувийн)
    await pool.query(`CREATE TABLE IF NOT EXISTS lesson_plans (
      id BIGSERIAL PRIMARY KEY,
      owner_email TEXT NOT NULL,
      title TEXT NOT NULL,
      grade TEXT,
      ldate TEXT,
      duration TEXT,
      objectives TEXT,
      flow TEXT,
      homework TEXT,
      worksheets JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lp_owner ON lesson_plans(owner_email)`);
    // Тохиргоо (announce гэх мэт key/value)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_settings (
        skey TEXT PRIMARY KEY,
        sval TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Ажлын хуудасны заавар/тайлбарын ерөнхий загвар (зөвхөн админ засна, бүгд харна)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_instr (
        slug TEXT PRIMARY KEY,
        edits JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Ангийн доторх дэд бүлэг (зөвхөн админ үүсгэнэ, бүгд харна). Гишүүнчлэл нь ws_place(grp='sg:'+id, kind='add')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_subgroups (
        id BIGSERIAL PRIMARY KEY,
        grade TEXT NOT NULL,
        name TEXT NOT NULL,
        pos INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Бүлэг дотор бүлэг (nest) — эцэг дэд бүлгийн id (null бол дээд түвшин)
    await pool.query(`ALTER TABLE ws_subgroups ADD COLUMN IF NOT EXISTS parent_id BIGINT`).catch(() => {});

    // GET — жагсаалт эсвэл нэг багц эсвэл сэдвийн нэр/нуусан/дараалал
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      // Ажлын хуудасны заавар загвар авах — нээлттэй (бүх хэрэглэгч харна)
      if (req.query.instr) {
        const slug = String(req.query.instr || '').toLowerCase().slice(0, 120);
        const r = await pool.query('SELECT edits FROM ws_instr WHERE slug=$1', [slug]);
        return res.json({ ok: true, edits: r.rows.length ? (r.rows[0].edits || {}) : {} });
      }
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
        let subgroups = [];
        try {
          const sg = await pool.query('SELECT id, grade, name, pos, parent_id FROM ws_subgroups ORDER BY grade, pos, id');
          subgroups = sg.rows.map(x => ({ id: Number(x.id), grade: x.grade, name: x.name, pos: x.pos, parent: x.parent_id != null ? Number(x.parent_id) : null }));
        } catch (e) {}
        return res.json({ ok: true, titles: map, hidden: h.rows.map(x => x.slug), order: order, place: place, announce: announce, subgroups: subgroups });
      }
      const owner = req.query.owner ? String(req.query.owner).slice(0, 80) : null;
      const code = req.query.code;
      if (code) {
        const r = await pool.query('SELECT * FROM ws_sets WHERE id=$1', [parseInt(code)]);
        const row = r.rows[0] || null;
        // Эзэмшигчтэй тэмдэглэлийг зөвхөн эзэмшигч нь харна (хуучин эзэмшигчгүй нь нээлттэй)
        if (row && row.owner && row.owner !== owner) return res.json({ ok: true, set: null });
        return res.json({ ok: true, set: row });
      }
      // Жагсаалт: зөвхөн тухайн төхөөрөмжийн (эзэмшигчийн) хадгалсан хуудсууд
      const r = owner
        ? await pool.query(
            `SELECT id, title, note, created_at, jsonb_array_length(items) AS count
             FROM ws_sets WHERE owner=$1 ORDER BY id DESC LIMIT 200`, [owner])
        : { rows: [] };
      return res.json({ ok: true, sets: r.rows });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      // ── Админ: ажлын хуудасны дансны утас (спек §6.3). NEED_ADMIN / утасгүй эрхтэй хэрэглэгчийг идэвхжүүлэх зам ──
      // Мөр байхгүй бол "бэлтгэсэн" мөр (pass_hash='!', verified=FALSE, phone_verified_at=NOW()) → хэрэглэгч ws_forgot→ws_reset-ээр орно.
      if (b.action === 'ws_admin_phone' || b.action === 'ws_admin_set_phone') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        await ensureWsLogin();
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Зөв имэйл оруулна уу' });
        let entitled = null;
        try { entitled = await wsEntitled(email); } catch (e) { sms.logErr('[ws admin entitled]', e); }
        if (b.action === 'ws_admin_phone') {
          const r = await pool.query('SELECT verified, phone, phone_verified_at, pass_hash FROM ws_login WHERE email=$1', [email]);
          const row = r.rows[0];
          return res.json({ ok: true, email: email, exists: !!row, verified: !!(row && row.verified), prepared: !!(row && row.pass_hash === '!'),
            phone: row ? (row.phone || null) : null, phone_verified_at: row ? (row.phone_verified_at || null) : null,
            usable: !!wsUsablePhone(row), entitled: entitled });
        }
        const raw = b.phone;
        if (raw == null || String(raw).trim() === '') {
          const c = await pool.query('UPDATE ws_login SET phone=NULL, phone_verified_at=NULL, code=NULL, code_exp=NULL WHERE email=$1 RETURNING email', [email]);
          tg.sendTelegram('WS админ утас арилгав: ' + sms.maskEmail(email)).catch(() => {});
          return res.json({ ok: true, email: email, exists: c.rows.length > 0, phone: null });
        }
        const pn = sms.normalizePhone(raw);
        if (!pn.ok) return sms.failJson(res, sms.mkFail(pn.code));
        const up = await pool.query(
          `INSERT INTO ws_login (email, pass_hash, verified, phone, phone_verified_at) VALUES ($1,'!',FALSE,$2,NOW())
           ON CONFLICT (email) DO UPDATE SET phone=EXCLUDED.phone, phone_verified_at=NOW(), code=NULL, code_exp=NULL, code_attempts=0
           RETURNING email, verified`,
          [email, pn.local]);
        const verified = !!(up.rows[0] && up.rows[0].verified);
        tg.sendTelegram('WS админ утас тохируулав: ' + sms.maskEmail(email) + ' → ' + sms.maskPhone(pn.local, 2) + (verified ? '' : ' (нууц үг сэргээхээр идэвхжинэ)')).catch(() => {});
        return res.json({ ok: true, email: email, phone: pn.local, verified: verified, entitled: entitled });
      }

      // ── Дасгалын төвийн нэвтрэлт: бүртгэл → код → баталгаажуулах → нэвтрэх ──
      if (['ws_register','ws_verify','ws_login','ws_resend','ws_forgot','ws_reset'].indexOf(b.action) >= 0) {
        await ensureWsLogin();
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Зөв имэйл оруулна уу' });

        if (b.action === 'ws_login') {
          const r = await pool.query('SELECT pass_hash, verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, notFound: true, error: 'Бүртгэлгүй имэйл' });
          // Нууц үгийн brute force хязгаар: имэйл тутам 15 минутад 20, IP тутам 15 минутад 100
          const llim = await firstLimitHit([
            ['wslogin:em:' + email, 20, 900, MSG_TOO_MANY],
            ['wslogin:ip:' + ipKey(clientIp(req)), 100, 900, MSG_TOO_MANY],
          ]);
          if (llim) return res.status(429).json({ ok: false, error: llim });
          const okp = await bcrypt.compare(String(b.pass || ''), r.rows[0].pass_hash);
          if (!okp) return res.status(401).json({ ok: false, error: 'Нууц үг буруу' });
          if (!r.rows[0].verified) return res.status(403).json({ ok: false, needVerify: true, error: 'Имэйл баталгаажаагүй' });
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_register') {
          const pass = String(b.pass || '');
          const name = b.name ? String(b.name).trim().slice(0, 80) : null;
          if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });
          const ex = await pool.query('SELECT verified, code, code_exp, phone_verified_at FROM ws_login WHERE email=$1', [email]);
          if (ex.rows.length && ex.rows[0].verified) return res.status(400).json({ ok: false, existed: true, error: 'Энэ имэйл бүртгэлтэй байна. Нэвтэрнэ үү.' });
          // Админ бэлтгэсэн данс (утас батлагдсан) → «Нууц үг сэргээх»-ээр орно
          if (ex.rows.length && ex.rows[0].phone_verified_at) return sms.failJson(res, sms.mkFail('NEED_LOGIN'), { prepared: true, fields: { prepared: true } });
          // Утас ЗААВАЛ — баталгаажуулах код зөвхөн SMS-ээр явна
          // Утас огт ирээгүй = хуучин нээлттэй хуудас (SMS-ээс өмнөх маягт талбаргүй) — F5 хийхийг зөвлөнө
          if (!String(b.phone == null ? '' : b.phone).trim()) return res.status(400).json({ ok: false, code: 'PHONE_INVALID', error: 'Утасны дугаараа оруулна уу. Талбар харагдахгүй бол хуудсаа шинэчилнэ үү (F5).' });
          const pn = sms.normalizePhone(b.phone);
          if (!pn.ok) return sms.failJson(res, sms.mkFail(pn.code));
          const pc = await pool.query('SELECT count(*)::int AS n FROM ws_login WHERE phone=$1 AND verified=TRUE', [pn.local]);
          if ((Number(pc.rows[0] && pc.rows[0].n) || 0) >= sms.maxAccountsPerPhone()) return sms.failJson(res, sms.mkFail('PHONE_TOO_MANY'));
          if (await wsClaimBlocked(res, email)) return;
          // Хугацаа нь дуусаагүй код байгаа бол нууц үг/нэр/утсыг дарж бичихгүй, код дахин илгээхгүй
          // (pending: клиент "саяхан код илгээсэн, дугаар буруу бол 10 минутын дараа" гэж харуулна)
          const exExp = ex.rows.length && ex.rows[0].code && ex.rows[0].code_exp ? new Date(ex.rows[0].code_exp).getTime() : 0;
          if (exExp > Date.now()) return res.json({ ok: true, needVerify: true, pending: true, message: MSG_PENDING });
          const ip = clientIp(req);
          const pf = await sms.precheck({ ip: ip, email: email, kind: 'reg' });
          if (pf) return sms.failJson(res, pf, { reg: 'ws' });
          const hash = await bcrypt.hash(pass, 10);
          let raced = false;
          const sent = await sms.sendCode({
            purpose: 'verify', kind: 'reg', phone: pn.local, email: email, ip: ip,
            store: async function (code) {
              const exp = new Date(Date.now() + 10 * 60 * 1000);
              // WHERE нөхцөл: зэрэг хүсэлт ирсэн ч баталгаажсан эсвэл хүчинтэй кодтой мөрийг дарахгүй (атомар)
              const up = await pool.query(
                `INSERT INTO ws_login (email, pass_hash, verified, code, code_exp, name, phone) VALUES ($1,$2,FALSE,$3,$4,$5,$6)
                 ON CONFLICT (email) DO UPDATE SET pass_hash=EXCLUDED.pass_hash, code=EXCLUDED.code, code_exp=EXCLUDED.code_exp, code_attempts=0, name=EXCLUDED.name, phone=EXCLUDED.phone
                 WHERE ws_login.verified=FALSE AND ws_login.phone_verified_at IS NULL AND (ws_login.code IS NULL OR ws_login.code_exp IS NULL OR ws_login.code_exp <= NOW())
                 RETURNING email`,
                [email, hash, code, exp.toISOString(), name, pn.local]);
              if (!up.rows.length) { raced = true; throw new Error('ws_register: active code'); }
            },
            drop: function (code) { return dropCode(email, code); },
          });
          if (sent.ok) return res.json({ ok: true, needVerify: true, sms: true, masked: sent.masked2 });
          if (raced) return res.json({ ok: true, needVerify: true, pending: true, message: MSG_PENDING });
          if (sent.code === 'SMS_UNCERTAIN') return sms.failJson(res, sent, { reg: 'ws', fields: { needVerify: true, sms: true, masked: sms.maskPhone(pn.local, 2) } });
          return sms.failJson(res, sent, { reg: 'ws' });
        }
        if (b.action === 'ws_forgot') {
          const t0 = Date.now();
          const ip = clientIp(req);
          // SMS квот данс хайхаас ӨМНӨ — бүртгэлтэй эсэхээс үл хамааран ижил тоологдоно
          const pf = await sms.precheck({ ip: ip, email: email, kind: 'acct' });
          if (pf) return sms.failJson(res, pf, { reg: 'ws' });
          const r = await pool.query('SELECT verified, phone, phone_verified_at FROM ws_login WHERE email=$1', [email]);
          // Олдоогүй / ашиглах утасгүй (баталгаажаагүй мөрийн утсыг өөр хүн бичсэн байж болно, H9) → хуурамч хариу, SMS 0
          const dest = wsUsablePhone(r.rows[0]);
          if (!dest) { await sms.padTo(t0); return res.json(wsAccepted(sms.fakeMask(email))); }
          const sent = await sms.sendCode({
            purpose: 'reset', kind: 'acct', phone: dest, email: email, ip: ip,
            store: wsCodeStore(email, false), drop: function (code) { return dropCode(email, code); }, reuse: wsCodeReuse(email, false),
          });
          if (sent.ok) return res.json(wsAccepted(sent.masked2));
          if (sent.phoneQuota) { await sms.padTo(t0); return res.json(wsAccepted(sms.maskPhone(dest, 2))); }
          return sms.failJson(res, sent, { reg: 'ws' });
        }
        if (b.action === 'ws_reset') {
          const pass = String(b.pass || '');
          if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });
          const rr = await pool.query('SELECT verified, phone, phone_verified_at FROM ws_login WHERE email=$1', [email]);
          const rrow = rr.rows[0];
          // Эрхтэй имэйлийн баталгаажаагүй, утас нь батлагдаагүй мөрийг утсаар идэвхжүүлэхгүй (админ бэлтгэсэн мөр phone_verified_at-тэй)
          if (rrow && !rrow.verified && !rrow.phone_verified_at && await wsClaimBlocked(res, email)) return;
          const ca = await codeAttempt(email, ipKey(clientIp(req)), b.code);
          if (!ca.ok) return res.status(ca.status).json({ ok: false, error: ca.error });
          const hash = await bcrypt.hash(pass, 10);
          const upd = await pool.query('UPDATE ws_login SET pass_hash=$2, verified=TRUE, code=NULL, code_exp=NULL, code_attempts=0, phone_verified_at=COALESCE(phone_verified_at, NOW()) WHERE email=$1 AND code=$3 RETURNING email', [email, hash, ca.code]);
          if (!upd.rows.length) return res.status(400).json({ ok: false, error: MSG_CODE_BAD });
          if (rrow) await sms.markVerified(rrow.phone);
          try { if (await wsEntitled(email)) tg.sendTelegram('WS нууц үг SMS-ээр сэргээгдлээ: ' + sms.maskEmail(email)).catch(() => {}); } catch (e) { sms.logErr('[ws reset tg]', e); }
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_verify') {
          const r = await pool.query('SELECT verified, name, phone, phone_verified_at FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(400).json({ ok: false, error: MSG_CODE_BAD });
          // Аль хэдийн баталгаажсан бол токен/имэйл өгөхгүй — нууц үгээр нэвтэрнэ
          if (r.rows[0].verified) return res.json({ ok: true, alreadyVerified: true });
          // Кодын эзэн нууц үгээ энд тохируулна (бүртгэлийн үеийн pass_hash-д итгэхгүй — данс булаахаас хамгаална).
          // Нууц үггүй хүсэлт кодын оролдлого/хязгаарыг зарцуулахгүй.
          const pass = String(b.pass || '');
          // Хуучин нээлттэй хуудас нууц үг илгээдэггүй — NEED_PASS-аар код оруулах дэлгэцэд нууц үгийн талбар нээнэ
          if (pass.length < 6) return res.status(400).json({ ok: false, code: 'NEED_PASS', error: 'Нууц үг шаардлагатай. Хуудсаа шинэчилж (F5) нууц үгээрээ дахин оролдоно уу.' });
          // Эрхтэй имэйлийг батлагдаагүй утсаар идэвхжүүлэхгүй — кодыг зарцуулахгүй, оролдлого тоолохгүй
          if (!r.rows[0].phone_verified_at && await wsClaimBlocked(res, email)) return;
          const ca = await codeAttempt(email, ipKey(clientIp(req)), b.code);
          if (!ca.ok) return res.status(ca.status).json({ ok: false, error: ca.error });
          const hash = await bcrypt.hash(pass, 10);
          const upd = await pool.query('UPDATE ws_login SET pass_hash=$3, verified=TRUE, code=NULL, code_exp=NULL, code_attempts=0, phone_verified_at=NOW() WHERE email=$1 AND code=$2 RETURNING email', [email, ca.code, hash]);
          if (!upd.rows.length) return res.status(400).json({ ok: false, error: MSG_CODE_BAD });
          await sms.markVerified(r.rows[0].phone);
          // Шинэ хэрэглэгч бүртгүүлсэн — Telegram мэдэгдэл (бүтэн дугаар гаргахгүй)
          try {
            const u = r.rows[0];
            const msg = '🆕 <b>Дасгалын төв — шинэ бүртгэл</b>\n\n'
              + '👤 ' + (u.name || '(нэргүй)') + '\n'
              + '📧 ' + email + (u.phone ? ('\n📱 ' + sms.maskPhone(u.phone, 2)) : '');
            sendTelegram(msg).catch(() => {});
          } catch (e) {}
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_resend') {
          const t0 = Date.now();
          const r = await pool.query('SELECT verified, phone, phone_verified_at FROM ws_login WHERE email=$1', [email]);
          const row = r.rows[0];
          if (row && row.verified) return res.json({ ok: true, alreadyVerified: true });
          const ip = clientIp(req);
          const pf = await sms.precheck({ ip: ip, email: email, kind: 'reg' });
          if (pf) return sms.failJson(res, pf, { reg: 'ws' });
          const fake = async function () { await sms.padTo(t0); return res.json(wsAccepted(sms.fakeMask(email), { needVerify: true })); };
          // Олдоогүй / админ бэлтгэсэн мөр / утас хүчингүй → хуурамч хариу (enumeration), SMS 0
          const pn = row ? sms.normalizePhone(row.phone) : { ok: false };
          if (!row || row.phone_verified_at || !pn.ok) return fake();
          // H9: эрхтэй имэйлийн баталгаажаагүй мөрийн утсыг SMS-ээс өмнө өөр хүн бичсэн байж болно → SMS 0, хуурамч хариу
          let ent;
          try { ent = await wsEntitled(email); }
          catch (e) { sms.logErr('[ws entitled]', e); return sms.failJson(res, sms.mkFail('SMS_UNAVAILABLE')); }
          if (ent) {
            await sms.notify('tg:sms:claim', 3600, 'WS: эрхтэй имэйлийн баталгаажаагүй мөрөнд код хүсэв: ' + sms.maskEmail(email), 10);
            return fake();
          }
          const sent = await sms.sendCode({
            purpose: 'verify', kind: 'reg', phone: pn.local, email: email, ip: ip,
            store: wsCodeStore(email, true), drop: function (code) { return dropCode(email, code); }, reuse: wsCodeReuse(email, true),
          });
          if (sent.ok) return res.json(wsAccepted(sent.masked2, { needVerify: true }));
          if (sent.phoneQuota) return fake();
          return sms.failJson(res, sent, { reg: 'ws' });
        }
      }

      if (b.action === 'save') {
        const title = String(b.title || 'Дасгал').slice(0, 160);
        const note = b.note ? String(b.note).slice(0, 500) : null;
        const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
        if (!items.length) return res.status(400).json({ ok: false, error: 'Бодлого алга' });
        const owner = b.owner ? String(b.owner).slice(0, 80) : null;
        const r = await pool.query(
          'INSERT INTO ws_sets (title, items, note, owner) VALUES ($1,$2,$3,$4) RETURNING id, created_at',
          [title, JSON.stringify(items), note, owner]
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
        // Зөвхөн өөрийн (эзэмшигчийн) тэмдэглэлийг устгана; хуучин эзэмшигчгүй нь нээлттэй
        const owner = b.owner ? String(b.owner).slice(0, 80) : null;
        await pool.query('DELETE FROM ws_sets WHERE id=$1 AND (owner IS NULL OR owner=$2)', [parseInt(b.code), owner]);
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
      // ─── Ажлын хуудсын сэтгэгдэл ба reaction (slug-аар) ───
      const REACTS = ['like', 'love', 'haha', 'wow', 'sad', 'clap'];
      const clSlug = (s) => String(s || '').slice(0, 120).toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (b.action === 'wsc_list') {
        const slug = clSlug(b.slug);
        if (!slug) return res.json({ ok: true, comments: [], reactions: { counts: {}, mine: null } });
        const ukey = String(b.ukey || '').slice(0, 100);
        const c = await pool.query('SELECT id, name, body, is_admin, created_at FROM ws_comments WHERE slug=$1 ORDER BY created_at ASC LIMIT 400', [slug]);
        const rc = await pool.query('SELECT reaction, COUNT(*)::int AS n FROM ws_reactions WHERE slug=$1 GROUP BY reaction', [slug]);
        const counts = {}; rc.rows.forEach(r => { counts[r.reaction] = r.n; });
        let mine = null;
        if (ukey) { const m = await pool.query('SELECT reaction FROM ws_reactions WHERE slug=$1 AND user_key=$2', [slug, ukey]); mine = m.rows[0] ? m.rows[0].reaction : null; }
        return res.json({ ok: true, comments: c.rows.map(x => ({ id: x.id, name: x.name, body: x.body, is_admin: x.is_admin, at: x.created_at })), reactions: { counts, mine } });
      }
      if (b.action === 'wsc_add') {
        const slug = clSlug(b.slug);
        const body = String(b.body || '').trim().slice(0, 1000);
        if (!slug || body.length < 1) return res.status(400).json({ ok: false, error: 'Сэтгэгдлээ бичнэ үү' });
        const email = wsEmailFromToken(b.token);
        const adminFlag = isAdmin(req);
        const name = adminFlag ? 'CyberMath ✔' : (email || String(b.name || '').trim().slice(0, 60) || 'Зочин');
        const ins = await pool.query('INSERT INTO ws_comments (slug, name, email, body, is_admin) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at', [slug, name, email || null, body, adminFlag]);
        try { await sendTelegram('💬 <b>Ажлын хуудсанд сэтгэгдэл</b> (' + slug + ')\n\n<b>' + name + ':</b> ' + body); } catch (e) {}
        return res.json({ ok: true, comment: { id: ins.rows[0].id, name, body, is_admin: adminFlag, at: ins.rows[0].created_at } });
      }
      if (b.action === 'wsc_react') {
        const slug = clSlug(b.slug);
        const ukey = String(b.ukey || '').slice(0, 100);
        const reaction = String(b.reaction || '');
        if (!slug || !ukey) return res.status(400).json({ ok: false });
        if (!reaction) {
          await pool.query('DELETE FROM ws_reactions WHERE slug=$1 AND user_key=$2', [slug, ukey]);
        } else {
          if (REACTS.indexOf(reaction) < 0) return res.status(400).json({ ok: false, error: 'invalid' });
          await pool.query('INSERT INTO ws_reactions (slug, user_key, reaction) VALUES ($1,$2,$3) ON CONFLICT (slug, user_key) DO UPDATE SET reaction=EXCLUDED.reaction, updated_at=NOW()', [slug, ukey, reaction]);
        }
        const rc = await pool.query('SELECT reaction, COUNT(*)::int AS n FROM ws_reactions WHERE slug=$1 GROUP BY reaction', [slug]);
        const counts = {}; rc.rows.forEach(r => { counts[r.reaction] = r.n; });
        return res.json({ ok: true, counts, mine: reaction || null });
      }
      if (b.action === 'wsc_delete') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_comments WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      // ─── Сургалт (Event) ───
      const normSlots = (v) => {
        let arr = v;
        if (typeof v === 'string') arr = v.split('\n');
        if (!Array.isArray(arr)) arr = [];
        return arr.map(s => String(s || '').trim()).filter(Boolean).slice(0, 20);
      };
      // Идэвхтэй сургалт(ууд) + нэвтэрсэн бол миний бүртгэл — НЭЭЛТТЭЙ
      if (b.action === 'event_active') {
        const r = await pool.query('SELECT id, title, descr, price, slots FROM ws_events WHERE active=TRUE ORDER BY created_at DESC LIMIT 10');
        const email = wsEmailFromToken(b.token);
        let mine = {};
        if (email && r.rows.length) {
          const ids = r.rows.map(x => x.id);
          const m = await pool.query('SELECT event_id, slot, paid FROM ws_event_regs WHERE event_id = ANY($1) AND lower(email)=$2', [ids, email]);
          m.rows.forEach(x => { mine[x.event_id] = { slot: x.slot, paid: x.paid }; });
        }
        return res.json({ ok: true, events: r.rows.map(x => ({ id: x.id, title: x.title, descr: x.descr, price: x.price, slots: x.slots || [], myreg: mine[x.id] || null })) });
      }
      // Сургалтад бүртгүүлэх — ЗААВАЛ НЭВТЭРСЭН
      if (b.action === 'event_register') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Эхлээд нэвтэрнэ үү' });
        const eid = parseInt(b.event_id, 10);
        const slot = String(b.slot || '').trim().slice(0, 120);
        const phone = String(b.phone || '').trim().slice(0, 40);
        const name = String(b.name || '').trim().slice(0, 80) || null;
        const ev = await pool.query('SELECT id, title, price, slots, active FROM ws_events WHERE id=$1', [eid]);
        if (!ev.rows.length || !ev.rows[0].active) return res.status(404).json({ ok: false, error: 'Сургалт олдсонгүй' });
        const slots = (ev.rows[0].slots || []).map(String);
        if (!slot || slots.indexOf(slot) < 0) return res.status(400).json({ ok: false, error: 'Цагаа сонгоно уу' });
        const price = ev.rows[0].price || 20000;
        // Аль хэдийн төлсөн бол дахин бүртгэхгүй
        const ex = await pool.query('SELECT paid FROM ws_event_regs WHERE event_id=$1 AND lower(email)=$2', [eid, email]);
        if (ex.rows.length && ex.rows[0].paid) return res.json({ ok: true, already: true });
        await pool.query(
          `INSERT INTO ws_event_regs (event_id, email, name, phone, slot, amount)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (event_id, email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, slot=EXCLUDED.slot, amount=EXCLUDED.amount`,
          [eid, email, name, phone, slot, price]);
        try { await sendTelegram('📝 <b>Сургалтын бүртгэл</b> (' + ev.rows[0].title + ')\n\n👤 ' + (name || email) + '\n🕒 ' + slot + (phone ? ('\n📞 ' + phone) : '') + '\n💰 ' + price + '₮ — <i>төлбөр хүлээгдэж байна</i>'); } catch (e) {}
        return res.json({ ok: true, price: price, title: ev.rows[0].title, email: email });
      }
      // ── Админ: сургалт удирдах ──
      if (b.action === 'event_list') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const r = await pool.query(`SELECT e.id, e.title, e.descr, e.price, e.slots, e.active, e.created_at,
          (SELECT COUNT(*)::int FROM ws_event_regs r WHERE r.event_id=e.id) AS reg_count,
          (SELECT COUNT(*)::int FROM ws_event_regs r WHERE r.event_id=e.id AND r.paid) AS paid_count
          FROM ws_events e ORDER BY e.created_at DESC LIMIT 100`);
        return res.json({ ok: true, events: r.rows });
      }
      if (b.action === 'event_save') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const title = String(b.title || '').trim().slice(0, 200);
        if (!title) return res.status(400).json({ ok: false, error: 'Гарчиг оруулна уу' });
        const descr = String(b.descr || '').trim().slice(0, 3000);
        const price = Math.max(0, parseInt(b.price, 10) || 20000);
        const slots = JSON.stringify(normSlots(b.slots));
        const active = b.active === false ? false : true;
        const id = parseInt(b.id, 10);
        if (id) {
          await pool.query('UPDATE ws_events SET title=$2, descr=$3, price=$4, slots=$5::jsonb, active=$6 WHERE id=$1', [id, title, descr, price, slots, active]);
          return res.json({ ok: true, id });
        }
        const ins = await pool.query('INSERT INTO ws_events (title, descr, price, slots, active) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id', [title, descr, price, slots, active]);
        return res.json({ ok: true, id: ins.rows[0].id });
      }
      if (b.action === 'event_delete') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_event_regs WHERE event_id=$1', [id]);
        await pool.query('DELETE FROM ws_events WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      if (b.action === 'event_regs') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const eid = parseInt(b.event_id, 10);
        const r = await pool.query('SELECT id, name, email, phone, slot, paid, created_at, paid_at FROM ws_event_regs WHERE event_id=$1 ORDER BY paid DESC, created_at ASC LIMIT 1000', [eid]);
        return res.json({ ok: true, regs: r.rows });
      }
      // ─── Ээлжит хичээлийн төлөвлөгөө (нэвтэрсэн багш, хувийн) ───
      if (b.action === 'lp_list') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const r = await pool.query(
          `SELECT id, title, grade, ldate, updated_at,
                  COALESCE(jsonb_array_length(worksheets),0) AS ws_count
           FROM lesson_plans WHERE lower(owner_email)=$1 ORDER BY updated_at DESC LIMIT 300`, [email]);
        return res.json({ ok: true, plans: r.rows });
      }
      if (b.action === 'lp_get') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const id = parseInt(b.id, 10);
        const r = await pool.query('SELECT * FROM lesson_plans WHERE id=$1 AND lower(owner_email)=$2', [id, email]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
        return res.json({ ok: true, plan: r.rows[0] });
      }
      if (b.action === 'lp_save') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const title = String(b.title || '').trim().slice(0, 200);
        if (!title) return res.status(400).json({ ok: false, error: 'Сэдэв оруулна уу' });
        const grade = String(b.grade || '').slice(0, 40);
        const ldate = String(b.ldate || '').slice(0, 40);
        const duration = String(b.duration || '').slice(0, 40);
        const objectives = String(b.objectives || '').slice(0, 4000);
        const flow = String(b.flow || '').slice(0, 8000);
        const homework = String(b.homework || '').slice(0, 4000);
        let ws = Array.isArray(b.worksheets) ? b.worksheets : [];
        ws = ws.slice(0, 40).map(w => ({
          slug: String((w && w.slug) || '').slice(0, 120),
          title: String((w && w.title) || '').slice(0, 200),
          role: (w && w.role === 'homework') ? 'homework' : 'practice'
        })).filter(w => w.slug);
        const wsJson = JSON.stringify(ws);
        const id = parseInt(b.id, 10);
        if (id) {
          const upd = await pool.query(
            `UPDATE lesson_plans SET title=$3, grade=$4, ldate=$5, duration=$6, objectives=$7, flow=$8, homework=$9, worksheets=$10::jsonb, updated_at=NOW()
             WHERE id=$1 AND lower(owner_email)=$2 RETURNING id`,
            [id, email, title, grade, ldate, duration, objectives, flow, homework, wsJson]);
          if (!upd.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
          return res.json({ ok: true, id: id });
        }
        const ins = await pool.query(
          `INSERT INTO lesson_plans (owner_email, title, grade, ldate, duration, objectives, flow, homework, worksheets)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
          [email, title, grade, ldate, duration, objectives, flow, homework, wsJson]);
        return res.json({ ok: true, id: ins.rows[0].id });
      }
      if (b.action === 'lp_delete') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const id = parseInt(b.id, 10);
        await pool.query('DELETE FROM lesson_plans WHERE id=$1 AND lower(owner_email)=$2', [id, email]);
        return res.json({ ok: true });
      }
      // Ажлын хуудасны заавар загвар авах — нээлттэй
      if (b.action === 'instr_get') {
        const slug = String(b.slug || '').toLowerCase().slice(0, 120);
        const r = await pool.query('SELECT edits FROM ws_instr WHERE slug=$1', [slug]);
        return res.json({ ok: true, edits: r.rows.length ? (r.rows[0].edits || {}) : {} });
      }
      // Ажлын хуудасны заавар загвар хадгалах — ЗӨВХӨН АДМИН (бүх хэрэглэгчид харагдана)
      if (b.action === 'instr_save') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const slug = String(b.slug || '').toLowerCase().slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false, error: 'slug дутуу' });
        let edits = b.edits && typeof b.edits === 'object' ? b.edits : {};
        // хэт том бичвэрээс хамгаалах
        const clean = {};
        Object.keys(edits).slice(0, 60).forEach(k => { clean[String(k).slice(0, 8)] = String(edits[k] == null ? '' : edits[k]).slice(0, 4000); });
        await pool.query(
          `INSERT INTO ws_instr (slug, edits, updated_at) VALUES ($1,$2::jsonb,NOW())
           ON CONFLICT (slug) DO UPDATE SET edits=EXCLUDED.edits, updated_at=NOW()`,
          [slug, JSON.stringify(clean)]);
        return res.json({ ok: true, edits: clean });
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
      if (['setTitle', 'resetTitle', 'hideTopic', 'unhideTopic', 'purgeTopic', 'setOrder',
           'moveTopic', 'dupTopic', 'removePlacement',
           'sg_create', 'sg_rename', 'sg_delete', 'sg_assign', 'sg_unassign', 'sg_reorder'].indexOf(b.action) >= 0) {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ өөрчилнө' });
      }
      // ── Ангийн доторх дэд бүлэг (админ) ──
      if (b.action === 'sg_create') {
        const grade = String(b.grade || '').slice(0, 120), name = String(b.name || '').trim().slice(0, 80);
        if (!grade || !name) return res.status(400).json({ ok: false, error: 'grade/name дутуу' });
        const mx = await pool.query('SELECT COALESCE(MAX(pos),0)+1 AS p FROM ws_subgroups WHERE grade=$1', [grade]);
        const ins = await pool.query('INSERT INTO ws_subgroups (grade, name, pos) VALUES ($1,$2,$3) RETURNING id', [grade, name, mx.rows[0].p]);
        return res.json({ ok: true, id: Number(ins.rows[0].id), grade: grade, name: name });
      }
      if (b.action === 'sg_rename') {
        const id = parseInt(b.id, 10), name = String(b.name || '').trim().slice(0, 80);
        if (!id || !name) return res.status(400).json({ ok: false, error: 'id/name дутуу' });
        await pool.query('UPDATE ws_subgroups SET name=$2 WHERE id=$1', [id, name]);
        return res.json({ ok: true });
      }
      if (b.action === 'sg_delete') {
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'id дутуу' });
        const lbl = 'sg:' + id;
        await pool.query(`DELETE FROM ws_place WHERE grp=$1`, [lbl]);
        await pool.query(`DELETE FROM ws_order WHERE grp=$1`, [lbl]);
        // Хүүхэд дэд бүлгүүдийг дээд түвшинд гаргана (устгахгүй)
        await pool.query('UPDATE ws_subgroups SET parent_id=NULL WHERE parent_id=$1', [id]).catch(() => {});
        await pool.query('DELETE FROM ws_subgroups WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      // Дэд бүлгийг өөр дэд бүлэг рүү (эцэг болгох) эсвэл дээд түвшинд гаргах
      if (b.action === 'sg_setparent') {
        const id = parseInt(b.id, 10);
        const parent = (b.parent === null || b.parent === undefined || b.parent === '') ? null : parseInt(b.parent, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'id дутуу' });
        if (parent !== null) {
          if (parent === id) return res.status(400).json({ ok: false, error: 'Өөр лүүгээ зөөх боломжгүй' });
          const rows = (await pool.query('SELECT id, grade, parent_id FROM ws_subgroups')).rows;
          const byId = {};
          rows.forEach(r => { byId[Number(r.id)] = { grade: r.grade, parent: r.parent_id != null ? Number(r.parent_id) : null }; });
          if (!byId[id] || !byId[parent]) return res.status(400).json({ ok: false, error: 'олдсонгүй' });
          if (byId[id].grade !== byId[parent].grade) return res.status(400).json({ ok: false, error: 'Өөр ангийн бүлэг' });
          let cur = parent, guard = 0;
          while (cur !== null && guard++ < 100) { if (cur === id) return res.status(400).json({ ok: false, error: 'Мөчлөг үүсэхээр байна' }); cur = byId[cur] ? byId[cur].parent : null; }
        }
        await pool.query('UPDATE ws_subgroups SET parent_id=$2 WHERE id=$1', [id, parent]);
        return res.json({ ok: true });
      }
      // Ажлын хуудсыг дэд бүлэгт оноох — зөвхөн ТУХАЙН АНГИЙН бусад дэд бүлгээс хасч, энэ бүлэгт нэмнэ (өөр анги дахь ижил хуудсанд хүрэхгүй)
      if (b.action === 'sg_assign') {
        const id = parseInt(b.id, 10), slug = String(b.slug||'').slice(0,120);
        if (!id || !slug) return res.status(400).json({ ok: false, error: 'id/slug дутуу' });
        await pool.query(`DELETE FROM ws_place WHERE slug=$1 AND kind='add' AND grp IN (SELECT 'sg:'||id FROM ws_subgroups WHERE grade=(SELECT grade FROM ws_subgroups WHERE id=$2))`, [slug, id]);
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, ['sg:' + id, slug]);
        return res.json({ ok: true });
      }
      // Дэд бүлгээс хасах — from='sg:ID' өгвөл зөвхөн тэрнээс, эсэхийг тухайн ангийн дэд бүлгүүдээс
      if (b.action === 'sg_unassign') {
        const slug = String(b.slug||'').slice(0,120), from = String(b.from||'').slice(0,120);
        if (!slug) return res.status(400).json({ ok: false, error: 'slug дутуу' });
        if (/^sg:\d+$/.test(from)) {
          const fid = parseInt(from.slice(3), 10);
          await pool.query(`DELETE FROM ws_place WHERE slug=$1 AND kind='add' AND grp IN (SELECT 'sg:'||id FROM ws_subgroups WHERE grade=(SELECT grade FROM ws_subgroups WHERE id=$2))`, [slug, fid]);
        } else {
          await pool.query(`DELETE FROM ws_place WHERE slug=$1 AND kind='add' AND grp=$2`, [slug, from]);
        }
        return res.json({ ok: true });
      }
      if (b.action === 'sg_reorder') {
        const grade = String(b.grade || '').slice(0, 120);
        const ids = Array.isArray(b.ids) ? b.ids.slice(0, 60) : null;
        if (!grade || !ids) return res.status(400).json({ ok: false, error: 'grade/ids дутуу' });
        for (let i = 0; i < ids.length; i++) {
          await pool.query('UPDATE ws_subgroups SET pos=$3 WHERE id=$1 AND grade=$2', [parseInt(ids[i], 10), grade, i]);
        }
        return res.json({ ok: true });
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
      // Бүрмөсөн устгах: бүх байршил, дараалал, нэрийн өөрчлөлтийг устгаж, каталогоос нуух.
      // seed-ийн sg_seeded_pairs хамгаалалт нь дахин нэмэхээс сэргийлнэ (устгасныг сэргээхгүй).
      if (b.action === 'purgeTopic') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false, error: 'slug дутуу' });
        await pool.query('DELETE FROM ws_place WHERE slug=$1', [slug]);
        await pool.query('DELETE FROM ws_order WHERE slug=$1', [slug]);
        await pool.query('DELETE FROM ws_titles WHERE slug=$1', [slug]);
        await pool.query('INSERT INTO ws_hidden (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING', [slug]);
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
