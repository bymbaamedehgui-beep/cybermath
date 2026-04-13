const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    await pool.query(`UPDATE users SET verified=true WHERE verified=false OR verified IS NULL`);
    return res.json({ ok: true, message: 'All users verified' });
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
};
