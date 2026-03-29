const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { topic, grade, node_id } = req.query || {};
      let q = 'SELECT * FROM questions';
      const conds = [], vals = [];
      if (topic)   { conds.push(`topic=$${vals.length+1}`); vals.push(topic); }
      if (grade)   { conds.push(`(grade=$${vals.length+1} OR grade IS NULL OR grade='')`); vals.push(grade); }
      if (node_id) { conds.push(`node_id=$${vals.length+1}`); vals.push(parseInt(node_id)); }
      if (conds.length) q += ' WHERE ' + conds.join(' AND ');
      q += ' ORDER BY created_at DESC';
      const r = await pool.query(q, vals);
      return res.json({ ok: true, questions: r.rows });
    }

    if (req.method === 'POST') {
      const { text, topic, grade, correct, choices, hint, node_id } = req.body || {};
      if (!text || !correct) return res.status(400).json({ ok: false, error: 'Missing fields' });
      const r = await pool.query(
        'INSERT INTO questions (text,topic,grade,correct,choices,hint,node_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [text, topic, grade, correct, choices, hint ? JSON.stringify(hint) : null, node_id || null]
      );
      return res.json({ ok: true, question: r.rows[0] });
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
