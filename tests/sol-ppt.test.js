// Бодолтын PPT (ЭЕШ ажлын хуудасны тухайн бодлогын багц — slug + seed, нэг удаа): api/_wssol.js, api/qpay.js plan='solppt'
// (create/check/callback), api/wsppt.js sol_has. e1k.js seed (#s=), «Бодолтын PPT» товч, e1k-sol.js алхам хуваалт.
// Ажиллуулах: node --test tests/sol-ppt.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const qpay = require(path.join(F.API, 'qpay.js'));
const wsppt = require(path.join(F.API, 'wsppt.js'));
const SOL = require(path.join(F.API, '_wssol.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, SEC) };
const Q = (action, body, o) => F.call(qpay, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const P = (action, body, o) => F.call(wsppt, Object.assign({ query: { action: action }, body: body || {} }, o || {}));

// ── ws_sol_ppt + ws_ppt_purchases + pay_pending (sol_ref) — энэ тестийн SQL ──
const sol = [];        // ws_sol_ppt мөрүүд
const ledger = [];     // ws_ppt_purchases мөрүүд
let failSolLedger = false;
F.db.extra.push(function (q, p) {
  if (q === "INSERT INTO pay_pending (invoice_id, email, plan, months, amount, event_id, sol_ref) VALUES ($1,$2,'solppt',1,$3,NULL,$4) ON CONFLICT (invoice_id) DO NOTHING") {
    if (!F.db.pay.has(p[0])) F.db.pay.set(p[0], { invoice_id: p[0], email: p[1], plan: 'solppt', months: 1, amount: p[2], event_id: null, granted: false, promo_code: null, game_key: null, realm: null, game_grade: null, ppt_ids: null, sol_ref: p[3], created_at: Date.now() });
    return { rows: [] };
  }
  if (q === 'SELECT 1 FROM ws_sol_ppt WHERE email=$1 AND slug=$2 AND seed=$3 LIMIT 1') {
    return { rows: sol.some(r => r.email === p[0] && r.slug === p[1] && r.seed === p[2]) ? [{ '?column?': 1 }] : [] };
  }
  if (/^SELECT DISTINCT ON \(slug, seed\) slug, seed, title, created_at FROM ws_sol_ppt WHERE email=\$1( AND slug=\$2)? ORDER BY slug, seed, created_at$/.test(q)) {
    const seen = new Set(), out = [];
    sol.filter(r => r.email === p[0] && (p.length < 2 || r.slug === p[1])).forEach(r => { const k = r.slug + '|' + r.seed; if (!seen.has(k)) { seen.add(k); out.push(r); } });
    return { rows: out.map(r => ({ slug: r.slug, seed: r.seed, title: r.title, created_at: r.created_at })) };
  }
  if (q === 'INSERT INTO ws_sol_ppt (email, slug, seed, title, invoice_id, amount) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (invoice_id) DO NOTHING RETURNING id') {
    if (sol.some(r => r.invoice_id === p[4])) return { rows: [] };
    const r = { id: sol.length + 1, email: p[0], slug: p[1], seed: p[2], title: p[3], invoice_id: p[4], amount: p[5], created_at: new Date() };
    sol.push(r); return { rows: [{ id: r.id }] };
  }
  if (q === 'INSERT INTO ws_ppt_purchases (invoice_id, email, ppt_ids, n, amount, days) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (invoice_id) DO NOTHING') {
    if (failSolLedger) { const e = new Error('ledger down'); e.code = 'XX000'; throw e; }
    if (!ledger.some(r => r.invoice_id === p[0])) ledger.push({ invoice_id: p[0], email: p[1], ppt_ids: p[2], n: p[3], amount: p[4], days: p[5] });
    return { rows: [] };
  }
  if (/^(SAVEPOINT|RELEASE SAVEPOINT|ROLLBACK TO SAVEPOINT) sol_ledger$/.test(q)) return { rows: [] };
  return null;
});

beforeEach(() => { F.reset(); sol.length = 0; ledger.length = 0; failSolLedger = false; delete process.env.SOL_PPT_PRICE; });

const EMAIL = 'teacher@example.com';
const BODY = (o) => Object.assign({ plan: 'solppt', slug: 'eesh1000-1', seed: 'k3x9q2', title: 'ЭЕШ 1000 1-1', wstoken: wsTok(EMAIL) }, o || {});

test('_wssol: slug/seed шалгалт, sol_ref хадгалах хэлбэр', () => {
  assert.deepStrictEqual(SOL.normRef('eesh1000-1', 'abcd'), { slug: 'eesh1000-1', seed: 'abcd' });
  assert.deepStrictEqual(SOL.normRef(' EESH1000-too-1 ', 'K3X9Q2'), { slug: 'eesh1000-too-1', seed: 'k3x9q2' });
  assert.ok(SOL.normRef('eesh1000-olon-gishuunt-2', 'zz12'));
  ['eesh-2022', '../eesh1000-1', 'eesh1000-1.html', 'eesh1000-', 'x'.repeat(70)].forEach(s => assert.strictEqual(SOL.normRef(s, 'abcd'), null, s));
  ['abc', 'ABCD$', 'a'.repeat(11), ''].forEach(s => assert.strictEqual(SOL.normRef('eesh1000-1', s), null, s));
  const r = SOL.parseRef(SOL.refStr({ slug: 'eesh1000-2', seed: 'q1w2e3', title: 'ЭЕШ <b>1000</b> | 1-2' }));
  assert.deepStrictEqual(r, { slug: 'eesh1000-2', seed: 'q1w2e3', title: 'ЭЕШ 1000 1-2' });
  assert.strictEqual(SOL.parseRef('eesh1000-2'), null);
  assert.strictEqual(SOL.parseRef('a|b|c|d'), null);
  assert.strictEqual(SOL.price(), 2900);
  process.env.SOL_PPT_PRICE = '3500'; assert.strictEqual(SOL.price(), 3500);
  process.env.SOL_PPT_PRICE = '5'; assert.strictEqual(SOL.price(), 2900);
});

test('create: нэвтрээгүй → 401, буруу хуудас → 400, үнэ серверийнх (клиентийн amount-д итгэхгүй)', async () => {
  let r = await Q('create', BODY({ wstoken: '' }));
  assert.strictEqual(r.statusCode, 401); assert.strictEqual(r.body.needLogin, true);
  r = await Q('create', BODY({ wstoken: jwt.sign({ email: EMAIL }, SEC) }));    // ws:true-гүй (тоглоомын) токен
  assert.strictEqual(r.statusCode, 401);
  r = await Q('create', BODY({ slug: 'eesh-2022' }));
  assert.strictEqual(r.statusCode, 400);
  r = await Q('create', BODY({ seed: 'x' }));
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(F.qp.invoices.length, 0);
  r = await Q('create', BODY({ amount: 1 }));
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.amount, 2900);
  assert.deepStrictEqual(r.body.sol, { slug: 'eesh1000-1', seed: 'k3x9q2' });
  assert.strictEqual(F.qp.invoices.length, 1);
  assert.strictEqual(F.qp.invoices[0].body.amount, 2900);
  assert.match(F.qp.invoices[0].body.invoice_description, /бодолтын PPT — ЭЕШ 1000 1-1/);
  const row = F.db.pay.get(r.body.invoice.invoice_id);
  assert.strictEqual(row.plan, 'solppt');
  assert.strictEqual(row.sol_ref, 'eesh1000-1|k3x9q2|ЭЕШ 1000 1-1');
  assert.strictEqual(row.email, EMAIL);
});

test('check: төлөгдөөгүй → paid:false; төлөгдсөн → нэг удаа олгоно (ws_sol_ppt + «Слайд» бүртгэл + Telegram)', async () => {
  const c = await Q('create', BODY());
  const inv = c.body.invoice.invoice_id;
  let r = await Q('check', { invoice_id: inv, email: EMAIL });
  assert.deepStrictEqual(r.body, { ok: true, paid: false });
  assert.strictEqual(sol.length, 0);
  F.qp.paid.set(inv, 2900);
  r = await Q('check', { invoice_id: inv, email: EMAIL });
  assert.deepStrictEqual(r.body, { ok: true, paid: true, sol: { slug: 'eesh1000-1', seed: 'k3x9q2' } });
  assert.strictEqual(sol.length, 1);
  assert.deepStrictEqual([sol[0].email, sol[0].slug, sol[0].seed, sol[0].title, sol[0].amount], [EMAIL, 'eesh1000-1', 'k3x9q2', 'ЭЕШ 1000 1-1', 2900]);
  assert.deepStrictEqual(ledger, [{ invoice_id: inv, email: EMAIL, ppt_ids: 'sol:eesh1000-1:k3x9q2', n: 1, amount: 2900, days: 0 }]);
  assert.strictEqual(F.tg.length, 1);
  assert.match(F.tg[0], /Бодолтын PPT худалдан авлаа/);
  assert.strictEqual(F.db.txLeaks.length, 0);
  // давтан check / callback — дахин олгохгүй
  r = await Q('check', { invoice_id: inv, email: EMAIL });
  assert.deepStrictEqual(r.body, { ok: true, paid: true, sol: { slug: 'eesh1000-1', seed: 'k3x9q2' } });
  await F.call(qpay, { method: 'GET', query: { action: 'callback', email: EMAIL } });
  assert.strictEqual(sol.length, 1);
  assert.strictEqual(ledger.length, 1);
  assert.strictEqual(F.tg.length, 1);
});

test('check: дутуу төлсөн дүн → олгохгүй; өөр имэйлээр шалгах → 403', async () => {
  const c = await Q('create', BODY());
  const inv = c.body.invoice.invoice_id;
  F.qp.paid.set(inv, 1000);
  let r = await Q('check', { invoice_id: inv, email: EMAIL });
  assert.deepStrictEqual(r.body, { ok: true, paid: false });
  r = await Q('check', { invoice_id: inv, email: 'other@example.com' });
  assert.strictEqual(r.statusCode, 403);
  assert.strictEqual(sol.length, 0);
});

test('callback: төлсөн нэхэмжлэхийг олгоно (check хийгээгүй ч)', async () => {
  const c = await Q('create', BODY({ seed: 'zz99', title: 'ЭЕШ 1000 1-3', slug: 'eesh1000-3' }));
  F.qp.paid.set(c.body.invoice.invoice_id, 2900);
  await F.call(qpay, { method: 'GET', query: { action: 'callback', email: EMAIL } });
  assert.strictEqual(sol.length, 1);
  assert.strictEqual(sol[0].slug, 'eesh1000-3');
  assert.strictEqual(F.db.pay.get(c.body.invoice.invoice_id).granted, true);
});

test('бүртгэл (ws_ppt_purchases) бичигдэхгүй байсан ч эрх олгогдоно, Telegram-д анхааруулна', async () => {
  const c = await Q('create', BODY());
  F.qp.paid.set(c.body.invoice.invoice_id, 2900);
  failSolLedger = true;
  const r = await Q('check', { invoice_id: c.body.invoice.invoice_id, email: EMAIL });
  assert.strictEqual(r.body.paid, true);
  assert.strictEqual(sol.length, 1);
  assert.strictEqual(ledger.length, 0);
  assert.match(F.tg[0], /бүртгэл \(ws_ppt_purchases\) бичигдсэнгүй/);
});

test('create: аль хэдийн худалдан авсан багц → 409 owned (дахин мөнгө авахгүй); өөр seed → шинэ нэхэмжлэх', async () => {
  const c = await Q('create', BODY());
  F.qp.paid.set(c.body.invoice.invoice_id, 2900);
  await Q('check', { invoice_id: c.body.invoice.invoice_id, email: EMAIL });
  let r = await Q('create', BODY());
  assert.strictEqual(r.statusCode, 409);
  assert.strictEqual(r.body.owned, true);
  assert.strictEqual(F.qp.invoices.length, 1);
  r = await Q('create', BODY({ seed: 'n3w5ed' }));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.qp.invoices.length, 2);
});

test('wsppt sol_has: эрх, энэ хуудсанд худалдан авсан багцууд; нэвтрээгүй; админ бүгдийг үзнэ', async () => {
  let r = await P('sol_has', { slug: 'eesh1000-1', seed: 'k3x9q2', wstoken: wsTok(EMAIL) });
  assert.deepStrictEqual(r.body, { ok: true, owned: false, login: true, price: 2900, mine: [] });
  const c = await Q('create', BODY());
  F.qp.paid.set(c.body.invoice.invoice_id, 2900);
  await Q('check', { invoice_id: c.body.invoice.invoice_id, email: EMAIL });
  r = await P('sol_has', { slug: 'eesh1000-1', seed: 'k3x9q2', wstoken: wsTok(EMAIL) });
  assert.strictEqual(r.body.owned, true);
  assert.strictEqual(r.body.mine.length, 1);
  assert.deepStrictEqual([r.body.mine[0].seed, r.body.mine[0].title], ['k3x9q2', 'ЭЕШ 1000 1-1']);
  r = await P('sol_has', { slug: 'eesh1000-1', seed: 'other1', wstoken: wsTok(EMAIL) });
  assert.strictEqual(r.body.owned, false);
  assert.strictEqual(r.body.mine.length, 1);       // өөр багц — гэхдээ энэ хуудсанд худалдан авсан нь жагсаалтад
  r = await P('sol_has', { slug: 'eesh1000-2', seed: 'k3x9q2', wstoken: wsTok(EMAIL) });
  assert.strictEqual(r.body.owned, false);
  assert.strictEqual(r.body.mine.length, 0);
  r = await P('sol_has', { slug: 'eesh1000-1', seed: 'k3x9q2', wstoken: wsTok('x@example.com') });
  assert.strictEqual(r.body.owned, false);
  r = await P('sol_has', { slug: 'eesh1000-1', seed: 'k3x9q2' });
  assert.deepStrictEqual(r.body, { ok: true, owned: false, login: false, price: 2900, mine: [] });
  r = await P('sol_has', { slug: 'eesh1000-1', seed: 'k3x9q2' }, { headers: ADMIN });
  assert.strictEqual(r.body.owned, true);
  r = await P('sol_has', { slug: 'bad', seed: 'k3x9q2', wstoken: wsTok(EMAIL) });
  assert.strictEqual(r.statusCode, 400);
});

test('орлогын тайлан: solppt нь Premium савд орохгүй (дүн нь «Слайд» сав — ws_ppt_purchases)', () => {
  const src = fs.readFileSync(path.join(F.API, 'qpay.js'), 'utf8');
  const m = /const NO_PREM_GAME = "([^"]+)"/.exec(src);
  assert.ok(m && /'solppt'/.test(m[1]), 'NO_PREM_GAME-д solppt');
  assert.match(src, /row\.plan !== 'solppt'/);
});

// ── e1k.js: seed-ээр ижил бодлого, «Бодолтын PPT» товч зөвхөн бүх бодлого бодолттой хуудсанд ──
function pageCtx(file, hash, search) {
  const h = fs.readFileSync(path.join(F.WT, file), 'utf8');
  const main = /<script>\n?([\s\S]*?)<\/script>/.exec(h.replace(/\r\n/g, '\n'))[1];
  const els = {};
  const el = (id) => els[id] || (els[id] = { id: id, style: {}, className: '', innerHTML: '', checked: id === 'sw', classList: { toggle() {} },
    addEventListener(t, f) { (this._h = this._h || {})[t] = f; }, appendChild() {}, querySelector: () => null });
  let replaced = null;
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    location: { pathname: '/' + file, search: search || '', hash: hash || '' },
    history: { state: null, replaceState(s, t, u) { replaced = u; } },
    localStorage: { getItem: () => null, setItem() {} }, sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: el, createElement: () => el('x' + Math.random()), head: el('head'), fonts: { status: 'loaded' } },
    renderMathInElement() {}, setTimeout() {}, alert() {},
  });
  vm.runInContext('var window=this,self=this;', ctx);
  vm.runInContext(fs.readFileSync(path.join(F.WT, 'e1k.js'), 'utf8'), ctx, { filename: 'e1k.js' });
  vm.runInContext(main, ctx, { filename: file });
  return { ctx: ctx, els: els, url: () => replaced };
}
const qs = (c) => JSON.stringify(c.ctx.E1K.cur().map(g => [g.q, g.a, g.s]));

test('e1k.js: #s=seed → ижил бодлого (хуудсыг дахин ачаалахад), шинэ seed → өөр; URL-д #s= бичнэ', () => {
  const a = pageCtx('eesh1000-1.html', '#s=k3x9q2'), b = pageCtx('eesh1000-1.html', '#s=k3x9q2');
  assert.strictEqual(a.ctx.E1K.seed(), 'k3x9q2');
  assert.strictEqual(qs(a), qs(b));
  assert.match(a.url(), /#s=k3x9q2$/);
  const c = pageCtx('eesh1000-1.html', '#s=zz0001');
  assert.notStrictEqual(qs(a), qs(c));
  const d = pageCtx('eesh1000-1.html', '');
  assert.match(d.ctx.E1K.seed(), /^[0-9a-z]{6}$/);
  assert.match(d.url(), /#s=[0-9a-z]{6}$/);
  d.ctx.build('k3x9q2');                 // «Шинэ бодлого» биш — seed-ээр дахин үүсгэх (худалдан авсан багцаа нээх)
  assert.strictEqual(qs(d), qs(a));
  d.ctx.build();                         // «Шинэ бодлого»
  assert.notStrictEqual(d.ctx.E1K.seed(), 'k3x9q2');
});

test('e1k.js: «Бодолтын PPT» товч — ЭЕШ 1000-ийн бүх хуудас (4 хэсгийн 16 + сэдвийн 22) бүрэн бодолттой, товч харагдана', () => {
  const ALL = fs.readdirSync(F.WT).filter(f => /^eesh1000-.*\.html$/.test(f));
  const OPEN = ALL;
  assert.strictEqual(ALL.filter(f => /^eesh1000-\d+\.html$/.test(f)).length, 16, '4 хэсэг × 4 хуудас');
  assert.strictEqual(ALL.length, 16 + 22, 'сэдвийн 22 хуудас');
  OPEN.forEach(f => {
    for (const s of ['aaaa', 'k3x9q2', 'zzzzzz']) {
      const p = pageCtx(f, '#s=' + s);
      assert.strictEqual(p.ctx.E1K.sol.ready(), true, f + ' ' + s);
      assert.strictEqual(p.els.solBtn.style.display, '', f);
    }
  });
  // бусад хуудас (хэсгийн ба сэдвийн): товч зөвхөн бүх бодлого s-тэй үед
  fs.readdirSync(F.WT).filter(f => /^eesh1000-.*\.html$/.test(f) && !OPEN.includes(f)).forEach(f => {
    const q = pageCtx(f, '#s=aaaa'), full = q.ctx.E1K.cur().every(g => Array.isArray(g.s) && g.s.length > 0);
    assert.strictEqual(q.ctx.E1K.sol.ready(), full, f);
    assert.strictEqual(q.els.solBtn.style.display, full ? '' : 'none', f);
  });
  const ctx = pageCtx('eesh1000-2.html', '#s=b00b').ctx.E1K.sol.ctx();
  assert.deepStrictEqual([ctx.slug, ctx.seed, ctx.title, ctx.first, ctx.probs.length], ['eesh1000-2', 'b00b', 'ЭЕШ 1000 1-2', 26, 25]);
});

test('e1k.js: PPT товч .btn биш (ws-store.js түгжээ «.bar .btn:not(.refresh)» = хэвлэх товчийг нууж, нээхдээ «.bar .btn»-ийг харуулдаг); QR горимд бодолт ба PPT байхгүй', () => {
  const p = pageCtx('eesh1000-1.html', '#s=k3x9q2');
  const tags = [...p.els.bar.innerHTML.matchAll(/<button class="([^"]*)"[^>]*>/g)].map(m => ({ tag: m[0], cls: m[1].split(/\s+/) }));
  const sol = tags.find(t => /id="solBtn"/.test(t.tag));
  assert.ok(sol && !sol.cls.includes('btn'), 'solBtn нь .btn классгүй');
  assert.match(tags.find(t => t.cls.includes('btn') && !t.cls.includes('refresh')).tag, /onclick="window\.print\(\)"/);
  assert.strictEqual(p.els.solBtn.style.display, '');
  assert.match(p.els.sheet.innerHTML, /id="sols"/);
  const q = pageCtx('eesh1000-1.html', '#s=k3x9q2', '?qr=1');
  assert.strictEqual(q.ctx.E1K.sol.ready(), true);
  assert.strictEqual(q.els.solBtn.style.display, 'none');
  assert.strictEqual(q.els.ssl.style.display, 'none');
  assert.doesNotMatch(q.els.sheet.innerHTML, /id="sols"|class="sol"/);
});

test('e1k-sol.js: бодолтын мөрийг алхмуудад хуваана (текст / $$…$$ / цэг таслал залгана / хүснэгт бүхэлдээ)', () => {
  const ctx = vm.createContext({ document: {}, window: {} });
  vm.runInContext('var window=this;', ctx);
  vm.runInContext(fs.readFileSync(path.join(F.WT, 'e1k-sol.js'), 'utf8'), ctx);
  const B = (h) => JSON.parse(JSON.stringify(ctx.E1KSOL.beatsOf(h)));
  assert.deepStrictEqual(B('Хаалтыг задалбал $$x=1.$$'), [{ k: 'tx', h: 'Хаалтыг задалбал' }, { k: 'eq', h: '$$x=1.$$' }]);
  assert.deepStrictEqual(B('А $$a=b$$ тул $$c=d$$.'), [{ k: 'tx', h: 'А' }, { k: 'eq', h: '$$a=b$$' }, { k: 'tx', h: 'тул' }, { k: 'eq', h: '$$c=d$$.' }]);
  assert.deepStrictEqual(B('Зөвхөн текст $x$.'), [{ k: 'tx', h: 'Зөвхөн текст $x$.' }]);
  assert.strictEqual(B('<table class="e1k-tbl"><tr><td>$$1$$</td></tr></table>').length, 1);
  // Хариу: олон хэсэгтэйг таслалаар тусад нь мөр таслахгүй (KaTeX «g =» / «5» болгож хуваахгүй); хаалт/олонлог доторхыг хөндөхгүй
  const A = (h) => ctx.E1KSOL.ansGroups(h);
  assert.strictEqual(A('$a=1,\\ b=6,\\ g=5$'), '<span class="nw">$a=1$,</span> <span class="nw">$b=6$,</span> <span class="nw">$g=5$</span>');
  assert.strictEqual(A('$a=1$, $b=6$, $g=5$'), '<span class="nw">$a=1$,</span> <span class="nw">$b=6$,</span> <span class="nw">$g=5$</span>');
  assert.strictEqual(A('$5$ км/цаг'), '<span class="nw">$5$</span> км/цаг');
  assert.strictEqual(A('$$a,b$$'), '$$a,b$$');
  // хаалт/олонлог/аравтын доторх таслалаар хуваахгүй (томьёо бүтнээрээ үлдэнэ)
  ['$\\{1,2\\}$', '$x\\in[1,2)$', '$(1;\\ 2]$', '$18\\,000$', '$\\left(1,\\ 2\\right)$', '$7{,}2$'].forEach((h) => assert.deepStrictEqual(A(h).match(/\$[^$]+\$/g), [h], h));
  // 1-р хэсгийн бодлогын бүх бодолт хоосон бус алхамд хуваагдана
  ['eesh1000-1.html', 'eesh1000-4.html'].forEach(f => {
    pageCtx(f, '#s=k3x9q2').ctx.E1K.cur().forEach((g, i) => g.s.forEach((s) => {
      const bs = B(s);
      assert.ok(bs.length >= 1 && bs.every(b => b.h.trim().length > 0), f + ' #' + (i + 1));
      bs.filter(b => b.k === 'eq').forEach(b => assert.match(b.h, /^\$\$[\s\S]+\$\$[.,;:]*$/));
    }));
  });
});

test('vercel.json: e1k-sol.js статикаар; хуудсууд e1k.js?v=4 (кэш шинэчлэгдэнэ)', () => {
  const v = JSON.parse(fs.readFileSync(path.join(F.WT, 'vercel.json'), 'utf8'));
  assert.ok(v.builds.some(b => b.src === 'e1k-sol.js' && b.use === '@vercel/static'));
  fs.readdirSync(F.WT).filter(f => /^eesh1000-.*\.html$/.test(f)).forEach(f => {
    const h = fs.readFileSync(path.join(F.WT, f), 'utf8');
    assert.match(h, /\/e1k\.js\?v=4"/, f);
  });
  assert.match(fs.readFileSync(path.join(F.WT, 'e1k.js'), 'utf8'), /\/e1k-sol\.js\?v=4/);
});

test('e1k-sol.js: «(» мөрийн төгсгөлд ганцаараа үлдэхгүй — glue() нь богино томьёог өмнөх хаалттай нь nowrap болгоно', () => {
  const js = fs.readFileSync(path.join(F.WT, 'e1k-sol.js'), 'utf8');
  assert.match(js, /CTX\.render\(sl\);\s*unwrap\(sl\);\s*glue\(sl\);/, 'render-ийн дараа');
  // Хуурамч DOM (бодит бүтэц): «… ≠ 0 (» + <span class="nw"><span><span class="katex">…</span></span>).</span>
  //   (auto-render томьёог ангигүй <span>-д, nwInline түүнийг .nw-д ороодог) → хаалт томьёотой нэг nowrap-д
  const mk = (tag, cls) => ({ nodeType: 1, tagName: String(tag).toUpperCase(), className: cls || '', childNodes: [], parentNode: null,
    classList: { contains(c) { return (this.o.className || '').split(/\s+/).includes(c); } },
    get firstChild() { return this.childNodes[0] || null; },
    get previousSibling() { const p = this.parentNode; if (!p) return null; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; },
    appendChild(n) { if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); n.parentNode = this; this.childNodes.push(n); return n; },
    insertBefore(n, ref) { if (n.parentNode) n.parentNode.childNodes.splice(n.parentNode.childNodes.indexOf(n), 1); n.parentNode = this; this.childNodes.splice(this.childNodes.indexOf(ref), 0, n); return n; },
    closest(sel) { let e = this; while (e) { if (e.className && sel.split(',').some(s => (e.className || '').split(/\s+/).includes(s.trim().replace(/^\./, '')))) return e; e = e.parentNode; } return null; },
    getClientRects() { return [{ width: this.w || 0 }]; }, getBoundingClientRect() { return { width: this.w || 0 }; } });
  const fix = (n) => { n.classList.o = n; return n; };
  const txt = (v) => ({ nodeType: 3, nodeValue: v, parentNode: null, get previousSibling() { const p = this.parentNode; const i = p.childNodes.indexOf(this); return i > 0 ? p.childNodes[i - 1] : null; } });
  function slide(kw, bare) {
    const box = fix(mk('div', 'e1s-b')); box.w = 600;
    const t = txt('Хуваарь тэг биш байх ёстой ('); box.appendChild(t);
    const nw = fix(mk('span', 'nw')), ar = fix(mk('span')), k = fix(mk('span', 'katex')); k.w = kw; ar.w = kw; nw.w = kw;
    if (bare) { box.appendChild(k); } else { box.appendChild(nw); nw.appendChild(ar); ar.appendChild(k); nw.appendChild(txt(').')); }
    const sl = { querySelectorAll: (s) => (s === '.katex' ? [k] : []) };
    return { box, t, nw: bare ? k : nw, k, sl };
  }
  const doc = { createElement: (tag) => fix(mk(tag)), createTextNode: (v) => txt(v) };
  const ctx = vm.createContext({ document: doc, window: {} });
  vm.runInContext('var window=this;', ctx);
  vm.runInContext(js, ctx);
  ctx.__glue = ctx.E1KSOL.glue;
  assert.strictEqual(typeof ctx.__glue, 'function');
  const a = slide(200); ctx.__glue(a.sl);
  assert.strictEqual(a.t.nodeValue, 'Хуваарь тэг биш байх ёстой ', 'хаалтыг текстээс салгана');
  const g = a.box.childNodes[1];
  assert.strictEqual(g.className, 'nw'); assert.strictEqual(g.childNodes[0].nodeValue, '('); assert.strictEqual(g.childNodes[1], a.nw, 'хаалт + томьёо нэг nowrap');
  const b = slide(500); ctx.__glue(b.sl);                      // хайрцгийн 60%-иас урт → хүрэхгүй
  assert.strictEqual(b.t.nodeValue, 'Хуваарь тэг биш байх ёстой ('); assert.strictEqual(b.box.childNodes[1], b.nw);
  const c = slide(150, true); ctx.__glue(c.sl);                // бүрхүүлгүй .katex
  assert.strictEqual(c.box.childNodes[1].className, 'nw'); assert.strictEqual(c.box.childNodes[1].childNodes[1], c.k);
});
