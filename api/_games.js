// Тоглоомын төлбөр — серверийн каталог, хүснэгт, эрх.
// Эрх нь (realm, email, game_key)-ээр тусдаа:
//   'ws' = Дасгалын төв (ws_login + ws:true токен), 'cm' = cyber-math.com (users + cm_token).
//   Нэг realm-д авсан эрх нөгөөд ажиллахгүй, имэйлээр автоматаар холбохгүй (H8).
// Эрх олгох зам ЗӨВХӨН: QPay-ээр баталгаажсан pay_pending мөр (plan='game', api/qpay.js settlePay) эсвэл админ.
// API:
//   GAMES, GAME_KEYS, GAME_DAYS
//   gamePrice()                          → int  (env GAME_PRICE, анхдагч 1900)
//   paywallOn()                          → bool (env GAME_PAYWALL=off → бүх тоглоом нээлттэй)
//   isGame(key), normRealm(r), normEmail(e), publicCatalog()
//   GAMES[key] = { title, kind: 'file'|'inline'|'external', multi: олон тоглогчтой (host л төлнө), path?/url? }
//   ensureGameTables()                   → Promise (lazy, амжилтгүй бол дараагийн дуудлага дахин оролдоно)
//   entitlement(realm, email, key)       → { ok, via: 'off'|'premium'|'access'|null, expires_at }
//   entitled(realm, email, key)          → bool  (GAME_PAYWALL=off → allowlist-ийн тоглоомд true;
//                                                 cm + идэвхтэй Premium → true; DB алдаа → throw: дуудагч fail-closed)
//   activeGames(realm, email)            → { key: expires_at }
//   isCmPremium(email)                   → bool
//   grantGame(realm, email, key, days?, db?) → Date  (нэмэгддэг: GREATEST(хуучин, NOW()) + days)
//   currentExpiry(realm, email, key)     → Date | null
//   revokeGame(realm, email, key, db?)   → устгасан мөрийн тоо
//   recordPurchase(p, db?)               → bool  (game_purchases, invoice_id давхардахгүй)
//   cmUser(req)                          → { email, role } | null  (Bearer cm_token, tv шалгана)
'use strict';
const pool = require('./_db');
const guard = require('./_guard');
const SMS = require('./_sms');

const GAME_DAYS = 30;

// kind: 'file' — тусдаа HTML (сервер gate-ээр хаагдана), 'inline' — index.html дотор, 'external' — гадны домэйн.
// multi: олон тоглогчтой (зөвхөн өрөө үүсгэгч төлнө — урилгаар найз нь нэгдэнэ).
function g(title, kind, multi, extra) { return Object.freeze(Object.assign({ title: title, kind: kind, multi: !!multi }, extra || {})); }
const GAMES = Object.freeze({
  mathmortal: g('MATH MORTAL', 'file', true, { path: '/math-mortal/' }),
  blockblast: g('Block Blast Math', 'external', false, { url: 'https://blockblast-math.vercel.app' }),
  flagbattle: g('Flag Battle', 'external', false, { url: 'https://6-7-songon.vercel.app' }),
  songon:     g('Grade Battle', 'external', false, { url: 'https://10-11-songon.vercel.app' }),
  nicebattle: g('Nice Battle', 'external', false, { url: 'https://8-9-songon.vercel.app' }),
  chessmath:  g('Chess Math', 'inline', true),
  daam:       g('10x10 Checkers', 'inline', true),
  gomoku:     g('5 эгнэх Tic Tac Toe', 'inline', true),
  ludo:       g('Ludo Math', 'inline', true),
  numseq:     g('Тоон дараалал', 'file', false, { path: '/numseq.html' }),
  doroev:     g('Дөрөв', 'inline', true),
  sbh:        g('Сонго · Бод · Хож', 'inline', true, { path: '/songobodkhozh.html' }),
  play2048:   g('2048', 'file', false, { path: '/play2048.html' }),
  sudoku:     g('Судоку', 'file', false, { path: '/sudoku.html' }),
  xpdrop:     g('500 XP-ны уналт', 'file', false, { path: '/xpdrop.html' }),
  myangat:    g('Мянгат', 'file', false, { path: '/myangat.html' }),
});
const GAME_KEYS = Object.freeze(Object.keys(GAMES));

function gamePrice() {
  const n = parseInt(process.env.GAME_PRICE || '', 10);
  return Number.isFinite(n) && n >= 100 && n <= 1000000 ? n : 1900;
}
// Kill-switch: GAME_PAYWALL=off (мөн false/0/no) → бүх тоглоом нээлттэй. Бусад бүх утга (тавиагүй ч) → төлбөртэй.
function paywallOn() {
  const v = String(process.env.GAME_PAYWALL || '').trim().toLowerCase();
  return !(v === 'off' || v === 'false' || v === '0' || v === 'no');
}
// hasOwnProperty — '__proto__', 'constructor' гэх мэт түлхүүр allowlist-ийг давахгүй
function isGame(key) { return typeof key === 'string' && Object.prototype.hasOwnProperty.call(GAMES, key); }
function normRealm(r) { r = String(r == null ? '' : r).trim().toLowerCase(); return r === 'ws' || r === 'cm' ? r : null; }
function normEmail(e) {
  if (typeof e !== 'string') return null;
  const s = e.trim().toLowerCase();
  return s.length <= 254 && /^[^@\s]+@[^@\s]+$/.test(s) ? s : null;
}
function publicCatalog() {
  return GAME_KEYS.map(function (k) { const x = GAMES[k]; return { key: k, title: x.title, kind: x.kind, multi: x.multi }; });
}

// ───────────────────────── хүснэгт ─────────────────────────
const DDL = [
  `CREATE TABLE IF NOT EXISTS game_access (
    realm TEXT NOT NULL CHECK (realm IN ('ws','cm')),
    email TEXT NOT NULL,
    game_key TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (realm, email, game_key)
  )`,
  `CREATE TABLE IF NOT EXISTS game_purchases (
    id BIGSERIAL PRIMARY KEY,
    invoice_id TEXT UNIQUE,
    realm TEXT NOT NULL,
    email TEXT NOT NULL,
    game_key TEXT NOT NULL,
    amount INT NOT NULL,
    days INT NOT NULL DEFAULT 30,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  'CREATE INDEX IF NOT EXISTS idx_game_purch_at ON game_purchases(created_at)',
  'CREATE INDEX IF NOT EXISTS idx_game_purch_email ON game_purchases(email)',
];
// pay_pending-ийг api/qpay.js ensurePayPending үүсгэдэг (тэнд ч мөн ALTER хийнэ) — энд best-effort
const DDL_SOFT = [
  'ALTER TABLE pay_pending ADD COLUMN IF NOT EXISTS game_key TEXT',
  'ALTER TABLE pay_pending ADD COLUMN IF NOT EXISTS realm TEXT',
];
let _ready = null;
function ensureGameTables() {
  if (!_ready) {
    _ready = (async function () {
      for (const sql of DDL) {
        try { await pool.query(sql); }
        // Хүйтэн эхлэлд зэрэг CREATE: 42P07 (бий), 23505 (pg_type), 42701 (багана бий)
        catch (e) { if (!(e && (e.code === '42P07' || e.code === '23505' || e.code === '42701'))) throw e; }
      }
      for (const sql of DDL_SOFT) { try { await pool.query(sql); } catch (e) { /* pay_pending байхгүй байж болно */ } }
    })().catch(function (e) { _ready = null; throw e; });
  }
  return _ready;
}

// ───────────────────────── эрх ─────────────────────────
// cyber-math.com-ийн идэвхтэй Premium → бүх тоглоом үнэгүй (зөвхөн 'cm' realm).
// _premium.js-тэй нийцүүлэв: хугацаа = premium_expiry, байхгүй бол хуучин premium_until; хугацаагүй premium нь Premium БИШ.
// premium_until багана байхгүй (42703) / төрөл таарахгүй (42804, 42883) DB-д premium_expiry-аар л шалгана.
const PREM_FALLBACK_CODES = ['42703', '42804', '42883'];
let _premUntil = true;
async function isCmPremium(email) {
  const em = normEmail(email);
  if (!em) return false;
  if (_premUntil) {
    try {
      const r = await pool.query(
        "SELECT 1 FROM users WHERE LOWER(email)=$1 AND plan='premium' AND COALESCE(premium_expiry, premium_until) > NOW() LIMIT 1", [em]);
      return r.rows.length > 0;
    } catch (e) {
      if (!(e && PREM_FALLBACK_CODES.indexOf(e.code) >= 0)) throw e;
      _premUntil = false;
    }
  }
  const r = await pool.query(
    "SELECT 1 FROM users WHERE LOWER(email)=$1 AND plan='premium' AND premium_expiry > NOW() LIMIT 1", [em]);
  return r.rows.length > 0;
}

// Шийдвэрийн дараалал: allowlist → kill-switch → (realm, email, key)-ийн идэвхтэй эрх → (зөвхөн cm) идэвхтэй Premium.
// Эрх өөр realm-ээс ОГТ уншигдахгүй (имэйл ижил ч).
async function entitlement(realm, email, key) {
  if (!isGame(key)) return { ok: false, via: null, expires_at: null };
  if (!paywallOn()) return { ok: true, via: 'off', expires_at: null };
  const rl = normRealm(realm), em = normEmail(email);
  if (!rl || !em) return { ok: false, via: null, expires_at: null };
  await ensureGameTables();
  const r = await pool.query(
    'SELECT expires_at FROM game_access WHERE realm=$1 AND email=$2 AND game_key=$3 AND expires_at > NOW()', [rl, em, key]);
  if (r.rows.length) return { ok: true, via: 'access', expires_at: new Date(r.rows[0].expires_at) };
  if (rl === 'cm' && await isCmPremium(em)) return { ok: true, via: 'premium', expires_at: null };
  return { ok: false, via: null, expires_at: null };
}
async function entitled(realm, email, key) { return (await entitlement(realm, email, key)).ok; }

async function activeGames(realm, email) {
  const rl = normRealm(realm), em = normEmail(email);
  const out = {};
  if (!rl || !em) return out;
  await ensureGameTables();
  const r = await pool.query(
    'SELECT game_key, expires_at FROM game_access WHERE realm=$1 AND email=$2 AND expires_at > NOW()', [rl, em]);
  r.rows.forEach(function (x) { if (isGame(x.game_key)) out[x.game_key] = new Date(x.expires_at).toISOString(); });
  return out;
}

function checkArgs(realm, email, key) {
  const rl = normRealm(realm), em = normEmail(email);
  if (!rl) throw new Error('game: realm буруу');
  if (!em) throw new Error('game: имэйл буруу');
  if (!isGame(key)) throw new Error('game: тоглоом буруу');
  return { realm: rl, email: em };
}

// Нэмэгддэг сунгалт: хугацаа дуусаагүй бол ҮЛДСЭН хоног дээр нэмнэ (Premium qpay.js-ийн хэв маяг).
// ws/grade-ийн GREATEST(хуучин, NOW()+хоног) хэлбэрийг ХУУЛАХГҮЙ — эрт сунгавал үлдсэн хоног алдагдана.
// db: transaction доторх client (заавал биш).
async function grantGame(realm, email, key, days, db) {
  const a = checkArgs(realm, email, key);
  const d = days == null ? GAME_DAYS : parseInt(days, 10);
  if (!Number.isInteger(d) || d < 1 || d > 3660) throw new Error('game: хоног буруу');
  await ensureGameTables();
  const r = await (db || pool).query(
    `INSERT INTO game_access (realm, email, game_key, expires_at, updated_at)
     VALUES ($1, $2, $3, NOW() + make_interval(days => $4::int), NOW())
     ON CONFLICT (realm, email, game_key) DO UPDATE
       SET expires_at = GREATEST(game_access.expires_at, NOW()) + make_interval(days => $4::int), updated_at = NOW()
     RETURNING expires_at`,
    [a.realm, a.email, key, d]);
  if (!r.rows.length || !r.rows[0].expires_at) throw new Error('game: олголт бичигдсэнгүй');
  return new Date(r.rows[0].expires_at);
}

async function currentExpiry(realm, email, key) {
  const a = checkArgs(realm, email, key);
  await ensureGameTables();
  const r = await pool.query('SELECT expires_at FROM game_access WHERE realm=$1 AND email=$2 AND game_key=$3', [a.realm, a.email, key]);
  return r.rows.length && r.rows[0].expires_at ? new Date(r.rows[0].expires_at) : null;
}

async function revokeGame(realm, email, key, db) {
  const a = checkArgs(realm, email, key);
  await ensureGameTables();
  const r = await (db || pool).query(
    'DELETE FROM game_access WHERE realm=$1 AND email=$2 AND game_key=$3 RETURNING game_key', [a.realm, a.email, key]);
  return r.rows.length;
}

// Борлуулалтын бүртгэл (төлсөн огноогоор). invoice_id давхардвал юу ч хийхгүй.
async function recordPurchase(p, db) {
  const a = checkArgs(p.realm, p.email, p.game_key);
  if (!p.invoice_id) throw new Error('game: invoice_id дутуу');
  await ensureGameTables();
  const r = await (db || pool).query(
    `INSERT INTO game_purchases (invoice_id, realm, email, game_key, amount, days, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (invoice_id) DO NOTHING RETURNING id`,
    [String(p.invoice_id), a.realm, a.email, p.game_key, parseInt(p.amount, 10) || 0,
     parseInt(p.days, 10) || GAME_DAYS, p.expires_at ? new Date(p.expires_at).toISOString() : null]);
  return r.rows.length > 0;
}

// ───────────────────────── cyber-math.com хэрэглэгч ─────────────────────────
// Bearer cm_token: auth.js {email, role, tv} / googleauth.js {email, id, tv}.
// Татгалзана: admin, ws:true (Дасгалын төв), uid (NOMAD GEAR), users-д байхгүй, token_version зөрсөн (хуучирсан) токен.
// DB алдаа → throw (дуудагч 500/503 буцаана).
async function cmUser(req) {
  const u = guard.requireUser(req);
  if (!u) return null;
  const d = guard.verifyBearer(req);
  if (!d || d.uid !== undefined) return null;
  const email = normEmail(u.email);
  if (!email) return null;
  await SMS.ensureUserColumns();
  const r = await pool.query('SELECT token_version FROM users WHERE LOWER(email)=LOWER($1)', [email]);
  if (!r.rows.length) return null;
  if ((Number(d.tv) | 0) !== (Number(r.rows[0].token_version) | 0)) return null;
  return { email: email, role: u.role || null };
}

module.exports = {
  GAMES, GAME_KEYS, GAME_DAYS, gamePrice, paywallOn, isGame, normRealm, normEmail, publicCatalog,
  ensureGameTables, entitlement, entitled, activeGames, isCmPremium,
  grantGame, currentExpiry, revokeGame, recordPurchase, cmUser,
};
