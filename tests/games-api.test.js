// api/games.js — catalog / status / launch / invite + api/_games.js тасалбар/урилга + _guard ws токен + _wsdev.checkReq.
// Ажиллуулах: node --test tests/games-api.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

const games = require(path.join(F.API, 'games.js'));
const GM = require(path.join(F.API, '_games.js'));
const guard = require(path.join(F.API, '_guard.js'));
const WDEV = require(path.join(F.API, '_wsdev.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;

const wsTok = (e, extra) => jwt.sign(Object.assign({ email: e, ws: true }, extra || {}), SEC);
const cmTok = (e, tv) => jwt.sign({ email: e, role: 'student', tv: tv | 0 }, SEC);
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const ADMIN = bearer(jwt.sign({ admin: true }, SEC));
const dev = (id) => ({ 'x-device-id': id });
const derived = (purpose) => crypto.createHmac('sha256', SEC).update(purpose).digest();
const K_LAUNCH = 'cybermath/game-launch/v1', K_INVITE = 'cybermath/game-invite/v1';

const G = (action, body, o) => F.call(games, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const launchWs = (email, game, o) => G('launch', { game: game, realm: 'ws', wstoken: wsTok(email) }, Object.assign({ headers: dev('devaaaa1') }, o || {}));
const launchCm = (email, game, o) => G('launch', { game: game, realm: 'cm' }, Object.assign({ headers: bearer(cmTok(email)) }, o || {}));
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / F.DAY;
// url-ийн ?t= (ws бол /<зам>?realm=ws&t=…, cm бол /<зам>?t=…)
const ticketOf = (url) => new URL(String(url), 'https://cyber-math.com').searchParams.get('t') || '';
function payload(tok) { return JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8')); }
function give(realm, email, key, days) {
  F.db.access.set(realm + '|' + email + '|' + key, { realm: realm, email: email, game_key: key, expires_at: new Date(Date.now() + (days == null ? 30 : days) * F.DAY), updated_at: new Date() });
}
async function shifted(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try { return await fn(); } finally { Date.now = real; }
}

beforeEach(() => F.reset());

// ───────────────────────── catalog ─────────────────────────
test('catalog: нийтийн, 16 тоглоом, үнэ/хоног серверээс; GAME_PRICE/GAME_PAYWALL; POST → 405', async () => {
  const r = await F.call(games, { method: 'GET', query: { action: 'catalog' } });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.enabled, true);
  assert.strictEqual(r.body.price, 1900);
  assert.strictEqual(r.body.days, 30);
  assert.strictEqual(r.body.invite_hours, 3);
  assert.strictEqual(r.body.games.length, 16);
  r.body.games.forEach((g) => {
    assert.deepStrictEqual(Object.keys(g).sort(), ['key', 'kind', 'multi', 'title'], g.key);
    assert.ok(GM.isGame(g.key));
  });
  assert.match(r.headers['Cache-Control'], /public/);
  assert.strictEqual(F.db.rl.size, 0, 'каталог DB/rate limit ашиглахгүй');

  process.env.GAME_PRICE = '2500';
  process.env.GAME_PAYWALL = 'off';
  const r2 = await F.call(games, { method: 'GET', query: { action: 'catalog' } });
  assert.strictEqual(r2.body.price, 2500);
  assert.strictEqual(r2.body.enabled, false);

  const r3 = await F.call(games, { method: 'POST', query: { action: 'catalog' } });
  assert.strictEqual(r3.statusCode, 405);
  const r4 = await F.call(games, { method: 'GET', query: { action: 'nope' } });
  assert.strictEqual(r4.statusCode, 400);
  const r5 = await F.call(games, { method: 'OPTIONS', query: { action: 'launch' } });
  assert.strictEqual(r5.statusCode, 200);
});

// ───────────────────────── status ─────────────────────────
test('status: realm-ийн токеноор тоглоом бүрийн expires_at; дууссан эрх харагдахгүй; realm тусгаарлалт; premium', async () => {
  F.addUser('a@x.mn');
  give('ws', 'a@x.mn', 'sudoku', 10);
  give('ws', 'a@x.mn', 'play2048', -1);          // дууссан
  give('cm', 'a@x.mn', 'chessmath', 5);

  const ws = await G('status', { realm: 'ws', wstoken: wsTok('a@x.mn') }, { headers: dev('devaaaa1') });
  assert.strictEqual(ws.statusCode, 200, JSON.stringify(ws.body));
  assert.deepStrictEqual(Object.keys(ws.body.games), ['sudoku']);
  assert.ok(Math.abs(daysLeft(ws.body.games.sudoku) - 10) < 0.01);
  assert.strictEqual(ws.body.realm, 'ws');
  assert.strictEqual(ws.body.email, 'a@x.mn');
  assert.strictEqual(ws.body.premium, false);
  assert.strictEqual(ws.body.enabled, true);
  assert.strictEqual(ws.body.price, 1900);
  assert.strictEqual(ws.headers['Cache-Control'], 'no-store');

  // cm: GET + query realm, Bearer cm_token
  const cm = await F.call(games, { method: 'GET', query: { action: 'status', realm: 'cm' }, headers: bearer(cmTok('a@x.mn')) });
  assert.strictEqual(cm.statusCode, 200, JSON.stringify(cm.body));
  assert.deepStrictEqual(Object.keys(cm.body.games), ['chessmath'], 'ws-ийн эрх cm-д харагдахгүй');
  assert.strictEqual(cm.body.premium, false);

  F.addUser('p@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 5 * F.DAY) });
  const pr = await G('status', { realm: 'cm' }, { headers: bearer(cmTok('p@x.mn')) });
  assert.strictEqual(pr.body.premium, true);
  // ws realm-д Premium хамаарахгүй
  const pw = await G('status', { realm: 'ws', wstoken: wsTok('p@x.mn') }, { headers: dev('devaaaa1') });
  assert.strictEqual(pw.body.premium, false);
});

test('status: токенгүй / өөр сайтын токен / админ / хуучирсан → 401; realm буруу → 400; JWT_SECRET байхгүй → 500', async () => {
  F.addUser('cm@x.mn');
  F.addUser('stale@x.mn', { token_version: 3 });
  const cases = [
    [{ realm: 'ws' }, null, 401, 'ws токенгүй'],
    [{ realm: 'ws', email: 'cm@x.mn' }, null, 401, 'body.email-д итгэхгүй'],
    [{ realm: 'ws', wstoken: cmTok('cm@x.mn') }, null, 401, 'ws realm + cm токен'],
    [{ realm: 'ws', wstoken: jwt.sign({ email: 'cm@x.mn', ws: true }, 'other') }, null, 401, 'өөр түлхүүр'],
    [{ realm: 'ws', wstoken: jwt.sign({ email: 'cm@x.mn', ws: true }, null, { algorithm: 'none' }) }, null, 401, 'alg none'],
    [{ realm: 'cm' }, null, 401, 'cm токенгүй'],
    [{ realm: 'cm', wstoken: wsTok('cm@x.mn') }, null, 401, 'cm realm + body ws токен'],
    [{ realm: 'cm' }, bearer(wsTok('cm@x.mn')), 401, 'cm realm + Bearer ws токен'],
    [{ realm: 'cm' }, ADMIN, 401, 'админ'],
    [{ realm: 'cm' }, bearer(jwt.sign({ email: 'cm@x.mn', uid: 1 }, SEC)), 401, 'NOMAD uid'],
    [{ realm: 'cm' }, bearer(cmTok('stale@x.mn', 0)), 401, 'tv зөрсөн'],
    [{ realm: 'cm' }, bearer(cmTok('ghost@x.mn')), 401, 'users-д байхгүй'],
    [{}, null, 400, 'realm байхгүй'],
    [{ realm: 'both' }, null, 400, 'realm буруу'],
  ];
  for (const [body, headers, code, msg] of cases) {
    const r = await G('status', body, headers ? { headers: headers } : undefined);
    assert.strictEqual(r.statusCode, code, msg + ' ' + JSON.stringify(r.body));
    assert.strictEqual(r.body.ok, false, msg);
    assert.strictEqual(r.body.games, undefined, msg);
    if (code === 401) assert.strictEqual(r.body.needLogin, true, msg);
  }
  // ws status-ийг GET-ээр (токен URL-д) авахгүй
  const g = await F.call(games, { method: 'GET', query: { action: 'status', realm: 'ws', wstoken: wsTok('cm@x.mn') } });
  assert.strictEqual(g.statusCode, 401);

  // WS_TOKEN_IAT_MIN: түүнээс өмнөх ws токен хүчингүй
  process.env.WS_TOKEN_IAT_MIN = String(Math.floor(Date.now() / 1000) + 100);
  const old = await G('status', { realm: 'ws', wstoken: wsTok('cm@x.mn') }, { headers: dev('devaaaa1') });
  assert.strictEqual(old.statusCode, 401);
  delete process.env.WS_TOKEN_IAT_MIN;

  const saved = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  try {
    const r = await G('status', { realm: 'cm' }, { headers: bearer(cmTok('cm@x.mn')) });
    assert.strictEqual(r.statusCode, 500);
  } finally { process.env.JWT_SECRET = saved; }
});

// ───────────────────────── _guard ws токен ─────────────────────────
test('_guard.wsPayload/wsEmail: ws:true HS256 л; cm/admin/alg none/өөр түлхүүр/WS_TOKEN_IAT_MIN → null', () => {
  assert.strictEqual(guard.wsEmail(wsTok(' A@X.mn ')), 'a@x.mn');
  assert.strictEqual(guard.wsPayload(wsTok('a@x.mn', { dev: 'devaaaa1' })).dev, 'devaaaa1');
  assert.strictEqual(guard.wsEmail(cmTok('a@x.mn')), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ admin: true }, SEC)), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ email: 'a@x.mn', ws: 'true' }, SEC)), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ email: 'a@x.mn', ws: true }, null, { algorithm: 'none' })), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ email: 'a@x.mn', ws: true }, 'x')), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ email: 'a@x.mn', ws: true }, SEC, { algorithm: 'HS512' })), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ email: 'a@x.mn', ws: true }, SEC, { expiresIn: -10 })), null);
  assert.strictEqual(guard.wsEmail(null), null);
  assert.strictEqual(guard.wsEmail({}), null);
  process.env.WS_TOKEN_IAT_MIN = String(Math.floor(Date.now() / 1000) + 100);
  assert.strictEqual(guard.wsEmail(wsTok('a@x.mn')), null);
  assert.strictEqual(guard.wsEmail(jwt.sign({ email: 'a@x.mn', ws: true, iat: Math.floor(Date.now() / 1000) + 200 }, SEC)), 'a@x.mn');
  delete process.env.WS_TOKEN_IAT_MIN;
});

// ───────────────────────── launch ─────────────────────────
test('launch: эрхтэй файл тоглоом → gate руу чиглэх url + 120 сек тасалбар (g/r/sub, давтагдахгүй jti)', async () => {
  give('ws', 'a@x.mn', 'sudoku', 7);
  const r = await launchWs('a@x.mn', 'sudoku');
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.kind, 'file');
  assert.strictEqual(r.body.via, 'access');
  assert.ok(Math.abs(daysLeft(r.body.expires_at) - 7) < 0.01);
  assert.strictEqual(r.body.ticket_ttl, 120);
  assert.ok(r.body.url.indexOf('/sudoku.html?realm=ws&t=') === 0, 'Дасгалын төвийн url realm-тэй: ' + r.body.url);
  const t = ticketOf(r.body.url);
  const c = GM.verifyTicket(t, 'sudoku');
  assert.ok(c, 'тасалбар хүчинтэй');
  assert.strictEqual(c.typ, 'glt');
  assert.strictEqual(c.g, 'sudoku');
  assert.strictEqual(c.r, 'ws');
  assert.strictEqual(c.sub, GM.subjectOf('ws', 'a@x.mn'), 'sub = тунгалаг таних тэмдэг');
  assert.ok(!/@/.test(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')), 'имэйл URL-ийн тасалбарт ил гарахгүй');
  assert.strictEqual(c.sx, Math.floor(new Date(r.body.expires_at).getTime() / 1000), 'sx = эрхийн дуусах огноо');
  assert.strictEqual(c.exp - c.iat, 120);
  assert.match(c.jti, /^[a-f0-9]{32}$/);
  assert.strictEqual(GM.verifyTicket(t, 'play2048'), null, 'өөр тоглоомд хүчингүй');
  assert.strictEqual(r.headers['Cache-Control'], 'no-store');

  const r2 = await launchWs('a@x.mn', 'sudoku');
  const c2 = GM.verifyTicket(ticketOf(r2.body.url), 'sudoku');
  assert.notStrictEqual(c2.jti, c.jti, 'launch бүр шинэ jti');

  // jti НЭГ удаа: анх true, давтвал false
  assert.strictEqual(await GM.useJti(c.jti, c.exp), true);
  assert.strictEqual(await GM.useJti(c.jti, c.exp), false);
  assert.strictEqual(await GM.useJti(c2.jti, new Date(c2.exp * 1000)), true);
  assert.strictEqual(await GM.useJti('../x', c.exp), false);
  assert.strictEqual(await GM.useJti('', c.exp), false);
  F.db.failTix = true;
  await assert.rejects(GM.useJti(crypto.randomBytes(16).toString('hex'), c.exp), 'DB алдаа → throw (gate fail-closed)');

  // cm MATH MORTAL (dir тоглоом)
  F.addUser('m@x.mn');
  give('cm', 'm@x.mn', 'mathmortal', 30);
  const m = await launchCm('m@x.mn', 'mathmortal');
  assert.strictEqual(m.statusCode, 200, JSON.stringify(m.body));
  assert.ok(m.body.url.indexOf('/math-mortal/?t=') === 0, m.body.url);
  assert.strictEqual(GM.verifyTicket(ticketOf(m.body.url), 'mathmortal').r, 'cm');
});

test('launch: inline → {ok} url-гүй (клиент gate); external → гадны url; файл тоглоомын замууд каталогтой таарна', async () => {
  F.addUser('a@x.mn');
  give('cm', 'a@x.mn', 'chessmath');
  give('cm', 'a@x.mn', 'songon');
  give('cm', 'a@x.mn', 'sbh');
  const i = await launchCm('a@x.mn', 'chessmath');
  assert.strictEqual(i.statusCode, 200);
  assert.deepStrictEqual(Object.keys(i.body).sort(), ['expires_at', 'game', 'kind', 'ok', 'via']);
  assert.strictEqual(i.body.kind, 'inline');
  const s = await launchCm('a@x.mn', 'sbh');
  assert.strictEqual(s.body.kind, 'inline');
  assert.strictEqual(s.body.url, undefined);
  const e = await launchCm('a@x.mn', 'songon');
  assert.strictEqual(e.body.kind, 'external');
  assert.strictEqual(e.body.url, 'https://10-11-songon.vercel.app');

  const want = { mathmortal: '/math-mortal/', numseq: '/numseq.html', play2048: '/play2048.html', sudoku: '/sudoku.html', xpdrop: '/xpdrop.html', myangat: '/myangat.html' };
  for (const k of Object.keys(want)) {
    give('cm', 'a@x.mn', k);
    const r = await launchCm('a@x.mn', k);
    assert.strictEqual(r.statusCode, 200, k);
    assert.strictEqual(r.body.url.split('?')[0], want[k], k);
    assert.strictEqual(GM.verifyTicket(ticketOf(r.body.url), k).g, k);
  }
});

test('launch: эрхгүй → 402 needBuy + серверийн үнэ (тасалбаргүй); клиентийн paid/amount/plan/email-д итгэхгүй; realm тусгаарлалт', async () => {
  F.addUser('a@x.mn');
  const r = await G('launch', { game: 'sudoku', realm: 'ws', wstoken: wsTok('a@x.mn'), paid: true, plan: 'premium', amount: 0, price: 1, email: 'rich@x.mn' }, { headers: dev('devaaaa1') });
  assert.strictEqual(r.statusCode, 402, JSON.stringify(r.body));
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(r.body.needBuy, true);
  assert.strictEqual(r.body.price, 1900);
  assert.strictEqual(r.body.days, 30);
  assert.strictEqual(r.body.url, undefined);

  process.env.GAME_PRICE = '2500';
  const r2 = await launchCm('a@x.mn', 'sudoku');
  assert.strictEqual(r2.statusCode, 402);
  assert.strictEqual(r2.body.price, 2500);
  delete process.env.GAME_PRICE;

  // ws-д авсан эрх cm-д ажиллахгүй (ижил имэйл), эсрэгээр ч мөн
  give('ws', 'a@x.mn', 'sudoku');
  assert.strictEqual((await launchCm('a@x.mn', 'sudoku')).statusCode, 402);
  give('cm', 'a@x.mn', 'xpdrop');
  assert.strictEqual((await launchWs('a@x.mn', 'xpdrop')).statusCode, 402);
  assert.strictEqual((await launchWs('a@x.mn', 'sudoku')).statusCode, 200);

  // дууссан эрх → 402
  give('ws', 'a@x.mn', 'numseq', -0.001);
  assert.strictEqual((await launchWs('a@x.mn', 'numseq')).statusCode, 402);

  // өөр хүний эрх
  give('ws', 'b@x.mn', 'play2048');
  assert.strictEqual((await launchWs('a@x.mn', 'play2048')).statusCode, 402);
});

test('launch: cm Premium → бүх тоглоом (ws-д биш); GAME_PAYWALL=off → нэвтрэлтгүй, тасалбаргүй; админ → зөвшөөрнө', async () => {
  F.addUser('p@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 3 * F.DAY) });
  const p = await launchCm('p@x.mn', 'sudoku');
  assert.strictEqual(p.statusCode, 200);
  assert.strictEqual(p.body.via, 'premium');
  assert.ok(GM.verifyTicket(ticketOf(p.body.url), 'sudoku'));
  assert.strictEqual((await launchWs('p@x.mn', 'sudoku')).statusCode, 402, 'Premium нь ws realm-д хамаарахгүй');
  F.addUser('old@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() - F.DAY) });
  assert.strictEqual((await launchCm('old@x.mn', 'sudoku')).statusCode, 402, 'дууссан Premium');

  process.env.GAME_PAYWALL = 'off';
  const off = await G('launch', { game: 'sudoku', realm: 'ws' });
  assert.strictEqual(off.statusCode, 200);
  assert.strictEqual(off.body.via, 'off');
  assert.strictEqual(off.body.url, '/sudoku.html');
  const offI = await G('launch', { game: 'gomoku', realm: 'cm' });
  assert.strictEqual(offI.body.ok, true);
  assert.strictEqual((await G('launch', { game: 'hack', realm: 'cm' })).statusCode, 400, 'off үед ч allowlist');
  process.env.GAME_PAYWALL = 'on';

  const a = await G('launch', { game: 'myangat', realm: 'cm' }, { headers: ADMIN });
  assert.strictEqual(a.statusCode, 200);
  assert.strictEqual(a.body.via, 'admin');
  assert.strictEqual(GM.verifyTicket(ticketOf(a.body.url), 'myangat').sub, 'admin');
  const fake = await G('launch', { game: 'myangat', realm: 'cm' }, { headers: bearer(jwt.sign({ admin: true }, 'other')) });
  assert.strictEqual(fake.statusCode, 401, 'өөр түлхүүрийн admin');
});

test('launch: оролт шалгалт — тоглоом/realm/арга буруу → 400/405; токенгүй → 401; DB алдаа → 503 (fail-closed)', async () => {
  const tok = wsTok('a@x.mn');
  for (const game of ['hack', '__proto__', 'constructor', 'toString', '', null, ['sudoku'], { k: 1 }, 'SUDOKU']) {
    const r = await G('launch', { game: game, realm: 'ws', wstoken: tok }, { headers: dev('devaaaa1') });
    assert.strictEqual(r.statusCode, 400, JSON.stringify(game));
  }
  assert.strictEqual((await G('launch', { game: 'sudoku', wstoken: tok })).statusCode, 400);
  assert.strictEqual((await G('launch', { game: 'sudoku', realm: 'xx', wstoken: tok })).statusCode, 400);
  assert.strictEqual((await F.call(games, { method: 'GET', query: { action: 'launch' }, body: { game: 'sudoku', realm: 'ws' } })).statusCode, 405);
  const n = await G('launch', { game: 'sudoku', realm: 'ws' });
  assert.strictEqual(n.statusCode, 401);
  assert.strictEqual(n.body.needLogin, true);
  // string body (content-type буруу) — эвдрэхгүй
  const sb = await F.call(games, { query: { action: 'launch' }, body: JSON.stringify({ game: 'sudoku', realm: 'ws', wstoken: tok }), headers: dev('devaaaa1') });
  assert.strictEqual(sb.statusCode, 402);

  give('ws', 'a@x.mn', 'sudoku');
  F.db.failEnt = true;
  const e = await launchWs('a@x.mn', 'sudoku');
  assert.strictEqual(e.statusCode, 503);
  assert.strictEqual(e.body.url, undefined);
  assert.ok(!/db down/.test(JSON.stringify(e.body)), 'дотоод алдааны текст гарахгүй');
});

// ───────────────────────── тасалбарын аюулгүй байдал ─────────────────────────
test('тасалбар: хуурамч/өөрчилсөн/хугацаа дууссан/урт амьдралтай/өөр зориулалтын түлхүүр → хүчингүй', async () => {
  give('ws', 'a@x.mn', 'sudoku');
  const r = await launchWs('a@x.mn', 'sudoku');
  const t = ticketOf(r.body.url);
  const c = GM.verifyTicket(t);
  assert.ok(c);
  // payload-ийг өөрчилбөл гарын үсэг таарахгүй
  const parts = t.split('.');
  const p2 = Buffer.from(JSON.stringify(Object.assign({}, payload(t), { g: 'play2048' }))).toString('base64url');
  assert.strictEqual(GM.verifyTicket(parts[0] + '.' + p2 + '.' + parts[2]), null);
  // JWT_SECRET-ээр шууд гарын үсэг зурсан (нэвтрэлтийн түлхүүр) → хүчингүй
  const now = Math.floor(Date.now() / 1000);
  const SUB = GM.subjectOf('ws', 'x@x.mn');
  const raw = jwt.sign({ typ: 'glt', g: 'sudoku', r: 'ws', sub: SUB, iat: now, exp: now + 60, jti: c.jti }, SEC);
  assert.strictEqual(GM.verifyTicket(raw, 'sudoku'), null);
  // урилгын түлхүүрээр зурсан тасалбар → хүчингүй
  const inv = jwt.sign({ typ: 'glt', g: 'sudoku', r: 'ws', sub: SUB, iat: now, exp: now + 60, jti: c.jti }, derived(K_INVITE));
  assert.strictEqual(GM.verifyTicket(inv, 'sudoku'), null);
  // зөв түлхүүр ч typ буруу / TTL > 120 / jti буруу / realm буруу / тоглоом буруу → хүчингүй
  const L = derived(K_LAUNCH);
  const base = { typ: 'glt', g: 'sudoku', r: 'ws', sub: SUB, iat: now, exp: now + 60, jti: c.jti };
  assert.ok(GM.verifyTicket(jwt.sign(base, L), 'sudoku'), 'хяналтын тохиолдол хүчинтэй');
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { typ: 'gi' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { exp: now + 3600 }), L)), null);
  const noExp = Object.assign({}, base); delete noExp.exp;
  assert.strictEqual(GM.verifyTicket(jwt.sign(noExp, L)), null, 'хугацаагүй тасалбар');
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { jti: 'abc' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { r: 'WS' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { g: '__proto__' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { sub: '' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { sub: 'x@x.mn' }), L)), null, 'имэйл sub (хуучин хэлбэр) хүчингүй');
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { sub: 'u:XYZ' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { sx: 'never' }), L)), null, 'sx тоо биш');
  assert.ok(GM.verifyTicket(jwt.sign(Object.assign({}, base, { sx: now + 99 }), L), 'sudoku'));
  // урт токен (зөв түлхүүрээр зурсан ч) 2048 тэмдэгтээс урт → хүчингүй
  const fat = jwt.sign(Object.assign({}, base, { pad: 'x'.repeat(2100) }), L);
  assert.ok(fat.length > 2048);
  assert.strictEqual(GM.verifyTicket(fat, 'sudoku'), null, 'токены уртын хязгаар');
  assert.ok(GM.verifyTicket(jwt.sign(Object.assign({}, base, { pad: 'x'.repeat(1000) }), L), 'sudoku'), 'хязгаараас богино бол хүчинтэй');
  assert.strictEqual(GM.verifyTicket(jwt.sign(base, L, { algorithm: 'HS512' })), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(base, null, { algorithm: 'none' })), null);
  // ws нэвтрэлтийн токен, урилга тасалбар биш
  assert.strictEqual(GM.verifyTicket(wsTok('a@x.mn')), null);
  // 120 секундын дараа хүчингүй
  await shifted(121000, async () => { assert.strictEqual(GM.verifyTicket(t, 'sudoku'), null); });
  assert.ok(GM.verifyTicket(t, 'sudoku'));
  // JWT_SECRET өөрчлөгдвөл хуучин тасалбар хүчингүй
  const saved = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'rotated';
  try { assert.strictEqual(GM.verifyTicket(t, 'sudoku'), null); } finally { process.env.JWT_SECRET = saved; }
});

// ───────────────────────── төхөөрөмжийн хязгаар ─────────────────────────
// Хязгаарыг WDEV.MAX_DEVICES-ээс уншина (env WS_MAX_DEVICES; анхдагч 2 → 4 болсон, g5 96f8df6) — тоог хатуу бичихгүй.
test('ws: төхөөрөмжийн хязгаар (WDEV.MAX_DEVICES) — дүүрсний дараах шинэ төхөөрөмж deviceBlocked (launch/status/invite), тасалбар гарахгүй; cm хязгааргүй', async () => {
  const MAX = WDEV.MAX_DEVICES;
  assert.ok(Number.isInteger(MAX) && MAX >= 1, 'MAX_DEVICES=' + MAX);
  const ids = Array.from({ length: MAX }, (_, i) => 'devfill' + String(i).padStart(3, '0'));
  const extra = 'devextra99';
  give('ws', 'a@x.mn', 'sudoku');
  give('ws', 'a@x.mn', 'sbh');
  for (const id of ids) assert.strictEqual((await launchWs('a@x.mn', 'sudoku', { headers: dev(id) })).statusCode, 200, id);
  assert.strictEqual((await launchWs('a@x.mn', 'sudoku', { headers: dev(ids[0]) })).statusCode, 200, 'бүртгэлтэй төхөөрөмж');
  const c = await launchWs('a@x.mn', 'sudoku', { headers: dev(extra) });
  assert.strictEqual(c.statusCode, 403, JSON.stringify(c.body));
  assert.strictEqual(c.body.deviceBlocked, true);
  assert.strictEqual(c.body.reason, 'DEVICE_LIMIT');
  assert.strictEqual(c.body.max, MAX);
  assert.strictEqual(c.body.url, undefined);
  assert.deepStrictEqual(c.body.devices.map((d) => d.id).sort(), ids.slice().sort());
  assert.ok(F.db.devBlocks.some((b) => b.email === 'a@x.mn' && b.why === 'DEVICE_LIMIT' && b.device_id === extra));

  const st = await G('status', { realm: 'ws', wstoken: wsTok('a@x.mn') }, { headers: dev(extra) });
  assert.strictEqual(st.statusCode, 403);
  assert.strictEqual(st.body.deviceBlocked, true);
  assert.strictEqual(st.body.games, undefined);
  const iv = await G('invite', { game: 'sbh', realm: 'ws', wstoken: wsTok('a@x.mn') }, { headers: dev(extra) });
  assert.strictEqual(iv.statusCode, 403);
  assert.strictEqual(iv.body.invite, undefined);
  assert.strictEqual(F.db.invites.size, 0);

  // толгой илгээхгүй → токеноос гарсан 'tk…' түлхүүр байр эзэлнэ (дүүрсэн тул хаагдана)
  const nh = await G('launch', { game: 'sudoku', realm: 'ws', wstoken: wsTok('a@x.mn') });
  assert.strictEqual(nh.statusCode, 403);
  assert.ok(F.db.devBlocks.some((b) => /^tk[a-f0-9]{16}$/.test(b.device_id)));

  // cm realm-д төхөөрөмжийн хязгаар байхгүй
  F.addUser('a@x.mn');
  give('cm', 'a@x.mn', 'sudoku');
  for (const d of ['d1aaaaaa', 'd2aaaaaa', 'd3aaaaaa']) {
    assert.strictEqual((await launchCm('a@x.mn', 'sudoku', { headers: Object.assign(dev(d), bearer(cmTok('a@x.mn'))) })).statusCode, 200);
  }
});

test('ws: токенд dev байгаа бөгөөд өөр төхөөрөмжөөс → DEVICE_MISMATCH; толгойгүй бол токены dev; DB алдаа → 503', async () => {
  give('ws', 'a@x.mn', 'sudoku');
  const tok = wsTok('a@x.mn', { dev: 'devaaaa1' });
  const ok = await G('launch', { game: 'sudoku', realm: 'ws', wstoken: tok }, { headers: dev('devaaaa1') });
  assert.strictEqual(ok.statusCode, 200);
  const mm = await G('launch', { game: 'sudoku', realm: 'ws', wstoken: tok }, { headers: dev('devzzzz9') });
  assert.strictEqual(mm.statusCode, 403);
  assert.strictEqual(mm.body.reason, 'DEVICE_MISMATCH');
  assert.strictEqual(mm.body.url, undefined);
  assert.ok(F.db.devBlocks.some((b) => b.why === 'DEVICE_MISMATCH' && b.device_id === 'devzzzz9'));
  const nh = await G('launch', { game: 'sudoku', realm: 'ws', wstoken: tok });
  assert.strictEqual(nh.statusCode, 200, 'толгойгүй → токены dev (бүртгэлтэй)');
  assert.strictEqual(F.db.devices.size, 1);

  F.db.failDev = true;
  const e = await G('launch', { game: 'sudoku', realm: 'ws', wstoken: tok }, { headers: dev('devaaaa1') });
  assert.strictEqual(e.statusCode, 503, 'төхөөрөмж шалгаж чадахгүй → хаалттай');
  assert.strictEqual(e.body.url, undefined);
});

// ───────────────────────── урилга ─────────────────────────
test('invite: зөвхөн multi тоглоом, зөвхөн эрхтэй host; токенд имэйл байхгүй; url/хугацаа/хэрэглээний хязгаар', async () => {
  F.addUser('h@x.mn');
  assert.strictEqual((await G('invite', { game: 'sudoku', realm: 'ws', wstoken: wsTok('h@x.mn') }, { headers: dev('devaaaa1') })).statusCode, 400, 'multi биш');
  assert.strictEqual((await G('invite', { game: 'hack', realm: 'ws', wstoken: wsTok('h@x.mn') }, { headers: dev('devaaaa1') })).statusCode, 400);
  assert.strictEqual((await G('invite', { game: 'sbh', realm: 'ws' })).statusCode, 401, 'нэвтрээгүй');
  const nb = await G('invite', { game: 'sbh', realm: 'ws', wstoken: wsTok('h@x.mn') }, { headers: dev('devaaaa1') });
  assert.strictEqual(nb.statusCode, 402, 'эрхгүй host');
  assert.strictEqual(nb.body.needBuy, true);
  assert.strictEqual(F.db.invites.size, 0);

  give('ws', 'h@x.mn', 'sbh');
  const r = await G('invite', { game: 'sbh', realm: 'ws', wstoken: wsTok('h@x.mn') }, { headers: dev('devaaaa1') });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.max_uses, 20);
  assert.ok(Math.abs((new Date(r.body.expires_at).getTime() - Date.now()) / 3600e3 - 3) < 0.01, '3 цаг');
  assert.strictEqual(r.body.url, '/worksheets?game=sbh&ginv=' + encodeURIComponent(r.body.invite));
  const pl = payload(r.body.invite);
  assert.strictEqual(pl.typ, 'gi');
  assert.strictEqual(pl.g, 'sbh');
  assert.strictEqual(pl.r, 'ws');
  assert.strictEqual(pl.exp - pl.iat, 3 * 3600);
  assert.ok(!/@/.test(JSON.stringify(pl)), 'host-ийн имэйл токенд ил гарахгүй');
  assert.strictEqual(F.db.invites.get(pl.jti).email, 'h@x.mn');
  assert.strictEqual(GM.verifyTicket(r.body.invite), null, 'урилга тасалбар биш');

  // cm host: Premium-ээр ч урилга үүсгэнэ; url нь cyber-math.com нүүр
  F.addUser('p@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + F.DAY) });
  const pc = await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(cmTok('p@x.mn')) });
  assert.strictEqual(pc.statusCode, 200, JSON.stringify(pc.body));
  assert.strictEqual(pc.body.via, 'premium');
  assert.ok(pc.body.url.indexOf('/?game=mathmortal&ginv=') === 0);
  // админ токеноор урилга үүсгэхгүй
  assert.strictEqual((await G('invite', { game: 'sbh', realm: 'cm' }, { headers: ADMIN })).statusCode, 401);
});

test('invite → найз нэвтрээгүй ч эрхгүй ч нэгдэнэ (тасалбар sub=inv:…); тоглоом/realm/хугацаа/хэрэглээ/host-ийн эрх шалгагдана', async () => {
  F.addUser('h@x.mn');
  give('cm', 'h@x.mn', 'mathmortal');
  give('cm', 'h@x.mn', 'chessmath');
  const mk = async (game) => (await G('invite', { game: game, realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')) })).body.invite;
  const inv = await mk('mathmortal');
  const jti = payload(inv).jti;

  // нэвтрээгүй найз → файл тоглоомын тасалбар
  const j = await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv });
  assert.strictEqual(j.statusCode, 200, JSON.stringify(j.body));
  assert.strictEqual(j.body.via, 'invite');
  const c = GM.verifyTicket(ticketOf(j.body.url), 'mathmortal');
  assert.strictEqual(c.sub, 'inv:' + jti);
  assert.strictEqual(c.r, 'cm');
  // нэвтэрсэн эрхгүй найз (өөр realm-ийн токентой ч) → урилгаар орно
  F.addUser('f@x.mn');
  const j2 = await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv }, { headers: bearer(cmTok('f@x.mn')) });
  assert.strictEqual(j2.statusCode, 200);
  assert.strictEqual(F.db.invites.get(jti).uses, 2);

  // өөр тоглоомд → хүчингүй
  const wg = await G('launch', { game: 'chessmath', realm: 'cm', invite: inv });
  assert.strictEqual(wg.statusCode, 403);
  assert.strictEqual(wg.body.inviteInvalid, true);
  assert.strictEqual(wg.body.reason, 'invalid');
  // өөр realm-д → хүчингүй
  const wr = await G('launch', { game: 'mathmortal', realm: 'ws', invite: inv });
  assert.strictEqual(wr.statusCode, 403);
  assert.strictEqual(wr.body.reason, 'realm');
  // буруу төрөл
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: 123 })).statusCode, 400);
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: { a: 1 } })).statusCode, 400);
  // JWT_SECRET-ээр шууд зурсан / launch түлхүүрээр зурсан хуурамч урилга
  const now = Math.floor(Date.now() / 1000);
  const forged = { typ: 'gi', g: 'mathmortal', r: 'cm', iat: now, exp: now + 600, jti: jti };
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: jwt.sign(forged, SEC) })).statusCode, 403);
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: jwt.sign(forged, derived(K_LAUNCH)) })).statusCode, 403);
  // зөв түлхүүрээр зурсан ч DB-д байхгүй jti → хүчингүй
  const ghost = jwt.sign(Object.assign({}, forged, { jti: crypto.randomBytes(16).toString('hex') }), derived(K_INVITE));
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: ghost })).statusCode, 403);
  // multi биш тоглоомын урилга (зөв түлхүүрээр ч) → хүчингүй
  const notMulti = jwt.sign(Object.assign({}, forged, { g: 'sudoku' }), derived(K_INVITE));
  assert.strictEqual((await G('launch', { game: 'sudoku', realm: 'cm', invite: notMulti })).statusCode, 403);
  assert.strictEqual(GM.verifyInvite(notMulti), null);
  assert.ok(GM.verifyInvite(jwt.sign(forged, derived(K_INVITE)), 'mathmortal'), 'хяналтын тохиолдол хүчинтэй');
  give('cm', 'h@x.mn', 'sudoku');
  await assert.rejects(GM.createInvite('cm', 'h@x.mn', 'sudoku'), /олон тоглогч/);
  // 3 цагаас урт хугацаатай урилга → хүчингүй
  const long = jwt.sign(Object.assign({}, forged, { exp: now + 4 * 3600 }), derived(K_INVITE));
  assert.strictEqual(GM.verifyInvite(long), null);

  // хэрэглээний хязгаар (GAME_INVITE_USES)
  process.env.GAME_INVITE_USES = '3';
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv })).statusCode, 200);
  const up = await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv });
  assert.strictEqual(up.statusCode, 403);
  assert.strictEqual(up.body.reason, 'used_up');
  delete process.env.GAME_INVITE_USES;

  // inline тоглоомын урилга → {ok} url-гүй
  const ci = await mk('chessmath');
  const cj = await G('launch', { game: 'chessmath', realm: 'cm', invite: ci });
  assert.strictEqual(cj.statusCode, 200);
  assert.strictEqual(cj.body.url, undefined);

  // host-ийн эрх цуцлагдвал урилга тэр даруй хүчингүй
  await GM.revokeGame('cm', 'h@x.mn', 'chessmath');
  const rv = await G('launch', { game: 'chessmath', realm: 'cm', invite: ci });
  assert.strictEqual(rv.statusCode, 403);
  assert.strictEqual(rv.body.reason, 'host');

  // 3 цагийн дараа хүчингүй
  const late = await mk('mathmortal');
  await shifted(3 * 3600e3 + 2000, async () => {
    const r = await G('launch', { game: 'mathmortal', realm: 'cm', invite: late });
    assert.strictEqual(r.statusCode, 403);
  });

  // DB алдаа → 503
  const inv3 = await mk('mathmortal');
  F.db.failInv = true;
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv3 })).statusCode, 503);
  assert.strictEqual((await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')) })).statusCode, 503);
});

test('invite: GAME_PAYWALL=off → урилгын токенгүй url; launch урилгагүй нээлттэй', async () => {
  F.addUser('h@x.mn');
  process.env.GAME_PAYWALL = 'off';
  const r = await G('invite', { game: 'ludo', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')) });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.invite, null);
  assert.strictEqual(r.body.url, '/?game=ludo');
  assert.strictEqual(F.db.invites.size, 0);
  const j = await G('launch', { game: 'ludo', realm: 'cm', invite: 'garbage' });
  assert.strictEqual(j.statusCode, 200);
  assert.strictEqual(j.body.via, 'off');
});

// ───────────────────────── урилга купон болохгүй (gp-s2-fix1) ─────────────────────────
test('урилга купон биш: анх нэгдсэн төхөөрөмжид уягдана (guests), дахин ачаалалт байр эзлэхгүй, өөр төхөөрөмж → full; богино сесс', async () => {
  F.addUser('host@x.mn');
  give('cm', 'host@x.mn', 'mathmortal', 30);
  const mk = async () => (await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(cmTok('host@x.mn')) })).body;
  const r = await mk();
  assert.strictEqual(r.guests, 1, '1v1 тоглоом → 1 найз');
  const inv = r.invite;
  const jti = payload(inv).jti;
  const join = (devId, ip, hdr) => G('launch', { game: 'mathmortal', realm: 'cm', invite: inv },
    { headers: Object.assign(devId ? dev(devId) : {}, hdr || {}), ip: ip || '203.0.113.50' });

  const a1 = await join('friendaaa1');
  assert.strictEqual(a1.statusCode, 200, JSON.stringify(a1.body));
  assert.strictEqual(a1.body.via, 'invite');
  const a2 = await join('friendaaa1', '198.51.100.77');   // ижил төхөөрөмж, өөр сүлжээ → дахин ачаалалт
  assert.strictEqual(a2.statusCode, 200);
  const row = F.db.invites.get(jti);
  assert.strictEqual(row.uses, 2);
  assert.strictEqual(row.devs.length, 1, 'дахин ачаалалт шинэ байр эзлэхгүй');
  assert.match(row.devs[0], /^[a-f0-9]{32}$/);
  assert.ok(row.devs[0].indexOf('friendaaa1') < 0, 'түүхий device id хадгалахгүй');

  // өөр төхөөрөмж (нэвтрээгүй / толгойгүй / нэвтэрсэн эрхгүй) → full, хэрэглээ зарцуулахгүй
  const b = await join('strangerb2', '10.0.0.2');
  assert.strictEqual(b.statusCode, 403);
  assert.strictEqual(b.body.inviteInvalid, true);
  assert.strictEqual(b.body.reason, 'full');
  assert.strictEqual(b.body.url, undefined);
  assert.strictEqual((await join(null, '10.0.0.3')).body.reason, 'full', 'толгойгүй → ip|ua түлхүүр, шинэ байр');
  assert.strictEqual((await join(null, '10.0.0.3', { 'user-agent': 'Other/1.0' })).body.reason, 'full');
  F.addUser('s@x.mn');
  assert.strictEqual((await join('strangerc3', '10.0.0.4', bearer(cmTok('s@x.mn')))).body.reason, 'full');
  assert.strictEqual(row.uses, 2);
  assert.strictEqual(row.devs.length, 1);

  // урилгын тасалбар: sub='inv:<jti>', sx = урилгын дуусах огноо → gate сесс ≤ 30 мин, урилгаас хэтрэхгүй
  const c = GM.verifyTicket(ticketOf(a1.body.url), 'mathmortal');
  assert.strictEqual(c.sub, 'inv:' + jti);
  assert.strictEqual(c.sx, payload(inv).exp);
  const now = Math.floor(Date.now() / 1000);
  const se = GM.sessionExp(c, now);
  assert.strictEqual(se, now + GM.INVITE_SESSION_TTL);
  assert.ok(GM.INVITE_SESSION_TTL <= 3600, 'урилгын сесс богино');
  assert.strictEqual(GM.sessionExp(c, c.sx - 600), c.sx, 'урилга дуусахад сесс ч дуусна');
  assert.strictEqual(GM.sessionExp(c, c.sx + 1), 0);

  // атомар: шинэ урилгад 10 өөр төхөөрөмж зэрэг → яг 1 нь нэгдэнэ
  const inv2 = (await mk()).invite;
  const rs = await Promise.all(Array.from({ length: 10 }, (_, i) =>
    G('launch', { game: 'mathmortal', realm: 'cm', invite: inv2 }, { headers: dev('racer' + i + 'aaaa'), ip: '10.1.' + i + '.1' })));
  assert.strictEqual(rs.filter((x) => x.statusCode === 200).length, 1);
  assert.ok(rs.filter((x) => x.statusCode !== 200).every((x) => x.statusCode === 403 && x.body.reason === 'full'));
  assert.strictEqual(F.db.invites.get(payload(inv2).jti).devs.length, 1);

  // sbh (3–5 тоглогч) → 4 найз, 5 дахь нь full; ws realm-д ч адил
  give('ws', 'host@x.mn', 'sbh');
  const sr = await G('invite', { game: 'sbh', realm: 'ws', wstoken: wsTok('host@x.mn') }, { headers: dev('hostdev01') });
  assert.strictEqual(sr.statusCode, 200);
  assert.strictEqual(sr.body.guests, 4);
  const sj = (d) => G('launch', { game: 'sbh', realm: 'ws', invite: sr.body.invite }, { headers: dev(d) });
  for (const d of ['sbhfrnd01', 'sbhfrnd02', 'sbhfrnd03', 'sbhfrnd04', 'sbhfrnd02']) assert.strictEqual((await sj(d)).statusCode, 200, d);
  const s5 = await sj('sbhfrnd05');
  assert.strictEqual(s5.statusCode, 403);
  assert.strictEqual(s5.body.reason, 'full');

  // ws: төхөөрөмжийн хязгаар (WDEV.MAX_DEVICES) дүүрсэн хэрэглэгч урилгаар (найз шиг) л орно — төхөөрөмжийн байр нэмэгдэхгүй
  give('ws', 'busy@x.mn', 'play2048');
  for (let i = 1; i <= WDEV.MAX_DEVICES; i++) {
    assert.strictEqual((await launchWs('busy@x.mn', 'play2048', { headers: dev('busydev' + i) })).statusCode, 200, 'busydev' + i);
  }
  const over = 'busydev' + (WDEV.MAX_DEVICES + 1);
  assert.strictEqual((await launchWs('busy@x.mn', 'play2048', { headers: dev(over) })).body.deviceBlocked, true, 'хязгаар дүүрсэн');
  const inv3 = (await G('invite', { game: 'sbh', realm: 'ws', wstoken: wsTok('host@x.mn') }, { headers: dev('hostdev01') })).body.invite;
  const bj = await G('launch', { game: 'sbh', realm: 'ws', wstoken: wsTok('busy@x.mn'), invite: inv3 }, { headers: dev(over) });
  assert.strictEqual(bj.statusCode, 200, JSON.stringify(bj.body));
  assert.strictEqual(bj.body.via, 'invite');
  assert.ok(!F.db.devices.has('busy@x.mn|' + over), 'урилга нь хэрэглэгчийн төхөөрөмжийн байрыг нэмэхгүй');
});

test('урилгын farm (шалгагчийн repro): 1 худалдан авалт + 25 урилга × 25 танихгүй хүн → бүтэн тасалбар ≤ 5 (өмнө нь 400)', async () => {
  F.addUser('host@x.mn');
  give('cm', 'host@x.mn', 'mathmortal', 30);
  const hostTok = cmTok('host@x.mn');
  let created = 0, tickets = 0, limited = 0;
  for (let i = 0; i < 25; i++) {
    const r = await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(hostTok), ip: '198.51.100.' + (i % 5) });
    if (r.statusCode === 429) { limited++; continue; }
    assert.strictEqual(r.statusCode, 200);
    created++;
    for (let j = 0; j < 25; j++) {
      const l = await G('launch', { game: 'mathmortal', realm: 'cm', invite: r.body.invite }, { headers: dev('stranger' + i + 'x' + j), ip: '10.' + i + '.' + j + '.1' });
      if (l.statusCode === 200 && l.body.url && GM.verifyTicket(ticketOf(l.body.url), 'mathmortal')) tickets++;
    }
  }
  assert.strictEqual(created, 5, 'өдөрт 5 урилга');
  assert.strictEqual(limited, 20);
  assert.strictEqual(tickets, 5, 'урилга бүрт 1 найз');
});

// ───────────────────────── тасалбарт имэйл байхгүй (gp-s2-fix1) ─────────────────────────
test('тасалбарын sub: имэйл URL-д ил гарахгүй (ws/cm/premium/admin/урилга); subjectOf тогтвортой, realm тусгаарласан; signTicket имэйл sub-ийг татгалзана', async () => {
  F.addUser('Mix@X.mn');
  F.addUser('p@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 3 * F.DAY) });
  give('ws', 'mix@x.mn', 'sudoku', 7);
  give('cm', 'mix@x.mn', 'mathmortal', 0.5);
  const urls = [
    (await launchWs('mix@x.mn', 'sudoku')).body.url,
    (await launchCm('mix@x.mn', 'mathmortal')).body.url,
    (await launchCm('p@x.mn', 'xpdrop')).body.url,
    (await G('launch', { game: 'numseq', realm: 'cm' }, { headers: ADMIN })).body.url,
  ];
  const inv = (await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(cmTok('mix@x.mn')) })).body.invite;
  urls.push((await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv }, { headers: dev('friendzz9') })).body.url);
  for (const u of urls) {
    assert.ok(typeof u === 'string' && /[?&]t=/.test(u), String(u));
    const t = ticketOf(u);
    assert.ok(!/@|x\.mn|mix/i.test(Buffer.from(t.split('.')[1], 'base64url').toString('utf8')), 'payload-д имэйл: ' + u);
    assert.ok(!/%40|@/.test(u));
  }
  const subs = urls.map((u) => GM.verifyTicket(ticketOf(u)).sub);
  assert.strictEqual(subs[0], GM.subjectOf('ws', 'mix@x.mn'));
  assert.strictEqual(subs[1], GM.subjectOf('cm', ' MIX@x.mn '), 'том/жижиг үсэг, зай нормчлогдоно');
  assert.notStrictEqual(subs[0], subs[1], 'realm тус бүр өөр таних тэмдэг');
  assert.strictEqual(subs[2], GM.subjectOf('cm', 'p@x.mn'));
  assert.strictEqual(subs[3], 'admin');
  assert.match(subs[4], /^inv:[a-f0-9]{32}$/);
  assert.notStrictEqual(GM.subjectOf('cm', 'a@x.mn'), GM.subjectOf('cm', 'b@x.mn'));

  // sx: эрх 0.5 хоног → gate сесс эрхээс хэтрэхгүй; Premium/admin (sx байхгүй) → 2 цаг
  const now = Math.floor(Date.now() / 1000);
  const cMix = GM.verifyTicket(ticketOf(urls[1]));
  assert.ok(Math.abs(cMix.sx - (now + 43200)) <= 2);
  assert.strictEqual(GM.sessionExp(cMix, now), now + GM.SESSION_TTL);
  assert.strictEqual(GM.sessionExp(cMix, cMix.sx - 60), cMix.sx);
  const cPrem = GM.verifyTicket(ticketOf(urls[2]));
  assert.strictEqual(cPrem.sx, undefined);
  assert.strictEqual(GM.sessionExp(cPrem, now), now + GM.SESSION_TTL);
  assert.strictEqual(GM.sessionExp(null), 0);

  // signTicket хамгаалалт: имэйл / дурын sub / өнгөрсөн sx → throw
  assert.throws(() => GM.signTicket({ g: 'sudoku', r: 'ws', sub: 'a@x.mn' }), /sub/);
  assert.throws(() => GM.signTicket({ g: 'sudoku', r: 'ws', sub: 'u:' + 'a'.repeat(31) + '@' }), /sub/);
  assert.throws(() => GM.signTicket({ g: 'sudoku', r: 'ws', sub: 'admin', sx: new Date(Date.now() - 1000) }), /sx/);
  assert.throws(() => GM.subjectOf('ws', 'not-an-email'));
  // JWT_SECRET өөрчлөгдвөл таних тэмдэг өөр
  const before = GM.subjectOf('ws', 'mix@x.mn');
  const saved = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'rotated';
  try { assert.notStrictEqual(GM.subjectOf('ws', 'mix@x.mn'), before); } finally { process.env.JWT_SECRET = saved; }
});

// ───────────────────────── урилга + өөрийн эрх (gp-s2-fix1) ─────────────────────────
test('launch: эрхтэй хэрэглэгч хүчингүй/хоосон/host-гүй урилгатай ч өөрийн эрхээр орно (урилга зарцуулахгүй); host-ийн эрхийг хэрэглээнээс ӨМНӨ шалгана', async () => {
  F.addUser('h@x.mn');
  F.addUser('f@x.mn');
  give('cm', 'h@x.mn', 'mathmortal');
  const inv = (await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')) })).body.invite;
  const jti = payload(inv).jti;
  const asF = (invite, extra) => G('launch', Object.assign({ game: 'mathmortal', realm: 'cm', invite: invite }, extra || {}),
    { headers: Object.assign(dev('friendfff1'), bearer(cmTok('f@x.mn'))) });

  // f өөрөө эрхтэй: хүчинтэй урилгатай ч өөрийн эрхээр, урилгын байр/хэрэглээ хөндөгдөхгүй
  give('cm', 'f@x.mn', 'mathmortal');
  const own = await asF(inv);
  assert.strictEqual(own.statusCode, 200);
  assert.strictEqual(own.body.via, 'access');
  assert.strictEqual(GM.verifyTicket(ticketOf(own.body.url), 'mathmortal').sub, GM.subjectOf('cm', 'f@x.mn'));
  assert.strictEqual(F.db.invites.get(jti).uses, 0);
  assert.strictEqual(F.db.invites.get(jti).devs.length, 0);

  // host эрхээ алдсан / хог / хоосон / өөр тоглоомын урилга → эрхтэй f 200 (өмнө нь 403/400)
  await GM.revokeGame('cm', 'h@x.mn', 'mathmortal');
  for (const v of [inv, 'garbage', '', null]) {
    const r = await asF(v);
    assert.strictEqual(r.statusCode, 200, JSON.stringify(v) + ' ' + JSON.stringify(r.body));
    assert.strictEqual(r.body.via, 'access');
  }
  // мөр биш урилга → 400 (эрхтэй ч)
  assert.strictEqual((await asF(123)).statusCode, 400);
  assert.strictEqual((await asF({ a: 1 })).statusCode, 400);

  // f эрхгүй: host-гүй урилга → 403 'host', хэрэглээ/байр ЗАРЦУУЛАХГҮЙ
  await GM.revokeGame('cm', 'f@x.mn', 'mathmortal');
  const nh = await asF(inv);
  assert.strictEqual(nh.statusCode, 403);
  assert.strictEqual(nh.body.reason, 'host');
  const anon = await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv }, { headers: dev('anonymou1') });
  assert.strictEqual(anon.body.reason, 'host');
  assert.strictEqual(F.db.invites.get(jti).uses, 0, 'host-гүй үед хэрэглээ зарцуулахгүй');
  assert.strictEqual(F.db.invites.get(jti).devs.length, 0);
  assert.strictEqual(F.db.invUpdates, 0);
  // host дахин эрх авбал тэр урилга хэвээр ажиллана (зарцуулагдаагүй)
  give('cm', 'h@x.mn', 'mathmortal');
  assert.strictEqual((await G('launch', { game: 'mathmortal', realm: 'cm', invite: inv }, { headers: dev('anonymou1') })).statusCode, 200);
  assert.strictEqual(F.db.invites.get(jti).uses, 1);

  // хоосон урилга: нэвтрээгүй → 401 needLogin (400 биш); нэвтэрсэн эрхгүй → 402
  const e1 = await G('launch', { game: 'mathmortal', realm: 'cm', invite: '' });
  assert.strictEqual(e1.statusCode, 401);
  assert.strictEqual(e1.body.needLogin, true);
  const e2 = await asF('');
  assert.strictEqual(e2.statusCode, 402);
  assert.strictEqual(e2.body.needBuy, true);
  // эрхгүй нэвтэрсэн + хүчингүй урилга → 403 inviteInvalid
  const e3 = await asF('garbage');
  assert.strictEqual(e3.statusCode, 403);
  assert.strictEqual(e3.body.inviteInvalid, true);

  // ws: эрхтэй хэрэглэгч + өөр realm-ийн урилга → өөрийн эрхээр
  give('ws', 'f@x.mn', 'mathmortal');
  const w = await G('launch', { game: 'mathmortal', realm: 'ws', wstoken: wsTok('f@x.mn'), invite: inv }, { headers: dev('devaaaa1') });
  assert.strictEqual(w.statusCode, 200);
  assert.strictEqual(w.body.via, 'access');
});

// ───────────────────────── IP rate limit (gp-s2-fix1) ─────────────────────────
test('IP rate limit: launch 300/10мин, status 300/10мин, invite 120/10мин — ижил IP-ээс өөр хэрэглэгчээр ч N+1 дэх нь 429; өөр IP нөлөөлөхгүй', async () => {
  const IP = '198.51.100.200', IP2 = '198.51.100.201';
  F.addUser('ok@x.mn');
  give('cm', 'ok@x.mn', 'sudoku');
  give('cm', 'ok@x.mn', 'chessmath');

  for (let i = 0; i < 300; i++) assert.strictEqual((await G('launch', { game: 'sudoku', realm: 'cm' }, { ip: IP })).statusCode, 401, 'launch i=' + i);
  const l = await launchCm('ok@x.mn', 'sudoku', { ip: IP });
  assert.strictEqual(l.statusCode, 429, 'launch IP хязгаар');
  assert.strictEqual(l.body.url, undefined);
  assert.strictEqual((await launchCm('ok@x.mn', 'sudoku', { ip: IP2 })).statusCode, 200);

  for (let i = 0; i < 300; i++) assert.strictEqual((await G('status', { realm: 'ws' }, { ip: IP })).statusCode, 401, 'status i=' + i);
  const s = await G('status', { realm: 'cm' }, { headers: bearer(cmTok('ok@x.mn')), ip: IP });
  assert.strictEqual(s.statusCode, 429, 'status IP хязгаар');
  assert.strictEqual(s.body.games, undefined);
  assert.strictEqual((await G('status', { realm: 'cm' }, { headers: bearer(cmTok('ok@x.mn')), ip: IP2 })).statusCode, 200);

  for (let i = 0; i < 120; i++) assert.strictEqual((await G('invite', { game: 'chessmath', realm: 'cm' }, { ip: IP })).statusCode, 401, 'invite i=' + i);
  const iv = await G('invite', { game: 'chessmath', realm: 'cm' }, { headers: bearer(cmTok('ok@x.mn')), ip: IP });
  assert.strictEqual(iv.statusCode, 429, 'invite IP хязгаар');
  assert.strictEqual(iv.body.invite, undefined);
  assert.strictEqual(F.db.invites.size, 0);
  assert.strictEqual((await G('invite', { game: 'chessmath', realm: 'cm' }, { headers: bearer(cmTok('ok@x.mn')), ip: IP2 })).statusCode, 200);
});

test('урилгын токен: уртын хязгаар (2048) — зөв түлхүүрээр зурсан урт урилга хүчингүй', async () => {
  F.addUser('h@x.mn');
  give('cm', 'h@x.mn', 'mathmortal');
  const inv = (await G('invite', { game: 'mathmortal', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')) })).body.invite;
  const pl = payload(inv);
  const fat = jwt.sign(Object.assign({}, pl, { pad: 'x'.repeat(2100) }), derived(K_INVITE));
  assert.ok(fat.length > 2048);
  assert.strictEqual(GM.verifyInvite(fat, 'mathmortal'), null);
  const r = await G('launch', { game: 'mathmortal', realm: 'cm', invite: fat }, { headers: dev('friendqq1') });
  assert.strictEqual(r.statusCode, 403);
  assert.strictEqual(r.body.reason, 'invalid');
  assert.ok(GM.verifyInvite(jwt.sign(Object.assign({}, pl, { pad: 'x'.repeat(500) }), derived(K_INVITE)), 'mathmortal'), 'хяналт');
});

// ───────────────────────── rate limit ─────────────────────────
test('rate limit: launch хэрэглэгч тутам 60/10мин, урилга host×тоглоом тутам 5/өдөр, урилгаар нэгдэх IP тутам 60/10мин; DB алдаа → 429 (fail-closed)', async () => {
  give('ws', 'a@x.mn', 'sudoku');
  for (let i = 0; i < 60; i++) assert.strictEqual((await launchWs('a@x.mn', 'sudoku')).statusCode, 200, 'i=' + i);
  const l = await launchWs('a@x.mn', 'sudoku');
  assert.strictEqual(l.statusCode, 429);
  assert.strictEqual(l.body.url, undefined);

  F.addUser('h@x.mn');
  give('cm', 'h@x.mn', 'doroev');
  give('cm', 'h@x.mn', 'gomoku');
  let last;
  for (let i = 0; i < 5; i++) {
    last = await G('invite', { game: 'doroev', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')), ip: '198.51.100.' + (i + 1) });
    assert.strictEqual(last.statusCode, 200, 'i=' + i);
  }
  const over = await G('invite', { game: 'doroev', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')), ip: '198.51.100.8' });
  assert.strictEqual(over.statusCode, 429);
  assert.strictEqual(over.body.inviteLimit, true);
  assert.strictEqual(over.body.max, 5);
  assert.strictEqual(over.body.invite, undefined);
  assert.strictEqual(F.db.invites.size, 5);
  // өөр тоглоомын хязгаар тусдаа; эрхгүй host-ийн оролдлого хязгаарыг идэхгүй
  F.addUser('nb@x.mn');
  for (let i = 0; i < 7; i++) assert.strictEqual((await G('invite', { game: 'gomoku', realm: 'cm' }, { headers: bearer(cmTok('nb@x.mn')) })).statusCode, 402);
  give('cm', 'nb@x.mn', 'gomoku');
  assert.strictEqual((await G('invite', { game: 'gomoku', realm: 'cm' }, { headers: bearer(cmTok('nb@x.mn')) })).statusCode, 200, 'эрх авсны дараа шууд үүсгэнэ');
  assert.strictEqual((await G('invite', { game: 'gomoku', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')) })).statusCode, 200, 'тоглоом тутам тусдаа');
  // цагийн биш, өдрийн цонх: 2 цагийн дараа ч хаалттай; 24 цагийн дараа дахин
  await shifted(2 * 3600e3, async () => {
    assert.strictEqual((await G('invite', { game: 'doroev', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')), ip: '198.51.100.10' })).statusCode, 429);
  });
  await shifted(86400e3 + 1000, async () => {
    assert.strictEqual((await G('invite', { game: 'doroev', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')), ip: '198.51.100.9' })).statusCode, 200);
  });
  // GAME_INVITE_DAILY
  process.env.GAME_INVITE_DAILY = '2';
  assert.strictEqual(GM.inviteDaily(), 2);
  process.env.GAME_INVITE_DAILY = '0';
  assert.strictEqual(GM.inviteDaily(), 5, 'буруу утга → анхдагч');
  delete process.env.GAME_INVITE_DAILY;

  process.env.GAME_INVITE_USES = '500';
  for (let i = 0; i < 60; i++) assert.strictEqual((await G('launch', { game: 'doroev', realm: 'cm', invite: last.body.invite }, { ip: '192.0.2.5' })).statusCode, 200, 'j=' + i);
  assert.strictEqual((await G('launch', { game: 'doroev', realm: 'cm', invite: last.body.invite }, { ip: '192.0.2.5' })).statusCode, 429);

  F.db.failRate = true;
  assert.strictEqual((await launchWs('b@x.mn', 'sudoku', { ip: '192.0.2.99' })).statusCode, 429);
});

// ───────────────────────── vercel.json + цэвэр байдал ─────────────────────────
test('vercel.json: /api/games маршрут api/*.js build-д; тодорхойгүй SQL алга, сүлжээ 0', () => {
  const v = JSON.parse(fs.readFileSync(path.join(F.WT, 'vercel.json'), 'utf8'));
  const i = v.routes.findIndex((r) => r.src === '/api/games');
  assert.ok(i >= 0, 'маршрут бий');
  assert.strictEqual(v.routes[i].dest, '/api/games.js');
  assert.ok(v.routes.slice(0, i).every((r) => !/[(*]/.test(r.src || '')), 'өмнө нь catch-all маршрут байхгүй');
  assert.ok(v.builds.some((b) => b.src === 'api/*.js' && b.use === '@vercel/node'));
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.qp.other, []);
});
