const pool = require('./_db');
const { secretMissing, requireAdmin } = require('./_guard');

// Админы үйлдлийн лог — зөвхөн admin.html (adminFetch) бичиж/уншдаг тул бүх method админ шаардана
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (secretMissing(res)) return;
    if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });

    if (req.method === 'GET') {
      const r = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT 100');
      return res.json({ ok: true, logs: r.rows });
    }
    if (req.method === 'POST') {
      const { action, detail, color } = req.body || {};
      await pool.query('INSERT INTO logs (action,detail,color) VALUES ($1,$2,$3)', [
        action == null ? null : String(action).slice(0, 100),
        detail == null ? null : String(detail).slice(0, 1000),
        color ? String(color).slice(0, 20) : '#7B52EE'
      ]);
      return res.json({ ok: true });
    }
    if (req.method === 'DELETE') {
      await pool.query('DELETE FROM logs');
      return res.json({ ok: true });
    }
    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
