// Тоглоомын төлбөрийн тестийн хуурамч орчин (dependency-гүй): санах ойн pg pool + QPay/Telegram fetch stub + console барих.
// Бодит DB, бодит QPay, бодит Telegram руу ХЭЗЭЭ Ч хандахгүй. api/*.js-ийг require хийхээс ӨМНӨ ачаална.
// tests/_smsfake.js-ийн хэв маяг: танихгүй SQL (тоглоом/төлбөрийн хүснэгт дээр) → db.unknown-д бүртгээд throw.
'use strict';
const path = require('path');
const util = require('util');

const WT = path.resolve(__dirname, '..');
const API = path.join(WT, 'api');

Object.assign(process.env, {
  JWT_SECRET: 'test-secret-games-pay',
  DATABASE_URL: 'postgres://fake:fake@127.0.0.1:1/none',
  TELEGRAM_BOT_TOKEN: 'tg-fake-token',
  TELEGRAM_CHAT_ID: '1',
  QPAY_USERNAME: 'fakeuser', QPAY_PASSWORD: 'fakepass', QPAY_INVOICE_CODE: 'FAKE_INVOICE',
});
['GAME_PRICE', 'GAME_PAYWALL', 'GAME_PAYWALL_REALMS', 'GAME_INVITE_USES', 'GAME_INVITE_DAILY', 'WS_TOKEN_IAT_MIN', 'WS_PAYWALL'].forEach(k => { delete process.env[k]; });
// Хоёр сайт (ws + cm) болон gate төлбөртэй орчинд тестлэнэ: тавиагүй үеийн анхдагч (api/_games.js DEFAULT_PAYWALL_REALMS)
// нь эхний ээлжинд зөвхөн ['ws'] (cm UI нэгтгэгдээгүй) тул тодорхой 'ws,cm'. Анхдагчийг өөрийг нь games-realm.test.js,
// games-gate.test.js «деплойн бэлэн байдал» шалгана. GAME_PAYWALL='on' — kill-switch биш (жагсаалтад нөлөөлөхгүй).
process.env.GAME_PAYWALL = 'on';
process.env.GAME_PAYWALL_REALMS = 'ws,cm';
// Шинэ дансны үнэгүй туршилт (api/_wstrial.js) анхдагчаар УНТРААЛТТАЙ — хуучин тестийн хариу (deepStrictEqual) өөрчлөгдөхгүй.
// tests/ws-trial-*.test.js өөрөө асаана.
process.env.WS_TRIAL_SECONDS = '0';
delete process.env.WS_TRIAL_FROM; delete process.env.WS_TRIAL_IP_DAY; delete process.env.VERCEL_ENV; delete process.env.AWS_LAMBDA_FUNCTION_NAME;

const DAY = 864e5;
const db = {
  rl: new Map(),        // rate_limits key → {ws, count}
  users: new Map(),     // lower(email) → {email, role, grade, plan, premium_expiry, token_version}
  pay: new Map(),       // pay_pending invoice_id → row
  wsPending: new Map(), // ws_pending (энэ тестэд хоосон)
  wsAccess: new Map(),  // ws_access lower(email) → expires_at (Date) — зөвхөн api/qpay.js wsstatus-ийн уншилт
  access: new Map(),    // game_access 'realm|email|key' → row
  purch: [],            // game_purchases
  events: new Map(),    // ws_events id → {id, title, price, active}
  regs: [],             // ws_event_regs
  unknown: [],
  claims: [],           // pay_pending claim оролдлогын invoice_id-ууд
  ddl: [],              // ажилласан CREATE/ALTER (транзакц дотор DDL ажиллаагүйг шалгана)
  txLog: [],            // BEGIN/COMMIT/ROLLBACK/SAVEPOINT дараалал
  txLeaks: [],          // нээлттэй транзакцтайгаар алдаагүй release() хийсэн client (pool-д tx дотор буцсан холболт)
  locks: new Map(),     // pay_pending invoice_id → { tx, wait: Promise, done: fn } (мөрийн түгжээ)
  devices: new Map(),   // ws_devices 'email|device_id' → {email, device_id, label, ua, ip, fp, fp_changed_at, first_seen, last_seen}
  devIps: new Map(),    // ws_device_ips 'email|device_id|ip' → last_seen
  devBlocks: [],        // ws_device_blocks
  tix: new Map(),       // game_ticket_used jti → exp
  invites: new Map(),   // game_invites jti → {jti, realm, email, game_key, expires_at(ms), uses, devs[]}
  invUpdates: 0,        // амжилттай урилгын хэрэглээ (UPDATE) — зарцуулалтын тоо
  failGrant: false, failLedger: false, failRate: false, noPremUntil: false, failEnt: false, failConnect: false,
  failDev: false, failTix: false, failInv: false, failGradeSet: false,
  gradeSets: [],        // setGameGrade-ийн UPDATE оролдлогууд [realm, email, key, grade]
  hangOn: null,        // RegExp: таарсан асуулт хэзээ ч дуусахгүй (Vercel timeout/crash-ийг дуурайна)
  nextId: 1,
  wsLogin: new Map(),   // ws_login email → {email, phone, verified, pass_hash, phone_verified_at, invite, created_at} — зөвхөн туршилтын ELIG/PRIOR уншина
  wsGrade: [],          // ws_grade_access [{email, grade, expires_at}] — api/_wsgrade.js activeGrades
  wsPurch: [],          // ws_purchases [{email}] — зөвхөн туршилтын ELIG/PRIOR «эрх авсан» (bought) уншина
  admGrants: [],        // ws_admin_grants [{email, game_key}] — мөн адил; game_key-тэй мөр (тоглоомын олголт) тооцохгүй
  eyAccess: new Map(),  // ws_eyesh_access lower(email) → expires_at (Date) — ЭЕШ шалгагч (api/_eyesh.js)
  eyPurch: [],          // ws_eyesh_purchases [{invoice_id, email, amount, days}]
  eyHand: new Map(),    // ws_eyesh_handoff code_hash → {email, exam, material, expires_at(ms)}
  failEyLedger: false,  // ws_eyesh_purchases INSERT алдаа (SAVEPOINT шалгах)
};
// ws_trials / ws_trial_marks / ws_trial_cfg (tests/_trialfake.js): db.trial.trials, db.trial.marks, db.trial.cfgFrom,
// db.trial.shift (DB NOW шилжилт), db.trial.fail. PRIOR: db.wsLogin (ижил утас) + db.devices (ws_devices).
// «Эрх авсан» (ELIG/PRIOR) = db.wsAccess, db.wsGrade, db.wsPurch эсвэл db.admGrants (game_key NULL)-д мөртэй (хугацаа дууссан ч)
db.trial = require('./_trialfake').create(function (e) { return db.wsLogin.get(e); }, {
  logins: function () { return Array.from(db.wsLogin, function (kv) { return Object.assign({}, kv[1], { email: kv[0] }); }); },
  devices: function () { return Array.from(db.devices.values()); },
  bought: function (e) {
    return db.wsAccess.has(e) || db.wsGrade.some(function (r) { return lc(r.email) === e; })
      || db.wsPurch.some(function (r) { return lc(r.email) === e; })
      || db.admGrants.some(function (r) { return lc(r.email) === e && r.game_key == null; });
  },
});
// hangOn-д таарсан асуултад хүрэхэд resolve болно (тест dropConnections()-ыг яг тэр мөчид дуудна)
let hangHit = null;
function hangReached() { return new Promise(function (r) { hangHit = r; }); }
function now() { return Date.now(); }
function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function lc(e) { return String(e == null ? '' : e).toLowerCase(); }
function pick(row, cols) { const o = {}; cols.split(',').map(s => s.trim()).forEach(c => { o[c] = row[c] === undefined ? null : row[c]; }); return o; }
function akey(r, e, k) { return r + '|' + e + '|' + k; }
function dbErr(msg, code) { const e = new Error(msg); e.code = code || '57P01'; return e; }
// api/qpay.js HEAL_GAME_LEDGER_SQL (хоосон зай нормчилсон) — өөрчлөгдвөл энд ч шинэчилнэ (танихгүй SQL → тест унана)
const HEAL_SQL = "INSERT INTO game_purchases (invoice_id, realm, email, game_key, amount, days, expires_at, created_at, grade) " +
  "SELECT p.invoice_id, p.realm, LOWER(TRIM(p.email)), p.game_key, COALESCE(p.amount, 0), " +
  "$2::int * GREATEST(1, LEAST(12, COALESCE(p.months, 1))), a.expires_at, COALESCE(p.created_at, NOW()), " +
  "CASE WHEN p.game_grade = ANY($3::text[]) THEN p.game_grade END " +
  "FROM pay_pending p LEFT JOIN game_access a ON a.realm = p.realm AND a.email = LOWER(TRIM(p.email)) AND a.game_key = p.game_key " +
  "WHERE p.plan = 'game' AND p.granted = TRUE AND p.realm IN ('ws', 'cm') AND p.game_key = ANY($1::text[]) " +
  "AND NOT EXISTS (SELECT 1 FROM game_purchases g WHERE g.invoice_id = p.invoice_id) " +
  "ON CONFLICT (invoice_id) DO NOTHING RETURNING invoice_id";
const STRICT = /\b(pay_pending|ws_pending|game_access|game_purchases|users|rate_limits|ws_events|ws_event_regs|ws_devices|ws_device_ips|ws_device_blocks|ws_device_swaps|game_ticket_used|game_invites|ws_trials|ws_trial_marks|ws_trial_cfg|ws_eyesh_access|ws_eyesh_purchases|ws_eyesh_handoff)\b/;
function dkey(e, d) { return e + '|' + d; }

// tx — транзакцын контекст (client.query) эсвэл null (autocommit). tx дотор өөрчлөлт бүр tx.undo-д бүртгэгдэнэ.
// pay_pending мөрийн түгжээ: өөр транзакц тухайн мөрийг өөрчилсөн бол COMMIT/ROLLBACK хүртэл хүлээнэ (PG READ COMMITTED).
async function waitRowLock(inv, tx) {
  for (;;) {
    const l = db.locks.get(inv);
    if (!l || l.tx === tx) return;
    await l.wait;
  }
}
function takeRowLock(inv, tx) {
  if (!tx || db.locks.has(inv)) return;
  let done; const wait = new Promise(function (r) { done = r; });
  db.locks.set(inv, { tx: tx, wait: wait, done: done });
  tx.locks.push(inv);
}
async function query(sql, p, tx) {
  p = p || [];
  const q = norm(sql);
  let m;
  if (/^(CREATE|ALTER)\b/i.test(q)) {
    if (tx) { db.unknown.push('DDL in tx: ' + q); throw new Error('mock: транзакц дотор DDL'); }
    // Бодит PG: өөр холболт pay_pending-ийн мөрийг түгжсэн байхад ALTER TABLE pay_pending (ACCESS EXCLUSIVE) хүлээнэ —
    // тэр транзакц энэ DDL-ийг хүлээж байвал апп өөрөө гацна. Fake: илрүүлээд алдаа.
    if (db.locks.size && /\bpay_pending\b/.test(q)) { db.unknown.push('DDL while pay_pending row locked: ' + q); throw new Error('mock: гацах DDL'); }
    db.ddl.push(q); return { rows: [] };
  }
  const undo = tx ? function (fn) { tx.undo.push(fn); } : function () {};

  // ── rate_limits (_guard.rateLimit) ──
  if (/^INSERT INTO rate_limits \(key, window_start, count\) VALUES \(\$1, NOW\(\), 1\) ON CONFLICT \(key\) DO UPDATE SET .* RETURNING count$/.test(q)) {
    if (db.failRate) throw dbErr('db down');
    const k = String(p[0]), win = Number(p[1]) * 1000, t = now();
    let r = db.rl.get(k);
    if (!r || r.ws <= t - win) r = { ws: t, count: 1 }; else r.count += 1;
    db.rl.set(k, r);
    return { rows: [{ count: r.count }] };
  }
  if (/^DELETE FROM rate_limits/.test(q)) return { rows: [] };

  // ── _sms.ensureUserColumns каталог шалгалт (хоосон → ALTER-ууд IF NOT EXISTS) ──
  if (/^SELECT column_name FROM information_schema\.columns/.test(q)) return { rows: [] };
  if (/^SELECT indexname FROM pg_indexes/.test(q)) return { rows: [] };

  // ── ensureWsExtra-ийн цэвэрлэгээ ──
  if (/^UPDATE ws_promos SET personal=TRUE WHERE/.test(q)) return { rows: [] };
  if (/^DELETE FROM ws_promos WHERE personal=TRUE/.test(q)) return { rows: [] };

  // ── ws_pending ──
  if (q === 'SELECT invoice_id, email, months, promo, amount, grade, granted FROM ws_pending WHERE invoice_id=$1') {
    const r = db.wsPending.get(String(p[0])); return { rows: r ? [Object.assign({}, r)] : [] };
  }
  if (/^SELECT invoice_id, email, months, promo, amount, grade, granted FROM ws_pending WHERE (email=\$1 AND )?granted=FALSE/.test(q)) return { rows: [] };

  // ── pay_pending ──
  if ((m = q.match(/^SELECT ([a-z_, ]+) FROM pay_pending WHERE invoice_id=\$1$/))) {
    const r = db.pay.get(String(p[0])); return { rows: r ? [pick(r, m[1])] : [] };
  }
  if ((m = q.match(/^SELECT ([a-z_, ]+) FROM pay_pending WHERE email=\$1 AND granted=FALSE AND created_at > NOW\(\) - INTERVAL '3 days' ORDER BY created_at DESC LIMIT 10$/))) {
    const rows = Array.from(db.pay.values()).filter(r => r.email === p[0] && r.granted === false && r.created_at > now() - 3 * DAY);
    return { rows: rows.reverse().slice(0, 10).map(r => pick(r, m[1])) };
  }
  if ((m = q.match(/^SELECT ([a-z_, ]+) FROM pay_pending WHERE granted=FALSE AND created_at > NOW\(\) - INTERVAL '30 days' ORDER BY created_at DESC LIMIT 200$/))) {
    const rows = Array.from(db.pay.values()).filter(r => r.granted === false && r.created_at > now() - 30 * DAY);
    return { rows: rows.reverse().slice(0, 200).map(r => pick(r, m[1])) };
  }
  if (q === "INSERT INTO pay_pending (invoice_id, email, plan, months, amount, event_id, game_key, realm, game_grade) VALUES ($1,$2,'game',1,$3,NULL,$4,$5,$6) ON CONFLICT (invoice_id) DO NOTHING") {
    if (!db.pay.has(p[0])) db.pay.set(p[0], { invoice_id: p[0], email: p[1], plan: 'game', months: 1, amount: p[2], event_id: null, granted: false, promo_code: null, game_key: p[3], realm: p[4], game_grade: p[5] == null ? null : p[5], created_at: now() });
    return { rows: [] };
  }
  if (q === 'INSERT INTO pay_pending (invoice_id, email, plan, months, amount, event_id) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (invoice_id) DO NOTHING') {
    if (!db.pay.has(p[0])) db.pay.set(p[0], { invoice_id: p[0], email: p[1], plan: p[2], months: p[3], amount: p[4], event_id: p[5], granted: false, promo_code: null, game_key: null, realm: null, game_grade: null, created_at: now() });
    return { rows: [] };
  }
  if (q === 'UPDATE pay_pending SET granted=TRUE WHERE invoice_id=$1 AND granted=FALSE RETURNING invoice_id') {
    const inv = String(p[0]);
    db.claims.push(inv);
    await waitRowLock(inv, tx);
    const r = db.pay.get(inv);
    if (!r || r.granted !== false) return { rows: [] };
    r.granted = true; takeRowLock(inv, tx); undo(function () { r.granted = false; });
    return { rows: [{ invoice_id: r.invoice_id }] };
  }
  if (q === 'UPDATE pay_pending SET granted=FALSE WHERE invoice_id=$1') {
    const inv = String(p[0]);
    await waitRowLock(inv, tx);
    const r = db.pay.get(inv);
    if (r) { const was = r.granted; r.granted = false; takeRowLock(inv, tx); undo(function () { r.granted = was; }); }
    return { rows: [] };
  }
  if (q === "INSERT INTO pay_pending (invoice_id, email, plan, months, amount, event_id) VALUES ($1,$2,'eyesh',1,$3,NULL) ON CONFLICT (invoice_id) DO NOTHING") {
    if (!db.pay.has(p[0])) db.pay.set(p[0], { invoice_id: p[0], email: p[1], plan: 'eyesh', months: 1, amount: p[2], event_id: null, granted: false, promo_code: null, game_key: null, realm: null, game_grade: null, created_at: now() });
    return { rows: [] };
  }

  // ── ЭЕШ шалгагч (api/_eyesh.js) ──
  if (q === 'SELECT expires_at FROM ws_eyesh_access WHERE email=$1 AND expires_at > NOW()') {
    const ex = db.eyAccess.get(lc(p[0]));
    return { rows: ex && ex.getTime() > now() ? [{ expires_at: new Date(ex) }] : [] };
  }
  if (q === 'INSERT INTO ws_eyesh_access (email, expires_at) VALUES ($1, NOW() + make_interval(days => $2::int)) ON CONFLICT (email) DO UPDATE SET expires_at = GREATEST(ws_eyesh_access.expires_at, NOW()) + make_interval(days => $2::int), updated_at = NOW() RETURNING expires_at') {
    const e = lc(p[0]), prev = db.eyAccess.get(e);
    const exp = new Date(Math.max(prev ? prev.getTime() : 0, now()) + Number(p[1]) * DAY);
    db.eyAccess.set(e, exp);
    undo(function () { if (prev) db.eyAccess.set(e, prev); else db.eyAccess.delete(e); });
    return { rows: [{ expires_at: exp }] };
  }
  if (q === 'INSERT INTO ws_eyesh_purchases (invoice_id, email, amount, days) VALUES ($1,$2,$3,$4) ON CONFLICT (invoice_id) DO NOTHING') {
    if (db.failEyLedger) throw dbErr('ledger down', '42P01');
    if (db.eyPurch.some(function (r) { return r.invoice_id === p[0]; })) return { rows: [] };
    const row = { invoice_id: p[0], email: p[1], amount: p[2], days: p[3] };
    db.eyPurch.push(row); undo(function () { const i = db.eyPurch.indexOf(row); if (i >= 0) db.eyPurch.splice(i, 1); });
    return { rows: [] };
  }
  if (q === 'INSERT INTO ws_eyesh_handoff (code_hash, email, exam, material, expires_at) VALUES ($1,$2,$3,$4, NOW() + make_interval(secs => $5::int))') {
    if (db.eyHand.has(p[0])) throw dbErr('duplicate key', '23505');
    db.eyHand.set(p[0], { email: p[1], exam: p[2] == null ? null : JSON.parse(p[2]), material: p[3] == null ? null : String(p[3]), expires_at: now() + Number(p[4]) * 1000 });
    return { rows: [] };
  }
  if (q === "DELETE FROM ws_eyesh_handoff WHERE expires_at < NOW() - INTERVAL '1 day'") {
    db.eyHand.forEach(function (r, k) { if (r.expires_at < now() - DAY) db.eyHand.delete(k); }); return { rows: [] };
  }
  if (q === 'DELETE FROM ws_eyesh_handoff WHERE code_hash=$1 RETURNING email, exam, material, (expires_at > NOW()) AS live') {
    const r = db.eyHand.get(p[0]); if (!r) return { rows: [] };
    db.eyHand.delete(p[0]);
    return { rows: [{ email: r.email, exam: r.exam, material: r.material == null ? null : r.material, live: r.expires_at > now() }] };
  }
  if (q === 'SELECT name FROM ws_login WHERE lower(email)=$1 LIMIT 1') {
    const w = db.wsLogin.get(lc(p[0])); return { rows: w ? [{ name: w.name == null ? null : w.name }] : [] };
  }

  // ── users ──
  if (q === 'SELECT role, grade FROM users WHERE lower(email)=$1 LIMIT 1') {
    const u = db.users.get(lc(p[0])); return { rows: u ? [{ role: u.role || null, grade: u.grade || null }] : [] };
  }
  if (q === 'SELECT premium_expiry FROM users WHERE lower(email)=$1 LIMIT 1') {
    const u = db.users.get(lc(p[0])); return { rows: u ? [{ premium_expiry: u.premium_expiry }] : [] };
  }
  if (q === "UPDATE users SET plan='premium', premium_expiry = GREATEST(COALESCE(premium_expiry, NOW()), NOW()) + make_interval(days => $2::int) WHERE lower(email)=$1 RETURNING premium_expiry") {
    const u = db.users.get(lc(p[0])); if (!u) return { rows: [] };
    const base = Math.max(u.premium_expiry ? new Date(u.premium_expiry).getTime() : now(), now());
    u.plan = 'premium'; u.premium_expiry = new Date(base + Number(p[1]) * DAY);
    return { rows: [{ premium_expiry: u.premium_expiry }] };
  }
  if (q === 'SELECT token_version FROM users WHERE LOWER(email)=LOWER($1)') {
    const u = db.users.get(lc(p[0])); return { rows: u ? [{ token_version: u.token_version | 0 }] : [] };
  }
  if (q === "SELECT 1 FROM users WHERE LOWER(email)=$1 AND plan='premium' AND COALESCE(premium_expiry, premium_until) > NOW() LIMIT 1") {
    if (db.noPremUntil) throw dbErr('column "premium_until" does not exist', '42703');
    const u = db.users.get(lc(p[0]));
    const ex = u && (u.premium_expiry || u.premium_until);
    return { rows: u && u.plan === 'premium' && ex && new Date(ex).getTime() > now() ? [{ '?column?': 1 }] : [] };
  }
  if (q === "SELECT 1 FROM users WHERE LOWER(email)=$1 AND plan='premium' AND premium_expiry > NOW() LIMIT 1") {
    const u = db.users.get(lc(p[0]));
    return { rows: u && u.plan === 'premium' && u.premium_expiry && new Date(u.premium_expiry).getTime() > now() ? [{ '?column?': 1 }] : [] };
  }

  // ── game_access ──
  if (q === 'INSERT INTO game_access (realm, email, game_key, expires_at, updated_at, grade) VALUES ($1, $2, $3, NOW() + make_interval(days => $4::int), NOW(), $5::text) ON CONFLICT (realm, email, game_key) DO UPDATE SET expires_at = GREATEST(game_access.expires_at, NOW()) + make_interval(days => $4::int), updated_at = NOW(), grade = COALESCE(EXCLUDED.grade, game_access.grade) RETURNING expires_at') {
    if (db.failGrant) throw dbErr('grant failed');
    if (['ws', 'cm'].indexOf(p[0]) < 0) throw dbErr('check constraint', '23514');
    const k = akey(p[0], p[1], p[2]), d = Number(p[3]) * DAY;
    const old = db.access.get(k);
    const exp = old ? new Date(Math.max(old.expires_at.getTime(), now()) + d) : new Date(now() + d);
    const grade = p[4] != null ? String(p[4]) : (old && old.grade != null ? old.grade : null);
    db.access.set(k, { realm: p[0], email: p[1], game_key: p[2], expires_at: exp, updated_at: new Date(), grade: grade });
    undo(function () { if (old) db.access.set(k, old); else db.access.delete(k); });
    return { rows: [{ expires_at: exp }] };
  }
  // api/_games.js setGameGrade — зөвхөн идэвхтэй мөр, ижил анги бол бичихгүй, expires_at/updated_at-д хүрэхгүй
  if (q === 'UPDATE game_access SET grade = $4::text WHERE realm=$1 AND email=$2 AND game_key=$3 AND expires_at > NOW() AND grade IS DISTINCT FROM $4::text RETURNING game_key') {
    if (db.failGradeSet) throw dbErr('db down');
    db.gradeSets.push([p[0], p[1], p[2], p[3]]);
    const r = db.access.get(akey(p[0], p[1], p[2]));
    if (!r || r.expires_at.getTime() <= now() || (r.grade == null ? null : r.grade) === String(p[3])) return { rows: [] };
    const was = r.grade; r.grade = String(p[3]); undo(function () { r.grade = was; });
    return { rows: [{ game_key: r.game_key }] };
  }
  if (q === 'SELECT expires_at FROM game_access WHERE realm=$1 AND email=$2 AND game_key=$3 AND expires_at > NOW()') {
    if (db.failEnt) throw dbErr('db down');
    const r = db.access.get(akey(p[0], p[1], p[2]));
    return { rows: r && r.expires_at.getTime() > now() ? [{ expires_at: r.expires_at }] : [] };
  }
  if (q === 'SELECT expires_at FROM game_access WHERE realm=$1 AND email=$2 AND game_key=$3') {
    const r = db.access.get(akey(p[0], p[1], p[2])); return { rows: r ? [{ expires_at: r.expires_at }] : [] };
  }
  if (q === 'SELECT game_key, expires_at, grade FROM game_access WHERE realm=$1 AND email=$2 AND expires_at > NOW()') {
    return { rows: Array.from(db.access.values()).filter(r => r.realm === p[0] && r.email === p[1] && r.expires_at.getTime() > now())
      .map(r => ({ game_key: r.game_key, expires_at: r.expires_at, grade: r.grade == null ? null : r.grade })) };
  }
  if (q === 'DELETE FROM game_access WHERE realm=$1 AND email=$2 AND game_key=$3 RETURNING game_key') {
    const k = akey(p[0], p[1], p[2]); const r = db.access.get(k);
    if (!r) return { rows: [] };
    db.access.delete(k); undo(function () { db.access.set(k, r); });
    return { rows: [{ game_key: r.game_key }] };
  }

  // ── game_purchases ──
  if (q === 'INSERT INTO game_purchases (invoice_id, realm, email, game_key, amount, days, expires_at, grade) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (invoice_id) DO NOTHING RETURNING id') {
    if (db.failLedger) throw dbErr('ledger failed');
    if (db.purch.some(x => x.invoice_id === p[0])) return { rows: [] };
    const row = { id: db.nextId++, invoice_id: p[0], realm: p[1], email: p[2], game_key: p[3], amount: p[4], days: p[5], expires_at: p[6], created_at: new Date(), grade: p[7] == null ? null : p[7] };
    db.purch.push(row); undo(function () { const i = db.purch.indexOf(row); if (i >= 0) db.purch.splice(i, 1); });
    return { rows: [{ id: row.id }] };
  }
  // api/qpay.js healGameLedger: эрх олгогдсон (granted) тоглоомын pay_pending мөрөөс бүртгэл дутсаныг нөхнө (нэг statement)
  if (q === HEAL_SQL) {
    if (db.failLedger) throw dbErr('ledger failed');
    const keys = Array.isArray(p[0]) ? p[0].map(String) : [];
    const out = [];
    Array.from(db.pay.values()).forEach(function (r) {
      if (r.plan !== 'game' || r.granted !== true || ['ws', 'cm'].indexOf(r.realm) < 0 || keys.indexOf(r.game_key) < 0) return;
      if (db.purch.some(function (x) { return x.invoice_id === r.invoice_id; })) return;
      const em = lc(String(r.email).trim());
      const a = db.access.get(akey(r.realm, em, r.game_key));
      const months = Math.max(1, Math.min(12, r.months == null ? 1 : Number(r.months)));
      const grades = Array.isArray(p[2]) ? p[2].map(String) : [];
      const row = { id: db.nextId++, invoice_id: r.invoice_id, realm: r.realm, email: em, game_key: r.game_key,
        amount: r.amount == null ? 0 : r.amount, days: Number(p[1]) * months, expires_at: a ? a.expires_at : null,
        created_at: r.created_at == null ? new Date() : new Date(r.created_at),
        grade: r.game_grade != null && grades.indexOf(String(r.game_grade)) >= 0 ? String(r.game_grade) : null };
      db.purch.push(row); undo(function () { const i = db.purch.indexOf(row); if (i >= 0) db.purch.splice(i, 1); });
      out.push({ invoice_id: r.invoice_id });
    });
    return { rows: out };
  }

  // Транзакц дотор зөвхөн дээрх (undo-тэй) өөрчлөлт зөвшөөрнө — бусад өөрчлөх SQL-ийг буцааж чадахгүй
  if (tx && /^(INSERT|UPDATE|DELETE)\b/.test(q)) { db.unknown.push('tx: ' + q); throw new Error('mock: tx-д дэмжигдээгүй SQL'); }

  // ── game_ticket_used (launch тасалбарын нэг удаагийн jti) ──
  if (q === 'INSERT INTO game_ticket_used (jti, exp) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING RETURNING jti') {
    if (db.failTix) throw dbErr('db down');
    if (db.tix.has(p[0])) return { rows: [] };
    db.tix.set(p[0], new Date(p[1])); return { rows: [{ jti: p[0] }] };
  }
  if (q === "DELETE FROM game_ticket_used WHERE exp < NOW() - INTERVAL '1 day'") {
    db.tix.forEach(function (ex, k) { if (ex.getTime() < now() - DAY) db.tix.delete(k); }); return { rows: [] };
  }

  // ── game_invites ──
  if (q === 'INSERT INTO game_invites (jti, realm, email, game_key, expires_at) VALUES ($1, $2, $3, $4, $5)') {
    if (db.failInv) throw dbErr('db down');
    if (db.invites.has(p[0])) throw dbErr('duplicate key', '23505');
    if (['ws', 'cm'].indexOf(p[1]) < 0) throw dbErr('check constraint', '23514');
    db.invites.set(p[0], { jti: p[0], realm: p[1], email: p[2], game_key: p[3], expires_at: new Date(p[4]).getTime(), uses: 0, devs: [] });
    return { rows: [] };
  }
  const invLive = (r) => r && r.realm === p[1] && r.game_key === p[2] && r.expires_at > now();
  if (q === 'SELECT email, uses, devs FROM game_invites WHERE jti=$1 AND realm=$2 AND game_key=$3 AND expires_at > NOW()') {
    if (db.failInv) throw dbErr('db down');
    const r = db.invites.get(p[0]);
    return { rows: invLive(r) ? [{ email: r.email, uses: r.uses, devs: r.devs.slice() }] : [] };
  }
  // Нэг мөрийн атомар UPDATE (PG: мөрийн түгжээ + WHERE-ийг дахин үнэлнэ) — JS-д синхрон хэсэг тул атомар
  if (q === 'UPDATE game_invites SET uses = uses + 1, devs = CASE WHEN $5::text = ANY(devs) THEN devs ELSE array_append(devs, $5::text) END WHERE jti=$1 AND realm=$2 AND game_key=$3 AND expires_at > NOW() AND uses < $4::int AND ($5::text = ANY(devs) OR cardinality(devs) < $6::int) RETURNING uses, cardinality(devs) AS guests') {
    if (db.failInv) throw dbErr('db down');
    const r = db.invites.get(p[0]);
    if (!invLive(r) || !(r.uses < Number(p[3]))) return { rows: [] };
    const has = r.devs.indexOf(String(p[4])) >= 0;
    if (!(has || r.devs.length < Number(p[5]))) return { rows: [] };
    r.uses += 1;
    if (!has) r.devs.push(String(p[4]));
    db.invUpdates += 1;
    return { rows: [{ uses: r.uses, guests: r.devs.length }] };
  }
  if (q === "DELETE FROM game_invites WHERE expires_at < NOW() - INTERVAL '1 day'") {
    db.invites.forEach(function (r, k) { if (r.expires_at < now() - DAY) db.invites.delete(k); }); return { rows: [] };
  }

  // ── ws_devices (api/_wsdev.js check/list/logBlock) ──
  if (/\bws_device(s|_ips|_blocks|_swaps)\b/.test(q) && db.failDev) throw dbErr('db down');
  if (q === 'SELECT device_id, fp, fp_changed_at FROM ws_devices WHERE email=$1 AND device_id=$2') {
    const r = db.devices.get(dkey(p[0], p[1])); return { rows: r ? [{ device_id: r.device_id, fp: r.fp, fp_changed_at: r.fp_changed_at }] : [] };
  }
  if (q === 'UPDATE ws_devices SET last_seen=NOW(), ip=COALESCE($3, ip), fp=COALESCE(fp, $4) WHERE email=$1 AND device_id=$2') {
    const r = db.devices.get(dkey(p[0], p[1]));
    if (r) { r.last_seen = new Date(); if (p[2] != null) r.ip = p[2]; if (r.fp == null) r.fp = p[3]; }
    return { rows: [] };
  }
  if (q === 'UPDATE ws_devices SET fp=$3, fp_changed_at=NOW(), last_seen=NOW(), ip=COALESCE($4, ip), ua=$5, label=$6 WHERE email=$1 AND device_id=$2') {
    const r = db.devices.get(dkey(p[0], p[1]));
    if (r) { r.fp = p[2]; r.fp_changed_at = new Date(); r.last_seen = new Date(); if (p[3] != null) r.ip = p[3]; r.ua = p[4]; r.label = p[5]; }
    return { rows: [] };
  }
  if (q === 'UPDATE ws_devices SET last_seen=NOW(), ip=COALESCE($3, ip) WHERE email=$1 AND device_id=$2 RETURNING device_id') {
    const r = db.devices.get(dkey(p[0], p[1]));
    if (!r) return { rows: [] };
    r.last_seen = new Date(); if (p[2] != null) r.ip = p[2];
    return { rows: [{ device_id: r.device_id }] };
  }
  if ((m = q.match(/^DELETE FROM ws_devices WHERE email=\$1 AND last_seen < NOW\(\) - INTERVAL '(\d+) days'$/))) {
    const lim = now() - Number(m[1]) * DAY;
    db.devices.forEach(function (r, k) { if (r.email === p[0] && r.last_seen.getTime() < lim) db.devices.delete(k); });
    return { rows: [] };
  }
  if (q === 'SELECT COUNT(*)::int AS n FROM ws_devices WHERE email=$1') {
    let n = 0; db.devices.forEach(function (r) { if (r.email === p[0]) n++; }); return { rows: [{ n: n }] };
  }
  if (q === 'INSERT INTO ws_devices (email, device_id, label, ua, ip, fp, fp_changed_at) VALUES ($1,$2,$3,$4,$5,$6,NOW()) ON CONFLICT (email, device_id) DO UPDATE SET last_seen=NOW()') {
    const k = dkey(p[0], p[1]); const old = db.devices.get(k);
    if (old) old.last_seen = new Date();
    else db.devices.set(k, { email: p[0], device_id: p[1], label: p[2], ua: p[3], ip: p[4], fp: p[5], fp_changed_at: new Date(), first_seen: new Date(), last_seen: new Date() });
    return { rows: [] };
  }
  if (q === 'INSERT INTO ws_device_ips (email, device_id, ip) VALUES ($1,$2,$3) ON CONFLICT (email, device_id, ip) DO UPDATE SET last_seen=NOW()') {
    db.devIps.set(p[0] + '|' + p[1] + '|' + p[2], new Date()); return { rows: [] };
  }
  if (q === 'INSERT INTO ws_device_blocks (email, device_id, fp, ip, why, ua) VALUES ($1,$2,$3,$4,$5,$6)') {
    db.devBlocks.push({ email: p[0], device_id: p[1], fp: p[2], ip: p[3], why: p[4], ua: p[5] }); return { rows: [] };
  }
  if (/^SELECT d\.device_id, d\.label, d\.ip, d\.fp, d\.first_seen, d\.last_seen, \(SELECT COUNT\(\*\)::int FROM ws_device_ips i .*\) AS ip_count FROM ws_devices d WHERE d\.email=\$1 ORDER BY d\.last_seen DESC$/.test(q)) {
    const rows = Array.from(db.devices.values()).filter(function (r) { return r.email === p[0]; })
      .sort(function (a, b) { return b.last_seen - a.last_seen; })
      .map(function (r) { return { device_id: r.device_id, label: r.label, ip: r.ip, fp: r.fp, first_seen: r.first_seen, last_seen: r.last_seen, ip_count: 1 }; });
    return { rows: rows };
  }

  // ── сургалт (event) — одоогийн замын регресс ──
  if (q === 'SELECT title, price FROM ws_events WHERE id=$1 AND active=TRUE') {
    const e = db.events.get(Number(p[0])); return { rows: e && e.active ? [{ title: e.title, price: e.price }] : [] };
  }
  if (q === 'SELECT title FROM ws_events WHERE id=$1') { const e = db.events.get(Number(p[0])); return { rows: e ? [{ title: e.title }] : [] }; }
  if (q === 'UPDATE ws_event_regs SET invoice_id=$1, amount=$2 WHERE event_id=$3 AND lower(email)=$4') {
    db.regs.forEach(r => { if (r.event_id === Number(p[2]) && lc(r.email) === p[3]) { r.invoice_id = p[0]; r.amount = p[1]; } }); return { rows: [] };
  }
  if (q === 'UPDATE ws_event_regs SET paid=TRUE, paid_at=NOW() WHERE event_id=$1 AND lower(email)=$2 AND paid=FALSE RETURNING id, slot') {
    const out = [];
    db.regs.forEach(r => { if (r.event_id === Number(p[0]) && lc(r.email) === p[1] && r.paid === false) { r.paid = true; r.paid_at = new Date(); out.push({ id: r.id, slot: r.slot }); } });
    return { rows: out };
  }

  // ── ws_access (api/qpay.js wsstatus — ажлын хуудасны бүх ангийн эрх) ──
  if (q === 'SELECT expires_at FROM ws_access WHERE email=$1 AND expires_at > NOW()') {
    const ex = db.wsAccess.get(lc(p[0]));
    return { rows: ex && new Date(ex).getTime() > now() ? [{ expires_at: new Date(ex) }] : [] };
  }
  // ── ws_grade_access (api/_wsgrade.js activeGrades — ангийн эрх) ──
  if (q === 'SELECT grade, expires_at FROM ws_grade_access WHERE email=$1 AND expires_at > NOW() ORDER BY grade') {
    return { rows: db.wsGrade.filter(r => r.email === lc(p[0]) && new Date(r.expires_at).getTime() > now())
      .map(r => ({ grade: r.grade, expires_at: new Date(r.expires_at) })).sort((a, b) => (a.grade < b.grade ? -1 : 1)) };
  }
  // ── ws_trials / ws_trial_marks (api/_wstrial.js — шинэ дансны үнэгүй туршилт) ──
  { const tr = db.trial.handle(q, p); if (tr) return tr; }

  if (STRICT.test(q)) { db.unknown.push(q); throw new Error('mock: unknown SQL'); }
  return { rows: [] }; // ws_settings, ws_promos гэх мэт — энэ тестэд хамаагүй
}
// ── Холболт / транзакц (pg Pool-ийн хялбаршуулсан загвар) ──
//  - client.query('BEGIN'|'COMMIT'|'ROLLBACK'|'SAVEPOINT x'|'RELEASE SAVEPOINT x'|'ROLLBACK TO SAVEPOINT x')
//  - Алдаа гарсны дараа (aborted) ROLLBACK [TO SAVEPOINT]-оос бусад бүх асуулт 25P02; aborted үед COMMIT = ROLLBACK (PG шиг).
//  - release(err) — err-тэй бол холболтыг устгана (нээлттэй tx буцаана); алдаагүй release() нээлттэй tx-тэй бол txLeaks.
//  - dropConnections() — функц тасарсан/timeout: бүх холболт үхэж, commit хийгдээгүй tx-үүд буцна (PG backend abort).
const conns = new Set();
let connSeq = 0;
// undo-г len урт хүртэл буцаана (ROLLBACK TO SAVEPOINT). Түгжээг суллахгүй (энгийнчилсэн).
function undoTo(t, len) { while (t.undo.length > len) { try { t.undo.pop()(); } catch (e) { /* ignore */ } } }
// COMMIT (commit=true) эсвэл ROLLBACK: өөрчлөлтийг үлдээх/буцаах, мөрийн түгжээг суллах
function endTx(t, commit) {
  if (commit) t.undo.length = 0; else undoTo(t, 0);
  t.locks.forEach(function (inv) { const l = db.locks.get(inv); if (l && l.tx === t) { db.locks.delete(inv); l.done(); } });
  t.locks.length = 0;
}
function mkClient() {
  const c = { id: ++connSeq, tx: null, dead: false, released: false };
  conns.add(c);
  c.query = async function (sql, p) {
    if (c.released) throw new Error('mock: release хийсэн client ашиглав');
    if (c.dead) throw dbErr('Connection terminated unexpectedly', '57P01');
    const q = norm(sql);
    let m;
    const t = c.tx;
    if (q === 'BEGIN') { if (!t) c.tx = { undo: [], sp: [], locks: [], aborted: false }; db.txLog.push('BEGIN'); return { rows: [] }; }
    if (q === 'COMMIT') {
      c.tx = null;
      if (t) { endTx(t, !t.aborted); db.txLog.push(t.aborted ? 'COMMIT(aborted)->ROLLBACK' : 'COMMIT'); }
      return { rows: [] };
    }
    if (q === 'ROLLBACK') { c.tx = null; if (t) endTx(t, false); db.txLog.push('ROLLBACK'); return { rows: [] }; }
    if ((m = q.match(/^ROLLBACK TO SAVEPOINT (\w+)$/))) {
      const i = t ? t.sp.map(function (s) { return s.name; }).lastIndexOf(m[1]) : -1;
      if (i < 0) { if (t) t.aborted = true; throw dbErr('savepoint "' + m[1] + '" does not exist', '3B001'); }
      undoTo(t, t.sp[i].len);
      t.sp.length = i + 1; t.aborted = false; db.txLog.push('ROLLBACK TO ' + m[1]);
      return { rows: [] };
    }
    if (t && t.aborted) throw dbErr('current transaction is aborted, commands ignored until end of transaction block', '25P02');
    if ((m = q.match(/^SAVEPOINT (\w+)$/))) {
      if (!t) throw dbErr('SAVEPOINT can only be used in transaction blocks', '25P01');
      t.sp.push({ name: m[1], len: t.undo.length }); db.txLog.push('SAVEPOINT ' + m[1]); return { rows: [] };
    }
    if ((m = q.match(/^RELEASE SAVEPOINT (\w+)$/))) {
      const i = t ? t.sp.map(function (s) { return s.name; }).lastIndexOf(m[1]) : -1;
      if (i < 0) { if (t) t.aborted = true; throw dbErr('savepoint "' + m[1] + '" does not exist', '3B001'); }
      t.sp.length = i; db.txLog.push('RELEASE ' + m[1]); return { rows: [] };
    }
    if (db.hangOn && db.hangOn.test(q)) {
      if (hangHit) { const h = hangHit; hangHit = null; h(c); }
      await new Promise(function () {});   // хэзээ ч дуусахгүй — процесс энд "үхсэн"
    }
    try { return await query(sql, p, c.tx); }
    catch (e) { if (c.tx) c.tx.aborted = true; throw e; }
  };
  c.release = function (err) {
    if (c.released) throw new Error('mock: давхар release');
    c.released = true; conns.delete(c);
    if (c.tx) {
      if (!err) db.txLeaks.push(c.id);
      endTx(c.tx, false); c.tx = null;
    }
  };
  return c;
}
const pool = {
  // autocommit: асуулт бүр өөрийн түр холболтоор
  query: async function (sql, p) { const c = mkClient(); try { return await c.query(sql, p); } finally { if (!c.released) c.release(); } },
  connect: async function () { if (db.failConnect) throw dbErr('connect failed', '08006'); return mkClient(); },
};
function dropConnections() {
  conns.forEach(function (c) { c.dead = true; if (c.tx) { endTx(c.tx, false); c.tx = null; } });
  conns.clear();
}
function openTx() { let n = 0; conns.forEach(function (c) { if (c.tx) n++; }); return n; }

// ── require cache stub ──
function stub(rel, exports) {
  const f = require.resolve(path.join(API, rel));
  require.cache[f] = { id: f, filename: f, loaded: true, exports: exports };
}
stub('_db.js', pool);
stub('_telegram.js', { sendTelegram: async function () { return { ok: true }; } });
stub('_email.js', new Proxy({}, { get: function () { return async function () { return { ok: true }; }; } }));

// ── QPay + Telegram fetch stub (бодит сүлжээ 0) ──
const QPAY = 'https://merchant.qpay.mn/v2';
const qp = { invoices: [], paid: new Map(), checks: [], other: [], nextInv: 1 };
const tg = [];
function jres(obj) { return { ok: true, status: 200, json: async () => obj, text: async () => JSON.stringify(obj) }; }
function tick() { return new Promise(r => setImmediate(r)); }
globalThis.fetch = async function (url, opts) {
  const u = String(url);
  let body = null; try { body = JSON.parse(opts && opts.body); } catch (e) { body = null; }
  if (u === QPAY + '/auth/token') return jres({ access_token: 'qp-fake-token', expires_in: 3600 });
  if (u === QPAY + '/invoice') {
    const id = 'INV' + String(qp.nextInv++).padStart(4, '0');
    qp.invoices.push({ id: id, body: body });
    return jres({ invoice_id: id, qr_image: 'QR', qPay_shortUrl: 'https://s.qpay.mn/' + id, urls: [] });
  }
  if (u === QPAY + '/payment/check') {
    const id = body && body.object_id;
    qp.checks.push(id);
    await tick(); await tick();   // зэрэгцсэн дуудлагууд холилдох боломж
    const amt = qp.paid.get(id);
    if (amt == null) return jres({ count: 0, paid_amount: 0, rows: [] });
    return jres({ count: 1, paid_amount: amt, rows: [{ payment_status: 'PAID', payment_amount: amt }] });
  }
  if (u.indexOf('https://api.telegram.org/') === 0) { tg.push(String(body && body.text)); return jres({ ok: true }); }
  qp.other.push(u);
  throw new Error('mock: blocked network ' + u.slice(0, 40));
};

// ── console барих ──
const logs = [];
['log', 'error', 'warn', 'info'].forEach(function (k) {
  console[k] = function () { logs.push(util.format.apply(util, arguments)); if (process.env.GAME_TEST_VERBOSE) process.stderr.write('[' + k + '] ' + util.format.apply(util, arguments) + '\n'); };
});

// ── req/res ──
function mkRes() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}
async function call(handler, o) {
  o = o || {};
  const req = { method: o.method || 'POST', headers: Object.assign({ 'x-forwarded-for': o.ip || '203.0.113.9' }, o.headers || {}), body: o.body || {}, query: o.query || {} };
  const res = mkRes();
  await handler(req, res);
  return res;
}

function reset() {
  db.rl.clear(); db.users.clear(); db.pay.clear(); db.wsPending.clear(); db.wsAccess.clear(); db.access.clear(); db.purch.length = 0;
  db.events.clear(); db.regs.length = 0; db.claims.length = 0;
  db.failGrant = false; db.failLedger = false; db.failRate = false; db.noPremUntil = false; db.failEnt = false; db.failConnect = false;
  db.failDev = false; db.failTix = false; db.failInv = false; db.failGradeSet = false; db.gradeSets.length = 0;
  db.devices.clear(); db.devIps.clear(); db.devBlocks.length = 0; db.tix.clear(); db.invites.clear(); db.invUpdates = 0;
  db.hangOn = null; hangHit = null;
  dropConnections(); db.locks.clear(); db.txLog.length = 0; db.txLeaks.length = 0;
  qp.invoices.length = 0; qp.paid.clear(); qp.checks.length = 0;
  tg.length = 0;
  ['GAME_PRICE', 'GAME_PAYWALL', 'GAME_PAYWALL_REALMS', 'GAME_INVITE_USES', 'GAME_INVITE_DAILY', 'WS_TOKEN_IAT_MIN'].forEach(k => { delete process.env[k]; });
  process.env.GAME_PAYWALL = 'on';
  process.env.GAME_PAYWALL_REALMS = 'ws,cm';
  db.wsLogin.clear(); db.wsGrade.length = 0; db.wsPurch.length = 0; db.admGrants.length = 0; db.trial.reset();
  db.eyAccess.clear(); db.eyPurch.length = 0; db.eyHand.clear(); db.failEyLedger = false;
  process.env.WS_TRIAL_SECONDS = '0'; delete process.env.WS_TRIAL_FROM; delete process.env.WS_TRIAL_IP_DAY; delete process.env.VERCEL_ENV; delete process.env.AWS_LAMBDA_FUNCTION_NAME;
}
function addUser(email, o) {
  const e = lc(email);
  const u = Object.assign({ email: e, role: 'student', grade: '9', plan: 'free', premium_expiry: null, premium_until: null, token_version: 0 }, o || {});
  db.users.set(e, u); return u;
}

module.exports = { WT, API, DAY, db, pool, qp, tg, logs, call, reset, addUser, QPAY, dropConnections, openTx, hangReached };
