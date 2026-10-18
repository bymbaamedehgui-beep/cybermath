// Realm-ээр хязгаарласан тоглоомын төлбөр (gp-merge). Эзэмшигчийн шийдвэр «эхний ээлжинд дасгалын төвд л»:
//   env GAME_PAYWALL_REALMS (анхдагч api/_games.js DEFAULT_PAYWALL_REALMS = ['ws']) — зөвхөн жагсаалтын сайт төлбөртэй;
//   GAME_PAYWALL=off → бүх сайт + gate нээлттэй (kill-switch). cyber-math.com (cm) хуучин шигээ үнэгүй: эрх, каталог,
//   status, launch, урилга, QPay create, gate-ийн шууд хүсэлт (/sudoku.html г.м., play/team/xp.html-ийн xpdrop).
// Ажиллуулах: node tests/games-realm.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const games = require(path.join(F.API, 'games.js'));
const qpay = require(path.join(F.API, 'qpay.js'));
const GM = require(path.join(F.API, '_games.js'));
const gate = require(path.join(F.WT, 'gate', 'game.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const cmTok = (e, tv) => jwt.sign({ email: e, role: 'student', tv: tv | 0 }, SEC);
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const G = (action, body, o) => F.call(games, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const Q = (action, body, o) => F.call(qpay, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const cat = (realm) => F.call(games, { method: 'GET', query: realm ? { action: 'catalog', realm: realm } : { action: 'catalog' } });
const launchWs = (email, game, dev) => G('launch', { game: game, realm: 'ws', wstoken: wsTok(email) }, { headers: { 'x-device-id': dev || 'devrealm0001' } });
const launchCm = (email, game) => G('launch', { game: game, realm: 'cm' }, { headers: bearer(cmTok(email)) });
const anon = (realm, game) => G('launch', { game: game, realm: realm });
const payload = (tok) => JSON.parse(Buffer.from(String(tok).split('.')[1], 'base64url').toString('utf8'));
// url-ийн ?t= (ws бол /<зам>?realm=ws&t=…, cm бол /<зам>?t=…)
const ticketOf = (url) => new URL(String(url), 'https://cyber-math.com').searchParams.get('t') || '';
const FILE_KEYS = Object.keys(gate.FILES);
function give(realm, email, key, days) {
  F.db.access.set(realm + '|' + email + '|' + key, { realm: realm, email: email, game_key: key,
    expires_at: new Date(Date.now() + (days == null ? 30 : days) * F.DAY), updated_at: new Date() });
}
function setEnv(realms, pw) {
  if (realms === undefined) delete process.env.GAME_PAYWALL_REALMS; else process.env.GAME_PAYWALL_REALMS = realms;
  if (pw === undefined) delete process.env.GAME_PAYWALL; else process.env.GAME_PAYWALL = pw;
}
function mkRes() {
  const h = {};
  return {
    statusCode: 200, headers: h, body: null,
    setHeader(k, v) { h[String(k).toLowerCase()] = v; },
    getHeader(k) { return h[String(k).toLowerCase()]; },
    end(b) { this.body = b == null ? null : (Buffer.isBuffer(b) ? b : Buffer.from(String(b))); return this; },
  };
}
// Vercel маршрутыг дуурайна: нийтийн зам (/sudoku.html?…) → /gate/game.js?g=<түлхүүр>[&f=index.html]&…
async function gateHit(url, cookie) {
  const u = new URL(url, 'https://cyber-math.com');
  const g = FILE_KEYS.find((k) => gate.FILES[k].paths.indexOf(u.pathname) >= 0);
  assert.ok(g, 'gate-ийн зам биш: ' + url);
  const query = { g: g };
  if (gate.FILES[g].dir) query.f = 'index.html';
  u.searchParams.forEach((v, k) => { query[k] = v; });
  const res = mkRes();
  await gate({ method: 'GET', url: u.pathname + u.search, query: query, headers: cookie ? { cookie: cookie } : {} }, res);
  return res;
}
const cookiePair = (res) => String([].concat(res.headers['set-cookie'] || [])[0] || '').split(';')[0];

// Анхдагч орчин (эхний ээлж): GAME_PAYWALL, GAME_PAYWALL_REALMS хоёулаа тавиагүй
beforeEach(() => { F.reset(); setEnv(undefined, undefined); });

// ───────────────────────── тохиргоо ─────────────────────────
test('GAME_PAYWALL_REALMS: анхдагч [ws]; ws/cm таслалаар; буруу утга → анхдагч; GAME_PAYWALL=off → []; on нь kill-switch биш', () => {
  assert.deepStrictEqual(Array.from(GM.DEFAULT_PAYWALL_REALMS), ['ws']);
  assert.ok(Object.isFrozen(GM.DEFAULT_PAYWALL_REALMS));
  assert.deepStrictEqual(Array.from(GM.REALMS), ['ws', 'cm']);
  const cases = [
    [undefined, ['ws']], ['', ['ws']], ['   ', ['ws']], ['ws', ['ws']], ['cm', ['cm']], ['ws,cm', ['ws', 'cm']],
    ['cm,ws', ['ws', 'cm']], [' CM , Ws ', ['ws', 'cm']], ['cm;ws', ['ws', 'cm']], ['cm ws ws', ['ws', 'cm']],
    // үсгийн алдаа / танихгүй → анхдагч (Дасгалын төвийг үнэгүй болгохгүй, cyber-math.com-ийг санамсаргүй түгжихгүй)
    ['wss', ['ws']], ['ws,xx', ['ws']], ['all', ['ws']], ['none', ['ws']], ['cm,', ['cm']], [',', ['ws']],
  ];
  const warn = console.warn; const warned = [];
  console.warn = (m) => warned.push(String(m));
  try {
    for (const [v, want] of cases) {
      setEnv(v, undefined);
      assert.deepStrictEqual(GM.paywallRealms(), want, JSON.stringify(v));
      assert.strictEqual(GM.paywallOn('ws'), want.includes('ws'), JSON.stringify(v));
      assert.strictEqual(GM.paywallOn('cm'), want.includes('cm'), JSON.stringify(v));
      assert.strictEqual(GM.gateOn(), want.includes('cm'), 'gate = cm ' + JSON.stringify(v));
      assert.strictEqual(GM.paywallOn(), GM.gateOn(), 'realm-гүй = gate');
      assert.strictEqual(GM.paywallOn('xx'), GM.gateOn(), 'буруу realm = gate');
    }
  } finally { console.warn = warn; }
  assert.ok(warned.some((m) => /GAME_PAYWALL_REALMS буруу/.test(m) && /wss/.test(m)), JSON.stringify(warned));
  assert.deepStrictEqual(GM.parseRealms('wss'), null);
  assert.deepStrictEqual(GM.parseRealms('cm,ws'), ['ws', 'cm']);
  // kill-switch: бүх realm + gate нээлттэй, жагсаалтаас үл хамааран
  for (const off of ['off', 'OFF', ' false ', '0', 'no']) {
    setEnv('ws,cm', off);
    assert.deepStrictEqual(GM.paywallRealms(), [], off);
    assert.deepStrictEqual([GM.paywallOn('ws'), GM.paywallOn('cm'), GM.gateOn()], [false, false, false], off);
  }
  // GAME_PAYWALL=on/1/алдаатай 'offf' — жагсаалтыг өөрчлөхгүй (cm-ийг асаахгүй)
  for (const on of ['on', '1', 'true', 'offf']) {
    setEnv(undefined, on);
    assert.deepStrictEqual(GM.paywallRealms(), ['ws'], on);
    assert.strictEqual(GM.gateOn(), false, on);
  }
  // Буцаасан массивыг өөрчлөх нь анхдагчид нөлөөлөхгүй; env объект дамжуулж болно (check-game-routes)
  setEnv(undefined, undefined);
  GM.paywallRealms().push('cm');
  assert.deepStrictEqual(GM.paywallRealms(), ['ws']);
  assert.deepStrictEqual(GM.paywallRealms({ GAME_PAYWALL_REALMS: 'ws,cm' }), ['ws', 'cm']);
  assert.deepStrictEqual(GM.paywallRealms({ GAME_PAYWALL_REALMS: 'ws,cm', GAME_PAYWALL: 'off' }), []);
  assert.deepStrictEqual(GM.paywallRealms({}), ['ws']);
});

// ───────────────────────── эхний ээлж: cyber-math.com нээлттэй ─────────────────────────
test('анхдагч: cm — бүх 16 тоглоомын эрх нээлттэй (нэвтрээгүй ч, via off); ws — эрх шаардана; буруу realm → хаалттай', async () => {
  give('ws', 'kid@x.mn', 'sudoku');
  for (const k of GM.GAME_KEYS) {
    const e = await GM.entitlement('cm', 'anyone@x.mn', k);
    assert.deepStrictEqual([e.ok, e.via], [true, 'off'], k);
    assert.strictEqual(await GM.entitled('cm', null, k), true, k + ' нэвтрээгүй');
    assert.strictEqual(await GM.entitled('ws', 'nobody@x.mn', k), false, 'ws ' + k);
    assert.strictEqual(await GM.entitled('xx', 'nobody@x.mn', k), false, 'буруу realm ' + k);
  }
  assert.strictEqual(await GM.entitled('cm', 'x@x.mn', 'hack'), false, 'allowlist-гүй түлхүүр');
  assert.deepStrictEqual((await GM.entitlement('ws', 'kid@x.mn', 'sudoku')).via, 'access');
  assert.strictEqual(await GM.entitled('ws', 'kid@x.mn', 'play2048'), false);
});

test('анхдагч: catalog — realm-гүй (gate) false, cm false, ws true; status cm enabled:false, ws enabled:true', async () => {
  const [a, c, w] = [await cat(), await cat('cm'), await cat('ws')];
  assert.deepStrictEqual([a.statusCode, a.body.enabled, a.body.realm], [200, false, undefined]);
  assert.deepStrictEqual([c.body.enabled, c.body.realm, c.body.price, c.body.games.length], [false, 'cm', 1900, 16]);
  assert.deepStrictEqual([w.body.enabled, w.body.realm, w.body.price, w.body.days], [true, 'ws', 1900, 30]);
  F.addUser('cmkid@x.mn');
  const sc = await G('status', { realm: 'cm' }, { headers: bearer(cmTok('cmkid@x.mn')) });
  assert.deepStrictEqual([sc.statusCode, sc.body.enabled, sc.body.realm], [200, false, 'cm']);
  const sw = await G('status', { realm: 'ws', wstoken: wsTok('wskid@x.mn') }, { headers: { 'x-device-id': 'devrealm0001' } });
  assert.deepStrictEqual([sw.statusCode, sw.body.enabled, sw.body.realm], [200, true, 'ws']);
});

test('анхдагч: cm launch нэвтрэлтгүй (file → тасалбаргүй шууд зам, inline, external), урилга токенгүй, QPay нэхэмжлэх үүсгэхгүй', async () => {
  for (const k of GM.GAME_KEYS) {
    const r = await anon('cm', k);
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.via, r.body.kind], [200, true, 'off', GM.GAMES[k].kind], k);
    if (GM.GAMES[k].kind === 'file') assert.strictEqual(r.body.url, GM.GAMES[k].path, k + ': ?t= тасалбаргүй');
    else if (GM.GAMES[k].kind === 'external') assert.strictEqual(r.body.url, GM.GAMES[k].url, k);
    else assert.strictEqual(r.body.url, undefined, k);
  }
  F.addUser('host@x.mn');
  const iv = await G('invite', { game: 'ludo', realm: 'cm' }, { headers: bearer(cmTok('host@x.mn')) });
  assert.deepStrictEqual([iv.statusCode, iv.body.via, iv.body.invite], [200, 'off', null]);
  const cr = await Q('create', { plan: 'game', realm: 'cm', game: 'sudoku' }, { headers: bearer(cmTok('host@x.mn')) });
  assert.deepStrictEqual([cr.statusCode, cr.body.already, cr.body.via], [409, true, 'off']);
  assert.strictEqual(F.qp.invoices.length, 0, 'cm-д мөнгө авахгүй');
  assert.strictEqual(F.db.pay.size, 0);
});

test('анхдагч: gate — cookie/тасалбаргүй шууд хүсэлт 200 (хуучин шигээ, DB-гүй); ?t= → цэвэр URL; xpdrop?grade хадгалагдана', async () => {
  for (const k of FILE_KEYS) {
    for (const p of gate.FILES[k].paths) {
      const r = await gateHit(p);
      assert.strictEqual(r.statusCode, 200, p);
      assert.strictEqual(r.headers['x-game-gate'], 'off', p);
      assert.ok(r.body && r.body.length > 100, p + ': файл');
    }
  }
  // math-mortal-ийн дэд JS/CSS (vercel.json: /math-mortal/<нэр>.(js|css) → gate f=<нэр>)
  const sub = fs.readdirSync(path.join(F.WT, gate.FILES.mathmortal.dir)).find((n) => gate.SUB_FILE_RE.test(n));
  assert.ok(sub, 'math-mortal дэд файл');
  const mm = mkRes();
  await gate({ method: 'GET', url: '/math-mortal/' + sub, query: { g: 'mathmortal', f: sub }, headers: {} }, mm);
  assert.deepStrictEqual([mm.statusCode, mm.headers['x-game-gate']], [200, 'off'], sub);
  const x = await gateHit('/xpdrop.html?grade=7');
  assert.deepStrictEqual([x.statusCode, x.headers['x-game-gate']], [200, 'off']);
  const t = await gateHit('/sudoku.html?t=garbage&x=1');
  assert.deepStrictEqual([t.statusCode, t.headers.location], [302, '/sudoku.html?x=1']);
  assert.strictEqual(F.db.tix.size, 0, 'gate нээлттэй үед тасалбар/DB ашиглахгүй');
});

// ───────────────────────── эхний ээлж: Дасгалын төв төлбөртэй ─────────────────────────
test('анхдагч: ws — нэвтрээгүй → 401, эрхгүй → 402 needBuy; худалдан авах → эрхтэй → шууд зам (gate нээлттэй) → файл', async () => {
  const a = await anon('ws', 'sudoku');
  assert.deepStrictEqual([a.statusCode, a.body.needLogin, a.body.url], [401, true, undefined]);
  const n = await launchWs('buyer@x.mn', 'sudoku');
  assert.deepStrictEqual([n.statusCode, n.body.needBuy, n.body.price, n.body.realm], [402, true, 1900, 'ws']);
  for (const k of ['ludo', 'blockblast', 'mathmortal']) assert.strictEqual((await launchWs('buyer@x.mn', k)).statusCode, 402, k);

  // QPay (mock): create → PAID 1900 → check → game_access(ws) +30
  const cr = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('buyer@x.mn') });
  assert.strictEqual(cr.statusCode, 200, JSON.stringify(cr.body));
  const inv = cr.body.invoice.invoice_id;
  assert.strictEqual(F.db.pay.get(inv).amount, 1900);
  F.qp.paid.set(inv, 1900);
  const ch = await Q('check', { invoice_id: inv, email: 'buyer@x.mn' });
  assert.strictEqual(ch.body.paid, true, JSON.stringify(ch.body));
  assert.ok(F.db.access.get('ws|buyer@x.mn|sudoku'), 'ws эрх');
  assert.strictEqual(F.db.access.get('cm|buyer@x.mn|sudoku'), undefined, 'cm-д эрх нэмэгдэхгүй');

  const ok = await launchWs('buyer@x.mn', 'sudoku');
  assert.deepStrictEqual([ok.statusCode, ok.body.via, ok.body.url], [200, 'access', '/sudoku.html'], 'gate нээлттэй — тасалбаргүй');
  const f = await gateHit(ok.body.url);
  assert.deepStrictEqual([f.statusCode, f.headers['x-game-gate']], [200, 'off']);
  assert.strictEqual((await launchWs('buyer@x.mn', 'play2048')).statusCode, 402, 'өөр тоглоом эрхгүй');
  // inline: эрхтэй → kind inline (index.html?embed=…&realm=ws)
  give('ws', 'buyer@x.mn', 'ludo');
  const il = await launchWs('buyer@x.mn', 'ludo');
  assert.deepStrictEqual([il.statusCode, il.body.kind, il.body.via], [200, 'inline', 'access']);
  // ws урилга (host л төлнө) — токентой
  const iv = await G('invite', { game: 'ludo', realm: 'ws', wstoken: wsTok('buyer@x.mn') }, { headers: { 'x-device-id': 'devrealm0001' } });
  assert.strictEqual(iv.statusCode, 200, JSON.stringify(iv.body));
  assert.ok(iv.body.invite && /^\/worksheets\?game=ludo&ginv=/.test(iv.body.url));
});

// ───────────────────────── GAME_PAYWALL_REALMS=ws,cm ─────────────────────────
test('GAME_PAYWALL_REALMS=ws,cm: cm төлбөртэй (401/402, QPay нэхэмжлэх), gate түгжинэ; ws эрхтэй → тасалбар → cookie → файл', async () => {
  setEnv('ws,cm', undefined);
  assert.deepStrictEqual([(await cat()).body.enabled, (await cat('cm')).body.enabled, (await cat('ws')).body.enabled], [true, true, true]);
  assert.strictEqual(await GM.entitled('cm', 'nobody@x.mn', 'sudoku'), false);
  assert.strictEqual((await anon('cm', 'sudoku')).statusCode, 401);
  F.addUser('cmbuyer@x.mn');
  const n = await launchCm('cmbuyer@x.mn', 'sudoku');
  assert.deepStrictEqual([n.statusCode, n.body.needBuy, n.body.realm], [402, true, 'cm']);
  const cr = await Q('create', { plan: 'game', realm: 'cm', game: 'sudoku' }, { headers: bearer(cmTok('cmbuyer@x.mn')) });
  assert.strictEqual(cr.statusCode, 200, JSON.stringify(cr.body));
  assert.strictEqual(F.db.pay.get(cr.body.invoice.invoice_id).realm, 'cm');
  // cm Premium → бүх тоглоом
  F.addUser('prem@x.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 5 * F.DAY) });
  assert.strictEqual((await GM.entitlement('cm', 'prem@x.mn', 'ludo')).via, 'premium');

  // gate: cookie-гүй шууд хүсэлт → 403 түгжээ (cyber-math.com-ийн UI launch-тай болсны дараах горим)
  for (const k of FILE_KEYS) {
    const r = await gateHit(gate.FILES[k].paths[0]);
    assert.deepStrictEqual([r.statusCode, r.headers['x-game-gate']], [403, 'locked'], k);
  }
  // ws эрхтэй → тасалбар (r:'ws', имэйлгүй) → 302 + HttpOnly cookie (ws-ийнх) → Дасгалын төвийн URL (?realm=ws) → файл
  give('ws', 'kid@x.mn', 'sudoku');
  const l = await launchWs('kid@x.mn', 'sudoku');
  assert.strictEqual(l.statusCode, 200, JSON.stringify(l.body));
  assert.ok(/^\/sudoku\.html\?realm=ws&t=/.test(l.body.url), l.body.url);
  const pl = payload(ticketOf(l.body.url));
  assert.deepStrictEqual([pl.typ, pl.g, pl.r], ['glt', 'sudoku', 'ws']);
  assert.ok(/^u:[a-f0-9]{32}$/.test(pl.sub) && JSON.stringify(pl).indexOf('kid@') < 0, 'имэйлгүй');
  const t = await gateHit(l.body.url);
  assert.deepStrictEqual([t.statusCode, t.headers.location], [302, '/sudoku.html?realm=ws']);
  const ck = cookiePair(t);
  assert.ok(/^__Host-cmgw_sudoku=/.test(ck), ck);
  assert.ok(/HttpOnly; Secure; SameSite=Lax/.test(String([].concat(t.headers['set-cookie'])[0])));
  const f = await gateHit('/sudoku.html?realm=ws', ck);
  assert.deepStrictEqual([f.statusCode, f.headers['x-game-gate']], [200, 'open']);
  assert.strictEqual((await gateHit(l.body.url)).statusCode, 403, 'тасалбар нэг удаагийн');
  // ws-ийн эрх cm-д хамаарахгүй: API (402) ч, gate (cyber-math.com-ийн /sudoku.html, /sudoku — ижил хөтөч, ws cookie-той) ч
  F.addUser('kid@x.mn');
  assert.strictEqual((await launchCm('kid@x.mn', 'sudoku')).statusCode, 402, 'realm тусдаа');
  for (const p of ['/sudoku.html', '/sudoku']) {
    const x = await gateHit(p, ck);
    assert.deepStrictEqual([x.statusCode, x.headers['x-game-gate']], [403, 'locked'], p + ': Дасгалын төвийн cookie cyber-math.com-д хүчингүй');
  }
  // cm-ийн эрхтэй хэрэглэгч → cm cookie → cyber-math.com-ийн URL; Дасгалын төвийн URL-ийг нээхгүй
  give('cm', 'cmbuyer@x.mn', 'sudoku');
  const lc = await launchCm('cmbuyer@x.mn', 'sudoku');
  assert.ok(/^\/sudoku\.html\?t=/.test(lc.body.url), lc.body.url);
  const tc = await gateHit(lc.body.url);
  assert.deepStrictEqual([tc.statusCode, tc.headers.location], [302, '/sudoku.html']);
  const cc = cookiePair(tc);
  assert.ok(/^__Host-cmg_sudoku=/.test(cc), cc);
  assert.strictEqual((await gateHit('/sudoku.html', cc)).statusCode, 200);
  assert.strictEqual((await gateHit('/sudoku.html?realm=ws', cc)).statusCode, 403, 'cm cookie Дасгалын төвд хүчингүй');
  // ws урилга (host ws-ийн эрхтэй) → найзын сесс ws-ийнх → cm-ийн хуудсыг нээхгүй
  give('ws', 'kid@x.mn', 'mathmortal');
  const iv = await G('invite', { game: 'mathmortal', realm: 'ws', wstoken: wsTok('kid@x.mn') }, { headers: { 'x-device-id': 'devrealm0001' } });
  assert.strictEqual(iv.statusCode, 200, JSON.stringify(iv.body));
  const fl = await G('launch', { game: 'mathmortal', realm: 'ws', invite: iv.body.invite }, { headers: { 'x-device-id': 'friendrealm9' } });
  assert.deepStrictEqual([fl.statusCode, fl.body.via], [200, 'invite']);
  assert.ok(/^\/math-mortal\/\?realm=ws&t=/.test(fl.body.url), fl.body.url);
  const ti = await gateHit(fl.body.url);
  const ci = cookiePair(ti);
  assert.ok(/^__Host-cmgw_mathmortal=/.test(ci), ci);
  assert.strictEqual((await gateHit('/math-mortal/?realm=ws', ci)).statusCode, 200);
  assert.strictEqual((await gateHit('/math-mortal/', ci)).statusCode, 403, 'ws урилга cyber-math.com-д хүчингүй');
  assert.strictEqual((await gateHit('/math-mortal/index.html', ci)).statusCode, 403);
});

// gp-final (шалгагчийн минор): өмнө нь энэ горимд ws launch нэвтрэлтгүй 'open' тасалбар гаргадаг байсан → gate
// __Host-cmg_<g> cookie (2 цаг) → нэвтрээгүй хэн ч cyber-math.com-ийн төлбөртэй файл тоглоомыг үнэгүй нээдэг байв.
test("GAME_PAYWALL_REALMS=cm: ws үнэгүй (via off) → тасалбаргүй ?realm=ws url (gate тэр realm-д нээлттэй); cm-ийн хуудас түгжээтэй хэвээр, 'open' тасалбар байхгүй", async () => {
  setEnv('cm', undefined);
  assert.deepStrictEqual([GM.paywallOn('ws'), GM.paywallOn('cm'), GM.gateOn()], [false, true, true]);
  for (const k of FILE_KEYS.filter((x) => GM.GAMES[x].kind === 'file')) {
    const l = await anon('ws', k);
    assert.deepStrictEqual([l.statusCode, l.body.via], [200, 'off'], k);
    assert.strictEqual(l.body.url, GM.GAMES[k].path + '?realm=ws', k + ': тасалбаргүй, realm-тэй');
    assert.strictEqual(ticketOf(l.body.url), '', k);
    const g = await gateHit(l.body.url);
    assert.deepStrictEqual([g.statusCode, g.headers['x-game-gate'], g.headers['set-cookie']], [200, 'off', undefined], k);
    // ws URL-аар cookie гарахгүй тул cyber-math.com-ийн хуудас нэвтрээгүй хүнд түгжээтэй хэвээр
    const c = await gateHit(gate.FILES[k].paths[0]);
    assert.deepStrictEqual([c.statusCode, c.headers['x-game-gate']], [403, 'locked'], k + ': cm түгжээтэй');
  }
  // шалгагчийн repro: ws launch (токенгүй) → url-ийг gate-д → cookie үгүй → /sudoku.html 403
  const r = await anon('ws', 'sudoku');
  const rg = await gateHit(r.body.url + '&t=garbage');
  assert.deepStrictEqual([rg.statusCode, rg.headers.location, rg.headers['set-cookie']], [302, '/sudoku.html?realm=ws', undefined]);
  assert.strictEqual((await gateHit('/sudoku.html')).statusCode, 403);
  assert.strictEqual(F.db.tix.size, 0, 'тасалбар огт гараагүй');
  const il = await anon('ws', 'ludo');
  assert.deepStrictEqual([il.statusCode, il.body.kind, il.body.via], [200, 'inline', 'off']);
  assert.strictEqual((await anon('cm', 'play2048')).statusCode, 401, 'cm төлбөртэй');
  // 'open' (нэвтрэлтгүй) sub-тай тасалбар/сесс хийх боломжгүй; имэйл/дурын утга хэвээр татгалзана
  for (const sub of ['open', 'free', 'kid@x.mn']) {
    assert.throws(() => GM.signTicket({ g: 'sudoku', r: 'ws', sub: sub }), /sub буруу/, sub);
    assert.throws(() => GM.signSession({ g: 'sudoku', r: 'cm', sub: sub }, Math.floor(Date.now() / 1000) + 60), /sub буруу/, sub);
  }
});

test('GAME_PAYWALL=off (GAME_PAYWALL_REALMS=ws,cm ч): бүх сайт + gate нээлттэй, нэхэмжлэх үүсгэхгүй', async () => {
  setEnv('ws,cm', 'off');
  assert.deepStrictEqual([(await cat()).body.enabled, (await cat('cm')).body.enabled, (await cat('ws')).body.enabled], [false, false, false]);
  for (const realm of ['ws', 'cm']) {
    for (const k of ['sudoku', 'ludo', 'blockblast', 'mathmortal']) {
      const r = await anon(realm, k);
      assert.deepStrictEqual([r.statusCode, r.body.via], [200, 'off'], realm + ' ' + k);
      if (GM.GAMES[k].kind === 'file') assert.strictEqual(r.body.url, GM.GAMES[k].path, 'тасалбаргүй');
    }
  }
  const g = await gateHit('/sudoku.html');
  assert.deepStrictEqual([g.statusCode, g.headers['x-game-gate']], [200, 'off']);
  const cr = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('a@x.mn') });
  assert.deepStrictEqual([cr.statusCode, cr.body.already, cr.body.via], [409, true, 'off']);
  assert.strictEqual(F.qp.invoices.length, 0);
});

test('сүлжээ 0, тодорхойгүй SQL алга', () => {
  assert.deepStrictEqual(F.qp.other || [], []);
  assert.deepStrictEqual(F.db.unknown, []);
});
