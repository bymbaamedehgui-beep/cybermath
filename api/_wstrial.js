// ҮНЭГҮЙ ТУРШИЛТ — Дасгалын төвийн ажлын хуудас (бүх анги, ws_access шиг), анхдагч 5 минут. Бүртгэлтэй, ажлын
// хуудасны эрх ХЭЗЭЭ Ч аваагүй данс бүрт НЭГ удаа — шинэ данс ч, деплойгоос өмнөх хуучин данс ч (бүртгэсэн огноо хамаагүй).
//
// Дүрэм:
//   • Эрх бүхий (eligible) данс = ws_login: баталгаажсан (verified), нууц үгтэй (pass_hash <> '!'), утас нь SMS-ээр
//     батлагдсан (phone_verified_at — SMS/verify.mn) ЭСВЭЛ урилгын бус (invite IS NULL — SMS-ээс өмнө имэйлээр
//     баталгаажсан хуучин данс; PHONE_TOO_MANY-тэй ижил дүрэм), МӨН «эрх авсан» мөр НЭГ Ч байхгүй (bought(): ws_access,
//     ws_grade_access, ws_purchases, ws_admin_grants game_key IS NULL) — хугацаа нь дууссан эрх, админы олголт (мөнгөгүй),
//     админ цуцалсан (ws_access мөр устсан ч төлбөр/олголтын бүртгэл үлддэг) ч «худалдаж авсан» гэж тооцно. Админ бэлтгэсэн мөр, урилгын
//     линкээр SMS-гүй үүссэн данс туршилт авахгүй (урилгаар хязгааргүй шинэ имэйл нээж туршилт цуглуулна;
//     батлагдаагүй утсаар хүний 'ph:' тэмдгийг түрүүлж эзэлнэ). Урилгын данс SMS-ээр утсаа баталбал (ws_reset) л болно.
//     SMS-гүй шинэ урилгын бус данс одоо үүсэх замгүй (бүртгэл/сэргээлт бүр phone_verified_at тавьдаг) — хуучнууд л.
//   • Төлсөн хэрэглэгч шинэ имэйлээр туршилт авахгүй (PRIOR): ижил утастай (батлагдсан, эсвэл урилгын бус) эсвэл энэ
//     cm_device-ийг (ws_devices) ашигласан, эрх АВСАН (bought()) өөр данс байвал
//     denied='phone'|'dev'. Эрхгүй өөр данс хаахгүй — тэднийг доорх тэмдэг (нэг төхөөрөмж/утас = нэг туршилт) зохицуулна.
//   • Төхөөрөмж (cm_device) = x-device-id толгой, байхгүй бол wsstatus-ийн токены dev (нэвтрэх үеийн, серверийн гарын
//     үсэгтэй — status(email, req, { dev })). Толгойгүй хүсэлтээр (хуучин кэштэй хуудас) «нэг төхөөрөмж = нэг туршилт» ба
//     PRIOR dev шалгалтыг алгасахгүй.
//   • Эхлэх цэг = дараагийн амжилттай нэвтрэлт (api/worksheets.js wsIssue → start(); бүртгүүлээд автоматаар нэвтэрсэн
//     бол тэр мөч) ЭСВЭЛ эрх шалгах (api/qpay.js wsstatus → status() нөөц зам) — аль нь түрүүлсэн. Токентой хуучин
//     хэрэглэгч ихэвчлэн хуудас нээх үед (status) эхэлнэ. Дахин нэвтэрсэн, токен/төхөөрөмж сольсон ч СУНГАХГҮЙ
//     (ws_trials PK + ON CONFLICT DO NOTHING). Туршилт эхэлсний дараа эрх авсан ч мөр нь хэвээр (дахин эхлэхгүй).
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
//   WS_TRIAL_FROM     ISO огноо — тавьсан (хүчинтэй) бол туршилтыг идэвхжүүлнэ (тест/гар удирдлага). Тавиагүй (эсвэл
//                     буруу) бол DB-ийн ws_trial_cfg('from') — энэ код PRODUCTION-д (canAnchor) анх ажилласан мөч
//                     (= деплой), нэг л удаа бичигдэж хэзээ ч өөрчлөгдөхгүй. Preview/локал (.env.local нь prod DB!) үүнийг
//                     ҮҮСГЭХГҮЙ — зөвхөн уншина; байхгүй бол туршилт унтраалттай. Огноо нь SQL нөхцөлд ОРОХГҮЙ (бүртгэсэн
//                     огноогоор шүүхгүй) — зөвхөн «preview/локалаас prod DB-д туршилт эхлүүлэхгүй» хамгаалалт.
//                     Кодонд хатуу огноо БАЙХГҮЙ (коммит ≠ деплой).
//   WS_TRIAL_IP_DAY   анхдагч 0 (унтраалттай). N>0 бол нэг IP-ээс өдөрт N туршилт, хэтэрвэл denied='ip'.
//
// API:
//   start(email, req)   → view | null   (wsIssue: нэвтрэлт бүрд; аль хэдийн эхэлсэн бол тэр хэвээр)
//   status(email, req, o) → view | null (qpay wsstatus: идэвхтэй эрхгүй үед; эхлээгүй ч eligible бол нөөц start;
//                                        o.dev — токены dev, толгой байхгүй үед төхөөрөмж болно)
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
/* Туршилт идэвхтэй эсэхийн хаалга: ISO | null (= туршилт энэ дуудлагад унтраалттай). env → DB anchor. Anchor-ийг
   зөвхөн production үүсгэнэ: деплойгоос өмнө локал/preview-оор prod DB-д хүрсэн үед туршилт эхлэхгүй. Утгыг SQL-д
   ашиглахгүй (бүртгэсэн огноогоор шүүхгүй). Нэг удаа уншаад cold start-ын турш кэшилнэ (өөрчлөгддөггүй).
   Алдаа → шиднэ (дуудагч туршилтгүй гэж үзнэ). */
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

/* «Ажлын хуудасны эрх АВСАН» данс (col — имэйлийн багана): ELIG ба PRIOR-ын НЭГ тодорхойлолт. Хугацаа дууссан ч
   (expires_at-аар шүүхгүй), админ цуцалсан ч (ws_revoke нь ws_access/ws_grade_access мөрийг устгадаг — төлбөр
   ws_purchases, админы олголт ws_admin_grants-д бүртгэл үлддэг). ws_admin_grants-ийн game_key-тэй мөр = тоглоомын
   олголт → тооцохгүй. Хүснэгт байхгүйгээс унахгүйн тулд ensure() үүсгэнэ. */
function bought(col) {
  return 'EXISTS (SELECT 1 FROM ws_access a WHERE LOWER(a.email) = ' + col + ') '
    + 'OR EXISTS (SELECT 1 FROM ws_grade_access g WHERE LOWER(g.email) = ' + col + ') '
    + 'OR EXISTS (SELECT 1 FROM ws_purchases p WHERE LOWER(p.email) = ' + col + ') '
    + 'OR EXISTS (SELECT 1 FROM ws_admin_grants m WHERE LOWER(m.email) = ' + col + ' AND m.game_key IS NULL)';
}
// tests/_gamefake.js, tests/_smsfake.js яг эдгээр мөрийг (хоосон зай нормчилсон) таньдаг — өөрчилбөл тэнд ч шинэчилнэ.
const SQL = {
  /* eligible: баталгаажсан, нууц үгтэй, утас SMS-ээр батлагдсан эсвэл урилгын бус, ажлын хуудасны эрх (bought —
     дууссан ч, админы олголт ч, цуцлагдсан ч) ХЭЗЭЭ Ч аваагүй. created_at-аар шүүхгүй. */
  ELIG: "SELECT l.phone, (l.verified = TRUE AND l.pass_hash <> '!' AND (l.phone_verified_at IS NOT NULL OR l.invite IS NULL) "
    + 'AND NOT (' + bought('l.email') + ')) AS eligible, '
    + 't.started_at, t.trial_until, t.seconds, t.denied, (t.trial_until > NOW()) AS active, NOW() AS now '
    + 'FROM ws_login l LEFT JOIN ws_trials t ON t.email = l.email WHERE l.email = $1',
  /* Эрх АВСАН (bought) өөр данс энэ утсыг (батлагдсан, эсвэл урилгын бус — PHONE_TOO_MANY-тэй ижил дүрэм) эсвэл
     энэ cm_device-ийг ($3, ws_devices) эзэмшдэг эсэх. $2/$3 NULL бол тухайн шалгалт false. */
  PRIOR: 'SELECT EXISTS (SELECT 1 FROM ws_login o WHERE o.phone = $2 AND o.email <> $1 AND o.verified = TRUE '
    + 'AND (o.phone_verified_at IS NOT NULL OR o.invite IS NULL) '
    + 'AND (' + bought('o.email') + ')) AS phone, '
    + 'EXISTS (SELECT 1 FROM ws_devices d WHERE d.device_id = $3 AND d.email <> $1 '
    + 'AND (' + bought('d.email') + ')) AS dev',
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
    /* bought()-ын хүснэгтүүд — api/qpay.js ensureWsExtra / ensureAdminGrants-тай ЯГ ИЖИЛ бүтэц (тэд CREATE IF NOT EXISTS +
       ADD COLUMN IF NOT EXISTS тул аль нь түрүүлж үүсгэсэн ч ижил). Худалдан авалт / админы олголт хэзээ ч болоогүй DB-д
       хүснэгт байхгүйгээс ELIG/PRIOR унаж туршилт бүхэлдээ унтрахаас сэргийлнэ. Өгөгдөл БИЧИХГҮЙ. */
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_purchases (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      amount INT NOT NULL,
      promo TEXT,
      invoice_id TEXT UNIQUE,
      months INT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      grade TEXT
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_admin_grants (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      grade TEXT,
      months INT NOT NULL DEFAULT 1,
      amount INT NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT 'admin',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      game_key TEXT,
      realm TEXT,
      days INT
    )`);
    // Тоглоомын олголтоос өмнөх хүснэгтэд game_key байхгүй байж болно. Багана байвал ALTER (ACCESS EXCLUSIVE түгжээ) хийхгүй.
    const gk = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'ws_admin_grants' AND column_name = 'game_key'");
    if (!gk.rows.length) await pool.query('ALTER TABLE ws_admin_grants ADD COLUMN IF NOT EXISTS game_key TEXT');
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
// Утас нь eligible данснаас л ирнэ (SMS-ээр батлагдсан, эсвэл SMS-ээс өмнөх урилгын бус хуучин данс — PHONE_TOO_MANY
// тэдний утсыг эзэмшсэн гэж тооцдогтой ижил) — урилгын батлагдаагүй утас тэмдэг болохгүй.
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
  if (!(await fromIso())) return null;                       // деплойн мөч тодорхойгүй (preview/локал) — туршилтгүй
  const row = (await pool.query(SQL.ELIG, [email])).rows[0];
  return begin(email, req, row, secs, null);
}
// tokDev — wsstatus-ийн токены dev (status-оос). Толгой (x-device-id) давамгайлна (толгой≠токен бол qpay аль хэдийн хаасан).
async function begin(email, req, row, secs, tokDev) {
  if (!row) return null;
  if (row.trial_until != null) return view(row);            // аль хэдийн эхэлсэн (эсвэл дууссан) — СУНГАХГҮЙ
  if (!row.eligible) return null;                            // эрх авсан / баталгаажаагүй / бэлтгэсэн / урилгын данс — юу ч бичихгүй
  const dev = WDEV.deviceIdFrom(req) || WDEV.clean(tokDev), ph = phoneLocal(row.phone);
  let denied = null;
  // Эрх авсан өөр данс (төлсөн хэрэглэгч шинэ имэйлээр) — тэд тэмдэг бичээгүй тул утас/төхөөрөмжийг шууд шалгана
  if (ph || dev) {
    const pr = (await pool.query(SQL.PRIOR, [email, ph, dev])).rows[0] || {};
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

async function status(email, req, o) {
  const secs = seconds();
  if (!secs) return null;
  email = lc(email);
  if (!email) return null;
  await ensure();
  if (!(await fromIso())) return null;
  const row = (await pool.query(SQL.ELIG, [email])).rows[0];
  if (!row) return null;
  /* Нөөц зам: токентой (дахин нэвтрэхгүй) хуучин хэрэглэгч, эсвэл нэвтрэх үеийн start DB алдаагаар унасан данс —
     эрх шалгах (хуудас нээх) үед эхлүүлнэ (нэг л удаа). */
  if (row.trial_until == null) return row.eligible ? begin(email, req, row, secs, (o && o.dev) || null) : null;
  return view(row);
}

module.exports = { SQL, seconds, fromIso, start, status, view, ensure,
  _resetReady: function () { ready = false; anchor = null; warned = false; } };
