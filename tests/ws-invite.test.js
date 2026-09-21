// Дасгалын төвийн урилгын линк (/worksheets?invite=TOKEN): SMS кодгүй бүртгэл (api/worksheets.js ws_invite_* + ws_register invite)
// Ажиллуулах: node --test tests/ws-invite.test.js   (бодит DB/textbee/имэйл 0 — tests/_smsfake.js)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ws = require(path.join(F.API, 'worksheets.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const bcrypt = require(require.resolve('bcryptjs', { paths: [F.API] }));
const W = (body, o) => F.call(ws, body, o);
const ADMIN = { headers: { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) } };
const PH = '99113344', PH2 = '88223344', PH3 = '95112233';

beforeEach(() => F.reset());

async function mkInvite(o) {
  const r = await W(Object.assign({ action: 'ws_invite_create', maxUses: 3, expiresInDays: 7, note: 'Сургалт' }, o || {}), ADMIN);
  assert.strictEqual(r.statusCode, 200);
  assert.match(r.body.token, /^[A-Z2-9]{12}$/);
  return r.body.token;
}
const reg = (email, invite, extra) => W(Object.assign({ action: 'ws_register', email: email, pass: 'secret1', name: 'Багш', invite: invite }, extra || {}));

test('админ биш → ws_invite_create/list/delete 401', async () => {
  for (const a of ['ws_invite_create', 'ws_invite_list', 'ws_invite_delete']) {
    const r = await W({ action: a, token: 'ABCDEFGH' });
    assert.strictEqual(r.statusCode, 401, a);
  }
  const bad = await W({ action: 'ws_invite_create' }, { headers: { authorization: 'Bearer ' + jwt.sign({ email: 'x@x.mn', ws: true }, process.env.JWT_SECRET) } });
  assert.strictEqual(bad.statusCode, 401, 'ws токен админ биш');
  assert.strictEqual(F.db.wsInv.size, 0);
});

test('урилгаар бүртгэл: SMS 0, шууд токен, verified, урилга тоологдоно; нууц үгээр нэвтэрнэ', async () => {
  const t = await mkInvite();
  let r = await W({ action: 'ws_invite_info', invite: t.toLowerCase() });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.remaining, 3);
  const n = F.sms.calls.length;
  r = await reg('inv1@x.mn', t);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.invited, true);
  assert.ok(r.body.token);
  assert.strictEqual(jwt.verify(r.body.token, process.env.JWT_SECRET).email, 'inv1@x.mn');
  assert.strictEqual(F.sms.calls.length, n, 'SMS явахгүй');
  const row = F.db.ws.get('inv1@x.mn');
  assert.deepStrictEqual([row.verified, row.code, row.phone, row.invite, row.phone_verified_at], [true, null, null, t, null]);
  assert.strictEqual(F.db.wsInv.get(t).uses, 1);
  r = await W({ action: 'ws_login', email: 'inv1@x.mn', pass: 'secret1' });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(r.body.token);
  r = await W({ action: 'ws_invite_info', invite: t });
  assert.strictEqual(r.body.remaining, 2);
});

test('ашиглах тоо дууссан / хугацаа дууссан / устгасан / байхгүй / буруу хэлбэр → INVITE_BAD, данс үүсэхгүй', async () => {
  const t = await mkInvite({ maxUses: 1 });
  assert.strictEqual((await reg('a1@x.mn', t)).statusCode, 200);
  let r = await reg('a2@x.mn', t);
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'INVITE_BAD']);
  assert.ok(!F.db.ws.has('a2@x.mn'));
  r = await W({ action: 'ws_invite_info', invite: t });
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'INVITE_BAD']);

  const t2 = await mkInvite();
  F.db.wsInv.get(t2).expires_at = new Date(Date.now() - 1000);
  r = await reg('a3@x.mn', t2);
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'INVITE_BAD']);
  r = await W({ action: 'ws_invite_info', invite: t2 });
  assert.strictEqual(r.body.code, 'INVITE_BAD');

  const t3 = await mkInvite();
  r = await W({ action: 'ws_invite_delete', token: t3 }, ADMIN);
  assert.strictEqual(r.statusCode, 200);
  r = await reg('a4@x.mn', t3);
  assert.strictEqual(r.body.code, 'INVITE_BAD');

  r = await reg('a5@x.mn', 'ZZZZZZZZZZZZ');
  assert.strictEqual(r.body.code, 'INVITE_BAD');
  r = await reg('a6@x.mn', "x' OR 1=1 --");
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'INVITE_BAD']);
  assert.ok(!F.db.ws.has('a3@x.mn') && !F.db.ws.has('a4@x.mn') && !F.db.ws.has('a5@x.mn') && !F.db.ws.has('a6@x.mn'));
});

test('зэрэг бүртгэл: max_uses=1 урилгаар 3 хүсэлт → яг 1 амжилттай', async () => {
  const t = await mkInvite({ maxUses: 1 });
  const rs = await Promise.all(['c1@x.mn', 'c2@x.mn', 'c3@x.mn'].map(e => reg(e, t)));
  assert.strictEqual(rs.filter(r => r.statusCode === 200).length, 1);
  assert.strictEqual(F.db.wsInv.get(t).uses, 1);
});

test('SMS ирээгүй баталгаажаагүй мөр (хүчинтэй кодтой) → урилгаар орж чадна, код устана', async () => {
  let r = await W({ action: 'ws_register', email: 'p1@x.mn', pass: 'secret1', name: 'A', phone: PH });
  assert.strictEqual(r.statusCode, 200);
  assert.ok(F.db.ws.get('p1@x.mn').code);
  const t = await mkInvite();
  r = await reg('p1@x.mn', t, { pass: 'newpass1' });
  assert.strictEqual(r.statusCode, 200);
  const row = F.db.ws.get('p1@x.mn');
  assert.deepStrictEqual([row.verified, row.code, row.code_exp, row.phone], [true, null, null, null]);
  assert.ok(await bcrypt.compare('newpass1', row.pass_hash));
});

test('баталгаажсан имэйл → existed, урилга зарцуулагдахгүй; админ бэлтгэсэн мөр → NEED_LOGIN', async () => {
  F.db.ws.set('v@x.mn', { email: 'v@x.mn', pass_hash: await bcrypt.hash('oldpass1', 4), verified: true, code: null, code_exp: null, name: 'V', phone: PH2, code_attempts: 0, phone_verified_at: new Date() });
  const t = await mkInvite();
  let r = await reg('v@x.mn', t);
  assert.deepStrictEqual([r.statusCode, r.body.existed], [400, true]);
  assert.ok(await bcrypt.compare('oldpass1', F.db.ws.get('v@x.mn').pass_hash), 'нууц үг хэвээр');
  F.db.ws.set('pr@x.mn', { email: 'pr@x.mn', pass_hash: '!', verified: false, code: null, code_exp: null, name: null, phone: PH3, code_attempts: 0, phone_verified_at: new Date() });
  r = await reg('pr@x.mn', t);
  assert.strictEqual(r.body.code, 'NEED_LOGIN');
  assert.strictEqual(F.db.ws.get('pr@x.mn').pass_hash, '!');
  assert.strictEqual(F.db.wsInv.get(t).uses, 0);
});

test('эрхтэй (худалдан авсан) имэйл → NEED_ADMIN, данс үүсэхгүй, урилга зарцуулагдахгүй; DB алдаа → хаана', async () => {
  F.entitle('ws_access', 'paid@x.mn');
  const t = await mkInvite();
  let r = await reg('paid@x.mn', t);
  assert.deepStrictEqual([r.statusCode, r.body.code], [409, 'NEED_ADMIN']);
  assert.ok(!F.db.ws.has('paid@x.mn'));
  assert.strictEqual(F.db.wsInv.get(t).uses, 0);
  F.db.entFail = true;
  r = await reg('other@x.mn', t);
  assert.notStrictEqual(r.statusCode, 200);
  assert.ok(!F.db.ws.has('other@x.mn'));
});

test('утас: заавал биш; буруу бол 400; зөв бол хадгалж, нууц үг сэргээх SMS тэр утсанд явна', async () => {
  const t = await mkInvite({ maxUses: 5 });
  let r = await reg('ph1@x.mn', t, { phone: '1234' });
  assert.deepStrictEqual([r.statusCode, r.body.code], [400, 'PHONE_INVALID']);
  assert.strictEqual(F.db.wsInv.get(t).uses, 0);
  r = await reg('ph2@x.mn', t, { phone: '+976 ' + PH3 });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(F.db.ws.get('ph2@x.mn').phone, PH3);
  F.clearCooldowns();
  r = await W({ action: 'ws_forgot', email: 'ph2@x.mn' });
  assert.strictEqual(r.statusCode, 200);
  const last = F.sms.calls[F.sms.calls.length - 1];
  assert.deepStrictEqual(last.body.recipients, ['+976' + PH3]);
  r = await W({ action: 'ws_reset', email: 'ph2@x.mn', code: F.lastCode(), pass: 'newpass9' });
  assert.strictEqual(r.statusCode, 200);
});

test('админ жагсаалт: үүсгэсэн урилга, ашиглалт харагдана; maxUses/хугацааг хязгаарлана', async () => {
  const t = await mkInvite({ maxUses: 99999, expiresInDays: 9999, note: 'x'.repeat(500) });
  await reg('l1@x.mn', t);
  const r = await W({ action: 'ws_invite_list' }, ADMIN);
  assert.strictEqual(r.statusCode, 200);
  const row = r.body.invites.find(i => i.token === t);
  assert.deepStrictEqual([row.max_uses, row.uses, row.note.length], [1000, 1, 120]);
  assert.ok(new Date(row.expires_at).getTime() < Date.now() + 366 * 86400e3);
});

test('урилгагүй ердийн бүртгэл өөрчлөгдөөгүй: утас заавал, SMS код явна', async () => {
  let r = await W({ action: 'ws_register', email: 'n1@x.mn', pass: 'secret1', name: 'A' });
  assert.strictEqual(r.body.code, 'PHONE_INVALID');
  r = await W({ action: 'ws_register', email: 'n1@x.mn', pass: 'secret1', name: 'A', phone: PH2 });
  assert.deepStrictEqual([r.statusCode, r.body.needVerify, r.body.token], [200, true, undefined]);
  assert.strictEqual(F.db.ws.get('n1@x.mn').verified, false);
  r = await W({ action: 'ws_register', email: 'n2@x.mn', pass: 'secret1', name: 'A', phone: PH, invite: '' });
  assert.deepStrictEqual([r.statusCode, r.body.needVerify], [200, true], 'хоосон invite = ердийн');
});

test('S2 / тодорхойгүй SQL: бүтэн дугаар, код лог/Telegram/хариунд алга', () => {
  assert.deepStrictEqual(F.leakCheck([PH, PH2, PH3]), []);
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.sms.other, []);
});
