// Баталгаажуулалт ЗӨВХӨН verify.mn (MO) — 2026-11-09 эзэмшигчийн шийдвэр (textbee SMS код ирэхгүй байсан).
// verify.mn асаалттай үед: textbee руу ХЭЗЭЭ Ч хандахгүй (verify.mn унасан ч), «Дахин код авах» 10 минут хаагдахгүй,
// хуурамч (enumeration) хариу бодит MO хариутай ижил хэлбэртэй, орхисон бүртгэл 7 хоног хадгалагдаж нэвтрэхэд үргэлжилнэ.
// Ажиллуулах: node --test tests/otp-mo-only.test.js   (бодит DB/textbee/verify.mn 0 — tests/_smsfake.js + доорх stub)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const VM_KEY = 'vm-fake-key-51c0';
process.env.VERIFYMN_API_KEY = VM_KEY;
process.env.VERIFYMN_ENABLED = '1';
delete process.env.VERIFYMN_DISABLED; delete process.env.VERIFYMN_BASE; delete process.env.VERIFYMN_CALLBACK_URL;

// ── verify.mn stub: POST /sessions → session, GET /sessions/:id → төлөв ──
const VM = { mode: 'ok', sessions: new Map(), posts: 0 };
const baseFetch = globalThis.fetch;
globalThis.fetch = async function (url, opts) {
  const u = String(url);
  if (!u.startsWith('https://api.verify.mn/sessions')) return baseFetch(url, opts);
  const resp = (st, o) => ({ status: st, text: async () => JSON.stringify(o) });
  assert.strictEqual((opts.headers || {}).Authorization, 'Bearer ' + VM_KEY);
  if (VM.mode === 'down') return resp(503, { message: 'down' });
  if ((opts.method || 'GET') === 'POST') {
    VM.posts++;
    const b = JSON.parse(opts.body);
    const id = 'sess-' + VM.posts + '-0a1b2c3d';
    VM.sessions.set(id, { phone: b.phone, text: b.text, status: 'PENDING' });
    return resp(201, { sessionId: id, shortcode: '144773', smsUri: 'sms:144773?body=' + b.text, expiresAt: new Date(Date.now() + 300000).toISOString() });
  }
  const s = VM.sessions.get(decodeURIComponent(u.split('/').pop()));
  return s ? resp(200, { sessionStatus: s.status }) : resp(404, {});
};
// Хэрэглэгч 144773 руу кодоо илгээсэн мэт (verify.mn тухайн session-ийг VERIFIED болгоно)
function userSent(moText) { for (const s of VM.sessions.values()) if (s.text === moText) s.status = 'VERIFIED'; }

const auth = require(path.join(F.API, 'auth.js'));
const ws = require(path.join(F.API, 'worksheets.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const A = (body, o) => F.call(auth, body, o);
const W = (body, o) => F.call(ws, body, o);
const PH = '99112233', PH2 = '88114455';
const MO_KEYS = ['expiresAt', 'masked', 'mode', 'moText', 'ok', 'pollToken', 'shortcode', 'sms', 'smsUri'].sort();

beforeEach(() => { F.reset(); VM.mode = 'ok'; VM.sessions.clear(); VM.posts = 0; process.env.TEXTBEE_API_KEY = F.FAKE_KEY; });

function regBody(email, extra) {
  return Object.assign({ action: 'register', email: email, pass: 'secret1', firstName: 'Бат', lastName: 'Болд', grade: '9', role: 'student', phone: PH }, extra || {});
}
function wsReg(email, extra) { return Object.assign({ action: 'ws_register', email: email, pass: 'secret1', name: 'A', phone: PH }, extra || {}); }
function assertMo(b, msg) {
  assert.strictEqual(b.ok, true, msg);
  assert.strictEqual(b.mode, 'mo', msg);
  assert.match(String(b.moText), /^\d{6}$/, msg);
  assert.match(String(b.pollToken), /^[0-9a-f]{48}$/, msg);
  assert.strictEqual(b.shortcode, '144773', msg);
  assert.ok(!('sessionId' in b) && JSON.stringify(b).indexOf('sess-') < 0, 'sessionId клиент рүү гарахгүй (M4)');
}

test('тоглоом: бүртгэл → зөвхөн verify.mn, textbee 0, код DB-д бичигдэхгүй', async () => {
  const n = F.sms.calls.length;
  const r = await A(regBody('mo1@x.mn'));
  assert.strictEqual(r.statusCode, 200);
  assertMo(r.body);
  assert.strictEqual(r.body.needVerify, true);
  assert.strictEqual(F.sms.calls.length, n, 'textbee дуудагдахгүй');
  assert.strictEqual(VM.posts, 1);
  const u = F.db.users.get('mo1@x.mn');
  assert.strictEqual(u.verified, false);
  assert.strictEqual(u.verify_code, null, 'M1: MO код users.verify_code-д бичигдэхгүй');
});

test('тоглоом: verify.mn унавал textbee руу шилжихгүй — алдаа, мөр үлдэхгүй', async () => {
  VM.mode = 'down';
  const n = F.sms.calls.length;
  const r = await A(regBody('mo2@x.mn'));
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(r.body.code, 'SMS_UNAVAILABLE');
  assert.strictEqual(F.sms.calls.length, n, 'textbee дуудагдахгүй');
  assert.ok(!F.db.users.has('mo2@x.mn'));
});

test('тоглоом: 144773 руу илгээмэгц moStatus → VERIFIED + нэвтэрнэ (нэг л удаа)', async () => {
  const r = await A(regBody('mo3@x.mn'));
  const tok = r.body.pollToken;
  assert.strictEqual((await A({ action: 'moStatus', pollToken: tok })).body.status, 'PENDING');
  userSent(r.body.moText);
  const s = await A({ action: 'moStatus', pollToken: tok });
  assert.strictEqual(s.body.status, 'VERIFIED');
  assert.ok(s.body.user && s.body.user.token, 'токен');
  assert.strictEqual(F.db.users.get('mo3@x.mn').verified, true);
  assert.strictEqual((await A({ action: 'moStatus', pollToken: tok })).body.status, 'EXPIRED', 'M5: давтан ашиглагдахгүй');
});

test('«Дахин код авах»: 10 минутын cooldown-гүй, өдөрт 4-өөс олон удаа ч болно', async () => {
  await A(regBody('mo4@x.mn'));
  for (let i = 0; i < 6; i++) {
    const r = await A({ action: 'resend', email: 'mo4@x.mn' });
    assert.strictEqual(r.statusCode, 200, 'retry ' + i + ': ' + JSON.stringify(r.body));
    assertMo(r.body, 'retry ' + i);
    F.clearCooldowns(); // auth.js-ийн resend хязгаар (3/10 мин) нь энэ тестийн сэдэв биш
  }
  assert.strictEqual(F.sms.calls.length, 0);
});

test('хуурамч хариу (бүртгэлгүй имэйл) бодит MO хариутай ижил хэлбэртэй, verify.mn/textbee 0', async () => {
  await A(regBody('real@x.mn'));
  const real = await A({ action: 'resend', email: 'real@x.mn' });
  const posts = VM.posts;
  const fakeR = await A({ action: 'resend', email: 'nobody@x.mn' });
  const fakeF = await A({ action: 'sendResetCode', email: 'nobody2@x.mn' });
  assert.deepStrictEqual(Object.keys(real.body).sort(), MO_KEYS);
  assert.deepStrictEqual(Object.keys(fakeR.body).sort(), MO_KEYS);
  assert.deepStrictEqual(Object.keys(fakeF.body).sort(), MO_KEYS);
  assertMo(fakeR.body); assertMo(fakeF.body);
  assert.strictEqual(VM.posts, posts, 'хуурамчид verify.mn session үүсэхгүй');
  assert.strictEqual((await A({ action: 'moStatus', pollToken: fakeR.body.pollToken })).body.status, 'UNKNOWN');
  assert.strictEqual(F.sms.calls.length, 0);
});

test('нууц үг сэргээх: verify.mn-ээр баталгаажаад нэг удаагийн код → resetWithCode', async () => {
  F.db.users.set('acct@x.mn', { id: F.db.nextId++, email: 'acct@x.mn', pass: await bcrypt.hash('oldpass1', 4), first_name: 'A', last_name: 'B', grade: '9', plan: 'free',
    verified: true, verify_code: null, verify_expiry: null, phone: PH2, phone_verified_at: new Date(), role: 'student', code_attempts: 0 });
  const r = await A({ action: 'sendResetCode', email: 'acct@x.mn' });
  assertMo(r.body);
  userSent(r.body.moText);
  const s = await A({ action: 'moStatus', pollToken: r.body.pollToken });
  assert.strictEqual(s.body.status, 'VERIFIED');
  assert.match(String(s.body.code), /^\d{6}$/);
  const ok = await A({ action: 'resetWithCode', email: 'acct@x.mn', code: s.body.code, newPass: 'newpass9' });
  assert.strictEqual(ok.body.ok, true);
  assert.strictEqual(F.sms.calls.length, 0);
});

test('textbee түлхүүргүй (verify.mn асаалттай) ч бүртгэл ажиллана', async () => {
  delete process.env.TEXTBEE_API_KEY;
  const r = await A(regBody('nokey@x.mn'));
  assertMo(r.body);
});

test('орхисон бүртгэл 7 хоног хадгалагдана: нэвтрэхэд needVerify → resend MO; 7 хоногийн дараа цэвэрлэгдэнэ', async () => {
  await A(regBody('left@x.mn'));
  const u = F.db.users.get('left@x.mn');
  u.verify_expiry = new Date(Date.now() - 3600e3);              // 1 цагийн өмнө хугацаа нь дууссан
  F.clearCooldowns();
  await A(regBody('other@x.mn', { phone: PH2 }));                 // өөр хүний бүртгэл цэвэрлэгээ ажиллуулна
  assert.ok(F.db.users.has('left@x.mn'), '20 минутын дараа устгагдахгүй');
  const l = await A({ action: 'login', email: 'left@x.mn', pass: 'secret1' });
  assert.strictEqual(l.statusCode, 403);
  assert.strictEqual(l.body.needVerify, true);
  F.clearCooldowns();
  assertMo((await A({ action: 'resend', email: 'left@x.mn' })).body);
  u.verify_expiry = new Date(Date.now() - 8 * 86400e3);
  F.clearCooldowns();
  await A(regBody('third@x.mn', { phone: '95001122' }));
  assert.ok(!F.db.users.has('left@x.mn'), '7 хоногийн дараа цэвэрлэгдэнэ');
});

test('Дасгалын төв: ws_register → verify.mn, textbee 0; унавал textbee руу шилжихгүй', async () => {
  const r = await W(wsReg('w1@x.mn'));
  assert.strictEqual(r.statusCode, 200);
  assertMo(r.body);
  const row = F.db.ws.get('w1@x.mn');
  assert.strictEqual(row.verified, false);
  assert.strictEqual(row.code, null);
  VM.mode = 'down';
  const d = await W(wsReg('w2@x.mn'));
  assert.strictEqual(d.body.ok, false);
  assert.strictEqual(d.body.code, 'SMS_UNAVAILABLE');
  assert.strictEqual(F.sms.calls.length, 0);
});

test('Дасгалын төв: илгээмэгц ws_moStatus → ws_moVerify токен; ws_resend 10 минут хүлээлгэхгүй', async () => {
  const r = await W(wsReg('w3@x.mn'));
  const again = await W({ action: 'ws_resend', email: 'w3@x.mn' });
  assert.strictEqual(again.statusCode, 200, JSON.stringify(again.body));
  assertMo(again.body);
  userSent(again.body.moText);
  assert.strictEqual((await W({ action: 'ws_moStatus', pollToken: again.body.pollToken })).body.status, 'VERIFIED');
  const v = await W({ action: 'ws_moVerify', pollToken: again.body.pollToken, pass: 'secret1' });
  assert.ok(v.body.ok && v.body.token, JSON.stringify(v.body));
  assert.strictEqual(F.db.ws.get('w3@x.mn').verified, true);
  assert.ok(r.body.pollToken !== again.body.pollToken);
  assert.strictEqual(F.sms.calls.length, 0);
});

test('Дасгалын төв: хуурамч ws_resend / ws_forgot хариу MO хэлбэртэй', async () => {
  const a = await W({ action: 'ws_resend', email: 'ghost@x.mn' });
  const b = await W({ action: 'ws_forgot', email: 'ghost2@x.mn' });
  assertMo(a.body); assertMo(b.body);
  assert.strictEqual(a.body.needVerify, true);
  assert.strictEqual(VM.posts, 0);
  assert.strictEqual(F.sms.calls.length, 0);
});

test('S2: verify.mn түлхүүр, бүтэн дугаар лог/хариунд гарахгүй; танихгүй SQL 0', async () => {
  await A(regBody('leak@x.mn'));
  await W(wsReg('leakw@x.mn', { phone: PH2 }));
  const hay = F.logs.join('\n') + F.tg.join('\n') + JSON.stringify(F.responses.filter(b => !(b && b.user)));
  assert.ok(hay.indexOf(VM_KEY) < 0, 'түлхүүр');
  assert.ok(hay.indexOf(PH) < 0 && hay.indexOf(PH2) < 0, 'бүтэн дугаар');
  assert.deepStrictEqual(F.db.unknown, []);
});
