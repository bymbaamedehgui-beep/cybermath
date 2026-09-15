const crypto = require('crypto');
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const { ensureExpiryCheck } = require('./_premium');
const { jwtSecret, secretMissing } = require('./_guard');
const sms = require('./_sms');
const tg = require('./_telegram');

// Google ID token-ийг Google-ийн нийтийн түлхүүрээр (JWKS, RS256) гарын үсгийг нь шалгана.
// Нэмэлт npm хамааралгүй: JWKS-ийг татаж кэшлээд crypto.createPublicKey + jwt.verify.
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

let _jwks = null;          // { keys: { kid: pem }, expiresAt: ms }
let _jwksLoading = null;
let _lastForced = 0;       // таньдаггүй kid-ээр хүчээр дахин татсан сүүлийн хугацаа
const FORCE_REFETCH_MS = 60 * 1000;

async function loadJwks(force) {
  // Хүчээр дахин татахыг 60 секундэд нэг удаа (хуурамч kid-ээр Google руу олноор татуулахгүй)
  if (force && _jwks) {
    if (Date.now() - _lastForced < FORCE_REFETCH_MS) return _jwks;
    _lastForced = Date.now();
  }
  if (!force && _jwks && _jwks.expiresAt > Date.now()) return _jwks;
  if (_jwksLoading) return _jwksLoading;
  _jwksLoading = (async () => {
    const r = await fetch(GOOGLE_JWKS_URL);
    if (!r || (r.ok === false)) throw new Error('Google JWKS татаж чадсангүй');
    const body = await r.json();
    const keys = {};
    (body && Array.isArray(body.keys) ? body.keys : []).forEach(function(k) {
      if (!k || !k.kid || k.kty !== 'RSA') return;
      try {
        keys[k.kid] = crypto.createPublicKey({ key: k, format: 'jwk' }).export({ type: 'spki', format: 'pem' });
      } catch (e) { /* буруу түлхүүрийг алгасна */ }
    });
    // Cache-Control max-age-ийг дагана (байхгүй бол 1 цаг)
    let maxAge = 3600;
    try {
      const cc = r.headers && typeof r.headers.get === 'function' ? (r.headers.get('cache-control') || '') : '';
      const m = /max-age=(\d+)/.exec(cc);
      if (m) maxAge = Math.min(86400, Math.max(60, parseInt(m[1], 10)));
    } catch (e) {}
    _jwks = { keys: keys, expiresAt: Date.now() + maxAge * 1000 };
    return _jwks;
  })();
  try { return await _jwksLoading; } finally { _jwksLoading = null; }
}

// Амжилттай бол payload, үгүй бол null
async function verifyGoogleToken(idToken, clientId) {
  if (typeof idToken !== 'string' || idToken.length > 4096) return null;
  const dec = jwt.decode(idToken, { complete: true });
  if (!dec || !dec.header || dec.header.alg !== 'RS256' || !dec.header.kid) return null;
  let set = await loadJwks(false);
  let pem = set.keys[dec.header.kid];
  if (!pem) {
    // Түлхүүр сэлгэгдсэн байж болно — нэг удаа дахин татна
    set = await loadJwks(true);
    pem = set.keys[dec.header.kid];
  }
  if (!pem) return null;
  let payload;
  try {
    payload = jwt.verify(idToken, pem, {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: GOOGLE_ISSUERS
    }); // exp-ийг jwt.verify өөрөө шалгана
  } catch (e) {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.email_verified !== true && payload.email_verified !== 'true') return null;
  if (typeof payload.email !== 'string' || payload.email.indexOf('@') < 1) return null;
  return payload;
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).end();

  if (secretMissing(res)) return;
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  if (!CLIENT_ID) return res.status(500).json({ ok: false, error: 'Серверийн тохиргоо дутуу (GOOGLE_CLIENT_ID)' });

  try {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'Missing idToken' });

    let payload = null;
    try {
      payload = await verifyGoogleToken(idToken, CLIENT_ID);
    } catch (e) {
      console.error('[googleauth] jwks', e.message);
      return res.status(503).json({ ok: false, error: 'Google баталгаажуулалт түр ажиллахгүй байна. Дахин оролдоно уу.' });
    }
    if (!payload) return res.status(401).json({ ok: false, error: 'Google token буруу' });

    const email = String(payload.email).trim().toLowerCase();
    const firstName = payload.given_name || (payload.name ? payload.name.split(' ')[0] : '');
    const lastName  = payload.family_name || (payload.name ? payload.name.split(' ').slice(1).join(' ') : '');
    const picture = payload.picture || null;

    // Хэрэглэгч байгаа эсэхийг шалгах
    await sms.ensureUserColumns();
    const r = await pool.query('SELECT * FROM users WHERE LOWER(email)=LOWER($1)', [email]);
    let user;
    if (r.rows.length) {
      user = r.rows[0];
      // S7: SMS/урилгаар бүртгэгдсэн (имэйлийн эзэмшил батлагдаагүй) мөр. Google имэйлийг баталсан тул жинхэнэ эзэн нь энэ хүн:
      // урьдчилан эзэлсэн хүний нууц үг, утас, хүлээгдэж буй кодыг арилгаж, token_version+1-ээр хуучин JWT-г хүчингүй болгоно.
      if (user.email_unverified === true) {
        if (user.pass !== 'GOOGLE_OAUTH') {
          const cl = await pool.query(
            `UPDATE users SET pass='GOOGLE_OAUTH', phone=NULL, phone_verified_at=NULL, verify_code=NULL, verify_expiry=NULL,
               verified=TRUE, email_unverified=FALSE, token_version=COALESCE(token_version,0)+1
             WHERE id=$1 AND email_unverified=TRUE RETURNING *`,
            [user.id]
          );
          if (cl.rows.length) {
            user = cl.rows[0];
            const isT = user.role === 'teacher' || user.grade === 'teacher';
            tg.sendTelegram('Баталгаажаагүй имэйлтэй данс Google-ээр эзэмшигдлээ (нууц үг/утас арилгав): ' + sms.maskEmail(email) + ', багш=' + isT).catch(() => {});
          } else {
            const again = await pool.query('SELECT * FROM users WHERE id=$1', [user.id]);
            if (again.rows.length) user = again.rows[0];
          }
        } else {
          await pool.query('UPDATE users SET email_unverified=FALSE WHERE id=$1', [user.id]);
          user.email_unverified = false;
        }
      }
      // Profile picture байхгүй бол Google-ийнхийг нэмж тавих
      if (!user.profile_image && picture) {
        await pool.query('UPDATE users SET profile_image=$1 WHERE id=$2', [picture, user.id]);
        user.profile_image = picture;
      }
      // Premium хугацаа дууссан эсэхийг шалгаж free болгох
      user = await ensureExpiryCheck(user);
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
      { email: user.email, id: user.id, tv: Number(user.token_version) | 0 },
      jwtSecret(),
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
        premium_expiry: user.premium_expiry || user.premium_until || null,
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
    sms.logErr('[googleauth]', e);
    res.status(500).json({ ok: false, error: 'Серверийн алдаа' });
  }
};
