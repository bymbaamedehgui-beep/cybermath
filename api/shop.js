// АЯЛАЛЫН ДЭЛГҮҮР — бараа + захиалга + хэрэглэгчийн API. Neon Postgres.
// Нийтэд: бараа жагсаах, захиалга илгээх. Хэрэглэгч: бүртгүүлэх/нэвтрэх (имэйл, Google).
// Админ: бараа/захиалга удирдах (нууц үг).
const pool = require('./_db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sendTelegram } = require('./_telegram');

const ADMIN_PASS = process.env.SHOP_ADMIN_PASS || 'travel2026';
const JWT_SECRET = process.env.SHOP_JWT_SECRET || 'nomad-gear-dev-secret-change-me';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const ORDER_STATUSES = ['new', 'contacted', 'paid', 'shipped', 'done', 'cancelled'];

function isAdmin(body) {
  return body && typeof body.pass === 'string' && body.pass === ADMIN_PASS;
}
const money = (v) => Math.max(0, Math.round(Number(v) || 0));
const cut = (v, n) => (v == null ? null : String(v).slice(0, n));

// ---- JWT туслахууд ----
function signToken(user) {
  return jwt.sign({ uid: user.id, email: user.email }, JWT_SECRET, { expiresIn: '60d' });
}
function userFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { return null; }
}
function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, phone: u.phone, picture: u.picture, address: u.address };
}

// ---- Google ID token-ийг Google-ийн tokeninfo-оор баталгаажуулна (key/library хэрэггүй) ----
async function verifyGoogle(idToken) {
  try {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken));
    if (!r.ok) return null;
    const p = await r.json();
    if (!p.email || p.email_verified === 'false' || p.email_verified === false) return null;
    if (p.iss !== 'https://accounts.google.com' && p.iss !== 'accounts.google.com') return null;
    if (GOOGLE_CLIENT_ID && p.aud !== GOOGLE_CLIENT_ID) return null;
    return p;
  } catch (e) { return null; }
}

// ---- QPay (урьдчилгаа төлбөр) ----
const QPAY_URL = 'https://merchant.qpay.mn/v2';
const QPAY_USER = process.env.QPAY_USERNAME || 'BYAMBADORJ';
const QPAY_PASS = process.env.QPAY_PASSWORD || 'UWDUnhyP';
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE || 'BYAMBADORJ_INVOICE';
const DEPOSIT_RATE = 0.10;
const SITE_URL = process.env.SITE_URL || 'https://nomad-gear-mn.vercel.app';
let qpayToken = null, qpayExp = 0;
async function qpayGetToken() {
  if (qpayToken && Date.now() < qpayExp) return qpayToken;
  const r = await fetch(`${QPAY_URL}/auth/token`, {
    method: 'POST',
    headers: { Authorization: 'Basic ' + Buffer.from(`${QPAY_USER}:${QPAY_PASS}`).toString('base64'), 'Content-Type': 'application/json' },
  });
  const d = await r.json();
  if (!d.access_token) throw new Error('QPay auth амжилтгүй');
  qpayToken = d.access_token;
  qpayExp = Date.now() + (d.expires_in || 3600) * 1000 - 60000;
  return qpayToken;
}
async function qpayCreateInvoice({ orderId, amount, desc }) {
  const token = await qpayGetToken();
  const r = await fetch(`${QPAY_URL}/invoice`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoice_code: QPAY_INVOICE_CODE,
      sender_invoice_no: `NG${orderId}_${Date.now().toString().slice(-8)}`,
      invoice_receiver_code: `ng_${orderId}`,
      invoice_description: desc,
      amount: amount,
      callback_url: `${SITE_URL}/api/shop?qaction=qpayCallback&order=${orderId}`,
    }),
  });
  return r.json();
}
async function qpayCheckPaid(invoiceId) {
  const token = await qpayGetToken();
  const r = await fetch(`${QPAY_URL}/payment/check`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_type: 'INVOICE', object_id: invoiceId }),
  });
  const d = await r.json();
  return (d.count || 0) > 0;
}

let seeded = false;
async function ensure() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_products (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      price INTEGER NOT NULL DEFAULT 0,
      old_price INTEGER,
      stock INTEGER NOT NULL DEFAULT 0,
      image TEXT,
      description TEXT,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_orders (
      id BIGSERIAL PRIMARY KEY,
      customer TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT,
      note TEXT,
      items JSONB NOT NULL,
      total INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'new',
      admin_note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shop_order_status ON shop_orders(status, created_at DESC)`).catch(()=>{});
  // Хугацаатай хямдрал + зарагдсан суурь тоо
  await pool.query(`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS sale_price INTEGER`).catch(()=>{});
  await pool.query(`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS sale_until TIMESTAMPTZ`).catch(()=>{});
  await pool.query(`ALTER TABLE shop_products ADD COLUMN IF NOT EXISTS sold_base INTEGER NOT NULL DEFAULT 0`).catch(()=>{});
  // Захиалгад хэрэглэгч + газрын зураг (geo) + урьдчилгаа төлбөр
  await pool.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS user_id BIGINT`).catch(()=>{});
  await pool.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS geo JSONB`).catch(()=>{});
  await pool.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS deposit INTEGER`).catch(()=>{});
  await pool.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS deposit_paid BOOLEAN NOT NULL DEFAULT FALSE`).catch(()=>{});
  await pool.query(`ALTER TABLE shop_orders ADD COLUMN IF NOT EXISTS qpay_invoice TEXT`).catch(()=>{});
  // Чат
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_chat (
      id BIGSERIAL PRIMARY KEY,
      thread TEXT NOT NULL,
      sender TEXT NOT NULL,
      name TEXT,
      text TEXT NOT NULL,
      seen_admin BOOLEAN NOT NULL DEFAULT FALSE,
      seen_user BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shop_chat_thread ON shop_chat(thread, id)`).catch(()=>{});
  // Сэтгэгдэл / үнэлгээ
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_reviews (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL,
      user_id BIGINT,
      name TEXT,
      rating INTEGER NOT NULL DEFAULT 5,
      text TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_shop_review_product ON shop_reviews(product_id, id DESC)`).catch(()=>{});
  // Хэрэглэгчид
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      pass_hash TEXT,
      name TEXT,
      phone TEXT,
      picture TEXT,
      address JSONB,
      provider TEXT NOT NULL DEFAULT 'email',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shop_messages (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      message TEXT NOT NULL,
      seen BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  if (seeded) return;
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM shop_products');
  if (c.rows[0].n === 0) {
    const demo = [
      ['Trekker 55L үүргэвч', 'Үүргэвч', 289000, 349000, 14, '🎒', 'Эргономик нуруувчтай, бороо нэвчдэггүй 55 литрийн уулын аяллын үүргэвч. Олон тасалгаатай, нийт жин 1.6кг.'],
      ['Day-pack 25L', 'Үүргэвч', 119000, null, 30, '🎒', 'Өдрийн аялалд тохирох хөнгөн үүргэвч, усны уутны системтэй.'],
      ['Alpine 2 майхан', 'Майхан', 459000, 539000, 9, '⛺', '2 хүний 3 улирлын давхар хальсан майхан. Салхи 60км/ц тэсвэрлэнэ, 2.3кг.'],
      ['Базовый кемпийн майхан 4х', 'Майхан', 389000, null, 7, '⛺', '4 хүний агуу зайтай, өндөр таазтай гэр бүлийн кемпийн майхан.'],
      ['Унтлагын уут -15°C', 'Унтлагын хэрэгсэл', 169000, 199000, 18, '🛌', 'Mummy загвар, нийлэг доош дүүргэгчтэй, хүйтэнд тэсвэртэй унтлагын уут.'],
      ['Хөөсөн дэвсгэр R-4.0', 'Унтлагын хэрэгсэл', 89000, null, 26, '🛏', 'Дулаан тусгаарлалт сайтай, агаараар хийлдэг авсаархан дэвсгэр.'],
      ['Trail GTX уулын гутал', 'Гутал', 329000, 399000, 16, '🥾', 'Gore-Tex мембрантай, Vibran улавчтай, ус нэвчдэггүй трекинг гутал.'],
      ['Softshell куртка', 'Хувцас', 239000, null, 20, '🧥', 'Салхи таслах, амьсгалдаг softshell куртка. Уул, хадны аялалд тохиромжтой.'],
      ['Хээрийн зуух + баллон', 'Гал тогоо', 98000, 125000, 22, '🔥', 'Титан хайлштай хөнгөн зуух, автомат гал асаагчтай. Баллон дагалдана.'],
      ['Титан таваг сав 4 ширхэг', 'Гал тогоо', 79000, null, 24, '🍳', 'Хөнгөн титан хоолны сав, аяга шанага бүхэлдээ багтана.'],
      ['Гар чийдэн 1200lm', 'Гэрэлтүүлэг', 69000, 89000, 28, '🔦', 'USB-C цэнэгтэй, 1200 люмен, усны хамгаалалттай толгойн чийдэн.'],
      ['Усны шүүлтүүр Squeeze', 'Дагалдах хэрэгсэл', 109000, null, 25, '💧', '0.1 микрон шүүлттэй, гол горхины усыг шууд уудаг хувийн шүүлтүүр.'],
      ['Карбон тулгуур саваа', 'Дагалдах хэрэгсэл', 79000, 99000, 30, '🥢', 'Хөнгөн карбон, гурван хэсэгтэй эвхэгддэг уулын тулгуур (хос).'],
      ['Термос 750мл', 'Дагалдах хэрэгсэл', 59000, null, 40, '🍶', '12 цаг дулаан, 18 цаг хүйтэн барих 2 ханатай ган термос.'],
    ];
    for (let i = 0; i < demo.length; i++) {
      const [name, category, price, old_price, stock, image, description] = demo[i];
      await pool.query(
        `INSERT INTO shop_products (name, category, price, old_price, stock, image, description, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [name, category, price, old_price, stock, image, description, i]
      );
    }
  }
  seeded = true;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensure();

    // QPay callback (GET/POST query-аар ирнэ) — урьдчилгаа төлсөн гэж тэмдэглэнэ
    if (req.query && req.query.qaction === 'qpayCallback') {
      const oid = Number(req.query.order);
      if (oid) {
        const o = await pool.query('SELECT qpay_invoice FROM shop_orders WHERE id=$1', [oid]);
        const inv = o.rows[0] && o.rows[0].qpay_invoice;
        if (inv && await qpayCheckPaid(inv).catch(()=>false)) {
          await pool.query(`UPDATE shop_orders SET deposit_paid=TRUE, status=CASE WHEN status='new' THEN 'paid' ELSE status END, updated_at=NOW() WHERE id=$1`, [oid]);
        }
      }
      return res.json({ ok: true });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false });
    const body = req.body || {};
    const action = body.action;

    // ---------- QPAY УРЬДЧИЛГАА (10%) ----------
    if (action === 'qpayCreate') {
      const oid = Number(body.orderId);
      const o = await pool.query('SELECT id,total,customer,deposit_paid FROM shop_orders WHERE id=$1', [oid]);
      if (!o.rows.length) return res.status(404).json({ ok: false, error: 'Захиалга олдсонгүй' });
      const order = o.rows[0];
      if (order.deposit_paid) return res.json({ ok: true, alreadyPaid: true });
      const deposit = Math.max(100, Math.round(order.total * DEPOSIT_RATE));
      let invoice;
      try {
        invoice = await qpayCreateInvoice({ orderId: oid, amount: deposit, desc: `NOMAD GEAR захиалга #${oid} урьдчилгаа (10%)` });
      } catch (e) { return res.status(502).json({ ok: false, error: 'QPay холболт амжилтгүй: ' + e.message }); }
      if (!invoice || !invoice.invoice_id) return res.status(502).json({ ok: false, error: invoice && invoice.message ? String(invoice.message) : 'QPay нэхэмжлэх үүсгэж чадсангүй' });
      await pool.query('UPDATE shop_orders SET deposit=$2, qpay_invoice=$3 WHERE id=$1', [oid, deposit, invoice.invoice_id]);
      return res.json({
        ok: true, deposit, invoice_id: invoice.invoice_id,
        qr_image: invoice.qr_image || null, qr_text: invoice.qr_text || null,
        urls: invoice.urls || [],
      });
    }

    if (action === 'qpayCheck') {
      const oid = Number(body.orderId);
      const o = await pool.query('SELECT qpay_invoice,deposit_paid FROM shop_orders WHERE id=$1', [oid]);
      if (!o.rows.length) return res.status(404).json({ ok: false });
      if (o.rows[0].deposit_paid) return res.json({ ok: true, paid: true });
      const inv = o.rows[0].qpay_invoice;
      if (!inv) return res.json({ ok: true, paid: false });
      const paid = await qpayCheckPaid(inv).catch(()=>false);
      if (paid) {
        await pool.query(`UPDATE shop_orders SET deposit_paid=TRUE, status=CASE WHEN status='new' THEN 'paid' ELSE status END, updated_at=NOW() WHERE id=$1`, [oid]);
        sendTelegram(`<b>💰 NOMAD GEAR — урьдчилгаа төлөгдлөө</b> Захиалга #${oid}`).catch(()=>{});
      }
      return res.json({ ok: true, paid });
    }

    // ---------- ЧАТ (нийтэд) ----------
    if (action === 'chatSend') {
      const thread = cut(body.thread, 80), text = cut(body.text, 1500);
      if (!thread || !text) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `INSERT INTO shop_chat (thread, sender, name, text, seen_user) VALUES ($1,'user',$2,$3,TRUE) RETURNING id, created_at`,
        [thread, cut(body.name, 120), text]
      );
      sendTelegram(`<b>💬 NOMAD GEAR чат</b> (${body.name || 'зочин'}): ${text}`).catch(()=>{});
      return res.json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    }

    if (action === 'chatPoll') {
      const thread = cut(body.thread, 80);
      if (!thread) return res.json({ ok: true, items: [] });
      const after = Number(body.afterId) || 0;
      const r = await pool.query('SELECT id,sender,name,text,created_at FROM shop_chat WHERE thread=$1 AND id>$2 ORDER BY id', [thread, after]);
      if (r.rows.length) await pool.query('UPDATE shop_chat SET seen_user=TRUE WHERE thread=$1 AND sender=$2', [thread, 'admin']).catch(()=>{});
      return res.json({ ok: true, items: r.rows });
    }

    // ---------- НИЙТЭД ----------
    if (action === 'catalog') {
      const r = await pool.query(`
        SELECT p.id,p.name,p.category,p.price,p.old_price,p.stock,p.image,p.description,
               p.sale_price, p.sale_until, p.sold_base,
               COALESCE(rv.avg,0) AS rating_avg, COALESCE(rv.cnt,0) AS rating_count,
               (COALESCE(p.sold_base,0) + COALESCE(sl.sold,0)) AS sold
        FROM shop_products p
        LEFT JOIN (SELECT product_id, ROUND(AVG(rating)::numeric,1) AS avg, COUNT(*)::int AS cnt
                   FROM shop_reviews GROUP BY product_id) rv ON rv.product_id = p.id
        LEFT JOIN (SELECT (it->>'id')::bigint AS pid, SUM((it->>'qty')::int) AS sold
                   FROM shop_orders o, jsonb_array_elements(o.items) it
                   WHERE o.status <> 'cancelled' GROUP BY 1) sl ON sl.pid = p.id
        WHERE p.active=TRUE ORDER BY p.sort, p.id
      `);
      return res.json({ ok: true, items: r.rows });
    }

    if (action === 'reviews') {
      const pid = Number(body.productId);
      if (!pid) return res.json({ ok: true, items: [], avg: 0, count: 0 });
      const r = await pool.query('SELECT id,name,rating,text,created_at FROM shop_reviews WHERE product_id=$1 ORDER BY id DESC LIMIT 100', [pid]);
      const a = await pool.query('SELECT ROUND(AVG(rating)::numeric,1) AS avg, COUNT(*)::int AS cnt FROM shop_reviews WHERE product_id=$1', [pid]);
      return res.json({ ok: true, items: r.rows, avg: Number(a.rows[0].avg) || 0, count: a.rows[0].cnt || 0 });
    }

    if (action === 'addReview') {
      const pid = Number(body.productId);
      const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating) || 0)));
      const text = cut(body.text, 1000);
      if (!pid || !rating) return res.status(400).json({ ok: false, error: 'Бараа болон үнэлгээ шаардлагатай' });
      const exists = await pool.query('SELECT 1 FROM shop_products WHERE id=$1', [pid]);
      if (!exists.rows.length) return res.status(404).json({ ok: false, error: 'Бараа олдсонгүй' });
      const tok = userFromToken(body.token);
      let name = cut(body.name, 120), uid = null;
      if (tok) {
        const u = await pool.query('SELECT name FROM shop_users WHERE id=$1', [tok.uid]);
        if (u.rows.length) { uid = tok.uid; name = u.rows[0].name || name; }
      }
      const r = await pool.query(
        `INSERT INTO shop_reviews (product_id, user_id, name, rating, text) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,rating,text,created_at`,
        [pid, uid, name || 'Зочин', rating, text]
      );
      return res.json({ ok: true, review: r.rows[0] });
    }

    if (action === 'contact') {
      const name = cut(body.name, 120), message = cut(body.message, 2000);
      if (!name || !message) return res.status(400).json({ ok: false, error: 'Нэр болон зурвас шаардлагатай' });
      const r = await pool.query(
        `INSERT INTO shop_messages (name, phone, email, message) VALUES ($1,$2,$3,$4) RETURNING id`,
        [name, cut(body.phone, 40), cut(body.email, 120), message]
      );
      const msg = [
        `<b>✉️ NOMAD GEAR — шинэ зурвас</b> #${r.rows[0].id}`,
        `<b>Нэр:</b> ${name}`,
        body.phone ? `<b>Утас:</b> ${body.phone}` : null,
        body.email ? `<b>И-мэйл:</b> ${body.email}` : null,
        `<b>Зурвас:</b> ${message}`,
      ].filter(Boolean).join('\n');
      sendTelegram(msg).catch(()=>{});
      return res.json({ ok: true, id: r.rows[0].id });
    }

    // ---------- ХЭРЭГЛЭГЧ (нэвтрэх/бүртгүүлэх) ----------
    if (action === 'register') {
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'И-мэйл буруу байна' });
      if (password.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг дор хаяж 6 тэмдэгт' });
      const ex = await pool.query('SELECT id FROM shop_users WHERE email=$1', [email]);
      if (ex.rows.length) return res.status(409).json({ ok: false, error: 'Энэ и-мэйл бүртгэлтэй байна' });
      const hash = await bcrypt.hash(password, 10);
      const r = await pool.query(
        `INSERT INTO shop_users (email, pass_hash, name, phone, provider) VALUES ($1,$2,$3,$4,'email') RETURNING *`,
        [email, hash, cut(body.name, 120), cut(body.phone, 40)]
      );
      const u = r.rows[0];
      return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
    }

    if (action === 'loginUser') {
      const email = String(body.email || '').trim().toLowerCase();
      const r = await pool.query('SELECT * FROM shop_users WHERE email=$1', [email]);
      const u = r.rows[0];
      if (!u || !u.pass_hash || !(await bcrypt.compare(String(body.password || ''), u.pass_hash))) {
        return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      }
      return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
    }

    if (action === 'googleAuth') {
      const p = await verifyGoogle(body.idToken);
      if (!p) return res.status(401).json({ ok: false, error: 'Google баталгаажуулалт амжилтгүй' });
      const email = String(p.email).toLowerCase();
      const name = p.name || [p.given_name, p.family_name].filter(Boolean).join(' ') || email.split('@')[0];
      const r = await pool.query('SELECT * FROM shop_users WHERE email=$1', [email]);
      let u = r.rows[0];
      if (u) {
        if (!u.picture && p.picture) { await pool.query('UPDATE shop_users SET picture=$1 WHERE id=$2', [p.picture, u.id]); u.picture = p.picture; }
      } else {
        const ins = await pool.query(
          `INSERT INTO shop_users (email, name, picture, provider) VALUES ($1,$2,$3,'google') RETURNING *`,
          [email, cut(name, 120), p.picture || null]
        );
        u = ins.rows[0];
      }
      return res.json({ ok: true, token: signToken(u), user: publicUser(u) });
    }

    if (action === 'me') {
      const t = userFromToken(body.token);
      if (!t) return res.json({ ok: false });
      const r = await pool.query('SELECT * FROM shop_users WHERE id=$1', [t.uid]);
      if (!r.rows.length) return res.json({ ok: false });
      return res.json({ ok: true, user: publicUser(r.rows[0]) });
    }

    if (action === 'saveProfile') {
      const t = userFromToken(body.token);
      if (!t) return res.status(401).json({ ok: false, error: 'Нэвтрээгүй байна' });
      const r = await pool.query(
        `UPDATE shop_users SET name=COALESCE($2,name), phone=COALESCE($3,phone), address=COALESCE($4,address) WHERE id=$1 RETURNING *`,
        [t.uid, cut(body.name, 120), cut(body.phone, 40), body.address ? JSON.stringify(body.address) : null]
      );
      return res.json({ ok: true, user: publicUser(r.rows[0]) });
    }

    if (action === 'order') {
      const { customer, phone, address, note, items, geo } = body;
      const tok = userFromToken(body.token);
      if (!customer || !phone) return res.status(400).json({ ok: false, error: 'Нэр, утас шаардлагатай' });
      if (!Array.isArray(items) || !items.length) return res.status(400).json({ ok: false, error: 'Сагс хоосон байна' });

      // Сервер талд үнэ/нөөцийг баталгаажуулна (хугацаатай хямдралыг баримтална)
      const ids = items.map((it) => Number(it.id)).filter(Boolean);
      const pr = await pool.query('SELECT id,name,price,stock,sale_price,sale_until FROM shop_products WHERE id = ANY($1) AND active=TRUE', [ids]);
      const now = Date.now();
      const effPrice = (p) => (p.sale_price && p.sale_until && new Date(p.sale_until).getTime() > now && p.sale_price < p.price) ? p.sale_price : p.price;
      const map = new Map(pr.rows.map((p) => [Number(p.id), p]));
      const lines = [];
      let total = 0;
      for (const it of items) {
        const p = map.get(Number(it.id));
        if (!p) continue;
        const qty = Math.max(1, Math.min(99, Math.round(Number(it.qty) || 1)));
        if (p.stock < qty) return res.status(400).json({ ok: false, error: `"${p.name}" нөөц хүрэлцэхгүй (${p.stock} ширхэг үлдсэн)` });
        const price = effPrice(p);
        lines.push({ id: p.id, name: p.name, price, qty });
        total += price * qty;
      }
      if (!lines.length) return res.status(400).json({ ok: false, error: 'Бараа олдсонгүй' });

      const geoClean = (geo && Number.isFinite(Number(geo.lat)) && Number.isFinite(Number(geo.lng)))
        ? { lat: Number(geo.lat), lng: Number(geo.lng) } : null;

      const r = await pool.query(
        `INSERT INTO shop_orders (customer, phone, address, note, items, total, user_id, geo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
        [cut(customer,120), cut(phone,40), cut(address,400), cut(note,500),
         JSON.stringify(lines), total, tok ? tok.uid : null, geoClean ? JSON.stringify(geoClean) : null]
      );
      // нөөц хасах
      for (const l of lines) {
        await pool.query('UPDATE shop_products SET stock = GREATEST(0, stock-$2) WHERE id=$1', [l.id, l.qty]).catch(()=>{});
      }
      // нэвтэрсэн хэрэглэгчийн хаягийг хадгалж дараагийнд бэлэн болгоно
      if (tok) {
        await pool.query('UPDATE shop_users SET phone=COALESCE(phone,$2), address=$3 WHERE id=$1',
          [tok.uid, cut(phone,40), JSON.stringify({ text: cut(address,400), geo: geoClean })]).catch(()=>{});
      }
      const row = r.rows[0];
      const mapLink = geoClean ? `https://maps.google.com/?q=${geoClean.lat},${geoClean.lng}` : null;
      const msg = [
        `<b>🛒 NOMAD GEAR — шинэ захиалга</b> #${row.id}`,
        `<b>Хэрэглэгч:</b> ${customer}${tok ? ' (бүртгэлтэй)' : ''}`,
        `<b>Утас:</b> ${phone}`,
        address ? `<b>Хаяг:</b> ${address}` : null,
        mapLink ? `<b>📍 Газрын зураг:</b> ${mapLink}` : null,
        '<b>Бараа:</b>',
        ...lines.map((l) => `• ${l.name} × ${l.qty} = ${(l.price*l.qty).toLocaleString()}₮`),
        `<b>Нийт: ${total.toLocaleString()}₮</b>`,
        note ? `<b>Тэмдэглэл:</b> ${note}` : null,
      ].filter(Boolean).join('\n');
      sendTelegram(msg).catch(()=>{});
      return res.json({ ok: true, id: row.id, total });
    }

    // ---------- АДМИН ----------
    if (action === 'login') return res.json({ ok: isAdmin(body) });
    if (!isAdmin(body)) return res.status(401).json({ ok: false, error: 'Нэвтрэх эрхгүй' });

    if (action === 'products') {
      const r = await pool.query('SELECT * FROM shop_products ORDER BY sort, id');
      return res.json({ ok: true, items: r.rows });
    }

    if (action === 'saveProduct') {
      const p = body.product || {};
      if (!p.name) return res.status(400).json({ ok: false, error: 'Нэр шаардлагатай' });
      const vals = [
        String(p.name).slice(0,160),
        p.category ? String(p.category).slice(0,60) : null,
        money(p.price),
        p.old_price ? money(p.old_price) : null,
        Math.max(0, Math.round(Number(p.stock) || 0)),
        p.image ? String(p.image).slice(0,400) : null,
        p.description ? String(p.description).slice(0,1000) : null,
        p.active === false ? false : true,
        Math.round(Number(p.sort) || 0),
        p.sale_price ? money(p.sale_price) : null,
        p.sale_until ? new Date(p.sale_until).toISOString() : null,
        Math.max(0, Math.round(Number(p.sold_base) || 0)),
      ];
      if (p.id) {
        const r = await pool.query(
          `UPDATE shop_products SET name=$2,category=$3,price=$4,old_price=$5,stock=$6,image=$7,description=$8,active=$9,sort=$10,sale_price=$11,sale_until=$12,sold_base=$13
           WHERE id=$1 RETURNING *`, [p.id, ...vals]);
        return res.json({ ok: true, item: r.rows[0] });
      }
      const r = await pool.query(
        `INSERT INTO shop_products (name,category,price,old_price,stock,image,description,active,sort,sale_price,sale_until,sold_base)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, vals);
      return res.json({ ok: true, item: r.rows[0] });
    }

    if (action === 'deleteProduct') {
      if (!body.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM shop_products WHERE id=$1', [body.id]);
      return res.json({ ok: true });
    }

    if (action === 'orders') {
      const status = body.status && ORDER_STATUSES.indexOf(body.status) !== -1 ? body.status : null;
      const r = status
        ? await pool.query('SELECT * FROM shop_orders WHERE status=$1 ORDER BY created_at DESC LIMIT 1000', [status])
        : await pool.query('SELECT * FROM shop_orders ORDER BY created_at DESC LIMIT 1000');
      const stats = await pool.query(`SELECT status, COUNT(*)::int AS c FROM shop_orders GROUP BY status`);
      const rev = await pool.query(`SELECT COALESCE(SUM(total),0)::bigint AS s FROM shop_orders WHERE status IN ('paid','shipped','done')`);
      return res.json({ ok: true, items: r.rows, stats: stats.rows, revenue: Number(rev.rows[0].s) });
    }

    if (action === 'setOrderStatus') {
      const { id, status, admin_note } = body;
      if (!id || ORDER_STATUSES.indexOf(status) === -1) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `UPDATE shop_orders SET status=$2, admin_note=COALESCE($3,admin_note), updated_at=NOW() WHERE id=$1 RETURNING *`,
        [id, status, admin_note ?? null]);
      return res.json({ ok: true, item: r.rows[0] });
    }

    if (action === 'deleteOrder') {
      if (!body.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM shop_orders WHERE id=$1', [body.id]);
      return res.json({ ok: true });
    }

    if (action === 'messages') {
      await pool.query(`UPDATE shop_messages SET seen=TRUE WHERE seen=FALSE`).catch(()=>{});
      const r = await pool.query('SELECT * FROM shop_messages ORDER BY created_at DESC LIMIT 500');
      return res.json({ ok: true, items: r.rows });
    }

    if (action === 'deleteMessage') {
      if (!body.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM shop_messages WHERE id=$1', [body.id]);
      return res.json({ ok: true });
    }

    if (action === 'chatThreads') {
      const r = await pool.query(`
        SELECT c.thread,
               MAX(c.id) AS last_id,
               MAX(c.created_at) AS last_at,
               (SELECT text FROM shop_chat x WHERE x.thread=c.thread ORDER BY x.id DESC LIMIT 1) AS last_text,
               (SELECT name FROM shop_chat x WHERE x.thread=c.thread AND x.name IS NOT NULL ORDER BY x.id DESC LIMIT 1) AS name,
               COUNT(*) FILTER (WHERE c.sender='user' AND c.seen_admin=FALSE)::int AS unseen
        FROM shop_chat c GROUP BY c.thread ORDER BY last_at DESC LIMIT 200
      `);
      const totalUnseen = r.rows.reduce((s, t) => s + (t.unseen || 0), 0);
      return res.json({ ok: true, items: r.rows, totalUnseen });
    }

    if (action === 'chatHistory') {
      const thread = cut(body.thread, 80);
      if (!thread) return res.json({ ok: true, items: [] });
      await pool.query('UPDATE shop_chat SET seen_admin=TRUE WHERE thread=$1 AND sender=$2', [thread, 'user']).catch(()=>{});
      const r = await pool.query('SELECT id,sender,name,text,created_at FROM shop_chat WHERE thread=$1 ORDER BY id', [thread]);
      return res.json({ ok: true, items: r.rows });
    }

    if (action === 'chatReply') {
      const thread = cut(body.thread, 80), text = cut(body.text, 1500);
      if (!thread || !text) return res.status(400).json({ ok: false });
      const r = await pool.query(
        `INSERT INTO shop_chat (thread, sender, text, seen_admin) VALUES ($1,'admin',$2,TRUE) RETURNING id, created_at`,
        [thread, text]
      );
      return res.json({ ok: true, id: r.rows[0].id, created_at: r.rows[0].created_at });
    }

    if (action === 'allReviews') {
      const r = await pool.query(`
        SELECT rv.id, rv.product_id, rv.name, rv.rating, rv.text, rv.created_at, p.name AS product_name
        FROM shop_reviews rv LEFT JOIN shop_products p ON p.id = rv.product_id
        ORDER BY rv.id DESC LIMIT 500
      `);
      return res.json({ ok: true, items: r.rows });
    }

    if (action === 'deleteReview') {
      if (!body.id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM shop_reviews WHERE id=$1', [body.id]);
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('[shop]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
