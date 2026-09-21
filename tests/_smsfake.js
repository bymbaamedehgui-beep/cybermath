// SMS P1 тестийн хуурамч орчин (dependency-гүй): санах ойн pg pool, textbee fetch stub, Telegram/имэйл stub, console барих.
// Бодит DB, бодит textbee, бодит DNS/имэйл руу ХЭЗЭЭ Ч хандахгүй. api/*.js-ийг require хийхээс ӨМНӨ ачаална.
'use strict';
const path = require('path');
const util = require('util');

const WT = path.resolve(__dirname, '..');
const API = path.join(WT, 'api');

// ── env (бодит түлхүүр биш) ──
const FAKE_KEY = 'tb-fake-key-7f3a91';
Object.assign(process.env, {
  JWT_SECRET: 'test-secret-sms-p1',
  TEXTBEE_API_KEY: FAKE_KEY,
  TEXTBEE_DEVICE_ID: 'dev-fake-1',
  SMS_PAD_MS: '0',
  SMS_TIMEOUT_MS: '2000',
  DATABASE_URL: 'postgres://fake:fake@127.0.0.1:1/none',
});
['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID', 'SMS_DISABLED', 'SMS_HASH_KEY', 'SMS_MN_MOBILE_RE', 'WS_TOKEN_IAT_MIN',
 'SMS_DAY_MAX', 'SMS_30MIN_MAX', 'SMS_MONTH_MAX', 'SMS_REG_DAY_MAX', 'SMS_REG_30MIN_MAX', 'SMS_REG_MONTH_MAX',
 'SMS_IP_HOUR_MAX', 'SMS_IP24_HOUR_MAX', 'CONTACT_TEXT', 'GMAIL_APP_PASSWORD'].forEach(k => { delete process.env[k]; });

// ── санах ойн DB ──
const db = {
  rl: new Map(),          // key → {ws:ms, count}
  users: new Map(),       // lower(email) → row
  invites: new Map(),
  wsInv: new Map(),       // ws_invites token → row
  ws: new Map(),         // email → ws_login row
  smsLog: [],
  smsState: new Map(),
  entitled: new Map(),    // table → Set(email)
  entFail: false,
  rateFail: false,
  unknown: [],
  beforeWsUpsert: null,
  nextId: 1,
};
function now() { return Date.now(); }
function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function pick(row, fields) { const o = {}; fields.forEach(f => { o[f] = row[f]; }); return o; }
function lc(e) { return String(e == null ? '' : e).toLowerCase(); }
// DB DEFAULT-ийг дуурайна: SMS-ээс өмнөх мөр email_unverified=FALSE, token_version=0, phone_verified_at=NULL
function userDefaults(u) {
  return Object.assign({ email_unverified: false, token_version: 0, phone_verified_at: null }, u);
}
function userById(id) { for (const u of db.users.values()) if (String(u.id) === String(id)) return u; return null; }
function wsDefaults(r) { return Object.assign({ phone_verified_at: null }, r); }
function rateErr() { const e = new Error('connection terminated'); e.code = '57P01'; return e; }

function hitRow(key, win, period) {
  if (db.rateFail) throw rateErr();
  const t = now();
  let r = db.rl.get(key);
  if (period) {
    if (!r) r = { ws: t + win * 1000, count: 1 }; else { r.count += 1; r.ws = t + win * 1000; }
    db.rl.set(key, r);
    return { rows: [{ count: r.count, retry_after: 1 }] };
  }
  if (!r || r.ws <= t - win * 1000) r = { ws: t, count: 1 }; else r.count += 1;
  db.rl.set(key, r);
  return { rows: [{ count: r.count, retry_after: Math.max(1, Math.ceil((r.ws + win * 1000 - t) / 1000)) }] };
}

async function query(sql, p) {
  p = p || [];
  const q = norm(sql);
  let m;
  if (/^(CREATE|ALTER)\b/i.test(q)) return { rows: [] };

  // rate_limits (_guard.rateLimit, _sms hit/readCounts/decr, auth failCount)
  if (/^INSERT INTO rate_limits/.test(q)) return hitRow(String(p[0]), Number(p[1]), /VALUES \(\$1, NOW\(\) \+ make_interval/.test(q));
  if (q === 'SELECT key, count FROM rate_limits WHERE key = ANY($1)') {
    if (db.rateFail) throw rateErr();
    return { rows: p[0].filter(k => db.rl.has(k)).map(k => ({ key: k, count: db.rl.get(k).count })) };
  }
  if (q === 'UPDATE rate_limits SET count = GREATEST(count - 1, 0) WHERE key = $1') {
    const r = db.rl.get(p[0]); if (r) r.count = Math.max(0, r.count - 1); return { rows: [] };
  }
  if (q === 'SELECT count FROM rate_limits WHERE key=$1 AND window_start > NOW() - make_interval(secs => $2)') {
    const r = db.rl.get(p[0]); return { rows: r && r.ws > now() - p[1] * 1000 ? [{ count: r.count }] : [] };
  }
  if (/^DELETE FROM rate_limits/.test(q)) return { rows: [] };

  // sms_state / sms_log
  if (q === "SELECT sval FROM sms_state WHERE skey = 'paused_until'") {
    return { rows: db.smsState.has('paused_until') ? [{ sval: db.smsState.get('paused_until') }] : [] };
  }
  if (/^INSERT INTO sms_log \(kind, purpose, phone_hash, phone_masked, status\) VALUES \(\$1, \$2, \$3, \$4, 'reserved'\) RETURNING id$/.test(q)) {
    const row = { id: db.nextId++, created_at: new Date(), kind: p[0], purpose: p[1], phone_hash: p[2], phone_masked: p[3], status: 'reserved', verified_at: null };
    db.smsLog.push(row); return { rows: [{ id: row.id }] };
  }
  if (/^UPDATE sms_log SET status = \$2, error_class = \$3, http_status = \$4, duration_ms = \$5, provider_msg_id = \$6 WHERE id = \$1$/.test(q)) {
    const row = db.smsLog.find(x => x.id === p[0]);
    if (row) Object.assign(row, { status: p[1], error_class: p[2], http_status: p[3], duration_ms: p[4], provider_msg_id: p[5] });
    return { rows: [] };
  }
  if (/^UPDATE sms_log SET verified_at = NOW\(\) WHERE phone_hash = \$1 AND status = 'sent' AND verified_at IS NULL/.test(q)) {
    db.smsLog.forEach(x => { if (x.phone_hash === p[0] && x.status === 'sent' && !x.verified_at && x.created_at.getTime() > now() - 1800e3) x.verified_at = new Date(); });
    return { rows: [] };
  }
  if (/^SELECT count\(\*\)::int AS n, count\(verified_at\)::int AS v FROM sms_log/.test(q)) {
    const rows = db.smsLog.filter(x => x.status === 'sent' && x.created_at.getTime() <= now() - 480e3 && x.created_at.getTime() >= now() - 1800e3);
    return { rows: [{ n: rows.length, v: rows.filter(x => x.verified_at).length }] };
  }
  if (/^DELETE FROM sms_log/.test(q)) return { rows: [] };
  if (q === "INSERT INTO sms_state (skey, sval, updated_at) VALUES ('paused_until', $1, NOW()) ON CONFLICT (skey) DO UPDATE SET sval = EXCLUDED.sval, updated_at = NOW()") {
    db.smsState.set('paused_until', String(p[0])); return { rows: [] };
  }
  if (q === "DELETE FROM sms_state WHERE skey = 'paused_until'") { db.smsState.delete('paused_until'); return { rows: [] }; }
  if (/^SELECT error_class, count\(\*\)::int AS n FROM sms_log WHERE created_at > NOW\(\) - INTERVAL '24 hours' AND error_class IS NOT NULL GROUP BY error_class$/.test(q)) {
    const c = {}; db.smsLog.forEach(x => { if (x.error_class) c[x.error_class] = (c[x.error_class] || 0) + 1; });
    return { rows: Object.keys(c).map(k => ({ error_class: k, n: c[k] })) };
  }
  if (/^SELECT count\(\*\)::int AS n FROM sms_log WHERE status = 'sent' AND verified_at IS NULL AND created_at > NOW\(\) - INTERVAL '30 minutes'$/.test(q)) {
    return { rows: [{ n: db.smsLog.filter(x => x.status === 'sent' && !x.verified_at).length }] };
  }

  // users (api/auth.js)
  if (q === 'DELETE FROM users WHERE verified=false AND verify_expiry < NOW()') {
    for (const [k, u] of db.users) if (u.verified === false && u.verify_expiry && new Date(u.verify_expiry).getTime() < now()) db.users.delete(k);
    return { rows: [] };
  }
  if ((m = q.match(/^SELECT ([a-z_, *1]+) FROM users WHERE LOWER\(email\)=LOWER\(\$1\)( AND verified IS NOT FALSE)?$/))) {
    const u0 = db.users.get(lc(p[0]));
    if (!u0 || (m[2] && u0.verified === false)) return { rows: [] };
    const u = userDefaults(u0);
    if (m[1] === '*') return { rows: [Object.assign({}, u)] };
    if (m[1] === '1') return { rows: [{ '?column?': 1 }] };
    return { rows: [pick(u, m[1].split(',').map(s => s.trim()))] };
  }
  if (q === 'SELECT * FROM users WHERE id=$1') { const u = userById(p[0]); return { rows: u ? [Object.assign({}, userDefaults(u))] : [] }; }
  if (q === 'SELECT count(*)::int AS n FROM users WHERE phone=$1 AND verified IS NOT FALSE') {
    let n = 0; for (const u of db.users.values()) if (u.phone === p[0] && u.verified !== false) n++; return { rows: [{ n }] };
  }
  if (q === 'UPDATE users SET verified=true, verify_code=NULL, verify_expiry=NULL, phone_verified_at=NOW(), email_unverified=TRUE WHERE LOWER(email)=LOWER($1)') {
    const u = db.users.get(lc(p[0])); if (u) Object.assign(u, { verified: true, verify_code: null, verify_expiry: null, phone_verified_at: new Date(), email_unverified: true }); return { rows: [] };
  }
  if ((m = q.match(/^UPDATE users SET pass=\$1, verify_code=NULL, verify_expiry=NULL, (phone_verified_at=COALESCE\(phone_verified_at, NOW\(\)\), )?token_version=COALESCE\(token_version,0\)\+1 WHERE LOWER\(email\)=LOWER\(\$2\)$/))) {
    const u = db.users.get(lc(p[1]));
    if (u) { Object.assign(u, { pass: p[0], verify_code: null, verify_expiry: null, token_version: (u.token_version | 0) + 1 }); if (m[1] && !u.phone_verified_at) u.phone_verified_at = new Date(); }
    return { rows: [] };
  }
  if (q === 'UPDATE users SET phone=$2, phone_verified_at=(CASE WHEN $3::boolean THEN NOW() ELSE NULL END), verify_code=NULL, verify_expiry=NULL, token_version=COALESCE(token_version,0)+1 WHERE LOWER(email)=LOWER($1) RETURNING email') {
    const u = db.users.get(lc(p[0])); if (!u) return { rows: [] };
    Object.assign(u, { phone: p[1], phone_verified_at: p[2] ? new Date() : null, verify_code: null, verify_expiry: null, token_version: (u.token_version | 0) + 1 });
    return { rows: [{ email: u.email }] };
  }
  // api/googleauth.js
  if (q === "UPDATE users SET pass='GOOGLE_OAUTH', phone=NULL, phone_verified_at=NULL, verify_code=NULL, verify_expiry=NULL, verified=TRUE, email_unverified=FALSE, token_version=COALESCE(token_version,0)+1 WHERE id=$1 AND email_unverified=TRUE RETURNING *") {
    const u = userById(p[0]); if (!u || u.email_unverified !== true) return { rows: [] };
    Object.assign(u, { pass: 'GOOGLE_OAUTH', phone: null, phone_verified_at: null, verify_code: null, verify_expiry: null, verified: true, email_unverified: false, token_version: (u.token_version | 0) + 1 });
    return { rows: [Object.assign({}, userDefaults(u))] };
  }
  if (q === 'UPDATE users SET email_unverified=FALSE WHERE id=$1') { const u = userById(p[0]); if (u) u.email_unverified = false; return { rows: [] }; }
  if (q === 'UPDATE users SET profile_image=$1 WHERE id=$2') { const u = userById(p[1]); if (u) u.profile_image = p[0]; return { rows: [] }; }
  if (q === "INSERT INTO users (email, pass, first_name, last_name, plan, verified, profile_image) VALUES ($1, $2, $3, $4, 'free', true, $5) RETURNING *") {
    const e = lc(p[0]);
    const u = { id: db.nextId++, email: e, pass: p[1], first_name: p[2], last_name: p[3], plan: 'free', verified: true, profile_image: p[4], email_unverified: false, token_version: 0, phone: null, code_attempts: 0 };
    db.users.set(e, u); return { rows: [Object.assign({}, u)] };
  }
  if (q === 'DELETE FROM users WHERE LOWER(email)=LOWER($1) AND verified=false') {
    const u = db.users.get(lc(p[0])); if (u && u.verified === false) db.users.delete(lc(p[0])); return { rows: [] };
  }
  if (/^INSERT INTO users \(email,pass,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,verified,verify_code,verify_expiry,aimag,sum,school,phone,role,email_unverified\) VALUES \(LOWER\(\$1\),\$2,\$3,\$4,\$5,\$6,0,340,5,0,\$7,\$8,\$9,\$10,\$11,\$12,\$13,\$14,\$15,TRUE\)$/.test(q)) {
    const e = lc(p[0]);
    if (db.users.has(e)) { const err = new Error('duplicate key value violates unique constraint'); err.code = '23505'; throw err; }
    db.users.set(e, { id: db.nextId++, email: e, pass: p[1], first_name: p[2], last_name: p[3], grade: p[4], plan: p[5], xp: 0, gems: 340, hearts: 5, streak: 0,
      avatar: p[6], verified: p[7], verify_code: p[8], verify_expiry: p[9], aimag: p[10], sum: p[11], school: p[12], phone: p[13], role: p[14], code_attempts: 0,
      email_unverified: true, token_version: 0, phone_verified_at: null });
    return { rows: [] };
  }
  if ((m = q.match(/^UPDATE users SET verify_code=\$1, verify_expiry=\$2, code_attempts=0 WHERE LOWER\(email\)=LOWER\(\$3\) AND verified IS NOT (TRUE|FALSE) RETURNING id$/))) {
    const u = db.users.get(lc(p[2]));
    if (!u || (m[1] === 'TRUE' ? u.verified === true : u.verified === false)) return { rows: [] };
    Object.assign(u, { verify_code: p[0], verify_expiry: p[1], code_attempts: 0 }); return { rows: [{ id: u.id }] };
  }
  if (q === 'UPDATE users SET verify_code=NULL WHERE LOWER(email)=LOWER($1) AND verify_code=$2') {
    const u = db.users.get(lc(p[0])); if (u && u.verify_code === p[1]) u.verify_code = null; return { rows: [] };
  }
  if (/^UPDATE users SET code_attempts = COALESCE\(code_attempts,0\) \+ 1 WHERE LOWER\(email\)=LOWER\(\$1\) AND verify_code IS NOT NULL AND COALESCE\(code_attempts,0\) < \$2 RETURNING verify_code, verify_expiry, code_attempts$/.test(q)) {
    const u = db.users.get(lc(p[0]));
    if (!u || u.verify_code == null || (u.code_attempts || 0) >= p[1]) return { rows: [] };
    u.code_attempts = (u.code_attempts || 0) + 1; return { rows: [pick(u, ['verify_code', 'verify_expiry', 'code_attempts'])] };
  }
  if (q === 'UPDATE users SET verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($1) AND verify_code=$2') {
    const u = db.users.get(lc(p[0])); if (u && u.verify_code === p[1]) { u.verify_code = null; u.verify_expiry = null; } return { rows: [] };
  }
  if (q === 'UPDATE users SET code_attempts=0 WHERE LOWER(email)=LOWER($1)') { const u = db.users.get(lc(p[0])); if (u) u.code_attempts = 0; return { rows: [] }; }
  if (q === 'UPDATE users SET verified=true, verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($1)') {
    const u = db.users.get(lc(p[0])); if (u) Object.assign(u, { verified: true, verify_code: null, verify_expiry: null }); return { rows: [] };
  }
  if (q === 'UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($2)') {
    const u = db.users.get(lc(p[1])); if (u) Object.assign(u, { pass: p[0], verify_code: null, verify_expiry: null }); return { rows: [] };
  }
  if (/^SELECT \* FROM admin_invites WHERE token=\$1/.test(q)) {
    const i = db.invites.get(p[0]); return { rows: i && i.uses < i.max_uses ? [Object.assign({}, i)] : [] };
  }
  if (q === 'UPDATE admin_invites SET uses = uses + 1 WHERE token=$1') { const i = db.invites.get(p[0]); if (i) i.uses++; return { rows: [] }; }

  // ws entitlement (api/worksheets.js wsEntitled)
  if ((m = q.match(/^SELECT 1 FROM (ws_access|ws_grade_access|ws_purchases|ws_pending|ws_event_regs) WHERE LOWER\(email\)=\$1/))) {
    if (db.entFail) { const e = new Error('db down'); e.code = '57P01'; throw e; }
    const s = db.entitled.get(m[1]); return { rows: s && s.has(p[0]) ? [{ '?column?': 1 }] : [] };
  }

  // ws_login (api/worksheets.js)
  if ((m = q.match(/^SELECT ([a-z_, ]+) FROM ws_login WHERE email=\$1$/))) {
    const r = db.ws.get(p[0]); return { rows: r ? [pick(wsDefaults(r), m[1].split(',').map(s => s.trim()))] : [] };
  }
  if (q === 'SELECT count(*)::int AS n FROM ws_login WHERE phone=$1 AND verified=TRUE') {
    let n = 0; for (const r of db.ws.values()) if (r.phone === p[0] && r.verified === true) n++; return { rows: [{ n }] };
  }
  if (q === 'UPDATE ws_login SET phone=NULL, phone_verified_at=NULL, code=NULL, code_exp=NULL WHERE email=$1 RETURNING email') {
    const r = db.ws.get(p[0]); if (!r) return { rows: [] };
    Object.assign(r, { phone: null, phone_verified_at: null, code: null, code_exp: null }); return { rows: [{ email: r.email }] };
  }
  if (q === "INSERT INTO ws_login (email, pass_hash, verified, phone, phone_verified_at) VALUES ($1,'!',FALSE,$2,NOW()) ON CONFLICT (email) DO UPDATE SET phone=EXCLUDED.phone, phone_verified_at=NOW(), code=NULL, code_exp=NULL, code_attempts=0 RETURNING email, verified") {
    let r = db.ws.get(p[0]);
    if (!r) { r = { email: p[0], pass_hash: '!', verified: false, code: null, code_exp: null, name: null, phone: p[1], phone_verified_at: new Date(), code_attempts: 0 }; db.ws.set(p[0], r); }
    else Object.assign(r, { phone: p[1], phone_verified_at: new Date(), code: null, code_exp: null, code_attempts: 0 });
    return { rows: [{ email: r.email, verified: r.verified }] };
  }
  if (/^INSERT INTO ws_login \(email, pass_hash, verified, code, code_exp, name, phone\) VALUES \(\$1,\$2,FALSE,\$3,\$4,\$5,\$6\) ON CONFLICT \(email\) DO UPDATE SET pass_hash=EXCLUDED\.pass_hash, code=EXCLUDED\.code, code_exp=EXCLUDED\.code_exp, code_attempts=0, name=EXCLUDED\.name, phone=EXCLUDED\.phone WHERE ws_login\.verified=FALSE AND ws_login\.phone_verified_at IS NULL AND \(ws_login\.code IS NULL OR ws_login\.code_exp IS NULL OR ws_login\.code_exp <= NOW\(\)\) RETURNING email$/.test(q)) {
    if (typeof db.beforeWsUpsert === 'function') { const f = db.beforeWsUpsert; db.beforeWsUpsert = null; f(p[0]); }
    const [email, hash, code, exp, name, phone] = p; const r = db.ws.get(email);
    if (!r) { db.ws.set(email, { email, pass_hash: hash, verified: false, code, code_exp: new Date(exp), name, phone, code_attempts: 0 }); return { rows: [{ email }] }; }
    if (!r.verified && !r.phone_verified_at && (r.code == null || r.code_exp == null || new Date(r.code_exp).getTime() <= now())) {
      Object.assign(r, { pass_hash: hash, code, code_exp: new Date(exp), code_attempts: 0, name, phone }); return { rows: [{ email }] };
    }
    return { rows: [] };
  }
  if ((m = q.match(/^UPDATE ws_login SET code=\$2, code_exp=\$3, code_attempts=0 WHERE email=\$1( AND verified=FALSE)? RETURNING email$/))) {
    const r = db.ws.get(p[0]);
    if (!r || (m[1] && r.verified)) return { rows: [] };
    Object.assign(r, { code: p[1], code_exp: new Date(p[2]), code_attempts: 0 }); return { rows: [{ email: r.email }] };
  }
  if (q === 'UPDATE ws_login SET code_attempts=COALESCE(code_attempts,0)+1 WHERE email=$1 AND code IS NOT NULL RETURNING code, code_exp, code_attempts') {
    const r = db.ws.get(p[0]); if (!r || r.code == null) return { rows: [] };
    r.code_attempts = (r.code_attempts || 0) + 1; return { rows: [pick(r, ['code', 'code_exp', 'code_attempts'])] };
  }
  if (q === 'UPDATE ws_login SET code=NULL, code_exp=NULL WHERE email=$1 AND code=$2') {
    const r = db.ws.get(p[0]); if (r && r.code === p[1]) { r.code = null; r.code_exp = null; } return { rows: [] };
  }
  if (q === 'UPDATE ws_login SET pass_hash=$3, verified=TRUE, code=NULL, code_exp=NULL, code_attempts=0, phone_verified_at=NOW() WHERE email=$1 AND code=$2 RETURNING email') {
    const r = db.ws.get(p[0]); if (!r || r.code !== p[1]) return { rows: [] };
    Object.assign(r, { pass_hash: p[2], verified: true, code: null, code_exp: null, code_attempts: 0, phone_verified_at: new Date() }); return { rows: [{ email: r.email }] };
  }
  if (q === 'UPDATE ws_login SET pass_hash=$2, verified=TRUE, code=NULL, code_exp=NULL, code_attempts=0, phone_verified_at=COALESCE(phone_verified_at, NOW()) WHERE email=$1 AND code=$3 RETURNING email') {
    const r = db.ws.get(p[0]); if (!r || r.code !== p[2]) return { rows: [] };
    Object.assign(r, { pass_hash: p[1], verified: true, code: null, code_exp: null, code_attempts: 0 }); if (!r.phone_verified_at) r.phone_verified_at = new Date(); return { rows: [{ email: r.email }] };
  }

  // worksheets.js урилгын линк (ws_invites) + урилгаар бүртгүүлэх
  if (q === 'INSERT INTO ws_invites (token, max_uses, expires_at, note) VALUES ($1,$2,$3,$4)') {
    db.wsInv.set(p[0], { token: p[0], max_uses: p[1], uses: 0, expires_at: p[2] ? new Date(p[2]) : null, note: p[3], created_at: new Date() }); return { rows: [] };
  }
  if (q === 'SELECT max_uses, uses, expires_at FROM ws_invites WHERE token=$1') {
    const i = db.wsInv.get(p[0]); return { rows: i ? [pick(i, ['max_uses', 'uses', 'expires_at'])] : [] };
  }
  if (q === 'SELECT token, max_uses, uses, expires_at, note, created_at FROM ws_invites ORDER BY created_at DESC LIMIT 200') {
    return { rows: Array.from(db.wsInv.values()).reverse().map(i => Object.assign({}, i)) };
  }
  if (q === 'DELETE FROM ws_invites WHERE token=$1') { db.wsInv.delete(p[0]); return { rows: [] }; }
  if (q === 'UPDATE ws_invites SET uses=uses+1 WHERE token=$1 AND uses < max_uses AND (expires_at IS NULL OR expires_at > NOW()) RETURNING token') {
    const i = db.wsInv.get(p[0]);
    if (!i || i.uses >= i.max_uses || (i.expires_at && new Date(i.expires_at).getTime() <= now())) return { rows: [] };
    i.uses++; return { rows: [{ token: i.token }] };
  }
  if (q === 'UPDATE ws_invites SET uses=GREATEST(uses-1,0) WHERE token=$1') { const i = db.wsInv.get(p[0]); if (i) i.uses = Math.max(0, i.uses - 1); return { rows: [] }; }
  if (q === 'INSERT INTO ws_login (email, pass_hash, verified, code, code_exp, name, phone, invite) VALUES ($1,$2,TRUE,NULL,NULL,$3,$4,$5) ON CONFLICT (email) DO UPDATE SET pass_hash=EXCLUDED.pass_hash, verified=TRUE, code=NULL, code_exp=NULL, code_attempts=0, name=EXCLUDED.name, phone=EXCLUDED.phone, invite=EXCLUDED.invite WHERE ws_login.verified=FALSE AND ws_login.phone_verified_at IS NULL RETURNING email') {
    if (typeof db.beforeWsUpsert === 'function') { const f = db.beforeWsUpsert; db.beforeWsUpsert = null; f(p[0]); }
    const [email, hash, name, phone, inv] = p; const r = db.ws.get(email);
    const fields = { pass_hash: hash, verified: true, code: null, code_exp: null, code_attempts: 0, name, phone, invite: inv };
    if (!r) { db.ws.set(email, Object.assign({ email, phone_verified_at: null }, fields)); return { rows: [{ email }] }; }
    if (!r.verified && !r.phone_verified_at) { Object.assign(r, fields); return { rows: [{ email }] }; }
    return { rows: [] };
  }

  // auth.js register: дахин бүртгүүлэхэд хуучин кодыг шинэ мөрөнд шилжүүлнэ
  if (q === 'UPDATE users SET verify_code=$2, code_attempts=$3 WHERE LOWER(email)=LOWER($1) AND verified=false') {
    const u = db.users.get(lc(p[0])); if (u && u.verified === false) Object.assign(u, { verify_code: p[1], code_attempts: p[2] }); return { rows: [] };
  }
  // sendCode reuse (auth.js userCodeReuse / worksheets.js wsCodeReuse): хүчинтэй кодын хугацааг сунгаж ТЭР кодыг буцаана
  if ((m = q.match(/^UPDATE users SET verify_expiry=\$2 WHERE LOWER\(email\)=LOWER\(\$1\) AND verified IS NOT (TRUE|FALSE) AND verify_code IS NOT NULL AND verify_expiry > NOW\(\) AND COALESCE\(code_attempts,0\) < \$3 RETURNING verify_code$/))) {
    if (db.reuseFail) { const e = new Error('db down'); e.code = '57P01'; throw e; }
    db.reuseQueries = (db.reuseQueries || 0) + 1;
    const u = db.users.get(lc(p[0]));
    if (!u || (m[1] === 'TRUE' ? u.verified === true : u.verified === false)) return { rows: [] };
    if (u.verify_code == null || !u.verify_expiry || new Date(u.verify_expiry).getTime() <= now() || (u.code_attempts || 0) >= p[2]) return { rows: [] };
    u.verify_expiry = p[1]; return { rows: [{ verify_code: u.verify_code }] };
  }
  if ((m = q.match(/^UPDATE ws_login SET code_exp=\$2 WHERE email=\$1( AND verified=FALSE)? AND code IS NOT NULL AND code_exp > NOW\(\) AND COALESCE\(code_attempts,0\) < \$3 RETURNING code$/))) {
    if (db.reuseFail) { const e = new Error('db down'); e.code = '57P01'; throw e; }
    db.reuseQueries = (db.reuseQueries || 0) + 1;
    const r = db.ws.get(p[0]);
    if (!r || (m[1] && r.verified)) return { rows: [] };
    if (r.code == null || !r.code_exp || new Date(r.code_exp).getTime() <= now() || (r.code_attempts || 0) >= p[2]) return { rows: [] };
    r.code_exp = new Date(p[1]); return { rows: [{ code: r.code }] };
  }

  // _sms.js promoNote — ws_promo_public-тэй ижил нөхцөл (db.promos: {active, personal, expires_at, max_uses, used_count})
  if (q === 'SELECT 1 FROM ws_promos WHERE active = TRUE AND COALESCE(personal, FALSE) = FALSE AND (expires_at IS NULL OR expires_at > NOW()) AND (max_uses IS NULL OR used_count < max_uses) LIMIT 1') {
    db.promoQueries = (db.promoQueries || 0) + 1;
    if (db.promoMode === 'hang') return new Promise(function () {});
    if (db.promoMode === 'fail') { const e = new Error('relation "ws_promos" does not exist'); e.code = '42P01'; throw e; }
    const live = (db.promos || []).filter(r => r.active === true && r.personal !== true
      && (r.expires_at == null || new Date(r.expires_at).getTime() > now())
      && (r.max_uses == null || r.used_count < r.max_uses));
    return { rows: live.length ? [{ '?column?': 1 }] : [] };
  }

  // _sms.js ensureUserColumns — каталог шалгалт (хоосон → ALTER-ууд урьдын адил ажиллана)
  if (/^SELECT column_name FROM information_schema\.columns WHERE table_name = 'users' AND column_name = ANY\(\$1\)$/.test(q)) return { rows: [] };
  if (q === "SELECT indexname FROM pg_indexes WHERE tablename = 'users' AND indexname = 'idx_users_phone'") return { rows: [] };

  if (/\b(users|ws_login|rate_limits|sms_log|sms_state|ws_access|ws_grade_access|ws_purchases|ws_pending|ws_event_regs|admin_invites|ws_invites|ws_promos)\b/.test(q)) {
    db.unknown.push(q);
    throw new Error('mock: unknown SQL');
  }
  return { rows: [] }; // ws_sets, ws_feedback гэх мэт — энэ тестэд хамаагүй
}
const pool = { query: query };

// ── require cache stub ──
function stub(rel, exports) {
  const f = require.resolve(path.join(API, rel));
  require.cache[f] = { id: f, filename: f, loaded: true, exports: exports };
}
const tg = [];
const mail = [];
stub('_db.js', pool);
stub('_telegram.js', { sendTelegram: async function (text) { tg.push(String(text)); return { ok: true }; } });
stub('_email.js', new Proxy({}, { get: function (t, k) { return async function () { mail.push({ fn: String(k), args: [].slice.call(arguments) }); return { ok: true }; }; } }));
stub('_email_validate.js', { validateEmail: async function (e) { return /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(String(e || '')) ? { ok: true } : { ok: false, code: 'SYNTAX', error: 'И-мэйл буруу' }; } });

// ── textbee fetch stub (бодит сүлжээ 0) ──
const TEXTBEE_URL = 'https://api.textbee.dev/api/v1/gateway/send-sms';
const sms = { mode: 'ok', calls: [], other: [] };
globalThis.fetch = async function (url, opts) {
  const u = String(url);
  if (u !== TEXTBEE_URL) { sms.other.push(u); throw new Error('mock: blocked network ' + u.slice(0, 30)); }
  let body = null; try { body = JSON.parse(opts && opts.body); } catch (e) { body = null; }
  sms.calls.push({ url: u, headers: Object.assign({}, opts && opts.headers), body: body });
  const mode = sms.mode;
  const resp = (status, obj) => ({ status: status, text: async () => JSON.stringify(obj) });
  if (mode === 'ok') return resp(201, { data: { success: true, smsBatchId: 'batch' + sms.calls.length } });
  if (mode === 'auth') return resp(401, { message: 'Unauthorized' });
  if (mode === 'device') return resp(404, { message: 'not found' });
  if (mode === 'down') return resp(500, { message: 'err' });
  if (mode === 'quota') return resp(429, { message: 'limit' });
  if (mode === 'fail') return resp(200, { data: { success: false } });
  if (mode === 'network') throw new TypeError('fetch failed');
  if (mode === 'abort') { const e = new Error('The operation was aborted'); e.name = 'AbortError'; throw e; }
  if (mode === 'hang') {
    return new Promise(function (resolve, reject) {
      const sig = opts && opts.signal;
      if (!sig) return;
      sig.addEventListener('abort', function () { const e = new Error('aborted'); e.name = 'AbortError'; reject(e); });
    });
  }
  throw new Error('mock: bad mode');
};
function codesSent() { return sms.calls.map(c => { const m = c.body && String(c.body.message).match(/(\d{6})/); return m ? m[1] : null; }).filter(Boolean); }
function lastCode() { const c = codesSent(); return c.length ? c[c.length - 1] : null; }

// ── console барих ──
const logs = [];
['log', 'error', 'warn', 'info'].forEach(function (k) {
  console[k] = function () { logs.push(util.format.apply(util, arguments)); if (process.env.SMS_TEST_VERBOSE) process.stderr.write('[' + k + '] ' + util.format.apply(util, arguments) + '\n'); };
});

// ── req/res ──
function mkRes() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}
async function call(handler, body, opts) {
  const o = opts || {};
  const req = { method: 'POST', headers: Object.assign({ 'x-forwarded-for': o.ip || '203.0.113.7' }, o.headers || {}), body: body, query: o.query || {} };
  const res = mkRes();
  await handler(req, res);
  responses.push(res.body);
  return res;
}
const responses = [];

function reset() {
  // db.unknown-ийг цэвэрлэхгүй — файлын төгсгөлд нийтээр шалгана
  db.rl.clear(); db.entitled.clear(); db.wsInv.clear(); db.entFail = false; db.rateFail = false; db.beforeWsUpsert = null;
  db.smsState.delete('paused_until');
  sms.mode = 'ok';
  delete process.env.SMS_DISABLED; delete process.env.SMS_DAY_MAX;
  process.env.SMS_PAD_MS = '0';
  process.env.TEXTBEE_API_KEY = FAKE_KEY;
  db.promos = []; db.promoMode = null; db.promoQueries = 0; db.reuseFail = false; db.reuseQueries = 0; delete process.env.SMS_PROMO_NOTE;
  const smsMod = require.cache[require.resolve(path.join(API, '_sms.js'))];
  if (smsMod && smsMod.exports && smsMod.exports.promoCacheReset) smsMod.exports.promoCacheReset();
}
function clearCooldowns() { for (const k of Array.from(db.rl.keys())) if (/^(sms:em:cd:|sms:ph:cd:|auth:|wscode:)/.test(k)) db.rl.delete(k); }
function entitle(table, email) { if (!db.entitled.has(table)) db.entitled.set(table, new Set()); db.entitled.get(table).add(email); }

// S2: бүтэн дугаар, илгээсэн код, API түлхүүр лог/Telegram/sms_log/хариунд гарахгүй
function leakCheck(phones) {
  const secrets = [FAKE_KEY].concat(codesSent());
  const hay = [
    ['console', logs.join('\n')],
    ['telegram', tg.join('\n')],
    ['sms_log', JSON.stringify(db.smsLog)],
    // Нэвтэрсэн эзэмшигчид буцаах өөрийн профайл (userPayload.phone) — S2 үл хамаарах
    ['responses', JSON.stringify(responses.filter(b => !(b && b.user)))],
  ];
  const found = [];
  hay.forEach(function (h) {
    phones.forEach(function (ph) { if (h[1].indexOf(ph) >= 0) found.push(h[0] + ': phone'); });
    secrets.forEach(function (s) { if (h[1].indexOf(s) >= 0) found.push(h[0] + ': secret/code'); });
    if (/Failing row/.test(h[1])) found.push(h[0] + ': Failing row');
  });
  return found;
}

module.exports = { WT, API, db, pool, sms, tg, mail, logs, responses, call, reset, clearCooldowns, entitle, codesSent, lastCode, leakCheck, FAKE_KEY, TEXTBEE_URL };
