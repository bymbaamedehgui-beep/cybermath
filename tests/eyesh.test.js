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
function linkCtx(file) {
  const store = new Map();
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

test('eyesh-link.js ORIG: 2024 эх 1-р хэсгийн түлхүүр = e24_generate(orig)', () => {
  const { ctx } = linkCtx('eesh-2024-songoh.html');
  const st = ctx.e24_generate('orig', ctx);
  assert.strictEqual(ctx.e24_letters(st), ctx.EYESH.ORIG[2024][1].key);
  ctx.__E24 = st;
  const cur = plain(ctx.EYESH.exportCur());
  assert.deepStrictEqual(cur, { v: 'orig', g: '', key: 'EDCAADCBDEAACDEAACBBDEDAACDEAACBDEAA' });
});

test('eyesh-link.js ORIG: 2024 ба 2023 эх 2-р хэсэг (нүд + дэд асуултын оноо) = генератор; эх нь a–h-д багтана', () => {
  [['eesh-2024-nohoh.html', 'e24n_generate', '__E24N', 2024], ['eesh-2023-nohoh.html', 'e23n_generate', '__E23N', 2023]].forEach(([file, gen, glob, year]) => {
    const { ctx } = linkCtx(file);
    const st = ctx[gen]('orig', ctx);
    ctx[glob] = st;
    const cur = plain(ctx.EYESH.exportCur());
    assert.deepStrictEqual(cur, plain(ctx.EYESH.ORIG[year][2]), file);
    assert.strictEqual(ctx.EYESH.fits(ctx.EYESH.ORIG[year][2]), true, file);
    const n = EY.normExam({ year: year, p1: { v: 1234, g: 'xx', key: 'A'.repeat(36) }, p2: cur });
    assert.strictEqual(n.ok, true, file + ' ' + n.error);
  });
});

test('2-р хэсгийн шинэ хувилбар бүр ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтана (2023, 2024) → eyeshcheck-д дүгнэгдэнэ', () => {
  [['eesh-2024-nohoh.html', 'e24n_generate', '__E24N', 2024], ['eesh-2023-nohoh.html', 'e23n_generate', '__E23N', 2023]].forEach(([file, gen, glob, year]) => {
    const { ctx } = linkCtx(file);
    for (let seed = 1000; seed <= 9999; seed += 37) {
      ctx[glob] = ctx[gen](seed, ctx);
      const cur = plain(ctx.EYESH.exportCur());
      assert.strictEqual(ctx.EYESH.fits(cur), true, file + ' ' + seed);
      const n = EY.normExam({ year: year, p1: { v: seed, g: 'xx', key: 'A'.repeat(36) }, p2: cur });
      assert.strictEqual(n.ok, true, file + ' ' + seed + ' ' + n.error);
      Object.values(n.exam.sec2Config).forEach((c) => near('abcdefgh'.split('').reduce((a, r) => a + (c[r].ans !== '' ? c[r].score : 0), 0), 7, file + ' ' + seed));
    }
  });
});

test('eyesh-link.js: олон оронтой (хуучин) хувилбар a–h-д багтахгүй гэж танина', () => {
  const { ctx } = linkCtx('eesh-2024-nohoh.html');
  const items = [1, 2, 3, 4].map(() => ({ ans: { abc: '157', de: '10', fg: '12', hi: '13' }, parts: [] }));   // 9 нүд
  assert.strictEqual(ctx.EYESH.fits({ v: 1234, g: 'sg', items: items }), false);
  const n = EY.normExam({ year: 2024, p1: { v: 'orig', g: '', key: 'A'.repeat(36) }, p2: { v: 1234, g: 'sg', items: items } });
  assert.strictEqual(n.ok, false);
  assert.match(n.error, /a–h/);
});

test('normExam: 2024 эх хоёр хэсэг — оноо (72 + 4×7), сэдэв, хариу, ref', () => {
  const { ctx } = linkCtx('eesh-2024-nohoh.html');
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
  bad({ year: 2022, p1: { v: 1234, g: '', key: key } });
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
  assert.deepStrictEqual(r.body, { ok: true, email: 't@x.mn', price: 9900, days: 30, expiry: null, active: false });
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

test('handoff → redeem: код нэг удаа, хугацаатай; эрхгүй ч код өгнө (eyeshcheck өөрөө шалгана)', async () => {
  F.db.wsLogin.set('t@x.mn', { email: 't@x.mn', name: 'Бат Болд', verified: true });
  const { ctx } = linkCtx('eesh-2024-nohoh.html');
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
  const { ctx } = linkCtx('eesh-2024-nohoh.html');
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
