const crypto = require('crypto');
const pool = require('./_db');
const sms = require('./_sms');
const tg = require('./_telegram');
const { validateEmail } = require('./_email_validate');
const { ensureExpiryCheck } = require('./_premium');
const { jwtSecret, secretMissing, requireAdmin, rateLimit, clientIp } = require('./_guard');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const BCRYPT_ROUNDS = 10;
const MAX_CODE_ATTEMPTS = 5;          // нэг кодонд ногдох буруу оролдлого
const TOO_MANY = 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.';

function signToken(email, role, tv) {
  // /api/users токен заавал шаарддаг болсон тул Google токентой ижил 30 хоног.
  // tv = users.token_version — Google цэвэрлэгээ / нууц үг сэргээлт / админ утас тохируулахад хуучин токен хүчингүй (api/users.js)
  return jwt.sign({ email: email, role: role, tv: Number(tv) | 0 }, jwtSecret(), { expiresIn: '30d' });
}
function roleOf(u) { return u.role || (u.grade === 'teacher' ? 'teacher' : 'student'); }

// Нууц үг сэргээх кодыг илгээж болох утас (спек §5.1). SMS кодоор батлагдсан утас, эсвэл
// SMS-ээс ӨМНӨ имэйлээр батлагдсан (email_unverified=FALSE) дансны хүчинтэй утас. Бусад → null.
// SMS/урилгаар бүртгүүлж утсаа батлаагүй дансны утсанд итгэхгүй (S7: SMS имэйлийн эзэмшлийг батлахгүй).
function usablePhone(u) {
  if (!u) return null;
  const pn = sms.normalizePhone(u.phone);
  if (!pn.ok) return null;
  if (u.phone_verified_at) return pn.local;
  if (sms.trustLegacyPhone() && u.email_unverified === false) return pn.local;
  return null;
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

async function sendTelegramNotification(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
  } catch (e) {
    console.log('Telegram error (non-fatal):', e.message);
  }
}

// ═══ Админ урилгын хүснэгт (шаардлагатай бол автомат үүсгэнэ) ═══
let _inviteTableReady = false;
async function ensureInviteTable() {
  if (_inviteTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_invites (
      token VARCHAR(64) PRIMARY KEY,
      created_by VARCHAR(255),
      grade VARCHAR(20),
      school VARCHAR(255),
      max_uses INT DEFAULT 1,
      uses INT DEFAULT 0,
      expires_at TIMESTAMPTZ,
      note VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `).catch(()=>{});
  _inviteTableReady = true;
}

// ═══ Кодын буруу оролдлогын тоолуур (users.code_attempts) ═══
let _attemptsReady = null;
function ensureAttemptsColumn() {
  if (!_attemptsReady) {
    _attemptsReady = pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS code_attempts INT NOT NULL DEFAULT 0`)
      .catch(function(e) {
        // Зэрэг cold start: 42701 (duplicate column) / 23505 — багана аль хэдийн бий
        if (e && (e.code === '42701' || e.code === '23505')) return;
        _attemptsReady = null; throw e;
      });
  }
  return _attemptsReady;
}

// Кодыг атомараар шалгана: оролдлого бүр эхлээд тоологдоно (мөрийн түгжээтэй UPDATE),
// 5 дахь буруу оролдлогын дараа код NULL болж, шинэ код авах хүртэл түгжигдэнэ.
// Буцаах: 'ok' | 'bad' | 'locked'
// Хугацаа дууссан код нь буруу кодтой ЯГ ИЖИЛ ('bad') — хуучин код зөв эсэхийг задлахгүй (oracle байхгүй).
async function checkCode(email, code) {
  await ensureAttemptsColumn();
  const c = String(code == null ? '' : code).trim();
  const r = await pool.query(
    `UPDATE users SET code_attempts = COALESCE(code_attempts,0) + 1
     WHERE LOWER(email)=LOWER($1) AND verify_code IS NOT NULL AND COALESCE(code_attempts,0) < $2
     RETURNING verify_code, verify_expiry, code_attempts`,
    [email, MAX_CODE_ATTEMPTS]
  );
  if (!r.rows.length) return 'locked';
  const row = r.rows[0];
  const expired = !row.verify_expiry || new Date(row.verify_expiry) < new Date();
  if (expired || !c || !safeEqual(c, row.verify_code)) {
    if (Number(row.code_attempts) >= MAX_CODE_ATTEMPTS) {
      await pool.query(
        `UPDATE users SET verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($1) AND verify_code=$2`,
        [email, row.verify_code]
      );
    }
    return 'bad';
  }
  await pool.query('UPDATE users SET code_attempts=0 WHERE LOWER(email)=LOWER($1)', [email]);
  return 'ok';
}
// Login-ийн АМЖИЛТГҮЙ оролдлогын тоог нэмэгдүүлэхгүйгээр уншина (rate_limits хүснэгт _guard.js-д үүснэ).
// Амжилттай нэвтрэлт тоологдохгүй тул бусдын имэйлээр түгжих (DoS) хүндэрнэ.
const LOGIN_FAIL_WINDOW = 900;
const LOGIN_FAIL_EM_IP = 10;   // имэйл + IP хос
const LOGIN_FAIL_EM = 30;      // имэйл дээр нийт (олон IP-ээс тараан таах)
async function failCount(key) {
  try {
    const r = await pool.query(
      `SELECT count FROM rate_limits WHERE key=$1 AND window_start > NOW() - make_interval(secs => $2)`,
      [String(key).slice(0, 300), LOGIN_FAIL_WINDOW]
    );
    return r.rows.length ? Number(r.rows[0].count) || 0 : 0;
  } catch (e) {
    if (e && e.code === '42P01') return 0; // хүснэгт хараахан үүсээгүй
    console.error('[auth failCount]', e.message);
    return Infinity; // fail-closed
  }
}
async function loginLocked(email, ip) {
  return (await failCount('auth:loginfail:emip:' + email + '|' + ip)) >= LOGIN_FAIL_EM_IP
      || (await failCount('auth:loginfail:em:' + email)) >= LOGIN_FAIL_EM;
}
async function recordLoginFail(email, ip) {
  await rateLimit('auth:loginfail:emip:' + email + '|' + ip, LOGIN_FAIL_EM_IP, LOGIN_FAIL_WINDOW);
  await rateLimit('auth:loginfail:em:' + email, LOGIN_FAIL_EM, LOGIN_FAIL_WINDOW);
}

// ═══ SMS код (баталгаажуулах / нууц үг сэргээх) — api/_sms.js sendCode-ийн store/drop ═══
// forReset=false: зөвхөн баталгаажаагүй мөр (бүртгэл), true: зөвхөн баталгаажсан мөр (нууц үг сэргээх)
function userCodeStore(email, forReset) {
  return async function (code) {
    const r = await pool.query(
      'UPDATE users SET verify_code=$1, verify_expiry=$2, code_attempts=0 WHERE LOWER(email)=LOWER($3) AND '
        + (forReset ? 'verified IS NOT FALSE' : 'verified IS NOT TRUE') + ' RETURNING id',
      [code, new Date(Date.now() + 10 * 60 * 1000), email]
    );
    if (!r.rows.length) throw new Error('user code store: row missing');
  };
}
function userCodeDrop(email) {
  return function (code) {
    return pool.query('UPDATE users SET verify_code=NULL WHERE LOWER(email)=LOWER($1) AND verify_code=$2', [email, code]);
  };
}
// Enumeration-д мэдрэг endpoint (resend/forgot): данс олдоогүй / ашиглах утасгүй / дугаарын квот → бодит илгээлттэй ижил хэлбэр
function smsAccepted(masked) { return { ok: true, sms: true, masked: masked }; }

// Буруу болон хугацаа дууссан код нэг ижил мессежтэй (хэрэглэгчид хоёр шалтгааныг хоёуланг нь хэлнэ)
const BAD_CODE_MSG = 'Код буруу эсвэл хугацаа нь дууссан байна';
function codeError(res, status) {
  if (status === 'locked') return res.status(400).json({ ok: false, error: 'Код хүчингүй болсон. Шинэ код авна уу.', locked: true });
  return res.status(400).json({ ok: false, error: BAD_CODE_MSG });
}

function randomToken(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0, O, I, 1 хассан
  let out = '';
  for (let i = 0; i < (len || 10); i++) out += chars[crypto.randomInt(chars.length)];
  return out;
}

function userPayload(u, token) {
  return {
    email: u.email, firstName: u.first_name, lastName: u.last_name,
    grade: u.grade, plan: u.plan, premium_expiry: u.premium_expiry || u.premium_until || null,
    xp: u.xp || 0, gems: u.gems || 340,
    hearts: u.hearts == null ? 5 : u.hearts, streak: u.streak || 0,
    avatar: u.avatar || 'default',
    profile_image: u.profile_image || null,
    current_node_id: u.current_node_id || null,
    lesson_progress: u.lesson_progress || null,
    role: u.role || (u.grade === 'teacher' ? 'teacher' : 'student'),
    school: u.school || null,
    aimag: u.aimag || null,
    sum: u.sum || null,
    phone: u.phone || null,
    completedLessons: u.completed_lessons || [],
    stars_data: u.stars_data || null, streak_data: u.streak_data || null,
    hearts_empty_time: u.hearts_empty_time || null,
    token: token || null
  };
}

async function verifyPassword(input, stored) {
  if (!stored || typeof input !== 'string' || !input) return false;
  // Google-ээр бүртгүүлсэн акаунтын тэмдэглэгээ — нууц үгээр нэвтрэхгүй
  if (stored === 'GOOGLE_OAUTH') return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return await bcrypt.compare(input, stored);
  }
  return safeEqual(input, stored);
}

// users.phone_verified_at / email_unverified / token_version баганыг ашигладаг action-ууд
const USER_COL_ACTIONS = ['register', 'verify', 'resend', 'verifyResetCode', 'reset', 'resetWithCode', 'forgot', 'sendResetCode', 'adminUserPhone', 'adminSetPhone'];

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (secretMissing(res)) return;

  let { action, email, pass, firstName, lastName, grade, newPass, code } = req.body || {};
  // Email-ыг бүхэлд нь normalize — trim + lowercase. Case sensitivity-аас үүсэх
  // "хуучин account-руу нэвтрэхэд шинэ үүсдэг" асуудлыг арилгана.
  if (email) email = String(email).trim().toLowerCase();
  const ip = clientIp(req);

  try {
    if (USER_COL_ACTIONS.indexOf(action) >= 0) await sms.ensureUserColumns();
    if (action === 'login') {
      if (!email) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      if (!(await rateLimit('auth:login:ip:' + ip, 100, 900)) || (await loginLocked(email, ip))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }
      const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) {
        await recordLoginFail(email, ip);
        return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      }
      let u = r.rows[0];
      const isValid = await verifyPassword(pass, u.pass);
      if (!isValid) {
        await recordLoginFail(email, ip);
        return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      }
      if (u.verified === false) {
        return res.status(403).json({ ok: false, error: 'Бүртгэл баталгаажаагүй байна', needVerify: true, email });
      }
      // Хуучин plain text password бол bcrypt-ээр шинэчлэх
      if (!u.pass.startsWith('$2')) {
        const newHash = await bcrypt.hash(pass, BCRYPT_ROUNDS);
        await pool.query('UPDATE users SET pass=$1 WHERE LOWER(email)=LOWER($2)', [newHash, email]);
      }
      // Premium хугацаа дууссан эсэхийг шалгаж free болгох
      u = await ensureExpiryCheck(u);
      const token = signToken(u.email, roleOf(u), u.token_version);
      return res.json({ ok: true, user: userPayload(u, token) });
    }

    if (action === 'register') {
      const { aimag, sum, school, phone, role, inviteToken } = req.body || {};
      // role-ийг зөвхөн student/teacher whitelist; plan үргэлж 'free' (body.plan-ийг үл тооно)
      const safeRole = role === 'teacher' ? 'teacher' : 'student';

      if (!(await rateLimit('auth:reg:ip:' + ip, 30, 3600)) || (email && !(await rateLimit('auth:reg:em:' + email, 5, 3600)))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }

      // Бодит мэйл шалгалт — код илгээхгүйгээр DNS + disposable list
      const emailCheck = await validateEmail(email);
      if (!emailCheck.ok) {
        return res.status(400).json({ ok: false, error: emailCheck.error, code: emailCheck.code });
      }

      // Админ урилгын token — байвал шалгана
      let inviteRow = null;
      if (inviteToken) {
        await ensureInviteTable();
        const ir = await pool.query(
          `SELECT * FROM admin_invites WHERE token=$1 AND (expires_at IS NULL OR expires_at > NOW()) AND uses < max_uses`,
          [inviteToken]
        );
        if (!ir.rows.length) {
          return res.status(400).json({ ok: false, error: 'Урилгын token хүчингүй эсвэл ашиглалт хэтэрсэн байна' });
        }
        inviteRow = ir.rows[0];
      }

      await pool.query(`DELETE FROM users WHERE verified=false AND verify_expiry < NOW()`).catch(() => {});
      const exists = await pool.query('SELECT id, verified FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (exists.rows.length && exists.rows[0].verified !== false) {
        return res.status(400).json({ ok: false, error: 'И-мэйл бүртгэлтэй байна' });
      }
      if (!grade && safeRole !== 'teacher') return res.status(400).json({ ok: false, error: 'Ангиа сонгоно уу' });
      if (!pass || pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });

      // Урилгагүй бүртгэлд утас ЗААВАЛ — баталгаажуулах код зөвхөн SMS-ээр явна.
      // Урилгатай бол заавал биш: хүчинтэй бол нормчилж хадгална, буруу бол хадгалахгүй (ангиар бүртгэлийг хаахгүй;
      // урилгын утас баталгаажаагүй тул нууц үг сэргээлтэд ашиглагдахгүй — usablePhone).
      let smsPhone = null;
      if (!inviteRow) {
        const pn = sms.normalizePhone(phone);
        if (!pn.ok) return sms.failJson(res, sms.mkFail(pn.code));
        smsPhone = pn.local;
      } else {
        const pn = sms.normalizePhone(phone);
        smsPhone = pn.ok ? pn.local : null;
      }
      if (!inviteRow) {
        const pc = await pool.query('SELECT count(*)::int AS n FROM users WHERE phone=$1 AND verified IS NOT FALSE', [smsPhone]);
        if ((Number(pc.rows[0] && pc.rows[0].n) || 0) >= sms.maxAccountsPerPhone()) return sms.failJson(res, sms.mkFail('PHONE_TOO_MANY'));
      }

      // SMS квот — хуучин баталгаажаагүй мөрийг устгахаас ӨМНӨ (cooldown үед өмнөх код хүчинтэй үлдэнэ)
      if (!inviteRow) {
        const pf = await sms.precheck({ ip, email, kind: 'reg' });
        if (pf) return sms.failJson(res, pf, { reg: 'game' });
      }
      if (exists.rows.length) {
        await pool.query('DELETE FROM users WHERE LOWER(email)=LOWER($1) AND verified=false', [email]);
      }

      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      const hashedPass = await bcrypt.hash(pass, BCRYPT_ROUNDS);

      // Багш бол grade-ийг 'teacher' болгох
      const finalGrade = (safeRole === 'teacher') ? 'teacher' : grade;

      // Урилгаар ирсэн бол verified=true шууд, grade/school pre-fill
      const isInvited = !!inviteRow;
      const finalGradeUsed = (isInvited && inviteRow.grade && safeRole !== 'teacher') ? inviteRow.grade : finalGrade;
      const finalSchoolUsed = (isInvited && inviteRow.school && !school) ? inviteRow.school : (school || null);

      await ensureAttemptsColumn();
      // Урилгагүй бол verify_code NULL (кодыг sendCode-ийн store бичнэ), verify_expiry — амжилтгүй мөрийг цэвэрлэхэд.
      // email_unverified=TRUE (урилгатай ч): SMS/урилга имэйлийн эзэмшлийг батлахгүй → Google нэвтрэлт цэвэрлэнэ (S7)
      await pool.query(
        'INSERT INTO users (email,pass,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,verified,verify_code,verify_expiry,aimag,sum,school,phone,role,email_unverified) VALUES (LOWER($1),$2,$3,$4,$5,$6,0,340,5,0,$7,$8,$9,$10,$11,$12,$13,$14,$15,TRUE)',
        [email, hashedPass, firstName, lastName, finalGradeUsed, 'free', 'default',
         isInvited, null, isInvited ? null : codeExpiry,
         aimag||null, sum||null, finalSchoolUsed, smsPhone, safeRole]
      );

      // Урилгаар — SMS/email алгасаж шууд login
      if (isInvited) {
        await pool.query('UPDATE admin_invites SET uses = uses + 1 WHERE token=$1', [inviteToken]).catch(()=>{});
        const r2 = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
        const u = r2.rows[0];
        const isT2 = u.role === 'teacher' || u.grade === 'teacher';
        const msg = `✅ <b>Шинэ хэрэглэгч (Урилгаар)</b>\n\n👤 ${(u.last_name||'')} ${(u.first_name||'')}\n📧 ${email}\n${isT2 ? '👨‍🏫 Багш' : '🎓 ' + u.grade + '-р анги'}${u.school ? '\n🏫 ' + u.school : ''}\n🎫 ${inviteToken.slice(0, 8)}…`;
        sendTelegramNotification(msg).catch(()=>{});
        const token = signToken(u.email, roleOf(u), u.token_version);
        return res.json({ ok: true, invited: true, user: userPayload({ ...u, verified: true }, token) });
      }

      // Ердийн бүртгэл — баталгаажуулах код ЗӨВХӨН SMS-ээр (имэйл илгээхгүй)
      const sent = await sms.sendCode({
        purpose: 'verify', kind: 'reg', phone: smsPhone, email, ip,
        store: userCodeStore(email, false), drop: userCodeDrop(email),
      });
      if (sent.ok) return res.json({ ok: true, needVerify: true, email, sms: true, masked: sent.masked2 });
      if (sent.code === 'SMS_UNCERTAIN') {
        // textbee хүлээн авсан байж магадгүй — мөр ба код үлдэнэ, клиент код оруулах алхам руу шилжинэ
        return sms.failJson(res, sent, { reg: 'game', fields: { needVerify: true, email, sms: true, masked: sms.maskPhone(smsPhone, 2) } });
      }
      await pool.query('DELETE FROM users WHERE LOWER(email)=LOWER($1) AND verified=false', [email])
        .catch(function (e) { sms.logErr('[auth] reg cleanup', e); });
      return sms.failJson(res, sent, { reg: 'game' });
    }

    // Код шалгадаг action-уудад IP-ийн нийт хязгаар (олон имэйл дээр тараан таах)
    if (action === 'verify' || action === 'verifyResetCode' || action === 'reset' || action === 'resetWithCode') {
      if (!(await rateLimit('auth:code:ip:' + ip, 60, 900))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }
      // Имэйл тутамд өдөрт нийт 30 код шалгалт — шинэ код авч оролдлогыг тэглэж таахыг хязгаарлана
      // (админ JWT-ийн кодгүй reset-д хамаарахгүй)
      if (email && !(action === 'reset' && !code && requireAdmin(req)) && !(await rateLimit('auth:code:em:day:' + email, 30, 86400))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }
    }

    if (action === 'verify') {
      const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      // Олдоогүй = буруу кодтой ижил (enumeration)
      if (!r.rows.length) return res.status(400).json({ ok: false, error: BAD_CODE_MSG });
      const u = r.rows[0];
      if (u.verified) return res.json({ ok: true, alreadyVerified: true });
      if (!code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      const st = await checkCode(email, code);
      if (st !== 'ok') return codeError(res, st);
      // SMS код утсыг баталсан ч имэйлийг батлахгүй: email_unverified=TRUE ҮРГЭЛЖ (SMS-ээс өмнөх unverified мөр ч, H9/S7)
      await pool.query('UPDATE users SET verified=true, verify_code=NULL, verify_expiry=NULL, phone_verified_at=NOW(), email_unverified=TRUE WHERE LOWER(email)=LOWER($1)', [email]);
      await sms.markVerified(u.phone);
      const isT = u.role === 'teacher' || u.grade === 'teacher';
      const msg = `✅ <b>Шинэ хэрэглэгч баталгаажлаа (SMS)</b>\n\n👤 ${(u.last_name||'')} ${(u.first_name||'')}\n📧 ${email}\n${isT ? '👨‍🏫 Багш (имэйл баталгаажаагүй)' : '🎓 ' + u.grade + '-р анги'}${u.school ? '\n🏫 ' + u.school : ''}`;
      sendTelegramNotification(msg).catch(()=>{});
      const token = signToken(u.email, roleOf(u), u.token_version);
      return res.json({ ok: true, user: userPayload({ ...u, verified: true }, token) });
    }

    if (action === 'resend') {
      if (!email) return res.status(400).json({ ok: false, error: 'Зөв и-мэйл оруулна уу' });
      if (!(await rateLimit('auth:resend:ip:' + ip, 30, 3600)) || !(await rateLimit('auth:resend:em:' + email, 3, 600))
          || !(await rateLimit('auth:resend:em:day:' + email, 10, 86400))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }
      const t0 = Date.now();
      const r = await pool.query('SELECT verified, phone FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      // Баталгаажсан данс SMS квот зарцуулахгүй (SMS унтарсан үед ч production-той ижил хариу)
      if (r.rows.length && r.rows[0].verified) return res.json({ ok: true, alreadyVerified: true });
      const pf = await sms.precheck({ ip, email, kind: 'reg' });
      if (pf) return sms.failJson(res, pf, { reg: 'game' });
      const pn = r.rows.length ? sms.normalizePhone(r.rows[0].phone) : { ok: false };
      if (!pn.ok) {
        // Олдоогүй / утас хүчингүй → бодит илгээлттэй ижил хэлбэр (enumeration)
        await sms.padTo(t0);
        return res.json(smsAccepted(sms.fakeMask(email)));
      }
      await ensureAttemptsColumn();
      const sent = await sms.sendCode({
        purpose: 'verify', kind: 'reg', phone: pn.local, email, ip,
        store: userCodeStore(email, false), drop: userCodeDrop(email),
      });
      if (sent.ok) return res.json(smsAccepted(sent.masked2));
      if (sent.phoneQuota) { await sms.padTo(t0); return res.json(smsAccepted(sms.fakeMask(email))); }
      return sms.failJson(res, sent, { reg: 'game' });
    }

    if (action === 'verifyResetCode') {
      // Forgot password flow — кодыг л шалгана (нууц үг шинэчилэхгүй).
      // Олдоогүй / баталгаажаагүй мөр = буруу код (бүртгэлийн кодоор нууц үг сэргээхгүй)
      const r = await pool.query('SELECT phone, verified FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length || r.rows[0].verified === false) return res.status(400).json({ ok: false, error: BAD_CODE_MSG });
      if (!code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      const st = await checkCode(email, code);
      if (st !== 'ok') return codeError(res, st);
      await sms.markVerified(r.rows[0].phone);
      return res.json({ ok: true });
    }

    if (action === 'reset' || action === 'resetWithCode') {
      // Нууц үг шинэчлэх — код ЗААВАЛ (verify_code таарах + хугацаа).
      // Зөвхөн админ JWT (admin.html) кодгүйгээр шинэчилж болно.
      const isAdmin = action === 'reset' && requireAdmin(req);
      if (!isAdmin && !code) return res.status(400).json({ ok: false, error: 'Баталгаажуулах код шаардлагатай' });
      if (!newPass || newPass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт' });
      const r = await pool.query('SELECT phone, verified, role, grade FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (isAdmin && !r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      if (!isAdmin && (!r.rows.length || r.rows[0].verified === false)) return res.status(400).json({ ok: false, error: BAD_CODE_MSG });
      if (!isAdmin) {
        const st = await checkCode(email, code);
        if (st !== 'ok') return codeError(res, st);
      }
      const hashedPass = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
      // token_version+1 → бусад төхөөрөмжийн (халдагчийн) хуучин JWT хүчингүй
      if (isAdmin) {
        await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL, token_version=COALESCE(token_version,0)+1 WHERE LOWER(email)=LOWER($2)', [hashedPass, email]);
      } else {
        // Код usablePhone руу очсон тул тэр утас батлагдсан
        await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL, phone_verified_at=COALESCE(phone_verified_at, NOW()), token_version=COALESCE(token_version,0)+1 WHERE LOWER(email)=LOWER($2)', [hashedPass, email]);
        await sms.markVerified(r.rows[0].phone);
        const u = r.rows[0];
        if (u.role === 'teacher' || u.grade === 'teacher') {
          tg.sendTelegram('Багшийн нууц үг SMS-ээр сэргээгдлээ: ' + sms.maskEmail(email)).catch(() => {});
        }
      }
      return res.json({ ok: true });
    }

    if (action === 'forgot' || action === 'sendResetCode') {
      // Forgot password — код ЗӨВХӨН дансны итгэмжлэгдсэн утас руу SMS-ээр (usablePhone)
      if (!email) return res.status(400).json({ ok: false, error: 'Зөв и-мэйл оруулна уу' });
      if (!(await rateLimit('auth:forgot:ip:' + ip, 20, 3600)) || !(await rateLimit('auth:forgot:em:' + email, 3, 900))
          || !(await rateLimit('auth:forgot:em:day:' + email, 10, 86400))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }
      const t0 = Date.now();
      // SMS квот данс хайхаас ӨМНӨ — бүртгэлтэй эсэхээс үл хамааран ижил тоологдоно
      const pf = await sms.precheck({ ip, email, kind: 'acct' });
      if (pf) return sms.failJson(res, pf);
      const r = await pool.query('SELECT phone, phone_verified_at, email_unverified FROM users WHERE LOWER(email)=LOWER($1) AND verified IS NOT FALSE', [email]);
      const dest = r.rows.length ? usablePhone(r.rows[0]) : null;
      if (!dest) {
        // Олдоогүй / ашиглах утасгүй → хэрэглэгч байгаа эсэхийг хэлэхгүй: бодит илгээлттэй ижил хэлбэр, ойролцоо хугацаа
        await sms.padTo(t0);
        return res.json(smsAccepted(sms.fakeMask(email)));
      }
      await ensureAttemptsColumn();
      const sent = await sms.sendCode({
        purpose: 'reset', kind: 'acct', phone: dest, email, ip,
        store: userCodeStore(email, true), drop: userCodeDrop(email),
      });
      if (sent.ok) return res.json(smsAccepted(sent.masked2));
      if (sent.phoneQuota) {
        // Дугаарын cooldown/өдрийн квот: өмнөх код хүчинтэй хэвээр; бүртгэлгүй имэйлийн хариутай ижил хэлбэр (спек S1 үл хамаарах)
        await sms.padTo(t0);
        return res.json(smsAccepted(sms.maskPhone(dest, 2)));
      }
      return sms.failJson(res, sent);
    }

    // ═══ АДМИН: хэрэглэгчийн утас (SMS) ба SMS төлөв ═══
    if (action === 'adminUserPhone' || action === 'adminSetPhone' || action === 'smsStatus'
        || action === 'smsPause' || action === 'smsResume' || action === 'smsDevice') {
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      if (action === 'smsStatus') return res.json({ ok: true, status: await sms.status() });
      if (action === 'smsDevice') return res.json({ ok: true, device: await sms.deviceStatus() });
      if (action === 'smsPause') {
        const min = parseInt((req.body || {}).minutes, 10);
        if (!(min >= 1 && min <= 1440)) return res.status(400).json({ ok: false, error: 'minutes 1..1440' });
        const until = Math.floor(Date.now() / 1000) + min * 60;
        await sms.setPause(until);
        tg.sendTelegram('SMS түр зогсоов: ' + min + ' минут (админ)').catch(() => {});
        return res.json({ ok: true, paused_until: until });
      }
      if (action === 'smsResume') {
        await sms.setPause(null);
        tg.sendTelegram('SMS дахин асаав (админ)').catch(() => {});
        return res.json({ ok: true });
      }
      if (!email) return res.status(400).json({ ok: false, error: 'email заавал' });
      if (action === 'adminUserPhone') {
        const r = await pool.query('SELECT email, phone, phone_verified_at, verified, pass, email_unverified FROM users WHERE LOWER(email)=LOWER($1)', [email]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
        const u = r.rows[0];
        return res.json({ ok: true, email: u.email, phone: u.phone || null, phone_verified_at: u.phone_verified_at || null,
          verified: u.verified !== false, google: u.pass === 'GOOGLE_OAUTH', email_unverified: u.email_unverified === true,
          usable: !!usablePhone(u) });
      }
      // adminSetPhone: админ хэрэглэгчтэй ТЭР дугаараар ярьж баталгаажуулсны дараа (runbook §8). null/'' → арилгана
      const raw = (req.body || {}).phone;
      let local = null;
      if (!(raw == null || String(raw).trim() === '')) {
        const pn = sms.normalizePhone(raw);
        if (!pn.ok) return sms.failJson(res, sms.mkFail(pn.code));
        local = pn.local;
      }
      const up = await pool.query(
        // $3 тусдаа boolean: phone VARCHAR бол $2-г text болгож cast хийхэд 42P08 (inconsistent types) өгөхөөс сэргийлнэ
        'UPDATE users SET phone=$2, phone_verified_at=(CASE WHEN $3::boolean THEN NOW() ELSE NULL END), verify_code=NULL, verify_expiry=NULL, token_version=COALESCE(token_version,0)+1 WHERE LOWER(email)=LOWER($1) RETURNING email',
        [email, local, local != null]
      );
      if (!up.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      tg.sendTelegram('Админ утас тохируулав: ' + sms.maskEmail(email) + ' → ' + (local ? sms.maskPhone(local, 2) : '(арилгав)')).catch(() => {});
      return res.json({ ok: true, email: up.rows[0].email, phone: local });
    }

    // ═══ АДМИН УРИЛГА ═══
    if (action === 'createInvite') {
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ үүсгэнэ' });
      await ensureInviteTable();
      const { grade: g, school: sch, maxUses, expiresInDays, note } = req.body || {};
      const token = randomToken(10);
      const maxU = Math.max(1, parseInt(maxUses) || 1);
      const days = parseInt(expiresInDays);
      const expiresAt = (days > 0) ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;
      await pool.query(
        `INSERT INTO admin_invites (token, created_by, grade, school, max_uses, expires_at, note) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [token, 'admin', g || null, sch || null, maxU, expiresAt, note || null]
      );
      return res.json({ ok: true, token, grade: g || null, school: sch || null, maxUses: maxU, expiresAt, note: note || null });
    }

    if (action === 'getInvite') {
      const t = (req.body && req.body.token) || (req.query && req.query.token);
      if (!t) return res.status(400).json({ ok: false, error: 'token заавал' });
      await ensureInviteTable();
      const r = await pool.query(
        `SELECT token, grade, school, max_uses, uses, expires_at, note FROM admin_invites WHERE token=$1`,
        [t]
      );
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Урилга олдсонгүй' });
      const inv = r.rows[0];
      if (inv.expires_at && new Date(inv.expires_at) < new Date()) {
        return res.status(400).json({ ok: false, error: 'Урилгын хугацаа дууссан' });
      }
      if (inv.uses >= inv.max_uses) {
        return res.status(400).json({ ok: false, error: 'Урилгын ашиглалт хэтэрсэн' });
      }
      return res.json({ ok: true, invite: {
        token: inv.token, grade: inv.grade, school: inv.school,
        remaining: inv.max_uses - inv.uses, expires_at: inv.expires_at, note: inv.note,
      }});
    }

    if (action === 'listInvites') {
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      await ensureInviteTable();
      const r = await pool.query(
        `SELECT token, grade, school, max_uses, uses, expires_at, note, created_at FROM admin_invites ORDER BY created_at DESC LIMIT 200`
      );
      return res.json({ ok: true, invites: r.rows });
    }

    if (action === 'deleteInvite') {
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      const t = req.body && req.body.token;
      if (!t) return res.status(400).json({ ok: false, error: 'token заавал' });
      await pool.query(`DELETE FROM admin_invites WHERE token=$1`, [t]);
      return res.json({ ok: true });
    }

    if (action === 'adminLogin') {
      // Админ нэвтрэх — IP тус бүр 15 минутад 5 оролдлого
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
      if (!ADMIN_PASSWORD) return res.status(500).json({ ok: false, error: 'Админ password тохируулагдаагүй' });
      if (!(await rateLimit('auth:admin:ip:' + ip, 5, 900))) {
        return res.status(429).json({ ok: false, error: TOO_MANY });
      }
      // Тогтмол урттай hash-ийг timingSafeEqual-аар харьцуулна (урт задрахгүй)
      const ha = crypto.createHash('sha256').update(String(pass == null ? '' : pass)).digest();
      const hb = crypto.createHash('sha256').update(String(ADMIN_PASSWORD)).digest();
      if (!crypto.timingSafeEqual(ha, hb)) {
        return res.status(401).json({ ok: false, error: 'Буруу нууц үг' });
      }
      const token = jwt.sign({ admin: true }, jwtSecret(), { expiresIn: '7d' });
      return res.json({ ok: true, token });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    sms.logErr('[auth]', e);
    return res.status(500).json({ ok: false, error: 'Серверийн алдаа' });
  }
};
