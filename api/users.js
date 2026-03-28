const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // GET all users (admin)
    if (req.method === 'GET') {
      const r = await pool.query('SELECT id,email,first_name,last_name,grade,plan,xp,streak,created_at FROM users ORDER BY created_at DESC');
      return res.json({ ok: true, users: r.rows });
    }

    // PUT - update user (plan, xp, streak)
    if (req.method === 'PUT') {
      const { email, plan, xp, streak } = req.body || {};
      const sets = [];
      const vals = [];
      let i = 1;
      if (plan !== undefined) { sets.push(`plan=$${i++}`); vals.push(plan); }
      if (xp !== undefined)   { sets.push(`xp=$${i++}`);   vals.push(xp); }
      if (streak !== undefined){ sets.push(`streak=$${i++}`); vals.push(streak); }
      if (!sets.length || !email) return res.status(400).json({ ok: false, error: 'Missing fields' });
      vals.push(email);
      await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$${i}`, vals);
      return res.json({ ok: true });
    }

    // DELETE user
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
