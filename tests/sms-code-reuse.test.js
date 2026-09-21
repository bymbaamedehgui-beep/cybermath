// Дахин код илгээхэд хүчинтэй кодыг ДАХИН АШИГЛАНА (api/_sms.js sendCode reuse): хоцорч ирсэн SMS ч зөв код хэвээр.
// Ажиллуулах: node --test tests/sms-code-reuse.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const auth = require(path.join(F.API, 'auth.js'));
const ws = require(path.join(F.API, 'worksheets.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const A = (body, o) => F.call(auth, body, o);
const W = (body, o) => F.call(ws, body, o);
const PH = '99112233', PH2 = '88114455', PH3 = '95001122', PH4 = '99887766', PH5 = '88001122';

beforeEach(() => F.reset());

function wrong(c) { return c === '111111' ? '222222' : '111111'; }
async function seedUser(email, o) {
  F.db.users.set(email, Object.assign({
    id: F.db.nextId++, email: email, pass: await bcrypt.hash('oldpass1', 4), first_name: 'A', last_name: 'B', grade: '9', plan: 'free',
    xp: 0, gems: 340, hearts: 5, streak: 0, avatar: 'default', verified: true, verify_code: null, verify_expiry: null, phone: PH, role: 'student',
    code_attempts: 0, email_unverified: false, token_version: 0, phone_verified_at: new Date(),
  }, o || {}));
}
async function seedWs(email, o) {
  F.db.ws.set(email, Object.assign({ email: email, pass_hash: await bcrypt.hash('oldpass1', 4), verified: true, code: null, code_exp: null, name: 'N', phone: PH3, code_attempts: 0, phone_verified_at: new Date() }, o || {}));
}

test('game: бүртгэл → буруу 1 оролдлого → resend → ИЖИЛ код; оролдлого хэвээр; хоцорсон анхны SMS-ийн кодоор баталгаажна', async () => {
  let r = await A({ action: 'register', email: 'ru1@x.mn', pass: 'secret1', firstName: 'А', lastName: 'Б', grade: '9', role: 'student', phone: PH });
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  r = await A({ action: 'verify', email: 'ru1@x.mn', code: wrong(first) });
  assert.strictEqual(r.statusCode, 400);
  F.clearCooldowns();
  const n = F.sms.calls.length;
  r = await A({ action: 'resend', email: 'ru1@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.sms.calls.length, n + 1, 'SMS дахин явсан');
  assert.strictEqual(F.lastCode(), first, 'ижил код');
  const u = F.db.users.get('ru1@x.mn');
  assert.deepStrictEqual([u.verify_code, u.code_attempts], [first, 1]);
  r = await A({ action: 'verify', email: 'ru1@x.mn', code: first });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
});

test('game: хугацаа дууссан код → resend ШИНЭ код (оролдлого 0); оролдлого дууссан (5) код → ШИНЭ код', async () => {
  await seedUser('ru2@x.mn', { verified: false, phone_verified_at: null, verify_code: '555555', verify_expiry: new Date(Date.now() - 1000), code_attempts: 3 });
  let r = await A({ action: 'resend', email: 'ru2@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  let u = F.db.users.get('ru2@x.mn');
  assert.notStrictEqual(u.verify_code, '555555');
  assert.deepStrictEqual([u.verify_code, u.code_attempts], [F.lastCode(), 0]);

  await seedUser('ru3@x.mn', { verified: false, phone_verified_at: null, phone: PH2, verify_code: '444444', verify_expiry: new Date(Date.now() + 300e3), code_attempts: 5 });
  r = await A({ action: 'resend', email: 'ru3@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  u = F.db.users.get('ru3@x.mn');
  assert.notStrictEqual(u.verify_code, '444444');
  assert.deepStrictEqual([u.verify_code, u.code_attempts], [F.lastCode(), 0]);
});

test('game нууц үг сэргээх: sendResetCode 2 удаа → ИЖИЛ код; анхны SMS-ийн кодоор нууц үг солигдоно', async () => {
  await seedUser('rr@x.mn', { phone: PH4 });
  let r = await A({ action: 'sendResetCode', email: 'rr@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  F.clearCooldowns();
  r = await A({ action: 'sendResetCode', email: 'rr@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.lastCode(), first);
  r = await A({ action: 'reset', email: 'rr@x.mn', code: first, newPass: 'newpass9' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
  assert.ok(await bcrypt.compare('newpass9', F.db.users.get('rr@x.mn').pass));
});

test('ws: бүртгэл → ws_resend → ИЖИЛ код; анхны кодоор ws_verify → токен', async () => {
  let r = await W({ action: 'ws_register', email: 'wr@x.mn', pass: 'secret1', name: 'A', phone: PH5 });
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  F.clearCooldowns();
  r = await W({ action: 'ws_resend', email: 'wr@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.lastCode(), first);
  assert.strictEqual(F.db.ws.get('wr@x.mn').code, first);
  r = await W({ action: 'ws_verify', email: 'wr@x.mn', pass: 'secret1', code: first });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
});

test('ws нууц үг сэргээх: ws_forgot 2 удаа → ИЖИЛ код; оролдлого хэвээр; анхны кодоор ws_reset → токен', async () => {
  await seedWs('wf@x.mn');
  let r = await W({ action: 'ws_forgot', email: 'wf@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  r = await W({ action: 'ws_reset', email: 'wf@x.mn', code: wrong(first), pass: 'newpass9' });
  assert.strictEqual(r.statusCode, 400);
  F.clearCooldowns();
  r = await W({ action: 'ws_forgot', email: 'wf@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.lastCode(), first);
  assert.strictEqual(F.db.ws.get('wf@x.mn').code_attempts, 1, 'оролдлого тэглэгдэхгүй');
  r = await W({ action: 'ws_reset', email: 'wf@x.mn', code: first, pass: 'newpass9' });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
});

test('дахин илгээхэд textbee 500 → 503, гэхдээ хүчинтэй код УСТАХГҮЙ (өмнөх SMS-ээр ирсэн байж болно)', async () => {
  let r = await A({ action: 'register', email: 'rf@x.mn', pass: 'secret1', firstName: 'А', lastName: 'Б', grade: '9', role: 'student', phone: PH2 });
  const first = F.lastCode();
  F.clearCooldowns();
  F.sms.mode = 'down';
  r = await A({ action: 'resend', email: 'rf@x.mn' });
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(F.db.users.get('rf@x.mn').verify_code, first, 'код хэвээр');
  F.sms.mode = 'ok';
  r = await A({ action: 'verify', email: 'rf@x.mn', code: first });
  assert.strictEqual(r.statusCode, 200);
});

test('шинэ код үед textbee 500 → код хүчингүй (хуучин зан төлөв хэвээр); reuse DB алдаа → шинэ код руу буцна', async () => {
  F.sms.mode = 'down';
  let r = await A({ action: 'register', email: 'rn@x.mn', pass: 'secret1', firstName: 'А', lastName: 'Б', grade: '9', role: 'student', phone: PH3 });
  assert.strictEqual(r.statusCode, 503);
  const rn = F.db.users.get('rn@x.mn');
  assert.ok(!rn || rn.verify_code == null, 'амжилтгүй шинэ код (эсвэл мөр) устана');
  F.sms.mode = 'ok';

  F.reset();
  r = await A({ action: 'register', email: 're@x.mn', pass: 'secret1', firstName: 'А', lastName: 'Б', grade: '9', role: 'student', phone: PH4 });
  const first = F.lastCode();
  F.clearCooldowns();
  F.db.reuseFail = true;
  r = await A({ action: 'resend', email: 're@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.db.users.get('re@x.mn').verify_code, F.lastCode());
  assert.ok(F.logs.some(l => /\[sms\] reuse/.test(l)), 'reuse алдаа логлогдсон');
  void first;
});

test('game: "Буцах" → формоо дахин илгээх (ижил утас) → ИЖИЛ код, оролдлого хэвээр; утас өөр бол ШИНЭ код', async () => {
  const reg = (phone, pass) => A({ action: 'register', email: 'rb@x.mn', pass: pass || 'secret1', firstName: 'А', lastName: 'Б', grade: '9', role: 'student', phone: phone });
  let r = await reg(PH5);
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  r = await A({ action: 'verify', email: 'rb@x.mn', code: wrong(first) });
  assert.strictEqual(r.statusCode, 400);
  F.clearCooldowns();
  r = await reg(PH5, 'secret2');   // нууц үгээ сольж дахин илгээсэн ч код хэвээр
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.lastCode(), first, 'ижил код дахин илгээгдсэн');
  let u = F.db.users.get('rb@x.mn');
  assert.deepStrictEqual([u.verify_code, u.code_attempts], [first, 1]);
  assert.ok(new Date(u.verify_expiry).getTime() > Date.now() + 9 * 60e3);
  F.clearCooldowns();
  r = await reg(PH);               // утас өөр → шинэ код
  assert.strictEqual(r.statusCode, 200);
  u = F.db.users.get('rb@x.mn');
  assert.notStrictEqual(u.verify_code, first);
  assert.deepStrictEqual([u.verify_code, u.code_attempts], [F.lastCode(), 0]);
  r = await A({ action: 'verify', email: 'rb@x.mn', code: first });
  assert.strictEqual(r.statusCode, 400, 'хуучин утасны код хүчингүй');
});

test('S2 / тодорхойгүй SQL: бүтэн дугаар, код, түлхүүр лог/Telegram/sms_log/хариунд алга; бодит сүлжээ 0', () => {
  assert.deepStrictEqual(F.leakCheck([PH, PH2, PH3, PH4, PH5]), []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.sms.other, []);
});
