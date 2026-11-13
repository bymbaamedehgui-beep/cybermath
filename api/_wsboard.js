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
//   POST board_view {wstoken, code, view[, html, answers][, bd]} — илгээсэн багш тэр кодын харагдацыг шинэчилнэ (шууд дагалт, эзэмшигч:
//        «Ком дээрээсээ томруулвал яг л томорсон нь дэлгэц дээр харагдах ёстой»); GET ?board_view=1&t=<wsb>&r&h&d — самбар зөвхөн
//        өөрчлөгдсөнийг авна (rev · hrev · brev), live — компьютер 45 сек дотор мэдэгдсэн.
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
      throw e;
    })
      // Шууд дагалт (2026-11-13): харагдац, самбарын төлөв, хувилбарын тоолуурууд, компьютерын сүүлийн мэдэгдэл
      .then(() => pool.query(`ALTER TABLE ws_board_codes ADD COLUMN IF NOT EXISTS view TEXT, ADD COLUMN IF NOT EXISTS bd TEXT,
        ADD COLUMN IF NOT EXISTS rev INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS hrev INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS brev INT NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS seen_at TIMESTAMPTZ`))
      .catch((e) => {
        if (e && (e.code === '42701' || e.code === '23505')) return;
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
// Самбарын (кодын) токеноос код — шууд дагалтад
function tokCode(tok) {
  try {
    const p = jwt.verify(String(tok || ''), guard.jwtSecret(), { algorithms: ['HS256'] });
    return p && p.typ === 'wsb' && /^\d{6}$/.test(String(p.c)) ? String(p.c) : null;
  } catch (e) { return null; }
}
// Компьютерын самбарын төлөв (ws-board.js state()): бүтэц, тоог шалгаж, бодлогын HTML-ийг цэвэрлэнэ (зурлагыг самбар өөрөө шалгана)
function cleanBd(s) {
  let o; try { o = JSON.parse(String(s)); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  const num = (v, a, b, d) => (typeof v === 'number' && isFinite(v) ? Math.max(a, Math.min(b, v)) : d);
  const pg = o.page && typeof o.page === 'object' ? o.page : {};
  const strokes = Array.isArray(pg.strokes) ? pg.strokes : [];
  if (strokes.length > 5000) return null;
  return JSON.stringify({ open: !!o.open, frac: num(o.frac, 0.35, 0.75, 0.58), bg: num(o.bg, 0, 3, 0) | 0, tone: num(o.tone, 0, 3, 0) | 0, cur: num(o.cur, 0, 199, 0) | 0,
    n: num(o.n, 1, 200, 1) | 0, z: o.z == null ? null : num(o.z, 0.2, 6, null), W: num(o.W, 0, 20000, 0), H: num(o.H, 0, 20000, 0),
    calc: o.calc && typeof o.calc === 'object' ? { open: !!o.calc.open, fx: num(o.calc.fx, 0, 1, null), fy: num(o.calc.fy, 0, 1, null), e: String(o.calc.e || '').slice(0, 200),
      r: typeof o.calc.r === 'number' && isFinite(o.calc.r) ? o.calc.r : null, err: !!o.calc.err, deg: o.calc.deg !== false, frac: !!o.calc.frac } : null, hint: !!o.hint,
    page: { qi: num(pg.qi, -1, 5000, -1) | 0, pin: clean(typeof pg.pin === 'string' ? pg.pin : '').slice(0, 200000), strokes: strokes,
      // Харагдац, координатын эх, геометр — самбар (ws-board.js normGeo) нарийн шалгана; энд хэмжээг хязгаарлана
      v: pg.v && typeof pg.v === 'object' ? { s: num(pg.v.s, 0.05, 20, 1), x: num(pg.v.x, -1e7, 1e7, 0), y: num(pg.v.y, -1e7, 1e7, 0) } : null,
      o: pg.o && typeof pg.o === 'object' && typeof pg.o.x === 'number' && typeof pg.o.y === 'number' ? { x: num(pg.o.x, -1e7, 1e7, 0), y: num(pg.o.y, -1e7, 1e7, 0) } : null,
      geo: pg.geo && typeof pg.geo === 'object' ? { pts: Array.isArray(pg.geo.pts) ? pg.geo.pts.slice(0, 2000) : [], objs: Array.isArray(pg.geo.objs) ? pg.geo.objs.slice(0, 2000) : [],
        fns: Array.isArray(pg.geo.fns) ? pg.geo.fns.slice(0, 20) : [], n: num(pg.geo.n, 0, 100000, 0) | 0 } : null } });
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
  if (!(req.method === 'GET' && (q.board || q.board_next || q.board_list || q.board_view)) && b.action !== 'board_send' && b.action !== 'board_view') return false;
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
    // Самбар: компьютерыг дагах — кодын токеноор (токен = кодыг олж авсны баталгаа тул IP-ийн хязгааргүй; 1 сек тутам)
    if (req.method === 'GET' && q.board_view) {
      res.setHeader('Cache-Control', 'no-store');
      const code = tokCode(q.t);
      if (!code) return res.status(401).json({ ok: false, gone: true }), true;
      const n = (v) => Math.max(0, parseInt(v, 10) || 0);
      const r = await pool.query(`SELECT rev, hrev, brev, (seen_at > NOW() - INTERVAL '45 seconds') AS live,
          CASE WHEN rev > $2 THEN view END AS view, CASE WHEN hrev > $3 THEN html END AS html,
          CASE WHEN hrev > $3 THEN answers END AS answers, CASE WHEN brev > $4 THEN bd END AS bd
        FROM ws_board_codes WHERE code=$1 AND expires_at > NOW()`, [code, n(q.r), n(q.h), n(q.d)]);
      if (!r.rows.length) return res.status(404).json({ ok: false, gone: true }), true;
      const x = r.rows[0], out = { ok: true, rev: x.rev, hrev: x.hrev, brev: x.brev, live: !!x.live };
      if (x.view != null) out.view = x.view;
      if (x.html != null) { out.html = x.html; out.answers = x.answers || ''; }
      if (x.bd != null) out.bd = x.bd;
      return res.json(out), true;
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
    // POST board_view — компьютер: өөрийн гаргасан кодын харагдац (заавал), агуулга, самбарын төлөв (өөрчлөгдсөн бол)
    if (b.action === 'board_view') {
      const admin = guard.requireAdmin(req), email = guard.wsEmail(b.wstoken);
      if (!admin && !email) return res.status(401).json({ ok: false, needLogin: true }), true;
      const code = String(b.code || '').replace(/\D/g, '');
      const view = typeof b.view === 'string' && b.view.length <= 2000 && /^\{[^<>]*\}$/.test(b.view) ? b.view : null;
      if (code.length !== 6 || !view) return res.status(400).json({ ok: false, error: 'Буруу хүсэлт' }), true;
      if (!(await guard.rateLimit('wsboard:view:' + (email || 'admin'), 1500, 600))) return res.status(429).json({ ok: false, error: 'Түр хүлээнэ үү' }), true;
      const html = b.html != null ? clean(b.html) : null, answers = b.html != null ? clean(b.answers) : null;
      const bd = b.bd != null ? cleanBd(b.bd) : null;
      if (b.bd != null && bd == null) return res.status(400).json({ ok: false, error: 'Самбарын төлөв буруу' }), true;
      if (Buffer.byteLength(html || '') + Buffer.byteLength(answers || '') + Buffer.byteLength(bd || '') > MAX_BYTES) return res.status(413).json({ ok: false, error: 'Хэт том' }), true;
      const r = await pool.query(`UPDATE ws_board_codes SET view=$3, rev=rev+1, seen_at=NOW(),
          html=COALESCE($4, html), answers=COALESCE($5, answers), hrev=hrev+(CASE WHEN $4::text IS NULL THEN 0 ELSE 1 END),
          bd=COALESCE($6, bd), brev=brev+(CASE WHEN $6::text IS NULL THEN 0 ELSE 1 END)
        WHERE code=$1 AND email=$2 AND expires_at > NOW() RETURNING rev`, [code, email || 'admin', view, html, answers, bd]);
      if (!r.rows.length) return res.status(404).json({ ok: false, gone: true }), true;
      return res.json({ ok: true, rev: r.rows[0].rev }), true;
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

module.exports = { handle, verify, normSlug, clean, cleanBd };
