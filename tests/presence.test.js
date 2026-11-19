// Даалгаврын хугацаат шууд хяналт — api/presence.js + api/users.js (assignChallenge startAt/endAt) + cm-live.js + index.html.
//   2026-11-19 эзэмшигч: «Багш 10:10–11:00 гэх мэт цаг тохируулж даалгавар илгээхэд тухайн ангийн сурагчдын утсан дээрх
//   мэдээллийг 3–5 секунд тутамд сайтад байгаа эсэхийг шалгадаг байх». Сурагчид тэмдэг харуулахгүй, 5 сек тутам.
// Ажиллуулах: node --test tests/presence.test.js   (бодит DB 0 — tests/_gamefake.js + энд санах ойн хүснэгтүүд)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const P = require(path.join(F.API, 'presence.js'));
const users = require(path.join(F.API, 'users.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const bearer = (e, role) => ({ authorization: 'Bearer ' + jwt.sign({ email: e, role: role || 'student', tv: 0 }, SEC) });
const WS = e => ({ authorization: 'Bearer ' + jwt.sign({ email: e, ws: true }, SEC) });
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, SEC) };
const MIN = 60000, HOUR = 3600000;

// ── Санах ойн анги, гишүүд, cm_presence ──
const TEACH = 'bagsh@mail.mn', OTHER = 'other@mail.mn', BAT = 'bat@mail.mn', DORJ = 'dorj@mail.mn', OUT = 'tsetseg@mail.mn';
const ID = { now: 'ch_1763500000001', soon: 'ch_1763500000002', past: 'ch_1763500000003', recent: 'ch_1763500000004', plain: 'ch_1763500000005', far: 'ch_1763500000006' };
let CLS = [], MEM = [];
const PRES = new Map();
const calls = { member: 0, insert: [], users: new Map(), clsCh: [] };
let SHIFT = 0, BASE = Date.now();             // DB-ийн NOW() = BASE + SHIFT (тогтмол): дохиогүй завсрыг дуурайна
const NOW = () => BASE + SHIFT;
const iso = t => new Date(t).toISOString();
function setup() {
  const t = Date.now();
  CLS = [
    { id: 501, teacher_email: TEACH, challenges: [
      { id: ID.soon, title: 'Дараагийн цаг', lessons: [706], startAt: iso(t + 30 * MIN), endAt: iso(t + 90 * MIN) },
      { id: ID.now, title: 'Тэгшитгэл', lessons: [705, '707'], startAt: iso(t - 5 * MIN), endAt: iso(t + 50 * MIN) },
      { id: ID.past, title: 'Өчигдрийн', lessons: [701], startAt: iso(t - 3 * HOUR), endAt: iso(t - 2.5 * HOUR) },
      { id: ID.recent, title: 'Сая дууссан', lessons: [702], startAt: iso(t - 90 * MIN), endAt: iso(t - 30 * MIN) },
      { id: ID.plain, title: 'Цаггүй', lessons: [703], dueDate: '2026-11-30' },
      { id: ID.far, title: 'Нөгөөдөр', lessons: [704], startAt: iso(t + 48 * HOUR), endAt: iso(t + 49 * HOUR) },
    ] },
    { id: 777, teacher_email: OTHER, challenges: [] },
  ];
  // Prod-д challenges JSONB (объект) эсвэл хуучин мөрөнд текст байж болно — 501 текстээр, 777 объектоор
  CLS[0].challenges = JSON.stringify(CLS[0].challenges);
  MEM = [{ classroom_id: 501, student_email: BAT }, { classroom_id: 501, student_email: 'Dorj@Mail.mn' }, { classroom_id: 501, student_email: 'nameless@mail.mn' },
    { classroom_id: 777, student_email: OUT }];
}
const LIVE_SQL = 'SELECT LOWER(m.student_email) AS email, u.first_name, u.last_name, p.st, p.q, p.lesson, p.leaves, p.gaps, p.away_ms,'
  + ' EXTRACT(EPOCH FROM (NOW() - p.last_at)) AS ago, p.first_at FROM class_members m LEFT JOIN users u ON LOWER(u.email) = LOWER(m.student_email)'
  + ' LEFT JOIN cm_presence p ON p.cid = $2 AND p.email = LOWER(m.student_email) WHERE m.classroom_id = $1';
F.db.extra.push(function (q, p) {
  // api/presence.js
  if (q === 'SELECT c.id, c.challenges FROM class_members m JOIN classrooms c ON c.id = m.classroom_id WHERE LOWER(m.student_email) = $1') {
    calls.member++;
    return { rows: MEM.filter(m => m.student_email.toLowerCase() === p[0]).map(m => { const c = CLS.find(x => x.id === m.classroom_id); return { id: c.id, challenges: c.challenges }; }) };
  }
  if (q === 'SELECT id, teacher_email, challenges FROM classrooms WHERE id = $1') return { rows: CLS.filter(c => String(c.id) === String(p[0])).map(c => Object.assign({}, c)) };
  if (q.indexOf('INSERT INTO cm_presence (cid, email, st, q, lesson) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (cid, email) DO UPDATE SET') === 0) {
    calls.insert.push(p.slice());
    const k = p[0] + '|' + p[1], t = NOW(), old = PRES.get(k);
    if (!old) { PRES.set(k, { st: p[2], q: p[3], lesson: p[4], first_at: t, last_at: t, leaves: 0, gaps: 0, away_ms: 0 }); return { rows: [] }; }
    // SQL-ийн CASE-ийг дуурайна (доорх «SQL текст» тест хэллэгийг нь тулгана)
    const gap = t - old.last_at, stale = gap >= 15000;
    if (old.st !== 'away' && p[2] === 'away') old.leaves += 1;
    if (old.st !== 'away' && p[2] !== 'away' && stale) old.gaps += 1;
    if (old.st === 'away' || stale) old.away_ms += gap;
    Object.assign(old, { st: p[2], q: p[3], lesson: p[4], last_at: t });
    return { rows: [] };
  }
  if (q === LIVE_SQL) {
    return { rows: MEM.filter(m => m.classroom_id === p[0]).map(m => {
      const e = m.student_email.toLowerCase(), u = F.db.users.get(e) || {}, r = PRES.get(p[1] + '|' + e);
      // pg: BIGINT → текст, EXTRACT → numeric текст
      return { email: e, first_name: u.first_name || null, last_name: u.last_name || null, st: r ? r.st : null, q: r ? r.q : null, lesson: r ? r.lesson : null,
        leaves: r ? r.leaves : null, gaps: r ? r.gaps : null, away_ms: r ? String(r.away_ms) : null, ago: r ? String((NOW() - r.last_at) / 1000) : null, first_at: r ? new Date(r.first_at) : null };
    }) };
  }
  // api/users.js assignChallenge
  if (q === 'SELECT teacher_email FROM classrooms WHERE id=$1') { const c = CLS.find(x => x.id === Number(p[0])); return { rows: c ? [{ teacher_email: c.teacher_email }] : [] }; }
  if (q === 'SELECT student_email FROM class_members WHERE classroom_id=$1') return { rows: MEM.filter(m => m.classroom_id === Number(p[0])).map(m => ({ student_email: m.student_email })) };
  if (q === 'SELECT challenges FROM users WHERE email=$1') return { rows: [{ challenges: calls.users.get(p[0]) || [] }] };
  if (q === 'UPDATE users SET challenges=$1 WHERE email=$2') { calls.users.set(p[1], JSON.parse(p[0])); return { rows: [] }; }
  if (/^UPDATE classrooms SET challenges = COALESCE\(challenges,'\[\]'::jsonb\) \|\| \$2::jsonb WHERE id=\$1$/.test(q)) { calls.clsCh.push(JSON.parse(p[1])); return { rows: [] }; }
  if (/\b(classrooms|class_members|cm_presence)\b/.test(q)) throw new Error('presence: тодорхойгүй SQL ' + q);
  return null;
});

const BEAT = (body, headers) => { P._t.lastBeat.clear(); return F.call(P, { method: 'POST', query: { action: 'beat' }, body: body, headers: headers || {} }); };
const GET = (action, query, headers) => F.call(P, { method: 'GET', query: Object.assign({ action }, query || {}), headers: headers || {} });
const row = (cid, e) => PRES.get(cid + '|' + e);

beforeEach(() => {
  F.reset(); P._t.reset(); PRES.clear(); SHIFT = 0; BASE = Date.now();
  calls.member = 0; calls.insert.length = 0; calls.users.clear(); calls.clsCh.length = 0;
  setup();
  F.addUser(TEACH, { role: 'teacher' }); F.addUser(OTHER, { role: 'teacher' });
  F.addUser(BAT, { first_name: 'Бат', last_name: 'Дорж' }); F.addUser(DORJ, { first_name: 'Дорж', last_name: '<b>Ану</b>' }); F.addUser(OUT);
});

test('beat: нэвтрэлт, арга, өгөгдлийн шалгалт', async () => {
  assert.strictEqual((await BEAT({ cid: ID.now, st: 'task' })).statusCode, 401, 'токенгүй');
  assert.strictEqual((await BEAT({ cid: ID.now, st: 'task' }, WS(BAT))).statusCode, 401, 'Дасгалын төвийн (ws) токен биш');
  assert.strictEqual((await BEAT({ cid: ID.now, st: 'task' }, ADMIN)).statusCode, 401, 'админ сурагч биш');
  assert.strictEqual((await F.call(P, { method: 'GET', query: { action: 'beat' }, headers: bearer(BAT) })).statusCode, 405);
  for (const b of [{ cid: 'ch_1', st: 'task' }, { cid: 'x' + ID.now, st: 'task' }, { cid: ID.now, st: 'screen' }, { cid: ID.now }, { cid: [ID.now], st: 'task' }]) {
    assert.strictEqual((await BEAT(b, bearer(BAT))).statusCode, 400, JSON.stringify(b));
  }
  assert.strictEqual(PRES.size, 0);
  assert.strictEqual((await GET('nope', {}, bearer(BAT))).statusCode, 400);
});

test('beat: зөвхөн тухайн ангийн гишүүн, цагийн хүрээнд (±10 мин)', async () => {
  assert.strictEqual((await BEAT({ cid: ID.now, st: 'task' }, bearer(OUT))).statusCode, 403, 'өөр ангийн сурагч');
  assert.strictEqual((await BEAT({ cid: ID.soon, st: 'task' }, bearer(BAT))).statusCode, 403, '30 мин дараа эхэлнэ');
  assert.strictEqual((await BEAT({ cid: ID.recent, st: 'task' }, bearer(BAT))).statusCode, 403, '30 мин өмнө дууссан');
  assert.strictEqual((await BEAT({ cid: ID.plain, st: 'task' }, bearer(BAT))).statusCode, 403, 'цаггүй даалгавар');
  assert.strictEqual((await BEAT({ cid: 'ch_1763599999999', st: 'task' }, bearer(BAT))).statusCode, 403, 'байхгүй даалгавар');
  assert.strictEqual(PRES.size, 0);
  const r = await BEAT({ cid: ID.now, st: 'task', q: '3/10', lesson: '705' }, bearer(BAT));
  assert.strictEqual(r.statusCode, 200); assert.deepStrictEqual(r.body, { ok: true });
  assert.deepStrictEqual(Object.assign({}, row(ID.now, BAT), { first_at: 0, last_at: 0 }), { st: 'task', q: '3/10', lesson: '705', first_at: 0, last_at: 0, leaves: 0, gaps: 0, away_ms: 0 });
  // Том жижиг үсэгтэй гишүүнчлэл (Dorj@Mail.mn) → токены жижиг имэйлээр
  assert.strictEqual((await BEAT({ cid: ID.now, st: 'site' }, bearer('DORJ@mail.mn'))).statusCode, 200);
  assert.ok(row(ID.now, DORJ));
  // Цагийн хүрээний ирмэг: 10 мин дотор эхлэх даалгавар зөвшөөрнө
  CLS[0].challenges = JSON.stringify(JSON.parse(CLS[0].challenges).concat([{ id: 'ch_1763500000009', title: 'Удахгүй', lessons: [708], startAt: iso(Date.now() + 8 * MIN), endAt: iso(Date.now() + 60 * MIN) }]));
  assert.strictEqual((await BEAT({ cid: 'ch_1763500000009', st: 'site' }, bearer(BAT))).statusCode, 200, '8 мин дараа эхэлнэ');
});

test('beat: q/lesson цэвэрлэнэ, хэт олон дохиог алгасна (away хэзээ ч алгасахгүй)', async () => {
  await BEAT({ cid: ID.now, st: 'task', q: '3/10<img src=x>', lesson: '705"><script>' }, bearer(BAT));
  assert.strictEqual(row(ID.now, BAT).q, '3/10'); assert.strictEqual(row(ID.now, BAT).lesson, '705script');
  // 2 сек дотор дахин → skip (DB-д хүрэхгүй)
  const n = calls.insert.length;
  const call = body => F.call(P, { method: 'POST', query: { action: 'beat' }, body: body, headers: bearer(BAT) });
  const r = await call({ cid: ID.now, st: 'site' });
  assert.deepStrictEqual(r.body, { ok: true, skip: true }); assert.strictEqual(calls.insert.length, n);
  const a = await call({ cid: ID.now, st: 'away' });
  assert.deepStrictEqual(a.body, { ok: true }); assert.strictEqual(row(ID.now, BAT).st, 'away', 'гарах дохио шууд');
});

test('beat: гарсан (утасны away) ба тасарсан (15+ сек дохиогүй) тусдаа, гадуур хугацаа', async () => {
  const B = st => BEAT({ cid: ID.now, st: st }, bearer(BAT));
  const g = () => { const r = row(ID.now, BAT); return [r.leaves, r.gaps, r.away_ms]; };
  await B('task');
  SHIFT += 5000; await B('task');
  assert.deepStrictEqual(g(), [0, 0, 0]);
  SHIFT += 1000; await B('away');                       // апп сольсон
  assert.deepStrictEqual(g(), [1, 0, 0]);
  SHIFT += 8000; await B('task');                       // 8 сек гадуур
  assert.deepStrictEqual(g(), [1, 0, 8000]);
  SHIFT += 5000; await B('site');
  assert.deepStrictEqual(g(), [1, 0, 8000], 'site — гадуур биш');
  SHIFT += 40000; await B('task');                      // 40 сек дохиогүй (интернэт/дэлгэц) — гарсан биш, тасарсан
  assert.deepStrictEqual(g(), [1, 1, 48000]);
  SHIFT += 1000; await B('away'); SHIFT += 3000; await B('away');   // visibilitychange + pagehide
  assert.deepStrictEqual(g(), [2, 1, 51000], 'дараалсан away нэг л удаа тоологдоно');
  SHIFT += 2000; await B('task');
  SHIFT += 20000; await B('away');                      // 20 сек дохиогүй байгаад хоцорсон away → зөвхөн гарсан (давхар биш)
  assert.deepStrictEqual(g(), [3, 1, 51000 + 2000 + 20000]);
});

test('SQL текст: CASE нөхцөл fake-тэй ижил (өөрчлөгдвөл fake-ийг ч шинэчил)', () => {
  const s = R('api/presence.js').replace(/\s+/g, ' ');
  assert.ok(s.includes("leaves = cm_presence.leaves + CASE WHEN cm_presence.st <> 'away' AND EXCLUDED.st = 'away' THEN 1 ELSE 0 END"));
  assert.ok(s.includes("gaps = cm_presence.gaps + CASE WHEN cm_presence.st <> 'away' AND EXCLUDED.st <> 'away' AND NOW() - cm_presence.last_at >= INTERVAL '15 seconds' THEN 1 ELSE 0 END"));
  assert.ok(s.includes('ALTER TABLE cm_presence ADD COLUMN IF NOT EXISTS gaps INT DEFAULT 0'));
  assert.ok(s.includes("away_ms = cm_presence.away_ms + CASE WHEN cm_presence.st = 'away' OR NOW() - cm_presence.last_at >= INTERVAL '15 seconds' THEN (EXTRACT(EPOCH FROM (NOW() - cm_presence.last_at)) * 1000)::BIGINT ELSE 0 END"));
  assert.ok(s.includes('st = EXCLUDED.st, q = EXCLUDED.q, lesson = EXCLUDED.lesson, last_at = NOW()'));
  assert.ok(/CREATE TABLE IF NOT EXISTS cm_presence \(cid TEXT NOT NULL, email TEXT NOT NULL,.*PRIMARY KEY \(cid, email\)\)/.test(s));
  assert.ok(F.db.ddl.length === 0 || F.db.ddl.every(d => /cm_presence|^ALTER TABLE classrooms/.test(d)));
});

test('beat: эрхийн кэш — DB-г дохио бүрт асуухгүй, цагийн хүрээг тулгасаар', async () => {
  await BEAT({ cid: ID.now, st: 'task' }, bearer(BAT));
  const n = calls.member;
  for (let i = 0; i < 5; i++) await BEAT({ cid: ID.now, st: 'task' }, bearer(BAT));
  assert.strictEqual(calls.member, n, '5 мин кэш');
  // Кэшлэгдсэн ч даалгаврын цаг өнгөрсөн бол татгалзана (кэш нь цагийг хадгалдаг, үр дүнг биш)
  const c = P._t.okCache.get(BAT + '|' + ID.now);
  assert.ok(c && c.w, 'цаг кэшлэгдсэн');
  c.w = { s: Date.now() - 2 * HOUR, e: Date.now() - 11 * MIN };
  assert.strictEqual((await BEAT({ cid: ID.now, st: 'task' }, bearer(BAT))).statusCode, 403);
  assert.strictEqual(calls.member, n);
});

test('mine: өөрийн ангийн цагтай даалгаврууд (дууссаныг, 24 цагаас хойшхийг хасна) + серверийн цаг', async () => {
  assert.strictEqual((await GET('mine')).statusCode, 401);
  assert.strictEqual((await GET('mine', {}, WS(BAT))).statusCode, 401);
  const r = await GET('mine', {}, bearer(BAT));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.member, true);
  assert.ok(Math.abs(r.body.now - Date.now()) < 2000);
  assert.deepStrictEqual(r.body.list.map(x => x.cid).sort(), [ID.now, ID.soon].sort());
  const now = r.body.list.find(x => x.cid === ID.now);
  assert.deepStrictEqual(now.lessons, ['705', '707'], 'хичээлийн дугаар текстээр');
  assert.deepStrictEqual(Object.keys(now).sort(), ['cid', 'endAt', 'lessons', 'startAt', 'title']);
  const o = await GET('mine', {}, bearer('noclass@mail.mn'));
  assert.deepStrictEqual(o.body.list, []); assert.strictEqual(o.body.member, false);
  const t = await GET('mine', {}, bearer(OUT));
  assert.deepStrictEqual(t.body.list, []); assert.strictEqual(t.body.member, true, '777 ангид цагтай даалгавар алга');
});

test('active/live: зөвхөн ангийн багш (эсвэл админ)', async () => {
  assert.strictEqual((await GET('active', { class: 'abc' }, bearer(TEACH, 'teacher'))).statusCode, 400);
  assert.strictEqual((await GET('active', { class: '501' })).statusCode, 403, 'токенгүй');
  assert.strictEqual((await GET('active', { class: '501' }, bearer(OTHER, 'teacher'))).statusCode, 403, 'өөр багш');
  assert.strictEqual((await GET('active', { class: '501' }, bearer(BAT))).statusCode, 403, 'сурагч');
  assert.strictEqual((await GET('live', { class: '501', cid: ID.now }, bearer(BAT))).statusCode, 403);
  assert.strictEqual((await GET('active', { class: '501' }, WS(TEACH))).statusCode, 403, 'ws токен');
  assert.strictEqual((await GET('active', { class: '999' }, bearer(TEACH, 'teacher'))).statusCode, 403, 'байхгүй анги');
  const a = await GET('active', { class: '501' }, bearer(TEACH, 'teacher'));
  assert.strictEqual(a.statusCode, 200);
  // цагтай + дуусаад 2 цаг болоогүй, эхлэх цагаар эрэмбэлсэн (past — 2.5 цагийн өмнө, plain — цаггүй хасагдана)
  assert.deepStrictEqual(a.body.list.map(x => x.cid), [ID.recent, ID.now, ID.soon, ID.far]);
  assert.strictEqual((await GET('active', { class: '501' }, ADMIN)).statusCode, 200);
  assert.strictEqual((await GET('active', { class: '501' }, bearer(' BAGSH@mail.mn ', 'teacher'))).statusCode, 200, 'имэйл том үсэг/зай');
});

test('live: сурагч бүрийн төлөв — task/site/away/lost(дохиогүй)/none, гарсан/тасарсан тоо, гадуур хугацаа', async () => {
  assert.strictEqual((await GET('live', { class: '501', cid: ID.plain }, bearer(TEACH, 'teacher'))).statusCode, 404, 'цаггүй даалгавар');
  assert.strictEqual((await GET('live', { class: '501', cid: 'ch_1' }, bearer(TEACH, 'teacher'))).statusCode, 404);
  await BEAT({ cid: ID.now, st: 'task', q: '4/12', lesson: '705' }, bearer(BAT));
  await BEAT({ cid: ID.now, st: 'site' }, bearer(DORJ));
  let r = await GET('live', { class: '501', cid: ID.now }, bearer(TEACH, 'teacher'));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.challenge.cid, ID.now);
  const by = n => r.body.rows.find(x => x.name === n);
  assert.deepStrictEqual(r.body.rows.map(x => x.name), ['<b>Ану</b> Дорж', 'Дорж Бат', 'nameless'], 'овог нэр, нэргүй бол имэйлийн эхлэл, эрэмбэлсэн');
  assert.deepStrictEqual(Object.assign({}, by('Дорж Бат'), { ago: 0 }), { name: 'Дорж Бат', st: 'task', q: '4/12', ago: 0, leaves: 0, gaps: 0, away: 0, joined: true });
  assert.strictEqual(by('<b>Ану</b> Дорж').st, 'site');
  assert.deepStrictEqual(by('nameless'), { name: 'nameless', st: 'none', q: '', ago: null, leaves: 0, gaps: 0, away: 0, joined: false });
  assert.ok(!JSON.stringify(r.body).includes('@'), 'имэйл задрахгүй');
  // 20 сек дохиогүй → «Холболтгүй» (гарсан гэж андуурахгүй), гадуур хугацаанд одоогийн завсар нэмэгдэнэ
  SHIFT += 20000;
  r = await GET('live', { class: '501', cid: ID.now }, bearer(TEACH, 'teacher'));
  assert.strictEqual(by('Дорж Бат').st, 'lost'); assert.strictEqual(by('Дорж Бат').away, 20); assert.strictEqual(by('Дорж Бат').ago, 20);
  assert.strictEqual(by('<b>Ану</b> Дорж').st, 'lost');
  // Буцаж ирэхэд тасарсан +1 (гарсан биш), гадуур 20 сек хадгалагдана
  await BEAT({ cid: ID.now, st: 'task', q: '5/12', lesson: '705' }, bearer(BAT));
  r = await GET('live', { class: '501', cid: ID.now }, bearer(TEACH, 'teacher'));
  assert.deepStrictEqual([by('Дорж Бат').st, by('Дорж Бат').leaves, by('Дорж Бат').gaps, by('Дорж Бат').away], ['task', 0, 1, 20]);
  // Утас өөрөө гарсан гэж мэдэгдсэн бол хуучирсан ч «Гарсан» хэвээр
  await BEAT({ cid: ID.now, st: 'away' }, bearer(BAT));
  SHIFT += 30000;
  r = await GET('live', { class: '501', cid: ID.now }, bearer(TEACH, 'teacher'));
  assert.deepStrictEqual([by('Дорж Бат').st, by('Дорж Бат').leaves, by('Дорж Бат').away], ['away', 1, 50]);
  // Админ ч харна
  assert.strictEqual((await GET('live', { class: '501', cid: ID.now }, ADMIN)).statusCode, 200);
});

test('DB алдаа → 500, нууц мэдээлэлгүй', async () => {
  F.db.extra.unshift(function (q) { if (/class_members/.test(q)) throw new Error('db down secret-xyz'); return null; });
  try {
    const r = await BEAT({ cid: ID.now, st: 'task' }, bearer(BAT));
    assert.strictEqual(r.statusCode, 500); assert.ok(!JSON.stringify(r.body).includes('secret'));
  } finally { F.db.extra.shift(); }
});

// ── api/users.js assignChallenge: цагийн хүрээ ──
const PUT = (as, role, body) => F.call(users, { method: 'PUT', headers: bearer(as, role), body: Object.assign({ email: as }, body) });
test('assignChallenge: startAt/endAt — зөв бол хадгална, буруу бол татгалзана, байхгүй бол хуучин хэвээр', async () => {
  const base = { action: 'assignChallenge', classroomId: 501, title: 'Цагтай', lessons: [705] };
  const s = Date.now() + 10 * MIN, e = s + 50 * MIN;
  const ok = await PUT(TEACH, 'teacher', Object.assign({ startAt: iso(s), endAt: iso(e), dueDate: '2026-11-19' }, base));
  assert.strictEqual(ok.body.ok, true, JSON.stringify(ok.body));
  assert.strictEqual(ok.body.challenge.startAt, iso(s)); assert.strictEqual(ok.body.challenge.endAt, iso(e));
  assert.match(ok.body.challenge.id, /^ch_\d{13}$/, 'presence.js-ийн cid шалгалттай нийцнэ');
  assert.strictEqual(calls.clsCh.length, 1); assert.strictEqual(calls.clsCh[0][0].startAt, iso(s), 'ангийн эх хувьд ч');
  assert.strictEqual(calls.users.get(BAT).slice(-1)[0].endAt, iso(e));
  const bad = [
    { startAt: iso(s) },                                        // ганцаараа
    { endAt: iso(e) },
    { startAt: iso(e), endAt: iso(s) },                         // дуусах < эхлэх
    { startAt: iso(s), endAt: iso(s) },
    { startAt: iso(s), endAt: iso(s + 9 * HOUR) },              // 8 цагаас урт
    { startAt: iso(Date.now() - 2 * 864e5), endAt: iso(Date.now() - 2 * 864e5 + HOUR) },   // 2 хоногийн өмнө
    { startAt: 'маргааш', endAt: 'нөгөөдөр' },
  ];
  for (const b of bad) {
    const r = await PUT(TEACH, 'teacher', Object.assign({}, base, b));
    assert.strictEqual(r.body.ok, false, JSON.stringify(b)); assert.strictEqual(r.body.error, 'Эхлэх, дуусах цаг буруу байна');
  }
  assert.strictEqual(calls.clsCh.length, 1, 'буруу үед юу ч хадгалахгүй');
  const plain = await PUT(TEACH, 'teacher', base);
  assert.strictEqual(plain.body.ok, true);
  assert.ok(!('startAt' in plain.body.challenge) && !('endAt' in plain.body.challenge), 'цаггүй — өмнөх шиг');
  assert.strictEqual((await PUT(OTHER, 'teacher', Object.assign({ startAt: iso(s), endAt: iso(e) }, base))).statusCode, 403);
});

// ── index.html, worksheets.html, vercel.json ──
test('index.html: цаг оруулах талбар, doAssignChallenge startAt/endAt илгээнэ, cm-live.js ачаална', () => {
  const h = R('index.html');
  assert.ok(/<input id="ch-start" type="time"/.test(h) && /<input id="ch-end" type="time"/.test(h));
  const i = h.indexOf('window.doAssignChallenge = function'), fn = h.slice(i, h.indexOf('\n  };', i));
  assert.ok(i > 0 && /getElementById\('ch-start'\)/.test(fn) && /getElementById\('ch-end'\)/.test(fn));
  assert.ok(/startAt: startAt,\s*endAt: endAt/.test(fn), 'PUT body-д');
  assert.ok(/new Date\(dd \+ 'T' \+ tS \+ ':00'\)/.test(fn) && /toISOString\(\)/.test(fn), 'багшийн цагийн бүсээр → ISO');
  assert.ok(h.includes('window.cmCurClassroom = function () { return _currentClassroomId; };'));
  assert.ok(h.includes('window.cmQuizState = function () {'));
  assert.ok(h.includes('<script src="/cm-live.js?v=1" defer></script>'));
  assert.ok(R('worksheets.html').includes('<script src="/cm-live.js?v=1" defer></script>'));
});

test('vercel.json: /api/presence маршрут + cm-live.js static', () => {
  const v = JSON.parse(R('vercel.json'));
  assert.ok(v.builds.some(b => b.src === 'cm-live.js' && b.use === '@vercel/static'));
  assert.ok(v.routes.some(r => r.src === '/api/presence' && r.dest === '/api/presence.js'));
});

// ── cm-live.js клиент (vm) ──
function client(o) {
  o = o || {};
  const T = { now: Date.now(), created: 0 }, ls = new Map(), sent = [], timers = [], intervals = [], listeners = {}, wl = {};
  if (o.user !== null) ls.set('cm_current', JSON.stringify(o.user || { email: BAT, role: 'student' }));
  if (o.token !== null) ls.set('cm_token', o.token || 'tok-1');
  const els = new Map();
  const mk = (id, extra) => Object.assign({ id: id, style: {}, isConnected: true, innerHTML: '', parentNode: null, ev: {},
    addEventListener(t, f) { this.ev[t] = f; }, remove() { this.isConnected = false; },
    insertBefore(n) { n.parentNode = this; n.isConnected = true; return n; }, appendChild(n) { n.isConnected = true; return n; } }, extra || {});
  const doc = { hidden: false, focus: true, head: mk('head'), hasFocus() { return this.focus; },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    getElementById(id) { return els.get(id) || null; }, createElement(tag) { T.created++; return mk('', { tag: tag }); } };
  class FDate extends Date { static now() { return T.now; } }
  const win = {
    document: doc, Date: FDate,
    localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null) },
    getComputedStyle: el => ({ display: el.style.display || 'block' }),
    setInterval: (f, ms) => { intervals.push({ f, ms }); return intervals.length; },
    setTimeout: (f, ms) => { timers.push({ f, ms }); return timers.length; }, clearTimeout: () => {},
    addEventListener: (t, f) => { (wl[t] = wl[t] || []).push(f); },
    fetch: (url, opt) => {
      sent.push({ url: url, opt: opt || {}, body: opt && opt.body ? JSON.parse(opt.body) : null });
      let j = { ok: true };
      if (/action=mine/.test(url)) j = { ok: true, now: T.now + (o.skew || 0), member: o.member !== false, list: o.mine || [] };
      if (/action=active/.test(url)) j = o.active || { ok: true, now: T.now, list: [] };
      if (/action=live/.test(url)) j = o.live || { ok: false };
      return Promise.resolve({ json: () => Promise.resolve(j) });
    },
  };
  win.window = win; win.top = win; win.self = win;
  if (o.quiz) win.cmQuizState = () => o.quiz();
  if (o.cls) win.cmCurClassroom = () => o.cls;
  vm.createContext(win);
  vm.runInContext(R('cm-live.js'), win, { filename: 'cm-live.js' });
  const iv = ms => intervals.find(x => x.ms === ms).f;
  return { win, doc, T, sent, timers, els, mk, tick: iv(5000), watch: iv(1000),
    beats: () => sent.filter(s => /action=beat/.test(s.url)), mines: () => sent.filter(s => /action=mine/.test(s.url)).length,
    fire: t => (listeners[t] || []).forEach(f => f()) };
}
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r)); };
const ch = (cid, s, e, lessons) => ({ cid: cid, title: 'Т', lessons: lessons || ['705'], startAt: iso(s), endAt: iso(e) });

test('cm-live: сурагч зөвхөн даалгаврын цагт дохио илгээнэ — task/site/away, гарахад шууд', async () => {
  const t0 = Date.now();
  let qs = { open: true, lesson: '705', q: '3/10' };
  const c = client({ mine: [ch(ID.now, t0 - MIN, t0 + HOUR), ch(ID.soon, t0 + 30 * MIN, t0 + 2 * HOUR, ['706'])], quiz: () => qs });
  c.tick(); await flush();                                   // эхний tick: жагсаалт татна
  assert.strictEqual(c.mines(), 1);
  assert.strictEqual(c.sent[0].opt.headers.Authorization, 'Bearer tok-1');
  c.tick(); await flush();
  let b = c.beats();
  assert.strictEqual(b.length, 1);
  assert.deepStrictEqual(b[0].body, { cid: ID.now, st: 'task', q: '3/10', lesson: '705' });
  assert.strictEqual(b[0].opt.method, 'POST'); assert.strictEqual(b[0].opt.keepalive, false);
  qs = { open: false, lesson: null, q: '' }; c.tick();
  assert.deepStrictEqual(c.beats()[1].body, { cid: ID.now, st: 'site', q: '', lesson: '' });
  qs = { open: true, lesson: '999', q: '1/5' }; c.tick();        // даалгаврын бус хичээл
  assert.strictEqual(c.beats()[2].body.st, 'site'); assert.strictEqual(c.beats()[2].body.lesson, '999');
  c.doc.focus = false; c.tick();                                // өөр цонх руу шилжсэн (компьютер)
  assert.strictEqual(c.beats()[3].body.st, 'away');
  c.doc.focus = true; c.doc.hidden = true; c.fire('visibilitychange');   // апп сольсон / дэлгэц унтарсан
  b = c.beats(); assert.strictEqual(b[4].body.st, 'away'); assert.strictEqual(b[4].opt.keepalive, true);
  c.tick(); assert.strictEqual(c.beats().length, 5, 'нуугдсан үед tick дохио илгээхгүй');
  c.doc.hidden = false; qs = { open: true, lesson: '705', q: '4/10' }; c.fire('visibilitychange');
  assert.deepStrictEqual(c.beats()[5].body, { cid: ID.now, st: 'task', q: '4/10', lesson: '705' }, 'буцаж ирэхэд шууд');
  c.T.now = t0 + HOUR + MIN; c.tick(); await flush();
  assert.deepStrictEqual(c.beats()[6].body, { cid: ID.soon, st: 'site', q: '', lesson: '705' }, 'дараагийн цагтай даалгавар (706) руу шилжинэ');
  c.T.now = t0 + 3 * HOUR; c.tick(); await flush(); c.tick();
  assert.strictEqual(c.beats().length, 7, 'бүх даалгаврын цаг дууссаны дараа дохиогүй');
  assert.strictEqual(c.T.created, 0, 'сурагчид юу ч харуулахгүй (эзэмшигчийн шийдвэр)');
});

test('cm-live: багш, нэвтрээгүй хүн дохио илгээхгүй; цагийг серверийнхээр (утасны цаг буруу)', async () => {
  const t0 = Date.now();
  const tch = client({ user: { email: TEACH, role: 'teacher' }, mine: [ch(ID.now, t0 - MIN, t0 + HOUR)] });
  tch.tick(); await flush(); tch.tick();
  assert.strictEqual(tch.sent.length, 0, 'багш');
  const g = client({ user: { email: TEACH, grade: 'teacher' } }); g.tick(); assert.strictEqual(g.sent.length, 0, 'grade=teacher');
  const anon = client({ user: null, token: null }); anon.tick(); assert.strictEqual(anon.sent.length, 0);
  const notok = client({ token: null }); notok.tick(); assert.strictEqual(notok.sent.length, 0, 'токенгүй');
  // Утасны цаг 1 цаг хоцорсон: сервер «одоо» = t0 гэж хэлнэ → даалгаврын хугацаанд гэж тооцно
  const s = client({ mine: [ch(ID.now, t0 - MIN, t0 + 30 * MIN)], skew: HOUR });
  s.T.now = t0 - HOUR;
  s.tick(); await flush(); s.tick();
  assert.strictEqual(s.beats().length, 1);
  // Эсрэгээр: утасны цаг 1 цаг түрүүлсэн ч сервер даалгавар дууссан гэж үзвэл дохиогүй
  const f = client({ mine: [ch(ID.now, t0 - 2 * HOUR, t0 - HOUR + MIN)], skew: -HOUR });
  f.T.now = t0;                                              // утас: t0, сервер: t0-1ц → хүрээнд
  f.tick(); await flush(); f.tick();
  assert.strictEqual(f.beats().length, 1);
});

test('cm-live: жагсаалтыг 2 мин тутам (ангигүй бол 10 мин), шинэ хичээл нээхэд эрт шинэчилнэ', async () => {
  let qs = { open: false };
  const c = client({ mine: [], quiz: () => qs });
  c.tick(); await flush(); assert.strictEqual(c.mines(), 1);
  c.T.now += 60000; c.tick(); await flush(); assert.strictEqual(c.mines(), 1);
  c.T.now += 61000; c.tick(); await flush(); assert.strictEqual(c.mines(), 2, '2 мин');
  c.T.now += 31000; qs = { open: true, lesson: '705', q: '1/9' }; c.tick(); await flush();
  assert.strictEqual(c.mines(), 3, 'хичээл нээсэн → шууд (сая оноосон даалгавар байж болно)');
  c.T.now += 5000; c.tick(); await flush(); assert.strictEqual(c.mines(), 3, 'ижил хичээл дахин татахгүй');
  c.T.now += 5000; qs = { open: true, lesson: '706', q: '1/9' }; c.tick(); await flush();
  assert.strictEqual(c.mines(), 3, '30 сек дотор дахин татахгүй');
  const n = client({ mine: [], member: false });
  n.tick(); await flush();
  n.T.now += 5 * MIN; n.tick(); await flush(); assert.strictEqual(n.mines(), 1, 'ангигүй — 10 мин');
  n.T.now += 6 * MIN; n.tick(); await flush(); assert.strictEqual(n.mines(), 2);
});

test('cm-live: багшийн «Шууд хяналт» — ангийн цонх нээлттэй, явагдаж буй даалгавартай үед; 5 сек; HTML escape', async () => {
  const t0 = Date.now();
  const rows = [{ name: '<img src=x onerror=1>', st: 'task', q: '2/8', ago: 1, leaves: 0, away: 0, joined: true },
    { name: 'Дорж', st: 'away', q: '', ago: 25, leaves: 2, away: 95, joined: true }, { name: 'Сараа', st: 'none', q: '', ago: null, leaves: 0, away: 0, joined: false },
    { name: 'Болд', st: 'lost', q: '', ago: 40, leaves: 0, gaps: 1, away: 40, joined: true }, { name: 'Х', st: 'x"><b>', q: '', ago: 1, leaves: 0, away: 0, joined: true }];
  const cur = Object.assign(ch(ID.now, t0 - 5 * MIN, t0 + 50 * MIN), { title: 'Тэгшитгэл <script>' });
  const c = client({ user: { email: TEACH, role: 'teacher' }, cls: 501, live: { ok: true, now: t0, challenge: cur, rows: rows },
    active: { ok: true, now: t0, list: [cur, ch(ID.far, t0 + 48 * HOUR, t0 + 49 * HOUR)] } });
  c.watch(); await flush();
  assert.strictEqual(c.sent.length, 0, 'ангийн цонх хаалттай');
  const created = [];
  const modal = c.mk('classroom-detail-modal'), anchor = c.mk('live-class-dashboard');
  anchor.parentNode = c.mk('wrap', { insertBefore(n, ref) { assert.strictEqual(ref, anchor); created.push(n); n.parentNode = this; n.isConnected = true; return n; } });
  c.els.set('classroom-detail-modal', modal); c.els.set('live-class-dashboard', anchor);
  modal.style.display = 'flex';
  c.watch(); await flush();
  assert.ok(c.sent.some(s => s.url === '/api/presence?action=active&class=501'));
  assert.ok(c.sent.some(s => s.url === '/api/presence?action=live&class=501&cid=' + ID.now), 'явагдаж буйг сонгоно (48 цагийн дараахыг биш)');
  assert.strictEqual(c.beats().length, 0);
  assert.strictEqual(created.length, 1, 'самбар live-class-dashboard-ийн өмнө');
  assert.ok(/1 мин 35 сек/.test(created[0].innerHTML), 'тоо нэгжээсээ салахгүй (NBSP)');
  const html = created[0].innerHTML.replace(/ /g, ' ');
  assert.ok(html.includes('Шууд хяналт'));
  assert.ok(html.includes('Даалгавар дээр: 1') && html.includes('Сайтын өөр хэсэгт: 0') && html.includes('Гарсан: 1') && html.includes('Холболтгүй: 1'));
  assert.ok(html.includes('Ороогүй: 2') && !html.includes('x"><b>'), 'танихгүй төлөв → Ороогүй (class-д юм шургуулахгүй)');
  assert.ok(html.includes('<span class="p lost">Холболтгүй · 40 сек</span>') && html.includes('1 удаа тасарсан · гадуур 40 сек'), 'интернэт тасарсныг гарсан гэж андуурахгүй');
  assert.ok(html.includes('&lt;img src=x onerror=1&gt;') && !html.includes('<img'), 'нэр escape');
  assert.ok(html.includes('Тэгшитгэл &lt;script&gt;') && !html.includes('<script'), 'гарчиг escape');
  assert.ok(html.includes('Гарсан · 25 сек<') && html.includes('2 удаа гарсан · гадуур 1 мин 35 сек'), 'гарсан тоо, гадуур хугацаа нэрийн доор');
  assert.ok(html.includes('Даалгавар · 2/8'));
  assert.ok(!/<th[^>]*>Гарсан</.test(html), 'утсанд багтах 2 багана');
  assert.ok(!html.includes('<select'), 'нэг л даалгавар → сонголтгүй');
  assert.ok(c.timers.some(t => t.ms === 5000), '5 сек тутам шинэчилнэ');
  modal.style.display = 'none'; c.watch();
  assert.strictEqual(created[0].isConnected, false, 'цонх хаахад самбар арилна');
  // Явагдаж буй даалгаваргүй анги → самбаргүй
  const e = client({ user: { email: TEACH, role: 'teacher' }, cls: 502, active: { ok: true, now: t0, list: [ch(ID.far, t0 + 48 * HOUR, t0 + 49 * HOUR)] } });
  const m2 = e.mk('classroom-detail-modal'), a2 = e.mk('live-class-dashboard'), made = [];
  a2.parentNode = e.mk('w', { insertBefore(n) { made.push(n); return n; } });
  e.els.set('classroom-detail-modal', m2); e.els.set('live-class-dashboard', a2); m2.style.display = 'flex';
  e.watch(); await flush();
  assert.strictEqual(made.length, 0); assert.ok(!e.sent.some(s => /action=live/.test(s.url)));
});
