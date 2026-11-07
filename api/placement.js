// Түвшин тогтоох сорил — API (логик api/_placement.js).
//   GET  ?action=plan&grade=G          (нийтийн) → { ok, grade, chapters:[{ name, topics:[{ id, name }] }], questions }
//   POST ?action=start  { grade }      → { ok, t, stage:1, chapters:[нэр], questions:[{ k, chapter, text, choices }] }
//   POST ?action=submit { t, answers } → 1-р шатын дараа { ok, t, stage:2, chapter, questions } эсвэл
//                                        эцэст нь { ok, done:true, result, saved }  (нэвтэрсэн бол placement_results-д)
//   GET  ?action=mine                  (Bearer cm_token) → { ok, results:[анги бүрийн сүүлийн дүн] }
//   GET  ?action=class&classroom_id=N  (тухайн ангийн багш эсвэл админ) → { ok, classroom, students:[…] }
// Зөв хариу клиентэд очихгүй — асуултын id гарын үсэгтэй токенд, шалгалтыг сервер хийнэ.
'use strict';
const guard = require('./_guard');
const GM = require('./_games');
const PL = require('./_placement');
const pool = require('./_db');

const MSG = {
  bad: 'Хүсэлт буруу байна',
  grade: 'Энэ ангийн түвшин тогтоох сорил одоогоор байхгүй (6, 7, 8, 9, 10, 12-р анги)',
  soon: '11-р ангийн сорил тун удахгүй нэмэгдэнэ',
  rate: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.',
  token: 'Сорилын хугацаа дууссан эсвэл буруу байна. Дахин эхлүүлнэ үү.',
  login: 'Нэвтэрнэ үү.',
  forbidden: 'Энэ ангийн дүнг зөвхөн ангийн багш харна.',
  empty: 'Энэ ангид сорил хийх бодлого хангалтгүй байна.',
};
function bodyOf(req) {
  let b = req && req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}
async function limited(key, max, win) { return !(await guard.rateLimit(key, max, win)); }
/* Асуултыг клиентэд: зөв хариугүй */
function pub(items, qs, chs) {
  return items.map((x, k) => {
    const q = qs.get(x.t);
    return { k: k, chapter: (chs.find(c => c.i === x.c) || {}).name || '', text: q.text, choices: q.choices };
  });
}
/* Сэдэв бүрт бодлого олдсон хэсгийг л үлдээнэ → { items: [{ q, t, c }], qs } */
async function build(sel) {
  const qs = await PL.questionsFor(sel.map(x => x.t));
  const items = sel.filter(x => qs.has(x.t)).map(x => ({ q: qs.get(x.t).id, t: x.t, c: x.c }));
  return { items: items, qs: qs };
}

module.exports = async (req, res) => {
  const q = req.query || {};
  const action = String(q.action || '');
  try {
    if (action === 'plan') {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: MSG.bad });
      const g = String(q.grade || '').trim();
      if (g === '11') return res.status(400).json({ ok: false, soon: true, error: MSG.soon });
      const grade = PL.normGrade(g);
      if (!grade) return res.status(400).json({ ok: false, error: MSG.grade });
      const chs = await PL.chapters(grade);
      res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      return res.json({ ok: true, grade: grade, questions: PL.stage1(chs).length,
        chapters: chs.map(c => ({ name: c.name, topics: c.topics.map(t => ({ id: t.id, name: t.name })) })) });
    }

    res.setHeader('Cache-Control', 'no-store');
    if (guard.secretMissing(res)) return;
    const ip = guard.clientIp(req);

    if (action === 'start') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: MSG.bad });
      if (await limited('pl_start_ip:' + ip, 40, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
      const b = bodyOf(req);
      const g = String(b.grade == null ? '' : b.grade).trim();
      if (g === '11') return res.status(400).json({ ok: false, soon: true, error: MSG.soon });
      const grade = PL.normGrade(g);
      if (!grade) return res.status(400).json({ ok: false, error: MSG.grade });
      const chs = await PL.chapters(grade);
      const { items, qs } = await build(PL.stage1(chs));
      if (items.length < 3) return res.status(400).json({ ok: false, error: MSG.empty });
      const t = PL.sign({ g: grade, s: 1, i: items });
      return res.json({ ok: true, t: t, stage: 1, grade: grade, chapters: chs.map(c => c.name), questions: pub(items, qs, chs) });
    }

    if (action === 'submit') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false, error: MSG.bad });
      if (await limited('pl_sub_ip:' + ip, 80, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
      const b = bodyOf(req);
      const tk = PL.verify(b.t);
      if (!tk || !PL.normGrade(tk.g) || !Array.isArray(tk.i)) return res.status(400).json({ ok: false, expired: true, error: MSG.token });
      const chs = await PL.chapters(tk.g);
      let r1, r2 = null;
      if (tk.s === 1) {
        r1 = await PL.grade(tk.i, b.answers);
        const f = PL.frontier(chs, r1);
        const ch = chs.find(c => c.i === f);
        if (ch) {
          const { items, qs } = await build(PL.stage2(ch, tk.i.map(x => x.t)));
          if (items.length) {
            const t = PL.sign({ g: tk.g, s: 2, r1: r1, i: items });
            return res.json({ ok: true, t: t, stage: 2, chapter: ch.name, questions: pub(items, qs, chs) });
          }
        }
      } else if (tk.s === 2 && Array.isArray(tk.r1)) {
        r1 = tk.r1;
        r2 = await PL.grade(tk.i, b.answers);
      } else return res.status(400).json({ ok: false, expired: true, error: MSG.token });
      const result = PL.result(tk.g, chs, r1, r2);
      let saved = false;
      const u = guard.requireUser(req) ? await GM.cmUser(req) : null;
      if (u && u.email) { await PL.save(u.email, result); saved = true; }
      return res.json({ ok: true, done: true, result: result, saved: saved });
    }

    if (action === 'mine') {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: MSG.bad });
      const u = guard.requireUser(req) ? await GM.cmUser(req) : null;
      if (!u || !u.email) return res.status(401).json({ ok: false, needLogin: true, error: MSG.login });
      return res.json({ ok: true, results: await PL.mine(u.email) });
    }

    if (action === 'class') {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: MSG.bad });
      if (await limited('pl_cls_ip:' + ip, 120, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
      const id = parseInt(q.classroom_id, 10);
      if (!(id > 0)) return res.status(400).json({ ok: false, error: MSG.bad });
      const admin = guard.requireAdmin(req);
      const u = admin ? null : (guard.requireUser(req) ? await GM.cmUser(req) : null);
      if (!admin && !(u && u.email)) return res.status(401).json({ ok: false, needLogin: true, error: MSG.login });
      const c = await pool.query('SELECT id, name, grade, teacher_email FROM classrooms WHERE id = $1', [id]);
      const cls = c.rows[0];
      if (!cls) return res.status(404).json({ ok: false, error: MSG.bad });
      if (!admin && String(cls.teacher_email || '').trim().toLowerCase() !== u.email) return res.status(403).json({ ok: false, error: MSG.forbidden });
      const rows = await PL.classResults(id);
      return res.json({ ok: true, classroom: { id: cls.id, name: cls.name, grade: cls.grade },
        students: rows.map(r => ({ email: r.email, name: ((r.last_name || '') + ' ' + (r.first_name || '')).trim() || r.email,
          grade: r.grade || null, score: r.score == null ? null : r.score, total: r.total == null ? null : r.total,
          percent: r.detail && r.detail.percent != null ? r.detail.percent : null, start_name: r.start_name || null, start_chapter: r.start_chapter || null,
          weak: r.detail && Array.isArray(r.detail.chapters) ? r.detail.chapters.filter(x => x.status === 'weak' || x.status === 'partial').map(x => x.name) : [],
          at: r.created_at || null })) });
    }

    return res.status(400).json({ ok: false, error: MSG.bad });
  } catch (e) {
    console.error('[placement]', e && e.message);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ ok: false, error: 'Түр алдаа гарлаа. Дахин оролдоно уу.' });
  }
};
