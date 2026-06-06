const pool = require('./_db');

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_games (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        team_name TEXT,
        grade INT,
        state TEXT NOT NULL DEFAULT 'lobby',
        max_players INT DEFAULT 5,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_players (
        id BIGSERIAL PRIMARY KEY,
        game_id BIGINT NOT NULL REFERENCES team_games(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        score INT DEFAULT 0,
        rounds_played INT DEFAULT 0,
        is_host BOOLEAN DEFAULT FALSE,
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tg_code ON team_games(code)`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tp_game ON team_players(game_id)`).catch(()=>{});

    if (req.method === 'GET') {
      const code = (req.query && req.query.code) || (req.url.split('?')[1] || '').split('&').find(s => s.startsWith('code='));
      const codeVal = code ? (code.split('=')[1] || code) : null;
      if (!codeVal) return res.status(400).json({ ok: false, error: 'Код шаардлагатай' });
      const gr = await pool.query('SELECT * FROM team_games WHERE code=$1', [codeVal]);
      if (!gr.rows.length) return res.json({ ok: false, error: 'Код буруу' });
      const pr = await pool.query(
        'SELECT id, name, score, rounds_played, is_host, joined_at, finished_at FROM team_players WHERE game_id=$1 ORDER BY id',
        [gr.rows[0].id]
      );
      return res.json({ ok: true, game: gr.rows[0], players: pr.rows });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // 1) Шинэ баг үүсгэх (host)
      if (action === 'create') {
        const { team_name, grade, max_players, host_name } = body;
        let code = generateCode();
        for (let i = 0; i < 10; i++) {
          const existing = await pool.query('SELECT id FROM team_games WHERE code=$1', [code]);
          if (!existing.rows.length) break;
          code = generateCode();
        }
        const max = Math.min(20, Math.max(2, parseInt(max_players) || 5));
        const g = await pool.query(
          'INSERT INTO team_games (code, team_name, grade, max_players) VALUES ($1, $2, $3, $4) RETURNING *',
          [code, (team_name || 'Манай баг').trim().slice(0, 60), parseInt(grade) || 6, max]
        );
        const game = g.rows[0];
        // Host өөрөө 1-р гишүүн болж нэгдэнэ
        let host = null;
        if (host_name && host_name.trim()) {
          const hr = await pool.query(
            'INSERT INTO team_players (game_id, name, is_host) VALUES ($1, $2, TRUE) RETURNING *',
            [game.id, host_name.trim().slice(0, 40)]
          );
          host = hr.rows[0];
        }
        return res.json({ ok: true, game, player: host });
      }

      // 2) Кодоор нэгдэх
      if (action === 'join') {
        const { code, name } = body;
        if (!code || !name || !name.trim()) return res.status(400).json({ ok: false, error: 'Код болон нэр шаардлагатай' });
        const gr = await pool.query('SELECT * FROM team_games WHERE code=$1', [code]);
        if (!gr.rows.length) return res.json({ ok: false, error: 'Код буруу' });
        const game = gr.rows[0];
        if (game.state !== 'lobby') return res.json({ ok: false, error: 'Тоглоом аль хэдийн эхэлсэн байна' });
        const existing = await pool.query(
          'SELECT id FROM team_players WHERE game_id=$1 AND LOWER(name)=LOWER($2)',
          [game.id, name.trim()]
        );
        if (existing.rows.length) return res.json({ ok: false, error: 'Энэ нэртэй гишүүн аль хэдийн бий' });
        const cnt = await pool.query('SELECT COUNT(*) AS c FROM team_players WHERE game_id=$1', [game.id]);
        if (parseInt(cnt.rows[0].c) >= game.max_players) return res.json({ ok: false, error: 'Багт орон зай байхгүй' });
        const pr = await pool.query(
          'INSERT INTO team_players (game_id, name, is_host) VALUES ($1, $2, FALSE) RETURNING *',
          [game.id, name.trim().slice(0, 40)]
        );
        return res.json({ ok: true, player: pr.rows[0], game });
      }

      // 3) Host тоглоом эхлүүлэх
      if (action === 'start') {
        const { code } = body;
        if (!code) return res.status(400).json({ ok: false });
        await pool.query(
          "UPDATE team_games SET state='playing', started_at=NOW() WHERE code=$1 AND state='lobby'",
          [code]
        );
        const gr = await pool.query('SELECT * FROM team_games WHERE code=$1', [code]);
        return res.json({ ok: true, game: gr.rows[0] });
      }

      // 4) Гишүүн өөрийн оноог илгээх
      if (action === 'submit') {
        const { player_id, score, rounds_played } = body;
        if (!player_id) return res.status(400).json({ ok: false });
        await pool.query(
          'UPDATE team_players SET score=$2, rounds_played=$3, finished_at=NOW() WHERE id=$1 AND finished_at IS NULL',
          [player_id, Math.max(0, parseInt(score) || 0), parseInt(rounds_played) || 0]
        );
        const pr = await pool.query('SELECT * FROM team_players WHERE id=$1', [player_id]);
        if (!pr.rows.length) return res.json({ ok: false });
        const player = pr.rows[0];
        // Бүх гишүүн дууссан бол state='finished' болгох
        const all = await pool.query(
          'SELECT COUNT(*) AS total, COUNT(finished_at) AS done FROM team_players WHERE game_id=$1',
          [player.game_id]
        );
        if (parseInt(all.rows[0].total) > 0 && parseInt(all.rows[0].total) === parseInt(all.rows[0].done)) {
          await pool.query("UPDATE team_games SET state='finished', finished_at=NOW() WHERE id=$1", [player.game_id]);
        }
        return res.json({ ok: true, player });
      }

      // 5) Host албадан дуусгах (хүлээж байсан хүн байсан ч)
      if (action === 'finish') {
        const { code } = body;
        if (!code) return res.status(400).json({ ok: false });
        await pool.query(
          "UPDATE team_games SET state='finished', finished_at=NOW() WHERE code=$1 AND state<>'finished'",
          [code]
        );
        const gr = await pool.query('SELECT * FROM team_games WHERE code=$1', [code]);
        return res.json({ ok: true, game: gr.rows[0] });
      }

      // 6) Шинэчилж дахин эхлүүлэх (host)
      if (action === 'reset') {
        const { code } = body;
        if (!code) return res.status(400).json({ ok: false });
        const gr = await pool.query('SELECT * FROM team_games WHERE code=$1', [code]);
        if (!gr.rows.length) return res.json({ ok: false });
        const game = gr.rows[0];
        await pool.query('UPDATE team_players SET score=0, rounds_played=0, finished_at=NULL WHERE game_id=$1', [game.id]);
        await pool.query("UPDATE team_games SET state='lobby', started_at=NULL, finished_at=NULL WHERE id=$1", [game.id]);
        const ng = await pool.query('SELECT * FROM team_games WHERE id=$1', [game.id]);
        return res.json({ ok: true, game: ng.rows[0] });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[teamgame]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
