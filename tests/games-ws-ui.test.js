// Дасгалын төв (worksheets.html) — клиентийн логикийг ЖИНХЭНЭЭР ажиллуулах тест (gp-s6-fix1).
//  1) Толгойн данс (renderAcct/verifyUser/wsLogout + нэвтрэлтийн эхлэл): зөвхөн тоглоом авсан, ажлын хуудасны
//     эрхгүй данс «Нэвтэрсэн» харагдана, нэвтрэх цонх автоматаар нээгдэхгүй; ажлын хуудасны эрх (CM_USER) өөрчлөгдөхгүй.
//  2) «Тоглоом» хэсэг (window.GW): карт → худалдан авах (QPay QR) → poll (paid:false үед амжилт ГАРАХГҮЙ) →
//     төлсөн → тоглох overlay; 402 / 401 / 403 (төхөөрөмж, урилга) замууд; overlay-ийн түгжээний мессеж; урилга.
// worksheets.html-ийн бодит <script> хэсгүүдийг хуурамч DOM + vm дээр ажиллуулж, сүлжээг api/games.js / api/qpay.js
// handler руу шууд чиглүүлнэ (tests/_gamefake.js — бодит DB/QPay/Telegram 0).
// Ажиллуулах: node tests/games-ws-ui.test.js
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

const HOST_SRC = fs.readFileSync(path.join(F.WT, 'games-host.js'), 'utf8');
const WSH = fs.readFileSync(path.join(F.WT, 'worksheets.html'), 'utf8');

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const J = (x) => JSON.parse(JSON.stringify(x));
function ticks(n) { let p = Promise.resolve(); for (let i = 0; i < (n || 30); i++) p = p.then(() => new Promise((r) => setImmediate(r))); return p; }
function give(email, key, days) {
  F.db.access.set('ws|' + email + '|' + key, { realm: 'ws', email: email, game_key: key, expires_at: new Date(Date.now() + (days == null ? 30 : days) * F.DAY), updated_at: new Date() });
}
function fillDevices(email, n) {
  for (let i = 0; i < n; i++) {
    const d = 'otherdevice' + i + 'xxxxxxx';
    F.db.devices.set(email + '|' + d, { email: email, device_id: d, label: 'PC', ua: UA, ip: '10.0.0.' + i, fp: 'f' + i, fp_changed_at: new Date(), first_seen: new Date(), last_seen: new Date() });
  }
}
function between(src, a, b) {
  const i = src.indexOf(a);
  assert.ok(i >= 0, 'олдсонгүй: ' + a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(j > i, 'төгсгөл олдсонгүй: ' + b);
  return src.slice(i, j);
}

// ───────── worksheets.html-ийн бодит хэсгүүд ─────────
const SEC_HTML = between(WSH, '<section id="gamesSec"', '</section>') + '</section>';
const ESC_SRC = (/function esc\(s\)\{[^\r\n]*\}/.exec(WSH) || [])[0];
const AUTH_SRC = between(WSH, '/* ── Хэрэглэгчийн нэвтрэлт (худалдан авсан имэйлээр) ── */', 'function openRefModal(){');
const INIT_SRC = between(WSH, '/* Нэвтрэлт: нэвтэрсэн бол дахиж асуухгүй', "document.getElementById('q').addEventListener");
const GW_SRC = between(WSH, '/* ═══ Дасгалын төв — Тоглоом (window.GW)', '</script>');
assert.ok(ESC_SRC, 'worksheets.html: function esc');
// Үндсэн скриптийн бусад функц (энэ тестийн хүрээнээс гадуур) — бүртгэдэг stub
const PRELUDE = [
  'var ADMIN_TOKEN=null; function isAdmin(){return false;}',
  'function toast(m){window.toasts.push(String(m));}',
  'function openLogin(auto){window.logins.push(auto===true?"auto":"manual");}',
  'function ensurePin(){window.pins++;}',
  'function initWelcomeOffer(cb){window.welcome++;cb(false);}',
  'function checkFbReplies(){} function wsInviteClear(){} function openInvite(){window.invites++;}',
  'var WS_INVITE=null, LOGIN_REQ=null, PROMO_CODE=null;',
].join('\n');

// ───────── хамгийн бага DOM (innerHTML-ийг мод болгон задлана, querySelector/closest/үйл явдал) ─────────
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function decode(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
function walk(root, fn) { root.children.forEach((c) => { fn(c); walk(c, fn); }); }
function parseCompound(s) {
  const c = { tag: null, id: null, cls: [], attrs: [] };
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]"']*)))?\]/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new Error('fake DOM: selector ' + s);
    i = re.lastIndex;
    if (m[1]) c.tag = m[1].toUpperCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.cls.push(m[3]);
    else c.attrs.push([m[4], m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : m[7] !== undefined ? m[7] : null]);
  }
  return c;
}
function matchCompound(el, c) {
  if (!el || el.nodeType !== 1) return false;
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  if (c.cls.some((x) => !el.classList.contains(x))) return false;
  return c.attrs.every(([k, v]) => { const a = el.getAttribute(k); return a !== null && (v === null || a === v); });
}
function matchSel(el, sel) {
  const parts = String(sel).trim().split(/\s+(?![^[]*\])/).map(parseCompound);
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let n = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (n && !matchCompound(n, parts[i])) n = n.parentNode;
    if (!n) return false;
    n = n.parentNode;
  }
  return true;
}
class CL {
  constructor() { this.s = new Set(); }
  add(...c) { c.forEach((x) => this.s.add(x)); }
  remove(...c) { c.forEach((x) => this.s.delete(x)); }
  contains(c) { return this.s.has(c); }
  toggle(c, f) { const on = f === undefined ? !this.s.has(c) : !!f; if (on) this.s.add(c); else this.s.delete(c); return on; }
}
class El {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase(); this.nodeType = 1; this.ownerDocument = doc;
    this.children = []; this.parentNode = null; this.attrs = {}; this.classList = new CL(); this.style = {}; this.ls = {};
    this.hidden = false; this.disabled = false; this._html = ''; this._text = null; this.scrolls = [];
    if (this.tagName === 'IFRAME') this.contentWindow = { posts: [], postMessage(m, o) { this.posts.push([m, o]); } };
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get className() { return Array.from(this.classList.s).join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get firstChild() { return this.children[0] || null; }
  get innerHTML() { return this._text != null ? this._text : this._html; }
  set innerHTML(v) { this._drop(); this._html = String(v); parseInto(this, this._html); }
  get textContent() { return this._text != null ? this._text : decode(this._html.replace(/<[^>]*>/g, '')); }
  set textContent(v) { this._drop(); this._html = ''; this._text = String(v); }
  _drop() { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._text = null; }
  setAttribute(k, v) { k = String(k); v = String(v); if (k === 'class') this.className = v; else this.attrs[k] = v; }
  getAttribute(k) { if (k === 'class') return this.classList.s.size ? this.className : null; return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  addEventListener(t, f) { (this.ls[t] = this.ls[t] || []).push(f); }
  removeEventListener(t, f) { this.ls[t] = (this.ls[t] || []).filter((x) => x !== f); }
  click() {
    const e = { target: this, preventDefault() {}, stopPropagation() {} };
    if (typeof this.onclick === 'function') this.onclick(e);
    for (let n = this; n; n = n.parentNode) (n.ls.click || []).slice().forEach((f) => f(e));
  }
  closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matchSel(n, sel)) return n; return null; }
  querySelectorAll(sel) { const out = []; walk(this, (n) => { if (matchSel(n, sel)) out.push(n); }); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  scrollIntoView(o) { this.scrolls.push(o == null ? null : o); }
  focus() {} select() {}
}
// innerHTML → мод (void/өөрөө хаагдсан шошго, атрибут, шошго бүрийн дотоод HTML)
function parseInto(root, html) {
  const re = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  const stack = [{ el: root, start: 0 }];
  let m;
  while ((m = re.exec(html))) {
    if (m[0].indexOf('<!--') === 0) continue;
    if (m[1]) {
      const tag = m[1].toUpperCase();
      let k = stack.length - 1;
      while (k > 0 && stack[k].el.tagName !== tag) k--;
      if (k > 0) while (stack.length > k) { const fr = stack.pop(); fr.el._html = html.slice(fr.start, m.index); }
      continue;
    }
    const el = new El(m[2], root.ownerDocument);
    const are = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a;
    while ((a = are.exec(m[3] || ''))) {
      const name = a[1].toLowerCase();
      const v = decode(a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : '');
      el.setAttribute(name, v);
      if (name === 'hidden') el.hidden = true;
      if (name === 'disabled') el.disabled = true;
      if (name === 'value' || name === 'href' || name === 'src') el[name] = v;
    }
    stack[stack.length - 1].el.appendChild(el);
    if (!VOID.has(el.tagName.toLowerCase()) && !m[4]) stack.push({ el: el, start: re.lastIndex });
  }
  while (stack.length > 1) { const fr = stack.pop(); fr.el._html = html.slice(fr.start); }
}
function makeDoc() {
  const doc = { ls: {} };
  const html = new El('html', doc), head = new El('head', doc), body = new El('body', doc);
  html.appendChild(head); html.appendChild(body);
  Object.assign(doc, {
    documentElement: html, head: head, body: body, readyState: 'complete',
    createElement: (t) => new El(t, doc),
    getElementById: (id) => { let f = null; walk(html, (n) => { if (!f && n.attrs.id === id) f = n; }); return f; },
    querySelectorAll: (s) => html.querySelectorAll(s),
    querySelector: (s) => html.querySelector(s),
    addEventListener(t, f) { (doc.ls[t] = doc.ls[t] || []).push(f); },
    removeEventListener(t, f) { doc.ls[t] = (doc.ls[t] || []).filter((x) => x !== f); },
  });
  return doc;
}
// Хуурамч цаг: setInterval/setTimeout-ыг тест өөрөө «цохино» (poll 3 сек хүлээхгүй)
function clock() {
  const T = { seq: 0, t: new Map() };
  T.setTimeout = (fn, ms) => { const id = ++T.seq; T.t.set(id, { fn: fn, ms: ms || 0, rep: false }); return id; };
  T.setInterval = (fn, ms) => { const id = ++T.seq; T.t.set(id, { fn: fn, ms: ms || 0, rep: true }); return id; };
  T.clear = (id) => { T.t.delete(id); };
  T.active = (ms) => Array.from(T.t.values()).filter((x) => x.rep && x.ms === ms).length;
  T.fire = (ms) => { Array.from(T.t.entries()).forEach(([id, x]) => { if (!x.rep || x.ms !== ms || !T.t.has(id)) return; x.fn(); }); };
  T.flush = () => { Array.from(T.t.entries()).forEach(([id, x]) => { if (x.rep || !T.t.has(id)) return; T.t.delete(id); x.fn(); }); };
  return T;
}
function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
// /api/questions (core API, api/questions.js — энэ тестийн хүрээнээс гадуур) хуурамч хариу:
//   ?game_topics=<g> → { ok, grade, total, chapters:[{name, topics:[{id, name, n}]}] }
//   ?game=<g>&topic=<t>&n=<N> → { ok, grade, topic, questions:[…] }   (QF.qs(grade, topic, n) өөрчилж болно)
const QF = { topics: {}, fail: false, calls: [], qs: null };
function qreset() { QF.topics = {}; QF.fail = false; QF.calls = []; QF.qs = null; }
function qfake(query) {
  QF.calls.push(Object.assign({}, query));
  if (QF.fail) return { status: 503, body: { ok: false } };
  if (query.game_topics) {
    const g = String(query.game_topics);
    return { status: 200, body: QF.topics[g] || { ok: true, grade: g, total: 100, chapters: [{ name: '', topics: [{ id: 700 + Number(g), name: 'Сэдэв ' + g, n: 40 }] }] } };
  }
  if (query.game) {
    const n = Number(query.n) || 10;
    const qs = QF.qs ? QF.qs(String(query.game), String(query.topic || '0'), n) : Array.from({ length: n }, (_, i) => ({
      id: i + 1, text: 'Q' + query.game + '-' + query.topic + '-' + i, choices: ['1', '2', '3', '4'], correct: '2', hint: null, difficulty: 'medium', node_id: Number(query.topic) || 1 }));
    return { status: 200, body: { ok: true, grade: String(query.game), topic: Number(query.topic) || 0, questions: qs } };
  }
  return { status: 400, body: { ok: false } };
}
// fetch → api handler. override(path, action, body) → {status, body} | undefined (жинхэнэ handler руу)
function apiFetch(log, ip, override) {
  return async function (url, opts) {
    opts = opts || {};
    const u = new URL(String(url), ORIGIN);
    const query = {}; u.searchParams.forEach((v, k) => { query[k] = v; });
    const headers = {}; Object.keys(opts.headers || {}).forEach((k) => { headers[k.toLowerCase()] = opts.headers[k]; });
    let body = {}; try { body = opts.body ? JSON.parse(opts.body) : {}; } catch (e) { body = {}; }
    const ent = { path: u.pathname, action: query.action, method: opts.method || 'GET', headers: headers, body: body, query: query };
    log.push(ent);
    let r = override ? override(u.pathname, query.action, body) : undefined;
    if (!r && u.pathname === '/api/questions') r = qfake(query);
    if (!r) {
      const h = u.pathname === '/api/games' ? games : u.pathname === '/api/qpay' ? qpay : null;
      if (!h) throw new Error('blocked ' + u.pathname);
      const x = await F.call(h, { method: opts.method || 'GET', query: query, body: body, headers: headers, ip: ip });
      r = { status: x.statusCode, body: x.body };
    }
    ent.status = r.status; ent.res = r.body;
    return { status: r.status, ok: r.status < 400, json: async () => J(r.body) };
  };
}
// o: { ls, ss, ip, ua, override, init (нэвтрэлтийн эхлэл), gw (Тоглоом хэсэг) }
function page(o) {
  o = o || {};
  const doc = makeDoc();
  doc.body.innerHTML = '<div id="acctArea"></div><span class="pill gpill" id="gamesPill" role="button" tabindex="0"></span>' + SEC_HTML + '<div id="toast"></div>';
  const T = clock();
  const loc = { origin: ORIGIN, href: ORIGIN + '/worksheets' + (o.search || ''), pathname: '/worksheets', search: o.search || '', hash: '' };
  const W = {
    document: doc, localStorage: storage(o.ls), sessionStorage: storage(o.ss), location: loc,
    history: { state: null, replaceState: function (s, t, p) { const n = new URL(p, ORIGIN); loc.href = n.href; loc.pathname = n.pathname; loc.search = n.search; loc.hash = n.hash; } },
    navigator: { userAgent: o.ua || UA, language: 'mn-MN', hardwareConcurrency: 8 },
    screen: { width: 1920, height: 1080, colorDepth: 24 },
    crypto: nodeCrypto.webcrypto,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'),
    URL: URL, console: console,
    setTimeout: T.setTimeout, clearTimeout: T.clear, setInterval: T.setInterval, clearInterval: T.clear,
    _ls: {}, addEventListener(t, f) { (W._ls[t] = W._ls[t] || []).push(f); },
    toasts: [], logins: [], pins: 0, welcome: 0, invites: 0, log: [],
  };
  W.window = W;
  W.fetch = apiFetch(W.log, o.ip || '198.51.100.7', o.override);
  vm.createContext(W);
  const run = (src, name) => vm.runInContext(src, W, { filename: name });
  run(PRELUDE + '\n' + ESC_SRC, 'prelude');
  run(AUTH_SRC, 'worksheets.html#auth');
  if (o.init) run(INIT_SRC, 'worksheets.html#init');
  run(HOST_SRC, 'games-host.js');
  if (o.gw) run(GW_SRC, 'worksheets.html#GW');
  const $ = (id) => doc.getElementById(id);
  return {
    W, doc, T, $,
    acct: () => $('acctArea').innerHTML,
    card: (k) => doc.querySelector('#gcards .gcard[data-gk="' + k + '"]'),
    btn: (k, a) => doc.querySelector('#gcards .gcard[data-gk="' + k + '"] [data-ga="' + a + '"]'),
    q: (id, sel) => { const r = $(id); return r ? r.querySelector(sel) : null; },
    last: (action) => W.log.filter((x) => x.action === action).pop(),
    // модал (id) дотор анги сонгох → сэдвийн жагсаалт ачаалагдана
    grade: async (id, g) => { const b = $(id).querySelector('[data-gr="' + g + '"]'); assert.ok(b, id + ': анги ' + g); b.click(); await ticks(); },
    // модал дотор сэдэв сонгох (select.value + onchange)
    topic: (id, t) => { const s = $(id).querySelector('[data-gp-topic]'); assert.ok(s, id + ': сэдвийн select'); s.value = String(t); s.onchange(); },
  };
}
// localStorage-ийн хадгалсан сонголт: { '<имэйл>|<key>': {g, t, n, at} }
const selLs = (m) => ({ cm_game_sel_ws: JSON.stringify(m) });

beforeEach(() => { F.reset(); qreset(); });

// ───────────────────────── 1. толгойн данс ─────────────────────────
test('толгой: зөвхөн тоглоом авсан (ажлын хуудасны эрхгүй) ws данс «Нэвтэрсэн» + Гарах; нэвтрэх цонх автоматаар нээгдэхгүй; CM_USER хэвээр null', async () => {
  give('kid@x.mn', 'sudoku', 30);
  const P = page({ ls: { cm_ws_token: wsTok('kid@x.mn'), cm_last_user: 'kid@x.mn' }, init: true, gw: true });
  await ticks();
  // сервер: эрхгүй (active:false, ws_token/email өгөхгүй), харин токен хүчинтэй данс (account)
  const ws = P.last('wsstatus');
  assert.strictEqual(ws.status, 200);
  assert.strictEqual(ws.res.active, false);
  assert.strictEqual(ws.res.email, null);
  assert.strictEqual(ws.res.ws_token, null, 'эрхгүй дансанд ws_token сэргээхгүй');
  assert.strictEqual(ws.res.account, 'kid@x.mn');
  assert.strictEqual(ws.res.needLogin, undefined);
  // толгой
  const a = P.acct();
  assert.match(a, /Нэвтэрсэн/);
  assert.ok(a.indexOf('kid@x.mn') >= 0, 'имэйл харагдана');
  assert.match(a, /wsLogout\(\)/, 'гарах цэс');
  assert.doesNotMatch(a, /openLogin\(false\)/, '«Нэвтрэх» товч биш');
  // ажлын хуудасны эрхийн төлөв өөрчлөгдөөгүй
  assert.strictEqual(P.W.CM_USER, null);
  assert.deepStrictEqual(J(P.W.WS_ACCT), { email: 'kid@x.mn' });
  assert.deepStrictEqual(J(P.W.logins), [], 'нэвтрэх цонх автоматаар нээгдээгүй');
  assert.strictEqual(P.W.welcome, 1, 'анхны зочны санал (ажлын хуудас) CM_USER-ээр хэвээр шалгагдана');
  assert.strictEqual(P.W.pins, 1, 'нэвтэрсэн данс → PIN шалгалт');
  // тоглоомын карт идэвхтэй (cm_ws_token-оор)
  assert.match(P.card('sudoku').textContent, /Идэвхтэй · \d{4}-\d{2}-\d{2} хүртэл/);
  // Гарах
  P.W.wsLogout();
  assert.match(P.acct(), /Нэвтрэх/);
  assert.doesNotMatch(P.acct(), /Нэвтэрсэн/);
  assert.strictEqual(P.W.WS_ACCT, null);
  assert.strictEqual(P.W.localStorage.getItem('cm_ws_token'), null);
  await ticks();
  assert.ok(P.btn('sudoku', 'login'), 'гарсны дараа карт «Нэвтэрч худалдан авах»');
});

test('толгой: нэвтрээгүй / хүчингүй токен / төхөөрөмжийн хязгаар → «Нэвтрэх» + нэвтрэх цонх (хуучин шигээ)', async () => {
  const cases = [
    ['токенгүй', {}],
    ['хүчингүй токен + имэйл', { cm_ws_token: 'bad.token.x', cm_last_user: 'kid@x.mn' }],
    ['хүчингүй токен', { cm_ws_token: 'bad.token.x' }],
    ['cm (тоглоомын) токен ws-д хүчингүй', { cm_ws_token: jwt.sign({ email: 'kid@x.mn', role: 'student', tv: 0 }, SEC), cm_last_user: 'kid@x.mn' }],
  ];
  for (const [name, ls] of cases) {
    F.reset();
    const P = page({ ls: ls, init: true });
    await ticks();
    assert.match(P.acct(), /Нэвтрэх/, name);
    assert.doesNotMatch(P.acct(), /Нэвтэрсэн/, name);
    assert.strictEqual(P.W.CM_USER, null, name);
    assert.strictEqual(P.W.WS_ACCT, null, name);
    assert.deepStrictEqual(J(P.W.logins), ['auto'], name + ': нэвтрэх цонх');
    const ws = P.last('wsstatus');
    if (ws) assert.strictEqual(ws.res.account, undefined, name + ': account өгөхгүй');
  }
  // төхөөрөмжийн хязгаар (4 өөр төхөөрөмж) → needLogin, account өгөхгүй
  F.reset();
  give('kid@x.mn', 'sudoku', 30);
  fillDevices('kid@x.mn', 4);
  const P = page({ ls: { cm_ws_token: wsTok('kid@x.mn'), cm_last_user: 'kid@x.mn' }, init: true, gw: true });
  await ticks();
  const ws = P.last('wsstatus');
  assert.strictEqual(ws.res.deviceBlocked, true);
  assert.strictEqual(ws.res.account, undefined);
  assert.match(P.acct(), /Нэвтрэх/);
  assert.strictEqual(P.W.WS_ACCT, null);
  assert.deepStrictEqual(J(P.W.logins), ['auto']);
  // тоглоомын хэсэг: төхөөрөмжийн анхааруулга
  assert.strictEqual(P.$('gamesNote').hidden, false);
  assert.match(P.$('gamesNote').textContent, /төхөөрөмж/);
  assert.ok(P.q('gamesNote', '[data-gn="login"]'), '«Дахин нэвтрэх»');
});

test('толгой: ажлын хуудасны эрхтэй данс (ws_access) / WS_PAYWALL=off — хуучин шигээ CM_USER; хуурамч account-д итгэхгүй', async () => {
  F.db.wsAccess.set('full@x.mn', new Date(Date.now() + 40 * F.DAY));
  const P = page({ ls: { cm_ws_token: wsTok('full@x.mn'), cm_last_user: 'full@x.mn' }, init: true });
  await ticks();
  assert.strictEqual(P.last('wsstatus').res.active, true);
  assert.deepStrictEqual(J(P.W.CM_USER), { email: 'full@x.mn' });
  assert.strictEqual(P.W.WS_ACCT, null);
  assert.match(P.acct(), /Нэвтэрсэн/);
  assert.strictEqual(P.W.welcome, 0, 'эрхтэй дансанд анхны санал үзүүлэхгүй (хуучин шигээ)');
  assert.deepStrictEqual(J(P.W.logins), []);
  assert.strictEqual(P.W.pins, 1);
  assert.ok(P.W.localStorage.getItem('cm_ws_token'), 'ws_token сэргээгдсэн');

  // WS_PAYWALL=off
  F.reset();
  process.env.WS_PAYWALL = 'off';
  try {
    const Q = page({ ls: { cm_ws_token: wsTok('kid@x.mn'), cm_last_user: 'kid@x.mn' }, init: true });
    await ticks();
    assert.deepStrictEqual(J(Q.W.CM_USER), { email: 'kid@x.mn' });
    assert.strictEqual(Q.W.WS_ACCT, null);
    assert.strictEqual(Q.W.PAYWALL_OFF, true);
  } finally { delete process.env.WS_PAYWALL; }

  // Клиент: токенгүй эсвэл needLogin/active үед ирсэн account-ыг толгойд ашиглахгүй
  const fake = (res) => (p, action) => (action === 'wsstatus' ? { status: 200, body: res } : undefined);
  for (const [ls, res, why] of [
    [{ cm_last_user: 'x@x.mn' }, { ok: true, enabled: true, active: false, account: 'x@x.mn' }, 'токенгүй'],
    [{ cm_ws_token: 'T', cm_last_user: 'x@x.mn' }, { ok: true, enabled: true, active: false, needLogin: true, account: 'x@x.mn' }, 'needLogin'],
    [{ cm_ws_token: 'T' }, { ok: true, enabled: true, active: false, account: { email: 'x@x.mn' } }, 'string биш'],
  ]) {
    F.reset();
    const R = page({ ls: ls, override: fake(res) });
    R.W.verifyUser();
    await ticks();
    assert.strictEqual(R.W.WS_ACCT, null, why);
    assert.match(R.acct(), /Нэвтрэх/, why);
  }
  // cm_ws_dismissed тавьсан + эрхгүй данс → PIN (хуучин шигээ), нэвтрэх цонхгүй
  F.reset();
  const D = page({ ls: { cm_ws_token: wsTok('kid@x.mn'), cm_last_user: 'kid@x.mn', cm_ws_dismissed: '1' }, init: true });
  await ticks();
  assert.match(D.acct(), /Нэвтэрсэн/);
  assert.deepStrictEqual([D.W.welcome, D.W.pins, D.W.logins.length], [0, 1, 0]);
});

// ───────────────────────── 2. «Тоглоом» хэсэг (GW) ─────────────────────────
test('GW: нэвтрээгүй → 16 карт «Нэвтэрч худалдан авах»; дарахад нэвтрэх цонх; нэвтэрсний дараа худалдан авах модал', async () => {
  const P = page({ gw: true });
  await ticks();
  assert.strictEqual(P.$('gamesSec').hidden, false);
  assert.strictEqual(P.doc.querySelectorAll('#gcards .gcard').length, 16);
  assert.strictEqual(P.doc.querySelectorAll('#gcards [data-ga="login"]').length, 16);
  assert.match(P.$('gamesSub').textContent, /1 900₮ · 30 хоног/);
  assert.strictEqual(P.$('gamesCount').textContent, '16 тоглоом');
  assert.strictEqual(P.last('status'), undefined, 'токенгүй үед status дуудахгүй');

  P.btn('sudoku', 'login').click();
  assert.deepStrictEqual(J(P.W.logins), ['manual']);
  assert.strictEqual(typeof P.W.__afterLogin, 'function');
  // нэвтэрлээ (done(): токен хадгалаад renderAcct → __afterLogin)
  P.W.localStorage.setItem('cm_ws_token', wsTok('kid@x.mn'));
  P.W.renderAcct();
  P.W.__afterLogin();
  await ticks();
  assert.strictEqual(P.last('status').status, 200);
  assert.ok(P.$('gpBuy'), 'эрхгүй → худалдан авах модал');
  assert.match(P.q('gpBuy', '.gp-mail').textContent, /kid@x\.mn/);
  assert.ok(P.btn('sudoku', 'buy'), 'карт «Худалдан авах»');
});

test('GW: худалдан авах → QPay QR → poll (paid:false → амжилт ГАРАХГҮЙ) → төлсөн → «Идэвхтэй» → Тоглох overlay', async () => {
  const P = page({ ls: { cm_ws_token: wsTok('kid@x.mn') }, gw: true });
  await ticks();
  assert.strictEqual(P.doc.querySelectorAll('#gcards [data-ga="buy"]').length, 16);
  P.btn('sudoku', 'buy').click();
  const ov = P.$('gpBuy');
  assert.ok(ov, 'модал');
  assert.match(P.q('gpBuy', '.gp-price').textContent, /^1 900₮/);
  const go = P.q('gpBuy', '[data-gp-go]');
  // анги ЗААВАЛ: сонгоогүй үед QPay товч идэвхгүй, дарсан ч нэхэмжлэх үүсэхгүй
  assert.strictEqual(P.doc.querySelectorAll('#gpBuy [data-gr]').length, 6, '6–10, 12-р анги (сонгох боломжтой)');
  // 11-р анги «Тун удахгүй»: харагдана, идэвхгүй, сонгогдохгүй
  const s11 = P.q('gpBuy', '[data-gr-soon="11"]');
  assert.ok(s11 && s11.disabled, '11-р анги идэвхгүй');
  assert.match(s11.getAttribute('title'), /Тун удахгүй/);
  assert.match(P.q('gpBuy', '[data-gp-soon]').textContent, /11-р анги — Тун удахгүй/);
  assert.strictEqual(go.disabled, true, 'анги сонгоогүй → идэвхгүй');
  go.onclick();
  await ticks();
  assert.strictEqual(P.last('create'), undefined, 'ангигүй нэхэмжлэх үүсэхгүй');
  assert.match(P.q('gpBuy', '[data-gp-msg]').textContent, /ангиа сонгоно уу/);
  await P.grade('gpBuy', '8');
  assert.strictEqual(go.disabled, false, 'анги сонгосон → идэвхтэй');
  assert.strictEqual(P.q('gpBuy', '[data-gr="8"]').getAttribute('aria-checked'), 'true');
  assert.ok(QF.calls.some((c) => c.game_topics === '8'), 'сэдвийн жагсаалт /api/questions?game_topics=8');
  go.onclick();
  assert.strictEqual(go.disabled, true);
  await ticks();
  // нэхэмжлэх: клиент зөвхөн тоглоом/realm/токен/анги илгээнэ (дүн/имэйл биш)
  const cr = P.last('create');
  assert.deepStrictEqual(Object.keys(cr.body).sort(), ['game', 'game_grade', 'plan', 'realm', 'wstoken']);
  assert.deepStrictEqual([cr.body.plan, cr.body.game, cr.body.realm, cr.body.game_grade], ['game', 'sudoku', 'ws', '8']);
  const inv = cr.res.invoice.invoice_id;
  assert.strictEqual(F.db.pay.get(inv).amount, 1900, 'үнэ ангиас үл хамаарна');
  assert.strictEqual(F.db.pay.get(inv).game_grade, '8', 'нэхэмжлэх дээр анги');
  assert.strictEqual(P.q('gpBuy', '[data-gr="9"]').disabled, true, 'нэхэмжлэх үүссэний дараа анги түгжигдэнэ');
  assert.strictEqual(P.q('gpBuy', '[data-gp-topic]').disabled, false, 'сэдвийг сольж болно (нэхэмжлэхэд хамаарахгүй)');
  P.topic('gpBuy', '708');                          // хуурамч жагсаалт: 8-р анги → {id:708, name:'Сэдэв 8'}
  assert.strictEqual(F.db.pay.get(inv).game_grade, '8', 'сэдэв нэхэмжлэхэд нөлөөлөхгүй');
  const qr = P.q('gpBuy', '[data-gp-qr]');
  assert.ok(qr.querySelector('img[alt="QPay QR"]'), 'QR зураг');
  assert.strictEqual(qr.querySelector('img').src, 'data:image/png;base64,QR');
  assert.ok(qr.querySelector('a.short[href="https://s.qpay.mn/' + inv + '"]'), 'утаснаас төлөх');
  assert.strictEqual(go.style.display, 'none');
  P.T.flush();
  assert.deepStrictEqual(J(qr.scrolls), [{ block: 'center' }], 'QR гарсны дараа төв рүү гүйлгэнэ');
  const msg = () => P.q('gpBuy', '[data-gp-msg]');
  assert.match(msg().textContent, /Төлбөрийг хүлээж байна/);
  assert.strictEqual(P.T.active(3000), 1, 'poll');

  // төлөөгүй: хэд хэдэн poll — амжилтын мессеж, «Тоглох» товч ГАРАХГҮЙ, эрх олгогдохгүй, poll үргэлжилнэ
  for (let i = 0; i < 3; i++) { P.T.fire(3000); await ticks(); }
  assert.strictEqual(P.W.log.filter((x) => x.action === 'check').length, 3);
  assert.ok(P.W.log.filter((x) => x.action === 'check').every((x) => x.res.paid === false));
  assert.doesNotMatch(msg().textContent, /баталгаажлаа/);
  assert.strictEqual(msg().className, 'gp-msg');
  assert.strictEqual(P.q('gpBuy', '[data-gp-after]').children.length, 0, '«Тоглох» товч гараагүй');
  assert.ok(qr.querySelector('img'), 'QR хэвээр');
  assert.strictEqual(P.T.active(3000), 1, 'poll зогсоогүй');
  assert.strictEqual(F.db.access.size, 0);
  assert.ok(P.btn('sudoku', 'buy'), 'карт эрхгүй хэвээр');

  // QPay-д төлсөн → сервер /payment/check-ээр баталгаажуулна → амжилт
  F.qp.paid.set(inv, 1900);
  P.T.fire(3000);
  await ticks();
  assert.strictEqual(P.last('check').res.paid, true);
  assert.match(msg().textContent, /Төлбөр баталгаажлаа! Судоку \d{4}-\d{2}-\d{2} хүртэл идэвхтэй/);
  assert.strictEqual(msg().className, 'gp-msg ok');
  assert.strictEqual(P.T.active(3000), 0, 'poll зогссон');
  assert.strictEqual(qr.innerHTML, '');
  assert.match(P.card('sudoku').textContent, /Идэвхтэй/);
  assert.strictEqual(P.doc.querySelectorAll('#gcards .gcard')[0].getAttribute('data-gk'), 'sudoku', 'идэвхтэй карт эхэнд');
  // анги худалдан авалтад бүртгэгдсэн (game_purchases.grade) + одоогийн анги (game_access.grade); карт дээр чип
  assert.strictEqual(F.db.purch[0].grade, '8');
  assert.strictEqual(F.db.access.get('ws|kid@x.mn|sudoku').grade, '8');
  assert.match(P.card('sudoku').querySelector('.gsel').textContent, /8-р анги · Сэдэв 8/);
  assert.match(P.card('sudoku').querySelector('.gsel').textContent, /Солих/);
  // poll дахин цохисон ч давхар check хийхгүй
  const nChecks = P.W.log.filter((x) => x.action === 'check').length;
  P.T.fire(3000); await ticks();
  assert.strictEqual(P.W.log.filter((x) => x.action === 'check').length, nChecks);

  // «Тоглох» → модал хаагдана → launch → overlay (gate тасалбартай url)
  const playB = P.q('gpBuy', '[data-gp-after] button');
  assert.match(playB.textContent, /Тоглох/);
  playB.onclick();
  assert.strictEqual(P.$('gpBuy'), null, 'модал хаагдсан');
  await ticks();
  const l = P.last('launch');
  assert.deepStrictEqual([l.status, l.body.game, l.body.realm, l.body.grade, l.body.topic], [200, 'sudoku', 'ws', '8', '708']);
  assert.strictEqual(P.$('gpSel'), null, 'худалдан авахдаа сонгосон тул дахин асуухгүй');
  const gm = P.$('gameM');
  assert.ok(gm, 'overlay');
  assert.match(gm.querySelector('iframe').src, /^\/sudoku\.html\?realm=ws&grade=8&topic=708&t=[A-Za-z0-9._%-]+$/);
  assert.match(gm.querySelector('.gm-t').textContent, /Судоку/);
  assert.match(gm.querySelector('.gm-t small').textContent, /8-р анги · Сэдэв 8/);
});

test('GW: modal хаасны дараа poll зогсоно; сүлжээний алдаа / нэхэмжлэх үүсээгүй / 401 → амжилт гарахгүй', async () => {
  const P = page({ ls: { cm_ws_token: wsTok('kid@x.mn') }, gw: true });
  await ticks();
  P.btn('play2048', 'buy').click();
  await P.grade('gpBuy', '7');
  P.q('gpBuy', '[data-gp-go]').onclick();
  await ticks();
  assert.strictEqual(P.T.active(3000), 1);
  P.q('gpBuy', '[data-gp-x]').onclick();
  assert.strictEqual(P.$('gpBuy'), null);
  assert.strictEqual(P.T.active(3000), 0, 'хаахад poll цэвэрлэгдэнэ');

  // check 5xx/хүчингүй хариу → амжилтгүй, poll үргэлжилнэ
  let mode = 'err';
  const Q = page({ ls: { cm_ws_token: wsTok('kid@x.mn') }, gw: true,
    override: (p, action) => (action === 'check' ? (mode === 'err' ? { status: 500, body: { ok: false } } : { status: 200, body: { paid: 'yes' } }) : undefined) });
  await ticks();
  Q.btn('daam', 'buy').click();
  await Q.grade('gpBuy', '12');
  Q.q('gpBuy', '[data-gp-go]').onclick();
  await ticks();
  Q.T.fire(3000); await ticks();
  mode = 'str'; Q.T.fire(3000); await ticks();
  assert.match(Q.q('gpBuy', '[data-gp-msg]').textContent, /Төлбөрийг хүлээж байна/);
  assert.strictEqual(Q.T.active(3000), 1);

  // нэхэмжлэх үүсгэх: 401 → дахин нэвтрэх; хариугүй invoice → алдаа; QR/poll гарахгүй
  for (const [res, re] of [[{ status: 401, body: { ok: false, needLogin: true } }, /дахин нэвтэрнэ үү/], [{ status: 200, body: { ok: true } }, /Нэхэмжлэх үүсгэж чадсангүй/]]) {
    const R = page({ ls: { cm_ws_token: wsTok('kid@x.mn') }, gw: true, override: (p, action) => (action === 'create' ? res : undefined) });
    await ticks();
    R.btn('ludo', 'buy').click();
    await R.grade('gpBuy', '6');
    R.q('gpBuy', '[data-gp-go]').onclick();
    await ticks();
    assert.match(R.q('gpBuy', '[data-gp-msg]').textContent, re);
    assert.strictEqual(R.q('gpBuy', '[data-gp-qr]').children.length, 0);
    assert.strictEqual(R.T.active(3000), 0);
    assert.strictEqual(R.q('gpBuy', '[data-gp-go]').disabled, false, 'товч дахин идэвхжинэ');
  }
});

test('GW: тоглох — 402 → худалдан авах модал; 401 → нэвтрэх; 403 төхөөрөмж → анхааруулга; 403 урилга хүчингүй → урилга арилна', async () => {
  // 402: нэвтэрсэн, эрхгүй
  const P = page({ ls: { cm_ws_token: wsTok('kid@x.mn') }, gw: true });
  await ticks();
  P.W.GW.play('sudoku');
  assert.match(P.btn('sudoku', 'buy').textContent, /Нээж байна/, 'ачаалж байх үед товч түгжигдэнэ');
  await ticks();
  assert.strictEqual(P.last('launch').status, 402);
  assert.ok(P.$('gpBuy'), '402 → худалдан авах');
  assert.strictEqual(P.$('gameM'), null, 'overlay нээгдээгүй');
  assert.strictEqual(P.btn('sudoku', 'buy').disabled, false);
  // inline тоглоом эрхгүй бол index.html-ийг ачаалахгүй — шууд худалдан авах
  P.$('gpBuy')._close();
  const nL = P.W.log.filter((x) => x.action === 'launch').length;
  P.W.GW.play('chessmath');
  assert.ok(P.$('gpBuy'));
  assert.strictEqual(P.$('gameM'), null);
  assert.strictEqual(P.W.log.filter((x) => x.action === 'launch').length, nL);

  // 401: хүчингүй токен → карт «нэвтрэх», тоглоход нэвтрэх цонх
  const Q = page({ ls: { cm_ws_token: 'bad.token.x' }, gw: true });
  await ticks();
  assert.strictEqual(Q.last('status').status, 401);
  assert.strictEqual(Q.$('gamesNote').hidden, true, '401 → анхааруулгагүй');
  assert.ok(Q.btn('play2048', 'login'));
  Q.W.GW.play('play2048');
  await ticks();
  assert.strictEqual(Q.last('launch').status, 401);
  assert.deepStrictEqual(J(Q.W.logins), ['manual']);
  assert.strictEqual(typeof Q.W.__afterLogin, 'function');
  assert.strictEqual(Q.$('gameM'), null);

  // 403 төхөөрөмж: status ба launch хоёулаа
  F.reset();
  give('dev@x.mn', 'sudoku', 9);
  fillDevices('dev@x.mn', 4);
  const R = page({ ls: { cm_ws_token: wsTok('dev@x.mn') }, gw: true });
  await ticks();
  assert.strictEqual(R.last('status').status, 403);
  assert.strictEqual(R.$('gamesNote').hidden, false);
  R.$('gamesNote').querySelector('[data-gn="login"]').click();
  assert.deepStrictEqual(J(R.W.logins), ['manual']);
  R.W.GW.play('sudoku');
  await ticks();
  assert.strictEqual(R.last('launch').status, 403);
  assert.strictEqual(R.last('launch').res.deviceBlocked, true);
  assert.strictEqual(R.$('gameM'), null, 'төхөөрөмж хаагдсан → тоглоом нээгдэхгүй');
  assert.match(R.$('gamesNote').textContent, /төхөөрөмж/);
  assert.ok(R.$('gamesSec').scrolls.length >= 1, 'анхааруулга руу гүйлгэнэ');

  // 403 урилга хүчингүй: нэвтрээгүй, хадгалагдсан (хуурамч) урилгатай олон тоглогчийн файл тоглоом
  F.reset();
  const bogus = 'a'.repeat(32) + '.bogus';
  const S = page({ ss: { gp_inv_ws: JSON.stringify({ mathmortal: bogus }) }, gw: true });
  await ticks();
  const ib = S.btn('mathmortal', 'play');
  assert.match(ib.textContent, /Урилгаар тоглох/);
  ib.click();
  // сонголтгүй урилга → эхлээд анги сонгогч (эрх/урилгыг шалгахаас өмнө)
  assert.ok(S.$('gpSel'), 'анги сонгогч');
  assert.strictEqual(S.last('launch'), undefined);
  assert.strictEqual(S.q('gpSel', '[data-gp-ok]').disabled, true, 'анги сонгоогүй → «Тоглох» идэвхгүй');
  await S.grade('gpSel', '9');
  S.q('gpSel', '[data-gp-ok]').onclick();
  assert.strictEqual(S.$('gpSel'), null);
  await ticks();
  const sl = S.last('launch');
  assert.deepStrictEqual([sl.body.grade, sl.body.topic], ['9', '0']);
  assert.deepStrictEqual([sl.status, sl.body.invite, sl.res.inviteInvalid], [403, bogus, true]);
  assert.strictEqual(S.W.sessionStorage.getItem('gp_inv_ws'), null, 'хүчингүй урилга арилсан');
  assert.ok(S.W.toasts.some((t) => /Урилга/.test(t)), JSON.stringify(S.W.toasts));
  assert.ok(S.btn('mathmortal', 'login'), 'карт «нэвтрэх» төлөвт буцсан');
  assert.strictEqual(S.$('gameM'), null);
});

test('GW: overlay — gate түгжээ (locked) → нэг удаа шинэ тасалбар; дахин түгжигдвэл хаагаад худалдан авах; inline → embed url; урилга үүсгэх', async () => {
  give('kid@x.mn', 'sudoku', 9);
  give('kid@x.mn', 'chessmath', 9);
  F.db.access.get('ws|kid@x.mn|chessmath').grade = '9';   // серверийн одоогийн анги (өөр төхөөрөмж дээр сонгосон)
  // sudoku: энэ төхөөрөмж дээр хадгалсан сүүлийн сонголт (7-р анги, бүх сэдэв) → «Тоглох» шууд
  const P = page({ ls: Object.assign({ cm_ws_token: wsTok('kid@x.mn') }, selLs({ 'kid@x.mn|sudoku': { g: '7', t: '0', n: '', at: 1 } })), gw: true });
  await ticks();
  assert.match(P.card('sudoku').querySelector('.gsel').textContent, /7-р анги · Бүх сэдэв/);
  assert.match(P.card('chessmath').querySelector('.gsel').textContent, /9-р анги · Бүх сэдэв/, 'status.grades-аас');
  P.btn('sudoku', 'play').click();
  assert.strictEqual(P.$('gpSel'), null, 'сүүлийн сонголтоор шууд тоглоно');
  await ticks();
  const gm = P.$('gameM');
  const fr = gm.querySelector('iframe');
  const u1 = fr.src;
  assert.match(u1, /^\/sudoku\.html\?realm=ws&grade=7&topic=0&t=/);
  assert.strictEqual(F.db.access.get('ws|kid@x.mn|sudoku').grade, '7', 'launch → game_access.grade');
  const send = (data, src) => P.W._ls.message.forEach((f) => f({ source: src || fr.contentWindow, origin: ORIGIN, data: data }));
  send({ type: 'cm-game-locked', game: 'sudoku', reason: 'locked' }, {});   // өөр эх сурвалж → үл тоомсорлоно
  send({ type: 'cm-game-locked', game: 'daam', reason: 'locked' });         // өөр тоглоом → үл тоомсорлоно
  await ticks();
  assert.strictEqual(P.W.log.filter((x) => x.action === 'launch').length, 1);
  send({ type: 'cm-game-locked', game: 'sudoku', reason: 'locked' });
  await ticks();
  assert.strictEqual(P.W.log.filter((x) => x.action === 'launch').length, 2, 'шинэ тасалбар');
  assert.match(fr.src, /^\/sudoku\.html\?realm=ws&grade=7&topic=0&t=/, 'дахин эхлүүлэхэд сонголт хадгалагдана');
  assert.notStrictEqual(fr.src, u1);
  assert.ok(P.$('gameM'), 'overlay хэвээр');
  // toolbar «Анги/сэдэв» → сонгогч → 10-р анги, сэдэв → шинэ тасалбартай url (overlay хаагдахгүй), game_access.grade = 10
  const tb = gm.querySelectorAll('[data-gm-tool]').filter((b) => /Анги\/сэдэв/.test(b.getAttribute('title')))[0];
  assert.ok(tb, '«Анги/сэдэв» товч');
  tb.onclick();
  assert.ok(P.$('gpSel'), 'сонгогч overlay дээр');
  assert.strictEqual(P.q('gpSel', '[data-gr="7"]').getAttribute('aria-checked'), 'true', 'одоогийн анги сонгогдсон');
  await ticks();
  QF.topics['10'] = { ok: true, grade: '10', total: 200, chapters: [
    { name: 'Функц', topics: [{ id: 901, name: 'Квадрат функц', n: 40 }, { id: 902, name: 'Цөөн бодлоготой', n: 9 }] },
    { name: 'Тригонометр', topics: [{ id: 903, name: 'Синус', n: 12 }] }] };
  await P.grade('gpSel', '10');
  const ts = P.q('gpSel', '[data-gp-topic]');
  assert.strictEqual(ts.disabled, false);
  assert.deepStrictEqual(ts.querySelectorAll('option').map((o) => o.getAttribute('value')), ['0', '901', '903'], 'судоку MIN 12 — n=9 сэдэв орохгүй');
  assert.deepStrictEqual(ts.querySelectorAll('optgroup').map((o) => o.getAttribute('label')), ['Функц', 'Тригонометр']);
  P.topic('gpSel', '903');
  P.q('gpSel', '[data-gp-ok]').onclick();
  assert.strictEqual(P.$('gpSel'), null);
  await ticks();
  const l3 = P.last('launch');
  assert.deepStrictEqual([l3.body.grade, l3.body.topic], ['10', '903']);
  assert.match(fr.src, /^\/sudoku\.html\?realm=ws&grade=10&topic=903&t=/);
  assert.ok(P.$('gameM'), 'overlay хэвээр');
  assert.match(gm.querySelector('.gm-t small').textContent, /10-р анги · Синус/);
  assert.strictEqual(F.db.access.get('ws|kid@x.mn|sudoku').grade, '10');
  assert.deepStrictEqual(J(JSON.parse(P.W.localStorage.getItem('cm_game_sel_ws'))['kid@x.mn|sudoku']).g, '10');
  send({ type: 'cm-game-locked', game: 'sudoku', reason: 'locked' });
  await ticks();
  assert.strictEqual(P.$('gameM'), null, 'хоёр дахь удаа → хаана');
  assert.ok(P.$('gpBuy'), '→ худалдан авах (сунгах)');
  assert.match(P.q('gpBuy', '.gp-note').textContent, /Одоогийн эрх/);
  P.$('gpBuy')._close();

  // inline (эрхтэй) → /?embed=<key>&realm=ws, launch-гүй; «Найзаа урих» хэрэгсэл
  const nL = P.W.log.filter((x) => x.action === 'launch').length;
  P.btn('chessmath', 'play').click();
  const g2 = P.$('gameM');
  assert.strictEqual(g2.querySelector('iframe').src, '/?embed=chessmath&realm=ws&grade=9&topic=0', 'серверийн одоогийн анги');
  assert.strictEqual(P.W.log.filter((x) => x.action === 'launch').length, nL);
  assert.ok(g2.querySelectorAll('[data-gm-tool]').some((b) => /Найзаа урих/.test(b.getAttribute('title'))), 'урих хэрэгсэл');
  // embed бэлэн → «Анги/сэдэв» солиход дахин ачаалалгүй cm-embed-config; хариу (cm-embed-sel) ирвэл url солихгүй
  const f2 = g2.querySelector('iframe');
  const emsg = (data) => P.W._ls.message.forEach((f) => f({ source: f2.contentWindow, origin: ORIGIN, data: Object.assign({ game: 'chessmath' }, data) }));
  emsg({ type: 'cm-embed-ready', via: 'access' });
  g2.querySelectorAll('[data-gm-tool]').filter((b) => /Анги\/сэдэв/.test(b.getAttribute('title')))[0].onclick();
  await ticks();
  await P.grade('gpSel', '8');
  P.q('gpSel', '[data-gp-ok]').onclick();
  await ticks();
  const cfg = f2.contentWindow.posts.filter((x) => x[0] && x[0].type === 'cm-embed-config');
  assert.deepStrictEqual(J(cfg.map((x) => x[0])), [{ type: 'cm-embed-config', grade: '8', topic: '0' }]);
  assert.strictEqual(cfg[0][1], ORIGIN, 'зөвхөн ижил домэйн руу');
  emsg({ type: 'cm-embed-sel', grade: '8', topic: '0' });
  P.T.flush();
  assert.strictEqual(f2.src, '/?embed=chessmath&realm=ws&grade=9&topic=0', 'хариу ирсэн → дахин ачаалахгүй');
  assert.strictEqual(F.db.access.get('ws|kid@x.mn|chessmath').grade, '8', 'одоогийн анги серверт (launch)');
  // хариу ирэхгүй бол (хуучин index.html) шинэ embed url-ээр дахин ачаална
  g2.querySelectorAll('[data-gm-tool]').filter((b) => /Анги\/сэдэв/.test(b.getAttribute('title')))[0].onclick();
  await ticks();
  // «Анги/сэдэв» солих цонхонд ч 11-р анги идэвхгүй (data-gr биш — дарахад сонгогдохгүй)
  assert.strictEqual(P.q('gpSel', '[data-gr="11"]'), null);
  assert.ok(P.q('gpSel', '[data-gr-soon="11"]').disabled);
  await P.grade('gpSel', '12');
  P.q('gpSel', '[data-gp-ok]').onclick();
  await ticks();
  P.T.flush();
  assert.strictEqual(f2.src, '/?embed=chessmath&realm=ws&grade=12&topic=0');
  // embed-ээс «Худалдан авах» → overlay хаагаад худалдан авах
  P.W._ls.message.forEach((f) => f({ source: g2.querySelector('iframe').contentWindow, origin: ORIGIN, data: { type: 'cm-embed-buy', game: 'chessmath' } }));
  assert.strictEqual(P.$('gameM'), null);
  assert.ok(P.$('gpBuy'));
  P.$('gpBuy')._close();

  // урилга (олон тоглогчтой, эрхтэй host)
  P.btn('chessmath', 'invite').click();
  await ticks();
  const iv = P.last('invite');
  assert.strictEqual(iv.status, 200);
  const inp = P.q('gpInv', '.gp-link input');
  assert.strictEqual(inp.value, ORIGIN + iv.res.url + '&grade=12&topic=0', 'host-ийн одоогийн анги/сэдэв урилгад');
  assert.match(inp.value, /^https:\/\/cyber-math\.com\/worksheets\?game=chessmath&ginv=[^&]+&grade=12&topic=0$/);
  assert.match(P.q('gpInv', '.gp-note').textContent, /3 цаг/);
  // эрхгүй тоглоомд урилга → худалдан авах санал
  P.$('gpInv')._close();
  P.W.GW.invite('ludo');
  await ticks();
  assert.strictEqual(P.last('invite').status, 402);
  assert.match(P.q('gpInv', '.gp-msg').textContent, /эхлээд энэ тоглоомын эрх авна уу/);
  assert.ok(P.q('gpInv', '.gp-go'));
});

test('GW: GAME_PAYWALL=off → бүх карт «Үнэгүй», нэвтрэлтгүй тоглоно, худалдан авах нэхэмжлэх үүсгэхгүй', async () => {
  process.env.GAME_PAYWALL = 'off';
  const P = page({ gw: true });
  await ticks();
  assert.strictEqual(P.doc.querySelectorAll('#gcards .gbadge.free').length, 16);
  assert.match(P.$('gamesSub').textContent, /үнэгүй/);
  P.W.GW.buy('sudoku');   // нэвтрээгүй → нэвтрэх (худалдан авахад токен шаардлагатай)
  assert.deepStrictEqual(J(P.W.logins), ['manual']);
  assert.match(P.card('sudoku').querySelector('.gsel').textContent, /Анги сонгоогүй/, 'үнэгүй үед ч анги сонгоно');
  P.btn('sudoku', 'play').click();
  assert.ok(P.$('gpSel'), 'анги сонгогч');
  await P.grade('gpSel', '6');
  P.q('gpSel', '[data-gp-ok]').onclick();
  await ticks();
  assert.strictEqual(P.$('gameM').querySelector('iframe').src, '/sudoku.html?grade=6&topic=0');
  assert.strictEqual(F.qp.invoices.length, 0);
  assert.strictEqual(F.db.access.size, 0, 'үнэгүй үед эрхийн мөр үүсэхгүй');
});

// ───────────────────────── 3. анги / сэдэв (gg-ws) ─────────────────────────
test('анги/сэдэв: хуучин (анги NULL) эрхтэй → «Анги сонгоогүй» чип; «Тоглох» → сонгогч (сүүлийн ангиар урьдчилан) → launch анги тавина; «Зөвхөн хадгалах»', async () => {
  give('old@x.mn', 'play2048', 20);                 // анги NULL (gg-ws-ээс өмнөх худалдан авалт)
  give('old@x.mn', 'numseq', 20);
  const P = page({ ls: Object.assign({ cm_ws_token: wsTok('old@x.mn') }, selLs({ 'old@x.mn|sudoku': { g: '9', t: '0', n: '', at: 5 } })), gw: true });
  await ticks();
  const chip = P.card('play2048').querySelector('.gsel');
  assert.match(chip.textContent, /Анги сонгоогүй/);
  assert.ok(chip.classList.contains('none'));
  P.btn('play2048', 'play').click();
  assert.ok(P.$('gpSel'), 'анги тодорхойгүй → сонгогч');
  assert.strictEqual(P.last('launch'), undefined, 'сонгохоос өмнө launch хийхгүй');
  assert.strictEqual(P.q('gpSel', '[data-gr="9"]').getAttribute('aria-checked'), 'true', 'дансны сүүлийн анги урьдчилан');
  assert.strictEqual(P.q('gpSel', '[data-gp-ok]').disabled, false);
  P.q('gpSel', '[data-gp-ok]').onclick();
  await ticks();
  const l = P.last('launch');
  assert.deepStrictEqual([l.status, l.body.grade, l.body.topic], [200, '9', '0']);
  assert.strictEqual(F.db.access.get('ws|old@x.mn|play2048').grade, '9', 'одоогийн анги серверт');
  near(F.db.access.get('ws|old@x.mn|play2048').expires_at.getTime(), Date.now() + 20 * F.DAY, 'хугацаа өөрчлөгдөөгүй');
  assert.match(P.$('gameM').querySelector('iframe').src, /^\/play2048\.html\?realm=ws&grade=9&topic=0&t=/);
  P.$('gameM').querySelector('[data-gm="close"]').onclick();
  // numseq: сэдэвгүй (зөвхөн анги) — чипээр солих, «Зөвхөн хадгалах» → тоглохгүй
  P.card('numseq').querySelector('.gsel').click();
  assert.ok(P.$('gpSel'));
  assert.strictEqual(P.q('gpSel', '[data-gp-topic]'), null, 'numseq — сэдвийн select байхгүй');
  assert.match(P.q('gpSel', '[data-gp-hint]').textContent, /сэдэв хамаарахгүй/);
  await P.grade('gpSel', '12');
  const nl = P.W.log.filter((x) => x.action === 'launch').length;
  P.q('gpSel', '[data-gp-save]').onclick();
  await ticks();
  assert.strictEqual(P.W.log.filter((x) => x.action === 'launch').length, nl, '«Зөвхөн хадгалах» → тоглохгүй');
  assert.match(P.card('numseq').querySelector('.gsel').textContent, /12-р анги · Бүх сэдэв/);
  assert.ok(!QF.calls.some((c) => c.game_topics === '12'), 'numseq сэдвийн жагсаалт татахгүй');
});
function near(a, b, msg) { assert.ok(Math.abs(a - b) < 5000, (msg || '') + ' ' + a + ' ≈ ' + b); }

test('анги/сэдэв: сэдэв сонгоход нэр чипэнд; сэдвийн жагсаалт ачаалагдахгүй бол «Бүх сэдэв» + анхааруулга; хадгалсан буруу анги үл тоомсорлоно', async () => {
  give('kid@x.mn', 'sudoku', 9);
  QF.topics['8'] = { ok: true, grade: '8', total: 90, chapters: [
    { name: 'I бүлэг', topics: [{ id: 512, name: 'Шугаман тэгшитгэл', n: 30 }, { id: 513, name: '\u{1F4DD} Бататгал', n: 20 }] }] };
  const P = page({ ls: Object.assign({ cm_ws_token: wsTok('kid@x.mn') }, selLs({ 'kid@x.mn|sudoku': { g: '13', t: '5', at: 1 } })), gw: true });
  await ticks();
  assert.match(P.card('sudoku').querySelector('.gsel').textContent, /Анги сонгоогүй/, '13-р анги хүчингүй');
  P.card('sudoku').querySelector('.gsel').click();
  await P.grade('gpSel', '8');
  const opts = P.q('gpSel', '[data-gp-topic]').querySelectorAll('option');
  assert.deepStrictEqual(opts.map((o) => o.textContent), ['Бүх сэдэв (холимог)', 'Шугаман тэгшитгэл', 'Бататгал'], 'эможи хасагдана');
  P.topic('gpSel', '512');
  P.q('gpSel', '[data-gp-ok]').onclick();
  await ticks();
  assert.deepStrictEqual([P.last('launch').body.grade, P.last('launch').body.topic], ['8', '512']);
  assert.match(P.$('gameM').querySelector('iframe').src, /grade=8&topic=512/);
  P.$('gameM').querySelector('[data-gm="close"]').onclick();
  assert.match(P.card('sudoku').querySelector('.gsel').textContent, /8-р анги · Шугаман тэгшитгэл/);
  // жагсаалтад байхгүй сэдэв (sel хадгалагдсан) → «Бүх сэдэв» руу буцна
  QF.fail = true;
  P.card('sudoku').querySelector('.gsel').click();
  await P.grade('gpSel', '7');
  assert.deepStrictEqual(P.q('gpSel', '[data-gp-topic]').querySelectorAll('option').map((o) => o.getAttribute('value')), ['0']);
  assert.match(P.q('gpSel', '[data-gp-hint]').textContent, /ачаалагдсангүй/);
  assert.strictEqual(P.q('gpSel', '[data-gp-ok]').disabled, false, 'жагсаалтгүй ч ангиар тоглож болно');
});

test('анги/сэдэв: найзын урилгын холбоос host-ийн анги/сэдвийг дамжуулна — найз сонгогчгүй шууд нэгдэнэ, URL-аас арилна', async () => {
  give('host@x.mn', 'chessmath', 5);
  const iv = await F.call(games, { query: { action: 'invite' }, body: { game: 'chessmath', realm: 'ws', wstoken: wsTok('host@x.mn') } });
  assert.strictEqual(iv.statusCode, 200, JSON.stringify(iv.body));
  const P = page({ search: '?game=chessmath&ginv=' + encodeURIComponent(iv.body.invite) + '&grade=8&topic=512', gw: true });
  await ticks();
  assert.strictEqual(P.W.location.search, '', 'game/ginv/grade/topic URL-аас арилсан');
  assert.strictEqual(P.$('gpSel'), null, 'host-ийн сонголтоор шууд');
  const gm = P.$('gameM');
  assert.ok(gm, 'урилгаар нээгдсэн');
  assert.strictEqual(gm.querySelector('iframe').src, '/?embed=chessmath&realm=ws&einv=' + encodeURIComponent(iv.body.invite) + '&grade=8&topic=512');
  assert.match(gm.querySelector('.gm-t small').textContent, /8-р анги · Сонгосон сэдэв · Найзын урилгаар/);
  assert.strictEqual(F.db.access.get('ws|host@x.mn|chessmath').grade, undefined, 'найз host-ийн мөрийг өөрчлөхгүй');
});

test('анги/сэдэв: Мянгат/500 XP — бодлогыг /api/questions?game=&topic=&n=-ээр; сэдвээс цөөн бол бүх сэдвээс; Мянгат хялбараас хүнд рүү', async () => {
  give('kid@x.mn', 'myangat', 9);
  give('kid@x.mn', 'xpdrop', 9);
  const D = ['hard', 'easy', 'medium'];
  QF.qs = (g, t, n) => (t === '512' ? [1, 2, 3].map((i) => ({ id: i, text: 'T' + i, choices: ['a', 'b', 'c', 'd'], correct: 'b', difficulty: 'hard' }))
    : Array.from({ length: n }, (_, i) => ({ id: 100 + i, text: 'A' + i, choices: ['a', 'b', 'c', 'd'], correct: 'c', difficulty: D[i % 3] })));
  const P = page({ ls: Object.assign({ cm_ws_token: wsTok('kid@x.mn') }, selLs({ 'kid@x.mn|myangat': { g: '8', t: '512', n: 'Шугаман', at: 2 }, 'kid@x.mn|xpdrop': { g: '10', t: '0', at: 1 } })), gw: true });
  await ticks();
  P.btn('myangat', 'play').click();
  await ticks();
  const fr = P.$('gameM').querySelector('iframe');
  assert.match(fr.src, /^\/myangat\.html\?realm=ws&grade=8&topic=512&t=/);
  P.W._ls.message.forEach((f) => f({ source: fr.contentWindow, origin: ORIGIN, data: { type: 'myangat-need-questions' } }));
  await ticks();
  const qc = QF.calls.filter((c) => c.game);
  assert.deepStrictEqual(qc.map((c) => [c.game, c.topic, c.n]), [['8', '512', '15'], ['8', '0', '15']], 'сэдвээс 3 < 15 → бүх сэдвээс');
  const post = fr.contentWindow.posts.filter((x) => x[0].type === 'myangat-questions')[0];
  assert.ok(post, 'бодлого илгээсэн');
  assert.strictEqual(post[1], ORIGIN);
  assert.strictEqual(post[0].questions.length, 15);
  // сэдвийн 3 бодлого (T1–T3, hard) үлдэж, ангийн сангаас НӨХӨГДСӨН
  assert.strictEqual(post[0].questions.filter((q) => /^T/.test(q.text)).map((q) => q.text).sort().join(','), 'T1,T2,T3', 'сэдвийнх хадгалагдана');
  const diff = post[0].questions.map((q) => (/^T/.test(q.text) ? 'hard' : D[Number(q.text.slice(1)) % 3]));
  assert.deepStrictEqual(diff, diff.slice().sort((a, b) => ['easy', 'medium', 'hard'].indexOf(a) - ['easy', 'medium', 'hard'].indexOf(b)), 'хялбараас хүнд рүү');
  assert.strictEqual(post[0].questions[0].options.length, 4);
  P.$('gameM').querySelector('[data-gm="close"]').onclick();
  // 500 XP: 10 бодлого, ангийн бүх сэдэв
  QF.calls.length = 0;
  P.btn('xpdrop', 'play').click();
  await ticks();
  const fx = P.$('gameM').querySelector('iframe');
  P.W._ls.message.forEach((f) => f({ source: fx.contentWindow, origin: ORIGIN, data: { type: 'xpdrop-need-questions' } }));
  await ticks();
  assert.deepStrictEqual(QF.calls.filter((c) => c.game).map((c) => [c.game, c.topic, c.n]), [['10', '0', '10']]);
  const px = fx.contentWindow.posts.filter((x) => x[0].type === 'xpdrop-questions')[0];
  assert.strictEqual(px[0].rounds.length, 10);
});

test('worksheets.html: анги/сэдвийн сонгогчийн CSS утсан дээр (7 анги нэг мөрөнд, select багтана), эможигүй', () => {
  const css = between(WSH, '/* Анги (заавал) + сэдэв (заавал биш) сонгогч', '</style>');
  assert.match(css, /\.gp-grades\{[^}]*grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(css, /\.gp-gr\{[^}]*min-width:0/);
  assert.match(css, /\.gp-topic\{[^}]*width:100%[^}]*max-width:100%[^}]*box-sizing:border-box[^}]*min-width:0/);
  const chip = between(WSH, '/* Анги/сэдвийн чип (картан дээр)', '.gmore{');
  assert.match(chip, /\.gsel span\{[^}]*text-overflow:ellipsis/);
  [css, chip].forEach((s) => assert.doesNotMatch(s, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u));
});

test('анги: шинэ төхөөрөмжид худалдан авахад дансны серверийн сүүлийн анги (status.lastGrade) урьдчилан; хадгалсан 11 («Тун удахгүй») → анги дахин асууна', async () => {
  F.db.access.set('ws|srv@x.mn|ludo', { realm: 'ws', email: 'srv@x.mn', game_key: 'ludo', expires_at: new Date(Date.now() + 20 * F.DAY), updated_at: new Date(), grade: '10' });
  F.db.access.set('ws|srv@x.mn|gomoku', { realm: 'ws', email: 'srv@x.mn', game_key: 'gomoku', expires_at: new Date(Date.now() + 5 * F.DAY), updated_at: new Date(), grade: null });
  const P = page({ ls: Object.assign({ cm_ws_token: wsTok('srv@x.mn') }, selLs({ 'srv@x.mn|gomoku': { g: '11', t: '0', n: '', at: 9 } })), gw: true });
  await ticks();
  // шинэ тоглоом (sudoku) — localStorage-д анги алга (11 тооцохгүй) → серверийн lastGrade = 10
  P.btn('sudoku', 'buy').click();
  assert.ok(P.$('gpBuy'));
  assert.strictEqual(P.q('gpBuy', '[data-gr="10"]').getAttribute('aria-checked'), 'true', 'серверийн сүүлийн анги урьдчилан');
  assert.strictEqual(P.q('gpBuy', '[data-gp-go]').disabled, false);
  P.$('gpBuy')._close();
  // хадгалсан 11 → сонголт хүчингүй: чип «Анги сонгоогүй», «Тоглох» → сонгогч (11 биш, 10 урьдчилан)
  assert.match(P.card('gomoku').querySelector('.gsel').textContent, /Анги сонгоогүй/);
  P.btn('gomoku', 'play').click();
  assert.ok(P.$('gpSel'), 'анги дахин асууна');
  assert.strictEqual(P.last('launch'), undefined);
  assert.strictEqual(P.q('gpSel', '[data-gr="10"]').getAttribute('aria-checked'), 'true');
  assert.ok(P.q('gpSel', '[data-gr-soon="11"]').disabled);
  P.$('gpSel')._close();
});

test('сүлжээ 0, тодорхойгүй SQL алга', () => {
  assert.deepStrictEqual(F.qp.other, []);
  assert.deepStrictEqual(F.db.unknown, []);
});
