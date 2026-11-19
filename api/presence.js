// Даалгаврын хугацаат шууд хяналт (2026-11-19 эзэмшигч: «багш 10:10–11:00 гэх мэт цаг тохируулж даалгавар илгээхэд
// тухайн ангийн сурагчдын утсан дээрх мэдээллийг 3–5 секунд тутамд сайтад байгаа эсэхийг шалгадаг байх»).
//   POST ?action=beat  (сурагч, 5 сек тутам) {cid, st:'task'|'site'|'away', q, lesson} — зөвхөн тухайн даалгаврын
//        цагийн хүрээнд (±10 мин) ба ангийн гишүүн бол; гарсан тоо/гадуур хугацааг серверт тооцно.
//   GET  ?action=mine  (сурагч) — өөрийн ангиудын цагтай даалгаврууд (+ серверийн цаг: утасны цаг буруу байж болно)
//   GET  ?action=active&class=ID (багш) — ангийн цагтай даалгаврууд
//   GET  ?action=live&class=ID&cid=ch_… (багш) — сурагч бүрийн одоогийн төлөв
// Сурагчид «хянаж байна» тэмдэг харуулахгүй (эзэмшигчийн шийдвэр). Дэлгэцийн агуулга авахгүй — зөвхөн CyberMath дотор
// даалгаврын хуудас нээлттэй эсэх (task), сайтын өөр хэсэг (site), гарсан/апп сольсон (away), дохиогүй (lost — live-д).
const pool = require('./_db');
const guard = require('./_guard');

// 15 сек дохиогүй бол «Холболтгүй» (5 сек тутам дохио — 2 удаа алдсан ч тэвчинэ). «Гарсан» нь зөвхөн утас өөрөө
// гарсан дохио (away: апп сольсон/дэлгэц түгжсэн) илгээсэн үед — интернэт тасарсныг гарсан гэж андуурахгүй.
const STALE_MS = 15000;
const PAD_MS = 10 * 60000;       // цагийн хүрээнээс ±10 мин
let ready = null;
function ensure() {
  if (!ready) ready = pool.query(
    'CREATE TABLE IF NOT EXISTS cm_presence (cid TEXT NOT NULL, email TEXT NOT NULL, st TEXT, q TEXT, lesson TEXT,'
    + ' first_at TIMESTAMPTZ DEFAULT NOW(), last_at TIMESTAMPTZ DEFAULT NOW(), leaves INT DEFAULT 0, gaps INT DEFAULT 0, away_ms BIGINT DEFAULT 0,'
    + ' PRIMARY KEY (cid, email))')
    .then(function () { return pool.query('ALTER TABLE cm_presence ADD COLUMN IF NOT EXISTS gaps INT DEFAULT 0'); })
    .catch(function (e) { ready = null; throw e; });
  return ready;
}

function win(c) {
  const s = Date.parse(c && c.startAt), e = Date.parse(c && c.endAt);
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? { s: s, e: e } : null;
}
function chList(v) { if (Array.isArray(v)) return v; try { const a = JSON.parse(v || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }

// Сурагчийн ангиудын цагтай даалгаврууд (out.member — ямар нэг ангийн гишүүн эсэх)
async function studentTimed(email) {
  const r = await pool.query('SELECT c.id, c.challenges FROM class_members m JOIN classrooms c ON c.id = m.classroom_id WHERE LOWER(m.student_email) = $1', [email]);
  const out = [];
  r.rows.forEach(function (row) {
    chList(row.challenges).forEach(function (c) {
      const w = win(c);
      if (w && c && typeof c.id === 'string') out.push({ cid: c.id, title: String(c.title || '').slice(0, 120), lessons: Array.isArray(c.lessons) ? c.lessons.map(String).slice(0, 200) : [], startAt: c.startAt, endAt: c.endAt, classroomId: row.id, s: w.s, e: w.e });
    });
  });
  out.member = r.rows.length > 0;
  return out;
}

// Дохио илгээх эрх: гишүүн + цагийн хүрээ. Инстанс бүрт даалгаврын цагийг 5 мин кэшлэнэ (олдоогүй бол 1 мин) —
// 5 сек тутмын дохиод DB-г дахин асуухгүй; цагийн хүрээг дохио бүрт шинээр тулгана.
const okCache = new Map();
async function allowed(email, cid) {
  const k = email + '|' + cid, now = Date.now();
  let c = okCache.get(k);
  if (!c || c.t <= now) {
    const ch = (await studentTimed(email)).find(function (x) { return x.cid === cid; });
    if (okCache.size >= 5000) okCache.clear();
    c = { w: ch ? { s: ch.s, e: ch.e } : null, t: now + (ch ? 5 * 60000 : 60000) };
    okCache.set(k, c);
  }
  return !!(c.w && now >= c.w.s - PAD_MS && now <= c.w.e + PAD_MS);
}
const lastBeat = new Map();      // имэйл → сүүлийн дохио (мс): 2 секундээс олон удаа ирвэл алгасна

// Багшийн анги эсэх (админ токен бол бүгд)
async function ownClass(req, cls) {
  const d = guard.verifyBearer(req);
  if (!d) return null;
  const r = await pool.query('SELECT id, teacher_email, challenges FROM classrooms WHERE id = $1', [cls]);
  if (!r.rows.length) return null;
  const row = r.rows[0];
  if (d.admin === true) return row;
  const u = guard.requireUser(req);
  if (!u || String(row.teacher_email || '').trim().toLowerCase() !== u.email) return null;
  return row;
}

module.exports = async function (req, res) {
  const action = String((req.query && req.query.action) || '');
  try {
    if (action === 'beat') {
      if (req.method !== 'POST') return res.status(405).json({ ok: false });
      const u = guard.requireUser(req);
      if (!u) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
      const b = req.body || {};
      const cid = typeof b.cid === 'string' ? b.cid : '', st = typeof b.st === 'string' ? b.st : '';
      if (!/^ch_\d{10,16}$/.test(cid) || ['task', 'site', 'away'].indexOf(st) < 0) return res.status(400).json({ ok: false, error: 'Буруу өгөгдөл' });
      const q = String(b.q || '').replace(/[^\d/]/g, '').slice(0, 12), lesson = String(b.lesson || '').replace(/[^\w-]/g, '').slice(0, 40);
      const now = Date.now(), lb = lastBeat.get(u.email);
      if (st !== 'away' && lb && now - lb < 2000) return res.json({ ok: true, skip: true });
      lastBeat.set(u.email, now); if (lastBeat.size > 20000) lastBeat.clear();
      if (!(await allowed(u.email, cid))) return res.status(403).json({ ok: false, error: 'Хугацаа биш' });
      await ensure();
      // Гарсан (leaves): өмнөх төлөв away биш байтал утас away илгээсэн. Тасарсан (gaps): away биш байтал 15+ сек дохиогүй
      // байгаад буцаж ирсэн (интернэт/батарей/хөтөч хаагдсан — гарсан эсэх нь тодорхойгүй). Хоёулаа нэг дохиод давхар тоологдохгүй.
      // Гадуур хугацаа: өмнөх төлөв away эсвэл дохиогүй завсар (≥15 сек) бол тэр завсрыг нэмнэ.
      await pool.query(
        'INSERT INTO cm_presence (cid, email, st, q, lesson) VALUES ($1, $2, $3, $4, $5)'
        + ' ON CONFLICT (cid, email) DO UPDATE SET'
        + " leaves = cm_presence.leaves + CASE WHEN cm_presence.st <> 'away' AND EXCLUDED.st = 'away' THEN 1 ELSE 0 END,"
        + " gaps = cm_presence.gaps + CASE WHEN cm_presence.st <> 'away' AND EXCLUDED.st <> 'away' AND NOW() - cm_presence.last_at >= INTERVAL '15 seconds' THEN 1 ELSE 0 END,"
        + " away_ms = cm_presence.away_ms + CASE WHEN cm_presence.st = 'away' OR NOW() - cm_presence.last_at >= INTERVAL '15 seconds' THEN (EXTRACT(EPOCH FROM (NOW() - cm_presence.last_at)) * 1000)::BIGINT ELSE 0 END,"
        + ' st = EXCLUDED.st, q = EXCLUDED.q, lesson = EXCLUDED.lesson, last_at = NOW()',
        [cid, u.email, st, q, lesson]);
      return res.json({ ok: true });
    }

    if (action === 'mine') {
      const u = guard.requireUser(req);
      if (!u) return res.status(401).json({ ok: false });
      const now = Date.now(), all = await studentTimed(u.email);
      const list = all.filter(function (x) { return x.e + PAD_MS > now && x.s - 24 * 3600e3 < now; })
        .map(function (x) { return { cid: x.cid, title: x.title, lessons: x.lessons, startAt: x.startAt, endAt: x.endAt }; });
      return res.json({ ok: true, now: now, member: all.member, list: list });
    }

    if (action === 'active' || action === 'live') {
      const cls = String((req.query && req.query.class) || '');
      if (!/^\d{1,12}$/.test(cls)) return res.status(400).json({ ok: false });
      const row = await ownClass(req, cls);
      if (!row) return res.status(403).json({ ok: false, error: 'Зөвшөөрөлгүй' });
      const now = Date.now();
      const timed = chList(row.challenges).filter(function (c) { return !!win(c) && c && typeof c.id === 'string'; })
        .map(function (c) { return { cid: c.id, title: String(c.title || '').slice(0, 120), startAt: c.startAt, endAt: c.endAt }; });
      if (action === 'active') {
        return res.json({ ok: true, now: now, list: timed.filter(function (c) { return Date.parse(c.endAt) > now - 2 * 3600e3; }).sort(function (a, b) { return Date.parse(a.startAt) - Date.parse(b.startAt); }) });
      }
      const cid = String((req.query && req.query.cid) || '');
      const ch = timed.find(function (c) { return c.cid === cid; });
      if (!ch) return res.status(404).json({ ok: false, error: 'Даалгавар олдсонгүй' });
      await ensure();
      const r = await pool.query(
        'SELECT LOWER(m.student_email) AS email, u.first_name, u.last_name, p.st, p.q, p.lesson, p.leaves, p.gaps, p.away_ms,'
        + ' EXTRACT(EPOCH FROM (NOW() - p.last_at)) AS ago, p.first_at'
        + ' FROM class_members m LEFT JOIN users u ON LOWER(u.email) = LOWER(m.student_email)'
        + ' LEFT JOIN cm_presence p ON p.cid = $2 AND p.email = LOWER(m.student_email)'
        + ' WHERE m.classroom_id = $1', [row.id, cid]);
      const rows = r.rows.map(function (x) {
        const name = (String(x.last_name || '').trim() + ' ' + String(x.first_name || '').trim()).trim() || String(x.email || '').split('@')[0];
        const ago = x.ago == null ? null : Math.max(0, Math.round(+x.ago));
        // away — утас өөрөө гарсан гэж мэдэгдсэн; lost — сүүлийн 15+ сек дохиогүй (гарсан эсвэл интернэт тасарсан)
        let st = !x.st ? 'none' : x.st === 'away' ? 'away' : ago != null && ago * 1000 >= STALE_MS ? 'lost' : x.st;
        let away = Math.round((+x.away_ms || 0) / 1000);
        if ((st === 'away' || st === 'lost') && ago != null) away += ago;      // одоо гадуур байгаа завсар
        return { name: name, st: st, q: x.q || '', ago: ago, leaves: +x.leaves || 0, gaps: +x.gaps || 0, away: away, joined: !!x.first_at };
      }).sort(function (a, b) { return a.name.localeCompare(b.name, 'mn'); });
      return res.json({ ok: true, now: now, challenge: ch, rows: rows });
    }

    return res.status(400).json({ ok: false, error: 'action' });
  } catch (e) {
    console.error('[presence]', e && e.message);
    return res.status(500).json({ ok: false, error: 'Серверийн алдаа' });
  }
};
// Тестэд
module.exports._t = { win: win, okCache: okCache, lastBeat: lastBeat, reset: function () { ready = null; okCache.clear(); lastBeat.clear(); } };
