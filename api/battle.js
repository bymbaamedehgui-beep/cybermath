// Далайн тулааны тоглоомуудын БАГШИЙН ӨРӨӨ ба ОНОО (одоогоор Nice Battle — 8-9-songon.vercel.app).
// Өмнө нь тоглоомын өөрийн /api/room, /api/score нь Upstash Redis-д хадгалдаг байсан (тэр сан ажиллахаа больсон).
// Одоо 8-9-songon-ийн vercel.json эдгээрийг энд proxy хийнэ — клиент (index.html) өөрчлөгдөөгүй, хариуны хэлбэр хуучнаараа:
//   GET    /api/battle/nb/room?code=     → room-ын JSON | 404
//   POST   /api/battle/nb/room  {code,…} → { ok } (ийм код аль хэдийн байвал 409 — өөр багшийн room-г дарж бичихгүй)
//   DELETE /api/battle/nb/room?code=     → room + оноог устгана
//   GET    /api/battle/nb/score?code=    → [{ name, score, shots, correct, acc, time, ts }] оноо буурахаар
//   POST   /api/battle/nb/score {code, name, score, shots, correct, time, ts} → { ok, rank }
//   DELETE /api/battle/nb/score?code=    → тухайн room-ын бүх оноо
// vercel.json: ^/api/battle/(nb)/(room|score)$ → /api/battle.js?g=$1&op=$2
const pool = require('./_db');
const { rateLimit, clientIp } = require('./_guard');

const GAMES = { nb: true };           // nb = Nice Battle (8-9). Grade Battle (10-11) нэмэх бол энд + vercel.json
const CODE_RE = /^[A-Za-z0-9-]{3,32}$/;
const ROOM_MAX_BYTES = 20000;
const MAX_PLAYERS = 200;
const KEEP_DAYS = 180;                // идэвхгүй room (ба оноо) хадгалах хугацаа
const DB_ERROR = { error: 'Өгөгдлийн сантай холбогдож чадсангүй. Түр хүлээгээд дахин оролдоно уу.', code: 'BACKEND_ERROR' };

let _ready = null;
function ensureTables() {
  if (!_ready) {
    _ready = (async () => {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS battle_rooms (
          game       TEXT NOT NULL,
          code       TEXT NOT NULL,
          data       JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (game, code)
        )`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS battle_scores (
          game       TEXT NOT NULL,
          code       TEXT NOT NULL,
          name       TEXT NOT NULL,
          score      DOUBLE PRECISION NOT NULL DEFAULT 0,
          rec        JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (game, code, name)
        )`);
    })().catch(function (e) {
      // Хүйтэн эхлэлд олон instance зэрэг CREATE хийвэл 23505 / 42P07 — хүснэгт бий гэсэн үг
      if (e && (e.code === '23505' || e.code === '42P07')) return;
      _ready = null; throw e;
    });
  }
  return _ready;
}

function cleanCode(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  const s = String(v).trim();
  return CODE_RE.test(s) ? s : '';
}
function num(v, lo, hi, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

async function cleanup() {
  await pool.query(`DELETE FROM battle_scores s USING battle_rooms r
                     WHERE s.game = r.game AND s.code = r.code AND r.updated_at < NOW() - make_interval(days => $1)`, [KEEP_DAYS]);
  await pool.query(`DELETE FROM battle_rooms WHERE updated_at < NOW() - make_interval(days => $1)`, [KEEP_DAYS]);
}

async function room(req, res, game) {
  if (req.method === 'GET') {
    const code = cleanCode(req.query.code);
    if (!code) return res.status(400).json({ error: 'code шаардлагатай' });
    const r = await pool.query('SELECT data FROM battle_rooms WHERE game = $1 AND code = $2', [game, code]);
    if (!r.rows.length) return res.status(404).json({ error: 'Room олдсонгүй' });
    return res.status(200).json(r.rows[0].data);
  }

  if (req.method === 'POST') {
    const data = req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return res.status(400).json({ error: 'code шаардлагатай' });
    const code = cleanCode(data.code);
    if (!code) return res.status(400).json({ error: 'code шаардлагатай' });
    const json = JSON.stringify(Object.assign({}, data, { code: code }));
    if (json.length > ROOM_MAX_BYTES) return res.status(413).json({ error: 'Room-ын өгөгдөл хэт том байна' });
    // Эхлээд энгийн SELECT: сан унасан бол rateLimit-ийн fail-closed 429 биш 502 («Сервер ажиллахгүй») буцна
    const taken = await pool.query('SELECT 1 FROM battle_rooms WHERE game = $1 AND code = $2', [game, code]);
    if (taken.rows.length) return res.status(409).json({ error: 'Ийм кодтой room аль хэдийн байна. «Room үүсгэх»-ийг дахин дарна уу.' });
    if (!(await rateLimit('battle_room:' + clientIp(req), 60, 600))) {
      return res.status(429).json({ error: 'Хэт олон room үүсгэлээ. Түр хүлээгээд дахин оролдоно уу.' });
    }
    const ins = await pool.query(
      `INSERT INTO battle_rooms (game, code, data) VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (game, code) DO NOTHING RETURNING code`, [game, code, json]);
    if (!ins.rows.length) return res.status(409).json({ error: 'Ийм кодтой room аль хэдийн байна. «Room үүсгэх»-ийг дахин дарна уу.' });
    if (Math.random() < 0.02) cleanup().catch(function (e) { console.error('api/battle cleanup:', e.message); });
    return res.status(200).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const code = cleanCode(req.query.code);
    if (!code) return res.status(400).json({ error: 'code шаардлагатай' });
    await pool.query('DELETE FROM battle_scores WHERE game = $1 AND code = $2', [game, code]);
    await pool.query('DELETE FROM battle_rooms WHERE game = $1 AND code = $2', [game, code]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

async function score(req, res, game) {
  if (req.method === 'GET') {
    const code = cleanCode(req.query.code);
    if (!code) return res.status(400).json({ error: 'code шаардлагатай' });
    const r = await pool.query(
      `SELECT rec FROM battle_scores WHERE game = $1 AND code = $2
        ORDER BY score DESC, updated_at ASC LIMIT $3`, [game, code, MAX_PLAYERS]);
    return res.status(200).json(r.rows.map(function (x) { return x.rec; }));
  }

  if (req.method === 'POST') {
    const b = req.body || {};
    const code = cleanCode(b.code);
    const name = typeof b.name === 'string' ? b.name.trim().slice(0, 60) : '';
    if (!code || !name) return res.status(400).json({ error: 'code, name шаардлагатай' });
    const shots = Math.round(num(b.shots, 0, 1e6, 0));
    const correct = Math.round(num(b.correct, 0, 1e6, 0));
    const rec = {
      name: name,
      score: num(b.score, -1e9, 1e9, 0),
      shots: shots,
      correct: correct,
      time: typeof b.time === 'string' ? b.time.slice(0, 32) : '',
      ts: num(b.ts, 0, 1e14, Date.now()),
      acc: shots > 0 ? Math.round(correct / shots * 100) : 0,
    };
    const prev = await pool.query('SELECT name, score FROM battle_scores WHERE game = $1 AND code = $2', [game, code]);
    const mine = prev.rows.some(function (x) { return x.name === name; });
    if (!mine && prev.rows.length >= MAX_PLAYERS) return res.status(409).json({ error: 'Room дүүрсэн байна' });
    // Room байгаа эсэх + сүүлийн идэвх (цэвэрлэгээнд)
    const touched = await pool.query('UPDATE battle_rooms SET updated_at = NOW() WHERE game = $1 AND code = $2 RETURNING code', [game, code]);
    if (!touched.rows.length) return res.status(404).json({ error: 'Room олдсонгүй' });
    await pool.query(
      `INSERT INTO battle_scores (game, code, name, score, rec) VALUES ($1, $2, $3, $4, $5::jsonb)
       ON CONFLICT (game, code, name) DO UPDATE SET score = EXCLUDED.score, rec = EXCLUDED.rec, updated_at = NOW()`,
      [game, code, name, rec.score, JSON.stringify(rec)]);
    const rank = 1 + prev.rows.filter(function (x) { return x.name !== name && Number(x.score) > rec.score; }).length;
    return res.status(200).json({ ok: true, rank: rank });
  }

  if (req.method === 'DELETE') {
    const code = cleanCode(req.query.code);
    if (!code) return res.status(400).json({ error: 'code шаардлагатай' });
    await pool.query('DELETE FROM battle_scores WHERE game = $1 AND code = $2', [game, code]);
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  req.query = req.query || {};
  const game = String(req.query.g || '');
  const op = String(req.query.op || '');
  if (!GAMES[game] || (op !== 'room' && op !== 'score')) return res.status(404).json({ error: 'Not found' });
  try {
    await ensureTables();
    return op === 'room' ? await room(req, res, game) : await score(req, res, game);
  } catch (e) {
    console.error('api/battle:', e && e.message);
    return res.status(502).json(DB_ERROR);
  }
};
