const pool = require('./_db');
const { secretMissing, requireAdmin } = require('./_guard');

// ── Хичээлийн замын багц суулгах (админ) ──
// node: байхгүй бол л нэмнэ (админы засварласан нэр/дүрсийг дарахгүй); нэр засах (RENAMES, NAME_FIXES) — одоогийн нэр хуучинтай
// ЯГ таарвал л. Бодлого (fill): 'empty' — зөвхөн БОДЛОГОГҮЙ node-д (шинэ анги: админы устгасныг сэргээхгүй, генератор
// шинэчлэгдсэн ч давхардуулахгүй — солих бол тэр node-ийн бодлогыг админ устгаад дахин суулгана); 'add' — (node_id, text)
// байхгүй бодлогыг нэмнэ (одоо байгаа хичээлийн бодлогыг нэмэгдүүлэх). move: тухайн ангийн багцаас гадуурх хуучин node-уудыг
// УСТГАХГҮЙ, замын төгсгөлд (sort_order 951+). Дахин дуудахад аюулгүй (нэмэх юм алга бол 0). Node бүр бүтнээрээ нэг олон мөрт
// INSERT-д (≤500 мөр) — тасарвал хагас node үлдэхгүй.
// require нь статик бичвэртэй байх ёстой — Vercel (nft) хувьсагчаар дуудсан файлыг функцэд оруулдаггүй
// 9-р анги: node зөөхгүй/устгахгүй; ORDER-оор sort_order-ыг сурах бичгийн бүлгийн дарааллаар (index.html нь DB-д «📝» бататгал
// гарсны дараа 9-р ангийг бусад ангийн адил sort_order-оор зурна), COPIES — 8-р ангийн давтлага node (901–914)
const PATHS = {
  '9': { load: () => require('./_g9path'), lo: 1, hi: 160, move: false, fill: 'add' },
  '11': { load: () => require('./_g11path'), lo: 801, hi: 899, move: true, fill: 'empty' },
};
// Бүх ангийн node-ийн нэрийн бичгийн алдаа (ажлын хуудас/сурах бичгийн нэр томьёогоор) — аль ч ангийг суулгахад засагдана
const NAME_FIXES = [
  [348, 'Параллел зөөлт', 'Параллель зөөлт'],
  [741, 'Параллел зөөлтөөр дараалан хувиргах', 'Параллель зөөлтөөр дараалан хувиргах'],
  [456, 'Параллел зөөлт', 'Параллель зөөлт'],
  [453, 'Цэгийн хувь дахь тэгш хэм', 'Цэгийн хувьд тэгш хэм'],
  [447, 'Матрицын үржүүлэх үйлдэл', 'Матриц үржүүлэх үйлдэл'],
];
function rowsSql(n, w) {
  const out = [];
  for (let i = 0; i < n; i++) { const b = i * w, r = []; for (let j = 1; j <= w; j++) r.push('$' + (b + j)); out.push('(' + r.join(',') + ')'); }
  return out.join(',');
}
async function installPath(grade) {
  const P = PATHS[grade];
  if (!P) return { ok: false, error: 'Энэ ангийн хичээлийн замын багц алга' };
  const pack = P.load();
  await pool.query("ALTER TABLE questions ADD COLUMN IF NOT EXISTS difficulty TEXT DEFAULT 'medium'").catch(() => {});
  const ex = await pool.query('SELECT id FROM nodes WHERE id = ANY($1::int[])', [pack.NODES.map((n) => n[0])]);
  const have = new Set(ex.rows.map((r) => +r.id));
  const add = pack.NODES.filter((n) => !have.has(n[0]));
  if (add.length) {
    await pool.query('INSERT INTO nodes (id, name, type, icon, grade, sort_order) VALUES ' + rowsSql(add.length, 6) + ' ON CONFLICT (id) DO NOTHING',
      [].concat.apply([], add.map((n) => n.slice(0, 6))));
  }
  let renamed = 0;
  for (const r of (pack.RENAMES || []).concat(NAME_FIXES)) {
    const u = await pool.query("UPDATE nodes SET name = $3 WHERE id = $1 AND COALESCE(name, '') = $2", [r[0], r[1], r[2]]);
    renamed += u.rowCount || 0;
  }
  // Замын дараалал (ORDER [id, sort_order] — 9-р анги сурах бичгийн бүлгээр) ба бататгалын нэр (FORCE_NAMES: «📝 …» — index.html
  // cmBuildExamMap, api/questions gameNodeKind бататгалыг ингэж таньдаг). Зөвхөн тухайн ангийн node-д; юуг ч устгахгүй.
  let ordered = 0, forced = 0;
  if ((pack.ORDER || []).length) {
    const o = pack.ORDER, vals = o.map((_, i) => '($' + (2 * i + 2) + '::int,$' + (2 * i + 3) + '::int)').join(',');
    const r = await pool.query('UPDATE nodes n SET sort_order = v.so FROM (VALUES ' + vals + ') AS v(id, so) WHERE n.id = v.id AND n.grade = $1 AND n.sort_order IS DISTINCT FROM v.so',
      [grade].concat([].concat.apply([], o.map((x) => [x[0], x[1]]))));
    ordered = r.rowCount || 0;
  }
  if ((pack.FORCE_NAMES || []).length) {
    const f = pack.FORCE_NAMES, vals = f.map((_, i) => '($' + (2 * i + 2) + '::int,$' + (2 * i + 3) + '::text)').join(',');
    const r = await pool.query('UPDATE nodes n SET name = v.nm FROM (VALUES ' + vals + ') AS v(id, nm) WHERE n.id = v.id AND n.grade = $1 AND n.name IS DISTINCT FROM v.nm',
      [grade].concat([].concat.apply([], f.map((x) => [x[0], x[1]]))));
    forced = r.rowCount || 0;
  }
  let moved = 0;
  if (P.move) {
    const old = await pool.query('SELECT id, sort_order FROM nodes WHERE grade = $1 AND (id < $2 OR id > $3) ORDER BY COALESCE(NULLIF(sort_order, 0), id), id',
      [grade, P.lo, P.hi]);
    for (let i = 0; i < old.rows.length; i++) {
      if (+old.rows[i].sort_order === 951 + i) continue;
      await pool.query('UPDATE nodes SET sort_order = $2 WHERE id = $1', [old.rows[i].id, 951 + i]);
      moved++;
    }
  }
  const ids = Array.from(new Set(pack.QUESTIONS.map((q) => q.node_id)));
  const by = new Map();
  const put = (q) => { if (!by.has(q.node_id)) by.set(q.node_id, []); by.get(q.node_id).push(q); };
  if (P.fill === 'add') {
    const eq = await pool.query('SELECT node_id, text FROM questions WHERE node_id = ANY($1::int[])', [ids]);
    const seen = new Set(eq.rows.map((r) => r.node_id + '|' + r.text));
    pack.QUESTIONS.forEach((q) => { if (!seen.has(q.node_id + '|' + q.text)) put(q); });
  } else {
    const cnt = await pool.query('SELECT node_id, COUNT(*)::int AS n FROM questions WHERE node_id = ANY($1::int[]) GROUP BY node_id', [ids]);
    const filled = new Set(cnt.rows.filter((r) => +r.n > 0).map((r) => +r.node_id));
    pack.QUESTIONS.forEach((q) => { if (!filled.has(q.node_id)) put(q); });
  }
  let qAdd = 0, batch = [];
  const flush = async () => {
    if (!batch.length) return;
    await pool.query('INSERT INTO questions (text, node_id, correct, choices, hint, difficulty) VALUES ' + rowsSql(batch.length, 6),
      [].concat.apply([], batch.map((q) => [q.text, q.node_id, q.correct, q.choices, q.hint ? JSON.stringify({ text: q.hint }) : null, q.difficulty || 'medium'])));
    qAdd += batch.length; batch = [];
  };
  // ≤500 мөр (≈3000 параметр) — функцийн хугацаанд багтана
  for (const rows of by.values()) {
    if (batch.length && batch.length + rows.length > 500) await flush();
    batch = batch.concat(rows);
  }
  await flush();
  // Өмнөх ангийн давтлага (COPIES [шинэ node, эх node]): эх node-ийн бодлогыг бүх баганаар нь хуулна (id/serial/uuid-аас бусад),
  // аль хэдийн байгаа (node_id, text)-ийг алгасна — дахин дарахад давхардахгүй
  let copied = 0;
  if ((pack.COPIES || []).length) {
    const cr = await pool.query("SELECT column_name, column_default, is_generated, is_identity FROM information_schema.columns WHERE table_name = 'questions' AND table_schema = current_schema()");
    const cols = cr.rows.filter((c) => c.column_name !== 'id' && c.column_name !== 'node_id' && c.is_generated !== 'ALWAYS' && c.is_identity !== 'YES' &&
      !/nextval|uuid/i.test(c.column_default || '')).map((c) => '"' + String(c.column_name).replace(/"/g, '""') + '"');
    if (cols.indexOf('"text"') >= 0) {
      const sql = 'INSERT INTO questions (node_id, ' + cols.join(', ') + ') SELECT $1, ' + cols.map((c) => 'q.' + c).join(', ') +
        ' FROM questions q WHERE q.node_id = $2 AND NOT EXISTS (SELECT 1 FROM questions d WHERE d.node_id = $1 AND d.text = q.text)';
      for (const c of pack.COPIES) { const r = await pool.query(sql, [c[0], c[1]]); copied += r.rowCount || 0; }
    }
  }
  // Суусан бодлогын засвар (санамж/сонголт): мөрийг (node_id, text) + ХУУЧИН утгаар нь олно — админы засварласанд хүрэхгүй,
  // аль хэдийн засагдсан бол 0
  let patched = 0;
  for (const x of pack.PATCHES || []) {
    const r = await pool.query(
      'UPDATE questions SET hint = $3::jsonb, choices = $4::text[], correct = $5 WHERE node_id = $1 AND text = $2 AND hint = $6::jsonb AND choices = $7::text[] AND correct = $8',
      [x.node_id, x.text, JSON.stringify({ text: x.to.hint }), x.to.choices, x.to.correct, JSON.stringify({ text: x.from.hint }), x.from.choices, x.from.correct]);
    patched += r.rowCount || 0;
  }
  return { ok: true, grade: grade, nodes_added: add.length, nodes_total: pack.NODES.length, questions_added: qAdd,
    questions_total: pack.QUESTIONS.length, nodes_filled: by.size, patched: patched, renamed: renamed, old_moved: moved,
    ordered: ordered, exam_named: forced, copied: copied };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Тоглоомын нийтийн GET — нээлттэй
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      const r = await pool.query('SELECT * FROM nodes ORDER BY sort_order, id');
      // Section labels ч хамт буцаах
      let sectionLabels = [];
      try {
        const sl = await pool.query('SELECT * FROM section_labels ORDER BY id');
        // Ангид зориулсан label-ын DB id нь 10000+ (давхцал гаргахгүйн тулд) — SVG-ийн байрлалын
        // дугаар нь үлдэгдэл хэсэг. Frontend section-label-<id> элементийг энэ дугаараар олдог.
        sectionLabels = sl.rows.map(r => ({ id: r.grade ? (r.id % 10000) : r.id, name: r.name, afterNode: r.after_node, grade: r.grade || null }));
      } catch(e) {}
      return res.json({ ok: true, nodes: r.rows, sectionLabels });
    }

    // Бичих/устгах бүх үйлдэл — зөвхөн админ
    if (['POST', 'PUT', 'DELETE'].indexOf(req.method) >= 0) {
      if (secretMissing(res)) return;
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
    }

    if (req.method === 'POST') {
      const { id, name, type, icon, grade, sort_order, action, labels, intro_html } = req.body || {};

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

      // Хичээлийн замын багц суулгах (админ › Бодлогууд › Learning path хяналт): 11-р анги — api/_g11path.js
      if (action === 'installPath') return res.json(await installPath(String(req.body.grade || '')));

      // intro_html хадгалах (зөвхөн HTML widget)
      if (action === 'saveIntroHtml' && id != null) {
        await pool.query('UPDATE nodes SET intro_html=$2 WHERE id=$1', [id, intro_html || null]);
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
      if (id == null) return res.status(400).json({ ok: false, error: 'Missing id' });
      await pool.query('DELETE FROM nodes WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
