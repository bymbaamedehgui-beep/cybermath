// P1 ажлын хуудасны данс (api/worksheets.js): ws_register / ws_resend / ws_forgot код ЗӨВХӨН SMS-ээр.
// Ажиллуулах: node --test tests/sms-ws-p1.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ws = require(path.join(F.API, 'worksheets.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const W = (body, o) => F.call(ws, body, o);
const PH = '99112233', PH2 = '88114455', PH3 = '95001122';
const BAD = 'Код буруу эсвэл хугацаа нь дууссан байна';
const ENT_TABLES = ['ws_access', 'ws_grade_access', 'ws_purchases', 'ws_pending', 'ws_event_regs'];

beforeEach(() => F.reset());

function reg(email, extra) { return Object.assign({ action: 'ws_register', email: email, pass: 'secret1', name: 'A', phone: PH }, extra || {}); }
async function seedWs(email, o) {
  F.db.ws.set(email, Object.assign({ email: email, pass_hash: await bcrypt.hash('oldpass1', 4), verified: true, code: null, code_exp: null, name: 'N', phone: PH3, code_attempts: 0 }, o || {}));
}
function gDay() { let n = 0; for (const [k, v] of F.db.rl) if (/^sms:g:d:/.test(k)) n += v.count; return n; }

test('ws_register: утасгүй / буруу / гадаад → 400, SMS 0, мөр үүсэхгүй', async () => {
  const n = F.sms.calls.length;
  for (const phone of [undefined, '', '123', '70112233', '+79161234567']) {
    const r = await W(reg('np@x.mn', { phone: phone }));
    assert.strictEqual(r.statusCode, 400, String(phone));
    assert.strictEqual(r.body.ok, false);
    assert.ok(r.body.code === 'PHONE_INVALID' || r.body.code === 'PHONE_FOREIGN', r.body.code);
  }
  assert.ok(!F.db.ws.has('np@x.mn'));
  assert.strictEqual(F.sms.calls.length, n);
});

test('ws_register ok → SMS код ws_login-д, {ok,needVerify,sms,masked}, имэйл 0', async () => {
  const n = F.sms.calls.length;
  const r = await W(reg('a@x.mn', { phone: '+976 9911 2233' }));
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, needVerify: true, sms: true, masked: '**** **33' });
  assert.strictEqual(F.sms.calls.length, n + 1);
  assert.deepStrictEqual(F.sms.calls[n].body.recipients, ['+97699112233']);
  assert.match(F.sms.calls[n].body.message, /бүртгэлийн код: \d{6}/);
  const row = F.db.ws.get('a@x.mn');
  assert.strictEqual(row.code, F.lastCode());
  assert.strictEqual(row.phone, PH);
  assert.strictEqual(row.verified, false);
  assert.ok(await bcrypt.compare('secret1', row.pass_hash));
  assert.strictEqual(F.mail.length, 0);
});

test('ws_register: хүчинтэй код байхад pass/нэр/утас дарж бичихгүй, SMS 0 (hotfix хэвээр)', async () => {
  const row = F.db.ws.get('a@x.mn'), h = row.pass_hash, code = row.code, n = F.sms.calls.length;
  const r = await W(reg('a@x.mn', { pass: 'attacker9', name: 'Evil', phone: PH2 }));
  assert.deepStrictEqual([r.body.ok, r.body.needVerify, r.body.pending, r.body.sms, r.body.masked], [true, true, true, undefined, undefined]);
  assert.deepStrictEqual([row.pass_hash, row.name, row.phone, row.code], [h, 'A', PH, code]);
  assert.strictEqual(F.sms.calls.length, n);
});

test('ws_register: хугацаа дууссан код → шинэчилж SMS дахин (attempts=0)', async () => {
  const row = F.db.ws.get('a@x.mn');
  row.code_exp = new Date(Date.now() - 1000); row.code_attempts = 3;
  const r = await W(reg('a@x.mn', { pass: 'newpass1', name: 'A2' }));
  assert.strictEqual(r.body.sms, true);
  assert.strictEqual(row.code, F.lastCode());
  assert.strictEqual(row.code_attempts, 0);
  assert.strictEqual(row.name, 'A2');
});

test('ws_register: store race (зэрэг хүсэлт хүчинтэй код тавьсан) → {ok:true, needVerify:true}, SMS 0, нөөц буцна', async () => {
  F.db.beforeWsUpsert = function (email) {
    F.db.ws.set(email, { email: email, pass_hash: 'x', verified: false, code: '555555', code_exp: new Date(Date.now() + 600e3), name: 'R', phone: PH3, code_attempts: 0 });
  };
  const n = F.sms.calls.length;
  const r = await W(reg('race@x.mn'));
  assert.deepStrictEqual([r.body.ok, r.body.needVerify, r.body.pending, r.body.sms, r.body.masked], [true, true, true, undefined, undefined]);
  assert.strictEqual(F.sms.calls.length, n);
  assert.strictEqual(F.db.ws.get('race@x.mn').code, '555555');
  assert.strictEqual(gDay(), 0);
});

test('ws_verify: буруу код 400 (codeAttempt хэвээр), зөв код + нууц үг → токен + markVerified', async () => {
  const code = F.db.ws.get('a@x.mn').code, wrong = code === '111111' ? '222222' : '111111';
  let r = await W({ action: 'ws_verify', email: 'a@x.mn', pass: 'newpass1', code: wrong });
  assert.deepStrictEqual([r.statusCode, r.body.error], [400, BAD]);
  assert.strictEqual(F.db.ws.get('a@x.mn').code_attempts, 1);
  r = await W({ action: 'ws_verify', email: 'a@x.mn', pass: 'newpass1', code: code });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
  assert.strictEqual(F.db.ws.get('a@x.mn').verified, true);
  assert.ok(F.db.smsLog.some(x => x.purpose === 'verify' && x.verified_at));
  r = await W(reg('a@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.existed], [400, true]);
});

test('ws_register: эрхтэй имэйл (5 хүснэгт тус бүр) → 409 NEED_ADMIN, мөр/SMS 0, Telegram claim', async () => {
  const n = F.sms.calls.length;
  for (const t of ENT_TABLES) {
    F.reset();
    const e = 'paid-' + t.replace(/_/g, '') + '@x.mn';
    F.entitle(t, e);
    const r = await W(reg(e));
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [409, false, 'NEED_ADMIN'], t);
    assert.match(r.body.error, /админ/);
    assert.ok(!F.db.ws.has(e), t);
  }
  assert.strictEqual(F.sms.calls.length, n);
  assert.ok(F.tg.some(x => /эрхтэй имэйл/.test(x)));
});

test('H9: эрхтэй имэйлийн баталгаажаагүй мөр (өмнө бичсэн утас) → ws_resend/ws_forgot хуурамч хариу, ws_verify/ws_reset 409; SMS 0, оролдлого тоолохгүй', async () => {
  await seedWs('victim@x.mn', { verified: false, code: '246810', code_exp: new Date(Date.now() + 600e3), name: 'Evil', phone: PH2 });
  F.entitle('ws_access', 'victim@x.mn');
  const n = F.sms.calls.length;
  for (const body of [
    { action: 'ws_resend', email: 'victim@x.mn' },
    { action: 'ws_forgot', email: 'victim@x.mn' },
  ]) {
    F.clearCooldowns();
    const r = await W(body);
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.sms], [200, true, true], body.action);
    assert.notStrictEqual(r.body.masked, '**** **55', body.action + ': бодит (халдагчийн) утасны маск биш');
    assert.ok(!r.body.token, body.action);
  }
  for (const body of [
    { action: 'ws_verify', email: 'victim@x.mn', pass: 'hacker99', code: '246810' },
    { action: 'ws_reset', email: 'victim@x.mn', pass: 'hacker99', code: '246810' },
  ]) {
    const r = await W(body);
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [409, false, 'NEED_ADMIN'], body.action);
    assert.ok(!r.body.token, body.action);
  }
  const row = F.db.ws.get('victim@x.mn');
  assert.deepStrictEqual([row.verified, row.code, row.code_attempts], [false, '246810', 0]);
  assert.strictEqual(F.sms.calls.length, n);
});

test('wsEntitled DB алдаа → 503 SMS_UNAVAILABLE (fail-closed), SMS 0', async () => {
  F.db.entFail = true;
  const n = F.sms.calls.length;
  const r = await W(reg('ef@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE']);
  assert.ok(!F.db.ws.has('ef@x.mn'));
  assert.strictEqual(F.sms.calls.length, n);
});

test('ws_forgot: баталгаажсан утастай → SMS, ws_reset → токен; 5+ буруу оролдлого → код хүчингүй (хэвээр)', async () => {
  await seedWs('fg@x.mn', { phone: PH3 });
  const n = F.sms.calls.length;
  let r = await W({ action: 'ws_forgot', email: 'fg@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **22' });
  assert.strictEqual(F.sms.calls.length, n + 1);
  assert.match(F.sms.calls[n].body.message, /сэргээх код: \d{6}/);
  const code = F.lastCode(), wrong = code === '111111' ? '222222' : '111111';
  assert.strictEqual(F.db.ws.get('fg@x.mn').code, code);
  r = await W({ action: 'ws_reset', email: 'fg@x.mn', pass: 'newpass9', code: wrong });
  assert.deepStrictEqual([r.statusCode, r.body.error], [400, BAD]);
  r = await W({ action: 'ws_reset', email: 'fg@x.mn', pass: 'newpass9', code: code });
  assert.ok(r.body.token);
  assert.ok(await bcrypt.compare('newpass9', F.db.ws.get('fg@x.mn').pass_hash));
  assert.ok(F.db.smsLog.some(x => x.purpose === 'reset' && x.verified_at));

  F.clearCooldowns();
  r = await W({ action: 'ws_forgot', email: 'fg@x.mn' });
  const code2 = F.lastCode(), wrong2 = code2 === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) {
    r = await W({ action: 'ws_reset', email: 'fg@x.mn', pass: 'another9', code: wrong2 });
    assert.deepStrictEqual([r.statusCode, r.body.error], [400, BAD], 'i=' + i);
  }
  r = await W({ action: 'ws_reset', email: 'fg@x.mn', pass: 'another9', code: code2 });
  assert.strictEqual(r.statusCode, 400);
  assert.match(r.body.error, /хүчингүй/);
  assert.strictEqual(F.db.ws.get('fg@x.mn').code, null);
});

test('ws_forgot: бүртгэлгүй / утасгүй / буруу утастай legacy мөр → бодиттой ижил хэлбэрийн хуурамч хариу; SMS 0', async () => {
  await seedWs('legacy@x.mn', { phone: null });
  await seedWs('legacy2@x.mn', { phone: '5511' });
  const n = F.sms.calls.length;
  for (const e of ['none@x.mn', 'legacy@x.mn', 'legacy2@x.mn']) {
    const r = await W({ action: 'ws_forgot', email: e });
    assert.strictEqual(r.statusCode, 200, e);
    assert.deepStrictEqual(Object.keys(r.body).sort(), ['masked', 'ok', 'sms'], e);
    assert.match(r.body.masked, /^\*\*\*\* \*\*\d\d$/, e);
  }
  assert.strictEqual(F.sms.calls.length, n);
});

test('ws_forgot: textbee 401/500 → 503 ok:true БИШ, код хүчингүй; timeout → SMS_UNCERTAIN codeStep, код үлдэнэ', async () => {
  await seedWs('fgf@x.mn', { phone: PH });
  for (const mode of ['auth', 'down']) {
    F.reset(); F.sms.mode = mode;
    const r = await W({ action: 'ws_forgot', email: 'fgf@x.mn' });
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE'], mode);
    assert.strictEqual(F.db.ws.get('fgf@x.mn').code, null, mode);
  }
  F.reset(); F.sms.mode = 'abort';
  const r = await W({ action: 'ws_forgot', email: 'fgf@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code, r.body.codeStep], [503, false, 'SMS_UNCERTAIN', true]);
  assert.strictEqual(F.db.ws.get('fgf@x.mn').code, F.lastCode());
});

test('ws_resend: утастай баталгаажаагүй → SMS; утасгүй / олдоогүй → хуурамч хариу; баталгаажсан → alreadyVerified', async () => {
  await seedWs('rs@x.mn', { verified: false, phone: PH2, code: null });
  await seedWs('rsnp@x.mn', { verified: false, phone: null });
  const n = F.sms.calls.length;
  let r = await W({ action: 'ws_resend', email: 'rs@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, needVerify: true, sms: true, masked: '**** **55' });
  assert.strictEqual(F.db.ws.get('rs@x.mn').code, F.lastCode());
  r = await W({ action: 'ws_resend', email: 'rs@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.code], [429, 'SMS_COOLDOWN']);
  const WSK = ['masked', 'needVerify', 'ok', 'sms'];
  r = await W({ action: 'ws_resend', email: 'rsnp@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), WSK);
  r = await W({ action: 'ws_resend', email: 'fg@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, alreadyVerified: true });
  r = await W({ action: 'ws_resend', email: 'none@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), WSK);
  assert.strictEqual(F.sms.calls.length, n + 1);
});

test('ws_register: textbee 500 → 503, код NULL; SMS яваагүй тул cooldown буцаагдаж ШУУД дахин бүртгүүлж болно; амжилттайн дараа 10 мин 429', async () => {
  F.sms.mode = 'down';
  let r = await W(reg('rf@x.mn', { phone: PH2 }));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE']);
  assert.strictEqual(F.db.ws.get('rf@x.mn').code, null);
  F.sms.mode = 'ok';
  r = await W(reg('rf@x.mn', { phone: PH2 }));
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(F.db.ws.get('rf@x.mn').code, F.lastCode());
  r = await W({ action: 'ws_resend', email: 'rf@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.code], [429, 'SMS_COOLDOWN']);
  assert.match(r.body.error, /минутын дараа/);
});

test('ws_register: SMS_UNCERTAIN (abort) → 503 + needVerify/codeStep/masked, код үлдэнэ', async () => {
  F.sms.mode = 'abort';
  const r = await W(reg('wu@x.mn', { phone: PH3 }));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code, r.body.needVerify, r.body.codeStep, r.body.masked], [503, false, 'SMS_UNCERTAIN', true, true, '**** **22']);
  assert.strictEqual(F.db.ws.get('wu@x.mn').code, F.lastCode());
});

test('ws_verify: нууц үггүй / богино нууц үгтэй хүсэлт (хуучин нээлттэй хуудас) → 400 NEED_PASS, код ба оролдлого хэвээр', async () => {
  F.reset();
  const r0 = await W(reg('np2@x.mn', { phone: PH2 }));
  assert.strictEqual(r0.body.ok, true);
  const row = F.db.ws.get('np2@x.mn'), code = row.code;
  let r = await W({ action: 'ws_verify', email: 'np2@x.mn', code: code });
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'NEED_PASS']);
  assert.match(r.body.error, /Нууц үг/);
  r = await W({ action: 'ws_verify', email: 'np2@x.mn', pass: 'abc', code: code });
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'NEED_PASS']);
  assert.deepStrictEqual([row.code, row.code_attempts, row.verified], [code, 0, false]);
  // 6+ нууц үгээр дахин оролдоход баталгаажна
  r = await W({ action: 'ws_verify', email: 'np2@x.mn', pass: 'newpass9', code: code });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
  assert.strictEqual(F.db.ws.get('np2@x.mn').verified, true);
});

test('S2/S1: бүтэн дугаар, код, API түлхүүр лог/Telegram/sms_log/хариунд алга; бодит сүлжээ 0; тодорхойгүй SQL 0; имэйл 0', () => {
  assert.deepStrictEqual(F.leakCheck([PH, PH2, PH3]), []);
  assert.deepStrictEqual(F.sms.other, []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.strictEqual(F.mail.length, 0);
  assert.ok(F.responses.every(b => !(b && b.ok === true && b.code)));
});
