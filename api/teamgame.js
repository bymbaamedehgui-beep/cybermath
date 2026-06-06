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

    // Багш-уралдаан (олон баг хянах) — өвөрмөц нэр (Neon DB хуваалцсан учир)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cm_team_tournaments (
        id BIGSERIAL PRIMARY KEY,
        code TEXT UNIQUE NOT NULL,
        name TEXT,
        grade INT,
        teacher_name TEXT,
        state TEXT NOT NULL DEFAULT 'open',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        ended_at TIMESTAMPTZ
      )
    `);
    // Хуучин хүснэгт байсан тохиолдолд багана дутагдвал нөхөх
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS code TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS name TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS grade INT`).catch(()=>{});
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS teacher_name TEXT`).catch(()=>{});
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'open'`).catch(()=>{});
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`).catch(()=>{});
    await pool.query(`ALTER TABLE cm_team_tournaments ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`).catch(()=>{});
    await pool.query(`ALTER TABLE team_games ADD COLUMN IF NOT EXISTS tournament_code TEXT`).catch(()=>{});
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tg_tournament ON team_games(tournament_code)`).catch(()=>{});

    if (req.method === 'GET') {
      const params = new URLSearchParams((req.url.split('?')[1] || ''));
      const code = (req.query && req.query.code) || params.get('code');
      const tourCode = (req.query && req.query.tournament) || params.get('tournament');

      // Багшийн уралдаан хайх — бүх багуудаа цуглуулна
      if (tourCode) {
        const tr = await pool.query('SELECT * FROM cm_team_tournaments WHERE code=$1', [tourCode]);
        if (!tr.rows.length) return res.json({ ok: false, error: 'Уралдаан олдсонгүй' });
        const games = await pool.query('SELECT * FROM team_games WHERE tournament_code=$1 ORDER BY id', [tourCode]);
        const teams = [];
        for (const game of games.rows) {
          const pl = await pool.query(
            'SELECT id, name, score, rounds_played, is_host, finished_at FROM team_players WHERE game_id=$1 ORDER BY id',
            [game.id]
          );
          teams.push({ game, players: pl.rows });
        }
        return res.json({ ok: true, tournament: tr.rows[0], teams });
      }

      // Энгийн нэг баг хайх
      if (!code) return res.status(400).json({ ok: false, error: 'Код шаардлагатай' });
      const gr = await pool.query('SELECT * FROM team_games WHERE code=$1', [code]);
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
        const { team_name, grade, max_players, host_name, tournament_code } = body;
        let tc = null;
        if (tournament_code) {
          // Уралдаанд багтаах — байгаа эсэхийг шалгана
          const tt = await pool.query('SELECT code, grade, state FROM cm_team_tournaments WHERE code=$1', [tournament_code]);
          if (!tt.rows.length) return res.json({ ok: false, error: 'Уралдааны код буруу' });
          if (tt.rows[0].state !== 'open') return res.json({ ok: false, error: 'Уралдаан хаагдсан байна' });
          tc = tt.rows[0].code;
        }
        let code = generateCode();
        for (let i = 0; i < 10; i++) {
          const existing = await pool.query('SELECT id FROM team_games WHERE code=$1', [code]);
          if (!existing.rows.length) break;
          code = generateCode();
        }
        const max = Math.min(20, Math.max(2, parseInt(max_players) || 5));
        const g = await pool.query(
          'INSERT INTO team_games (code, team_name, grade, max_players, tournament_code) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [code, (team_name || 'Манай баг').trim().slice(0, 60), parseInt(grade) || 6, max, tc]
        );
        const game = g.rows[0];
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

      // 1.5) Багшийн уралдаан үүсгэх
      if (action === 'createTournament') {
        const { name, grade, teacher_name } = body;
        let code = generateCode();
        for (let i = 0; i < 10; i++) {
          const existing = await pool.query('SELECT id FROM cm_team_tournaments WHERE code=$1', [code]);
          if (!existing.rows.length) break;
          code = generateCode();
        }
        const t = await pool.query(
          'INSERT INTO cm_team_tournaments (code, name, grade, teacher_name) VALUES ($1, $2, $3, $4) RETURNING *',
          [code, (name || 'CyberMath уралдаан').trim().slice(0, 60), parseInt(grade) || 6, (teacher_name || '').trim().slice(0, 40)]
        );
        return res.json({ ok: true, tournament: t.rows[0] });
      }

      // 1.6) Багшийн уралдаан дуусгах — бүх багуудыг finished болгож,
      //      дуусаагүй гишүүдийн оноог үе × 10 болгож finalize
      if (action === 'endTournament') {
        const { tournament_code } = body;
        if (!tournament_code) return res.status(400).json({ ok: false });
        const games = await pool.query('SELECT id FROM team_games WHERE tournament_code=$1', [tournament_code]);
        for (const g of games.rows) {
          // Тоглож байсан гишүүд: score = rounds_played × 10
          await pool.query(
            "UPDATE team_players SET score = COALESCE(rounds_played,0) * 10, finished_at=NOW() WHERE game_id=$1 AND finished_at IS NULL",
            [g.id]
          );
          await pool.query("UPDATE team_games SET state='finished', finished_at=NOW() WHERE id=$1 AND state<>'finished'", [g.id]);
        }
        await pool.query("UPDATE cm_team_tournaments SET state='ended', ended_at=NOW() WHERE code=$1", [tournament_code]);
        const tr = await pool.query('SELECT * FROM cm_team_tournaments WHERE code=$1', [tournament_code]);
        return res.json({ ok: true, tournament: tr.rows[0] });
      }

      // 1.7) Гишүүний явц шинэчлэх (хэдэн үе давсныг real-time бүртгэх)
      if (action === 'progress') {
        const { player_id, rounds_passed } = body;
        if (!player_id) return res.status(400).json({ ok: false });
        await pool.query(
          'UPDATE team_players SET rounds_played=$2 WHERE id=$1 AND finished_at IS NULL',
          [player_id, Math.max(0, parseInt(rounds_passed) || 0)]
        );
        return res.json({ ok: true });
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

      // 4) Гишүүн өөрийн оноог илгээх — ганц удаа
      if (action === 'submit') {
        const { player_id, pool_remaining, rounds_passed } = body;
        if (!player_id) return res.status(400).json({ ok: false });
        // Аль хэдийн илгээсэн бол дахин хүлээж авахгүй
        const check = await pool.query('SELECT * FROM team_players WHERE id=$1', [player_id]);
        if (!check.rows.length) return res.json({ ok: false, error: 'Гишүүн олдсонгүй' });
        if (check.rows[0].finished_at) {
          return res.json({ ok: false, error: 'Та аль хэдийн тоглож дууссан байна', player: check.rows[0] });
        }
        const remaining = Math.max(0, parseInt(pool_remaining) || 0);
        const passed = Math.max(0, parseInt(rounds_passed) || 0);
        const totalScore = remaining + (passed * 10);
        await pool.query(
          'UPDATE team_players SET score=$2, rounds_played=$3, finished_at=NOW() WHERE id=$1 AND finished_at IS NULL',
          [player_id, totalScore, passed]
        );
        const pr = await pool.query('SELECT * FROM team_players WHERE id=$1', [player_id]);
        if (!pr.rows.length) return res.json({ ok: false });
        const player = pr.rows[0];
        // Бүх гишүүн дууссан бол state='finished'
        const all = await pool.query(
          'SELECT COUNT(*) AS total, COUNT(finished_at) AS done FROM team_players WHERE game_id=$1',
          [player.game_id]
        );
        if (parseInt(all.rows[0].total) > 0 && parseInt(all.rows[0].total) === parseInt(all.rows[0].done)) {
          await pool.query("UPDATE team_games SET state='finished', finished_at=NOW() WHERE id=$1", [player.game_id]);
        }
        return res.json({ ok: true, player, breakdown: { pool: remaining, bonus: passed * 10, total: totalScore } });
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

      // (reset action хасагдсан — ганц удаагийн тоглолт)

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[teamgame]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
