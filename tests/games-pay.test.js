// Тоглоомын төлбөр (plan='game'): api/qpay.js create/check/callback/ws_reconcile + api/_games.js эрх.
// Ажиллуулах: node --test tests/games-pay.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const qpay = require(path.join(F.API, 'qpay.js'));
const GM = require(path.join(F.API, '_games.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const cmTok = (e, tv) => jwt.sign({ email: e, role: 'student', tv: tv | 0 }, SEC);
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const ADMIN = bearer(jwt.sign({ admin: true }, SEC));

const Q = (action, body, o) => F.call(qpay, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const check = (inv, email, o) => Q('check', { invoice_id: inv, email: email }, o);
const callback = (email) => F.call(qpay, { method: 'GET', query: { action: 'callback', email: email } });
const reconcile = () => Q('ws_reconcile', {}, { headers: ADMIN });
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / F.DAY;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, (msg || '') + ' ' + a + ' ≈ ' + b);

async function buyWs(email, game) {
  const r = await Q('create', { plan: 'game', realm: 'ws', game: game, wstoken: wsTok(email) });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.invoice.invoice_id;
}
async function buyCm(email, game) {
  const r = await Q('create', { plan: 'game', realm: 'cm', game: game }, { headers: bearer(cmTok(email)) });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  return r.body.invoice.invoice_id;
}
function access(realm, email, key) { return F.db.access.get(realm + '|' + email + '|' + key) || null; }
function rawPay(row) {
  const r = Object.assign({ months: 1, amount: 1900, event_id: null, granted: false, promo_code: null, game_key: null, realm: null, created_at: Date.now() }, row);
  F.db.pay.set(r.invoice_id, r); F.qp.paid.set(r.invoice_id, r.amount); return r;
}

beforeEach(() => F.reset());

test('каталог: 16 тоглоом, төрөл/олон тоглогч; allowlist прототипийн түлхүүрийг хүлээн авахгүй', () => {
  assert.deepStrictEqual(GM.GAME_KEYS.slice().sort(), ['blockblast', 'chessmath', 'daam', 'doroev', 'flagbattle', 'gomoku', 'ludo',
    'mathmortal', 'myangat', 'nicebattle', 'numseq', 'play2048', 'sbh', 'songon', 'sudoku', 'xpdrop']);
  const kinds = {};
  GM.GAME_KEYS.forEach((k) => { const g = GM.GAMES[k]; assert.ok(g.title, k); kinds[g.kind] = (kinds[g.kind] || 0) + 1; });
  assert.deepStrictEqual(kinds, { file: 6, inline: 6, external: 4 });
  assert.deepStrictEqual(GM.GAME_KEYS.filter((k) => GM.GAMES[k].multi).sort(),
    ['chessmath', 'daam', 'doroev', 'gomoku', 'ludo', 'mathmortal', 'sbh']);
  ['__proto__', 'constructor', 'toString', 'hasOwnProperty', '', null, undefined, 1, 'SUDOKU'].forEach((k) => assert.strictEqual(GM.isGame(k), false, String(k)));
  assert.strictEqual(GM.publicCatalog().length, 16);
  assert.strictEqual(GM.gamePrice(), 1900);
  assert.strictEqual(GM.GAME_DAYS, 30);
});

test('create: токенгүй / өөр сайтын токен / админ / хуучирсан cm токен → 401; буруу realm/тоглоом → 400; нэхэмжлэх үүсэхгүй', async () => {
  F.addUser('cm@x.mn');
  F.addUser('stale@x.mn', { token_version: 2 });
  const cases = [
    [{ plan: 'game', realm: 'ws', game: 'sudoku' }, null, 401, 'ws токенгүй'],
    [{ plan: 'game', realm: 'ws', game: 'sudoku', email: 'cm@x.mn' }, null, 401, 'body.email-д итгэхгүй'],
    [{ plan: 'game', realm: 'ws', game: 'sudoku', wstoken: cmTok('cm@x.mn') }, null, 401, 'ws realm + cm токен'],
    [{ plan: 'game', realm: 'ws', game: 'sudoku', wstoken: jwt.sign({ email: 'a@x.mn', ws: true }, 'other-secret') }, null, 401, 'өөр түлхүүр'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku' }, null, 401, 'cm токенгүй'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku', email: 'cm@x.mn' }, null, 401, 'cm body.email'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku' }, bearer(wsTok('cm@x.mn')), 401, 'cm realm + ws токен'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku', wstoken: wsTok('cm@x.mn') }, null, 401, 'cm realm + body.wstoken'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku' }, ADMIN, 401, 'админ токен'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku' }, bearer(jwt.sign({ email: 'cm@x.mn', uid: 7 }, SEC)), 401, 'NOMAD uid токен'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku' }, bearer(cmTok('stale@x.mn', 0)), 401, 'tv зөрсөн'],
    [{ plan: 'game', realm: 'cm', game: 'sudoku' }, bearer(cmTok('ghost@x.mn')), 401, 'users-д байхгүй'],
    [{ plan: 'game', game: 'sudoku', wstoken: wsTok('a@x.mn') }, null, 400, 'realm байхгүй'],
    [{ plan: 'game', realm: 'both', game: 'sudoku', wstoken: wsTok('a@x.mn') }, null, 400, 'realm буруу'],
    [{ plan: 'game', realm: 'ws', game: 'hack', wstoken: wsTok('a@x.mn') }, null, 400, 'allowlist-гүй'],
    [{ plan: 'game', realm: 'ws', game: '__proto__', wstoken: wsTok('a@x.mn') }, null, 400, '__proto__'],
    [{ plan: 'game', realm: 'ws', game: 'constructor', wstoken: wsTok('a@x.mn') }, null, 400, 'constructor'],
    [{ plan: 'game', realm: 'ws', game: ['sudoku'], wstoken: wsTok('a@x.mn') }, null, 400, 'массив'],
    [{ plan: 'game', realm: 'ws', wstoken: wsTok('a@x.mn') }, null, 400, 'game байхгүй'],
    [{ plan: 'gamez', realm: 'ws', game: 'sudoku', email: 'a@x.mn' }, null, 400, 'тариф буруу'],
  ];
  for (const [body, headers, code, msg] of cases) {
    const r = await Q('create', body, headers ? { headers: headers } : undefined);
    assert.strictEqual(r.statusCode, code, msg + ' ' + JSON.stringify(r.body));
    assert.notStrictEqual(r.body && r.body.ok, true, msg);
    if (code === 401) assert.strictEqual(r.body.needLogin, true, msg);
  }
  assert.strictEqual(F.qp.invoices.length, 0, 'QPay нэхэмжлэх үүсээгүй');
  assert.strictEqual(F.db.pay.size, 0, 'pending мөр үүсээгүй');
});

test('create: үнийг сервер тогтооно (body.amount/promo/ref/months/email үл хамаарна); мөр plan=game, months=1, game_key, realm', async () => {
  F.addUser('cm@x.mn');
  let r = await Q('create', { plan: 'game', realm: 'cm', game: 'sudoku', amount: 1, months: 12, promo: 'CYBER20', ref: 'RABCDEF',
    email: 'victim@x.mn', event_id: 3 }, { headers: bearer(cmTok('cm@x.mn')) });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.ok, r.body.email, r.body.game, r.body.realm, r.body.amount], [true, 'cm@x.mn', 'sudoku', 'cm', 1900]);
  const inv = r.body.invoice.invoice_id;
  const row = F.db.pay.get(inv);
  assert.deepStrictEqual([row.email, row.plan, row.months, row.amount, row.event_id, row.game_key, row.realm, row.granted],
    ['cm@x.mn', 'game', 1, 1900, null, 'sudoku', 'cm', false]);
  const qb = F.qp.invoices[0].body;
  assert.strictEqual(qb.amount, 1900);
  assert.strictEqual(qb.invoice_description, 'CyberMath тоглоом — Судоку — 1 сар');
  assert.ok(qb.callback_url.endsWith('action=callback&email=' + encodeURIComponent('cm@x.mn')));

  r = await Q('create', { plan: 'game', realm: 'ws', game: 'mathmortal', wstoken: wsTok(' WS@X.mn '), amount: 5 });
  assert.strictEqual(r.statusCode, 200);
  const row2 = F.db.pay.get(r.body.invoice.invoice_id);
  assert.deepStrictEqual([row2.email, row2.realm, row2.game_key, row2.amount], ['ws@x.mn', 'ws', 'mathmortal', 1900]);
  assert.strictEqual(F.qp.invoices[1].body.invoice_description, 'CyberMath тоглоом — MATH MORTAL — 1 сар');

  process.env.GAME_PRICE = '2500';
  r = await Q('create', { plan: 'game', realm: 'ws', game: 'ludo', wstoken: wsTok('ws@x.mn') });
  assert.strictEqual(F.db.pay.get(r.body.invoice.invoice_id).amount, 2500);
  assert.strictEqual(F.qp.invoices[2].body.amount, 2500);
  for (const bad of ['abc', '1', '-5', '']) {
    process.env.GAME_PRICE = bad;
    assert.strictEqual(GM.gamePrice(), 1900, 'GAME_PRICE=' + bad);
  }
});

test('create rate limit: realm+имэйл тутам 20/10мин; rate DB алдаа → хаана', async () => {
  for (let i = 0; i < 20; i++) await buyWs('rl@x.mn', 'sudoku');
  const r = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('rl@x.mn') });
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(F.qp.invoices.length, 20);
  await buyWs('rl2@x.mn', 'sudoku');   // өөр имэйл нөлөөлөхгүй
  F.db.failRate = true;
  const r2 = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('rl3@x.mn') });
  assert.strictEqual(r2.statusCode, 429);
});

test('зөв төлбөр (1900₮) → тухайн realm-д +30 хоног, ledger 1, Telegram; users.plan/premium_expiry ӨӨРЧЛӨГДӨХГҮЙ', async () => {
  F.addUser('kid@x.mn');
  const inv = await buyWs('kid@x.mn', 'sudoku');
  let r = await check(inv, 'kid@x.mn');
  assert.deepStrictEqual(r.body, { ok: true, paid: false }, 'төлөгдөөгүй');
  assert.strictEqual(access('ws', 'kid@x.mn', 'sudoku'), null);

  F.qp.paid.set(inv, 1900);
  r = await check(inv, 'KID@x.mn ');
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual([r.body.ok, r.body.paid, r.body.game, r.body.realm], [true, true, 'sudoku', 'ws']);
  near(daysLeft(r.body.expiry), 30, 'expiry');
  assert.strictEqual(r.body.ws_token, undefined, 'токен буцаахгүй');
  near(daysLeft(access('ws', 'kid@x.mn', 'sudoku').expires_at), 30);
  assert.strictEqual(F.db.pay.get(inv).granted, true);

  const u = F.db.users.get('kid@x.mn');
  assert.deepStrictEqual([u.plan, u.premium_expiry], ['free', null], 'Premium БИШ');
  assert.strictEqual(F.db.purch.length, 1);
  const p = F.db.purch[0];
  assert.deepStrictEqual([p.invoice_id, p.realm, p.email, p.game_key, p.amount, p.days], [inv, 'ws', 'kid@x.mn', 'sudoku', 1900, 30]);
  assert.ok(F.tg.some((t) => /Тоглоом/.test(t) && t.indexOf('Судоку') >= 0 && t.indexOf('kid@x.mn') >= 0), 'Telegram');

  assert.strictEqual(await GM.entitled('ws', 'kid@x.mn', 'sudoku'), true);
  assert.strictEqual(await GM.entitled('ws', 'kid@x.mn', 'play2048'), false, 'өөр тоглоом');
  assert.strictEqual(await GM.entitled('cm', 'kid@x.mn', 'sudoku'), false, 'өөр realm');
  assert.deepStrictEqual(Object.keys(await GM.activeGames('ws', 'kid@x.mn')), ['sudoku']);
  assert.deepStrictEqual(await GM.activeGames('cm', 'kid@x.mn'), {});

  // Дахин check — дахин олгохгүй, мөн хугацааг буцаана
  const before = access('ws', 'kid@x.mn', 'sudoku').expires_at.getTime();
  r = await check(inv, 'kid@x.mn');
  assert.deepStrictEqual([r.body.paid, r.body.game], [true, 'sudoku']);
  assert.strictEqual(new Date(r.body.expiry).getTime(), before);
  assert.strictEqual(access('ws', 'kid@x.mn', 'sudoku').expires_at.getTime(), before);
  assert.strictEqual(F.db.purch.length, 1);
});

test('дутуу төлбөр (1000₮) / төлөгдөөгүй → check, callback, reconcile аль нь ч эрх олгохгүй', async () => {
  F.addUser('cm@x.mn');
  const inv = await buyCm('cm@x.mn', 'chessmath');
  const inv2 = await buyCm('cm@x.mn', 'daam');
  F.qp.paid.set(inv, 1000);
  assert.deepStrictEqual((await check(inv, 'cm@x.mn')).body, { ok: true, paid: false });
  assert.deepStrictEqual((await check(inv2, 'cm@x.mn')).body, { ok: true, paid: false });
  assert.strictEqual((await callback('cm@x.mn')).statusCode, 200);
  const rc = await reconcile();
  assert.strictEqual(rc.statusCode, 200);
  assert.strictEqual(rc.body.granted_count, 0);
  assert.strictEqual(F.db.access.size, 0);
  assert.strictEqual(F.db.purch.length, 0);
  assert.strictEqual(F.db.pay.get(inv).granted, false);
  assert.ok(F.logs.some((l) => l.indexOf('дутуу төлбөр') >= 0));
  // Үлдэгдлийг төлбөл (нийт 1900) олгоно
  F.qp.paid.set(inv, 1900);
  assert.strictEqual((await check(inv, 'cm@x.mn')).body.paid, true);
  assert.strictEqual(await GM.entitled('cm', 'cm@x.mn', 'chessmath'), true);
});

test('зэрэг check×3 + callback + reconcile → яг НЭГ олголт (+30, +60 биш), ledger 1', async () => {
  F.addUser('cc@x.mn');
  const inv = await buyCm('cc@x.mn', 'ludo');
  F.qp.paid.set(inv, 1900);
  const rs = await Promise.all([check(inv, 'cc@x.mn'), callback('cc@x.mn'), check(inv, 'cc@x.mn'), reconcile(), check(inv, 'cc@x.mn')]);
  rs.forEach((r, i) => assert.strictEqual(r.statusCode, 200, 'i=' + i + ' ' + JSON.stringify(r.body)));
  [0, 2, 4].forEach((i) => assert.strictEqual(rs[i].body.paid, true, 'check ' + i));
  near(daysLeft(access('cm', 'cc@x.mn', 'ludo').expires_at), 30, 'нэг удаа');
  // claim-д ялагдсан дуудлага нь ялагчийн транзакц COMMIT болтол хүлээдэг тул expiry:null биш — бүгд ижил хугацаа
  const exps = [0, 2, 4].map((i) => rs[i].body.expiry);
  assert.ok(exps.every((e) => e && e === access('cm', 'cc@x.mn', 'ludo').expires_at.toISOString()), JSON.stringify(exps));
  assert.strictEqual(F.openTx(), 0, 'нээлттэй транзакц үлдээгүй');
  assert.deepStrictEqual(F.db.txLeaks, []);
  assert.strictEqual(F.db.purch.length, 1);
  assert.strictEqual(F.tg.filter((t) => /Тоглоом/.test(t)).length, 1);
  // дараалсан давталт
  await check(inv, 'cc@x.mn'); await callback('cc@x.mn');
  const rc = await reconcile();
  assert.strictEqual(rc.body.granted_count, 0);
  near(daysLeft(access('cm', 'cc@x.mn', 'ludo').expires_at), 30);
  assert.strictEqual(F.db.purch.length, 1);
  const u = F.db.users.get('cc@x.mn');
  assert.deepStrictEqual([u.plan, u.premium_expiry], ['free', null]);
});

test('reconcile: төлөгдсөн атлаа олгогдоогүй тоглоомыг нөхөж олгоно, жагсаалтад game/realm', async () => {
  const inv = await buyWs('late@x.mn', 'numseq');
  F.qp.paid.set(inv, 1900);
  const rc = await reconcile();
  assert.strictEqual(rc.body.granted_count, 1);
  assert.deepStrictEqual(rc.body.granted[0], { email: 'late@x.mn', plan: 'game', months: 1, amount: 1900, game: 'numseq', realm: 'ws' });
  assert.strictEqual(await GM.entitled('ws', 'late@x.mn', 'numseq'), true);
  assert.strictEqual((await Q('ws_reconcile', {})).statusCode, 401, 'админ биш');
});

test('callback: тухайн имэйлийн хоёр realm-ийн нэхэмжлэхийг тус тусад нь олгоно', async () => {
  F.addUser('two@x.mn');
  const a = await buyWs('two@x.mn', 'xpdrop');
  const b = await buyCm('two@x.mn', 'xpdrop');
  F.qp.paid.set(a, 1900); F.qp.paid.set(b, 1900);
  assert.strictEqual((await callback('two@x.mn')).statusCode, 200);
  near(daysLeft(access('ws', 'two@x.mn', 'xpdrop').expires_at), 30);
  near(daysLeft(access('cm', 'two@x.mn', 'xpdrop').expires_at), 30, 'нэгтгэхгүй, тус бүр 30');
  assert.strictEqual(F.db.purch.length, 2);
});

test('мэдэгдэхгүй plan / эвдэрхий тоглоомын мөр → Premium БИШ, эрх БИШ, granted=FALSE хэвээр', async () => {
  F.addUser('w@x.mn');
  const bad = [
    { invoice_id: 'X1', email: 'w@x.mn', plan: 'weird' },
    { invoice_id: 'X2', email: 'w@x.mn', plan: null },
    { invoice_id: 'X3', email: 'w@x.mn', plan: 'GAME', game_key: 'sudoku', realm: 'cm' },
    { invoice_id: 'X4', email: 'w@x.mn', plan: 'game', game_key: 'hack', realm: 'cm' },
    { invoice_id: 'X5', email: 'w@x.mn', plan: 'game', game_key: 'sudoku', realm: null },
    { invoice_id: 'X6', email: 'w@x.mn', plan: 'game', game_key: null, realm: 'ws' },
    { invoice_id: 'X7', email: 'w@x.mn', plan: 'game', game_key: '__proto__', realm: 'ws' },
    { invoice_id: 'X8', email: 'w@x.mn', plan: 'wsmonths' },
  ];
  bad.forEach(rawPay);
  for (const b of bad) {
    const r = await check(b.invoice_id, 'w@x.mn');
    assert.notStrictEqual(r.body.paid, true, b.invoice_id + ' ' + JSON.stringify(r.body));
    assert.strictEqual(r.statusCode, 500, b.invoice_id);
  }
  await callback('w@x.mn');
  const rc = await reconcile();
  assert.strictEqual(rc.body.granted_count, 0);
  const u = F.db.users.get('w@x.mn');
  assert.deepStrictEqual([u.plan, u.premium_expiry], ['free', null], 'Premium олгогдоогүй');
  assert.strictEqual(F.db.access.size, 0);
  assert.strictEqual(F.db.purch.length, 0);
  bad.forEach((b) => assert.strictEqual(F.db.pay.get(b.invoice_id).granted, false, b.invoice_id));
  assert.deepStrictEqual(F.db.claims, [], 'буруу мөрийг claim хийхээс ӨМНӨ татгалзана (зэрэг poll-д ч granted=TRUE болохгүй)');
  assert.ok(F.logs.some((l) => l.indexOf('үл мэдэгдэх plan') >= 0));
  assert.ok(F.logs.some((l) => l.indexOf('тоглоомын мөр буруу') >= 0));
});

test('сунгалт НЭМЭГДДЭГ: дуусаагүй → хуучин+30; дууссан → NOW+30; хоёр худалдан авалт → 60', async () => {
  F.addUser('ext@x.mn');
  F.db.access.set('cm|ext@x.mn|gomoku', { realm: 'cm', email: 'ext@x.mn', game_key: 'gomoku', expires_at: new Date(Date.now() + 10 * F.DAY) });
  let inv = await buyCm('ext@x.mn', 'gomoku');
  F.qp.paid.set(inv, 1900);
  let r = await check(inv, 'ext@x.mn');
  near(daysLeft(r.body.expiry), 40, 'үлдсэн 10 + 30');
  near(daysLeft(access('cm', 'ext@x.mn', 'gomoku').expires_at), 40);

  F.db.access.set('cm|ext@x.mn|doroev', { realm: 'cm', email: 'ext@x.mn', game_key: 'doroev', expires_at: new Date(Date.now() - 5 * F.DAY) });
  inv = await buyCm('ext@x.mn', 'doroev');
  F.qp.paid.set(inv, 1900);
  r = await check(inv, 'ext@x.mn');
  near(daysLeft(r.body.expiry), 30, 'дууссан → NOW+30');

  const i1 = await buyWs('ext@x.mn', 'myangat'), i2 = await buyWs('ext@x.mn', 'myangat');
  F.qp.paid.set(i1, 1900); F.qp.paid.set(i2, 1900);
  await check(i1, 'ext@x.mn'); await check(i2, 'ext@x.mn');
  near(daysLeft(access('ws', 'ext@x.mn', 'myangat').expires_at), 60, '30 + 30');
  assert.strictEqual(F.db.purch.filter((p) => p.game_key === 'myangat').length, 2);

  // grantGame шууд: хоног шалгалт, allowlist
  near(daysLeft(await GM.grantGame('ws', 'g@x.mn', 'sudoku')), 30);
  near(daysLeft(await GM.grantGame('ws', 'g@x.mn', 'sudoku', 7)), 37);
  for (const args of [['xx', 'g@x.mn', 'sudoku'], ['ws', 'bad', 'sudoku'], ['ws', 'g@x.mn', 'hack'], ['ws', 'g@x.mn', 'sudoku', 0], ['ws', 'g@x.mn', 'sudoku', 'abc']])
    await assert.rejects(GM.grantGame.apply(null, args), JSON.stringify(args));
  near(daysLeft(access('ws', 'g@x.mn', 'sudoku').expires_at), 37, 'буруу дуудлага өөрчлөөгүй');
});

test('grantGame transaction client (db) дээр ажиллана', async () => {
  await GM.ensureGameTables();   // db дамжуулахаас өмнө (транзакцаас гадна) хүснэгт бэлэн байх ёстой
  const seen = [];
  const client = { query: async (sql, p) => { seen.push(sql); return F.pool.query(sql, p); } };
  near(daysLeft(await GM.grantGame('cm', 'tx@x.mn', 'sbh', 30, client)), 30);
  assert.strictEqual(seen.filter((s) => /INSERT INTO game_access/.test(s)).length, 1, 'client-ээр бичнэ');
  assert.strictEqual(await GM.revokeGame('cm', 'tx@x.mn', 'sbh', client), 1);
  assert.strictEqual(access('cm', 'tx@x.mn', 'sbh'), null);
});

test('realm тусгаарлалт: ижил имэйл — ws-д авсан эрх cm-д, cm-д авсан нь ws-д ажиллахгүй; бусдын нэхэмжлэхийг check хийхгүй', async () => {
  F.addUser('same@x.mn');
  const a = await buyWs('same@x.mn', 'mathmortal');
  const b = await buyCm('same@x.mn', 'play2048');
  F.qp.paid.set(a, 1900); F.qp.paid.set(b, 1900);
  assert.strictEqual((await check(a, 'other@x.mn')).statusCode, 403, 'имэйл зөрсөн');
  assert.strictEqual(F.db.access.size, 0);
  await check(a, 'same@x.mn'); await check(b, 'same@x.mn');
  assert.strictEqual(await GM.entitled('ws', 'same@x.mn', 'mathmortal'), true);
  assert.strictEqual(await GM.entitled('cm', 'same@x.mn', 'mathmortal'), false);
  assert.strictEqual(await GM.entitled('cm', 'same@x.mn', 'play2048'), true);
  assert.strictEqual(await GM.entitled('ws', 'same@x.mn', 'play2048'), false);
  assert.deepStrictEqual(Object.keys(await GM.activeGames('ws', 'same@x.mn')), ['mathmortal']);
  assert.deepStrictEqual(Object.keys(await GM.activeGames('cm', 'same@x.mn')), ['play2048']);
  // буруу оролт
  assert.strictEqual(await GM.entitled('xx', 'same@x.mn', 'mathmortal'), false);
  assert.strictEqual(await GM.entitled('ws', null, 'mathmortal'), false);
  assert.strictEqual(await GM.entitled('ws', 'same@x.mn', 'hack'), false);
});

test('GAME_PAYWALL=off → бүх 16 тоглоом нээлттэй (нэвтрээгүй ч), allowlist-гүй түлхүүр хаалттай; өмнө үүсгэсэн нэхэмжлэхийн төлбөр олгогдсоор', async () => {
  for (const v of ['off', 'OFF', ' Off ', 'false', '0', 'no']) {
    process.env.GAME_PAYWALL = v;
    assert.strictEqual(GM.paywallOn(), false, v);
    for (const k of GM.GAME_KEYS) {
      assert.strictEqual(await GM.entitled('ws', 'nobody@x.mn', k), true, v + ' ' + k);
      assert.strictEqual(await GM.entitled('cm', null, k), true, v + ' ' + k + ' нэвтрээгүй');
    }
    assert.strictEqual(await GM.entitled('ws', 'nobody@x.mn', 'hack'), false);
    assert.strictEqual((await GM.entitlement('cm', 'a@x.mn', 'ludo')).via, 'off');
  }
  // Төлбөртэй үед үүсгэсэн нэхэмжлэхийг kill-switch асаасны дараа төлсөн → мөнгө авсан тул эрх олгоно
  process.env.GAME_PAYWALL = 'on';
  const inv = await buyWs('off@x.mn', 'sudoku');
  process.env.GAME_PAYWALL = 'off';
  F.qp.paid.set(inv, 1900);
  assert.strictEqual((await check(inv, 'off@x.mn')).body.paid, true);
  near(daysLeft(access('ws', 'off@x.mn', 'sudoku').expires_at), 30, 'kill-switch үед ч төлсөн нэхэмжлэх олгогдоно');
  for (const v of ['on', ' ON ', 'offf', 'true', '1', 'yes']) {
    process.env.GAME_PAYWALL = v;
    assert.strictEqual(GM.paywallOn(), true, JSON.stringify(v));
    assert.strictEqual(await GM.entitled('ws', 'nobody@x.mn', 'sudoku'), false, JSON.stringify(v));
  }
  // Тавиагүй/хоосон → api/_games.js PAYWALL_DEFAULT_ON (launch UI деплойдох хүртэл false — games-gate.test.js шалгана)
  assert.strictEqual(typeof GM.PAYWALL_DEFAULT_ON, 'boolean');
  for (const v of [undefined, '', '  ']) {
    if (v === undefined) delete process.env.GAME_PAYWALL; else process.env.GAME_PAYWALL = v;
    assert.strictEqual(GM.paywallOn(), GM.PAYWALL_DEFAULT_ON, JSON.stringify(v));
    assert.strictEqual(await GM.entitled('ws', 'nobody@x.mn', 'sudoku'), !GM.PAYWALL_DEFAULT_ON, JSON.stringify(v));
  }
  process.env.GAME_PAYWALL = 'on';
  assert.strictEqual(await GM.entitled('ws', 'off@x.mn', 'sudoku'), true, 'худалдаж авсан эрх хэвээр');
});

test('cm Premium → бүх тоглоом үнэгүй (зөвхөн cm realm); дууссан/хугацаагүй Premium → үгүй; хуучин premium_until', async () => {
  F.addUser('p@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 5 * F.DAY) });
  F.addUser('old@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() - F.DAY) });
  F.addUser('nox@x.mn', { plan: 'premium', premium_expiry: null });
  F.addUser('until@x.mn', { plan: 'premium', premium_expiry: null, premium_until: new Date(Date.now() + F.DAY) });
  F.addUser('free@x.mn', { plan: 'free', premium_expiry: new Date(Date.now() + 5 * F.DAY) });
  for (const k of GM.GAME_KEYS) assert.strictEqual(await GM.entitled('cm', 'p@x.mn', k), true, k);
  assert.strictEqual((await GM.entitlement('cm', 'P@X.mn', 'sudoku')).via, 'premium');
  assert.strictEqual(await GM.entitled('ws', 'p@x.mn', 'sudoku'), false, 'Premium нь ws realm-д хамаарахгүй');
  assert.strictEqual(await GM.entitled('cm', 'old@x.mn', 'sudoku'), false, 'дууссан');
  assert.strictEqual(await GM.entitled('cm', 'nox@x.mn', 'sudoku'), false, 'хугацаагүй');
  assert.strictEqual(await GM.entitled('cm', 'until@x.mn', 'sudoku'), true, 'premium_until');
  assert.strictEqual(await GM.entitled('cm', 'free@x.mn', 'sudoku'), false, 'plan=free');
  assert.strictEqual(await GM.entitled('cm', 'p@x.mn', 'hack'), false);
  // premium_until багана байхгүй DB → premium_expiry-аар л (энэ модульд нэг удаа шилждэг тул файлын СҮҮЛД)
  F.db.noPremUntil = true;
  assert.strictEqual(await GM.entitled('cm', 'p@x.mn', 'sudoku'), true);
  assert.strictEqual(await GM.entitled('cm', 'until@x.mn', 'sudoku'), false);
});

test('олголт алдаа → claim буцна (дараагийн check олгоно); ledger алдаа эрхийг буцаахгүй', async () => {
  F.addUser('fx@x.mn');
  const inv = await buyCm('fx@x.mn', 'blockblast');
  F.qp.paid.set(inv, 1900);
  F.db.failGrant = true;
  let r = await check(inv, 'fx@x.mn');
  assert.strictEqual(r.statusCode, 500);
  assert.strictEqual(F.db.pay.get(inv).granted, false, 'ROLLBACK → claim буцсан');
  assert.strictEqual(F.db.access.size, 0);
  assert.ok(F.db.txLog.indexOf('ROLLBACK') >= 0, JSON.stringify(F.db.txLog));
  F.db.failGrant = false;
  r = await check(inv, 'fx@x.mn');
  assert.strictEqual(r.body.paid, true);
  near(daysLeft(access('cm', 'fx@x.mn', 'blockblast').expires_at), 30);

  // Ledger алдаа: SAVEPOINT-оор тусгаарлана — эрх COMMIT болно (aborted транзакц COMMIT → ROLLBACK болж эрх алдагдахгүй)
  const inv2 = await buyCm('fx@x.mn', 'flagbattle');
  F.qp.paid.set(inv2, 1900);
  F.db.failLedger = true;
  F.tg.length = 0;
  r = await check(inv2, 'fx@x.mn');
  assert.strictEqual(r.body.paid, true);
  assert.strictEqual(await GM.entitled('cm', 'fx@x.mn', 'flagbattle'), true);
  assert.strictEqual(F.db.pay.get(inv2).granted, true);
  assert.strictEqual(F.db.purch.filter((p) => p.game_key === 'flagbattle').length, 0);
  assert.ok(F.logs.some((l) => l.indexOf('[game ledger]') >= 0));
  assert.ok(F.db.txLog.indexOf('ROLLBACK TO game_ledger') >= 0, JSON.stringify(F.db.txLog));
  assert.ok(F.tg.some((t) => t.indexOf('game_purchases') >= 0), 'Telegram-д бүртгэл дутсан тухай анхааруулга');
  F.db.failLedger = false;

  // Холболт авч чадахгүй → юу ч claim хийгдэхгүй, дараа нь олгоно
  const inv3 = await buyCm('fx@x.mn', 'songon');
  F.qp.paid.set(inv3, 1900);
  F.db.failConnect = true;
  const nClaims = F.db.claims.length;
  r = await check(inv3, 'fx@x.mn');
  assert.strictEqual(r.statusCode, 500);
  assert.strictEqual(F.db.claims.length, nClaims, 'claim оролдоогүй');
  assert.strictEqual(F.db.pay.get(inv3).granted, false);
  F.db.failConnect = false;
  assert.strictEqual((await check(inv3, 'fx@x.mn')).body.paid, true);
  near(daysLeft(access('cm', 'fx@x.mn', 'songon').expires_at), 30);
  assert.strictEqual(F.openTx(), 0);
  assert.deepStrictEqual(F.db.txLeaks, [], 'холболт tx дотор pool-д буцаагүй');
});

test('claim + олголт + бүртгэл НЭГ транзакц: claim-ийн дараа функц тасарвал (timeout/crash) бүгд буцна → check/reconcile дахин олгоно', async () => {
  F.addUser('cr@x.mn');
  // Тасрах цэг: (1) claim-ийн дараа, олголтын өмнө; (2) олголтын дараа, бүртгэлийн өмнө
  const points = [
    { at: /^INSERT INTO game_access/, game: 'numseq', recover: 'reconcile' },
    { at: /^INSERT INTO game_purchases/, game: 'sudoku', recover: 'check' },
  ];
  for (const pt of points) {
    const inv = await buyWs('cr@x.mn', pt.game);
    F.qp.paid.set(inv, 1900);
    F.db.hangOn = pt.at;
    const hit = F.hangReached();
    check(inv, 'cr@x.mn');   // await хийхгүй: энэ "функц" тасрах цэг дээр зогсож, дахин хэзээ ч үргэлжлэхгүй
    await hit;
    assert.ok(F.db.claims.indexOf(inv) >= 0, pt.game + ': claim хийгдсэн байсан');
    F.dropConnections();    // Vercel функц тасарлаа → Postgres COMMIT хийгдээгүй транзакцыг буцаана
    F.db.hangOn = null;
    assert.strictEqual(F.db.pay.get(inv).granted, false, pt.game + ': granted=TRUE гацаж үлдээгүй');
    assert.strictEqual(access('ws', 'cr@x.mn', pt.game), null, pt.game + ': хагас олголт үлдээгүй');
    assert.strictEqual(F.db.purch.filter((p) => p.invoice_id === inv).length, 0);

    if (pt.recover === 'reconcile') {
      const rc = await reconcile();
      assert.strictEqual(rc.body.granted_count, 1, pt.game + ': reconcile нөхнө');
    }
    const nChecks = F.qp.checks.length;
    const r = await check(inv, 'cr@x.mn');
    assert.deepStrictEqual([r.statusCode, r.body.paid, r.body.game, r.body.realm], [200, true, pt.game, 'ws'], JSON.stringify(r.body));
    if (pt.recover === 'check') assert.strictEqual(F.qp.checks.length, nChecks + 1, 'QPay-ээр дахин баталгаажуулав');
    assert.ok(r.body.expiry, pt.game + ': expiry:null биш');
    near(daysLeft(r.body.expiry), 30, pt.game);
    near(daysLeft(access('ws', 'cr@x.mn', pt.game).expires_at), 30, pt.game + ': нэг удаа (+60 биш)');
    assert.strictEqual(F.db.purch.filter((p) => p.invoice_id === inv).length, 1);
    assert.strictEqual(F.db.pay.get(inv).granted, true);
  }
  assert.strictEqual(F.openTx(), 0);
  assert.deepStrictEqual(F.db.txLeaks, []);
});

test('grantGame/recordPurchase(db): хүснэгт бэлэн болоогүй бол транзакц дотор DDL ажиллуулахгүй, шууд алдаа', async () => {
  // Шинэ модуль (ensureGameTables хараахан дуудагдаагүй) — бусад тестийн төлөвөөс хамаарахгүй
  const f = require.resolve(path.join(F.API, '_games.js'));
  const saved = require.cache[f];
  delete require.cache[f];
  let G2;
  try { G2 = require(f); } finally { require.cache[f] = saved; }
  assert.notStrictEqual(G2, GM);
  const seen = [];
  const client = { query: async (sql, p) => { seen.push(sql); return F.pool.query(sql, p); } };
  const nDdl = F.db.ddl.length;
  await assert.rejects(G2.grantGame('ws', 'nd@x.mn', 'sudoku', 30, client), /транзакц/);
  await assert.rejects(G2.recordPurchase({ invoice_id: 'ND1', realm: 'ws', email: 'nd@x.mn', game_key: 'sudoku', amount: 1900 }, client), /транзакц/);
  await assert.rejects(G2.revokeGame('ws', 'nd@x.mn', 'sudoku', client), /транзакц/);
  assert.deepStrictEqual(seen, [], 'client-ээр юу ч явуулаагүй');
  assert.strictEqual(F.db.ddl.length, nDdl, 'DDL ажиллаагүй');
  assert.strictEqual(access('ws', 'nd@x.mn', 'sudoku'), null);
  await G2.ensureGameTables();
  near(daysLeft(await G2.grantGame('ws', 'nd@x.mn', 'sudoku', 30, client)), 30);
  // db-гүй дуудлага өөрөө ensureGameTables хийнэ (хуучин хэв маяг)
  delete require.cache[f];
  let G3;
  try { G3 = require(f); } finally { require.cache[f] = saved; }
  near(daysLeft(await G3.grantGame('ws', 'nd3@x.mn', 'sudoku')), 30);
});

test('create: cm Premium / GAME_PAYWALL=off → 409 already (нэхэмжлэх үүсэхгүй); ws realm, дууссан Premium, идэвхтэй эрх (сунгалт) → 200; DB алдаа → 503', async () => {
  F.addUser('pr@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 9 * F.DAY) });
  F.addUser('ex@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() - F.DAY) });
  let r = await Q('create', { plan: 'game', realm: 'cm', game: 'sudoku' }, { headers: bearer(cmTok('pr@x.mn')) });
  assert.strictEqual(r.statusCode, 409, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.ok, r.body.already, r.body.via], [false, true, 'premium']);
  assert.ok(r.body.error);
  assert.strictEqual(F.qp.invoices.length, 0, 'QPay нэхэмжлэх үүсээгүй');
  assert.strictEqual(F.db.pay.size, 0);
  assert.strictEqual((await GM.entitlement('cm', 'pr@x.mn', 'sudoku')).via, 'premium');
  // Premium-ээс өмнө худалдаж авсан идэвхтэй эрхтэй (entitlement via='access') ч Premium хэвээр → 409
  F.db.access.set('cm|pr@x.mn|ludo', { realm: 'cm', email: 'pr@x.mn', game_key: 'ludo', expires_at: new Date(Date.now() + 3 * F.DAY) });
  assert.strictEqual((await GM.entitlement('cm', 'pr@x.mn', 'ludo')).via, 'access');
  r = await Q('create', { plan: 'game', realm: 'cm', game: 'ludo' }, { headers: bearer(cmTok('pr@x.mn')) });
  assert.deepStrictEqual([r.statusCode, r.body.already, r.body.via], [409, true, 'premium'], JSON.stringify(r.body));
  assert.strictEqual(F.qp.invoices.length, 0);

  await buyWs('pr@x.mn', 'sudoku');   // Premium нь ws realm-д хамаарахгүй → худалдан авна
  await buyCm('ex@x.mn', 'sudoku');   // дууссан Premium → худалдан авна
  F.db.access.set('ws|ac@x.mn|ludo', { realm: 'ws', email: 'ac@x.mn', game_key: 'ludo', expires_at: new Date(Date.now() + 5 * F.DAY) });
  await buyWs('ac@x.mn', 'ludo');     // идэвхтэй эрх → НЭМЭГДДЭГ сунгалтыг зөвшөөрнө
  assert.strictEqual(F.qp.invoices.length, 3);

  process.env.GAME_PAYWALL = 'off';
  for (const [body, headers, who] of [
    [{ plan: 'game', realm: 'ws', game: 'play2048', wstoken: wsTok('k@x.mn') }, null, 'ws'],
    [{ plan: 'game', realm: 'cm', game: 'mathmortal' }, bearer(cmTok('ex@x.mn')), 'cm'],
  ]) {
    r = await Q('create', body, headers ? { headers: headers } : undefined);
    assert.strictEqual(r.statusCode, 409, who + ' ' + JSON.stringify(r.body));
    assert.deepStrictEqual([r.body.ok, r.body.already, r.body.via], [false, true, 'off'], who);
  }
  // kill-switch үед ч нэвтрэлт/allowlist шалгалт хэвээр
  assert.strictEqual((await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku' })).statusCode, 401);
  assert.strictEqual((await Q('create', { plan: 'game', realm: 'ws', game: 'hack', wstoken: wsTok('k@x.mn') })).statusCode, 400);
  assert.strictEqual(F.qp.invoices.length, 3, 'off үед нэхэмжлэх үүсээгүй');
  process.env.GAME_PAYWALL = 'on';

  // Эрх шалгах DB алдаа → нэхэмжлэх үүсгэхгүй (fail-closed)
  F.db.failEnt = true;
  r = await Q('create', { plan: 'game', realm: 'ws', game: 'xpdrop', wstoken: wsTok('k@x.mn') });
  assert.strictEqual(r.statusCode, 503, JSON.stringify(r.body));
  assert.notStrictEqual(r.body.ok, true);
  assert.strictEqual(F.qp.invoices.length, 3);
  F.db.failEnt = false;
  await buyWs('k@x.mn', 'xpdrop');
});

test('check rate limit: нэхэмжлэх тутам 240/10мин, IP тутам 3000/10мин', async () => {
  const inv = await buyWs('poll@x.mn', 'songon');
  for (let i = 0; i < 240; i++) {
    const r = await check(inv, 'poll@x.mn');
    if (r.statusCode !== 200) assert.fail('i=' + i + ' ' + r.statusCode);
  }
  const r = await check(inv, 'poll@x.mn');
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(r.body.paid, false);
  const n = F.qp.checks.length;
  await check(inv, 'poll@x.mn');
  assert.strictEqual(F.qp.checks.length, n, '429 үед QPay руу хандахгүй');

  const inv2 = await buyWs('poll2@x.mn', 'nicebattle');
  F.db.rl.set('qpay_chk_ip:198.51.100.7', { ws: Date.now(), count: 3000 });
  assert.strictEqual((await check(inv2, 'poll2@x.mn', { ip: '198.51.100.7' })).statusCode, 429);
  assert.strictEqual((await check(inv2, 'poll2@x.mn', { ip: '198.51.100.8' })).statusCode, 200);
});

test('revokeGame → эрх алга; дахин авбал NOW+30', async () => {
  await GM.grantGame('ws', 'rv@x.mn', 'sudoku', 30);
  assert.strictEqual(await GM.revokeGame('ws', 'RV@x.mn', 'sudoku'), 1);
  assert.strictEqual(await GM.revokeGame('ws', 'rv@x.mn', 'sudoku'), 0);
  assert.strictEqual(await GM.entitled('ws', 'rv@x.mn', 'sudoku'), false);
  assert.strictEqual(await GM.currentExpiry('ws', 'rv@x.mn', 'sudoku'), null);
  near(daysLeft(await GM.grantGame('ws', 'rv@x.mn', 'sudoku')), 30);
  await assert.rejects(GM.revokeGame('ws', 'rv@x.mn', 'hack'));
});

test('регресс: Premium (monthly) ба сургалт (event) одоогийн замаар олгогдоно, тоглоомын эрх үүсэхгүй', async () => {
  F.addUser('prem@x.mn');
  let r = await Q('create', { plan: 'monthly', email: 'prem@x.mn' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  const inv = r.body.invoice.invoice_id;
  assert.deepStrictEqual([F.db.pay.get(inv).plan, F.db.pay.get(inv).amount, F.db.pay.get(inv).game_key], ['monthly', 9900, null]);
  F.qp.paid.set(inv, 9900);
  r = await check(inv, 'prem@x.mn');
  assert.strictEqual(r.body.paid, true);
  const u = F.db.users.get('prem@x.mn');
  assert.strictEqual(u.plan, 'premium');
  near(daysLeft(u.premium_expiry), 30);
  assert.strictEqual(F.db.access.size, 0);
  assert.strictEqual(F.db.purch.length, 0);

  F.db.events.set(5, { id: 5, title: 'Олимпиад', price: 20000, active: true });
  F.db.regs.push({ id: 1, event_id: 5, email: 'ev@x.mn', paid: false, slot: '10:00' });
  r = await Q('create', { plan: 'event', event_id: 5, email: 'ev@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  const einv = r.body.invoice.invoice_id;
  F.qp.paid.set(einv, 20000);
  r = await check(einv, 'ev@x.mn');
  assert.deepStrictEqual(r.body, { ok: true, paid: true });
  assert.strictEqual(F.db.regs[0].paid, true);
  assert.strictEqual(F.db.access.size, 0);
});

test('тодорхойгүй SQL алга, бодит сүлжээ рүү хандаагүй', () => {
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.qp.other, []);
});
