const pool = require('./_db');

const QPAY_URL = 'https://merchant.qpay.mn/v2';
const USERNAME = 'BYAMBADORJ';
const PASSWORD = 'UWDUnhyP';
const INVOICE_CODE = 'BYAMBADORJ_INVOICE';

let qpayToken = null;
let tokenExpiry = 0;

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
          invoice_description: 'CyberMath Premium',
          amount: amount || 9900,
          callback_url: `https://cybermath.vercel.app/api/qpay?action=callback&email=${encodeURIComponent(email)}`
        })
      });
      const invoice = await invoiceResp.json();
      return res.json({ ok: true, invoice });
    }

    // Төлбөр шалгах
    if (req.method === 'POST' && req.query.action === 'check') {
      const { invoice_id, email } = req.body || {};
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
        // Төлбөр амжилттай — premium болгох (30 хоногийн хугацаатай)
        const expiry = new Date();
        expiry.setDate(expiry.getDate() + 30);
        await pool.query(
          `UPDATE users SET plan='premium', premium_expiry=$2 WHERE email=$1`,
          [email, expiry.toISOString()]
        );
        return res.json({ ok: true, paid: true, expiry: expiry.toISOString() });
      }
      return res.json({ ok: true, paid: false });
    }

    // Callback — QPay-аас амжилттай төлсний дараа автомат ирнэ
    if ((req.method === 'POST' || req.method === 'GET') && req.query.action === 'callback') {
      // Email-ыг query string-ээс унших (create үед callback URL-д email бичсэн)
      const email = req.query.email ? decodeURIComponent(req.query.email) : null;
      const invoiceId = (req.body && req.body.payment_id) || (req.body && req.body.object_id) || req.query.payment_id;

      if (email) {
        try {
          // Premium-ийг 30 хоногоор олгох
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + 30);
          await pool.query(
            `UPDATE users SET plan='premium', premium_expiry=$2 WHERE email=$1`,
            [email, expiry.toISOString()]
          );
          console.log('[QPay callback] Premium granted to:', email, 'expires:', expiry.toISOString());
        } catch(err) {
          console.error('[QPay callback] DB update failed:', err.message);
        }
      } else {
        console.warn('[QPay callback] No email in query string');
      }
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
