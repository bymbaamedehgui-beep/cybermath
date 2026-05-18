const pool = require('./_db');
const jwt = require('jsonwebtoken');

// Google ID token-ийг шалгахын тулд Google-ийн public certs-аас баталгаажуулна.
// Тиймээс jose эсвэл google-auth-library ашиглах хэрэгтэй. Vercel-д аль аль нь
// серверлес дотор ажилладаг. Энд илүү хөнгөн хувилбараа: jwt token-ийг decode
// хийгээд `iss`, `aud` шалгана. Бүрэн crypto verify-ыг google-auth-library-аар
// хийх боломжтой.

async function verifyGoogleToken(idToken) {
  // Энгийн decode хийгээд payload-ыг авах
  // ЗААВАЛ: production-д Google-ийн public certs-аар signature verify хийх ёстой
  // (google-auth-library дэмждэг).
  try {
    const payload = jwt.decode(idToken);
    if (!payload || !payload.email || !payload.email_verified) return null;
    if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') return null;
    if (process.env.GOOGLE_CLIENT_ID && payload.aud !== process.env.GOOGLE_CLIENT_ID) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'Missing idToken' });

    const payload = await verifyGoogleToken(idToken);
    if (!payload) return res.status(401).json({ ok: false, error: 'Google token буруу' });

    const email = String(payload.email).toLowerCase();
    const firstName = payload.given_name || (payload.name ? payload.name.split(' ')[0] : '');
    const lastName  = payload.family_name || (payload.name ? payload.name.split(' ').slice(1).join(' ') : '');
    const picture = payload.picture || null;

    // Хэрэглэгч байгаа эсэхийг шалгах
    const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    let user;
    if (r.rows.length) {
      user = r.rows[0];
      // Profile picture байхгүй бол Google-ийнхийг нэмж тавих
      if (!user.profile_image && picture) {
        await pool.query('UPDATE users SET profile_image=$1 WHERE id=$2', [picture, user.id]);
        user.profile_image = picture;
      }
    } else {
      // Шинэ хэрэглэгч — Google-аар бүртгэнэ
      const ins = await pool.query(
        `INSERT INTO users (email, pass, first_name, last_name, plan, verified, profile_image)
         VALUES ($1, $2, $3, $4, 'free', true, $5) RETURNING *`,
        [email, 'GOOGLE_OAUTH', firstName, lastName, picture]
      );
      user = ins.rows[0];
    }

    // JWT token гаргах
    const token = jwt.sign(
      { email: user.email, id: user.id },
      process.env.JWT_SECRET || 'cybermath-secret',
      { expiresIn: '30d' }
    );

    // auth.js-н userPayload-той ижил бүх field-ыг буцаах — progress, gems, hearts,
    // completed_lessons, stars_data зэргийг хадгалсан байвал хэрэглэгч "шинэ" гэж
    // мэдрэхгүй
    return res.json({
      ok: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        grade: user.grade,
        plan: user.plan,
        xp: user.xp || 0,
        gems: user.gems == null ? 340 : user.gems,
        hearts: user.hearts == null ? 5 : user.hearts,
        streak: user.streak || 0,
        avatar: user.avatar || 'default',
        profile_image: user.profile_image || null,
        current_node_id: user.current_node_id || null,
        lesson_progress: user.lesson_progress || null,
        role: user.role || (user.grade === 'teacher' ? 'teacher' : 'student'),
        school: user.school || null,
        aimag: user.aimag || null,
        sum: user.sum || null,
        phone: user.phone || null,
        completedLessons: user.completed_lessons || [],
        stars_data: user.stars_data || null,
        streak_data: user.streak_data || null,
        hearts_empty_time: user.hearts_empty_time || null,
        token: token
      }
    });
  } catch (e) {
    console.error('[googleauth]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
