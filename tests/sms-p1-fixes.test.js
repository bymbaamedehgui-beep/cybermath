// Шалгагчийн засварууд (тоглоом + WS): usablePhone, PHONE_TOO_MANY, админ утас (§5.2, §6.3), enumeration, дараалал.
// Ажиллуулах: node --test tests/sms-p1-fixes.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const auth = require(path.join(F.API, 'auth.js'));
const ws = require(path.join(F.API, 'worksheets.js'));
const sms = require(path.join(F.API, '_sms.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const A = (b, o) => F.call(auth, b, o);
const W = (b, o) => F.call(ws, b, o);
const ADMIN = { headers: { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) } };
const GK = ['masked', 'ok', 'sms'];
const PH = '99112233', PH2 = '88114455', PH3 = '95001122';

// Тест бүр цэвэр данстай (дугаарын данс-тоо тестүүд хооронд нөлөөлөхгүй)
beforeEach(() => { F.reset(); F.db.users.clear(); F.db.ws.clear(); F.db.invites.clear(); delete process.env.SMS_TRUST_LEGACY_PHONE; });

async function seedUser(email, o) {
  F.db.users.set(email, Object.assign({
    id: F.db.nextId++, email, pass: await bcrypt.hash('oldpass1', 4), first_name: 'A', last_name: 'B', grade: '9', plan: 'free',
    xp: 0, gems: 340, hearts: 5, streak: 0, avatar: 'default', verified: true, verify_code: null, verify_expiry: null, phone: PH, role: 'student', code_attempts: 0,
  }, o || {}));
}
async function seedWs(email, o) {
  F.db.ws.set(email, Object.assign({ email, pass_hash: await bcrypt.hash('oldpass1', 4), verified: true, code: null, code_exp: null, name: 'N', phone: PH3, code_attempts: 0 }, o || {}));
}
function reg(email, extra) { return Object.assign({ action: 'register', email, pass: 'secret1', firstName: 'a', lastName: 'b', grade: '9', role: 'student', phone: PH }, extra || {}); }

// ───────── тоглоом ─────────
test('forgot usablePhone: SMS-бүртгэл (email_unverified, утас батлаагүй) → хуурамч; SMS-verified → бодит; legacy + SMS_TRUST_LEGACY_PHONE=0 → хуурамч', async () => {
  await seedUser('smsunv@x.mn', { email_unverified: true, phone_verified_at: null, phone: PH2 });
  await seedUser('smsver@x.mn', { email_unverified: true, phone_verified_at: new Date(), phone: PH2 });
  await seedUser('legacy@x.mn', { phone: PH3 });
  const n = F.sms.calls.length;
  let r = await A({ action: 'forgot', email: 'smsunv@x.mn' });
  assert.deepStrictEqual([r.statusCode, Object.keys(r.body).sort(), r.body.masked], [200, GK, sms.fakeMask('smsunv@x.mn')]);
  assert.strictEqual(F.sms.calls.length, n);
  r = await A({ action: 'forgot', email: 'smsver@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **55' });
  assert.strictEqual(F.sms.calls.length, n + 1);
  process.env.SMS_TRUST_LEGACY_PHONE = '0';
  r = await A({ action: 'forgot', email: 'legacy@x.mn' });
  assert.strictEqual(r.body.masked, sms.fakeMask('legacy@x.mn'));
  assert.strictEqual(F.sms.calls.length, n + 1);
  delete process.env.SMS_TRUST_LEGACY_PHONE;
  F.clearCooldowns();
  r = await A({ action: 'forgot', email: 'legacy@x.mn' });
  assert.strictEqual(r.body.masked, '**** **22');
  assert.strictEqual(F.sms.calls.length, n + 2);
});

test('enumeration: бодит / бүртгэлгүй / утасгүй / дугаарын квот — 4 тохиолдолд HTTP ба түлхүүр ижил', async () => {
  await seedUser('real@x.mn', { phone: PH2 });
  await seedUser('nophone@x.mn', { phone: null });
  await seedUser('q1@x.mn', { phone: PH3 });
  await seedUser('q2@x.mn', { phone: PH3 });
  const out = [];
  for (const e of ['real@x.mn', 'ghost@x.mn', 'nophone@x.mn', 'q1@x.mn', 'q2@x.mn']) {
    const r = await A({ action: 'sendResetCode', email: e });
    out.push([r.statusCode, Object.keys(r.body).sort().join(','), r.body.ok]);
  }
  out.forEach(o => assert.deepStrictEqual(o, [200, GK.join(','), true]));
});

test('resend: SMS_DISABLED үед баталгаажсан хэрэглэгч → 200 alreadyVerified (production-той ижил, R5)', async () => {
  await seedUser('v@x.mn');
  process.env.SMS_DISABLED = '1';
  const r = await A({ action: 'resend', email: 'v@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body], [200, { ok: true, alreadyVerified: true }]);
  const r2 = await A({ action: 'resend', email: 'ghost@x.mn' });
  assert.deepStrictEqual([r2.statusCode, r2.body.code], [503, 'SMS_UNAVAILABLE']);
});

test('register: бүртгэлтэй имэйл + утасгүй → "И-мэйл бүртгэлтэй" (утасны шалгалтаас өмнө, R6)', async () => {
  await seedUser('ex@x.mn');
  const r = await A(reg('ex@x.mn', { phone: undefined }));
  assert.deepStrictEqual([r.statusCode, r.body.error], [400, 'И-мэйл бүртгэлтэй байна']);
});

test('register: нэг дугаарт 5 verified данс → 6 дахь 400 PHONE_TOO_MANY, SMS 0, мөр үүсэхгүй', async () => {
  for (let i = 0; i < 5; i++) await seedUser('m' + i + '@x.mn', { phone: PH2 });
  await seedUser('mu@x.mn', { phone: PH2, verified: false });
  const n = F.sms.calls.length;
  const r = await A(reg('m5@x.mn', { phone: '8811-4455' }));
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.code], [400, false, 'PHONE_TOO_MANY']);
  assert.ok(!F.db.users.has('m5@x.mn'));
  assert.strictEqual(F.sms.calls.length, n);
  process.env.SMS_MAX_ACCOUNTS_PER_PHONE = '6';
  const r2 = await A(reg('m5@x.mn', { phone: PH2 }));
  delete process.env.SMS_MAX_ACCOUNTS_PER_PHONE;
  assert.strictEqual(r2.body.ok, true);
});

test('verify олдоогүй → 400; verifyResetCode/reset баталгаажаагүй мөрөнд бүртгэлийн кодоор → 400, нууц үг солигдохгүй', async () => {
  let r = await A({ action: 'verify', email: 'nobody@x.mn', code: '123456' });
  assert.strictEqual(r.statusCode, 400);
  r = await A(reg('unv@x.mn', { phone: PH2 }));
  assert.strictEqual(r.body.ok, true);
  const code = F.lastCode(), pass0 = F.db.users.get('unv@x.mn').pass;
  r = await A({ action: 'verifyResetCode', email: 'unv@x.mn', code });
  assert.strictEqual(r.statusCode, 400);
  r = await A({ action: 'resetWithCode', email: 'unv@x.mn', code, newPass: 'otherpw1' });
  assert.strictEqual(r.statusCode, 400);
  r = await A({ action: 'resetWithCode', email: 'nobody@x.mn', code, newPass: 'otherpw1' });
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(F.db.users.get('unv@x.mn').pass, pass0);
  assert.strictEqual(F.db.users.get('unv@x.mn').verify_code, code, 'код оролдлогод зарцуулагдаагүй');
});

test('admin: кодгүй reset → token_version+1; adminUserPhone/adminSetPhone → утас батлагдаж forgot SMS явна; админгүй 401', async () => {
  await seedUser('ad@x.mn', { email_unverified: true, phone: null });
  let r = await A({ action: 'reset', email: 'ad@x.mn', newPass: 'adminpw1' }, ADMIN);
  assert.deepStrictEqual(r.body, { ok: true });
  assert.strictEqual(F.db.users.get('ad@x.mn').token_version, 1);
  r = await A({ action: 'adminSetPhone', email: 'ad@x.mn', phone: PH2 });
  assert.strictEqual(r.statusCode, 401);
  r = await A({ action: 'adminUserPhone', email: 'ad@x.mn' }, ADMIN);
  assert.deepStrictEqual([r.body.ok, r.body.phone, r.body.usable, r.body.email_unverified], [true, null, false, true]);
  r = await A({ action: 'adminSetPhone', email: 'ad@x.mn', phone: '70112233' }, ADMIN);
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'PHONE_INVALID']);
  r = await A({ action: 'adminSetPhone', email: 'ad@x.mn', phone: '+976 8811 4455' }, ADMIN);
  assert.deepStrictEqual(r.body, { ok: true, email: 'ad@x.mn', phone: PH2 });
  const u = F.db.users.get('ad@x.mn');
  assert.ok(u.phone_verified_at);
  assert.strictEqual(u.token_version, 2);
  assert.ok(F.tg.some(t => /Админ утас тохируулав/.test(t) && t.indexOf(PH2) < 0));
  r = await A({ action: 'forgot', email: 'ad@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **55' });
  r = await A({ action: 'adminSetPhone', email: 'ad@x.mn', phone: null }, ADMIN);
  assert.strictEqual(F.db.users.get('ad@x.mn').phone_verified_at, null);
  r = await A({ action: 'adminSetPhone', email: 'none@x.mn', phone: PH }, ADMIN);
  assert.strictEqual(r.statusCode, 404);
});

test('admin: smsPause → бүртгэл 503, smsResume → ажиллана; smsStatus тоолуур', async () => {
  let r = await A({ action: 'smsPause', minutes: 10 }, ADMIN);
  assert.strictEqual(r.body.ok, true);
  r = await A(reg('p1@x.mn'));
  assert.deepStrictEqual([r.statusCode, r.body.code], [503, 'SMS_UNAVAILABLE']);
  r = await A({ action: 'smsStatus' }, ADMIN);
  assert.ok(r.body.status.paused_until > 0);
  r = await A({ action: 'smsResume' }, ADMIN);
  F.clearCooldowns();
  r = await A(reg('p1@x.mn'));
  assert.strictEqual(r.body.ok, true);
  r = await A({ action: 'smsStatus' }, ADMIN);
  assert.deepStrictEqual([r.body.status.paused_until, r.body.status.day.sent, r.body.status.reg_day.sent], [null, 1, 1]);
  r = await A({ action: 'smsPause', minutes: 99999 }, ADMIN);
  assert.strictEqual(r.statusCode, 400);
  r = await A({ action: 'smsStatus' });
  assert.strictEqual(r.statusCode, 401);
});

// ───────── WS ─────────
test('R4: эрхтэй, ws_login-гүй имэйл → ws_register NEED_ADMIN → админ ws_admin_set_phone → ws_forgot SMS → ws_reset токен; дараа нь нууц үгээр нэвтэрнэ', async () => {
  F.entitle('ws_purchases', 'buyer@x.mn');
  let r = await W({ action: 'ws_register', email: 'buyer@x.mn', pass: 'secret1', name: 'B', phone: PH });
  assert.deepStrictEqual([r.statusCode, r.body.code], [409, 'NEED_ADMIN']);
  r = await W({ action: 'ws_admin_set_phone', email: 'buyer@x.mn', phone: PH });
  assert.strictEqual(r.statusCode, 401, 'админгүй');
  r = await W({ action: 'ws_admin_phone', email: 'buyer@x.mn' }, ADMIN);
  assert.deepStrictEqual([r.body.exists, r.body.entitled], [false, true]);
  r = await W({ action: 'ws_admin_set_phone', email: 'buyer@x.mn', phone: '9911 2233' }, ADMIN);
  assert.deepStrictEqual([r.body.ok, r.body.phone, r.body.verified], [true, PH, false]);
  const row = F.db.ws.get('buyer@x.mn');
  assert.deepStrictEqual([row.pass_hash, row.verified, !!row.phone_verified_at], ['!', false, true]);
  r = await W({ action: 'ws_admin_phone', email: 'buyer@x.mn' }, ADMIN);
  assert.deepStrictEqual([r.body.exists, r.body.prepared, r.body.usable], [true, true, true]);

  // бэлтгэсэн данс: нууц үгээр нэвтрэхгүй ('!' bcrypt таарахгүй), бүртгэл → NEED_LOGIN, resend → хуурамч
  r = await W({ action: 'ws_login', email: 'buyer@x.mn', pass: '!' });
  assert.strictEqual(r.statusCode, 401);
  r = await W({ action: 'ws_register', email: 'buyer@x.mn', pass: 'attack99', name: 'X', phone: PH2 });
  assert.deepStrictEqual([r.statusCode, r.body.code, r.body.prepared], [409, 'NEED_LOGIN', true]);
  assert.match(r.body.error, /Нууц үг сэргээх/);
  const n = F.sms.calls.length;
  r = await W({ action: 'ws_resend', email: 'buyer@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.sms.calls.length, n, 'resend SMS 0');
  assert.strictEqual(F.db.ws.get('buyer@x.mn').phone, PH);

  F.clearCooldowns();
  r = await W({ action: 'ws_forgot', email: 'buyer@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, sms: true, masked: '**** **33' });
  assert.deepStrictEqual(F.sms.calls.at(-1).body.recipients, ['+97699112233']);
  r = await W({ action: 'ws_reset', email: 'buyer@x.mn', code: F.lastCode(), pass: 'buyerpw1' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.ok(r.body.token);
  assert.strictEqual(F.db.ws.get('buyer@x.mn').verified, true);
  assert.ok(F.tg.some(t => /WS нууц үг SMS-ээр сэргээгдлээ/.test(t)));
  r = await W({ action: 'ws_login', email: 'buyer@x.mn', pass: 'buyerpw1' });
  assert.ok(r.body.token);
});

test('R10: verified эрхтэй утасгүй ws данс → ws_forgot хуурамч (SMS 0) → админ утас → ws_forgot SMS; утас арилгах', async () => {
  await seedWs('ent@x.mn', { phone: null });
  F.entitle('ws_grade_access', 'ent@x.mn');
  const n = F.sms.calls.length;
  let r = await W({ action: 'ws_forgot', email: 'ent@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.masked], [200, sms.fakeMask('ent@x.mn')]);
  assert.strictEqual(F.sms.calls.length, n);
  r = await W({ action: 'ws_admin_set_phone', email: 'ent@x.mn', phone: PH2 }, ADMIN);
  assert.deepStrictEqual([r.body.ok, r.body.verified], [true, true]);
  F.clearCooldowns();
  r = await W({ action: 'ws_forgot', email: 'ent@x.mn' });
  assert.strictEqual(r.body.masked, '**** **55');
  assert.strictEqual(F.sms.calls.length, n + 1);
  r = await W({ action: 'ws_admin_set_phone', email: 'ent@x.mn', phone: '' }, ADMIN);
  assert.deepStrictEqual([r.body.ok, r.body.phone], [true, null]);
  assert.strictEqual(F.db.ws.get('ent@x.mn').phone_verified_at, null);
});

test('ws_register: баталгаажсан ws данс нэг дугаарт 5 → PHONE_TOO_MANY; бүртгэлтэй имэйл утасгүй → existed (утасны шалгалтаас өмнө)', async () => {
  for (let i = 0; i < 5; i++) await seedWs('wm' + i + '@x.mn', { phone: PH2 });
  let r = await W({ action: 'ws_register', email: 'wm5@x.mn', pass: 'secret1', name: 'A', phone: PH2 });
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'PHONE_TOO_MANY']);
  r = await W({ action: 'ws_register', email: 'wm0@x.mn', pass: 'secret1', name: 'A', phone: '' });
  assert.deepStrictEqual([r.statusCode, r.body.existed], [400, true]);
});

test('ws_register pending (R8): сүүлийн SMS 10 минутаас бага үед өөр дугаартай дахин бүртгэл → pending мессеж, утас солигдохгүй, SMS 0', async () => {
  let r = await W({ action: 'ws_register', email: 'wp@x.mn', pass: 'secret1', name: 'A', phone: PH });
  assert.strictEqual(r.body.sms, true);
  F.clearCooldowns();
  const n = F.sms.calls.length;
  r = await W({ action: 'ws_register', email: 'wp@x.mn', pass: 'secret1', name: 'A', phone: PH2 });
  assert.deepStrictEqual([r.body.ok, r.body.needVerify, r.body.pending], [true, true, true]);
  assert.match(r.body.message, /10 минутын дараа/);
  assert.strictEqual(F.sms.calls.length, n);
  assert.strictEqual(F.db.ws.get('wp@x.mn').phone, PH);
});

test('ws_verify амжилттай → phone_verified_at; эрхтэй болсон ч дараагийн ws_forgot тэр утсанд очно', async () => {
  let r = await W({ action: 'ws_register', email: 'wv@x.mn', pass: 'secret1', name: 'A', phone: PH2 });
  r = await W({ action: 'ws_verify', email: 'wv@x.mn', pass: 'secret1', code: F.lastCode() });
  assert.ok(r.body.token);
  assert.ok(F.db.ws.get('wv@x.mn').phone_verified_at);
  F.entitle('ws_access', 'wv@x.mn');
  process.env.SMS_TRUST_LEGACY_PHONE = '0';
  F.clearCooldowns();
  r = await W({ action: 'ws_forgot', email: 'wv@x.mn' });
  assert.strictEqual(r.body.masked, '**** **55', 'SMS-verified утас legacy унтраалгаас хамаарахгүй');
});

test('S2: бүтэн дугаар, код, API түлхүүр лог/Telegram/sms_log-д алга (админ хариуг хасна); тодорхойгүй SQL 0; бодит сүлжээ 0', () => {
  const adminResp = F.responses.filter(b => b && (b.status || b.entitled !== undefined || b.usable !== undefined || (b.ok && b.phone !== undefined)));
  const saved = F.responses.splice(0);
  saved.forEach(b => { if (adminResp.indexOf(b) < 0) F.responses.push(b); });
  assert.deepStrictEqual(F.leakCheck([PH, PH2, PH3]), []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.sms.other, []);
});
