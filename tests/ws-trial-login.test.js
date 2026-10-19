// Шинэ дансны үнэгүй туршилт — нэвтрэлтийн замууд (api/worksheets.js wsIssue → api/_wstrial.js start).
// Анхны амжилттай нэвтрэлт (бүртгүүлээд автоматаар нэвтэрсэн ч) туршилтыг эхлүүлнэ; дахин нэвтрэлт СУНГАХГҮЙ;
// туршилтын алдаа нэвтрэлтийг зогсоохгүй; төхөөрөмжийн хязгаарт (403) туршилт эхлэхгүй; wsEntitled туршилтыг тооцохгүй.
// Ажиллуулах: node --test tests/ws-trial-login.test.js   (бодит DB/textbee 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const ws = require(path.join(F.API, 'worksheets.js'));
const WDEV = require(path.join(F.API, '_wsdev.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const W = (body, o) => F.call(ws, body, o);
const ADMIN = { headers: { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) } };
const HASH = bcrypt.hashSync('secret1', 4);
const DEV = 'devlogin0000001', DEV2 = 'devlogin0000002';
const HOUR = 3600e3;

function acct(email, o) {
  F.db.ws.set(email, Object.assign({ email: email, pass_hash: HASH, verified: true, code: null, code_exp: null, name: 'N',
    phone: '99113300', code_attempts: 0, phone_verified_at: new Date(), created_at: new Date() }, o || {}));
}
const login = (email, dev, o) => W({ action: 'ws_login', email: email, pass: 'secret1' }, Object.assign({ headers: dev ? { 'x-device-id': dev } : {} }, o || {}));
const span = (tr) => Date.parse(tr.until) - Date.parse(tr.started_at);

beforeEach(() => {
  F.reset();
  process.env.WS_TRIAL_SECONDS = '300';
  process.env.WS_TRIAL_FROM = new Date(Date.now() - HOUR).toISOString();
});

test('бүртгүүлээд (SMS код) автоматаар нэвтрэх мөч = туршилтын эхлэл: ws_verify → trial 300 сек', async () => {
  let r = await W({ action: 'ws_register', email: 'reg@x.mn', pass: 'secret1', name: 'Багш', phone: '99114455' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.db.trial.trials.size, 0, 'код баталгаажаагүй үед туршилт эхлэхгүй');
  r = await W({ action: 'ws_verify', email: 'reg@x.mn', pass: 'secret1', code: F.lastCode() }, { headers: { 'x-device-id': DEV } });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
  const tr = r.body.trial;
  assert.ok(tr, 'хариунд trial');
  assert.strictEqual(span(tr), 300000);
  assert.deepStrictEqual([tr.active, tr.seconds, tr.denied, typeof tr.server_now], [true, 300, null, 'number']);
  assert.strictEqual(F.db.trial.trials.get('reg@x.mn').device_id, DEV);
});

test('нууц үгээр анх нэвтрэх → эхэлнэ; дахин нэвтрэлт (өөр төхөөрөмж, DB цаг +2 мин) СУНГАХГҮЙ; дууссаны дараа active:false', async () => {
  acct('n@x.mn');
  const a = await login('n@x.mn', DEV);
  assert.strictEqual(a.statusCode, 200);
  assert.strictEqual(span(a.body.trial), 300000);
  F.db.trial.shift = 120000;
  const b = await login('n@x.mn', DEV2);
  assert.strictEqual(b.statusCode, 200);
  assert.strictEqual(b.body.trial.until, a.body.trial.until, 'хугацаа өөрчлөгдөхгүй');
  assert.strictEqual(b.body.trial.started_at, a.body.trial.started_at);
  F.db.trial.shift = 300000;
  const c = await login('n@x.mn', DEV);
  assert.deepStrictEqual([c.statusCode, c.body.trial.active, c.body.trial.until], [200, false, a.body.trial.until]);
  assert.strictEqual(F.db.trial.trials.size, 1);
  // нууц үг сэргээх (ws_reset) ч сунгахгүй
  F.db.ws.get('n@x.mn').code = '123456'; F.db.ws.get('n@x.mn').code_exp = new Date(Date.now() + 600000);
  const d = await W({ action: 'ws_reset', email: 'n@x.mn', pass: 'newpass1', code: '123456' }, { headers: { 'x-device-id': DEV } });
  assert.strictEqual(d.statusCode, 200);
  assert.strictEqual(d.body.trial.until, a.body.trial.until);
});

test('хуучин данс (created_at < WS_TRIAL_FROM) → хариу урьдын адил (trial түлхүүргүй), юу ч бичихгүй', async () => {
  acct('old@x.mn', { created_at: new Date(Date.now() - 40 * 864e5) });
  const r = await login('old@x.mn', DEV);
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), ['email', 'ok', 'token']);
  assert.strictEqual(F.db.trial.trials.size, 0);
  assert.strictEqual(F.db.trial.marks.size, 0);
  // баталгаажаагүй → 403 needVerify (хуучин шигээ), туршилтгүй
  acct('unv@x.mn', { verified: false });
  const u = await login('unv@x.mn', DEV);
  assert.deepStrictEqual([u.statusCode, u.body.needVerify, u.body.trial], [403, true, undefined]);
  assert.strictEqual(F.db.trial.trials.size, 0);
});

test('урилгаар бүртгүүлсэн (утасгүй) шинэ данс → туршилт; ижил төхөөрөмжөөс 2 дахь данс → denied dev', async () => {
  const c = await W({ action: 'ws_invite_create', maxUses: 5, expiresInDays: 7 }, ADMIN);
  const t = c.body.token;
  const a = await W({ action: 'ws_register', email: 'inv1@x.mn', pass: 'secret1', name: 'A', invite: t }, { headers: { 'x-device-id': DEV } });
  assert.deepStrictEqual([a.statusCode, a.body.invited, a.body.trial.active, span(a.body.trial)], [200, true, true, 300000]);
  const b = await W({ action: 'ws_register', email: 'inv2@x.mn', pass: 'secret1', name: 'B', invite: t }, { headers: { 'x-device-id': DEV } });
  assert.deepStrictEqual([b.statusCode, b.body.trial.active, b.body.trial.denied, b.body.trial.seconds], [200, false, 'dev', 0]);
  const d = await W({ action: 'ws_register', email: 'inv3@x.mn', pass: 'secret1', name: 'C', invite: t }, { headers: { 'x-device-id': DEV2 } });
  assert.strictEqual(d.body.trial.active, true, 'өөр төхөөрөмж, утасгүй — туршилт');
});

test('ижил утастай өөр шинэ данс (өөр төхөөрөмж) → denied phone', async () => {
  acct('p1@x.mn', { phone: '99118800' });
  acct('p2@x.mn', { phone: '+976 9911 8800' });
  assert.strictEqual((await login('p1@x.mn', DEV)).body.trial.active, true);
  const r = await login('p2@x.mn', DEV2);
  assert.deepStrictEqual([r.statusCode, r.body.trial.active, r.body.trial.denied], [200, false, 'phone']);
});

test('зэрэг 2 нэвтрэлт → ws_trials-д 1 мөр, хоёулаа ижил хугацаа', async () => {
  acct('z@x.mn');
  const [a, b] = await Promise.all([login('z@x.mn', DEV), login('z@x.mn', DEV)]);
  assert.strictEqual(F.db.trial.trials.size, 1);
  assert.strictEqual(a.body.trial.until, b.body.trial.until);
  assert.strictEqual(b.body.trial.denied, null);
});

test('туршилтын DB алдаа → нэвтрэлт 200, trial түлхүүргүй; төхөөрөмжийн хязгаар 403 → туршилт эхлэхгүй (SQL 0)', async () => {
  acct('f@x.mn');
  F.db.trial.fail = true;
  const r = await login('f@x.mn', DEV);
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
  assert.strictEqual(r.body.trial, undefined);
  assert.ok(F.logs.some(l => /\[wstrial start\]/.test(l)));
  F.db.trial.fail = false;
  F.db.trial.queries.length = 0;
  acct('lim@x.mn');
  const orig = WDEV.check;
  WDEV.check = async function () { return { ok: false, error: 'DEVICE_LIMIT', max: 4, devices: [] }; };
  try {
    const x = await login('lim@x.mn', DEV);
    assert.deepStrictEqual([x.statusCode, x.body.deviceLimit, x.body.trial], [403, true, undefined]);
  } finally { WDEV.check = orig; }
  assert.strictEqual(F.db.trial.queries.length, 0, 'хязгаарт туршилтын SQL 0');
  assert.strictEqual(F.db.trial.trials.has('lim@x.mn'), false);
  // дугаар ирээгүй (NO_DEVICE) ч нэвтрэлт явна — туршилт утасны тэмдгээр эхэлнэ
  const nd = await login('lim@x.mn', null);
  assert.deepStrictEqual([nd.statusCode, nd.body.trial.active], [200, true]);
  assert.strictEqual(F.db.trial.trials.get('lim@x.mn').device_id, null);
});

test('wsEntitled туршилтыг ЭРХ гэж тооцохгүй: туршилттай баталгаажаагүй мөрийг SMS кодоор идэвхжүүлж болно (409 биш)', async () => {
  // ws_access/ws_purchases… 7 хүснэгт л — ws_trials ороогүй
  const src = fs.readFileSync(path.join(F.API, 'worksheets.js'), 'utf8');
  const block = src.slice(src.indexOf('const WS_ENTITLED_SQL = ['), src.indexOf('async function wsEntitled'));
  assert.ok(block.length > 50);
  assert.doesNotMatch(block, /ws_trial/);
  F.db.ws.set('cl@x.mn', { email: 'cl@x.mn', pass_hash: HASH, verified: false, code: '654321', code_exp: new Date(Date.now() + 600000),
    name: 'C', phone: '99117700', code_attempts: 0, phone_verified_at: null, created_at: new Date() });
  F.db.trial.put('cl@x.mn', 200);
  const r = await W({ action: 'ws_reset', email: 'cl@x.mn', pass: 'newpass1', code: '654321' });
  assert.strictEqual(r.statusCode, 200, 'NEED_ADMIN (409) биш');
  assert.strictEqual(F.db.entitled.size, 0, 'ws_access г.м.-д юу ч бичигдээгүй');
});

test('WS_TRIAL_SECONDS=0 → туршилтын SQL 0, хариу урьдын адил', async () => {
  process.env.WS_TRIAL_SECONDS = '0';
  acct('o@x.mn');
  const r = await login('o@x.mn', DEV);
  assert.deepStrictEqual(Object.keys(r.body).sort(), ['email', 'ok', 'token']);
  assert.strictEqual(F.db.trial.queries.length, 0);
});

test('тодорхойгүй SQL алга', () => { assert.deepStrictEqual(F.db.unknown, []); });
