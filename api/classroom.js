const pool = require('./_db');

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { teacher_email, join_code, classroom_id } = req.query || {};

      if (classroom_id) {
        const r = await pool.query(`
          SELECT u.first_name, u.last_name, u.email, u.grade,
                 u.xp, u.streak, u.gems, u.hearts,
                 array_length(u.completed_lessons, 1) as completed_count,
                 u.weekly_xp, u.league_tier, cm.joined_at
          FROM class_members cm
          JOIN users u ON u.email = cm.student_email
          WHERE cm.classroom_id = $1
          ORDER BY u.xp DESC
        `, [classroom_id]);
        return res.json({ ok: true, students: r.rows });
      }

      if (join_code) {
        const r = await pool.query('SELECT * FROM classrooms WHERE join_code=$1', [join_code.toUpperCase()]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Код олдсонгүй' });
        return res.json({ ok: true, classroom: r.rows[0] });
      }

      if (teacher_email) {
        const r = await pool.query(
          `SELECT c.*, COUNT(cm.id) as member_count
           FROM classrooms c
           LEFT JOIN class_members cm ON cm.classroom_id = c.id
           WHERE c.teacher_email=$1
           GROUP BY c.id
           ORDER BY c.created_at DESC`,
          [teacher_email]
        );
        return res.json({ ok: true, classrooms: r.rows });
      }

      return res.status(400).json({ ok: false, error: 'Missing params' });
    }

    if (req.method === 'POST') {
      const { action, teacher_email, name, grade, student_email, join_code } = req.body || {};

      if (action === 'create') {
        if (!teacher_email || !name) return res.status(400).json({ ok: false, error: 'Missing fields' });
        let code = generateCode();
        const existing = await pool.query('SELECT id FROM classrooms WHERE join_code=$1', [code]);
        if (existing.rows.length) code = generateCode() + Math.floor(Math.random()*9);
        const r = await pool.query(
          'INSERT INTO classrooms (name, join_code, teacher_email, grade) VALUES ($1,$2,$3,$4) RETURNING *',
          [name, code, teacher_email, grade || '']
        );
        return res.json({ ok: true, classroom: r.rows[0] });
      }

      if (action === 'join') {
        if (!student_email || !join_code) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const c = await pool.query('SELECT * FROM classrooms WHERE join_code=$1', [join_code.toUpperCase()]);
        if (!c.rows.length) return res.status(404).json({ ok: false, error: 'Код буруу байна' });
        const classroom = c.rows[0];
        await pool.query(
          'INSERT INTO class_members (classroom_id, student_email) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [classroom.id, student_email]
        );
        return res.json({ ok: true, classroom });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    if (req.method === 'DELETE') {
      const { classroom_id, student_email, teacher_email } = req.body || {};
      if (student_email && classroom_id) {
        await pool.query('DELETE FROM class_members WHERE classroom_id=$1 AND student_email=$2', [classroom_id, student_email]);
        return res.json({ ok: true });
      }
      if (classroom_id && teacher_email) {
        await pool.query('DELETE FROM classrooms WHERE id=$1 AND teacher_email=$2', [classroom_id, teacher_email]);
        return res.json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: 'Missing params' });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
