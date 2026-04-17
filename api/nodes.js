const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const r = await pool.query('SELECT * FROM nodes ORDER BY sort_order, id');
      // Section labels ч хамт буцаах
      let sectionLabels = [];
      try {
        const sl = await pool.query('SELECT * FROM section_labels ORDER BY id');
        sectionLabels = sl.rows.map(r => ({ id: r.id, name: r.name, afterNode: r.after_node }));
      } catch(e) {}
      return res.json({ ok: true, nodes: r.rows, sectionLabels });
    }

    if (req.method === 'POST') {
      const { id, name, type, icon, grade, sort_order, action, labels } = req.body || {};

      // Section labels хадгалах
      if (action === 'saveSectionLabels' && Array.isArray(labels)) {
        for (const lbl of labels) {
          await pool.query(
            'INSERT INTO section_labels (id, name, after_node) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET name=$2, after_node=$3',
            [lbl.id, lbl.name, lbl.afterNode]
          );
        }
        return res.json({ ok: true });
      }

      // Зөвхөн name шинэчлэх
      if (name !== undefined && type === undefined) {
        await pool.query(
          "UPDATE nodes SET name=$2 WHERE id=$1",
          [id, name]
        );
        return res.json({ ok: true });
      }
      // Бүх field шинэчлэх
      await pool.query(
        'INSERT INTO nodes (id,name,type,icon,grade,sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2,type=$3,icon=$4,grade=$5,sort_order=$6',
        [id, name, type||'locked', icon||'📚', grade||'', sort_order||id]
      );
      return res.json({ ok: true });
    }

    if (req.method === 'PUT') {
      const { nodes } = req.body || {};
      if (!Array.isArray(nodes)) return res.status(400).json({ ok: false, error: 'nodes must be array' });
      for (const n of nodes) {
        await pool.query(
          'INSERT INTO nodes (id,name,type,icon,grade,sort_order) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET name=$2,type=$3,icon=$4,grade=$5,sort_order=$6',
          [n.id, n.name, n.type||'locked', n.icon||'📚', n.grade||'', n.sort_order||n.id]
        );
      }
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      await pool.query('DELETE FROM nodes WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
