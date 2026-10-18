// Тоглоомын сервер gate — тусдаа файлтай тоглоомуудыг зөвхөн эрхтэй хэрэглэгчид өгнө.
// Файлууд (games/*.html, math-mortal/index.html + *.js/*.css) @vercel/static build-д ОРОХГҮЙ — зөвхөн энэ функцэд
// includeFiles-ээр багцлагдана (vercel.json). Тиймээс шууд URL-аар үнэгүй хуулбар татах зам байхгүй.
//
// Нийтийн URL өөрчлөгдөхгүй (vercel.json routes → /gate/game.js?g=<түлхүүр>[&f=<файл>]):
//   /sudoku(.html) /play2048(.html) /numseq(.html) /myangat(.html) /xpdrop(.html) /sbh /songobodkhozh.html
//   /math-mortal/ ба /math-mortal/index.html → f=index.html;  /math-mortal/<нэр>.(js|css) → f=<нэр>
//   /math-mortal/assets/**, /math-mortal/cover.webp — статик (нууц биш);  /mortal, /math-mortal → 301 /math-mortal/
//
// Realm (сайт) тусдаа: хоёр сайт ижил файлыг ижил нийтийн замаар үйлчилдэг тул эхлэх хуудасны хүсэлтийн realm-ийг URL-аар
// ялгана — ?realm=ws → Дасгалын төв (api/games.js launch-ийн ws url), бусад (realm-гүй) → cyber-math.com (index.html,
// play/team/xp.html-ийн шууд URL). Сесс cookie нь realm бүрт тусдаа (cm: __Host-cmg_<g>, ws: __Host-cmgw_<g>) бөгөөд
// сессийн r нь хүсэлтийн realm-тай тэнцүү байх ёстой: Дасгалын төвд авсан эрх/урилга cyber-math.com-ийн /sudoku.html-ийг
// нээхгүй (эсрэгээрээ ч мөн). math-mortal-ийн дэд js/css харьцангуй URL-аар ачаалагддаг тул realm-гүй (доор 2б).
//
// Шийдвэрийн дараалал:
//   1) GET/HEAD л. g нь FILES allowlist-д, f нь regex + бодит файлын жагсаалтад (path traversal → 404).
//   2) GM.gateOn() === false → шууд өгнө (?t= байвал тасалбаргүй URL руу 302). Gate зөвхөн cyber-math.com (realm 'cm')
//      төлбөртэй үед түгжинэ (env GAME_PAYWALL_REALMS-д 'cm'; анхдагч ['ws'] — эхний ээлжинд Дасгалын төвд л төлбөртэй,
//      cyber-math.com-ийн шууд URL /sudoku.html, play/team/xp.html-ийн xpdrop г.м. хуучин шигээ нээлттэй). GAME_PAYWALL=off → нээлттэй.
//      Нээлттэй үед статик файл шиг кэшлэгдэнэ (public, max-age=0, must-revalidate + ETag → 304), noindex-гүй.
//   2а) Эхлэх хуудасны realm төлбөргүй (ж: GAME_PAYWALL_REALMS=cm үеийн ?realm=ws) → тэр realm-д нээлттэй (2-тай адил).
//   2б) Дэд файл: аль нэг realm төлбөргүй бол нээлттэй; үгүй бол энэ тоглоомын аль нэг realm-ийн хүчинтэй сесс → файл.
//   3) ?t=<launch тасалбар> (зөвхөн эхлэх хуудсанд; api/games.js launch гаргана): verifyTicket(g) → useJti (НЭГ удаа) →
//      sessionExp → Set-Cookie <тасалбарын realm-ийн cookie> (HttpOnly; Secure; SameSite=Lax; Path=/; ≤2 цаг, урилга 30 мин,
//      эрхийн дуусах огнооноос хэтрэхгүй) → 302 тасалбаргүй URL (ws бол ?realm=ws-тэй; URL-ийг хуулж хуваалцах боломжгүй).
//      Тасалбар хүчингүй/давтагдсан ч энэ тоглоом + realm-ийн хүчинтэй cookie байвал → 302 цэвэр URL (cookie шинэчлэхгүй).
//   4) Энэ тоглоом + хүсэлтийн realm-ийн хүчинтэй сесс (GM.verifySession(tok, g), claims.r === realm) → файл.
//   5) Бусад → 403 түгжээтэй хуудас (≤8KB, тоглоомын код агуулахгүй; iframe дотор бол parent-д
//      postMessage({type:'cm-game-locked', game})). DB алдаа → 503 (fail-closed).
// Cookie шалгалт DB-д хандахгүй: админ эрх цуцалснаас хойш ≤2 цагт хүчингүй болно (шинэ launch тэр даруй татгалзагдана).
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const GM = require('../api/_games');

// Тоглоом → файл. paths[0] = каноник нийтийн зам (= GM.GAMES[g].path), бусад нь ижил файлын хуучин богино зам.
// scripts/check-game-routes.js эндээс уншиж vercel.json-ийн маршрут/includeFiles-ийг шалгана.
function fileGame(file, paths) { return Object.freeze({ file: file, paths: Object.freeze(paths) }); }
const FILES = Object.freeze({
  sudoku:     fileGame('games/sudoku.html', ['/sudoku.html', '/sudoku']),
  play2048:   fileGame('games/play2048.html', ['/play2048.html', '/play2048']),
  numseq:     fileGame('games/numseq.html', ['/numseq.html', '/numseq']),
  myangat:    fileGame('games/myangat.html', ['/myangat.html', '/myangat']),
  xpdrop:     fileGame('games/xpdrop.html', ['/xpdrop.html', '/xpdrop']),
  sbh:        fileGame('games/songobodkhozh.html', ['/songobodkhozh.html', '/sbh']),
  mathmortal: Object.freeze({ dir: 'math-mortal', index: 'index.html', paths: Object.freeze(['/math-mortal/', '/math-mortal/index.html']) }),
});
// math-mortal-ийн дэд файл: зөвхөн хавтасны шууд хүүхэд .js/.css (налуу зураас, '..' боломжгүй)
const SUB_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}\.(js|css)$/;
const TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
});
const COOKIE_PREFIX = '__Host-cmg_';      // cyber-math.com (realm 'cm') — __Host-cmg_<g>
const COOKIE_PREFIX_WS = '__Host-cmgw_';  // Дасгалын төв (realm 'ws') — __Host-cmgw_<g>
const REALM_Q = 'realm';                  // эхлэх хуудасны realm: ?realm=ws (Дасгалын төв), байхгүй → cm
const LOCKED_MAX = 8192;
const GZIP_MIN = 1024;
// Gate нээлттэй үеийн кэш (хуучин @vercel/static-тэй адил: хөтөч хадгалж, ETag-аар дахин шалгана → 304)
const CACHE_PUBLIC = 'public, max-age=0, must-revalidate';

function cookieName(g, realm) { return (realm === 'ws' ? COOKIE_PREFIX_WS : COOKIE_PREFIX) + g; }
function reqRealm(q) { return q[REALM_Q] === 'ws' ? 'ws' : 'cm'; }
function has(o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }

// ───────────────────────── файл ─────────────────────────
// Vercel: includeFiles нь төслийн root-оос харьцангуй замаараа багцлагдана (энэ файл gate/ дотор).
let _root = null;
function root() {
  if (_root) return _root;
  const cand = [path.resolve(__dirname, '..'), process.cwd()];
  for (let i = 0; i < cand.length; i++) {
    try { if (fs.statSync(path.join(cand[i], 'games')).isDirectory()) { _root = cand[i]; return _root; } } catch (e) { /* дараагийнх */ }
  }
  _root = cand[0];
  return _root;
}
const _dirs = new Map();
function dirFiles(dir) {
  let s = _dirs.get(dir);
  if (s) return s;
  s = new Set();
  try { fs.readdirSync(path.join(root(), dir)).forEach(function (n) { if (SUB_FILE_RE.test(n)) s.add(n); }); }
  catch (e) { console.error('[gate] хавтас уншигдсангүй', dir, e && e.message); }
  _dirs.set(dir, s);
  return s;
}
// (g, f) → { g, rel, entry } | null (404). entry = эхлэх хуудас (тасалбар зөвхөн энд хүлээн авна).
function target(g, f) {
  if (!has(FILES, g)) return null;
  const F = FILES[g];
  if (F.file) return { g: g, rel: F.file, entry: true };   // нэг файлтай тоглоом: f-ийг огт хэрэглэхгүй
  if (f == null || f === '' || f === F.index) return { g: g, rel: F.dir + '/' + F.index, entry: true };
  if (typeof f !== 'string' || !SUB_FILE_RE.test(f) || !dirFiles(F.dir).has(f)) return null;
  return { g: g, rel: F.dir + '/' + f, entry: false };
}
const _cache = new Map();   // rel → { raw, gz, type } (функцийн instance-ийн санах ойд)
function load(rel) {
  let c = _cache.get(rel);
  if (c) return c;
  const base = root();
  const abs = path.resolve(base, rel);
  // Давхар хамгаалалт: зөвхөн games/ эсвэл math-mortal/-ийн ШУУД хүүхэд файл (api/, .env гэх мэт хэзээ ч биш)
  const dir = path.dirname(abs);
  if (dir !== path.join(base, 'games') && dir !== path.join(base, FILES.mathmortal.dir)) throw new Error('gate: зам буруу');
  const raw = fs.readFileSync(abs);
  const h = crypto.createHash('sha256').update(raw).digest('base64url').slice(0, 27);
  // ETag representation бүрт өөр (Vary: Accept-Encoding): түүхий "g<hash>", gzip "g<hash>-gz"
  c = { raw: raw, gz: null, type: TYPES[path.extname(rel)] || 'application/octet-stream', etag: '"g' + h + '"', etagGz: '"g' + h + '-gz"' };
  _cache.set(rel, c);
  return c;
}
// If-None-Match (жагсаалт, W/ угтвар, *) нь энэ ETag-тай таарах эсэх
function etagMatch(req, tag) {
  const v = req && req.headers && req.headers['if-none-match'];
  if (typeof v !== 'string' || !v) return false;
  return v.split(',').some(function (x) {
    x = x.trim();
    if (x === '*') return true;
    if (x.slice(0, 2) === 'W/') x = x.slice(2);
    return x === tag;
  });
}

// ───────────────────────── хүсэлт ─────────────────────────
// req.url-ийн query + req.query (Vercel маршрутын dest-ийн g/f нэгдсэн). Мөр биш утгыг (массив → эхнийх) хаяна.
function queryOf(req) {
  const out = Object.create(null);
  const u = String((req && req.url) || '');
  const i = u.indexOf('?');
  if (i >= 0) {
    try { new URLSearchParams(u.slice(i + 1)).forEach(function (v, k) { if (!(k in out)) out[k] = v; }); } catch (e) { /* буруу query */ }
  }
  const q = (req && req.query) || {};
  Object.keys(q).forEach(function (k) {
    const v = Array.isArray(q[k]) ? q[k][0] : q[k];
    if (typeof v === 'string') out[k] = v;
  });
  return out;
}
function pathOf(req) {
  const u = String((req && req.url) || '');
  const i = u.indexOf('?');
  return i >= 0 ? u.slice(0, i) : u;
}
// Тасалбаргүй цэвэр URL: хэрэглэгчийн нээсэн нийтийн зам (allowlist-д байвал) эсвэл каноник зам + бусад query (g/f/t-гүй).
// realm: 'ws' → ?realm=ws (эхэнд), бусад → realm-гүй (ирсэн realm-ийг хасна). Зөвхөн allowlist-ийн замаас бүтнэ — open redirect боломжгүй.
const DROP_Q = ['g', 'f', 't', REALM_Q];
function cleanUrl(req, g, q, realm) {
  const F = FILES[g];
  const p = pathOf(req);
  const base = F.paths.indexOf(p) >= 0 ? p : F.paths[0];
  const sp = new URLSearchParams();
  if (realm === 'ws') sp.append(REALM_Q, 'ws');
  let n = 0;
  Object.keys(q).forEach(function (k) {
    if (DROP_Q.indexOf(k) >= 0 || n >= 20 || k.length > 64 || q[k].length > 512) return;
    sp.append(k, q[k]); n++;
  });
  const s = sp.toString();
  return base + (s ? '?' + s : '');
}
function cookieOf(req, name) {
  const h = req && req.headers && req.headers.cookie;
  if (typeof h !== 'string' || !h) return null;
  const parts = h.split(';');
  for (let i = 0; i < parts.length; i++) {
    const s = parts[i].trim();
    const eq = s.indexOf('=');
    if (eq <= 0 || s.slice(0, eq) !== name) continue;
    let v = s.slice(eq + 1).trim();
    if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1);
    return v;
  }
  return null;
}
// → { present, claims } — claims нь зөвхөн ЭНЭ тоглоом + ЭНЭ realm-ийн хүчинтэй сесс (typ 'gs', g тохирно, r === realm,
// хугацаа дуусаагүй). Өөр realm-ийн сессийг энэ realm-ийн cookie нэрээр илгээсэн ч хүчингүй.
function sessionOf(req, g, realm) {
  const v = cookieOf(req, cookieName(g, realm));
  if (!v) return { present: false, claims: null };
  const c = GM.verifySession(v, g);
  return { present: true, claims: c && c.r === realm ? c : null };
}
function setCookie(g, realm, token, maxAge) {
  return cookieName(g, realm) + '=' + token + '; Path=/; Max-Age=' + maxAge + '; HttpOnly; Secure; SameSite=Lax';
}
function clearCookie(g, realm) { return cookieName(g, realm) + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'; }

// ───────────────────────── хариу ─────────────────────────
// pub: gate нээлттэй (mode 'off') — кэшлэгдэх, индекслэгдэх нийтийн файл. Бусад (түгжээ, сесстэй файл) — private, no-store, noindex.
function common(res, pub) {
  res.setHeader('Cache-Control', pub ? CACHE_PUBLIC : 'private, no-store');
  if (!pub) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "frame-ancestors 'self'");
}
function send(res, status, type, body, head) {
  res.statusCode = status;
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Length', String(body.length));
  if (head) res.end(); else res.end(body);
}
function redirect(res, loc, cookie) {
  res.statusCode = 302;
  res.setHeader('Location', loc);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Game-Gate', cookie ? 'ticket' : 'redirect');
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.end();
}
// mode: 'off' (gate/realm нээлттэй — нийтийн кэш + ETag/304) | 'open' (сесстэй — private, no-store, ETag-гүй)
function serveFile(req, res, t, mode, head) {
  let c;
  try { c = load(t.rel); }
  catch (e) {
    console.error('[gate] файл олдсонгүй (includeFiles?)', t.rel, e && e.message);
    return locked(res, t, 503, null, head);
  }
  const pub = mode === 'off';
  common(res, pub);
  res.setHeader('Vary', pub ? 'Accept-Encoding' : 'Cookie, Accept-Encoding');
  res.setHeader('X-Game-Gate', mode);
  const ae = String((req.headers && req.headers['accept-encoding']) || '');
  const gz = c.raw.length >= GZIP_MIN && /\bgzip\b/i.test(ae);
  if (pub) {
    const tag = gz ? c.etagGz : c.etag;
    res.setHeader('ETag', tag);
    if (etagMatch(req, tag)) { res.statusCode = 304; return res.end(); }
  }
  let body = c.raw;
  if (gz) {
    if (!c.gz) c.gz = zlib.gzipSync(c.raw, { level: 6 });
    body = c.gz;
    res.setHeader('Content-Encoding', 'gzip');
  }
  send(res, 200, c.type, body, head);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, function (ch) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
  });
}
const LOCK_SVG = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/>' +
  '<path d="M8 11V7a4 4 0 0 1 8 0v4"/><circle cx="12" cy="16" r="1.2" fill="currentColor"/></svg>';
const WARN_SVG = '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/>' +
  '<path d="M12 7.5v5.5"/><circle cx="12" cy="16.5" r="1" fill="currentColor"/></svg>';
// Түгжээтэй хуудас: тоглоомын код агуулахгүй, ≤8KB. g нь FILES allowlist-ийн түлхүүр (JSON-оор script-д орно).
function lockedHtml(g, status) {
  const G = GM.GAMES[g] || { title: 'Тоглоом' };
  const err = status === 503;
  const h1 = err ? 'Түр алдаа гарлаа' : 'Эрх шаардлагатай';
  const p = err
    ? 'Тоглоомыг одоо нээж чадсангүй. Хэсэг хүлээгээд дахин оролдоно уу.'
    : '«' + esc(G.title) + '» тоглоомыг тоглохын тулд 1 сарын эрх (' + GM.gamePrice() + '₮) авна уу. ' +
      'Эрх авсны дараа тоглоомын картаас дахин нээнэ үү.';
  const note = err || !G.multi ? '' : '<p class="n">Найз тань эрхтэй бол түүний урилгын холбоосоор үнэгүй нэгдэж болно.</p>';
  const msg = JSON.stringify({ type: 'cm-game-locked', game: g, reason: err ? 'error' : 'locked' }).replace(/</g, '\\u003c');
  return '<!doctype html><html lang="mn"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">' +
    '<title>' + h1 + ' · CyberMath</title><style>' +
    ':root{--bg:#faf8ff;--card:#fff;--text:#1a1a2e;--muted:#6b7280;--accent:#7b52ee;--accent2:#9b3fd4;--line:#e9e3fb;--link:#7b52ee}' +
    '@media (prefers-color-scheme:dark){:root{--bg:#14112e;--card:#211c54;--text:#f3f0ff;--muted:#b8b2d9;--line:#3a3378;--link:#c9b8ff}}' +
    '*{box-sizing:border-box}html,body{margin:0;height:100%}' +
    'body{font-family:"Baloo 2",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);' +
    'display:flex;align-items:center;justify-content:center;padding:16px}' +
    '.c{max-width:420px;width:100%;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:28px 22px;' +
    'text-align:center;box-shadow:0 10px 30px rgba(60,30,140,.12)}' +
    '.i{width:72px;height:72px;margin:0 auto 14px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
    'color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2))}' +
    'h1{font-size:22px;margin:0 0 8px}p{margin:0 0 18px;line-height:1.5;color:var(--muted);font-size:15px}' +
    '.n{font-size:13px;margin-top:-6px}' +
    '.b{display:flex;flex-direction:column;gap:10px}a{display:block;padding:12px 16px;border-radius:12px;font-weight:700;' +
    'text-decoration:none;font-size:15px}a.p{color:#fff;background:linear-gradient(135deg,var(--accent),var(--accent2))}' +
    'a.s{color:var(--link);border:1.5px solid var(--line)}' +
    '</style></head><body><main class="c"><div class="i">' + (err ? WARN_SVG : LOCK_SVG) + '</div>' +
    '<h1>' + h1 + '</h1><p>' + p + '</p>' + note +
    '<div class="b"><a class="p" href="/#games" target="_top">cyber-math.com руу буцах</a>' +
    '<a class="s" href="/worksheets#games" target="_top">Дасгалын төв</a></div></main>' +
    '<script>(function(){try{if(window.parent&&window.parent!==window){window.parent.postMessage(' + msg +
    ',location.origin);}}catch(e){}})();</script></body></html>';
}
// Эхлэх хуудас → HTML түгжээ; дэд файл (js/css) → богино текст (nosniff — ажиллахгүй).
// clearRealm: тэр realm-ийн хүчингүй cookie ирсэн бол устгана (null → устгахгүй).
function locked(res, t, status, clearRealm, head) {
  common(res, false);
  res.setHeader('Vary', 'Cookie');
  res.setHeader('X-Game-Gate', status === 503 ? 'error' : 'locked');
  if (clearRealm) res.setHeader('Set-Cookie', clearCookie(t.g, clearRealm));
  if (t.entry) return send(res, status, 'text/html; charset=utf-8', Buffer.from(lockedHtml(t.g, status), 'utf8'), head);
  return send(res, status, 'text/plain; charset=utf-8', Buffer.from(status === 503 ? 'unavailable' : 'locked', 'utf8'), head);
}

// ───────────────────────── handler ─────────────────────────
async function gate(req, res) {
  const method = String((req && req.method) || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') {
    common(res);
    res.setHeader('Allow', 'GET, HEAD');
    return send(res, 405, 'text/plain; charset=utf-8', Buffer.from('method not allowed'), false);
  }
  const head = method === 'HEAD';
  const q = queryOf(req);
  const t = target(q.g, q.f);
  if (!t) {
    common(res);
    res.setHeader('X-Game-Gate', 'none');
    return send(res, 404, 'text/plain; charset=utf-8', Buffer.from('not found'), head);
  }
  const tok = t.entry && typeof q.t === 'string' && q.t ? q.t : null;
  const rq = t.entry ? reqRealm(q) : null;   // эхлэх хуудасны realm (дэд файлд realm-гүй)
  try {
    // Gate нээлттэй (cyber-math.com төлбөргүй — эхний ээлж, эсвэл kill-switch): бүгд нээлттэй (одоогийнх шиг)
    if (!GM.gateOn()) {
      if (tok) return redirect(res, cleanUrl(req, t.g, q, rq), null);
      return serveFile(req, res, t, 'off', head);
    }
    // math-mortal-ийн дэд js/css: аль нэг realm төлбөргүй бол (тэр realm-ийн эхлэх хуудас нээлттэй) нээлттэй, үгүй бол
    // энэ тоглоомын аль нэг realm-ийн хүчинтэй сесс. Эхлэх хуудас нь realm-аараа түгжээтэй хэвээр тул өөр сайтад нээгдэхгүй.
    if (!t.entry) {
      if (GM.REALMS.some(function (r) { return !GM.paywallOn(r); })) return serveFile(req, res, t, 'off', head);
      if (GM.REALMS.some(function (r) { return !!sessionOf(req, t.g, r).claims; })) return serveFile(req, res, t, 'open', head);
      return locked(res, t, 403, null, head);
    }
    // Энэ эхлэх хуудасны realm төлбөргүй (ж: GAME_PAYWALL_REALMS=cm үеийн ?realm=ws) — тэр realm-д нээлттэй
    if (!GM.paywallOn(rq)) {
      if (tok) return redirect(res, cleanUrl(req, t.g, q, rq), null);
      return serveFile(req, res, t, 'off', head);
    }
    const sess = sessionOf(req, t.g, rq);
    if (tok) {
      const c = GM.verifyTicket(tok, t.g);
      // jti-г НЭГ удаа: давтсан тасалбар (URL хуулж хуваалцсан) cookie гаргахгүй. DB алдаа → throw → 503.
      // Cookie + цэвэр URL нь тасалбарын realm-аар (c.r) — URL-ийн ?realm-ийг сольсон ч өөр сайтын сесс гарахгүй.
      if (c && await GM.useJti(c.jti, c.exp)) {
        const exp = GM.sessionExp(c);
        if (exp) {
          const maxAge = exp - Math.floor(Date.now() / 1000);
          if (maxAge > 0) return redirect(res, cleanUrl(req, t.g, q, c.r), setCookie(t.g, c.r, GM.signSession(c, exp), maxAge));
        }
      }
      if (sess.claims) return redirect(res, cleanUrl(req, t.g, q, rq), null);
      return locked(res, t, 403, sess.present ? rq : null, head);
    }
    if (sess.claims) return serveFile(req, res, t, 'open', head);
    return locked(res, t, 403, sess.present ? rq : null, head);
  } catch (e) {
    console.error('[gate]', t.g, e && e.message);
    return locked(res, t, 503, null, head);
  }
}

module.exports = gate;
module.exports.FILES = FILES;
module.exports.SUB_FILE_RE = SUB_FILE_RE;
module.exports.COOKIE_PREFIX = COOKIE_PREFIX;
module.exports.COOKIE_PREFIX_WS = COOKIE_PREFIX_WS;
module.exports.REALM_Q = REALM_Q;
module.exports.CACHE_PUBLIC = CACHE_PUBLIC;
module.exports.LOCKED_MAX = LOCKED_MAX;
module.exports.cookieName = cookieName;
module.exports.lockedHtml = lockedHtml;
