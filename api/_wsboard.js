// «Самбарт илгээх» (2026-11-12, эзэмшигч: «Иймэрхүү дэлгэц болон ком хоёрыг холбох боломжтой зүйл хийж чадах уу» → «Самбарт илгээх»):
// компьютер дээрх ажлын хуудасны одоогийн харагдацыг (бодлого + хариу) 6 оронтой кодоор смарт самбарын хөтөч рүү дамжуулна.
// Бодлогууд Math.random-оор үүсдэг тул хуудсыг дахин үүсгэх биш, харагдаж буй HTML-ийг нь (цэвэрлээд) хадгална.
//   POST board_send {wstoken, slug, title, html, answers} — эрхтэй багш (ws_access эсвэл тухайн ангийн эрх; туршилт биш) эсвэл
//        админ → {code, expires_at}. Код 12 цаг.
//   GET  ?board=CODE[&peek=1] — нэвтрэлтгүй (IP-ээр хязгаартай); {slug, title[, html, answers], token, pair}. token (typ:'wsb', slug)
//        нь /api/qpay?action=wsstatus-д ЗӨВХӨН тэр хуудсыг кодын хугацаанд нээнэ — самбар дээр нэвтрэх шаардлагагүй.
//        pair (typ:'wsbp', багшийн имэйл, 180 хоног) — самбар «холбогдсон» болж, дараагийн илгээлтүүдийг кодгүйгээр авна («шууд илгээх»):
//   GET  ?board_next=1&after=ISO&not=CODE · ?board_list=1 (Authorization: Bearer pair) — шинэ/сүүлийн даалгаврууд. Самбар талд зөвхөн харах:
//        устгах, өөрчлөх зам байхгүй (эзэмшигч: «Илгээсэн даалгаварыг зөвхөн харах … устгах боломжгүй … шинэчлэх боломжгүй»).
// api/worksheets.js бусад DDL-ээс ӨМНӨ дууддаг: handle() → true бол хариу өгсөн. verify() — api/qpay.js wsstatus.
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const guard = require('./_guard');
const WG = require('./_wsgrade');

const MAX_BYTES = 3 * 1024 * 1024;

let _ready = null;
function tables() {
  if (!_ready) {
    _ready = pool.query(`CREATE TABLE IF NOT EXISTS ws_board_codes (
      code TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      email TEXT,
      title TEXT,
      html TEXT NOT NULL,
      answers TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL
    )`).catch((e) => {
      if (e && (e.code === '23505' || e.code === '42P07')) return;
      _ready = null; throw e;
    });
  }
  return _ready;
}

// ws-store.js-ийн curSlug()-тэй ижил хэлбэр: «logarifm-chanar-1-12.html»
function normSlug(s) {
  let v = String(s || '').trim().toLowerCase().split(/[?#]/)[0].split('/').pop();
  if (v && !/\.html$/.test(v)) v += '.html';
  return /^[a-z0-9][a-z0-9._-]{0,150}\.html$/.test(v) ? v : null;
}
// Хоёр дахь давхар хамгаалалт (самбар талд ws-store.js DOM-оор дахин цэвэрлэнэ): скрипт, үйл явдлын атрибут, javascript: холбоос
function clean(html) {
  return String(html || '')
    .replace(/<(script|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|link|meta|base|form|noscript|template)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src|xlink:href|action|formaction)\s*=\s*(["']?)\s*(javascript|vbscript|data:text)[^"'\s>]*\2/gi, '$1=""');
}
function boardToken(row) {
  const left = Math.max(60, Math.floor((new Date(row.expires_at).getTime() - Date.now()) / 1000));
  return jwt.sign({ typ: 'wsb', slug: row.slug, c: row.code }, guard.jwtSecret(), { algorithm: 'HS256', expiresIn: left });
}
// Холболтын токен: самбар нэг удаа код оруулмагц тэр багшийн дараагийн илгээлтүүдийг кодгүйгээр авна (180 хоног)
function pairToken(email) { return jwt.sign({ typ: 'wsbp', e: email }, guard.jwtSecret(), { algorithm: 'HS256', expiresIn: 180 * 86400 }); }
function pairEmail(req) {
  const h = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
  if (h.slice(0, 7) !== 'Bearer ') return null;
  try {
    const p = jwt.verify(h.slice(7).trim(), guard.jwtSecret(), { algorithms: ['HS256'] });
    return p && p.typ === 'wsbp' && typeof p.e === 'string' && p.e ? p.e : null;
  } catch (e) { return null; }
}
// wsstatus: самбарын токен тэр хуудсанд л хүчинтэй
function verify(tok, slug) {
  if (!tok || !slug) return false;
  try {
    const p = jwt.verify(String(tok), guard.jwtSecret(), { algorithms: ['HS256'] });
    return !!(p && p.typ === 'wsb' && p.slug === normSlug(slug));
  } catch (e) { return false; }
}
// Төлсөн эрх: бүх анги (ws_access) эсвэл энэ хуудасны ангийн эрх. Үнэгүй туршилт хамаарахгүй.
async function entitled(email, slug) {
  try {
    const r = await pool.query('SELECT 1 FROM ws_access WHERE email=$1 AND expires_at > NOW()', [email]);
    if (r.rows.length) return true;
  } catch (e) { /* хүснэгт алга — ангийн эрхийг шалгана */ }
  try {
    const both = await Promise.all([WG.gradesForSlug(slug), WG.activeGrades(email)]);
    const owned = both[1].map(function (x) { return x.grade; });
    return both[0].some(function (g) { return owned.indexOf(g) >= 0; });
  } catch (e) { return false; }
}

async function handle(req, res) {
  const q = req.query || {}, b = req.method === 'POST' ? (req.body || {}) : {};
  if (!(req.method === 'GET' && (q.board || q.board_next || q.board_list)) && b.action !== 'board_send') return false;
  try {
    await tables();
    // Холбогдсон самбар: багшийн хамгийн сүүлд илгээсэн (after-аас хойш) эсвэл сүүлийн 20 даалгавар — устгах/өөрчлөх зам байхгүй
    if (req.method === 'GET' && (q.board_next || q.board_list)) {
      res.setHeader('Cache-Control', 'no-store');
      const email = pairEmail(req);
      if (!email) return res.status(401).json({ ok: false, error: 'Самбар холбогдоогүй байна' }), true;
      // Сургуулийн олон самбар нэг IP-ээр гардаг — IP дангаар биш, багш+IP-ээр (8 сек тутам ≈ 75/10 мин нэг самбарт)
      if (!(await guard.rateLimit('wsboard:poll:' + email + ':' + guard.clientIp(req), 240, 600))) return res.status(429).json({ ok: false, error: 'Түр хүлээнэ үү' }), true;
      if (q.board_next) {
        // created_at микросекундтэй, JSON-оор ирсэн after миллисекунд хүртэл тайрагддаг — одоо нээлттэй кодыг (not) хасахгүй бол
        // өөрийг нь «шинэ» гэж буцааж, самбар 8 сек тутам дахин ачаалагдана
        const after = Date.parse(q.after) ? new Date(Date.parse(q.after)) : new Date(0);
        const not = String(q.not || '').replace(/\D/g, '').slice(0, 6);
        const r = await pool.query(`SELECT code, slug, title, created_at FROM ws_board_codes
          WHERE email=$1 AND expires_at > NOW() AND created_at > $2 AND code <> $3 ORDER BY created_at DESC LIMIT 1`, [email, after, not]);
        return res.json(Object.assign({ ok: true }, r.rows[0] ? { next: r.rows[0] } : {})), true;
      }
      const r = await pool.query(`SELECT code, slug, title, created_at FROM ws_board_codes
        WHERE email=$1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 20`, [email]);
      return res.json({ ok: true, items: r.rows }), true;
    }
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      // Код таах оролдлогоос IP-ээр 40/10 мин; холбогдсон самбар (pair токентой) багш+IP-ээр өргөн — нэг сургуулийн олон самбар
      const pe = pairEmail(req);
      const rk = pe ? ['wsboard:get:' + pe + ':' + guard.clientIp(req), 200] : ['wsboard:get:' + guard.clientIp(req), 40];
      if (!(await guard.rateLimit(rk[0], rk[1], 600))) return res.status(429).json({ ok: false, error: 'Түр хүлээгээд дахин оролдоно уу' }), true;
      const code = String(q.board).replace(/\D/g, '');
      if (code.length !== 6) return res.status(400).json({ ok: false, error: '6 оронтой кодоо оруулна уу' }), true;
      const r = await pool.query('SELECT code, slug, email, title, html, answers, created_at, expires_at, NOW() AS now FROM ws_board_codes WHERE code=$1 AND expires_at > NOW()', [code]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Код олдсонгүй эсвэл хугацаа нь дууссан' }), true;
      const row = r.rows[0];
      // now (DB цаг) — самбар үүнээс хойших илгээлтийг л хүлээнэ: жагсаалтаас хуучин даалгавар нээхэд хамгийн сүүлийнх рүү үсрэхгүй
      const out = { ok: true, slug: row.slug, title: row.title || '', created_at: row.created_at, expires_at: row.expires_at, now: row.now, token: boardToken(row),
        pair: row.email ? pairToken(row.email) : null };
      if (!q.peek) { out.html = row.html; out.answers = row.answers || ''; }
      return res.json(out), true;
    }
    // POST board_send
    const admin = guard.requireAdmin(req);
    const email = guard.wsEmail(b.wstoken);
    if (!admin && !email) return res.status(401).json({ ok: false, needLogin: true, error: 'Самбарт илгээхийн тулд Дасгалын төвд нэвтэрсэн байх хэрэгтэй' }), true;
    const slug = normSlug(b.slug);
    if (!slug) return res.status(400).json({ ok: false, error: 'Хуудас тодорхойгүй' }), true;
    if (!admin && !(await entitled(email, slug))) return res.status(403).json({ ok: false, error: 'Энэ хуудсыг самбарт илгээхэд тухайн ангийн эрх хэрэгтэй' }), true;
    if (!(await guard.rateLimit('wsboard:send:' + (email || 'admin'), 60, 3600))) return res.status(429).json({ ok: false, error: 'Түр хүлээгээд дахин оролдоно уу' }), true;
    const html = clean(b.html), answers = clean(b.answers);
    if (html.replace(/<[^>]*>/g, '').trim().length < 3) return res.status(400).json({ ok: false, error: 'Хуудас хоосон байна' }), true;
    if (Buffer.byteLength(html) + Buffer.byteLength(answers) > MAX_BYTES) return res.status(413).json({ ok: false, error: 'Хуудас хэт том байна' }), true;
    await pool.query('DELETE FROM ws_board_codes WHERE expires_at < NOW()').catch(function () {});
    const title = String(b.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    let row = null;
    for (let i = 0; i < 6 && !row; i++) {
      const c = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      const ins = await pool.query(
        `INSERT INTO ws_board_codes (code, slug, email, title, html, answers, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6, NOW() + INTERVAL '12 hours') ON CONFLICT (code) DO NOTHING RETURNING code, expires_at`,
        [c, slug, email || 'admin', title, html, answers]);
      if (ins.rows.length) row = ins.rows[0];
    }
    if (!row) return res.status(503).json({ ok: false, error: 'Код үүсгэж чадсангүй, дахин оролдоно уу' }), true;
    return res.json({ ok: true, code: row.code, expires_at: row.expires_at }), true;
  } catch (e) {
    console.error('[wsboard]', e.message);
    return res.status(500).json({ ok: false, error: 'Серверийн алдаа' }), true;
  }
}

module.exports = { handle, verify, normSlug, clean };
