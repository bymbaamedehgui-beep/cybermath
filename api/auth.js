const pool = require('./_db');
const { sendVerifyEmail } = require('./_email');
const { validateEmail } = require('./_email_validate');
const { ensureExpiryCheck } = require('./_premium');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';
const BCRYPT_ROUNDS = 10;

function signToken(email, role) {
  return jwt.sign({ email: email, role: role }, JWT_SECRET, { expiresIn: '7d' });
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

function requireAdminAuth(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(auth.slice(7), JWT_SECRET);
    if (decoded && decoded.admin) return decoded;
    return null;
  } catch (e) { return null; }
}

function randomToken(len) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 0, O, I, 1 хассан
  let out = '';
  for (let i = 0; i < (len || 10); i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

// Идэвхтэй урамшууллын код — баталгаажуулах имэйлд хавсаргах (хугацаа/ашиглалт хүчинтэй)
function promoRewardText(p) {
  const a = p.reward_amount;
  if (p.reward_type === 'premium') return 'Premium ' + (a || 30) + ' хоног';
  if (p.reward_type === 'gems') return a + ' зоос';
  if (p.reward_type === 'xp') return a + ' XP';
  if (p.reward_type === 'hearts') return a + ' зүрх';
  return p.description || 'Урамшуулал';
}
async function getActivePromo() {
  try {
    const r = await pool.query(
      `SELECT code, reward_type, reward_amount, description FROM promo_codes
       WHERE (expires_at IS NULL OR expires_at > NOW())
         AND (max_uses IS NULL OR used_count < max_uses)
       ORDER BY created_at DESC LIMIT 1`
    );
    if (!r.rows.length) return null;
    const p = r.rows[0];
    return { code: p.code, reward: (p.description || promoRewardText(p)) };
  } catch (e) { return null; } // promo_codes хүснэгт үүсээгүй бол чимээгүй алгасна
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
  if (!stored) return false;
  if (stored.startsWith('$2a$') || stored.startsWith('$2b$') || stored.startsWith('$2y$')) {
    return await bcrypt.compare(input, stored);
  }
  return input === stored;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let { action, email, pass, firstName, lastName, grade, plan, newPass, code } = req.body || {};
  // Email-ыг бүхэлд нь normalize — trim + lowercase. Case sensitivity-аас үүсэх
  // "хуучин account-руу нэвтрэхэд шинэ үүсдэг" асуудлыг арилгана.
  if (email) email = String(email).trim().toLowerCase();

  try {
    if (action === 'login') {
      const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      let u = r.rows[0];
      const isValid = await verifyPassword(pass, u.pass);
      if (!isValid) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      if (u.verified === false) {
        return res.status(403).json({ ok: false, error: 'И-мэйл баталгаажаагүй байна', needVerify: true, email });
      }
      // Хуучин plain text password бол bcrypt-ээр шинэчлэх
      if (!u.pass.startsWith('$2')) {
        const newHash = await bcrypt.hash(pass, BCRYPT_ROUNDS);
        await pool.query('UPDATE users SET pass=$1 WHERE LOWER(email)=LOWER($2)', [newHash, email]);
      }
      // Premium хугацаа дууссан эсэхийг шалгаж free болгох
      u = await ensureExpiryCheck(u);
      const token = signToken(u.email, u.role || (u.grade === 'teacher' ? 'teacher' : 'student'));
      return res.json({ ok: true, user: userPayload(u, token) });
    }

    if (action === 'register') {
      const { aimag, sum, school, phone, role, inviteToken } = req.body || {};

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
      if (exists.rows.length) {
        if (exists.rows[0].verified === false) {
          await pool.query('DELETE FROM users WHERE LOWER(email)=LOWER($1) AND verified=false', [email]);
        } else {
          return res.status(400).json({ ok: false, error: 'И-мэйл бүртгэлтэй байна' });
        }
      }
      if (!grade && role !== 'teacher') return res.status(400).json({ ok: false, error: 'Ангиа сонгоно уу' });
      if (!pass || pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });

      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      const hashedPass = await bcrypt.hash(pass, BCRYPT_ROUNDS);

      // Багш бол grade-ийг 'teacher' болгох
      const finalGrade = (role === 'teacher') ? 'teacher' : grade;

      // Урилгаар ирсэн бол verified=true шууд, grade/school pre-fill
      const isInvited = !!inviteRow;
      const finalGradeUsed = (isInvited && inviteRow.grade && role !== 'teacher') ? inviteRow.grade : finalGrade;
      const finalSchoolUsed = (isInvited && inviteRow.school && !school) ? inviteRow.school : (school || null);

      await pool.query(
        'INSERT INTO users (email,pass,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,verified,verify_code,verify_expiry,aimag,sum,school,phone,role) VALUES (LOWER($1),$2,$3,$4,$5,$6,0,340,5,0,$7,$8,$9,$10,$11,$12,$13,$14,$15)',
        [email, hashedPass, firstName, lastName, finalGradeUsed, plan || 'free', 'default',
         isInvited, isInvited ? null : verifyCode, isInvited ? null : codeExpiry,
         aimag||null, sum||null, finalSchoolUsed, phone||null, role || 'student']
      );

      // Урилгаар — SMS/email алгасаж шууд login
      if (isInvited) {
        await pool.query('UPDATE admin_invites SET uses = uses + 1 WHERE token=$1', [inviteToken]).catch(()=>{});
        const r2 = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
        const u = r2.rows[0];
        const isT2 = u.role === 'teacher' || u.grade === 'teacher';
        const msg = `✅ <b>Шинэ хэрэглэгч (Урилгаар)</b>\n\n👤 ${(u.last_name||'')} ${(u.first_name||'')}\n📧 ${email}\n${isT2 ? '👨‍🏫 Багш' : '🎓 ' + u.grade + '-р анги'}${u.school ? '\n🏫 ' + u.school : ''}\n🎫 ${inviteToken.slice(0, 8)}…`;
        sendTelegramNotification(msg).catch(()=>{});
        const token = signToken(u.email, u.role || (u.grade === 'teacher' ? 'teacher' : 'student'));
        return res.json({ ok: true, invited: true, user: userPayload({ ...u, verified: true }, token) });
      }

      // Ердийн бүртгэл — verify code + урамшууллын код хамт илгээх
      const promo = await getActivePromo();
      await sendVerifyEmail(email, verifyCode, firstName, promo);
      return res.json({ ok: true, needVerify: true, email });
    }

    if (action === 'verify') {
      const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      if (u.verified) return res.json({ ok: true, alreadyVerified: true });
      if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      await pool.query('UPDATE users SET verified=true, verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($1)', [email]);
      const isT = u.role === 'teacher' || u.grade === 'teacher';
      const msg = `✅ <b>Шинэ хэрэглэгч баталгаажлаа</b>\n\n👤 ${(u.last_name||'')} ${(u.first_name||'')}\n📧 ${email}\n${isT ? '👨‍🏫 Багш' : '🎓 ' + u.grade + '-р анги'}${u.school ? '\n🏫 ' + u.school : ''}`;
      sendTelegramNotification(msg).catch(()=>{});
      const token = signToken(u.email, u.role || (u.grade === 'teacher' ? 'teacher' : 'student'));
      return res.json({ ok: true, user: userPayload({ ...u, verified: true }, token) });
    }

    if (action === 'resend') {
      const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false });
      if (r.rows[0].verified) return res.json({ ok: true, alreadyVerified: true });
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET verify_code=$1, verify_expiry=$2 WHERE LOWER(email)=LOWER($3)', [verifyCode, codeExpiry, email]);
      const promoR = await getActivePromo();
      await sendVerifyEmail(email, verifyCode, r.rows[0].first_name, promoR);
      return res.json({ ok: true });
    }

    if (action === 'verifyResetCode') {
      // Forgot password flow — кодыг л шалгана (нууц үг шинэчилэхгүй)
      const r = await pool.query('SELECT verify_code, verify_expiry FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      return res.json({ ok: true });
    }

    if (action === 'reset') {
      // Код шалгаад л нууц үг шинэчлэх
      if (!newPass || newPass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт' });
      const r = await pool.query('SELECT verify_code, verify_expiry FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      // Хэрэв код илгээсэн бол шалгана. Verify хийгдсэн талаар trust хийе.
      if (code) {
        if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
        if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      }
      const hashedPass = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
      await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($2)', [hashedPass, email]);
      return res.json({ ok: true });
    }

    if (action === 'forgot' || action === 'sendResetCode') {
      // Forgot password — code илгээх
      const r = await pool.query('SELECT first_name FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) {
        // Аюулгүйн үүднээс хэрэглэгч байгаа эсэхийг хэлэхгүй
        return res.json({ ok: true });
      }
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET verify_code=$1, verify_expiry=$2 WHERE LOWER(email)=LOWER($3)', [verifyCode, codeExpiry, email]);
      await sendVerifyEmail(email, verifyCode, r.rows[0].first_name);
      return res.json({ ok: true });
    }

    if (action === 'resetWithCode') {
      // Forgot password flow — code-оор баталгаажуулж password шинэчлэх
      const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу' });
      if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      if (!newPass || newPass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт' });
      const hashedPass = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
      await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL WHERE LOWER(email)=LOWER($2)', [hashedPass, email]);
      return res.json({ ok: true });
    }

    // ═══ АДМИН УРИЛГА ═══
    if (action === 'createInvite') {
      const admin = requireAdminAuth(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Зөвхөн админ үүсгэнэ' });
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
      const admin = requireAdminAuth(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      await ensureInviteTable();
      const r = await pool.query(
        `SELECT token, grade, school, max_uses, uses, expires_at, note, created_at FROM admin_invites ORDER BY created_at DESC LIMIT 200`
      );
      return res.json({ ok: true, invites: r.rows });
    }

    if (action === 'deleteInvite') {
      const admin = requireAdminAuth(req);
      if (!admin) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      const t = req.body && req.body.token;
      if (!t) return res.status(400).json({ ok: false, error: 'token заавал' });
      await pool.query(`DELETE FROM admin_invites WHERE token=$1`, [t]);
      return res.json({ ok: true });
    }

    if (action === 'adminLogin') {
      // Админ нэвтрэх
      const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
      if (!ADMIN_PASSWORD) return res.status(500).json({ ok: false, error: 'Админ password тохируулагдаагүй' });
      if (pass !== ADMIN_PASSWORD) {
        // Diagnostic — яагаад таарахгүй байгааг шалгахад туслах
        return res.status(401).json({
          ok: false,
          error: 'Буруу нууц үг',
          debug: {
            inputLength: (pass || '').length,
            envLength: ADMIN_PASSWORD.length,
            inputFirstChar: (pass || '').charCodeAt(0),
            envFirstChar: ADMIN_PASSWORD.charCodeAt(0)
          }
        });
      }
      const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '30d' });
      return res.json({ ok: true, token });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('Auth error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
