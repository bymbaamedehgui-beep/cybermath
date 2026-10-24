// gg-intro: Дасгалын төвийн тоглоомын «Танилцуулга» (games-intros.js + worksheets.html) ба
//           «Сонго · Бод · Хож» (sbh)-ийн Дасгалын төвийн embed горимд зочноор өрөө үүсгэх/нэгдэх (index.html).
//  1) games-intros.js — 17 тоглоом бүгд бүрэн агуулгатай, эможигүй, 11-р анги «тун удахгүй», {price}/{days}/{hours} бөглөнө, XSS-гүй.
//  2) worksheets.html (window.GW) — карт бүрт «Танилцуулга»; модал: 8 хэсэг, дугаарласан алхам, үнэ/хоног каталогоос,
//     доод товч картын үйлдлийг дуудна (Нэвтэрч худалдан авах / Худалдан авах / Тоглох), X / Хаах / Esc / гадна → хаагдана.
//  3) index.html sbh — embed (CM_EMBED.ok, key 'sbh') + нэвтрэлтгүй → 'guest_' + cm_guest_id; энгийн горимд өөрчлөлтгүй;
//     бодит api/onlinegame.js (санах ойн хуурамч pool) дээр 2 зочин өрөө үүсгэж, нэгдэж, нүүдэл хийнэ.
// Ажиллуулах: node --test tests/games-intros.test.js   (сүлжээ / бодит DB 0)
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
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const ORIGIN = 'https://cyber-math.com';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0';

const read = (f) => fs.readFileSync(path.join(F.WT, f), 'utf8');
const INTROS_SRC = read('games-intros.js');
const HOST_SRC = read('games-host.js');
const WSH = read('worksheets.html');
const IDX = read('index.html');
const UI_TEST = fs.readFileSync(path.join(__dirname, 'games-ws-ui.test.js'), 'utf8');

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const J = (x) => JSON.parse(JSON.stringify(x));
function ticks(n) { let p = Promise.resolve(); for (let i = 0; i < (n || 30); i++) p = p.then(() => new Promise((r) => setImmediate(r))); return p; }
function between(src, a, b) {
  const i = src.indexOf(a);
  assert.ok(i >= 0, 'олдсонгүй: ' + a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(j > i, 'төгсгөл олдсонгүй: ' + b);
  return src.slice(i, j);
}
function give(email, key, days) {
  F.db.access.set('ws|' + email + '|' + key, { realm: 'ws', email: email, game_key: key, expires_at: new Date(Date.now() + (days == null ? 30 : days) * F.DAY), updated_at: new Date() });
}
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

// ───────── games-intros.js-ийг дангаар ачаалах ─────────
function loadIntros() {
  const W = {};
  W.window = W;
  vm.createContext(W);
  vm.runInContext(HOST_SRC, W, { filename: 'games-host.js' });
  vm.runInContext(INTROS_SRC, W, { filename: 'games-intros.js' });
  return W;
}
const SECS = ['about', 'how', 'math', 'modes', 'controls', 'tips', 'grade', 'access'];
const HEADS = ['Юу вэ', 'Хэрхэн тоглох', 'Сургах чадвар', 'Горимууд', 'Удирдлага', 'Зөвлөмж', 'Анги/сэдэв', 'Эрх'];

// ───────────────────────── 1. агуулга ─────────────────────────
test('games-intros.js: 17 тоглоом бүгд (CMGamesHost.KEYS) бүрэн агуулгатай, эможигүй, 11-р анги «тун удахгүй»', () => {
  const W = loadIntros();
  const G = W.GAME_INTROS, H = W.CMGamesHost;
  assert.ok(G && typeof G.html === 'function', 'window.GAME_INTROS');
  assert.strictEqual(H.KEYS.length, 17);
  assert.deepStrictEqual(J(Object.keys(G.games).sort()), J(H.KEYS.slice().sort()), 'тоглоом бүрт танилцуулга (илүү/дутуу 0)');
  H.KEYS.forEach((k) => {
    const g = G.get(k);
    assert.ok(G.has(k), k);
    assert.ok(typeof g.title === 'string' && g.title.trim().length >= 2, k + '.title');
    ['tagline', 'about', 'controls', 'grade_topic'].forEach((f) => assert.ok(typeof g[f] === 'string' && g[f].trim().length >= 10, k + '.' + f));
    ['how_to_play', 'math', 'modes', 'tips'].forEach((f) => {
      assert.ok(Array.isArray(g[f]) && g[f].length >= 1, k + '.' + f);
      g[f].forEach((s, i) => assert.ok(typeof s === 'string' && s.trim().length >= 5, k + '.' + f + '[' + i + ']'));
    });
    assert.ok(g.how_to_play.length >= 3, k + ': хэрхэн тоглох алхам ≥3');
    assert.ok(!EMOJI.test(JSON.stringify(g)), k + ': эможи');
    assert.ok(!/11-р ангид зөвхөн/.test(g.grade_topic), k + ': 11-р ангийн хуучин мөр');
    if (k !== 'numseq') assert.match(g.grade_topic, /11-р анги тун удахгүй/, k);
  });
  assert.match(G.common.grade_topic, /11-р анги тун удахгүй/);
  assert.match(G.common.grade_topic, /үнэ, эрхэд нөлөөлөхгүй/);
  assert.ok(!EMOJI.test(INTROS_SRC), 'файлд эможи');
  assert.match(G.get('sbh').tips.join(' '), /cyber-math\.com-д нэвтрэх шаардлагагүй/);
  // HUD эсвэл has() буруу оролт
  assert.strictEqual(G.has('__proto__'), false);
  assert.strictEqual(G.has(1), false);
  assert.strictEqual(G.html('nope', {}), '');
});

test('games-intros.js: fill {price}/{days}/{hours}; html — 8 хэсэг дарааллаар, дугаарласан алхам, эрх каталогоос, XSS-гүй', () => {
  const W = loadIntros();
  const G = W.GAME_INTROS;
  assert.strictEqual(G.fill(G.common.access_tpl, { price: '1 900', days: 30 }), 'Тоглоом бүрийн эрхийг тусад нь авна: 1 900₮ / 30 хоног.');
  assert.match(G.fill(G.common.multi_tpl, { hours: 3 }), /холбоос 3 цаг хүчинтэй\.$/);
  assert.strictEqual(G.fill('{x} {price}', {}), '{x} ');
  W.CMGamesHost.KEYS.forEach((k) => {
    const g = G.get(k);
    const h = G.html(k, { price: '1 900', days: 30, hours: 3, multi: true, enabled: true });
    const order = SECS.map((s) => h.indexOf('data-gi-sec="' + s + '"'));
    order.forEach((x, i) => assert.ok(x > 0, k + ': хэсэг ' + SECS[i]));
    assert.deepStrictEqual(order.slice().sort((a, b) => a - b), order, k + ': хэсгийн дараалал');
    HEADS.forEach((t) => assert.ok(h.indexOf('</svg>' + t + '</div>') > 0, k + ': гарчиг ' + t));
    const ol = between(h, '<ol>', '</ol>');
    assert.strictEqual((ol.match(/<li>/g) || []).length, g.how_to_play.length, k + ': алхмын тоо');
    assert.ok(h.indexOf(G.esc(g.about)) > 0 && h.indexOf(G.esc(g.grade_topic)) > 0 && h.indexOf(G.esc(G.common.grade_topic)) > 0, k);
    assert.ok(!/\{(price|days|hours)\}/.test(h), k + ': бөглөөгүй загвар');
    assert.match(h, /1 900₮ \/ 30 хоног/);
    assert.match(h, /3 цаг хүчинтэй/);
    assert.ok(!EMOJI.test(h), k + ': эможи');
  });
  // ганц тоглогчтой / үнэ ачаалагдаагүй / үнэгүй
  const solo = G.html('sudoku', { price: '', days: 45, hours: 3, multi: false, enabled: true });
  assert.match(solo, /45 хоногоор/);
  assert.ok(!/өрөө үүсгэгч эрх авна/.test(solo), 'ганц тоглогчид олон тоглогчийн мөр гарахгүй');
  const free = G.html('sbh', { price: '1 900', days: 30, hours: 3, multi: true, enabled: false });
  assert.match(free, /одоогоор үнэгүй нээлттэй/);
  assert.ok(!/1 900₮/.test(free));
  // XSS: агуулга / каталогийн утга HTML болж гарахгүй
  const g0 = G.games.gomoku;
  const bad = '<img src=x onerror="alert(1)">&\'';
  G.games.gomoku = Object.assign({}, g0, { about: bad, how_to_play: [bad, 'a2 алхам', 'a3 алхам'], tips: [bad], controls: bad });
  const x = G.html('gomoku', { price: '<b>1</b>', days: '<i>', hours: '"><script>', multi: true, enabled: true });
  G.games.gomoku = g0;
  assert.ok(x.indexOf('<img') < 0 && x.indexOf('<script') < 0 && x.indexOf('<b>1') < 0 && x.indexOf('<i>') < 0, 'escape');
  assert.ok(x.indexOf('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;&amp;&#39;') > 0);
});

// ───────────────────────── 2. worksheets.html (GW) ─────────────────────────
// Хуурамч DOM-ийг games-ws-ui.test.js-ээс авна (нэг эх сурвалж)
const DOM = new Function(between(UI_TEST, '// ───────── хамгийн бага DOM', '// /api/questions (core API')
  + '\nreturn { makeDoc: makeDoc, clock: clock, storage: storage };')();
const SEC_HTML = between(WSH, '<section id="gamesSec"', '</section>') + '</section>';
const ESC_SRC = (/function esc\(s\)\{[^\r\n]*\}/.exec(WSH) || [])[0];
const AUTH_SRC = between(WSH, '/* ── Хэрэглэгчийн нэвтрэлт (худалдан авсан имэйлээр) ── */', 'function openRefModal(){');
const GW_SRC = between(WSH, '/* ═══ Дасгалын төв — Тоглоом (window.GW)', '</script>');
const PRELUDE = [
  'var ADMIN_TOKEN=null; function isAdmin(){return false;}',
  'function toast(m){window.toasts.push(String(m));}',
  'function openLogin(auto){window.logins.push(auto===true?"auto":"manual");}',
  'function ensurePin(){window.pins++;}',
  'function initWelcomeOffer(cb){window.welcome++;cb(false);}',
  'function checkFbReplies(){} function wsInviteClear(){} function openInvite(){window.invites++;}',
  'var WS_INVITE=null, LOGIN_REQ=null, PROMO_CODE=null;',
].join('\n');
function apiFetch(log, ip) {
  return async function (url, opts) {
    opts = opts || {};
    const u = new URL(String(url), ORIGIN);
    const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
    const headers = {}; Object.keys(opts.headers || {}).forEach((k) => { headers[k.toLowerCase()] = opts.headers[k]; });
    let body = {}; try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    const ent = { path: u.pathname, action: query.action, body: body, query: query };
    log.push(ent);
    let r;
    if (u.pathname === '/api/questions') r = { status: 200, body: { ok: true, grade: query.game_topics || query.game, total: 40, chapters: [{ name: '', topics: [{ id: 801, name: 'Сэдэв', n: 40 }] }], questions: [] } };
    else {
      const h = u.pathname === '/api/games' ? games : u.pathname === '/api/qpay' ? qpay : null;
      if (!h) throw new Error('blocked ' + u.pathname);
      const x = await F.call(h, { method: opts.method || 'GET', query: query, body: body, headers: headers, ip: ip });
      r = { status: x.statusCode, body: x.body };
    }
    ent.status = r.status; ent.res = r.body;
    return { status: r.status, ok: r.status < 400, json: async () => J(r.body) };
  };
}
function page(o) {
  o = o || {};
  const doc = DOM.makeDoc();
  doc.body.innerHTML = '<div id="acctArea"></div><span class="pill gpill" id="gamesPill" role="button" tabindex="0"></span>' + SEC_HTML + '<div id="toast"></div>';
  const T = DOM.clock();
  const loc = { origin: ORIGIN, href: ORIGIN + '/worksheets', pathname: '/worksheets', search: '', hash: '' };
  const W = {
    document: doc, localStorage: DOM.storage(o.ls), sessionStorage: DOM.storage(), location: loc,
    history: { state: null, replaceState: function () {} },
    navigator: { userAgent: UA, language: 'mn-MN', hardwareConcurrency: 8 },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    crypto: nodeCrypto.webcrypto,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    URL: URL, console: console,
    setTimeout: T.setTimeout, clearTimeout: T.clear, setInterval: T.setInterval, clearInterval: T.clear,
    _ls: {}, addEventListener(t, f) { (W._ls[t] = W._ls[t] || []).push(f); },
    toasts: [], logins: [], pins: 0, welcome: 0, invites: 0, log: [],
  };
  W.window = W;
  W.fetch = apiFetch(W.log, '198.51.100.9');
  vm.createContext(W);
  const run = (src, name) => vm.runInContext(src, W, { filename: name });
  run(PRELUDE + '\n' + ESC_SRC, 'prelude');
  run(AUTH_SRC, 'worksheets.html#auth');
  run(HOST_SRC, 'games-host.js');
  if (o.intros !== false) run(INTROS_SRC, 'games-intros.js');
  run(GW_SRC, 'worksheets.html#GW');
  const $ = (id) => doc.getElementById(id);
  return {
    W, doc, $,
    btn: (k, a) => doc.querySelector('#gcards .gcard[data-gk="' + k + '"] [data-ga="' + a + '"]'),
    q: (id, sel) => { const r = $(id); return r ? r.querySelector(sel) : null; },
    key: (k) => (doc.ls.keydown || []).slice().forEach((f) => f({ key: k })),
  };
}

beforeEach(() => { F.reset(); });

test('worksheets.html: games-intros.js ачаалагдана (games-host.js-ийн дараа), vercel.json static build + route', () => {
  const a = WSH.indexOf('<script src="/games-host.js"></script>'), b = WSH.indexOf('<script src="/games-intros.js"></script>');
  assert.ok(a > 0 && b > a, 'script дараалал');
  assert.ok(b < WSH.indexOf('/* ═══ Дасгалын төв — Тоглоом (window.GW)'), 'GW-ээс өмнө');
  const V = JSON.parse(read('vercel.json'));
  assert.ok(V.builds.some((x) => x.src === 'games-intros.js' && x.use === '@vercel/static'), 'build');
  assert.ok(V.routes.some((x) => x.src === '/games-intros.js' && x.dest === '/games-intros.js'), 'route');
  // CSS: модал утсан дээр гүйлгэгдэнэ (.gp-ov overflow-y:auto), карт min-width:0, урт үг тасарна
  assert.match(WSH, /\.gp-ov\{[^}]*overflow-y:auto/);
  assert.match(WSH, /\.gp-card\{[^}]*min-width:0/);
  assert.match(WSH, /\.gi p\{[^}]*overflow-wrap:anywhere/);
  assert.match(WSH, /\.gi-acc\{[^}]*background:transparent;border-left:3px solid #d946ef/, 'санамж — тунгалаг + ягаан ирмэг (шар биш)');
});

test('GW: нэвтрээгүй → 17 картад «Танилцуулга»; модал 8 хэсэг + үнэ каталогоос; «Нэвтэрч худалдан авах» → нэвтрэх; X / Хаах / Esc / гадна → хаагдана', async () => {
  const P = page({});
  await ticks();
  assert.strictEqual(P.doc.querySelectorAll('#gcards .gcard').length, 17);
  assert.strictEqual(P.doc.querySelectorAll('#gcards [data-ga="intro"]').length, 17, 'карт бүрт «Танилцуулга»');
  const ib = P.btn('mathmortal', 'intro');
  assert.match(ib.textContent, /^Танилцуулга$/);
  assert.ok(ib.innerHTML.indexOf('<svg') === 0, 'SVG icon');
  ib.click();
  const ov = P.$('gpIntro');
  assert.ok(ov, 'модал');
  assert.strictEqual(ov.getAttribute('role'), 'dialog');
  assert.ok(ov.classList.contains('gp-ov'));
  const card = ov.querySelector('.gp-card');
  assert.ok(card.classList.contains('gi-card'));
  const G = P.W.GAME_INTROS, g = G.get('mathmortal');
  assert.strictEqual(card.querySelector('h3').textContent, 'MATH MORTAL');
  assert.strictEqual(card.querySelector('.gp-sub').textContent, g.tagline);
  assert.strictEqual(card.querySelectorAll('[data-gi-sec]').length, 8);
  assert.deepStrictEqual(card.querySelectorAll('.gi-h').map((h) => h.textContent), HEADS);
  assert.strictEqual(card.querySelectorAll('[data-gi-sec="how"] ol li').length, g.how_to_play.length);
  assert.match(card.querySelector('[data-gi-sec="access"]').textContent, /1 900₮ \/ 30 хоног/);
  assert.match(card.querySelector('[data-gi-sec="access"]').textContent, /3 цаг хүчинтэй/, 'MATH MORTAL — олон тоглогч');
  assert.ok(!EMOJI.test(card.innerHTML));
  const go = card.querySelector('[data-gi-go]');
  assert.match(go.textContent, /Нэвтэрч худалдан авах/);
  go.onclick();
  assert.strictEqual(P.$('gpIntro'), null, 'хаагдана');
  assert.deepStrictEqual(J(P.W.logins), ['manual'], 'картын «Нэвтэрч худалдан авах»-тай ижил');
  assert.strictEqual(typeof P.W.__afterLogin, 'function');
  // X
  P.btn('sudoku', 'intro').click();
  assert.ok(P.$('gpIntro'));
  assert.ok(!/өрөө үүсгэгч эрх авна/.test(P.q('gpIntro', '[data-gi-sec="access"]').textContent), 'Судоку — ганц тоглогч');
  P.q('gpIntro', '[data-gp-x]').onclick();
  assert.strictEqual(P.$('gpIntro'), null);
  // «Хаах»
  P.btn('sudoku', 'intro').click();
  P.q('gpIntro', '[data-gi-x]').onclick();
  assert.strictEqual(P.$('gpIntro'), null);
  // Esc (бусад товч хаахгүй) → listener арилна
  P.btn('ludo', 'intro').click();
  P.key('Enter');
  assert.ok(P.$('gpIntro'), 'Enter хаахгүй');
  P.key('Escape');
  assert.strictEqual(P.$('gpIntro'), null, 'Esc');
  assert.strictEqual((P.doc.ls.keydown || []).length, 0, 'keydown listener цэвэрлэгдэнэ');
  // гадна дарах (overlay mousedown)
  P.btn('ludo', 'intro').click();
  const o2 = P.$('gpIntro');
  o2.ls.mousedown.forEach((f) => f({ target: o2 }));
  assert.strictEqual(P.$('gpIntro'), null, 'гадна');
  assert.strictEqual((P.doc.ls.keydown || []).length, 0);
  // давхар нээвэл нэг л модал
  P.btn('ludo', 'intro').click(); P.btn('daam', 'intro').click();
  assert.strictEqual(P.doc.querySelectorAll('#gpIntro').length, 1);
  assert.strictEqual(P.q('gpIntro', 'h3').textContent, '10x10 Checkers');
  assert.strictEqual((P.doc.ls.keydown || []).length, 1);
});

test('GW: нэвтэрсэн — эрхгүй → «Худалдан авах» (QPay модал); эрхтэй → «Тоглох» (анги сонгогч / тоглох урсгал)', async () => {
  give('kid@x.mn', 'play2048', 20);
  const P = page({ ls: { cm_ws_token: wsTok('kid@x.mn') } });
  await ticks();
  assert.strictEqual(P.doc.querySelectorAll('#gcards [data-ga="intro"]').length, 17);
  P.btn('sudoku', 'intro').click();
  let go = P.q('gpIntro', '[data-gi-go]');
  assert.match(go.textContent, /^Худалдан авах$/);
  assert.ok(!go.classList.contains('play'));
  go.onclick();
  assert.strictEqual(P.$('gpIntro'), null);
  assert.ok(P.$('gpBuy'), 'картын «Худалдан авах»-тай ижил — худалдан авах модал');
  P.q('gpBuy', '[data-gp-x]').onclick();
  // эрхтэй (анги сонгоогүй) → Тоглох → сонгогч цонх (картын «Тоглох»-той ижил)
  P.btn('play2048', 'intro').click();
  go = P.q('gpIntro', '[data-gi-go]');
  assert.match(go.textContent, /^Тоглох$/);
  assert.ok(go.classList.contains('play'));
  go.onclick();
  await ticks();
  assert.strictEqual(P.$('gpIntro'), null);
  assert.ok(P.$('gpSel'), 'анги тодорхойгүй → сонгогч');
  assert.strictEqual(P.W.log.filter((x) => x.action === 'launch').length, 0, 'сонгохоос өмнө launch хийхгүй');
  assert.strictEqual(typeof P.W.GW.intro, 'function');
});

test('GW: games-intros.js ачаалагдаагүй бол «Танилцуулга» товч гарахгүй, бусад нь хэвээр', async () => {
  const P = page({ intros: false });
  await ticks();
  assert.strictEqual(P.doc.querySelectorAll('#gcards .gcard').length, 17);
  assert.strictEqual(P.doc.querySelectorAll('#gcards [data-ga="intro"]').length, 0);
  assert.strictEqual(P.doc.querySelectorAll('#gcards [data-ga="login"]').length, 17);
  assert.strictEqual(P.W.GW.intro('sudoku'), null);
});

// ───────────────────────── 3. sbh — embed горимд зочноор ─────────────────────────
const SBH_ID = between(IDX, '      var sbhGuestMem = null;', '      function renderLobbyPlayers(){');
const SBH_ROOM = between(IDX, '      window.sbhCreateRoom = function(playerCount){', '      function showLobby(){');

// api/onlinegame.js — санах ойн хуурамч pool (бодит DB 0)
function onlineGame() {
  const rows = [];
  let seq = 0;
  const pool = {
    async query(sql, p) {
      const s = String(sql).replace(/\s+/g, ' ').trim();
      p = p || [];
      if (/^CREATE /.test(s)) return { rows: [] };
      if (/^SELECT 1 FROM online_games WHERE room_code=\$1/.test(s)) return { rows: rows.filter((r) => r.room_code === p[0] && r.status !== 'finished') };
      if (/^INSERT INTO online_games/.test(s)) {
        const r = { id: ++seq, game_type: p[0], room_code: p[1], white_email: p[2], white_name: p[3], black_email: null, black_name: null, state: JSON.parse(p[4]), status: 'waiting' };
        rows.push(r); return { rows: [J(r)] };
      }
      if (/^SELECT \* FROM online_games WHERE room_code=\$1/.test(s)) {
        const m = rows.filter((r) => r.room_code === p[0] && (s.indexOf("status<>'finished'") < 0 || r.status !== 'finished'));
        return { rows: m.length ? [J(m[m.length - 1])] : [] };
      }
      if (/^UPDATE online_games SET black_email=\$1, black_name=\$2, state=\$3, status=\$4/.test(s)) {
        const r = rows.find((x) => x.id === p[4]); Object.assign(r, { black_email: p[0], black_name: p[1], state: JSON.parse(p[2]), status: p[3] }); return { rows: [J(r)] };
      }
      if (/^UPDATE online_games SET state=\$1, status=\$2/.test(s)) {
        const r = rows.find((x) => x.id === p[2]); Object.assign(r, { state: JSON.parse(p[0]), status: p[1] }); return { rows: [J(r)] };
      }
      if (/^UPDATE online_games SET state=\$1, updated_at=NOW\(\) WHERE id=\$2/.test(s)) {
        const r = rows.find((x) => x.id === p[1]); r.state = JSON.parse(p[0]); return { rows: [J(r)] };
      }
      throw new Error('onlinegame fake: танихгүй SQL ' + s.slice(0, 80));
    },
  };
  const src = fs.readFileSync(path.join(F.API, 'onlinegame.js'), 'utf8');
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', src)((n) => { if (n === './_db') return pool; throw new Error('require ' + n); }, mod, mod.exports);
  const handler = mod.exports;
  async function call(body) {
    let code = 200, out = null;
    const res = { setHeader() {}, status(c) { code = c; return res; }, json(o) { out = o; return res; }, end() { return res; } };
    await handler({ method: 'POST', body: J(body), headers: {} }, res);
    return { status: code, body: out };
  }
  return { rows, call };
}
function sbhPage(o) {
  o = o || {};
  const ls = o.lsThrows ? { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } : DOM.storage(o.ls);
  const W = {
    localStorage: ls, Math: Math, JSON: JSON, String: String, parseInt: parseInt,
    alerts: [], prompts: [], sent: [], lobby: 0, polling: 0,
    document: { getElementById: (id) => (id === 'sbh-join-code' ? { value: o.code || '' } : null) },
  };
  W.window = W;
  if (o.embed) W.CM_EMBED = Object.assign({ key: 'sbh', realm: 'ws', ok: true }, o.embed);
  if (o.user) W._currentUser = o.user;
  W.alert = (m) => W.alerts.push(String(m));
  W.prompt = (m, d) => { W.prompts.push(d); return o.name === undefined ? d : o.name; };
  W.fetch = async (url, opts) => {
    const b = JSON.parse(opts.body);
    W.sent.push({ url: url, body: b });
    const r = o.api ? await o.api.call(b) : { status: 200, body: { ok: true, game: { room_code: '123456', state: b.state || {} }, isHost: false, playerIndex: 1 } };
    return { json: async () => J(r.body) };
  };
  vm.createContext(W);
  vm.runInContext([
    'var sbhRoomCode=null, sbhIsHost=false, sbhExpectedPlayers=3, sbhMyIdx=-1, sbhPlayers=[];',
    "function getApi(){ return '/api/onlinegame'; }",
    'function showLobby(){ window.lobby++; } function startPolling(){ window.polling++; }',
    SBH_ID, SBH_ROOM,
    'window.__id = function(){ return userEmail(); }; window.__st = function(){ return { code: sbhRoomCode, host: sbhIsHost, idx: sbhMyIdx, players: sbhPlayers }; };',
  ].join('\n'), W, { filename: 'index.html#sbh' });
  return W;
}

test('sbh: cyber-math.com-ийн энгийн горим — өөрчлөлтгүй (нэвтрээгүй → «Эхлээд нэвтэрнэ үү», сүлжээ 0; нэвтэрсэн → имэйл)', async () => {
  let W = sbhPage({});
  W.sbhCreateRoom(3);
  W.sbhJoinByCode();
  await ticks();
  assert.deepStrictEqual(J(W.alerts), ['Эхлээд нэвтэрнэ үү', 'Эхлээд нэвтэрнэ үү']);
  assert.strictEqual(W.sent.length, 0);
  assert.strictEqual(W.localStorage.getItem('cm_guest_id'), null, 'зочин ID үүсгэхгүй');
  // launch зөвшөөрөгдөөгүй embed (ok:false) эсвэл өөр тоглоомын embed — мөн адил
  for (const e of [{ ok: false }, { key: 'chessmath' }, { ok: 'true' }]) {
    W = sbhPage({ embed: e });
    W.sbhCreateRoom(4);
    assert.deepStrictEqual(J(W.alerts), ['Эхлээд нэвтэрнэ үү'], JSON.stringify(e));
    assert.strictEqual(W.sent.length, 0);
  }
  W = sbhPage({ user: { email: 'bat@x.mn', firstName: 'Бат' } });
  W.sbhCreateRoom(3);
  await ticks();
  assert.strictEqual(W.sent[0].body.email, 'bat@x.mn');
  assert.strictEqual(W.prompts[0], 'Бат');
  // embed горимд ч cyber-math.com-д нэвтэрсэн бол жинхэнэ имэйл
  W = sbhPage({ embed: {}, user: { email: 'bat@x.mn' } });
  assert.strictEqual(W.__id(), 'bat@x.mn');
});

test('sbh: Дасгалын төвийн embed — нэвтрэлтгүй host ба урилгаар орсон найз зочин ID-аар өрөө үүсгэж, нэгдэж, нүүнэ (бодит api/onlinegame.js)', async () => {
  const api = onlineGame();
  const A = sbhPage({ embed: {}, api: api, name: 'Болд' });
  A.sbhCreateRoom(3);
  await ticks();
  assert.deepStrictEqual(J(A.alerts), []);
  const ga = A.localStorage.getItem('cm_guest_id');
  assert.ok(/^[a-z0-9]{1,12}$/.test(ga), 'cm_guest_id хадгалагдана (meIdentity-тэй ижил)');
  const ea = 'guest_' + ga;
  assert.strictEqual(A.__id(), ea, 'тогтвортой');
  const c = A.sent[0].body;
  assert.deepStrictEqual([c.action, c.email, c.name, c.game_type, c.state.players[0].email, c.state.expectedPlayers], ['create', ea, 'Болд', 'sbh', ea, 3]);
  const sa = A.__st();
  assert.ok(/^\d{6}$/.test(sa.code));
  assert.deepStrictEqual([sa.host, sa.idx, A.lobby, A.polling], [true, 0, 1, 1]);
  assert.strictEqual(api.rows[0].white_email, ea);
  // найз — өөр төхөөрөмж (өөр localStorage), урилгаар (einv) орсон embed, cyber-math.com-д нэвтрээгүй
  const B = sbhPage({ embed: { via: 'invite' }, api: api, code: sa.code, name: 'Сараа' });
  B.sbhJoinByCode();
  await ticks();
  assert.deepStrictEqual(J(B.alerts), []);
  const eb = B.__id();
  assert.ok(/^guest_[a-z0-9]+$/.test(eb) && eb !== ea, 'өөр зочин ID');
  assert.deepStrictEqual([B.sent[0].body.action, B.sent[0].body.email, B.sent[0].body.code], ['joinMulti', eb, sa.code]);
  const sb = B.__st();
  assert.deepStrictEqual([sb.code, sb.host, sb.idx, sb.players.map((p) => p.email)], [sa.code, false, 1, [ea, eb]]);
  // зочин нүүдэл хийж чадна (moveMulti 403 биш); sbhAnswer-ийн имэйл цэвэрлэгээ зочин ID-г өөрчлөхгүй
  const mv = await api.call({ action: 'moveMulti', email: eb, code: sa.code, state: { players: sb.players, started: true } });
  assert.strictEqual(mv.status, 200);
  assert.strictEqual(mv.body.ok, true);
  [ea, eb].forEach((e) => assert.strictEqual(String(e).toLowerCase().replace(/[^a-z0-9@._-]/g, ''), e));
  const no = await api.call({ action: 'moveMulti', email: 'guest_other', code: sa.code, state: {} });
  assert.strictEqual(no.status, 403, 'өрөөнд ороогүй зочин нүүж чадахгүй');
  // нэр оруулаагүй (prompt цуцалсан) → сүлжээ 0
  const C = sbhPage({ embed: {}, name: null, code: sa.code });
  C.sbhCreateRoom(3); C.sbhJoinByCode();
  assert.strictEqual(C.sent.length, 0);
});

test('sbh: localStorage хаалттай (private горим) — зочин ID нэг хуудсанд тогтвортой', () => {
  const W = sbhPage({ embed: {}, lsThrows: true });
  const a = W.__id(), b = W.__id();
  assert.ok(/^guest_[a-z0-9]+$/.test(a));
  assert.strictEqual(a, b);
});
