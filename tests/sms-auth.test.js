// P1 тоглоомын данс (api/auth.js): бүртгэл / дахин илгээх / нууц үг сэргээх код ЗӨВХӨН SMS-ээр.
// Ажиллуулах: node --test tests/sms-auth.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const auth = require(path.join(F.API, 'auth.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const A = (body, o) => F.call(auth, body, o);
const PH = '99112233', PH2 = '88114455', PH3 = '95001122', PH4 = '99887766';
const BAD = 'Код буруу эсвэл хугацаа нь дууссан байна';
const KEYS = ['masked', 'ok', 'sms'];

beforeEach(() => F.reset());

function regBody(email, extra) {
  return Object.assign({ action: 'register', email: email, pass: 'secret1', firstName: 'Бат', lastName: 'Болд', grade: '9', role: 'student', phone: PH }, extra || {});
}
async function seedUser(email, o) {
  F.db.users.set(email, Object.assign({
    id: F.db.nextId++, email: email, pass: await bcrypt.hash('oldpass1', 4), first_name: 'A', last_name: 'B', grade: '9', plan: 'free',
    xp: 0, gems: 340, hearts: 5, streak: 0, avatar: 'default', verified: true, verify_code: null, verify_expiry: null, phone: PH, role: 'student', code_attempts: 0,
  }, o || {}));
}
function gDay() { let n = 0; for (const [k, v] of F.db.rl) if (/^sms:g:d:/.test(k)) n += v.count; return n; }

test('register: утасгүй / буруу / гадаад дугаар → 400, SMS 0, мөр үүсэхгүй', async () => {
  const n0 = F.sms.calls.length;
  for (const phone of [undefined, '', '1234', '70112233', '991122334']) {
    const r = await A(regBody('np@x.mn', { phone: phone }));
    assert.strictEqual(r.statusCode, 400, String(phone));
    assert.strictEqual(r.body.ok, false);
    assert.ok(r.body.code === 'PHONE_INVALID' || r.body.code === 'PHONE_FOREIGN', r.body.code);
    assert.ok(r.body.error && /дугаар/.test(r.body.error));
  }
  F.clearCooldowns(); // auth:reg:em 5/цаг (одоогийн хязгаар) — 6 дахь дуудлага
  const r2 = await A(regBody('np@x.mn', { phone: '+14155550100' }));
  assert.strictEqual(r2.body.code, 'PHONE_FOREIGN');
  assert.strictEqual(F.sms.calls.length, n0);
  assert.ok(!F.db.users.has('np@x.mn'));
});

test('register ok → textbee дуудагдаж, код DB-д, имэйл илгээхгүй, хариу {ok,needVerify,email,sms,masked}', async () => {
  const n0 = F.sms.calls.length, m0 = F.mail.length;
  const r = await A(regBody('Reg1@X.mn', { phone: '9911-2233' }));
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, needVerify: true, email: 'reg1@x.mn', sms: true, masked: '**** **33' });
  assert.strictEqual(F.sms.calls.length, n0 + 1);
  const c = F.sms.calls[n0];
  assert.strictEqual(c.url, F.TEXTBEE_URL);
  assert.strictEqual(c.headers['x-api-key'], F.FAKE_KEY);
  assert.deepStrictEqual(c.body.recipients, ['+97699112233']);
  assert.match(c.body.message, /бүртгэлийн код: \d{6}/);
  const u = F.db.users.get('reg1@x.mn');
  assert.strictEqual(u.verify_code, F.lastCode());
  assert.strictEqual(u.phone, PH);
  assert.strictEqual(u.verified, false);
  assert.strictEqual(u.code_attempts, 0);
  assert.ok(new Date(u.verify_expiry).getTime() > Date.now() + 9 * 60e3);
  assert.strictEqual(F.mail.length, m0, 'имэйл илгээгдэх ёсгүй');
  const log = F.db.smsLog[F.db.smsLog.length - 1];
  assert.deepStrictEqual([log.status, log.purpose, log.kind, log.phone_masked], ['sent', 'verify', 'reg', '**** **33']);
});

test('verify: буруу код 400 (checkCode хэвээр), зөв код → нэвтэрнэ + markVerified', async () => {
  const code = F.db.users.get('reg1@x.mn').verify_code;
  const wrong = code === '111111' ? '222222' : '111111';
  let r = await A({ action: 'verify', email: 'reg1@x.mn', code: wrong });
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(r.body.error, BAD);
  assert.strictEqual(F.db.users.get('reg1@x.mn').code_attempts, 1);
  r = await A({ action: 'verify', email: 'reg1@x.mn', code: code });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
  assert.ok(r.body.user && r.body.user.token);
  assert.strictEqual(F.db.users.get('reg1@x.mn').verified, true);
  assert.ok(F.db.smsLog.some(x => x.purpose === 'verify' && x.verified_at), 'markVerified');
});

test('register: textbee 401/404/429/500/network/success:false → ok:true БИШ, 503, мөр устна, нөөц буцна', async () => {
  for (const mode of ['auth', 'device', 'quota', 'down', 'network', 'fail']) {
    F.reset(); F.sms.mode = mode;
    const e = 'fail-' + mode + '@x.mn';
    const n0 = F.sms.calls.length;
    const r = await A(regBody(e));
    assert.notStrictEqual(r.body.ok, true, mode);
    assert.strictEqual(r.statusCode, 503, mode);
    assert.strictEqual(r.body.code, 'SMS_UNAVAILABLE', mode);
    assert.strictEqual(F.sms.calls.length, n0 + 1, mode + ': textbee дуудагдсан');
    assert.ok(!F.db.users.has(e), mode + ': мөр устах ёстой');
    assert.strictEqual(gDay(), 0, mode + ': глобал нөөц буцах ёстой');
  }
  assert.ok(F.tg.some(t => /textbee/.test(t)), 'Telegram анхааруулга');
});

test('register: timeout (abort) → 503 SMS_UNCERTAIN + needVerify/codeStep, мөр ба код үлдэж verify ажиллана', async () => {
  F.sms.mode = 'abort';
  const r = await A(regBody('unc@x.mn'));
  assert.strictEqual(r.statusCode, 503);
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(r.body.code, 'SMS_UNCERTAIN');
  assert.strictEqual(r.body.needVerify, true);
  assert.strictEqual(r.body.codeStep, true);
  assert.strictEqual(r.body.email, 'unc@x.mn');
  assert.strictEqual(r.body.masked, '**** **33');
  const code = F.lastCode();
  assert.strictEqual(F.db.users.get('unc@x.mn').verify_code, code);
  const v = await A({ action: 'verify', email: 'unc@x.mn', code: code });
  assert.strictEqual(v.body.ok, true);
});

test('register: жинхэнэ timeout (SMS_TIMEOUT_MS=2000) → ok:true БИШ', async () => {
  F.sms.mode = 'hang';
  const t = Date.now();
  const r = await A(regBody('hang@x.mn', { phone: PH2 }));
  assert.ok(Date.now() - t >= 1900, 'abort хүлээсэн');
  assert.notStrictEqual(r.body.ok, true);
  assert.strictEqual(r.body.code, 'SMS_UNCERTAIN');
});

test('register: 60с дотор дахин → 429 SMS_COOLDOWN, өмнөх мөр/код устахгүй, SMS 0', async () => {
  let r = await A(regBody('cd@x.mn', { phone: PH3 }));
  assert.strictEqual(r.statusCode, 200);
  const code = F.db.users.get('cd@x.mn').verify_code, n = F.sms.calls.length;
  r = await A(regBody('cd@x.mn', { phone: PH3 }));
  assert.strictEqual(r.statusCode, 429);
  assert.strictEqual(r.body.code, 'SMS_COOLDOWN');
  assert.ok(r.body.wait > 0);
  assert.strictEqual(F.db.users.get('cd@x.mn').verify_code, code);
  assert.strictEqual(F.sms.calls.length, n);
});

test('register: SMS_DISABLED / API түлхүүргүй / pause / DB алдаа / өдрийн хязгаар → ok:true БИШ, мөр үүсэхгүй', async () => {
  const n = F.sms.calls.length;
  process.env.SMS_DISABLED = '1';
  let r = await A(regBody('dis@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE']);
  F.reset(); delete process.env.TEXTBEE_API_KEY;
  r = await A(regBody('dis@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE']);
  F.reset(); F.db.smsState.set('paused_until', String(Math.floor(Date.now() / 1000) + 600));
  r = await A(regBody('dis@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE']);
  F.reset(); F.db.rateFail = true;
  r = await A(regBody('dis@x.mn'));
  assert.notStrictEqual(r.body.ok, true);
  assert.ok(r.statusCode === 429 || r.statusCode === 503, String(r.statusCode));
  assert.ok(!F.db.users.has('dis@x.mn'));
  assert.strictEqual(F.sms.calls.length, n);
  F.reset(); process.env.SMS_DAY_MAX = '1';
  r = await A(regBody('full1@x.mn', { phone: PH2 }));
  assert.strictEqual(r.statusCode, 200);
  r = await A(regBody('full2@x.mn', { phone: PH4 }));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_FULL']);
  assert.match(r.body.error, /урилгын холбоос/);
  assert.ok(!F.db.users.has('full2@x.mn'));
});

test('register: урилгатай → утас заавал биш, SMS 0, шууд нэвтэрнэ (хэвээр)', async () => {
  F.db.invites.set('INV1', { token: 'INV1', grade: '9', school: null, max_uses: 5, uses: 0, expires_at: null });
  const n = F.sms.calls.length;
  const r = await A(regBody('inv@x.mn', { phone: undefined, inviteToken: 'INV1' }));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.invited, true);
  assert.ok(r.body.user.token);
  assert.strictEqual(F.db.users.get('inv@x.mn').verified, true);
  assert.strictEqual(F.sms.calls.length, n);
});

test('resend: хүчинтэй код байвал ТЭР кодыг дахин илгээнэ (оролдлого хэвээр, хугацаа сунгана); утасгүй / олдоогүй → хуурамч ижил хэлбэр (SMS 0); баталгаажсан → alreadyVerified', async () => {
  await seedUser('rs@x.mn', { verified: false, verify_code: '123123', verify_expiry: new Date(Date.now() + 600e3), code_attempts: 2 });
  const n = F.sms.calls.length;
  let r = await A({ action: 'resend', email: 'rs@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **33' });
  const u = F.db.users.get('rs@x.mn');
  assert.strictEqual(F.lastCode(), '123123', 'хүчинтэй кодыг дахин илгээнэ');
  assert.strictEqual(u.verify_code, '123123');
  assert.strictEqual(u.code_attempts, 2, 'оролдлого тэглэгдэхгүй');
  assert.ok(new Date(u.verify_expiry).getTime() > Date.now() + 9 * 60e3, 'хугацаа сунгагдсан');
  await seedUser('rsnp@x.mn', { verified: false, phone: null });
  r = await A({ action: 'resend', email: 'rsnp@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), KEYS);
  assert.match(r.body.masked, /^\*\*\*\* \*\*\d\d$/);
  r = await A({ action: 'resend', email: 'reg1@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, alreadyVerified: true });
  r = await A({ action: 'resend', email: 'nobody@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), KEYS);
  assert.strictEqual(F.sms.calls.length, n + 1);
  assert.ok(!F.mail.some(m => m.fn === 'sendVerifyEmail'));
});

test('forgot (sendResetCode): утастай данс → textbee, код DB-д, {ok,sms,masked}', async () => {
  await seedUser('fg@x.mn', { phone: PH4 });
  const n = F.sms.calls.length, m0 = F.mail.length;
  const r = await A({ action: 'sendResetCode', email: 'fg@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), KEYS);
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **66' });
  assert.strictEqual(F.sms.calls.length, n + 1);
  assert.deepStrictEqual(F.sms.calls[n].body.recipients, ['+97699887766']);
  assert.match(F.sms.calls[n].body.message, /нууц үг сэргээх код: \d{6}/);
  const u = F.db.users.get('fg@x.mn');
  assert.strictEqual(u.verify_code, F.lastCode());
  assert.strictEqual(u.code_attempts, 0);
  const log = F.db.smsLog[F.db.smsLog.length - 1];
  assert.deepStrictEqual([log.purpose, log.kind, log.status], ['reset', 'acct', 'sent']);
  assert.strictEqual(F.mail.length, m0);
});

test('forgot: бүртгэлгүй / баталгаажаагүй имэйл → бодиттой ижил хэлбэр, fetch 0, padTo хүлээнэ', async () => {
  const n = F.sms.calls.length;
  let r = await A({ action: 'forgot', email: 'ghost@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(Object.keys(r.body).sort(), KEYS);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.sms, true);
  assert.match(r.body.masked, /^\*\*\*\* \*\*\d\d$/);
  const first = r.body.masked;
  F.clearCooldowns();
  r = await A({ action: 'sendResetCode', email: 'ghost@x.mn' });
  assert.strictEqual(r.body.masked, first, 'хуурамч маск тогтвортой');
  await seedUser('unv@x.mn', { verified: false, phone: PH2 });
  r = await A({ action: 'sendResetCode', email: 'unv@x.mn' });
  assert.deepStrictEqual(Object.keys(r.body).sort(), KEYS);
  assert.strictEqual(F.db.users.get('unv@x.mn').verify_code, null);
  process.env.SMS_PAD_MS = '150';
  const t = Date.now();
  F.clearCooldowns();
  r = await A({ action: 'forgot', email: 'ghost2@x.mn' });
  assert.ok(Date.now() - t >= 140, 'padTo');
  assert.strictEqual(F.sms.calls.length, n);
});

test('forgot: утасгүй / буруу / суурин утастай данс → бүртгэлгүйтэй ижил хуурамч хариу (enumeration), SMS 0', async () => {
  await seedUser('fgnp@x.mn', { phone: null });
  await seedUser('fgbad@x.mn', { phone: '12345' });
  await seedUser('fgland@x.mn', { phone: '70112233' });
  const n = F.sms.calls.length;
  for (const e of ['fgnp@x.mn', 'fgbad@x.mn', 'fgland@x.mn']) {
    const r = await A({ action: 'sendResetCode', email: e });
    assert.strictEqual(r.statusCode, 200, e);
    assert.deepStrictEqual(Object.keys(r.body).sort(), KEYS, e);
    assert.strictEqual(r.body.masked, require(path.join(F.API, '_sms.js')).fakeMask(e), e);
    assert.strictEqual(F.db.users.get(e).verify_code, null);
  }
  assert.strictEqual(F.sms.calls.length, n);
});

test('forgot: textbee 401/500/429/network → 503 ok:true БИШ, код хүчингүй; abort/hang → SMS_UNCERTAIN codeStep, код үлдэнэ', async () => {
  await seedUser('fgf@x.mn', { phone: PH3 });
  for (const mode of ['auth', 'down', 'quota', 'network']) {
    F.reset(); F.sms.mode = mode;
    const n = F.sms.calls.length;
    const r = await A({ action: 'sendResetCode', email: 'fgf@x.mn' });
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [503, false, 'SMS_UNAVAILABLE'], mode);
    assert.strictEqual(F.sms.calls.length, n + 1, mode);
    assert.strictEqual(F.db.users.get('fgf@x.mn').verify_code, null, mode + ': код drop');
  }
  for (const mode of ['abort', 'hang']) {
    F.reset(); F.sms.mode = mode;
    const r = await A({ action: 'sendResetCode', email: 'fgf@x.mn' });
    assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code, r.body.codeStep], [503, false, 'SMS_UNCERTAIN', true], mode);
    assert.strictEqual(F.db.users.get('fgf@x.mn').verify_code, F.lastCode(), mode);
  }
});

test('forgot: дугаарын cooldown (ижил утастай өөр имэйл) → хуурамчтай ижил хэлбэр, 2 дахь SMS 0', async () => {
  await seedUser('sh1@x.mn', { phone: PH2 });
  await seedUser('sh2@x.mn', { phone: PH2 });
  let r = await A({ action: 'sendResetCode', email: 'sh1@x.mn' });
  assert.strictEqual(r.body.ok, true);
  const n = F.sms.calls.length;
  r = await A({ action: 'sendResetCode', email: 'sh2@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **55' });
  assert.strictEqual(F.sms.calls.length, n);
  assert.strictEqual(F.db.users.get('sh2@x.mn').verify_code, null);
});

test('forgot → verifyResetCode → reset → шинэ нууц үгээр нэвтэрнэ; 5 буруу оролдлогын түгжээ хэвээр', async () => {
  await seedUser('rp@x.mn', { phone: PH3 });
  let r = await A({ action: 'sendResetCode', email: 'rp@x.mn' });
  assert.strictEqual(r.body.ok, true);
  const code = F.lastCode(), wrong = code === '111111' ? '222222' : '111111';
  r = await A({ action: 'verifyResetCode', email: 'rp@x.mn', code: wrong });
  assert.deepStrictEqual([r.statusCode, r.body.error], [400, BAD]);
  r = await A({ action: 'verifyResetCode', email: 'rp@x.mn', code: code });
  assert.deepStrictEqual(r.body, { ok: true });
  assert.ok(F.db.smsLog.some(x => x.purpose === 'reset' && x.verified_at), 'markVerified');
  r = await A({ action: 'reset', email: 'rp@x.mn', code: wrong, newPass: 'newpass9' });
  assert.strictEqual(r.statusCode, 400);
  r = await A({ action: 'reset', email: 'rp@x.mn', code: code, newPass: 'newpass9' });
  assert.deepStrictEqual(r.body, { ok: true });
  assert.strictEqual(F.db.users.get('rp@x.mn').verify_code, null);
  r = await A({ action: 'login', email: 'rp@x.mn', pass: 'newpass9' });
  assert.strictEqual(r.body.ok, true);
  r = await A({ action: 'login', email: 'rp@x.mn', pass: 'oldpass1' });
  assert.strictEqual(r.statusCode, 401);

  F.clearCooldowns();
  r = await A({ action: 'forgot', email: 'rp@x.mn' });
  const code2 = F.lastCode(), wrong2 = code2 === '111111' ? '222222' : '111111';
  for (let i = 0; i < 5; i++) {
    r = await A({ action: 'verifyResetCode', email: 'rp@x.mn', code: wrong2 });
    assert.deepStrictEqual([r.statusCode, r.body.error], [400, BAD], 'i=' + i);
  }
  r = await A({ action: 'resetWithCode', email: 'rp@x.mn', code: code2, newPass: 'another9' });
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(r.body.locked, true);
});

test('forgot: имэйлгүй → 400 (ok:true биш)', async () => {
  const r = await A({ action: 'forgot' });
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(r.body.ok, false);
});

test('S2/S1: бүтэн дугаар, код, API түлхүүр лог/Telegram/sms_log/хариунд алга; бодит сүлжээ 0; тодорхойгүй SQL 0; имэйл 0', () => {
  assert.deepStrictEqual(F.leakCheck([PH, PH2, PH3, PH4]), []);
  assert.deepStrictEqual(F.sms.other, []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.strictEqual(F.mail.length, 0);
  assert.ok(F.responses.every(b => !(b && b.ok === true && b.code)), 'ok:true + алдааны код хамт байхгүй');
});
