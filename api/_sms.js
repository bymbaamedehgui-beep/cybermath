// SMS баталгаажуулах код — textbee.dev (эзэмшигчийн Android утас) руу илгээх НЭГ модуль.
// Квот (rate_limits), илгээлтийн лог (sms_log), түр зогсоолт (sms_state), Telegram анхааруулга бүгд энд.
// Спек: sms_spec_v3 §3-§4. api/_guard.js-г хөндөхгүй (P2 merge) — rate туслахууд энэ файлд.
//
// Аюулгүй байдлын инвариант:
//   S1  SMS илгээгдээгүй бол ok:true ХЭЗЭЭ Ч үгүй (sendCode зөвхөн textbee 2xx үед Ok буцаана).
//   S2  Бүтэн дугаар, код, TEXTBEE_API_KEY нь console / Telegram / sms_log / хариунд гарахгүй.
//   S3  Зөвхөн +976 гар утас (^[689]\d{7}$, env SMS_MN_MOBILE_RE).
//   S4  textbee-г дуудахаас ӨМНӨ бүх квот rate_limits дээр атомараар нөөцлөгдөнө; DB алдаа → хаана.
//
// API (тогтвортой — p1-game-auth / p1-ws-sms / P2 ашиглана):
//   normalizePhone(input)        → {ok:true, local:'99112233', e164:'+97699112233'} | {ok:false, code:'PHONE_INVALID'|'PHONE_FOREIGN'}
//   maskPhone(local, n)          → n=4: '**** 2233', бусад: '**** **33'
//   maskEmail(email)             → 'b***a@gmail.com'
//   fakeMask(email)              → '**** **NN' (HMAC-аар тогтвортой, бүртгэлгүй имэйлийн хуурамч хариунд)
//   phoneHash(local)             → hex16
//   ipKeys(ip)                   → {ipk, ip24}  (IPv4 бүтэн | IPv6 /64 ; IPv4 /24 | IPv6 /48), HMAC hex16
//   codeText(purpose, code)      → SMS текст ('verify'|'reset'|'login'), ≤70 тэмдэгт
//   promoNote()                  → Promise<'' | PROMO_NOTE>  /promo-д идэвхтэй код байвал (sendCode 'verify'-д нэмнэ; throw хийхгүй, 60с кэш)
//   precheck({ip, email, kind})  → Promise<null | Fail>   данс хайхаас ӨМНӨ; kind 'reg'|'acct' (бусад → 'reg')
//   sendCode({purpose, phone, email, ip, kind, store, drop, reuse?}) → Promise<Ok | Fail>
//                                   reuse() — хүчинтэй код байвал хугацааг сунгаад ТЭР кодыг буцаана (null → шинэ код)
//                                   store(code) — дуудагч кодыг DB-д бичнэ (throw → SMS_UNAVAILABLE, fetch 0)
//                                   drop(code)  — provider алдаанд ШИНЭ кодыг хүчингүй болгоно (дахин ашигласан кодыг үгүй)
//   markVerified(phone)          → Promise<void>  сүүлийн 30 минутын 'sent' мөрт verified_at (алдаа throw хийхгүй)
//   publicOtpResponse(r)         → whitelist {ok, accepted, masked, cooldown, wait, code, error}
//   padTo(t0)                    → Promise<void>  t0-оос хойш SMS_PAD_MS(700)+randomInt(0,800) мс хүртэл хүлээнэ
//   mkFail(code, {wait, scope, phoneQuota}?) → Fail
//   ERR(codeOrFail, extra?)      → хэрэглэгчид харуулах монгол текст (extra: {reg:'game'|'ws', prepared:true})
//   failJson(res, f, extra?)     → res.status(f.http).json({...extra.fields, ok:false, code, error, wait?, codeStep?})
//   CONTACT                      → env CONTACT_TEXT || 'CyberMath-ийн Facebook хуудсаар холбогдоно уу' (getter)
//   notify(key, winSec, text, max=1) → Promise<bool>  Telegram, rate_limits-ээр давтамж хязгаарлана
//   status()                     → Promise<{configured, device_id, disabled, paused_until, day, reg_day, last30m, reg_last30m,
//                                   month, reg_month, errors24h, unverified30m}>  (DB алдаа → throw)
//   setPause(untilSec|null)      → Promise<void>  (DB алдаа → throw)
//   deviceStatus()               → Promise<{ok:true, devices:[{name, enabled, last_heartbeat}]} | {ok:false, unsupported:true} | {ok:false, cls, http?}>
//   textbeeSend(e164, message)   → Promise<{cls, http, ms, msgId, bodyKeys}>  (scripts/sms-smoke.js; бусад газар sendCode-ийг ашиглана)
//   limits()                     → одоогийн env-ээс уншсан хязгаарууд
//   logErr(tag, e), safeMsg(e), ensureSmsTables()
//                                   SMS явалгүй бүтэлгүйтвэл (SMS_UNCERTAIN-аас бусад) имэйл/дугаарын cooldown-ыг буцаана
// Ok   = {ok:true, masked2, masked4, cooldown:600, expires_in:1200, reused}   — reused: хүчинтэй кодыг дахин илгээсэн эсэх
// Fail = {ok:false, code, http, wait?, scope?:'day'|'month', phoneQuota?:true}   — scope/phoneQuota ДОТООД, клиент рүү гаргахгүй
// Алдааны код: SMS_UNAVAILABLE 503, SMS_UNCERTAIN 503 (wait 600, codeStep), SMS_BUSY 503 (wait 600), SMS_FULL 503,
//              SMS_COOLDOWN 429 (wait; имэйлийнх бол codeStep), SMS_LIMIT 429, PHONE_INVALID/PHONE_FOREIGN/PHONE_TOO_MANY 400,
//              NEED_LOGIN/NEED_ADMIN/NO_PHONE 409, TOKEN_STALE 401
const crypto = require('crypto');
const pool = require('./_db');
const guard = require('./_guard');
const tg = require('./_telegram');

const TEXTBEE_SEND_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';
const TEXTBEE_DEVICES_URL = 'https://api.textbee.dev/api/v1/gateway/devices';
// Нэг хүнд (имэйл, дугаар тус бүр) 10 минутад 1 SMS. Код 20 минут хүчинтэй: 10 минутын дараа дахин хүсэхэд
// (reuse) ТЭР кодыг сунгаж илгээнэ — хоцорч ирсэн анхны SMS ч зөв хэвээр.
const COOLDOWN_SEC = 600;
const CODE_TTL_SEC = 1200;
const CODE_TTL_MS = CODE_TTL_SEC * 1000;
const DAY_WIN = 86400;
const MONTH_WIN = 3456000; // 40 хоног
const T30_WIN = 1800;
const DEFAULT_MN_RE = /^[689]\d{7}$/;
const PH_REG_DAY_MAX = 3;
const PH_ACCT_DAY_MAX = 6;
const EM_IP_DAY_MAX = 4;
const EM_DAY_MAX = 10;

// ───────────────────────── env (дуудлага бүрт уншина) ─────────────────────────
function envStr(name) { const v = process.env[name]; return v == null ? '' : String(v).trim(); }
function intEnv(name, def) { const n = parseInt(envStr(name), 10); return Number.isFinite(n) && n > 0 ? n : def; }
// Нийт хязгаар: env тавиагүй → def, '0' → хязгааргүй (Infinity), эерэг тоо → тэр хязгаар
function capEnv(name, def) {
  const s = envStr(name);
  if (!s) return def;
  const n = parseInt(s, 10);
  if (n === 0) return Infinity;
  return Number.isFinite(n) && n > 0 ? n : def;
}

// textbee Pro (2026-09-21): өдөр / 30 минутын нийт хязгааргүй. Сар — Pro багцын 5000-аас бага хамгаалалт.
// Android ~30 SMS/30 мин хязгаарыг утсан дээр adb-ээр өргөсгөнө (sms_outgoing_check_max_count).
function limits() {
  const month = capEnv('SMS_MONTH_MAX', 4900);
  return {
    day: capEnv('SMS_DAY_MAX', Infinity),
    t30: capEnv('SMS_30MIN_MAX', Infinity),
    month: month,
    regDay: capEnv('SMS_REG_DAY_MAX', Infinity),
    regT30: capEnv('SMS_REG_30MIN_MAX', Infinity),
    // Сар бүр нууц үг сэргээлт/нэвтрэлтэд (acct) дор хаяж 60 үлдээнэ
    regMonth: Math.max(0, capEnv('SMS_REG_MONTH_MAX', Math.max(0, month - 60))),
    // IP (сургуулийн нэг NAT-аас олон багш) — хүн тус бүрийн хязгаар нь имэйл/дугаарын cooldown
    ip: intEnv('SMS_IP_HOUR_MAX', 100),
    ip24: intEnv('SMS_IP24_HOUR_MAX', 200),
    timeout: Math.min(9000, Math.max(2000, intEnv('SMS_TIMEOUT_MS', 8000))),
  };
}
function apiKey() { return envStr('TEXTBEE_API_KEY'); }
// Нэг дугаарт verified данс (тоглоом, ws тус тусдаа) — SMS_MAX_ACCOUNTS_PER_PHONE, анхдагч 5
function maxAccountsPerPhone() { return intEnv('SMS_MAX_ACCOUNTS_PER_PHONE', 5); }
// SMS-ээс өмнө имэйлээр батлагдсан дансны утсанд итгэх эсэх (SMS_TRUST_LEGACY_PHONE=0 бол үгүй)
function trustLegacyPhone() { return envStr('SMS_TRUST_LEGACY_PHONE') !== '0'; }
function disabled() { return envStr('SMS_DISABLED') === '1'; }
function contact() { return envStr('CONTACT_TEXT') || 'CyberMath-ийн Facebook хуудсаар холбогдоно уу'; }
function mobileRe() {
  const s = envStr('SMS_MN_MOBILE_RE');
  if (!s) return DEFAULT_MN_RE;
  try { return new RegExp(s); } catch (e) { return DEFAULT_MN_RE; }
}
function hashKey() {
  const base = envStr('SMS_HASH_KEY') || guard.jwtSecret();
  return base ? crypto.createHash('sha256').update('cm-sms|' + base).digest() : null;
}
function hmacHex(label) {
  const k = hashKey();
  // Түлхүүргүй үед precheck/sendCode аль хэдийн SMS_UNAVAILABLE өгнө; энд зөвхөн түүхий утга задрахаас сэргийлнэ
  return k ? crypto.createHmac('sha256', k).update(label).digest('hex')
    : crypto.createHash('sha256').update('cm-sms-nokey|' + label).digest('hex');
}
function normEmail(e) { return String(e == null ? '' : e).trim().toLowerCase().slice(0, 254); }

// ───────────────────────── лог ─────────────────────────
// detail / stack / where / parameters хэзээ ч бичихгүй (pg-ийн detail-д бүтэн мөр, утас, код орж болно)
function safeMsg(e) {
  if (!e) return '';
  if (e instanceof SyntaxError || e.name === 'SyntaxError') return 'SyntaxError';
  const code = e.code == null ? '' : String(e.code);
  if (/^2[23][0-9A-Z]{3}$/.test(code)) return '';
  // 6+ оронтой тоо, мөн '9911-2233', '99 11 22 33' маягийн тусгаарлагчтай дугаар → <n>
  return String(e.message || '').slice(0, 200).replace(/\d(?:[\s-]?\d){5,}/g, '<n>');
}
function logErr(tag, e) { console.error(tag, (e && e.code) || null, safeMsg(e)); }

// ───────────────────────── дугаар, маск, түлхүүр ─────────────────────────
function normalizePhone(input) {
  const s = String(input == null ? '' : input).normalize('NFKC').replace(/[\s\-().·‐-―]/g, '');
  const m = s.match(/^\+976(\d{8})$/) || s.match(/^00976(\d{8})$/) || s.match(/^976(\d{8})$/) || s.match(/^(\d{8})$/);
  if (!m) {
    if (/^(\+|00)976/.test(s)) return { ok: false, code: 'PHONE_INVALID' };
    if (/^(\+|00)\d/.test(s) || /^\d{10,15}$/.test(s)) return { ok: false, code: 'PHONE_FOREIGN' };
    return { ok: false, code: 'PHONE_INVALID' };
  }
  const local = m[1];
  if (!mobileRe().test(local)) return { ok: false, code: 'PHONE_INVALID' };
  return { ok: true, local: local, e164: '+976' + local };
}

function maskPhone(local, n) {
  const d = String(local == null ? '' : local).replace(/\D/g, '').slice(-8);
  if (n === 4) return d.length >= 4 ? '**** ' + d.slice(-4) : '****';
  return d.length >= 2 ? '**** **' + d.slice(-2) : '****';
}

function maskEmail(e) {
  const s = normEmail(e), at = s.lastIndexOf('@');
  if (at < 1) return '***';
  const local = s.slice(0, at);
  return local[0] + '***' + (local.length > 1 ? local[local.length - 1] : '') + '@' + s.slice(at + 1);
}

function fakeMask(email) {
  const n = parseInt(hmacHex('fake|' + normEmail(email)).slice(0, 8), 16) % 100;
  return '**** **' + String(n).padStart(2, '0');
}

function phoneHash(local) {
  const p = normalizePhone(local);
  return hmacHex('ph|' + (p.ok ? p.local : String(local == null ? '' : local))).slice(0, 16);
}

function expandV6(s) {
  const parts = s.split('::');
  if (parts.length > 2) return null;
  const head = parts[0] ? parts[0].split(':') : [];
  const tail = parts.length === 2 && parts[1] ? parts[1].split(':') : [];
  const fill = parts.length === 2 ? Math.max(0, 8 - head.length - tail.length) : 0;
  const groups = head.concat(new Array(fill).fill('0'), tail);
  if (groups.length !== 8) return null;
  return groups.map(g => /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16).toString(16) : g);
}
// Түүхий IP key-д орохгүй: HMAC(key, 'ip|'+v)-ийн 16 hex
function ipKeys(ip) {
  const s = String(ip == null ? '' : ip).trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/%.*$/, '');
  let full, net;
  if (!s || s === 'unknown') { full = net = 'noip'; }
  else {
    const m4 = s.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m4) { full = m4.slice(1, 5).join('.'); net = m4.slice(1, 4).join('.'); }
    else if (s.indexOf(':') >= 0) {
      const g = expandV6(s);
      if (g) { full = g.slice(0, 4).join(':'); net = g.slice(0, 3).join(':'); }
      else { full = net = s.slice(0, 64); }
    } else { full = net = s.slice(0, 64); }
  }
  return { ipk: hmacHex('ip|' + full).slice(0, 16), ip24: hmacHex('ip|' + net).slice(0, 16) };
}

// Кирилл, ≤70 тэмдэгт (1 хэсэг SMS), эможи/холбоосгүй. Үл хамаарах: 'verify' + PROMO_NOTE (2 хэсэг, доор)
const SMS_TEXT = {
  verify: 'CyberMath бүртгэлийн код: {code}. Хэнд ч бүү хэл. 20 мин.',
  reset: 'CyberMath нууц үг сэргээх код: {code}. Хэнд ч бүү хэл. 20 мин.',
  login: 'CyberMath нэвтрэх код: {code}. Хэнд ч бүү хэл. 20 мин.',
};
function codeText(purpose, code) {
  const t = SMS_TEXT[purpose];
  if (!t) throw new Error('sms: unknown purpose');
  return t.replace('{code}', String(code));
}

// ───────────────────────── промо сануулга (зөвхөн 'verify' SMS) ─────────────────────────
// cyber-math.com/promo хуудсанд (api/qpay.js ws_promo_public) харагдах идэвхтэй код байвал бүртгэлийн SMS-д нэг мөр нэмнэ.
// Нөхцөл нь ws_promo_public-ийн WHERE-тэй ИЖИЛ байх ёстой (хуудас хоосон байхад SMS "идэвхтэй" гэж хэлэхгүй).
// Алдаа / удаашрал SMS-ийг хэзээ ч хаахгүй: асуулт PROMO_QUERY_MS-ээс удаан эсвэл алдаатай бол сануулгагүй илгээнэ.
// Урт: 57 + 72 = 129 тэмдэгт (UCS-2 2 хэсэг ≤134). SMS_PROMO_NOTE=0 бол унтраана.
// Android (SmsUsageMonitor) хэсэг бүрийг тоолж ~30-аас хэтэрвэл утсан дээр зөвшөөрөл асууж SMS-ийг гацаадаг тул
// сануулгатай SMS нь 30 минутын "sms:promo:t" нөөцөөс нэгийг авна: ≤ SMS_PARTS_30MIN_MAX(30) − SMS_30MIN_MAX(25).
const PROMO_NOTE = '\nХөнгөлөлтийн код идэвхтэй: cyber-math.com/promo сайтаар ороод эдлээрэй.';
const PROMO_CACHE_MS = 60000;
const PROMO_QUERY_MS = 1500;
let _promoCache = null; // {at, has}
async function promoNote() {
  if (envStr('SMS_PROMO_NOTE') === '0') return '';
  const t0 = Date.now();
  if (_promoCache && t0 - _promoCache.at < PROMO_CACHE_MS) return _promoCache.has ? PROMO_NOTE : '';
  let timer = null, has = false;
  try {
    const q = Promise.resolve(pool.query(
      `SELECT 1 FROM ws_promos WHERE active = TRUE AND COALESCE(personal, FALSE) = FALSE
         AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR used_count < max_uses) LIMIT 1`));
    q.catch(function () {}); // хугацаа хэтэрсний дараах rejection-ийг залгина
    const r = await Promise.race([q, new Promise(function (res) { timer = setTimeout(function () { res(null); }, PROMO_QUERY_MS); })]);
    has = !!(r && r.rows && r.rows.length); // r=null → timeout
  } catch (e) {
    logErr('[sms] promo', e);
  } finally {
    if (timer) clearTimeout(timer);
  }
  // алдаа / timeout-ийг ч 60с "байхгүй" гэж кэшлэнэ — DB удаан үед бүртгэл бүр 1.5с хүлээхгүй
  _promoCache = { at: t0, has: has };
  return has ? PROMO_NOTE : '';
}
function promoCacheReset() { _promoCache = null; } // тест
// 30 минутын нийт хязгааргүй (Pro + утасны Android хязгаарыг өргөсгөсөн) бол сануулгын нөөц ч хязгааргүй
function promoPartsMax(L) { return Number.isFinite(L.t30) ? Math.max(0, intEnv('SMS_PARTS_30MIN_MAX', 30) - L.t30) : Infinity; }

// ───────────────────────── хариуны код ба текст ─────────────────────────
const HTTP = {
  SMS_UNAVAILABLE: 503, SMS_UNCERTAIN: 503, SMS_BUSY: 503, SMS_FULL: 503,
  SMS_COOLDOWN: 429, SMS_LIMIT: 429,
  PHONE_INVALID: 400, PHONE_FOREIGN: 400, PHONE_TOO_MANY: 400,
  NEED_LOGIN: 409, NEED_ADMIN: 409, NO_PHONE: 409, TOKEN_STALE: 401,
};
function mkFail(code, extra) {
  const f = { ok: false, code: code, http: HTTP[code] || 503 };
  const x = extra || {};
  if (x.wait != null) f.wait = x.wait;
  if (x.scope) f.scope = x.scope;
  if (x.phoneQuota) f.phoneQuota = true;
  if (code === 'SMS_BUSY' && f.wait == null) f.wait = 600;
  if (code === 'SMS_UNCERTAIN' && f.wait == null) f.wait = COOLDOWN_SEC;
  return f;
}
// секунд → "N секундын" / "N минутын"
function waitText(sec) {
  const s = Number(sec) > 0 ? Math.ceil(Number(sec)) : COOLDOWN_SEC;
  return s < 60 ? s + ' секундын' : Math.ceil(s / 60) + ' минутын';
}
const UNAVAILABLE_TEXT = 'SMS түр явахгүй байна. Хэдэн минутын дараа дахин оролдоно уу.';
function ERR(f, extra) {
  const code = typeof f === 'string' ? f : ((f && f.code) || 'SMS_UNAVAILABLE');
  const fo = (f && typeof f === 'object') ? f : {};
  const x = extra || {};
  let t;
  switch (code) {
    case 'SMS_UNCERTAIN': t = 'SMS илгээгдсэн эсэх тодорхойгүй байна. Код ирвэл оруулна уу, ирэхгүй бол ' + waitText(fo.wait) + ' дараа дахин илгээнэ үү.'; break;
    case 'SMS_BUSY': t = 'Яг одоо олон хүн зэрэг код хүсэж байна. 10 минутын дараа дахин оролдоно уу.'; break;
    case 'SMS_FULL':
      t = fo.scope === 'month'
        ? 'Энэ сарын SMS кодын хязгаар дүүрлээ. Админтай холбогдоно уу: ' + contact()
        : 'Өнөөдрийн SMS кодын хязгаар дүүрлээ. Маргааш дахин оролдоно уу.';
      break;
    case 'SMS_COOLDOWN':
      // Нэг хүнд 10 минутад 1 SMS. extra.pending (дуудагч хүлээгдэж буй кодыг баталсан) → кодоо оруулахыг зөвлөнө;
      // дугаарынх → энэ дугаарт саяхан (өөр данс) авсан; бусад → зүгээр хүлээлгэнэ
      t = fo.phoneQuota
        ? 'Энэ дугаарт саяхан код илгээсэн. ' + waitText(fo.wait) + ' дараа дахин оролдоно уу.'
        : x.pending
          ? 'Код саяхан илгээсэн. Утсанд ирсэн кодоо оруулна уу, ирээгүй бол ' + waitText(fo.wait) + ' дараа дахин код авна уу.'
          : 'Саяхан код илгээсэн. ' + waitText(fo.wait) + ' дараа дахин оролдоно уу.';
      break;
    case 'SMS_LIMIT': t = 'Хэт олон код хүслээ. Түр хүлээгээд дахин оролдоно уу.'; break;
    case 'PHONE_INVALID': t = 'Монгол улсын 8 оронтой гар утасны дугаар оруулна уу.'; break;
    case 'PHONE_FOREIGN': t = 'Одоогоор зөвхөн Монгол улсын (+976) дугаарт код илгээнэ.'; break;
    case 'PHONE_TOO_MANY': t = 'Энэ дугаараар хэт олон данс бүртгэгдсэн байна.'; break;
    case 'NEED_LOGIN':
      t = x.prepared ? 'Энэ имэйлд данс бэлтгэгдсэн байна. «Нууц үг сэргээх»-ээр орно уу.' : 'Худалдан авахын өмнө нэвтэрнэ үү.';
      break;
    case 'NEED_ADMIN': t = 'Энэ имэйлд эрх бүртгэлтэй байна. Аюулгүй байдлын үүднээс админ таны утсыг баталгаажуулна. Холбогдох: ' + contact(); break;
    case 'NO_PHONE': t = 'Таны дансанд баталгаатай утас алга. Нууц үгээрээ нэвтэрнэ үү, эсвэл админтай холбогдоно уу: ' + contact(); break;
    case 'TOKEN_STALE': t = 'Аюулгүй байдлын үүднээс дахин нэвтэрнэ үү.'; break;
    default: t = UNAVAILABLE_TEXT;
  }
  if (code === 'SMS_BUSY' || code === 'SMS_FULL' || code === 'SMS_LIMIT') {
    const sep = /[.!?]$/.test(t) ? ' ' : '. ';
    if (x.reg === 'game') t += sep + 'Анги бүхлээрээ бүртгүүлж байгаа бол багшаасаа урилгын холбоос аваарай.';
    else if (x.reg === 'ws' && !(code === 'SMS_FULL' && fo.scope === 'month')) t += sep + 'Яаралтай бол админтай холбогдоно уу: ' + contact();
  }
  return t;
}
// extra: {reg:'game'|'ws', prepared:true, pending:true, fields:{needVerify:true, email, ...}} — fields нь ok/code/error-г дарж чадахгүй.
// pending: хүлээгдэж буй код байгаа (эсвэл enumeration-аас болж ялгахгүй нууц үг сэргээх) — SMS_COOLDOWN-д codeStep + «кодоо оруулна уу»
function failJson(res, f, extra) {
  const fx = f && f.code ? f : mkFail('SMS_UNAVAILABLE');
  const x = extra || {};
  const out = {};
  if (x.fields && typeof x.fields === 'object') Object.keys(x.fields).forEach(k => { out[k] = x.fields[k]; });
  out.ok = false;
  out.code = fx.code;
  out.error = ERR(fx, x);
  if (fx.wait != null) out.wait = fx.wait;
  // codeStep: өмнөх код хүчинтэй байж болно — клиент код оруулах алхам руу шилжинэ (имэйлийн cooldown, тодорхойгүй илгээлт)
  if (fx.code === 'SMS_UNCERTAIN' || (fx.code === 'SMS_COOLDOWN' && !fx.phoneQuota && x.pending)) out.codeStep = true;
  return res.status(fx.http || HTTP[fx.code] || 503).json(out);
}

const PUBLIC_KEYS = ['ok', 'accepted', 'masked', 'cooldown', 'wait', 'code', 'error'];
function publicOtpResponse(r) {
  if (!r || typeof r !== 'object') return { ok: false, code: 'SMS_UNAVAILABLE', error: UNAVAILABLE_TEXT };
  const out = {};
  PUBLIC_KEYS.forEach(k => { if (r[k] !== undefined) out[k] = r[k]; });
  if (out.ok !== true && out.code && out.error === undefined) out.error = ERR(r);
  return out;
}

// Enumeration-д мэдрэг endpoint-ийн хуурамч/бодит хариуны хугацааг ойртуулна.
// SMS_PAD_MS=0 бол хүлээхгүй (зөвхөн тест/локал).
function padTo(t0) {
  const raw = parseInt(envStr('SMS_PAD_MS'), 10);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 700;
  const jitter = base > 0 ? crypto.randomInt(0, 800) : 0;
  const start = Number(t0) || Date.now();
  const wait = Math.min(5000, start + base + jitter - Date.now());
  return wait > 0 ? new Promise(r => setTimeout(r, wait)) : Promise.resolve();
}

// ───────────────────────── DB: хүснэгт ─────────────────────────
const SMS_DDL = [
  `CREATE TABLE IF NOT EXISTS sms_log (
    id BIGSERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kind TEXT NOT NULL, purpose TEXT NOT NULL, phone_hash TEXT NOT NULL, phone_masked TEXT NOT NULL,
    status TEXT NOT NULL,
    error_class TEXT, http_status INT, duration_ms INT, provider_msg_id TEXT, verified_at TIMESTAMPTZ)`,
  `CREATE INDEX IF NOT EXISTS idx_sms_log_created ON sms_log(created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_sms_log_phone ON sms_log(phone_hash, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS sms_state (skey TEXT PRIMARY KEY, sval TEXT, updated_at TIMESTAMPTZ DEFAULT NOW())`,
];
let _smsReady = null;
function ensureSmsTables() {
  if (!_smsReady) {
    _smsReady = (async function () {
      for (const sql of SMS_DDL) {
        try { await pool.query(sql); }
        catch (e) {
          // Зэрэг cold start: 42701 (багана бий) / 42P07 (хүснэгт/индекс бий) / 23505 (pg_type unique)
          if (!(e && (e.code === '42701' || e.code === '42P07' || e.code === '23505'))) throw e;
        }
      }
    })().catch(function (e) { _smsReady = null; throw e; });
  }
  return _smsReady;
}

// Тоглоомын users хүснэгтийн SMS багана (auth.js, googleauth.js, users.js). Бүгд additive, backfill шаардахгүй:
//   email_unverified DEFAULT FALSE → одоогийн бүх мөр "имэйлээр батлагдсан"; TRUE-г зөвхөн SMS/урилгын шинэ бүртгэл тавина (S7).
//   token_version — Google цэвэрлэгээ / нууц үг сэргээлт / админ утас тохируулахад +1 → хуучин JWT (tv) хүчингүй.
const USER_DDL = [
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMPTZ`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS email_unverified BOOLEAN NOT NULL DEFAULT FALSE`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0`,
  `CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone)`,
];
let _userColsReady = null;
// ALTER TABLE ... IF NOT EXISTS ч гэсэн users (хамгийн ачаалалтай хүснэгт) дээр ACCESS EXCLUSIVE түгжээ авдаг тул
// cold start бүрт ажиллуулахгүй: эхлээд каталогаас (түгжээгүй SELECT) шалгаад дутуу байгааг л үүсгэнэ.
const USER_DDL_NEED = [
  { col: 'phone_verified_at', sql: USER_DDL[0] },
  { col: 'email_unverified', sql: USER_DDL[1] },
  { col: 'token_version', sql: USER_DDL[2] },
  { index: 'idx_users_phone', sql: USER_DDL[3] },
];
async function missingUserDdl() {
  try {
    const c = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = ANY($1)`,
      [['phone_verified_at', 'email_unverified', 'token_version']]);
    const i = await pool.query(`SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'idx_users_phone'`);
    const cols = new Set(((c && c.rows) || []).map(r => r.column_name));
    const idx = new Set(((i && i.rows) || []).map(r => r.indexname));
    return USER_DDL_NEED.filter(d => (d.col ? !cols.has(d.col) : !idx.has(d.index))).map(d => d.sql);
  } catch (e) {
    logErr('[sms] user cols check', e);
    return USER_DDL.slice();   // каталог уншиж чадаагүй бол өмнөх шигээ бүгдийг (IF NOT EXISTS) ажиллуулна
  }
}
function ensureUserColumns() {
  if (!_userColsReady) {
    _userColsReady = (async function () {
      for (const sql of await missingUserDdl()) {
        try { await pool.query(sql); }
        catch (e) { if (!(e && (e.code === '42701' || e.code === '42P07' || e.code === '23505'))) throw e; }
      }
    })().catch(function (e) { _userColsReady = null; throw e; });
  }
  return _userColsReady;
}

let _rateReady = null;
function ensureRate() {
  if (!_rateReady) {
    _rateReady = pool.query(`CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(), count INT NOT NULL DEFAULT 0)`)
      .catch(function (e) {
        if (e && (e.code === '23505' || e.code === '42P07')) return;
        _rateReady = null; throw e;
      });
  }
  return _rateReady;
}

// ───────────────────────── DB: квот ─────────────────────────
// _guard.rateLimit-тэй ижил UPSERT + retry_after. Цонхыг 86400-аар хавчихгүй.
const SQL_HIT = `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, NOW(), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN rate_limits.window_start <= NOW() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
    window_start = CASE WHEN rate_limits.window_start <= NOW() - make_interval(secs => $2) THEN NOW() ELSE rate_limits.window_start END
  RETURNING count, GREATEST(1, CEIL(EXTRACT(EPOCH FROM (window_start + make_interval(secs => $2) - NOW()))))::int AS retry_after`;
// 1 өдрөөс урт цонх (сарын тоолуур): _guard.rateLimit-ийн 1%-ийн цэвэрлэгээ
// `DELETE FROM rate_limits WHERE window_start < NOW() - INTERVAL '2 days'` сарын мөрийг устгаж тоолуурыг тэглэхээс
// сэргийлж window_start-д ДУУСАХ хугацааг (NOW()+цонх) хадгална. Түлхүүр нь сарын нэртэй (sms:g:m:2026-09) тул цонх дахин эхлэхгүй.
const SQL_HIT_PERIOD = `INSERT INTO rate_limits (key, window_start, count) VALUES ($1, NOW() + make_interval(secs => $2), 1)
  ON CONFLICT (key) DO UPDATE SET
    count = rate_limits.count + 1,
    window_start = NOW() + make_interval(secs => $2)
  RETURNING count, 1 AS retry_after`;

async function hit(key, winSec) {
  const k = String(key).slice(0, 300);
  const win = Math.max(1, parseInt(winSec, 10) || 60);
  try {
    await ensureRate();
    const r = await pool.query(win > DAY_WIN ? SQL_HIT_PERIOD : SQL_HIT, [k, win]);
    const row = r && r.rows && r.rows[0];
    const count = row ? Number(row.count) : NaN;
    if (!Number.isFinite(count)) return null;
    return { count: count, retryAfter: Math.max(1, Number(row.retry_after) || 1) };
  } catch (e) {
    logErr('[sms] rate', e);
    return null;
  }
}
// → {key: count} (байхгүй key = 0) | null (DB алдаа)
async function readCounts(keys) {
  try {
    await ensureRate();
    const r = await pool.query(`SELECT key, count FROM rate_limits WHERE key = ANY($1)`, [keys]);
    const out = {};
    keys.forEach(k => { out[k] = 0; });
    ((r && r.rows) || []).forEach(row => { out[row.key] = Number(row.count) || 0; });
    return out;
  } catch (e) {
    logErr('[sms] rate', e);
    return null;
  }
}
async function count(keys) {
  const c = await readCounts(keys);
  return c ? sumOf(c, keys) : null;
}
async function decr(key) {
  try { await pool.query(`UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1`, [String(key).slice(0, 300)]); }
  catch (e) { logErr('[sms] decr', e); }
}
function sumOf(c, keys) { return keys.reduce((a, k) => a + (Number(c[k]) || 0), 0); }

// <d> = UB (UTC+8) YYYY-MM-DD, <m> = YYYY-MM, <b> = 5 минутын bucket. "30 минут" = <b>..<b-5> 6 bucket.
function periods(ms) {
  const iso = new Date(ms + 8 * 3600 * 1000).toISOString();
  return { d: iso.slice(0, 10), m: iso.slice(0, 7), b: Math.floor(Math.floor(ms / 1000) / 300) };
}
function tKeys(prefix, b) { const out = []; for (let i = 0; i < 6; i++) out.push(prefix + (b - i)); return out; }

async function pausedUntil() {
  const r = await pool.query(`SELECT sval FROM sms_state WHERE skey = 'paused_until'`);
  const v = r && r.rows && r.rows[0] ? parseInt(r.rows[0].sval, 10) : 0;
  return Number.isFinite(v) && v > 0 ? v : 0;
}

// ───────────────────────── Telegram ─────────────────────────
async function notify(key, winSec, text, max) {
  const h = await hit(key, winSec);
  if (!h || h.count > (Number(max) > 0 ? Number(max) : 1)) return false; // DB алдаа бол илгээхгүй
  try { await tg.sendTelegram(text); return true; }
  catch (e) { logErr('[sms] tg', e); return false; }
}
function tgClassText(cls, http) {
  switch (cls) {
    case 'CONFIG': return 'SMS: TEXTBEE_API_KEY тохируулаагүй байна.';
    case 'AUTH': return 'SMS: textbee API түлхүүр буруу эсвэл хүчингүй (HTTP 401/403). Vercel env TEXTBEE_API_KEY-г шалгана уу.';
    case 'DEVICE': return 'SMS: textbee төхөөрөмж олдсонгүй (HTTP 404). TEXTBEE_DEVICE_ID болон утасны textbee аппыг шалгана уу.';
    case 'QUOTA': return 'SMS: textbee хязгаарт хүрлээ (HTTP 429). Өдрийн 50 / сарын 300 дууссан байж магадгүй.';
    default: return 'SMS: textbee хариу өгсөнгүй / алдаа (' + cls + ', HTTP ' + (http == null ? '-' : http) + '). Утас асаалттай, интернэттэй эсэхийг шалгана уу.';
  }
}

// ───────────────────────── textbee ─────────────────────────
function perfNow() { return (globalThis.performance && typeof globalThis.performance.now === 'function') ? globalThis.performance.now() : Date.now(); }
function keyNames(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return [];
  const out = [];
  Object.keys(o).slice(0, 30).forEach(k => {
    out.push(k);
    const v = o[k];
    if (v && typeof v === 'object' && !Array.isArray(v)) Object.keys(v).slice(0, 30).forEach(k2 => out.push(k + '.' + k2));
  });
  return out;
}
// Хариуны биеийг хэзээ ч лог руу бичихгүй. bodyKeys = зөвхөн түлхүүрийн нэр (smoke-д).
async function textbeeSend(e164, message) {
  const key = apiKey();
  const f = globalThis.fetch;
  if (!key || typeof f !== 'function') return { cls: 'CONFIG', http: null, ms: 0, msgId: null, bodyKeys: [] };
  const body = { recipients: [e164], message: message };
  const dev = envStr('TEXTBEE_DEVICE_ID');
  if (dev) body.deviceId = dev;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), limits().timeout);
  const t0 = perfNow();
  const ms = () => Math.max(0, Math.round(perfNow() - t0));
  try {
    let resp;
    try {
      resp = await f(TEXTBEE_SEND_URL, {
        method: 'POST',
        headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
    } catch (e) {
      const aborted = ac.signal.aborted || (e && (e.name === 'AbortError' || e.name === 'TimeoutError'));
      return { cls: aborted ? 'TIMEOUT' : 'DOWN', http: null, ms: ms(), msgId: null, bodyKeys: [],
        errName: String((e && (e.code || e.name)) || 'Error').slice(0, 40) };
    }
    const st = Number(resp && resp.status) || 0;
    if (st >= 200 && st < 300) {
      let text = '';
      try { text = await resp.text(); }
      catch (e) {
        // 2xx ирсэн ч бие уншигдаагүй (abort) — textbee хүлээн авсан байж магадгүй
        if (ac.signal.aborted) return { cls: 'TIMEOUT', http: st, ms: ms(), msgId: null, bodyKeys: [] };
      }
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (e) { parsed = null; }
      const d = parsed && typeof parsed === 'object' ? ((parsed.data && typeof parsed.data === 'object' && !Array.isArray(parsed.data)) ? parsed.data : parsed) : null;
      const bodyKeys = keyNames(parsed);
      if ((parsed && parsed.success === false) || (d && d.success === false)) return { cls: 'FAIL', http: st, ms: ms(), msgId: null, bodyKeys: bodyKeys };
      let msgId = d ? (d.smsBatchId || d._id || (parsed && (parsed.smsBatchId || parsed._id)) || null) : null;
      msgId = (typeof msgId === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(msgId)) ? msgId : null;
      return { cls: 'ok', http: st, ms: ms(), msgId: msgId, bodyKeys: bodyKeys };
    }
    let cls = 'FAIL';
    if (st === 401 || st === 403) cls = 'AUTH';
    else if (st === 404) cls = 'DEVICE';
    else if (st === 429) cls = 'QUOTA';
    else if (st >= 500) cls = 'DOWN';
    return { cls: cls, http: st || null, ms: ms(), msgId: null, bodyKeys: [] };
  } finally {
    clearTimeout(timer);
  }
}

// ───────────────────────── precheck ─────────────────────────
// Данс хайхаас ӨМНӨ, бүртгэлтэй эсэхээс үл хамааран ижил тоолно. null = зөвшөөрнө.
async function precheck(o) {
  o = o || {};
  const kind = o.kind === 'acct' ? 'acct' : 'reg';
  const email = normEmail(o.email);
  const L = limits();
  const UNAV = mkFail('SMS_UNAVAILABLE');

  // pc-1: тохиргоо, яаралтай унтраалга, админ pause
  if (disabled() || !hashKey()) return UNAV;
  if (!apiKey()) { await notify('tg:sms:CONFIG', T30_WIN, tgClassText('CONFIG')); return UNAV; }
  try {
    await ensureSmsTables();
    if ((await pausedUntil()) > Math.floor(Date.now() / 1000)) return UNAV;
  } catch (e) {
    logErr('[sms] precheck', e);
    return UNAV;
  }

  // pc-2: глобал хязгаар — ЗӨВХӨН уншина (дүүрсэн үед IP/имэйлийн тоолуур нэмэгдэхгүй)
  const P = periods(Date.now());
  const gT = tKeys('sms:g:t:', P.b), rT = tKeys('sms:reg:t:', P.b);
  const keys = ['sms:g:d:' + P.d, 'sms:g:m:' + P.m].concat(gT);
  if (kind === 'reg') keys.push.apply(keys, ['sms:reg:d:' + P.d, 'sms:reg:m:' + P.m].concat(rT));
  const c = await readCounts(keys);
  if (!c) return UNAV;
  if (c['sms:g:m:' + P.m] >= L.month) return mkFail('SMS_FULL', { scope: 'month' });
  if (c['sms:g:d:' + P.d] >= L.day) return mkFail('SMS_FULL', { scope: 'day' });
  if (sumOf(c, gT) >= L.t30) return mkFail('SMS_BUSY', { wait: 600 });
  if (kind === 'reg') {
    if (c['sms:reg:m:' + P.m] >= L.regMonth) return mkFail('SMS_FULL', { scope: 'month' });
    if (c['sms:reg:d:' + P.d] >= L.regDay) return mkFail('SMS_FULL', { scope: 'day' });
    if (sumOf(c, rT) >= L.regT30) return mkFail('SMS_BUSY', { wait: 600 });
  }

  // pc-3: IP (сургуулийн нэг NAT тул сул; жинхэнэ дээд хязгаар нь глобал)
  const ik = ipKeys(o.ip);
  let h = await hit('sms:ip:' + ik.ipk, 3600);
  if (!h) return UNAV;
  if (h.count > L.ip) return mkFail('SMS_LIMIT');
  h = await hit('sms:ip24:' + ik.ip24, 3600);
  if (!h) return UNAV;
  if (h.count > L.ip24) return mkFail('SMS_LIMIT');

  // pc-4: имэйлийн cooldown (kind тус бүр — нууц үг сэргээх оролдлого бүртгэлийг 10 минут хаахгүй).
  // SMS явалгүй бүтэлгүйтвэл sendCode буцаана (emCdKey).
  h = await hit(emCdKey(kind, email), COOLDOWN_SEC);
  if (!h) return UNAV;
  if (h.count > 1) return mkFail('SMS_COOLDOWN', { wait: h.retryAfter });

  // pc-5: имэйл|ip24 ба имэйлийн өдрийн хязгаар
  h = await hit(emIpKey(email, o.ip), DAY_WIN);
  if (!h) return UNAV;
  if (h.count > EM_IP_DAY_MAX) return mkFail('SMS_LIMIT');
  h = await hit(emDayKey(email), DAY_WIN);
  if (!h) return UNAV;
  if (h.count === EM_DAY_MAX + 1) await notify('tg:sms:em:' + email, DAY_WIN, 'SMS: нэг имэйлд олон код хүсэв: ' + maskEmail(email));
  if (h.count > EM_DAY_MAX) return mkFail('SMS_LIMIT');
  return null;
}

// ───────────────────────── sendCode ─────────────────────────
async function capAlerts(caps, L) {
  for (const c of caps) {
    const t80 = Math.ceil(c.max * 0.8);
    const pct = c.n === c.max ? 100 : (c.n === t80 ? 80 : 0);
    if (!pct) continue;
    let text;
    if (c.scope === 'reg') {
      text = pct === 100
        ? 'SMS бүртгэлийн сарын дэд хязгаар дүүрлээ: энэ сард шинэ бүртгэл SMS-ээр хийгдэхгүй. Pro эсвэл урилга ашиглана уу.'
        : 'SMS бүртгэлийн сарын дэд хязгаар ' + c.n + '/' + c.max + ' (нууц үг сэргээлтэд ' + Math.max(0, L.month - L.regMonth) + ' нөөцлөгдсөн)';
    } else if (c.per === 'm') {
      text = pct === 100 ? 'SMS сарын хязгаар дүүрлээ (' + c.n + '/' + c.max + ').'
        : 'SMS энэ сар ' + c.n + '/' + c.max + ' (Pro багц руу шилжих эсэхийг шийднэ үү)';
    } else {
      text = pct === 100 ? 'SMS өдрийн хязгаар дүүрлээ (' + c.n + '/' + c.max + ').' : 'SMS өнөөдөр ' + c.n + '/' + c.max;
    }
    await notify('tg:sms:cap:' + c.scope + ':' + c.per + ':' + c.val + ':' + pct, c.per === 'm' ? MONTH_WIN : DAY_WIN, text);
  }
}

async function offlineCheck() {
  try {
    const r = await pool.query(
      `SELECT count(*)::int AS n, count(verified_at)::int AS v FROM sms_log
       WHERE status = 'sent' AND created_at BETWEEN NOW() - INTERVAL '30 minutes' AND NOW() - INTERVAL '8 minutes'`
    );
    const row = r && r.rows && r.rows[0];
    const n = Number(row && row.n) || 0, v = Number(row && row.v) || 0;
    if (n >= 4 && v === 0) {
      await notify('tg:sms:offline', T30_WIN, 'SMS: сүүлийн 30 минутад ' + n + ' код илгээсэн ч нэг ч баталгаажаагүй. Утас унтарсан/интернэтгүй байж магадгүй.');
    }
  } catch (e) { logErr('[sms] offline', e); }
}

function emCdKey(kind, email) { return 'sms:em:cd:' + (kind === 'acct' ? 'acct' : 'reg') + ':' + normEmail(email); }
function emIpKey(email, ip) { return 'sms:em:ip:' + normEmail(email) + '|' + ipKeys(ip).ip24; }
function emDayKey(email) { return 'sms:em:' + normEmail(email); }
// precheck-ийн имэйлд хамаарах түлхүүрүүд (sendCode бүтэлгүйтвэл буцаана)
function emPrecheckKeys(kind, email, ip) { return [emCdKey(kind, email), emIpKey(email, ip), emDayKey(email)]; }

async function safeDrop(drop, code) {
  if (typeof drop !== 'function') return;
  try { await drop(code); } catch (e) { logErr('[sms] drop', e); }
}

// SMS огт явалгүй бүтэлгүйтвэл (SMS_UNCERTAIN-аас бусад алдаа) энэ хүсэлтийн тавьсан cooldown-ыг буцаана —
// textbee/DB алдаа, буруу дугаар зэргээс болж хэрэглэгч 10 минут хүлээхгүй. Имэйлийн cooldown-ыг дуудагч энэ
// хүсэлтэд precheck-ээр тавьсан (precheck-д count>1 бол sendCode хүрэхгүй), дугаарынхыг sendCodeInner тавьсан бол cd.ph.
async function sendCode(o) {
  o = o || {};
  const cd = { ph: null, phDay: null };
  const r = await sendCodeInner(o, cd);
  if (r && !r.ok && r.code !== 'SMS_UNCERTAIN') {
    // «SMS яваагүй → торгуульгүй»: precheck-ийн имэйлийн cooldown ба өдрийн тоолуурууд, дугаарын cooldown ба өдрийн квот
    const em = normEmail(o.email);
    if (em) { for (const k of emPrecheckKeys(o.kind, em, o.ip)) await decr(k); }
    if (cd.ph) await decr(cd.ph);
    if (cd.phDay) await decr(cd.phDay);
  }
  return r;
}
async function sendCodeInner(o, cd) {
  const purpose = o.purpose;
  const kind = o.kind === 'acct' ? 'acct' : 'reg';
  const UNAV = mkFail('SMS_UNAVAILABLE');
  if (!SMS_TEXT[purpose] || typeof o.store !== 'function') { logErr('[sms] sendCode', new Error('bad args')); return UNAV; }

  // 1. дугаар
  const p = normalizePhone(o.phone);
  if (!p.ok) return mkFail(p.code);
  if (disabled() || !hashKey()) return UNAV;
  if (!apiKey()) { await notify('tg:sms:CONFIG', T30_WIN, tgClassText('CONFIG')); return UNAV; }
  const L = limits();
  const ph = phoneHash(p.local);
  const masked2 = maskPhone(p.local, 2), masked4 = maskPhone(p.local, 4);

  // 2. Дугаарын квот (store-оос ӨМНӨ → cooldown үед өмнөх код хүчинтэй хэвээр).
  // cooldown түлхүүр kind тус бүр: хохирогчийн дугаараар бүртгэл spam хийсэн ч нууц үг сэргээлт нь хаагдахгүй.
  const phCd = 'sms:ph:cd:' + kind + ':' + ph;
  let h = await hit(phCd, COOLDOWN_SEC);
  if (!h) return UNAV;
  if (h.count > 1) return mkFail('SMS_COOLDOWN', { wait: h.retryAfter, phoneQuota: true });
  cd.ph = phCd;
  h = await hit('sms:ph:' + kind + ':' + ph, DAY_WIN);
  if (!h) return UNAV;
  cd.phDay = 'sms:ph:' + kind + ':' + ph;
  if (h.count > (kind === 'reg' ? PH_REG_DAY_MAX : PH_ACCT_DAY_MAX)) return mkFail('SMS_LIMIT', { phoneQuota: true });

  // 3. Глобал нөөцлөл — нэг нь хэтэрвэл нөөцөлсөн бүгдийг (хэтэрсэн key орно) буцаана
  const P = periods(Date.now());
  const steps = [];
  if (kind === 'reg') {
    steps.push({ key: 'sms:reg:t:' + P.b, win: T30_WIN, sum: tKeys('sms:reg:t:', P.b), max: L.regT30, code: 'SMS_BUSY' });
    steps.push({ key: 'sms:reg:d:' + P.d, win: DAY_WIN, max: L.regDay, code: 'SMS_FULL', scope: 'day' });
    steps.push({ key: 'sms:reg:m:' + P.m, win: MONTH_WIN, max: L.regMonth, code: 'SMS_FULL', scope: 'month', cap: { scope: 'reg', per: 'm', val: P.m } });
  }
  steps.push({ key: 'sms:g:t:' + P.b, win: T30_WIN, sum: tKeys('sms:g:t:', P.b), max: L.t30, code: 'SMS_BUSY' });
  steps.push({ key: 'sms:g:d:' + P.d, win: DAY_WIN, max: L.day, code: 'SMS_FULL', scope: 'day', cap: { scope: 'g', per: 'd', val: P.d } });
  steps.push({ key: 'sms:g:m:' + P.m, win: MONTH_WIN, max: L.month, code: 'SMS_FULL', scope: 'month', cap: { scope: 'g', per: 'm', val: P.m } });

  const reserved = [];
  const rollback = async () => { const ks = reserved.splice(0); for (const k of ks) await decr(k); };
  const caps = [];
  for (const s of steps) {
    const r = await hit(s.key, s.win);
    if (!r) { await rollback(); return UNAV; }
    reserved.push(s.key);
    let n = r.count;
    if (s.sum) {
      const total = await count(s.sum);
      if (total == null) { await rollback(); return UNAV; }
      n = total;
    }
    if (n > s.max) { await rollback(); return mkFail(s.code, { scope: s.scope }); }
    if (s.cap) caps.push({ scope: s.cap.scope, per: s.cap.per, val: s.cap.val, n: n, max: s.max });
  }

  // 3b. Промо сануулга (зөвхөн verify; хэзээ ч throw хийхгүй) — кодоос ӨМНӨ тул асуулт кодын 10 минутаас хасагдахгүй.
  // 2 хэсэгтэй SMS тул 30 минутын хэсгийн нөөцөөс нэгийг reserved-д авна (алдаа үед rollback буцаана); нөөцгүй / DB алдаа → сануулгагүй.
  let note = purpose === 'verify' ? await promoNote() : '';
  if (note) {
    const pk = 'sms:promo:t:' + P.b;
    if (!(await hit(pk, T30_WIN))) note = '';
    else {
      reserved.push(pk);
      const used = await count(tKeys('sms:promo:t:', P.b));
      if (used == null || used > promoPartsMax(L)) { note = ''; reserved.pop(); await decr(pk); }
    }
  }

  // 4. Код. Хүчинтэй (хугацаа нь дуусаагүй, оролдлого үлдсэн) код байвал ДАХИН АШИГЛАНА: o.reuse() нь хугацааг
  //    сунгаад тэр кодыг буцаана. Ингэснээр дахин илгээхээс өмнөх хоцорсон SMS ч зөв код хэвээр байна. Оролдлогын
  //    тоолуур тэглэгдэхгүй (таах хамгаалалт хадгалагдана). Хүчинтэй код байхгүй / reuse алдаа → шинэ код + store().
  let code = null, reused = false;
  if (typeof o.reuse === 'function') {
    try {
      const c = String((await o.reuse()) || '');
      if (/^\d{6}$/.test(c)) { code = c; reused = true; }
    } catch (e) { logErr('[sms] reuse', e); }
  }
  if (!code) {
    code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    try { await o.store(code); }
    catch (e) { await rollback(); logErr('[sms] store', e); return UNAV; }
  }

  // 5. sms_log (reserved) — DB алдаа → хаана
  let logId = null;
  try {
    await ensureSmsTables();
    const r = await pool.query(
      `INSERT INTO sms_log (kind, purpose, phone_hash, phone_masked, status) VALUES ($1, $2, $3, $4, 'reserved') RETURNING id`,
      [kind, purpose, ph, masked2]
    );
    logId = r && r.rows && r.rows[0] ? r.rows[0].id : null;
  } catch (e) {
    // дахин ашигласан код өмнө нь илгээгдсэн тул хүчингүй болгохгүй
    await rollback(); if (!reused) await safeDrop(o.drop, code); logErr('[sms] log', e);
    return UNAV;
  }

  // 6. textbee
  const t = await textbeeSend(p.e164, codeText(purpose, code) + note);
  if (t.cls === 'ok') console.log('[sms]', 'ok', t.http, t.ms, masked2);
  else if (t.errName) console.error('[sms]', t.cls, t.http, t.ms, masked2, t.errName);
  else console.error('[sms]', t.cls, t.http, t.ms, masked2);

  // 7. лог шинэчлэх (алдаа нь үр дүнг өөрчлөхгүй — SMS аль хэдийн явсан байж болно)
  if (logId != null) {
    try {
      await pool.query(
        `UPDATE sms_log SET status = $2, error_class = $3, http_status = $4, duration_ms = $5, provider_msg_id = $6 WHERE id = $1`,
        [logId, t.cls === 'ok' ? 'sent' : 'failed', t.cls === 'ok' ? null : t.cls, t.http, t.ms, t.msgId]
      );
    } catch (e) { logErr('[sms] log', e); }
  }

  // 8. үр дүн
  if (t.cls === 'ok') {
    await capAlerts(caps, L);
    await offlineCheck();
    if (Math.random() < 0.01) {
      try { await pool.query(`DELETE FROM sms_log WHERE created_at < NOW() - INTERVAL '90 days'`); }
      catch (e) { logErr('[sms] cleanup', e); }
    }
    return { ok: true, masked2: masked2, masked4: masked4, cooldown: COOLDOWN_SEC, expires_in: CODE_TTL_SEC, reused: reused };
  }
  await notify('tg:sms:' + t.cls, T30_WIN, tgClassText(t.cls, t.http));
  if (t.cls === 'TIMEOUT') {
    // textbee хүлээн авсан байж магадгүй: глобал нөөц ба код хэвээр
    await capAlerts(caps, L);
    return mkFail('SMS_UNCERTAIN', { wait: COOLDOWN_SEC });
  }
  await rollback();
  if (!reused) await safeDrop(o.drop, code);   // дахин ашигласан код өмнөх SMS-ээр ирсэн байж болно
  return UNAV;
}

// ───────────────────────── баталгаажсан, админ ─────────────────────────
async function markVerified(phone) {
  try {
    const p = normalizePhone(phone);
    if (!p.ok) return;
    await ensureSmsTables();
    await pool.query(
      `UPDATE sms_log SET verified_at = NOW()
       WHERE phone_hash = $1 AND status = 'sent' AND verified_at IS NULL AND created_at > NOW() - INTERVAL '30 minutes'`,
      [phoneHash(p.local)]
    );
  } catch (e) { logErr('[sms] markVerified', e); }
}

async function status() {
  const L = limits();
  const now = Date.now();
  const P = periods(now);
  await ensureSmsTables();
  const gT = tKeys('sms:g:t:', P.b), rT = tKeys('sms:reg:t:', P.b);
  const keys = ['sms:g:d:' + P.d, 'sms:reg:d:' + P.d, 'sms:g:m:' + P.m, 'sms:reg:m:' + P.m].concat(gT, rT);
  const c = await readCounts(keys);
  if (!c) { const e = new Error('rate_limits read failed'); e.code = 'SMS_DB'; throw e; }
  const pu = await pausedUntil();
  const er = await pool.query(
    `SELECT error_class, count(*)::int AS n FROM sms_log
     WHERE created_at > NOW() - INTERVAL '24 hours' AND error_class IS NOT NULL GROUP BY error_class`
  );
  const uv = await pool.query(
    `SELECT count(*)::int AS n FROM sms_log WHERE status = 'sent' AND verified_at IS NULL AND created_at > NOW() - INTERVAL '30 minutes'`
  );
  const errors24h = {};
  ((er && er.rows) || []).forEach(r => { errors24h[r.error_class] = Number(r.n) || 0; });
  return {
    configured: !!apiKey() && !!hashKey(),
    device_id: !!envStr('TEXTBEE_DEVICE_ID'),
    disabled: disabled(),
    paused_until: pu > Math.floor(now / 1000) ? pu : null,
    day: { sent: c['sms:g:d:' + P.d], max: L.day },
    reg_day: { sent: c['sms:reg:d:' + P.d], max: L.regDay },
    last30m: { sent: sumOf(c, gT), max: L.t30 },
    reg_last30m: { sent: sumOf(c, rT), max: L.regT30 },
    month: { sent: c['sms:g:m:' + P.m], max: L.month },
    reg_month: { sent: c['sms:reg:m:' + P.m], max: L.regMonth },
    errors24h: errors24h,
    unverified30m: Number(uv && uv.rows && uv.rows[0] && uv.rows[0].n) || 0,
  };
}

async function setPause(untilSec) {
  await ensureSmsTables();
  const v = untilSec == null ? 0 : parseInt(untilSec, 10);
  if (!Number.isFinite(v) || v <= 0) {
    await pool.query(`DELETE FROM sms_state WHERE skey = 'paused_until'`);
    return;
  }
  await pool.query(
    `INSERT INTO sms_state (skey, sval, updated_at) VALUES ('paused_until', $1, NOW())
     ON CONFLICT (skey) DO UPDATE SET sval = EXCLUDED.sval, updated_at = NOW()`,
    [String(v)]
  );
}

// Админ: textbee төхөөрөмжийн төлөв. Зөвхөн name/enabled/last_heartbeat-ийг whitelist-ээр буцаана.
async function deviceStatus() {
  const key = apiKey();
  const f = globalThis.fetch;
  if (!key || typeof f !== 'function') return { ok: false, cls: 'CONFIG' };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), limits().timeout);
  try {
    const resp = await f(TEXTBEE_DEVICES_URL, { method: 'GET', headers: { 'x-api-key': key }, signal: ac.signal });
    const st = Number(resp && resp.status) || 0;
    if (st === 404) return { ok: false, unsupported: true };
    if (st === 401 || st === 403) return { ok: false, cls: 'AUTH', http: st };
    if (st < 200 || st >= 300) return { ok: false, cls: st >= 500 ? 'DOWN' : 'FAIL', http: st || null };
    let parsed = null;
    try { parsed = JSON.parse(await resp.text()); } catch (e) { parsed = null; }
    const arr = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.data) ? parsed.data : null);
    if (!arr) return { ok: false, unsupported: true };
    const str = (v, n) => (typeof v === 'string' && v ? v.slice(0, n) : null);
    return {
      ok: true,
      devices: arr.filter(x => x && typeof x === 'object').slice(0, 10).map(x => ({
        name: str(x.name, 60) || str(x.model, 60),
        enabled: typeof x.enabled === 'boolean' ? x.enabled : null,
        last_heartbeat: str(x.lastHeartbeat, 40) || str(x.updatedAt, 40),
      })),
    };
  } catch (e) {
    return { ok: false, cls: ac.signal.aborted ? 'TIMEOUT' : 'DOWN' };
  } finally {
    clearTimeout(timer);
  }
}


/* ═══════════════════════════════════════════════════════════════════════
   MO урсгал — verify.mn. ХЭРЭГЛЭГЧ 144773 руу кодоо илгээнэ.
   Дээрх textbee (MT) кодод хүрэхгүй: энэ нь зэрэгцээ, бие даасан зам.

   Аюулгүй байдлын инвариант:
     M1  MO код users.verify_code-д ХЭЗЭЭ Ч бичигдэхгүй. Эс бөгөөс халдагч
         хариунаас кодыг хараад гараараа бичиж, утасгүйгээр нэвтрэх байсан.
     M2  Төлвийг имэйлээр БИШ, зөвхөн pollToken-оор асууна. Эс бөгөөс халдагч
         хохирогчийн имэйлээр асууж байгаад VERIFIED агшинг нь хулгайлах байсан.
     M3  pollToken нь DB-д зөвхөн ХЭШ хэлбэрээр хадгалагдана.
     M4  verify.mn-ийн sessionId клиент рүү гарахгүй.
     M5  Нэг session нэг л удаа ашиглагдана (consumed_at).
   ═══════════════════════════════════════════════════════════════════════ */

const VFM = require('./_verifymn');

// MO-ийн квот нь textbee-гийнхээс ТУСДАА: textbee-гийн хязгаар нь эзэмшигчийн Android
// утасны хүчин чадлыг хамгаалдаг байсан. MO-д бид илгээхгүй тул тэр хязгаар утгагүй.
// Үлдэх хамгаалалт: нэг дугаарын cooldown/өдрийн квот (доорх sendMo дотор) + нийт спам таг.
function moLimits() {
  return {
    t30: intEnv('VERIFYMN_30MIN_MAX', 300),
    day: intEnv('VERIFYMN_DAY_MAX', 4000),
  };
}
const MO_TTL_SEC = 300;            // verify.mn session 5 минут

let _vfmReady = false;
async function ensureVfmTables() {
  if (_vfmReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS vfm_sessions (
    id BIGSERIAL PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL,
    kind TEXT NOT NULL,
    phone_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ
  )`);
  await pool.query(`CREATE INDEX IF NOT EXISTS vfm_sessions_exp ON vfm_sessions (expires_at)`);
  _vfmReady = true;
}

function moEnabled() { return VFM.enabled(); }

// pollToken: клиентэд түүхий утга, DB-д хэш (M3)
function newPollToken() { return crypto.randomBytes(24).toString('hex'); }
function pollHash(tok) { return crypto.createHash('sha256').update(String(tok)).digest('hex'); }

/* MO session үүсгэх.
   o: { purpose, kind, phone, email, ip }
   → { ok:true, mode:'mo', code, smsUri, shortcode, pollToken, expiresAt, masked2, masked4 }
   | Fail  (дуудагч нь textbee рүү шилжиж болно) */
async function sendMo(o) {
  const purpose = o.purpose;
  const kind = o.kind === 'acct' ? 'acct' : 'reg';
  const UNAV = mkFail('SMS_UNAVAILABLE');
  if (!SMS_TEXT[purpose]) { logErr('[mo] sendMo', new Error('bad purpose')); return UNAV; }
  if (!moEnabled() || disabled()) return UNAV;

  const p = normalizePhone(o.phone);
  if (!p.ok) return mkFail(p.code);
  if (!hashKey()) return UNAV;
  const ph = phoneHash(p.local);
  const masked2 = maskPhone(p.local, 2), masked4 = maskPhone(p.local, 4);

  // 1. Дугаарын квот — textbee-тэй ИЖИЛ түлхүүр ашиглана: нэг дугаарт хоёр
  //    провайдераар давхар спам хийхээс сэргийлнэ.
  //
  //    o.companion: textbee илгээлттэй ЗЭРЭГ үүсгэж буй нөөц session. Тухайн
  //    оролдлогыг textbee-гийн зам аль хэдийн квотод тооцсон тул дахин
  //    тооцохгүй — эс бөгөөс өөрөө өөрийгөө cooldown-д хоригдоно. MO-ийн
  //    нийт квот (алхам 2) ба бусад шалгалт хэвээр хүчинтэй.
  const phCd = 'sms:ph:cd:' + kind + ':' + ph;
  const reserved = [];
  const rollback = async () => { const ks = reserved.splice(0); for (const k of ks) await decr(k); };
  /* 10 минутын cooldown-ыг MO-д ХЭРЭГЛЭХГҮЙ.
     Шалтгаан: MO session 5 минутад хүчингүй болдог атал cooldown 10 минут байсан тул
     хугацаа дуусахад хэрэглэгч 5 минут гацдаг — дахин код авах ч аргагүй. Түүнчлэн MO-д
     бид юу ч илгээдэггүй (хэрэглэгч өөрөө илгээнэ) тул cooldown-ы анхны зорилго болох
     "илгээлтийн зардал/утасны ачаалал" энд байхгүй.
     Спам хамгаалалт ХЭВЭЭР: нэг дугаарын ӨДРИЙН квот (reg 3 / acct 6) ба MO-ийн нийт
     квот (VERIFYMN_30MIN_MAX/DAY_MAX) хоёул доор хүчинтэй. */
  if (!o.companion) {
    /* MO-д ӨӨРИЙН өдрийн квот. textbee-гийнх (reg 3 / acct 6) нь ИЛГЭЭЛТИЙН ЗАРДАЛ,
       утасны ачааллыг хязгаарлах зорилготой — MO-д бид юу ч илгээдэггүй (хэрэглэгч
       өөрөө илгээж, өөрөө төлдөг) тул тэр хязгаар энд хэтэрхий бага. Session үүсгэх
       спамаас хамгаалах нь л зорилго тул өгөөмөр боловч хязгаартай.
       Түлхүүр нь textbee-гийнхээс ТУСДАА: нэг нь нөгөөгөө барагдуулахгүй. */
    const moKey = 'sms:moph:' + kind + ':' + ph;
    const moMax = kind === 'reg' ? intEnv('VERIFYMN_PH_REG_DAY_MAX', 20)
                                 : intEnv('VERIFYMN_PH_ACCT_DAY_MAX', 30);
    const h = await hit(moKey, DAY_WIN);
    if (!h) return UNAV;
    reserved.push(moKey);
    if (h.count > moMax) { await rollback(); return mkFail('SMS_LIMIT', { phoneQuota: true }); }
  }

  // 2. MO-ийн нийт квот (спам таг)
  const ML = moLimits();
  const Pr = periods(Date.now());
  for (const st of [
    { key: 'sms:mo:t:' + Pr.b, win: T30_WIN, sum: tKeys('sms:mo:t:', Pr.b), max: ML.t30, code: 'SMS_BUSY' },
    { key: 'sms:mo:d:' + Pr.d, win: DAY_WIN, max: ML.day, code: 'SMS_FULL', scope: 'day' },
  ]) {
    const r = await hit(st.key, st.win);
    if (!r) { await rollback(); return UNAV; }
    reserved.push(st.key);
    let n = r.count;
    if (st.sum) { const t = await count(st.sum); if (t == null) { await rollback(); return UNAV; } n = t; }
    if (n > st.max) { await rollback(); return mkFail(st.code, { scope: st.scope }); }
  }

  // 3. Код. M1: users.verify_code-д БИЧИХГҮЙ — o.store дуудахгүй.
  //    Баталгаажуулалт нь "тэр дугаараас тэр текстийг илгээсэн" гэдгээр verify.mn-ээс ирнэ.
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');

  // 4. Session үүсгэх
  const cb = envStr('VERIFYMN_CALLBACK_URL') || null;
  const v = await VFM.createSession({ phoneLocal: p.local, code, callback: cb });
  if (!v.ok) {
    await rollback();
    console.error('[mo]', v.cls, v.http || '', masked2);
    await notify('tg:mo:' + v.cls, T30_WIN, 'verify.mn: ' + v.cls + (v.http ? ' (HTTP ' + v.http + ')' : ''));
    // mkFail нь танихгүй талбарыг хаядаг тул тэмдгийг дараа нь онооно.
    // Дуудагч үүнийг хараад textbee (MT) рүү шилжинэ.
    const f = mkFail('SMS_UNAVAILABLE');
    f.moFailed = true;
    return f;
  }

  // 5. Session хадгалах
  const tok = newPollToken();
  const expMs = v.expiresAt ? Date.parse(v.expiresAt) : NaN;
  const expires = new Date(Number.isFinite(expMs) ? expMs : Date.now() + MO_TTL_SEC * 1000);
  try {
    await ensureVfmTables();
    await pool.query(
      `INSERT INTO vfm_sessions (token_hash, session_id, email, purpose, kind, phone_hash, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [pollHash(tok), v.sessionId, String(o.email || '').toLowerCase(), purpose, kind, ph, expires]
    );
  } catch (e) {
    await rollback(); logErr('[mo] store', e); return UNAV;
  }
  console.log('[mo]', 'session', v.ms + 'ms', masked2);

  // Хааяа хуучин session цэвэрлэнэ
  if (Math.random() < 0.02) {
    try { await pool.query(`DELETE FROM vfm_sessions WHERE expires_at < NOW() - INTERVAL '1 day'`); }
    catch (e) { logErr('[mo] cleanup', e); }
  }

  return {
    ok: true, mode: 'mo',
    moText: code,                    // хэрэглэгч үүнийг SMS-ээр илгээнэ — дэлгэцэнд гарах ЁСТОЙ.
                                     // 'code' гэж нэрлэвэл алдааны code талбартай мөргөлдөнө.
    smsUri: v.smsUri, shortcode: v.shortcode,
    pollToken: tok,                  // M4: sessionId биш
    expiresAt: expires.toISOString(),
    masked2: masked2, masked4: masked4,
  };
}

/* Төлөв шалгах — ЗӨВХӨН pollToken-оор (M2).
   → { ok:true, status:'PENDING'|'VERIFIED'|'EXPIRED'|'UNKNOWN', email, purpose, kind }
   VERIFIED үед session-ийг consumed болгоно (M5) — давтан дуудахад PENDING биш EXPIRED. */
/* Сүүлийн MO session-уудын БОДИТ төлвийг verify.mn-ээс асууж харуулна (админд).
   Манай DB дээрх төлөв (consumed_at/expires_at) ба verify.mn-ийн хэлж буйг ЗЭРЭГ
   харуулна: хоёр нь зөрвөл асуудал хаана байгаа нь шууд мэдэгдэнэ.
     ours=хүлээж байна, vfm=VERIFIED  → SMS таарсан ч манай тал боловсруулаагүй
     ours=хүлээж байна, vfm=PENDING   → SMS огт таараагүй (дугаар/текст зөрсөн)
   Бүтэн дугаар, sessionId, түлхүүр гарахгүй. */
async function moRecent(n) {
  const lim = Math.min(20, Math.max(1, parseInt(n, 10) || 10));
  await ensureVfmTables();
  const r = await pool.query(
    `SELECT id, session_id, email, purpose, kind, created_at, expires_at, consumed_at
     FROM vfm_sessions ORDER BY created_at DESC LIMIT ${lim}`);
  const out = [];
  for (const row of r.rows) {
    const ours = row.consumed_at ? 'баталгаажсан'
      : (new Date(row.expires_at).getTime() < Date.now() ? 'хугацаа дууссан' : 'хүлээж байна');
    let vfm = '—';
    try {
      const st = await VFM.sessionStatus(row.session_id);
      vfm = st.ok ? st.status : ('алдаа:' + (st.cls || '?'));
    } catch (e) { vfm = 'алдаа'; }
    out.push({
      at: row.created_at, email: maskEmail(row.email), purpose: row.purpose, kind: row.kind,
      ours: ours, verifymn: vfm,
    });
  }
  return out;
}

async function moCheck(pollToken, opts) {
  /* opts.consume === false бол VERIFIED-ийг зөвхөн МЭДЭЭЛНЭ, session-ийг зарцуулахгүй.
     Дасгалын төвд хэрэгтэй: тэнд баталгаажуулах агшинд нууц үг заавал тавигддаг тул
     «баталгаажлаа» гэж харуулаад, нууц үгтэй нь дахин дуудаж (consume: true) дуусгана.
     M5 (нэг session нэг л удаа) нь зарцуулалтын алхамд хэвээр хүчинтэй. */
  const consume = !(opts && opts.consume === false);
  const tok = String(pollToken || '');
  if (!/^[0-9a-f]{48}$/.test(tok)) return { ok: false, status: 'UNKNOWN' };
  try {
    await ensureVfmTables();
    const r = await pool.query(
      `SELECT id, session_id, email, purpose, kind, expires_at, consumed_at
       FROM vfm_sessions WHERE token_hash = $1`, [pollHash(tok)]);
    if (!r.rows.length) return { ok: false, status: 'UNKNOWN' };
    const row = r.rows[0];
    if (row.consumed_at) return { ok: true, status: 'EXPIRED', spent: true };
    if (new Date(row.expires_at).getTime() < Date.now()) return { ok: true, status: 'EXPIRED' };

    const st = await VFM.sessionStatus(row.session_id);   // V3: callback-т итгэхгүй
    if (!st.ok) return { ok: false, status: 'UNKNOWN', cls: st.cls };
    if (st.status !== 'VERIFIED') return { ok: true, status: st.status };

    // Зөвхөн мэдээлнэ — зарцуулахгүй (дуудагч дараа нь consume: true-гээр дуусгана)
    if (!consume) {
      return { ok: true, status: 'VERIFIED', pending: true, email: row.email, purpose: row.purpose, kind: row.kind };
    }
    // M5 — яг нэг л удаа
    const up = await pool.query(
      `UPDATE vfm_sessions SET consumed_at = NOW() WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
      [row.id]);
    if (!up.rows.length) return { ok: true, status: 'EXPIRED', spent: true };
    return { ok: true, status: 'VERIFIED', email: row.email, purpose: row.purpose, kind: row.kind };
  } catch (e) { logErr('[mo] check', e); return { ok: false, status: 'UNKNOWN' }; }
}


/* ── gateway утас амьд эсэх ──
   textbee-гийн API нь утас унтарсан, интернэтгүй, апп хаагдсан ч HTTP 200
   буцаана (мессежийг дарааландаа тавиад). Тиймээс "илгээлээ" гэдэг нь
   "хүрлээ" гэсэн утга БИШ. Илгээхийн өмнө heartbeat-ийг шалгаж, хуучирсан
   бол шууд verify.mn (MO) руу шилжинэ.

   Тодорхойгүй үед ҮРГЭЛЖ "амьд" гэж үзнэ — textbee-г дэмий хаахгүй:
   API дэмждэггүй, алдаа гарсан, heartbeat талбаргүй бол true.
   HB_CACHE_MS хугацаанд кэшилнэ — илгээлт бүрд нэмэлт дуудлага хийхгүй. */
const HB_CACHE_MS = 60000;
function hbStaleMin() { return intEnv('TEXTBEE_HEARTBEAT_STALE_MIN', 10); }
let _hbCache = null;   // { at, alive }
function gatewayCacheReset() { _hbCache = null; }   // тестэд
async function gatewayAlive() {
  /* ЗӨВХӨН ТУРШИЛТАД. Утсанд хүрэхгүйгээр, хүлээхгүйгээр MO урсгалыг шалгана.
     Прод дээр үлдээвэл БҮХ хэрэглэгч MO дэлгэц рүү явна — туршаад шууд устга. */
  if (envStr('TEXTBEE_FORCE_OFFLINE') === '1') {
    console.error('[sms]', 'TEXTBEE_FORCE_OFFLINE=1 — бүх хэрэглэгч MO руу шилжиж байна');
    return false;
  }
  if (envStr('TEXTBEE_HEARTBEAT_CHECK') === '0') return true;   // шалгалтыг унтраах
  const now = Date.now();
  if (_hbCache && now - _hbCache.at < HB_CACHE_MS) return _hbCache.alive;
  let alive = true;
  try {
    const d = await deviceStatus();
    if (d && d.ok && Array.isArray(d.devices) && d.devices.length) {
      const limit = hbStaleMin() * 60000;
      alive = d.devices.some(function (x) {
        if (x.enabled === false) return false;
        if (!x.last_heartbeat) return true;            // талбаргүй → шүүхгүй
        const t = Date.parse(x.last_heartbeat);
        if (!Number.isFinite(t)) return true;
        return (now - t) < limit;
      });
    }
    // d.ok=false (CONFIG/AUTH/DOWN/unsupported) эсвэл төхөөрөмж алга → alive=true хэвээр
  } catch (e) { logErr('[sms] heartbeat', e); }
  _hbCache = { at: now, alive: alive };
  if (!alive) console.error('[sms]', 'gateway offline — MO руу шилжинэ');
  return alive;
}

module.exports = {
  normalizePhone, maskPhone, maskEmail, fakeMask, phoneHash, ipKeys, codeText,
  precheck, sendCode, markVerified, publicOtpResponse, padTo, mkFail, ERR, failJson, notify,
  status, setPause, deviceStatus, textbeeSend, limits, logErr, safeMsg, ensureSmsTables, ensureUserColumns, maxAccountsPerPhone, trustLegacyPhone,
  promoNote, PROMO_NOTE, CODE_TTL_MS, COOLDOWN_SEC,
  sendMo, moCheck, moEnabled, ensureVfmTables, MO_TTL_SEC,
  moRecent,
  gatewayAlive, gatewayCacheReset,
  // тестэд
  promoCacheReset,
  _internal: { hit, readCounts, count, decr, periods, tKeys },
};
Object.defineProperty(module.exports, 'CONTACT', { enumerable: true, get: contact });
