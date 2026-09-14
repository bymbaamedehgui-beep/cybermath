const pool = require('./_db');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { rateLimit, clientIp } = require('./_guard');
// Telegram HTML мессежэнд хэрэглэгчийн утгыг аюулгүй оруулах
function escTg(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// JWT нууц түлхүүр — ЗААВАЛ env-ээс (default fallback байхгүй). Байхгүй бол handler 500 буцаана.
function jwtSecret() { return process.env.JWT_SECRET || ''; }
// Telegram мэдэгдэл (сургалтын төлбөр гэх мэт)
async function notifyTelegram(text) {
  const tok = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!tok || !chat) return;
  try {
    await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
  } catch (e) { console.error('[qpay tg]', e.message); }
}
// Ажлын хуудсын шаталсан үнэ (сараар). 3 сараас багагүй.
const WS_PRICES = { 3: 39900, 6: 69900, 9: 99900, 12: 119900 };
const WS_MONTHS = [3, 6, 9, 12];
function wsNormMonths(m) { m = parseInt(m, 10); return WS_MONTHS.indexOf(m) >= 0 ? m : 3; }
function wsBasePrice(months) { return WS_PRICES[wsNormMonths(months)]; }
const WS_YEAR_PRICE = WS_PRICES[12];   // хуучин 'wsyear' нийцэл
// ── Ажлын хуудсыг АНГИАР худалдан авах (нэг анги = сард 9900) ──
const WG = require('./_wsgrade');
const WS_GRADE_PER_MONTH = parseInt(process.env.WS_GRADE_PRICE || '9900', 10);
const WS_GRADE_MONTHS = [1, 3, 6, 12];
// catalog.js ачаалагдаагүй (жагсаалт хоосон) тохиолдолд "N-р анги" хэлбэрээр зөвшөөрнө
function wsGradeOk(g) {
  g = String(g || '').trim();
  if (!g) return false;
  const list = WG.allGrades();
  if (list.length) return list.indexOf(g) >= 0;
  return /^\d{1,2}-р анги$/.test(g);
}
function wsGradeMonths(m) { m = parseInt(m, 10); return WS_GRADE_MONTHS.indexOf(m) >= 0 ? m : 1; }
function wsGradeBase(months) { return wsGradeMonths(months) * WS_GRADE_PER_MONTH; }
function wsGradePrice(pct, months) {
  const base = wsGradeBase(months);
  return pct > 0 ? Math.round(base * (100 - pct) / 100) : base;
}
function wsGradePrices() {
  const o = {};
  WS_GRADE_MONTHS.forEach(function (m) { o[m] = wsGradeBase(m); });
  return o;
}
// Ажлын хуудсын урамшууллын код (20% хөнгөлөлт). Кодыг env-ээр өөрчилж болно.
const WS_PROMO_PCT = parseInt(process.env.WS_PROMO_PCT || '20', 10);
const WS_PROMO_CODES = (process.env.WS_PROMO_CODES || 'BAGSH20,ZUN20,CYBER20')
  .split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
// (DB промог resolvePromo() шалгана; доорх WS_PROMO_CODES нь зөвхөн нөөц/анхны кодууд)

// Ажлын хуудсын эрхийн хүснэгт + токеноос имэйл гаргах
async function ensureWsTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_access (
    email TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
}
async function grantWsMonths(email, months) {
  await ensureWsTable();
  months = wsNormMonths(months);
  const days = months >= 12 ? 365 : months * 30;
  const exp = new Date(); exp.setDate(exp.getDate() + days);
  await pool.query(
    `INSERT INTO ws_access (email, expires_at, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (email) DO UPDATE SET expires_at=GREATEST(ws_access.expires_at, EXCLUDED.expires_at), updated_at=NOW()`,
    [email, exp.toISOString()]
  );
  return exp;
}
function grantWsYear(email) { return grantWsMonths(email, 12); }
async function grantWsUntil(email, exp) {
  await ensureWsTable();
  await pool.query(
    `INSERT INTO ws_access (email, expires_at, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (email) DO UPDATE SET expires_at=GREATEST(ws_access.expires_at, EXCLUDED.expires_at), updated_at=NOW()`,
    [email, exp.toISOString()]
  );
  return exp;
}
// ── Хоёр талын Referral (Dropbox маягаар) ──
const REF_PCT       = parseInt(process.env.WS_REF_PCT  || '15', 10);  // уригдсан найзын хямдрал %
const REF_PAIR      = parseInt(process.env.WS_REF_PAIR || '2',  10);  // хэдэн найз захиалбал шагнах вэ
const REF_PAIR_DAYS = parseInt(process.env.WS_REF_DAYS || '30', 10);  // шагнал (хоног) — 1 сар
async function grantWsAddDays(email, days) {
  await ensureWsTable();
  await pool.query(
    `INSERT INTO ws_access (email, expires_at, updated_at) VALUES ($1, NOW() + ($2 || ' days')::interval, NOW())
     ON CONFLICT (email) DO UPDATE SET expires_at = GREATEST(ws_access.expires_at, NOW()) + ($2 || ' days')::interval, updated_at=NOW()`,
    [String(email).trim().toLowerCase(), String(days)]
  );
}
function genRefCode() { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = 'R'; for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)]; return s; }
async function getOrCreateRefCode(email) {
  email = String(email).trim().toLowerCase();
  await pool.query('ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS ref_code TEXT').catch(()=>{});
  const r = await pool.query('SELECT ref_code FROM ws_login WHERE lower(email)=$1', [email]).catch(()=>({rows:[]}));
  if (!r.rows.length) return null;
  if (r.rows[0].ref_code) return r.rows[0].ref_code;
  for (let i = 0; i < 10; i++) { const code = genRefCode(); try { await pool.query('UPDATE ws_login SET ref_code=$2 WHERE lower(email)=$1', [email, code]); return code; } catch (e) {} }
  return null;
}
async function refOwner(code) {
  if (!code) return null;
  await pool.query('ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS ref_code TEXT').catch(()=>{});
  const r = await pool.query('SELECT lower(email) AS email FROM ws_login WHERE ref_code=$1 LIMIT 1', [String(code).trim().toUpperCase()]).catch(()=>({rows:[]}));
  return r.rows.length ? r.rows[0].email : null;
}
async function processReferral(refereeEmail, invoiceId) {
  try {
    refereeEmail = String(refereeEmail).trim().toLowerCase();
    const p = await pool.query('SELECT ref FROM ws_pending WHERE invoice_id=$1', [invoiceId]).catch(()=>({rows:[]}));
    const code = p.rows.length ? p.rows[0].ref : null;
    if (!code) return;
    const owner = await refOwner(code);
    if (!owner || owner === refereeEmail) return;
    const ins = await pool.query(
      `INSERT INTO ws_referrals (referee_email, ref_code, referrer_email, invoice_id, reward_days)
       VALUES ($1,$2,$3,$4,0) ON CONFLICT (referee_email) DO NOTHING RETURNING referee_email`,
      [refereeEmail, String(code).toUpperCase(), owner, String(invoiceId)]);
    if (!ins.rows.length) return; // энэ найз аль хэдийн бүртгэгдсэн
    // Урьсан багшийн нийт найз тоологдож, ХЭДЭН НАЙЗ ТУТАМД (REF_PAIR) 1 сар олгоно
    const cntRes = await pool.query('SELECT COUNT(*)::int AS n FROM ws_referrals WHERE referrer_email=$1', [owner]);
    const cnt = cntRes.rows[0].n;
    if (cnt % REF_PAIR === 0) {
      await grantWsAddDays(owner, REF_PAIR_DAYS);
      await pool.query('UPDATE ws_referrals SET reward_days=$2 WHERE referee_email=$1', [refereeEmail, REF_PAIR_DAYS]).catch(()=>{});
      try { await notifyTelegram('🎁 <b>Referral</b>\n' + owner + ' → +' + REF_PAIR_DAYS + ' хоног (' + REF_PAIR + ' найз захиалав)\n(сүүлийн: ' + refereeEmail + ')'); } catch (e) {}
    }
  } catch (e) { console.error('[referral]', e.message); }
}

// ── Азтаны хүрд — нэг имэйл нэг эргэлт. Ялагдсан нүд ч эерэг мэндчилгээтэй ──
const WHEEL = [
  { label: '1 өдрийн эрх',  type: 'access',   hours: 24,        weight: 5  },
  { label: 'Нууц',          type: 'mystery',                    weight: 12 },
  { label: '5% хөнгөлөлт',  type: 'discount', pct: 5,  days: 7, weight: 14 },
  { label: 'Баярлалаа',     type: 'none',                       weight: 16 },
  { label: '40% ЖИЛ',       type: 'discount', pct: 40, days: 7, weight: 2  },
  { label: '1 цагийн эрх',  type: 'access',   hours: 1,         weight: 8  },
  { label: 'Нууц',          type: 'mystery',                    weight: 12 },
  { label: '10% хөнгөлөлт', type: 'discount', pct: 10, days: 7, weight: 10 },
  { label: 'Амжилт хүсье!', type: 'none',                       weight: 16 },
  { label: '20% 6САР',      type: 'discount', pct: 20, days: 7, weight: 3  },
  { label: 'Нууц',          type: 'mystery',                    weight: 12 },
  { label: '20% хөнгөлөлт', type: 'discount', pct: 20, days: 1, weight: 4  },
];
// "Нууц" нүд дээр буувал доторх шагнал (ихэвчлэн баярлалаа, хааяа хөнгөлөлт/эрх)
const MYSTERY = [
  { type: 'none',     label: 'Баярлалаа',                  weight: 42 },
  { type: 'discount', pct: 5,  days: 7, label: '5% хөнгөлөлт',  weight: 24 },
  { type: 'access',   hours: 1,         label: '1 цагийн эрх',  weight: 16 },
  { type: 'discount', pct: 10, days: 7, label: '10% хөнгөлөлт', weight: 12 },
  { type: 'discount', pct: 15, days: 7, label: '15% хөнгөлөлт', weight: 6  },
];
function pickFrom(arr) {
  const total = arr.reduce((s, w) => s + w.weight, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) { r -= arr[i].weight; if (r < 0) return i; }
  return arr.length - 1;
}
function wheelPick() { return pickFrom(WHEEL); }
async function applyReward(email, r) {
  let code = null, detail = '';
  if (r.type === 'discount') { const p = await createWheelPromo(r.pct, r.days); code = p.code; detail = r.days + ' хоногт хүчинтэй'; }
  else if (r.type === 'access') { const exp = new Date(Date.now() + r.hours * 3600000); await grantWsUntil(email, exp); detail = r.hours >= 24 ? (r.hours / 24 + ' өдрийн бүх эрх') : (r.hours + ' цагийн бүх эрх'); }
  return { code, detail };
}
async function ensureWheel() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_wheel (
    email TEXT PRIMARY KEY, prize TEXT, code TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
}
async function createWheelPromo(pct, days) {
  await ensureWsExtra();
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const exp = new Date(Date.now() + days * 86400000);
  for (let a = 0; a < 6; a++) {
    let code = 'LUCKY'; for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    try {
      await pool.query(`INSERT INTO ws_promos (code, pct, max_uses, expires_at, note, personal) VALUES ($1,$2,1,$3,'Азтаны хүрд',TRUE)`,
        [code, pct, exp.toISOString()]);
      return { code, exp };
    } catch (e) { if (e.code !== '23505') throw e; }
  }
  throw new Error('код үүсгэж чадсангүй');
}
function wsToken(email) {
  if (!jwtSecret()) throw new Error('JWT_SECRET тохируулаагүй');
  return jwt.sign({ email: email, ws: true }, jwtSecret(), { expiresIn: '400d' });
}
function emailFromToken(tok) { if (!jwtSecret() || !tok) return null; try { var d = jwt.verify(tok, jwtSecret()); return d && d.email ? String(d.email).toLowerCase() : null; } catch (e) { return null; } }
function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ') || !jwtSecret()) return false;
  try { const d = jwt.verify(auth.slice(7), jwtSecret()); return !!(d && d.admin); } catch (e) { return false; }
}

// ── Ажлын хуудсын промо код + борлуулалтын бүртгэл (DB) ──
let wsExtraReady = false;
async function ensureWsExtra() {
  if (!wsExtraReady) {
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_promos (
    code TEXT PRIMARY KEY,
    pct INT NOT NULL DEFAULT 20,
    max_uses INT,
    used_count INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_promos ADD COLUMN IF NOT EXISTS months INT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_promos ADD COLUMN IF NOT EXISTS fake_uses TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_promos ADD COLUMN IF NOT EXISTS welcome BOOLEAN DEFAULT FALSE`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_promos ADD COLUMN IF NOT EXISTS personal BOOLEAN DEFAULT FALSE`).catch(()=>{});
  await pool.query(`UPDATE ws_promos SET personal=TRUE WHERE personal IS NOT TRUE AND note='Азтаны хүрд'`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_purchases (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    amount INT NOT NULL,
    promo TEXT,
    invoice_id TEXT UNIQUE,
    months INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_purchases ADD COLUMN IF NOT EXISTS months INT`).catch(()=>{});
  // Нэхэмжлэх бүрийг хадгалж, төлбөр тулгах (reconcile) — алдагдал гарахгүй болгоно
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_pending (
    invoice_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    months INT NOT NULL,
    promo TEXT,
    amount INT,
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_pending ADD COLUMN IF NOT EXISTS ref TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_pending ADD COLUMN IF NOT EXISTS grade TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_purchases ADD COLUMN IF NOT EXISTS grade TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS ref_code TEXT`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_referrals (
    referee_email TEXT PRIMARY KEY,
    ref_code TEXT,
    referrer_email TEXT,
    invoice_id TEXT,
    reward_days INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  wsExtraReady = true;
  }
  // Азын хүрдээр эргүүлж авсан, хугацаа нь дууссан промо кодуудыг автоматаар устгах
  try { await pool.query(`DELETE FROM ws_promos WHERE personal=TRUE AND note='Азтаны хүрд' AND expires_at IS NOT NULL AND expires_at < NOW()`); } catch (e) {}
}
// DB промог эхэнд шалгаад, олдохгүй бол env кодоос үзнэ
async function resolvePromo(code) {
  if (!code) return { valid: false, pct: 0 };
  const c = String(code).trim().toUpperCase();
  try {
    await ensureWsExtra();
    const r = await pool.query('SELECT pct,max_uses,used_count,expires_at,active FROM ws_promos WHERE code=$1', [c]);
    if (r.rows.length) {
      const p = r.rows[0];
      const okActive = p.active !== false;
      const okExp = !p.expires_at || new Date(p.expires_at) > new Date();
      const okUses = p.max_uses == null || p.used_count < p.max_uses;
      return okActive && okExp && okUses ? { valid: true, pct: p.pct } : { valid: false, pct: 0 };
    }
  } catch (e) { /* DB алдаа бол env-рүү шилжинэ */ }
  if (WS_PROMO_CODES.indexOf(c) >= 0) return { valid: true, pct: WS_PROMO_PCT };
  return { valid: false, pct: 0 };
}
function priceFromPct(pct, months) { const base = wsBasePrice(months); return pct > 0 ? Math.round(base * (100 - pct) / 100) : base; }
async function recordPurchase(email, amount, promo, invoiceId, months, grade) {
  await ensureWsExtra();
  const r = await pool.query(
    `INSERT INTO ws_purchases (email, amount, promo, invoice_id, months, grade) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (invoice_id) DO NOTHING RETURNING id`,
    [email, amount, promo || null, invoiceId || null, months || null, grade || null]);
  return r.rows.length > 0;
}
// QPay payment/check — төлөгдсөн гүйлгээний тоо + нийт төлсөн дүн
async function qpayPayment(invoiceId) {
  if (!invoiceId) return { count: 0, paid: 0 };
  const token = await getToken();
  const cr = await fetch(`${QPAY_URL}/payment/check`, {
    method: 'POST', headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_type: 'INVOICE', object_id: invoiceId })
  });
  const cd = await cr.json();
  const count = cd && cd.count > 0 ? Number(cd.count) : 0;
  let sum = 0;
  (Array.isArray(cd && cd.rows) ? cd.rows : []).forEach(function (x) {
    const st = String((x && x.payment_status) || 'PAID').toUpperCase();
    if (st === 'PAID') sum += Number(x.payment_amount) || 0;
  });
  const top = Number(cd && cd.paid_amount) || 0;
  return { count: count, paid: Math.max(sum, top) };
}
// Нэхэмжлэх үнэхээр төлөгдсөн БӨГӨӨД төлсөн дүн хадгалсан дүнгээс багагүй эсэх
async function qpayInvoicePaid(invoiceId, needAmount) {
  const p = await qpayPayment(invoiceId);
  if (!(p.count > 0)) return false;
  const need = Number(needAmount) || 0;
  if (p.paid < need) { console.warn('[qpay] дутуу төлбөр', invoiceId, p.paid, '<', need); return false; }
  return true;
}
async function wsPendingRow(invoiceId) {
  if (!invoiceId) return null;
  await ensureWsExtra();
  const r = await pool.query('SELECT invoice_id, email, months, promo, amount, grade, granted FROM ws_pending WHERE invoice_id=$1',
    [String(invoiceId)]);
  return r.rows[0] || null;
}
// ── Premium / Найзууд багц / Сургалт — нэхэмжлэх бүрийн pending мөр ──
let payPendingReady = false;
async function ensurePayPending() {
  if (payPendingReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS pay_pending (
    invoice_id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    plan TEXT NOT NULL,
    months INT,
    amount INT NOT NULL,
    event_id BIGINT,
    granted BOOLEAN NOT NULL DEFAULT FALSE,
    promo_code TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE pay_pending ADD COLUMN IF NOT EXISTS promo_code TEXT`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pay_pending_email ON pay_pending(email, granted)`).catch(()=>{});
  payPendingReady = true;
}
async function payPendingRow(invoiceId) {
  if (!invoiceId) return null;
  await ensurePayPending();
  const r = await pool.query('SELECT invoice_id, email, plan, months, amount, event_id, granted, promo_code FROM pay_pending WHERE invoice_id=$1',
    [String(invoiceId)]);
  return r.rows[0] || null;
}
// Нэг удаа зарцуулах: granted=FALSE → TRUE атомаар. Мөр буцвал л энэ дуудлага олгоно.
const PENDING_TABLES = { ws_pending: 'ws_pending', pay_pending: 'pay_pending' };
async function claimPending(table, invoiceId) {
  const r = await pool.query(`UPDATE ${PENDING_TABLES[table]} SET granted=TRUE WHERE invoice_id=$1 AND granted=FALSE RETURNING invoice_id`, [String(invoiceId)]);
  return r.rows.length > 0;
}
async function unclaimPending(table, invoiceId) {
  await pool.query(`UPDATE ${PENDING_TABLES[table]} SET granted=FALSE WHERE invoice_id=$1`, [String(invoiceId)])
    .catch(e => console.error('[qpay unclaim]', e.message));
}
// Төлөгдсөн нэхэмжлэхийг ХАДГАЛСАН мэдээллээр (имэйл/анги/сар/дүн) олгож бүртгэнэ.
// Давтан дуудахад аюулгүй: эрх GREATEST-ээр сунгагдахгүй, худалдан авалт invoice_id-аар давхардахгүй.
async function settleWsPending(row) {
  const exp = row.grade ? await WG.grantGradeMonths(row.email, row.grade, row.months)
                        : await grantWsMonths(row.email, row.months);
  try {
    const amount = row.amount || (row.grade ? wsGradeBase(row.months) : priceFromPct(0, row.months));
    const inserted = await recordPurchase(row.email, amount, row.promo, row.invoice_id, row.months, row.grade);
    if (inserted && row.promo) await pool.query('UPDATE ws_promos SET used_count=used_count+1 WHERE code=$1', [row.promo]).catch(()=>{});
    await pool.query('UPDATE ws_pending SET granted=TRUE WHERE invoice_id=$1', [row.invoice_id]);
    if (!row.grade) await processReferral(row.email, row.invoice_id);
  } catch (e) { console.error('[ws settle]', e.message); }
  return exp;
}
// Ажлын хуудасны нэхэмжлэхийг НЭГ УДАА олгоно (claim → settleWsPending). Аль хэдийн олгосон бол
// дахин сунгахгүй — одоогийн дуусах хугацааг л буцаана. Олголт алдаа гарвал claim-ийг буцаана.
async function wsCurrentExpiry(row) {
  let exp = null;
  try {
    const r = row.grade
      ? await pool.query('SELECT expires_at FROM ws_grade_access WHERE email=$1 AND grade=$2', [String(row.email).toLowerCase(), row.grade])
      : await pool.query('SELECT expires_at FROM ws_access WHERE email=$1', [String(row.email).toLowerCase()]);
    if (r.rows.length && r.rows[0].expires_at) exp = new Date(r.rows[0].expires_at);
  } catch (e) { console.error('[ws expiry]', e.message); }
  if (!exp) { exp = new Date(); exp.setDate(exp.getDate() + WG.monthsToDays(row.months)); }
  return exp;
}
async function settleWsOnce(row) {
  // Хуучин callback замаар олгогдож ws_purchases-т бүртгэгдсэн боловч ws_pending.granted=FALSE үлдсэн нэхэмжлэх —
  // аль хэдийн олгосон гэж үзэж зөвхөн granted=TRUE болгоно, дахин олгохгүй (replay хаалт)
  const bought = await pool.query('SELECT 1 FROM ws_purchases WHERE invoice_id=$1 LIMIT 1', [String(row.invoice_id)]);
  if (bought.rows.length) {
    await pool.query('UPDATE ws_pending SET granted=TRUE WHERE invoice_id=$1', [String(row.invoice_id)])
      .catch(e => console.error('[ws legacy mark]', e.message));
    return { already: true, exp: await wsCurrentExpiry(row) };
  }
  if (!(await claimPending('ws_pending', row.invoice_id))) return { already: true, exp: await wsCurrentExpiry(row) };
  try { return { already: false, exp: await settleWsPending(row) }; }
  catch (e) { await unclaimPending('ws_pending', row.invoice_id); throw e; }
}
// Premium / friends / event нэхэмжлэхийг ХАДГАЛСАН мөрөөр НЭГ УДАА олгоно.
// Буцаах: { granted: энэ дуудлага эрх олгосон эсэх, out: клиентийн хариу (бүтэц хуучинтай ижил) }
async function settlePay(row) {
  const email = String(row.email).trim().toLowerCase();
  const claimed = await claimPending('pay_pending', row.invoice_id);
  if (row.plan === 'event') {
    if (!claimed) return { granted: false, out: { ok: true, paid: true } };
    let upd;
    try {
      upd = await pool.query('UPDATE ws_event_regs SET paid=TRUE, paid_at=NOW() WHERE event_id=$1 AND lower(email)=$2 AND paid=FALSE RETURNING id, slot', [row.event_id, email]);
    } catch (e) { await unclaimPending('pay_pending', row.invoice_id); throw e; }
    if (!upd.rows.length) {
      // Бүртгэл олдсонгүй эсвэл аль хэдийн төлөгдсөн — нэхэмжлэхийг зарцуулсан гэж тэмдэглэхгүй (админ тулгаж шалгана).
      // QPay төлбөрийг баталсан тул клиентэд paid:true (давтан poll-оор анхааруулга олон дахин явуулахгүй)
      await unclaimPending('pay_pending', row.invoice_id);
      console.warn('[qpay event] төлөгдсөн боловч ws_event_regs шинэчлэгдсэнгүй', row.invoice_id, email, row.event_id);
      await notifyTelegram('⚠️ <b>Сургалтын төлбөр бүртгэлтэй тулгагдсангүй</b>\n\n👤 ' + escTg(email) + '\n📌 event_id: ' + escTg(row.event_id) +
        '\n🧾 ' + escTg(row.invoice_id) + '\n💰 ' + escTg(row.amount) + '₮\nБүртгэл олдсонгүй эсвэл аль хэдийн төлөгдсөн — гараар шалгана уу.');
      return { granted: false, out: { ok: true, paid: true } };
    }
    try {
      const ev = await pool.query('SELECT title FROM ws_events WHERE id=$1', [row.event_id]);
      await notifyTelegram('✅ <b>Сургалтын төлбөр төлөгдлөө</b> (' + ((ev.rows[0] && ev.rows[0].title) || row.event_id) + ')\n\n👤 ' + email + '\n🕒 ' + (upd.rows[0].slot || '') + '\n💰 ' + row.amount + '₮');
    } catch (e) {}
    return { granted: true, out: { ok: true, paid: true } };
  }
  // Premium (monthly/yearly/friends)
  if (!claimed) {
    let exp = null;
    try {
      const u = await pool.query('SELECT premium_expiry FROM users WHERE lower(email)=$1 LIMIT 1', [email]);
      if (u.rows.length && u.rows[0].premium_expiry) exp = new Date(u.rows[0].premium_expiry);
    } catch (e) { console.error('[premium expiry]', e.message); }
    const out = { ok: true, paid: true, expiry: (exp || new Date()).toISOString() };
    if (row.plan === 'friends' && row.promo_code) { out.promo_code = row.promo_code; out.promo_uses = 2; }
    return { granted: false, out: out };
  }
  const months = parseInt(row.months, 10) || 1;
  // Найзууд багц — promo кодыг premium-ээс ӨМНӨ бэлдэнэ. Алдаа гарвал claim буцаж premium огт олгогдоогүй үлдэнэ,
  // тиймээс дараагийн оролдлого premium-ийг ДАВХАР сунгахгүй. Код claim-ийн дараа шинээр уншигдана:
  // өмнөх оролдлого кодыг хадгалаад (users алдаагаар) буцсан бол тэр кодыг дахин ашиглана.
  let promoCode = null;
  if (row.plan === 'friends') {
    try {
      const cur = await pool.query('SELECT promo_code FROM pay_pending WHERE invoice_id=$1', [String(row.invoice_id)]);
      promoCode = (cur.rows[0] && cur.rows[0].promo_code) || null;
      if (!promoCode) {
        promoCode = await createFriendsPromo(email);
        await pool.query('UPDATE pay_pending SET promo_code=$2 WHERE invoice_id=$1', [row.invoice_id, promoCode]);
      }
    } catch (err) {
      console.error('[QPay friends promo]', err.message);
      await unclaimPending('pay_pending', row.invoice_id);   // дараагийн check/callback/reconcile дахин оролдоно
      throw err;
    }
  }
  // Одоогийн эрхийг дарахгүй сунгана: MAX(одоогийн дуусах, NOW()) + сар*30 хоног. claim нэг удаа тул replay үгүй.
  let expiry;
  try {
    const upd = await pool.query(
      `UPDATE users SET plan='premium', premium_expiry = GREATEST(COALESCE(premium_expiry, NOW()), NOW()) + make_interval(days => $2::int)
        WHERE lower(email)=$1 RETURNING premium_expiry`,
      [email, months * 30]);
    if (!upd.rows.length) throw new Error('Хэрэглэгч олдсонгүй');
    expiry = upd.rows[0].premium_expiry ? new Date(upd.rows[0].premium_expiry) : new Date(Date.now() + months * 30 * 864e5);
  } catch (e) { await unclaimPending('pay_pending', row.invoice_id); throw e; }
  const out = { ok: true, paid: true, expiry: expiry.toISOString() };
  if (promoCode) { out.promo_code = promoCode; out.promo_uses = 2; }
  return { granted: true, out: out };
}
async function settlePayOnce(row) { return (await settlePay(row)).out; }

const QPAY_URL = 'https://merchant.qpay.mn/v2';
// QPay мерчантын нэвтрэх мэдээлэл env-ээс. ШИЛЖИЛТИЙН ҮЕИЙН fallback: QPay дээр нууц үгийг сольж
// Vercel env-д QPAY_USERNAME/QPAY_PASSWORD/QPAY_INVOICE_CODE нэмсний дараа доорх хатуу утгуудыг УСТГАНА.
const USERNAME = process.env.QPAY_USERNAME || 'BYAMBADORJ';
const PASSWORD = process.env.QPAY_PASSWORD || 'UWDUnhyP';
const INVOICE_CODE = process.env.QPAY_INVOICE_CODE || 'BYAMBADORJ_INVOICE';

// Premium тариф — СЕРВЕР тогтооно (клиентийн amount-д итгэхгүй). index.html showPremiumInfo()-той ижил.
const PREMIUM_PRICES = {
  student: { monthly: 9900,  yearly: 100980, friends: 24900 },
  teacher: { monthly: 24900, yearly: Math.round(24900 * 12 * 0.8), friends: 24900 },   // жил 239040
};
const PREMIUM_MONTHS = { monthly: 1, yearly: 12, friends: 1 };
function premiumPlanNorm(p) { p = String(p || '').trim(); return p === 'premium' ? 'monthly' : (PREMIUM_MONTHS[p] ? p : null); }

let qpayToken = null;
let tokenExpiry = 0;

// Найзууд багц — захиалагчид зориулсан Premium promo код үүсгэх (2 найз × 30 хоног)
async function createFriendsPromo(ownerEmail) {
  // Хүснэгт бэлэн эсэхийг шалгах
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount INT NOT NULL DEFAULT 0,
      reward_meta JSONB,
      description TEXT,
      max_uses INT,
      used_count INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_public BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // crypto санамсаргүй код (FR + 10 тэмдэгт ≈ 50 бит) — таамаглах/brute force боломжгүй. Давхардвал дахин оролдоно
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'FR';
    for (let i = 0; i < 10; i++) code += chars[crypto.randomInt(chars.length)];
    try {
      await pool.query(
        `INSERT INTO promo_codes (code, reward_type, reward_amount, max_uses, description)
         VALUES ($1, 'premium', 30, 2, $2)`,
        [code, 'Найзууд багц — ' + ownerEmail]
      );
      return code;
    } catch (e) {
      if (e.code !== '23505') throw e; // unique violation бус бол throw
    }
  }
  throw new Error('Promo код үүсгэх амжилтгүй');
}

async function getToken() {
  if (qpayToken && Date.now() < tokenExpiry) return qpayToken;
  const resp = await fetch(`${QPAY_URL}/auth/token`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + Buffer.from(`${USERNAME}:${PASSWORD}`).toString('base64'),
      'Content-Type': 'application/json'
    }
  });
  const data = await resp.json();
  if (!data || !data.access_token) throw new Error('QPay auth амжилтгүй');
  qpayToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  return qpayToken;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!jwtSecret()) { console.error('[qpay] JWT_SECRET тохируулаагүй'); return res.status(500).json({ ok: false, error: 'Серверийн тохиргооны алдаа' }); }

  try {
    // Invoice үүсгэх
    if (req.method === 'POST' && req.query.action === 'create') {
      // amount-ыг клиентээс АВАХГҮЙ — үнийг зөвхөн сервер тогтооно
      const { email, plan } = req.body || {};
      if (!email || typeof email !== 'string') return res.status(400).json({ ok: false, error: 'Missing email' });
      const emailLc = email.trim().toLowerCase();
      const premiumPlan = premiumPlanNorm(plan);
      if (!premiumPlan && ['wsyear', 'wsmonths', 'wsgrade', 'event'].indexOf(plan) < 0)
        return res.status(400).json({ ok: false, error: 'Тариф буруу байна' });

      // Email-ыг богиносгож аюулгүй болгох — QPay-н sender_invoice_no/customer_code 45 тэмдэгт хязгаартай
      const emailHash = crypto.createHash('md5').update(email).digest('hex').slice(0, 12); // 12 тэмдэгт
      const senderNo = `CM${emailHash}${Date.now()}`; // CM + 12 + 13 = 27 тэмдэгт
      const receiverCode = `cm_${emailHash}`; // 15 тэмдэгт, зөвхөн ASCII

      // Ажлын хуудас — шаталсан сарын эрх (3/6/9/12)
      let wsMonths = null;
      if (plan === 'wsyear') wsMonths = 12;
      else if (plan === 'wsmonths') wsMonths = wsNormMonths((req.body || {}).months);

      // Ажлын хуудас — НЭГ АНГИ (сард 9900, 1/3/6/12 сар)
      let wgGrade = null, wgMonths = null;
      if (plan === 'wsgrade') {
        wgGrade = String((req.body || {}).grade || '').trim();
        if (!wsGradeOk(wgGrade)) {
          return res.status(400).json({ ok: false, error: 'Анги буруу байна' });
        }
        wgMonths = wsGradeMonths((req.body || {}).months);
      }

      // Сургалт (Event) — үнийг DB-ээс баталгаатай авна
      let eventId = null, eventTitle = null, eventPrice = null;
      if (plan === 'event') {
        eventId = parseInt((req.body || {}).event_id, 10);
        try {
          const ev = await pool.query('SELECT title, price FROM ws_events WHERE id=$1 AND active=TRUE', [eventId]);
          if (ev.rows.length) { eventTitle = ev.rows[0].title; eventPrice = ev.rows[0].price || 20000; }
        } catch (e) { console.error('[event price]', e.message); }
        if (eventPrice == null) return res.status(400).json({ ok: false, error: 'Сургалт олдсонгүй' });
      }

      // Premium — хэрэглэгч бүртгэлтэй байх ёстой; багш/сурагчийн тарифыг DB-ийн role-оор тогтооно
      let premiumAmount = null;
      if (premiumPlan) {
        const u = await pool.query('SELECT role, grade FROM users WHERE lower(email)=$1 LIMIT 1', [emailLc]);
        if (!u.rows.length) return res.status(400).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
        const isTeacher = u.rows[0].role === 'teacher' || u.rows[0].grade === 'teacher';
        premiumAmount = PREMIUM_PRICES[isTeacher ? 'teacher' : 'student'][premiumPlan];
      }

      const desc = wgGrade != null ? `CyberMath ${wgGrade} — ${wgMonths} сар`.slice(0, 100)
                 : wsMonths != null ? `CyberMath Ажлын хуудас — ${wsMonths} сар`
                 : plan === 'event' ? ('Сургалт — ' + (eventTitle || 'CyberMath')).slice(0, 100)
                 : premiumPlan === 'friends' ? 'CyberMath Найзууд багц (3 хүн)'
                 : premiumPlan === 'yearly'  ? 'CyberMath Premium 1 жил'
                 : 'CyberMath Premium';

      // Үнэ — зөвхөн серверийн талд тооцно (промо код бол хямдруулна)
      let invAmount = premiumAmount;
      let refStore = null;
      if (wsMonths != null) {
        const pi = await resolvePromo((req.body || {}).promo);
        let pct = pi.pct;
        const refIn = ((req.body || {}).ref || '').trim().toUpperCase() || null;
        if (refIn) {
          const owner = await refOwner(refIn);
          if (owner && owner !== emailLc) { refStore = refIn; if (REF_PCT > pct) pct = REF_PCT; }
        }
        invAmount = priceFromPct(pct, wsMonths);
      } else if (wgGrade != null) {
        const pi = await resolvePromo((req.body || {}).promo);
        invAmount = wsGradePrice(pi.pct, wgMonths);
      } else if (plan === 'event') {
        invAmount = eventPrice;
      }

      const token = await getToken();
      const invoiceResp = await fetch(`${QPAY_URL}/invoice`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          invoice_code: INVOICE_CODE,
          sender_invoice_no: senderNo,
          invoice_receiver_code: receiverCode,
          invoice_description: desc,
          amount: invAmount,
          // Callback URL-д зөвхөн имэйл — plan/сар/анги-г серверийн pending мөрөөс авна
          callback_url: `https://cyber-math.com/api/qpay?action=callback&email=${encodeURIComponent(emailLc)}`
        })
      });
      const invoice = await invoiceResp.json();
      // БҮХ нэхэмжлэхийг хадгална — check/callback зөвхөн энэ мөрөөр олгоно. Хадгалж чадахгүй бол QR өгөхгүй.
      if (invoice && invoice.invoice_id) {
        try {
          if (wsMonths != null || wgGrade != null) {
            await ensureWsExtra();
            const promo = String((req.body || {}).promo || '').trim().toUpperCase() || null;
            await pool.query(
              `INSERT INTO ws_pending (invoice_id, email, months, promo, amount, ref, grade) VALUES ($1,$2,$3,$4,$5,$6,$7)
               ON CONFLICT (invoice_id) DO NOTHING`,
              [invoice.invoice_id, emailLc, wsMonths != null ? wsMonths : wgMonths,
               promo, invAmount, refStore, wgGrade]);
          } else {
            await ensurePayPending();
            await pool.query(
              `INSERT INTO pay_pending (invoice_id, email, plan, months, amount, event_id) VALUES ($1,$2,$3,$4,$5,$6)
               ON CONFLICT (invoice_id) DO NOTHING`,
              [invoice.invoice_id, emailLc, plan === 'event' ? 'event' : premiumPlan,
               plan === 'event' ? null : PREMIUM_MONTHS[premiumPlan], invAmount, plan === 'event' ? eventId : null]);
          }
        } catch (e) {
          console.error('[pending save]', e.message);
          return res.status(500).json({ ok: false, error: 'Нэхэмжлэх хадгалж чадсангүй. Дахин оролдоно уу.' });
        }
      }
      // Сургалтын бүртгэлд invoice_id холбоно (event_register аль хэдийн мөр үүсгэсэн)
      if (plan === 'event' && invoice && invoice.invoice_id && eventId) {
        try {
          await pool.query('UPDATE ws_event_regs SET invoice_id=$1, amount=$2 WHERE event_id=$3 AND lower(email)=$4',
            [invoice.invoice_id, invAmount, eventId, emailLc]);
        } catch (e) { console.error('[event invoice link]', e.message); }
      }
      return res.json({ ok: true, invoice });
    }

    // Төлбөр шалгах — invoice_id-г ЗААВАЛ серверийн pending мөртэй тулгана.
    // body-ийн plan/months/grade/event_id/amount-д огт итгэхгүй; бүгдийг хадгалсан мөрөөс авна.
    if (req.method === 'POST' && req.query.action === 'check') {
      const b = req.body || {};
      const email = String(b.email || '').trim().toLowerCase();
      const invoiceId = String(b.invoice_id || '').trim();
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
      if (!invoiceId) return res.status(400).json({ ok: false, error: 'Нэхэмжлэх олдсонгүй' });
      const wrow = await wsPendingRow(invoiceId);
      const prow = wrow ? null : await payPendingRow(invoiceId);
      const row = wrow || prow;
      if (!row) return res.status(400).json({ ok: false, error: 'Нэхэмжлэх олдсонгүй' });
      if (String(row.email).trim().toLowerCase() !== email)
        return res.status(403).json({ ok: false, error: 'Нэхэмжлэх энэ имэйлд хамаарахгүй' });
      // Олгогдоогүй бол QPay-тэй тулгана: төлөгдсөн + төлсөн дүн >= хадгалсан дүн
      if (!row.granted && !(await qpayInvoicePaid(invoiceId, row.amount))) return res.json({ ok: true, paid: false });
      if (wrow) {
        const s = await settleWsOnce(wrow);
        const out = { ok: true, paid: true, expiry: s.exp.toISOString(), ws_token: wsToken(email) };
        if (wrow.grade) out.grade = wrow.grade;
        return res.json(out);
      }
      return res.json(await settlePayOnce(prow));
    }
    // Callback — QPay-аас амжилттай төлсний дараа автомат ирнэ.
    // URL-ийн plan/months/grade/event_id-д ОГТ итгэхгүй: энэ имэйлийн олгогдоогүй нэхэмжлэхүүдийг (хоёр хүснэгтээс)
    // QPay-тэй тулгаж (дүнгийн хамт), үнэхээр төлөгдсөнийг нь хадгалсан мөрөөр НЭГ УДАА олгоно.
    if ((req.method === 'POST' || req.method === 'GET') && req.query.action === 'callback') {
      // Rate limit — IP: 60/10мин, имэйл: 10/10мин (QPay-ийн жинхэнэ callback цөөн; QPay check-ийг спамдуулахгүй)
      if (!(await rateLimit('qpay_cb_ip:' + clientIp(req), 60, 600))) return res.status(429).json({ ok: false });
      let email = String(req.query.email || '');
      try { email = decodeURIComponent(email); } catch (e) {}
      email = email.trim().toLowerCase();
      if (!email) { console.warn('[QPay callback] No email in query string'); return res.json({ ok: true }); }
      if (!(await rateLimit('qpay_cb_email:' + email.slice(0, 254), 10, 600))) return res.status(429).json({ ok: false });
      try {
        await ensureWsExtra();
        const pend = await pool.query(
          `SELECT invoice_id, email, months, promo, amount, grade, granted FROM ws_pending
            WHERE email=$1 AND granted=FALSE AND created_at > NOW() - INTERVAL '3 days'
            ORDER BY created_at DESC LIMIT 10`, [email]);
        for (const row of pend.rows) {
          try {
            if (await qpayInvoicePaid(row.invoice_id, row.amount)) {
              const s = await settleWsOnce(row);
              if (!s.already) console.log('[QPay callback] ws granted:', row.email, row.grade || 'бүх анги', row.months + 'сар');
            }
          } catch (e) { console.error('[QPay callback ws row]', e.message); }
        }
      } catch (err) { console.error('[QPay callback ws]', err.message); }
      try {
        await ensurePayPending();
        const pend = await pool.query(
          `SELECT invoice_id, email, plan, months, amount, event_id, granted, promo_code FROM pay_pending
            WHERE email=$1 AND granted=FALSE AND created_at > NOW() - INTERVAL '3 days'
            ORDER BY created_at DESC LIMIT 10`, [email]);
        for (const row of pend.rows) {
          try {
            if (await qpayInvoicePaid(row.invoice_id, row.amount)) {
              const s = await settlePay(row);
              if (s.granted) console.log('[QPay callback] granted:', row.email, row.plan, s.out.expiry || '', s.out.promo_code ? 'promo' : '');
            }
          } catch (e) { console.error('[QPay callback pay row]', e.message); }
        }
      } catch (err) { console.error('[QPay callback pay]', err.message); }
      return res.json({ ok: true });
    }

    // Ажлын хуудсын үнийн жагсаалт (нээлттэй)
    if (req.query.action === 'wsprices') {
      return res.json({ ok: true, prices: WS_PRICES, months: WS_MONTHS,
        grade_prices: wsGradePrices(), grade_months: WS_GRADE_MONTHS,
        grade_per_month: WS_GRADE_PER_MONTH, grades: WG.allGrades() });
    }

    // Азтаны хүрд — нүднүүдийн шошго (клиент ижил дарааллаар зурна)
    if (req.query.action === 'wheel_info') {
      return res.json({ ok: true, segments: WHEEL.map(w => ({ label: w.label, type: w.type })) });
    }
    // Азтаны хүрд эргүүлэх — нэг имэйл нэг удаа
    if (req.query.action === 'wheel_spin') {
      // Заавал бүртгэлтэй нэвтэрсэн байх ёстой — имэйлийг токеноос авна (клиентээс биш)
      const email = emailFromToken((req.body || {}).token);
      if (!email) return res.status(401).json({ ok: false, error: 'Эхлээд бүртгүүлж нэвтэрнэ үү' });
      let registered = false;
      try { const rr = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]); registered = rr.rows.length && rr.rows[0].verified === true; } catch (e) {}
      if (!registered) return res.status(403).json({ ok: false, error: 'Эхлээд бүртгэл үүсгэнэ үү' });
      await ensureWheel();
      const prev = await pool.query('SELECT prize, code FROM ws_wheel WHERE email=$1', [email]);
      if (prev.rows.length) return res.json({ ok: true, already: true, prize: { label: prev.rows[0].prize, code: prev.rows[0].code } });
      const idx = wheelPick();
      const seg = WHEEL[idx];
      // "Нууц" нүд бол доторх шагналыг тодорхойлно
      let reward = seg, mystery = false;
      if (seg.type === 'mystery') { reward = MYSTERY[pickFrom(MYSTERY)]; mystery = true; }
      let applied = { code: null, detail: '' };
      try { applied = await applyReward(email, reward); } catch (e) { console.error('[wheel]', e.message); }
      await pool.query('INSERT INTO ws_wheel (email, prize, code) VALUES ($1,$2,$3) ON CONFLICT (email) DO NOTHING',
        [email, (mystery ? 'Нууц → ' : '') + reward.label, applied.code]);
      return res.json({ ok: true, index: idx, mystery: mystery,
        prize: { label: reward.label, type: reward.type, pct: reward.pct || 0, code: applied.code, detail: applied.detail } });
    }

    // Ажлын хуудсын урамшууллын кодыг шалгах (сонгосон сарын үнэ буцаана)
    if (req.query.action === 'promocheck') {
      const code = (req.body && req.body.promo) || '';
      const months = wsNormMonths((req.body && req.body.months) || 3);
      const pi = await resolvePromo(code);
      return res.json({ ok: true, valid: pi.valid, pct: pi.pct, months: months,
        base: wsBasePrice(months), price: priceFromPct(pi.pct, months), prices: WS_PRICES });
    }

    // ── Нээлттэй: идэвхтэй промо кодуудын жагсаалт (/promo хуудсанд) ──
    if (req.query.action === 'ws_promo_public') {
      await ensureWsExtra();
      const r = await pool.query(
        `SELECT code, pct, max_uses, used_count, expires_at, note, months, fake_uses, welcome FROM ws_promos
         WHERE active = TRUE
           AND COALESCE(personal, FALSE) = FALSE
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (max_uses IS NULL OR used_count < max_uses)
         ORDER BY (expires_at IS NULL), expires_at ASC
         LIMIT 100`);
      return res.json({ ok: true, promos: r.rows });
    }

    // ── Referral: найзын код шалгах (нээлттэй) ──
    if (req.query.action === 'ws_refcheck') {
      await ensureWsExtra();
      const owner = await refOwner((req.body || {}).ref);
      const self = (req.body || {}).email ? String((req.body).email).trim().toLowerCase() : null;
      const valid = !!owner && owner !== self;
      return res.json({ ok: true, valid, pct: valid ? REF_PCT : 0 });
    }
    // ── Referral: миний урих код + статистик (ws токен) ──
    if (req.query.action === 'ws_ref') {
      await ensureWsExtra();
      const email = emailFromToken((req.body || {}).token);
      if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
      const code = await getOrCreateRefCode(email);
      if (!code) return res.json({ ok: false, error: 'Бүртгэл олдсонгүй' });
      const s = await pool.query('SELECT COUNT(*)::int AS n FROM ws_referrals WHERE referrer_email=$1', [email]);
      const cnt = s.rows[0].n, months = Math.floor(cnt / REF_PAIR);
      return res.json({ ok: true, code, link: 'https://cyber-math.com/worksheets?ref=' + code,
        count: cnt, months, days: months * REF_PAIR_DAYS,
        refeePct: REF_PCT, perReward: REF_PAIR, rewardDays: REF_PAIR_DAYS,
        toNext: REF_PAIR - (cnt % REF_PAIR) });
    }

    // ── АДМИН: ажлын хуудсын промо код удирдах + борлуулалт харах ──
    if (['ws_promo_create','ws_promo_list','ws_promo_update','ws_purchases_list','ws_users_list','ws_grade_users','ws_grant','ws_revoke','ws_reconcile','ws_broadcast'].indexOf(req.query.action) >= 0) {
      if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      await ensureWsExtra();
      await ensureWsTable();
      const b = req.body || {};
      // Төлбөр тулгах — хадгалсан нэхэмжлэхүүдийг QPay-тэй тулгаж, төлсөн атлаа олгогдоогүйг нөхөж олгоно
      if (req.query.action === 'ws_reconcile') {
        const pend = await pool.query('SELECT invoice_id, email, months, promo, amount, grade, granted FROM ws_pending WHERE granted=FALSE ORDER BY created_at DESC LIMIT 200');
        let checked = 0, granted = [];
        for (const row of pend.rows) {
          checked++;
          try {
            if (await qpayInvoicePaid(row.invoice_id, row.amount)) {
              const s = await settleWsOnce(row);        // callback-тай зэрэгцвэл давхар олгохгүй
              if (s.already) continue;
              granted.push(row.grade ? { email: row.email, plan: 'wsgrade', grade: row.grade, months: row.months, amount: row.amount }
                                     : { email: row.email, plan: 'wsmonths', months: row.months, amount: row.amount });
            }
          } catch (e) { /* тухайн нэхэмжлэхийг алгасна */ }
        }
        // Premium / friends / event — сүүлийн 30 хоногийн олгогдоогүй нэхэмжлэхүүд
        await ensurePayPending();
        const ppend = await pool.query(
          `SELECT invoice_id, email, plan, months, amount, event_id, granted, promo_code FROM pay_pending
            WHERE granted=FALSE AND created_at > NOW() - INTERVAL '30 days'
            ORDER BY created_at DESC LIMIT 200`);
        for (const row of ppend.rows) {
          checked++;
          try {
            if (await qpayInvoicePaid(row.invoice_id, row.amount)) {
              const s = await settlePay(row);           // claim нэг удаа — давхар олгохгүй
              if (!s.granted) continue;
              const g = { email: row.email, plan: row.plan, months: row.months, amount: row.amount };
              if (row.plan === 'event') g.event_id = row.event_id;
              granted.push(g);
            }
          } catch (e) { console.error('[reconcile pay row]', row.invoice_id, e.message); }
        }
        return res.json({ ok: true, checked: checked, granted_count: granted.length, granted: granted });
      }
      // Админ шууд эрх олгох (хугацаагаар)
      if (req.query.action === 'ws_grant') {
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Зөв имэйл оруулна уу' });
        // grade өгвөл зөвхөн тэр ангид олгоно
        const gr = String(b.grade || '').trim();
        if (gr) {
          if (!wsGradeOk(gr)) return res.status(400).json({ ok: false, error: 'Анги буруу байна' });
          const gm = wsGradeMonths(b.months);
          const gexp = await WG.grantGradeMonths(email, gr, gm);
          return res.json({ ok: true, email: email, grade: gr, months: gm, expires_at: gexp.toISOString() });
        }
        const months = wsNormMonths(b.months);
        const exp = await grantWsMonths(email, months);
        return res.json({ ok: true, email: email, months: months, expires_at: exp.toISOString() });
      }
      // Админ эрх цуцлах
      if (req.query.action === 'ws_revoke') {
        const email = String(b.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ ok: false, error: 'email дутуу' });
        const gr = String(b.grade || '').trim();
        if (gr) { await WG.revokeGrade(email, gr); return res.json({ ok: true, revoked: email, grade: gr }); }
        await pool.query('DELETE FROM ws_access WHERE lower(email)=$1', [email]);
        return res.json({ ok: true, revoked: email });
      }
      // Ангиар эрхтэй хэрэглэгчид
      if (req.query.action === 'ws_grade_users') {
        await WG.ensureGradeTable();
        const r = await pool.query(
          `SELECT a.email, a.grade, a.expires_at, a.updated_at, (a.expires_at > NOW()) AS active,
                  COALESCE(p.cnt,0)::int AS paid_count, COALESCE(p.total,0)::int AS paid_sum
             FROM ws_grade_access a
             LEFT JOIN (SELECT lower(email) AS em, grade, COUNT(*) AS cnt, SUM(amount) AS total
                          FROM ws_purchases WHERE grade IS NOT NULL GROUP BY lower(email), grade) p
                    ON p.em = lower(a.email) AND p.grade = a.grade
            ORDER BY a.updated_at DESC LIMIT 1000`);
        const act = await pool.query('SELECT COUNT(*)::int n FROM ws_grade_access WHERE expires_at > NOW()');
        // Ангиар хураангуй: худалдан авалт/орлого (ws_purchases) + идэвхтэй эрх (ws_grade_access)
        const sales = await pool.query(
          `SELECT grade, COUNT(*)::int AS sales, COALESCE(SUM(amount),0)::int AS revenue
             FROM ws_purchases WHERE grade IS NOT NULL GROUP BY grade`);
        const actBy = await pool.query(
          `SELECT grade, COUNT(*)::int AS active FROM ws_grade_access WHERE expires_at > NOW() GROUP BY grade`);
        const map = {};
        sales.rows.forEach(function (x) { map[x.grade] = { grade: x.grade, sales: x.sales, revenue: x.revenue, active: 0 }; });
        actBy.rows.forEach(function (x) {
          (map[x.grade] = map[x.grade] || { grade: x.grade, sales: 0, revenue: 0, active: 0 }).active = x.active;
        });
        const byGrade = Object.keys(map).map(function (k) { return map[k]; })
          .sort(function (a, b) { return (parseInt(a.grade, 10) || 0) - (parseInt(b.grade, 10) || 0); });
        // Сүүлийн 30 хоногийн төлөгдөөгүй (олгогдоогүй) ангийн нэхэмжлэх
        const pend = await pool.query(
          `SELECT email, grade, months, amount, promo, created_at FROM ws_pending
            WHERE grade IS NOT NULL AND granted = FALSE AND created_at > NOW() - INTERVAL '30 days'
            ORDER BY created_at DESC LIMIT 100`);
        return res.json({ ok: true, rows: r.rows, total: r.rows.length, active: act.rows[0].n,
          by_grade: byGrade, pending: pend.rows });
      }
      // Эрхтэй хэрэглэгчид (ws_access) — бүртгэл админд харагдана
      if (req.query.action === 'ws_users_list') {
        const r = await pool.query(
          `SELECT email, expires_at, updated_at, (expires_at > NOW()) AS active
           FROM ws_access ORDER BY updated_at DESC LIMIT 1000`);
        const act = await pool.query('SELECT COUNT(*)::int n FROM ws_access WHERE expires_at > NOW()');
        return res.json({ ok: true, users: r.rows, total: r.rows.length, active: act.rows[0].n });
      }
      if (req.query.action === 'ws_promo_list') {
        await pool.query(`CREATE TABLE IF NOT EXISTS ws_wheel (email TEXT PRIMARY KEY, prize TEXT, code TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`).catch(()=>{});
        const r = await pool.query(`SELECT p.code,p.pct,p.max_uses,p.used_count,p.expires_at,p.active,p.note,p.months,p.fake_uses,p.welcome,p.personal,p.created_at, w.email AS won_by
          FROM ws_promos p LEFT JOIN ws_wheel w ON w.code=p.code ORDER BY p.created_at DESC`);
        return res.json({ ok: true, promos: r.rows });
      }
      if (req.query.action === 'ws_promo_create') {
        let code = (b.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (!code) { // авто код үүсгэх
          const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          code = 'WS'; for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
        }
        const pct = Math.max(1, Math.min(100, parseInt(b.pct, 10) || 20));
        const maxUses = (b.max_uses === '' || b.max_uses == null) ? null : Math.max(1, parseInt(b.max_uses, 10));
        const expires = b.expires_at ? new Date(b.expires_at).toISOString() : null;
        const note = b.note ? String(b.note).slice(0, 200) : null;
        const mo = [3,6,9,12].indexOf(parseInt(b.months,10)) >= 0 ? parseInt(b.months,10) : null;
        const fake = (b.fake_uses == null || String(b.fake_uses).trim() === '') ? null : String(b.fake_uses).slice(0, 20);
        const welcome = b.welcome === true || b.welcome === 'true';
        if (welcome) await pool.query('UPDATE ws_promos SET welcome=FALSE WHERE welcome=TRUE').catch(()=>{});
        try {
          await pool.query(
            `INSERT INTO ws_promos (code,pct,max_uses,expires_at,note,months,fake_uses,welcome) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [code, pct, maxUses, expires, note, mo, fake, welcome]);
        } catch (e) {
          if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Ийм код аль хэдийн байна' });
          throw e;
        }
        return res.json({ ok: true, code: code, pct: pct });
      }
      if (req.query.action === 'ws_promo_update') {
        const code = (b.code || '').trim().toUpperCase();
        if (!code) return res.status(400).json({ ok: false, error: 'code дутуу' });
        if (b.remove) { await pool.query('DELETE FROM ws_promos WHERE code=$1', [code]); return res.json({ ok: true, removed: true }); }
        if (typeof b.active === 'boolean') { await pool.query('UPDATE ws_promos SET active=$2 WHERE code=$1', [code, b.active]); }
        if (typeof b.fake_uses !== 'undefined') {
          const fv = (b.fake_uses === null || String(b.fake_uses).trim() === '') ? null : String(b.fake_uses).slice(0, 20);
          await pool.query('UPDATE ws_promos SET fake_uses=$2 WHERE code=$1', [code, fv]);
        }
        if (typeof b.welcome === 'boolean') {
          if (b.welcome) await pool.query('UPDATE ws_promos SET welcome=FALSE WHERE welcome=TRUE AND code<>$1', [code]);
          await pool.query('UPDATE ws_promos SET welcome=$2 WHERE code=$1', [code, b.welcome]);
        }
        // ── Засвар: хөнгөлөлт, ашиглалтын тоо, багц, тэмдэглэл, хугацаа ──
        if (typeof b.pct !== 'undefined' && String(b.pct).trim() !== '') {
          const pct = Math.max(1, Math.min(100, parseInt(b.pct, 10) || 20));
          await pool.query('UPDATE ws_promos SET pct=$2 WHERE code=$1', [code, pct]);
        }
        if (typeof b.max_uses !== 'undefined') {
          const mu = (b.max_uses === '' || b.max_uses === null) ? null : Math.max(1, parseInt(b.max_uses, 10));
          await pool.query('UPDATE ws_promos SET max_uses=$2 WHERE code=$1', [code, mu]);
        }
        if (typeof b.months !== 'undefined') {
          const mo = [3, 6, 9, 12].indexOf(parseInt(b.months, 10)) >= 0 ? parseInt(b.months, 10) : null;
          await pool.query('UPDATE ws_promos SET months=$2 WHERE code=$1', [code, mo]);
        }
        if (typeof b.note !== 'undefined') {
          const nt = b.note ? String(b.note).slice(0, 200) : null;
          await pool.query('UPDATE ws_promos SET note=$2 WHERE code=$1', [code, nt]);
        }
        if (b.expires_at) {
          await pool.query('UPDATE ws_promos SET expires_at=$2 WHERE code=$1', [code, new Date(b.expires_at).toISOString()]);
        }
        if (b.clear_expiry) {
          await pool.query('UPDATE ws_promos SET expires_at=NULL WHERE code=$1', [code]);
        }
        if (b.extend_days) {
          const d = parseInt(b.extend_days, 10);
          if (d) await pool.query(`UPDATE ws_promos SET expires_at = GREATEST(COALESCE(expires_at, NOW()), NOW()) + ($2 || ' days')::interval WHERE code=$1`, [code, d]);
        }
        return res.json({ ok: true });
      }
      if (req.query.action === 'ws_purchases_list') {
        const r = await pool.query('SELECT id,email,amount,promo,months,invoice_id,created_at,grade FROM ws_purchases ORDER BY created_at DESC LIMIT 500');
        const tot = await pool.query(
          `SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::int AS sum,
                  COUNT(*) FILTER (WHERE grade IS NULL)::int AS n_all,
                  COALESCE(SUM(amount) FILTER (WHERE grade IS NULL),0)::int AS sum_all,
                  COUNT(*) FILTER (WHERE grade IS NOT NULL)::int AS n_grade,
                  COALESCE(SUM(amount) FILTER (WHERE grade IS NOT NULL),0)::int AS sum_grade
             FROM ws_purchases`);
        const t = tot.rows[0];
        return res.json({ ok: true, purchases: r.rows, count: t.n, total: t.sum,
          count_all: t.n_all, total_all: t.sum_all, count_grade: t.n_grade, total_grade: t.sum_grade });
      }
      // Худалдаж аваагүй (идэвхтэй эрхгүй) бүртгэлтэй хэрэглэгчид рүү промо имэйл — багц-багцаар
      if (req.query.action === 'ws_broadcast') {
        const { sendPromoEmail } = require('./_email');
        await pool.query(`CREATE TABLE IF NOT EXISTS ws_broadcast_sent (email TEXT NOT NULL, campaign TEXT NOT NULL, sent_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(email,campaign))`).catch(()=>{});
        if (b.test === true) {
          const to = (b.email && /.+@.+\..+/.test(String(b.email))) ? String(b.email).trim().toLowerCase() : 'cybermath424@gmail.com';
          const r = await sendPromoEmail(to);
          return res.json({ ok: !!(r && r.ok), test: true, to, error: r && r.error });
        }
        const campaign = String(b.campaign || 'promo').slice(0, 60);
        const batch = Math.min(25, Math.max(1, parseInt(b.batch, 10) || 18));
        const audSql = `SELECT DISTINCT LOWER(l.email) AS email, MIN(l.name) AS name FROM ws_login l
          WHERE l.verified = TRUE
            AND NOT EXISTS (SELECT 1 FROM ws_access a WHERE LOWER(a.email)=LOWER(l.email) AND a.expires_at > NOW())
            AND NOT EXISTS (SELECT 1 FROM ws_broadcast_sent s WHERE s.email=LOWER(l.email) AND s.campaign=$1)
          GROUP BY LOWER(l.email)`;
        const leftRes = await pool.query(`SELECT COUNT(*)::int AS n FROM (${audSql}) x`, [campaign]);
        const totalLeft = leftRes.rows[0].n;
        const aud = await pool.query(audSql + ' LIMIT $2', [campaign, batch]);
        let sent = 0, failed = 0;
        for (const row of aud.rows) {
          const r = await sendPromoEmail(row.email, row.name || '');
          if (r && r.ok) { sent++; await pool.query('INSERT INTO ws_broadcast_sent (email,campaign) VALUES ($1,$2) ON CONFLICT DO NOTHING', [row.email, campaign]); }
          else failed++;
          await new Promise(rs => setTimeout(rs, 300));
        }
        return res.json({ ok: true, sent, failed, remaining: Math.max(0, totalLeft - sent), totalLeft });
      }
    }

    // Ажлын хуудсын эрх шалгах / сэргээх
    if (req.query.action === 'wsstatus') {
      const enabled = process.env.WS_PAYWALL !== 'off';   // серверийн kill-switch
      if (!enabled) return res.json({ ok: true, enabled: false, active: true });
      await ensureWsTable();
      const b = req.body || {};
      // Имэйлийг найдвартай токеноос (эсвэл сэргээхэд имэйлээр) авах
      let email = null;
      if (b.wstoken) email = emailFromToken(b.wstoken);
      if (!email && b.token) email = emailFromToken(b.token);
      const byEmail = !email && b.email ? String(b.email).trim().toLowerCase() : null;
      if (byEmail) email = byEmail;
      // Энэ хуудас ямар ангид харьяалагдахыг тодорхойлно (нэгээс олон байж болно)
      const slug = String(b.slug || '').trim().toLowerCase();
      let slugGrades = [], offerGrade = null;
      if (slug) {
        try {
          slugGrades = await WG.gradesForSlug(slug);
          const buyable = WG.allGrades();
          offerGrade = slugGrades.filter(function (g) { return buyable.indexOf(g) >= 0; })[0] || null;
        } catch (e) { console.error('[wsstatus grade]', e.message); }
      }
      const gradePrices = { grade: offerGrade, grade_prices: wsGradePrices(),
        grade_months: WS_GRADE_MONTHS, grade_per_month: WS_GRADE_PER_MONTH,
        prices: WS_PRICES, months: WS_MONTHS };

      if (!email) return res.json(Object.assign({ ok: true, enabled: true, active: false, scope: null, grades: [] }, gradePrices));

      const r = await pool.query('SELECT expires_at FROM ws_access WHERE email=$1 AND expires_at > NOW()', [email]);
      const allActive = r.rows.length > 0;

      let owned = [];
      try { owned = await WG.activeGrades(email); } catch (e) { console.error('[wsstatus owned]', e.message); }
      const ownedNames = owned.map(function (x) { return x.grade; });
      const gradeHit = slugGrades.filter(function (g) { return ownedNames.indexOf(g) >= 0; })[0] || null;

      const active = allActive || !!gradeHit;
      return res.json(Object.assign({
        ok: true, enabled: true, active: active,
        scope: allActive ? 'all' : (gradeHit ? 'grade' : null),
        email: active ? email : null,
        expires_at: allActive ? r.rows[0].expires_at : (gradeHit ? (owned.filter(function (x) { return x.grade === gradeHit; })[0] || {}).expires_at : null),
        grades: owned,
        ws_token: active ? wsToken(email) : null }, gradePrices));
    }

    res.status(405).end();
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
