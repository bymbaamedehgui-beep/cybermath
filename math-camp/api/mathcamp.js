// ЗУСЛАН — Математикийн багшийн систем. Neon Postgres.
// Ирц бүртгэл, хэсэгтэй шалгалтын оноо, өдрийн сэдэв.
const pool = require('./_db');

const ADMIN_PASS = process.env.MATHCAMP_PASS || process.env.CAMP_ADMIN_PASS || 'mathcamp2026';
const ATT = ['present', 'absent', 'excused', 'sick']; // ирсэн / тасалсан / чөлөөтэй / өвчтэй

// Анх удаа DB хоосон бол энэ жагсаалтаар сурагчдыг суулгана.
const SEED = [
  [1, 'Баярмаа', 'Дарь', 9, 'эмэгтэй'],
  [2, 'Пүрэвсайхан', 'Мичидмаа', 9, 'эмэгтэй'],
  [3, 'Пүрэв-Эрдэнэ', 'Сэнгүнбилэг', 11, 'эрэгтэй'],
  [4, 'Намуунцацрал', 'Нэгүүн', 11, 'эрэгтэй'],
  [5, '', 'Билгүүнсаран', 11, 'эмэгтэй'],
  [6, 'О.', 'Бат-Ирээдүй', 11, 'эрэгтэй'],
  [7, '', 'Уран-Од', 12, 'эмэгтэй'],
  [8, 'Баярбат', 'Ангараг', 13, 'эмэгтэй'],
  [9, 'Баярмаа', 'Тод', 13, 'эрэгтэй'],
  [10, 'Бат-эрдэнэ', 'Баттүшиг', 13, 'эрэгтэй'],
  [11, 'Батэрлбоо', 'Гэгээнзаяа', 13, 'эмэгтэй'],
  [12, 'Ганбат', 'Пүрэвдалай', 13, 'эрэгтэй'],
  [13, 'Төмөрсүх', 'Мөнхнасан', 13, 'эрэгтэй'],
  [14, 'Хосбаяр', 'Нэгүүн', 13, 'эрэгтэй'],
  [15, 'М.', 'Одгэрэл', 13, 'эмэгтэй'],
  [16, 'Очирхуяг', 'Саранзаяа', 14, 'эмэгтэй'],
  [17, '', 'Энхжин', 14, 'эмэгтэй'],
  [18, 'О.', 'Есүй', 14, 'эмэгтэй'],
  [19, 'Хүрэлтогоо', 'Тэнгис', 15, 'эрэгтэй'],
  [20, 'Бат-эрдэнэ', 'Урансолонго', 16, 'эмэгтэй'],
  [21, 'Анхбаяр', 'Нандин-эрдэнэ', 16, 'эмэгтэй'],
  [22, 'Энхмаа', 'Хос-Эрдэнэ', 16, 'эрэгтэй'],
  [23, 'Энхмаа', 'Нарансолонго', 16, 'эмэгтэй'],
  [24, 'Отгонбаяр', 'Түвшинтэнгис', 17, 'эрэгтэй'],
];

function isAdmin(b) {
  return b && typeof b.pass === 'string' && b.pass === ADMIN_PASS;
}

async function ensure() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mc_students (
      id BIGSERIAL PRIMARY KEY,
      ord INT,
      last_name TEXT DEFAULT '',
      first_name TEXT NOT NULL,
      age INT,
      gender TEXT,
      grp INT,
      klass TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Групп (зуслангийн 1/2 хуваалт) ба Анги (сурагчийн жинхэнэ анги) баганууд
  await pool.query(`ALTER TABLE mc_students ADD COLUMN IF NOT EXISTS grp INT`).catch(()=>{});
  await pool.query(`ALTER TABLE mc_students ADD COLUMN IF NOT EXISTS klass TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE mc_students ADD COLUMN IF NOT EXISTS done BOOLEAN DEFAULT false`).catch(()=>{});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mc_attendance (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES mc_students(id) ON DELETE CASCADE,
      d DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'present',
      note TEXT,
      UNIQUE(student_id, d)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mc_exam (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      d DATE,
      sections JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mc_score (
      id BIGSERIAL PRIMARY KEY,
      exam_id BIGINT NOT NULL REFERENCES mc_exam(id) ON DELETE CASCADE,
      student_id BIGINT NOT NULL REFERENCES mc_students(id) ON DELETE CASCADE,
      scores JSONB NOT NULL DEFAULT '[]',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(exam_id, student_id)
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mc_topic (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT REFERENCES mc_students(id) ON DELETE CASCADE,
      d DATE NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      duration INT DEFAULT 90,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  // Сурагч бүрд тусдаа сэдэв — хуучин хүснэгтэд багана нэмнэ
  await pool.query(`ALTER TABLE mc_topic ADD COLUMN IF NOT EXISTS student_id BIGINT REFERENCES mc_students(id) ON DELETE CASCADE`).catch(()=>{});

  // Сурагч хоосон бол seed хийнэ.
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM mc_students');
  if (c.rows[0].n === 0) {
    for (const [ord, ln, fn, age, g] of SEED) {
      await pool.query(
        'INSERT INTO mc_students (ord,last_name,first_name,age,gender) VALUES ($1,$2,$3,$4,$5)',
        [ord, ln, fn, age, g]
      );
    }
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensure();
    if (req.method !== 'POST') return res.status(405).json({ ok: false });

    const b = req.body || {};
    const action = b.action;

    if (action === 'login') return res.json({ ok: isAdmin(b) });
    if (!isAdmin(b)) return res.status(401).json({ ok: false, error: 'Нэвтрэх эрхгүй' });

    // ---------- Сурагчид ----------
    if (action === 'students') {
      const r = await pool.query('SELECT * FROM mc_students ORDER BY ord NULLS LAST, id');
      return res.json({ ok: true, items: r.rows });
    }
    if (action === 'addStudent') {
      const { last_name, first_name, age, gender, klass } = b;
      if (!first_name) return res.status(400).json({ ok: false, error: 'Нэр шаардлагатай' });
      const mx = await pool.query('SELECT COALESCE(MAX(ord),0)+1 AS n FROM mc_students');
      const r = await pool.query(
        'INSERT INTO mc_students (ord,last_name,first_name,age,gender,klass) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
        [mx.rows[0].n, last_name || '', first_name, age || null, gender || null, klass ? String(klass).slice(0, 40) : null]
      );
      return res.json({ ok: true, item: r.rows[0] });
    }
    if (action === 'setClass') {
      if (!b.id) return res.status(400).json({ ok: false });
      await pool.query('UPDATE mc_students SET klass=$2 WHERE id=$1', [b.id, b.klass ? String(b.klass).slice(0, 40) : null]);
      return res.json({ ok: true });
    }
    if (action === 'delStudent') {
      if (!b.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM mc_students WHERE id=$1', [b.id]);
      return res.json({ ok: true });
    }
    if (action === 'setGroup') {
      const { id } = b;
      const grp = ([1, 2, 3, 4].includes(b.grp)) ? b.grp : null;
      if (!id) return res.status(400).json({ ok: false });
      await pool.query('UPDATE mc_students SET grp=$2 WHERE id=$1', [id, grp]);
      return res.json({ ok: true });
    }
    if (action === 'setDone') {
      if (!b.id) return res.status(400).json({ ok: false });
      await pool.query('UPDATE mc_students SET done=$2 WHERE id=$1', [b.id, !!b.done]);
      return res.json({ ok: true });
    }

    // ---------- Ирц ----------
    if (action === 'attendanceGet') {
      const d = b.date;
      if (!d) return res.status(400).json({ ok: false, error: 'Огноо' });
      const r = await pool.query('SELECT student_id, status, note FROM mc_attendance WHERE d=$1', [d]);
      return res.json({ ok: true, items: r.rows });
    }
    if (action === 'attendanceSet') {
      const { date, student_id, status, note } = b;
      if (!date || !student_id || ATT.indexOf(status) === -1) return res.status(400).json({ ok: false });
      await pool.query(
        `INSERT INTO mc_attendance (student_id,d,status,note) VALUES ($1,$2,$3,$4)
         ON CONFLICT (student_id,d) DO UPDATE SET status=$3, note=$4`,
        [student_id, date, status, note ?? null]
      );
      return res.json({ ok: true });
    }
    // Бүх сурагчийн ирцийг нэг өдрөөр хадгалах
    if (action === 'attendanceBulk') {
      const { date, items } = b;
      if (!date || !Array.isArray(items)) return res.status(400).json({ ok: false });
      for (const it of items) {
        if (!it.student_id || ATT.indexOf(it.status) === -1) continue;
        await pool.query(
          `INSERT INTO mc_attendance (student_id,d,status,note) VALUES ($1,$2,$3,$4)
           ON CONFLICT (student_id,d) DO UPDATE SET status=$3, note=$4`,
          [it.student_id, date, it.status, it.note ?? null]
        );
      }
      return res.json({ ok: true });
    }
    // Ирцийн нэгдсэн дүн (сурагч тус бүрийн ирсэн/тасалсан тоо)
    if (action === 'attendanceSummary') {
      const r = await pool.query(`
        SELECT student_id,
          COUNT(*) FILTER (WHERE status='present')::int AS present,
          COUNT(*) FILTER (WHERE status='sick')::int AS sick,
          COUNT(*) FILTER (WHERE status='excused')::int AS excused,
          COUNT(*) FILTER (WHERE status='absent')::int AS absent
        FROM mc_attendance GROUP BY student_id`);
      const days = await pool.query('SELECT DISTINCT d FROM mc_attendance ORDER BY d');
      return res.json({ ok: true, items: r.rows, days: days.rows.map(x => x.d) });
    }

    // ---------- Шалгалт ----------
    if (action === 'examList') {
      const r = await pool.query('SELECT * FROM mc_exam ORDER BY d NULLS LAST, id DESC');
      return res.json({ ok: true, items: r.rows });
    }
    if (action === 'examCreate') {
      const { title, date, sections } = b;
      if (!title || !Array.isArray(sections) || !sections.length)
        return res.status(400).json({ ok: false, error: 'Гарчиг ба хэсэг шаардлагатай' });
      const secs = sections.map(s => ({ name: String(s.name || '').slice(0, 80), max: Number(s.max) || 0 }));
      const r = await pool.query(
        'INSERT INTO mc_exam (title,d,sections) VALUES ($1,$2,$3) RETURNING *',
        [String(title).slice(0, 120), date || null, JSON.stringify(secs)]
      );
      return res.json({ ok: true, item: r.rows[0] });
    }
    if (action === 'examDelete') {
      if (!b.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM mc_exam WHERE id=$1', [b.id]);
      return res.json({ ok: true });
    }
    if (action === 'scoreGet') {
      if (!b.exam_id) return res.status(400).json({ ok: false });
      const r = await pool.query('SELECT student_id, scores FROM mc_score WHERE exam_id=$1', [b.exam_id]);
      return res.json({ ok: true, items: r.rows });
    }
    // Бүх шалгалтын бүх оноо (самбар, ахиц, эрэмбэ, карт-д)
    if (action === 'allScores') {
      const r = await pool.query('SELECT exam_id, student_id, scores FROM mc_score');
      return res.json({ ok: true, items: r.rows });
    }
    if (action === 'scoreSet') {
      const { exam_id, student_id, scores } = b;
      if (!exam_id || !student_id || !Array.isArray(scores)) return res.status(400).json({ ok: false });
      const nums = scores.map(x => (x === '' || x == null ? null : Number(x)));
      await pool.query(
        `INSERT INTO mc_score (exam_id,student_id,scores) VALUES ($1,$2,$3)
         ON CONFLICT (exam_id,student_id) DO UPDATE SET scores=$3, updated_at=NOW()`,
        [exam_id, student_id, JSON.stringify(nums)]
      );
      return res.json({ ok: true });
    }

    // ---------- Сэдэв (сурагч бүрд тусдаа) ----------
    if (action === 'topicList') {
      const sid = b.student_id || null;
      const r = sid
        ? await pool.query('SELECT * FROM mc_topic WHERE student_id=$1 ORDER BY d DESC, id DESC', [sid])
        : await pool.query('SELECT * FROM mc_topic ORDER BY d DESC, id DESC');
      return res.json({ ok: true, items: r.rows });
    }
    if (action === 'topicCreate') {
      const { date, title, detail, duration } = b;
      // Нэг буюу олон сурагчид нэг дор оноож болно
      const ids = Array.isArray(b.student_ids) ? b.student_ids : (b.student_id ? [b.student_id] : []);
      if (!date || !title) return res.status(400).json({ ok: false, error: 'Огноо ба гарчиг' });
      if (!ids.length) return res.status(400).json({ ok: false, error: 'Сурагч сонгоно уу' });
      const t = String(title).slice(0, 200);
      const d = detail ? String(detail).slice(0, 2000) : null;
      const dur = Number(duration) || 90;
      const out = [];
      for (const sid of ids) {
        const r = await pool.query(
          'INSERT INTO mc_topic (student_id,d,title,detail,duration) VALUES ($1,$2,$3,$4,$5) RETURNING *',
          [sid, date, t, d, dur]
        );
        out.push(r.rows[0]);
      }
      return res.json({ ok: true, items: out });
    }
    if (action === 'topicDelete') {
      if (!b.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM mc_topic WHERE id=$1', [b.id]);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[mathcamp]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
