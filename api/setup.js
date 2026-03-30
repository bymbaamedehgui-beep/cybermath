const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        pass TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        grade TEXT,
        plan TEXT DEFAULT 'free',
        xp INT DEFAULT 0,
        gems INT DEFAULT 340,
        hearts INT DEFAULT 5,
        streak INT DEFAULT 0,
        avatar TEXT DEFAULT 'default',
        completed_lessons INT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS node_id INT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS gems INT DEFAULT 340;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS hearts INT DEFAULT 5;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar TEXT DEFAULT 'default';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_lessons INT[] DEFAULT '{}';
      CREATE TABLE IF NOT EXISTS nodes (
        id INT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT DEFAULT 'locked',
        icon TEXT,
        grade TEXT,
        sort_order INT DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS questions (
        id BIGSERIAL PRIMARY KEY,
        text TEXT NOT NULL,
        topic TEXT,
        grade TEXT,
        correct TEXT,
        choices TEXT[],
        hint JSONB,
        node_id INT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE questions ADD COLUMN IF NOT EXISTS node_id INT;
      CREATE TABLE IF NOT EXISTS logs (
        id BIGSERIAL PRIMARY KEY,
        action TEXT,
        detail TEXT,
        color TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    res.status(200).json({ ok: true, message: 'Tables ready' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
