const pool = require('./_db');

// 🐱 Pet Companion — Phase 1
// Хэрэглэгч бүр нэг active pet-тэй. Хичээл дуусгахад автоматаар "хооллож" өснө.
//
// Actions:
//   get    { email }                  → { ok, pet | null }
//   hatch  { email, pet_type, name? } → { ok, pet }  (анх удаа)
//   feed   { email, amount? }         → { ok, pet, leveledUp, fromLevel, toLevel }
//   rename { email, name }            → { ok, pet }
//
// Level томёо: 100 pet_xp = 1 level. Сүүлийн level хязгаар 50.

const SPECIES = new Set(['cat', 'fox', 'dragon', 'unicorn', 'penguin']);
const PETXP_PER_LEVEL = 100;
const MAX_LEVEL = 50;

function levelFromXp(xp) {
  return Math.min(MAX_LEVEL, 1 + Math.floor((parseInt(xp) || 0) / PETXP_PER_LEVEL));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_pets (
        id BIGSERIAL PRIMARY KEY,
        user_email TEXT UNIQUE NOT NULL,
        pet_type TEXT NOT NULL,
        name TEXT DEFAULT 'Pet',
        level INT NOT NULL DEFAULT 1,
        pet_xp INT NOT NULL DEFAULT 0,
        happiness INT NOT NULL DEFAULT 100,
        last_fed_at TIMESTAMPTZ DEFAULT NOW(),
        hatched_at TIMESTAMPTZ DEFAULT NOW(),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    if (req.method !== 'POST') return res.status(405).end();
    const body = req.body || {};
    const action = body.action;
    const email = body.email ? String(body.email).toLowerCase() : null;
    if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

    if (action === 'get') {
      const r = await pool.query(`SELECT * FROM user_pets WHERE user_email=$1`, [email]);
      return res.json({ ok: true, pet: r.rows[0] || null });
    }

    if (action === 'hatch') {
      const petType = String(body.pet_type || '').toLowerCase();
      if (!SPECIES.has(petType)) return res.status(400).json({ ok: false, error: 'Invalid species' });
      const exists = await pool.query(`SELECT id FROM user_pets WHERE user_email=$1`, [email]);
      if (exists.rows.length) return res.status(400).json({ ok: false, error: 'Pet already exists' });
      const name = String(body.name || '').slice(0, 30) || defaultName(petType);
      const r = await pool.query(
        `INSERT INTO user_pets (user_email, pet_type, name, hatched_at) VALUES ($1, $2, $3, NOW()) RETURNING *`,
        [email, petType, name]
      );
      return res.json({ ok: true, pet: r.rows[0] });
    }

    if (action === 'feed') {
      const amount = Math.max(1, Math.min(500, parseInt(body.amount) || 5));
      const r = await pool.query(`SELECT * FROM user_pets WHERE user_email=$1`, [email]);
      if (!r.rows.length) return res.json({ ok: false, error: 'no pet' });
      const cur = r.rows[0];
      const fromLevel = parseInt(cur.level) || 1;
      const newXp = (parseInt(cur.pet_xp) || 0) + amount;
      const toLevel = levelFromXp(newXp);
      const newHappiness = Math.min(100, (parseInt(cur.happiness) || 100) + 2);
      const upd = await pool.query(
        `UPDATE user_pets SET pet_xp=$1, level=$2, happiness=$3, last_fed_at=NOW() WHERE id=$4 RETURNING *`,
        [newXp, toLevel, newHappiness, cur.id]
      );
      return res.json({
        ok: true,
        pet: upd.rows[0],
        leveledUp: toLevel > fromLevel,
        fromLevel,
        toLevel,
      });
    }

    if (action === 'rename') {
      const name = String(body.name || '').slice(0, 30);
      if (!name) return res.status(400).json({ ok: false });
      const upd = await pool.query(
        `UPDATE user_pets SET name=$1 WHERE user_email=$2 RETURNING *`,
        [name, email]
      );
      if (!upd.rows.length) return res.status(404).json({ ok: false });
      return res.json({ ok: true, pet: upd.rows[0] });
    }

    return res.status(400).json({ ok: false, error: 'unknown action' });
  } catch (e) {
    console.error('[pet]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};

function defaultName(t) {
  return ({
    cat: 'Мяу',
    fox: 'Үнэг',
    dragon: 'Луу',
    unicorn: 'Унигорн',
    penguin: 'Пингвин',
  })[t] || 'Pet';
}
