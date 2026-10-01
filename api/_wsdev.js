// Ажлын хуудасны эрхийг НЭГ ИМЭЙЛ → ДЭЭД ТАЛ 2 ТӨХӨӨРӨМЖ-өөр хязгаарлана.
// Яагаад: нэг хүн эрх худалдаж аваад нэвтрэлтээ бусдад дахин зардаг тохиолдол гарсан.
//
// Ажиллах зарчим:
//   • Хөтөч бүр өөрийн санамсаргүй device_id-г localStorage-д хадгална (cm_device).
//   • Нэвтрэхэд тэр id-г бүртгэнэ. Бүртгэлтэй 2 төхөөрөмж дүүрсэн бол 3 дахь нь ОРОХГҮЙ.
//   • Токен дотор dev=<device_id> явна. Хуудас нээх бүрд (qpay wsstatus) device_id
//     бүртгэлтэй эсэхийг ШАЛГАНА — тиймээс токеноо хуулж өгөөд ч өнгөрөхгүй.
//   • Хуучин (dev-гүй) токен: тухайн төхөөрөмжийг сул байр байвал автоматаар бүртгэнэ,
//     дүүрсэн бол татгалзана. Ингэснээр одоо нэвтэрсэн хүмүүс дахин нэвтрэх шаардлагагүй.
//
// API:
//   MAX_DEVICES                                   → 2
//   deviceIdFrom(req)                             → string | null
//   ensureTable()                                 → Promise
//   check(email, devId, req)                      → { ok, error?, devices?, slot? }
//   list(email)                                   → Promise<[{device_id,label,last_seen,...}]>
//   remove(email, devId)                          → Promise<{ ok, error? }>
//   labelFromUA(ua)                               → "Android утас" гэх мэт
const pool = require('./_db');

const MAX_DEVICES = parseInt(process.env.WS_MAX_DEVICES || '2', 10) || 2;
// Нэг төхөөрөмжийг салгаад өөрийг нь холбох нь 30 хоногт дээд тал нь 3 удаа.
// Ингэхгүй бол «салгаад → найздаа холбоод» гэж дахин зарах зам нээлттэй үлдэнэ.
const SWAP_MAX = parseInt(process.env.WS_DEVICE_SWAPS || '3', 10) || 3;
const SWAP_DAYS = 30;
// Энэ хугацаанд огт хэрэглээгүй төхөөрөмжийн байр автоматаар суллагдана
const IDLE_DAYS = parseInt(process.env.WS_DEVICE_IDLE_DAYS || '60', 10) || 60;
// Нэг байрны хурууны хээг энэ хугацаанд нэг л удаа шинэчилж болно (жинхэнэ
// төхөөрөмж өөрчлөлт). Дахин зөрвөл өөр машин гэж тооцно.
const FP_HEAL_DAYS = parseInt(process.env.WS_DEVICE_FP_DAYS || '30', 10) || 30;

let ready = false;
async function ensureTable() {
  if (ready) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_devices (
    email TEXT NOT NULL,
    device_id TEXT NOT NULL,
    label TEXT,
    ua TEXT,
    ip TEXT,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (email, device_id)
  )`).catch(() => {});
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_device_swaps (
    id BIGSERIAL PRIMARY KEY,
    email TEXT NOT NULL,
    device_id TEXT,
    at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`).catch(() => {});
  // Машины хурууны хээ — localStorage-оо бүтнээр нь хуулж өгөхөд ч өөр машин гэж танина
  await pool.query(`ALTER TABLE ws_devices ADD COLUMN IF NOT EXISTS fp TEXT`).catch(() => {});
  await pool.query(`ALTER TABLE ws_devices ADD COLUMN IF NOT EXISTS fp_changed_at TIMESTAMPTZ`).catch(() => {});
  // Нэг байрыг хэдэн өөр сүлжээнээс ашиглаж байгааг админд харуулах (хуваалцлын дохио)
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_device_ips (
    email TEXT NOT NULL,
    device_id TEXT NOT NULL,
    ip TEXT NOT NULL,
    first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (email, device_id, ip)
  )`).catch(() => {});
  ready = true;
}

// Зөвхөн аюулгүй тэмдэгт — хэрэглэгчийн өгсөн утгыг шууд хадгалахгүй
function clean(id) {
  const s = String(id || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return s.length >= 8 ? s.slice(0, 64) : null;
}

function deviceIdFrom(req) {
  const h = (req && req.headers) || {};
  const b = (req && req.body) || {};
  return clean(h['x-device-id']) || clean(b.device) || clean(b.device_id) || null;
}

// Машины хурууны хээ (дэлгэцийн хэмжээ, цагийн бүс, OS/хөтчийн овог…). Хөтчийн
// хувилбар ороогүй тул шинэчлэлтээр өөрчлөгдөхгүй.
function fpFrom(req) {
  const h = (req && req.headers) || {};
  const b = (req && req.body) || {};
  const raw = String(h['x-device-fp'] || b.fp || '').trim().toLowerCase();
  return /^[a-f0-9]{6,32}$/.test(raw) ? raw : null;
}

function labelFromUA(ua) {
  const s = String(ua || '');
  let os = 'Тодорхойгүй';
  if (/iPhone/i.test(s)) os = 'iPhone';
  else if (/iPad/i.test(s)) os = 'iPad';
  else if (/Android/i.test(s)) os = /Mobile/i.test(s) ? 'Android утас' : 'Android таблет';
  else if (/Windows/i.test(s)) os = 'Windows';
  else if (/Macintosh|Mac OS X/i.test(s)) os = 'Mac';
  else if (/Linux/i.test(s)) os = 'Linux';
  let br = '';
  if (/Edg\//.test(s)) br = 'Edge';
  else if (/OPR\/|Opera/i.test(s)) br = 'Opera';
  else if (/Firefox\//.test(s)) br = 'Firefox';
  else if (/Chrome\//.test(s)) br = 'Chrome';
  else if (/Safari\//.test(s)) br = 'Safari';
  return br ? os + ' · ' + br : os;
}

function ipOf(req) {
  const h = (req && req.headers) || {};
  const xff = h['x-forwarded-for'];
  const first = String(Array.isArray(xff) ? xff[0] : (xff || '')).split(',')[0].trim();
  return (first || h['x-real-ip'] || '').toString().slice(0, 64) || null;
}
function uaOf(req) {
  return String(((req && req.headers) || {})['user-agent'] || '').slice(0, 300);
}

// Нэг байр хэдэн өөр сүлжээнээс хэрэглэгдэж байгааг бүртгэнэ (хуваалцлын дохио)
async function touchIp(email, devId, ip) {
  if (!ip) return;
  await pool.query(
    `INSERT INTO ws_device_ips (email, device_id, ip) VALUES ($1,$2,$3)
     ON CONFLICT (email, device_id, ip) DO UPDATE SET last_seen=NOW()`,
    [email, devId, ip]).catch(() => {});
}

async function list(email) {
  await ensureTable();
  const e = String(email || '').trim().toLowerCase();
  if (!e) return [];
  const r = await pool.query(
    `SELECT d.device_id, d.label, d.ip, d.fp, d.first_seen, d.last_seen,
            (SELECT COUNT(*)::int FROM ws_device_ips i
              WHERE i.email=d.email AND i.device_id=d.device_id
                AND i.last_seen > NOW() - INTERVAL '30 days') AS ip_count
       FROM ws_devices d WHERE d.email=$1 ORDER BY d.last_seen DESC`,
    [e]);
  return r.rows;
}

// Гол шалгалт. ok=false үед error: NO_DEVICE | DEVICE_LIMIT
async function check(email, devId, req) {
  const e = String(email || '').trim().toLowerCase();
  let d = clean(devId);
  if (!e) return { ok: false, error: 'NO_EMAIL' };
  if (!d) return { ok: false, error: 'NO_DEVICE' };
  await ensureTable();
  const fp = fpFrom(req);
  const ip = ipOf(req);

  /* ── Хурууны хээгээр баталгаажуулах ──
     Зөвхөн device_id-гаар бол localStorage-оо хуулж өгөхөд хязгаар өнгөрнө.
     Тиймээс байр бүрд тухайн МАШИНЫ хээг хадгална:
       • хээ таарвал        → тэр байр
       • хээ зөрсөн ба 30 хоногт анх удаа → жинхэнэ төхөөрөмж өөрчлөлт гэж үзээд шинэчилнэ
       • хээ зөрсөн, дахиад → ӨӨР МАШИН гэж үзээд тусдаа байр эзэлнэ (сул байргүй бол хаана) */
  const cur = await pool.query(
    'SELECT device_id, fp, fp_changed_at FROM ws_devices WHERE email=$1 AND device_id=$2', [e, d]);
  if (cur.rows.length) {
    const row = cur.rows[0];
    const same = !fp || !row.fp || row.fp === fp;
    if (same) {
      await pool.query(
        'UPDATE ws_devices SET last_seen=NOW(), ip=COALESCE($3, ip), fp=COALESCE(fp, $4) WHERE email=$1 AND device_id=$2',
        [e, d, ip, fp]);
      await touchIp(e, d, ip);
      return { ok: true, slot: 'existing' };
    }
    const changedAt = row.fp_changed_at ? new Date(row.fp_changed_at).getTime() : 0;
    const healOk = Date.now() - changedAt > FP_HEAL_DAYS * 86400000;
    if (healOk) {
      await pool.query(
        'UPDATE ws_devices SET fp=$3, fp_changed_at=NOW(), last_seen=NOW(), ip=COALESCE($4, ip), ua=$5, label=$6 WHERE email=$1 AND device_id=$2',
        [e, d, fp, ip, uaOf(req), labelFromUA(uaOf(req))]);
      await touchIp(e, d, ip);
      return { ok: true, slot: 'refit' };
    }
    // Хуулбарласан байдалтай — энэ машин өөрийн байртай байх ёстой
    d = (d + '.' + fp).slice(0, 64);
    const alt = await pool.query(
      'UPDATE ws_devices SET last_seen=NOW(), ip=COALESCE($3, ip) WHERE email=$1 AND device_id=$2 RETURNING device_id',
      [e, d, ip]);
    if (alt.rows.length) { await touchIp(e, d, ip); return { ok: true, slot: 'existing' }; }
  } else {
    // Бүртгэлтэй бол — зөвхөн хугацааг нь шинэчилнэ
    const up = await pool.query(
      'UPDATE ws_devices SET last_seen=NOW(), ip=COALESCE($3, ip) WHERE email=$1 AND device_id=$2 RETURNING device_id',
      [e, d, ip]);
    if (up.rows.length) { await touchIp(e, d, ip); return { ok: true, slot: 'existing' }; }
  }

  /* Удаан хэрэглээгүй төхөөрөмжийг суллана — localStorage цэвэрлэсэн, утсаа
     сольсон хүмүүс мөнхөд гацахгүй байх. */
  await pool.query(
    `DELETE FROM ws_devices WHERE email=$1 AND last_seen < NOW() - INTERVAL '${IDLE_DAYS} days'`,
    [e]).catch(() => {});

  // Шинэ төхөөрөмж — сул байр байна уу?
  const c = await pool.query('SELECT COUNT(*)::int AS n FROM ws_devices WHERE email=$1', [e]);
  const n = (c.rows[0] || {}).n || 0;
  if (n >= MAX_DEVICES) {
    return { ok: false, error: 'DEVICE_LIMIT', max: MAX_DEVICES, devices: await list(e) };
  }
  const ua = uaOf(req);
  await pool.query(
    `INSERT INTO ws_devices (email, device_id, label, ua, ip, fp, fp_changed_at) VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (email, device_id) DO UPDATE SET last_seen=NOW()`,
    [e, d, labelFromUA(ua), ua, ip, fp]).catch(() => {});
  await touchIp(e, d, ip);
  return { ok: true, slot: 'new' };
}

// Төхөөрөмж салгах — сүүлийн 30 хоногт SWAP_MAX-аас олон удаа болохгүй
async function remove(email, devId) {
  await ensureTable();
  const e = String(email || '').trim().toLowerCase();
  const d = clean(devId);
  if (!e || !d) return { ok: false, error: 'BAD_INPUT' };
  const q = await pool.query(
    `SELECT COUNT(*)::int AS n FROM ws_device_swaps WHERE email=$1 AND at > NOW() - INTERVAL '${SWAP_DAYS} days'`,
    [e]);
  if (((q.rows[0] || {}).n || 0) >= SWAP_MAX) {
    return { ok: false, error: 'SWAP_LIMIT', max: SWAP_MAX, days: SWAP_DAYS };
  }
  const r = await pool.query('DELETE FROM ws_devices WHERE email=$1 AND device_id=$2 RETURNING device_id', [e, d]);
  if (!r.rows.length) return { ok: false, error: 'NOT_FOUND' };
  await pool.query('INSERT INTO ws_device_swaps (email, device_id) VALUES ($1,$2)', [e, d]).catch(() => {});
  return { ok: true };
}

module.exports = { MAX_DEVICES, SWAP_MAX, SWAP_DAYS, ensureTable, deviceIdFrom, check, list, remove, labelFromUA };
