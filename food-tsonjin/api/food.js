// ЦОНЖИН КИБЕР БОАРДИНГ — Хоолны карт систем API
// Neon Postgres. Бүх логик нэг файлд, action-based POST.
// Сурагч картаа уншуулахад 1 эрх хасагдана (0-ээс доош сөрөг болж болно = өргүй).
const crypto = require('crypto');
const pool = require('./_db');

const ADMIN_PASS = process.env.FOOD_ADMIN_PASS || 'tsonjin2026';
const WEEKEND_FEE = 30000;
const MEAL_PRICE_DEFAULT = 27000;

// ---- QPay тохиргоо (env-ээс, BYAMBADORJ merchant) ----
const QPAY_URL = 'https://merchant.qpay.mn/v2';
const QPAY_USERNAME = process.env.QPAY_USERNAME || '';
const QPAY_PASSWORD = process.env.QPAY_PASSWORD || '';
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE || '';
let qpayToken = null, qpayExpiry = 0;
async function qpayGetToken() {
  if (qpayToken && Date.now() < qpayExpiry) return qpayToken;
  const r = await fetch(`${QPAY_URL}/auth/token`, {
    method: 'POST',
    headers: { 'Authorization': 'Basic ' + Buffer.from(`${QPAY_USERNAME}:${QPAY_PASSWORD}`).toString('base64'),
      'Content-Type': 'application/json' }
  });
  const d = await r.json();
  qpayToken = d.access_token;
  qpayExpiry = Date.now() + (d.expires_in || 3600) * 1000 - 60000;
  return qpayToken;
}

function genToken() {
  return 'TS' + crypto.randomBytes(8).toString('hex').toUpperCase();
}
function isAdmin(body) {
  return body && typeof body.pass === 'string' && body.pass === ADMIN_PASS;
}
function clean(s, n) {
  return s == null ? null : String(s).slice(0, n);
}
// QR оролтоос токен ялгах — URL (?qr=...) эсвэл цэвэр токен
function extractToken(s) {
  if (s == null) return null;
  const v = String(s).trim();
  const m = v.match(/[?&]qr=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : v;
}
function studentOut(r) {
  return {
    id: r.id,
    name: r.name,
    grade: r.grade,
    photo: r.photo,
    qr: r.qr_code,
    balance: r.balance,
    parent_phone: r.parent_phone || null,
    created_at: r.created_at,
  };
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_students (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      grade TEXT,
      photo TEXT,
      qr_code TEXT UNIQUE NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_scans (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES food_students(id) ON DELETE CASCADE,
      scanned_at TIMESTAMPTZ DEFAULT NOW(),
      balance_after INTEGER NOT NULL
    )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_scans_student ON food_scans(student_id, scanned_at DESC)`).catch(()=>{});
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_scans_time ON food_scans(scanned_at DESC)`).catch(()=>{});
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_recharges (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES food_students(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_menu (
      menu_date DATE PRIMARY KEY,
      breakfast TEXT,
      lunch TEXT,
      dinner TEXT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS food_weekend (
      id BIGSERIAL PRIMARY KEY,
      student_id BIGINT NOT NULL REFERENCES food_students(id) ON DELETE CASCADE,
      stay_date DATE NOT NULL,
      amount INTEGER NOT NULL DEFAULT ${WEEKEND_FEE},
      paid BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(student_id, stay_date)
    )`);
  // Нэмэлт багана / тохиргоо (idempotent)
  await pool.query(`ALTER TABLE food_students ADD COLUMN IF NOT EXISTS parent_phone TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE food_recharges ADD COLUMN IF NOT EXISTS tugrug INTEGER`).catch(()=>{});
  await pool.query(`ALTER TABLE food_recharges ADD COLUMN IF NOT EXISTS method TEXT DEFAULT 'cash'`).catch(()=>{});
  await pool.query(`ALTER TABLE food_recharges ADD COLUMN IF NOT EXISTS invoice_id TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE food_recharges ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'done'`).catch(()=>{});
  await pool.query(`CREATE TABLE IF NOT EXISTS food_settings (key TEXT PRIMARY KEY, value TEXT)`);
}

async function getSetting(key, def) {
  const r = await pool.query('SELECT value FROM food_settings WHERE key=$1', [key]);
  if (!r.rows.length) return def;
  const n = Number(r.rows[0].value);
  return Number.isFinite(n) ? n : def;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await ensureSchema();
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST only' });

    const body = req.body || {};
    const action = body.action;

    // ---- Нэвтрэх шалгах ----
    if (action === 'login') {
      return res.status(200).json({ ok: isAdmin(body) });
    }

    // ============ СУРАГЧИЙН ӨӨРИЙН ХЭСЭГ (QR = эрх, нууц үг шаардахгүй) ============
    // Сурагч QR-аараа нэвтэрч үлдэгдэл, түүхээ харах
    if (action === 'me') {
      const qr = clean(extractToken(body.qr), 64);
      if (!qr) return res.status(400).json({ ok: false, error: 'QR хоосон' });
      const r = await pool.query('SELECT * FROM food_students WHERE qr_code=$1', [qr.trim()]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Карт олдсонгүй' });
      const s = r.rows[0];
      const scans = await pool.query(
        'SELECT scanned_at, balance_after FROM food_scans WHERE student_id=$1 ORDER BY scanned_at DESC LIMIT 30', [s.id]);
      const rech = await pool.query(
        `SELECT amount, tugrug, method, created_at FROM food_recharges
         WHERE student_id=$1 AND COALESCE(status,'done')='done' ORDER BY created_at DESC LIMIT 30`, [s.id]);
      const price = await getSetting('meal_price', MEAL_PRICE_DEFAULT);
      return res.status(200).json({ ok: true, student: studentOut(s), scans: scans.rows, recharges: rech.rows, mealPrice: price });
    }

    // Сурагч QPay-аар эрх худалдаж авах нэхэмжлэх үүсгэх
    if (action === 'recharge.create') {
      if (!QPAY_USERNAME || !QPAY_PASSWORD || !QPAY_INVOICE_CODE)
        return res.status(503).json({ ok: false, error: 'QPay тохиргоо дутуу байна' });
      const qr = clean(extractToken(body.qr), 64);
      const count = Math.trunc(+body.count);
      if (!qr || !count || count < 1) return res.status(400).json({ ok: false, error: 'QR ба удаа шаардлагатай' });
      const r = await pool.query('SELECT * FROM food_students WHERE qr_code=$1', [qr.trim()]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Карт олдсонгүй' });
      const s = r.rows[0];
      const price = await getSetting('meal_price', MEAL_PRICE_DEFAULT);
      const amount = count * price;
      const senderNo = `FD${s.id}_${Date.now()}`;
      const token = await qpayGetToken();
      const inv = await fetch(`${QPAY_URL}/invoice`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_code: QPAY_INVOICE_CODE,
          sender_invoice_no: senderNo,
          invoice_receiver_code: `fd_${s.id}`,
          invoice_description: `Хоолны эрх ${count} удаа — ${s.name}`,
          amount,
        })
      });
      const invoice = await inv.json();
      if (!invoice.invoice_id) return res.status(502).json({ ok: false, error: 'QPay нэхэмжлэх үүсгэж чадсангүй', detail: invoice });
      // pending цэнэглэлт хадгалах
      await pool.query(
        `INSERT INTO food_recharges (student_id, amount, tugrug, method, invoice_id, status, note)
         VALUES ($1,$2,$3,'qpay',$4,'pending',$5)`,
        [s.id, count, amount, invoice.invoice_id, `${count} удаа QPay`]);
      return res.status(200).json({ ok: true, invoice, count, amount });
    }

    // Сурагч төлбөрөө шалгаж эрхээ нэмэх
    if (action === 'recharge.check') {
      const qr = clean(extractToken(body.qr), 64);
      const invoice_id = clean(body.invoice_id, 80);
      if (!qr || !invoice_id) return res.status(400).json({ ok: false, error: 'Дутуу мэдээлэл' });
      const sr = await pool.query('SELECT * FROM food_students WHERE qr_code=$1', [qr.trim()]);
      if (!sr.rows.length) return res.status(404).json({ ok: false, error: 'Карт олдсонгүй' });
      const s = sr.rows[0];
      // pending цэнэглэлт олох
      const pr = await pool.query(
        `SELECT * FROM food_recharges WHERE invoice_id=$1 AND student_id=$2`, [invoice_id, s.id]);
      if (!pr.rows.length) return res.status(404).json({ ok: false, error: 'Нэхэмжлэх олдсонгүй' });
      const rech = pr.rows[0];
      if (rech.status === 'done')
        return res.status(200).json({ ok: true, paid: true, already: true, balance: s.balance });
      const token = await qpayGetToken();
      const chk = await fetch(`${QPAY_URL}/payment/check`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ object_type: 'INVOICE', object_id: invoice_id })
      });
      const result = await chk.json();
      if (result.count > 0) {
        // Төлөгдсөн — эрх нэмэх (нэг л удаа)
        const upd = await pool.query(
          `UPDATE food_recharges SET status='done' WHERE id=$1 AND status='pending' RETURNING id`, [rech.id]);
        if (upd.rows.length) {
          const u = await pool.query(
            'UPDATE food_students SET balance = balance + $2, updated_at=NOW() WHERE id=$1 RETURNING balance',
            [s.id, rech.amount]);
          return res.status(200).json({ ok: true, paid: true, added: rech.amount, balance: u.rows[0].balance });
        }
        const cur = await pool.query('SELECT balance FROM food_students WHERE id=$1', [s.id]);
        return res.status(200).json({ ok: true, paid: true, already: true, balance: cur.rows[0].balance });
      }
      return res.status(200).json({ ok: true, paid: false });
    }

    // Бусад бүх үйлдэл нууц үг шаардана
    if (!isAdmin(body)) return res.status(401).json({ ok: false, error: 'Нууц үг буруу' });

    // ============ УНШУУЛАХ ============
    if (action === 'scan') {
      const qr = clean(extractToken(body.qr), 64);
      if (!qr) return res.status(400).json({ ok: false, error: 'QR хоосон' });
      const r = await pool.query('SELECT * FROM food_students WHERE qr_code = $1', [qr.trim()]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Карт олдсонгүй' });
      const s = r.rows[0];
      const before = s.balance;
      const u = await pool.query(
        'UPDATE food_students SET balance = balance - 1, updated_at = NOW() WHERE id = $1 RETURNING *',
        [s.id]
      );
      const after = u.rows[0].balance;
      await pool.query('INSERT INTO food_scans (student_id, balance_after) VALUES ($1,$2)', [s.id, after]);
      return res.status(200).json({ ok: true, student: studentOut(u.rows[0]), before, after });
    }

    // ============ СУРАГЧИД / КАРТ ============
    if (action === 'students.list') {
      const r = await pool.query('SELECT * FROM food_students ORDER BY grade NULLS LAST, name');
      return res.status(200).json({ ok: true, students: r.rows.map(studentOut) });
    }
    if (action === 'students.add') {
      const name = clean(body.name, 120);
      if (!name) return res.status(400).json({ ok: false, error: 'Нэр шаардлагатай' });
      const grade = clean(body.grade, 40);
      const photo = clean(body.photo, 600000);
      const parent_phone = clean(body.parent_phone, 40);
      const balance = Number.isFinite(+body.balance) ? Math.trunc(+body.balance) : 0;
      let qr = genToken();
      const r = await pool.query(
        `INSERT INTO food_students (name, grade, photo, qr_code, balance, parent_phone)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [name, grade, photo, qr, balance, parent_phone]
      );
      return res.status(200).json({ ok: true, student: studentOut(r.rows[0]) });
    }
    if (action === 'students.update') {
      const id = +body.id;
      if (!id) return res.status(400).json({ ok: false, error: 'id шаардлагатай' });
      const r = await pool.query(
        `UPDATE food_students SET name=COALESCE($2,name), grade=$3, photo=COALESCE($4,photo),
           parent_phone=$5, updated_at=NOW()
         WHERE id=$1 RETURNING *`,
        [id, clean(body.name, 120), clean(body.grade, 40), clean(body.photo, 600000), clean(body.parent_phone, 40)]
      );
      if (!r.rows.length) return res.status(404).json({ ok: false });
      return res.status(200).json({ ok: true, student: studentOut(r.rows[0]) });
    }
    if (action === 'students.delete') {
      const id = +body.id;
      await pool.query('DELETE FROM food_students WHERE id=$1', [id]);
      return res.status(200).json({ ok: true });
    }
    if (action === 'students.history') {
      const id = +body.id;
      const scans = await pool.query(
        'SELECT scanned_at, balance_after FROM food_scans WHERE student_id=$1 ORDER BY scanned_at DESC LIMIT 100', [id]);
      const rech = await pool.query(
        'SELECT amount, note, created_at FROM food_recharges WHERE student_id=$1 ORDER BY created_at DESC LIMIT 100', [id]);
      return res.status(200).json({ ok: true, scans: scans.rows, recharges: rech.rows });
    }

    // ============ ЦЭНЭГЛЭХ ============
    if (action === 'recharge') {
      const id = +body.id;
      const amount = Math.trunc(+body.amount);
      if (!id || !Number.isFinite(amount) || amount === 0)
        return res.status(400).json({ ok: false, error: 'id болон тоо шаардлагатай' });
      const u = await pool.query(
        'UPDATE food_students SET balance = balance + $2, updated_at=NOW() WHERE id=$1 RETURNING *', [id, amount]);
      if (!u.rows.length) return res.status(404).json({ ok: false });
      await pool.query('INSERT INTO food_recharges (student_id, amount, note) VALUES ($1,$2,$3)',
        [id, amount, clean(body.note, 200)]);
      return res.status(200).json({ ok: true, student: studentOut(u.rows[0]) });
    }

    // ============ МЕНЮ ============
    if (action === 'menu.range') {
      const from = clean(body.from, 10), to = clean(body.to, 10);
      const r = await pool.query(
        `SELECT to_char(menu_date,'YYYY-MM-DD') AS date, breakfast, lunch, dinner
         FROM food_menu WHERE menu_date BETWEEN $1 AND $2 ORDER BY menu_date`, [from, to]);
      return res.status(200).json({ ok: true, menu: r.rows });
    }
    if (action === 'menu.set') {
      const date = clean(body.date, 10);
      if (!date) return res.status(400).json({ ok: false, error: 'Огноо шаардлагатай' });
      await pool.query(
        `INSERT INTO food_menu (menu_date, breakfast, lunch, dinner, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (menu_date) DO UPDATE SET breakfast=$2, lunch=$3, dinner=$4, updated_at=NOW()`,
        [date, clean(body.breakfast, 500), clean(body.lunch, 500), clean(body.dinner, 500)]);
      return res.status(200).json({ ok: true });
    }

    // ============ АМРАЛТЫН ӨДӨР ҮЛДСЭН СУРАГЧИД ============
    if (action === 'weekend.range') {
      const from = clean(body.from, 10), to = clean(body.to, 10);
      const r = await pool.query(
        `SELECT w.id, w.student_id, w.amount, w.paid,
                to_char(w.stay_date,'YYYY-MM-DD') AS stay_date,
                s.name, s.grade
         FROM food_weekend w JOIN food_students s ON s.id=w.student_id
         WHERE w.stay_date BETWEEN $1 AND $2
         ORDER BY w.stay_date DESC, s.grade, s.name`, [from, to]);
      return res.status(200).json({ ok: true, rows: r.rows });
    }
    if (action === 'weekend.add') {
      const id = +body.student_id;
      const date = clean(body.date, 10);
      if (!id || !date) return res.status(400).json({ ok: false, error: 'Сурагч ба огноо шаардлагатай' });
      const amount = Number.isFinite(+body.amount) ? Math.trunc(+body.amount) : WEEKEND_FEE;
      await pool.query(
        `INSERT INTO food_weekend (student_id, stay_date, amount)
         VALUES ($1,$2,$3) ON CONFLICT (student_id, stay_date) DO NOTHING`, [id, date, amount]);
      return res.status(200).json({ ok: true });
    }
    if (action === 'weekend.pay') {
      const id = +body.id;
      await pool.query('UPDATE food_weekend SET paid = $2 WHERE id=$1', [id, !!body.paid]);
      return res.status(200).json({ ok: true });
    }
    if (action === 'weekend.delete') {
      await pool.query('DELETE FROM food_weekend WHERE id=$1', [+body.id]);
      return res.status(200).json({ ok: true });
    }

    // ============ САМБАР (өнөөдрийн тоо) ============
    if (action === 'dashboard') {
      const today = clean(body.today, 10);
      const cnt = await pool.query(
        `SELECT COUNT(*)::int AS c FROM food_scans WHERE scanned_at::date = $1`, [today]);
      const studs = await pool.query('SELECT COUNT(*)::int AS c FROM food_students');
      const low = await pool.query('SELECT COUNT(*)::int AS c FROM food_students WHERE balance <= 3');
      const wkUnpaid = await pool.query('SELECT COALESCE(SUM(amount),0)::int AS s FROM food_weekend WHERE paid=FALSE');
      return res.status(200).json({
        ok: true,
        scansToday: cnt.rows[0].c,
        students: studs.rows[0].c,
        lowBalance: low.rows[0].c,
        weekendUnpaid: wkUnpaid.rows[0].s,
      });
    }

    // ============ ТОХИРГОО ============
    if (action === 'settings.get') {
      const r = await pool.query('SELECT key, value FROM food_settings');
      const map = {}; r.rows.forEach(x => map[x.key] = x.value);
      return res.status(200).json({ ok: true,
        meal_price: Number(map.meal_price) || MEAL_PRICE_DEFAULT,
        weekend_fee: Number(map.weekend_fee) || WEEKEND_FEE });
    }
    if (action === 'settings.set') {
      const items = { meal_price: body.meal_price, weekend_fee: body.weekend_fee };
      for (const k of Object.keys(items)) {
        if (items[k] == null) continue;
        const v = String(Math.trunc(+items[k]));
        await pool.query(
          `INSERT INTO food_settings (key,value) VALUES ($1,$2)
           ON CONFLICT (key) DO UPDATE SET value=$2`, [k, v]);
      }
      return res.status(200).json({ ok: true });
    }

    // ============ САРЫН ТӨЛБӨРИЙН ТАЙЛАН ============
    if (action === 'report.month') {
      const year = +body.year, month = +body.month; // month: 1-12
      if (!year || !month) return res.status(400).json({ ok: false, error: 'Он/сар шаардлагатай' });
      const from = `${year}-${String(month).padStart(2,'0')}-01`;
      const to = `${year}-${String(month).padStart(2,'0')}-${String(new Date(year, month, 0).getDate()).padStart(2,'0')}`;
      const price = await getSetting('meal_price', MEAL_PRICE_DEFAULT);
      const studs = await pool.query('SELECT id, name, grade, parent_phone FROM food_students ORDER BY grade NULLS LAST, name');
      const scans = await pool.query(
        `SELECT student_id, COUNT(*)::int AS c FROM food_scans
         WHERE scanned_at::date BETWEEN $1 AND $2 GROUP BY student_id`, [from, to]);
      const wk = await pool.query(
        `SELECT student_id, COUNT(*)::int AS days, COALESCE(SUM(amount),0)::int AS amt
         FROM food_weekend WHERE stay_date BETWEEN $1 AND $2 GROUP BY student_id`, [from, to]);
      const scanMap = {}; scans.rows.forEach(r => scanMap[r.student_id] = r.c);
      const wkMap = {}; wk.rows.forEach(r => wkMap[r.student_id] = r);
      const rows = studs.rows.map(s => {
        const meals = scanMap[s.id] || 0;
        const w = wkMap[s.id] || { days: 0, amt: 0 };
        const mealAmount = meals * price;
        const total = mealAmount + w.amt;
        return { id: s.id, name: s.name, grade: s.grade, parent_phone: s.parent_phone || null,
          meals, mealAmount, weekendDays: w.days, weekendAmount: w.amt, total };
      });
      return res.status(200).json({ ok: true, from, to, mealPrice: price, rows });
    }

    return res.status(400).json({ ok: false, error: 'Үл мэдэгдэх үйлдэл: ' + action });
  } catch (e) {
    console.error('food api error', e);
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
