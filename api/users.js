const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const r = await pool.query('SELECT id,email,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,completed_lessons,created_at FROM users ORDER BY created_at DESC');
      return res.json({ ok: true, users: r.rows });
    }

    if (req.method === 'PUT') {
      const { email, plan, xp, gems, hearts, streak, avatar, completed_lesson } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      // completed_lesson array-д нэмэх
      if (completed_lesson !== undefined) {
        await pool.query(
          `UPDATE users SET completed_lessons = array_append(COALESCE(completed_lessons,'{}'), $1::int)
           WHERE email=$2 AND NOT ($1::int = ANY(COALESCE(completed_lessons,'{}')))`,
          [completed_lesson, email]
        );
      }

      // Бусад талбарууд
      const sets = [];
      const vals = [];
      let i = 1;
      if (plan   !== undefined) { sets.push(`plan=$${i++}`);   vals.push(plan); }
      if (xp     !== undefined) { sets.push(`xp=$${i++}`);     vals.push(xp); }
      if (gems   !== undefined) { sets.push(`gems=$${i++}`);   vals.push(gems); }
      if (hearts !== undefined) { sets.push(`hearts=$${i++}`); vals.push(hearts); }
      if (streak !== undefined) { sets.push(`streak=$${i++}`); vals.push(streak); }
      if (avatar !== undefined) { sets.push(`avatar=$${i++}`); vals.push(avatar); }

      if (sets.length) {
        vals.push(email);
        await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$${i}`, vals);
      }

      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { email } = req.body || {};
      await pool.query('DELETE FROM users WHERE email=$1', [email]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
