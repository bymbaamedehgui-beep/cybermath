// Үнэгүй туршилтын (api/_wstrial.js) хүснэгтүүдийн санах ойн загвар — tests/_gamefake.js, tests/_smsfake.js хоёулаа ашиглана.
// api/_wstrial.js SQL-ийн ЯГ мөрүүдийг (хоосон зай нормчилсон) таньдаг — тэнд өөрчлөгдвөл энд ч шинэчилнэ (танихгүй SQL → тест унана).
// DB-ийн NOW() = Date.now() + st.shift — «серверийн цаг»-ийг процессын/клиентийн цагаас ТУСАД нь шилжүүлж болно.
'use strict';

function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
// «DB сервер»-ийн цаг: процессын Date.now-ийг тест сольсон ч (клиент/функцийн цаг) нөлөөлөхгүй
const DB_CLOCK = Date.now.bind(Date);
const SQL = {
  ELIG: "SELECT l.phone, (l.verified = TRUE AND l.pass_hash <> '!' AND (l.phone_verified_at IS NOT NULL OR l.invite IS NULL) "
    + 'AND NOT (EXISTS (SELECT 1 FROM ws_access a WHERE LOWER(a.email) = l.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_grade_access g WHERE LOWER(g.email) = l.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_purchases p WHERE LOWER(p.email) = l.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_admin_grants m WHERE LOWER(m.email) = l.email AND m.game_key IS NULL))) AS eligible, '
    + 't.started_at, t.trial_until, t.seconds, t.denied, (t.trial_until > NOW()) AS active, NOW() AS now '
    + 'FROM ws_login l LEFT JOIN ws_trials t ON t.email = l.email WHERE l.email = $1',
  PRIOR: 'SELECT EXISTS (SELECT 1 FROM ws_login o WHERE o.phone = $2 AND o.email <> $1 AND o.verified = TRUE '
    + 'AND (o.phone_verified_at IS NOT NULL OR o.invite IS NULL) '
    + 'AND (EXISTS (SELECT 1 FROM ws_access a WHERE LOWER(a.email) = o.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_grade_access g WHERE LOWER(g.email) = o.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_purchases p WHERE LOWER(p.email) = o.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_admin_grants m WHERE LOWER(m.email) = o.email AND m.game_key IS NULL))) AS phone, '
    + 'EXISTS (SELECT 1 FROM ws_devices d WHERE d.device_id = $3 AND d.email <> $1 '
    + 'AND (EXISTS (SELECT 1 FROM ws_access a WHERE LOWER(a.email) = d.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_grade_access g WHERE LOWER(g.email) = d.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_purchases p WHERE LOWER(p.email) = d.email) '
    + 'OR EXISTS (SELECT 1 FROM ws_admin_grants m WHERE LOWER(m.email) = d.email AND m.game_key IS NULL))) AS dev',
  CFG_INS: "INSERT INTO ws_trial_cfg (k, at) VALUES ('from', NOW()) ON CONFLICT (k) DO NOTHING",
  CFG_GET: "SELECT at FROM ws_trial_cfg WHERE k = 'from'",
  MARK_OWNERS: 'SELECT mark, email FROM ws_trial_marks WHERE mark = ANY($1::text[])',
  MARK_INS: 'INSERT INTO ws_trial_marks (mark, email) VALUES ($1, $2) ON CONFLICT (mark) DO NOTHING',
  INS: 'INSERT INTO ws_trials (email, started_at, trial_until, seconds, device_id, fp, denied) '
    + 'VALUES ($1, NOW(), NOW() + make_interval(secs => $2::int), $2::int, $3, $4, $5) ON CONFLICT (email) DO NOTHING '
    + 'RETURNING started_at, trial_until, seconds, denied, (trial_until > NOW()) AS active, NOW() AS now',
  GET: 'SELECT started_at, trial_until, seconds, denied, (trial_until > NOW()) AS active, NOW() AS now FROM ws_trials WHERE email = $1',
};
const N = {};
Object.keys(SQL).forEach(function (k) { N[k] = norm(SQL[k]); });

// login(email) → ws_login мөр {phone, verified, pass_hash, phone_verified_at, invite, created_at} | null/undefined
// src.logins() → ws_login мөрүүд [{email, …}] (PRIOR: ижил утастай данс), src.devices() → ws_devices [{email, device_id}]
// src.bought(email) → «эрх авсан» эсэх (api/_wstrial.js bought()): ws_access, ws_grade_access, ws_purchases эсвэл
//   ws_admin_grants (game_key IS NULL)-д (хугацаа дууссан ч, цуцлагдсан ч) мөртэй (LOWER(email) харьцуулалт)
function create(login, src) {
  src = src || {};
  const logins = src.logins || function () { return []; };
  const devices = src.devices || function () { return []; };
  const boughtFn = src.bought || function () { return false; };
  const bought = function (e) { return !!boughtFn(String(e == null ? '' : e).toLowerCase()); };
  const st = {
    trials: new Map(),   // email → {email, started_at, trial_until, seconds, device_id, fp, denied}
    marks: new Map(),    // mark → {mark, email, at}
    cfgFrom: null,       // ws_trial_cfg('from').at (Date) — деплойн мөчийн anchor
    shift: 0,            // DB NOW() шилжилт (ms)
    fail: false,         // туршилтын бүх SQL алдаа өгнө
    queries: [],         // ажилласан туршилтын SQL-ийн нэрс
  };
  st.now = function () { return DB_CLOCK() + st.shift; };
  function out(t, now) {
    return { started_at: t.started_at, trial_until: t.trial_until, seconds: t.seconds, denied: t.denied,
      active: t.trial_until.getTime() > now, now: new Date(now) };
  }
  // ws_login-ийн утас эзэмшлийн дүрэм (PHONE_TOO_MANY-тэй ижил): SMS-ээр батлагдсан эсвэл урилгын бус
  function phoneOwned(l) { return l.phone_verified_at != null || l.invite == null; }
  // q — нормчилсон SQL. Туршилтын SQL биш бол undefined
  st.handle = function (q, p) {
    let name = null;
    Object.keys(N).forEach(function (k) { if (N[k] === q) name = k; });
    if (!name) return undefined;
    st.queries.push(name);
    if (st.fail) { const e = new Error('db down (trial)'); e.code = '57P01'; throw e; }
    const now = st.now();
    if (name === 'ELIG') {
      if (p.length !== 1) throw new Error('trialfake: ELIG параметр 1 байх ёстой (' + p.length + ')');
      const l = login(String(p[0]));
      if (!l) return { rows: [] };
      const t = st.trials.get(String(p[0]));
      return { rows: [{
        phone: l.phone == null ? null : l.phone,
        eligible: l.verified === true && l.pass_hash !== '!' && phoneOwned(l) && !bought(p[0]),
        started_at: t ? t.started_at : null, trial_until: t ? t.trial_until : null,
        seconds: t ? t.seconds : null, denied: t ? t.denied : null,
        active: t ? t.trial_until.getTime() > now : null, now: new Date(now),
      }] };
    }
    if (name === 'PRIOR') {
      // pg: илгээсэн параметрийн тоо SQL-ийн $n-тэй таарах ёстой (илүү/дутуу бол bind алдаа)
      if (p.length !== 3) throw new Error('trialfake: PRIOR параметр 3 байх ёстой (' + p.length + ')');
      const me = String(p[0]), ph = p[1] == null ? null : String(p[1]), dev = p[2] == null ? null : String(p[2]);
      const phone = ph != null && logins().some(function (o) {
        return o.phone === ph && o.email !== me && o.verified === true && phoneOwned(o) && bought(o.email);
      });
      const dv = dev != null && devices().some(function (d) { return d.device_id === dev && d.email !== me && bought(d.email); });
      return { rows: [{ phone: phone, dev: dv }] };
    }
    if (name === 'CFG_INS') { if (!st.cfgFrom) st.cfgFrom = new Date(now); return { rows: [] }; }
    if (name === 'CFG_GET') return { rows: st.cfgFrom ? [{ at: st.cfgFrom }] : [] };
    if (name === 'MARK_OWNERS') {
      const arr = Array.isArray(p[0]) ? p[0].map(String) : [];
      return { rows: arr.filter(function (m) { return st.marks.has(m); }).map(function (m) { const r = st.marks.get(m); return { mark: r.mark, email: r.email }; }) };
    }
    if (name === 'MARK_INS') {
      if (!st.marks.has(String(p[0]))) st.marks.set(String(p[0]), { mark: String(p[0]), email: String(p[1]), at: new Date(now) });
      return { rows: [] };
    }
    if (name === 'INS') {
      const e = String(p[0]);
      if (st.trials.has(e)) return { rows: [] };
      const secs = parseInt(p[1], 10);
      const t = { email: e, started_at: new Date(now), trial_until: new Date(now + secs * 1000), seconds: secs,
        device_id: p[2] == null ? null : p[2], fp: p[3] == null ? null : p[3], denied: p[4] == null ? null : p[4] };
      st.trials.set(e, t);
      return { rows: [out(t, now)] };
    }
    if (name === 'GET') {
      const t = st.trials.get(String(p[0]));
      return { rows: t ? [out(t, now)] : [] };
    }
    return undefined;
  };
  st.reset = function () { st.trials.clear(); st.marks.clear(); st.cfgFrom = null; st.shift = 0; st.fail = false; st.queries.length = 0; };
  // Тест: туршилтыг шууд тавих (until = DB NOW() + leftSec)
  st.put = function (email, leftSec, o) {
    o = o || {};
    const now = st.now(), secs = o.seconds == null ? 300 : o.seconds;
    const t = { email: email, started_at: new Date(now - (secs - leftSec) * 1000), trial_until: new Date(now + leftSec * 1000),
      seconds: secs, device_id: o.device_id || null, fp: null, denied: o.denied || null };
    st.trials.set(email, t);
    return t;
  };
  return st;
}

module.exports = { SQL, N, norm, create };
