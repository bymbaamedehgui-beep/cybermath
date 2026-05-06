const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { topic, grade, node_id, ids } = req.query || {};
      // ids=1,2,3 — batch lookup by id
      if (ids) {
        const idList = String(ids).split(',').map(function(x){ return parseInt(x); }).filter(function(x){ return !isNaN(x); });
        if (!idList.length) return res.json({ ok: true, questions: [] });
        const r0 = await pool.query('SELECT * FROM questions WHERE id = ANY($1::bigint[])', [idList]);
        return res.json({ ok: true, questions: r0.rows });
      }
      let q = 'SELECT * FROM questions';
      const conds = [], vals = [];
      if (topic)   { conds.push(`topic=$${vals.length+1}`); vals.push(topic); }
      if (grade)   { conds.push(`(grade=$${vals.length+1} OR grade IS NULL OR grade='')`); vals.push(grade); }
      if (node_id) { conds.push(`node_id=$${vals.length+1}`); vals.push(parseInt(node_id)); }
      if (conds.length) q += ' WHERE ' + conds.join(' AND ');
      q += ' ORDER BY id ASC';
      const r = await pool.query(q, vals);
      return res.json({ ok: true, questions: r.rows });
    }

    if (req.method === 'POST') {
      const { text, topic, grade, correct, choices, hint, node_id, type, image } = req.body || {};
      if (!text || !correct) return res.status(400).json({ ok: false, error: 'Missing fields' });
      const r = await pool.query(
        'INSERT INTO questions (text,topic,grade,correct,choices,hint,node_id,type,image) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
        [text, topic, grade, correct, choices, hint ? JSON.stringify(hint) : null, node_id || null, type || 'choice', image || null]
      );
      return res.json({ ok: true, question: r.rows[0] });
    }

    if (req.method === 'PUT') {
      const { id, text, correct, choices, hint, node_id, type, image, grade } = req.body || {};
      if (!id || !text || !correct) return res.status(400).json({ ok: false, error: 'Missing fields' });
      // grade талбар оруулсан тохиолдолд шинэчилнэ; эс бөгөөс хадгалагдсан утгыг хэвээр үлдээх
      if (grade !== undefined) {
        await pool.query(
          'UPDATE questions SET text=$2, correct=$3, choices=$4, hint=$5, node_id=$6, type=$7, image=$8, grade=$9 WHERE id=$1',
          [id, text, correct, choices, hint ? JSON.stringify(hint) : null, node_id || null, type || 'choice', image || null, grade || null]
        );
      } else {
        await pool.query(
          'UPDATE questions SET text=$2, correct=$3, choices=$4, hint=$5, node_id=$6, type=$7, image=$8 WHERE id=$1',
          [id, text, correct, choices, hint ? JSON.stringify(hint) : null, node_id || null, type || 'choice', image || null]
        );
      }
      return res.json({ ok: true });
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
