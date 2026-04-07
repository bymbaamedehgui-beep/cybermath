const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { filter, value } = req.query;

    let where = 'WHERE verified=true';
    if (filter === 'aimag' && value) where += ` AND aimag=$1`;
    else if (filter === 'duureg' && value) where += ` AND duureg=$1`;
    else if (filter === 'school' && value) where += ` AND school=$1`;
    else if (filter === 'grade' && value) where += ` AND grade=$1`;

    const vals = value && filter !== 'all' ? [value] : [];

    const r = await pool.query(`
      SELECT first_name, last_name, xp, grade, aimag, duureg, school,
             array_length(completed_lessons, 1) as done,
             plan, avatar
      FROM users ${where}
      ORDER BY xp DESC
      LIMIT 100
    `, vals);

    res.json({ ok: true, users: r.rows });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
