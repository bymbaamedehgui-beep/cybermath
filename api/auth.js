const pool = require('./_db');

// 6 оронтой код үүсгэх
function genCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Resend.com ашиглан мейл илгээх
async function sendVerifyEmail(email, code) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'CyberMath <noreply@cybermath.mn>',  // өөрийн домайнаар солино уу
      to: email,
      subject: 'CyberMath — Бүртгэл баталгаажуулах код',
      html: `
        <div style="font-family:'Segoe UI',sans-serif;max-width:480px;margin:0 auto;background:#f7f7f7;border-radius:16px;padding:32px 28px;text-align:center;">
          <div style="font-size:2.5rem;margin-bottom:8px;">🔐</div>
          <h2 style="color:#3C3C3C;font-size:1.4rem;margin-bottom:8px;">Баталгаажуулах код</h2>
          <p style="color:#777;font-size:0.95rem;margin-bottom:24px;">CyberMath-д бүртгүүлсэнд баярлалаа! Доорх кодыг оруулна уу:</p>
          <div style="background:#1CB0F6;color:#fff;font-size:2.2rem;font-weight:900;letter-spacing:10px;padding:18px 32px;border-radius:12px;display:inline-block;margin-bottom:24px;">${code}</div>
          <p style="color:#aaa;font-size:0.82rem;">Код 10 минутын дотор хүчинтэй.<br>Та бүртгүүлэаэгүй бол энэ мейлийг үл тоомсорлоно уу.</p>
        </div>
      `
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('Resend алдаа: ' + err);
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, email, pass, firstName, lastName, grade, plan, newPass, code } = req.body || {};

  try {

    // ── LOGIN ──────────────────────────────────────────────────────────────
    if (action === 'login') {
      const r = await pool.query(
        'SELECT *, completed_lessons FROM users WHERE email=$1 AND pass=$2',
        [email, pass]
      );
      if (!r.rows.length)
        return res.status(401).json({ ok: false, error: 'И-мэйл эсвэл нууц үг буруу' });
      const u = r.rows[0];
      if (!u.verified)
        return res.status(403).json({ ok: false, error: 'Эхлээд и-мэйлээ баталгаажуулна уу', needVerify: true, email: u.email });
      return res.json({ ok: true, user: {
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        grade: u.grade,
        plan: u.plan,
        xp: u.xp || 0,
        gems: u.gems || 340,
        hearts: u.hearts || 5,
        streak: u.streak || 0,
        avatar: u.avatar || 'default',
        completedLessons: u.completed_lessons || []
      }});
    }

    // ── REGISTER ───────────────────────────────────────────────────────────
    if (action === 'register') {
      if (!email || !email.includes('@'))
        return res.status(400).json({ ok: false, error: 'Зөв и-мэйл оруулна уу' });
      if (!grade)
        return res.status(400).json({ ok: false, error: 'Ангиа сонгоно уу' });

      const exists = await pool.query('SELECT id, verified FROM users WHERE email=$1', [email]);

      const verifyCode = genCode();
      const verifyExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 минут

      if (exists.rows.length) {
        // Бүртгэлтэй, баталгаажаагүй бол шинэ код илгээнэ
        if (exists.rows[0].verified)
          return res.status(400).json({ ok: false, error: 'И-мэйл бүртгэлтэй байна' });

        await pool.query(
          'UPDATE users SET pass=$1,first_name=$2,last_name=$3,grade=$4,plan=$5,verify_code=$6,verify_expires=$7 WHERE email=$8',
          [pass, firstName, lastName, grade, plan || 'free', verifyCode, verifyExpires, email]
        );
      } else {
        await pool.query(
          `INSERT INTO users
            (email,pass,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,verified,verify_code,verify_expires)
           VALUES ($1,$2,$3,$4,$5,$6,0,340,5,0,'default',false,$7,$8)`,
          [email, pass, firstName, lastName, grade, plan || 'free', verifyCode, verifyExpires]
        );
      }

      await sendVerifyEmail(email, verifyCode);
      return res.json({ ok: true, needVerify: true });
    }

    // ── VERIFY ─────────────────────────────────────────────────────────────
    if (action === 'verify') {
      const r = await pool.query(
        'SELECT verify_code, verify_expires FROM users WHERE email=$1',
        [email]
      );
      if (!r.rows.length)
        return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });

      const { verify_code, verify_expires } = r.rows[0];

      if (new Date() > new Date(verify_expires))
        return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан. Дахин илгээнэ үү.' });

      if (code !== verify_code)
        return res.status(400).json({ ok: false, error: 'Код буруу байна' });

      await pool.query(
        'UPDATE users SET verified=true, verify_code=NULL, verify_expires=NULL WHERE email=$1',
        [email]
      );

      const u = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      const user = u.rows[0];
      return res.json({ ok: true, user: {
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        grade: user.grade,
        plan: user.plan,
        xp: user.xp || 0,
        gems: user.gems || 340,
        hearts: user.hearts || 5,
        streak: user.streak || 0,
        avatar: user.avatar || 'default',
        completedLessons: user.completed_lessons || []
      }});
    }

    // ── RESEND ─────────────────────────────────────────────────────────────
    if (action === 'resend') {
      const r = await pool.query('SELECT id FROM users WHERE email=$1 AND verified=false', [email]);
      if (!r.rows.length)
        return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });

      const verifyCode = genCode();
      const verifyExpires = new Date(Date.now() + 10 * 60 * 1000);

      await pool.query(
        'UPDATE users SET verify_code=$1, verify_expires=$2 WHERE email=$3',
        [verifyCode, verifyExpires, email]
      );

      await sendVerifyEmail(email, verifyCode);
      return res.json({ ok: true });
    }

    // ── RESET PASSWORD ─────────────────────────────────────────────────────
    if (action === 'reset') {
      const r = await pool.query(
        'UPDATE users SET pass=$1 WHERE email=$2 RETURNING id',
        [newPass, email]
      );
      if (!r.rows.length)
        return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
      return res.json({ ok: true });
    }

    // ── GET USER ───────────────────────────────────────────────────────────
    if (action === 'getuser') {
      const r = await pool.query('SELECT * FROM users WHERE email=$1', [email]);
      if (!r.rows.length)
        return res.status(404).json({ ok: false, error: 'User not found' });
      const u = r.rows[0];
      return res.json({ ok: true, user: {
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        grade: u.grade,
        plan: u.plan,
        xp: u.xp || 0,
        gems: u.gems || 340,
        hearts: u.hearts || 5,
        streak: u.streak || 0,
        avatar: u.avatar || 'default',
        completedLessons: u.completed_lessons || []
      }});
    }

    res.status(400).json({ ok: false, error: 'Unknown action' });

  } catch (e) {
    console.error('[auth] error:', e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
};
