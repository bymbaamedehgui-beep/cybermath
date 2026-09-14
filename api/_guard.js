// Нийтлэг хамгаалалтын туслахууд — JWT шалгалт, админ/хэрэглэгч таних, Postgres rate-limit.
// API (тогтвортой, бусад endpoint ашиглана):
//   jwtSecret()                         → string | null   (env JWT_SECRET, default fallback БАЙХГҮЙ)
//   secretMissing(res)                  → bool            (secret байхгүй бол 500 илгээгээд true)
//   verifyBearer(req)                   → decoded | null  (Authorization: Bearer <jwt>)
//   requireAdmin(req)                   → bool            (decoded.admin === true)
//   requireUser(req, opts?)             → { email, role } | null  (admin биш, email-тэй токен; ws:true токеныг opts.allowWs үгүй бол татгалзана)
//   requireAdminOrSeedKey(req)          → bool            (админ JWT ЭСВЭЛ x-seed-key === env SEED_KEY)
//   rateLimit(key, max, windowSec)      → Promise<bool>   (true = зөвшөөрнө; DB алдаа → false, fail-closed)
//   clientIp(req)                       → string          (x-forwarded-for эхний утга)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('./_db');

function jwtSecret() {
  const s = process.env.JWT_SECRET;
  return s && String(s).length ? String(s) : null;
}

// Модуль ачаалахад throw хийхгүй — хүсэлт бүр дээр шалгаж 500 буцаана
function secretMissing(res) {
  if (jwtSecret()) return false;
  res.status(500).json({ ok: false, error: 'Серверийн тохиргоо дутуу (JWT_SECRET)' });
  return true;
}

function bearerToken(req) {
  const h = (req && req.headers) || {};
  const auth = h.authorization || h.Authorization || '';
  if (typeof auth !== 'string' || auth.slice(0, 7) !== 'Bearer ') return null;
  const t = auth.slice(7).trim();
  return t || null;
}

function verifyBearer(req) {
  const secret = jwtSecret();
  const tok = bearerToken(req);
  if (!secret || !tok) return null;
  try {
    const d = jwt.verify(tok, secret, { algorithms: ['HS256'] });
    return d && typeof d === 'object' ? d : null;
  } catch (e) { return null; }
}

function requireAdmin(req) {
  const d = verifyBearer(req);
  return !!(d && d.admin === true);
}

// Тоглоомын хэрэглэгчийн токен (auth.js {email, role}, googleauth.js {email, id}).
// ws:true (ажлын хуудасны) токен имэйл эзэмшлийг баталдаггүй тул анхдагчаар хүлээн авахгүй.
function requireUser(req, opts) {
  const d = verifyBearer(req);
  if (!d || d.admin) return null;
  if (d.ws && !(opts && opts.allowWs)) return null;
  if (typeof d.email !== 'string') return null;
  const email = d.email.trim().toLowerCase();
  if (!email || email.indexOf('@') < 1) return null;
  return { email: email, role: d.role || null };
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// seed/setup-д: админ JWT, эсвэл SEED_KEY env тохируулсан үед x-seed-key header
function requireAdminOrSeedKey(req) {
  if (requireAdmin(req)) return true;
  const key = process.env.SEED_KEY;
  if (!key) return false;
  const h = (req && req.headers) || {};
  const got = h['x-seed-key'];
  return typeof got === 'string' && got.length > 0 && safeEqual(got, key);
}

function clientIp(req) {
  const h = (req && req.headers) || {};
  const xff = h['x-forwarded-for'];
  const first = String(Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim();
  if (first) return first.slice(0, 64);
  const real = h['x-real-ip'];
  if (real) return String(real).trim().slice(0, 64);
  return (req && req.socket && req.socket.remoteAddress) || 'unknown';
}

// ── Rate limit: rate_limits(key TEXT PK, window_start TIMESTAMPTZ, count INT) ──
// Нэг UPSERT мөрөөр атомар тоолно (зэрэг хүсэлтүүд мөрийн түгжээгээр дараалалд орно).
// DB алдаа гарвал false (fail-closed): энэ функцийг ашигладаг endpoint-ууд (promo redeem, chat,
// grouprequest submit, reportQuestion) өөрсдөө DB-гүйгээр ажиллахгүй тул нээлттэй үлдээх нь
// ашиггүй бөгөөд DB/хүснэгт эвдэрсэн үед brute force-ыг хязгааргүй болгох эрсдэлтэй.
let _rlReady = null;
function ensureRateTable() {
  if (!_rlReady) {
    _rlReady = pool.query(`CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(), count INT NOT NULL DEFAULT 0)`)
      .catch(function(e) {
        // Хүйтэн эхлэлд олон instance зэрэг CREATE хийвэл 23505 (pg_type unique) / 42P07 (already exists) — хүснэгт бий гэсэн үг
        if (e && (e.code === '23505' || e.code === '42P07')) return;
        _rlReady = null; throw e;
      });
  }
  return _rlReady;
}

async function rateLimit(key, max, windowSec) {
  const k = String(key || '').slice(0, 300);
  const lim = Math.max(1, parseInt(max, 10) || 1);
  const win = Math.min(86400, Math.max(1, parseInt(windowSec, 10) || 60));
  try {
    await ensureRateTable();
    const r = await pool.query(
      `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, NOW(), 1)
       ON CONFLICT (key) DO UPDATE SET
         count = CASE WHEN rate_limits.window_start <= NOW() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
         window_start = CASE WHEN rate_limits.window_start <= NOW() - make_interval(secs => $2) THEN NOW() ELSE rate_limits.window_start END
       RETURNING count`,
      [k, win]
    );
    const c = r.rows && r.rows[0] ? Number(r.rows[0].count) : lim + 1;
    // Хааяа хуучин мөрүүдийг цэвэрлэнэ (fire-and-forget)
    if (Math.random() < 0.01) pool.query(`DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 days'`).catch(function() {});
    return c <= lim;
  } catch (e) {
    console.error('[rateLimit]', e.message);
    return false;
  }
}

module.exports = { jwtSecret, secretMissing, verifyBearer, requireAdmin, requireUser, requireAdminOrSeedKey, rateLimit, clientIp };
