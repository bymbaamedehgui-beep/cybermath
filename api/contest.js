const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Хүснэгтүүдийг үүсгэх (idempotent)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contests (
        id BIGSERIAL PRIMARY KEY,
        title TEXT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        winner_name TEXT,
        winner_phone TEXT,
        winner_at TIMESTAMPTZ,
        active BOOLEAN DEFAULT true,
        attempt_count INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contest_attempts (
        id BIGSERIAL PRIMARY KEY,
        contest_id BIGINT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT,
        answer TEXT,
        correct BOOLEAN,
        submitted_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ca_contest ON contest_attempts(contest_id, submitted_at DESC)`).catch(()=>{});

    // ── GET — Live state буцаах (polling) ──
    if (req.method === 'GET') {
      const id = parseInt(req.query.id || '0');
      if (!id) {
        // Сүүлд идэвхтэй contest буцаах
        const r = await pool.query('SELECT * FROM contests WHERE active=true ORDER BY created_at DESC LIMIT 1');
        return res.json({ ok: true, contest: r.rows[0] || null });
      }
      const r = await pool.query('SELECT * FROM contests WHERE id=$1', [id]);
      const contest = r.rows[0];
      if (!contest) return res.json({ ok: false, error: 'Олдсонгүй' });
      // attempt count refresh
      const c = await pool.query('SELECT COUNT(*) AS c FROM contest_attempts WHERE contest_id=$1', [id]);
      contest.attempt_count = parseInt(c.rows[0].c) || 0;
      return res.json({ ok: true, contest });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // Шинэ уралдаан үүсгэх (админ)
      if (action === 'create') {
        const { title, question, answer } = body;
        if (!question || !answer) return res.status(400).json({ ok: false, error: 'Асуулт болон хариу заавал' });
        // Бусад идэвхтэй уралдааныг хаах
        await pool.query('UPDATE contests SET active=false WHERE active=true');
        const r = await pool.query(
          'INSERT INTO contests (title, question, answer) VALUES ($1, $2, $3) RETURNING *',
          [title || 'Эцэг эхийн уралдаан', question.trim(), String(answer).trim()]
        );
        return res.json({ ok: true, contest: r.rows[0] });
      }

      // Дахин эхлүүлэх (winner reset, attempts хадгалагдсан хэвээр)
      if (action === 'reset') {
        const { id } = body;
        if (!id) return res.status(400).json({ ok: false });
        await pool.query('UPDATE contests SET winner_name=NULL, winner_phone=NULL, winner_at=NULL WHERE id=$1', [id]);
        await pool.query('DELETE FROM contest_attempts WHERE contest_id=$1', [id]);
        const r = await pool.query('SELECT * FROM contests WHERE id=$1', [id]);
        return res.json({ ok: true, contest: r.rows[0] });
      }

      // Дуусгах
      if (action === 'close') {
        const { id } = body;
        if (!id) return res.status(400).json({ ok: false });
        await pool.query('UPDATE contests SET active=false WHERE id=$1', [id]);
        return res.json({ ok: true });
      }

      // Эцэг эх хариу илгээх
      if (action === 'submit') {
        const { id, name, phone, answer } = body;
        if (!id || !name || answer === undefined || answer === null) {
          return res.status(400).json({ ok: false, error: 'Нэр, хариу заавал' });
        }
        const cleanName = String(name).trim().slice(0, 80);
        const cleanPhone = phone ? String(phone).trim().slice(0, 20) : null;
        const cleanAnswer = String(answer).trim();
        if (!cleanName) return res.status(400).json({ ok: false, error: 'Нэр заавал' });

        // Уралдаан байгаа эсэхийг шалгах
        const cr = await pool.query('SELECT * FROM contests WHERE id=$1', [id]);
        const contest = cr.rows[0];
        if (!contest) return res.json({ ok: false, error: 'Уралдаан олдсонгүй' });
        if (!contest.active) return res.json({ ok: false, error: 'Уралдаан дууссан' });

        // Хариулт зөв эсэх (case-insensitive, тэмдэгтгүй харьцуулалт)
        const normalize = (s) => String(s).toLowerCase().replace(/[\s\.,;:!\?\-_]+/g, '').trim();
        const isCorrect = normalize(cleanAnswer) === normalize(contest.answer);

        // attempt бүртгэх
        await pool.query(
          'INSERT INTO contest_attempts (contest_id, name, phone, answer, correct) VALUES ($1, $2, $3, $4, $5)',
          [id, cleanName, cleanPhone, cleanAnswer, isCorrect]
        );

        if (!isCorrect) {
          return res.json({ ok: true, correct: false, message: 'Хариулт буруу байна. Анхаарна уу — дахин оролдох боломжгүй.' });
        }

        // Зөв! Хэрэв ялагч хараахан тогтоогоогүй бол энэ хүнийг ялагч болгох (atomic)
        const u = await pool.query(
          `UPDATE contests
           SET winner_name=$1, winner_phone=$2, winner_at=NOW()
           WHERE id=$3 AND winner_name IS NULL
           RETURNING winner_name, winner_at`,
          [cleanName, cleanPhone, id]
        );

        if (u.rows.length) {
          // Энэ хүн ялсан!
          return res.json({ ok: true, correct: true, winner: true, winner_name: cleanName, winner_at: u.rows[0].winner_at });
        } else {
          // Зөв хариулсан ч өмнө нь хэн нэгэн түрүүлсэн
          const w = await pool.query('SELECT winner_name FROM contests WHERE id=$1', [id]);
          return res.json({ ok: true, correct: true, winner: false, winner_name: w.rows[0] ? w.rows[0].winner_name : null });
        }
      }

      // Сүүлийн оролдлогуудыг харах (admin/presenter)
      if (action === 'attempts') {
        const { id } = body;
        if (!id) return res.status(400).json({ ok: false });
        const r = await pool.query(
          'SELECT name, phone, correct, submitted_at FROM contest_attempts WHERE contest_id=$1 ORDER BY submitted_at DESC LIMIT 50',
          [id]
        );
        return res.json({ ok: true, attempts: r.rows });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[contest]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
