// cyber-math.com Тоглоомын төв — Premium-гүй хэрэглэгчийн туршилт (api/_cmpreview.js + api/games.js ?action=preview|pstatus).
//   2026-11-06 эзэмшигч: Premium → бүх тоглоом; Premium-гүй → тоглоом бүрийг ГАНЦ Л удаа 2 минут туршина, дараа нь
//   худалдан авах цонх; найзын өрөө / ангийн уралдаанд нэгдсэн хүн хязгааргүй (клиент — index.html cmGameGate).
// Ажиллуулах: node --test tests/cm-preview.test.js   (бодит DB 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const games = require(path.join(F.API, 'games.js'));
const PV = require(path.join(F.API, '_cmpreview.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const cmTok = (e) => jwt.sign({ email: e, role: 'student', tv: 0 }, SEC);
const bearer = (e) => ({ authorization: 'Bearer ' + cmTok(e) });
const DEV_A = 'a1b2c3d4e5f6a7b8c9d0', DEV_B = 'ffeeddccbbaa99887766';

const P = (action, body, headers) => F.call(games, { query: { action: action }, body: body || {}, headers: headers || {} });
async function shifted(ms, fn) {
  const real = Date.now;
  Date.now = () => real() + ms;
  try { return await fn(); } finally { Date.now = real; }
}

beforeEach(() => F.reset());

test('_cmpreview: анхдагч 120 сек, kill-switch, үнэгүй тоглоом, төхөөрөмжийн id', () => {
  assert.strictEqual(PV.previewSeconds({}), 120);
  assert.strictEqual(PV.previewSeconds({ CM_GAME_PREVIEW_SECONDS: '30' }), 30);
  assert.strictEqual(PV.previewSeconds({ CM_GAME_PREVIEW_SECONDS: '5' }), 120, '10-аас бага → анхдагч');
  assert.strictEqual(PV.gateOn({}), true);
  ['off', 'false', '0', 'no', 'OFF'].forEach(v => assert.strictEqual(PV.gateOn({ CM_GAME_GATE: v }), false, v));
  assert.strictEqual(PV.isFree('blockblast'), true);
  assert.strictEqual(PV.isFree('mathmortal'), false);
  assert.strictEqual(PV.cleanDevice('short'), null);
  assert.strictEqual(PV.cleanDevice('ABCDEF0123456789'), 'abcdef0123456789');
  assert.strictEqual(PV.cleanDevice('a b c d e f g h i j k'), null);
  assert.deepStrictEqual(PV.subjectsOf('Bat@Mail.mn', DEV_A), ['u:bat@mail.mn', 'd:' + DEV_A]);
  assert.deepStrictEqual(PV.subjectsOf(null, 'bad'), []);
});

test('preview (зочин): анх 2 минут → дахин орвол үлдсэн хугацаа → дууссаны дараа 402, бусад тоглоом шинээр', async () => {
  const r1 = await P('preview', { game: 'sudoku', device: DEV_A });
  assert.strictEqual(r1.statusCode, 200);
  assert.strictEqual(r1.body.ok, true);
  assert.strictEqual(r1.body.seconds, 120);
  const left = new Date(r1.body.until) - new Date(r1.body.server_now);
  assert.ok(left > 119000 && left <= 120000, String(left));
  const r2 = await shifted(60000, () => P('preview', { game: 'sudoku', device: DEV_A }));
  assert.strictEqual(r2.body.ok, true, 'хугацаа дотор дахин ачаалбал үргэлжилнэ');
  assert.strictEqual(r2.body.until, r1.body.until, 'сунгахгүй');
  const r3 = await shifted(121000, () => P('preview', { game: 'sudoku', device: DEV_A }));
  assert.strictEqual(r3.statusCode, 402);
  assert.strictEqual(r3.body.used, true);
  assert.match(r3.body.error, /2 минутын туршилт дууссан/);
  const r4 = await shifted(121000, () => P('preview', { game: 'play2048', device: DEV_A }));
  assert.strictEqual(r4.body.ok, true, 'өөр тоглоом — өөрийн туршилттай');
});

test('preview: бүртгэл ба төхөөрөмж холбогдоно — бүртгэл солих / өөр төхөөрөмж шинэ туршилт өгөхгүй', async () => {
  F.addUser('bat@mail.mn'); F.addUser('dorj@mail.mn');
  await P('preview', { game: 'mathmortal', device: DEV_A }, bearer('bat@mail.mn'));
  await shifted(130000, async () => {
    const other = await P('preview', { game: 'mathmortal', device: DEV_B }, bearer('bat@mail.mn'));
    assert.strictEqual(other.statusCode, 402, 'ижил бүртгэл, өөр төхөөрөмж');
    const acc2 = await P('preview', { game: 'mathmortal', device: DEV_A }, bearer('dorj@mail.mn'));
    assert.strictEqual(acc2.statusCode, 402, 'ижил төхөөрөмж, өөр бүртгэл');
    const guest = await P('preview', { game: 'mathmortal', device: DEV_A });
    assert.strictEqual(guest.statusCode, 402, 'ижил төхөөрөмж, нэвтрээгүй');
  });
});

test('preview: Premium → хязгааргүй (бичлэг үүсэхгүй); дууссан Premium → туршилт', async () => {
  F.addUser('prem@mail.mn', { plan: 'premium', premium_expiry: new Date(Date.now() + 5 * F.DAY) });
  const r = await P('preview', { game: 'myangat', device: DEV_A }, bearer('prem@mail.mn'));
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, gate: true, premium: true, seconds: 120 });
  assert.strictEqual(F.db.previews.size, 0);
  const s = await P('pstatus', { device: DEV_A }, bearer('prem@mail.mn'));
  assert.strictEqual(s.body.premium, true);
  F.addUser('old@mail.mn', { plan: 'premium', premium_expiry: new Date(Date.now() - F.DAY) });
  const o = await P('preview', { game: 'myangat', device: DEV_B }, bearer('old@mail.mn'));
  assert.strictEqual(o.body.premium, false);
  assert.ok(o.body.until, 'хугацаа нь дууссан Premium → туршилт');
});

test('preview: ангийн тэмцээний гадны тоглоом үнэгүй; kill-switch; CM_GAME_PREVIEW_SECONDS', async () => {
  const f = await P('preview', { game: 'flagbattle', device: DEV_A });
  assert.deepStrictEqual(f.body, { ok: true, gate: true, free: true, game: 'flagbattle' });
  assert.strictEqual(F.db.previews.size, 0);
  process.env.CM_GAME_GATE = 'off';
  const off = await P('preview', { game: 'sudoku', device: DEV_A });
  assert.deepStrictEqual(off.body, { ok: true, gate: false, seconds: 120 });
  delete process.env.CM_GAME_GATE;
  process.env.CM_GAME_PREVIEW_SECONDS = '30';
  const s = await P('preview', { game: 'sudoku', device: DEV_A });
  assert.strictEqual(new Date(s.body.until) - new Date(s.body.server_now), 30000);
});

test('preview: админаас олгосон cyber-math.com-ийн тоглоомын эрх → туршилтгүй; pstatus owned/all; Дасгалын төвийн эрх хамаарахгүй', async () => {
  const GM = require(path.join(F.API, '_games.js'));
  F.addUser('own@mail.mn');
  await GM.grantGame('cm', 'own@mail.mn', 'sudoku', 30);
  await GM.grantGame('ws', 'own@mail.mn', 'play2048', 30);
  const a = await P('preview', { game: 'sudoku', device: DEV_A }, bearer('own@mail.mn'));
  assert.strictEqual(a.statusCode, 200);
  assert.deepStrictEqual([a.body.ok, a.body.owned, a.body.game], [true, true, 'sudoku']);
  assert.ok(a.body.expires_at);
  assert.strictEqual(F.db.previews.size, 0, 'туршилт бүртгэгдээгүй');
  const b = await P('preview', { game: 'play2048', device: DEV_A }, bearer('own@mail.mn'));
  assert.ok(b.body.until && !b.body.owned, 'Дасгалын төвийн эрх cyber-math.com-д үйлчлэхгүй → туршилт');
  let s = await P('pstatus', { device: DEV_A }, bearer('own@mail.mn'));
  assert.deepStrictEqual([s.body.owned, s.body.all], [['sudoku'], false]);
  for (const k of GM.GAME_KEYS) await GM.grantGame('cm', 'own@mail.mn', k, 30);
  s = await P('pstatus', { device: DEV_A }, bearer('own@mail.mn'));
  assert.strictEqual(s.body.all, true);
  assert.strictEqual(s.body.owned.length, GM.GAME_KEYS.length);
  const g = await P('pstatus', { device: DEV_B });
  assert.deepStrictEqual([g.body.owned, g.body.all], [[], false], 'зочин');
});

test('pstatus: ашигласан / идэвхтэй тоглоомууд, үнэгүй жагсаалт', async () => {
  await P('preview', { game: 'sudoku', device: DEV_A });
  await shifted(200000, () => P('preview', { game: 'numseq', device: DEV_A }));
  const s = await shifted(250000, () => P('pstatus', { device: DEV_A }));
  assert.strictEqual(s.statusCode, 200);
  assert.strictEqual(s.body.premium, false);
  assert.strictEqual(s.body.login, false);
  assert.deepStrictEqual(s.body.used, ['sudoku']);
  assert.deepStrictEqual(Object.keys(s.body.active), ['numseq']);
  assert.deepStrictEqual(s.body.free, ['blockblast', 'flagbattle', 'songon', 'nicebattle']);
});

test('preview: буруу хүсэлт — GET 405, төхөөрөмж/нэвтрэлтгүй 400, танихгүй тоглоом 400, DB алдаа → 5xx', async () => {
  const g = await F.call(games, { method: 'GET', query: { action: 'preview' } });
  assert.strictEqual(g.statusCode, 405);
  assert.strictEqual((await P('preview', { game: 'sudoku' })).statusCode, 400);
  assert.strictEqual((await P('preview', { game: 'nope', device: DEV_A })).statusCode, 400);
  assert.strictEqual((await P('preview', { game: '__proto__', device: DEV_A })).statusCode, 400);
  F.db.failPrev = true;
  const e = await P('preview', { game: 'sudoku', device: DEV_A });
  assert.ok(e.statusCode >= 500, String(e.statusCode));
  assert.strictEqual(e.body.ok, false);
});
