const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Lazy migration — difficulty column нэмэх
    await pool.query(`ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium'`).catch(()=>{});

    if (req.method === 'GET') {
      const { topic, grade, max_grade, node_id, ids, reports } = req.query || {};

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
      if (node_id) { conds.push(`node_id=$${vals.length+1}`); vals.push(parseInt(node_id)); }
      if (conds.length) q += ' WHERE ' + conds.join(' AND ');
      q += ' ORDER BY id ASC';
      const r = await pool.query(q, vals);
      return res.json({ ok: true, questions: r.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};

      // Хэрэглэгчээс ирсэн "Алдаа мэдэгдэх"
      if (body.action === 'reportQuestion') {
        const { question_id, reporter_email, reason } = body;
        if (!question_id || !reporter_email) return res.status(400).json({ ok: false, error: 'Missing fields' });
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
      const { text, topic, grade, correct, choices, hint, node_id, type, image, answer_template, time_limit, difficulty } = body;
      if (!text || !correct) return res.status(400).json({ ok: false, error: 'Missing fields' });
      const validDiff = ['easy','medium','hard'].indexOf(difficulty) >= 0 ? difficulty : 'medium';
      const r = await pool.query(
        'INSERT INTO questions (text,topic,grade,correct,choices,hint,node_id,type,image,answer_template,time_limit,difficulty) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
        [text, topic, grade, correct, choices, hint ? JSON.stringify(hint) : null, node_id || null, type || 'choice', image || null,
         answer_template || null,
         (time_limit != null && time_limit !== '') ? parseInt(time_limit) : null,
         validDiff]
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
