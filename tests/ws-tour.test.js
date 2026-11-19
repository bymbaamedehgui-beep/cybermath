// «Эхлэх заавар» (ws-tour.js): Дасгалын төв (hub) ба ажлын хуудас (ws) — алхмууд, бичлэгүүд, холболт
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'ws-tour.js'), 'utf8');

function load() {
  // DOM-гүй орчинд: зөвхөн CMTour объект ба алхмын тодорхойлолт (boot DOMContentLoaded хүлээнэ)
  const listeners = {};
  const doc = { readyState: 'loading', addEventListener(t, f) { listeners[t] = f; }, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] };
  const ctx = vm.createContext({ document: doc, window: {}, location: { pathname: '/x.html', search: '' }, localStorage: { getItem: () => null, setItem() {} }, setTimeout() {}, setInterval() {}, clearInterval() {}, getComputedStyle: () => ({}), matchMedia: () => ({ matches: false }) });
  vm.runInContext('var window=this;', ctx);
  vm.runInContext(src, ctx, { filename: 'ws-tour.js' });
  return ctx.CMTour;
}

test('ws-tour.js: синтакс, CMTour API, hub ба ws иж бүрдэл', () => {
  new Function(src);
  const T = load();
  assert.ok(T && typeof T.auto === 'function' && typeof T.start === 'function' && typeof T.mount === 'function');
  assert.deepStrictEqual(Object.keys(T.sets).sort(), ['hub', 'ws']);
  // vm-ийн өөр realm-ийн массив — JSON-оор энгийн болгоно
  const hub = JSON.parse(JSON.stringify(T.sets.hub.steps.map((s) => s.t))), ws = JSON.parse(JSON.stringify(T.sets.ws.steps.map((s) => s.t)));
  assert.deepStrictEqual(hub, ['Ангиа сонгоно', 'Сэдвээ хайна', 'Ажлын хуудсаа нээнэ', 'Слайд, тоглоом, видео']);
  assert.deepStrictEqual(ws, ['Шинэ бодлого', 'Бодолтын зай', 'Хариу хавсаргах', 'Хэвлэх / PDF', 'Самбар', 'Бодолтын PPT']);
});

test('ws-tour.js: хадгалах («Тэмдэглэх») боломжийг заахгүй (эзэмшигч 2026-11-19)', () => {
  const T = load();
  const all = T.sets.hub.steps.concat(T.sets.ws.steps);
  assert.ok(!all.some((s) => /Тэмдэглэх|Хадгал/.test(s.t + s.x)), 'хадгалах алхам байхгүй');
  assert.doesNotMatch(src, /ws-save/);
});

test('ws-tour.js: алхам бүрийн бичлэг (assets/tour/<v>.mp4 + .jpg) бий, жижиг хэмжээтэй', () => {
  const T = load();
  T.sets.hub.steps.concat(T.sets.ws.steps).forEach((s) => {
    const mp4 = path.join(ROOT, 'assets', 'tour', s.v + '.mp4'), jpg = path.join(ROOT, 'assets', 'tour', s.v + '.jpg');
    assert.ok(fs.existsSync(mp4), s.v + '.mp4');
    assert.ok(fs.existsSync(jpg), s.v + '.jpg');
    assert.ok(fs.statSync(mp4).size < 600 * 1024, s.v + '.mp4 < 600KB');
  });
});

test('ws-tour.js: анх нэг удаа (localStorage), нэвтрэх цонх/түгжээ/QR горимд хүлээнэ, эможи байхгүй', () => {
  assert.match(src, /KEY = 'cm_tour_'/);
  assert.match(src, /#wsLogin, #wsLock, \.e1s-pl/);
  assert.match(src, /\[\?&\]\(qr\|b\|embed\)=/);
  assert.match(src, /'later' && Date\.now\(\) - \(\+st\[2\] \|\| 0\) > 864e5/, '«Дараа үзье» → 1 өдрийн дараа');
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('ws-tour.js auto: нэвтрэх цонх хуудас ачаалсны ДАРАА хоцорч гарсан ч цонх хаагдахад заавар эхэлнэ (live 2026-11-19)', () => {
  // Хуурамч DOM + гар таймер: эхэндээ саадгүй → 600мс-ийн товлол хүрэхэд #wsLogin гарсан → хаагдсаны дараа эхлэх ёстой
  const timers = [];
  const el = (id, extra) => Object.assign({ id: id || '', style: {}, shown: true, children: [], parentNode: null,
    getBoundingClientRect() { return this.shown ? { width: 100, height: 40, top: 200, bottom: 240, left: 10, right: 110 } : { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }; },
    addEventListener() {}, removeEventListener() {}, focus() {}, remove() { this.removed = true; }, insertBefore(n) { n.parentNode = this; return n; },
    appendChild(n) { n.parentNode = this; this.children.push(n); return n; }, querySelector: () => null, querySelectorAll: () => [] }, extra || {});
  const login = el('wsLogin'); login.shown = false;
  const pick = el('pick'), body = el('body'), head = el('head'), fbWrap = el('nav'), fb = el('fbBtn'); fb.parentNode = fbWrap;
  const byId = { wsLogin: login, fbBtn: fb };
  const doc = { readyState: 'loading', body: body, head: head, addEventListener() {},
    getElementById: (id) => (id === 'cmt' ? body.children.find((c) => c.id === 'cmt' && !c.removed) || null : byId[id] || null),
    createElement: () => el(''),
    querySelector: (s) => (/\.wsb-main|\.wsb-pick/.test(s) ? pick : null),
    querySelectorAll: (s) => [/#wsLogin/.test(s) ? login : null, /\.wsb-gsel|\.wsb-pick/.test(s) ? pick : null].filter(Boolean) };
  const ctx = vm.createContext({ document: doc, window: { addEventListener() {}, removeEventListener() {} }, location: { pathname: '/worksheets', search: '' },
    localStorage: { getItem: () => null, setItem() {} }, setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; },
    setInterval: () => 1, clearInterval() {}, getComputedStyle: (e) => ({ display: e.shown === false ? 'none' : 'block', visibility: 'visible', opacity: '1' }),
    matchMedia: () => ({ matches: false }), innerWidth: 1280, innerHeight: 860 });
  vm.runInContext('var window=this; this.addEventListener=function(){}; this.removeEventListener=function(){};', ctx);
  vm.runInContext(src, ctx, { filename: 'ws-tour.js' });
  ctx.self = ctx; ctx.top = ctx;
  const run = () => { const t = timers.shift(); if (t) t.f(); return !!t; };
  const started = () => !!doc.getElementById('cmt');
  ctx.CMTour.auto('hub');
  assert.strictEqual(timers.length, 1, 'саадгүй → 600мс-ийн дараа эхлүүлэхээр товлосон');
  login.shown = true;                                    // API-ийн хариугаар нэвтрэх цонх хоцорч гарав
  run();
  assert.strictEqual(started(), false, 'нэвтрэх цонх дээр гарахгүй');
  assert.ok(timers.length >= 1, 'хүлээлтээ үргэлжлүүлнэ (өмнө нь энд зогсчихдог байсан)');
  for (let i = 0; i < 5; i++) run();
  assert.strictEqual(started(), false);
  login.shown = false;                                   // «Зочноор үзэх» / нэвтэрсэн
  for (let i = 0; i < 6 && !started(); i++) run();
  assert.strictEqual(started(), true, 'цонх хаагдсаны дараа заавар эхэлнэ');
});

test('Холболт: worksheets.html ачаална, ws-store.js ажлын хуудсанд ачаална, vercel static', () => {
  assert.match(fs.readFileSync(path.join(ROOT, 'worksheets.html'), 'utf8'), /<script src="\/ws-tour\.js\?v=1"><\/script>/);
  const store = fs.readFileSync(path.join(ROOT, 'ws-store.js'), 'utf8');
  assert.match(store, /function tourInit\(\)\{\s*if\(IS_QR\|\|window\.CMTour\)return;/);
  assert.match(store, /s\.src='\/ws-tour\.js\?v=1'/);
  // wscApply хамгийн сүүлд хэвээр (ws-counts.test.js) — заавар түүний өмнө
  assert.match(store, /try\{tourInit\(\);\}catch\(e\)\{\} addWorkResize\(\); try\{wscApply\(\);\}catch\(e\)\{\} \}/);
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  assert.ok(v.builds.some((b) => b.src === 'ws-tour.js' && b.use === '@vercel/static'));
  assert.ok(v.builds.some((b) => b.src === 'assets/**'));
});
