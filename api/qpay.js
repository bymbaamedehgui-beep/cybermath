const pool = require('./_db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';
const WS_YEAR_PRICE = 39900;   // ажлын хуудсын бүтэн жилийн эрх

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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
          amount: amount || 9900,
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
