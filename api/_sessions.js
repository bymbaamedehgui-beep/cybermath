// Суралцах сесс (хичээл / багшийн оноосон тест) — хугацаа, нээсэн, дундаас хаасан, цонхноос гарсан, дэлгэцийн зураг авах оролдлого.
//   Клиент (cm-track.js) нэг сесс = нэг нээлт; эхлэхэд, минут тутам, дуусахад ижил sid-ээр илгээнэ → (email, sid)-ээр upsert, тоонууд өсөх л чиглэлтэй.
//   Багшийн тайлан: анги (class_members) → сурагч бүрийн хичээл/тестийн тоо, минут, нээсэн/хаасан/гарсан/зураг; нэг сурагчийн сессийн жагсаалт.
//   «Тест» = багшийн оноосон: ангийн тусгай хичээл (kind 'class', cls_…) + тухайн ангийн даалгаврын (classrooms.challenges) хичээлүүд.
'use strict';
const pool = require('./_db');

const KINDS = ['lesson', 'class'];
const MAX_SEC = 4 * 3600;          // нэг сесс 4 цагаас урт байхгүй (AFK)
let _ready = null;
function ensureTable() {
  if (!_ready) {
    _ready = pool.query(`CREATE TABLE IF NOT EXISTS study_sessions (
        id BIGSERIAL PRIMARY KEY,
        sid TEXT NOT NULL,
        email TEXT NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        ref_name TEXT,
        classroom_id INTEGER,
        started_at TIMESTAMPTZ NOT NULL,
        ended_at TIMESTAMPTZ,
        active_sec INTEGER NOT NULL DEFAULT 0,
        total_sec INTEGER NOT NULL DEFAULT 0,
        leaves INTEGER NOT NULL DEFAULT 0,
        shots INTEGER NOT NULL DEFAULT 0,
        completed BOOLEAN NOT NULL DEFAULT FALSE,
        closed_early BOOLEAN NOT NULL DEFAULT FALSE,
        score INTEGER,
        total INTEGER,
        secure BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (email, sid)
      )`)
      .then(() => pool.query('CREATE INDEX IF NOT EXISTS study_sessions_email_idx ON study_sessions (email, started_at DESC)'))
      .catch(e => { _ready = null; throw e; });
  }
  return _ready;
}

function int(v, lo, hi) { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo; }
function str(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }

/* Клиентийн илгээсэн сессийг шалгаж цэвэрлэнэ → объект | null */
function clean(b, now) {
  b = b && typeof b === 'object' ? b : {};
  now = now || Date.now();
  const sid = str(b.sid, 40);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(sid)) return null;
  if (KINDS.indexOf(b.kind) < 0) return null;
  const ref = str(b.ref, 64);
  if (!ref) return null;
  let st = Number(b.started_at);
  if (!(st > now - 2 * 86400000 && st <= now + 60000)) st = now;        // 2 хоногоос хуучин/ирээдүйн цаг → одоо
  const total = Math.min(int(b.total_sec, 0, MAX_SEC), Math.max(0, Math.round((now - st) / 1000) + 60));
  const active = Math.min(int(b.active_sec, 0, MAX_SEC), total);
  const completed = b.completed === true;
  return {
    sid: sid, kind: b.kind, ref: ref, ref_name: str(b.ref_name, 120) || null,
    classroom_id: int(b.classroom_id, 0, 2147483647) || null,
    started_at: new Date(st), active_sec: active, total_sec: total,
    leaves: int(b.leaves, 0, 999), shots: int(b.shots, 0, 999),
    completed: completed, closed_early: !completed && b.closed_early === true,
    score: b.score == null || b.score === '' ? null : int(b.score, 0, 1000), total: b.total == null || b.total === '' ? null : int(b.total, 0, 1000),
    secure: b.secure === true, ended: completed || b.closed_early === true
  };
}

async function log(email, s) {
  await ensureTable();
  await pool.query(
    `INSERT INTO study_sessions (sid, email, kind, ref, ref_name, classroom_id, started_at, ended_at, active_sec, total_sec, leaves, shots,
        completed, closed_early, score, total, secure)
     VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::boolean THEN NOW() ELSE NULL END, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     ON CONFLICT (email, sid) DO UPDATE SET
        ended_at = COALESCE(study_sessions.ended_at, EXCLUDED.ended_at),
        active_sec = GREATEST(study_sessions.active_sec, EXCLUDED.active_sec),
        total_sec = GREATEST(study_sessions.total_sec, EXCLUDED.total_sec),
        leaves = GREATEST(study_sessions.leaves, EXCLUDED.leaves),
        shots = GREATEST(study_sessions.shots, EXCLUDED.shots),
        completed = study_sessions.completed OR EXCLUDED.completed,
        closed_early = NOT (study_sessions.completed OR EXCLUDED.completed) AND (study_sessions.closed_early OR EXCLUDED.closed_early),
        score = COALESCE(EXCLUDED.score, study_sessions.score),
        total = COALESCE(EXCLUDED.total, study_sessions.total),
        secure = study_sessions.secure OR EXCLUDED.secure,
        updated_at = NOW()`,
    [s.sid, email, s.kind, s.ref, s.ref_name, s.classroom_id, s.started_at, s.ended, s.active_sec, s.total_sec, s.leaves, s.shots,
      s.completed, s.closed_early, s.score, s.total, s.secure]);
}

/* Ангийн даалгаврын хичээлүүд (classrooms.challenges[].lessons) — node id-ийн олонлог */
function challengeRefs(challenges) {
  let list = challenges;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch (e) { list = []; } }
  const out = new Set();
  (Array.isArray(list) ? list : []).forEach(c => (c && Array.isArray(c.lessons) ? c.lessons : []).forEach(l => out.add(String(parseInt(l, 10)))));
  out.delete('NaN');
  return out;
}
/* Сесс тухайн ангид «тест» эсэх */
function isTest(s, classroomId, refs) {
  if (s.kind === 'class') return !s.classroom_id || +s.classroom_id === +classroomId;
  return refs.has(String(s.ref));
}

async function members(classroomId) {
  const r = await pool.query(
    `SELECT cm.student_email AS email, u.first_name, u.last_name
       FROM class_members cm LEFT JOIN users u ON lower(u.email) = lower(cm.student_email)
      WHERE cm.classroom_id = $1`, [classroomId]);
  return r.rows;
}
async function sessionsOf(emails, since, limit) {
  if (!emails.length) return [];
  const r = await pool.query(
    `SELECT email, kind, ref, ref_name, classroom_id, started_at, ended_at, active_sec, total_sec, leaves, shots, completed, closed_early, score, total, secure
       FROM study_sessions WHERE lower(email) = ANY($1::text[]) AND started_at >= $2
      ORDER BY started_at DESC LIMIT $3`, [emails, since, limit]);
  return r.rows;
}
function nameOf(m) { return ((m.last_name || '') + ' ' + (m.first_name || '')).trim() || m.email; }
function sinceOf(days) { return days > 0 ? new Date(Date.now() - days * 86400000) : new Date(0); }

/* Ангийн нэгтгэл: сурагч бүрээр */
async function classSummary(cls, days) {
  await ensureTable();
  const mem = await members(cls.id);
  const emails = mem.map(m => String(m.email || '').toLowerCase()).filter(Boolean);
  const refs = challengeRefs(cls.challenges);
  const rows = await sessionsOf(emails, sinceOf(days), 50000);
  const by = {};
  emails.forEach(e => {
    by[e] = { lesson: { n: 0, done: 0, sec: 0 }, test: { n: 0, done: 0, sec: 0 }, opens: 0, early: 0, leaves: 0, shots: 0, last: null };
  });
  rows.forEach(s => {
    const a = by[String(s.email).toLowerCase()]; if (!a) return;
    if (s.kind === 'class' && s.classroom_id && +s.classroom_id !== +cls.id) return;   // өөр ангийн оноосон хичээл
    const t = isTest(s, cls.id, refs) ? a.test : a.lesson;
    t.n++; t.sec += +s.active_sec || 0; if (s.completed) t.done++;
    a.opens++; if (s.closed_early) a.early++;
    a.leaves += +s.leaves || 0; a.shots += +s.shots || 0;
    if (!a.last || new Date(s.started_at) > new Date(a.last)) a.last = s.started_at;
  });
  return mem.map(m => {
    const e = String(m.email || '').toLowerCase(), a = by[e];
    return Object.assign({ email: e, name: nameOf(m) }, a);
  }).sort((x, y) => x.name.localeCompare(y.name, 'mn'));
}

/* Нэг сурагчийн сессүүд (сүүлийн 300) */
async function studentSessions(cls, email, days) {
  await ensureTable();
  const refs = challengeRefs(cls.challenges);
  const rows = await sessionsOf([String(email).toLowerCase()], sinceOf(days), 300);
  return rows.filter(s => !(s.kind === 'class' && s.classroom_id && +s.classroom_id !== +cls.id)).map(s => ({
    kind: s.kind, test: isTest(s, cls.id, refs), ref: s.ref, name: s.ref_name || null, at: s.started_at, ended_at: s.ended_at,
    active_sec: +s.active_sec || 0, total_sec: +s.total_sec || 0, leaves: +s.leaves || 0, shots: +s.shots || 0,
    completed: !!s.completed, closed_early: !!s.closed_early, score: s.score, total: s.total, secure: !!s.secure
  }));
}

module.exports = { KINDS, MAX_SEC, ensureTable, clean, log, challengeRefs, isTest, classSummary, studentSessions };
