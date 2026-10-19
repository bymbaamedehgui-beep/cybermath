// Дасгалын төвийн тоглоом — АНГИ (gg-ws): худалдан авалтын анги (pay_pending.game_grade → game_purchases.grade),
// одоогийн анги (game_access.grade — launch-аар шинэчлэгдэнэ), status.grades, launch url-ийн ?grade=&topic=, админы олголт.
// Анги нь ҮНЭ/ЭРХ/ХУГАЦААНД ОГТ нөлөөлөхгүй — эдгээрийг энд давхар шалгана.
// Ажиллуулах: node --test tests/games-grade-ws.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const qpay = require(path.join(F.API, 'qpay.js'));
const games = require(path.join(F.API, 'games.js'));
const GM = require(path.join(F.API, '_games.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const cmTok = (e, tv) => jwt.sign({ email: e, role: 'student', tv: tv | 0 }, SEC);
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const ADMIN = bearer(jwt.sign({ admin: true }, SEC));
const Q = (action, body, o) => F.call(qpay, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const G = (action, body, o) => F.call(games, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const dev = (id) => ({ 'x-device-id': id });
const launchWs = (email, game, extra) => G('launch', Object.assign({ game: game, realm: 'ws', wstoken: wsTok(email) }, extra || {}), { headers: dev('devgrade1') });
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / F.DAY;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, (msg || '') + ' ' + a + ' ≈ ' + b);
function access(realm, email, key) { return F.db.access.get(realm + '|' + email + '|' + key) || null; }
function give(realm, email, key, days, grade) {
  F.db.access.set(realm + '|' + email + '|' + key, { realm: realm, email: email, game_key: key,
    expires_at: new Date(Date.now() + (days == null ? 30 : days) * F.DAY), updated_at: new Date(Date.now() - 3600e3), grade: grade == null ? null : grade });
}
async function buy(email, game, grade, extra) {
  const b = Object.assign({ plan: 'game', realm: 'ws', game: game, wstoken: wsTok(email) }, extra || {});
  if (grade !== undefined) b.game_grade = grade;
  const r = await Q('create', b);
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  const inv = r.body.invoice.invoice_id;
  F.qp.paid.set(inv, r.body.amount);
  const c = await Q('check', { invoice_id: inv, email: email });
  assert.strictEqual(c.body.paid, true, JSON.stringify(c.body));
  return { inv: inv, create: r.body, check: c.body };
}

beforeEach(() => F.reset());

test('_games: normGrade / normTopic allowlist (6–12; бусад → null)', () => {
  assert.deepStrictEqual(GM.GRADES, ['6', '7', '8', '9', '10', '11', '12']);
  ['6', '7', '10', '12', ' 8 ', 9, 11].forEach((v) => assert.strictEqual(GM.normGrade(v), String(v).trim(), JSON.stringify(v)));
  ['5', '13', '0', '08', '7a', 'abc', '', null, undefined, 6.5, [], {}, ['8'], true, '__proto__'].forEach((v) =>
    assert.strictEqual(GM.normGrade(v), null, JSON.stringify(v)));
  assert.strictEqual(GM.normTopic('512'), '512');
  assert.strictEqual(GM.normTopic(0), '0');
  assert.strictEqual(GM.normTopic('007'), '7');
  ['-1', '1234567', 'x', '1.5', '', null, {}].forEach((v) => assert.strictEqual(GM.normTopic(v), null, JSON.stringify(v)));
});

test('create: буруу анги (5, 13, 7a, 08, массив) → 400, нэхэмжлэх/мөр ҮҮСЭХГҮЙ; ангигүй (хуучин клиент) → 200, game_grade NULL', async () => {
  for (const bad of ['5', '13', 5, 13, '7a', '08', 'abc', ['8'], { g: 8 }, 6.5]) {
    const r = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('kid@x.mn'), game_grade: bad });
    assert.strictEqual(r.statusCode, 400, JSON.stringify(bad) + ' ' + JSON.stringify(r.body));
    assert.strictEqual(r.body.badGrade, true);
    assert.match(r.body.error, /Анги буруу/);
  }
  // body.grade (ижил утгатай нэр) ч шалгагдана
  assert.strictEqual((await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('kid@x.mn'), grade: '13' })).statusCode, 400);
  assert.strictEqual(F.qp.invoices.length, 0, 'QPay нэхэмжлэх үүсээгүй');
  assert.strictEqual(F.db.pay.size, 0, 'pay_pending мөр үүсээгүй');
  // ангигүй → NULL (cm болон хуучин кэштэй клиентийн нийцэл)
  const r = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('kid@x.mn') });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.grade, null);
  assert.strictEqual(F.db.pay.get(r.body.invoice.invoice_id).game_grade, null);
  assert.strictEqual(F.qp.invoices[0].body.invoice_description, 'CyberMath тоглоом — Судоку — 1 сар');
  // буруу анги нэвтрэлтээс ӨМНӨ шалгагдахгүй (токенгүй бол 401 хэвээр)
  assert.strictEqual((await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', game_grade: '13' })).statusCode, 401);
});

test('create: анги ҮНЭД нөлөөлөхгүй (6–12 бүгд ижил, GAME_PRICE); нэхэмжлэх дээр анги, тайлбарт «N-р анги»', async () => {
  const amounts = [];
  for (const g of GM.GRADES) {
    const r = await Q('create', { plan: 'game', realm: 'ws', game: 'mathmortal', wstoken: wsTok('g' + g + '@x.mn'), game_grade: g, amount: 1, months: 12 });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.grade, g);
    const row = F.db.pay.get(r.body.invoice.invoice_id);
    assert.deepStrictEqual([row.plan, row.months, row.game_key, row.realm, row.game_grade], ['game', 1, 'mathmortal', 'ws', g]);
    amounts.push(row.amount, r.body.amount, F.qp.invoices[F.qp.invoices.length - 1].body.amount);
  }
  assert.ok(amounts.every((a) => a === 1900), JSON.stringify(amounts));
  assert.strictEqual(F.qp.invoices[2].body.invoice_description, 'CyberMath тоглоом — MATH MORTAL — 8-р анги — 1 сар');
  process.env.GAME_PRICE = '2500';
  const r = await Q('create', { plan: 'game', realm: 'ws', game: 'ludo', wstoken: wsTok('p@x.mn'), game_grade: '12' });
  assert.strictEqual(F.db.pay.get(r.body.invoice.invoice_id).amount, 2500);
  // body.grade нэрээр ч хүлээн авна
  const r2 = await Q('create', { plan: 'game', realm: 'ws', game: 'ludo', wstoken: wsTok('p2@x.mn'), grade: '7' });
  assert.strictEqual(F.db.pay.get(r2.body.invoice.invoice_id).game_grade, '7');
});

test('төлбөр → game_access.grade + game_purchases.grade; сунгалт өөр ангиар → одоогийн анги солигдоно, хоног НЭМЭГДЭНЭ; ангигүй сунгалт хуучнаа хадгална', async () => {
  const a = await buy('kid@x.mn', 'sudoku', '8');
  assert.strictEqual(a.check.grade, '8');
  near(daysLeft(a.check.expiry), 30);
  assert.strictEqual(access('ws', 'kid@x.mn', 'sudoku').grade, '8');
  assert.deepStrictEqual(F.db.purch.map((p) => [p.invoice_id, p.grade, p.amount, p.days]), [[a.inv, '8', 1900, 30]]);
  assert.ok(F.tg.some((t) => t.indexOf('Судоку · 8-р анги') >= 0), 'Telegram-д анги');
  // дахин check — дахин олгохгүй, анги хэвээр
  await Q('check', { invoice_id: a.inv, email: 'kid@x.mn' });
  assert.strictEqual(F.db.purch.length, 1);

  const b = await buy('kid@x.mn', 'sudoku', '10');
  near(daysLeft(b.check.expiry), 60, 'хоног нэмэгдэнэ (ангиас үл хамаарна)');
  assert.strictEqual(access('ws', 'kid@x.mn', 'sudoku').grade, '10', 'одоогийн анги');
  assert.deepStrictEqual(F.db.purch.map((p) => p.grade), ['8', '10'], 'худалдан авалт бүр өөрийн ангитай');

  const c = await buy('kid@x.mn', 'sudoku', undefined);
  near(daysLeft(c.check.expiry), 90);
  assert.strictEqual(c.check.grade, undefined);
  assert.strictEqual(access('ws', 'kid@x.mn', 'sudoku').grade, '10', 'ангигүй сунгалт одоогийн ангийг арилгахгүй');
  assert.deepStrictEqual(F.db.purch.map((p) => p.grade), ['8', '10', null]);
  // reconcile жагсаалтад анги
  const r = await Q('create', { plan: 'game', realm: 'ws', game: 'numseq', wstoken: wsTok('late@x.mn'), game_grade: '6' });
  F.qp.paid.set(r.body.invoice.invoice_id, 1900);
  const rc = await Q('ws_reconcile', {}, { headers: ADMIN });
  assert.deepStrictEqual(rc.body.granted[0], { email: 'late@x.mn', plan: 'game', months: 1, amount: 1900, game: 'numseq', realm: 'ws', grade: '6' });
  assert.strictEqual(access('ws', 'late@x.mn', 'numseq').grade, '6');
});

test('pay_pending.game_grade эвдэрсэн (гараар бичсэн) байсан ч төлсөн эрх олгогдоно — анги NULL', async () => {
  F.db.pay.set('INVX', { invoice_id: 'INVX', email: 'x@x.mn', plan: 'game', months: 1, amount: 1900, event_id: null, granted: false,
    promo_code: null, game_key: 'daam', realm: 'ws', game_grade: '99', created_at: Date.now() });
  F.qp.paid.set('INVX', 1900);
  const c = await Q('check', { invoice_id: 'INVX', email: 'x@x.mn' });
  assert.strictEqual(c.body.paid, true, JSON.stringify(c.body));
  near(daysLeft(access('ws', 'x@x.mn', 'daam').expires_at), 30);
  assert.strictEqual(access('ws', 'x@x.mn', 'daam').grade, null);
  assert.strictEqual(F.db.purch[0].grade, null);
});

test('status: grades — тоглоом бүрийн одоогийн анги (тодорхой нь л); дууссан эрх орохгүй; games хэлбэр хэвээр', async () => {
  give('ws', 'a@x.mn', 'sudoku', 10, '8');
  give('ws', 'a@x.mn', 'chessmath', 10, null);       // хуучин (анги NULL)
  give('ws', 'a@x.mn', 'ludo', -1, '9');             // дууссан
  give('cm', 'a@x.mn', 'daam', 10, '7');             // өөр realm
  const r = await G('status', { realm: 'ws', wstoken: wsTok('a@x.mn') }, { headers: dev('devgrade1') });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual(Object.keys(r.body.games).sort(), ['chessmath', 'sudoku']);
  assert.ok(Object.values(r.body.games).every((v) => typeof v === 'string' && !isNaN(Date.parse(v))), 'games {key: ISO}');
  assert.deepStrictEqual(r.body.grades, { sudoku: '8' });
  assert.deepStrictEqual(await GM.activeGames('ws', 'a@x.mn'), r.body.games, 'activeGames хуучин хэлбэрээрээ');
});

test('launch: эрхтэй + хүчинтэй анги → game_access.grade UPDATE (мөр үүсгэхгүй, хугацаа/updated_at өөрчлөхгүй); url-д ?grade=&topic=', async () => {
  give('ws', 'k@x.mn', 'sudoku', 9, '7');
  const before = access('ws', 'k@x.mn', 'sudoku');
  const exp0 = before.expires_at.getTime(), upd0 = before.updated_at.getTime();
  let r = await launchWs('k@x.mn', 'sudoku', { grade: '10', topic: '512' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.match(r.body.url, /^\/sudoku\.html\?realm=ws&grade=10&topic=512&t=[A-Za-z0-9._%-]+$/, 'тасалбараас өмнө (gate cleanUrl хадгална)');
  const now = access('ws', 'k@x.mn', 'sudoku');
  assert.strictEqual(now.grade, '10');
  assert.strictEqual(now.expires_at.getTime(), exp0, 'хугацаа өөрчлөгдөхгүй');
  assert.strictEqual(now.updated_at.getTime(), upd0, 'updated_at өөрчлөгдөхгүй (админы жагсаалтын дараалал)');
  assert.deepStrictEqual(F.db.gradeSets, [['ws', 'k@x.mn', 'sudoku', '10']]);
  // ижил анги → бичихгүй (UPDATE ... IS DISTINCT FROM — 0 мөр)
  r = await launchWs('k@x.mn', 'sudoku', { grade: '10' });
  assert.match(r.body.url, /^\/sudoku\.html\?realm=ws&grade=10&topic=0&t=/, 'сэдэвгүй → topic=0');
  assert.strictEqual(access('ws', 'k@x.mn', 'sudoku').grade, '10');
  // буруу анги/сэдэв → үл тоомсорлоно (тоглоомыг хаахгүй), url хуучин хэлбэрээр
  for (const bad of ['13', '5', 'x', '', null]) {
    r = await launchWs('k@x.mn', 'sudoku', { grade: bad, topic: '9' });
    assert.strictEqual(r.statusCode, 200);
    assert.match(r.body.url, /^\/sudoku\.html\?realm=ws&t=[A-Za-z0-9._%-]+$/, JSON.stringify(bad));
  }
  r = await launchWs('k@x.mn', 'sudoku', { grade: '9', topic: '<script>' });
  assert.match(r.body.url, /\?realm=ws&grade=9&topic=0&t=/, 'буруу сэдэв → 0');
  assert.strictEqual(F.db.access.size, 1, 'шинэ мөр үүсээгүй');
  // эрхгүй тоглоом → 402, мөр үүсэхгүй
  r = await launchWs('k@x.mn', 'play2048', { grade: '8' });
  assert.strictEqual(r.statusCode, 402);
  assert.strictEqual(access('ws', 'k@x.mn', 'play2048'), null);
  // дууссан эрх → 402, анги бичигдэхгүй
  give('ws', 'k@x.mn', 'numseq', -1, '6');
  r = await launchWs('k@x.mn', 'numseq', { grade: '12' });
  assert.strictEqual(r.statusCode, 402);
  assert.strictEqual(access('ws', 'k@x.mn', 'numseq').grade, '6');
  // DB алдаа (UPDATE) тоглоомыг хаахгүй
  F.db.failGradeSet = true;
  r = await launchWs('k@x.mn', 'sudoku', { grade: '11' });
  assert.strictEqual(r.statusCode, 200);
  assert.match(r.body.url, /grade=11&topic=0/);
});

test('launch: external → <хаяг>/?grade=&topic=; inline → url-гүй (клиент embedUrl); анги нь эрх шалгалтад оролцохгүй', async () => {
  give('ws', 'k@x.mn', 'blockblast', 5, null);
  give('ws', 'k@x.mn', 'chessmath', 5, null);
  let r = await launchWs('k@x.mn', 'blockblast', { grade: '8', topic: '512' });
  assert.strictEqual(r.body.url, GM.GAMES.blockblast.url + '/?grade=8&topic=512');
  assert.strictEqual(access('ws', 'k@x.mn', 'blockblast').grade, '8');
  r = await launchWs('k@x.mn', 'blockblast');
  assert.strictEqual(r.body.url, GM.GAMES.blockblast.url, 'ангигүй → хуучин url');
  r = await launchWs('k@x.mn', 'chessmath', { grade: '9' });
  assert.deepStrictEqual([r.statusCode, r.body.kind, r.body.url], [200, 'inline', undefined]);
  assert.strictEqual(access('ws', 'k@x.mn', 'chessmath').grade, '9', 'inline embed-ийн launch ч одоогийн ангийг шинэчилнэ');
});

test('launch: урилга / админ / GAME_PAYWALL=off / cm Premium → url-д анги, game_access-д БИЧИХГҮЙ', async () => {
  give('ws', 'host@x.mn', 'chessmath', 5, '7');
  const iv = await G('invite', { game: 'chessmath', realm: 'ws', wstoken: wsTok('host@x.mn') });
  assert.strictEqual(iv.statusCode, 200, JSON.stringify(iv.body));
  let r = await G('launch', { game: 'chessmath', realm: 'ws', invite: iv.body.invite, grade: '11', topic: '3' }, { headers: dev('friend001') });
  assert.deepStrictEqual([r.statusCode, r.body.via], [200, 'invite']);
  assert.strictEqual(access('ws', 'host@x.mn', 'chessmath').grade, '7', 'найз host-ийн ангийг өөрчлөхгүй');
  // админ
  r = await G('launch', { game: 'sudoku', realm: 'ws', grade: '8', topic: '5' }, { headers: ADMIN });
  assert.strictEqual(r.body.via, 'admin');
  assert.match(r.body.url, /^\/sudoku\.html\?realm=ws&grade=8&topic=5&t=/);
  assert.strictEqual(F.db.gradeSets.length, 0);
  // cm Premium (эрхийн мөргүй)
  F.addUser('prem@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 5 * F.DAY) });
  r = await G('launch', { game: 'sudoku', realm: 'cm', grade: '9' }, { headers: bearer(cmTok('prem@x.mn')) });
  assert.deepStrictEqual([r.statusCode, r.body.via], [200, 'premium']);
  assert.match(r.body.url, /^\/sudoku\.html\?grade=9&topic=0&t=/);
  assert.strictEqual(F.db.access.size, 1, 'Premium-д эрхийн мөр үүсэхгүй');
  // үнэгүй (kill-switch)
  process.env.GAME_PAYWALL = 'off';
  r = await G('launch', { game: 'sudoku', realm: 'ws', grade: '6' });
  assert.deepStrictEqual([r.statusCode, r.body.via, r.body.url], [200, 'off', '/sudoku.html?grade=6&topic=0']);
  r = await G('launch', { game: 'mathmortal', realm: 'ws', grade: '12', topic: '0' });
  assert.strictEqual(r.body.url, '/math-mortal/?grade=12&topic=0');
  assert.strictEqual(F.db.gradeSets.length, 0, 'урилга/админ/premium/off үед UPDATE огт оролдоогүй');
});

test('game_grant: заавал биш анги (6–12) → game_access.grade; буруу анги → 400, эрх үүсэхгүй; ангигүй олголт хуучин ангийг хадгална', async () => {
  // ws_login данс шалгалт — энэ тестэд хуурамч (games-admin.test.js-ийн бүрэн хуурамч SQL-ийг давтахгүй)
  const orig = F.pool.query;
  F.pool.query = async function (sql, p) {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    if (q === 'SELECT 1 FROM ws_login WHERE lower(email)=$1 LIMIT 1') return { rows: [{ '?column?': 1 }] };
    if (/^INSERT INTO ws_admin_grants /.test(q)) return { rows: [] };
    return orig.call(this, sql, p);
  };
  try {
    let r = await Q('game_grant', { realm: 'ws', email: 'g@x.mn', game: 'sudoku', grade: '13' }, { headers: ADMIN });
    assert.strictEqual(r.statusCode, 400, JSON.stringify(r.body));
    assert.strictEqual(access('ws', 'g@x.mn', 'sudoku'), null);
    r = await Q('game_grant', { realm: 'ws', email: 'g@x.mn', game: 'sudoku', grade: '10' }, { headers: ADMIN });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    assert.strictEqual(r.body.grade, '10');
    assert.strictEqual(access('ws', 'g@x.mn', 'sudoku').grade, '10');
    near(daysLeft(access('ws', 'g@x.mn', 'sudoku').expires_at), 30);
    r = await Q('game_grant', { realm: 'ws', email: 'g@x.mn', game: 'sudoku', grade: '' }, { headers: ADMIN });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.grade, undefined);
    assert.strictEqual(access('ws', 'g@x.mn', 'sudoku').grade, '10', 'ангигүй олголт → хэвээр');
    near(daysLeft(access('ws', 'g@x.mn', 'sudoku').expires_at), 60);
    assert.strictEqual(F.db.purch.length, 0, 'админы олголт борлуулалтад орохгүй');
  } finally { F.pool.query = orig; }
});

test('тодорхойгүй SQL алга, бодит сүлжээ рүү хандаагүй', () => {
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.qp.other, []);
});
