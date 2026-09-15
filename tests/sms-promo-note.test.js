// Бүртгэлийн SMS-ийн промо сануулга (api/_sms.js promoNote): cyber-math.com/promo хуудсанд идэвхтэй код байвал л нэмнэ.
// Ажиллуулах: node --test tests/sms-promo-note.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const auth = require(path.join(F.API, 'auth.js'));
const ws = require(path.join(F.API, 'worksheets.js'));
const sms = require(path.join(F.API, '_sms.js'));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const A = (body, o) => F.call(auth, body, o);
const W = (body, o) => F.call(ws, body, o);
const PHONES = ['99112233', '88114455', '95001122', '99887766', '88001122', '99334455'];
const BURST = [0, 1, 2, 3, 4, 5, 6].map(i => '8877000' + i);
const DOWN = '88660002', ZERO = '88990001';
const URL_RE = /cyber-math\.com\/promo/;

beforeEach(() => F.reset());

function regBody(email, phone) {
  return { action: 'register', email: email, pass: 'secret1', firstName: 'Бат', lastName: 'Болд', grade: '9', role: 'student', phone: phone };
}
function promo(o) { return Object.assign({ code: 'P' + F.db.promos.length, active: true, personal: false, expires_at: null, max_uses: null, used_count: 0 }, o || {}); }
function lastMsg() { return String(F.sms.calls[F.sms.calls.length - 1].body.message); }

test('идэвхтэй код бий → game бүртгэлийн SMS: код + сануулга, ≤134 тэмдэгт (UCS-2 2 хэсэг), код эхний мөрөнд', async () => {
  F.db.promos.push(promo());
  const n = F.sms.calls.length;
  const r = await A(regBody('pr1@x.mn', PHONES[0]));
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, needVerify: true, email: 'pr1@x.mn', sms: true, masked: '**** **33' });
  assert.strictEqual(F.sms.calls.length, n + 1);
  const msg = lastMsg();
  assert.strictEqual(msg, sms.codeText('verify', F.lastCode()) + sms.PROMO_NOTE);
  assert.match(msg.split('\n')[0], /^CyberMath бүртгэлийн код: \d{6}\. /);
  assert.match(msg, URL_RE);
  assert.ok(/\bcyber-math\.com\/promo /.test(msg), 'URL-ийн ард зай (линк "-д" гэх мэт үсэг залгуулахгүй)');
  assert.ok([...msg].length <= 134, 'урт ' + [...msg].length);
  assert.strictEqual(F.db.users.get('pr1@x.mn').verify_code, F.lastCode());
});

test('SQL: promoNote-ийн WHERE нь /promo хуудасны ws_promo_public (api/qpay.js)-ийн WHERE-тэй үг үсгээр ижил', () => {
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const qp = fs.readFileSync(path.join(F.API, 'qpay.js'), 'utf8');
  const i = qp.indexOf("action === 'ws_promo_public'");
  assert.ok(i > 0, 'ws_promo_public олдсонгүй');
  const mq = qp.slice(i, i + 1500).match(/FROM ws_promos\s+WHERE([\s\S]*?)ORDER BY/);
  const ms = fs.readFileSync(path.join(F.API, '_sms.js'), 'utf8').match(/SELECT 1 FROM ws_promos WHERE([\s\S]*?)LIMIT 1/);
  assert.ok(mq && ms);
  assert.strictEqual(norm(ms[1]), norm(mq[1]));
});

test('идэвхтэй код байхгүй / хугацаа дууссан / дүүрсэн / хувийн / идэвхгүй → сануулгагүй (fake шүүлтүүр)', async () => {
  const cases = [
    [],
    [promo({ expires_at: new Date(Date.now() - 1000) })],
    [promo({ max_uses: 3, used_count: 3 })],
    [promo({ personal: true })],
    [promo({ active: false })],
  ];
  for (let i = 0; i < cases.length; i++) {
    F.reset();
    F.db.promos = cases[i];
    const r = await A(regBody('none' + i + '@x.mn', PHONES[i]));
    assert.strictEqual(r.statusCode, 200, 'case ' + i);
    const msg = lastMsg();
    assert.strictEqual(msg, sms.codeText('verify', F.lastCode()), 'case ' + i);
    assert.ok(!URL_RE.test(msg), 'case ' + i);
  }
  // хугацаагүй + хязгааргүй + олон мөрөөс нэг нь идэвхтэй → сануулгатай
  F.reset();
  F.db.promos = [promo({ active: false }), promo({ expires_at: new Date(Date.now() + 3600e3), max_uses: 10, used_count: 9 })];
  await A(regBody('mix@x.mn', PHONES[5]));
  assert.match(lastMsg(), URL_RE);
});

test('resend (game) ба ws_register / ws_resend → сануулгатай; нууц үг сэргээх (sendResetCode, ws_forgot) → ХЭЗЭЭ Ч үгүй', async () => {
  F.db.promos.push(promo());
  // game resend
  await A(regBody('rs@x.mn', PHONES[0]));
  F.clearCooldowns();
  let r = await A({ action: 'resend', email: 'rs@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()) + sms.PROMO_NOTE);
  // ws_register + ws_resend
  r = await W({ action: 'ws_register', email: 'w1@x.mn', pass: 'secret1', name: 'A', phone: PHONES[1] });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()) + sms.PROMO_NOTE);
  F.clearCooldowns();
  r = await W({ action: 'ws_resend', email: 'w1@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()) + sms.PROMO_NOTE);
  // game reset
  F.db.users.set('old@x.mn', {
    id: F.db.nextId++, email: 'old@x.mn', pass: await bcrypt.hash('oldpass1', 4), first_name: 'A', last_name: 'B', grade: '9', plan: 'free',
    xp: 0, gems: 340, hearts: 5, streak: 0, avatar: 'default', verified: true, verify_code: null, verify_expiry: null, phone: PHONES[2], role: 'student',
    code_attempts: 0, phone_verified_at: new Date(), email_unverified: false, token_version: 0,
  });
  const n1 = F.sms.calls.length;
  r = await A({ action: 'sendResetCode', email: 'old@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.sms.calls.length, n1 + 1);
  assert.strictEqual(lastMsg(), sms.codeText('reset', F.lastCode()));
  // ws reset
  F.db.ws.set('wold@x.mn', { email: 'wold@x.mn', pass_hash: await bcrypt.hash('oldpass1', 4), verified: true, code: null, code_exp: null, name: 'N', phone: PHONES[3], code_attempts: 0 });
  const n2 = F.sms.calls.length;
  r = await W({ action: 'ws_forgot', email: 'wold@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.sms.calls.length, n2 + 1);
  assert.strictEqual(lastMsg(), sms.codeText('reset', F.lastCode()));
});

test('Android хэсгийн нөөц: 30 минутад сануулга ≤ SMS_PARTS_30MIN_MAX(30) − SMS_30MIN_MAX(25) = 5; амжилтгүй илгээлт нөөцөө буцаана', async () => {
  F.db.promos.push(promo());
  const withNote = [];
  for (let i = 0; i < BURST.length; i++) {
    if (i === 2) {
      F.sms.mode = 'down';
      const bad = await A(regBody('down@x.mn', DOWN), { ip: '198.51.100.99' });
      assert.strictEqual(bad.statusCode, 503);
      assert.match(lastMsg(), URL_RE, 'сануулгатай оролдлого');
      F.sms.mode = 'ok';
    }
    const r = await A(regBody('b' + i + '@x.mn', BURST[i]), { ip: '198.51.100.' + (10 + i) });
    assert.strictEqual(r.statusCode, 200, 'i=' + i);
    withNote.push(URL_RE.test(lastMsg()));
    assert.strictEqual(lastMsg().indexOf(sms.codeText('verify', F.lastCode())), 0);
  }
  assert.deepStrictEqual(withNote, [true, true, true, true, true, false, false]);

  F.reset();
  F.db.promos.push(promo());
  process.env.SMS_PARTS_30MIN_MAX = '25'; // = SMS_30MIN_MAX → нөөц 0
  try {
    const r = await A(regBody('zero@x.mn', ZERO));
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()));
  } finally { delete process.env.SMS_PARTS_30MIN_MAX; }
});

test('промо асуулт алдаа (42P01) → SMS сануулгагүй хэвийн, ok:true; алдааг 60с кэшлэнэ; лог-д код/дугаар алга', async () => {
  F.db.promos.push(promo());
  F.db.promoMode = 'fail';
  const r = await A(regBody('pf@x.mn', PHONES[0]));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()));
  const q0 = F.db.promoQueries;
  await A(regBody('pf2@x.mn', PHONES[1]));
  assert.strictEqual(F.db.promoQueries, q0, 'алдааны дараа 60с дахин асуухгүй');
  assert.deepStrictEqual(F.leakCheck(PHONES), []);
});

test('промо асуулт гацсан → ~1.5с-ийн дараа сануулгагүй SMS; "байхгүй" 60с кэшлэгдэж дараагийн бүртгэл хүлээхгүй', async () => {
  F.db.promos.push(promo());
  F.db.promoMode = 'hang';
  let t0 = Date.now();
  const r = await A(regBody('ph@x.mn', PHONES[0]));
  const ms = Date.now() - t0;
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()));
  assert.ok(ms >= 1400 && ms < 3000, 'хугацаа ' + ms);
  const q0 = F.db.promoQueries;
  t0 = Date.now();
  await A(regBody('ph2@x.mn', PHONES[1]));
  assert.ok(Date.now() - t0 < 1000, 'кэштэй тул хүлээхгүй');
  assert.strictEqual(F.db.promoQueries, q0);
  assert.ok(!URL_RE.test(lastMsg()));
  F.db.promoMode = null; sms.promoCacheReset();
  await A(regBody('ph3@x.mn', PHONES[2]));
  assert.strictEqual(F.db.promoQueries, q0 + 1);
  assert.match(lastMsg(), URL_RE);
});

test('кэш 60с: дараалсан бүртгэлд асуулт 1 удаа; SMS_PROMO_NOTE=0 → асуулт 0, сануулгагүй', async () => {
  F.db.promos.push(promo());
  await A(regBody('c1@x.mn', PHONES[0]));
  await A(regBody('c2@x.mn', PHONES[1]));
  await W({ action: 'ws_register', email: 'c3@x.mn', pass: 'secret1', name: 'A', phone: PHONES[2] });
  assert.strictEqual(F.db.promoQueries, 1);
  assert.strictEqual(F.sms.calls.slice(-3).filter(c => URL_RE.test(c.body.message)).length, 3);

  F.reset();
  F.db.promos.push(promo());
  process.env.SMS_PROMO_NOTE = '0';
  await A(regBody('off@x.mn', PHONES[3]));
  assert.strictEqual(F.db.promoQueries, 0);
  assert.strictEqual(lastMsg(), sms.codeText('verify', F.lastCode()));
});

test('дугаарын cooldown / SMS_DISABLED → промо асуулт 0, SMS 0 (квотын өмнө DB ачаалахгүй)', async () => {
  F.db.promos.push(promo());
  await A(regBody('cd1@x.mn', PHONES[0]));
  const q0 = F.db.promoQueries, n = F.sms.calls.length;
  sms.promoCacheReset();
  const r = await A(regBody('cd2@x.mn', PHONES[0])); // ижил дугаар 60с дотор
  assert.strictEqual(r.body.ok, false);
  assert.strictEqual(F.sms.calls.length, n);
  assert.strictEqual(F.db.promoQueries, q0);
  process.env.SMS_DISABLED = '1';
  const r2 = await A(regBody('dis@x.mn', PHONES[1]));
  assert.strictEqual(r2.body.ok, false);
  assert.strictEqual(F.sms.calls.length, n);
  assert.strictEqual(F.db.promoQueries, q0);
});

test('S2 / тодорхойгүй SQL: бүтэн дугаар, код, түлхүүр лог/Telegram/sms_log/хариунд алга; бодит сүлжээ 0', () => {
  assert.deepStrictEqual(F.leakCheck(PHONES.concat(BURST, [DOWN, ZERO])), []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.sms.other, []);
});
