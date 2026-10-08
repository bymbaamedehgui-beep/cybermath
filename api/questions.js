const pool = require('./_db');
const { secretMissing, requireAdmin, requireUser, rateLimit, clientIp } = require('./_guard');

/* ── Давтагдахгүй эргэлт (pick=N) ──
   Хэрэглэгч тухайн хичээл дээр үзсэн бодлогын id-г хадгалж, дараагийн удаад
   үзээгүйг нь өгнө. Сан дуусмагц эргэлт шинээр эхэлнэ.
   Нэг хэрэглэгч+хичээлд НЭГ мөр — id-уудыг массиваар хадгална. */
let _cycleReady = false;
async function ensureCycleTable() {
  if (_cycleReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS q_cycle (
    email TEXT NOT NULL,
    node_id INT NOT NULL,
    seen BIGINT[] NOT NULL DEFAULT '{}',
    cycle INT NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (email, node_id)
  )`);
  _cycleReady = true;
}
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
// rows: тухайн хичээлийн БҮХ бодлого. → сонгосон N мөр | null (DB алдаа → дуудагч өөрөө шийднэ)
/* Нэг variant бүлгээс НЭГ мөр үлдээнэ.
   Клиент cmPickVariants-аар ижлийг нь нэгтгэдэг тул түүхий мөрөөр N сонгоход
   дэлгэц дээр N-ээс ЦӨӨН асуулт гардаг байв (20 мөр → 13 бүлэг → 13 асуулт). */
function onePerVariant(rows) {
  const by = {}, order = [];
  (rows || []).forEach(r => {
    const k = r.variant_key || ('q' + r.id);
    if (!by[k]) { by[k] = []; order.push(k); }
    by[k].push(r);
  });
  return order.map(k => {
    const g = by[k];
    return g.length === 1 ? g[0] : g[Math.floor(Math.random() * g.length)];
  });
}
async function pickUnseen(email, nodeId, rows, n) {
  try {
    await ensureCycleTable();
    rows = onePerVariant(rows);
    const all = rows.map(r => Number(r.id));
    const cur = await pool.query('SELECT seen, cycle FROM q_cycle WHERE email=$1 AND node_id=$2', [email, nodeId]);
    let seen = cur.rows.length ? (cur.rows[0].seen || []).map(Number) : [];
    let cycle = cur.rows.length ? (cur.rows[0].cycle || 1) : 1;
    /* Устгагдсан бодлогын id-г хаяна — эс бөгөөс эргэлт хэзээ ч дуусахгүй */
    const alive = new Set(all);
    seen = seen.filter(id => alive.has(id));
    let unseen = all.filter(id => seen.indexOf(id) < 0);
    /* Үлдэгдэл хүрэхгүй бол эргэлтийг шинэчилнэ. Шинэ эргэлтийн эхэнд
       сүүлийн багцыг дахин гаргахгүйг хичээнэ (дараалан давтагдахаас сэргийлнэ). */
    if (unseen.length < n) {
      const justSeen = new Set(seen.slice(-n));
      cycle += 1;
      seen = [];
      unseen = all.filter(id => !justSeen.has(id));
      if (unseen.length < n) unseen = all.slice();
    }
    const take = shuffle(unseen.slice()).slice(0, n);
    const nextSeen = seen.concat(take);
    await pool.query(
      `INSERT INTO q_cycle (email, node_id, seen, cycle, updated_at) VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (email, node_id) DO UPDATE SET seen=EXCLUDED.seen, cycle=EXCLUDED.cycle, updated_at=NOW()`,
      [email, nodeId, nextSeen, cycle]);
    const byId = {};
    rows.forEach(r => { byId[Number(r.id)] = r; });
    return take.map(id => byId[id]).filter(Boolean);
  } catch (e) {
    console.error('[q_cycle]', e && e.message);
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Эрхийн шалгалт: GET ?reports=, POST (reportQuestion-оос бусад), PUT, DELETE — зөвхөн админ.
    // Тоглоомын GET (node_id/ids/exam/grade...) болон хэрэглэгчийн reportQuestion нээлттэй.
    const _q = req.query || {};
    const _b = req.body || {};
    // node_grade — нэг хүсэлтээр бүхэл ангийн бодлогыг татах тул зөвхөн админд
    const needAdmin = (req.method === 'GET' && (_q.reports || _q.stats || _q.node_grade))
      || (req.method === 'POST' && _b.action !== 'reportQuestion')
      || req.method === 'PUT' || req.method === 'DELETE';
    if (needAdmin) {
      if (secretMissing(res)) return;
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
    }

    // Lazy migration — difficulty column нэмэх
    await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium'`).catch(()=>{});
    // is_exam — шалгалтын бодлого эсэхийг тэмдэглэх
    await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_exam BOOLEAN DEFAULT false`).catch(()=>{});

    if (req.method === 'GET') {
      const { topic, grade, max_grade, node_id, ids, reports, stats, node_grade } = req.query || {};

      // Шалгалтын бодлогыг оруулах эсэх — жагсаалт, хяналт хоёрт ижил дүрэм
      const _exam = req.query.exam;
      const examCondQ = _exam === '1' ? 'q.is_exam = true'
        : (_exam === 'all' ? 'TRUE' : '(q.is_exam = false OR q.is_exam IS NULL)');

      // Зөвхөн ТОО — админы хяналтын самбар 1 МБ татахгүйн тулд
      if (req.query.count) {
        const cr = await pool.query('SELECT COUNT(*)::int AS n FROM questions q WHERE ' + examCondQ);
        return res.json({ ok: true, count: cr.rows[0].n });
      }

      // Зөвхөн ТОО — админы хяналтын самбар 1 МБ татахгүйн тулд
      if (req.query.count) {
        const cr = await pool.query('SELECT COUNT(*)::int AS n FROM questions q WHERE ' + examCondQ);
        return res.json({ ok: true, count: cr.rows[0].n });
      }

      /* ── Хяналт: node тус бүрийн бодлогын тоо, хэлбэр/хувилбар, төрөл, түвшин ──
         Learning path-ыг анги ангиар нь нэг дор хянахад ашиглана. */
      if (stats) {
        const sv = [];
        let where = '';
        if (node_grade) { sv.push(String(node_grade)); where = 'WHERE n.grade = $1'; }
        const sq = await pool.query(`
          SELECT n.id, n.name, n.grade, n.sort_order, n.type,
                 COUNT(q.id)::int AS total,
                 COUNT(q.id) FILTER (WHERE q.variant_key IS NULL OR q.variant_key = 'q' || q.id::text)::int AS forms,
                 COUNT(q.id) FILTER (WHERE q.type = 'choice')::int AS n_choice,
                 COUNT(q.id) FILTER (WHERE q.type = 'fill')::int AS n_fill,
                 COUNT(q.id) FILTER (WHERE q.type NOT IN ('choice','fill'))::int AS n_other,
                 COUNT(q.id) FILTER (WHERE q.difficulty = 'easy')::int AS n_easy,
                 COUNT(q.id) FILTER (WHERE q.difficulty = 'medium')::int AS n_medium,
                 COUNT(q.id) FILTER (WHERE q.difficulty = 'hard')::int AS n_hard,
                 COUNT(q.id) FILTER (WHERE q.hint IS NULL OR q.hint::text IN ('null','{}','""'))::int AS n_nohint
          FROM nodes n
          LEFT JOIN questions q ON q.node_id = n.id AND ${examCondQ}
          ${where}
          GROUP BY n.id, n.name, n.grade, n.sort_order, n.type
          ORDER BY n.sort_order NULLS LAST, n.id`, sv);
        // Ангиудын товчоо — сонгогч байгуулахад
        const gq = await pool.query(`
          SELECT COALESCE(n.grade, '') AS grade,
                 COUNT(DISTINCT n.id)::int AS nodes,
                 COUNT(q.id)::int AS total,
                 COUNT(DISTINCT n.id) FILTER (WHERE q.id IS NULL)::int AS empty_nodes
          FROM nodes n
          LEFT JOIN questions q ON q.node_id = n.id AND ${examCondQ}
          GROUP BY 1 ORDER BY 1`);
        // Node-д хамаарахгүй бодлого (алдаатай өгөгдөл олоход хэрэгтэй)
        const oq = await pool.query('SELECT COUNT(*)::int AS c FROM questions WHERE node_id IS NULL');
        return res.json({
          ok: true,
          stats: sq.rows,
          grades: gq.rows,
          orphans: (oq.rows[0] || {}).c || 0,
        });
      }

      // /api/questions?reports=open — admin-д нээлттэй мэдэгдлийн жагсаалт
      if (reports) {
        try {
          // Жагсаалт + reporter-ийн нэр + асуултын текст / зөв хариулт-уудыг JOIN-оор
          const r = await pool.query(`
            SELECT
              qr.id, qr.question_id, qr.reporter_email, qr.reason, qr.status,
              qr.created_at, qr.resolved_at,
              q.text AS question_text, q.correct AS question_correct, q.choices AS question_choices,
              q.type AS question_type, q.node_id AS question_node_id,
              q.image AS question_image, q.hint AS question_hint,
              q.answer_template AS question_answer_template,
              q.time_limit AS question_time_limit, q.grade AS question_grade,
              u.first_name, u.last_name
            FROM question_reports qr
            LEFT JOIN questions q ON q.id = qr.question_id
            LEFT JOIN users u ON LOWER(u.email) = LOWER(qr.reporter_email)
            WHERE qr.status = $1
            ORDER BY qr.created_at DESC
            LIMIT 200
          `, [reports]);
          return res.json({ ok: true, reports: r.rows });
        } catch(e) {
          // Хэрэв table байхгүй бол хоосон буцаана (setup ажиллаагүй)
          if (/relation .+ does not exist/i.test(e.message)) {
            return res.json({ ok: true, reports: [] });
          }
          return res.status(500).json({ ok: false, error: e.message });
        }
      }

      // ids=1,2,3 — batch lookup by id
      if (ids) {
        const idList = String(ids).split(',').map(function(x){ return parseInt(x); }).filter(function(x){ return !isNaN(x); });
        if (!idList.length) return res.json({ ok: true, questions: [] });
        const r0 = await pool.query('SELECT * FROM questions WHERE id = ANY($1::bigint[])', [idList]);
        return res.json({ ok: true, questions: r0.rows });
      }
      let q = 'SELECT * FROM questions';
      const conds = [], vals = [];
      // exam=1 → зөвхөн шалгалтын бодлого. exam=0 эсвэл undefined → зөвхөн хичээлийн бодлого
      // exam=all → бүгд
      const examParam = req.query.exam;
      if (examParam === '1') conds.push('is_exam = true');
      else if (examParam !== 'all') conds.push('(is_exam = false OR is_exam IS NULL)');
      if (topic)   { conds.push(`topic=$${vals.length+1}`); vals.push(topic); }
      if (grade)   { conds.push(`(grade=$${vals.length+1} OR grade IS NULL OR grade='')`); vals.push(grade); }
      if (max_grade) {
        // Анги <= max_grade буюу анги хоосон (бүх ангид зориулсан) бодлогууд
        const mg = parseInt(max_grade);
        if (!isNaN(mg)) {
          conds.push(`(grade IS NULL OR grade='' OR (grade ~ '^[0-9]+$' AND CAST(grade AS INT) <= $${vals.length+1}))`);
          vals.push(mg);
        }
      }
      // node_id=5 эсвэл node_id=5,7,12 (олон хичээлийн агуулгыг нэгтгэх)
      if (node_id) {
        const nIds = String(node_id).split(',').map(x => parseInt(x, 10)).filter(x => !isNaN(x)).slice(0, 60);
        if (nIds.length === 1) { conds.push(`node_id=$${vals.length+1}`); vals.push(nIds[0]); }
        else if (nIds.length) { conds.push(`node_id = ANY($${vals.length+1}::int[])`); vals.push(nIds); }
      }
      // Тухайн ангийн БҮХ node-ийн бодлого (node_id өгөөгүй үед хяналтын жагсаалтад)
      if (node_grade && !node_id) {
        conds.push(`node_id IN (SELECT id FROM nodes WHERE grade = $${vals.length+1})`);
        vals.push(String(node_grade));
      }
      if (conds.length) q += ' WHERE ' + conds.join(' AND ');
      q += ' ORDER BY id ASC';
      const r = await pool.query(q, vals);

      /* ── pick=N — давтагдахгүй эргэлт ──
         Нэг хичээлийн сангаас N бодлогыг СОНГОНО. Хэрэглэгч тухайн хичээл дээр
         өмнө нь үзсэн бодлогыг дахин авахгүй: 60 бодлоготой сан, pick=20 бол
         3 оролтын дараа буюу 60 бодлогын дараа л эргэж давтагдана.
         Нэвтрээгүй / pick өгөөгүй үед хуучин зан төлөв хэвээр (бүгдийг буцаана). */
      const pick = parseInt(req.query.pick, 10);
      const oneNode = node_id && String(node_id).indexOf(',') < 0;
      if (Number.isFinite(pick) && pick > 0 && oneNode && onePerVariant(r.rows).length > pick) {
        const u = requireUser(req, { allowWs: true });
        if (u) {
          const nid = parseInt(node_id, 10);
          const out = await pickUnseen(u.email, nid, r.rows, pick);
          if (out) return res.json({ ok: true, questions: out });
        }
        /* Нэвтрээгүй эсвэл DB алдаа → энгийн санамсаргүй сонголт */
        const sh = onePerVariant(r.rows);
        for (let i = sh.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; }
        return res.json({ ok: true, questions: sh.slice(0, pick) });
      }
      return res.json({ ok: true, questions: r.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Хэрэглэгчээс ирсэн "Алдаа мэдэгдэх"
      if (body.action === 'reportQuestion') {
        const { question_id, reason } = body;
        // Токен байвал имэйлийг түүнээс, үгүй бол body-оос (хуучин клиент — index.html authFetch руу шилжтэл түр)
        const tokUser = requireUser(req);
        const reporter_email = tokUser ? tokUser.email : (body.reporter_email ? String(body.reporter_email).trim().toLowerCase().slice(0, 254) : '');
        if (!question_id || !reporter_email || isNaN(parseInt(question_id))) return res.status(400).json({ ok: false, error: 'Missing fields' });
        // Токенгүй: хатуу хязгаар (IP 5/цаг) + бүртгэлтэй имэйл байх ёстой (зохиомол имэйлээр спам хийхээс)
        if (!(await rateLimit('qreport:ip:' + clientIp(req), tokUser ? 20 : 5, 3600))) {
          return res.status(429).json({ ok: false, error: 'Хэт олон мэдэгдэл. Түр хүлээгээд дахин оролдоно уу.' });
        }
        if (!tokUser) {
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporter_email)) return res.status(400).json({ ok: false, error: 'Имэйл буруу' });
          const ue = await pool.query('SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [reporter_email]);
          if (!ue.rows.length) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        }
        // Table байхгүй бол үүсгэх (lazy)
        await pool.query(`
          CREATE TABLE IF NOT EXISTS question_reports (
            id BIGSERIAL PRIMARY KEY,
            question_id INT NOT NULL,
            reporter_email TEXT NOT NULL,
            reason TEXT,
            status TEXT NOT NULL DEFAULT 'open',
            created_at TIMESTAMPTZ DEFAULT NOW(),
            resolved_at TIMESTAMPTZ
          )
        `).catch(()=>{});
        const r = await pool.query(
          'INSERT INTO question_reports (question_id, reporter_email, reason) VALUES ($1,$2,$3) RETURNING id',
          [parseInt(question_id), String(reporter_email).toLowerCase(), String(reason || '').slice(0, 500)]
        );
        // Telegram notification (fire-and-forget)
        try {
          const { sendTelegram } = require('./_telegram');
          const qq = await pool.query('SELECT text, correct FROM questions WHERE id=$1', [parseInt(question_id)]);
          const qtext = qq.rows[0] ? String(qq.rows[0].text || '').slice(0, 300) : '?';
          const qcorrect = qq.rows[0] ? String(qq.rows[0].correct || '').slice(0, 100) : '?';
          const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
          const msg =
            '🚨 <b>Шинэ алдааны мэдэгдэл</b>\n\n' +
            '<b>Хэрэглэгч:</b> ' + esc(reporter_email) + '\n' +
            '<b>Асуулт ID:</b> ' + question_id + '\n' +
            '<b>Асуулт:</b> ' + esc(qtext) + '\n' +
            '<b>Зөв хариулт:</b> ' + esc(qcorrect) + '\n' +
            '<b>Шалтгаан:</b> ' + esc(reason || '—') + '\n' +
            '<b>Report ID:</b> ' + r.rows[0].id;
          sendTelegram(msg).catch(() => {});
        } catch (_) {}
        return res.json({ ok: true, id: r.rows[0].id });
      }

      // Admin: report-ийг шийдсэн / устгасан гэж тэмдэглэх
      if (body.action === 'resolveReport') {
        const { id, status } = body;
        if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });
        const newStatus = (status === 'dismissed') ? 'dismissed' : 'resolved';
        await pool.query(
          'UPDATE question_reports SET status=$1, resolved_at=NOW() WHERE id=$2',
          [newStatus, parseInt(id)]
        );
        return res.json({ ok: true });
      }

      // Үндсэн POST — асуулт үүсгэх (хуучин логик)
      const { text, topic, grade, correct, choices, hint, node_id, type, image, answer_template, time_limit, difficulty, is_exam } = body;
      if (!text || !correct) return res.status(400).json({ ok: false, error: 'Missing fields' });
      const validDiff = ['easy','medium','hard'].indexOf(difficulty) >= 0 ? difficulty : 'medium';
      const r = await pool.query(
        'INSERT INTO questions (text,topic,grade,correct,choices,hint,node_id,type,image,answer_template,time_limit,difficulty,is_exam) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',
        [text, topic, grade, correct, choices, hint ? JSON.stringify(hint) : null, node_id || null, type || 'choice', image || null,
         answer_template || null,
         (time_limit != null && time_limit !== '') ? parseInt(time_limit) : null,
         validDiff,
         !!is_exam]
      );
      return res.json({ ok: true, question: r.rows[0] });
    }

    if (req.method === 'PUT') {
      const body = req.body || {};
      const id = body.id;
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      // Partial update — зөвхөн оруулсан талбарыг шинэчлэх
      const sets = [];
      const vals = [];
      let i = 1;
      const has = function(k) { return Object.prototype.hasOwnProperty.call(body, k); };

      if (has('text'))     { sets.push(`text=$${++i}`);    vals.push(body.text); }
      if (has('correct'))  { sets.push(`correct=$${++i}`); vals.push(body.correct); }
      if (has('choices'))  { sets.push(`choices=$${++i}`); vals.push(body.choices); }
      if (has('hint'))     { sets.push(`hint=$${++i}`);    vals.push(body.hint ? (typeof body.hint === 'string' ? body.hint : JSON.stringify(body.hint)) : null); }
      if (has('node_id'))  { sets.push(`node_id=$${++i}`); vals.push(body.node_id || null); }
      if (has('type'))     { sets.push(`type=$${++i}`);    vals.push(body.type || 'choice'); }
      if (has('image'))    { sets.push(`image=$${++i}`);   vals.push(body.image || null); }
      if (has('grade'))    { sets.push(`grade=$${++i}`);   vals.push(body.grade || null); }
      if (has('answer_template')) { sets.push(`answer_template=$${++i}`); vals.push(body.answer_template || null); }
      if (has('time_limit')) { sets.push(`time_limit=$${++i}`); vals.push((body.time_limit != null && body.time_limit !== '') ? parseInt(body.time_limit) : null); }
      if (has('difficulty')) {
        var d = ['easy','medium','hard'].indexOf(body.difficulty) >= 0 ? body.difficulty : 'medium';
        sets.push(`difficulty=$${++i}`); vals.push(d);
      }
      if (has('is_exam')) { sets.push(`is_exam=$${++i}`); vals.push(!!body.is_exam); }

      if (!sets.length) return res.json({ ok: true, noop: true });

      // $1-ийг id-д ашиглах учир sets-д $2-аас эхэлсэн
      await pool.query(`UPDATE questions SET ${sets.join(', ')} WHERE id=$1`, [id, ...vals]);
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      await pool.query('DELETE FROM questions WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
