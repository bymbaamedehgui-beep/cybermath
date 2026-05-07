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
      const body = req.body || {};
      const id = body.id;
      if (!id) return res.status(400).json({ ok: false, error: 'Missing id' });

      // Partial update — зөвхөн оруулсан талбарыг шинэчлэх
      const sets = [];
      const vals = [];
      let i = 1;
      const has = function(k) { return Object.prototype.hasOwnProperty.call(body, k); };

      if (has('text'))     { sets.push(`text=$${++i}`);    vals.push(body.text); }
      if (has('correct'))  { sets.push(`correct=$${++i}`); vals.push(body.correct); }
      if (has('choices'))  { sets.push(`choices=$${++i}`); vals.push(body.choices); }
      if (has('hint'))     { sets.push(`hint=$${++i}`);    vals.push(body.hint ? (typeof body.hint === 'string' ? body.hint : JSON.stringify(body.hint)) : null); }
      if (has('node_id'))  { sets.push(`node_id=$${++i}`); vals.push(body.node_id || null); }
      if (has('type'))     { sets.push(`type=$${++i}`);    vals.push(body.type || 'choice'); }
      if (has('image'))    { sets.push(`image=$${++i}`);   vals.push(body.image || null); }
      if (has('grade'))    { sets.push(`grade=$${++i}`);   vals.push(body.grade || null); }

      if (!sets.length) return res.json({ ok: true, noop: true });

      // $1-ийг id-д ашиглах учир sets-д $2-аас эхэлсэн
      await pool.query(`UPDATE questions SET ${sets.join(', ')} WHERE id=$1`, [id, ...vals]);
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
