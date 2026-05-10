const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Lazy table create — анх удаа дуудахад үүснэ
    await pool.query(`
      CREATE TABLE IF NOT EXISTS online_games (
        id BIGSERIAL PRIMARY KEY,
        game_type TEXT NOT NULL,
        room_code TEXT NOT NULL,
        white_email TEXT,
        black_email TEXT,
        white_name TEXT,
        black_name TEXT,
        state JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT DEFAULT 'waiting',
        winner TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_og_code ON online_games(room_code)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_og_status ON online_games(status, updated_at DESC)`).catch(()=>{});

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // Шинэ өрөө үүсгэх (host = цагаан)
      if (action === 'create') {
        const { email, name, game_type, state } = body;
        if (!email || !game_type) return res.status(400).json({ ok: false, error: 'Missing fields' });
        let roomCode = '';
        for (let i = 0; i < 6; i++) {
          let c = '';
          for (let j = 0; j < 6; j++) c += Math.floor(Math.random() * 10);
          const ex = await pool.query(`SELECT 1 FROM online_games WHERE room_code=$1 AND status<>'finished'`, [c]);
          if (!ex.rows.length) { roomCode = c; break; }
        }
        if (!roomCode) roomCode = String(Date.now()).slice(-6);
        const r = await pool.query(
          `INSERT INTO online_games (game_type, room_code, white_email, white_name, state, status)
           VALUES ($1, $2, $3, $4, $5, 'waiting') RETURNING *`,
          [game_type, roomCode, email, String(name || email).slice(0, 60), JSON.stringify(state || {})]
        );
        return res.json({ ok: true, game: r.rows[0], asColor: 'white' });
      }

      // Өрөөнд нэгдэх (joiner = хар)
      if (action === 'join') {
        const { email, name, code } = body;
        if (!email || !code) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const cleanCode = String(code).replace(/\D/g, '').slice(0, 6);
        const r = await pool.query(`SELECT * FROM online_games WHERE room_code=$1 AND status<>'finished' ORDER BY id DESC LIMIT 1`, [cleanCode]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Код олдсонгүй' });
        const g = r.rows[0];
        if (g.white_email === email) return res.json({ ok: true, game: g, asColor: 'white' });
        if (g.black_email === email) return res.json({ ok: true, game: g, asColor: 'black' });
        if (g.black_email) return res.json({ ok: false, error: 'Өрөө дүүрсэн' });
        const r2 = await pool.query(
          `UPDATE online_games SET black_email=$1, black_name=$2, status='playing', updated_at=NOW() WHERE id=$3 RETURNING *`,
          [email, String(name || email).slice(0, 60), g.id]
        );
        return res.json({ ok: true, game: r2.rows[0], asColor: 'black' });
      }

      // Polling — state татах
      if (action === 'get') {
        const { code } = body;
        if (!code) return res.status(400).json({ ok: false });
        const r = await pool.query(`SELECT * FROM online_games WHERE room_code=$1 ORDER BY id DESC LIMIT 1`, [String(code).replace(/\D/g, '').slice(0, 6)]);
        if (!r.rows.length) return res.status(404).json({ ok: false });
        return res.json({ ok: true, game: r.rows[0] });
      }

      // Move илгээх — state-ийг шинэчлэх
      if (action === 'move') {
        const { email, code, state, finished, winner } = body;
        if (!email || !code || !state) return res.status(400).json({ ok: false });
        const r = await pool.query(`SELECT * FROM online_games WHERE room_code=$1 ORDER BY id DESC LIMIT 1`, [String(code).replace(/\D/g, '').slice(0, 6)]);
        if (!r.rows.length) return res.status(404).json({ ok: false });
        const g = r.rows[0];
        if (g.white_email !== email && g.black_email !== email) return res.status(403).json({ ok: false, error: 'Эрх байхгүй' });
        const newStatus = finished ? 'finished' : 'playing';
        const r2 = await pool.query(
          `UPDATE online_games SET state=$1, status=$2, winner=$3, updated_at=NOW() WHERE id=$4 RETURNING *`,
          [JSON.stringify(state), newStatus, winner || null, g.id]
        );
        return res.json({ ok: true, game: r2.rows[0] });
      }

      // Тоглоомоос гарах
      if (action === 'leave') {
        const { email, code } = body;
        if (!email || !code) return res.status(400).json({ ok: false });
        const cleanCode = String(code).replace(/\D/g, '').slice(0, 6);
        // Эзэн нь гарвал тоглоомыг finished болгоно — нөгөө тал хождог
        const r = await pool.query(`SELECT * FROM online_games WHERE room_code=$1 ORDER BY id DESC LIMIT 1`, [cleanCode]);
        if (r.rows.length) {
          const g = r.rows[0];
          let winner = null;
          if (g.white_email === email && g.black_email) winner = 'black';
          else if (g.black_email === email) winner = 'white';
          await pool.query(`UPDATE online_games SET status='finished', winner=$1, updated_at=NOW() WHERE id=$2`, [winner, g.id]);
        }
        return res.json({ ok: true });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[onlinegame]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
