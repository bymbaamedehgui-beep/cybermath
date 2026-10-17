// Дасгалын төвийн «Тоглоом» хэсэг (gp-s6): games-host.js (window.CMGamesHost) + index.html-ийн embed горим (#gp-embed)
// + worksheets.html-ийн #gamesSec/GW. Клиентийн кодыг vm-д хуурамч window/DOM-оор ажиллуулж, сүлжээг api/games.js /
// api/qpay.js handler руу шууд чиглүүлнэ (tests/_gamefake.js — бодит DB/QPay/Telegram 0).
// Ажиллуулах: node tests/games-ws.test.js
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');

const games = require(path.join(F.API, 'games.js'));
const qpay = require(path.join(F.API, 'qpay.js'));
const GM = require(path.join(F.API, '_games.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const ORIGIN = 'https://cyber-math.com';

const HOST_SRC = fs.readFileSync(path.join(F.WT, 'games-host.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(F.WT, 'index.html'), 'utf8');
const WSH = fs.readFileSync(path.join(F.WT, 'worksheets.html'), 'utf8');
const H0 = require(path.join(F.WT, 'games-host.js'));   // цэвэр туслахууд (window-гүй)

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const cmTok = (e) => jwt.sign({ email: e, role: 'student', tv: 0 }, SEC);
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / F.DAY;
function give(realm, email, key, days) {
  F.db.access.set(realm + '|' + email + '|' + key, { realm: realm, email: email, game_key: key, expires_at: new Date(Date.now() + (days == null ? 30 : days) * F.DAY), updated_at: new Date() });
}
const J = (x) => JSON.parse(JSON.stringify(x));   // vm-ийн өөр realm-ийн объект → энгийн
function ticks(n) { let p = Promise.resolve(); for (let i = 0; i < (n || 8); i++) p = p.then(() => new Promise((r) => setImmediate(r))); return p; }

// ───────── хуурамч браузерийн орчин ─────────
function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
// fetch → api handler (F.call). Толгойг жижиг үсгээр (Node req.headers шиг). ip — нэг «төхөөрөмжийн» IP.
function apiFetch(log, ip) {
  return async function (url, opts) {
    opts = opts || {};
    const u = new URL(String(url), ORIGIN);
    const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
    const headers = {}; Object.keys(opts.headers || {}).forEach((k) => { headers[k.toLowerCase()] = opts.headers[k]; });
    let body = {}; try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    const h = u.pathname === '/api/games' ? games : u.pathname === '/api/qpay' ? qpay : null;
    log.push({ path: u.pathname, action: query.action, method: opts.method || 'GET', headers: headers, body: body });
    if (!h) throw new Error('blocked ' + u.pathname);
    const r = await F.call(h, { method: opts.method || 'GET', query: query, body: body, headers: headers, ip: ip });
    return { status: r.statusCode, ok: r.statusCode < 400, json: async () => r.body };
  };
}
function browser(o) {
  o = o || {};
  const href = ORIGIN + (o.path || '/worksheets');
  const u = new URL(href);
  const loc = { origin: ORIGIN, href: href, pathname: u.pathname, search: u.search, hash: u.hash };
  const W = {
    localStorage: storage(o.ls), sessionStorage: storage(o.ss),
    location: loc,
    history: { state: null, replaceState: function (s, t, p) { const n = new URL(p, ORIGIN); loc.href = n.href; loc.pathname = n.pathname; loc.search = n.search; loc.hash = n.hash; } },
    navigator: { userAgent: o.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', language: 'mn-MN', hardwareConcurrency: 8 },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    crypto: nodeCrypto.webcrypto,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    URL: URL, console: console, setTimeout: setTimeout, clearTimeout: clearTimeout,
  };
  W.log = [];
  W.fetch = apiFetch(W.log, o.ip || '198.51.100.7');
  W.window = W;
  vm.createContext(W);
  vm.runInContext(HOST_SRC, W, { filename: 'games-host.js' });
  return W;
}

beforeEach(() => F.reset());

// ───────────────────────── games-host.js: цэвэр туслахууд ─────────────────────────
test('games-host: 16 тоглоомын мета серверийн каталогтой таарна (түлхүүр, төрөл, олон тоглогч, inline талбар)', () => {
  assert.strictEqual(H0.KEYS.length, 16);
  assert.deepStrictEqual(H0.KEYS.slice().sort(), Object.keys(GM.GAMES).slice().sort());
  H0.KEYS.forEach((k) => {
    assert.ok(H0.isKey(k), k);
    assert.strictEqual(H0.META[k].k, GM.GAMES[k].kind, k + ' kind');
    assert.strictEqual(H0.META[k].m, GM.GAMES[k].multi, k + ' multi');
    assert.match(H0.icon(k, 20), /^<svg [^>]*viewBox="0 0 24 24"[^>]*>.+<\/svg>$/, k + ' svg icon');
  });
  const inline = Object.keys(GM.GAMES).filter((k) => GM.GAMES[k].kind === 'inline').sort();
  assert.deepStrictEqual(Object.keys(H0.INLINE).sort(), inline);
  assert.deepStrictEqual(inline, ['chessmath', 'daam', 'doroev', 'gomoku', 'ludo', 'sbh']);
  ['__proto__', 'constructor', 'toString', 'SUDOKU', 'sudoku ', '', null, 5].forEach((k) => assert.strictEqual(H0.isKey(k), false, String(k)));
});

test('games-host: cardState / embedUrl / parseInvite / fmt / ymd / esc / rounds', () => {
  const now = Date.parse('2026-10-16T00:00:00Z');
  const fut = '2026-11-15T00:00:00.000Z', past = '2026-10-01T00:00:00.000Z';
  assert.strictEqual(H0.cardState({ enabled: false, loggedIn: false }).st, 'free');
  assert.deepStrictEqual(H0.cardState({ enabled: true, loggedIn: true, exp: fut, now: now }), { st: 'active', exp: fut });
  assert.strictEqual(H0.cardState({ enabled: true, loggedIn: true, exp: past, now: now }).st, 'buy', 'дууссан эрх → худалдан авах');
  assert.strictEqual(H0.cardState({ enabled: true, loggedIn: false, invite: true, now: now }).st, 'invite');
  assert.strictEqual(H0.cardState({ enabled: true, loggedIn: true, admin: true, now: now }).st, 'admin');
  assert.strictEqual(H0.cardState({ enabled: true, loggedIn: false, now: now }).st, 'login');
  assert.strictEqual(H0.cardState({ enabled: true, loggedIn: true, exp: 'garbage', now: now }).st, 'buy');

  assert.strictEqual(H0.embedUrl('chessmath', 'ws'), '/?embed=chessmath&realm=ws');
  assert.strictEqual(H0.embedUrl('sbh', 'cm'), '/?embed=sbh&realm=cm');
  assert.strictEqual(H0.embedUrl('sbh', 'evil'), '/?embed=sbh&realm=ws');
  assert.strictEqual(H0.embedUrl('sudoku', 'ws'), null, 'файл тоглоом embed-гүй');
  assert.strictEqual(H0.embedUrl('__proto__', 'ws'), null);
  const inv = 'a'.repeat(30) + '.b-c_d';
  assert.strictEqual(H0.embedUrl('daam', 'ws', inv), '/?embed=daam&realm=ws&einv=' + inv);
  assert.strictEqual(H0.embedUrl('daam', 'ws', 'x"><script>'), '/?embed=daam&realm=ws', 'хүчингүй урилга URL-д орохгүй');

  assert.deepStrictEqual(H0.parseInvite('?game=chessmath&ginv=' + inv), { key: 'chessmath', inv: inv });
  assert.deepStrictEqual(H0.parseInvite('?x=1&game=ludo'), { key: 'ludo', inv: null });
  assert.deepStrictEqual(H0.parseInvite('?game=nope&ginv=' + inv), { key: null, inv: null });
  assert.deepStrictEqual(H0.parseInvite('?game=ludo&ginv=%3Cscript%3E' + 'a'.repeat(30)), { key: 'ludo', inv: null });
  assert.deepStrictEqual(H0.parseInvite('?game=ludo&ginv=%E0%A4%A' + 'a'.repeat(30)), { key: 'ludo', inv: null }, 'decode алдаа');

  assert.strictEqual(H0.fmt(1900), '1 900');
  assert.strictEqual(H0.fmt(1234567), '1 234 567');
  assert.strictEqual(H0.ymd('2026-11-05T10:00:00'), '2026-11-05');
  assert.strictEqual(H0.ymd('x'), '');
  assert.strictEqual(H0.esc('<a href="x">\'&'), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');

  const qs = [
    { type: 'choice', text: 'A', choices: ['1', '2', '3'], correct: '2' },
    { type: 'choice', text: 'B', choices: '["1","2","3","4","5"]', correct: '5' },     // 5-р хариулт → алгасна
    { type: 'input', text: 'C', choices: ['1', '2'], correct: '1' },                 // choice биш
    { text: 'D', choices: ['x'], correct: 'x' },                                     // < 2 сонголт
    { text: 'E $x$', choices: ['$1$', '2'], correct: '3' },                          // зөв хариулт → placeholder-ийн оронд
  ];
  const r = H0.rounds(qs, { shuffle: false, tex: (s) => s });
  assert.deepStrictEqual(r, [
    { text: 'A', options: ['1', '2', '3', '—'], correctIdx: 1 },
    { text: 'E $x$', options: ['$1$', '2', '3', '—'], correctIdx: 2 },
  ]);
  assert.strictEqual(H0.rounds([], { placeholder: true }).length, 1);
  assert.strictEqual(H0.rounds(qs.concat(qs, qs), { max: 3 }).length, 3);
});

// ───────────────────────── games-host.js ↔ api/games.js + api/qpay.js ─────────────────────────
test('host↔API: каталог; токенгүй → нэвтрэх; ws токеноор худалдан авах (QPay QR) → төлбөр баталгаажих → тоглох', async () => {
  const KID = wsTok('kid@x.mn');   // нэг удаа (iat секунд солигдвол дахин гарын үсэглэсэн токен өөр болно)
  const W = browser({ ls: { cm_ws_token: KID } });
  const H = W.CMGamesHost;

  const cat = await H.catalog();
  assert.strictEqual(cat.ok, true);
  assert.strictEqual(cat.price, 1900);
  assert.strictEqual(cat.days, 30);
  assert.deepStrictEqual(J(cat.games.map((g) => g.key).sort()), J(H.KEYS.slice().sort()));

  // токенгүй хөтөч
  const anon = browser().CMGamesHost;
  assert.strictEqual((await anon.status({ realm: 'ws' })).s, 401);
  const al = await anon.launch('sudoku', { realm: 'ws' });
  assert.strictEqual(al.s, 401); assert.strictEqual(al.d.needLogin, true); assert.strictEqual(al.d.url, undefined);
  assert.strictEqual((await anon.buyCreate('sudoku', { realm: 'ws' })).s, 401);

  // нэвтэрсэн, эрхгүй
  const st0 = await H.status({ realm: 'ws' });
  assert.strictEqual(st0.s, 200, JSON.stringify(st0.d));
  assert.strictEqual(st0.d.email, 'kid@x.mn');
  assert.deepStrictEqual(st0.d.games, {});
  const l0 = await H.launch('sudoku', { realm: 'ws' });
  assert.strictEqual(l0.s, 402); assert.strictEqual(l0.d.needBuy, true); assert.strictEqual(l0.d.url, undefined);
  // илгээсэн хүсэлт: realm ws, wstoken (body), төхөөрөмжийн толгой — ws-store.js-тэй ижил 'cm_device'
  const req = W.log.filter((x) => x.action === 'launch').pop();
  assert.strictEqual(req.body.realm, 'ws');
  assert.strictEqual(req.body.game, 'sudoku');
  assert.strictEqual(req.body.wstoken, KID);
  assert.strictEqual(req.headers['x-device-id'], W.localStorage.getItem('cm_device'));
  assert.match(req.headers['x-device-fp'], /^[0-9a-f]{8}$/);
  assert.strictEqual(req.headers.authorization, undefined, 'ws realm-д cm Bearer илгээхгүй');

  // худалдан авах: дүн/имэйлийг сервер тогтооно
  const c = await H.buyCreate('sudoku', { realm: 'ws' });
  assert.strictEqual(c.s, 200, JSON.stringify(c.d));
  assert.strictEqual(c.d.email, 'kid@x.mn');
  assert.strictEqual(c.d.amount, 1900);
  const id = c.d.invoice.invoice_id;
  const row = F.db.pay.get(id);
  assert.strictEqual(row.plan, 'game'); assert.strictEqual(row.realm, 'ws'); assert.strictEqual(row.game_key, 'sudoku');
  assert.strictEqual(row.amount, 1900); assert.strictEqual(row.email, 'kid@x.mn');
  const cb = W.log.filter((x) => x.action === 'create').pop().body;
  assert.deepStrictEqual(Object.keys(cb).sort(), ['game', 'plan', 'realm', 'wstoken'], 'клиент дүн/имэйл илгээхгүй');

  // төлөөгүй → paid:false, эрх олгогдохгүй
  const ch0 = await H.buyCheck(id, c.d.email);
  assert.strictEqual(ch0.d.paid, false);
  assert.strictEqual((await H.launch('sudoku', { realm: 'ws' })).s, 402);
  // QPay төлсөн → check (сервер QPay-тэй тулгана) → эрх 30 хоног
  F.qp.paid.set(id, 1900);
  const ch1 = await H.buyCheck(id, c.d.email);
  assert.strictEqual(ch1.d.paid, true, JSON.stringify(ch1.d));
  assert.strictEqual(ch1.d.game, 'sudoku'); assert.strictEqual(ch1.d.realm, 'ws');
  assert.ok(Math.abs(daysLeft(ch1.d.expiry) - 30) < 0.01);
  const st1 = await H.status({ realm: 'ws' });
  assert.deepStrictEqual(Object.keys(st1.d.games), ['sudoku']);
  const l1 = await H.launch('sudoku', { realm: 'ws' });
  assert.strictEqual(l1.s, 200);
  assert.strictEqual(l1.d.kind, 'file');
  assert.match(l1.d.url, /^\/sudoku\.html\?t=[A-Za-z0-9._%-]+$/, 'gate тасалбартай url');
  assert.strictEqual((await H.launch('play2048', { realm: 'ws' })).s, 402, 'өөр тоглоом эрхгүй хэвээр');

  // эрх идэвхтэй байхад дахин авбал үлдсэн хоног дээр нэмэгдэнэ
  const c2 = await H.buyCreate('sudoku', { realm: 'ws' });
  assert.strictEqual(c2.s, 200, 'идэвхтэй эрхтэй ч сунгах нэхэмжлэх үүснэ');
  F.qp.paid.set(c2.d.invoice.invoice_id, 1900);
  const ch2 = await H.buyCheck(c2.d.invoice.invoice_id, c2.d.email);
  assert.ok(Math.abs(daysLeft(ch2.d.expiry) - 60) < 0.01, 'GREATEST(хуучин, NOW()) + 30');

  // cyber-math.com (cm realm)-д энэ эрх хамаарахгүй
  F.addUser('kid@x.mn');
  const cmW = browser({ path: '/', ls: { cm_token: cmTok('kid@x.mn') } });
  const cs = await cmW.CMGamesHost.status({ realm: 'cm' });
  assert.strictEqual(cs.s, 200, JSON.stringify(cs.d));
  assert.deepStrictEqual(cs.d.games, {}, 'realm тусгаарлалт');
  assert.strictEqual((await cmW.CMGamesHost.launch('sudoku', { realm: 'cm' })).s, 402);
});

test('host↔API: inline/external тоглоомын launch; GAME_PAYWALL=off → бүгд нээлттэй, худалдан авах нэхэмжлэх үүсгэхгүй', async () => {
  const W = browser({ ls: { cm_ws_token: wsTok('kid@x.mn') } });
  const H = W.CMGamesHost;
  give('ws', 'kid@x.mn', 'chessmath', 5);
  give('ws', 'kid@x.mn', 'blockblast', 5);
  const li = await H.launch('chessmath', { realm: 'ws' });
  assert.strictEqual(li.s, 200);
  assert.strictEqual(li.d.kind, 'inline');
  assert.strictEqual(li.d.url, undefined);
  assert.strictEqual(H.embedUrl('chessmath', 'ws'), '/?embed=chessmath&realm=ws');
  const le = await H.launch('blockblast', { realm: 'ws' });
  assert.strictEqual(le.d.kind, 'external');
  assert.strictEqual(le.d.url, GM.GAMES.blockblast.url);
  assert.strictEqual((await H.launch('daam', { realm: 'ws' })).s, 402);

  process.env.GAME_PAYWALL = 'off';
  const cat = await H.catalog(true);
  assert.strictEqual(cat.enabled, false);
  const anon = browser().CMGamesHost;
  const lo = await anon.launch('sudoku', { realm: 'ws' });
  assert.strictEqual(lo.s, 200); assert.strictEqual(lo.d.via, 'off'); assert.strictEqual(lo.d.url, '/sudoku.html');
  const bc = await H.buyCreate('daam', { realm: 'ws' });
  assert.strictEqual(bc.s, 409); assert.strictEqual(bc.d.already, true);
  assert.strictEqual(F.qp.invoices.length, 0, 'үнэгүй үед нэхэмжлэх үүсэхгүй');
});

test('host↔API: олон тоглогчийн урилга — host л төлнө; найз (нэвтрээгүй, өөр төхөөрөмж) ?game=&ginv= холбоосоор үнэгүй нэгдэнэ', async () => {
  const host = browser({ ls: { cm_ws_token: wsTok('host@x.mn') } }).CMGamesHost;
  // эрхгүй host урилга үүсгэж чадахгүй
  const i0 = await host.invite('chessmath', { realm: 'ws' });
  assert.strictEqual(i0.s, 402); assert.strictEqual(i0.d.needBuy, true);
  // multi биш тоглоом
  give('ws', 'host@x.mn', 'sudoku', 5);
  assert.strictEqual((await host.invite('sudoku', { realm: 'ws' })).s, 400);

  give('ws', 'host@x.mn', 'chessmath', 5);
  const i1 = await host.invite('chessmath', { realm: 'ws' });
  assert.strictEqual(i1.s, 200, JSON.stringify(i1.d));
  assert.match(i1.d.url, /^\/worksheets\?game=chessmath&ginv=[A-Za-z0-9._%-]+$/);

  // найз холбоосыг нээнэ → URL-аас урилгыг авч sessionStorage-д, хаягийн мөрөөс арилгана
  const FW = browser({ path: i1.d.url + '#games', ip: '192.0.2.44' });
  const FH = FW.CMGamesHost;
  const got = FH.takeUrlInvite('ws');
  assert.strictEqual(got.key, 'chessmath');
  assert.strictEqual(got.inv, i1.d.invite);
  assert.strictEqual(FW.location.search, '', 'game/ginv URL-аас арилсан');
  assert.strictEqual(FW.location.hash, '#games');
  assert.strictEqual(FH.getInvite('ws', 'chessmath'), i1.d.invite);
  assert.strictEqual(FH.getInvite('cm', 'chessmath'), null, 'realm тусдаа');
  assert.strictEqual(FH.getInvite('ws', 'daam'), null);
  // embed url-д урилга дамжина
  assert.strictEqual(FH.embedUrl('chessmath', 'ws', got.inv), '/?embed=chessmath&realm=ws&einv=' + encodeURIComponent(got.inv));
  // найз: токенгүй → урилгаар нээгдэнэ
  const fl = await FH.launch('chessmath', { realm: 'ws', invite: got.inv });
  assert.strictEqual(fl.s, 200, JSON.stringify(fl.d));
  assert.strictEqual(fl.d.via, 'invite');
  // урилга өөр тоглоомд хүчингүй
  const fx = await FH.launch('daam', { realm: 'ws', invite: got.inv });
  assert.strictEqual(fx.s, 403); assert.strictEqual(fx.d.inviteInvalid, true);
  // урилгагүй бол найз нэвтрэх шаардлагатай
  assert.strictEqual((await FH.launch('chessmath', { realm: 'ws' })).s, 401);
  // setInvite(null) → арилна
  FH.setInvite('ws', 'chessmath', null);
  assert.strictEqual(FH.getInvite('ws', 'chessmath'), null);
  assert.strictEqual(FW.sessionStorage.getItem('gp_inv_ws'), null);
});

// ───────────────────────── index.html — embed горим (#gp-embed) ─────────────────────────
const EMBED_SRC = (function () {
  const m = /<script id="gp-embed">([\s\S]*?)<\/script>/.exec(INDEX);
  assert.ok(m, 'index.html-д <script id="gp-embed"> блок байх ёстой');
  return m[1];
})();

// Хамгийн бага DOM: getElementById, classList, children/parentNode, innerHTML → querySelector нь stub элемент
function fakeDom() {
  const reg = new Map();
  class CL {
    constructor() { this.s = new Set(); }
    add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); }
  }
  class El {
    constructor(tag, id, cls) {
      this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.style = {};
      this.classList = new CL(); this.hidden = false; this._html = ''; this.textContent = ''; this._q = {}; this.attrs = {}; this.ls = {};
      if (cls) this.classList.add(cls);
      this.id = id || '';
    }
    get id() { return this._id; }
    set id(v) { this._id = v; if (v) reg.set(v, this); }
    get innerHTML() { return this._html; }
    set innerHTML(v) { this._html = String(v); this._q = {}; }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
    querySelector(s) { if (!this._q[s]) { const e = new El('stub'); e.parentNode = this; e._sel = s; this._q[s] = e; } return this._q[s]; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
    closest() { return this; }
  }
  const html = new El('html'), body = new El('body');
  html.appendChild(body);
  const add = (p, tag, id, cls) => p.appendChild(new El(tag, id, cls));
  add(body, 'div', 'cm-splash');
  add(body, 'div', 'landing-page');
  const app = add(body, 'div', 'cybermath-app');
  add(app, 'nav', 'app-nav');
  const tab = add(app, 'div', 'tab-games', 'tab-content');
  add(app, 'div', 'tab-home', 'tab-content');
  add(tab, 'div', 'game-selector');
  ['chessmath', 'daam', 'gomoku', 'ludo', 'doroev', 'sbh'].forEach((k) => add(tab, 'div', k + '-area'));
  add(body, 'div', 'toast');
  add(body, 'div', 'ol-setup-modal', 'ol-modal');
  add(body, 'div', 'daily-reward-modal');
  add(body, 'script');
  const doc = {
    documentElement: html, body: body, readyState: 'complete',
    getElementById: (id) => reg.get(id) || null,
    createElement: (t) => new El(t),
    addEventListener() {},
  };
  return { doc, reg, El };
}
// o: { search, ls, fetch, inFrame (анхдагч true), noStartGame }
function embed(o) {
  o = o || {};
  const D = fakeDom();
  const posts = [], starts = [], fetches = [];
  const S = {
    document: D.doc,
    location: { search: o.search || '', origin: ORIGIN, href: ORIGIN + '/' + (o.search || '') },
    localStorage: storage(o.ls),
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0', language: 'mn', hardwareConcurrency: 8 },
    screen: { width: 412, height: 915, colorDepth: 24 },
    crypto: nodeCrypto.webcrypto,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    console: { error() {}, log() {}, warn() {} },
    setTimeout: setTimeout,
    MutationObserver: class { constructor(f) { S._mo = f; } observe() {} },
  };
  S.window = S;
  S.parent = o.inFrame === false ? S : { postMessage: (m, origin) => posts.push({ m: m, origin: origin }) };
  if (!o.noStartGame) S.startGame = function (k, ok) { starts.push([k, ok]); };
  const f = o.fetch || (async () => { throw new Error('no fetch'); });
  S.fetch = function (url, opts) { fetches.push({ url: url, opts: opts, body: opts && opts.body ? JSON.parse(opts.body) : null }); return f(url, opts); };
  vm.createContext(S);
  vm.runInContext(EMBED_SRC, S, { filename: 'index.html#gp-embed' });
  return { S, D, posts, starts, fetches, $: (id) => D.reg.get(id), hidden: (id) => D.reg.get(id).classList.contains('cm-emb-hide') };
}
const reply = (status, body) => async () => ({ status: status, json: async () => body });
const types = (E) => E.posts.map((p) => p.m.type + (p.m.reason ? ':' + p.m.reason : ''));

test('embed: ?embed байхгүй → юу ч хийхгүй (cyber-math.com хуучин шигээ)', async () => {
  const E = embed({ search: '' });
  await ticks();
  assert.strictEqual(E.S.CM_EMBED, undefined);
  assert.strictEqual(E.D.doc.documentElement.classList.contains('cm-embed'), false);
  assert.strictEqual(E.fetches.length, 0);
  assert.strictEqual(E.posts.length, 0);
  const E2 = embed({ search: '?embed=' });
  await ticks();
  assert.strictEqual(E2.S.CM_EMBED, undefined);
  const E3 = embed({ search: '?ref=abc&tab=games' });
  await ticks();
  assert.strictEqual(E3.fetches.length, 0);
  for (const s of ['?embed=__proto__&realm=ws', '?embed=toString&realm=ws', '?embed=CHESSMATH']) {
    const E4 = embed({ search: s });
    await ticks();
    assert.strictEqual(E4.S.CM_EMBED, undefined, s);
    assert.strictEqual(E4.fetches.length, 0, s);
  }
});

test('embed: зөвхөн 6 inline тоглоом, зөвхөн realm=ws — бусад нь сервер дуудалгүй «олдсонгүй»', async () => {
  for (const s of ['?embed=sudoku&realm=ws', '?embed=mathmortal', '?embed=chessmath&realm=cm', '?embed=chessmath&realm=xx', '?embed=constructor&realm=ws', '?embed=hasownproperty&realm=ws']) {
    const E = embed({ search: s, ls: { cm_ws_token: wsTok('a@x.mn') } });
    await ticks();
    assert.strictEqual(E.fetches.length, 0, s);
    assert.strictEqual(E.starts.length, 0, s);
    assert.deepStrictEqual(types(E), ['cm-game-locked:invalid'], s);
  }
  // realm тавиагүй бол ws
  const E = embed({ search: '?embed=ludo', ls: { cm_ws_token: wsTok('a@x.mn') }, fetch: reply(200, { ok: true, game: 'ludo', kind: 'inline', via: 'access' }) });
  await ticks();
  assert.strictEqual(E.fetches[0].body.realm, 'ws');
  assert.deepStrictEqual(E.starts, [['ludo', true]]);
});

test('embed: ws эрхтэй → launch(realm ws, wstoken, урилга, төхөөрөмж) → startGame(key, true); бусад хэсгийг нууна; parent руу ready', async () => {
  const inv = 'i'.repeat(24) + '.sig';
  const E = embed({
    search: '?embed=chessmath&realm=ws&einv=' + encodeURIComponent(inv),
    ls: { cm_ws_token: 'WS.TOK.X', cm_token: 'CM.SHOULD.NOT.BE.SENT', cm_device: 'abcdef0123456789' },
    fetch: reply(200, { ok: true, game: 'chessmath', kind: 'inline', via: 'access', expires_at: '2026-11-01T00:00:00Z' }),
  });
  assert.strictEqual(E.D.doc.documentElement.classList.contains('cm-embed'), true);
  await ticks();
  assert.strictEqual(E.fetches.length, 1);
  const f = E.fetches[0];
  assert.strictEqual(f.url, '/api/games?action=launch');
  assert.strictEqual(f.opts.method, 'POST');
  assert.deepStrictEqual(f.body, { game: 'chessmath', realm: 'ws', wstoken: 'WS.TOK.X', invite: inv });
  assert.strictEqual(f.opts.headers['X-Device-Id'], 'abcdef0123456789', 'ws-store.js-тэй ижил cm_device');
  assert.match(f.opts.headers['X-Device-Fp'], /^[0-9a-f]{8}$/);
  assert.strictEqual(f.opts.headers.Authorization, undefined, 'cm_token илгээхгүй (cm нэвтрэлт шаардахгүй)');
  assert.deepStrictEqual(E.starts, [['chessmath', true]]);
  assert.strictEqual(E.S.CM_EMBED.ok, true);
  assert.strictEqual(E.S.CM_EMBED.via, 'access');
  assert.strictEqual(E.$('chessmath-area').style.display, 'block');
  assert.deepStrictEqual(types(E), ['cm-embed-ready']);
  assert.strictEqual(E.posts[0].origin, ORIGIN, 'targetOrigin = өөрийн домэйн');
  assert.strictEqual(E.posts[0].m.game, 'chessmath');
  // нуугдсан / үлдсэн
  ['cm-splash', 'landing-page', 'app-nav', 'tab-home', 'game-selector', 'daam-area', 'sbh-area', 'daily-reward-modal'].forEach((id) => assert.ok(E.hidden(id), id + ' нуугдана'));
  ['cybermath-app', 'tab-games', 'chessmath-area', 'toast', 'ol-setup-modal'].forEach((id) => assert.ok(!E.hidden(id), id + ' үлдэнэ'));
  // хожим body-д нэмэгдсэн popup нуугдана
  const pop = new E.D.El('div', 'late-popup');
  E.D.doc.body.appendChild(pop);
  E.S._mo([{ addedNodes: [pop] }]);
  assert.ok(pop.classList.contains('cm-emb-hide'));
  // «Гарах» товч (closeChessMath()) → parent overlay хаах
  const btn = new E.D.El('button'); btn.setAttribute('onclick', 'closeChessMath()');
  E.$('chessmath-area').ls.click[0]({ target: { closest: () => btn } });
  assert.deepStrictEqual(types(E), ['cm-embed-ready', 'cm-embed-close']);
});

test('embed: эрхгүй/нэвтрээгүй/төхөөрөмж/урилга/алдаа → тоглоом ЭХЛЭХГҮЙ, түгжээний карт + parent руу шалтгаан', async () => {
  const cases = [
    [reply(402, { ok: false, needBuy: true }), 'needBuy'],
    [reply(401, { ok: false, needLogin: true }), 'login'],
    [reply(403, { ok: false, needLogin: true, deviceBlocked: true, error: 'limit' }), 'device'],
    [reply(403, { ok: false, inviteInvalid: true, error: 'inv' }), 'invite'],
    [reply(503, { ok: false, error: 'tmp' }), 'error'],
    [reply(429, { ok: false }), 'error'],
    [reply(200, { ok: true, game: 'chessmath', kind: 'file', url: '/x' }), 'invalid'],
    [reply(200, { ok: true, game: 'daam', kind: 'inline' }), 'error'],          // өөр тоглоомын хариу
    [reply(200, { ok: 'true', game: 'chessmath', kind: 'inline' }), 'error'],   // ok === true биш
    [async () => { throw new Error('net'); }, 'error'],
    [async () => ({ status: 200, json: async () => { throw new Error('bad json'); } }), 'error'],
  ];
  for (const [fx, reason] of cases) {
    const E = embed({ search: '?embed=chessmath&realm=ws', ls: { cm_ws_token: 'T' }, fetch: fx });
    await ticks();
    assert.strictEqual(E.starts.length, 0, reason);
    assert.strictEqual(E.S.CM_EMBED.ok, false, reason);
    assert.deepStrictEqual(types(E), ['cm-game-locked:' + reason], reason);
    const card = E.$('gp-emb');
    assert.ok(card && card.hidden === false, reason + ' карт харагдана');
  }
  // needBuy → «Худалдан авах» товч parent-д cm-embed-buy илгээнэ
  const E = embed({ search: '?embed=gomoku&realm=ws', ls: { cm_ws_token: 'T' }, fetch: reply(402, { ok: false, needBuy: true }) });
  await ticks();
  const btns = E.$('gp-emb').querySelector('.b').children;
  const buyB = btns.find((b) => b.textContent === 'Худалдан авах');
  assert.ok(buyB, 'худалдан авах товч');
  buyB.onclick();
  assert.deepStrictEqual(types(E).slice(-1), ['cm-embed-buy']);
  // «Дахин оролдох» (error) → дахин launch
  let n = 0;
  const E2 = embed({ search: '?embed=sbh&realm=ws', ls: { cm_ws_token: 'T' },
    fetch: async () => (++n === 1 ? { status: 503, json: async () => ({ ok: false }) } : { status: 200, json: async () => ({ ok: true, game: 'sbh', kind: 'inline', via: 'access' }) }) });
  await ticks();
  E2.$('gp-emb').querySelector('.b').children.find((b) => b.textContent === 'Дахин оролдох').onclick();
  await ticks();
  assert.deepStrictEqual(E2.starts, [['sbh', true]]);
  assert.strictEqual(E2.$('gp-emb').hidden, true);
  // iframe-гүй (шууд нээсэн) бол Дасгалын төв рүү буцах холбоос, postMessage-гүй
  const E3 = embed({ search: '?embed=daam&realm=ws', inFrame: false, fetch: reply(401, { ok: false, needLogin: true }) });
  await ticks();
  const back = E3.$('gp-emb').querySelector('.b').children[0];
  assert.strictEqual(back.href, '/worksheets#games');
  assert.strictEqual(back.target, '_top');
});

test('embed ↔ api/games.js: ws эрхтэй нээгдэнэ; cm эрх/Premium/cm_token-оор НЭЭГДЭХГҮЙ; найзын урилгаар нээгдэнэ', async () => {
  const run = async (search, ls, ip) => {
    const log = [];
    const E = embed({ search: search, ls: ls, fetch: apiFetch(log, ip || '198.51.100.20') });
    await ticks(20);
    return E;
  };
  F.addUser('cmprem@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 9 * F.DAY) });
  give('cm', 'cmprem@x.mn', 'daam', 9);
  give('ws', 'ws@x.mn', 'daam', 9);

  const ok = await run('?embed=daam&realm=ws', { cm_ws_token: wsTok('ws@x.mn') });
  assert.deepStrictEqual(ok.starts, [['daam', true]]);

  const noWs = await run('?embed=gomoku&realm=ws', { cm_ws_token: wsTok('ws@x.mn') });
  assert.deepStrictEqual(types(noWs), ['cm-game-locked:needBuy']);

  // cyber-math.com-ийн нэвтрэлт (cm_token), Premium, cm эрх — embed-д тооцогдохгүй (тусдаа сайт)
  const cmOnly = await run('?embed=daam&realm=ws', { cm_token: cmTok('cmprem@x.mn') });
  assert.deepStrictEqual(types(cmOnly), ['cm-game-locked:login']);
  assert.strictEqual(cmOnly.starts.length, 0);
  const cmWithWs = await run('?embed=daam&realm=ws', { cm_token: cmTok('cmprem@x.mn'), cm_ws_token: wsTok('cmprem@x.mn') });
  assert.deepStrictEqual(types(cmWithWs), ['cm-game-locked:needBuy'], 'cm Premium ws-д хамаарахгүй');

  // найзын урилга (host ws эрхтэй) → нэвтрээгүй найз embed-ээр нэгдэнэ
  const host = browser({ ls: { cm_ws_token: wsTok('ws@x.mn') } }).CMGamesHost;
  const iv = await host.invite('daam', { realm: 'ws' });
  assert.strictEqual(iv.s, 200);
  const fr = await run('?embed=daam&realm=ws&einv=' + encodeURIComponent(iv.d.invite), { cm_device: 'friend00device01' }, '192.0.2.99');
  assert.deepStrictEqual(fr.starts, [['daam', true]], JSON.stringify(types(fr)));
  assert.strictEqual(fr.S.CM_EMBED.via, 'invite');
  // урилга өөр тоглоомд → invite
  const fr2 = await run('?embed=ludo&realm=ws&einv=' + encodeURIComponent(iv.d.invite), { cm_device: 'friend00device01' }, '192.0.2.99');
  assert.deepStrictEqual(types(fr2), ['cm-game-locked:invite']);
});

// ───────────────────────── эхний ээлж: төлбөр ЗӨВХӨН Дасгалын төвд (GAME_PAYWALL тавиагүй) ─────────────────────────
// Эзэмшигчийн шийдвэр «эхний ээлжинд дасгалын төвд л»: ws төлбөртэй; cyber-math.com (cm) ба gate (шууд URL) хуучин шигээ.
function gateRes() {
  const h = {};
  return { statusCode: 200, headers: h, body: null, setHeader(k, v) { h[String(k).toLowerCase()] = v; }, getHeader(k) { return h[String(k).toLowerCase()]; },
    end(b) { this.body = b == null ? null : (Buffer.isBuffer(b) ? b : Buffer.from(String(b))); return this; } };
}
async function gateHit(gate, q) {
  const res = gateRes();
  await gate({ method: 'GET', url: '/gate/game.js?' + new URLSearchParams(q).toString(), query: q, headers: {} }, res);
  return res;
}
test('эхний ээлж (GAME_PAYWALL тавиагүй): ws төлбөртэй, cm/gate/шууд URL хуучин шигээ нээлттэй', async () => {
  const gate = require(path.join(F.WT, 'gate', 'game.js'));
  delete process.env.GAME_PAYWALL;
  try {
    assert.strictEqual(GM.PAYWALL_DEFAULT_ON, false, 'PAYWALL_DEFAULT_ON өөрчлөгдөөгүй (cm UI нэгтгэгдээгүй)');
    assert.strictEqual(GM.WS_PAYWALL_DEFAULT_ON, true);
    assert.deepStrictEqual([GM.paywallOn(), GM.paywallOn('cm'), GM.paywallOn('ws'), GM.paywallOn('xx')], [false, false, true, false]);

    // gate (cyber-math.com-ийн iframe, play/team/xp.html, шууд URL) — тасалбаргүй нээлттэй
    for (const g of ['sudoku', 'play2048', 'xpdrop', 'myangat', 'numseq', 'sbh']) {
      const r = await gateHit(gate, { g: g });
      assert.strictEqual(r.statusCode, 200, g);
      assert.strictEqual(r.headers['x-game-gate'], 'off', g);
    }
    assert.strictEqual((await gateHit(gate, { g: 'mathmortal', f: 'index.html' })).statusCode, 200);

    // каталог: realm тус бүр
    const anonW = browser();
    const cw = await anonW.CMGamesHost.catalog(true, 'ws');
    assert.strictEqual(cw.enabled, true); assert.strictEqual(cw.realm, 'ws'); assert.strictEqual(cw.price, 1900);
    const cc = await anonW.CMGamesHost.catalog(true, 'cm');
    assert.strictEqual(cc.enabled, false); assert.strictEqual(cc.realm, 'cm');
    assert.strictEqual((await anonW.CMGamesHost.catalog(true)).enabled, false, 'realm-гүй = gate');
    assert.ok(anonW.log.some((x) => x.action === 'catalog' && x.path === '/api/games'), 'catalog');

    // cyber-math.com: нэвтрэлтгүй ч тоглоом нээлттэй, худалдан авах нэхэмжлэх үүсгэхгүй
    F.addUser('cmkid@x.mn');
    const cmH = browser({ path: '/', ls: { cm_token: cmTok('cmkid@x.mn') } }).CMGamesHost;
    const cl = await browser({ path: '/' }).CMGamesHost.launch('sudoku', { realm: 'cm' });
    assert.deepStrictEqual([cl.s, cl.d.via, cl.d.url], [200, 'off', '/sudoku.html']);
    const cb = await cmH.buyCreate('sudoku', { realm: 'cm' });
    assert.deepStrictEqual([cb.s, cb.d.already, cb.d.via], [409, true, 'off']);
    assert.strictEqual(F.qp.invoices.length, 0);

    // Дасгалын төв: нэвтрэлт + эрх шаардана → худалдан авна → тоглоно (gate нээлттэй тул тасалбаргүй шууд зам)
    const W = browser({ ls: { cm_ws_token: wsTok('first@x.mn') } });
    const H = W.CMGamesHost;
    assert.strictEqual((await anonW.CMGamesHost.launch('sudoku', { realm: 'ws' })).s, 401);
    const st = await H.status({ realm: 'ws' });
    assert.deepStrictEqual([st.s, st.d.enabled], [200, true]);
    const l0 = await H.launch('sudoku', { realm: 'ws' });
    assert.deepStrictEqual([l0.s, l0.d.needBuy], [402, true]);
    const c = await H.buyCreate('sudoku', { realm: 'ws' });
    assert.strictEqual(c.s, 200, JSON.stringify(c.d));
    assert.strictEqual(c.d.amount, 1900);
    F.qp.paid.set(c.d.invoice.invoice_id, 1900);
    const ch = await H.buyCheck(c.d.invoice.invoice_id, c.d.email);
    assert.strictEqual(ch.d.paid, true);
    const l1 = await H.launch('sudoku', { realm: 'ws' });
    assert.deepStrictEqual([l1.s, l1.d.via, l1.d.url], [200, 'access', '/sudoku.html']);
    assert.strictEqual((await gateHit(gate, { g: 'sudoku' })).statusCode, 200);
    assert.strictEqual((await H.launch('play2048', { realm: 'ws' })).s, 402, 'өөр тоглоом эрхгүй');
    // ws-д авсан эрх cyber-math.com-д хамаарахгүй (тэнд одоогоор бүгд үнэгүй)
    const cs = await cmH.status({ realm: 'cm' });
    assert.deepStrictEqual([cs.s, cs.d.enabled, cs.d.games], [200, false, {}]);

    // inline (embed): ws эрх шаардана; олон тоглогчийн урилга ws-д ажиллана
    const noEnt = embed({ search: '?embed=ludo&realm=ws', ls: { cm_ws_token: wsTok('first@x.mn') }, fetch: apiFetch([], '198.51.100.31') });
    await ticks(20);
    assert.deepStrictEqual(types(noEnt), ['cm-game-locked:needBuy']);
    give('ws', 'first@x.mn', 'ludo', 3);
    const iv = await H.invite('ludo', { realm: 'ws' });
    assert.strictEqual(iv.s, 200, JSON.stringify(iv.d));
    assert.ok(iv.d.invite, 'урилгын токен (ws төлбөртэй)');
    const fr = embed({ search: '?embed=ludo&realm=ws&einv=' + encodeURIComponent(iv.d.invite), ls: { cm_device: 'friend00device77' }, fetch: apiFetch([], '192.0.2.77') });
    await ticks(20);
    assert.deepStrictEqual(fr.starts, [['ludo', true]], JSON.stringify(types(fr)));
    // cm-д урилга хэрэггүй (үнэгүй) — токенгүй url
    const ci = await cmH.invite('ludo', { realm: 'cm' });
    assert.deepStrictEqual([ci.s, ci.d.via, ci.d.invite], [200, 'off', null]);

    // kill-switch: GAME_PAYWALL=off → ws ч нээлттэй
    process.env.GAME_PAYWALL = 'off';
    assert.strictEqual((await anonW.CMGamesHost.launch('play2048', { realm: 'ws' })).d.via, 'off');
    assert.strictEqual((await anonW.CMGamesHost.catalog(true, 'ws')).enabled, false);
  } finally {
    process.env.GAME_PAYWALL = 'on';
  }
});

// ───────────────────────── статик шалгалт ─────────────────────────
const EMOJI =/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
function between(src, a, b) {
  const i = src.indexOf(a);
  assert.ok(i >= 0, 'олдсонгүй: ' + a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(j > i, 'төгсгөл олдсонгүй: ' + b);
  return src.slice(i, j + b.length);
}

test('worksheets.html: #gamesSec + games-host.js + GW (realm ws), утсан дээрх модалын дүрэм, эможигүй', () => {
  const sec = between(WSH, '<section id="gamesSec"', '</section>');
  assert.match(sec, /id="gcards"/);
  assert.ok(WSH.indexOf('<script src="/games-host.js"></script>') > WSH.indexOf('id="gamesSec"'));
  const gw = between(WSH, '/* ═══ Дасгалын төв — Тоглоом (window.GW)', '</script>').replace(/<\/script>$/, '');
  new vm.Script(gw, { filename: 'worksheets.html#GW' });
  assert.match(gw, /var REALM='ws'/);
  assert.match(gw, /H\.buyCreate\(k,\{realm:REALM\}\)/);
  assert.match(gw, /H\.launch\(k,\{realm:REALM,invite:inv\}\)/);
  assert.match(gw, /H\.embedUrl\(k,REALM,inv\)/);
  assert.match(gw, /scrollIntoView\(\{block:'center'\}\)/, 'QR гарсны дараа төв рүү гүйлгэнэ');
  assert.doesNotMatch(gw, /cm_token/, 'Дасгалын төв cyber-math.com-ийн токен ашиглахгүй');
  assert.doesNotMatch(gw, /amount|months|promo/i, 'клиент дүн/хугацаа/промо илгээхгүй');
  const css = between(WSH, '/* ---- Тоглоом (#gamesSec) ---- */', '.gp-link button{');
  const rule = (sel) => { const m = new RegExp('(^|[}\\s])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\{([^}]*)\\}').exec(css); assert.ok(m, sel); return m[2]; };
  const ov = rule('.gp-ov');
  ['position:fixed', 'inset:0', 'overflow-y:auto', 'grid-template-columns:minmax(0,1fr)', 'box-sizing:border-box'].forEach((x) => assert.ok(ov.indexOf(x) >= 0, '.gp-ov ' + x));
  const card = rule('.gp-card');
  ['box-sizing:border-box', 'min-width:0', 'margin:auto'].forEach((x) => assert.ok(card.indexOf(x) >= 0, '.gp-card ' + x));
  const img = rule('.gp-qr img');
  ['max-width:100%', 'height:auto'].forEach((x) => assert.ok(img.indexOf(x) >= 0, '.gp-qr img ' + x));
  [sec, gw, css].forEach((s, i) => assert.doesNotMatch(s, EMOJI, 'эможи #' + i));
  // chip «Тоглоом» шүүлтүүрийг өөрчлөхгүй, #gamesSec руу гүйлгэнэ
  assert.match(WSH, /\{k:'games',t:ICO_PAD\+'Тоглоом',games:true\}/);
  assert.match(WSH, /if\(b\.getAttribute\('data-k'\)==='games'\)\{if\(window\.GW\)GW\.scrollTo\(\);return;\}/);
});

test('index.html: #gp-embed бие даасан блок (синтакс, эможигүй, startGame-ийг өөрчлөөгүй); games-host.js эможигүй; vercel.json статик', () => {
  new vm.Script(EMBED_SRC, { filename: 'index.html#gp-embed' });
  const css = between(INDEX, '<style id="gp-embed-css">', '</style>');
  assert.match(css, /#gp-emb\{position:fixed;inset:0;[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*overflow-y:auto/);
  [EMBED_SRC, css].forEach((s) => assert.doesNotMatch(s, EMOJI));
  assert.strictEqual((INDEX.match(/<script id="gp-embed">/g) || []).length, 1);
  assert.strictEqual((INDEX.match(/function startGame\(/g) || []).length, 1);
  assert.doesNotMatch(HOST_SRC, EMOJI);
  new vm.Script(HOST_SRC, { filename: 'games-host.js' });
  const V = JSON.parse(fs.readFileSync(path.join(F.WT, 'vercel.json'), 'utf8'));
  assert.ok((V.builds || []).some((b) => b.src === 'games-host.js' && b.use === '@vercel/static'), 'build');
  assert.ok((V.routes || []).some((r) => r.src === '/games-host.js' && r.dest === '/games-host.js'), 'route');
  const CR = require(path.join(F.WT, 'scripts', 'check-game-routes.js'));
  const out = CR.check(V);
  assert.strictEqual(out.ok, true, JSON.stringify(out.errors));
  // Дасгалын төв launch-ийг хуудсан доторх биш /games-host.js-ээр дууддаг — readiness үүнийг тооцно
  assert.ok(!out.readiness.missing.some((m) => m.file === 'worksheets.html'), JSON.stringify(out.readiness.missing));
  // index.html-ийн embed блок (зөвхөн ws) нь cyber-math.com-ийн launch UI гэж ТООЦОГДОХГҮЙ (cm UI — gp-s5)
  const embOnly = '<script id="gp-embed">fetch(\'/api/games?action=launch\')</script><iframe src="/sudoku.html"></iframe>';
  assert.strictEqual(CR.pageHasLaunch({ file: 'index.html', text: embOnly }), false);
  assert.strictEqual(CR.pageHasLaunch({ file: 'index.html', text: embOnly + '<script>authFetch(\'/api/games?action=launch\')</script>' }), true);
  assert.strictEqual(CR.pageHasLaunch({ file: 'index.html', text: INDEX }), CR.hasLaunch(CR.withoutEmbed(INDEX)));
  assert.strictEqual(CR.withoutEmbed(INDEX).indexOf('id="gp-embed"'), -1);
  assert.ok(CR.withoutEmbed(INDEX).indexOf('function startGame(') > 0, 'зөвхөн embed блок хасагдана');
  // PAYWALL_DEFAULT_ON ⇔ readiness (cm UI нэгтгэгдээгүй энэ branch-д хоёулаа false)
  assert.strictEqual(GM.PAYWALL_DEFAULT_ON, out.readiness.ready);
});

test('сүлжээ 0, тодорхойгүй SQL алга', () => {
  assert.deepStrictEqual(F.qp.other, []);
  assert.deepStrictEqual(F.db.unknown, []);
});
