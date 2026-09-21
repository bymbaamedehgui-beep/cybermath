// SMS дүрэм (textbee Pro, 2026-09-21): нийт өдөр/30 минутын хязгааргүй; нэг хүнд (имэйл, дугаар) 10 минутад 1 SMS;
// код 20 минут хүчинтэй → 10 минутын дараа дахин хүсэхэд ТЭР код; SMS явалгүй бүтэлгүйтвэл cooldown буцаана.
// Ажиллуулах: node --test tests/sms-unlimited.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const auth = require(path.join(F.API, 'auth.js'));
const ws = require(path.join(F.API, 'worksheets.js'));
const sms = require(path.join(F.API, '_sms.js'));
const A = (body, o) => F.call(auth, body, o);
const W = (body, o) => F.call(ws, body, o);
const ENV = ['SMS_DAY_MAX', 'SMS_30MIN_MAX', 'SMS_MONTH_MAX', 'SMS_REG_DAY_MAX', 'SMS_REG_30MIN_MAX', 'SMS_REG_MONTH_MAX', 'SMS_IP_HOUR_MAX', 'SMS_IP24_HOUR_MAX'];
const PH = '99001100', PH2 = '88001100', PH3 = '95001100';
const used = [PH, PH2, PH3];

beforeEach(() => { F.reset(); ENV.forEach(k => { delete process.env[k]; }); });

function ph(i) { const p = '8' + String(7000000 + i); used.push(p); return p; }
function regBody(email, phone) { return { action: 'register', email: email, pass: 'secret1', firstName: 'Бат', lastName: 'Болд', grade: '9', role: 'student', phone: phone }; }
function wsReg(email, phone) { return { action: 'ws_register', email: email, pass: 'secret1', name: 'Багш', phone: phone }; }
// "10 минут өнгөрлөө": cooldown түлхүүрүүдийн цонхыг хойшлуулна (кодын 20 минутын хугацаа хэвээр)
function pass10min() { for (const [k, r] of F.db.rl) if (/^sms:(em|ph):cd:/.test(k)) r.ws -= 601e3; }
function lastMsg() { return String(F.sms.calls[F.sms.calls.length - 1].body.message); }

test('limits(): анхдагч өдөр/30 мин хязгааргүй, сар 4900, IP 100/200; env 0 → хязгааргүй, эерэг → тэр тоо', () => {
  let L = sms.limits();
  assert.deepStrictEqual([L.day, L.t30, L.regDay, L.regT30, L.month, L.regMonth, L.ip, L.ip24], [Infinity, Infinity, Infinity, Infinity, 4900, 4840, 100, 200]);
  process.env.SMS_MONTH_MAX = '0'; process.env.SMS_DAY_MAX = '45'; process.env.SMS_30MIN_MAX = 'abc';
  L = sms.limits();
  assert.deepStrictEqual([L.month, L.day, L.t30], [Infinity, 45, Infinity]);
  assert.strictEqual(sms.CODE_TTL_MS, 20 * 60e3);
  assert.strictEqual(sms.COOLDOWN_SEC, 600);
});

test('нийт хязгааргүй: 50 бүртгэл (хуучин өдрийн 45, 30 минутын 18/25 давна) бүгд SMS авна', async () => {
  const n0 = F.sms.calls.length;
  for (let i = 0; i < 50; i++) {
    const r = await A(regBody('u' + i + '@x.mn', ph(i)), { ip: '198.51.' + (100 + Math.floor(i / 20)) + '.' + (i % 20 + 1) });
    assert.strictEqual(r.statusCode, 200, 'i=' + i + ' ' + JSON.stringify(r.body));
  }
  assert.strictEqual(F.sms.calls.length - n0, 50);
  assert.ok(!F.tg.some(t => /хязгаар дүүрлээ|SMS өнөөдөр/.test(t)), 'өдрийн квотын Telegram анхааруулга алга');
  const st = JSON.parse(JSON.stringify(await sms.status()));
  assert.deepStrictEqual([st.day.sent, st.day.max, st.last30m.max, st.month.max], [50, null, null, 4900]);
});

test('env-ээр хязгаар тавьсан бол мөрдөнө (SMS_DAY_MAX=3 → 4 дэх нь SMS_FULL)', async () => {
  process.env.SMS_DAY_MAX = '3';
  for (let i = 0; i < 3; i++) assert.strictEqual((await W(wsReg('d' + i + '@x.mn', ph(100 + i)))).statusCode, 200);
  const r = await W(wsReg('d3@x.mn', ph(103)));
  assert.deepStrictEqual([r.statusCode, r.body.code], [503, 'SMS_FULL']);
});

test('нэг IP-ээс 30 бүртгэл (сургуулийн NAT; хуучин IP хязгаар 20) → бүгд амжилттай', async () => {
  for (let i = 0; i < 30; i++) {
    const r = await W(wsReg('ip' + i + '@x.mn', ph(200 + i)), { ip: '203.0.113.50' });
    assert.strictEqual(r.statusCode, 200, 'i=' + i);
  }
});

test('нэг хүнд 10 минутад 1 SMS: resend → 429 «10 минутын дараа»; 10 минутын дараа ТЭР код (20 мин хүчинтэй) дахин явна', async () => {
  const n0 = F.sms.calls.length;
  let r = await A(regBody('p1@x.mn', PH));
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  assert.match(lastMsg(), /20 мин\./);
  const u = F.db.users.get('p1@x.mn');
  const left = new Date(u.verify_expiry).getTime() - Date.now();
  assert.ok(left > 19 * 60e3 && left <= 20 * 60e3 + 1000, 'код 20 минут');
  r = await A({ action: 'resend', email: 'p1@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.code], [429, 'SMS_COOLDOWN']);
  assert.match(r.body.error, /10 минутын дараа/);
  assert.strictEqual(F.sms.calls.length, n0 + 1);
  pass10min();
  r = await A({ action: 'resend', email: 'p1@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.lastCode(), first, 'ТЭР код');
  r = await A({ action: 'verify', email: 'p1@x.mn', code: first });
  assert.strictEqual(r.statusCode, 200);
});

test('тоглоомын бүртгэлийг 10 минутад дахин илгээх → 429 + needVerify/codeStep (код оруулах алхам), хуучин код хүчинтэй', async () => {
  let r = await A(regBody('p2@x.mn', PH2));
  const first = F.lastCode();
  r = await A(regBody('p2@x.mn', PH2));
  assert.deepStrictEqual([r.statusCode, r.body.code, r.body.needVerify, r.body.codeStep, r.body.email], [429, 'SMS_COOLDOWN', true, true, 'p2@x.mn']);
  assert.match(r.body.error, /Утсанд ирсэн кодоо оруулна уу/);
  assert.strictEqual(F.db.users.get('p2@x.mn').verify_code, first);
  r = await A({ action: 'verify', email: 'p2@x.mn', code: first });
  assert.strictEqual(r.statusCode, 200);
});

test('ижил дугаар, өөр имэйл 10 минутад → «Энэ дугаарт саяхан» 429, шинэ мөр үлдэхгүй; имэйлийн cooldown буцаагдаж өөр дугаараар шууд болно', async () => {
  let r = await A(regBody('q1@x.mn', PH3));
  assert.strictEqual(r.statusCode, 200);
  r = await A(regBody('q2@x.mn', PH3));
  assert.deepStrictEqual([r.statusCode, r.body.code, r.body.codeStep], [429, 'SMS_COOLDOWN', undefined]);
  assert.match(r.body.error, /Энэ дугаарт саяхан код илгээсэн/);
  assert.ok(!F.db.users.has('q2@x.mn'));
  r = await A(regBody('q2@x.mn', ph(300)));
  assert.strictEqual(r.statusCode, 200, 'имэйлийн cooldown буцаагдсан');
  assert.ok(F.db.users.get('q1@x.mn').verify_code, 'эхний бүртгэл хөндөгдөөгүй');
});

test('textbee 500 → 503; SMS яваагүй тул cooldown буцаж ШУУД дахин оролдож болно (тоглоом + ws_forgot)', async () => {
  F.sms.mode = 'down';
  let r = await A(regBody('t1@x.mn', ph(400)));
  assert.strictEqual(r.statusCode, 503);
  F.sms.mode = 'ok';
  r = await A(regBody('t1@x.mn', ph(400)));
  assert.strictEqual(r.statusCode, 200);

  F.db.ws.set('t2@x.mn', { email: 't2@x.mn', pass_hash: 'x', verified: true, code: null, code_exp: null, name: 'N', phone: ph(401), code_attempts: 0, phone_verified_at: new Date() });
  F.sms.mode = 'down';
  r = await W({ action: 'ws_forgot', email: 't2@x.mn' });
  assert.strictEqual(r.statusCode, 503);
  F.sms.mode = 'ok';
  r = await W({ action: 'ws_forgot', email: 't2@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.ok], [200, true]);
});

test('SMS_UNCERTAIN (явсан байж магадгүй) → cooldown хэвээр; дахин хүсэхэд 429 codeStep', async () => {
  F.sms.mode = 'abort';
  let r = await W(wsReg('un@x.mn', ph(500)));
  assert.strictEqual(r.body.code, 'SMS_UNCERTAIN');
  assert.match(r.body.error, /10 минутын дараа/);
  F.sms.mode = 'ok';
  const n = F.sms.calls.length;
  r = await W({ action: 'ws_resend', email: 'un@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.code], [429, 'SMS_COOLDOWN']);
  assert.strictEqual(F.sms.calls.length, n);
});

test('нууц үг сэргээх 10 минутад 2 дахь удаа → 429 codeStep (код оруулах алхам); бүртгэлийн cooldown-оос тусдаа', async () => {
  F.db.ws.set('f1@x.mn', { email: 'f1@x.mn', pass_hash: 'x', verified: true, code: null, code_exp: null, name: 'N', phone: ph(600), code_attempts: 0, phone_verified_at: new Date() });
  let r = await W({ action: 'ws_forgot', email: 'f1@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  const first = F.lastCode();
  r = await W({ action: 'ws_forgot', email: 'f1@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.code, r.body.codeStep], [429, 'SMS_COOLDOWN', true]);
  r = await W({ action: 'ws_reset', email: 'f1@x.mn', code: first, pass: 'newpass9' });
  assert.strictEqual(r.statusCode, 200);

  // бүртгэлгүй имэйлд сэргээх (хуурамч хариу) → тэр имэйлээр шууд бүртгүүлж болно (kind тусдаа)
  r = await A({ action: 'sendResetCode', email: 'nr@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  r = await A(regBody('nr@x.mn', ph(601)));
  assert.strictEqual(r.statusCode, 200);
});

test('S2 / тодорхойгүй SQL: бүтэн дугаар, код лог/Telegram/хариунд алга', () => {
  assert.deepStrictEqual(F.leakCheck(used), []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.sms.other, []);
});
