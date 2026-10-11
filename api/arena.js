// MATH MORTAL тоглоомын ШИЛДЭГИЙН ХҮСНЭГТ.
//   GET  /api/arena         → { ok, top: [{name, grade, level, score}], me }
//   POST /api/arena {level, score}  → нэвтэрсэн хэрэглэгчийн ХАМГИЙН САЙН дүнг хадгална
// Эрэмбэ: хүрсэн ҮЕ (1–10) буурахаар, тэнцвэл оноогоор.
const pool = require('./_db');
const { requireUser, secretMissing, rateLimit } = require('./_guard');

const MAX_LEVEL = 10;
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mm_scores (
      email      TEXT PRIMARY KEY,
      level      INT NOT NULL,
      score      INT NOT NULL DEFAULT 0,
      plays      INT NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS mm_scores_rank_idx ON mm_scores (level DESC, score DESC)`);
  tableReady = true;
}

// Хүснэгтэд имэйл харуулахгүй — зөвхөн нэр (байхгүй бол имэйлийн эхний хэсэг)
function displayName(r) {
  const full = [r.first_name, r.last_name].filter(Boolean).join(' ').trim();
  if (full) return full.slice(0, 28);
  const local = String(r.email || '').split('@')[0];
  return (local.slice(0, 3) + '***') || 'Тоглогч';
}

async function topRows(limit) {
  const r = await pool.query(`
    SELECT s.email, s.level, s.score, u.first_name, u.last_name, u.grade
      FROM mm_scores s LEFT JOIN users u ON lower(u.email) = s.email
     ORDER BY s.level DESC, s.score DESC, s.updated_at ASC
     LIMIT $1`, [limit]);
  return r.rows;
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (secretMissing(res)) return;

  try {
    await ensureTable();

    if (req.method === 'GET') {
      const rows = await topRows(10);
      const top = rows.map(r => ({ name: displayName(r), grade: r.grade || null, level: r.level, score: r.score }));
      // Нэвтэрсэн бол өөрийн байрыг нэмж харуулна
      let me = null;
      const u = requireUser(req);
      if (u) {
        const mine = await pool.query('SELECT level, score FROM mm_scores WHERE email = $1', [u.email]);
        if (mine.rows.length) {
          const m = mine.rows[0];
          const rank = await pool.query(`
            SELECT COUNT(*)::int + 1 AS rank FROM mm_scores
             WHERE level > $1 OR (level = $1 AND score > $2)`, [m.level, m.score]);
          me = { level: m.level, score: m.score, rank: rank.rows[0].rank };
        }
      }
      return res.json({ ok: true, top, me });
    }

    if (req.method === 'POST') {
      const u = requireUser(req);
      if (!u) return res.status(401).json({ ok: false, error: 'Нэвтрэх шаардлагатай' });
      // Нэг тулаан 30 секундээс хурдан дуусахгүй — спамаас хамгаална
      const allowed = await rateLimit('mm:' + u.email, 6, 60);
      if (!allowed) return res.status(429).json({ ok: false, error: 'Хэт олон хүсэлт' });
      const b = req.body || {};
      const level = Math.round(Number(b.level));
      const score = Math.round(Number(b.score));
      if (!Number.isFinite(level) || level < 1 || level > MAX_LEVEL) {
        return res.status(400).json({ ok: false, error: 'Үе 1–' + MAX_LEVEL + ' хооронд байх ёстой' });
      }
      const sc = Number.isFinite(score) ? Math.max(0, Math.min(2000000, score)) : 0;
      await pool.query(`
        INSERT INTO mm_scores (email, level, score, plays) VALUES ($1, $2, $3, 1)
        ON CONFLICT (email) DO UPDATE SET
          score = CASE WHEN EXCLUDED.level > mm_scores.level
                         OR (EXCLUDED.level = mm_scores.level AND EXCLUDED.score > mm_scores.score)
                       THEN EXCLUDED.score ELSE mm_scores.score END,
          level = GREATEST(mm_scores.level, EXCLUDED.level),
          plays = mm_scores.plays + 1,
          updated_at = NOW()`, [u.email, level, sc]);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Арга дэмжигдэхгүй' });
  } catch (e) {
    console.error('[arena]', e && e.message);
    return res.status(500).json({ ok: false, error: 'Серверийн алдаа' });
  }
};
