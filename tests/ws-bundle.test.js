// Дасгалын төвийн хугацаат багц + шинэ хэрэглэгчийн 7 хоногийн хямдрал (api/_wsoffer.js, api/qpay.js — эзэмшигч 2026-11-20):
//  • 1 сар · 1 анги 9,900₮; 3 сар → 3 анги (89,100 → 39,900), 6 сар → 6 анги (356,400 → 69,900), 12 сар → бүх анги (1,306,800 → 119,900)
//  • Хямдрал зөвхөн ажлын хуудасны эрх ХУДАЛДАН АВААГҮЙ дансанд, бүртгүүлснээс 7 хоног (хуучин данс — WS_OFFER_FROM-оос)
//  • Олголт claim-тай НЭГ транзакцад, одоогийн дуусах хугацаан ДЭЭР нэмэгдэнэ (дуусахаас өмнө сунгавал хоног алдагдахгүй)
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const jwt = require('jsonwebtoken');
const F = require('./_gamefake');
const qpay = require('../api/qpay.js');
const OF = require('../api/_wsoffer.js');

const DAY = 864e5;
const wsTok = (email) => jwt.sign({ email: email, ws: true }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
const Q = (action, body) => F.call(qpay, { method: 'POST', query: { action: action }, body: body || {} });
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / DAY;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, (msg || '') + ' ' + a + ' ≈ ' + b);
const G3 = ['6-р анги', '7-р анги', '8-р анги'];
function reg(email, agoDays) { F.db.wsLogin.set(email, { email: email, verified: true, created_at: new Date(Date.now() - agoDays * DAY) }); }
function grade(email, g) { return F.db.wsGrade.find((r) => r.email === email && r.grade === g); }
async function buy(email, body, paid) {
  const r = await Q('create', Object.assign({ wstoken: wsTok(email) }, body));
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  const inv = r.body.invoice.invoice_id;
  F.qp.paid.set(inv, paid != null ? paid : r.body.amount);
  return { inv: inv, create: r.body, check: await Q('check', { invoice_id: inv, email: email }) };
}

beforeEach(() => { F.reset(); process.env.WS_OFFER_FROM = new Date(Date.now() - 30 * DAY).toISOString(); });

test('_wsoffer: жинхэнэ үнэ = анги × сар × 9,900; хямдралтай үнэ; ангийн сонголт яг N, давхардалгүй, каталогт', () => {
  const all = ['2-р анги', '3-р анги', '4-р анги', '5-р анги', '6-р анги', '7-р анги', '8-р анги', '9-р анги', '10-р анги', '11-р анги', '12-р анги', 'ЭЕШ', 'Олимпиад'];
  assert.deepStrictEqual(OF.view(true, all).map((b) => [b.months, b.count, b.list, b.price]),
    [[3, 3, 89100, 39900], [6, 6, 356400, 69900], [12, 11, 1306800, 119900]], 'бүх анги = 11 (2–12-р), ЭЕШ/Олимпиад нэмэлт');
  assert.deepStrictEqual(OF.view(false, all).map((b) => b.price), [89100, 356400, 1306800], 'хямдралгүй — жинхэнэ үнэ');
  assert.deepStrictEqual(OF.normGrades(['8-р анги', '6-р анги', '7-р анги'], 3, all), G3, 'каталогийн дарааллаар');
  assert.strictEqual(OF.normGrades(['6-р анги', '6-р анги', '7-р анги'], 3, all), null, 'давхардал');
  assert.strictEqual(OF.normGrades(['6-р анги', '7-р анги'], 3, all), null, 'дутуу');
  assert.strictEqual(OF.normGrades(['6-р анги', '7-р анги', '13-р анги'], 3, all), null, 'каталогт байхгүй');
  assert.strictEqual(OF.normGrades('6-р анги', 3, all), null);
  assert.strictEqual(OF.normGrades([6, 7, 8], 3, all), null, 'тоо биш мөр');
  assert.strictEqual(OF.bundle(9), null, '9 сарын багц байхгүй');
});

test('wsstatus: шинэ данс (худалдан аваагүй) — 7 хоногийн хямдрал, тоолуурын until = бүртгэл + 7 хоног; токенгүй → «шинэ бүртгэл» харагдац', async () => {
  reg('new@x.mn', 2);
  let r = await Q('wsstatus', { wstoken: wsTok('new@x.mn') });
  assert.strictEqual(r.body.offer.eligible, true);
  near((Date.parse(r.body.offer.until) - Date.now()) / DAY, 5, 'бүртгүүлснээс 7 хоног');
  assert.deepStrictEqual(r.body.bundles.map((b) => b.price), [39900, 69900, 119900]);
  assert.deepStrictEqual(r.body.bundles.map((b) => b.list), [89100, 356400, 1306800]);
  assert.ok(Array.isArray(r.body.grade_list) && r.body.grade_list.indexOf('6-р анги') >= 0 && r.body.grade_list.indexOf('ЭЕШ') >= 0);
  assert.ok(Math.abs(r.body.server_now - Date.now()) < 5000, 'server_now');
  assert.strictEqual(r.body.all_expires_at, null);
  r = await Q('wsstatus', {});
  assert.deepStrictEqual([r.body.offer.eligible, r.body.offer.anon], [true, true], 'нэвтрээгүй — шинэ бүртгэлд хямдрал');
  assert.deepStrictEqual(r.body.bundles.map((b) => b.price), [39900, 69900, 119900]);
  r = await Q('wsprices', {});
  assert.deepStrictEqual(r.body.bundles.map((b) => b.price), [39900, 69900, 119900]);
  assert.strictEqual(r.body.offer_days, 7);
});

test('wsstatus: хуучин данс — WS_OFFER_FROM-оос 7 хоног («өнөөдрөөс эхлээд»); хугацаа өнгөрсөн / худалдан авсан / DB алдаа → жинхэнэ үнэ', async () => {
  reg('old@x.mn', 200);
  process.env.WS_OFFER_FROM = new Date(Date.now() - 1 * DAY).toISOString();
  let r = await Q('wsstatus', { wstoken: wsTok('old@x.mn') });
  assert.strictEqual(r.body.offer.eligible, true, 'хуучин данс ч 7 хоног авна');
  near((Date.parse(r.body.offer.until) - Date.now()) / DAY, 6);
  process.env.WS_OFFER_FROM = new Date(Date.now() - 8 * DAY).toISOString();
  r = await Q('wsstatus', { wstoken: wsTok('old@x.mn') });
  assert.deepStrictEqual([r.body.offer.eligible, r.body.offer.until], [false, null], '7 хоног өнгөрсөн');
  assert.deepStrictEqual(r.body.bundles.map((b) => b.price), [89100, 356400, 1306800]);
  // Ажлын хуудасны эрх худалдаж авч байсан хэрэглэгч — 7 хоног өнгөрсөн ч сунгахдаа үргэлж хямдралтай (тоолуургүй)
  reg('buyer@x.mn', 200);
  F.db.wsPurch.push({ email: 'buyer@x.mn', invoice_id: 'OLD1', amount: 9900, grade: '3-р анги' });
  r = await Q('wsstatus', { wstoken: wsTok('buyer@x.mn') });
  assert.deepStrictEqual([r.body.offer.eligible, r.body.offer.customer, r.body.offer.until], [true, true, null], 'байнгын хэрэглэгч');
  assert.deepStrictEqual(r.body.bundles.map((b) => b.price), [39900, 69900, 119900]);
  // Шалгаж чадахгүй (DB) → хямдралгүй (fail-closed)
  reg('f@x.mn', 1);
  F.db.failOffer = true;
  r = await Q('wsstatus', { wstoken: wsTok('f@x.mn') });
  assert.strictEqual(r.body.offer.eligible, false);
});

test('create wsbundle: 3 сар · 3 анги = 39,900 (хямдрал) / 89,100 (хямдралгүй); ангиудыг JSON-оор, нэрийг « + »-ээр хадгална', async () => {
  reg('a@x.mn', 1);
  let r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsbundle', months: 3, grades: ['8-р анги', '6-р анги', '7-р анги'], amount: 1 });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.amount, r.body.offer, r.body.months], [39900, true, 3], 'клиентийн amount-д итгэхгүй');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(r.body.grades)), G3);
  const row = F.db.wsPending.get(r.body.invoice.invoice_id);
  assert.deepStrictEqual([row.months, row.amount, row.grade, JSON.parse(row.grades), row.granted], [3, 39900, G3.join(' + '), G3, false]);
  assert.strictEqual(F.qp.invoices[0].body.amount, 39900);
  assert.match(F.qp.invoices[0].body.invoice_description, /3 сарын багц — 6-р анги, 7-р анги, 8-р анги/);
  // хямдралгүй данс
  reg('b@x.mn', 30);
  process.env.WS_OFFER_FROM = new Date(Date.now() - 10 * DAY).toISOString();
  r = await Q('create', { wstoken: wsTok('b@x.mn'), plan: 'wsbundle', months: 3, grades: G3 });
  assert.deepStrictEqual([r.body.amount, r.body.offer], [89100, false]);
  r = await Q('create', { wstoken: wsTok('b@x.mn'), plan: 'wsbundle', months: 12 });
  assert.strictEqual(r.body.amount, 1306800);
});

test('create wsbundle: буруу сонголт → 400 (нэхэмжлэх үүсэхгүй); хуучин wsmonths 3/6/9 → «хуудсаа шинэчил», 12 сар → бүх анги', async () => {
  reg('a@x.mn', 1);
  const bad = [
    [{ months: 3, grades: ['6-р анги', '7-р анги'] }, /3 анги сонгоно уу/],
    [{ months: 6, grades: G3 }, /6 анги сонгоно уу/],
    [{ months: 3, grades: ['6-р анги', '6-р анги', '7-р анги'] }, /3 анги/],
    [{ months: 3, grades: ['6-р анги', '7-р анги', 'Хакер'] }, /3 анги/],
    [{ months: 3, grades: '6-р анги' }, /3 анги/],
    [{ months: 9, grades: G3 }, /Багц буруу/],
    [{ months: 1, grades: ['6-р анги'] }, /Багц буруу/],
  ];
  for (const [b, re] of bad) {
    const r = await Q('create', Object.assign({ wstoken: wsTok('a@x.mn'), plan: 'wsbundle' }, b));
    assert.strictEqual(r.statusCode, 400, JSON.stringify(b));
    assert.match(r.body.error, re);
  }
  for (const m of [3, 6, 9]) {
    const r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsmonths', months: m });
    assert.deepStrictEqual([r.statusCode, r.body.refresh], [400, true], 'wsmonths ' + m);
  }
  assert.strictEqual(F.qp.invoices.length, 0, 'QPay нэхэмжлэх үүсээгүй');
  let r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsmonths', months: 12 });
  assert.deepStrictEqual([r.statusCode, r.body.amount], [200, 119900], 'хуучин клиентийн 1 жил → бүх анги 12 сар');
  r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsyear' });
  assert.strictEqual(r.body.amount, 119900);
  assert.strictEqual(F.db.wsPending.get(r.body.invoice.invoice_id).grades, null, 'бүх анги — grades байхгүй');
  r = await Q('create', { plan: 'wsbundle', months: 3, grades: G3 });
  assert.strictEqual(r.statusCode, 401, 'токенгүй');
});

test('check: багц төлөгдвөл 3 анги × 90 хоног НЭГ удаа; давтан check/callback/reconcile давхар олгохгүй; дараа нь хямдрал хаагдана', async () => {
  reg('a@x.mn', 1);
  const x = await buy('a@x.mn', { plan: 'wsbundle', months: 3, grades: G3 });
  assert.strictEqual(x.check.body.paid, true, JSON.stringify(x.check.body));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(x.check.body.grades)), G3);
  G3.forEach((g) => near(daysLeft(grade('a@x.mn', g).expires_at), 90, g));
  assert.strictEqual(F.db.wsAccess.size, 0, 'бүх ангийн эрх олгохгүй');
  assert.deepStrictEqual(F.db.wsPurch.map((p) => [p.amount, p.months, p.grade]), [[39900, 3, G3.join(' + ')]]);
  await Q('check', { invoice_id: x.inv, email: 'a@x.mn' });
  await F.call(qpay, { method: 'POST', query: { action: 'callback', email: 'a@x.mn' } });
  G3.forEach((g) => near(daysLeft(grade('a@x.mn', g).expires_at), 90, 'давхар сунгахгүй ' + g));
  assert.strictEqual(F.db.wsPurch.length, 1);
  const st = await Q('wsstatus', { wstoken: wsTok('a@x.mn'), slug: 'troichlen-zadlal-12.html' });
  assert.deepStrictEqual([st.body.offer.eligible, st.body.offer.customer, st.body.offer.until], [true, true, null], 'худалдан авсны дараа — байнгын хэрэглэгчийн хямдрал, тоолуургүй');
  assert.deepStrictEqual(st.body.grades.map((g) => g.grade).sort(), G3.slice().sort());
});

test('сунгалт: эрх дуусахаас өмнө авбал үлдсэн хоног дээр нэмэгдэнэ (анги, бүх анги, 1 сар)', async () => {
  reg('a@x.mn', 1);
  F.db.wsGrade.push({ email: 'a@x.mn', grade: '6-р анги', expires_at: new Date(Date.now() + 2 * DAY) });
  await buy('a@x.mn', { plan: 'wsbundle', months: 3, grades: G3 });
  near(daysLeft(grade('a@x.mn', '6-р анги').expires_at), 92, '2 + 90');
  near(daysLeft(grade('a@x.mn', '7-р анги').expires_at), 90);
  await buy('a@x.mn', { plan: 'wsgrade', grade: '6-р анги', months: 1 });
  near(daysLeft(grade('a@x.mn', '6-р анги').expires_at), 122, '92 + 30');
  F.db.wsAccess.set('a@x.mn', new Date(Date.now() + 3 * DAY));
  const y = await buy('a@x.mn', { plan: 'wsbundle', months: 12 });
  assert.strictEqual(y.create.amount, 119900, 'худалдан авч байсан — сунгахдаа хямдралтай');
  near(daysLeft(F.db.wsAccess.get('a@x.mn')), 368, '3 + 365');
  const st = await Q('wsstatus', { wstoken: wsTok('a@x.mn') });
  near(daysLeft(st.body.all_expires_at), 368, '«Миний эрх» — бүх ангийн дуусах хугацаа');
});

test('транзакц: ангийн олголт унавал claim буцна (granted=FALSE, бүртгэлгүй) — дараагийн check-д НЭГ удаа олгоно', async () => {
  reg('a@x.mn', 1);
  const r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsbundle', months: 6, grades: ['2-р анги', '3-р анги', '4-р анги', '5-р анги', '6-р анги', '7-р анги'] });
  assert.strictEqual(r.body.amount, 69900);
  const inv = r.body.invoice.invoice_id;
  F.qp.paid.set(inv, 69900);
  F.db.failGradeExtend = true;
  let c = await Q('check', { invoice_id: inv, email: 'a@x.mn' });
  assert.notStrictEqual(c.body.paid, true);
  assert.deepStrictEqual([F.db.wsPending.get(inv).granted, F.db.wsGrade.length, F.db.wsPurch.length], [false, 0, 0]);
  assert.strictEqual(F.openTx(), 0, 'транзакц хаагдсан');
  F.db.failGradeExtend = false;
  c = await Q('check', { invoice_id: inv, email: 'a@x.mn' });
  assert.strictEqual(c.body.paid, true);
  assert.strictEqual(F.db.wsGrade.length, 6);
  F.db.wsGrade.forEach((g) => near(daysLeft(g.expires_at), 180));
  assert.strictEqual(F.db.wsPurch.length, 1);
});

test('дутуу төлбөр олгохгүй; задрахгүй grades (гараар эвдсэн мөр) — «бүх анги» болж олгогдохгүй', async () => {
  reg('a@x.mn', 1);
  let x = await buy('a@x.mn', { plan: 'wsbundle', months: 3, grades: G3 }, 39899);
  assert.strictEqual(x.check.body.paid, false, 'дутуу');
  assert.strictEqual(F.db.wsGrade.length, 0);
  const r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsbundle', months: 3, grades: G3 });
  const inv = r.body.invoice.invoice_id;
  F.db.wsPending.get(inv).grades = '{"bad"';
  F.qp.paid.set(inv, 39900);
  const c = await Q('check', { invoice_id: inv, email: 'a@x.mn' });
  assert.notStrictEqual(c.body.paid, true);
  assert.deepStrictEqual([F.db.wsPending.get(inv).granted, F.db.wsAccess.size, F.db.wsGrade.length], [false, 0, 0]);
});

test('промо код ба callback/reconcile: багцын үнэ дээр промо; callback багцыг ангиудаар нь олгоно; reconcile plan=wsbundle', async () => {
  reg('a@x.mn', 1);
  let r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsbundle', months: 3, grades: G3, promo: 'bagsh20' });
  assert.strictEqual(r.body.amount, 31920, '39,900 × 0.8 (env BAGSH20)');
  assert.strictEqual(F.db.wsPending.get(r.body.invoice.invoice_id).promo, 'BAGSH20');
  F.qp.paid.set(r.body.invoice.invoice_id, 31920);
  await F.call(qpay, { method: 'POST', query: { action: 'callback', email: 'a@x.mn' } });
  G3.forEach((g) => near(daysLeft(grade('a@x.mn', g).expires_at), 90));
  // reconcile — админ (төлөгдсөн атлаа олгогдоогүй)
  reg('b@x.mn', 1);
  r = await Q('create', { wstoken: wsTok('b@x.mn'), plan: 'wsbundle', months: 3, grades: G3 });
  F.qp.paid.set(r.body.invoice.invoice_id, 39900);
  const adm = jwt.sign({ role: 'admin', admin: true, email: 'admin@x.mn' }, process.env.JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
  const rc = await F.call(qpay, { method: 'POST', query: { action: 'ws_reconcile' }, body: {}, headers: { authorization: 'Bearer ' + adm } });
  assert.strictEqual(rc.statusCode, 200, JSON.stringify(rc.body));
  assert.ok(rc.body.granted.some((g) => g.plan === 'wsbundle' && g.email === 'b@x.mn' && g.grades.length === 3), JSON.stringify(rc.body));
  G3.forEach((g) => near(daysLeft(grade('b@x.mn', g).expires_at), 90));
});

test('7 хоног өнгөрсөн, худалдан аваагүй → жинхэнэ үнэ; 1 сар авч хэрэглэгч болсны дараа багц хямдралтай', async () => {
  reg('late@x.mn', 40);
  process.env.WS_OFFER_FROM = new Date(Date.now() - 20 * DAY).toISOString();
  let r = await Q('create', { wstoken: wsTok('late@x.mn'), plan: 'wsbundle', months: 6, grades: ['2-р анги', '3-р анги', '4-р анги', '5-р анги', '6-р анги', '7-р анги'] });
  assert.deepStrictEqual([r.body.amount, r.body.offer], [356400, false]);
  await buy('late@x.mn', { plan: 'wsgrade', grade: '4-р анги', months: 1 });
  r = await Q('create', { wstoken: wsTok('late@x.mn'), plan: 'wsbundle', months: 6, grades: ['2-р анги', '3-р анги', '4-р анги', '5-р анги', '6-р анги', '7-р анги'] });
  assert.deepStrictEqual([r.body.amount, r.body.offer], [69900, true]);
});

test('1 сар · 1 анги (wsgrade) хуучин шигээ 9,900₮; клиент amount/grades-д итгэхгүй', async () => {
  reg('a@x.mn', 1);
  const x = await buy('a@x.mn', { plan: 'wsgrade', grade: '3-р анги', months: 1, grades: G3, amount: 100 });
  assert.strictEqual(x.create.amount, 9900);
  assert.strictEqual(x.check.body.grade, '3-р анги');
  near(daysLeft(grade('a@x.mn', '3-р анги').expires_at), 30);
  assert.strictEqual(F.db.wsGrade.length, 1, 'grades-ийг үл тооно');
  assert.deepStrictEqual(F.db.unknown, [], 'тодорхойгүй SQL алга');
});

test('богино зам (vercel.json /negativ → negativ-too-100.html): анги тодорхойлогдож, ангийн эрх тэр хуудсыг нээнэ', async () => {
  reg('a@x.mn', 1);
  let r = await Q('wsstatus', { wstoken: wsTok('a@x.mn'), slug: 'negativ' });
  assert.strictEqual(r.body.grade, '6-р анги', 'жинхэнэ файлын ангиар');
  await buy('a@x.mn', { plan: 'wsgrade', grade: '6-р анги', months: 1 });
  r = await Q('wsstatus', { wstoken: wsTok('a@x.mn'), slug: 'negativ' });
  assert.deepStrictEqual([r.body.active, r.body.scope], [true, 'grade']);
  r = await Q('wsstatus', { wstoken: wsTok('a@x.mn'), slug: 'admin' });
  assert.deepStrictEqual([r.body.active, r.body.grade], [false, null], 'ажлын хуудас биш зам — ангигүй');
});

test('хямдралын эрхийг шалгаж чадсангүй (DB) → нэхэмжлэх үүсгэхгүй 503 (жинхэнэ үнээр нэхэмжлэхгүй)', async () => {
  reg('a@x.mn', 1);
  F.db.failOffer = true;
  const r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'wsbundle', months: 3, grades: G3 });
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(F.qp.invoices.length, 0);
  assert.strictEqual(F.db.wsPending.size, 0);
});

test('ЭЕШ багц: ажлын хуудасны хэсэг ч үлдсэн хоног дээр нэмэгдэнэ (сунгах цонхноос авахад)', async () => {
  reg('a@x.mn', 1);
  F.db.wsGrade.push({ email: 'a@x.mn', grade: 'ЭЕШ', expires_at: new Date(Date.now() + 2 * DAY) });
  const r = await Q('create', { wstoken: wsTok('a@x.mn'), plan: 'eeshpack' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  F.qp.paid.set(r.body.invoice.invoice_id, r.body.amount);
  const c = await Q('check', { invoice_id: r.body.invoice.invoice_id, email: 'a@x.mn' });
  assert.strictEqual(c.body.paid, true, JSON.stringify(c.body));
  near(daysLeft(grade('a@x.mn', 'ЭЕШ').expires_at), 32, '2 + 30');
});
