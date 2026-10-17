// Дасгалын төвийн тоглоом авсан данс SMS-ээр булаагдахгүй (gp-s6): api/worksheets.js wsEntitled нь
// game_access / game_purchases (realm 'ws')-ийг ч эрх гэж тооцно → ws_register / ws_verify / ws_reset NEED_ADMIN, SMS 0.
// Ажиллуулах: node tests/games-entitled.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ws = require(path.join(F.API, 'worksheets.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const W = (body, o) => F.call(ws, body, o);
const PH = '99112233', PH2 = '88114455';
const GAME_TABLES = ['game_access', 'game_purchases'];

beforeEach(() => F.reset());

function reg(email) { return { action: 'ws_register', email: email, pass: 'secret1', name: 'A', phone: PH }; }

test('ws_register: зөвхөн тоглоом авсан (ws) имэйл → 409 NEED_ADMIN, мөр/SMS 0', async () => {
  const n = F.sms.calls.length;
  for (const t of GAME_TABLES) {
    F.reset();
    const e = 'gamer-' + t.replace(/_/g, '') + '@x.mn';
    F.entitle(t, e);
    const r = await W(reg(e));
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [409, false, 'NEED_ADMIN'], t);
    assert.ok(!F.db.ws.has(e), t);
  }
  assert.strictEqual(F.sms.calls.length, n);
  // тоглоомын эрхгүй имэйл — хуучин шигээ SMS код
  const r = await W(reg('fresh@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.needVerify], [200, true, true]);
});

test('H9: тоглоом авсан имэйлийн баталгаажаагүй мөр → ws_verify / ws_reset 409, SMS 0', async () => {
  F.db.ws.set('victim@x.mn', { email: 'victim@x.mn', pass_hash: await bcrypt.hash('oldpass1', 4), verified: false, code: '246810',
    code_exp: new Date(Date.now() + 600e3), name: 'Evil', phone: PH2, code_attempts: 0 });
  F.entitle('game_access', 'victim@x.mn');
  const n = F.sms.calls.length;
  for (const body of [
    { action: 'ws_verify', email: 'victim@x.mn', pass: 'hacker99', code: '246810' },
    { action: 'ws_reset', email: 'victim@x.mn', pass: 'hacker99', code: '246810' },
  ]) {
    const r = await W(body);
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [409, false, 'NEED_ADMIN'], body.action);
    assert.ok(!r.body.token, body.action);
  }
  assert.strictEqual(F.db.ws.get('victim@x.mn').verified, false);
  assert.strictEqual(F.sms.calls.length, n);
});

test('wsEntitled-ийн SQL: тоглоомын хүснэгтийг зөвхөн realm ws-ээр (cyber-math.com-ийн эрх Дасгалын төвийн дансыг хаахгүй)', () => {
  const src = fs.readFileSync(path.join(F.API, 'worksheets.js'), 'utf8');
  const m = /const WS_ENTITLED_SQL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(m);
  const sql = m[1];
  assert.ok(sql.indexOf("SELECT 1 FROM game_access WHERE realm='ws' AND LOWER(email)=$1 LIMIT 1") >= 0);
  assert.ok(sql.indexOf("SELECT 1 FROM game_purchases WHERE realm='ws' AND LOWER(email)=$1 LIMIT 1") >= 0);
  assert.doesNotMatch(sql, /game_\w+ WHERE LOWER/, 'realm шүүлтүүргүй тоглоомын SQL алга');
});

test('тодорхойгүй SQL алга', () => {
  assert.deepStrictEqual(F.db.unknown, []);
});
