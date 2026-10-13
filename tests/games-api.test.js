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
const ticketOf = (url) => decodeURIComponent(String(url).split('?t=')[1] || '');
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
  assert.ok(r.body.url.indexOf('/sudoku.html?t=') === 0, r.body.url);
  const t = ticketOf(r.body.url);
  const c = GM.verifyTicket(t, 'sudoku');
  assert.ok(c, 'тасалбар хүчинтэй');
  assert.strictEqual(c.typ, 'glt');
  assert.strictEqual(c.g, 'sudoku');
  assert.strictEqual(c.r, 'ws');
  assert.strictEqual(c.sub, 'a@x.mn');
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
  delete process.env.GAME_PAYWALL;

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
  const raw = jwt.sign({ typ: 'glt', g: 'sudoku', r: 'ws', sub: 'x@x.mn', iat: now, exp: now + 60, jti: c.jti }, SEC);
  assert.strictEqual(GM.verifyTicket(raw, 'sudoku'), null);
  // урилгын түлхүүрээр зурсан тасалбар → хүчингүй
  const inv = jwt.sign({ typ: 'glt', g: 'sudoku', r: 'ws', sub: 'x@x.mn', iat: now, exp: now + 60, jti: c.jti }, derived(K_INVITE));
  assert.strictEqual(GM.verifyTicket(inv, 'sudoku'), null);
  // зөв түлхүүр ч typ буруу / TTL > 120 / jti буруу / realm буруу / тоглоом буруу → хүчингүй
  const L = derived(K_LAUNCH);
  const base = { typ: 'glt', g: 'sudoku', r: 'ws', sub: 'x@x.mn', iat: now, exp: now + 60, jti: c.jti };
  assert.ok(GM.verifyTicket(jwt.sign(base, L), 'sudoku'), 'хяналтын тохиолдол хүчинтэй');
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { typ: 'gi' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { exp: now + 3600 }), L)), null);
  const noExp = Object.assign({}, base); delete noExp.exp;
  assert.strictEqual(GM.verifyTicket(jwt.sign(noExp, L)), null, 'хугацаагүй тасалбар');
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { jti: 'abc' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { r: 'WS' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { g: '__proto__' }), L)), null);
  assert.strictEqual(GM.verifyTicket(jwt.sign(Object.assign({}, base, { sub: '' }), L)), null);
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

// ───────────────────────── 2 төхөөрөмжийн хязгаар ─────────────────────────
test('ws: 2 төхөөрөмжийн хязгаар — 3 дахь төхөөрөмж deviceBlocked (launch/status/invite), тасалбар гарахгүй; cm хязгааргүй', async () => {
  give('ws', 'a@x.mn', 'sudoku');
  give('ws', 'a@x.mn', 'sbh');
  assert.strictEqual((await launchWs('a@x.mn', 'sudoku', { headers: dev('devaaaa1') })).statusCode, 200);
  assert.strictEqual((await launchWs('a@x.mn', 'sudoku', { headers: dev('devbbbb2') })).statusCode, 200);
  assert.strictEqual((await launchWs('a@x.mn', 'sudoku', { headers: dev('devaaaa1') })).statusCode, 200, 'бүртгэлтэй төхөөрөмж');
  const c = await launchWs('a@x.mn', 'sudoku', { headers: dev('devcccc3') });
  assert.strictEqual(c.statusCode, 403, JSON.stringify(c.body));
  assert.strictEqual(c.body.deviceBlocked, true);
  assert.strictEqual(c.body.reason, 'DEVICE_LIMIT');
  assert.strictEqual(c.body.max, 2);
  assert.strictEqual(c.body.url, undefined);
  assert.deepStrictEqual(c.body.devices.map((d) => d.id).sort(), ['devaaaa1', 'devbbbb2']);
  assert.ok(F.db.devBlocks.some((b) => b.email === 'a@x.mn' && b.why === 'DEVICE_LIMIT' && b.device_id === 'devcccc3'));

  const st = await G('status', { realm: 'ws', wstoken: wsTok('a@x.mn') }, { headers: dev('devcccc3') });
  assert.strictEqual(st.statusCode, 403);
  assert.strictEqual(st.body.deviceBlocked, true);
  assert.strictEqual(st.body.games, undefined);
  const iv = await G('invite', { game: 'sbh', realm: 'ws', wstoken: wsTok('a@x.mn') }, { headers: dev('devcccc3') });
  assert.strictEqual(iv.statusCode, 403);
  assert.strictEqual(iv.body.invite, undefined);
  assert.strictEqual(F.db.invites.size, 0);

  // толгой илгээхгүй → токеноос гарсан 'tk…' түлхүүр байр эзэлнэ (2 дүүрсэн тул хаагдана)
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

// ───────────────────────── rate limit ─────────────────────────
test('rate limit: launch хэрэглэгч тутам 60/10мин, урилга host тутам 20/цаг, урилгаар нэгдэх IP тутам 60/10мин; DB алдаа → 429 (fail-closed)', async () => {
  give('ws', 'a@x.mn', 'sudoku');
  for (let i = 0; i < 60; i++) assert.strictEqual((await launchWs('a@x.mn', 'sudoku')).statusCode, 200, 'i=' + i);
  const l = await launchWs('a@x.mn', 'sudoku');
  assert.strictEqual(l.statusCode, 429);
  assert.strictEqual(l.body.url, undefined);

  F.addUser('h@x.mn');
  give('cm', 'h@x.mn', 'doroev');
  let last;
  for (let i = 0; i < 20; i++) {
    last = await G('invite', { game: 'doroev', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')), ip: '198.51.100.7' });
    assert.strictEqual(last.statusCode, 200, 'i=' + i);
  }
  assert.strictEqual((await G('invite', { game: 'doroev', realm: 'cm' }, { headers: bearer(cmTok('h@x.mn')), ip: '198.51.100.8' })).statusCode, 429);

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
