// Дугаар солих — нууц үг сэргээх «Дугаараа сольсон уу?» (api/_phonechg.js; эзэмшигч 2026-11-16: «******15 гэх мэтээр таарвал
// шинэ дугаараа хийгээд баталгаажуулах мсж илгээдэг болго»): сэжүүр (сүүлийн 2 орон) → хуучин дугаар бүтэн таарвал шинэ
// дугаараас 144773 руу MO код → баталгаажмагц утас солигдож, нэг удаагийн кодоор шинэ нууц үг. Тоглоомын төв ба Дасгалын төв.
// Ажиллуулах: node --test tests/phone-change.test.js   (бодит DB/verify.mn 0 — tests/_smsfake.js + доорх stub)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const VM_KEY = 'vm-fake-key-phchg';
process.env.VERIFYMN_API_KEY = VM_KEY;
process.env.VERIFYMN_ENABLED = '1';
delete process.env.VERIFYMN_DISABLED; delete process.env.VERIFYMN_BASE; delete process.env.VERIFYMN_CALLBACK_URL;

// ── verify.mn stub (tests/otp-mo-only.test.js-тэй ижил) ──
const VM = { sessions: new Map(), posts: 0 };
const baseFetch = globalThis.fetch;
globalThis.fetch = async function (url, opts) {
  const u = String(url);
  if (!u.startsWith('https://api.verify.mn/sessions')) return baseFetch(url, opts);
  const resp = (st, o) => ({ status: st, text: async () => JSON.stringify(o) });
  if ((opts.method || 'GET') === 'POST') {
    VM.posts++;
    const b = JSON.parse(opts.body);
    const id = 'sess-' + VM.posts + '-9f8e7d';
    VM.sessions.set(id, { phone: b.phone, text: b.text, status: 'PENDING' });
    return resp(201, { sessionId: id, shortcode: '144773', smsUri: 'sms:144773?body=' + b.text, expiresAt: new Date(Date.now() + 300000).toISOString() });
  }
  const s = VM.sessions.get(decodeURIComponent(u.split('/').pop()));
  return s ? resp(200, { sessionStatus: s.status }) : resp(404, {});
};
function userSent(moText) { for (const s of VM.sessions.values()) if (s.text === moText) s.status = 'VERIFIED'; }
function lastSessionPhone() { return Array.from(VM.sessions.values()).pop().phone; }

const auth = require(path.join(F.API, 'auth.js'));
const ws = require(path.join(F.API, 'worksheets.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const A = (body, o) => F.call(auth, body, o);
const W = (body, o) => F.call(ws, body, o);
const OLD = '99112215', NEW = '88114455';

beforeEach(() => { F.reset(); VM.sessions.clear(); VM.posts = 0; });

async function gameUser(email, extra) {
  F.db.users.set(email, Object.assign({ id: F.db.nextId++, email: email, pass: await bcrypt.hash('oldpass1', 4), first_name: 'А', last_name: 'Б', grade: '9',
    plan: 'free', verified: true, verify_code: null, verify_expiry: null, phone: OLD, phone_verified_at: new Date(), role: 'student', code_attempts: 0, token_version: 0 }, extra || {}));
}
async function wsUser(email, extra) {
  F.db.ws.set(email, Object.assign({ email: email, pass_hash: await bcrypt.hash('oldpass1', 4), verified: true, code: null, code_exp: null, name: 'А',
    phone: OLD, phone_verified_at: new Date(), code_attempts: 0 }, extra || {}));
}
const noHash = b => assert.ok(JSON.stringify(b).indexOf('phone_hash') < 0 && JSON.stringify(b).indexOf(NEW) < 0, 'phone_hash / бүтэн шинэ дугаар клиент рүү гарахгүй');

test('тоглоом: сэжүүр — бүртгэлтэй утасны сүүлийн 2 орон; данс олдоогүй ч ижил хэлбэр (хуурамч)', async () => {
  await gameUser('h1@x.mn');
  const r = await A({ action: 'phoneHint', email: 'H1@x.mn' });
  assert.deepStrictEqual(r.body, { ok: true, masked: '**** **15' });
  const f = await A({ action: 'phoneHint', email: 'nobody@x.mn' });
  assert.strictEqual(f.body.ok, true);
  assert.match(f.body.masked, /^\*{4} \*{2}\d{2}$/);
});

test('тоглоом: хуучин дугаар таарвал шинэ дугаараас MO → утас солигдож, нэг удаагийн кодоор шинэ нууц үг', async () => {
  await gameUser('p1@x.mn');
  const r = await A({ action: 'phoneChange', email: 'p1@x.mn', oldPhone: OLD, newPhone: NEW });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.mode, 'mo');
  assert.match(String(r.body.moText), /^\d{6}$/);
  assert.strictEqual(r.body.masked, '**** **55', 'шинэ дугаарын сүүлийн 2 орон');
  assert.ok(String(lastSessionPhone()).indexOf(NEW) >= 0, 'verify.mn session ШИНЭ дугаарт');
  assert.strictEqual(F.db.users.get('p1@x.mn').phone, OLD, 'баталгаажих хүртэл хуучин хэвээр');
  noHash(r.body);
  assert.strictEqual((await A({ action: 'moStatus', pollToken: r.body.pollToken })).body.status, 'PENDING');
  userSent(r.body.moText);
  const s = await A({ action: 'moStatus', pollToken: r.body.pollToken });
  assert.strictEqual(s.body.status, 'VERIFIED');
  assert.strictEqual(s.body.purpose, 'phone');
  assert.match(String(s.body.code), /^\d{6}$/);
  noHash(s.body);
  const u = F.db.users.get('p1@x.mn');
  assert.strictEqual(u.phone, NEW);
  assert.ok(u.phone_verified_at);
  assert.strictEqual(u.pending_phone, null);
  assert.strictEqual(u.token_version, 1, 'хуучин JWT хүчингүй');
  assert.ok(F.tg.some(t => /Утас солигдлоо \(Тоглоомын төв/.test(t) && t.indexOf(NEW) < 0), 'админд Telegram (дугаар масктай)');
  assert.strictEqual((await A({ action: 'verifyResetCode', email: 'p1@x.mn', code: s.body.code })).body.ok, true);
  const ok = await A({ action: 'reset', email: 'p1@x.mn', code: s.body.code, newPass: 'newpass9' });
  assert.strictEqual(ok.body.ok, true);
  assert.ok(await bcrypt.compare('newpass9', F.db.users.get('p1@x.mn').pass));
  assert.strictEqual((await A({ action: 'moStatus', pollToken: r.body.pollToken })).body.status, 'EXPIRED', 'M5: нэг л удаа');
});

test('тоглоом: буруу хуучин дугаар 3 удаа → 24 цаг түгжинэ (зөв дугаар ч); данс олдоогүй ч ижил хариу', async () => {
  await gameUser('p2@x.mn');
  const b1 = (await A({ action: 'phoneChange', email: 'p2@x.mn', oldPhone: '99110000', newPhone: NEW })).body;
  assert.strictEqual(b1.ok, false); assert.strictEqual(b1.left, 2); assert.match(b1.error, /Хуучин дугаар таарахгүй байна — 2 оролдлого үлдлээ/);
  assert.strictEqual((await A({ action: 'phoneChange', email: 'p2@x.mn', oldPhone: '99110001', newPhone: NEW })).body.left, 1);
  const r3 = await A({ action: 'phoneChange', email: 'p2@x.mn', oldPhone: '99110002', newPhone: NEW });
  assert.strictEqual(r3.statusCode, 429); assert.strictEqual(r3.body.locked, true);
  const r4 = await A({ action: 'phoneChange', email: 'p2@x.mn', oldPhone: OLD, newPhone: NEW });
  assert.strictEqual(r4.statusCode, 429, 'түгжээтэй үед зөв дугаар ч хүлээн авахгүй');
  assert.strictEqual(VM.posts, 0, 'MO session үүсэхгүй');
  const n = (await A({ action: 'phoneChange', email: 'ghost@x.mn', oldPhone: OLD, newPhone: NEW })).body;
  assert.deepStrictEqual([n.ok, n.left, n.error], [false, 2, b1.error], 'данс олдоогүй — буруу дугаартай ижил');
});

test('тоглоом: 8 оронгүй хуучин дугаар оролдлого тоолохгүй; шинэ = хуучин, шинэ дугаарт данс хэт олон', async () => {
  await gameUser('p3@x.mn');
  const short = await A({ action: 'phoneChange', email: 'p3@x.mn', oldPhone: '9911', newPhone: NEW });
  assert.strictEqual(short.statusCode, 400); assert.strictEqual(short.body.field, 'old'); assert.strictEqual(short.body.left, undefined);
  assert.strictEqual((await A({ action: 'phoneChange', email: 'p3@x.mn', oldPhone: OLD, newPhone: OLD })).body.field, 'new');
  for (let i = 0; i < 5; i++) await gameUser('full' + i + '@x.mn', { phone: NEW });
  const full = await A({ action: 'phoneChange', email: 'p3@x.mn', oldPhone: OLD, newPhone: NEW });
  assert.strictEqual(full.body.code, 'PHONE_TOO_MANY');
  assert.strictEqual(full.body.field, 'new');
  assert.strictEqual(VM.posts, 0);
});

test('тоглоом: 30 минутаас хуучирсан эсвэл дараагийн хүсэлтээр солигдсон хүлээгдэж буй дугаар бичигдэхгүй', async () => {
  await gameUser('p4@x.mn');
  const r1 = await A({ action: 'phoneChange', email: 'p4@x.mn', oldPhone: OLD, newPhone: '94113366' });   // NEW-д өмнөх тестийн 5 данс бий
  const r2 = await A({ action: 'phoneChange', email: 'p4@x.mn', oldPhone: OLD, newPhone: '95112277' });
  assert.ok(r1.body.ok && r2.body.ok);
  userSent(r1.body.moText);
  assert.strictEqual((await A({ action: 'moStatus', pollToken: r1.body.pollToken })).body.status, 'EXPIRED', 'хүлээгдэж буй дугаар өөр (phone_hash таарахгүй)');
  assert.strictEqual(F.db.users.get('p4@x.mn').phone, OLD);
  F.db.users.get('p4@x.mn').pending_phone_at = new Date(Date.now() - 31 * 60000);
  userSent(r2.body.moText);
  assert.strictEqual((await A({ action: 'moStatus', pollToken: r2.body.pollToken })).body.status, 'EXPIRED', '30 минут');
  assert.strictEqual(F.db.users.get('p4@x.mn').phone, OLD);
});

test('Дасгалын төв: сэжүүр → ws_phoneChange → ws_moStatus (утас солигдоно, код) → ws_reset токен', async () => {
  await wsUser('w1@x.mn');
  assert.deepStrictEqual((await W({ action: 'ws_phoneHint', email: 'w1@x.mn' })).body, { ok: true, masked: '**** **15' });
  const r = await W({ action: 'ws_phoneChange', email: 'w1@x.mn', oldPhone: OLD, newPhone: NEW });
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.mode, 'mo');
  assert.strictEqual(r.body.masked, '**** **55');
  noHash(r.body);
  userSent(r.body.moText);
  const s = await W({ action: 'ws_moStatus', pollToken: r.body.pollToken });
  assert.strictEqual(s.body.status, 'VERIFIED');
  assert.strictEqual(s.body.purpose, 'phone');
  noHash(s.body);
  const row = F.db.ws.get('w1@x.mn');
  assert.strictEqual(row.phone, NEW);
  assert.strictEqual(row.pending_phone, null);
  assert.ok(F.tg.some(t => /Утас солигдлоо \(Дасгалын төв/.test(t)));
  const done = await W({ action: 'ws_reset', email: 'w1@x.mn', code: s.body.code, pass: 'newpass9' });
  assert.strictEqual(done.body.ok, true);
  assert.ok(done.body.token);
  assert.ok(await bcrypt.compare('newpass9', F.db.ws.get('w1@x.mn').pass_hash));
});

test('Дасгалын төв: буруу хуучин дугаар — үлдсэн оролдлого, 3 дахь нь түгжээ; эрхтэй данс Telegram-д тэмдэглэгдэнэ', async () => {
  await wsUser('w2@x.mn');
  const b = (await W({ action: 'ws_phoneChange', email: 'w2@x.mn', oldPhone: '99110000', newPhone: NEW })).body;
  assert.deepStrictEqual([b.ok, b.left, b.field], [false, 2, 'old']);
  await wsUser('w3@x.mn');
  F.entitle('ws_access', 'w3@x.mn');
  const r = await W({ action: 'ws_phoneChange', email: 'w3@x.mn', oldPhone: OLD, newPhone: NEW });
  userSent(r.body.moText);
  await W({ action: 'ws_moStatus', pollToken: r.body.pollToken });
  assert.ok(F.tg.some(t => /Дасгалын төв.*эрхтэй данс/.test(t)));
});

test('_phonechg.js: эможигүй, клиент рүү phone_hash гаргахгүй, SMS текст 70 тэмдэгтээс богино', () => {
  const fs = require('fs');
  const src = fs.readFileSync(path.join(F.API, '_phonechg.js'), 'utf8');
  assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.ok(require(path.join(F.API, '_sms.js')).codeText('phone', '123456').length <= 70);
  const authSrc = fs.readFileSync(path.join(F.API, 'auth.js'), 'utf8'), wsSrc = fs.readFileSync(path.join(F.API, 'worksheets.js'), 'utf8');
  assert.doesNotMatch(authSrc + wsSrc, /phone_hash: /, 'phone_hash-ийг хариунд оруулахгүй');
});
