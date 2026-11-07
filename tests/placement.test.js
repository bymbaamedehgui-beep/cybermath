// Түвшин тогтоох сорил — api/placement.js + api/_placement.js (бодит DB 0 — tests/_gamefake.js + энд nodes/questions/placement_results).
//   2026-11-07 эзэмшигч: анги бүрт сорил, аль сэдвээс эхлэхийг нарийвчлан; зөв хариу клиентэд очихгүй; багш ангийнхаа дүнг харна.
// Ажиллуулах: node --test tests/placement.test.js
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const api = require(path.join(F.API, 'placement.js'));
const PL = require(path.join(F.API, '_placement.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const bearer = (e) => ({ authorization: 'Bearer ' + jwt.sign({ email: e, role: 'student', tv: 0 }, SEC) });
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, SEC) };

// ── Хуурамч сан: 7-р анги 701–761 (сэдэв бүрт 6 тохирох бодлого), 9-р анги 1–6 (5 = «Бататгал 1») ──
const NODES = [];
for (let id = 701; id <= 761; id++) NODES.push({ id, grade: '7', name: 'Сэдэв ' + id });
for (let id = 1; id <= 6; id++) NODES.push({ id, grade: '9', name: id === 5 ? 'Бататгал 1' : 'Сэдэв ' + id });
const QS = [];
let qid = 1000;
NODES.forEach(n => { for (let k = 0; k < 6; k++) QS.push({ id: ++qid, node_id: n.id, text: 'Q' + n.id + '-' + k, choices: ['A' + n.id, 'B' + n.id, 'C' + n.id, 'D' + n.id], correct: 'A' + n.id, difficulty: k ? 'medium' : 'hard', type: 'choice', image: null, is_exam: false }); });
const PR = [];       // placement_results
const CLS = [{ id: 501, name: '7А анги', grade: '7', teacher_email: 'Bagsh@Mail.mn' }];
const MEM = [{ classroom_id: 501, student_email: 'bat@mail.mn' }, { classroom_id: 501, student_email: 'dorj@mail.mn' }];
F.db.extra.push(function (q, p) {
  if (/^SELECT n\.id, n\.name, COUNT\(q\.id\)::int AS cnt FROM nodes n LEFT JOIN questions q/.test(q)) {
    return { rows: NODES.filter(n => n.grade === p[0]).map(n => ({ id: n.id, name: n.name, cnt: QS.filter(x => x.node_id === n.id).length })) };
  }
  if (/^SELECT id, node_id, text, choices, correct, difficulty, type, image, is_exam FROM \( SELECT q\.id/.test(q)) {
    const out = [];
    p[0].forEach(t => { QS.filter(x => x.node_id === t).sort((a, b) => (a.difficulty === 'hard') - (b.difficulty === 'hard')).slice(0, 6).forEach(x => out.push(x)); });
    return { rows: out };
  }
  if (q === 'SELECT id, correct FROM questions WHERE id = ANY($1::bigint[])') return { rows: QS.filter(x => p[0].map(Number).indexOf(x.id) >= 0).map(x => ({ id: x.id, correct: x.correct })) };
  if (/^INSERT INTO placement_results/.test(q)) {
    const row = { id: PR.length + 1, email: p[0], grade: p[1], score: p[2], total: p[3], start_node: p[4], start_name: p[5], start_chapter: p[6], detail: JSON.parse(p[7]), created_at: new Date(Date.now() + PR.length) };
    PR.push(row); return { rows: [{ id: row.id, created_at: row.created_at }] };
  }
  if (/^SELECT DISTINCT ON \(grade\) grade, score/.test(q)) {
    const by = {}; PR.filter(r => r.email === p[0]).forEach(r => { if (!by[r.grade] || by[r.grade].created_at < r.created_at) by[r.grade] = r; });
    return { rows: Object.keys(by).sort().map(k => by[k]) };
  }
  if (q === 'SELECT id, name, grade, teacher_email FROM classrooms WHERE id = $1') return { rows: CLS.filter(c => c.id === p[0]) };
  if (/^SELECT cm\.student_email AS email, u\.first_name/.test(q)) {
    return { rows: MEM.filter(m => m.classroom_id === p[0]).map(m => {
      const u = F.db.users.get(m.student_email) || {};
      const last = PR.filter(r => r.email === m.student_email).sort((a, b) => b.created_at - a.created_at)[0] || {};
      return Object.assign({ email: m.student_email, first_name: u.first_name || null, last_name: u.last_name || null }, last);
    }) };
  }
  return null;
});

const call = (action, o) => F.call(api, Object.assign({ query: Object.assign({ action }, (o && o.query) || {}) }, o || {}));
const POST = (action, body, headers) => F.call(api, { query: { action }, body: body || {}, headers: headers || {} });
const nodeOf = (q) => +/^Q(\d+)-/.exec(q.text)[1];
// wrong: node id-уудын олонлог — тэдгээрт буруу (B…), бусдад зөв (A…) хариулна
const answers = (qs, wrong) => qs.map(q => { const n = nodeOf(q); return (wrong && wrong.has(n) ? 'B' : 'A') + n; });

beforeEach(() => { F.reset(); PR.length = 0; });

test('_placement: 7-р анги 10 бүлэг (SPLITS), 1-р шат 18 сэдэв, 2-р шат ≤ 8; бататгал сэдэв биш', async () => {
  const chs = await PL.chapters('7');
  assert.strictEqual(chs.length, 10);
  assert.strictEqual(chs[0].name, 'Бүхэл тоо, зэрэг, язгуур');
  assert.deepStrictEqual(chs[0].topics.map(t => t.id), [701, 702, 703, 704, 705, 706, 707]);
  assert.strictEqual(chs[9].topics[0].id, 753);
  const s1 = PL.stage1(chs);
  assert.strictEqual(s1.length, PL.STAGE1_MAX);
  chs.forEach(c => assert.ok(s1.some(x => x.c === c.i), 'бүлэг бүрээс ' + c.name));
  const s2 = PL.stage2(chs[8], s1.map(x => x.t));
  assert.ok(s2.length <= PL.STAGE2_MAX && s2.length > 0);
  assert.ok(s2.every(x => s1.every(y => y.t !== x.t)), '1-р шатныхыг давтахгүй');
  const c9 = await PL.chapters('9');
  assert.ok(c9[0].topics.every(t => t.name !== 'Бататгал 1'));
});

test('plan: нийтийн, бүлэг ба бодлогын тоо; 11-р анги «удахгүй», 5-р анги байхгүй', async () => {
  const r = await F.call(api, { method: 'GET', query: { action: 'plan', grade: '7' } });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.chapters.length, 10);
  assert.strictEqual(r.body.questions, 18);
  assert.match(r.headers['Cache-Control'], /public/);
  const s = await F.call(api, { method: 'GET', query: { action: 'plan', grade: '11' } });
  assert.strictEqual(s.statusCode, 400); assert.strictEqual(s.body.soon, true);
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'plan', grade: '5' } })).statusCode, 400);
});

test('start: зөв хариу клиентэд очихгүй, сонголт 4, токентой', async () => {
  const r = await POST('start', { grade: '7' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.questions.length, 18);
  assert.ok(r.body.t);
  r.body.questions.forEach(q => {
    assert.deepStrictEqual(Object.keys(q).sort(), ['chapter', 'choices', 'k', 'text']);
    assert.strictEqual(q.choices.length, 4);
  });
  assert.doesNotMatch(JSON.stringify(r.body), /"correct"/);
});

test('бүгд зөв → 1-р шатанд дуусна: эхлэх сэдэвгүй, бүх бүлэг эзэмшсэн; зочин хадгалагдахгүй', async () => {
  const s = await POST('start', { grade: '7' });
  const r = await POST('submit', { t: s.body.t, answers: answers(s.body.questions) });
  assert.strictEqual(r.body.done, true);
  assert.strictEqual(r.body.saved, false);
  const res = r.body.result;
  assert.strictEqual(res.start, null);
  assert.strictEqual(res.frontier, -1);
  assert.strictEqual(res.percent, 100);
  assert.ok(res.chapters.every(c => c.status === 'mastered'));
  assert.strictEqual(PR.length, 0);
});

test('сул бүлэг → 2-р шат тэр бүлгийн сэдвүүд → эхлэх сэдэв = анх буруу хариулсан сэдэв; нэвтэрсэн бол хадгална', async () => {
  F.addUser('bat@mail.mn', { first_name: 'Бат', last_name: 'Дорж' });
  const s = await POST('start', { grade: '7' }, bearer('bat@mail.mn'));
  // 3-р бүлэг (715–718 «Текст бодлого, процент») ба 9-р бүлгийн (743–752) 1-р шатанд орсон нэг сэдэв буруу
  const later = s.body.questions.map(nodeOf).find(n => n >= 743 && n <= 752);
  const wrong1 = new Set(s.body.questions.map(nodeOf).filter(n => (n >= 715 && n <= 718) || n === later));
  assert.ok(wrong1.size >= 2 && later);
  const r1 = await POST('submit', { t: s.body.t, answers: answers(s.body.questions, wrong1) });
  assert.strictEqual(r1.body.stage, 2);
  assert.strictEqual(r1.body.chapter, 'Текст бодлого, процент');
  const st2 = r1.body.questions.map(nodeOf);
  assert.ok(st2.length >= 1 && st2.every(n => n >= 715 && n <= 718));
  // 2-р шатанд 716-д буруу (бусад зөв) → эхлэх сэдэв: бүлгийн дотор анх буруу гарсан нь
  const r2 = await POST('submit', { t: r1.body.t, answers: answers(r1.body.questions, new Set([716])) }, bearer('bat@mail.mn'));
  assert.strictEqual(r2.body.done, true);
  assert.strictEqual(r2.body.saved, true);
  const res = r2.body.result;
  const firstWrong = [715, 716, 717, 718].find(n => wrong1.has(n) || n === 716);
  assert.strictEqual(res.start.id, firstWrong);
  assert.strictEqual(res.start.chapter, 'Текст бодлого, процент');
  assert.strictEqual(res.chapters[2].status === 'mastered', false);
  assert.ok(res.chapters.slice(0, 2).every(c => c.status === 'mastered'), 'өмнөх бүлгүүд эзэмшсэн');
  assert.ok(res.review.some(t => t.id === later), 'хойд бүлгийн буруу сэдэв «анхаарах»-д');
  assert.strictEqual(PR.length, 1);
  assert.strictEqual(PR[0].email, 'bat@mail.mn');
  assert.strictEqual(PR[0].start_node, firstWrong);
  // mine
  const m = await F.call(api, { method: 'GET', query: { action: 'mine' }, headers: bearer('bat@mail.mn') });
  assert.strictEqual(m.body.results.length, 1);
  assert.strictEqual(m.body.results[0].start_node, firstWrong);
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'mine' } })).statusCode, 401);
});

test('class: зөвхөн ангийн багш эсвэл админ; сурагч бүрийн сүүлийн дүн, өгөөгүй нь null', async () => {
  F.addUser('bagsh@mail.mn', { role: 'teacher' }); F.addUser('bat@mail.mn', { first_name: 'Бат', last_name: 'Дорж' }); F.addUser('dorj@mail.mn'); F.addUser('busad@mail.mn');
  const s = await POST('start', { grade: '7' }, bearer('bat@mail.mn'));
  await POST('submit', { t: s.body.t, answers: answers(s.body.questions) }, bearer('bat@mail.mn'));
  const r = await F.call(api, { method: 'GET', query: { action: 'class', classroom_id: '501' }, headers: bearer('bagsh@mail.mn') });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.classroom.name, '7А анги');
  const bat = r.body.students.find(x => x.email === 'bat@mail.mn'), dorj = r.body.students.find(x => x.email === 'dorj@mail.mn');
  assert.strictEqual(bat.name, 'Дорж Бат');
  assert.strictEqual(bat.percent, 100);
  assert.strictEqual(dorj.at, null);
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'class', classroom_id: '501' }, headers: bearer('busad@mail.mn') })).statusCode, 403);
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'class', classroom_id: '501' } })).statusCode, 401);
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'class', classroom_id: '501' }, headers: ADMIN })).statusCode, 200);
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'class', classroom_id: '999' }, headers: ADMIN })).statusCode, 404);
});

test('токен: хуурамч/өөрчилсөн → 400 expired; хариу хоосон → буруу гэж тооцно; GET submit → 405', async () => {
  const bad = await POST('submit', { t: 'abc', answers: [] });
  assert.strictEqual(bad.statusCode, 400); assert.strictEqual(bad.body.expired, true);
  const forged = jwt.sign({ typ: 'pl', g: '7', s: 1, i: [] }, SEC);   // JWT_SECRET-ээр шууд (тусдаа түлхүүр биш)
  assert.strictEqual((await POST('submit', { t: forged, answers: [] })).statusCode, 400);
  const s = await POST('start', { grade: '7' });
  const r = await POST('submit', { t: s.body.t, answers: [] });
  assert.strictEqual(r.body.stage, 2, 'бүх хариу хоосон → эхний бүлэг сул');
  assert.strictEqual(r.body.chapter, 'Бүхэл тоо, зэрэг, язгуур');
  assert.strictEqual((await F.call(api, { method: 'GET', query: { action: 'submit' } })).statusCode, 405);
});
