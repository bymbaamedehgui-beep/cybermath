const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, pass, firstName, lastName, grade, plan, newPass } = req.body || {};

  try {
    // LOGIN
    if (action === 'login') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1 AND pass=$2', [email, pass]);
      if (!r.rows.length) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      const u = r.rows[0];
      return res.json({ ok: true, user: { email: u.email, firstName: u.first_name, lastName: u.last_name, grade: u.grade, plan: u.plan, xp: u.xp, streak: u.streak } });
    }

    // REGISTER
    if (action === 'register') {
      const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
      if (exists.rows.length) return res.status(400).json({ ok: false, error: 'И-мэйл бүртгэлтэй байна' });
      if (!grade) return res.status(400).json({ ok: false, error: 'Ангиа сонгоно уу' });
      await pool.query(
        'INSERT INTO users (email,pass,first_name,last_name,grade,plan) VALUES ($1,$2,$3,$4,$5,$6)',
        [email, pass, firstName, lastName, grade, plan || 'free']
      );
      const u = (await pool.query('SELECT * FROM users WHERE email=$1', [email])).rows[0];
      return res.json({ ok: true, user: { email: u.email, firstName: u.first_name, lastName: u.last_name, grade: u.grade, plan: u.plan, xp: 0, streak: 0 } });
    }

    // RESET PASSWORD (admin)
    if (action === 'reset') {
      const r = await pool.query('UPDATE users SET pass=$1 WHERE email=$2 RETURNING id', [newPass, email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      return res.json({ ok: true });
    }

    res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
