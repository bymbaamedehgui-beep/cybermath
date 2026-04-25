const pool = require('./_db');
const { sendVerifyEmail } = require('./_email');

function userPayload(u) {
  return {
    email: u.email, firstName: u.first_name, lastName: u.last_name,
    grade: u.grade, plan: u.plan, xp: u.xp || 0, gems: u.gems || 340,
    hearts: u.hearts == null ? 5 : u.hearts, streak: u.streak || 0,
    avatar: u.avatar || 'default',
    profile_image: u.profile_image || null,
    current_node_id: u.current_node_id || null,
    lesson_progress: u.lesson_progress || null,
    role: u.role || (u.grade === 'teacher' ? 'teacher' : 'student'),
    completedLessons: u.completed_lessons || [],
    stars_data: u.stars_data || null, streak_data: u.streak_data || null,
    hearts_empty_time: u.hearts_empty_time || null
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, pass, firstName, lastName, grade, plan, newPass, code } = req.body || {};

  try {
    if (action === 'login') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1 AND pass=$2', [email, pass]);
      if (!r.rows.length) return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      const u = r.rows[0];
      if (u.verified === false) {
        return res.status(401).json({ ok: false, error: 'Имэйлээ баталгаажуулна уу', needVerify: true, email });
      }
      const crypto = require('crypto');
      const sessionToken = crypto.randomBytes(32).toString('hex');
      let tokens = [];
      try { tokens = JSON.parse(u.session_token || '[]'); } catch(e) { tokens = u.session_token ? [u.session_token] : []; }
      tokens.push(sessionToken);
      if (tokens.length > 10) tokens = tokens.slice(-10);
      await pool.query('UPDATE users SET session_token=$1 WHERE email=$2', [JSON.stringify(tokens), email]);
      return res.json({ ok: true, sessionToken, user: userPayload(u) });
    }

    if (action === 'verifySession') {
      const { sessionToken } = req.body || {};
      if (!sessionToken || !email) return res.json({ ok: false, error: 'Invalid' });
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.json({ ok: false, error: 'Session хүчингүй', expired: true });
      const u2 = r.rows[0];
      let tokens2 = [];
      try { tokens2 = JSON.parse(u2.session_token || '[]'); } catch(e) { tokens2 = u2.session_token ? [u2.session_token] : []; }
      if (!tokens2.includes(sessionToken)) return res.json({ ok: false, error: 'Session хүчингүй — дахин нэвтэрнэ үү', expired: true });
      return res.json({ ok: true, user: userPayload(u2) });
    }

    if (action === 'logout') {
      const { sessionToken } = req.body || {};
      const rl = await pool.query('SELECT session_token FROM users WHERE email=$1', [email]);
      if (rl.rows.length) {
        let toks = [];
        try { toks = JSON.parse(rl.rows[0].session_token || '[]'); } catch(e) { toks = []; }
        toks = toks.filter(t => t !== sessionToken);
        await pool.query('UPDATE users SET session_token=$1 WHERE email=$2', [JSON.stringify(toks), email]);
      }
      return res.json({ ok: true });
    }

    if (action === 'register') {
      const { aimag, sum, school, phone, role } = req.body || {};
      const exists = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
      if (exists.rows.length) return res.status(400).json({ ok: false, error: 'И-мэйл бүртгэлтэй байна' });
      if (!grade) return res.status(400).json({ ok: false, error: 'Ангиа сонгоно уу' });
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query(
        'INSERT INTO users (email,pass,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,verified,verify_code,verify_expiry,aimag,sum,school,phone,role) VALUES ($1,$2,$3,$4,$5,$6,0,340,5,0,$7,false,$8,$9,$10,$11,$12,$13,$14)',
        [email, pass, firstName, lastName, grade, plan || 'free', 'default', verifyCode, codeExpiry, aimag||null, sum||null, school||null, phone||null, role || 'student']
      );
      await sendVerifyEmail(email, verifyCode, firstName);
      return res.json({ ok: true, needVerify: true, email });
    }

    if (action === 'verify') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1 AND verify_code=$2', [email, code]);
      if (!r.rows.length) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
      const u = r.rows[0];
      if (new Date() > new Date(u.verify_expiry)) {
        return res.status(400).json({ ok: false, error: 'Кодны хугацаа дууссан' });
      }
      await pool.query('UPDATE users SET verified=true, verify_code=NULL, verify_expiry=NULL WHERE email=$1', [email]);
      return res.json({ ok: true, user: userPayload(u) });
    }

    if (action === 'resend') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      const verifyCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET verify_code=$1, verify_expiry=$2 WHERE email=$3', [verifyCode, codeExpiry, email]);
      await sendVerifyEmail(email, verifyCode, r.rows[0].first_name);
      return res.json({ ok: true });
    }

    if (action === 'sendResetCode') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.json({ ok: false, error: 'Энэ и-мэйлтэй бүртгэл олдсонгүй' });
      const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
      const codeExpiry = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query('UPDATE users SET verify_code=$1, verify_expiry=$2 WHERE email=$3', [resetCode, codeExpiry, email]);
      await sendVerifyEmail(email, resetCode, r.rows[0].first_name, true);
      return res.json({ ok: true });
    }

    if (action === 'verifyResetCode') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1 AND verify_code=$2', [email, code]);
      if (!r.rows.length) return res.json({ ok: false, error: 'Код буруу байна' });
      if (new Date() > new Date(r.rows[0].verify_expiry)) return res.json({ ok: false, error: 'Кодны хугацаа дууссан' });
      return res.json({ ok: true });
    }

    if (action === 'reset') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1 AND verify_code=$2', [email, code]);
      if (!r.rows.length) return res.json({ ok: false, error: 'Код буруу байна' });
      await pool.query('UPDATE users SET pass=$1, verify_code=NULL, verify_expiry=NULL WHERE email=$2', [newPass, email]);
      return res.json({ ok: true });
    }

    if (action === 'getuser') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'User not found' });
      return res.json({ ok: true, user: userPayload(r.rows[0]) });
    }

    res.status(400).json({ ok: false, error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
