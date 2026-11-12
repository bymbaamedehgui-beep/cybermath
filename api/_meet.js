// Багш нарт зориулсан онлайн танилцуулга (Google Meet) — тохиргоо + бүртгэл (2026-11-12, эзэмшигч: «багш нарт зориулсан онлайн
// танилцуулга meeting … Дасгалын төвд сануулга байдлаар бүх хэрэглэгчдэд харагдахаар», «Бүртгүүлэх холбоос тавья. Бүртгэлд
// meeting-д хэрэг болох зүйлсийг оруулаарай»). api/worksheets.js бусад хүснэгтийн DDL-ээс ӨМНӨ дууддаг: handle() → true бол хариу өгсөн.
//   GET  ?meet=1             — нийтийн тохиргоо (Meet холбоосгүй) эсвэл meet:null (идэвхгүй / дууссан)
//   POST meet_register {name, phone, email?, school?, aimag?, grades[], usage?, interests[], question?} → {id, key, link}
//        (нэг утсаар дахин бүртгүүлбэл шинэчилнэ; дууссан уулзалтад бүртгэхгүй)
//   POST meet_me {id, key}   — бүртгүүлсэн хүнд Meet холбоос (админ дараа нь нэмсэн бол)
//   POST meet_get · meet_set {title, at, mins, link, active} · meet_regs — админ
// Тохиргоо ws_settings.skey='meet' (JSON); DB-д байхгүй бол DEFAULT. Meet холбоос зөвхөн бүртгүүлсэн хүнд очно.
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { rateLimit, clientIp } = require('./_guard');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

const DEFAULT = {
  title: 'CyberMath-ийг хичээлдээ хэрхэн ашиглах вэ?',
  at: '2026-11-13T19:00:00+08:00', mins: 120, link: '', active: true,
  poster: '/assets/meet/poster-2026-11-13.jpg',
};
const USAGE = { using: 'Одоо ашиглаж байгаа', heard: 'Сонссон, ашиглаж үзээгүй', new: 'Анх удаа сонсож байна' };
const INTERESTS = { ws: 'Ажлын хуудас', exam: 'Жишиг даалгавар ба шалгалт', ppt: 'Слайд хичээл', class: 'Анги ба QR', mathlet: 'Mathlet тэмцээн', eesh: 'ЭЕШ-ийн бэлтгэл' };

function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  try { const d = jwt.verify(auth.slice(7), JWT_SECRET); return !!(d && d.admin); } catch (e) { return false; }
}

// Шинэ бүртгэлийг эзэмшигчид Telegram-аар (api/worksheets.js-ийн sendTelegram-тай ижил; env байхгүй бол алгасна)
async function telegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return;
  try {
    await fetch('https://api.telegram.org/bot' + token + '/sendMessage', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true }) });
  } catch (e) { console.error('[meet telegram]', e.message); }
}

let _ready = null;
function tables() {
  if (!_ready) {
    _ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_settings (skey TEXT PRIMARY KEY, sval TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_meet_regs (
        id BIGSERIAL PRIMARY KEY,
        meet TEXT NOT NULL,
        rkey TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        school TEXT,
        aimag TEXT,
        grades JSONB DEFAULT '[]'::jsonb,
        usage TEXT,
        interests JSONB DEFAULT '[]'::jsonb,
        question TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(meet, phone)
      )`);
    })().catch((e) => {
      if (e && (e.code === '23505' || e.code === '42P07')) return;
      _ready = null; throw e;
    });
  }
  return _ready;
}

const str = (v, n) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ').slice(0, n);
async function config() {
  const r = await pool.query(`SELECT sval FROM ws_settings WHERE skey='meet'`);
  let c = {};
  if (r.rows.length) { try { c = JSON.parse(r.rows[0].sval || '{}') || {}; } catch (e) { c = {}; } }
  return Object.assign({}, DEFAULT, c);
}
// Уулзалтын түлхүүр — бүртгэлийг уулзалт тус бүрээр (Улаанбаатарын огноогоор) ялгана
const meetKey = (c) => new Date(Date.parse(c.at) + 8 * 3600e3).toISOString().slice(0, 10);
const endMs = (c) => Date.parse(c.at) + (Math.max(15, +c.mins || 120)) * 60e3;
const isOpen = (c) => c.active !== false && Number.isFinite(Date.parse(c.at)) && Date.now() < endMs(c);
function pub(c) {
  return { key: meetKey(c), title: c.title, at: c.at, end: new Date(endMs(c)).toISOString(), platform: 'Google Meet',
    poster: c.poster || '', live: Date.now() >= Date.parse(c.at), hasLink: !!c.link };
}
const regOut = (x) => ({ id: Number(x.id), name: x.name, phone: x.phone, email: x.email, school: x.school, aimag: x.aimag,
  grades: x.grades || [], usage: x.usage, interests: x.interests || [], question: x.question, created_at: x.created_at, updated_at: x.updated_at });

async function handle(req, res) {
  const q = req.query || {}, b = req.method === 'POST' ? (req.body || {}) : {};
  const act = String(b.action || '');
  if (!(req.method === 'GET' && q.meet) && !/^meet_/.test(act)) return false;
  try {
    await tables();
    if (req.method === 'GET') {
      const c = await config();
      res.setHeader('Cache-Control', 'public, s-maxage=30, max-age=0');
      return res.json({ ok: true, meet: isOpen(c) ? pub(c) : null }), true;
    }

    if (act === 'meet_register') {
      const c = await config();
      if (!isOpen(c)) return res.status(400).json({ ok: false, error: 'Энэ уулзалтын бүртгэл хаагдсан' }), true;
      if (!(await rateLimit('meetreg:' + clientIp(req), 20, 3600))) return res.status(429).json({ ok: false, error: 'Түр хүлээгээд дахин оролдоно уу' }), true;
      const name = str(b.name, 80);
      const phone = String(b.phone || '').replace(/[\s\-().]/g, '').replace(/^(\+976|00976|976)(?=\d{8}$)/, '');
      const email = str(b.email, 120).toLowerCase();
      if (name.length < 2) return res.status(400).json({ ok: false, error: 'Овог, нэрээ бичнэ үү' }), true;
      if (!/^\d{8}$/.test(phone)) return res.status(400).json({ ok: false, error: '8 оронтой утасны дугаараа бичнэ үү' }), true;
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Имэйл буруу байна' }), true;
      const grades = Array.from(new Set((Array.isArray(b.grades) ? b.grades : []).map(Number).filter((g) => Number.isInteger(g) && g >= 1 && g <= 12))).sort((x, y) => x - y);
      const usage = USAGE[b.usage] ? b.usage : null;
      const interests = Array.from(new Set((Array.isArray(b.interests) ? b.interests : []).filter((k) => INTERESTS[k])));
      const vals = [meetKey(c), crypto.randomBytes(12).toString('hex'), name, phone, email || null, str(b.school, 120) || null, str(b.aimag, 60) || null,
        JSON.stringify(grades), usage, JSON.stringify(interests), String(b.question || '').trim().slice(0, 1000) || null];
      const r = await pool.query(
        `INSERT INTO ws_meet_regs (meet, rkey, name, phone, email, school, aimag, grades, usage, interests, question)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb,$11)
         ON CONFLICT (meet, phone) DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email, school=EXCLUDED.school, aimag=EXCLUDED.aimag,
           grades=EXCLUDED.grades, usage=EXCLUDED.usage, interests=EXCLUDED.interests, question=EXCLUDED.question, updated_at=NOW()
         RETURNING id, rkey, (xmax = 0) AS fresh`, vals);
      const row = r.rows[0];
      const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      if (row.fresh !== false) await telegram('📝 <b>Уулзалтын бүртгэл</b> (' + meetKey(c) + ')\n\n👤 ' + esc(name) + '\n📞 ' + phone
        + (email ? '\n📧 ' + esc(email) : '') + (vals[5] ? '\n🏫 ' + esc(vals[5]) : '') + (vals[6] ? ', ' + esc(vals[6]) : '')
        + (grades.length ? '\n📚 ' + grades.join(', ') + '-р анги' : '') + (usage ? '\n• ' + USAGE[usage] : ''));
      return res.json({ ok: true, id: Number(row.id), key: row.rkey, link: c.link || null, meet: pub(c) }), true;
    }

    if (act === 'meet_me') {
      const c = await config();
      const r = await pool.query('SELECT name FROM ws_meet_regs WHERE id=$1 AND rkey=$2 AND meet=$3', [parseInt(b.id, 10) || 0, String(b.key || ''), meetKey(c)]);
      if (!r.rows.length) return res.json({ ok: false }), true;
      return res.json({ ok: true, name: r.rows[0].name, link: c.link || null, meet: isOpen(c) ? pub(c) : null }), true;
    }

    // ── Админ ──
    if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' }), true;
    if (act === 'meet_get') {
      const c = await config();
      const n = await pool.query('SELECT COUNT(*)::int AS n FROM ws_meet_regs WHERE meet=$1', [meetKey(c)]);
      return res.json({ ok: true, cfg: c, key: meetKey(c), open: isOpen(c), count: n.rows[0].n }), true;
    }
    if (act === 'meet_set') {
      const title = str(b.title, 200), at = String(b.at || '').trim(), link = String(b.link || '').trim();
      if (!title) return res.status(400).json({ ok: false, error: 'Гарчиг оруулна уу' }), true;
      if (!Number.isFinite(Date.parse(at)) || !/[+-]\d\d:\d\d$|Z$/.test(at)) return res.status(400).json({ ok: false, error: 'Огноо, цаг буруу' }), true;
      if (link && !/^https:\/\/[^\s<>"']+$/.test(link)) return res.status(400).json({ ok: false, error: 'Холбоос https:// -ээр эхэлнэ' }), true;
      const prev = await config();
      const c = { title, at, mins: Math.min(600, Math.max(15, parseInt(b.mins, 10) || 120)), link: link.slice(0, 300), active: b.active !== false, poster: prev.poster };
      await pool.query(`INSERT INTO ws_settings (skey, sval, updated_at) VALUES ('meet',$1,NOW())
        ON CONFLICT (skey) DO UPDATE SET sval=EXCLUDED.sval, updated_at=NOW()`, [JSON.stringify(c)]);
      return res.json({ ok: true, cfg: c, key: meetKey(c), open: isOpen(c) }), true;
    }
    if (act === 'meet_regs') {
      const c = await config();
      const r = await pool.query('SELECT * FROM ws_meet_regs WHERE meet=$1 ORDER BY created_at, id', [String(b.meet || meetKey(c))]);
      return res.json({ ok: true, key: meetKey(c), regs: r.rows.map(regOut), usage: USAGE, interests: INTERESTS }), true;
    }
    return res.status(400).json({ ok: false, error: 'Тодорхойгүй үйлдэл' }), true;
  } catch (e) {
    console.error('[meet]', e.message);
    return res.status(500).json({ ok: false, error: 'Серверийн алдаа' }), true;
  }
}

module.exports = { handle, DEFAULT, USAGE, INTERESTS };
