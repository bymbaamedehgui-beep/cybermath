// Шинэ дансны ҮНЭГҮЙ ТУРШИЛТ — Дасгалын төвийн ажлын хуудас (бүх анги, ws_access шиг), анхдагч 5 минут.
//
// Дүрэм:
//   • «Шинэ хэрэглэгч» = ws_login.created_at ≥ деплойн мөч (fromIso), баталгаажсан (verified), нууц үгтэй
//     (pass_hash <> '!'), УТАС НЬ БАТЛАГДСАН (phone_verified_at — SMS/verify.mn) данс. Хуучин данс, админ бэлтгэсэн мөр,
//     урилгын линкээр SMS-гүй үүссэн данс туршилт авахгүй (урилгаар хязгааргүй шинэ имэйл нээж туршилт цуглуулна;
//     батлагдаагүй утсаар хүний 'ph:' тэмдгийг түрүүлж эзэлнэ). Урилгын данс SMS-ээр утсаа баталбал (ws_reset) л болно.
//   • Деплойгоос ӨМНӨХ данснууд тэмдэг бичээгүй тул тэдний утас/төхөөрөмжийг шууд шалгана (PRIOR): ижил батлагдсан
//     утастай эсвэл энэ cm_device-ийг ашигласан хуучин данс байвал denied='phone'|'dev' (хуучин хэрэглэгч шинэ имэйл).
//   • Эхлэх цэг = АНХНЫ амжилттай нэвтрэлт (api/worksheets.js wsIssue → start()). Бүртгүүлээд автоматаар нэвтэрсэн
//     бол тэр мөч. Дахин нэвтэрсэн, токен/төхөөрөмж сольсон ч СУНГАХГҮЙ (ws_trials PK + ON CONFLICT DO NOTHING).
//   • Хугацааг ЗӨВХӨН серверийн (DB) цагаар: trial_until = NOW() + seconds, идэвхтэй эсэх = trial_until > NOW()
//     (SQL дотор). Клиентийн цаг/параметрт итгэхгүй — клиент зөвхөн server_now-оор зөрүүгээ засаж тоолуур зурна.
//   • Нэг төхөөрөмж (cm_device) / нэг утас → нэг туршилт (ws_trial_marks). Өөр данс эзэмшсэн бол туршилт
//     0 секунд (шууд дууссан) + denied='dev'|'phone'. fp-ээр ХААХГҮЙ (prod: нэг fp 13 имэйлд — сургуулийн компьютер),
//     зөвхөн аудитад ws_trials.fp-д хадгална.
//   • ws_access-д ХЭЗЭЭ Ч бичихгүй (wsEntitled, тайлан, broadcast-ын үзэгчид өөрчлөгдөхгүй). ws_login-д ALTER хийхгүй.
//   • Тоглоомд хамаарахгүй (api/games.js үүнийг дууддаггүй).
//
// env (дуудлага бүрд уншина):
//   WS_TRIAL_SECONDS  анхдагч 300; 0 эсвэл off = бүрэн унтраалттай (SQL 0). Дээд тал 3600.
//   WS_TRIAL_FROM     ISO огноо — үүнээс хойш бүртгүүлсэн данс «шинэ». Тавиагүй (эсвэл буруу) бол DB-ийн
//                     ws_trial_cfg('from') — энэ код PRODUCTION-д (canAnchor) анх ажилласан мөч (= деплой), нэг л удаа
//                     бичигдэж хэзээ ч өөрчлөгдөхгүй. Preview/локал (.env.local нь prod DB!) үүнийг ҮҮСГЭХГҮЙ — зөвхөн
//                     уншина; байхгүй бол туршилт унтраалттай. Кодонд хатуу огноо БАЙХГҮЙ (коммит ≠ деплой).
//   WS_TRIAL_IP_DAY   анхдагч 0 (унтраалттай). N>0 бол нэг IP-ээс өдөрт N туршилт, хэтэрвэл denied='ip'.
//
// API:
//   start(email, req)   → view | null   (wsIssue: нэвтрэлт бүрд; аль хэдийн эхэлсэн бол тэр хэвээр)
//   status(email, req)  → view | null   (qpay wsstatus: эрхгүй үед; эхлээгүй ч шинэ данс бол нөөц start)
//   view = { until, started_at, server_now (ms), seconds, active, denied }
'use strict';
const pool = require('./_db');
const crypto = require('crypto');
const WDEV = require('./_wsdev');
const sms = require('./_sms');
const { rateLimit, clientIp } = require('./_guard');

const DEFAULT_SECONDS = 300;
const MAX_SECONDS = 3600;

function seconds() {
  const raw = process.env.WS_TRIAL_SECONDS;
  if (raw == null || String(raw).trim() === '') return DEFAULT_SECONDS;
  if (/^(off|false|no)$/i.test(String(raw).trim())) return 0;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_SECONDS;
  return Math.max(0, Math.min(MAX_SECONDS, n));
}
function envFrom() {
  const raw = String(process.env.WS_TRIAL_FROM || '').trim();
  const t = raw ? Date.parse(raw) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}
/* «Шинэ данс»-ны доод хил (ISO) | null (= туршилт энэ дуудлагад унтраалттай). env → DB anchor. Anchor-ийг зөвхөн
   production үүсгэнэ: коммитоос деплой хүртэл, эсвэл локал/preview-оор prod DB-д хүрсэн үед бүртгүүлсэн данс «шинэ»
   болохгүй. Нэг удаа уншаад cold start-ын турш кэшилнэ (өөрчлөгддөггүй). Алдаа → шиднэ (дуудагч туршилтгүй гэж үзнэ). */
let anchor = null, warned = false;
// Production деплой уу: VERCEL_ENV=production; Vercel-ийн системийн хувьсагчийг ил гаргаагүй (VERCEL_ENV байхгүй)
// төсөлд — серверлесс runtime (AWS_LAMBDA_FUNCTION_NAME) дээр. preview/development, локал node/тест → үгүй.
function canAnchor() {
  const v = String(process.env.VERCEL_ENV || '').trim();
  if (v) return v === 'production';
  return !!process.env.AWS_LAMBDA_FUNCTION_NAME;
}
async function fromIso() {
  const e = envFrom();
  if (e) return e;
  if (anchor) return anchor;
  await ensure();
  if (canAnchor()) await pool.query(SQL.CFG_INS);
  const r = await pool.query(SQL.CFG_GET);
  const a = r.rows[0] ? iso(r.rows[0].at) : null;
  if (a) anchor = a;
  else if (!warned) { warned = true; console.warn('[wstrial] деплойн мөч алга (WS_TRIAL_FROM / ws_trial_cfg) — туршилт унтраалттай'); }
  return a;
}
function ipDayMax() {
  const n = parseInt(process.env.WS_TRIAL_IP_DAY || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// tests/_gamefake.js, tests/_smsfake.js яг эдгээр мөрийг (хоосон зай нормчилсон) таньдаг — өөрчилбөл тэнд ч шинэчилнэ.
const SQL = {
  ELIG: "SELECT l.phone, (l.verified = TRUE AND l.pass_hash <> '!' AND l.phone_verified_at IS NOT NULL "
    + 'AND l.created_at >= $2::timestamptz) AS eligible, '
    + 't.started_at, t.trial_until, t.seconds, t.denied, (t.trial_until > NOW()) AS active, NOW() AS now '
    + 'FROM ws_login l LEFT JOIN ws_trials t ON t.email = l.email WHERE l.email = $1',
  /* Деплойгоос өмнөх (created_at < $3) данс энэ утсыг (батлагдсан, эсвэл урилгын бус — PHONE_TOO_MANY-тэй ижил дүрэм)
     эсвэл энэ cm_device-ийг ($4, ws_devices) эзэмшдэг эсэх. $2/$4 NULL бол тухайн шалгалт false. */
  PRIOR: 'SELECT EXISTS (SELECT 1 FROM ws_login o WHERE o.phone = $2 AND o.email <> $1 AND o.verified = TRUE '
    + 'AND (o.phone_verified_at IS NOT NULL OR o.invite IS NULL) AND o.created_at < $3::timestamptz) AS phone, '
    + 'EXISTS (SELECT 1 FROM ws_devices d JOIN ws_login o ON o.email = d.email WHERE d.device_id = $4 AND d.email <> $1 '
    + 'AND o.created_at < $3::timestamptz) AS dev',
  CFG_INS: "INSERT INTO ws_trial_cfg (k, at) VALUES ('from', NOW()) ON CONFLICT (k) DO NOTHING",
  CFG_GET: "SELECT at FROM ws_trial_cfg WHERE k = 'from'",
  MARK_OWNERS: 'SELECT mark, email FROM ws_trial_marks WHERE mark = ANY($1::text[])',
  MARK_INS: 'INSERT INTO ws_trial_marks (mark, email) VALUES ($1, $2) ON CONFLICT (mark) DO NOTHING',
  INS: 'INSERT INTO ws_trials (email, started_at, trial_until, seconds, device_id, fp, denied) '
    + 'VALUES ($1, NOW(), NOW() + make_interval(secs => $2::int), $2::int, $3, $4, $5) ON CONFLICT (email) DO NOTHING '
    + 'RETURNING started_at, trial_until, seconds, denied, (trial_until > NOW()) AS active, NOW() AS now',
  GET: 'SELECT started_at, trial_until, seconds, denied, (trial_until > NOW()) AS active, NOW() AS now FROM ws_trials WHERE email = $1',
};

/* Lazy schema — cold start тутамд нэг л удаа (wsstatus хүсэлт бүрд DDL хийхгүй). Алдаа гарвал дараагийн
   дуудлагад дахин оролдоно; хүснэгт үнэхээр байхгүй бол доорх асуулт алдаа өгч, дуудагч туршилтгүй гэж үзнэ. */
let ready = false;
async function ensure() {
  if (ready) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_trials (
      email TEXT PRIMARY KEY,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      trial_until TIMESTAMPTZ NOT NULL,
      seconds INT NOT NULL,
      device_id TEXT,
      fp TEXT,
      denied TEXT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_trial_marks (
      mark TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_trial_cfg (
      k TEXT PRIMARY KEY,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    ready = true;
  } catch (e) { console.error('[wstrial ddl]', e.message); }
}

function lc(e) { return String(e == null ? '' : e).trim().toLowerCase(); }
function iso(v) {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
// Клиентэд буцаах хэлбэр. active-ийг DB (trial_until > NOW()) шийднэ; server_now-оор клиент цагийн зөрүүгээ засна.
function view(r) {
  const now = new Date(r.now).getTime();
  return {
    until: iso(r.trial_until),
    started_at: iso(r.started_at),
    server_now: Number.isFinite(now) ? now : null,
    seconds: Number(r.seconds) || 0,
    active: r.active === true,
    denied: r.denied || null,
  };
}
// Тэмдэг: 'dev:<cm_device>' (байвал), 'ph:<sha256(утас)>' (хүчинтэй утас байвал). Түүхий утас хадгалахгүй.
// Утас нь eligible (phone_verified_at) данснаас л ирнэ — батлагдаагүй утас тэмдэг болохгүй.
function devMark(dev) { return dev ? 'dev:' + dev : null; }
function phoneLocal(phone) { const pn = sms.normalizePhone(phone); return pn.ok ? pn.local : null; }
function phoneMark(local) {
  return local ? 'ph:' + crypto.createHash('sha256').update('wstrial|ph|' + local).digest('hex').slice(0, 32) : null;
}
function ipHash(ip) { return crypto.createHash('sha256').update('wstrial|ip|' + String(ip || '')).digest('hex').slice(0, 16); }
// Тэмдгийг өөр имэйл эзэмшсэн бол 'dev' | 'phone', эс бөгөөс null
function deniedBy(rows, email, marks) {
  for (const m of marks) {
    const r = (rows || []).filter(function (x) { return x.mark === m; })[0];
    if (r && lc(r.email) !== email) return m.indexOf('dev:') === 0 ? 'dev' : 'phone';
  }
  return null;
}

async function start(email, req) {
  const secs = seconds();
  if (!secs) return null;
  email = lc(email);
  if (!email) return null;
  await ensure();
  const from = await fromIso();
  if (!from) return null;                                    // деплойн мөч тодорхойгүй (preview/локал) — туршилтгүй
  const row = (await pool.query(SQL.ELIG, [email, from])).rows[0];
  return begin(email, req, row, from, secs);
}
async function begin(email, req, row, from, secs) {
  if (!row) return null;
  if (row.trial_until != null) return view(row);            // аль хэдийн эхэлсэн (эсвэл дууссан) — СУНГАХГҮЙ
  if (!row.eligible) return null;                            // хуучин / баталгаажаагүй / бэлтгэсэн / урилгын данс — юу ч бичихгүй
  const dev = WDEV.deviceIdFrom(req), ph = phoneLocal(row.phone);
  let denied = null;
  // Деплойгоос өмнөх данснууд тэмдэг бичээгүй — тэдний утас/төхөөрөмжийг шууд шалгана
  if (ph || dev) {
    const pr = (await pool.query(SQL.PRIOR, [email, ph, from, dev])).rows[0] || {};
    denied = pr.phone === true ? 'phone' : pr.dev === true ? 'dev' : null;
  }
  const marks = [devMark(dev), phoneMark(ph)].filter(Boolean);
  if (!denied && marks.length) {
    denied = deniedBy((await pool.query(SQL.MARK_OWNERS, [marks])).rows, email, marks);
    if (!denied) {
      for (const m of marks) await pool.query(SQL.MARK_INS, [m, email]);
      // Зэрэг өөр данс ижил тэмдгийг түрүүлж авсан эсэх (race) — дахин уншина
      denied = deniedBy((await pool.query(SQL.MARK_OWNERS, [marks])).rows, email, marks);
    }
  }
  const ipMax = ipDayMax();
  if (!denied && ipMax && !(await rateLimit('wstrial:ip:' + ipHash(clientIp(req)), ipMax, 86400))) denied = 'ip';
  const ins = await pool.query(SQL.INS, [email, denied ? 0 : secs, dev, WDEV.fpFrom(req), denied]);
  const r = ins.rows[0] || (await pool.query(SQL.GET, [email])).rows[0];   // зэрэг нэвтрэлт — нөгөөх нь бичсэн
  return r ? view(r) : null;
}

async function status(email, req) {
  const secs = seconds();
  if (!secs) return null;
  email = lc(email);
  if (!email) return null;
  await ensure();
  const from = await fromIso();
  if (!from) return null;
  const row = (await pool.query(SQL.ELIG, [email, from])).rows[0];
  if (!row) return null;
  /* Нөөц зам: нэвтрэх үеийн start DB алдаагаар унасан, эсвэл деплойн мөчөөс хойш үүссэн ч шинэ код
     ажиллахаас өмнө нэвтэрсэн данс — эрх шалгах үед эхлүүлнэ (нэг л удаа). */
  if (row.trial_until == null) return row.eligible ? begin(email, req, row, from, secs) : null;
  return view(row);
}

module.exports = { SQL, seconds, fromIso, start, status, view, ensure,
  _resetReady: function () { ready = false; anchor = null; warned = false; } };
