const pool = require('./_db');
const { sendVerifyEmail } = require('./_email');
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

function userPayload(u, token) {
  return {
    email: u.email, firstName: u.first_name, lastName: u.last_name,
    grade: u.grade, plan: u.plan, xp: u.xp || 0, gems: u.gems || 340,
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

  const { action, email, pass, firstName, lastName, grade, plan, newPass, code } = req.body || {};

  try {
    if (action === 'login') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      const u = r.rows[0];
      const isValid = await verifyPassword(pass, u.pass);
      if (!isValid) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      if (u.verified === false) {
        return res.status(403).json({ ok: false, error: 'И-мэйл баталгаажаагүй байна', needVerify: true, email });
      }
      // Хуучин plain text password бол bcrypt-ээр шинэчлэх
      if (!u.pass.startsWith('$2')) {
        const newHash = await bcrypt.hash(pass, BCRYPT_ROUNDS);
        await pool.query('UPDATE users SET pass=$1 WHERE email=$2', [newHash, email]);
      }
      const token = signToken(u.email, u.role || (u.grade === 'teacher' ? 'teacher' : 'student'));
      return res.json({ ok: true, user: userPayload(u, token) });
    }

    if (action === 'register') {
      const { aimag, sum, school, phone, role } = req.body || {};
      await pool.query(`DELETE FROM users WHERE verified=false AND verify_expiry < NOW()`).catch(() => {});
      const exists = await pool.query('SELECT id, verified FROM users WHERE email=$1', [email]);
      if (exists.rows.length) {
        if (exists.rows[0].verified === false) {
          await pool.query('DELETE FROM users WHERE email=$1 AND verified=false', [email]);
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

      await pool.query(
        'INSERT INTO users (email,pass,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,verified,verify_code,verify_expiry,aimag,sum,school,phone,role) VALUES ($1,$2,$3,$4,$5,$6,0,340,5,0,$7,false,$8,$9,$10,$11,$12,$13,$14)',
        [email, hashedPass, firstName, lastName, finalGrade, plan || 'free', 'default', verifyCode, codeExpiry, aimag||null, sum||null, school||null, phone||null, role || 'student']
      );
      await sendVerifyEmail(email, verifyCode, firstName);
      return res.json({ ok: true, needVerify: true, email });
    }

    if (action === 'verify') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      if (u.verified) return res.json({ ok: true, alreadyVerified: true });
      if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      await pool.query('UPDATE users SET verified=true, verify_code=NULL, verify_expiry=NULL WHERE email=$1', [email]);
      const isT = u.role === 'teacher' || u.grade === 'teacher';
      const msg = `✅ <b>Шинэ хэрэглэгч баталгаажлаа</b>\n\n👤 ${(u.last_name||'')} ${(u.first_name||'')}\n📧 ${email}\n${isT ? '👨‍🏫 Багш' : '🎓 ' + u.grade + '-р анги'}${u.school ? '\n🏫 ' + u.school : ''}`;
      sendTelegramNotification(msg).catch(()=>{});
      const token = signToken(u.email, u.role || (u.grade === 'teacher' ? 'teacher' : 'student'));
      return res.json({ ok: true, user: userPayload({ ...u, verified: true }, token) });
    }

    if (action === 'resend') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false });
      if (r.rows[0].verified) return res.json({ ok: true, alreadyVerified: true });
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET verify_code=$1, verify_expiry=$2 WHERE email=$3', [verifyCode, codeExpiry, email]);
      await sendVerifyEmail(email, verifyCode, r.rows[0].first_name);
      return res.json({ ok: true });
    }

    if (action === 'verifyResetCode') {
      // Forgot password flow — кодыг л шалгана (нууц үг шинэчилэхгүй)
      const r = await pool.query('SELECT verify_code, verify_expiry FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      return res.json({ ok: true });
    }

    if (action === 'reset') {
      // Код шалгаад л нууц үг шинэчлэх
      if (!newPass || newPass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт' });
      const r = await pool.query('SELECT verify_code, verify_expiry FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      // Хэрэв код илгээсэн бол шалгана. Verify хийгдсэн талаар trust хийе.
      if (code) {
        if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
        if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      }
      const hashedPass = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
      await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL WHERE email=$2', [hashedPass, email]);
      return res.json({ ok: true });
    }

    if (action === 'forgot' || action === 'sendResetCode') {
      // Forgot password — code илгээх
      const r = await pool.query('SELECT first_name FROM users WHERE email=$1', [email]);
      if (!r.rows.length) {
        // Аюулгүйн үүднээс хэрэглэгч байгаа эсэхийг хэлэхгүй
        return res.json({ ok: true });
      }
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET verify_code=$1, verify_expiry=$2 WHERE email=$3', [verifyCode, codeExpiry, email]);
      await sendVerifyEmail(email, verifyCode, r.rows[0].first_name);
      return res.json({ ok: true });
    }

    if (action === 'resetWithCode') {
      // Forgot password flow — code-оор баталгаажуулж password шинэчлэх
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const u = r.rows[0];
      if (u.verify_code !== code) return res.status(400).json({ ok: false, error: 'Код буруу' });
      if (new Date(u.verify_expiry) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
      if (!newPass || newPass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт' });
      const hashedPass = await bcrypt.hash(newPass, BCRYPT_ROUNDS);
      await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL WHERE email=$2', [hashedPass, email]);
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
      const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: '24h' });
      return res.json({ ok: true, token });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    console.error('Auth error:', e);
    return res.status(500).json({ ok: false, error: e.message });
  }
};
