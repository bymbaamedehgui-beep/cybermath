// Төхөөрөмжийн хязгааргүй (анхдагч, 2026-11-01): нэг бүртгэлээр хэдэн ч төхөөрөмжөөс — ажлын хуудас (wsstatus), тоглоом
// (games status/launch), шууд WDEV.check/checkReq. Токеныг өөр төхөөрөмжид ашиглахыг ч хаахгүй (DEVICE_MISMATCH алга).
// Төхөөрөмж бүртгэгдсээр (админд харагдана). Хязгаарын логикийг (WS_DEVICE_LIMIT=on) tests/games-api.test.js, ws-trial.test.js.
// Ажиллуулах: node --test tests/ws-device.test.js   (бодит DB 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const qpay = require(path.join(F.API, 'qpay.js'));
const games = require(path.join(F.API, 'games.js'));
const WDEV = require(path.join(F.API, '_wsdev.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const tok = (e, dev) => jwt.sign(dev ? { email: e, ws: true, dev: dev } : { email: e, ws: true }, SEC);
const G6 = 'jishig-daalgavar-1-6.html';
const N = 12;   // хуучин хязгаар (4)-өөс хамаагүй олон

async function status(email, dev, tokDev) {
  const r = await F.call(qpay, { method: 'POST', query: { action: 'wsstatus' }, body: { wstoken: tok(email, tokDev === undefined ? dev : tokDev), slug: G6 },
    headers: dev ? { 'x-device-id': dev } : {} });
  assert.strictEqual(r.statusCode, 200);
  return r.body;
}

beforeEach(() => { F.reset(); });

test('анхдагч: хязгаар унтраалттай (env WS_DEVICE_LIMIT тавиагүй)', () => {
  assert.strictEqual(WDEV.LIMIT_ON, false);
});

test('ажлын хуудас (wsstatus): эрхтэй данс ' + N + ' өөр төхөөрөмжөөс — бүгд нээлттэй, хаалт 0, төхөөрөмж бүртгэгдэнэ', async () => {
  F.db.wsAccess.set('pay@x.mn', new Date(Date.now() + 30 * F.DAY));
  for (let i = 0; i < N; i++) {
    const b = await status('pay@x.mn', 'devmany' + String(i).padStart(8, '0'));
    assert.strictEqual(b.deviceBlocked, undefined, 'төхөөрөмж ' + i);
    assert.strictEqual(b.active, true, 'төхөөрөмж ' + i);
  }
  assert.strictEqual(F.db.devices.size, N, 'бүх төхөөрөмж бүртгэгдсэн (админд харагдана)');
  assert.strictEqual(F.db.devBlocks.length, 0);
  // дахин нээхэд мөр нэмэгдэхгүй
  await status('pay@x.mn', 'devmany00000000');
  assert.strictEqual(F.db.devices.size, N);
});

test('токеныг өөр төхөөрөмжид (толгой ≠ токены dev) — хаахгүй; толгойгүй хүсэлт ч нээлттэй', async () => {
  F.db.wsAccess.set('cp@x.mn', new Date(Date.now() + 30 * F.DAY));
  const b = await status('cp@x.mn', 'devother0000001', 'devtoken0000001');
  assert.deepStrictEqual([b.active, b.deviceBlocked], [true, undefined]);
  const nh = await status('cp@x.mn', null, 'devtoken0000001');
  assert.deepStrictEqual([nh.active, nh.deviceBlocked], [true, undefined]);
  assert.strictEqual(F.db.devBlocks.length, 0);
});

test('WDEV.check / checkReq: олон төхөөрөмж, хуулсан хээ, зөрүүтэй токен — бүгд ok', async () => {
  for (let i = 0; i < N; i++) {
    const r = await WDEV.check('c@x.mn', 'devcheck' + String(i).padStart(8, '0'), { headers: { 'x-device-fp': 'abc' + i + 'def' } });
    assert.strictEqual(r.ok, true, String(i));
  }
  // localStorage-оо хуулсан (ижил device_id, өөр машины хээ) ч хаахгүй
  const cp = await WDEV.check('c@x.mn', 'devcheck00000000', { headers: { 'x-device-fp': 'ffff0000' } });
  assert.strictEqual(cp.ok, true);
  const mm = await WDEV.checkReq({ headers: { 'x-device-id': 'devreqb00000001' }, body: {} }, 'c@x.mn', tok('c@x.mn', 'devreqa00000001'), 'devreqa00000001');
  assert.strictEqual(mm.ok, true);
  assert.strictEqual(F.db.devBlocks.length, 0);
});

test('тоглоом (games status/launch): ' + N + ' өөр төхөөрөмж, зөрүүтэй токен — deviceBlocked гарахгүй', async () => {
  for (let i = 0; i < N; i++) {
    const r = await F.call(games, { query: { action: 'status' }, body: { realm: 'ws', wstoken: tok('g@x.mn') }, headers: { 'x-device-id': 'devgame' + String(i).padStart(8, '0') } });
    assert.notStrictEqual(r.body.deviceBlocked, true, 'төхөөрөмж ' + i + ': ' + JSON.stringify(r.body).slice(0, 120));
  }
  const r = await F.call(games, { query: { action: 'status' }, body: { realm: 'ws', wstoken: tok('g@x.mn', 'devgtok00000001') }, headers: { 'x-device-id': 'devgoth00000001' } });
  assert.notStrictEqual(r.body.deviceBlocked, true);
  assert.strictEqual(F.db.devBlocks.length, 0);
});
