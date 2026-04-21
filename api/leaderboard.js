const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // XP-ээр эрэмбэлсэн топ 20 хэрэглэгч
    const r = await pool.query(`
      SELECT id, first_name, last_name, xp, avatar, grade, plan
      FROM users
      WHERE xp > 0
      ORDER BY xp DESC
      LIMIT 20
    `);
    return res.json({ ok: true, users: r.rows });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
