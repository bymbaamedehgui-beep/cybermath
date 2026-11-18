// Бодолтын PPT — ЭЕШ ажлын хуудасны ТУХАЙН бодлогын багцын (хуудас slug + seed) алхам алхмаар бодолтын слайд.
// Нэг удаагийн худалдан авалт (SOL_PPT_PRICE, анхдагч 2900₮); «Шинэ бодлого» дарвал шинэ багц — дахин худалдана.
// Слайдыг хөтөч дээр e1k-sol.js тоглуулна (файл татагдахгүй). Дуудагчид: api/qpay.js (plan='solppt' → settle), api/wsppt.js (эрх, жагсаалт).
//   ws_sol_ppt (email, slug, seed) — худалдан авалт бүр нэг мөр (invoice_id UNIQUE); борлуулалтын дүн ws_ppt_purchases-д
//   («Слайд» сав, ppt_ids = 'sol:<slug>:<seed>') бичигдэнэ.
'use strict';
const pool = require('./_db');

function price() {
  const n = parseInt(process.env.SOL_PPT_PRICE, 10);
  return Number.isFinite(n) && n >= 100 && n <= 1000000 ? n : 2900;
}

// ЭЕШ 1000-ийн хуудсууд: eesh1000-1 … eesh1000-16, eesh1000-too-1, eesh1000-olon-gishuunt-2
const SLUG_RE = /^eesh1000-[a-z0-9]{1,20}(?:-[a-z0-9]{1,20}){0,3}$/;
const SEED_RE = /^[0-9a-z]{4,10}$/;
function normRef(slug, seed) {
  slug = String(slug == null ? '' : slug).trim().toLowerCase();
  seed = String(seed == null ? '' : seed).trim().toLowerCase();
  return SLUG_RE.test(slug) && slug.length <= 60 && SEED_RE.test(seed) ? { slug: slug, seed: seed } : null;
}
// Гарчиг (жагсаалтад харуулах) — таг, удирдах тэмдэгт, '|'-гүй, 80 тэмдэгт
function normTitle(t) {
  return String(t == null ? '' : t).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}
// pay_pending.sol_ref = 'slug|seed|гарчиг'
function refStr(r) { return r.slug + '|' + r.seed + '|' + normTitle(r.title); }
function parseRef(s) {
  const p = String(s || '').split('|');
  if (p.length < 2 || p.length > 3) return null;
  const r = normRef(p[0], p[1]);
  if (r) r.title = normTitle(p[2] || '');
  return r;
}

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async function () {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_sol_ppt (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL,
        slug TEXT NOT NULL,
        seed TEXT NOT NULL,
        title TEXT,
        invoice_id TEXT UNIQUE,
        amount INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_ws_sol_ppt_owner ON ws_sol_ppt(email, slug, seed)');
    })().catch(function (e) {
      ready = null;
      if (e && (e.code === '23505' || e.code === '42P07')) return;   // зэрэг CREATE — аль хэдийн бий
      throw e;
    });
  }
  return ready;
}

async function has(email, ref) {
  if (!email || !ref) return false;
  await ensure();
  const r = await pool.query('SELECT 1 FROM ws_sol_ppt WHERE email=$1 AND slug=$2 AND seed=$3 LIMIT 1',
    [String(email).toLowerCase(), ref.slug, ref.seed]);
  return r.rows.length > 0;
}

// Хэрэглэгчийн худалдан авсан PPT-үүд (шинэ нь эхэнд); slug өгвөл тэр хуудасных л
async function mine(email, slug) {
  if (!email) return [];
  await ensure();
  const lc = String(email).toLowerCase();
  const r = slug
    ? await pool.query('SELECT DISTINCT ON (slug, seed) slug, seed, title, created_at FROM ws_sol_ppt WHERE email=$1 AND slug=$2 ORDER BY slug, seed, created_at', [lc, slug])
    : await pool.query('SELECT DISTINCT ON (slug, seed) slug, seed, title, created_at FROM ws_sol_ppt WHERE email=$1 ORDER BY slug, seed, created_at', [lc]);
  return r.rows
    .map(function (x) { return { slug: x.slug, seed: x.seed, title: x.title || '', at: new Date(x.created_at).toISOString() }; })
    .sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; })
    .slice(0, 200);
}

// Олголт — db: транзакцын client (заавал биш). invoice_id давхардвал юу ч хийхгүй (replay).
async function grant(p, db) {
  const q = db || pool;
  const r = await q.query(
    `INSERT INTO ws_sol_ppt (email, slug, seed, title, invoice_id, amount) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (invoice_id) DO NOTHING RETURNING id`,
    [String(p.email).toLowerCase(), p.slug, p.seed, normTitle(p.title) || null, p.invoice_id, p.amount | 0]);
  return r.rows.length > 0;
}

// Борлуулалтын бүртгэлд (ws_ppt_purchases) бичих ppt_ids
function ledgerId(ref) { return 'sol:' + ref.slug + ':' + ref.seed; }

module.exports = { price, normRef, refStr, parseRef, normTitle, ensure, has, mine, grant, ledgerId, SLUG_RE, SEED_RE };
