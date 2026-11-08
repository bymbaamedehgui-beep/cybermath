// Суралцах сесс — api/sessions.js + api/_sessions.js (бодит DB 0 — tests/_gamefake.js + энд study_sessions/classrooms/class_members).
//   2026-11-08 эзэмшигч: ангийн багш сурагч бүрийн хичээл/тестэд зарцуулсан минут, хэдэн удаа нээсэн, дундаас хаасан,
//   цонхноос гарсан, дэлгэцийн зураг авах оролдлогыг харна. «Тест» = зөвхөн багшийн оноосон (ангийн хичээл + даалгавар).
// Ажиллуулах: node --test tests/sessions.test.js
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const api = require(path.join(F.API, 'sessions.js'));
const SS = require(path.join(F.API, '_sessions.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const bearer = (e, role) => ({ authorization: 'Bearer ' + jwt.sign({ email: e, role: role || 'student', tv: 0 }, SEC) });
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, SEC) };

// ── Хуурамч сан ──
const ROWS = [];   // study_sessions
const CLS = [
  { id: 501, name: '7А анги', grade: '7', teacher_email: 'bagsh@mail.mn', challenges: [{ id: 'ch_1', lessons: [705, '706'], classroomId: 501 }] },
  { id: 777, name: 'Өөр анги', grade: '7', teacher_email: 'other@mail.mn', challenges: [] }
];
const MEM = [{ classroom_id: 501, student_email: 'bat@mail.mn' }, { classroom_id: 501, student_email: 'dorj@mail.mn' }, { classroom_id: 777, student_email: 'bat@mail.mn' }];
F.db.extra.push(function (q, p) {
  if (/^INSERT INTO study_sessions /.test(q)) {
    const k = p[1] + '|' + p[0], old = ROWS.find(r => r.email + '|' + r.sid === k);
    const row = { sid: p[0], email: p[1], kind: p[2], ref: p[3], ref_name: p[4], classroom_id: p[5], started_at: p[6], ended_at: p[7] ? new Date() : null,
      active_sec: p[8], total_sec: p[9], leaves: p[10], shots: p[11], completed: p[12], closed_early: p[13], score: p[14], total: p[15], secure: p[16] };
    if (!old) { ROWS.push(row); return { rows: [] }; }
    old.ended_at = old.ended_at || row.ended_at;
    ['active_sec', 'total_sec', 'leaves', 'shots'].forEach(f => { old[f] = Math.max(old[f], row[f]); });
    const done = old.completed || row.completed;
    old.closed_early = !done && (old.closed_early || row.closed_early); old.completed = done;
    if (row.score != null) old.score = row.score; if (row.total != null) old.total = row.total;
    old.secure = old.secure || row.secure;
    return { rows: [] };
  }
  if (q === 'SELECT id, name, grade, teacher_email, challenges FROM classrooms WHERE id = $1') return { rows: CLS.filter(c => c.id === p[0]) };
  if (/^SELECT cm\.student_email AS email, u\.first_name, u\.last_name FROM class_members cm LEFT JOIN users u/.test(q)) {
    return { rows: MEM.filter(m => m.classroom_id === p[0]).map(m => { const u = F.db.users.get(m.student_email) || {}; return { email: m.student_email, first_name: u.first_name || null, last_name: u.last_name || null }; }) };
  }
  if (/^SELECT email, kind, ref, ref_name, classroom_id, started_at, ended_at, active_sec, total_sec, leaves, shots, completed, closed_early, score, total, secure FROM study_sessions/.test(q)) {
    return { rows: ROWS.filter(r => p[0].indexOf(r.email.toLowerCase()) >= 0 && new Date(r.started_at) >= p[1]).sort((a, b) => new Date(b.started_at) - new Date(a.started_at)).slice(0, p[2]) };
  }
  if (q === 'SELECT 1 FROM class_members WHERE classroom_id = $1 AND lower(student_email) = $2') return { rows: MEM.filter(m => m.classroom_id === p[0] && m.student_email === p[1]).map(() => ({ '?column?': 1 })) };
  return null;
});

const POST = (body, headers) => F.call(api, { method: 'POST', query: { action: 'log' }, body: body, headers: headers || {} });
const GET = (action, query, headers) => F.call(api, { method: 'GET', query: Object.assign({ action }, query), headers: headers || {} });
let n = 0;
const sess = (o) => Object.assign({ sid: 'sid' + String(++n).padStart(6, '0'), kind: 'lesson', ref: '701', ref_name: 'Сэдэв 701', started_at: Date.now() - 3600000,
  active_sec: 300, total_sec: 360, leaves: 0, shots: 0 }, o || {});

beforeEach(() => { F.reset(); ROWS.length = 0; F.addUser('bat@mail.mn', { first_name: 'Бат', last_name: 'Дорж' }); F.addUser('dorj@mail.mn', { first_name: 'Дорж', last_name: 'Бат' });
  F.addUser('bagsh@mail.mn', { role: 'teacher' }); F.addUser('other@mail.mn', { role: 'teacher' }); });

test('clean: sid/kind/ref шалгана, хугацааг хязгаарлана, идэвхтэй ≤ нийт, хуучин эхлэл → одоо', () => {
  const now = Date.now();
  assert.strictEqual(SS.clean({ sid: 'x', kind: 'lesson', ref: '1' }, now), null, 'богино sid');
  assert.strictEqual(SS.clean({ sid: 'abcdefgh', kind: 'quiz', ref: '1' }, now), null, 'kind');
  assert.strictEqual(SS.clean({ sid: 'abcdefgh', kind: 'lesson', ref: '' }, now), null, 'ref');
  const a = SS.clean({ sid: 'abcdefgh', kind: 'lesson', ref: '7', started_at: now - 100000, active_sec: 999999, total_sec: 50 }, now);
  assert.strictEqual(a.total_sec, 50); assert.strictEqual(a.active_sec, 50);
  const b = SS.clean({ sid: 'abcdefgh', kind: 'class', ref: 'cls_9', started_at: now - 10 * 86400000, total_sec: 9e9 }, now);
  assert.ok(Math.abs(b.started_at.getTime() - now) < 5, '10 хоногийн өмнөх → одоо');
  assert.ok(b.total_sec <= 60, 'эхлэлээс хойшхи хугацаанаас хэтрэхгүй');
  const c = SS.clean({ sid: 'abcdefgh', kind: 'lesson', ref: '7', completed: true, closed_early: true }, now);
  assert.strictEqual(c.completed, true); assert.strictEqual(c.closed_early, false, 'дууссан бол дундаас хаасан биш');
  assert.strictEqual(SS.clean({ sid: 'abcdefgh', kind: 'lesson', ref: '7', completed: 'true' }, now).completed, false, 'зөвхөн boolean true');
});

test('log: нэвтрээгүй → 401, буруу → 400, зөв → хадгална; ижил sid → өсөх л чиглэлтэй (heartbeat), дууссан нь буцахгүй', async () => {
  assert.strictEqual((await POST(sess())).statusCode, 401);
  assert.strictEqual((await POST({ sid: 'bad', kind: 'lesson', ref: '1' }, bearer('bat@mail.mn'))).statusCode, 400);
  const s = sess({ active_sec: 120, total_sec: 130, leaves: 1 });
  assert.strictEqual((await POST(s, bearer('bat@mail.mn'))).statusCode, 200);
  assert.strictEqual(ROWS.length, 1);
  await POST(Object.assign({}, s, { active_sec: 60, total_sec: 70, leaves: 0 }), bearer('bat@mail.mn'));   // хоцорсон heartbeat
  assert.strictEqual(ROWS[0].active_sec, 120); assert.strictEqual(ROWS[0].leaves, 1);
  await POST(Object.assign({}, s, { active_sec: 300, total_sec: 320, completed: true, score: 9, total: 10 }), bearer('bat@mail.mn'));
  await POST(Object.assign({}, s, { active_sec: 310, total_sec: 330, closed_early: true }), bearer('bat@mail.mn'));
  assert.strictEqual(ROWS.length, 1);
  assert.strictEqual(ROWS[0].completed, true); assert.strictEqual(ROWS[0].closed_early, false); assert.strictEqual(ROWS[0].score, 9);
  assert.strictEqual(ROWS[0].email, 'bat@mail.mn', 'имэйл токеноос (биеэс биш)');
});

test('class: зөвхөн ангийн багш/админ; хичээл ба тест (ангийн хичээл + даалгавар) тусдаа, өөр ангийнх орохгүй', async () => {
  const B = bearer('bat@mail.mn'), D = bearer('dorj@mail.mn');
  await POST(sess({ ref: '701', active_sec: 600, total_sec: 700, completed: true }), B);                       // хичээл
  await POST(sess({ ref: '702', active_sec: 120, total_sec: 400, leaves: 3, closed_early: true }), B);         // хичээл, дундаас хаасан
  await POST(sess({ ref: '705', active_sec: 900, total_sec: 950, leaves: 2, shots: 1, completed: true, secure: true }), B);   // даалгавар → тест
  await POST(sess({ kind: 'class', ref: 'cls_11', classroom_id: 501, active_sec: 300, total_sec: 310, completed: true, secure: true }), B);   // ангийн хичээл → тест
  await POST(sess({ kind: 'class', ref: 'cls_99', classroom_id: 777, active_sec: 999, total_sec: 999 }), B);   // өөр анги → орохгүй
  await POST(sess({ ref: '706', active_sec: 60, total_sec: 60 }), D);
  assert.strictEqual((await GET('class', { classroom_id: '501' })).statusCode, 401);
  assert.strictEqual((await GET('class', { classroom_id: '501' }, bearer('other@mail.mn', 'teacher'))).statusCode, 403);
  assert.strictEqual((await GET('class', { classroom_id: '999' }, ADMIN)).statusCode, 404);
  const r = await GET('class', { classroom_id: '501', days: '7' }, bearer('bagsh@mail.mn', 'teacher'));
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.classroom.name, '7А анги');
  const bat = r.body.students.find(s => s.email === 'bat@mail.mn'), dorj = r.body.students.find(s => s.email === 'dorj@mail.mn');
  assert.deepStrictEqual(bat.lesson, { n: 2, done: 1, sec: 720 });
  assert.deepStrictEqual(bat.test, { n: 2, done: 2, sec: 1200 });
  assert.strictEqual(bat.opens, 4); assert.strictEqual(bat.early, 1); assert.strictEqual(bat.leaves, 5); assert.strictEqual(bat.shots, 1);
  assert.strictEqual(bat.name, 'Дорж Бат');
  assert.deepStrictEqual(dorj.test, { n: 1, done: 0, sec: 60 }, '706 = даалгаврын хичээл');
  assert.strictEqual((await GET('class', { classroom_id: '501' }, ADMIN)).statusCode, 200);
});

test('student: зөвхөн тухайн ангийн сурагч; тест/хичээл тэмдэг; хугацааны шүүлт (7 хоног / бүгд)', async () => {
  const B = bearer('bat@mail.mn'), T = bearer('bagsh@mail.mn', 'teacher');
  await POST(sess({ ref: '705', active_sec: 500, total_sec: 520, completed: true, secure: true }), B);
  await POST(sess({ ref: '701', active_sec: 100, total_sec: 100 }), B);
  ROWS.push({ sid: 'old0000001', email: 'bat@mail.mn', kind: 'lesson', ref: '703', ref_name: 'Хуучин', classroom_id: null, started_at: new Date(Date.now() - 20 * 86400000),
    ended_at: null, active_sec: 50, total_sec: 50, leaves: 0, shots: 0, completed: false, closed_early: true, score: null, total: null, secure: false });
  assert.strictEqual((await GET('student', { classroom_id: '501', email: 'nobody@mail.mn' }, T)).statusCode, 404);
  const r = await GET('student', { classroom_id: '501', email: 'BAT@mail.mn', days: '7' }, T);
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.sessions.length, 2, '20 хоногийн өмнөх 7 хоногт орохгүй');
  const t = r.body.sessions.find(s => s.ref === '705');
  assert.strictEqual(t.test, true); assert.strictEqual(t.secure, true); assert.strictEqual(t.active_sec, 500);
  assert.strictEqual(r.body.sessions.find(s => s.ref === '701').test, false);
  const all = await GET('student', { classroom_id: '501', email: 'bat@mail.mn', days: '0' }, T);
  assert.strictEqual(all.body.sessions.length, 3);
  assert.strictEqual((await GET('student', { classroom_id: '501', email: 'bat@mail.mn' }, bearer('other@mail.mn', 'teacher'))).statusCode, 403);
});

test('challengeRefs: даалгаврын хичээлийн id (тоо/мөр, JSON мөр) → олонлог', () => {
  assert.deepStrictEqual([...SS.challengeRefs([{ lessons: [1, '2'] }, { lessons: ['x', 3] }, null])].sort(), ['1', '2', '3']);
  assert.deepStrictEqual([...SS.challengeRefs(JSON.stringify([{ lessons: [5] }]))], ['5']);
  assert.strictEqual(SS.challengeRefs('bad').size, 0);
});
