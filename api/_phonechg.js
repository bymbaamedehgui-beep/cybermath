// Дугаар солих — нууц үг сэргээх дэлгэцийн «Дугаараа сольсон уу?» (эзэмшигч 2026-11-16: «******15 гэх мэтээр таарвал шинэ
// дугаараа хийгээд баталгаажуулах мсж илгээдэг болго»). Тоглоомын төв (api/auth.js phoneHint/phoneChange — users) ба
// Дасгалын төв (api/worksheets.js ws_phoneHint/ws_phoneChange — ws_login) хоёулаа ашиглана.
//   1) Сэжүүр: дансны итгэмжлэгдсэн утасны сүүлийн 2 орон (**** **15); данс/утасгүй бол хуурамч (sms.fakeMask — enumeration).
//   2) Хуучин дугаар БҮТЭН 8 оронгоор таарах ёстой. Хуучин дугаар нууц биш (анги нөхөд мэднэ) тул имэйл тутам 24 цагт
//      3 буруу оролдлогоор түгжинэ; данс олдоогүй ч буруутай ИЖИЛ хариу.
//   3) Шинэ дугаарын эзэмшлийг verify.mn MO батална (шинэ дугаараас 144773 руу код). Шинэ дугаар дансанд «хүлээгдэж буй»
//      (pending_phone, 30 мин) — MO session-ий phone_hash түүнтэй таарсан үед л бичигдэнэ (M2: зөвхөн pollToken-оор).
//   4) Солигдмогц админд Telegram; дуудагч нь нэг удаагийн кодоор одоо байгаа нууц үг сэргээх урсгал руу шилжүүлнэ.
'use strict';
const crypto = require('crypto');
const pool = require('./_db');
const sms = require('./_sms');
const { rateLimit } = require('./_guard');

const BAD_MAX = 3;                 // буруу хуучин дугаар — имэйл тутам
const BAD_WIN = 86400;             // 24 цаг
const PENDING_SEC = 1800;          // хүлээгдэж буй шинэ дугаар 30 минут хүчинтэй (MO session 5 мин + «Дахин код авах»)
const TOO_MANY = 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.';
const MSG_LOCK = 'Буруу дугаар 3 удаа оруулсан тул 24 цагийн дараа дахин оролдоно уу. Яаралтай бол админтай холбогдоно уу.';
const MSG_BAD = 'Хуучин дугаар таарахгүй байна';

// Хүснэгт бүрийн SQL — имэйлийн нөхцөл өөр (users: LOWER, ws_login: аль хэдийн жижиг үсгээр хадгалдаг)
const T = {
  users: {
    pend: 'UPDATE users SET pending_phone=$2, pending_phone_at=NOW() WHERE LOWER(email)=LOWER($1) RETURNING email',
    row: 'SELECT phone, pending_phone, pending_phone_at FROM users WHERE LOWER(email)=LOWER($1)',
    // token_version+1 — бусад төхөөрөмжийн хуучин JWT хүчингүй (нууц үг сэргээлттэй адил)
    commit: 'UPDATE users SET phone=pending_phone, phone_verified_at=NOW(), pending_phone=NULL, pending_phone_at=NULL, verify_code=NULL, verify_expiry=NULL, token_version=COALESCE(token_version,0)+1 WHERE LOWER(email)=LOWER($1) AND pending_phone=$2 RETURNING phone',
  },
  ws_login: {
    pend: 'UPDATE ws_login SET pending_phone=$2, pending_phone_at=NOW() WHERE email=$1 RETURNING email',
    row: 'SELECT phone, pending_phone, pending_phone_at FROM ws_login WHERE email=$1',
    commit: 'UPDATE ws_login SET phone=pending_phone, phone_verified_at=NOW(), pending_phone=NULL, pending_phone_at=NULL, code=NULL, code_exp=NULL, code_attempts=0 WHERE email=$1 AND pending_phone=$2 RETURNING phone',
  },
};

const _cols = {};
function ensureCols(table) {
  if (!T[table]) throw new Error('phonechg: table');
  if (!_cols[table]) {
    _cols[table] = (async function () {
      for (const sql of ['ALTER TABLE ' + table + ' ADD COLUMN IF NOT EXISTS pending_phone TEXT',
                         'ALTER TABLE ' + table + ' ADD COLUMN IF NOT EXISTS pending_phone_at TIMESTAMPTZ']) {
        // Зэрэг cold start: 42701 (duplicate column) / 23505 — багана аль хэдийн бий
        try { await pool.query(sql); } catch (e) { if (!(e && (e.code === '42701' || e.code === '23505'))) throw e; }
      }
    })().catch(function (e) { _cols[table] = null; throw e; });
  }
  return _cols[table];
}

// Буруу оролдлогын тоог НЭМЭХГҮЙгээр уншина (rate_limits — _guard.rateLimit-ийн хүснэгт). Алдаа → түгжээтэй (fail-closed)
async function badCount(key) {
  try {
    const r = await pool.query('SELECT count FROM rate_limits WHERE key=$1 AND window_start > NOW() - make_interval(secs => $2)', [key, BAD_WIN]);
    return r.rows.length ? Number(r.rows[0].count) || 0 : 0;
  } catch (e) {
    if (e && e.code === '42P01') return 0;   // хүснэгт хараахан үүсээгүй
    sms.logErr('[phonechg] badCount', e);
    return Infinity;
  }
}
function same(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// current — дансны итгэмжлэгдсэн утас (auth usablePhone / worksheets wsUsablePhone) эсвэл null
function hint(current, email) { return current ? sms.maskPhone(current, 2) : sms.fakeMask(email); }

/* Хуучин дугаарыг шалгаад шинэ дугаарыг хүлээгдэж буй болгож, шинэ дугаараас MO код авна.
   o: { scope:'game'|'ws', table:'users'|'ws_login', email, ip, current, oldPhone, newPhone, countPhone(local) → n }
   → { ok:true, sent, masked } | { http, body } (шууд хариу) | { fail } (sms.failJson) */
async function request(o) {
  const em = String(o.email || '').trim().toLowerCase();
  if (!(await rateLimit('phchg:ip:' + o.scope + ':' + o.ip, 30, 3600)) || !(await rateLimit('phchg:em:' + o.scope + ':' + em, 10, BAD_WIN))) {
    return { http: 429, body: { ok: false, error: TOO_MANY } };
  }
  const bk = 'phchg:bad:' + o.scope + ':' + em;
  if ((await badCount(bk)) >= BAD_MAX) return { http: 429, body: { ok: false, locked: true, error: MSG_LOCK } };
  const op = sms.normalizePhone(o.oldPhone), np = sms.normalizePhone(o.newPhone);
  // Бичлэгийн алдаа (8 оронгүй) — оролдлого тоолохгүй
  if (!op.ok) return { http: 400, body: { ok: false, field: 'old', error: 'Хуучин дугаараа 8 оронгоор бүтэн оруулна уу' } };
  if (!np.ok) return { fail: sms.mkFail(np.code), field: 'new' };
  if (!o.current || !same(op.local, o.current)) {
    await rateLimit(bk, BAD_MAX, BAD_WIN);
    const left = Math.max(0, BAD_MAX - (await badCount(bk)));
    return { http: left ? 400 : 429, body: { ok: false, field: 'old', left: left, locked: !left,
      error: left ? MSG_BAD + ' — ' + left + ' оролдлого үлдлээ' : MSG_LOCK } };
  }
  if (np.local === op.local) return { http: 400, body: { ok: false, field: 'new', error: 'Шинэ дугаар хуучинтайгаа ижил байна' } };
  if (o.countPhone && (await o.countPhone(np.local)) >= sms.maxAccountsPerPhone()) return { fail: sms.mkFail('PHONE_TOO_MANY'), field: 'new' };
  // Шинэ дугаарын эзэмшлийг «тэр дугаараас илгээсэн» (MO) л батална — verify.mn унтраалттай үед (VERIFYMN_DISABLED) ажиллахгүй
  if (!sms.moEnabled()) return { fail: sms.mkFail('SMS_UNAVAILABLE') };
  await ensureCols(o.table);
  const up = await pool.query(T[o.table].pend, [em, np.local]);
  if (!up.rows.length) return { fail: sms.mkFail('SMS_UNAVAILABLE') };
  let sent;
  try { sent = await sms.sendMo({ purpose: 'phone', kind: 'acct', phone: np.local, email: em, ip: o.ip }); }
  catch (e) { sms.logErr('[phonechg] sendMo', e); sent = null; }
  if (!sent || !sent.ok) return { fail: sent && sent.code ? sent : sms.mkFail('SMS_UNAVAILABLE') };
  return { ok: true, sent: sent, masked: sms.maskPhone(np.local, 2) };
}

/* moCheck-ийн VERIFIED (purpose 'phone') → хүлээгдэж буй дугаарыг дансанд бичнэ.
   null — хүлээгдэж буй дугаар алга / 30 минутаас хуучирсан / MO-гийн дугаартай таараагүй (зэрэг хүсэлтээр солигдсон) */
async function commit(table, email, c) {
  await ensureCols(table);
  const r = await pool.query(T[table].row, [email]);
  const row = r.rows[0];
  if (!row || !row.pending_phone || !row.pending_phone_at) return null;
  if (Date.now() - new Date(row.pending_phone_at).getTime() > PENDING_SEC * 1000) return null;
  if (!c || !c.phone_hash || sms.phoneHash(row.pending_phone) !== c.phone_hash) return null;
  const up = await pool.query(T[table].commit, [email, row.pending_phone]);
  if (!up.rows.length) return null;
  await sms.markVerified(row.pending_phone);
  return { from: row.phone || null, to: row.pending_phone };
}

function tgText(center, email, ch, extra) {
  return 'Утас солигдлоо (' + center + ', хэрэглэгч өөрөө — хуучин дугаар таарсан): ' + sms.tgEmail(email) + ' · '
    + (ch.from ? sms.maskPhone(ch.from, 2) : '—') + ' → ' + sms.maskPhone(ch.to, 2) + (extra ? ' · ' + extra : '');
}
function oneTimeCode() { return String(crypto.randomInt(0, 1000000)).padStart(6, '0'); }

module.exports = { hint, request, commit, tgText, oneTimeCode, ensureCols, BAD_MAX, PENDING_SEC, MSG_LOCK };
