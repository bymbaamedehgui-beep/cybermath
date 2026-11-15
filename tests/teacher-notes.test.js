// Багшийн мэдэгдэл: даалгавар (challenge) оноох / сурагч дуусгах үед сайтын эзэн рүү Telegram ОЧИХГҮЙ —
// зөвхөн тухайн ангийн багшид (teacher_notes → «Миний ангиуд» дээрх «Мэдэгдэл» карт) харагдана. api/users.js + index.html
// Ажиллуулах: node --test tests/teacher-notes.test.js   (бодит DB 0 — tests/_gamefake.js + энд санах ойн хүснэгтүүд)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const users = require(path.join(F.API, 'users.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

// Санах ойн анги, гишүүд, сурагчийн challenge/хичээл, teacher_notes
const T = { cls: new Map(), members: [], ch: new Map(), done: new Map(), names: new Map(), notes: [] };
F.db.extra.push(function (q, p) {
  if (q === 'SELECT teacher_email FROM classrooms WHERE id=$1') { const c = T.cls.get(Number(p[0])); return { rows: c ? [{ teacher_email: c.teacher_email }] : [] }; }
  if (q === 'SELECT teacher_email, name FROM classrooms WHERE id=$1') { const c = T.cls.get(Number(p[0])); return { rows: c ? [c] : [] }; }
  if (q === 'SELECT student_email FROM class_members WHERE classroom_id=$1') return { rows: T.members.filter(m => m.cid === Number(p[0])).map(m => ({ student_email: m.email })) };
  if (/^UPDATE classrooms SET challenges = COALESCE\(challenges,'\[\]'::jsonb\) \|\| \$2::jsonb WHERE id=\$1$/.test(q)) return { rows: [] };
  if (q === 'SELECT challenges FROM users WHERE email=$1') return { rows: [{ challenges: T.ch.get(p[0]) || [] }] };
  if (q === 'UPDATE users SET challenges=$1 WHERE email=$2') { T.ch.set(p[1], JSON.parse(p[0])); return { rows: [] }; }
  if (/^UPDATE users SET completed_lessons = array_append\(COALESCE\(completed_lessons,'\{\}'\), \$1::int\) WHERE email=\$2 AND NOT/.test(q)) {
    const d = T.done.get(p[1]) || []; T.done.set(p[1], d);
    if (d.includes(Number(p[0]))) return { rows: [], rowCount: 0 };
    d.push(Number(p[0])); return { rows: [], rowCount: 1 };
  }
  if (q === 'SELECT challenges, completed_lessons, first_name, last_name FROM users WHERE email=$1') {
    const n = T.names.get(p[0]) || ['', ''];
    return { rows: [{ challenges: T.ch.get(p[0]) || [], completed_lessons: T.done.get(p[0]) || [], first_name: n[0], last_name: n[1] }] };
  }
  if (/^INSERT INTO teacher_notes \(teacher_email, ukey, student_email, student_name, class_name, title, lessons\) VALUES \(\$1,\$2,\$3,\$4,\$5,\$6,\$7\) ON CONFLICT \(teacher_email, ukey\) DO NOTHING$/.test(q)) {
    if (!T.notes.some(n => n.teacher_email === p[0] && n.ukey === p[1])) {
      T.notes.push({ id: T.notes.length + 1, teacher_email: p[0], ukey: p[1], student_email: p[2], student_name: p[3], class_name: p[4], title: p[5], lessons: p[6], created_at: new Date(), seen_at: null });
    }
    return { rows: [] };
  }
  if (q === 'SELECT id, student_email, student_name, class_name, title, lessons, created_at, seen_at FROM teacher_notes WHERE teacher_email=$1 ORDER BY id DESC LIMIT 30') {
    return { rows: T.notes.filter(n => n.teacher_email === p[0]).reverse().slice(0, 30) };
  }
  if (q === 'SELECT COUNT(*)::int AS n FROM teacher_notes WHERE teacher_email=$1 AND seen_at IS NULL') return { rows: [{ n: T.notes.filter(n => n.teacher_email === p[0] && !n.seen_at).length }] };
  if (q === 'UPDATE teacher_notes SET seen_at=NOW() WHERE teacher_email=$1 AND seen_at IS NULL') { T.notes.forEach(n => { if (n.teacher_email === p[0]) n.seen_at = n.seen_at || new Date(); }); return { rows: [] }; }
  if (/\b(classrooms|class_members|teacher_notes)\b/.test(q)) throw new Error('teacher-notes: тодорхойгүй SQL ' + q);
  return null;
});

const tok = (email, role) => ({ authorization: 'Bearer ' + jwt.sign({ email: email, role: role }, process.env.JWT_SECRET) });
const PUT = (as, role, body) => F.call(users, { method: 'PUT', headers: tok(as, role), body: Object.assign({ email: as }, body) });
const TA = 'bagsh.a@x.mn', TB = 'bagsh.b@x.mn', S1 = 'surag1@x.mn', S2 = 'surag2@x.mn';

beforeEach(() => {
  F.reset();
  T.cls.clear(); T.members.length = 0; T.ch.clear(); T.done.clear(); T.names.clear(); T.notes.length = 0;
  T.cls.set(7, { teacher_email: TA, name: '10-1 анги' });
  T.cls.set(8, { teacher_email: TB, name: '9-2 анги' });
  T.members.push({ cid: 7, email: S1 }, { cid: 7, email: S2 });
  T.names.set(S1, ['Бат', 'Дорж']); T.names.set(S2, ['Сараа', 'Болд']);
  [TA, TB].forEach(e => F.addUser(e, { role: 'teacher' })); [S1, S2].forEach(e => F.addUser(e));
});

async function assign(lessons) {
  const r = await PUT(TA, 'teacher', { action: 'assignChallenge', classroomId: 7, title: 'Зэрэг давтлага', lessons: lessons });
  assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.count, 2);
  return r.body.challenge;
}

test('Даалгавар оноох: сайтын эзэн рүү Telegram илгээхгүй, сурагч бүрт очно', async () => {
  await assign([11, 12]);
  assert.strictEqual(F.tg.length, 0, 'Telegram 0');
  assert.strictEqual(T.ch.get(S1).length, 1); assert.strictEqual(T.ch.get(S2).length, 1);
});

test('Сурагч дуусгах: Telegram 0, зөвхөн тухайн ангийн багшид нэг мэдэгдэл; давтан хийхэд нэмэгдэхгүй', async () => {
  const ch = await assign([11, 12]);
  await PUT(S1, 'student', { completed_lesson: 11 });
  assert.strictEqual(T.notes.length, 0, 'дутуу — мэдэгдэлгүй');
  const r = await PUT(S1, 'student', { completed_lesson: 12 });
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(F.tg.length, 0, 'Telegram 0');
  assert.strictEqual(T.notes.length, 1);
  assert.deepStrictEqual(Object.assign({}, T.notes[0], { id: 0, created_at: 0 }), {
    id: 0, teacher_email: TA, ukey: S1 + '|' + ch.id, student_email: S1, student_name: 'Дорж Бат', class_name: '10-1 анги',
    title: 'Зэрэг давтлага', lessons: 2, created_at: 0, seen_at: null,
  });
  await PUT(S1, 'student', { completed_lesson: 12 });   // хийсэн хичээлээ давтан
  await PUT(S1, 'student', { completed_lesson: 11 });
  assert.strictEqual(T.notes.length, 1, 'давхардахгүй');
});

test('Хүлээн авагч нь ангийн одоогийн багш (анги шилжсэн бол шинэ багш)', async () => {
  await assign([5]);
  T.cls.get(7).teacher_email = TB;
  await PUT(S2, 'student', { completed_lesson: 5 });
  assert.deepStrictEqual(T.notes.map(n => n.teacher_email), [TB]);
});

test('teacherNotes: зөвхөн өөрийнх, unseen тоо; teacherNotesSeen; өөр хүн уншиж чадахгүй', async () => {
  await assign([3]);
  await PUT(S1, 'student', { completed_lesson: 3 });
  await PUT(S2, 'student', { completed_lesson: 3 });
  let r = await PUT(TA, 'teacher', { action: 'teacherNotes' });
  assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.unseen, 2);
  assert.deepStrictEqual(r.body.notes.map(n => n.student_email), [S2, S1], 'шинэ нь эхэнд');
  r = await PUT(TB, 'teacher', { action: 'teacherNotes' });
  assert.deepStrictEqual([r.body.notes.length, r.body.unseen], [0, 0], 'өөр багшид харагдахгүй');
  r = await F.call(users, { method: 'PUT', headers: tok(S1, 'student'), body: { email: TA, action: 'teacherNotes' } });
  assert.strictEqual(r.statusCode, 403, 'бусдын имэйлээр унших боломжгүй');
  await PUT(TA, 'teacher', { action: 'teacherNotesSeen' });
  r = await PUT(TA, 'teacher', { action: 'teacherNotes' });
  assert.strictEqual(r.body.unseen, 0); assert.strictEqual(r.body.notes.length, 2);
});

test('api/users.js: эзэн рүү очдог хуучин хоёр Telegram мессеж байхгүй (premium хэвээр)', () => {
  const s = R('api/users.js');
  assert.doesNotMatch(s, /Багш challenge оноолоо|Сурагч challenge дуусгалаа/);
  assert.match(s, /Premium худалдаж авлаа!/);
});

test('index.html: «Миний ангиуд» дээр мэдэгдлийн карт, эможигүй, escape', () => {
  const h = R('index.html');
  assert.match(h, /<div id="cm-tnotes" style="display:none;margin-bottom:14px;"><\/div>\s*<div id="classroom-list"/);
  const i = h.indexOf('/* ── Багшийн мэдэгдэл ──'), j = h.indexOf('/* ── /Багшийн мэдэгдэл ── */');
  assert.ok(i > 0 && j > i, 'мэдэгдлийн блок');
  assert.ok(h.indexOf('function cmTeacherNotes()', i) < j);
  const blk = h.slice(i, j);
  assert.match(blk, /action: 'teacherNotes'/);
  assert.match(blk, /action: 'teacherNotesSeen'/);
  assert.match(blk, /_esc\(n\.student_name \|\| n\.student_email\)/);
  assert.match(blk, /_esc\(n\.title\)/);
  assert.match(blk, /_esc\(n\.class_name\)/);
  assert.doesNotMatch(blk, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможи бүү');
  assert.match(h, /function loadTeacherClassrooms\(\) \{[^]*?cmTeacherNotes\(\);[^]*?fetch\('\/api\/classroom\?teacher_email='/);
});

test('fake: танихгүй SQL алга', () => {
  assert.deepStrictEqual(F.db.unknown, []);
});
