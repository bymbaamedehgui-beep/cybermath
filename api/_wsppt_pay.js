// Слайд хичээлийн худалдан авалт — 1 хичээл × 1 сар (PPT_PRICE, анхдагч 1900₮). Сагсаар олныг нэг нэхэмжлэхээр төлнө.
// Дуудагчид: api/qpay.js (create plan='ppt' → settlePpt), api/wsppt.js (эрх шалгах, «миний слайд»).
//   ws_ppt_access    (email, ppt_id) → expires_at   — дахин авбал үлдсэн хоног дээр НЭМЭГДЭНЭ
//   ws_ppt_purchases (invoice_id UNIQUE)            — борлуулалтын бүртгэл (тайлангийн «Слайд» сав)
'use strict';
const pool = require('./_db');

const PPT_DAYS = 30;
const PPT_MAX_CART = 30;
function pptPrice() {
  const n = parseInt(process.env.PPT_PRICE, 10);
  return Number.isFinite(n) && n >= 100 && n <= 1000000 ? n : 1900;
}
// Ажлын хуудасны эрхтэй хэрэглэгчид слайд багтах эсэх (анхдагч: үгүй — слайд тусдаа бүтээгдэхүүн)
function wsIncluded() { return process.env.PPT_WS_INCLUDED === '1'; }

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async function () {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_ppt_access (
        email TEXT NOT NULL,
        ppt_id INT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, ppt_id)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_ppt_purchases (
        id SERIAL PRIMARY KEY,
        invoice_id TEXT UNIQUE,
        email TEXT NOT NULL,
        ppt_ids TEXT NOT NULL,
        n INT NOT NULL,
        amount INT NOT NULL,
        days INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_ws_ppt_purch_created ON ws_ppt_purchases(created_at)');
    })().catch(function (e) {
      ready = null;
      if (e && (e.code === '23505' || e.code === '42P07')) return;   // зэрэг CREATE — аль хэдийн бий
      throw e;
    });
  }
  return ready;
}

// [3, '5', 3, 'x', -1] → [3, 5] (давхардалгүй, эерэг бүхэл, дээд тал нь PPT_MAX_CART)
function normIds(v) {
  const arr = Array.isArray(v) ? v : (typeof v === 'string' ? v.split(',') : []);
  const out = [];
  for (const x of arr) {
    const n = parseInt(x, 10);
    if (Number.isInteger(n) && n > 0 && n < 1e9 && out.indexOf(n) < 0) out.push(n);
    if (out.length >= PPT_MAX_CART) break;
  }
  return out.sort(function (a, b) { return a - b; });
}

// { id: expires_at ISO } — идэвхтэй эрхүүд
async function owned(email) {
  if (!email) return {};
  await ensure();
  const r = await pool.query('SELECT ppt_id, expires_at FROM ws_ppt_access WHERE email=$1 AND expires_at > NOW()', [String(email).toLowerCase()]);
  const o = {};
  r.rows.forEach(function (x) { o[x.ppt_id] = new Date(x.expires_at).toISOString(); });
  return o;
}
async function expiryFor(email, id) {
  if (!email) return null;
  await ensure();
  const r = await pool.query('SELECT expires_at FROM ws_ppt_access WHERE email=$1 AND ppt_id=$2 AND expires_at > NOW()', [String(email).toLowerCase(), id]);
  return r.rows.length ? new Date(r.rows[0].expires_at).toISOString() : null;
}

// Олголт: дуусаагүй бол дуусах огноон дээр, дууссан бол одооноос days хоног. db — транзакцын client.
async function grant(email, ids, days, db) {
  const q = db || pool, out = {};
  for (const id of ids) {
    const r = await q.query(
      `INSERT INTO ws_ppt_access (email, ppt_id, expires_at) VALUES ($1, $2, NOW() + make_interval(days => $3::int))
       ON CONFLICT (email, ppt_id) DO UPDATE
         SET expires_at = GREATEST(ws_ppt_access.expires_at, NOW()) + make_interval(days => $3::int), updated_at = NOW()
       RETURNING expires_at`, [String(email).toLowerCase(), id, days]);
    out[id] = new Date(r.rows[0].expires_at).toISOString();
  }
  return out;
}
async function record(p, db) {
  const q = db || pool;
  await q.query(
    `INSERT INTO ws_ppt_purchases (invoice_id, email, ppt_ids, n, amount, days) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (invoice_id) DO NOTHING`,
    [p.invoice_id, String(p.email).toLowerCase(), p.ids.join(','), p.ids.length, p.amount | 0, p.days | 0]);
}

module.exports = { PPT_DAYS, PPT_MAX_CART, pptPrice, wsIncluded, ensure, normIds, owned, expiryFor, grant, record };
