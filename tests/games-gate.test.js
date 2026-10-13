// gate/game.js — тоглоомын сервер gate (тасалбар → HttpOnly cookie → файл) + vercel.json маршрут/build шалгалт
// + scripts/verify-game-gate.js-ийг локал Vercel-ийн маршрутын эмуляторын эсрэг.
// Ажиллуулах: node tests/games-gate.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js; сүлжээ зөвхөн 127.0.0.1)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const crypto = require('crypto');

const gate = require(path.join(F.WT, 'gate', 'game.js'));
const games = require(path.join(F.API, 'games.js'));
const GM = require(path.join(F.API, '_games.js'));
const CHK = require(path.join(F.WT, 'scripts', 'check-game-routes.js'));
const VER = require(path.join(F.WT, 'scripts', 'verify-game-gate.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const VERCEL = JSON.parse(fs.readFileSync(path.join(F.WT, 'vercel.json'), 'utf8'));

const ENTRY = { sudoku: 'games/sudoku.html', play2048: 'games/play2048.html', numseq: 'games/numseq.html',
  myangat: 'games/myangat.html', xpdrop: 'games/xpdrop.html', sbh: 'games/songobodkhozh.html', mathmortal: 'math-mortal/index.html' };
const FILE = (rel) => fs.readFileSync(path.join(F.WT, rel));
const MM_SUBS = fs.readdirSync(path.join(F.WT, 'math-mortal')).filter((n) => /\.(js|css)$/.test(n));
// Файлын дундаас авсан 48 байт (код/өгөгдөл) — түгжээтэй хуудсанд гарах ёсгүй
const marker = (rel) => { const b = FILE(rel).toString('utf8'); const m = Math.floor(b.length / 2); return b.slice(m, m + 48); };
const SUB = () => GM.subjectOf('cm', 'a@x.mn');
const ticket = (g, o) => GM.signTicket(Object.assign({ g: g, r: 'cm', sub: SUB() }, o || {})).token;
const derived = (purpose) => crypto.createHmac('sha256', SEC).update(purpose).digest();
const K_SESS = 'cybermath/game-session/v1';
const hex32 = () => crypto.randomBytes(16).toString('hex');
function payload(tok) { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8')); }

function mkRes() {
  const h = {};
  return {
    statusCode: 200, headers: h, body: null, ended: 0,
    setHeader(k, v) { h[String(k).toLowerCase()] = v; },
    getHeader(k) { return h[String(k).toLowerCase()]; },
    end(b) { this.ended++; this.body = b == null ? null : (Buffer.isBuffer(b) ? b : Buffer.from(String(b))); return this; },
  };
}
// o: { g, f, t, url, cookie, method, headers, query } — url өгөөгүй бол Vercel-ийн дотоод зам (/gate/game.js?…)
async function hit(o) {
  o = o || {};
  const query = Object.assign({}, o.query || {});
  if (o.g !== undefined) query.g = o.g;
  if (o.f !== undefined) query.f = o.f;
  if (o.t !== undefined) query.t = o.t;
  const req = { method: o.method || 'GET', url: o.url || ('/gate/game.js?' + new URLSearchParams(query).toString()), query: query, headers: Object.assign({}, o.headers || {}) };
  if (o.cookie) req.headers.cookie = o.cookie;
  const res = mkRes();
  await gate(req, res);
  assert.strictEqual(res.ended, 1, 'res.end() яг нэг удаа');
  return res;
}
const SC_RE = /^(__Host-cmg_[a-z0-9]+)=([^;]+); Path=\/; Max-Age=(\d+); HttpOnly; Secure; SameSite=Lax$/;
function cookieOf(res) {
  const sc = res.headers['set-cookie'];
  const m = SC_RE.exec(String(sc || ''));
  assert.ok(m, 'Set-Cookie хэлбэр: ' + sc);
  return { pair: m[1] + '=' + m[2], name: m[1], value: m[2], maxAge: Number(m[3]) };
}
// Тасалбараар cookie авах (302)
async function enter(g, o) {
  const r = await hit(Object.assign({ g: g, t: ticket(g, o && o.tk) }, (o && o.req) || {}));
  assert.strictEqual(r.statusCode, 302, g + ' тасалбар → 302 ' + (r.body && r.body.toString().slice(0, 80)));
  return cookieOf(r);
}
async function shifted(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try { return await fn(); } finally { Date.now = real; }
}
function assertLocked(r, g, status) {
  assert.strictEqual(r.statusCode, status || 403, g);
  assert.strictEqual(r.headers['x-game-gate'], (status || 403) === 503 ? 'error' : 'locked', g);
  assert.strictEqual(r.headers['cache-control'], 'private, no-store', g);
  assert.strictEqual(r.headers['x-frame-options'], 'SAMEORIGIN', g);
  const body = r.body ? r.body.toString('utf8') : '';
  if (ENTRY[g] && !r.headers['content-type'].startsWith('text/plain')) {
    assert.match(r.headers['content-type'], /^text\/html/, g);
    assert.ok(r.body.length <= gate.LOCKED_MAX, g + ' түгжээтэй хуудас ≤8KB (' + r.body.length + ')');
    assert.ok(body.indexOf(marker(ENTRY[g])) < 0, g + ': тоглоомын код агуулахгүй');
  }
  return body;
}

beforeEach(() => F.reset());

// ───────────────────────── түгжээ ─────────────────────────
test('тасалбар/cookie-гүй → 403 түгжээтэй хуудас (7 тоглоом): ≤8KB, кодгүй, SVG цоож, буцах холбоос, iframe → postMessage', async () => {
  for (const g of Object.keys(gate.FILES)) {
    const r = await hit({ g: g });
    const body = assertLocked(r, g);
    assert.strictEqual(r.headers['set-cookie'], undefined, g + ': cookie тавихгүй');
    assert.match(body, /Эрх шаардлагатай/);
    assert.ok(body.indexOf('«' + GM.GAMES[g].title + '»') >= 0, g + ': тоглоомын нэр');
    assert.ok(body.indexOf(GM.gamePrice() + '₮') >= 0, g + ': үнэ серверээс');
    assert.match(body, /href="\/#games" target="_top"/);
    assert.match(body, /href="\/worksheets#games" target="_top"/);
    assert.match(body, /<svg[^>]*>/);
    assert.ok(body.indexOf('"type":"cm-game-locked","game":"' + g + '"') >= 0, g + ': parent-д мэдэгдэнэ');
    assert.match(body, /postMessage\([^)]*,location\.origin\)/, 'targetOrigin = өөрийн origin');
    assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(/i.test(body), g + ': гадны нөөц ачаалахгүй');
    assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body), g + ': эможигүй');
  }
  // math-mortal-ийн JS/CSS cookie-гүй → 403 текст (код биш)
  for (const n of MM_SUBS) {
    const r = await hit({ g: 'mathmortal', f: n });
    assertLocked(r, 'mathmortal:' + n);
    assert.match(r.headers['content-type'], /^text\/plain/);
    assert.strictEqual(r.body.toString(), 'locked');
    assert.strictEqual(r.headers['x-content-type-options'], 'nosniff');
  }
});

// ───────────────────────── тасалбар → cookie → файл ─────────────────────────
test('хүчинтэй тасалбар → 302 тасалбаргүй URL + __Host-cmg_<g> (HttpOnly; Secure; SameSite=Lax; Path=/; ≤2 цаг) → файл', async () => {
  for (const g of Object.keys(gate.FILES)) {
    const pub = gate.FILES[g].paths[0];
    const r = await hit({ g: g, f: g === 'mathmortal' ? 'index.html' : undefined, t: ticket(g), url: pub + '?t=xyz' });
    assert.strictEqual(r.statusCode, 302, g);
    assert.strictEqual(r.headers.location, pub, g + ': тасалбаргүй цэвэр URL');
    assert.strictEqual(r.headers['x-game-gate'], 'ticket');
    assert.strictEqual(r.headers['referrer-policy'], 'no-referrer');
    assert.strictEqual(r.headers['cache-control'], 'private, no-store');
    const c = cookieOf(r);
    assert.strictEqual(c.name, '__Host-cmg_' + g);
    assert.ok(c.maxAge > 7190 && c.maxAge <= 7200, g + ' Max-Age ' + c.maxAge);
    const p = payload(c.value);
    assert.strictEqual(p.typ, 'gs');
    assert.strictEqual(p.g, g);
    assert.ok(!/@/.test(JSON.stringify(p)), 'сесс имэйлгүй');

    const o = await hit({ g: g, cookie: c.pair });
    assert.strictEqual(o.statusCode, 200, g);
    assert.ok(o.body.equals(FILE(ENTRY[g])), g + ': файлын агуулга яг');
    assert.match(o.headers['content-type'], /^text\/html; charset=utf-8$/);
    assert.strictEqual(o.headers['cache-control'], 'private, no-store');
    assert.match(o.headers.vary, /Cookie/);
    assert.strictEqual(o.headers['x-frame-options'], 'SAMEORIGIN');
    assert.strictEqual(o.headers['content-security-policy'], "frame-ancestors 'self'");
    assert.strictEqual(o.headers['referrer-policy'], 'same-origin');
    assert.match(o.headers['x-robots-tag'], /noindex/);
    assert.strictEqual(o.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(o.headers['x-game-gate'], 'open');
    assert.strictEqual(o.headers['set-cookie'], undefined);
  }
  assert.strictEqual(F.db.tix.size, 7, 'jti бүр game_ticket_used-д');
});

test('давтсан тасалбар → 403 (jti нэг удаа); cookie-той бол цэвэр URL руу 302 (шинэ cookie үгүй)', async () => {
  const t = ticket('sudoku');
  const a = await hit({ g: 'sudoku', t: t });
  assert.strictEqual(a.statusCode, 302);
  const c = cookieOf(a);
  const b = await hit({ g: 'sudoku', t: t });
  assertLocked(b, 'sudoku');
  assert.strictEqual(b.headers['set-cookie'], undefined, 'давтсан тасалбар cookie гаргахгүй');
  const d = await hit({ g: 'sudoku', t: t, cookie: c.pair, url: '/sudoku?t=' + t });
  assert.strictEqual(d.statusCode, 302);
  assert.strictEqual(d.headers.location, '/sudoku');
  assert.strictEqual(d.headers['set-cookie'], undefined);
  assert.strictEqual(F.db.tix.size, 1);
  // хоосон t → тасалбаргүй гэж үзнэ
  assertLocked(await hit({ g: 'sudoku', t: '' }), 'sudoku');
});

test('тоглоом хоорондын тусгаарлалт: sudoku-гийн тасалбар/cookie play2048-ийг нээхгүй (нэрийг нь сольсон ч)', async () => {
  const c = await enter('sudoku');
  // sudoku тасалбар play2048-д → хүчингүй, jti зарцуулахгүй
  const t2 = ticket('sudoku');
  const a = await hit({ g: 'play2048', t: t2 });
  assertLocked(a, 'play2048');
  assert.strictEqual(F.db.tix.size, 1, 'g зөрсөн тасалбарын jti зарцуулагдахгүй');
  assert.strictEqual((await hit({ g: 'sudoku', t: t2 })).statusCode, 302, 'sudoku-д хүчинтэй хэвээр');
  // sudoku cookie (өөрийн нэрээр) → play2048 түгжээ
  assertLocked(await hit({ g: 'play2048', cookie: c.pair }), 'play2048');
  // sudoku-гийн сессийг play2048-ийн cookie нэрээр → түгжээ + хүчингүй cookie устгана
  const r = await hit({ g: 'play2048', cookie: '__Host-cmg_play2048=' + c.value });
  assertLocked(r, 'play2048');
  assert.strictEqual(r.headers['set-cookie'], '__Host-cmg_play2048=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax');
  // mathmortal-ийн JS-ийг sudoku cookie-оор → түгжээ
  assertLocked(await hit({ g: 'mathmortal', f: 'main.js', cookie: '__Host-cmg_mathmortal=' + c.value }), 'mathmortal');
  // олон cookie-той толгойгоос зөвийг нь сонгоно
  const o = await hit({ g: 'sudoku', cookie: 'a=1; __Host-cmg_play2048=x; ' + c.pair + '; z=2' });
  assert.strictEqual(o.statusCode, 200);
});

test('хуурамч/өөр зориулалтын токен: тасалбар↔сесс солилцохгүй, JWT_SECRET-ээр шууд, alg none, урт амьдралтай, хугацаа дууссан', async () => {
  const t = ticket('sudoku');
  // launch тасалбарыг cookie болгох → хүчингүй
  assertLocked(await hit({ g: 'sudoku', cookie: '__Host-cmg_sudoku=' + t }), 'sudoku');
  // сессийг тасалбар болгох → хүчингүй, cookie гаргахгүй
  const c = await enter('sudoku');
  const r = await hit({ g: 'sudoku', t: c.value });
  assertLocked(r, 'sudoku');
  assert.strictEqual(r.headers['set-cookie'], undefined, 'сесс токеныг тасалбар болгож cookie авахгүй');
  const now = Math.floor(Date.now() / 1000);
  const claims = { typ: 'gs', g: 'sudoku', r: 'cm', sub: 'admin', iat: now, exp: now + 600 };
  const bad = [
    ['JWT_SECRET-ээр шууд', jwt.sign(claims, SEC, { jwtid: hex32() })],
    ['өөр түлхүүр', jwt.sign(claims, 'other', { jwtid: hex32() })],
    ['alg none', jwt.sign(claims, null, { algorithm: 'none', jwtid: hex32() })],
    ['typ буруу', jwt.sign(Object.assign({}, claims, { typ: 'glt' }), derived(K_SESS), { jwtid: hex32() })],
    ['2 цагаас урт', jwt.sign(Object.assign({}, claims, { exp: now + 7201 }), derived(K_SESS), { jwtid: hex32() })],
    ['имэйл sub', jwt.sign(Object.assign({}, claims, { sub: 'a@x.mn' }), derived(K_SESS), { jwtid: hex32() })],
    ['jti-гүй', jwt.sign(claims, derived(K_SESS))],
    ['cm нэвтрэлтийн токен', jwt.sign({ email: 'a@x.mn', role: 'student', tv: 0 }, SEC)],
    ['админ токен', jwt.sign({ admin: true }, SEC)],
  ];
  for (const [msg, tok] of bad) assertLocked(await hit({ g: 'sudoku', cookie: '__Host-cmg_sudoku=' + tok }), msg);
  // зөв түлхүүрээр (хяналт) → нээгдэнэ
  const ok = jwt.sign(claims, derived(K_SESS), { jwtid: hex32() });
  assert.strictEqual((await hit({ g: 'sudoku', cookie: '__Host-cmg_sudoku=' + ok })).statusCode, 200);
  // тасалбар 120 сек-ийн дараа хүчингүй
  const late = ticket('sudoku');
  await shifted(121 * 1000, async () => { assertLocked(await hit({ g: 'sudoku', t: late }), 'sudoku'); });
  // сесс 2 цагийн дараа хүчингүй (+ cookie устгана)
  await shifted(7201 * 1000, async () => {
    const x = await hit({ g: 'sudoku', cookie: c.pair });
    assertLocked(x, 'sudoku');
    assert.match(String(x.headers['set-cookie']), /Max-Age=0/);
  });
});

// ───────────────────────── зам/файл ─────────────────────────
test('g/f allowlist: path traversal, мэдэгдэхгүй файл, inline/гадны тоглоом → 404 (cookie-той ч)', async () => {
  const c = await enter('mathmortal');
  const badF = ['../api/qpay.js', '..%2Fapi%2Fqpay.js', '../../etc/passwd', '/etc/passwd', 'assets/x.js', 'assets/../main.js',
    '.env', 'main.JS', 'nope.js', 'index.htm', 'main.js/', 'a/../main.js', '..', '.', 'main.js\u0000.png', 'main.js?x', ' main.js',
    '..\\api\\qpay.js', 'cover.webp', 'index.html.js'];
  for (const f of badF) {
    const r = await hit({ g: 'mathmortal', f: f, cookie: c.pair });
    assert.strictEqual(r.statusCode, 404, JSON.stringify(f));
    assert.strictEqual(r.body.toString(), 'not found');
    assert.strictEqual(r.headers['x-game-gate'], 'none');
  }
  const s = await enter('sudoku');
  // нэг файлтай тоглоом f-ийг огт хэрэглэхгүй — үргэлж өөрийн файл (өөр файл руу хазайхгүй)
  for (const f of ['index.html', 'play2048.html', '../api/qpay.js', '../games/xpdrop.html']) {
    const r = await hit({ g: 'sudoku', f: f, cookie: s.pair });
    assert.strictEqual(r.statusCode, 200, f);
    assert.ok(r.body.equals(FILE(ENTRY.sudoku)), f);
  }
  for (const g of ['__proto__', 'constructor', 'hasOwnProperty', 'SUDOKU', '', 'blockblast', 'chessmath', 'gomoku', 'nope', undefined]) {
    const r = await hit({ g: g });
    assert.strictEqual(r.statusCode, 404, String(g));
  }
  // g массив (query давхардсан) → эхнийх
  const arr = await hit({ query: { g: ['sudoku', 'play2048'] }, cookie: s.pair });
  assert.strictEqual(arr.statusCode, 200);
});

test('MATH MORTAL: /math-mortal/?t= → 302 /math-mortal/; cookie-оор index + бүх js/css зөв Content-Type-тай', async () => {
  const r = await hit({ g: 'mathmortal', f: 'index.html', t: ticket('mathmortal'), url: '/math-mortal/?t=1' });
  assert.strictEqual(r.statusCode, 302);
  assert.strictEqual(r.headers.location, '/math-mortal/');
  const c = cookieOf(r);
  const r2 = await hit({ g: 'mathmortal', f: 'index.html', t: ticket('mathmortal'), url: '/math-mortal/index.html?t=1' });
  assert.strictEqual(r2.headers.location, '/math-mortal/index.html');
  assert.ok(MM_SUBS.indexOf('main.js') >= 0 && MM_SUBS.length >= 5);
  for (const n of MM_SUBS) {
    const o = await hit({ g: 'mathmortal', f: n, cookie: c.pair });
    assert.strictEqual(o.statusCode, 200, n);
    assert.ok(o.body.equals(FILE('math-mortal/' + n)), n);
    assert.strictEqual(o.headers['content-type'], n.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8', n);
    assert.strictEqual(o.headers['x-game-gate'], 'open');
  }
  // дэд файлд ирсэн ?t= тооцогдохгүй (тасалбар зөвхөн эхлэх хуудсанд)
  const j = await hit({ g: 'mathmortal', f: 'main.js', t: ticket('mathmortal') });
  assertLocked(j, 'mathmortal');
  assert.strictEqual(F.db.tix.size, 2);
});

test('сессийн хугацаа: эрхийн дуусах огноо (sx), урилга 30 мин, админ 2 цаг; sx өнгөрсөн бол cookie үгүй', async () => {
  const now = Math.floor(Date.now() / 1000);
  const a = await enter('sudoku', { tk: { sx: now + 600 } });
  assert.ok(a.maxAge <= 600 && a.maxAge >= 590, 'sx ' + a.maxAge);
  assert.ok(payload(a.value).exp <= now + 600);
  const i = await enter('sbh', { tk: { sub: 'inv:' + hex32() } });
  assert.ok(i.maxAge <= 1800 && i.maxAge > 1790, 'урилга ' + i.maxAge);
  const ad = await enter('play2048', { tk: { sub: 'admin' } });
  assert.ok(ad.maxAge > 7190 && ad.maxAge <= 7200, 'админ ' + ad.maxAge);
  // тасалбар гарснаас хойш эрх дууссан (sx өнгөрсөн) — тасалбар хүчинтэй ч сесс гаргахгүй
  const t = ticket('numseq', { sx: now + 30 });
  await shifted(60 * 1000, async () => {
    const r = await hit({ g: 'numseq', t: t });
    assertLocked(r, 'numseq');
    assert.strictEqual(r.headers['set-cookie'], undefined);
  });
});

test('GAME_PAYWALL=off → cookie-гүй шууд өгнө (X-Game-Gate: off); ?t= → цэвэр URL; DB-д хандахгүй', async () => {
  process.env.GAME_PAYWALL = 'off';
  for (const g of Object.keys(gate.FILES)) {
    const r = await hit({ g: g });
    assert.strictEqual(r.statusCode, 200, g);
    assert.strictEqual(r.headers['x-game-gate'], 'off');
    assert.ok(r.body.equals(FILE(ENTRY[g])), g);
  }
  const j = await hit({ g: 'mathmortal', f: 'main.js' });
  assert.strictEqual(j.statusCode, 200);
  const t = await hit({ g: 'xpdrop', t: 'anything', url: '/xpdrop.html?grade=7&t=anything', query: { grade: '7' } });
  assert.strictEqual(t.statusCode, 302);
  assert.strictEqual(t.headers.location, '/xpdrop.html?grade=7');
  assert.strictEqual(t.headers['set-cookie'], undefined);
  assert.strictEqual(F.db.tix.size, 0);
  // traversal off үед ч 404
  assert.strictEqual((await hit({ g: 'mathmortal', f: '../api/qpay.js' })).statusCode, 404);
});

test('DB алдаа (jti бичих) → 503 fail-closed, cookie үгүй; DB сэргэхэд ижил тасалбар ажиллана', async () => {
  const t = ticket('myangat');
  F.db.failTix = true;
  const r = await hit({ g: 'myangat', t: t });
  const body = assertLocked(r, 'myangat', 503);
  assert.match(body, /Түр алдаа/);
  assert.ok(body.indexOf('"reason":"error"') >= 0);
  assert.strictEqual(r.headers['set-cookie'], undefined);
  F.db.failTix = false;
  assert.strictEqual((await hit({ g: 'myangat', t: t })).statusCode, 302);
  // JWT_SECRET алга → тасалбар/сесс шалгагдахгүй → түгжээ (нээхгүй)
  const c = await enter('sudoku');
  const keep = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    assertLocked(await hit({ g: 'sudoku', cookie: c.pair }), 'sudoku');
    assertLocked(await hit({ g: 'sudoku', t: 'x.y.z' }), 'sudoku');
  } finally { process.env.JWT_SECRET = keep; }
});

test('цэвэр URL: нийтийн замыг хадгална (/xpdrop, /sbh), бусад query үлдэнэ, g/f/t хасна, open redirect үгүй', async () => {
  const cases = [
    ['/xpdrop.html?grade=7&t=T', { grade: '7' }, 'xpdrop', '/xpdrop.html?grade=7'],
    ['/xpdrop?t=T', {}, 'xpdrop', '/xpdrop'],
    ['/gate/game.js?g=xpdrop&t=T', {}, 'xpdrop', '/xpdrop.html'],
    ['//evil.example/x?t=T', {}, 'xpdrop', '/xpdrop.html'],
    ['/sbh?t=T', {}, 'sbh', '/sbh'],
    ['/songobodkhozh.html?t=T', {}, 'sbh', '/songobodkhozh.html'],
    ['/numseq.html?t=T&f=x&g=sudoku', {}, 'numseq', '/numseq.html'],
  ];
  for (const [url, extra, g, loc] of cases) {
    const r = await hit({ g: g, t: ticket(g), url: url, query: extra });
    assert.strictEqual(r.statusCode, 302, url);
    assert.strictEqual(r.headers.location, loc, url);
    assert.ok(/^\/(?!\/)/.test(r.headers.location));
  }
});

test('gzip (Accept-Encoding), HEAD, POST → 405', async () => {
  const c = await enter('myangat');
  const z = await hit({ g: 'myangat', cookie: c.pair, headers: { 'accept-encoding': 'gzip, deflate, br' } });
  assert.strictEqual(z.statusCode, 200);
  assert.strictEqual(z.headers['content-encoding'], 'gzip');
  assert.match(z.headers.vary, /Accept-Encoding/);
  assert.ok(zlib.gunzipSync(z.body).equals(FILE(ENTRY.myangat)));
  assert.ok(z.body.length < FILE(ENTRY.myangat).length);
  const z2 = await hit({ g: 'myangat', cookie: c.pair, headers: { 'accept-encoding': 'gzip' } });
  assert.ok(z2.body.equals(z.body), 'gzip кэш');
  const h = await hit({ g: 'myangat', cookie: c.pair, method: 'HEAD' });
  assert.strictEqual(h.statusCode, 200);
  assert.strictEqual(h.body, null);
  assert.strictEqual(h.headers['content-length'], String(FILE(ENTRY.myangat).length));
  const hl = await hit({ g: 'myangat', method: 'HEAD' });
  assert.strictEqual(hl.statusCode, 403);
  assert.strictEqual(hl.body, null);
  for (const m of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const p = await hit({ g: 'myangat', cookie: c.pair, method: m });
    assert.strictEqual(p.statusCode, 405, m);
    assert.strictEqual(p.headers.allow, 'GET, HEAD');
  }
});

// ───────────────────────── api/games.js launch → gate ─────────────────────────
const cmTok = (e) => jwt.sign({ email: e, role: 'student', tv: 0 }, SEC);
const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
function give(realm, email, key, days) {
  F.db.access.set(realm + '|' + email + '|' + key, { realm: realm, email: email, game_key: key, expires_at: new Date(Date.now() + days * F.DAY), updated_at: new Date() });
}
// Нийтийн URL-ийг vercel.json-ийн маршрутаар gate-ийн query болгож дуудна (Vercel-ийн адил)
async function viaRoute(url, cookie) {
  const u = new URL(url, 'https://cyber-math.com');
  const h = CHK.firstRoute(VERCEL.routes, u.pathname);
  assert.ok(h, 'маршрут ' + u.pathname);
  const d = CHK.resolveRoute(h);
  assert.strictEqual(d.path, '/gate/game.js', u.pathname + ' → gate');
  const query = {};
  u.searchParams.forEach((v, k) => { query[k] = v; });
  Object.assign(query, d.query);
  const req = { method: 'GET', url: u.pathname + u.search, query: query, headers: cookie ? { cookie: cookie } : {} };
  const res = mkRes();
  await gate(req, res);
  return res;
}
test('бүтэн урсгал: launch (cm/ws/админ) → url → маршрут → gate 302 + cookie → файл; эрхгүй → 402, url үгүй', async () => {
  F.addUser('a@x.mn');
  give('cm', 'a@x.mn', 'sudoku', 10);
  give('ws', 'w@x.mn', 'mathmortal', 0.01);   // ~14 мин үлдсэн → сесс эрхээс хэтрэхгүй
  const L = (body, headers) => F.call(games, { query: { action: 'launch' }, body: body, headers: headers });
  const cm = await L({ game: 'sudoku', realm: 'cm' }, { authorization: 'Bearer ' + cmTok('a@x.mn') });
  assert.strictEqual(cm.statusCode, 200, JSON.stringify(cm.body));
  assert.match(cm.body.url, /^\/sudoku\.html\?t=/);
  const r = await viaRoute(cm.body.url);
  assert.strictEqual(r.statusCode, 302);
  assert.strictEqual(r.headers.location, '/sudoku.html');
  const c = cookieOf(r);
  const o = await viaRoute('/sudoku.html', c.pair);
  assert.strictEqual(o.statusCode, 200);
  assert.ok(o.body.equals(FILE(ENTRY.sudoku)));
  assert.strictEqual((await viaRoute('/sudoku', c.pair)).statusCode, 200, '/sudoku богино зам');
  assertLocked(await viaRoute(cm.body.url), 'sudoku');   // давтсан launch URL

  const ws = await L({ game: 'mathmortal', realm: 'ws', wstoken: wsTok('w@x.mn') }, { 'x-device-id': 'devaaaa1' });
  assert.strictEqual(ws.statusCode, 200, JSON.stringify(ws.body));
  assert.match(ws.body.url, /^\/math-mortal\/\?t=/);
  const wr = await viaRoute(ws.body.url);
  assert.strictEqual(wr.statusCode, 302);
  assert.strictEqual(wr.headers.location, '/math-mortal/');
  const wc = cookieOf(wr);
  assert.ok(wc.maxAge <= 0.01 * 86400 + 1, 'эрхийн үлдсэн хугацаанаас хэтрэхгүй: ' + wc.maxAge);
  assert.strictEqual((await viaRoute('/math-mortal/main.js', wc.pair)).statusCode, 200);
  assert.strictEqual((await viaRoute('/math-mortal/game3d.js', wc.pair)).statusCode, 200);
  assertLocked(await viaRoute('/math-mortal/main.js'), 'mathmortal');

  const ad = await L({ game: 'xpdrop', realm: 'cm' }, { authorization: 'Bearer ' + jwt.sign({ admin: true }, SEC) });
  assert.strictEqual(ad.statusCode, 200);
  assert.strictEqual((await viaRoute(ad.body.url)).statusCode, 302);

  const no = await L({ game: 'play2048', realm: 'cm' }, { authorization: 'Bearer ' + cmTok('a@x.mn') });
  assert.strictEqual(no.statusCode, 402);
  assert.strictEqual(no.body.url, undefined);
  assertLocked(await viaRoute('/play2048.html'), 'play2048');

  // Kill-switch: launch тасалбаргүй url → gate шууд өгнө
  process.env.GAME_PAYWALL = 'off';
  const off = await L({ game: 'play2048', realm: 'cm' }, {});
  assert.strictEqual(off.body.url, '/play2048.html');
  const or = await viaRoute(off.body.url);
  assert.strictEqual(or.statusCode, 200);
  assert.strictEqual(or.headers['x-game-gate'], 'off');
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.qp.other, []);
});

// ───────────────────────── vercel.json / check-game-routes ─────────────────────────
test('vercel.json: check-game-routes OK; файлууд games/ руу зөөгдсөн; маршрутын симуляц', () => {
  const r = CHK.check(VERCEL);
  assert.deepStrictEqual(r.errors, []);
  assert.ok(r.ok && r.checked >= 40);
  for (const n of ['sudoku', 'play2048', 'numseq', 'myangat', 'xpdrop', 'songobodkhozh']) {
    assert.ok(!fs.existsSync(path.join(F.WT, n + '.html')), n + '.html root-д үлдээгүй');
    assert.ok(fs.existsSync(path.join(F.WT, 'games', n + '.html')), 'games/' + n + '.html');
  }
  const route = (p) => { const h = CHK.firstRoute(VERCEL.routes, p); return h ? CHK.resolveRoute(h) : null; };
  assert.deepStrictEqual(route('/sudoku.html'), { path: '/gate/game.js', query: { g: 'sudoku' } });
  assert.deepStrictEqual(route('/play2048'), { path: '/gate/game.js', query: { g: 'play2048' } });
  assert.deepStrictEqual(route('/sbh'), { path: '/gate/game.js', query: { g: 'sbh' } });
  assert.deepStrictEqual(route('/math-mortal/'), { path: '/gate/game.js', query: { g: 'mathmortal', f: 'index.html' } });
  assert.deepStrictEqual(route('/math-mortal/quiz.js'), { path: '/gate/game.js', query: { g: 'mathmortal', f: 'quiz.js' } });
  assert.deepStrictEqual(route('/math-mortal/cover.webp'), { path: '/math-mortal/cover.webp', query: {} });
  assert.strictEqual(route('/math-mortal/assets/a/b.glb').path, '/math-mortal/assets/a/b.glb');
  assert.deepStrictEqual(route('/mortal'), { redirect: '/math-mortal/', status: 301 });
  assert.strictEqual(route('/math-mortal/x/../main.js'), null, 'налуу зураастай дэд зам gate/статик маршрутгүй → 404');
  assert.strictEqual(route('/sudoku.htm'), null);
  assert.strictEqual(route('/xsudoku.html'), null);
  assert.strictEqual(route('/api/games').path, '/api/games.js');
  assert.strictEqual(route('/').path, '/index.html');
  assert.strictEqual(route('/xp').path, '/xp.html', 'xp.html хөндөгдөөгүй');
});

test('check-game-routes мутациуд: статик build, catch-all дараалал, includeFiles, маршрут/f дутуу → алдаа', () => {
  const clone = () => JSON.parse(JSON.stringify(VERCEL));
  const gi = (v) => v.routes.findIndex((r) => r.dest === '/gate/game.js?g=$1');
  const muts = [
    ['math-mortal/** static', (v) => v.builds.push({ src: 'math-mortal/**', use: '@vercel/static' }), /math-mortal\/\*\*.*хамгаалсан файлыг нийтэлнэ/],
    ['games/** static', (v) => v.builds.push({ src: 'games/**', use: '@vercel/static' }), /games\/\*\*/],
    ['**/*.html static', (v) => v.builds.push({ src: '**/*.html', use: '@vercel/static' }), /games\/sudoku\.html/],
    ['catch-all өмнө', (v) => v.routes.splice(gi(v), 0, { src: '/math-mortal/(.*)', dest: '/math-mortal/$1' }), /math-mortal\/main\.js: эхний маршрут/],
    ['хуучин статик маршрут өмнө', (v) => v.routes.unshift({ src: '/sudoku.html', dest: '/sudoku.html' }), /\/sudoku\.html: эхний маршрут/],
    ['includeFiles games/** хасав', (v) => { v.builds.find((b) => b.src === 'gate/game.js').config.includeFiles.shift(); }, /includeFiles хамрахгүй: games\/sudoku\.html/],
    ['includeFiles *.css хасав', (v) => { const b = v.builds.find((x) => x.src === 'gate/game.js'); b.config.includeFiles = b.config.includeFiles.filter((s) => !/css/.test(s)); }, /includeFiles хамрахгүй: math-mortal\/rosebud-game-defaults\.css/],
    ['gate build алга', (v) => { v.builds = v.builds.filter((b) => b.src !== 'gate/game.js'); }, /gate\/game\.js.*яг нэг удаа/],
    ['sudoku маршрут алга', (v) => { v.routes[gi(v)].src = '^/(play2048|numseq|myangat|xpdrop)(\\.html)?$'; }, /\/sudoku\.html: маршрут алга/],
    ['f зөрсөн', (v) => { v.routes.find((r) => r.src === '^/math-mortal/$').dest = '/gate/game.js?g=mathmortal'; }, /\/math-mortal\/: f=/],
    ['g зөрсөн', (v) => { v.routes.find((r) => r.src === '^/sbh$').dest = '/gate/game.js?g=sudoku'; }, /\/sbh: g="sudoku"/],
    ['/games/ шууд', (v) => v.routes.unshift({ src: '/s', dest: '/games/sudoku.html' }), /gate-ийг тойрно/],
    ['assets gate-д', (v) => { v.routes = v.routes.filter((r) => !/assets/.test(r.src) || r.src === '/assets/(.*)'); v.routes.splice(gi(v), 0, { src: '/math-mortal/(.*)', dest: '/gate/game.js?g=mathmortal&f=$1' }); }, /math-mortal\/cover\.webp: маршрут .* \(статик биш\)/],
    ['assets static build алга', (v) => { v.builds = v.builds.filter((b) => b.src !== 'math-mortal/cover.webp'); }, /статик build-д ороогүй: math-mortal\/cover\.webp/],
    ['/mortal redirect алга', (v) => { v.routes = v.routes.filter((r) => !r.status); }, /\/mortal: \/math-mortal\/ руу redirect биш/],
  ];
  for (const [name, mut, re] of muts) {
    const v = clone();
    mut(v);
    const r = CHK.check(v);
    assert.strictEqual(r.ok, false, name);
    assert.ok(r.errors.some((e) => re.test(e)), name + ': ' + JSON.stringify(r.errors.slice(0, 4)));
  }
  // globToRe
  assert.ok(CHK.globMatch('*.html', 'index.html'));
  assert.ok(!CHK.globMatch('*.html', 'games/sudoku.html'));
  assert.ok(CHK.globMatch('games/**', 'games/sudoku.html'));
  assert.ok(CHK.globMatch('math-mortal/*.js', 'math-mortal/main.js'));
  assert.ok(!CHK.globMatch('math-mortal/*.js', 'math-mortal/assets/x.js'));
  assert.ok(CHK.globMatch('**/*.html', 'games/sudoku.html'));
  assert.ok(CHK.globMatch('**/*.html', 'index.html'));
});

// ───────────────────────── HTTP: Vercel маршрутын эмулятор + verify-game-gate ─────────────────────────
// vercel.json-ийн routes (эхний таарсан) → redirect | gate | @vercel/static build-д орсон файл | 404.
function emulator(v) {
  const statics = v.builds.filter((b) => b.use === '@vercel/static');
  const isStatic = (rel) => {
    const abs = path.join(F.WT, rel);
    return !!rel && fs.existsSync(abs) && fs.statSync(abs).isFile() && statics.some((b) => CHK.globMatch(b.src, rel));
  };
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    const h = CHK.firstRoute(v.routes, u.pathname);
    let dest = u.pathname, dq = {};
    if (h) {
      const d = CHK.resolveRoute(h);
      if (d.redirect) { res.statusCode = d.status; res.setHeader('Location', d.redirect); return res.end(); }
      dest = d.path; dq = d.query;
    }
    if (dest === '/gate/game.js') {
      const q = {};
      u.searchParams.forEach((val, k) => { q[k] = val; });
      req.query = Object.assign(q, dq);
      return gate(req, res).catch((e) => { res.statusCode = 500; res.end(String(e)); });
    }
    const rel = decodeURIComponent(dest).replace(/^\//, '');
    if (isStatic(rel)) {
      const b = fs.readFileSync(path.join(F.WT, rel));
      res.statusCode = 200; res.setHeader('Content-Length', b.length);
      return res.end(req.method === 'HEAD' ? undefined : b);
    }
    res.statusCode = 404; res.end('404');
  });
}
const servers = [];
async function listen(v) {
  const s = emulator(v);
  servers.push(s);
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return 'http://127.0.0.1:' + s.address().port;
}
after(() => { servers.forEach((s) => s.close()); });
function rawGet(url, headers) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers: headers || {} }, (res) => {
      const ch = []; res.on('data', (c) => ch.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(ch) }));
    }).on('error', reject);
  });
}

test('HTTP: verify-game-gate.js эмуляторын эсрэг OK (on/off); хуучин vercel.json → FAIL; бодит HTTP-ээр тасалбар → cookie → тоглоом', async () => {
  const base = await listen(VERCEL);
  const on = await VER.verify(base);
  assert.deepStrictEqual(on.results.filter((x) => !x.ok), []);
  assert.ok(on.ok && on.results.length >= 25);

  // бодит HTTP: Set-Cookie толгой, 302, gzip
  const t = ticket('sudoku');
  const a = await rawGet(base + '/sudoku.html?t=' + encodeURIComponent(t));
  assert.strictEqual(a.status, 302);
  assert.strictEqual(a.headers.location, '/sudoku.html');
  const sc = a.headers['set-cookie'];
  assert.ok(Array.isArray(sc) && sc.length === 1 && SC_RE.test(sc[0]), String(sc));
  const pair = sc[0].split(';')[0];
  const b = await rawGet(base + '/sudoku.html', { cookie: pair, 'accept-encoding': 'gzip' });
  assert.strictEqual(b.status, 200);
  assert.ok(zlib.gunzipSync(b.body).equals(FILE(ENTRY.sudoku)));
  assert.strictEqual((await rawGet(base + '/games/sudoku.html', { cookie: pair })).status, 404, 'файлын бодит зам нийтэд байхгүй');
  assert.notStrictEqual((await rawGet(base + '/math-mortal/assets/../main.js')).status, 200, 'assets/.. замаар JS гарахгүй');

  process.env.GAME_PAYWALL = 'off';
  const off = await VER.verify(base, { expect: 'off' });
  assert.deepStrictEqual(off.results.filter((x) => !x.ok), []);
  delete process.env.GAME_PAYWALL;

  // Мутаци: хуучин vercel.json (math-mortal/** статик, /math-mortal/(.*) маршрут) — файлуудыг root-д буцааж
  // тавьсантай адил нөхцөлийг эмуляторт өгнө: math-mortal/main.js статикаар 200 → verify FAIL
  const old = JSON.parse(JSON.stringify(VERCEL));
  old.builds.push({ src: 'math-mortal/**', use: '@vercel/static' });
  old.routes.splice(old.routes.findIndex((r) => r.dest === '/gate/game.js?g=$1'), 0, { src: '/math-mortal/(.*)', dest: '/math-mortal/$1' });
  const bad = await VER.verify(await listen(old));
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.results.some((x) => !x.ok && x.path === '/math-mortal/main.js'), JSON.stringify(bad.results.filter((x) => !x.ok).slice(0, 3)));
  assert.deepStrictEqual(F.db.unknown, []);
});

// ───────────────────────── сайтын хуудсууд (gp-s3b) ─────────────────────────
// index.html-ийн iframe src (/sudoku.html г.м.) болон play/team/xp.html-ийн 'xpdrop.html' нийтийн замаараа хэвээр ажиллана:
// off → яг ижил файл 200; on → cookie-гүй бол 403 түгжээ (404 БИШ — iframe-д postMessage очно); cover.webp статик.
test('сайтын хуудсууд: index.html iframe src + play/team/xp.html — нийтийн зам хэвээр (off → ижил файл, on → түгжээ, 404 үгүй)', async () => {
  const r = CHK.check(VERCEL);
  assert.deepStrictEqual(r.errors, []);
  const byFile = (f) => r.consumers.filter((c) => c.file === f).map((c) => c.pub);
  assert.deepStrictEqual(byFile('index.html').slice().sort(), ['/math-mortal/cover.webp', '/math-mortal/index.html', '/myangat.html',
    '/numseq.html', '/play2048.html', '/sudoku.html', '/xpdrop.html']);
  for (const f of ['play.html', 'team.html', 'xp.html']) assert.deepStrictEqual(byFile(f), ['/xpdrop.html'], f + ' — харьцангуй xpdrop.html');

  const G_OF = { '/sudoku.html': 'sudoku', '/play2048.html': 'play2048', '/numseq.html': 'numseq', '/myangat.html': 'myangat',
    '/xpdrop.html': 'xpdrop', '/math-mortal/index.html': 'mathmortal' };
  const base = await listen(VERCEL);
  const pubs = Array.from(new Set(r.consumers.map((c) => c.pub)));
  for (const p of pubs) {
    if (G_OF[p]) {
      process.env.GAME_PAYWALL = 'off';
      const off = await rawGet(base + p);
      assert.strictEqual(off.status, 200, p + ' off');
      assert.strictEqual(off.headers['x-game-gate'], 'off', p);
      assert.ok(off.body.equals(FILE(ENTRY[G_OF[p]])), p + ': off үед яг ижил файл');
      delete process.env.GAME_PAYWALL;
      const on = await rawGet(base + p);
      assert.strictEqual(on.status, 403, p + ' on → түгжээ (404 биш)');
      assert.strictEqual(on.headers['x-game-gate'], 'locked', p);
      assert.ok(on.body.toString('utf8').indexOf('cm-game-locked') > 0, p + ': iframe-д postMessage');
    } else {
      const st = await rawGet(base + p);
      assert.strictEqual(st.status, 200, p + ' статик');
      assert.ok(st.body.equals(FILE(p.slice(1))), p);
    }
  }
  // xp.html: location.href = 'xpdrop.html?grade=…' → тасалбартай орсны дараа grade хадгалагдана
  const xr = await rawGet(base + '/xpdrop.html?grade=7&t=' + encodeURIComponent(ticket('xpdrop')));
  assert.strictEqual(xr.status, 302);
  assert.strictEqual(xr.headers.location, '/xpdrop.html?grade=7');

  // Мутаци: /games/ бодит зам, байхгүй math-mortal файл, маршрут алга → алдаа (хуудас, мөрөөр)
  const bad = CHK.check(VERCEL, { pages: [
    { file: 'a.html', text: "x\nf.src = '/games/sudoku.html';" },
    { file: 'b.html', text: "s.src = './math-mortal/nope.js';" },
    { file: 'c.html', text: "u = 'math-mortal/assets/none.glb';" },
  ] });
  assert.strictEqual(bad.ok, false);
  assert.ok(bad.errors.some((e) => /^a\.html:2 "\/games\/sudoku\.html" → хамгаалсан файлын бодит зам/.test(e)), JSON.stringify(bad.errors));
  assert.ok(bad.errors.some((e) => /^b\.html:1 .*math-mortal\/nope\.js файл алга/.test(e)), JSON.stringify(bad.errors));
  assert.ok(bad.errors.some((e) => /^c\.html:1 .*404/.test(e)), JSON.stringify(bad.errors));
  const v = JSON.parse(JSON.stringify(VERCEL));
  v.routes.find((x) => x.dest === '/gate/game.js?g=$1').src = '^/(sudoku|play2048|numseq|myangat)(\\.html)?$';
  const nr = CHK.check(v);
  assert.ok(nr.errors.some((e) => /^play\.html:2094 "xpdrop\.html" → маршрутгүй/.test(e)), JSON.stringify(nr.errors.slice(0, 6)));
  assert.ok(nr.errors.some((e) => /^index\.html:\d+ "\/xpdrop\.html"/.test(e)));
  // хайгч: зөвхөн мөр/url() доторх холбоос, гадны домэйн биш
  const found = CHK.consumers(gate, [{ file: 'd.html', text: "a='https://x.mn/math-mortal/main.js'; b=\"/sbh\"; c=url(/math-mortal/cover.webp); d='/mortal?x=1'" }]);
  assert.deepStrictEqual(found.map((c) => c.pub), ['/sbh', '/math-mortal/cover.webp', '/mortal']);
  assert.deepStrictEqual(CHK.check(VERCEL, { pages: [{ file: 'd.html', text: "b='/sbh'; d='/mortal'; e='/math-mortal'" }] }).errors, []);
});
