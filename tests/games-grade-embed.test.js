// Тоглоом бүрт анги/сэдэв (gg-games): index.html-ийн #gp-embed (inline 6 тоглоом), MATH MORTAL (math-mortal/quiz.js),
// games/play2048.html, games/sudoku.html, games/numseq.html — URL-ийн grade=<6..12>&topic=<node_id|0>-ийг уншиж
// бодлогыг /api/questions?game=<анги>&topic=<сэдэв>&n=60-аас авна. Сүлжээ 0 (fetch хуурамч), DB 0.
// Ажиллуулах: node --test tests/games-grade-embed.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const { pathToFileURL } = require('url');

const WT = path.resolve(__dirname, '..');
const ORIGIN = 'https://cyber-math.com';
const INDEX = fs.readFileSync(path.join(WT, 'index.html'), 'utf8');
const EMBED_SRC = (function () {
  const m = /<script id="gp-embed">([\s\S]*?)<\/script>/.exec(INDEX);
  assert.ok(m, 'index.html-д <script id="gp-embed"> блок байх ёстой');
  return m[1];
})();
const J = (x) => JSON.parse(JSON.stringify(x));
function ticks(n) { let p = Promise.resolve(); for (let i = 0; i < (n || 12); i++) p = p.then(() => new Promise((r) => setImmediate(r))); return p; }
function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

// ───────── хамгийн бага DOM (games-ws.test.js-ийн fakeDom-ийн товч хувилбар) ─────────
function fakeDom() {
  const reg = new Map();
  class CL { constructor() { this.s = new Set(); } add(c) { this.s.add(c); } remove(c) { this.s.delete(c); } contains(c) { return this.s.has(c); } }
  class El {
    constructor(tag, id) {
      this.nodeType = 1; this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null; this.style = {};
      this.classList = new CL(); this.hidden = false; this._html = ''; this.textContent = ''; this._q = {}; this.attrs = {}; this.ls = {};
      this.id = id || '';
    }
    get id() { return this._id; }
    set id(v) { this._id = v; if (v && !reg.has(v)) reg.set(v, this); }
    get innerHTML() { return this._html; }
    set innerHTML(v) { this._html = String(v); this._q = {}; }
    appendChild(c) { c.parentNode = this; this.children.push(c); if (c.id && !reg.has(c.id)) reg.set(c.id, c); return c; }
    removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
    querySelector(s) { if (!this._q[s]) { const e = new El('stub'); e.parentNode = this; this._q[s] = e; } return this._q[s]; }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
    closest() { return this; }
  }
  const html = new El('html'), body = new El('body');
  html.appendChild(body);
  const app = body.appendChild(new El('div', 'cybermath-app'));
  const tab = app.appendChild(new El('div', 'tab-games'));
  tab.appendChild(new El('div', 'game-selector'));
  ['chessmath', 'daam', 'gomoku', 'ludo', 'doroev', 'sbh'].forEach((k) => tab.appendChild(new El('div', k + '-area')));
  body.appendChild(new El('div', 'toast'));
  const doc = {
    documentElement: html, body: body, readyState: 'complete',
    getElementById: (id) => reg.get(id) || null,
    createElement: (t) => new El(t),
    addEventListener() {},
  };
  return { doc, reg, El };
}

const OLD_QAPI = function () { return '/api/questions?max_grade=12'; };
// o: { search, ls, launch (хариу), q (url → {status, body} | throw), inFrame }
function embed(o) {
  o = o || {};
  const D = fakeDom();
  const posts = [], starts = [], fetches = [], resets = [], listeners = {};
  const S = {
    document: D.doc,
    location: { search: o.search || '', origin: ORIGIN, href: ORIGIN + '/' + (o.search || '') },
    localStorage: storage(o.ls),
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0', language: 'mn', hardwareConcurrency: 8 },
    screen: { width: 412, height: 915, colorDepth: 24 },
    crypto: require('crypto').webcrypto,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    console: { error() {}, log() {}, warn() {} },
    setTimeout: setTimeout,
    MutationObserver: class { constructor(f) { S._mo = f; } observe() {} },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  };
  S.window = S;
  S.parent = o.inFrame === false ? S : { postMessage: (m, origin) => posts.push({ m: J(m), origin: origin }) };
  S.startGame = function (k, ok) { starts.push([k, ok]); };
  // index.html-ийн body скриптийн глобалууд (embed блок DOMContentLoaded-д дарна)
  S.qApiUrl = OLD_QAPI;
  S.getUserMaxGrade = function () { return 12; };
  S.gameNodeIds = [512, 513];
  S.cmSaveGameNodes = function () { S.localStorage.setItem('cm_game_nodes', JSON.stringify(S.gameNodeIds)); };
  S.cmResetPools = function () { resets.push(Date.now()); };
  const launch = o.launch || { ok: true, game: 'chessmath', kind: 'inline', via: 'access' };
  S.fetch = function (url, opts) {
    fetches.push({ url: url, body: opts && opts.body ? JSON.parse(opts.body) : null });
    if (url === '/api/games?action=launch') return Promise.resolve({ status: 200, json: async () => J(launch) });
    try {
      const r = o.q ? o.q(url) : { status: 404, body: {} };
      return Promise.resolve({ status: r.status, json: async () => J(r.body) });
    } catch (e) { return Promise.reject(e); }
  };
  const F0 = S.fetch;
  vm.createContext(S);
  vm.runInContext(EMBED_SRC, S, { filename: 'index.html#gp-embed' });
  return {
    S, D, posts, starts, fetches, resets, F0,
    msg: (e) => (listeners.message || []).forEach((f) => f(e)),
    nListeners: () => (listeners.message || []).length,
    gameFetch: async (url) => { const r = await S.fetch(url); return { status: r.status, d: J(await r.json()) }; },
  };
}
const Q = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ id: i + 1, text: 'Q' + i, choices: ['1', '2', '3', '4'], correct: '1', difficulty: 'easy', node_id: 512 }, extra || {}));

test('embed + grade/topic: qApiUrl → /api/questions?game=&topic=&n=60; «Агуулга» сонгогч нуугдана; launch-д анги; cm_game_nodes-д бичихгүй', async () => {
  const E = embed({ search: '?embed=chessmath&realm=ws&grade=8&topic=512', ls: { cm_ws_token: 'WS.TOK', cm_game_nodes: '[1]' } });
  await ticks();
  assert.deepStrictEqual(J(E.S.CM_EMBED.sel), { grade: '8', topic: '512' });
  assert.strictEqual(E.S.qApiUrl(), '/api/questions?game=8&topic=512&n=60');
  assert.strictEqual(E.S.qApiUrl('limit=30'), '/api/questions?game=8&topic=512&n=60', 'suffix үл хамаарна');
  assert.strictEqual(E.S.getUserMaxGrade(), 8);
  assert.deepStrictEqual(J(E.S.gameNodeIds), []);
  assert.ok(E.D.doc.documentElement.classList.contains('cm-embed'));
  assert.ok(E.D.doc.documentElement.classList.contains('cm-embed-sel'));
  // хуваалцсан localStorage-д бичихгүй (cmSaveGameNodes → зөвхөн санг шинэчилнэ)
  E.S.cmSaveGameNodes();
  assert.strictEqual(E.S.localStorage.getItem('cm_game_nodes'), '[1]');
  assert.strictEqual(E.resets.length, 1);
  // launch: анги дамжина (эрх/үнэд нөлөөгүй — сервер зөвхөн game_access.grade-ийг шинэчилнэ)
  const l = E.fetches.find((f) => f.url === '/api/games?action=launch');
  assert.deepStrictEqual(l.body, { game: 'chessmath', realm: 'ws', wstoken: 'WS.TOK', grade: '8' });
  assert.deepStrictEqual(E.starts, [['chessmath', true]]);
});

test('embed: grade/topic шалгалт — 6..12 ба /^\\d{1,6}$/ л; буруу бол хуучин зан төлөв (qApiUrl дарахгүй)', async () => {
  for (const [s, want] of [
    ['&grade=6', { grade: '6', topic: '0' }],
    ['&grade=12&topic=0', { grade: '12', topic: '0' }],
    ['&grade=10&topic=007', { grade: '10', topic: '7' }],
    ['&grade=9&topic=abc', { grade: '9', topic: '0' }],
    ['&grade=9&topic=1234567', { grade: '9', topic: '0' }],
    ['&grade=11&topic=-5', { grade: '11', topic: '0' }],
    ['&topic=5&grade=7', { grade: '7', topic: '5' }],
  ]) {
    const E = embed({ search: '?embed=daam&realm=ws' + s, launch: { ok: true, game: 'daam', kind: 'inline', via: 'access' } });
    await ticks();
    assert.deepStrictEqual(J(E.S.CM_EMBED.sel), want, s);
    assert.strictEqual(E.S.qApiUrl(), '/api/questions?game=' + want.grade + '&topic=' + want.topic + '&n=60', s);
  }
  for (const s of ['', '&grade=5', '&grade=13', '&grade=10x', '&grade=abc', '&grade=', '&g=8', '&max_grade=8', '&grade=%38']) {
    const E = embed({ search: '?embed=daam&realm=ws' + s, launch: { ok: true, game: 'daam', kind: 'inline', via: 'access' } });
    await ticks();
    assert.strictEqual(E.S.CM_EMBED.sel, null, s);
    assert.strictEqual(E.S.qApiUrl, OLD_QAPI, s + ': qApiUrl хэвээр');
    assert.strictEqual(E.S.fetch, E.F0, s + ': fetch-ийг ороохгүй');
    assert.strictEqual(E.D.doc.documentElement.classList.contains('cm-embed-sel'), false, s);
    const l = E.fetches.find((f) => f.url === '/api/games?action=launch');
    assert.strictEqual(l.body.grade, undefined, s + ': launch-д анги байхгүй');
  }
});

test('embed: сэдвээс бодлого ирээгүй / 400 → ангийн бүх сэдвээс (topic=0); sbh 20-оос цөөн бол мөн; дараагийн тат шууд topic=0', async () => {
  // хоосон → topic=0
  let E = embed({ search: '?embed=gomoku&realm=ws&grade=9&topic=77', launch: { ok: true, game: 'gomoku', kind: 'inline', via: 'access' },
    q: (u) => ({ status: 200, body: { ok: true, grade: '9', topic: /topic=0&/.test(u) ? 0 : 77, questions: /topic=0&/.test(u) ? Q(30) : [] } }) });
  await ticks();
  let r = await E.gameFetch(E.S.qApiUrl());
  assert.strictEqual(r.d.questions.length, 30);
  assert.deepStrictEqual(E.fetches.filter((f) => f.url.indexOf('game=') > 0).map((f) => f.url),
    ['/api/questions?game=9&topic=77&n=60', '/api/questions?game=9&topic=0&n=60']);
  assert.strictEqual(E.S.qApiUrl(), '/api/questions?game=9&topic=0&n=60', 'хүрэлцээгүй сэдэв — дараагийнх шууд бүх сэдвээс');
  // 400 (өөр ангийн сэдэв) → topic=0
  E = embed({ search: '?embed=ludo&realm=ws&grade=7&topic=999', launch: { ok: true, game: 'ludo', kind: 'inline', via: 'access' },
    q: (u) => (/topic=999/.test(u) ? { status: 400, body: { ok: false, error: 'topic буруу' } } : { status: 200, body: { ok: true, grade: '7', topic: 0, questions: Q(12) } }) });
  await ticks();
  r = await E.gameFetch(E.S.qApiUrl());
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.d.questions.length, 12);
  // chessmath: 15 бодлого хангалттай (topic хэвээр)
  E = embed({ search: '?embed=chessmath&realm=ws&grade=9&topic=5', q: () => ({ status: 200, body: { ok: true, grade: '9', topic: 5, questions: Q(15) } }) });
  await ticks();
  r = await E.gameFetch(E.S.qApiUrl());
  assert.strictEqual(r.d.questions.length, 15);
  assert.strictEqual(E.fetches.filter((f) => f.url.indexOf('game=') > 0).length, 1);
  // sbh: 15 < 20 → topic=0
  E = embed({ search: '?embed=sbh&realm=ws&grade=11&topic=5', launch: { ok: true, game: 'sbh', kind: 'inline', via: 'access' },
    q: (u) => ({ status: 200, body: { ok: true, grade: '11', questions: /topic=0&/.test(u) ? Q(26) : Q(15) } }) });
  await ticks();
  r = await E.gameFetch(E.S.qApiUrl());
  assert.strictEqual(r.d.questions.length, 26);
  assert.deepStrictEqual(E.fetches.filter((f) => f.url.indexOf('game=') > 0).map((f) => f.url),
    ['/api/questions?game=11&topic=5&n=60', '/api/questions?game=11&topic=0&n=60']);
  // topic=0 хоосон бол дахин татахгүй (тоглоомын жишиг бодлого + «Офлайн» тэмдэг)
  E = embed({ search: '?embed=daam&realm=ws&grade=6', launch: { ok: true, game: 'daam', kind: 'inline', via: 'access' },
    q: () => ({ status: 200, body: { ok: true, grade: '6', questions: [] } }) });
  await ticks();
  r = await E.gameFetch(E.S.qApiUrl());
  assert.deepStrictEqual(r.d.questions, []);
  assert.strictEqual(E.fetches.filter((f) => f.url.indexOf('game=') > 0).length, 1);
  const off = E.D.reg.get('gp-emb-off');
  assert.ok(off && off.hidden === false, 'Офлайн тэмдэг');
});

test('embed: сүлжээ тасарвал «Офлайн — жишиг бодлого» тэмдэг, дараа нь бодлого ирвэл нуугдана; бусад fetch өөрчлөгдөхгүй', async () => {
  let down = true;
  const E = embed({ search: '?embed=doroev&realm=ws&grade=10&topic=0', launch: { ok: true, game: 'doroev', kind: 'inline', via: 'access' },
    q: (u) => { if (down) throw new Error('offline'); return { status: 200, body: { ok: true, grade: '10', questions: Q(60) } }; } });
  await ticks();
  await assert.rejects(E.gameFetch(E.S.qApiUrl()));
  const off = E.D.reg.get('gp-emb-off');
  assert.ok(off, 'тэмдэг үүснэ');
  assert.strictEqual(off.hidden, false);
  assert.match(off.innerHTML, /<svg /, 'SVG icon');
  assert.strictEqual(off.querySelector('span').textContent, 'Офлайн — жишиг бодлого');
  down = false;
  const r = await E.gameFetch(E.S.qApiUrl());
  assert.strictEqual(r.d.questions.length, 60);
  assert.strictEqual(off.hidden, true);
  // cmResetPools 6 тоглоомын санг зэрэг шинэчилдэг — ижил хүсэлт сүлжээнд нэг л удаа, хэрэглэгч бүр өөрийн хариутай
  const g0 = E.fetches.length;
  const all = await Promise.all([1, 2, 3].map(() => E.gameFetch(E.S.qApiUrl())));
  assert.strictEqual(E.fetches.length, g0 + 1);
  assert.ok(all.every((x) => x.d.questions.length === 60));
  await E.gameFetch(E.S.qApiUrl());
  assert.strictEqual(E.fetches.length, g0 + 2, 'дууссаны дараах хүсэлт шинээр татна');
  // бусад зам ороогдохгүй
  const n0 = E.fetches.length;
  await E.S.fetch('/api/questions?ids=1,2');
  assert.strictEqual(E.fetches.length, n0 + 1);
  assert.strictEqual(E.fetches[n0].url, '/api/questions?ids=1,2');
});

test('embed: parent-ийн {type:cm-embed-config} — ижил домэйн + parent л; анги/сэдвийг сольж санг шинэчилнэ; буруу утгыг үл тооно', async () => {
  const E = embed({ search: '?embed=chessmath&realm=ws&grade=7&topic=301', ls: { cm_ws_token: 'WS.TOK' } });
  await ticks();
  assert.strictEqual(E.nListeners(), 1);
  const P = E.S.parent;
  const before = E.resets.length;
  // өөр домэйн / өөр эх үүсвэр / буруу анги → үл тооно
  E.msg({ origin: 'https://evil.example', source: P, data: { type: 'cm-embed-config', grade: '9', topic: '5' } });
  E.msg({ origin: ORIGIN, source: {}, data: { type: 'cm-embed-config', grade: '9', topic: '5' } });
  E.msg({ origin: ORIGIN, source: P, data: { type: 'cm-embed-config', grade: '13', topic: '5' } });
  E.msg({ origin: ORIGIN, source: P, data: { type: 'other', grade: '9' } });
  E.msg({ origin: ORIGIN, source: P, data: 'cm-embed-config' });
  assert.deepStrictEqual(J(E.S.CM_EMBED.sel), { grade: '7', topic: '301' });
  assert.strictEqual(E.resets.length, before);
  // хүчинтэй
  E.msg({ origin: ORIGIN, source: P, data: { type: 'cm-embed-config', grade: 9, topic: 5 } });
  assert.deepStrictEqual(J(E.S.CM_EMBED.sel), { grade: '9', topic: '5' });
  assert.strictEqual(E.S.qApiUrl(), '/api/questions?game=9&topic=5&n=60');
  assert.strictEqual(E.resets.length, before + 1, 'бодлогын сан шинэчлэгдэнэ');
  assert.deepStrictEqual(E.posts.map((p) => p.m).filter((m) => m.type === 'cm-embed-sel'), [{ type: 'cm-embed-sel', grade: '9', topic: '5', game: 'chessmath' }]);
  assert.ok(E.posts.every((p) => p.origin === ORIGIN));
  // ижил сонголт → дахин татахгүй
  E.msg({ origin: ORIGIN, source: P, data: { type: 'cm-embed-config', grade: '9', topic: '5' } });
  assert.strictEqual(E.resets.length, before + 1);
  // topic байхгүй → «Бүх сэдэв»
  E.msg({ origin: ORIGIN, source: P, data: { type: 'cm-embed-config', grade: '12' } });
  assert.strictEqual(E.S.qApiUrl(), '/api/questions?game=12&topic=0&n=60');
});

test('embed: URL-д анги байхгүй ч parent тохиргоо илгээвэл тэр үед л глобалуудыг дарна; iframe-гүй үед сонсохгүй', async () => {
  const E = embed({ search: '?embed=gomoku&realm=ws', launch: { ok: true, game: 'gomoku', kind: 'inline', via: 'access' } });
  await ticks();
  assert.strictEqual(E.S.qApiUrl, OLD_QAPI);
  E.msg({ origin: ORIGIN, source: E.S.parent, data: { type: 'cm-embed-config', grade: '8', topic: '0' } });
  assert.strictEqual(E.S.qApiUrl(), '/api/questions?game=8&topic=0&n=60');
  assert.ok(E.D.doc.documentElement.classList.contains('cm-embed-sel'));
  const E2 = embed({ search: '?embed=gomoku&realm=ws&grade=8', inFrame: false, launch: { ok: true, game: 'gomoku', kind: 'inline', via: 'access' } });
  await ticks();
  assert.strictEqual(E2.nListeners(), 0);
  assert.strictEqual(E2.S.qApiUrl(), '/api/questions?game=8&topic=0&n=60');
});

test('embed: ?embed байхгүй бол grade/topic ч юу ч өөрчлөхгүй (cyber-math.com хуучин шигээ)', async () => {
  const E = embed({ search: '?grade=8&topic=512' });
  await ticks();
  assert.strictEqual(E.S.CM_EMBED, undefined);
  assert.strictEqual(E.S.qApiUrl, OLD_QAPI);
  assert.strictEqual(E.S.fetch, E.F0);
  assert.strictEqual(E.fetches.length, 0);
  assert.strictEqual(E.nListeners(), 0);
});

test('index.html: inline тоглоомууд fetch(qApiUrl())-аар татаж d.questions-ийн text/choices/correct-ийг хэрэглэдэг (шинэ API-тай нийцнэ)', () => {
  // 6 тоглоомын сан татах функц бүр qApiUrl-ийг дуудах үедээ уншдаг — embed-ийн override хүрнэ
  const fetchers = ['function fetchQuestionPool()', 'function fetchDrPool()', 'function fetchSbhPool()'];
  fetchers.forEach((f) => assert.ok(INDEX.indexOf(f) >= 0, f));
  assert.ok((INDEX.match(/return fetch\(qApiUrl\(\)\)/g) || []).length >= 4, 'chessmath/daam/gomoku/ludo');
  // шүүлт: choices массив (2–4) + correct — шинэ API яг 4 сонголт, correct сонголтуудын дотор
  assert.ok((INDEX.match(/Array\.isArray\(ch\)\s*&&\s*ch\.length\s*>=\s*2\s*&&\s*ch\.length\s*<=\s*4\s*&&\s*q\.correct/g) || []).length >= 5);
  // cmResetPools-д бүртгэгдсэн (сонголт солиход сан шинэчлэгдэнэ)
  ['cmPool = []', 'dmPool = []', 'gmPool = []', 'luPool = []', 'drPool = []', 'sbhPool = []'].forEach((s) => {
    assert.ok(new RegExp('cmRegisterPoolReset\\(function\\(\\)\\{ ' + s.replace(/[[\]]/g, '\\$&')).test(INDEX), s);
  });
  // embed блокийн шинэ хэсэг эможигүй
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(EMBED_SRC), 'эможигүй');
});

// ───────────────────────── MATH MORTAL (math-mortal/quiz.js) ─────────────────────────
test('MATH MORTAL quiz.js: 6–12-р анги, URL grade/topic (хадгалахгүй), game_topics/game хариуг задлах', async () => {
  global.location = { search: '?realm=ws&grade=10&topic=1234', host: 'cyber-math.com' };
  const mod = await import(pathToFileURL(path.join(WT, 'math-mortal', 'quiz.js')).href + '?t=' + Date.now());
  const T = mod.__test;
  assert.deepStrictEqual(T.normalizeSettings({ grade: 6 }).grade, 6);
  assert.deepStrictEqual(T.normalizeSettings({ grade: 12 }).grade, 12);
  assert.deepStrictEqual(T.normalizeSettings({ grade: 13 }).grade, 12);
  assert.deepStrictEqual(T.normalizeSettings({ grade: 3 }).grade, 6);
  assert.deepStrictEqual(T.urlSelection(), { grade: 10, node: 1234 });
  for (const [s, want] of [['?grade=6', { grade: 6, node: 0 }], ['?grade=12&topic=x', { grade: 12, node: 0 }], ['?grade=5', null], ['?grade=10x', null], ['?g=8', null], ['', null]]) {
    global.location = { search: s, host: 'cyber-math.com' };
    assert.deepStrictEqual(T.urlSelection(), want, s);
  }
  delete global.location;
  // game_topics → хавтгай жагсаалт (бүлэгтэй), n<4 хасна, өөр ангийн хариу → []
  const d = { ok: true, grade: '8', total: 40, chapters: [
    { name: 'I бүлэг', topics: [{ id: 501, name: 'Олон гишүүнт', n: 30 }, { id: 502, name: 'Цөөн', n: 3 }] },
    { name: '', topics: [{ id: 503, name: 'Тэгшитгэл', n: 7 }] }] };
  assert.deepStrictEqual(T.topicsOf(d, 8), [
    { id: 501, name: 'Олон гишүүнт', n: 30, chapter: 'I бүлэг' }, { id: 503, name: 'Тэгшитгэл', n: 7, chapter: '' }]);
  assert.deepStrictEqual(T.topicsOf(d, 9), []);
  assert.deepStrictEqual(T.topicsOf({ ok: false, error: 'x' }, 8), []);
  assert.deepStrictEqual(T.topicsOf({ questions: [] }, 8), [], 'хуучин сервер (grade-гүй хариу)');
  // game → HUD-д тохирох бодлого (4 ялгаатай сонголт, correct дотор, урт биш), хялбар тэмдэг
  const g = { ok: true, grade: '8', topic: 0, questions: [
    { id: 1, text: '$2+3=?$', choices: ['5', '6', '7', '8'], correct: '5', difficulty: 'easy' },
    { id: 2, text: '$x^2=9$ бол x?', choices: ['3', '-3', '9', '0'], correct: '3', difficulty: 'hard' },
    { id: 3, text: 'Урт '.repeat(60), choices: ['1', '2', '3', '4'], correct: '1' },
    { id: 4, text: '1+1', choices: ['2', '2', '3', '4'], correct: '2' },
    { id: 5, text: '1+2', choices: ['3', '4', '5', '6'], correct: '9' },
    { id: 6, text: 'Матриц?', choices: ['$\\begin{pmatrix}1\\end{pmatrix}$', '2', '3', '4'], correct: '2' }] };
  assert.deepStrictEqual(T.cleanQuestions(g, 8).map((q) => [q.q, q.answer, q.easy]), [['$2+3=?$', '5', true], ['$x^2=9$ бол x?', '3', false]]);
  assert.deepStrictEqual(T.cleanQuestions(g, 7), [], 'өөр ангийн хариу');
});

test('MATH MORTAL: index.html-д 6–12-р ангийн сонголт + «Офлайн» тэмдэг (эможигүй); quiz.js шинэ endpoint-ийг ашиглана', () => {
  const html = fs.readFileSync(path.join(WT, 'math-mortal', 'index.html'), 'utf8');
  const sel = /<select id="grade-select">([\s\S]*?)<\/select>/.exec(html)[1];
  assert.deepStrictEqual([...sel.matchAll(/value="(\d+)"/g)].map((m) => m[1]), ['6', '7', '8', '9', '10', '11', '12']);
  const off = /<span id="math-offline"[^>]*hidden>([\s\S]*?)<\/span>/.exec(html);
  assert.ok(off, '#math-offline (анхдагч нуугдсан)');
  assert.match(off[1], /<svg /);
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(off[1]));
  const src = fs.readFileSync(path.join(WT, 'math-mortal', 'quiz.js'), 'utf8');
  assert.ok(src.indexOf('/api/questions?game_topics=${grade}') >= 0);
  assert.ok(src.indexOf('/api/questions?game=${g}&topic=${topic}&n=${BATCH}') >= 0);
  assert.ok(src.indexOf('arena=') < 0, 'хуучин arena салбарыг хэрэглэхгүй');
});

// ───────────────────────── games/play2048.html, sudoku.html, numseq.html ─────────────────────────
function scriptOf(rel) {
  const html = fs.readFileSync(path.join(WT, rel), 'utf8');
  const all = [...html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter((m) => !/\bsrc=/.test(m[1] || ''));
  return all.map((m) => m[2]).join('\n');
}
// play2048/sudoku: CM_SEL + fetchGameQs + loadQuestionBank-ийг тусад нь (DOM-гүй) ажиллуулна
async function bank(rel, search, q) {
  const src = scriptOf(rel);
  const pick = (re) => { const m = re.exec(src); assert.ok(m, rel + ': ' + re); return m[0]; };
  const code = [
    pick(/var CM_SEL = \(function\(\)\{[\s\S]*?\}\)\(\);/),
    pick(/var CM_MIN_Q = \d+;/),
    pick(/async function fetchGameQs\(topic\) \{[\s\S]*?\n\}/),
    pick(/function shuffleBank\(\) \{[\s\S]*?\n\}/),
    pick(/async function loadQuestionBank\(\) \{[\s\S]*?\n\}/),
  ].join('\n');
  const urls = [];
  const S = {
    location: { search: search }, URLSearchParams: URLSearchParams, questionsBank: [], bankIdx: 0,
    fetch: async (u) => { urls.push(u); const r = q(u); return { json: async () => J(r) }; },
  };
  vm.createContext(S);
  vm.runInContext(code + '\nvar __run = loadQuestionBank;', S);
  await S.__run();
  return { urls, bank: J(vm.runInContext('questionsBank', S)), sel: J(vm.runInContext('CM_SEL', S)) };
}
for (const [rel, min] of [['games/play2048.html', 8], ['games/sudoku.html', 12]]) {
  test(rel + ': URL-д анги байвал /api/questions?game=&topic=&n=60 (choice), хүрэлцээгүй бол topic=0; байхгүй бол хуучнаараа', async () => {
    let r = await bank(rel, '?realm=ws&grade=8&topic=512', (u) => ({ ok: true, grade: '8', questions: Q(20) }));
    assert.deepStrictEqual(r.urls, ['/api/questions?game=8&topic=512&n=60']);
    assert.strictEqual(r.bank.length, 20);
    assert.ok(r.bank.every((x) => x.type === 'choice' && x.choices.length === 4 && x.correct === '1'), 'choice төрөл болгоно');
    r = await bank(rel, '?grade=9&topic=5', (u) => ({ ok: true, grade: '9', questions: /topic=0&/.test(u) ? Q(60) : Q(min - 1) }));
    assert.deepStrictEqual(r.urls, ['/api/questions?game=9&topic=5&n=60', '/api/questions?game=9&topic=0&n=60']);
    assert.strictEqual(r.bank.length, 60);
    r = await bank(rel, '?grade=9&topic=5', (u) => ({ ok: true, grade: '9', questions: Q(min) }));
    assert.strictEqual(r.urls.length, 1, min + ' хангалттай');
    r = await bank(rel, '?grade=12', (u) => ({ ok: true, grade: '12', questions: [{ id: 1, text: 'x', choices: ['1', '2', '3', '4'], correct: '7' }] }));
    assert.deepStrictEqual(r.bank, [], 'correct сонголтод байхгүй → хасна');
    r = await bank(rel, '?grade=10', (u) => ({ questions: Q(5) }));
    assert.deepStrictEqual(r.bank, [], 'grade-гүй (хуучин сервер) хариу → жишиг бодлого');
    for (const s of ['', '?grade=5', '?grade=13', '?g=8', '?grade=8x']) {
      r = await bank(rel, s, (u) => ({ ok: true, questions: [{ id: 1, type: 'choice', text: 'a', choices: ['1', '2'], correct: '1' }, { id: 2, type: 'fill', text: 'b', correct: '3' }] }));
      assert.strictEqual(r.sel, null, s);
      assert.deepStrictEqual(r.urls, ['/api/questions?max_grade=10'], s + ': хуучин зам');
      assert.strictEqual(r.bank.length, 2);
    }
    const html = fs.readFileSync(path.join(WT, rel), 'utf8');
    const off = /<div class="ch-off" id="ch-off"[^>]*hidden>([\s\S]*?)<\/div>/.exec(html);
    assert.ok(off && /<svg /.test(off[1]) && /Офлайн — жишиг бодлого/.test(off[1]), 'Офлайн тэмдэг (SVG)');
    assert.ok(/setOffline\(!!CM_SEL && !(bq|q)\)/.test(html), 'жишиг бодлого гарахад тэмдэг');
  });
}

test('games/numseq.html: анги → түвшин (6 easy, 7–8 medium, 9–10 hard, 11–12 expert), хадгалахгүй', () => {
  const src = scriptOf('games/numseq.html');
  const fn = /function gradeDifficulty\(\) \{[\s\S]*?\n\}/.exec(src)[0];
  const run = (search) => { const S = { location: { search: search }, URLSearchParams: URLSearchParams }; vm.createContext(S); vm.runInContext(fn, S); return vm.runInContext('gradeDifficulty()', S); };
  const want = { 6: 'easy', 7: 'medium', 8: 'medium', 9: 'hard', 10: 'hard', 11: 'expert', 12: 'expert' };
  Object.keys(want).forEach((g) => assert.strictEqual(run('?realm=ws&grade=' + g + '&topic=55'), want[g], g));
  ['', '?grade=5', '?grade=13', '?grade=abc', '?g=8'].forEach((s) => assert.strictEqual(run(s), null, s));
  assert.ok(src.indexOf("state.difficulty = gradeDifficulty() || persisted.difficulty || 'easy';") >= 0);
  assert.ok(!/persisted\.difficulty\s*=\s*gradeDifficulty/.test(src), 'persisted-д бичихгүй');
});
