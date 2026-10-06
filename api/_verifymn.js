// verify.mn — MO (Mobile-Originated) баталгаажуулалт: ХЭРЭГЛЭГЧ 144773 руу кодоо илгээнэ.
// textbee (MT: бид хэрэглэгч рүү илгээдэг)-ээс ЭСРЭГ чиглэлтэй тул тусдаа модуль.
//
// Аюулгүй байдлын инвариант (_sms.js-ийн S1-S4-тэй нийцүүлэв):
//   V1  VERIFYMN_API_KEY нь console / хариу / DB-д ХЭЗЭЭ Ч гарахгүй.
//   V2  sessionId нь клиент рүү гарахгүй — сервер талдаа үлдэнэ (клиент өөрийн маань эндпойнтоор асууна).
//   V3  Callback нь зөвхөн сануулга (body-гүй GET). Төлвийг ҮРГЭЛЖ GET /sessions/:id-ээр баталгаажуулна.
//   V4  Session үүсээгүй бол ok:true хэзээ ч үгүй.
//   V5  Бүтэн утасны дугаар хариунд гарахгүй — verify.mn-ийн displayInstruction-ийг ДАМЖУУЛАХГҮЙ,
//       маскласан дугаараар өөрсдөө бичнэ (данс тандахаас сэргийлнэ).
//
// API:
//   enabled()                              → түлхүүр тохируулагдсан ба унтраагаагүй эсэх
//   createSession({ phoneLocal, code, callback }) → Ok | Fail
//   sessionStatus(sessionId)               → { ok, status:'VERIFIED'|'PENDING'|'EXPIRED'|'UNKNOWN' } | Fail
//   SHORTCODE, TTL_SEC

const SHORTCODE = '144773';
const TTL_SEC = 300;                    // верифай талын session 5 минут

function envStr(k) { const v = process.env[k]; return typeof v === 'string' ? v.trim() : ''; }
function intEnv(k, d) { const n = parseInt(envStr(k), 10); return Number.isFinite(n) ? n : d; }

// Үндсэн хаяг. VERIFYMN_BASE нь зөвхөн тест/mock-д (прод дээр тохируулахгүй).
function sessionsUrl() { return (envStr('VERIFYMN_BASE') || 'https://api.verify.mn') + '/sessions'; }

function apiKey() { return envStr('VERIFYMN_API_KEY'); }
// Түлхүүр байх нь ХАНГАЛТГҮЙ: VERIFYMN_ENABLED=1 гэж тусад нь асаана.
// Ингэснээр түлхүүрийг урьдчилж тавиад, дэлгэц бэлэн болоход нь асааж болно
// (эс бөгөөс түлхүүр тавимагц MO идэвхжиж, хуучин дэлгэцтэй бүртгэл эвдэрнэ).
function enabled() { return !!apiKey() && envStr('VERIFYMN_ENABLED') === '1' && envStr('VERIFYMN_DISABLED') !== '1'; }
function timeoutMs() { return Math.min(9000, Math.max(2000, intEnv('VERIFYMN_TIMEOUT_MS', 8000))); }

// Алдааг ангилна (_sms.js-ийн cls нэрсийг дагана)
function classify(st) {
  if (st === 401 || st === 403) return 'AUTH';
  if (st === 404) return 'NOTFOUND';
  if (st === 429) return 'LIMIT';
  if (st >= 500) return 'DOWN';
  return 'FAIL';
}

async function call(url, opts) {
  const key = apiKey();
  const f = globalThis.fetch;
  if (!key || typeof f !== 'function') return { ok: false, cls: 'CONFIG', http: null, ms: 0 };
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs());
  const t0 = Date.now();
  const ms = () => Math.max(0, Date.now() - t0);
  try {
    const init = {
      method: (opts && opts.method) || 'GET',
      headers: Object.assign({ Authorization: 'Bearer ' + key }, (opts && opts.headers) || {}),
      signal: ac.signal,
    };
    if (opts && opts.body != null) init.body = opts.body;
    let resp;
    try {
      resp = await f(url, init);
    } catch (e) {
      const aborted = ac.signal.aborted || (e && (e.name === 'AbortError' || e.name === 'TimeoutError'));
      return { ok: false, cls: aborted ? 'TIMEOUT' : 'DOWN', http: null, ms: ms() };
    }
    const st = Number(resp && resp.status) || 0;
    let body = null;
    try { body = JSON.parse(await resp.text()); } catch (e) { body = null; }
    if (st < 200 || st >= 300) return { ok: false, cls: classify(st), http: st, ms: ms() };
    return { ok: true, http: st, ms: ms(), body: body };
  } finally { clearTimeout(timer); }
}

// ── Session үүсгэх ──
// phoneLocal: '99112233' (8 оронтой), code: '482916' (хэрэглэгчийн илгээх текст)
// callback: заавал биш. Ирсэн ч гэсэн төлвийг sessionStatus-ээр давхар шалгана (V3).
async function createSession(o) {
  const phoneLocal = String((o && o.phoneLocal) || '');
  const code = String((o && o.code) || '');
  if (!/^[689]\d{7}$/.test(phoneLocal)) return { ok: false, cls: 'PHONE' };
  if (!/^[A-Za-z0-9]{4,16}$/.test(code)) return { ok: false, cls: 'TEXT' };

  const payload = { phone: phoneLocal, text: code };
  if (o && o.callback) payload.callback = String(o.callback);

  const r = await call(sessionsUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) return r;

  const b = r.body || {};
  const sid = typeof b.sessionId === 'string' ? b.sessionId : null;
  if (!sid) return { ok: false, cls: 'FAIL', http: r.http, ms: r.ms };   // V4

  return {
    ok: true,
    sessionId: sid,                                       // V2 — клиент рүү ЯВУУЛАХГҮЙ
    shortcode: typeof b.shortcode === 'string' ? b.shortcode : SHORTCODE,
    smsUri: typeof b.smsUri === 'string' ? b.smsUri : ('sms:' + SHORTCODE + '?body=' + code),
    text: code,
    expiresAt: typeof b.expiresAt === 'string' ? b.expiresAt : null,
    ms: r.ms,
  };
}

// ── Төлөв шалгах (албан ёсны үнэн) ──
async function sessionStatus(sessionId) {
  const sid = String(sessionId || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(sid)) return { ok: false, cls: 'FAIL' };
  const r = await call(sessionsUrl() + '/' + encodeURIComponent(sid), { method: 'GET' });
  if (!r.ok) return r;
  const b = r.body || {};
  const raw = String(b.sessionStatus || b.status || '').toUpperCase();
  const status = (raw === 'VERIFIED' || raw === 'EXPIRED' || raw === 'PENDING') ? raw : 'UNKNOWN';
  return { ok: true, status, verifiedAt: typeof b.verifiedAt === 'string' ? b.verifiedAt : null, ms: r.ms };
}

module.exports = { enabled, createSession, sessionStatus, SHORTCODE, TTL_SEC };
