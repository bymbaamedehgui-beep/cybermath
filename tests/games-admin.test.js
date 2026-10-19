// Тоглоомын админ: api/qpay.js game_grant / game_revoke / game_list, ws_badges (+1), ws_report (тайлан) + admin.html.
// Ажиллуулах: node tests/games-admin.test.js   (бодит DB/QPay/Telegram 0 — tests/_gamefake.js + энд нэмэлт хуурамч SQL)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const qpay = require(path.join(F.API, 'qpay.js'));
const GM = require(path.join(F.API, '_games.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;
const DAY = F.DAY;

const wsTok = (e) => jwt.sign({ email: e, ws: true }, SEC);
const cmTok = (e, tv) => jwt.sign({ email: e, role: 'student', tv: tv | 0 }, SEC);
const bearer = (t) => ({ authorization: 'Bearer ' + t });
const ADMIN = bearer(jwt.sign({ admin: true }, SEC));
const Q = (action, body, o) => F.call(qpay, Object.assign({ query: { action: action }, body: body || {} }, o || {}));
const A = (action, body) => Q(action, body, { headers: ADMIN });
const daysLeft = (d) => (new Date(d).getTime() - Date.now()) / DAY;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.01, (msg || '') + ' ' + a + ' ≈ ' + b);
const PIN = '4821';
const pinHash = (pin) => crypto.createHmac('sha256', SEC).update('rpin|' + String(pin)).digest('hex');

// ───────── Админы замын нэмэлт хуурамч SQL ─────────
// _gamefake-ийн pool.query-г ороож, энд таних SQL-ийг санах ойгоор хариулна; бусдыг _gamefake руу дамжуулна
// (тэнд танихгүй тоглоом/төлбөрийн SQL → db.unknown + throw). Админы зам транзакц ашигладаггүй.
const X = { wsLogin: new Set(), wsPurch: [], grants: [], wsLoginAt: [], nextWs: 1, nextGrant: 1, pin: null };
function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function tms(r) { return r.created_at instanceof Date ? r.created_at.getTime() : Number(r.created_at); }
function dayOf(ms) { return new Date(ms).toISOString().slice(0, 10); }
function unknown(q) { F.db.unknown.push('admin: ' + q); throw new Error('mock(admin): unknown SQL'); }
// Тайлангийн WHERE-ийн нөхцөл бүрийг (AND-аар) задлана. Танихгүй нөхцөл → unknown (тест унана).
function cond(c, p, d) {
  let m;
  if (c === 'granted = TRUE') return (r) => r.granted === true;
  if (c === "COALESCE(plan,'') <> 'game'") return (r) => (r.plan || '') !== 'game';
  if ((m = c.match(/^created_at > NOW\(\) - INTERVAL '(\d+) days?'$/))) { const lim = Date.now() - Number(m[1]) * DAY; return (r) => tms(r) > lim; }
  if ((m = c.match(/^created_at >= \$(\d)::date$/))) { const t = Date.parse(p[Number(m[1]) - 1] + 'T00:00:00Z'); return (r) => tms(r) >= t; }
  if ((m = c.match(/^created_at < \(\$(\d)::date \+ INTERVAL '1 day'\)$/))) { const t = Date.parse(p[Number(m[1]) - 1] + 'T00:00:00Z') + DAY; return (r) => tms(r) < t; }
  if (c === 'created_at::date = d::date' && d) return (r) => dayOf(tms(r)) === d;
  return unknown('cond: ' + c);
}
function whereFn(w, p, d) {
  if (!w) return () => true;
  const preds = w.split(' AND ').map((c) => cond(c.trim(), p, d));
  return (r) => preds.every((f) => f(r));
}
function tableRows(t) {
  if (t === 'ws_purchases') return X.wsPurch;
  if (t === 'pay_pending') return Array.from(F.db.pay.values());
  if (t === 'game_purchases') return F.db.purch;
  if (t === 'ws_admin_grants') return X.grants;
  return unknown('table: ' + t);
}
const sumOf = (rows) => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
// SQL LIKE (\ escape) → RegExp
function likeRe(pat) {
  let s = '^';
  for (let i = 0; i < pat.length; i++) {
    const ch = pat[i];
    if (ch === '\\' && i + 1 < pat.length) { s += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
    s += ch === '%' ? '.*' : ch === '_' ? '.' : ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(s + '$');
}
function groupBy(rows, keys) {
  const m = new Map();
  rows.forEach((r) => {
    const k = keys.map((x) => r[x]).join('|');
    if (!m.has(k)) { const o = {}; keys.forEach((x) => { o[x] = r[x]; }); o.n = 0; o.s = 0; m.set(k, o); }
    const o = m.get(k); o.n += 1; o.s += Number(r.amount) || 0;
  });
  return Array.from(m.values());
}

function adminQuery(q, p) {
  let m;
  // ── PIN ──
  if (q === "SELECT sval FROM ws_settings WHERE skey='report_pin'") return { rows: X.pin ? [{ sval: X.pin }] : [] };
  // _sms.hit (буруу PIN-ийн квот)
  if (/^INSERT INTO rate_limits .* RETURNING count, (GREATEST|1 AS retry_after)/.test(q)) {
    const k = String(p[0]); const r = F.db.rl.get(k) || { ws: Date.now(), count: 0 }; r.count += 1; F.db.rl.set(k, r);
    return { rows: [{ count: r.count, retry_after: 1 }] };
  }
  // ── данс шалгах (game_grant) ──
  if (q === 'SELECT 1 FROM ws_login WHERE lower(email)=$1 LIMIT 1') return { rows: X.wsLogin.has(String(p[0])) ? [{ '?column?': 1 }] : [] };
  if (q === 'SELECT 1 FROM users WHERE lower(email)=$1 LIMIT 1') return { rows: F.db.users.has(String(p[0])) ? [{ '?column?': 1 }] : [] };
  // ── ws_admin_grants ──
  if (q === 'INSERT INTO ws_admin_grants (email, grade, months, amount, source, note, game_key, realm, days) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)') {
    X.grants.push({ id: X.nextGrant++, email: p[0], grade: p[1], months: p[2], amount: p[3], source: p[4], note: p[5], game_key: p[6], realm: p[7], days: p[8], created_at: Date.now() });
    return { rows: [] };
  }
  if (q === 'INSERT INTO ws_admin_grants (email, grade, months, amount, source, note) VALUES ($1,$2,$3,$4,$5,$6)') {
    X.grants.push({ id: X.nextGrant++, email: p[0], grade: p[1], months: p[2], amount: p[3], source: p[4], note: p[5], game_key: null, realm: null, days: null, created_at: Date.now() });
    return { rows: [] };
  }
  if ((m = q.match(/^SELECT email, grade, months, note, created_at, game_key, realm, days FROM ws_admin_grants (?:(WHERE .*) )?ORDER BY created_at DESC LIMIT 300$/))) {
    const f = whereFn(m[1] ? m[1].replace(/^WHERE /, '') : '', p);
    return { rows: X.grants.filter(f).sort((a, b) => b.created_at - a.created_at).slice(0, 300)
      .map((g) => ({ email: g.email, grade: g.grade, months: g.months, note: g.note, created_at: new Date(g.created_at), game_key: g.game_key, realm: g.realm, days: g.days })) };
  }
  // ── тайлан: нийлбэр ──
  if ((m = q.match(/^SELECT COUNT\(\*\)::int n, COALESCE\(SUM\(amount\),0\)::int s FROM (ws_purchases|pay_pending|game_purchases)(?: WHERE (.*))?$/))) {
    const rows = tableRows(m[1]).filter(whereFn(m[2] || '', p));
    return { rows: [{ n: rows.length, s: sumOf(rows) }] };
  }
  // ── тайлан: өдрөөр ──
  if ((m = q.match(/^SELECT d::date AS day, (.*) FROM generate_series\((.*)\) d ORDER BY d$/))) {
    const cols = [];
    const re = /COALESCE\(\(SELECT SUM\(amount\) FROM (\w+) WHERE (.*?)\),0\)::int AS (\w+)/g;
    let c;
    while ((c = re.exec(m[1]))) cols.push({ t: c[1], w: c[2], as: c[3] });
    if (cols.length !== 3) unknown('daily cols: ' + m[1]);
    let days = [];
    if (m[2] === "NOW() - INTERVAL '29 days', NOW(), INTERVAL '1 day'") {
      for (let i = 29; i >= 0; i--) days.push(dayOf(Date.now() - i * DAY));
    } else if (m[2] === "$1::date, LEAST($2::date, $1::date + 179), INTERVAL '1 day'") {
      const a = Date.parse(p[0] + 'T00:00:00Z'), b = Math.min(Date.parse(p[1] + 'T00:00:00Z'), a + 179 * DAY);
      for (let t = a; t <= b; t += DAY) days.push(dayOf(t));
    } else unknown('daily series: ' + m[2]);
    return { rows: days.map((d) => {
      const o = { day: new Date(d + 'T00:00:00Z') };
      cols.forEach((col) => { o[col.as] = sumOf(tableRows(col.t).filter(whereFn(col.w, p, d))); });
      return o;
    }) };
  }
  // ── тайлан: ангиар / тоглоомоор ──
  if ((m = q.match(/^SELECT COALESCE\(grade,'\(бүх анги\)'\) AS grade, COUNT\(\*\)::int n, COALESCE\(SUM\(amount\),0\)::int s FROM ws_purchases (?:WHERE (.*) )?GROUP BY grade ORDER BY s DESC$/))) {
    const rows = X.wsPurch.filter(whereFn(m[1] || '', p)).map((r) => Object.assign({}, r, { grade: r.grade || '(бүх анги)' }));
    return { rows: groupBy(rows, ['grade']).sort((a, b) => b.s - a.s) };
  }
  if ((m = q.match(/^SELECT game_key, realm, grade, COUNT\(\*\)::int n, COALESCE\(SUM\(amount\),0\)::int s FROM game_purchases (?:WHERE (.*) )?GROUP BY game_key, realm, grade ORDER BY s DESC, game_key, grade$/))) {
    const rows = F.db.purch.filter(whereFn(m[1] || '', p)).map((r) => Object.assign({}, r, { grade: r.grade == null ? null : r.grade }));
    const gk = (x) => (x.grade == null ? '~' : String(x.grade));   // PG: TEXT дараалал, NULL сүүлд (ASC)
    return { rows: groupBy(rows, ['game_key', 'realm', 'grade']).sort((a, b) => b.s - a.s || (a.game_key < b.game_key ? -1 : a.game_key > b.game_key ? 1 : gk(a) < gk(b) ? -1 : 1)) };
  }
  // ── ws_badges ──
  if (q === 'SELECT COALESCE(MAX(id),0)::int AS last_id, COUNT(*) FILTER (WHERE id > $1)::int AS n_new FROM ws_purchases') {
    const seen = Number(p[0]); return { rows: [{ last_id: X.wsPurch.reduce((a, r) => Math.max(a, r.id), 0), n_new: X.wsPurch.filter((r) => r.id > seen).length }] };
  }
  if (q === 'SELECT COALESCE(MAX(id),0)::int AS last_id, COUNT(*) FILTER (WHERE id > $1)::int AS n_new FROM game_purchases') {
    const seen = Number(p[0]); return { rows: [{ last_id: F.db.purch.reduce((a, r) => Math.max(a, r.id), 0), n_new: F.db.purch.filter((r) => r.id > seen).length }] };
  }
  if (q === 'SELECT COUNT(*)::int n FROM ws_login WHERE created_at > $1::timestamptz') {
    const t = Date.parse(p[0]); return { rows: [{ n: X.wsLoginAt.filter((x) => x > t).length }] };
  }
  if (q === 'SELECT MAX(created_at) AS t FROM ws_login') {
    return { rows: [{ t: X.wsLoginAt.length ? new Date(Math.max.apply(null, X.wsLoginAt)) : null }] };
  }
  // ── game_list ──
  if (q.indexOf('SELECT a.realm, a.email, a.game_key, a.expires_at, a.updated_at, (a.expires_at > NOW()) AS active, ') === 0) {
    // бүтцийн гол хэсгүүд (JOIN гурван түлхүүрээр, шүүлтүүр параметрээр, LIMIT)
    ['FROM game_access a LEFT JOIN (SELECT realm, email, game_key, COUNT(*) AS cnt, SUM(amount) AS total, MAX(created_at) AS last_at FROM game_purchases GROUP BY realm, email, game_key) p ON p.realm = a.realm AND p.email = a.email AND p.game_key = a.game_key',
     "WHERE ($1::text = '' OR a.email LIKE $1::text) AND ($2::text = '' OR a.game_key = $2::text) AND ($3::text = '' OR a.realm = $3::text) AND ($4::text = '' OR ($4::text = 'active') = (a.expires_at > NOW()))",
     'ORDER BY a.updated_at DESC LIMIT '].forEach((s) => { if (q.indexOf(s) < 0) unknown('game_list: ' + q); });
    const lim = Number(q.match(/LIMIT (\d+)$/)[1]);
    const like = p[0] ? likeRe(p[0]) : null;
    const rows = Array.from(F.db.access.values())
      .filter((a) => (!like || like.test(a.email)) && (!p[1] || a.game_key === p[1]) && (!p[2] || a.realm === p[2]) &&
        (!p[3] || (p[3] === 'active') === (a.expires_at.getTime() > Date.now())))
      .sort((a, b) => b.updated_at - a.updated_at).slice(0, lim)
      .map((a) => {
        const ps = F.db.purch.filter((x) => x.realm === a.realm && x.email === a.email && x.game_key === a.game_key);
        return { realm: a.realm, email: a.email, game_key: a.game_key, expires_at: a.expires_at, updated_at: a.updated_at,
          active: a.expires_at.getTime() > Date.now(), paid_count: ps.length, paid_sum: sumOf(ps),
          paid_last: ps.length ? new Date(Math.max.apply(null, ps.map(tms))) : null, grade: a.grade == null ? null : a.grade };
      });
    return { rows: rows };
  }
  if (q === 'SELECT game_key, realm, COUNT(*) FILTER (WHERE expires_at > NOW())::int AS active, COUNT(*)::int AS n FROM game_access GROUP BY game_key, realm') {
    const g = new Map();
    F.db.access.forEach((a) => {
      const k = a.game_key + '|' + a.realm;
      if (!g.has(k)) g.set(k, { game_key: a.game_key, realm: a.realm, active: 0, n: 0 });
      const o = g.get(k); o.n += 1; if (a.expires_at.getTime() > Date.now()) o.active += 1;
    });
    return { rows: Array.from(g.values()) };
  }
  if (q === 'SELECT game_key, realm, COUNT(*)::int AS sales FROM game_purchases GROUP BY game_key, realm') {
    return { rows: groupBy(F.db.purch, ['game_key', 'realm']).map((x) => ({ game_key: x.game_key, realm: x.realm, sales: x.n })) };
  }
  if (q === 'SELECT id, invoice_id, realm, email, game_key, amount, days, expires_at, created_at, grade FROM game_purchases ORDER BY id DESC LIMIT 100') {
    return { rows: F.db.purch.slice().sort((a, b) => b.id - a.id).slice(0, 100).map((x) => Object.assign({ grade: null }, x)) };
  }
  if (q === "SELECT invoice_id, email, realm, game_key, amount, created_at, game_grade FROM pay_pending WHERE plan='game' AND granted=FALSE AND created_at > NOW() - INTERVAL '30 days' ORDER BY created_at DESC LIMIT 100") {
    return { rows: Array.from(F.db.pay.values()).filter((r) => r.plan === 'game' && r.granted === false && r.created_at > Date.now() - 30 * DAY)
      .sort((a, b) => b.created_at - a.created_at).slice(0, 100)
      .map((r) => ({ invoice_id: r.invoice_id, email: r.email, realm: r.realm, game_key: r.game_key, amount: r.amount, created_at: new Date(r.created_at), game_grade: r.game_grade == null ? null : r.game_grade })) };
  }
  return null;
}
const origQuery = F.pool.query;
F.pool.query = async function (sql, p) {
  const r = adminQuery(norm(sql), p || []);
  return r || origQuery(sql, p);
};

function xreset() {
  F.reset();
  X.wsLogin.clear(); X.wsPurch.length = 0; X.grants.length = 0; X.wsLoginAt.length = 0; X.pin = null;
  X.nextWs = 1; X.nextGrant = 1;
}
function wsLogin(email) { X.wsLogin.add(String(email).toLowerCase()); X.wsLoginAt.push(Date.now()); }
function addWsPurch(amount, ago, grade) { const r = { id: X.nextWs++, email: 'w@x.mn', amount: amount, grade: grade || null, created_at: Date.now() - (ago || 0) }; X.wsPurch.push(r); return r; }
function rawPay(row) {
  const r = Object.assign({ months: 1, amount: 1900, event_id: null, granted: false, promo_code: null, game_key: null, realm: null, created_at: Date.now() }, row);
  F.db.pay.set(r.invoice_id, r); return r;
}
function access(realm, email, key) { return F.db.access.get(realm + '|' + email + '|' + key) || null; }
// Бодит урсгалаар (create → QPay PAID → check) тоглоом худалдаж авна
async function buyWs(email, game) {
  const r = await Q('create', { plan: 'game', realm: 'ws', game: game, wstoken: wsTok(email) });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  const inv = r.body.invoice.invoice_id;
  F.qp.paid.set(inv, 1900);
  const c = await Q('check', { invoice_id: inv, email: email });
  assert.strictEqual(c.body.paid, true, JSON.stringify(c.body));
  return inv;
}
async function report(body) {
  X.pin = pinHash(PIN);
  const r = await A('ws_report', Object.assign({ pin: PIN }, body || {}));
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.ok, true, JSON.stringify(r.body));
  return r.body;
}

beforeEach(() => xreset());

test('админ биш (токенгүй / cm / ws / буруу түлхүүр) → 401; админд гурван action 405 БИШ (allowlist)', async () => {
  F.addUser('u@x.mn'); wsLogin('u@x.mn');
  const bad = [null, bearer(cmTok('u@x.mn')), bearer(wsTok('u@x.mn')), bearer(jwt.sign({ admin: true }, 'other-secret')), bearer(jwt.sign({ admin: false }, SEC))];
  for (const action of ['game_grant', 'game_revoke', 'game_list']) {
    for (const h of bad) {
      const r = await Q(action, { realm: 'ws', email: 'u@x.mn', game: 'sudoku' }, h ? { headers: h } : undefined);
      assert.strictEqual(r.statusCode, 401, action + ' ' + JSON.stringify(h));
      assert.notStrictEqual(r.body && r.body.ok, true);
    }
    const ok = await A(action, { realm: 'ws', email: 'u@x.mn', game: 'sudoku' });
    assert.notStrictEqual(ok.statusCode, 405, action + ' allowlist-д байх ёстой');
    assert.strictEqual(ok.body.ok, true, action + ' ' + JSON.stringify(ok.body));
  }
  // админ биш үед эрх үүсээгүй (зөвхөн админы game_grant нэг удаа олгосон, дараа нь game_revoke цуцалсан)
  assert.strictEqual(access('ws', 'u@x.mn', 'sudoku'), null);
});

test('game_grant: буруу сайт/имэйл/тоглоом/хугацаа → 400, эрх үүсэхгүй', async () => {
  wsLogin('a@x.mn');
  const cases = [
    [{ email: 'a@x.mn', game: 'sudoku' }, 'realm байхгүй'],
    [{ realm: 'both', email: 'a@x.mn', game: 'sudoku' }, 'realm буруу'],
    [{ realm: 'ws', email: 'not-an-email', game: 'sudoku' }, 'имэйл буруу'],
    [{ realm: 'ws', email: 'a@localhost', game: 'sudoku' }, 'домэйнгүй'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'hack' }, 'allowlist-гүй'],
    [{ realm: 'ws', email: 'a@x.mn', game: '__proto__' }, '__proto__'],
    [{ realm: 'ws', email: 'a@x.mn', game: ['sudoku'] }, 'массив'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'sudoku', days: 0 }, 'days 0'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'sudoku', days: 367 }, 'days 367'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'sudoku', days: 1.5 }, 'days бутархай'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'sudoku', days: 'abc' }, 'days текст'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'sudoku', months: 13 }, 'months 13'],
    [{ realm: 'ws', email: 'a@x.mn', game: 'sudoku', months: 0 }, 'months 0'],
  ];
  for (const [body, msg] of cases) {
    const r = await A('game_grant', body);
    assert.strictEqual(r.statusCode, 400, msg + ' ' + JSON.stringify(r.body));
    assert.strictEqual(r.body.ok, false, msg);
  }
  assert.strictEqual(F.db.access.size, 0);
  assert.strictEqual(X.grants.length, 0);
});

test('game_grant: данс тухайн сайтад бүртгэлтэй байх ёстой (ws → ws_login, cm → users); сайтууд тусдаа', async () => {
  F.addUser('cmonly@x.mn');          // зөвхөн cyber-math.com
  wsLogin('wsonly@x.mn');            // зөвхөн Дасгалын төв
  let r = await A('game_grant', { realm: 'ws', email: 'cmonly@x.mn', game: 'sudoku' });
  assert.strictEqual(r.statusCode, 400); assert.strictEqual(r.body.noAccount, true);
  r = await A('game_grant', { realm: 'cm', email: 'wsonly@x.mn', game: 'sudoku' });
  assert.strictEqual(r.statusCode, 400); assert.strictEqual(r.body.noAccount, true);
  r = await A('game_grant', { realm: 'ws', email: 'ghost@x.mn', game: 'sudoku' });
  assert.strictEqual(r.statusCode, 400);
  assert.strictEqual(F.db.access.size, 0);

  r = await A('game_grant', { realm: 'cm', email: '  CMonly@X.mn ', game: 'sudoku' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.strictEqual(r.body.email, 'cmonly@x.mn');
  assert.strictEqual(await GM.entitled('cm', 'cmonly@x.mn', 'sudoku'), true);
  assert.strictEqual(await GM.entitled('ws', 'cmonly@x.mn', 'sudoku'), false, 'cm-ийн эрх ws-д ажиллахгүй');
  assert.strictEqual(await GM.entitled('cm', 'cmonly@x.mn', 'play2048'), false, 'зөвхөн тэр тоглоом');
});

test('game_grant: нэмэгддэг (үлдсэн хоног дээр), days/months; ws_admin_grants-д мөнгөгүй бүртгэл, game_purchases/pay_pending-д БИЧИХГҮЙ', async () => {
  wsLogin('t@x.mn');
  let r = await A('game_grant', { realm: 'ws', email: 't@x.mn', game: 'sudoku', note: 'шагнал' });
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  assert.deepStrictEqual([r.body.ok, r.body.realm, r.body.game, r.body.title, r.body.days], [true, 'ws', 'sudoku', 'Судоку', 30]);
  near(daysLeft(r.body.expires_at), 30, 'анх');
  r = await A('game_grant', { realm: 'ws', email: 't@x.mn', game: 'sudoku', days: 7 });
  near(daysLeft(r.body.expires_at), 37, 'хуучин+7');
  r = await A('game_grant', { realm: 'ws', email: 't@x.mn', game: 'sudoku', months: '2' });
  near(daysLeft(r.body.expires_at), 97, 'хуучин+60');
  near(daysLeft(access('ws', 't@x.mn', 'sudoku').expires_at), 97);
  // дууссан эрхийг сунгавал NOW+30 (хуучин хугацаа нэмэгдэхгүй)
  access('ws', 't@x.mn', 'sudoku').expires_at = new Date(Date.now() - 5 * DAY);
  r = await A('game_grant', { realm: 'ws', email: 't@x.mn', game: 'sudoku' });
  near(daysLeft(r.body.expires_at), 30, 'дууссаны дараа');

  assert.strictEqual(X.grants.length, 4);
  const g0 = X.grants[0];
  assert.deepStrictEqual([g0.email, g0.grade, g0.months, g0.amount, g0.source, g0.note, g0.game_key, g0.realm, g0.days],
    ['t@x.mn', null, 1, 1900, 'admin', 'шагнал', 'sudoku', 'ws', 30]);
  assert.deepStrictEqual(X.grants.map((g) => [g.days, g.months, g.amount]), [[30, 1, 1900], [7, 1, 443], [60, 2, 3800], [30, 1, 1900]]);
  assert.strictEqual(F.db.purch.length, 0, 'game_purchases-д бичихгүй');
  assert.strictEqual(F.db.pay.size, 0, 'pay_pending-д бичихгүй');
  assert.strictEqual(F.qp.invoices.length, 0, 'QPay-д хандахгүй');
  // GAME_PRICE env-ийг дагана
  process.env.GAME_PRICE = '2500';
  await A('game_grant', { realm: 'ws', email: 't@x.mn', game: 'numseq', months: 3 });
  assert.strictEqual(X.grants[4].amount, 7500);
});

test('game_revoke: эрхийг устгана → entitled false, launch-ийн шалгалт хаагдана; байхгүй эрх → revoked 0; cm Premium-ийг мэдэгдэнэ', async () => {
  wsLogin('r@x.mn'); F.addUser('r@x.mn');
  await A('game_grant', { realm: 'ws', email: 'r@x.mn', game: 'mathmortal' });
  await A('game_grant', { realm: 'cm', email: 'r@x.mn', game: 'mathmortal' });
  let r = await A('game_revoke', { realm: 'ws', email: 'R@x.mn', game: 'mathmortal' });
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.revoked], [200, true, 1]);
  assert.ok(/2 цаг/.test(r.body.note), r.body.note);
  assert.strictEqual(await GM.entitled('ws', 'r@x.mn', 'mathmortal'), false);
  assert.strictEqual(await GM.entitled('cm', 'r@x.mn', 'mathmortal'), true, 'нөгөө сайтын эрх хэвээр');
  r = await A('game_revoke', { realm: 'ws', email: 'r@x.mn', game: 'mathmortal' });
  assert.deepStrictEqual([r.body.ok, r.body.revoked], [true, 0]);
  for (const body of [{ email: 'r@x.mn', game: 'mathmortal' }, { realm: 'cm', game: 'mathmortal' }, { realm: 'cm', email: 'r@x.mn', game: 'nope' }]) {
    r = await A('game_revoke', body);
    assert.strictEqual(r.statusCode, 400, JSON.stringify(body));
  }
  assert.strictEqual(await GM.entitled('cm', 'r@x.mn', 'mathmortal'), true);
  // Premium хэрэглэгчийн эрхийг цуцалсан ч бүх тоглоом үнэгүй хэвээр — хариунд premium:true
  F.db.users.get('r@x.mn').plan = 'premium';
  F.db.users.get('r@x.mn').premium_expiry = new Date(Date.now() + 10 * DAY);
  r = await A('game_revoke', { realm: 'cm', email: 'r@x.mn', game: 'mathmortal' });
  assert.deepStrictEqual([r.body.revoked, r.body.premium], [1, true]);
});

test('game_list: мөр бүрт идэвхтэй/дууссан + худалдан авалтын тоо/дүн; хайлт (LIKE escape), тоглоом/сайт/төлөв шүүлтүүр; хураангуй; төлөгдөөгүй нэхэмжлэх', async () => {
  wsLogin('buyer@x.mn'); wsLogin('gift@x.mn'); wsLogin('axb@x.mn'); F.addUser('buyer@x.mn');
  await buyWs('buyer@x.mn', 'sudoku');
  await buyWs('buyer@x.mn', 'sudoku');
  await A('game_grant', { realm: 'ws', email: 'gift@x.mn', game: 'play2048' });
  await A('game_grant', { realm: 'cm', email: 'buyer@x.mn', game: 'sudoku' });
  await A('game_grant', { realm: 'ws', email: 'axb@x.mn', game: 'numseq' });
  access('ws', 'axb@x.mn', 'numseq').expires_at = new Date(Date.now() - DAY);   // дууссан
  // төлөгдөөгүй нэхэмжлэх: тоглоом (харагдана), Premium (харагдахгүй), 40 хоногийн өмнөх (харагдахгүй)
  rawPay({ invoice_id: 'P1', email: 'late@x.mn', plan: 'game', game_key: 'ludo', realm: 'cm' });
  rawPay({ invoice_id: 'P2', email: 'prem@x.mn', plan: 'monthly', amount: 9900 });
  rawPay({ invoice_id: 'P3', email: 'old@x.mn', plan: 'game', game_key: 'ludo', realm: 'ws', created_at: Date.now() - 40 * DAY });

  let r = await A('game_list', {});
  assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
  const d = r.body;
  assert.deepStrictEqual([d.ok, d.shown, d.total, d.active], [true, 4, 4, 3]);
  const row = (realm, email, key) => d.rows.find((x) => x.realm === realm && x.email === email && x.game_key === key);
  const b = row('ws', 'buyer@x.mn', 'sudoku');
  assert.deepStrictEqual([b.active, b.paid_count, b.paid_sum], [true, 2, 3800]);
  near(daysLeft(b.expires_at), 60, 'хоёр удаа авсан → 60');
  assert.deepStrictEqual([row('ws', 'gift@x.mn', 'play2048').paid_count, row('ws', 'gift@x.mn', 'play2048').paid_sum], [0, 0], 'админы олголт төлбөргүй');
  assert.strictEqual(row('cm', 'buyer@x.mn', 'sudoku').paid_count, 0, 'cm мөрөнд ws-ийн худалдан авалт тоологдохгүй');
  assert.strictEqual(row('ws', 'axb@x.mn', 'numseq').active, false);
  // хураангуй: 16 тоглоом бүгд, орлогын нийт дүн БАЙХГҮЙ
  assert.strictEqual(d.by_game.length, 16);
  const sud = d.by_game.find((x) => x.key === 'sudoku');
  assert.deepStrictEqual([sud.title, sud.active, sud.active_ws, sud.active_cm, sud.sales, sud.sales_ws, sud.sales_cm], ['Судоку', 2, 1, 1, 2, 2, 0]);
  assert.ok(d.by_game.every((x) => !('sum' in x) && !('s' in x)), 'хураангуйд мөнгөн дүн байхгүй');
  assert.deepStrictEqual(d.purchases.map((x) => x.game_key), ['sudoku', 'sudoku']);
  assert.deepStrictEqual(d.pending.map((x) => x.invoice_id), ['P1']);
  assert.deepStrictEqual([d.catalog.length, d.price, d.days, d.paywall], [16, 1900, 30, true]);

  r = await A('game_list', { q: 'GIFT' });
  assert.deepStrictEqual(r.body.rows.map((x) => x.email), ['gift@x.mn']);
  r = await A('game_list', { q: 'a_b' });
  assert.deepStrictEqual(r.body.rows.map((x) => x.email), [], '_ нь wildcard биш (escape)');
  r = await A('game_list', { q: '%' });
  assert.deepStrictEqual(r.body.rows, [], '% нь wildcard биш (escape)');
  r = await A('game_list', { game: 'sudoku' });
  assert.deepStrictEqual(r.body.rows.map((x) => x.realm + ':' + x.email).sort(), ['cm:buyer@x.mn', 'ws:buyer@x.mn']);
  r = await A('game_list', { realm: 'cm' });
  assert.deepStrictEqual(r.body.rows.map((x) => x.email), ['buyer@x.mn']);
  r = await A('game_list', { status: 'expired' });
  assert.deepStrictEqual(r.body.rows.map((x) => x.email), ['axb@x.mn']);
  r = await A('game_list', { status: 'active', realm: 'ws' });
  assert.deepStrictEqual(r.body.rows.map((x) => x.email).sort(), ['buyer@x.mn', 'gift@x.mn']);
  r = await A('game_list', { game: '__proto__', realm: 'both', status: 'weird' });
  assert.strictEqual(r.body.shown, 4, 'буруу шүүлтүүрийг үл тооно');
  assert.deepStrictEqual(r.body.filter, { q: '', game: '', realm: '', status: '', limit: 500 });
});

test('ws_badges: тоглоомын шинэ худалдан авалт (+1) game_purchases-аас; seenGame; ws тэмдэг өөрчлөгдөхгүй', async () => {
  addWsPurch(39900);
  let r = await A('ws_badges', {});
  assert.deepStrictEqual(r.body.games, { n_new: 0, last_id: 0 });
  assert.deepStrictEqual(r.body.purchases, { n_new: 1, last_id: 1 });
  await buyWs('p1@x.mn', 'sudoku');
  const first = F.db.purch[0].id;
  await buyWs('p2@x.mn', 'xpdrop');
  const last = F.db.purch[1].id;
  // админы олголт +1 болохгүй (худалдан авалт биш)
  wsLogin('g@x.mn'); await A('game_grant', { realm: 'ws', email: 'g@x.mn', game: 'myangat' });
  r = await A('ws_badges', { seenPurchase: 1, seenGame: first });
  assert.deepStrictEqual(r.body.games, { n_new: 1, last_id: last });
  assert.deepStrictEqual(r.body.purchases, { n_new: 0, last_id: 1 });
  r = await A('ws_badges', { seenPurchase: 1, seenGame: last });
  assert.deepStrictEqual(r.body.games, { n_new: 0, last_id: last });
  r = await A('ws_badges', { seenGame: 'junk' });
  assert.deepStrictEqual(r.body.games, { n_new: 2, last_id: last });
  assert.strictEqual((await Q('ws_badges', { seenGame: 0 })).statusCode, 401, 'админ биш');
});

test('ws_report: ws / prem / games гурван сав; pay_pending-ийн plan=game Premium-д ДАВХАР ТООЛОГДОХГҮЙ; total = ws+prem+games; админы олголт орлогод орохгүй', async () => {
  addWsPurch(39900, 0);                     // өнөөдөр, бүх анги
  addWsPurch(9900, 10 * DAY, '9-р анги');   // 10 хоногийн өмнө
  rawPay({ invoice_id: 'PM1', email: 'p@x.mn', plan: 'monthly', amount: 9900, granted: true, created_at: Date.now() - 2 * DAY });
  rawPay({ invoice_id: 'PM2', email: 'p@x.mn', plan: 'yearly', amount: 100980, granted: false });   // төлөгдөөгүй
  await buyWs('k@x.mn', 'sudoku');          // pay_pending plan=game granted + game_purchases 1900
  F.db.purch.push({ id: 9001, invoice_id: 'OLD1', realm: 'cm', email: 'o@x.mn', game_key: 'chessmath', amount: 1900, days: 30, expires_at: null, created_at: new Date(Date.now() - 40 * DAY) });
  wsLogin('gift@x.mn'); await A('game_grant', { realm: 'ws', email: 'gift@x.mn', game: 'ludo', months: 2, note: 'тэмцээн' });
  await A('ws_grant', { email: 'w2@x.mn', months: 3 });   // ажлын хуудасны олголт (хуучин 6 баганатай бүртгэл)
  assert.strictEqual(Array.from(F.db.pay.values()).filter((x) => x.plan === 'game' && x.granted).length, 1, 'тоглоомын pay_pending мөр бий');

  const r = await report();
  const w = r.win;
  assert.deepStrictEqual(w.d1, { ws: { n: 1, sum: 39900 }, prem: { n: 0, sum: 0 }, games: { n: 1, sum: 1900 }, total: 41800 });
  assert.deepStrictEqual(w.d7, { ws: { n: 1, sum: 39900 }, prem: { n: 1, sum: 9900 }, games: { n: 1, sum: 1900 }, total: 51700 });
  assert.deepStrictEqual(w.d30, { ws: { n: 2, sum: 49800 }, prem: { n: 1, sum: 9900 }, games: { n: 1, sum: 1900 }, total: 61600 });
  assert.deepStrictEqual(w.all, { ws: { n: 2, sum: 49800 }, prem: { n: 1, sum: 9900 }, games: { n: 2, sum: 3800 }, total: 63500 });
  Object.keys(w).forEach((k) => {
    assert.strictEqual(w[k].total, w[k].ws.sum + w[k].prem.sum + w[k].games.sum, k + ' total');
    assert.ok(!('game' in w[k]), k + ': хуучин "game" түлхүүр (Premium) prem болсон');
  });
  // өдрөөр: өнөөдөр ws 39900, prem 0 (тоглоомын pay_pending мөр орохгүй), games 1900
  assert.strictEqual(r.daily.length, 30);
  const today = r.daily[r.daily.length - 1];
  assert.deepStrictEqual([today.ws, today.prem, today.games], [39900, 0, 1900]);
  assert.strictEqual(r.daily.reduce((s, x) => s + x.prem, 0), 9900);
  assert.strictEqual(r.daily.reduce((s, x) => s + x.games, 0), 1900, '40 хоногийн өмнөх график 30 хоногт орохгүй');
  // тоглоомоор (30 хоног)
  assert.deepStrictEqual(r.byGame, [{ title: 'Судоку', game_key: 'sudoku', realm: 'ws', grade: null, n: 1, s: 1900 }]);
  assert.strictEqual(r.game_price, 1900);
  // админы олголт: бүртгэлд тоглоомын нэртэй, мөнгөн дүнгүй
  const gg = r.grants.find((x) => x.game_key === 'ludo');
  assert.deepStrictEqual([gg.email, gg.realm, gg.days, gg.months, gg.game_title, gg.note], ['gift@x.mn', 'ws', 60, 2, 'Ludo Math', 'тэмцээн']);
  assert.ok(!('amount' in gg), 'олголтын дүн тайланд гарахгүй');
  const wg = r.grants.find((x) => x.email === 'w2@x.mn');
  assert.deepStrictEqual([wg.months, wg.game_key, wg.realm, 'game_title' in wg], [3, null, null, false]);
});

test('ws_report: сонгосон хугацаа (from/to) — game_purchases төлсөн огноогоор; byGame бүх сайт; өдрийн график 3 багана', async () => {
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  F.db.purch.push({ id: 9101, invoice_id: 'A1', realm: 'cm', email: 'o@x.mn', game_key: 'chessmath', amount: 1900, days: 30, expires_at: null, created_at: new Date(Date.now() - 40 * DAY) });
  F.db.purch.push({ id: 9102, invoice_id: 'A2', realm: 'ws', email: 'o@x.mn', game_key: 'chessmath', amount: 1900, days: 30, expires_at: null, created_at: new Date(Date.now() - 40 * DAY) });
  F.db.purch.push({ id: 9103, invoice_id: 'A3', realm: 'ws', email: 'q@x.mn', game_key: 'sudoku', amount: 1900, days: 30, expires_at: null, created_at: new Date(Date.now() - 3 * DAY) });
  // нэхэмжлэх 45 хоногийн өмнө үүссэн боловч 40 хоногийн өмнө төлөгдсөн — тайлан төлсөн огноогоор (game_purchases)
  rawPay({ invoice_id: 'A1', email: 'o@x.mn', plan: 'game', game_key: 'chessmath', realm: 'cm', granted: true, created_at: Date.now() - 45 * DAY });
  const from = iso(Date.now() - 41 * DAY), to = iso(Date.now() - 39 * DAY);
  const r = await report({ from: to, to: from });   // урвуу өгсөн ч солигдоно
  assert.deepStrictEqual(r.range, { from: from, to: to });
  assert.deepStrictEqual(r.win.custom, { ws: { n: 0, sum: 0 }, prem: { n: 0, sum: 0 }, games: { n: 2, sum: 3800 }, total: 3800 });
  assert.deepStrictEqual(r.byGame.map((x) => [x.game_key, x.realm, x.n, x.s]).sort(), [['chessmath', 'cm', 1, 1900], ['chessmath', 'ws', 1, 1900]]);
  assert.strictEqual(r.daily.length, 3);
  assert.ok(r.daily.every((x) => 'ws' in x && 'prem' in x && 'games' in x && !('game' in x)));
  assert.strictEqual(r.daily.reduce((s, x) => s + x.games, 0), 3800);
  assert.strictEqual(r.daily.reduce((s, x) => s + x.prem, 0), 0, 'тоглоомын нэхэмжлэх prem-д орохгүй');
  assert.strictEqual(r.win.all.games.sum, 5700);
  assert.strictEqual(r.win.all.prem.sum, 0);
});

test('ws_report: PIN буруу / тохируулаагүй → мөнгөн дүн буцаахгүй', async () => {
  let r = await A('ws_report', { pin: PIN });
  assert.strictEqual(r.body.needSetup, true);
  assert.ok(!r.body.win);
  X.pin = pinHash(PIN);
  r = await A('ws_report', { pin: '0000' });
  assert.strictEqual(r.body.ok, false);
  assert.ok(!r.body.win && !r.body.byGame);
  assert.strictEqual((await Q('ws_report', { pin: PIN })).statusCode, 401, 'админ биш');
});

test('регресс: ws_grant / ws_revoke (ажлын хуудас) хэвээр ажиллана, тоглоомын эрх үүсэхгүй', async () => {
  let r = await A('ws_grant', { email: 'ws1@x.mn', months: 6 });
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.months], [200, true, 6]);
  r = await A('ws_revoke', { email: 'ws1@x.mn' });
  assert.deepStrictEqual([r.statusCode, r.body.ok], [200, true]);
  assert.strictEqual(F.db.access.size, 0);
  assert.deepStrictEqual(X.grants.map((g) => [g.email, g.months, g.amount, g.game_key]), [['ws1@x.mn', 6, 69900, null]]);
});

test('admin.html: inline script parse; «Тоглоом» таб, +1 тэмдэг, тайлангийн prem/games/byGame', () => {
  const html = fs.readFileSync(path.join(F.WT, 'admin.html'), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1] || '';
    if (/\bsrc=/.test(attrs) || /type=["'](?!text\/javascript)/i.test(attrs)) continue;
    n++;
    assert.doesNotThrow(() => new vm.Script(m[2], { filename: 'admin.html#inline' + n }), 'inline#' + n);
  }
  assert.ok(n >= 1);
  [
    'data-wstab="games"', 'id="wstab-games"', 'id="tab-badge-games"', "'games'",
    "wsPost('game_list'", "wsPost('game_grant'", "wsPost('game_revoke'", 'seenGame', 'admSeenGame',
    'id="tl-games"', 'r.byGame', 'd.prem', 'd.games', 'x.prem', 'x.games',
  ].forEach((s) => assert.ok(html.indexOf(s) >= 0, 'admin.html-д байх ёстой: ' + s));
  // хуучин 'game' сав (Premium-ийг «Тоглоомын эрх» гэж харуулдаг байсан) үлдээгүй
  ['d.game.sum', "['game', '#22c55e']", '>Тоглоомын эрх<'].forEach((s) => assert.ok(html.indexOf(s) < 0, 'үлдэх ёсгүй: ' + s));
  const tabs = html.match(/var ADM_WS_TABS\s*=\s*\[([^\]]*)\]/);
  assert.ok(tabs && /'games'/.test(tabs[1]), 'ADM_WS_TABS-д games');
});

// ───────── Бүртгэл (game_purchases) дутсан төлсөн тоглоом — тайлан/жагсаалт/тулгалт pay_pending-ээс нөхнө ─────────
test('ledger heal: game_purchases бичигдээгүй төлсөн тоглоом тайланд (games) орно, «Админ олгосон» биш; давхардахгүй', async () => {
  wsLogin('lost@x.mn');
  F.db.failLedger = true;                       // settleGame-ийн recordPurchase унана (SAVEPOINT) — эрх олгогдоно
  const inv = await buyWs('lost@x.mn', 'sudoku');
  assert.strictEqual(F.db.pay.get(inv).granted, true, 'claim хийгдсэн');
  const acc = access('ws', 'lost@x.mn', 'sudoku');
  assert.ok(acc, 'эрх олгогдсон');
  assert.strictEqual(F.db.purch.length, 0, 'бүртгэл дутуу');
  assert.ok(F.tg.some((t) => /game_purchases/.test(t) && /автоматаар нөхөгдөнө/.test(t) && t.indexOf(inv) >= 0), 'Telegram: автоматаар нөхөгдөнө');
  // нөхөлт өөрөө унавал (DB) тайлан унахгүй, 0 харуулна — дараагийн удаа дахин оролдоно
  let r = await report();
  assert.deepStrictEqual(r.win.all.games, { n: 0, sum: 0 });
  assert.strictEqual(r.games_healed, undefined);
  F.db.failLedger = false;
  // нөхөх ЁСГҮЙ мөрүүд: төлөгдөөгүй тоглоом, Premium, allowlist-гүй тоглоом, буруу сайт, админы олголт
  rawPay({ invoice_id: 'UNPAID', email: 'u@x.mn', plan: 'game', game_key: 'ludo', realm: 'ws', granted: false });
  rawPay({ invoice_id: 'PREM', email: 'p@x.mn', plan: 'monthly', amount: 9900, granted: true });
  rawPay({ invoice_id: 'BADKEY', email: 'b@x.mn', plan: 'game', game_key: 'hack', realm: 'ws', granted: true });
  rawPay({ invoice_id: 'BADREALM', email: 'b@x.mn', plan: 'game', game_key: 'ludo', realm: 'xx', granted: true });
  wsLogin('gift@x.mn'); await A('game_grant', { realm: 'ws', email: 'gift@x.mn', game: 'play2048' });

  r = await report();
  assert.strictEqual(r.games_healed, 1);
  assert.deepStrictEqual(r.win.d1, { ws: { n: 0, sum: 0 }, prem: { n: 1, sum: 9900 }, games: { n: 1, sum: 1900 }, total: 11800 });
  assert.deepStrictEqual(r.win.all.games, { n: 1, sum: 1900 });
  assert.strictEqual(r.daily[r.daily.length - 1].games, 1900);
  assert.deepStrictEqual(r.byGame.map((x) => [x.game_key, x.realm, x.n, x.s]), [['sudoku', 'ws', 1, 1900]]);
  assert.strictEqual(F.db.purch.length, 1);
  const p = F.db.purch[0];
  assert.deepStrictEqual([p.invoice_id, p.realm, p.email, p.game_key, p.amount, p.days], [inv, 'ws', 'lost@x.mn', 'sudoku', 1900, 30]);
  assert.strictEqual(new Date(p.expires_at).getTime(), acc.expires_at.getTime(), 'expires_at = эрхийн дуусах огноо');

  // дахин нээхэд давхардахгүй
  r = await report();
  assert.strictEqual(r.games_healed, undefined);
  assert.deepStrictEqual(r.win.all.games, { n: 1, sum: 1900 });
  assert.strictEqual(F.db.purch.length, 1);
  // жагсаалт: төлсөн гэж харагдана (админы олголт хэвээр төлбөргүй)
  const l = (await A('game_list', {})).body;
  const row = (e, k) => l.rows.find((x) => x.email === e && x.game_key === k);
  assert.deepStrictEqual([row('lost@x.mn', 'sudoku').paid_count, row('lost@x.mn', 'sudoku').paid_sum], [1, 1900]);
  assert.deepStrictEqual([row('gift@x.mn', 'play2048').paid_count, row('gift@x.mn', 'play2048').paid_sum], [0, 0]);
  assert.deepStrictEqual(l.purchases.map((x) => x.invoice_id), [inv]);
  assert.strictEqual(l.by_game.find((x) => x.key === 'sudoku').sales, 1);
  // +1 тэмдэг: нөхсөн бүртгэл шинэ худалдан авалт болж харагдана
  assert.deepStrictEqual((await A('ws_badges', { seenGame: 0 })).body.games, { n_new: 1, last_id: p.id });
  // ахин check хийхэд дахин олгохгүй, бүртгэл нэмэгдэхгүй
  const c = await Q('check', { invoice_id: inv, email: 'lost@x.mn' });
  assert.strictEqual(c.body.paid, true);
  near(daysLeft(access('ws', 'lost@x.mn', 'sudoku').expires_at), 30, 'дахин сунгахгүй');
  assert.strictEqual(F.db.purch.length, 1);
});

test('ledger heal: «Тоглоом» таб (game_list) ба «Төлбөр тулгах» (ws_reconcile) ч нөхнө', async () => {
  wsLogin('l2@x.mn');
  F.db.failLedger = true;
  const inv1 = await buyWs('l2@x.mn', 'numseq');
  F.db.failLedger = false;
  let l = (await A('game_list', {})).body;
  assert.strictEqual(l.ok, true);
  assert.deepStrictEqual(l.rows.map((x) => [x.email, x.game_key, x.paid_count, x.paid_sum]), [['l2@x.mn', 'numseq', 1, 1900]]);
  assert.deepStrictEqual(l.purchases.map((x) => x.invoice_id), [inv1]);

  F.db.failLedger = true;
  const inv2 = await buyWs('l2@x.mn', 'xpdrop');
  F.db.failLedger = false;
  let rc = await A('ws_reconcile', {});
  assert.deepStrictEqual([rc.statusCode, rc.body.ok, rc.body.granted_count, rc.body.ledger_healed], [200, true, 0, 1]);
  rc = await A('ws_reconcile', {});
  assert.strictEqual(rc.body.ledger_healed, undefined, 'дахин нөхөхгүй');
  assert.deepStrictEqual(F.db.purch.map((x) => x.invoice_id).sort(), [inv1, inv2].sort());
  // нөхөлт унасан ч тулгалт ажилласаар (алдаагүй хариу)
  F.db.failLedger = true;
  rc = await A('ws_reconcile', {});
  assert.deepStrictEqual([rc.statusCode, rc.body.ok, rc.body.ledger_healed], [200, true, undefined]);
  F.db.failLedger = false;
  const r = await report();
  assert.deepStrictEqual(r.win.all.games, { n: 2, sum: 3800 });
});

// ───────── admin.html-ийн рендер (vm + хуурамч DOM): XSS escape, +1 тэмдгийн нийлбэр ─────────
// Бодит хуудасны inline script-ийг (gmRender/tlRender/admBadges агуулсан) ажиллуулж, функцуудыг шууд дуудна.
// readyState='loading' — init функцууд DOMContentLoaded-ийг хүлээнэ (ажиллахгүй). Сүлжээ, таймер 0.
function adminSandbox() {
  const html = fs.readFileSync(path.join(F.WT, 'admin.html'), 'utf8');
  const re = /<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi;
  let m, src = null;
  while ((m = re.exec(html))) {
    if (!/\bsrc=/.test(m[1] || '') && m[2].indexOf('function gmRender(') >= 0) { src = m[2]; break; }
  }
  assert.ok(src, 'gmRender агуулсан inline script');
  const noop = function () {};
  const els = new Map();
  function mkEl(id) {
    const attrs = {};
    return {
      id: id, innerHTML: '', textContent: '', value: '', disabled: false, style: {}, dataset: {},
      classList: { contains: () => false, add: noop, remove: noop, toggle: noop },
      setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null),
      removeAttribute: (k) => { delete attrs[k]; },
      querySelector: () => null, querySelectorAll: () => [], addEventListener: noop, appendChild: (c) => c,
      closest: () => null, scrollIntoView: noop, focus: noop,
    };
  }
  const store = new Map();
  const document = Object.assign(mkEl('#document'), {
    readyState: 'loading', cookie: '',
    getElementById: (id) => { if (!els.has(id)) els.set(id, mkEl(id)); return els.get(id); },
    createElement: () => mkEl(''), body: mkEl('body'), documentElement: mkEl('html'), head: mkEl('head'),
  });
  const ctx = {
    document: document, console: { log: noop, warn: noop, error: noop, info: noop },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); }, removeItem: (k) => { store.delete(k); } },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    location: { href: 'https://cyber-math.com/admin.html', hash: '', search: '', pathname: '/admin.html', origin: 'https://cyber-math.com' },
    navigator: { userAgent: 'node-test' }, history: { replaceState: noop, pushState: noop },
    fetch: () => Promise.reject(new Error('sandbox: сүлжээгүй')),
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0,
    alert: noop, confirm: () => false, prompt: () => null,
    MutationObserver: function () { return { observe: noop, disconnect: noop }; },
    matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
    getComputedStyle: () => ({}), addEventListener: noop, removeEventListener: noop, scrollTo: noop,
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'admin.html#gm' });
  return { ctx: ctx, el: (id) => document.getElementById(id), store: store };
}
const EVIL = '"><img src=x onerror=alert(1)>';
const EVIL_EM = EVIL + '@evil.mn';
function noRawHtml(h, where) {
  assert.ok(h.indexOf('<img') < 0, where + ': escape хийгдээгүй <img: ' + h.slice(0, 200));
  assert.ok(h.indexOf(EVIL) < 0, where + ': payload түүхий хэлбэрээр (атрибутаас гарах "> ч орно)');
}
const plain = (x) => JSON.parse(JSON.stringify(x));   // vm-ийн объектыг (өөр Object.prototype) энгийн болгоно

test('admin.html gmRender: имэйл/тоглоом/сайт/гарчгийг escape хийнэ (хүснэгт, худалдан авалт, төлөгдөөгүй, хураангуй, сонголт)', () => {
  const sb = adminSandbox();
  const now = new Date().toISOString();
  const d = {
    ok: true, paywall: true, price: 1900, days: 30, total: 3, active: 2, shown: 3,
    catalog: [{ key: 'sudoku', title: EVIL, kind: 'file', multi: false }, { key: EVIL, title: 'X', kind: 'file', multi: true }],
    rows: [
      { realm: 'ws', email: EVIL_EM, game_key: 'sudoku', expires_at: now, updated_at: now, active: true, paid_count: 2, paid_sum: 3800, grade: '8' },
      { realm: EVIL, email: 'a@x.mn', game_key: EVIL, expires_at: now, updated_at: now, active: false, paid_count: 0, paid_sum: 0, grade: EVIL },
      { realm: 'cm', email: 'b@x.mn', game_key: 'nope' + EVIL, expires_at: now, updated_at: now, active: true, paid_count: 0, paid_sum: 0 },
    ],
    by_game: [{ key: EVIL, title: EVIL, active: 1, active_ws: 1, active_cm: 0, sales: 1, sales_ws: 1, sales_cm: 0 }],
    // каталогт байхгүй түлхүүр → gmTitle түлхүүрийг өөрийг нь буцаана (escape шаардлагатай)
    purchases: [{ id: 1, invoice_id: EVIL, realm: EVIL, email: 'c@x.mn', game_key: 'p' + EVIL, amount: 1900, days: 30, expires_at: now, created_at: now, grade: EVIL },
                { id: 2, invoice_id: 'I2', realm: 'ws', email: EVIL_EM, game_key: 'sudoku', amount: 1900, days: 30, expires_at: now, created_at: now, grade: '10' }],
    pending: [{ invoice_id: EVIL, email: 'd@x.mn', realm: EVIL, game_key: 'q' + EVIL, amount: 1900, created_at: now, game_grade: EVIL },
              { invoice_id: 'I3', email: EVIL_EM, realm: 'cm', game_key: 'ludo', amount: 1900, created_at: now, game_grade: '12' }],
  };
  sb.ctx._gmData = d;            // gmTitle каталогоос гарчиг авна (gmLoad-ийн адил)
  sb.ctx.gmRender(d);
  ['gm-list', 'gm-purch', 'gm-pend', 'gm-summary', 'gm-g-game', 'gm-f-game', 'gm-status', 'gm-chips'].forEach((id) => {
    noRawHtml(sb.el(id).innerHTML, id);
  });
  // хоосон биш — payload escape хийгдсэн хэлбэрээр зурагдсан (тест хоосон шалгалт биш)
  ['gm-list', 'gm-purch', 'gm-pend', 'gm-summary', 'gm-g-game'].forEach((id) => {
    assert.ok(sb.el(id).innerHTML.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0, id + ': escape хийсэн payload');
  });
  const list = sb.el('gm-list').innerHTML;
  assert.ok(list.indexOf('data-email="&quot;&gt;&lt;img') >= 0, 'data-email атрибут escape');
  assert.ok(/3,800₮/.test(list) && /Админ олгосон/.test(list), 'төлсөн / админ олгосон баганууд');
  // «Анги» багана: эрх (одоогийн), худалдан авалт, төлөгдөөгүй нэхэмжлэх; NULL → «—»
  assert.ok(/<th[^>]*>Анги<\/th>/.test(list) && />8-р</.test(list) && />—</.test(list), 'эрхийн хүснэгтэд анги');
  assert.ok(/<th[^>]*>Анги<\/th>/.test(sb.el('gm-purch').innerHTML) && />10-р</.test(sb.el('gm-purch').innerHTML), 'худалдан авалтад анги');
  assert.ok(/<th>Анги<\/th>/.test(sb.el('gm-pend').innerHTML) && />12-р</.test(sb.el('gm-pend').innerHTML), 'төлөгдөөгүйд анги');
});

test('ws_report byGame тоглоом × сайт × АНГИ; game_list мөр/худалдан авалт/төлөгдөөгүйд анги; game_grant анги', async () => {
  const buyG = async (email, game, grade) => {
    const r = await Q('create', { plan: 'game', realm: 'ws', game: game, wstoken: wsTok(email), game_grade: grade });
    assert.strictEqual(r.statusCode, 200, JSON.stringify(r.body));
    F.qp.paid.set(r.body.invoice.invoice_id, 1900);
    assert.strictEqual((await Q('check', { invoice_id: r.body.invoice.invoice_id, email: email })).body.paid, true);
    return r.body.invoice.invoice_id;
  };
  await buyG('a@x.mn', 'sudoku', '8');
  await buyG('b@x.mn', 'sudoku', '8');
  await buyG('c@x.mn', 'sudoku', '10');
  await buyWs('d@x.mn', 'sudoku');                                  // ангигүй (хуучин клиент)
  const pend = await Q('create', { plan: 'game', realm: 'ws', game: 'ludo', wstoken: wsTok('e@x.mn'), game_grade: '12' });
  const r = await report();
  assert.deepStrictEqual(r.byGame.map((x) => [x.game_key, x.realm, x.grade, x.n, x.s]),
    [['sudoku', 'ws', '8', 2, 3800], ['sudoku', 'ws', '10', 1, 1900], ['sudoku', 'ws', null, 1, 1900]]);
  const l = (await A('game_list', {})).body;
  const row = (e) => l.rows.find((x) => x.email === e);
  assert.deepStrictEqual(['a@x.mn', 'c@x.mn', 'd@x.mn'].map((e) => row(e).grade), ['8', '10', null]);
  assert.deepStrictEqual(l.purchases.map((p) => p.grade).sort(), ['10', '8', '8', null].sort());
  assert.deepStrictEqual(l.pending.map((p) => [p.invoice_id, p.game_grade]), [[pend.body.invoice.invoice_id, '12']]);
  // админ олголт анги тавина (заавал биш), буруу анги → 400
  wsLogin('gift@x.mn');
  assert.strictEqual((await A('game_grant', { realm: 'ws', email: 'gift@x.mn', game: 'daam', grade: '5' })).statusCode, 400);
  assert.strictEqual(access('ws', 'gift@x.mn', 'daam'), null);
  // 11-р анги «Тун удахгүй» — админ ч олгохгүй (400)
  assert.strictEqual((await A('game_grant', { realm: 'ws', email: 'gift@x.mn', game: 'daam', grade: '11' })).statusCode, 400);
  assert.strictEqual(access('ws', 'gift@x.mn', 'daam'), null);
  const g = await A('game_grant', { realm: 'ws', email: 'gift@x.mn', game: 'daam', grade: '12' });
  assert.deepStrictEqual([g.statusCode, g.body.grade], [200, '12']);
  assert.strictEqual(access('ws', 'gift@x.mn', 'daam').grade, '12');
  // тайлангийн «Тоглоомоор» дэд шошгонд анги (admin.html)
  const sb = adminSandbox();
  sb.ctx.tlRender(Object.assign({}, r, { byGame: r.byGame }));
  const tg = sb.el('tl-games').innerHTML;
  assert.ok(tg.indexOf('Дасгалын төв · 8-р анги') >= 0 && tg.indexOf('анги тодорхойгүй') >= 0, tg.slice(0, 300));
});
// ledger heal (pay_pending → game_purchases) ангийг ч хуулна
test('ledger heal: game_purchases бичигдээгүй төлсөн тоглоомын ангийг pay_pending.game_grade-аас нөхнө (allowlist)', async () => {
  F.db.failLedger = true;
  const r = await Q('create', { plan: 'game', realm: 'ws', game: 'sudoku', wstoken: wsTok('h@x.mn'), game_grade: '9' });
  F.qp.paid.set(r.body.invoice.invoice_id, 1900);
  assert.strictEqual((await Q('check', { invoice_id: r.body.invoice.invoice_id, email: 'h@x.mn' })).body.paid, true);
  F.db.failLedger = false;
  rawPay({ invoice_id: 'BADG', email: 'z@x.mn', plan: 'game', game_key: 'ludo', realm: 'ws', granted: true, game_grade: '99' });
  const rc = await A('ws_reconcile', {});
  assert.strictEqual(rc.body.ledger_healed, 2);
  assert.deepStrictEqual(F.db.purch.map((p) => [p.invoice_id, p.grade]).sort(), [['BADG', null], [r.body.invoice.invoice_id, '9']].sort());
});

test('admin.html tlRender: тайлангийн тоглоом/анги/олголтын нэр, имэйл, тэмдэглэлийг escape хийнэ; гурван сав', () => {
  const sb = adminSandbox();
  const now = new Date().toISOString();
  const b = (n, s) => ({ n: n, sum: s });
  const win = { ws: b(1, 39900), prem: b(1, 9900), games: b(2, 3800), total: 53600 };
  sb.ctx.tlRender({
    ok: true, win: { d1: win, d7: win, d30: win, all: win }, game_price: 1900, range: null,
    daily: [{ day: now.slice(0, 10), ws: 39900, prem: 9900, games: 3800 }],
    byGrade: [{ grade: EVIL, n: 1, s: 39900 }],
    byGame: [{ title: EVIL, game_key: EVIL, realm: 'ws', n: 2, s: 3800 }],
    grants: [
      { email: EVIL_EM, grade: null, months: 1, note: EVIL, created_at: now, game_key: 'sudoku', game_title: EVIL, realm: 'cm', days: 30 },
      { email: EVIL_EM, grade: EVIL, months: 3, note: EVIL, created_at: now, game_key: null, realm: null, days: null },
    ],
  });
  ['tl-cards', 'tl-chart', 'tl-grade', 'tl-games', 'tl-grants'].forEach((id) => noRawHtml(sb.el(id).innerHTML, id));
  ['tl-grade', 'tl-games', 'tl-grants'].forEach((id) => {
    assert.ok(sb.el(id).innerHTML.indexOf('&lt;img src=x onerror=alert(1)&gt;') >= 0, id + ': escape хийсэн payload');
  });
  const cards = sb.el('tl-cards').innerHTML;
  assert.ok(cards.indexOf('Тоглоом (1,900₮)') >= 0 && cards.indexOf('3,800₮') >= 0 && cards.indexOf('53,600₮') >= 0, 'тоглоомын мөр');
  assert.ok(cards.indexOf('Premium · сургалт') >= 0 && cards.indexOf('Ажлын хуудас') >= 0);
  assert.ok(sb.el('tl-chart').innerHTML.indexOf('#0ea5e9') >= 0, 'графикт тоглоомын давхарга');
});

test('admin.html admBadges: ws-badge = худалдан авалт + бүртгэл + тоглоом; таб нээхэд тоглоомын тэмдэг тэглэгдэж нийлбэр дахин бодогдоно', async () => {
  const sb = adminSandbox();
  const calls = [];
  const resp = { ok: true, purchases: { n_new: 2, last_id: 5 }, regs: { n_new: 1, last_at: '2026-10-17T00:00:00.000Z' }, games: { n_new: 3, last_id: 9 } };
  sb.ctx.wsPost = (action, body) => { calls.push([action, body]); return Promise.resolve(resp); };
  const shown = (id) => (sb.el(id).style.display === 'none' ? '' : sb.el(id).textContent);
  // анх удаа (admSeenGame байхгүй): тоглоомын тэмдэг 0, одоогийн last_id-г «үзсэн» гэж хадгална
  sb.store.set('admSeenPurchase', '1'); sb.store.set('admSeenReg', '2026-01-01T00:00:00.000Z');
  await sb.ctx.admBadges();
  assert.deepStrictEqual(plain(calls[0]), ['ws_badges', { seenPurchase: 1, seenReg: '2026-01-01T00:00:00.000Z', seenGame: 0 }]);
  assert.deepStrictEqual([shown('tab-badge-purchases'), shown('tab-badge-regs'), shown('tab-badge-games'), shown('ws-badge')], ['+2', '+1', '', '+3']);
  assert.strictEqual(sb.store.get('admSeenGame'), '9');
  // дараагийн удаа: үзсэн (0 ч байсан) → тоглоом тоологдоно, ws-badge-д нэмэгдэнэ
  sb.store.set('admSeenGame', '0');
  await sb.ctx.admBadges();
  assert.strictEqual(calls[1][1].seenGame, 0);
  assert.deepStrictEqual([shown('tab-badge-games'), shown('ws-badge')], ['+3', '+6']);
  // «Худалдан авалт» таб нээв → нийлбэр = бүртгэл 1 + тоглоом 3 (тоглоом хасагдахгүй)
  sb.ctx.admBadgeSeen('purchases');
  assert.deepStrictEqual([shown('tab-badge-purchases'), shown('tab-badge-games'), shown('ws-badge')], ['', '+3', '+4']);
  // «Тоглоом» таб нээв → тоглоомын тэмдэг тэг, нийлбэр = бүртгэл 1
  sb.ctx.admBadgeSeen('games');
  assert.deepStrictEqual([shown('tab-badge-games'), shown('ws-badge')], ['', '+1']);
  assert.strictEqual(sb.store.get('admSeenGame'), '9');
});

test('admin.html gmReconcile: тулгалтын хариунд нөхсөн бүртгэлийн тоог харуулна', async () => {
  const sb = adminSandbox();
  sb.ctx.gmLoad = () => Promise.resolve();
  sb.ctx.wsPost = () => Promise.resolve({ ok: true, checked: 4, granted_count: 1, granted: [{ plan: 'game' }], ledger_healed: 2 });
  await sb.ctx.gmReconcile();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(sb.el('gm-rec-msg').textContent, 'Шалгасан: 4 · нөхөж олгосон: 1 (тоглоом 1) · дутсан бүртгэл нөхсөн: 2');
  assert.strictEqual(sb.el('gm-rec-btn').disabled, false);
  sb.ctx.wsPost = () => Promise.resolve({ ok: true, checked: 0, granted_count: 0, granted: [] });
  await sb.ctx.gmReconcile();
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(sb.el('gm-rec-msg').textContent, 'Шалгасан: 0 · нөхөж олгосон: 0');
});

test('тодорхойгүй SQL алга, бодит сүлжээ рүү хандаагүй', () => {
  assert.deepStrictEqual(F.db.unknown, []);
  assert.deepStrictEqual(F.qp.other, []);
});
