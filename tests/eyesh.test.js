// ЭЕШ шалгагч (eyeshcheck.com): api/_eyesh.js (шалгалтын хөрвүүлэлт, нэг удаагийн код), api/eyesh.js (status/handoff/redeem),
// api/qpay.js plan='eyesh' (create/check/callback/ws_reconcile), eyesh-link.js-ийн эх хариу ↔ ЭЕШ хуудасны генератор.
// Ажиллуулах: node --test tests/eyesh.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const qpay = require(path.join(F.API, 'qpay.js'));
const eyesh = require(path.join(F.API, 'eyesh.js'));
const EY = require(path.join(F.API, '_eyesh.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, SEC) };
const Q = (action, body, o) => F.call(qpay, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const E = (action, body, o) => F.call(eyesh, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / F.DAY;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, (msg || '') + ' ' + a + ' ≈ ' + b);
const TOPICS = ['Алгебр', 'Геометр', 'Тригонометр', 'Статистик', 'Тооны онол', 'Анализ', 'Функц', 'Бусад'];   // eyeshcheck «Математик»

// ── eyesh-link.js-ийг хуурамч хөтөчид ажиллуулж (ЭЕШ хуудасны генератортой хамт) EYESH-ийг авна ──
function pageScript(file) {
  const h = fs.readFileSync(path.join(F.WT, file), 'utf8').replace(/\r\n/g, '\n');
  const main = /<script>\n([\s\S]*?)<\/script>/.exec(h)[1];
  return main.slice(0, main.indexOf('function build('));
}
function linkCtx(file, shared) {
  const store = shared || new Map();   // shared — нөгөө хэсгийн хуудастай нэг localStorage (тусдаа хуудастай он)
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {} });
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    location: { pathname: '/' + file, search: '' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { readyState: 'complete', getElementById: () => null, createElement: el, head: el(), documentElement: el(), querySelector: () => null, addEventListener() {} },
    setTimeout: () => 0, clearInterval() {}, setInterval: () => 0,
  });
  vm.runInContext('var window=this,self=this;', ctx);
  vm.runInContext(pageScript(file), ctx, { filename: file });
  vm.runInContext(fs.readFileSync(path.join(F.WT, 'eyesh-link.js'), 'utf8'), ctx, { filename: 'eyesh-link.js' });
  return { ctx: ctx, store: store };
}
const plain = (o) => JSON.parse(JSON.stringify(o));   // vm-ийн объектыг энэ контекстийн объект болгоно

beforeEach(() => F.reset());

test('eyesh-link.js ORIG: 2024 эх 1-р хэсгийн түлхүүр = e24_generate(orig) (нэгдсэн eesh-2024)', () => {
  const { ctx } = linkCtx('eesh-2024.html');
  assert.strictEqual(ctx.EYESH.both, true);
  const st = ctx.e24_generate('orig', ctx);
  assert.strictEqual(ctx.e24_letters(st), ctx.EYESH.ORIG[2024][1].key);
  ctx.__E24 = st;
  const cur = plain(ctx.EYESH.exportCur(1));
  assert.deepStrictEqual(cur, { v: 'orig', g: '', key: 'EDCAADCBDEAACDEAACBBDEDAACDEAACBDEAA' });
});

test('eyesh-link.js ORIG: 2024 ба 2023 эх 2-р хэсэг (нүд + дэд асуултын оноо) = генератор; эх нь a–h-д багтана', () => {
  [['eesh-2024.html', 'e24n_generate', '__E24N', 2024], ['eesh-2023.html', 'e23n_generate', '__E23N', 2023]].forEach(([file, gen, glob, year]) => {
    const { ctx } = linkCtx(file);
    const st = ctx[gen]('orig', ctx);
    ctx[glob] = st;
    const cur = plain(ctx.EYESH.exportCur(2));
    assert.deepStrictEqual(cur, plain(ctx.EYESH.ORIG[year][2]), file);
    assert.strictEqual(ctx.EYESH.fits(ctx.EYESH.ORIG[year][2]), true, file);
    const n = EY.normExam({ year: year, p1: { v: 1234, g: 'xx', key: 'A'.repeat(36) }, p2: cur });
    assert.strictEqual(n.ok, true, file + ' ' + n.error);
  });
});

test('2-р хэсгийн шинэ хувилбар бүр ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтана (2023, 2024) → eyeshcheck-д дүгнэгдэнэ', () => {
  [['eesh-2024.html', 'e24n_generate', '__E24N', 2024], ['eesh-2023.html', 'e23n_generate', '__E23N', 2023]].forEach(([file, gen, glob, year]) => {
    const { ctx } = linkCtx(file);
    for (let seed = 1000; seed <= 9999; seed += 37) {
      ctx[glob] = ctx[gen](seed, ctx);
      const cur = plain(ctx.EYESH.exportCur(2));
      assert.strictEqual(ctx.EYESH.fits(cur), true, file + ' ' + seed);
      const n = EY.normExam({ year: year, p1: { v: seed, g: 'xx', key: 'A'.repeat(36) }, p2: cur });
      assert.strictEqual(n.ok, true, file + ' ' + seed + ' ' + n.error);
      Object.values(n.exam.sec2Config).forEach((c) => near('abcdefgh'.split('').reduce((a, r) => a + (c[r].ans !== '' ? c[r].score : 0), 0), 7, file + ' ' + seed));
    }
  });
});

test('eyesh-link.js: 2022 — хоёр хэсэг НЭГ хуудсанд (eesh-2022): эх түлхүүр ба нүд, шинэ хувилбар a–h-д багтана → normExam', () => {
  const { ctx } = linkCtx('eesh-2022.html');
  assert.strictEqual(ctx.EYESH.both, true);
  ctx.__E22 = ctx.e22_generate('orig', ctx); ctx.__E22N = ctx.e22n_generate('orig', ctx);
  const c1 = plain(ctx.EYESH.exportCur(1)), c2 = plain(ctx.EYESH.exportCur(2));
  assert.deepStrictEqual(c1, { v: 'orig', g: '', key: 'ADCBEDCDEACBDEACBDEACDECBDACBDECABDC' });
  assert.deepStrictEqual(c2.items.map((it) => it.ans), [
    { a: '1', b: '4', c: '4', d: '8', e: '3', f: '3', g: '1', h: '5' },
    { a: '9', bc: '18', d: '6', e: '3', f: '2', gh: '24' },
    { ab: '30', c: '2', de: '90', fg: '20', h: '3' },
    { a: '3', b: '2', c: '9', d: '4', e: '4', f: '1', g: '9', h: '4' }]);
  assert.strictEqual(ctx.EYESH.fits(c2), true);
  const src = plain(ctx.EYESH.sources());
  assert.deepStrictEqual(src.s1.map((x) => x.id), ['cur']);
  assert.deepStrictEqual(src.s2.map((x) => x.id), ['cur', 'none']);
  const n = EY.normExam({ year: 2022, p1: c1, p2: c2 });
  assert.strictEqual(n.ok, true, n.error);
  assert.strictEqual(n.exam.title, 'ЭЕШ 2022 · Сонгох Эх · Нөхөх Эх');
  assert.strictEqual(n.exam.topics.length, 36);
  n.exam.topics.forEach((t) => assert.ok(TOPICS.indexOf(t) >= 0, t));
  Object.values(n.exam.sec2Config).forEach((c) => near('abcdefgh'.split('').reduce((a, r) => a + (c[r].ans !== '' ? c[r].score : 0), 0), 7));
  for (let seed = 1000; seed <= 9999; seed += 397) {
    ctx.__E22 = ctx.e22_generate(seed, ctx); ctx.__E22N = ctx.e22n_generate(seed, ctx);
    const a = plain(ctx.EYESH.exportCur(1)), b = plain(ctx.EYESH.exportCur(2));
    assert.match(a.key, /^[A-E]{36}$/, 'seed ' + seed);
    assert.strictEqual(ctx.EYESH.fits(b), true, 'seed ' + seed);
    const r = EY.normExam({ year: 2022, p1: a, p2: b });
    assert.strictEqual(r.ok, true, seed + ' ' + r.error);
  }
});

test('eyesh-link.js: 2025 — хоёр хэсэг НЭГ хуудсанд (eesh-2025): эх түлхүүр ба нүд, шинэ хувилбар a–h-д багтана → normExam', () => {
  const { ctx } = linkCtx('eesh-2025.html');
  assert.strictEqual(ctx.EYESH.both, true);
  ctx.__E25 = ctx.e25_generate('orig', ctx); ctx.__E25N = ctx.e25n_generate('orig', ctx);
  const c1 = plain(ctx.EYESH.exportCur(1)), c2 = plain(ctx.EYESH.exportCur(2));
  assert.deepStrictEqual(c1, { v: 'orig', g: '', key: 'BADBBECADBADAEBDADADEDAEABCDCADEDACD' });
  assert.deepStrictEqual(c2.items.map((it) => it.ans), [
    { a: '5', b: '4', cd: '42', ef: '50', gh: '50' },
    { a: '8', b: '5', cd: '15', ef: '12', g: '1' },
    { a: '7', b: '2', c: '2', d: '7', e: '4', f: '2', g: '7', h: '6' },
    { a: '9', bcd: '675', efgh: '1850' }]);
  assert.strictEqual(ctx.EYESH.fits(c2), true);
  const n = EY.normExam({ year: 2025, p1: c1, p2: c2 });
  assert.strictEqual(n.ok, true, n.error);
  assert.strictEqual(n.exam.title, 'ЭЕШ 2025 · Сонгох Эх · Нөхөх Эх');
  assert.strictEqual(n.exam.topics.length, 36);
  n.exam.topics.forEach((t) => assert.ok(TOPICS.indexOf(t) >= 0, t));
  Object.values(n.exam.sec2Config).forEach((c) => near('abcdefgh'.split('').reduce((a, r) => a + (c[r].ans !== '' ? c[r].score : 0), 0), 7));
  for (let seed = 1000; seed <= 9999; seed += 397) {
    ctx.__E25 = ctx.e25_generate(seed, ctx); ctx.__E25N = ctx.e25n_generate(seed, ctx);
    const a = plain(ctx.EYESH.exportCur(1)), b = plain(ctx.EYESH.exportCur(2));
    assert.match(a.key, /^[A-E]{36}$/, 'seed ' + seed);
    assert.strictEqual(ctx.EYESH.fits(b), true, 'seed ' + seed);
    const r = EY.normExam({ year: 2025, p1: a, p2: b });
    assert.strictEqual(r.ok, true, seed + ' ' + r.error);
  }
  const cat = fs.readFileSync(path.join(F.WT, 'catalog.js'), 'utf8');
  assert.ok(cat.indexOf("['eesh-2025.html','ЭЕШ 2025 — Сонгох ба нөхөх даалгавар']") >= 0 && cat.indexOf("'eesh-2025.html'") < cat.indexOf("'eesh-2024.html'"), 'каталогт 2025 нь 2024-ийн өмнө');
});

test('eyesh-link.js dseeds: B… хувилбарын үр тогтмол, 1000–9999, давхцалгүй, A нь суурь', () => {
  const { ctx } = linkCtx('eesh-2022.html');
  const d = (b, n) => plain(ctx.EYESH.dseeds(b, n));
  assert.strictEqual(ctx.EYESH.NMAX, 6);
  for (const base of ['orig', 1000, 4821, 9999]) {
    const s = d(base, 6);
    assert.strictEqual(s[0], base);
    assert.deepStrictEqual(d(base, 6), s, 'тогтмол');
    assert.deepStrictEqual(d(base, 3), s.slice(0, 3), 'n-ээс үл хамаарна');
    assert.strictEqual(new Set(s.map(String)).size, 6, 'давхцалгүй ' + s);
    s.slice(1).forEach((x) => assert.ok(Number.isInteger(x) && x >= 1000 && x <= 9999, String(x)));
  }
  assert.notDeepStrictEqual(d(4821, 4), d(4822, 4));
});

test('2022 (нэг хуудас): 4 хувилбартай шалгалт — B…D нь dseeds-ийн үрээр, normExam variants, ref/нэр; 1 хувилбартайд өмнөх шиг', () => {
  const { ctx } = linkCtx('eesh-2022.html');
  ctx.__E22 = ctx.e22_generate(4821, ctx); ctx.__E22N = ctx.e22n_generate(4821, ctx);
  ctx.__E22.g = ctx.__E22N.g = ctx.E22_BUILD;
  ctx.EYESH._set({ n: 1, sel1: 'cur', sel2: 'cur' });
  const one = plain(ctx.EYESH.buildExam());
  assert.deepStrictEqual(Object.keys(one).sort(), ['p1', 'p2', 'title', 'year']);
  const n1 = EY.normExam(one);
  assert.strictEqual(n1.ok, true, n1.error);
  assert.strictEqual(n1.exam.variants, undefined);
  // нэг хувилбартай шалгалтын ref өмнөх томьёогоор (eyeshcheck-д үүссэн шалгалтыг дахин ашиглана)
  const crypto = require('crypto');
  const s2 = ['2.1', '2.2', '2.3', '2.4'].map((s) => 'abcdefgh'.split('').map((r) => n1.exam.sec2Config[s][r].ans).join(''));
  assert.strictEqual(n1.exam.ref, 'eesh2022:' + crypto.createHash('sha1').update(JSON.stringify([2022, n1.exam.sec1Key, s2])).digest('hex').slice(0, 20));

  ctx.EYESH._set({ n: 4 });
  const ex = plain(ctx.EYESH.buildExam());
  assert.strictEqual(ex.variants.length, 3);
  const seeds = plain(ctx.EYESH.dseeds(4821, 4));
  ex.variants.forEach((v, i) => {
    const s = seeds[i + 1], st1 = ctx.e22_generate(s, ctx), st2 = ctx.e22n_generate(s, ctx);
    assert.deepStrictEqual(v.p1, { v: s, g: ctx.E22_BUILD, key: ctx.e22_letters(st1) }, 'B… 1-р хэсэг');
    assert.deepStrictEqual(v.p2.v, s);
    assert.deepStrictEqual(v.p2.items.map((it) => it.ans), plain(st2.items.map((it) => it.ans)), 'B… 2-р хэсэг');
  });
  const n = EY.normExam(ex);
  assert.strictEqual(n.ok, true, n.error);
  assert.deepStrictEqual(Object.keys(n.exam.variants), ['B', 'C', 'D']);
  ['B', 'C', 'D'].forEach((L, i) => {
    const v = n.exam.variants[L];
    assert.deepStrictEqual(v.sec1Key, ex.variants[i].p1.key.split(''));
    assert.deepStrictEqual(v.sec1Scores, n.exam.sec1Scores);
    assert.deepStrictEqual(v.topics, n.exam.topics);
    assert.strictEqual(Object.keys(v.sec2Config).length, 4);
    Object.values(v.sec2Config).forEach((c) => near('abcdefgh'.split('').reduce((a, r) => a + (c[r].ans !== '' ? c[r].score : 0), 0), 7, L));
  });
  assert.notStrictEqual(n.exam.ref, n1.exam.ref);
  assert.match(n.exam.ref, /^eesh2022:[0-9a-f]{20}$/);
  assert.strictEqual(n.exam.title, 'ЭЕШ 2022 · Сонгох №4821·' + ctx.E22_BUILD + ' · Нөхөх №4821·' + ctx.E22_BUILD + ' · 4 хувилбар');
  assert.deepStrictEqual(n.exam.meta.variants.map((m) => m.L), ['B', 'C', 'D']);
  assert.strictEqual(EY.normExam(Object.assign({}, ex, { title: 'Сорил' })).exam.ref, n.exam.ref, 'нэр ref-д нөлөөлөхгүй');
  // 2-р хэсэггүй (Оруулахгүй) бол хувилбаруудад ч 2-р хэсэг үгүй
  ctx.EYESH._set({ sel2: 'none' });
  const ex1 = plain(ctx.EYESH.buildExam());
  assert.strictEqual(ex1.p2, null);
  assert.ok(ex1.variants.every((v) => v.p2 === null));
  const m1 = EY.normExam(ex1);
  assert.strictEqual(m1.ok, true, m1.error);
  assert.strictEqual(m1.exam.useSec2, false);
  assert.ok(Object.values(m1.exam.variants).every((v) => v.sec2Config === undefined));
});

test('2024, 2023 нэгдсэн хуудас: хоёр build тэмдэг (сонгох/нөхөх), хувилбарууд dseeds-ийн үрээр → normExam', () => {
  // 2024: эх хувилбартай; хуучин хуудсуудын build тэмдэг хадгалагдсан (f3 — сонгох, 4d — нөхөх)
  const { ctx } = linkCtx('eesh-2024.html');
  assert.strictEqual(ctx.EYESH.both, true);
  assert.deepStrictEqual([ctx.E24_BUILD, ctx.E24N_BUILD], ['f3', '4d']);
  ctx.__E24 = ctx.e24_generate(4321, ctx); ctx.__E24.g = ctx.E24_BUILD;
  ctx.__E24N = ctx.e24n_generate(4321, ctx); ctx.__E24N.g = ctx.E24N_BUILD;
  ctx.EYESH._set({ n: 3, sel1: 'cur', sel2: 'cur' });
  const ex = plain(ctx.EYESH.buildExam());
  assert.deepStrictEqual([ex.p1.g, ex.p2.g], ['f3', '4d']);
  const s = plain(ctx.EYESH.dseeds(4321, 3));
  ex.variants.forEach((v, i) => {
    assert.deepStrictEqual([v.p1.v, v.p1.g, v.p2.v, v.p2.g], [s[i + 1], 'f3', s[i + 1], '4d']);
    assert.strictEqual(v.p1.key, ctx.e24_letters(ctx.e24_generate(s[i + 1], ctx)));
    assert.deepStrictEqual(v.p2.items.map((it) => it.ans), plain(ctx.e24n_generate(s[i + 1], ctx).items.map((it) => it.ans)));
  });
  const n = EY.normExam(ex);
  assert.strictEqual(n.ok, true, n.error);
  assert.strictEqual(n.exam.title, 'ЭЕШ 2024 · Сонгох №4321·f3 · Нөхөх №4321·4d · 3 хувилбар');
  // 2023: 1-р хэсэг эх горимгүй — хувилбар үрээр (is / hd)
  const c3 = linkCtx('eesh-2023.html').ctx;
  assert.deepStrictEqual([c3.E23_BUILD, c3.E23N_BUILD], ['is', 'hd']);
  c3.__E23 = c3.e23_generate(2468, c3); c3.__E23.g = c3.E23_BUILD;
  c3.__E23N = c3.e23n_generate(2468, c3); c3.__E23N.g = c3.E23N_BUILD;
  c3.EYESH._set({ n: 2, sel1: 'cur', sel2: 'cur' });
  const e3 = plain(c3.EYESH.buildExam());
  assert.strictEqual(e3.variants.length, 1);
  assert.deepStrictEqual([e3.variants[0].p1.g, e3.variants[0].p2.g], ['is', 'hd']);
  assert.strictEqual(EY.normExam(e3).ok, true);
});

test('хуучин тусдаа хуудсууд (сонгох/нөхөх) нэгдсэн хуудас руу шилжинэ (?v= хадгална); каталогт зөвхөн нэгдсэн хуудас', () => {
  const cat = fs.readFileSync(path.join(F.WT, 'catalog.js'), 'utf8');
  [2023, 2024].forEach((y) => {
    assert.ok(cat.includes("['eesh-" + y + ".html','ЭЕШ " + y + " — Сонгох ба нөхөх даалгавар']"), 'каталог ' + y);
    ['songoh', 'nohoh'].forEach((p) => {
      const h = fs.readFileSync(path.join(F.WT, 'eesh-' + y + '-' + p + '.html'), 'utf8');
      assert.ok(!cat.includes("'eesh-" + y + '-' + p + ".html'"), 'хуучин хуудас каталогт үлдсэн: ' + p);
      assert.ok(h.includes('location.replace("/eesh-' + y + '.html"'), 'шилжүүлэг ' + y + p);
      assert.ok(h.includes('[?&]v=(\\d{4})'), '?v= хадгална');
      assert.ok(h.length < 2000, 'жижиг шилжүүлэх хуудас');
    });
  });
});

test('normExam: хувилбартай ЭЕШ — буруу оролт татгалзана', () => {
  const key = 'A'.repeat(36), it = { ans: { a: '1', b: '2' }, parts: [] }, p2 = { v: 1234, g: 'xx', items: [it, it, it, it] };
  const base = { year: 2024, p1: { v: 1234, g: 'xx', key: key }, p2: p2 };
  const V = (x) => Object.assign({}, base, { variants: x });
  const ok = V([{ p1: { v: 2345, g: 'xx', key: 'B'.repeat(36) }, p2: p2 }]);
  assert.strictEqual(EY.normExam(ok).ok, true);
  const bad = (raw) => { const n = EY.normExam(raw); assert.strictEqual(n.ok, false, JSON.stringify(raw).slice(0, 160)); return n.error; };
  bad(V('B'));
  bad(V(Array(6).fill(ok.variants[0])));                                                    // 7 хувилбар
  assert.match(bad(V([{ p1: { v: 2345, g: 'xx', key: 'B'.repeat(35) }, p2: p2 }])), /^B хувилбарын/);
  assert.match(bad(V([ok.variants[0], { p1: { v: 999, g: 'xx', key: key }, p2: p2 }])), /^C хувилбарын/);
  assert.match(bad(V([{ p1: ok.variants[0].p1 }])), /2-р хэсэг дутуу/);               // 2-р хэсэг A-д бий
  assert.match(bad(V([{ p1: ok.variants[0].p1, p2: { v: 2345, g: 'xx', items: [it, it, it, { ans: { abc: '157', de: '10', fg: '12', hi: '13' } }] } }])), /2\.4.*a–h/);
  assert.strictEqual(EY.normExam(Object.assign({}, base, { variants: [] })).exam.variants, undefined);
});

test('eyesh-link.js: олон оронтой (хуучин) хувилбар a–h-д багтахгүй гэж танина', () => {
  const { ctx } = linkCtx('eesh-2024.html');
  const items = [1, 2, 3, 4].map(() => ({ ans: { abc: '157', de: '10', fg: '12', hi: '13' }, parts: [] }));   // 9 нүд
  assert.strictEqual(ctx.EYESH.fits({ v: 1234, g: 'sg', items: items }), false);
  const n = EY.normExam({ year: 2024, p1: { v: 'orig', g: '', key: 'A'.repeat(36) }, p2: { v: 1234, g: 'sg', items: items } });
  assert.strictEqual(n.ok, false);
  assert.match(n.error, /a–h/);
});

test('normExam: 2024 эх хоёр хэсэг — оноо (72 + 4×7), сэдэв, хариу, ref', () => {
  const { ctx } = linkCtx('eesh-2024.html');
  const O = plain(ctx.EYESH.ORIG[2024]);
  const n = EY.normExam({ year: 2024, p1: O[1], p2: O[2] });
  assert.strictEqual(n.ok, true, n.error);
  const ex = n.exam;
  assert.strictEqual(ex.title, 'ЭЕШ 2024 · Сонгох Эх · Нөхөх Эх');
  assert.strictEqual(ex.subject, 'Математик');
  assert.strictEqual(ex.sec1Count, 36);
  assert.strictEqual(ex.sec1Key.join(''), O[1].key);
  assert.strictEqual(ex.sec1Scores.reduce((a, b) => a + b, 0), 72);
  assert.deepStrictEqual([ex.sec1Scores[0], ex.sec1Scores[7], ex.sec1Scores[8], ex.sec1Scores[27], ex.sec1Scores[28], ex.sec1Scores[35]], [1, 1, 2, 2, 3, 3]);
  assert.strictEqual(ex.topics.length, 36);
  ex.topics.forEach((t) => assert.ok(TOPICS.indexOf(t) >= 0, t));
  assert.strictEqual(ex.useSec2, true);
  ['2.1', '2.2', '2.3', '2.4'].forEach((s) => {
    const c = ex.sec2Config[s];
    assert.strictEqual(c._enabled, true);
    const sum = 'abcdefgh'.split('').reduce((a, r) => a + (c[r].ans !== '' ? c[r].score : 0), 0);
    near(sum, 7, s);
  });
  const c4 = ex.sec2Config['2.4'];
  assert.deepStrictEqual('abcdefgh'.split('').map((r) => c4[r].ans).join(''), '07919157');
  assert.deepStrictEqual([c4.a.score, c4.b.score], [0.5, 0.5]);              // (1 оноо) a, b
  assert.deepStrictEqual([c4.c.score, c4.d.score, c4.e.score], [1.333, 1.333, 1.334]);   // (4 оноо)
  const c1 = ex.sec2Config['2.1'];
  assert.deepStrictEqual([c1.d.score, c1.e.score, c1.f.score, c1.g.score, c1.h.score], [1, 1, 1, 1, 1]);
  // ref — ижил хариу → ижил; нэг үсэг өөр → өөр
  assert.match(ex.ref, /^eesh2024:[0-9a-f]{20}$/);
  assert.strictEqual(EY.normExam({ year: 2024, title: 'Өөр нэр', p1: O[1], p2: O[2] }).exam.ref, ex.ref);
  const k2 = 'B' + O[1].key.slice(1);
  assert.notStrictEqual(EY.normExam({ year: 2024, p1: Object.assign({}, O[1], { key: k2 }), p2: O[2] }).exam.ref, ex.ref);
  assert.notStrictEqual(EY.normExam({ year: 2024, p1: O[1], p2: null }).exam.ref, ex.ref);
});

test('normExam: зөвхөн 1-р хэсэг, нэр, дэд асуултын оноо буруу бол тэнцүү хуваана', () => {
  const key = 'ABCDE'.repeat(7) + 'A';
  const a = EY.normExam({ year: 2023, title: '  <b>Сорил</b>\n 1  ', p1: { v: 4821, g: 'is', key: key }, p2: null });
  assert.strictEqual(a.ok, true, a.error);
  assert.strictEqual(a.exam.useSec2, false);
  assert.deepStrictEqual(a.exam.sec2Config, {});
  assert.strictEqual(a.exam.title, 'b Сорил /b 1');
  assert.deepStrictEqual(a.exam.meta, { year: 2023, p1: { v: 4821, g: 'is' }, p2: null });
  assert.strictEqual(EY.normExam({ year: 2023, p1: { v: 4821, g: 'is', key: key } }).exam.title, 'ЭЕШ 2023 · Сонгох №4821·is');
  assert.strictEqual(EY.normExam({ year: 2023, title: 'x'.repeat(300), p1: { v: 4821, g: '', key: key } }).exam.title.length, 120);
  // parts-ийн нийлбэр 7 биш → 8 нүдэнд 7/8
  const it = { ans: { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6', g: '7', h: '8' }, parts: [['abcd', 2], ['efgh', 2]] };
  const s = EY.normS2Item(it);
  assert.deepStrictEqual(Object.values(s.score), [0.875, 0.875, 0.875, 0.875, 0.875, 0.875, 0.875, 0.875]);
  // хамрагдаагүй нүд үлдвэл мөн тэнцүү хуваана
  near(Object.values(EY.normS2Item({ ans: it.ans, parts: [['abc', 7]] }).score).reduce((x, y) => x + y, 0), 7);
  // 7 нүд → 1 оноо
  assert.deepStrictEqual(Object.values(EY.normS2Item({ ans: { a: '6', b: '8', c: '3', d: '2', e: '5', f: '4', g: '8' }, parts: [] }).score), [1, 1, 1, 1, 1, 1, 1]);
});

test('normExam: буруу оролт татгалзана', () => {
  const key = 'A'.repeat(36), p2 = { v: 'orig', g: '', items: [1, 2, 3, 4].map(() => ({ ans: { a: '1' }, parts: [] })) };
  const bad = (raw) => { const n = EY.normExam(raw); assert.strictEqual(n.ok, false, JSON.stringify(raw).slice(0, 120)); return n.error; };
  bad(null); bad({});
  bad({ year: 2021, p1: { v: 1234, g: '', key: key } });
  bad({ year: 2024, p1: { v: 999, g: '', key: key } });
  bad({ year: 2024, p1: { v: 1234, g: 'BAD!', key: key } });
  assert.match(bad({ year: 2024, p1: { v: 1234, g: '', key: 'A'.repeat(35) + '-' } }), /Шинэ хувилбар/);
  bad({ year: 2024, p1: { v: 1234, g: '', key: 'A'.repeat(35) } });
  bad({ year: 2024, p1: { v: 1234, g: '', key: 'a'.repeat(36) } });
  const okBase = { year: 2024, p1: { v: 1234, g: '', key: key } };
  assert.strictEqual(EY.normExam(Object.assign({}, okBase, { p2: p2 })).ok, true);
  const withItem = (k, it) => { const q = plain(p2); q.items[k] = it; return Object.assign({}, okBase, { p2: q }); };
  bad(Object.assign({}, okBase, { p2: { v: 'orig', g: '', items: p2.items.slice(0, 3) } }));
  bad(withItem(0, { ans: { i: '1' } }));                    // a–h-ээс гадуур
  bad(withItem(1, { ans: { ab: '1' } }));                   // урт таарахгүй
  bad(withItem(2, { ans: { a: '1', ab: '12' } }));          // давхар нүд
  bad(withItem(3, { ans: { a: 'x' } }));                    // цифр биш
  bad(withItem(3, { ans: {} }));
  bad(withItem(3, { ans: ['1'] }));
  assert.strictEqual(EY.normExam(withItem(3, { ans: { a: '-', b: '.' } })).ok, true);   // eyeshcheck-ийн мөр «-», «.»-ийг уншина
});

test('status: токенгүй 401; эрхгүй → active:false, үнэ 9900, 30 хоног; GET → 405', async () => {
  let r = await E('status', {});
  assert.strictEqual(r.statusCode, 401); assert.strictEqual(r.body.needLogin, true);
  r = await E('status', { wstoken: jwt.sign({ email: 'a@x.mn', role: 'student' }, SEC) });   // тоглоомын токен биш
  assert.strictEqual(r.statusCode, 401);
  r = await E('status', { wstoken: wsTok('T@X.mn') });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, email: 't@x.mn', price: 9900, days: 30, expiry: null, active: false, pack_price: 19800 });
  r = await F.call(eyesh, { method: 'GET', query: { action: 'status' } });
  assert.strictEqual(r.statusCode, 405);
  r = await E('nope', { wstoken: wsTok('t@x.mn') });
  assert.strictEqual(r.statusCode, 400);
});

test('QPay plan=eyesh: create → check (дутуу/бүтэн) → эрх 30 хоног, бүртгэл, Telegram; давтан check олгохгүй; дахин авбал нэмэгдэнэ', async () => {
  let r = await Q('create', { plan: 'eyesh' });
  assert.strictEqual(r.statusCode, 401); assert.strictEqual(r.body.needLogin, true);
  assert.strictEqual(F.qp.invoices.length, 0);
  r = await Q('create', { plan: 'eyesh', wstoken: wsTok('Bagsh@X.mn'), amount: 1, email: 'other@x.mn' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.email, 'bagsh@x.mn');
  assert.strictEqual(r.body.amount, 9900);
  const inv = r.body.invoice.invoice_id;
  assert.strictEqual(F.qp.invoices[0].body.amount, 9900);
  assert.strictEqual(F.qp.invoices[0].body.invoice_description, 'CyberMath ЭЕШ шалгагч — 1 сар');
  const row = F.db.pay.get(inv);
  assert.deepStrictEqual([row.plan, row.months, row.amount, row.email, row.granted], ['eyesh', 1, 9900, 'bagsh@x.mn', false]);

  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, paid: false });
  F.qp.paid.set(inv, 5000);                                       // дутуу төлбөр
  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, paid: false });
  r = await Q('check', { invoice_id: inv, email: 'x@x.mn' });     // өөр имэйл
  assert.strictEqual(r.statusCode, 403);
  F.qp.paid.set(inv, 9900);
  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });
  assert.strictEqual(r.body.paid, true);
  near(daysLeft(r.body.eyesh), 30);
  assert.strictEqual(F.db.eyPurch.length, 1);
  assert.deepStrictEqual(F.db.eyPurch[0], { invoice_id: inv, email: 'bagsh@x.mn', amount: 9900, days: 30 });
  assert.ok(F.tg.some((t) => /ЭЕШ шалгагч худалдан авлаа/.test(t) && /bagsh@x\.mn/.test(t)), F.tg.join('\n'));
  assert.ok(!F.tg.some((t) => /Анхаар/.test(t)));
  assert.deepStrictEqual(F.db.txLeaks, []);
  const exp1 = r.body.eyesh;
  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });   // давтан — дахин олгохгүй
  assert.strictEqual(r.body.paid, true); assert.strictEqual(r.body.eyesh, exp1);
  assert.strictEqual(F.db.eyPurch.length, 1);
  r = await E('status', { wstoken: wsTok('bagsh@x.mn') });
  assert.strictEqual(r.body.active, true); assert.strictEqual(r.body.expiry, exp1);
  // Хоёр дахь худалдан авалт callback-аар → үлдсэн хоног дээр +30
  r = await Q('create', { plan: 'eyesh', wstoken: wsTok('bagsh@x.mn') });
  const inv2 = r.body.invoice.invoice_id;
  F.qp.paid.set(inv2, 9900);
  await F.call(qpay, { method: 'GET', query: { action: 'callback', email: 'bagsh@x.mn' } });
  near(daysLeft(F.db.eyAccess.get('bagsh@x.mn')), 60);
  assert.strictEqual(F.db.eyPurch.length, 2);
  assert.strictEqual(F.db.pay.get(inv2).granted, true);
});

test('QPay plan=eyesh: бүртгэл (ledger) унавал эрх олгогдоно, Telegram анхааруулна; ws_reconcile төлсөн атлаа олгогдоогүйг нөхнө', async () => {
  F.db.failEyLedger = true;
  let r = await Q('create', { plan: 'eyesh', wstoken: wsTok('a@x.mn') });
  const inv = r.body.invoice.invoice_id;
  F.qp.paid.set(inv, 9900);
  r = await Q('check', { invoice_id: inv, email: 'a@x.mn' });
  assert.strictEqual(r.body.paid, true);
  near(daysLeft(F.db.eyAccess.get('a@x.mn')), 30);
  assert.strictEqual(F.db.eyPurch.length, 0);
  assert.ok(F.tg.some((t) => /Анхаар/.test(t) && /ws_eyesh_purchases/.test(t)));
  F.db.failEyLedger = false;
  // Төлсөн атлаа check/callback ирээгүй нэхэмжлэх
  r = await Q('create', { plan: 'eyesh', wstoken: wsTok('b@x.mn') });
  const inv2 = r.body.invoice.invoice_id;
  F.qp.paid.set(inv2, 9900);
  r = await Q('ws_reconcile', {}, { headers: ADMIN });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.ok(r.body.granted.some((g) => g.plan === 'eyesh' && g.eyesh === true && g.email === 'b@x.mn'), JSON.stringify(r.body));
  near(daysLeft(F.db.eyAccess.get('b@x.mn')), 30);
});

test('QPay plan=eeshpack (ЭЕШ багц 19800): ЭЕШ ажлын хуудас 1 сар + ЭЕШ шалгагч 30 хоног НЭГ транзакцад; бүртгэл хоёр савд (9900 + 9900); давтан олгохгүй; wsstatus/status', async () => {
  let r = await Q('create', { plan: 'eeshpack' });
  assert.strictEqual(r.statusCode, 401); assert.strictEqual(r.body.needLogin, true);
  assert.strictEqual(F.qp.invoices.length, 0);
  // клиентийн amount/promo/email-д итгэхгүй
  r = await Q('create', { plan: 'eeshpack', wstoken: wsTok('Bagsh@X.mn'), amount: 1, promo: 'BAGSH20', email: 'other@x.mn' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.email, r.body.amount, r.body.days, r.body.grade], ['bagsh@x.mn', 19800, 30, 'ЭЕШ']);
  const inv = r.body.invoice.invoice_id;
  assert.strictEqual(F.qp.invoices[0].body.amount, 19800);
  assert.strictEqual(F.qp.invoices[0].body.invoice_description, 'CyberMath ЭЕШ багц (ажлын хуудас + ЭЕШ шалгагч) — 1 сар');
  const row = F.db.pay.get(inv);
  assert.deepStrictEqual([row.plan, row.months, row.amount, row.email, row.granted], ['eeshpack', 1, 19800, 'bagsh@x.mn', false]);

  F.qp.paid.set(inv, 9900);                                       // дутуу (зөвхөн нэгийн үнэ)
  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, paid: false });
  assert.deepStrictEqual([F.db.eyAccess.size, F.db.wsGrade.length], [0, 0]);
  F.qp.paid.set(inv, 19800);
  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });
  assert.strictEqual(r.body.paid, true, JSON.stringify(r.body));
  assert.strictEqual(r.body.grade, 'ЭЕШ');
  near(daysLeft(r.body.expiry), 30); near(daysLeft(r.body.eyesh), 30);
  assert.deepStrictEqual(F.db.wsGrade.map((x) => [x.email, x.grade]), [['bagsh@x.mn', 'ЭЕШ']]);
  near(daysLeft(F.db.eyAccess.get('bagsh@x.mn')), 30);
  // бүртгэл: ажлын хуудас (анги ЭЕШ) 9900 + ЭЕШ шалгагч 9900 = нэхэмжлэхийн 19800
  assert.deepStrictEqual(F.db.wsPurch.map((x) => [x.email, x.amount, x.grade, x.invoice_id, x.months, x.promo]), [['bagsh@x.mn', 9900, 'ЭЕШ', inv, 1, null]]);
  assert.deepStrictEqual(F.db.eyPurch, [{ invoice_id: inv, email: 'bagsh@x.mn', amount: 9900, days: 30 }]);
  assert.ok(F.tg.some((t) => /ЭЕШ багц худалдан авлаа/.test(t) && /bagsh@x\.mn/.test(t) && /19800₮/.test(t)), F.tg.join('\n'));
  assert.ok(!F.tg.some((t) => /Анхаар/.test(t)));
  assert.deepStrictEqual(F.db.txLeaks, []);
  assert.ok(F.db.txLog.indexOf('SAVEPOINT pack_ledger') >= 0, F.db.txLog.join(','));
  // давтан check — дахин олгохгүй, ижил хугацаа
  const e1 = r.body.eyesh, w1 = r.body.expiry;
  r = await Q('check', { invoice_id: inv, email: 'bagsh@x.mn' });
  assert.deepStrictEqual([r.body.paid, r.body.grade, r.body.eyesh, r.body.expiry], [true, 'ЭЕШ', e1, w1]);
  assert.deepStrictEqual([F.db.wsPurch.length, F.db.eyPurch.length], [1, 1]);
  // ЭЕШ шалгагч идэвхтэй; ЭЕШ хуудас ангийн эрхээр нээгдэнэ, багцын санал (pack) зөвхөн ЭЕШ бүлгийн хуудсанд
  r = await E('status', { wstoken: wsTok('bagsh@x.mn') });
  assert.deepStrictEqual([r.body.active, r.body.expiry, r.body.pack_price], [true, e1, 19800]);
  r = await Q('wsstatus', { wstoken: wsTok('bagsh@x.mn'), slug: 'eesh-2025.html' });
  assert.deepStrictEqual([r.body.active, r.body.scope, r.body.grade], [true, 'grade', 'ЭЕШ'], JSON.stringify(r.body));
  assert.deepStrictEqual(r.body.pack, { price: 19800, days: 30, eyesh_price: 9900 });
  r = await Q('wsstatus', { wstoken: wsTok('bagsh@x.mn'), slug: 'troichlen-zadlal-12.html' });
  assert.strictEqual(r.body.active, false); assert.ok(!('pack' in r.body), JSON.stringify(r.body));
  r = await Q('wsprices', {});
  assert.strictEqual(r.body.pack_price, 19800);
});

test('QPay plan=eeshpack: бүртгэл унавал хоёр эрх олгогдоно (SAVEPOINT), Telegram анхааруулна; ws_reconcile нөхнө; EESH_PACK_PRICE', async () => {
  F.db.failWsLedger = true;
  let r = await Q('create', { plan: 'eeshpack', wstoken: wsTok('a@x.mn') });
  const inv = r.body.invoice.invoice_id;
  F.qp.paid.set(inv, 19800);
  r = await Q('check', { invoice_id: inv, email: 'a@x.mn' });
  assert.strictEqual(r.body.paid, true);
  near(daysLeft(F.db.eyAccess.get('a@x.mn')), 30);
  assert.deepStrictEqual(F.db.wsGrade.map((x) => x.grade), ['ЭЕШ']);
  assert.deepStrictEqual([F.db.wsPurch.length, F.db.eyPurch.length], [0, 0], 'бүртгэл хоёулаа буцсан');
  assert.ok(F.tg.some((t) => /Анхаар/.test(t) && /ws_purchases/.test(t)));
  F.db.failWsLedger = false;
  // Төлсөн атлаа check/callback ирээгүй нэхэмжлэх — тулгалт нөхнө
  r = await Q('create', { plan: 'eeshpack', wstoken: wsTok('b@x.mn') });
  const inv2 = r.body.invoice.invoice_id;
  F.qp.paid.set(inv2, 19800);
  r = await Q('ws_reconcile', {}, { headers: ADMIN });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.ok(r.body.granted.some((g) => g.plan === 'eeshpack' && g.eyesh === true && g.grade === 'ЭЕШ' && g.email === 'b@x.mn'), JSON.stringify(r.body));
  near(daysLeft(F.db.eyAccess.get('b@x.mn')), 30);
  // Үнийг env-ээр өөрчилж болно; бүртгэлд ЭЕШ шалгагч EYESH_PRICE, үлдэгдэл нь ажлын хуудас
  process.env.EESH_PACK_PRICE = '15000';
  try {
    r = await Q('create', { plan: 'eeshpack', wstoken: wsTok('c@x.mn') });
    assert.strictEqual(r.body.amount, 15000);
    F.qp.paid.set(r.body.invoice.invoice_id, 15000);
    await Q('check', { invoice_id: r.body.invoice.invoice_id, email: 'c@x.mn' });
    assert.deepStrictEqual(F.db.wsPurch.filter((x) => x.email === 'c@x.mn').map((x) => x.amount), [5100]);
    assert.deepStrictEqual(F.db.eyPurch.filter((x) => x.email === 'c@x.mn').map((x) => x.amount), [9900]);
  } finally { delete process.env.EESH_PACK_PRICE; }
});

test('handoff → redeem: код нэг удаа, хугацаатай; эрхгүй ч код өгнө (eyeshcheck өөрөө шалгана)', async () => {
  F.db.wsLogin.set('t@x.mn', { email: 't@x.mn', name: 'Бат Болд', verified: true });
  const { ctx } = linkCtx('eesh-2024.html');
  const O = plain(ctx.EYESH.ORIG[2024]);
  let r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: { v: 1, key: 'A' } } });
  assert.strictEqual(r.statusCode, 400); assert.ok(r.body.error);
  r = await E('handoff', { exam: { year: 2024, p1: O[1], p2: O[2] } });
  assert.strictEqual(r.statusCode, 401);
  r = await E('handoff', { wstoken: wsTok('T@x.mn'), exam: { year: 2024, title: 'Сорил 1', p1: O[1], p2: O[2] } });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.url, 'https://eyeshcheck.com/api/cm/sso');
  assert.match(r.body.code, /^[A-Za-z0-9_-]{43}$/);
  assert.strictEqual(r.body.ttl, 120);
  const code = r.body.code;
  assert.ok(!F.db.eyHand.has(code), 'кодыг өөрийг нь хадгалахгүй (хэш)');
  assert.ok(F.db.eyHand.has(EY.codeHash(code)));
  r = await E('redeem', { code: code });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.email, 't@x.mn');
  assert.strictEqual(r.body.name, 'Бат Болд');
  assert.strictEqual(r.body.paidUntil, null);
  assert.strictEqual(r.body.exam.title, 'Сорил 1');
  assert.strictEqual(r.body.exam.sec1Key.join(''), O[1].key);
  assert.strictEqual(r.body.exam.useSec2, true);
  r = await E('redeem', { code: code });                       // давтан
  assert.strictEqual(r.statusCode, 404);
  r = await E('redeem', { code: 'x' });
  assert.strictEqual(r.statusCode, 404);
  r = await E('redeem', {});
  assert.strictEqual(r.statusCode, 404);
  // хугацаа дууссан код
  r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: O[1] } });
  F.db.eyHand.get(EY.codeHash(r.body.code)).expires_at = Date.now() - 1000;
  const r2 = await E('redeem', { code: r.body.code });
  assert.strictEqual(r2.statusCode, 404);
  assert.strictEqual(F.db.eyHand.size, 0);
  // эрхтэй бол paidUntil
  F.db.eyAccess.set('t@x.mn', new Date(Date.now() + 10 * F.DAY));
  r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: O[1] } });
  r = await E('redeem', { code: r.body.code });
  near(daysLeft(r.body.paidUntil), 10);
  assert.strictEqual(r.body.exam.useSec2, false);
});

test('handoff материалтай → redeem материалыг буцаана (eyeshcheck «ЭЕШ материал»); буруу/хэт том материал 400; материалгүй бол null', async () => {
  const zlib = require('zlib');
  const { ctx } = linkCtx('eesh-2024.html');
  const O = plain(ctx.EYESH.ORIG[2024]);
  const mat = zlib.gzipSync(JSON.stringify({ v: 1, year: 2024, docs: [{ part: 1, n: 1, title: 'ЭЕШ 2024', cls: '', css: '', sheets: [{ L: 'A', label: 'Эх', html: '<p>x</p>' }], key: '' }] })).toString('base64');
  assert.strictEqual(EY.normMaterial(mat), mat);
  [null, 1, '', 'abc', 'H4sI', 'H4sI!!!!', 'H4sIAAA', 'Zm9v' + mat.slice(4), 'H4sI' + 'A'.repeat(EY.MATERIAL_MAX)].forEach((m) => assert.strictEqual(EY.normMaterial(m), null, String(m).slice(0, 20)));
  let r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: O[1], p2: O[2] }, material: mat });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  r = await E('redeem', { code: r.body.code });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.material, mat);
  assert.strictEqual(r.body.exam.sec1Key.join(''), O[1].key);
  r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: O[1] }, material: 'буруу' });
  assert.strictEqual(r.statusCode, 400);
  assert.match(r.body.error, /материал/);
  r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: O[1] } });
  r = await E('redeem', { code: r.body.code });
  assert.strictEqual(r.body.material, null);
});

test('admin_handoff → redeem: зөвхөн админ токеноор; код нэг удаа, { kind:"admin" } л буцаана; багшийн код kind:"teacher"', async () => {
  let r = await E('admin_handoff', {});
  assert.strictEqual(r.statusCode, 401);
  r = await E('admin_handoff', { wstoken: wsTok('t@x.mn') });                                   // ws токен админ биш
  assert.strictEqual(r.statusCode, 401);
  r = await E('admin_handoff', {}, { headers: { authorization: 'Bearer ' + jwt.sign({ admin: false }, SEC) } });
  assert.strictEqual(r.statusCode, 401);
  r = await E('admin_handoff', {}, { headers: { authorization: 'Bearer ' + jwt.sign({ admin: true }, 'өөр-нууц') } });
  assert.strictEqual(r.statusCode, 401);
  r = await E('admin_handoff', {}, { headers: ADMIN });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.url, 'https://eyeshcheck.com/cm-admin');
  assert.match(r.body.code, /^[A-Za-z0-9_-]{43}$/);
  assert.strictEqual(r.body.ttl, 120);
  const code = r.body.code;
  assert.ok(!F.db.eyHand.has(code), 'кодыг өөрийг нь хадгалахгүй (хэш)');
  r = await E('redeem', { code: code });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(r.body, { ok: true, kind: 'admin' });                                  // имэйл, эрх, шалгалтгүй
  r = await E('redeem', { code: code });
  assert.strictEqual(r.statusCode, 404);                                                        // давтан
  // хугацаа дууссан админ код
  r = await E('admin_handoff', {}, { headers: ADMIN });
  F.db.eyHand.get(EY.codeHash(r.body.code)).expires_at = Date.now() - 1000;
  assert.strictEqual((await E('redeem', { code: r.body.code })).statusCode, 404);
  // багшийн код өмнөх шигээ, kind:'teacher'
  F.db.wsLogin.set('t@x.mn', { email: 't@x.mn', name: 'Бат Болд', verified: true });
  const { ctx } = linkCtx('eesh-2024.html');
  const O = plain(ctx.EYESH.ORIG[2024]);
  r = await E('handoff', { wstoken: wsTok('t@x.mn'), exam: { year: 2024, p1: O[1] } });
  r = await E('redeem', { code: r.body.code });
  assert.strictEqual(r.body.kind, 'teacher');
  assert.strictEqual(r.body.email, 't@x.mn');
  // админы тэмдгийг ws токеноор ашиглаж болохгүй
  r = await E('handoff', { wstoken: wsTok(EY.ADMIN_HANDOFF), exam: { year: 2024, p1: O[1] } });
  assert.strictEqual(r.statusCode, 401);
});

test('admin.html: «ЭЕШ шалгагч» цэс — iframe, код зөвхөн eyeshcheck.com руу, мессежийг эх сурвалжаар шалгана', () => {
  const h = fs.readFileSync(path.join(F.WT, 'admin.html'), 'utf8');
  assert.ok(h.includes("showPage('eyesh',this)"), 'цэс');
  assert.ok(h.includes('<div class="page" id="page-eyesh"'), 'хуудас');
  assert.ok(h.includes('<iframe id="eyesh-frame"'), 'iframe');
  assert.ok(h.includes("if (name === 'eyesh') eyeshOpen();"), 'showPage ачаална');
  assert.ok(h.includes("var EYESH_ORIGIN = 'https://eyeshcheck.com';"));
  assert.ok(h.includes("adminFetch('/api/eyesh?action=admin_handoff'"));
  const js = h.slice(h.indexOf('var EYESH_ORIGIN'), h.indexOf('window.eyeshTheme = eyeshTheme;'));
  assert.ok(js.includes('e.origin !== EYESH_ORIGIN') && js.includes('e.source !== f.contentWindow'), 'мессежийн эх сурвалж');
  assert.ok(js.includes("code: d.code, dark: eyeshDark() }, EYESH_ORIGIN)"), 'кодыг зөвхөн eyeshcheck.com руу');
  assert.ok(!/postMessage\([^;]*['"]\*['"]\)/.test(js), 'targetOrigin "*" биш');
  assert.ok(!/innerHTML/.test(js), 'текстийг textContent-оор');
});
