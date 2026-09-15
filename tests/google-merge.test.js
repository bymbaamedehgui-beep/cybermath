// S7: SMS-ээр бусдын имэйлийг урьдчилан эзэлсэн дансыг жинхэнэ эзэн Google-ээр нэвтрэхэд цэвэрлэнэ (спек §5.4),
// token_version-оор халдагчийн хуучин JWT /api/users-т хүчингүй болно (§5.3).
// Ажиллуулах: node --test tests/google-merge.test.js   (бодит DB/textbee/Google 0 — tests/_smsfake.js + JWKS stub)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const crypto = require('crypto');

const auth = require(path.join(F.API, 'auth.js'));
const google = require(path.join(F.API, 'googleauth.js'));
const users = require(path.join(F.API, 'users.js'));
const sms = require(path.join(F.API, '_sms.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const A = (b, o) => F.call(auth, b, o);

// ── Google JWKS stub (сүлжээ 0) ──
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = Object.assign(publicKey.export({ format: 'jwk' }), { kid: 'k1', alg: 'RS256', use: 'sig' });
const origFetch = globalThis.fetch;
globalThis.fetch = async function (url, opts) {
  if (String(url) === 'https://www.googleapis.com/oauth2/v3/certs') {
    return { ok: true, headers: { get: () => 'max-age=3600' }, json: async () => ({ keys: [jwk] }) };
  }
  return origFetch(url, opts);
};
process.env.GOOGLE_CLIENT_ID = 'cid-test';
function googleToken(email) {
  return jwt.sign({ email, email_verified: true, given_name: 'Victim' }, privateKey,
    { algorithm: 'RS256', keyid: 'k1', audience: 'cid-test', issuer: 'https://accounts.google.com', expiresIn: '5m' });
}
async function me(email, token) {
  const req = { method: 'GET', headers: { authorization: 'Bearer ' + token }, query: { me: email }, body: {} };
  const res = { statusCode: 200, body: undefined, headers: {}, setHeader() {}, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
  await users(req, res);
  return res;
}

beforeEach(() => F.reset());

const ATTACKER_PH = '88990011';

test('S7: халдагч SMS-ээр эзэлсэн данс → хохирогч Google-ээр орход нууц үг/утас арилж, халдагчийн JWT/нууц үг/сэргээлт бүгд хүчингүй', async () => {
  const victim = 'victim.teacher@gmail.com';
  // 1) халдагч хохирогчийн имэйлээр өөрийн утсаар бүртгүүлж verify хийнэ
  let r = await A({ action: 'register', email: victim, pass: 'attackerpw', firstName: 'X', lastName: 'Y', grade: '9', role: 'student', phone: ATTACKER_PH }, { ip: '198.51.100.1' });
  assert.strictEqual(r.body.ok, true);
  let row = F.db.users.get(victim);
  assert.strictEqual(row.email_unverified, true, 'SMS бүртгэл email_unverified=TRUE');
  r = await A({ action: 'verify', email: victim, code: F.lastCode() }, { ip: '198.51.100.1' });
  assert.strictEqual(r.body.ok, true);
  const attackerJwt = r.body.user.token;
  assert.strictEqual(jwt.decode(attackerJwt).tv, 0);
  assert.ok(row.phone_verified_at, 'verify → phone_verified_at');
  assert.strictEqual(row.email_unverified, true, 'verify нь имэйлийг батлахгүй');
  assert.strictEqual((await me(victim, attackerJwt)).statusCode, 200, 'цэвэрлэгээнээс өмнө халдагчийн токен ажиллана');

  // 2) хохирогч Google-ээр нэвтэрнэ → цэвэрлэгээ
  const g = await F.call(google, { idToken: googleToken(victim) }, { ip: '192.0.2.9' });
  assert.strictEqual(g.statusCode, 200, JSON.stringify(g.body));
  row = F.db.users.get(victim);
  assert.strictEqual(row.pass, 'GOOGLE_OAUTH', 'халдагчийн нууц үг арилсан');
  assert.strictEqual(row.phone, null, 'халдагчийн утас арилсан');
  assert.strictEqual(row.phone_verified_at, null);
  assert.strictEqual(row.email_unverified, false);
  assert.strictEqual(row.token_version, 1);
  assert.strictEqual(g.body.user.phone, null, 'хохирогчид халдагчийн утас харагдахгүй');
  assert.strictEqual(jwt.decode(g.body.token).tv, 1);
  assert.ok(F.tg.some(t => /Google-ээр эзэмшигдлээ/.test(t) && t.indexOf(victim) < 0), 'Telegram (маскласан имэйл)');

  // 3) халдагчийн хуучин JWT → 401 TOKEN_STALE, хохирогчийн шинэ токен → 200
  const stale = await me(victim, attackerJwt);
  assert.deepStrictEqual([stale.statusCode, stale.body.code], [401, 'TOKEN_STALE']);
  assert.strictEqual((await me(victim, g.body.token)).statusCode, 200);

  // 4) халдагч нууц үгээр нэвтэрч чадахгүй
  F.clearCooldowns();
  r = await A({ action: 'login', email: victim, pass: 'attackerpw' }, { ip: '198.51.100.1' });
  assert.strictEqual(r.statusCode, 401);

  // 5) forgot → халдагчийн утас руу SMS очихгүй (хуурамч хариу)
  F.clearCooldowns();
  const n0 = F.sms.calls.length;
  r = await A({ action: 'forgot', email: victim }, { ip: '192.0.2.9' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.sms.calls.length, n0, 'SMS 0');

  // 6) дахин Google нэвтрэлт → дахин цэвэрлэхгүй (tv хэвээр)
  const g2 = await F.call(google, { idToken: googleToken(victim) }, { ip: '192.0.2.9' });
  assert.strictEqual(g2.statusCode, 200);
  assert.strictEqual(F.db.users.get(victim).token_version, 1);
});

test('Google: урилгаар бүртгэгдсэн (email_unverified) GOOGLE_OAUTH биш данс мөн цэвэрлэгдэнэ; GOOGLE_OAUTH мөр зөвхөн туг арилна', async () => {
  F.db.invites.set('INV9', { token: 'INV9', grade: '9', school: null, max_uses: 5, uses: 0, expires_at: null });
  let r = await A({ action: 'register', email: 'inv9@gmail.com', pass: 'secret1', firstName: 'a', lastName: 'b', grade: '9', role: 'student', inviteToken: 'INV9', phone: '70112233' });
  assert.strictEqual(r.body.invited, true, JSON.stringify(r.body));
  assert.strictEqual(F.db.users.get('inv9@gmail.com').email_unverified, true);
  assert.strictEqual(F.db.users.get('inv9@gmail.com').phone, null, 'урилгын буруу утас хадгалагдахгүй (400 биш)');
  let g = await F.call(google, { idToken: googleToken('inv9@gmail.com') });
  assert.strictEqual(g.statusCode, 200);
  assert.strictEqual(F.db.users.get('inv9@gmail.com').pass, 'GOOGLE_OAUTH');

  F.db.users.set('gg@gmail.com', { id: 777, email: 'gg@gmail.com', pass: 'GOOGLE_OAUTH', verified: true, email_unverified: true, token_version: 3, phone: '99112233', plan: 'free', code_attempts: 0 });
  g = await F.call(google, { idToken: googleToken('gg@gmail.com') });
  assert.strictEqual(g.statusCode, 200);
  const u = F.db.users.get('gg@gmail.com');
  assert.deepStrictEqual([u.email_unverified, u.token_version, u.phone], [false, 3, '99112233']);
  assert.strictEqual(jwt.decode(g.body.token).tv, 3);
});

test('Google: SMS-ээс өмнөх (email_unverified=FALSE) нууц үгтэй данс хөндөгдөхгүй', async () => {
  F.db.users.set('legacy@gmail.com', { id: 778, email: 'legacy@gmail.com', pass: await bcrypt.hash('oldpass1', 4), verified: true, phone: '99112233', plan: 'free', code_attempts: 0 });
  const g = await F.call(google, { idToken: googleToken('legacy@gmail.com') });
  assert.strictEqual(g.statusCode, 200);
  const u = F.db.users.get('legacy@gmail.com');
  assert.notStrictEqual(u.pass, 'GOOGLE_OAUTH');
  assert.strictEqual(u.phone, '99112233');
  assert.strictEqual(jwt.decode(g.body.token).tv, 0);
});

test('users.js: tv-гүй хуучин токен (token_version=0) → 200; нууц үг SMS-ээр сэргээсний дараа хуучин токен → 401 TOKEN_STALE', async () => {
  F.db.users.set('tv@x.mn', { id: 779, email: 'tv@x.mn', pass: await bcrypt.hash('oldpass1', 4), verified: true, phone: '95001122', plan: 'free', code_attempts: 0 });
  const oldTok = jwt.sign({ email: 'tv@x.mn', role: 'student' }, process.env.JWT_SECRET, { expiresIn: '30d' });
  assert.strictEqual((await me('tv@x.mn', oldTok)).statusCode, 200);
  let r = await A({ action: 'forgot', email: 'tv@x.mn' });
  assert.strictEqual(r.body.masked, '**** **22');
  r = await A({ action: 'resetWithCode', email: 'tv@x.mn', code: F.lastCode(), newPass: 'newpass1' });
  assert.deepStrictEqual(r.body, { ok: true });
  assert.strictEqual(F.db.users.get('tv@x.mn').token_version, 1);
  const s = await me('tv@x.mn', oldTok);
  assert.deepStrictEqual([s.statusCode, s.body.code], [401, 'TOKEN_STALE']);
  r = await A({ action: 'login', email: 'tv@x.mn', pass: 'newpass1' });
  assert.strictEqual(jwt.decode(r.body.user.token).tv, 1);
  assert.strictEqual((await me('tv@x.mn', r.body.user.token)).statusCode, 200);
});

test('S2: бүтэн дугаар, код, API түлхүүр лог/Telegram/sms_log-д алга; тодорхойгүй SQL 0', () => {
  assert.deepStrictEqual(F.leakCheck([ATTACKER_PH]), []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.ok(sms.maskEmail('victim.teacher@gmail.com').indexOf('victim.teacher') < 0);
});
