// Суралцах сессийн API (логик api/_sessions.js).
//   POST ?action=log   (Bearer cm_token)  { sid, kind:'lesson'|'class', ref, ref_name, classroom_id, started_at, active_sec, total_sec,
//                                           leaves, shots, completed, closed_early, score, total, secure } → { ok }
//   GET  ?action=class&classroom_id=N&days=7|30|0           (ангийн багш эсвэл админ) → { ok, classroom, days, students:[…] }
//   GET  ?action=student&classroom_id=N&email=E&days=…      (ангийн багш эсвэл админ; сурагч тухайн ангийнх) → { ok, sessions:[…] }
'use strict';
const guard = require('./_guard');
const GM = require('./_games');
const SS = require('./_sessions');
const pool = require('./_db');

const MSG = {
  bad: 'Хүсэлт буруу байна',
  login: 'Нэвтэрнэ үү.',
  rate: 'Хэт олон хүсэлт. Түр хүлээнэ үү.',
  forbidden: 'Энэ ангийн тайланг зөвхөн ангийн багш харна.',
  member: 'Энэ сурагч тухайн ангид байхгүй.',
};
function bodyOf(req) {
  let b = req && req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}
function daysOf(v) { const n = parseInt(v, 10); return [7, 30, 90].indexOf(n) >= 0 ? n : (n === 0 ? 0 : 7); }

/* Ангийн багш эсвэл админ → { cls } | { code, error } */
async function teacherClass(req, id) {
  const admin = guard.requireAdmin(req);
  const u = admin ? null : (guard.requireUser(req) ? await GM.cmUser(req) : null);
  if (!admin && !(u && u.email)) return { code: 401, body: { ok: false, needLogin: true, error: MSG.login } };
  const c = await pool.query('SELECT id, name, grade, teacher_email, challenges FROM classrooms WHERE id = $1', [id]);
  const cls = c.rows[0];
  if (!cls) return { code: 404, body: { ok: false, error: MSG.bad } };
  if (!admin && String(cls.teacher_email || '').trim().toLowerCase() !== u.email) return { code: 403, body: { ok: false, error: MSG.forbidden } };
  return { cls: cls };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const action = String(q.action || '');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (guard.secretMissing(res)) return;
    const ip = guard.clientIp(req);

    if (action === 'log') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: MSG.bad });
      const u = guard.requireUser(req) ? await GM.cmUser(req) : null;
      if (!(u && u.email)) return res.status(401).json({ ok: false, needLogin: true, error: MSG.login });
      if (!(await guard.rateLimit('ss_log:' + u.email, 300, 3600))) return res.status(429).json({ ok: false, error: MSG.rate });
      const s = SS.clean(bodyOf(req));
      if (!s) return res.status(400).json({ ok: false, error: MSG.bad });
      await SS.log(u.email, s);
      return res.json({ ok: true });
    }

    if (action === 'class' || action === 'student') {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: MSG.bad });
      if (!(await guard.rateLimit('ss_cls_ip:' + ip, 240, 600))) return res.status(429).json({ ok: false, error: MSG.rate });
      const id = parseInt(q.classroom_id, 10);
      if (!(id > 0)) return res.status(400).json({ ok: false, error: MSG.bad });
      const t = await teacherClass(req, id);
      if (!t.cls) return res.status(t.code).json(t.body);
      const days = daysOf(q.days);
      if (action === 'class') {
        const students = await SS.classSummary(t.cls, days);
        return res.json({ ok: true, classroom: { id: t.cls.id, name: t.cls.name, grade: t.cls.grade }, days: days, students: students });
      }
      const email = String(q.email || '').trim().toLowerCase();
      if (!email) return res.status(400).json({ ok: false, error: MSG.bad });
      const m = await pool.query('SELECT 1 FROM class_members WHERE classroom_id = $1 AND lower(student_email) = $2', [id, email]);
      if (!m.rows.length) return res.status(404).json({ ok: false, error: MSG.member });
      return res.json({ ok: true, days: days, sessions: await SS.studentSessions(t.cls, email, days) });
    }

    return res.status(400).json({ ok: false, error: MSG.bad });
  } catch (e) {
    console.error('[sessions]', e && e.message);
    return res.status(503).json({ ok: false, error: 'Түр алдаа гарлаа. Дахин оролдоно уу.' });
  }
};
