// Шинэ дансны үнэгүй туршилт — клиент: ws-store.js (ажлын хуудас бүр) ба worksheets.html (Дасгалын төвийн нүүр).
// Бодит эх кодын хэсгүүдийг хуурамч DOM + vm дээр ажиллуулна; цаг: Date (клиентийн, зөрүүтэй байж болно),
// performance.now() (монотон), таймерууд — бүгд виртуал. «Сервер» = тестийн wsstatus хариу (серверийн жинхэнэ цаг).
//  • тоолуур 'm:ss' (5:00 → 0:01), секунд бүр; яг deadline дээр (≤ +250мс) түгжээ (why:'trial') + худалдан авах цонх
//  • клиентийн цаг ±1 цаг зөрсөн ч зөв; системийн цагийг хойш тавьсан ч performance-оор түгжинэ; sleep → Date-оор
//  • нуугдсан табаас буцаж ирэхэд (throttled timer) шууд түгжинэ
//  • дуусах үеийн шалгалт: сүлжээний алдаа / «trial» хариу → түгжээтэй; төлсөн ('all') → нээгдэнэ
//  • WS_FREE (soft): бүдгэрүүлэхгүй, хаагддаг цонх; хэвлэлт: strip нуугдана, түгжсэн хуудас хоосон
//  • worksheets.html: verifyUser → strip «Үнэгүй туршилт · 5:00»; 0:00 → openBuy({trialEnd:true}) НЭГ удаа, CM_USER=null
// Ажиллуулах: node --test tests/ws-trial-ui.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const nodeCrypto = require('crypto');

const WT = path.resolve(__dirname, '..');
const WSS = fs.readFileSync(path.join(WT, 'ws-store.js'), 'utf8');
const WSH = fs.readFileSync(path.join(WT, 'worksheets.html'), 'utf8');
function between(src, a, b) {
  const i = src.indexOf(a);
  assert.ok(i >= 0, 'олдсонгүй: ' + a);
  const j = src.indexOf(b, i + a.length);
  assert.ok(j > i, 'төгсгөл олдсонгүй: ' + b);
  return src.slice(i, j + b.length);
}
// ws-store.js: эрх шалгах + түгжээ (checkAccess/showLock/unlockWs) + enforcePaywall + TRIAL блок (маркертай)
const STORE_SRC = between(WSS, 'var WS_PRICE=39900;', '/* ═══ /TRIAL ═══ */');
const STORE_ESC = (/function esc\(s\)\{[^\r\n]*\}/.exec(WSS) || [])[0];
const TRIAL_SRC = between(WSS, '/* ═══ TRIAL (api/_wstrial.js) ═══', '/* ═══ /TRIAL ═══ */');
// worksheets.html: толгойн данс + TRIAL блок (games-ws-ui.test.js-тэй ижил муж)
const AUTH_SRC = between(WSH, '/* ── Хэрэглэгчийн нэвтрэлт (худалдан авсан имэйлээр) ── */', '/* ═══ /TRIAL ═══ */');
const WSH_ESC = (/function esc\(s\)\{[^\r\n]*\}/.exec(WSH) || [])[0];
assert.ok(STORE_ESC && WSH_ESC);

// ───────── хамгийн бага DOM (games-ws-ui.test.js-ийнх + insertBefore, «,» жагсаалт, :not(.x)) ─────────
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function decode(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
function walk(root, fn) { root.children.forEach((c) => { fn(c); walk(c, fn); }); }
function parseCompound(s) {
  const c = { tag: null, id: null, cls: [], attrs: [], not: [] };
  const re = /([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]"']*)))?\]|:not\(([^)]*)\)/y;
  let i = 0;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) throw new Error('fake DOM: selector ' + s);
    i = re.lastIndex;
    if (m[1]) c.tag = m[1].toUpperCase();
    else if (m[2]) c.id = m[2];
    else if (m[3]) c.cls.push(m[3]);
    else if (m[8] !== undefined) c.not.push(parseCompound(m[8].trim()));
    else c.attrs.push([m[4], m[5] !== undefined ? m[5] : m[6] !== undefined ? m[6] : m[7] !== undefined ? m[7] : null]);
  }
  return c;
}
function matchCompound(el, c) {
  if (!el || el.nodeType !== 1) return false;
  if (c.tag && el.tagName !== c.tag) return false;
  if (c.id && el.getAttribute('id') !== c.id) return false;
  if (c.cls.some((x) => !el.classList.contains(x))) return false;
  if (c.not.some((n) => matchCompound(el, n))) return false;
  return c.attrs.every(([k, v]) => { const a = el.getAttribute(k); return a !== null && (v === null || a === v); });
}
function matchOne(el, sel) {
  const parts = String(sel).trim().split(/\s+(?![^[(]*[\])])/).map(parseCompound);
  if (!matchCompound(el, parts[parts.length - 1])) return false;
  let n = el.parentNode;
  for (let i = parts.length - 2; i >= 0; i--) {
    while (n && !matchCompound(n, parts[i])) n = n.parentNode;
    if (!n) return false;
    n = n.parentNode;
  }
  return true;
}
function matchSel(el, sel) { return String(sel).split(',').some((s) => s.trim() && matchOne(el, s)); }
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
    this.hidden = false; this.disabled = false; this._html = ''; this._text = null;
  }
  get id() { return this.attrs.id || ''; }
  set id(v) { this.attrs.id = String(v); }
  get className() { return Array.from(this.classList.s).join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get firstChild() { return this.children[0] || null; }
  get innerHTML() { return this._text != null ? this._text : this._html; }
  set innerHTML(v) { this._drop(); this._html = String(v); parseInto(this, this._html); this._dirty = false; }
  // _html-аас (текст зангилаатай нь); дотор нь хүүхэд өөрчлөгдсөн бол хүүхдүүдээс
  get textContent() {
    if (this._text != null) return this._text;
    if (!this._dirty) return decode(this._html.replace(/<[^>]*>/g, ''));
    return this.children.map((c) => c.textContent).join('');
  }
  set textContent(v) { this._drop(); this._html = ''; this._text = String(v); this._touch(); }
  _touch() { for (let n = this.parentNode; n; n = n.parentNode) n._dirty = true; }
  _drop() { this.children.forEach((c) => { c.parentNode = null; }); this.children = []; this._text = null; }
  setAttribute(k, v) { k = String(k); v = String(v); if (k === 'class') this.className = v; else this.attrs[k] = v; }
  getAttribute(k) { if (k === 'class') return this.classList.s.size ? this.className : null; return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.children.push(c); c._touch(); return c; }
  insertBefore(c, ref) {
    if (c.parentNode) c.parentNode.removeChild(c);
    const i = ref ? this.children.indexOf(ref) : -1;
    c.parentNode = this;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c._touch();
    return c;
  }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; this._dirty = true; return c; }
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
  scrollIntoView() {} focus() { this.ownerDocument.activeElement = this; } select() {}
  blur() { if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; this.blurred = true; }
}
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
      if (name === 'value' || name === 'href' || name === 'src') el[name] = v;
    }
    const par = stack[stack.length - 1].el;
    el.parentNode = par; par.children.push(el);          // задлалт «өөрчлөлт» биш (_dirty тавихгүй)
    if (!VOID.has(el.tagName.toLowerCase()) && !m[4]) stack.push({ el: el, start: re.lastIndex });
  }
  while (stack.length > 1) { const fr = stack.pop(); fr.el._html = html.slice(fr.start); }
}
function makeDoc() {
  const doc = { ls: {}, referrer: '' };
  const html = new El('html', doc), head = new El('head', doc), body = new El('body', doc);
  html.appendChild(head); html.appendChild(body);
  Object.assign(doc, {
    documentElement: html, head: head, body: body, readyState: 'complete', activeElement: body, hidden: false,
    createElement: (t) => new El(t, doc),
    getElementById: (id) => { let f = null; walk(html, (n) => { if (!f && n.attrs.id === id) f = n; }); return f; },
    querySelectorAll: (s) => html.querySelectorAll(s),
    querySelector: (s) => html.querySelector(s),
    addEventListener(t, f) { (doc.ls[t] = doc.ls[t] || []).push(f); },
    removeEventListener(t, f) { doc.ls[t] = (doc.ls[t] || []).filter((x) => x !== f); },
  });
  return doc;
}
function storage(init) {
  const m = new Map(Object.entries(init || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}
function ticks(n) { let p = Promise.resolve(); for (let i = 0; i < (n || 20); i++) p = p.then(() => new Promise((r) => setImmediate(r))); return p; }

// ───────── виртуал цаг ─────────
//  C.t     — бодит өнгөрсөн хугацаа (performance.now, таймерууд үүгээр ажиллана)
//  C.skew  — клиентийн системийн цагийн зөрүү (Date.now = BASE + t + skew)
//  C.perfLag — performance.now() зогссон хугацаа (sleep)
//  серверийн цаг = BASE + t (зөрүүгүй)
const BASE = Date.UTC(2026, 9, 19, 10, 0, 0);
function vclock(skew) {
  const C = { t: 0, skew: skew || 0, perfLag: 0, seq: 0, timers: new Map() };
  C.dateNow = () => BASE + C.t + C.skew;
  C.perf = () => C.t - C.perfLag;
  C.server = () => BASE + C.t;
  C.setTimeout = (fn, ms) => { const id = ++C.seq; C.timers.set(id, { fn: fn, due: C.t + Math.max(0, Number(ms) || 0), rep: 0 }); return id; };
  C.setInterval = (fn, ms) => { const id = ++C.seq; const r = Math.max(1, Number(ms) || 0); C.timers.set(id, { fn: fn, due: C.t + r, rep: r }); return id; };
  C.clear = (id) => { C.timers.delete(id); };
  C.advance = (ms) => {          // таймеруудыг дарааллаар нь цохино
    const end = C.t + ms;
    for (;;) {
      let nx = null, nid = null;
      C.timers.forEach((x, id) => { if (x.due <= end && (!nx || x.due < nx.due)) { nx = x; nid = id; } });
      if (!nx) break;
      C.t = Math.max(C.t, nx.due);
      if (nx.rep) nx.due += nx.rep; else C.timers.delete(nid);
      nx.fn();
    }
    C.t = end;
  };
  C.jump = (ms) => { C.t += ms; };   // таймер огт цохихгүйгээр хугацаа өнгөрөх (background таб — throttling)
  return C;
}
function mkDate(C) {
  return class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(C.dateNow()); }
    static now() { return C.dateNow(); }
  };
}
const E = 'new@x.mn';
const TOK = 'h.' + Buffer.from(JSON.stringify({ email: E, ws: true })).toString('base64url') + '.s';
const iso = (ms) => new Date(ms).toISOString();
// wsstatus хариунууд (сервер өөрийн цагаар)
function rTrial(C, leftMs, o) {
  o = o || {};
  const now = C.server(), secs = o.seconds || 300;
  return { ok: true, enabled: true, active: true, scope: 'trial', email: E, account: E, expires_at: iso(now + leftMs), grades: [], ws_token: null,
    trial: { until: iso(now + leftMs), started_at: iso(now + leftMs - secs * 1000), server_now: now, seconds: secs, active: true, denied: null },
    grade: '6-р анги', prices: { 3: 39900, 6: 69900, 9: 99900, 12: 119900 }, months: [3, 6, 9, 12] };
}
function rEnded(C, o) {
  o = o || {};
  const now = C.server();
  return { ok: true, enabled: true, active: false, scope: null, email: null, account: E, expires_at: null, grades: [], ws_token: null,
    trial: { until: iso(now - 1000), started_at: iso(now - 301000), server_now: now, seconds: o.seconds || 300, active: false, denied: o.denied || null },
    grade: '6-р анги' };
}
function rPaid(C) { return { ok: true, enabled: true, active: true, scope: 'all', email: E, account: E, expires_at: iso(C.server() + 90 * 864e5), grades: [], ws_token: TOK }; }
const NET = new Error('network down');

// ───────── ws-store.js хуудас ─────────
function storePage(o) {
  o = o || {};
  const C = vclock(o.skew);
  const doc = makeDoc();
  doc.body.innerHTML = '<div class="bar"><button class="btn refresh" type="button">Шинэ бодлого</button><button class="btn" type="button">Хэвлэх / PDF</button></div>'
    + '<div class="sheet" id="sheet"><div class="grid"><div class="q">1 + 1 =</div></div></div>';
  const loc = { origin: 'https://cyber-math.com', pathname: '/' + (o.slug || 'jishig-daalgavar-1-6.html'), search: '', href: '' };
  const P = { C: C, doc: doc, log: [], srv: o.srv || (() => rTrial(C, 300000)) };
  const W = {
    document: doc, localStorage: storage(Object.assign({ cm_ws_token: TOK, cm_last_user: E }, o.ls || {})), location: loc, history: { length: 1, back() {} },
    navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0', language: 'mn-MN', hardwareConcurrency: 8 },
    screen: { width: 1920, height: 1080, colorDepth: 24 }, crypto: nodeCrypto.webcrypto,
    atob: (s) => Buffer.from(String(s), 'base64').toString('binary'), URL: URL, console: console,
    Date: mkDate(C), performance: { now: () => C.perf() },
    setTimeout: C.setTimeout, clearTimeout: C.clear, setInterval: C.setInterval, clearInterval: C.clear,
    _ls: {}, addEventListener(t, f) { (W._ls[t] = W._ls[t] || []).push(f); }, removeEventListener() {},
  };
  W.window = W; W.top = W; W.self = W;
  W.fetch = async function (url, opts) {
    const u = new URL(String(url), 'https://cyber-math.com');
    const body = JSON.parse((opts && opts.body) || '{}');
    const ent = { action: u.searchParams.get('action'), body: body, headers: (opts && opts.headers) || {} };
    P.log.push(ent);
    await new Promise((r) => setImmediate(r));
    const r = ent.action === 'wsstatus' ? P.srv(body) : { ok: true };
    if (r instanceof Error) throw r;
    return { status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(r)) };
  };
  vm.createContext(W);
  vm.runInContext('var IS_QR=false;\n' + STORE_ESC + '\n' + STORE_SRC, W, { filename: 'ws-store.js#paywall+trial' });
  P.W = W; P.$ = (id) => doc.getElementById(id);
  P.fireDoc = (t) => (doc.ls[t] || []).forEach((f) => f({}));
  P.fireWin = (t) => (W._ls[t] || []).forEach((f) => f({}));
  P.sheet = () => doc.getElementById('sheet');
  P.bar = () => doc.querySelector('.bar');
  P.printBtn = () => doc.querySelector('.bar .btn:not(.refresh)');
  P.locked = () => !!doc.getElementById('wsLock');
  return P;
}
async function startStore(o) {
  const P = storePage(o);
  P.W.enforcePaywall();
  await ticks();
  return P;
}

test('ws-store: TRIAL маркертай блок бие даасан, эможигүй; хэвлэлтэд strip нуугдана', () => {
  assert.match(TRIAL_SRC, /^\/\* ═══ TRIAL \(api\/_wstrial\.js\) ═══/);
  assert.doesNotMatch(TRIAL_SRC + AUTH_SRC, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможи хэрэглэхгүй');
  assert.match(TRIAL_SRC, /@media print\{#cmTrialBar,#cmTrialSpacer\{display:none!important\}\}/);
  assert.match(WSS, /var LOCK_PRINT_SEL='html\.cm-ws-locked body>\*:not\(#cm-lk0\):not\(#cm-lk1\):not\(#cm-lk2\)';/);
  assert.match(WSS, /st\.textContent='@media print\{'\+LOCK_PRINT_SEL\+'\{display:none!important\}\}';/);
  assert.match(AUTH_SRC, /@media print\{#cmTrialBar,#cmTrialSpacer\{display:none!important\}\}/);
  // шар хайрцаггүй — тунгалаг + ягаан зүүн ирмэг
  assert.match(TRIAL_SRC, /background:transparent;border-left:3px solid #ec4899/);
});

// CSS specificity [id, class/attr/pseudo-class, element] — :not(x) нь аргументынхаа specificity-тэй
function specOf(sel) {
  let s = String(sel).trim().replace(/:not\(/g, ' ').replace(/\)/g, ' ');
  const a = (s.match(/#[\w-]+/g) || []).length; s = s.replace(/#[\w-]+/g, ' ');
  const pe = (s.match(/::[\w-]+/g) || []).length; s = s.replace(/::[\w-]+/g, ' ');
  const b = (s.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g) || []).length; s = s.replace(/\.[\w-]+|\[[^\]]*\]|:[\w-]+/g, ' ');
  const c = (s.match(/(?:^|[\s>+~])[a-zA-Z][\w-]*/g) || []).length + pe;
  return [a, b, c];
}
const gtSpec = (x, y) => x[0] !== y[0] ? x[0] > y[0] : x[1] !== y[1] ? x[1] > y[1] : x[2] > y[2];

test('ws-store: түгжээний хэвлэх дүрэм ажлын хуудас БҮРИЙН ID-тай «display:…!important» дүрмээс хүчтэй (Олон хувилбар / ангиар хэвлэх)', () => {
  const lockSel = /var LOCK_PRINT_SEL='([^']+)'/.exec(WSS)[1];
  const lockSpec = specOf(lockSel);
  assert.deepStrictEqual(lockSpec, [3, 1, 2]);
  assert.deepStrictEqual(specOf('body>#cm-vbatch'), [1, 0, 1]);
  assert.deepStrictEqual(specOf('html.cm-ws-locked body>*'), [0, 1, 2], 'хуучин дүрэм — #cm-vbatch-д ялагддаг байсан');
  // «sel{… display:<none биш> !important …}» — CSS (<style>) ба JS мөр ('…'+'…') доторх дүрмийн selector-ууд
  function importantShows(s) {
    const out = [], re = /display:\s*([a-z-]+)\s*!important/g;
    let m;
    while ((m = re.exec(s))) {
      if (m[1] === 'none') continue;
      const ob = s.lastIndexOf('{', m.index);
      if (ob < 0 || s.lastIndexOf('}', m.index) > ob) continue;
      let i = ob - 1;
      while (i >= 0 && '{}\'"+;\n'.indexOf(s[i]) < 0) i--;
      s.slice(i + 1, ob).split(',').map((x) => x.trim()).filter((x) => x.indexOf('#') >= 0).forEach((x) => out.push(x));
    }
    return out;
  }
  const seen = new Set();
  let pages = 0;
  const check = (nm, sel) => {
    seen.add(sel);
    assert.ok(gtSpec(lockSpec, specOf(sel)), nm + ': «' + sel + '» ' + JSON.stringify(specOf(sel)) + ' түгжээг давна');
  };
  for (const f of fs.readdirSync(WT).filter((x) => x.endsWith('.html'))) {
    const src = fs.readFileSync(path.join(WT, f), 'utf8');
    if (src.indexOf('ws-store.js') < 0) continue;
    pages++;
    if (src.indexOf('!important') >= 0) importantShows(src).forEach((sel) => check(f, sel));
  }
  importantShows(WSS).forEach((sel) => check('ws-store.js', sel));
  assert.ok(pages > 1000, 'ажлын хуудсууд: ' + pages);
  assert.ok(seen.has('body>#cm-vbatch'), 'шалгалтын «Олон хувилбар» дүрэм шалгагдав');
  assert.ok(seen.has('#cm-batch'), 'ангиар хэвлэх дүрэм шалгагдав');
  // Түгжээ хуудасны ямар ч fixed цонхноос дээр (шалгалтын #cm-vmodal 10000)
  const lockZ = Number(/o\.id='wsLock';[\s\S]{0,200}?z-index:(\d+)/.exec(WSS)[1]);
  const vm1 = fs.readFileSync(path.join(WT, 'shalgalt-material-1-9.html'), 'utf8');
  const vmZ = Number(/o\.id='cm-vmodal';o\.style\.cssText='position:fixed;inset:0;z-index:(\d+)/.exec(vm1)[1]);
  assert.ok(lockZ > vmZ && lockZ > 10000, 'wsLock z ' + lockZ + ' > «Олон хувилбар» ' + vmZ);
});

test('ws-store: тоолуур m:ss секунд бүр, сүүлийн минут улаан; ЯГ deadline дээр түгжээ + баннер + бүх үйлдэл хаалттай', async () => {
  const P = await startStore();
  assert.strictEqual(P.locked(), false, 'туршилт идэвхтэй → хуудас нээлттэй');
  assert.ok(P.$('cmTrialBar'), 'strip');
  assert.strictEqual(P.$('cmTrialBar').getAttribute('role'), 'timer');
  assert.match(P.$('cmTrialBar').textContent, /Үнэгүй туршилт·5:00/);
  assert.strictEqual(P.doc.body.firstChild.id, 'cmTrialSpacer', 'spacer агуулгыг доош түлхэнэ');
  assert.ok(P.doc.documentElement.classList.contains('cm-trial'));
  assert.ok(P.$('cm-trial-css'));
  assert.strictEqual(P.$('cmTrialT').textContent, '5:00');
  P.C.advance(1000); assert.strictEqual(P.$('cmTrialT').textContent, '4:59');
  P.C.advance(1000); assert.strictEqual(P.$('cmTrialT').textContent, '4:58');
  P.C.advance(237000); assert.strictEqual(P.$('cmTrialT').textContent, '1:01');
  assert.strictEqual(P.$('cmTrialBar').classList.contains('low'), false);
  P.C.advance(1000); assert.strictEqual(P.$('cmTrialT').textContent, '1:00');
  assert.strictEqual(P.$('cmTrialBar').classList.contains('low'), true, 'сүүлийн минут');
  // ангиар хэвлэх цонх нээлттэй, товч фокустай байхад дуусна
  const bm = P.doc.createElement('div'); bm.id = 'cm-batchModal'; P.doc.body.appendChild(bm);
  const bx = P.doc.createElement('div'); bx.id = 'cm-batch'; P.doc.body.appendChild(bx);
  P.bar().children[0].focus();
  P.srv = () => rEnded(P.C);
  P.C.advance(59000);
  assert.strictEqual(P.$('cmTrialT').textContent, '0:01');
  P.C.advance(990);                              // 299.990 сек
  assert.strictEqual(P.locked(), false, 'deadline-аас өмнө түгжихгүй');
  P.C.advance(30);                               // 300.020 сек
  assert.strictEqual(P.locked(), true, 'яг deadline дээр (≤ +250мс) түгжинэ');
  const lockedAt = P.C.t;
  assert.ok(lockedAt >= 300000 && lockedAt <= 300250);
  assert.ok(P.$('wsTrialEnd'), 'баннер');
  assert.match(P.$('wsTrialEnd').textContent, /Үнэгүй 5 минут дууслаа\. Үргэлжлүүлэхийн тулд доорх багцаас сонгоно уу\./);
  assert.strictEqual(P.$('cmTrialBar'), null, 'strip арилна (цонх дээр нь)');
  assert.strictEqual(P.$('cmTrialSpacer'), null);
  assert.strictEqual(P.sheet().style.filter, 'blur(6px)');
  assert.strictEqual(P.sheet().style.pointerEvents, 'none');
  assert.strictEqual(P.sheet().inert, true, '#sheet inert');
  assert.strictEqual(P.bar().inert, true, '«Шинэ бодлого»/хэвлэх товч Tab+Enter-ээр ч ажиллахгүй');
  assert.strictEqual(P.printBtn().style.display, 'none', 'Хэвлэх/PDF нуугдана');
  assert.ok(P.doc.documentElement.classList.contains('cm-ws-locked'), 'Ctrl+P → хоосон хуудас');
  assert.ok(P.$('cm-lock-css'));
  assert.strictEqual(P.$('cm-batchModal'), null, 'ангиар хэвлэх цонх хаагдана');
  assert.strictEqual(P.$('cm-batch'), null);
  assert.strictEqual(P.bar().children[0].blurred, true, 'фокус салгана');
  // төлбөрийн сонголт автоматаар (QPay товч, багцууд)
  assert.ok(P.$('wsBuy'), 'QPay товч');
  await ticks();
  assert.strictEqual(P.log.filter((x) => x.action === 'wsstatus').length, 2, 'дуусахад сервер дахин шалгана');
  assert.match(P.$('wsPlan').innerHTML, /6-р анги/, 'ангийн/бүх ангийн багц');
  assert.strictEqual(P.locked(), true);
  assert.strictEqual(P.W.localStorage.getItem('cm_ws_trial_end') !== null, true, 'нэмэлт түгжээний тэмдэглэл');
  // «Буцах» дарахад агуулга нээгдэхгүй (каталог руу)
  P.$('wsBack').click();
  assert.strictEqual(P.sheet().style.filter, 'blur(6px)');
  // хэдэн ч таймер цохисон давхар цонх гарахгүй
  P.C.advance(10000);
  assert.strictEqual(P.doc.querySelectorAll('#wsLock').length, 1);
});

test('ws-store: клиентийн цаг ±1 цаг зөрсөн ч серверийн цагаар ижил мөчид түгжинэ (offset)', async () => {
  for (const skew of [3600e3, -3600e3, 0]) {
    const P = await startStore({ skew: skew });
    assert.strictEqual(P.$('cmTrialT').textContent, '5:00', 'skew ' + skew);
    P.srv = () => rEnded(P.C);
    P.C.advance(299980);
    assert.strictEqual(P.locked(), false, 'skew ' + skew);
    P.C.advance(40);
    assert.strictEqual(P.locked(), true, 'skew ' + skew);
  }
});

test('ws-store: системийн цагийг хойш тавьсан ч performance-оор; sleep (performance зогссон) үед Date-оор түгжинэ', async () => {
  const P = await startStore();
  P.C.advance(100000);
  P.C.skew -= 3 * 3600e3;                        // хэрэглэгч цагаа 3 цаг хойш тавив
  P.srv = () => rEnded(P.C);
  P.C.advance(199990);
  assert.strictEqual(P.locked(), false);
  P.C.advance(40);
  assert.strictEqual(P.locked(), true, 'Date хойшилсон ч perf deadline');

  const Q = await startStore();
  Q.C.advance(60000);
  Q.C.perfLag += 400000; Q.C.jump(400000);       // компьютер унтав: Date урагшилсан, performance.now() зогссон, таймер цохиогүй
  Q.srv = () => rEnded(Q.C);
  assert.strictEqual(Q.locked(), false);
  Q.fireDoc('visibilitychange');
  assert.strictEqual(Q.locked(), true, 'Date deadline');
});

test('ws-store: нуугдсан табаас буцаж ирэх / focus / pageshow / хэвлэхийн өмнө — шууд түгжинэ', async () => {
  for (const ev of ['visibilitychange', 'focus', 'pageshow', 'beforeprint']) {
    const P = await startStore();
    P.srv = () => rEnded(P.C);
    P.C.jump(301000);                            // background — таймер throttled (цохиогүй)
    assert.strictEqual(P.locked(), false, ev);
    if (ev === 'visibilitychange') P.fireDoc(ev); else P.fireWin(ev);
    assert.strictEqual(P.locked(), true, ev);
    assert.ok(P.doc.documentElement.classList.contains('cm-ws-locked'), ev + ': хэвлэвэл хоосон');
  }
});

test('ws-store: дуусах үеийн серверийн шалгалт — сүлжээний алдаа / «trial» хариу → түгжээтэй; төлсөн (all) → нээгдэнэ', async () => {
  const cases = [
    ['сүлжээний алдаа', (C) => NET, true],
    ['trial идэвхтэй (сервер хоцорсон)', (C) => rTrial(C, 2000), true],
    ['дууссан', (C) => rEnded(C), true],
    ['төлсөн бүх анги', (C) => rPaid(C), false],
    ['ангийн эрх', (C) => Object.assign(rPaid(C), { scope: 'grade' }), false],
  ];
  for (const [name, mk, stays] of cases) {
    const P = await startStore();
    P.srv = () => mk(P.C);
    P.C.advance(300100);
    assert.strictEqual(P.locked(), true, name + ': 0:00 түгжинэ');
    await ticks();
    assert.strictEqual(P.locked(), stays, name);
    if (!stays) {
      assert.strictEqual(P.sheet().style.filter, '', name);
      assert.strictEqual(P.sheet().inert, false, name);
      assert.strictEqual(P.doc.documentElement.classList.contains('cm-ws-locked'), false, name);
      assert.strictEqual(P.W.localStorage.getItem('cm_ws_trial_end'), null, name + ': тэмдэглэл арилна');
    }
    // «Эрхээ сэргээх» (checkAccess) — trial хариугаар нээгдэхгүй
    if (stays) {
      P.srv = () => rTrial(P.C, 5000);
      P.$('wsRestore').click();
      await ticks();
      assert.strictEqual(P.locked(), true, name + ': restore');
    }
  }
});

test('ws-store: дараа нээсэн хуудас — дууссан туршилт баннертай түгжээ; сүлжээний алдаа ч (fail-open) нээхгүй; denied мессеж', async () => {
  const P = storePage({ srv: () => rEnded(P.C) });
  P.W.enforcePaywall();
  await ticks();
  assert.strictEqual(P.locked(), true);
  assert.match(P.$('wsTrialEnd').textContent, /Үнэгүй 5 минут дууслаа/);
  assert.strictEqual(P.$('cmTrialBar'), null, 'дууссан бол тоолуур харуулахгүй');
  // ижил хөтчөөр дараагийн хуудас, сервер хүрэхгүй — fail-open биш
  const Q = storePage({ ls: { cm_ws_trial_end: P.W.localStorage.getItem('cm_ws_trial_end') }, srv: () => NET });
  Q.C.t = P.C.t + 5000;
  Q.W.enforcePaywall();
  await ticks();
  assert.strictEqual(Q.locked(), true, 'сүлжээний алдаа + дууссан тэмдэглэл → түгжээтэй');
  // тэмдэглэлгүй хуучин данс — урьдын адил fail-open
  const R = storePage({ srv: () => NET });
  R.W.enforcePaywall();
  await ticks();
  assert.strictEqual(R.locked(), false, 'хуучин fail-open хэвээр');
  // өөр данс (имэйл зөрсөн) — тэмдэглэл нөлөөлөхгүй
  const other = 'h.' + Buffer.from(JSON.stringify({ email: 'other@x.mn', ws: true })).toString('base64url') + '.s';
  const S = storePage({ ls: { cm_ws_token: other, cm_ws_trial_end: P.W.localStorage.getItem('cm_ws_trial_end') }, srv: () => NET });
  S.W.enforcePaywall();
  await ticks();
  assert.strictEqual(S.locked(), false);
  // энэ төхөөрөмж/дугаарт өмнө нь ашиглагдсан
  for (const [den, re] of [['dev', /Энэ төхөөрөмж дээр үнэгүй туршилт өмнө нь ашиглагдсан/], ['phone', /Энэ утасны дугаарт үнэгүй туршилт өмнө нь ашиглагдсан/]]) {
    const D = storePage({ srv: () => rEnded(D.C, { denied: den, seconds: 0 }) });
    D.W.enforcePaywall();
    await ticks();
    assert.match(D.$('wsTrialEnd').textContent, re);
  }
});

test('ws-store: үнэгүй (WS_FREE) хуудас — тоолуур харагдана; 0:00 үед бүдгэрүүлэхгүй, «Хаах»-тай цонх автоматаар', async () => {
  const P = storePage({ slug: 'grafik-ax2.html' });
  P.W.enforcePaywall();
  assert.strictEqual(P.locked(), false, 'үнэгүй хуудас эхэндээ түгжихгүй');
  await ticks();
  assert.strictEqual(P.$('cmTrialT').textContent, '5:00');
  P.srv = () => rEnded(P.C);
  P.C.advance(300100);
  assert.strictEqual(P.locked(), true, 'төлбөрийн цонх автоматаар');
  assert.ok(P.$('wsTrialEnd'));
  assert.strictEqual(P.sheet().style.filter, undefined, 'бүдгэрүүлэхгүй');
  assert.notStrictEqual(P.sheet().inert, true);
  assert.strictEqual(P.doc.documentElement.classList.contains('cm-ws-locked'), false, 'хэвлэж болно');
  assert.match(P.$('wsBack').textContent, /Хаах/);
  await ticks();
  P.$('wsBack').click();
  assert.strictEqual(P.locked(), false, 'хаагдана, агуулга үнэгүй хэвээр');
  // токенгүй зочин — үнэгүй хуудсанд сервер дуудахгүй (урьдын адил)
  const G = storePage({ slug: 'grafik-ax2.html', ls: { cm_ws_token: '' } });
  G.W.localStorage.removeItem('cm_ws_token');
  G.W.enforcePaywall();
  await ticks();
  assert.strictEqual(G.log.length, 0);
});

test('ws-store: төлсөн эрхтэй хэрэглэгч — тоолуургүй (хуучин шигээ); туршилтын дундуур төлбөл тоолуур арилна', async () => {
  const P = await startStore({ srv: null });
  P.srv = () => rPaid(P.C);
  const Q = storePage({ srv: () => rPaid(Q.C) });
  Q.W.enforcePaywall();
  await ticks();
  assert.strictEqual(Q.locked(), false);
  assert.strictEqual(Q.$('cmTrialBar'), null);
  // туршилтын дундуур худалдан авсан (дахин шалгалт → all)
  P.W.checkAccess();
  await ticks();
  assert.strictEqual(P.$('cmTrialBar'), null, 'төлсөн → strip арилна');
  P.C.advance(400000);
  assert.strictEqual(P.locked(), false, 'хожим түгжихгүй');
});

// ───────── worksheets.html (Дасгалын төвийн нүүр) ─────────
const PRELUDE = [
  'var ADMIN_TOKEN=null; function isAdmin(){return false;}',
  'function toast(m){window.toasts.push(String(m));}',
  'function openLogin(auto){window.logins.push(auto===true?"auto":"manual");}',
  'function ensurePin(){} function openRefModal(){}',
  // openBuy-ийн stub: дуудлагыг бүртгээд #wsBuyM үүсгэнэ (бодит openBuy шиг давхар нээгдэхгүй)
  'function openBuy(o){window.buys.push(JSON.parse(JSON.stringify(o||{}))); if(document.getElementById("wsBuyM"))return; var d=document.createElement("div"); d.id="wsBuyM"; d.innerHTML="<div><h3>Ажлын хуудсын эрх авах</h3></div>"; document.body.appendChild(d);}',
].join('\n');
function catPage(o) {
  o = o || {};
  const C = vclock(o.skew);
  const doc = makeDoc();
  doc.body.innerHTML = '<div id="annBar"></div><div class="wrap"><div id="acctArea"></div><div class="controls"></div></div><div id="toast"></div>';
  const P = { C: C, doc: doc, log: [], srv: o.srv || (() => rTrial(C, 300000)) };
  const W = {
    document: doc, localStorage: storage(o.ls === undefined ? { cm_ws_token: TOK, cm_last_user: E } : o.ls), location: { origin: 'https://cyber-math.com', pathname: '/worksheets', search: '' },
    navigator: { userAgent: 'Mozilla/5.0', language: 'mn-MN' }, console: console, URL: URL,
    Date: mkDate(C), performance: { now: () => C.perf() },
    setTimeout: C.setTimeout, clearTimeout: C.clear, setInterval: C.setInterval, clearInterval: C.clear,
    _ls: {}, addEventListener(t, f) { (W._ls[t] = W._ls[t] || []).push(f); }, removeEventListener() {},
    toasts: [], logins: [], buys: [],
  };
  W.window = W;
  W.fetch = async function (url, opts) {
    const u = new URL(String(url), 'https://cyber-math.com');
    const body = JSON.parse((opts && opts.body) || '{}');
    const ent = { action: u.searchParams.get('action'), body: body, headers: (opts && opts.headers) || {} };
    P.log.push(ent);
    await new Promise((r) => setImmediate(r));
    const r = P.srv(body);
    if (r instanceof Error) throw r;
    return { status: 200, ok: true, json: async () => JSON.parse(JSON.stringify(r)) };
  };
  vm.createContext(W);
  vm.runInContext(PRELUDE + '\n' + WSH_ESC + '\n' + AUTH_SRC, W, { filename: 'worksheets.html#auth+trial' });
  P.W = W; P.$ = (id) => doc.getElementById(id);
  P.fireDoc = (t) => (doc.ls[t] || []).forEach((f) => f({}));
  P.acct = () => P.$('acctArea').innerHTML;
  P.ws = () => P.log.filter((x) => x.action === 'wsstatus').length;
  return P;
}

test('worksheets.html: verifyUser (trial) → strip «Үнэгүй туршилт · 5:00» → 4:59…; 0:00 → худалдан авах цонх НЭГ удаа, CM_USER=null', async () => {
  const P = catPage();
  P.W.verifyUser();
  await ticks();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.W.CM_USER)), { email: E }, 'туршилтын үед ажлын хуудасны эрхтэй');
  assert.match(P.acct(), /Нэвтэрсэн/);
  assert.ok(P.$('cmTrialBar'));
  assert.match(P.$('cmTrialBar').textContent, /^Үнэгүй туршилт·5:00$/);
  assert.strictEqual(P.doc.body.firstChild.id, 'cmTrialSpacer');
  assert.ok(P.doc.documentElement.classList.contains('cm-trial'));
  const css = P.$('cmTrialCss').textContent;
  assert.match(css, /#cmTrialBar\{position:fixed;top:0;left:0;right:0;z-index:190;/, 'гүйлгэхэд алга болохгүй, модалуудаас (200+) доор');
  assert.match(css, /html\.cm-trial \.controls\{top:calc\(36px/, 'sticky хайлтын мөр strip-ийн доор');
  assert.match(css, /white-space:nowrap;overflow:hidden/, '360px-д мөр шилжихгүй');
  P.C.advance(1000);
  assert.strictEqual(P.$('cmTrialT').textContent, '4:59');
  P.C.advance(240000);
  assert.strictEqual(P.$('cmTrialT').textContent, '0:59');
  assert.ok(P.$('cmTrialBar').classList.contains('low'));
  P.srv = () => rEnded(P.C);
  P.C.advance(58990);
  assert.deepStrictEqual(P.W.buys, [], 'deadline-аас өмнө цонх гарахгүй');
  P.C.advance(40);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.W.buys)), [{ trialEnd: true }], 'ямар ч товч дарахгүйгээр нэг удаа');
  assert.ok(P.$('wsBuyM'));
  assert.strictEqual(P.W.CM_USER, null);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.W.WS_ACCT)), { email: E });
  assert.match(P.acct(), /Нэвтэрсэн/, 'толгойд нэвтэрсэн хэвээр');
  assert.ok(P.$('cmTrialBar').classList.contains('end'));
  assert.match(P.$('cmTrialBar').textContent, /Үнэгүй хугацаа дууслаа/);
  assert.ok(P.$('cmTrialBuy'));
  await ticks();
  assert.strictEqual(P.ws(), 2, 'сервер дахин баталгаажуулна');
  assert.ok(P.$('wsBuyM'), 'дууссан хариу → цонх хэвээр');
  assert.strictEqual(P.W.CM_USER, null);
  P.C.advance(60000);
  assert.strictEqual(P.W.buys.length, 1, 'давхар нээгдэхгүй');
  // цонхыг хаагаад «Эрх авах» дарвал дахин нээнэ
  P.$('wsBuyM').remove();
  P.$('cmTrialBuy').click();
  assert.strictEqual(P.W.buys.length, 2);
  // хожуу ирсэн «trial» хариу (сервер хоцорсон) эрх болгохгүй
  P.srv = () => rTrial(P.C, 3000);
  P.W.verifyUser();
  await ticks();
  assert.strictEqual(P.W.CM_USER, null);
  assert.ok(P.$('cmTrialBar').classList.contains('end'));
  // төлсөн → strip арилж CM_USER
  P.srv = () => rPaid(P.C);
  P.W.verifyUser();
  await ticks();
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.W.CM_USER)), { email: E });
  assert.strictEqual(P.$('cmTrialBar'), null);
  assert.strictEqual(P.$('cmTrialSpacer'), null);
  assert.strictEqual(P.doc.documentElement.classList.contains('cm-trial'), false);
});

test('worksheets.html: verifyUser / wsTrialSync → wsstatus-д x-device-id (cm_device) + x-device-fp — нэвтрэх цонх нээгээгүй ч (хуучин токен)', async () => {
  const P = catPage({ ls: { cm_ws_token: TOK, cm_last_user: E, cm_device: 'abcdef0123456789' } });
  P.W.screen = { width: 1920, height: 1080, colorDepth: 24 };
  // openLogin-ийн wsDev (window.cmWsDevice) хуудас ачаалахад хараахан байхгүй — verifyUser түүнээс хамаарахгүй
  assert.strictEqual(P.W.cmWsDevice, undefined);
  P.W.verifyUser();
  await ticks();
  P.W.wsTrialSync(false);
  await ticks();
  const ws = P.log.filter((x) => x.action === 'wsstatus');
  assert.strictEqual(ws.length, 2);
  for (const x of ws) {
    assert.strictEqual(x.headers['Content-Type'], 'application/json');
    assert.strictEqual(x.headers['x-device-id'], 'abcdef0123456789', 'ws-store.js / games-host.js-тэй ижил cm_device');
    assert.match(x.headers['x-device-fp'], /^[0-9a-f]{8}$/);
    assert.strictEqual(x.body.wstoken, TOK);
  }
  // cm_device байхгүй (анх) → ws-store.js-тэй ижил 32 hex үүсгэж хадгална; дараагийн дуудлагад ижил
  const Q = catPage();
  Q.W.verifyUser();
  await ticks();
  const d1 = Q.log[0].headers['x-device-id'];
  assert.match(d1, /^[0-9a-f]{32}$/);
  assert.strictEqual(Q.W.localStorage.getItem('cm_device'), d1);
  Q.W.verifyUser();
  await ticks();
  assert.strictEqual(Q.log[1].headers['x-device-id'], d1);
  // Каталогийн туслах = openLogin-ийн wsDev/wsFp (cm_device үүсгэх, хурууны хээ) — ижил алгоритм
  const norm = (s) => s.replace(/\s+/g, '').replace(/^function\w+\(\)/, 'F');
  const body = (a, b) => norm(WSH.slice(WSH.indexOf(a), WSH.indexOf(b, WSH.indexOf(a))));
  assert.strictEqual(body('function cmDevId(){', 'function cmDevFp(){'), body('  function wsDev(){', 'window.cmWsDevice=wsDev;'));
  assert.strictEqual(body('function cmDevFp(){', 'function wsStatusHdr('), body('  function wsFp(){', 'window.cmWsFp=wsFp;'));
});

test('worksheets.html: дуусах үеийн шалгалт — сүлжээний алдаа цонхыг ХААХГҮЙ; төлсөн бол цонх хаагдаж strip арилна', async () => {
  const P = catPage();
  P.W.verifyUser();
  await ticks();
  P.srv = () => NET;
  P.C.advance(300100);
  await ticks();
  assert.ok(P.$('wsBuyM'), 'сүлжээний алдаа (verifyUser catch CM_USER сэргээдэг) → цонх хэвээр');
  assert.ok(P.$('cmTrialBar').classList.contains('end'));

  const Q = catPage();
  Q.W.verifyUser();
  await ticks();
  Q.srv = () => rPaid(Q.C);
  Q.C.advance(300100);
  assert.ok(Q.$('wsBuyM'));
  await ticks();
  assert.strictEqual(Q.$('wsBuyM'), null, 'өөр газар төлсөн → цонх хаагдана');
  assert.strictEqual(Q.$('cmTrialBar'), null);
});

test('worksheets.html: клиентийн цаг зөрсөн, нуугдсан таб → серверийн цагаар; wsLogout → strip арилна; fresh бүртгэлд toast', async () => {
  const P = catPage({ skew: -2 * 3600e3 });
  P.W.verifyUser();
  await ticks();
  assert.strictEqual(P.$('cmTrialT').textContent, '5:00');
  P.srv = () => rEnded(P.C);
  P.C.jump(300500);
  assert.strictEqual(P.W.buys.length, 0);
  P.fireDoc('visibilitychange');
  assert.strictEqual(P.W.buys.length, 1, 'буцаж ирэхэд шууд');

  const L = catPage();
  L.W.verifyUser();
  await ticks();
  L.W.wsLogout();
  assert.strictEqual(L.$('cmTrialBar'), null);
  assert.strictEqual(L.$('cmTrialSpacer'), null);
  L.C.advance(400000);
  assert.strictEqual(L.W.buys.length, 0, 'гарсны дараа цонх гарахгүй');

  const R = catPage();
  R.W.wsTrialSync(true);
  await ticks();
  assert.ok(R.W.toasts.indexOf('5 минут бүх ажлын хуудас үнэгүй — эхэллээ') >= 0, JSON.stringify(R.W.toasts));
  assert.strictEqual(R.$('cmTrialT').textContent, '5:00');
  assert.strictEqual(R.W.CM_USER, null, 'wsTrialSync CM_USER-т хүрэхгүй');
  const D = catPage({ srv: () => rEnded(D.C, { denied: 'dev', seconds: 0 }) });
  D.W.wsTrialSync(true);
  await ticks();
  assert.ok(D.W.toasts.some((t) => /үнэгүй туршилт аль хэдийн ашиглагдсан/.test(t)));
  assert.strictEqual(D.$('cmTrialBar'), null);
  assert.strictEqual(D.W.buys.length, 0, 'татгалзсан бол цонх автоматаар гарахгүй');
  // нэвтрээгүй → strip-гүй, сервер дуудахгүй
  const N = catPage({ ls: {} });
  N.W.verifyUser();
  await ticks();
  assert.strictEqual(N.ws(), 0);
  assert.strictEqual(N.$('cmTrialBar'), null);
});

test('ws-store: шалгалтын «Олон хувилбар» цонх 0:00 үед нээлттэй → устгагдана (түгжээний дээр үлдэхгүй), бэлдсэн багц арилна; түгжээ хамгийн дээр', async () => {
  // Хуудасны бодит openVariantModal (21 шалгалтын хуудсанд ижил) — genVariants-ийг бүртгэгчээр сольсон
  const pageSrc = fs.readFileSync(path.join(WT, 'shalgalt-material-1-9.html'), 'utf8');
  const OPEN_VM = between(pageSrc, 'function openVariantModal(){', 'genVariants(n);};}');
  const P = await startStore({ slug: 'shalgalt-material-1-9.html' });
  vm.runInContext(OPEN_VM + '\nvar GEN=[];function genVariants(n){GEN.push(n);}', P.W, { filename: 'shalgalt-material-1-9.html#openVariantModal' });
  P.C.advance(299000);                                             // 0:01
  assert.strictEqual(P.$('cmTrialT').textContent, '0:01');
  P.W.openVariantModal();
  assert.ok(P.$('cm-vmodal'), '«Олон хувилбар» нээгдэв');
  assert.match(P.$('cm-vmodal').style.cssText, /z-index:10000/);
  const vb = P.doc.createElement('div'); vb.id = 'cm-vbatch'; P.doc.body.appendChild(vb);   // хэвлэхээр бэлдсэн багц
  P.srv = () => rEnded(P.C);
  P.C.advance(1100);                                               // 0:00
  assert.strictEqual(P.locked(), true);
  // (DOM объектыг assert-д шууд өгөхгүй — алдааны мессеж үүсгэх нь цикл графаас болж гацна)
  assert.strictEqual(P.$('cm-vmodal') === null, true, 'цонх устгагдана — «Гаргах» (genVariants → print) дарагдахгүй');
  assert.strictEqual(P.$('cm-vbatch') === null, true, 'бэлдсэн хувилбар/хариун түлхүүр арилна');
  assert.strictEqual(P.W.GEN.length, 0);
  assert.match(P.$('wsLock').style.cssText, /z-index:2147483000;/, 'түгжээ хуудасны цонхнуудаас (10000) дээр');
  assert.ok(P.doc.documentElement.classList.contains('cm-ws-locked'));
  assert.match(P.$('cm-lock-css').textContent, /^@media print\{html\.cm-ws-locked body>\*:not\(#cm-lk0\):not\(#cm-lk1\):not\(#cm-lk2\)\{display:none!important\}\}$/);
  // Түгжээ аль хэдийн байх үед дахин түгжих (жишээ нь хожуу ирсэн хариу) — шинээр гарсан цонхыг ч хаана
  P.W.openVariantModal();
  assert.ok(P.$('cm-vmodal'));
  P.W.showLock({ why: 'trial' });
  assert.strictEqual(P.$('cm-vmodal') === null, true, 'дахин түгжихэд ч хаагдана');
  assert.strictEqual(P.doc.querySelectorAll('#wsLock').length, 1);
  // Энгийн (туршилтгүй) түгжээ ч мөн адил хамгийн дээд давхарга
  const Q = storePage({ slug: 'shalgalt-material-1-9.html', srv: () => ({ ok: true, enabled: true, active: false, scope: null, grades: [] }) });
  Q.W.enforcePaywall();
  assert.match(Q.$('wsLock').style.cssText, /z-index:2147483000;/);
});

test('worksheets.html: 0:00 үед PIN үүсгэх (#wsPin 210) / бусад цонх нээлттэй байсан ч төлбөрийн цонх ХАМГИЙН ДЭЭР гарна', async () => {
  const P = catPage();
  P.W.verifyUser();
  await ticks();
  // Бүртгүүлмэгц done() → ensurePin() → openPinCreate (бодит z-index 210)
  const pinZ = Number(/o\.id='wsPin';\s*o\.style\.cssText='position:fixed;inset:0;z-index:(\d+)/.exec(WSH)[1]);
  assert.strictEqual(pinZ, 210);
  const pin = P.doc.createElement('div'); pin.id = 'wsPin'; pin.style.zIndex = String(pinZ); P.doc.body.appendChild(pin);
  P.srv = () => rEnded(P.C);
  P.C.advance(300100);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(P.W.buys)), [{ trialEnd: true }]);
  const buyZ = Number(P.$('wsBuyM').style.zIndex);
  assert.strictEqual(buyZ, 260);
  assert.ok(buyZ > pinZ, 'PIN цонхны ДЭЭР');
  // worksheets.html-ийн бусад бүх давхарга (PIN/урилга/мэдээ 210, тоглоомын .gp-ov 240, нэвтрэх 200…) доор
  const zs = (WSH.match(/z-index:(\d+)/g) || []).map((x) => Number(x.slice(8)));
  assert.ok(zs.length > 10);
  assert.ok(zs.every((z) => z < buyZ), 'хамгийн өндөр: ' + Math.max.apply(null, zs));
  // Бодит openBuy: trialEnd үед ижил дээд z-index (тоолуурын «Эрх авах» товчноос нээсэн ч)
  assert.match(WSH, /o\.id='wsBuyM';\s*o\.style\.cssText='position:fixed;inset:0;z-index:'\+\(opts\.trialEnd\?WS_TRIAL_BUY_Z:200\)\+';/);
  // Аль хэдийн нээлттэй байсан (энгийн) худалдан авах цонх дээр баннер нэмэгдэж, мөн дээш гарна
  const Q = catPage();
  Q.W.verifyUser();
  await ticks();
  Q.W.openBuy({});
  assert.strictEqual(Q.$('wsBuyM').style.zIndex, undefined);
  Q.srv = () => rEnded(Q.C);
  Q.C.advance(300100);
  assert.strictEqual(Q.W.buys.length, 1, 'давхар нээхгүй');
  assert.ok(Q.$('buTrialEnd'), 'баннер');
  assert.strictEqual(Q.$('wsBuyM').style.zIndex, '260');
});
