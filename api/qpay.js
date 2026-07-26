const pool = require('./_db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';
const WS_YEAR_PRICE = 39900;   // ажлын хуудсын бүтэн жилийн эрх
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
async function grantWsYear(email) {
  await ensureWsTable();
  const exp = new Date(); exp.setDate(exp.getDate() + 365);
  await pool.query(
    `INSERT INTO ws_access (email, expires_at, updated_at) VALUES ($1,$2,NOW())
     ON CONFLICT (email) DO UPDATE SET expires_at=GREATEST(ws_access.expires_at, EXCLUDED.expires_at), updated_at=NOW()`,
    [email, exp.toISOString()]
  );
  return exp;
}
function wsToken(email) { return jwt.sign({ email: email, ws: true }, JWT_SECRET, { expiresIn: '400d' }); }
function emailFromToken(tok) { try { var d = jwt.verify(tok, JWT_SECRET); return d && d.email ? String(d.email).toLowerCase() : null; } catch (e) { return null; } }
function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  try { const d = jwt.verify(auth.slice(7), JWT_SECRET); return !!(d && d.admin); } catch (e) { return false; }
}

// ── Ажлын хуудсын промо код + борлуулалтын бүртгэл (DB) ──
let wsExtraReady = false;
async function ensureWsExtra() {
  if (wsExtraReady) return;
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
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_purchases (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    amount INT NOT NULL,
    promo TEXT,
    invoice_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  wsExtraReady = true;
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
function priceFromPct(pct) { return pct > 0 ? Math.round(WS_YEAR_PRICE * (100 - pct) / 100) : WS_YEAR_PRICE; }
async function recordPurchase(email, amount, promo, invoiceId) {
  await ensureWsExtra();
  const r = await pool.query(
    `INSERT INTO ws_purchases (email, amount, promo, invoice_id) VALUES ($1,$2,$3,$4)
     ON CONFLICT (invoice_id) DO NOTHING RETURNING id`,
    [email, amount, promo || null, invoiceId || null]);
  return r.rows.length > 0;
}

const QPAY_URL = 'https://merchant.qpay.mn/v2';
const USERNAME = 'BYAMBADORJ';
const PASSWORD = 'UWDUnhyP';
const INVOICE_CODE = 'BYAMBADORJ_INVOICE';

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
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Random код үүсгэх — давхардвал дахин оролдоно
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 5; attempt++) {
    let code = 'FR';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
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
  qpayToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
  return qpayToken;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Invoice үүсгэх
    if (req.method === 'POST' && req.query.action === 'create') {
      const { email, amount, plan } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      // Email-ыг богиносгож аюулгүй болгох — QPay-н sender_invoice_no/customer_code 45 тэмдэгт хязгаартай
      const crypto = require('crypto');
      const emailHash = crypto.createHash('md5').update(email).digest('hex').slice(0, 12); // 12 тэмдэгт
      const senderNo = `CM${emailHash}${Date.now()}`; // CM + 12 + 13 = 27 тэмдэгт
      const receiverCode = `cm_${emailHash}`; // 15 тэмдэгт, зөвхөн ASCII

      const planParam = plan ? `&plan=${encodeURIComponent(plan)}` : '';
      const desc = plan === 'friends' ? 'CyberMath Найзууд багц (3 хүн)'
                 : plan === 'yearly'  ? 'CyberMath Premium 1 жил'
                 : plan === 'wsyear'  ? 'CyberMath Ажлын хуудас — 1 жил'
                 : 'CyberMath Premium';

      // Ажлын хуудсын үнэ — серверийн талд эрх мэдэлтэй тооцно (промо код бол хямдруулна)
      let invAmount = amount || 9900;
      if (plan === 'wsyear') {
        const pi = await resolvePromo((req.body || {}).promo);
        invAmount = priceFromPct(pi.pct);
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
          callback_url: `https://cybermath.vercel.app/api/qpay?action=callback&email=${encodeURIComponent(email)}${planParam}`
        })
      });
      const invoice = await invoiceResp.json();
      return res.json({ ok: true, invoice });
    }

    // Төлбөр шалгах
    if (req.method === 'POST' && req.query.action === 'check') {
      const { invoice_id, email, plan } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });
      const token = await getToken();
      const checkResp = await fetch(`${QPAY_URL}/payment/check`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ object_type: 'INVOICE', object_id: invoice_id })
      });
      const result = await checkResp.json();
      if (result.count > 0) {
        // Ажлын хуудсын жилийн эрх — тусдаа ws_access-д олгоно
        if (plan === 'wsyear') {
          const wexp = await grantWsYear(email);
          // Борлуулалтын бүртгэл + промо ашиглалт (invoice_id-ээр давхардуулахгүй)
          try {
            const promo = ((req.body || {}).promo || '').trim().toUpperCase() || null;
            const pi = promo ? await resolvePromo(promo) : { pct: 0 };
            const inserted = await recordPurchase(email, priceFromPct(pi.pct), promo, invoice_id);
            if (inserted && promo) {
              await pool.query('UPDATE ws_promos SET used_count=used_count+1 WHERE code=$1', [promo]).catch(()=>{});
            }
          } catch (e) { console.error('[ws purchase]', e.message); }
          return res.json({ ok: true, paid: true, expiry: wexp.toISOString(), ws_token: wsToken(email) });
        }
        // Төлбөр амжилттай — plan-ээс хамаарч хэрэгжүүлэх
        const months = plan === 'yearly' ? 12 : 1;
        const days = months * 30;
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + days);
        await pool.query(
          `UPDATE users SET plan='premium', premium_expiry=$2 WHERE email=$1`,
          [email, expiry.toISOString()]
        );

        // Найзууд багц — захиалагчид зориулсан promo код үүсгэх (2 найз × 30 хоног)
        if (plan === 'friends') {
          try {
            const code = await createFriendsPromo(email);
            return res.json({ ok: true, paid: true, expiry: expiry.toISOString(), promo_code: code, promo_uses: 2 });
          } catch(err) {
            console.error('[QPay friends promo]', err.message);
            return res.json({ ok: true, paid: true, expiry: expiry.toISOString(), promo_error: err.message });
          }
        }
        return res.json({ ok: true, paid: true, expiry: expiry.toISOString() });
      }
      return res.json({ ok: true, paid: false });
    }

    // Callback — QPay-аас амжилттай төлсний дараа автомат ирнэ
    if ((req.method === 'POST' || req.method === 'GET') && req.query.action === 'callback') {
      const email = req.query.email ? decodeURIComponent(req.query.email) : null;
      const plan = req.query.plan ? decodeURIComponent(req.query.plan) : null;

      if (email && plan === 'wsyear') {
        try { await grantWsYear(email); console.log('[QPay callback] ws-year granted:', email); }
        catch(err){ console.error('[QPay callback ws]', err.message); }
        return res.json({ ok: true });
      }
      if (email) {
        try {
          const months = plan === 'yearly' ? 12 : 1;
          const days = months * 30;
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + days);
          await pool.query(
            `UPDATE users SET plan='premium', premium_expiry=$2 WHERE email=$1`,
            [email, expiry.toISOString()]
          );
          if (plan === 'friends') {
            try {
              const code = await createFriendsPromo(email);
              console.log('[QPay callback] friends pack — promo code:', code, 'for', email);
            } catch(e) {
              console.error('[QPay callback] friends promo failed:', e.message);
            }
          }
          console.log('[QPay callback] Premium granted to:', email, 'plan:', plan, 'expires:', expiry.toISOString());
        } catch(err) {
          console.error('[QPay callback] DB update failed:', err.message);
        }
      } else {
        console.warn('[QPay callback] No email in query string');
      }
      return res.json({ ok: true });
    }

    // Ажлын хуудсын урамшууллын кодыг шалгах (үнэ буцаана)
    if (req.query.action === 'promocheck') {
      const code = (req.body && req.body.promo) || '';
      const pi = await resolvePromo(code);
      return res.json({ ok: true, valid: pi.valid, pct: pi.pct,
        base: WS_YEAR_PRICE, price: priceFromPct(pi.pct) });
    }

    // ── АДМИН: ажлын хуудсын промо код удирдах + борлуулалт харах ──
    if (['ws_promo_create','ws_promo_list','ws_promo_update','ws_purchases_list','ws_users_list'].indexOf(req.query.action) >= 0) {
      if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      await ensureWsExtra();
      await ensureWsTable();
      const b = req.body || {};
      // Эрхтэй хэрэглэгчид (ws_access) — бүртгэл админд харагдана
      if (req.query.action === 'ws_users_list') {
        const r = await pool.query(
          `SELECT email, expires_at, updated_at, (expires_at > NOW()) AS active
           FROM ws_access ORDER BY updated_at DESC LIMIT 1000`);
        const act = await pool.query('SELECT COUNT(*)::int n FROM ws_access WHERE expires_at > NOW()');
        return res.json({ ok: true, users: r.rows, total: r.rows.length, active: act.rows[0].n });
      }
      if (req.query.action === 'ws_promo_list') {
        const r = await pool.query('SELECT code,pct,max_uses,used_count,expires_at,active,note,created_at FROM ws_promos ORDER BY created_at DESC');
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
        try {
          await pool.query(
            `INSERT INTO ws_promos (code,pct,max_uses,expires_at,note) VALUES ($1,$2,$3,$4,$5)`,
            [code, pct, maxUses, expires, note]);
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
        return res.json({ ok: true });
      }
      if (req.query.action === 'ws_purchases_list') {
        const r = await pool.query('SELECT id,email,amount,promo,invoice_id,created_at FROM ws_purchases ORDER BY created_at DESC LIMIT 500');
        const tot = await pool.query('SELECT COUNT(*)::int AS n, COALESCE(SUM(amount),0)::int AS sum FROM ws_purchases');
        return res.json({ ok: true, purchases: r.rows, count: tot.rows[0].n, total: tot.rows[0].sum });
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
      if (!email) return res.json({ ok: true, enabled: true, active: false });
      const r = await pool.query('SELECT expires_at FROM ws_access WHERE email=$1 AND expires_at > NOW()', [email]);
      const active = r.rows.length > 0;
      return res.json({ ok: true, enabled: true, active: active, email: active ? email : null,
        expires_at: active ? r.rows[0].expires_at : null,
        ws_token: active ? wsToken(email) : null });
    }

    res.status(405).end();
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
