const pool = require('./_db');
const { secretMissing, requireAdmin, requireUser, rateLimit, clientIp } = require('./_guard');

// Premium промо кодын хоногийн дээд хязгаар
const PREMIUM_MAX_DAYS = 365;

async function ensureTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_codes (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount INT NOT NULL DEFAULT 0,
      reward_meta JSONB,
      description TEXT,
      max_uses INT,
      used_count INT NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS promo_redemptions (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      user_email TEXT NOT NULL,
      redeemed_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(code, user_email)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_pr_user ON promo_redemptions(user_email)`).catch(()=>{});
  // is_public — бүртгэлийн баталгаажуулах имэйлд (auth.js getActivePromo) хавсаргаж болох нийтийн код.
  // Анхдагч false: багц/найзуудын (FR...) төлбөртэй кодууд хэзээ ч дурын бүртгүүлэгч рүү явахгүй.
  await pool.query(`ALTER TABLE promo_codes ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT false`).catch(()=>{});
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (secretMissing(res)) return;
    const body = req.body || {};
    const action = body.action;

    // Эрхийн шалгалт — хүснэгт үүсгэхээс ӨМНӨ
    const adminOnly = req.method === 'GET' || req.method === 'DELETE' || (req.method === 'POST' && (action === 'create' || action === 'setPublic'));
    if (adminOnly && !requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
    let me = null;
    if (req.method === 'POST' && action === 'redeem') {
      me = requireUser(req);
      if (!me) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
    }

    await ensureTables();

    if (req.method === 'POST') {
      // Хэрэглэгчээс — промо код хэрэглэх. Имэйлийг ЗӨВХӨН токеноос авна (body.email-ийг үл тооно)
      if (action === 'redeem') {
        const email = me.email;
        const code = body.code;
        if (!code) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const clean = String(code).trim().toUpperCase().slice(0, 40);

        // Буруу кодын brute force-оос: IP 20/10мин, имэйл 10/10мин
        const okIp = await rateLimit('promo:ip:' + clientIp(req), 20, 600);
        const okEm = okIp && await rateLimit('promo:em:' + email, 10, 600);
        if (!okIp || !okEm) return res.status(429).json({ ok: false, error: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' });

        const ur = await pool.query('SELECT email FROM users WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
        if (!ur.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
        const userEmail = ur.rows[0].email;

        const r = await pool.query('SELECT * FROM promo_codes WHERE UPPER(code)=$1', [clean]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Код буруу байна' });
        const promo = r.rows[0];

        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
          return res.json({ ok: false, error: 'Кодын хугацаа дууссан' });
        }
        if (['xp', 'gems', 'hearts', 'premium'].indexOf(promo.reward_type) === -1) {
          return res.json({ ok: false, error: 'Шагнал тогтоогдоогүй' });
        }
        // Уг хэрэглэгч аль хэдийн ашигласан эсэх (хуучин бичлэгийн том/жижиг үсгийг ч тооно)
        const used = await pool.query(
          'SELECT 1 FROM promo_redemptions WHERE LOWER(user_email)=LOWER($1) AND UPPER(code)=$2',
          [email, clean]
        );
        if (used.rows.length) return res.json({ ok: false, error: 'Та энэ кодыг аль хэдийн ашигласан' });

        // Атомар 1: UNIQUE(code, user_email) — нэг хэрэглэгчийн зэрэг хүсэлтээс нэг л нь орно
        const claim = await pool.query(
          'INSERT INTO promo_redemptions (code, user_email) VALUES ($1, $2) ON CONFLICT (code, user_email) DO NOTHING RETURNING id',
          [clean, email]
        );
        if (!claim.rows.length) return res.json({ ok: false, error: 'Та энэ кодыг аль хэдийн ашигласан' });
        const claimId = claim.rows[0].id;

        // Атомар 2: used_count — max_uses-ийг зэрэг хүсэлтэд ч хэтрүүлэхгүй
        const upd = await pool.query(
          `UPDATE promo_codes SET used_count = used_count + 1
           WHERE id=$1 AND (max_uses IS NULL OR used_count < max_uses) AND (expires_at IS NULL OR expires_at > NOW())
           RETURNING id`,
          [promo.id]
        );
        if (!upd.rows.length) {
          await pool.query('DELETE FROM promo_redemptions WHERE id=$1', [claimId]).catch(()=>{});
          return res.json({ ok: false, error: 'Кодын ашиглах эрх дууссан' });
        }

        // Шагнал олгох (алдаа гарвал тоолуур/бүртгэлийг буцаана)
        let appliedDesc = '';
        let amount = parseInt(promo.reward_amount) || 0;
        try {
          if (promo.reward_type === 'xp') {
            await pool.query('UPDATE users SET xp = COALESCE(xp,0) + $1 WHERE email=$2', [amount, userEmail]);
            appliedDesc = '+' + amount + ' XP';
          } else if (promo.reward_type === 'gems') {
            await pool.query('UPDATE users SET gems = COALESCE(gems,0) + $1 WHERE email=$2', [amount, userEmail]);
            appliedDesc = '+' + amount + ' 💎';
          } else if (promo.reward_type === 'hearts') {
            await pool.query('UPDATE users SET hearts = LEAST(COALESCE(hearts,0) + $1, 5) WHERE email=$2', [amount, userEmail]);
            appliedDesc = '+' + amount + ' ❤';
          } else if (promo.reward_type === 'premium') {
            amount = Math.min(Math.max(amount || 30, 1), PREMIUM_MAX_DAYS);
            await pool.query(
              `UPDATE users SET plan='premium', premium_expiry = GREATEST(COALESCE(premium_expiry, NOW()), NOW()) + ($1 || ' days')::interval WHERE email=$2`,
              [String(amount), userEmail]
            );
            appliedDesc = '⭐ Premium ' + amount + ' хоног';
          }
        } catch (e) {
          await pool.query('DELETE FROM promo_redemptions WHERE id=$1', [claimId]).catch(()=>{});
          await pool.query('UPDATE promo_codes SET used_count = GREATEST(used_count - 1, 0) WHERE id=$1', [promo.id]).catch(()=>{});
          throw e;
        }

        return res.json({
          ok: true,
          reward: {
            type: promo.reward_type,
            amount: amount,
            description: promo.description || appliedDesc,
            label: appliedDesc
          }
        });
      }

      // Admin — Шинэ код үүсгэх
      if (action === 'create') {
        const { code, reward_type, reward_amount, description, max_uses, expires_at } = body;
        const isPublic = body.is_public === true;   // зөвхөн тодорхой true үед нийтийн
        if (!code || !reward_type) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const clean = String(code).trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,30}$/.test(clean)) return res.json({ ok: false, error: 'Код 3-30 тэмдэгт A-Z 0-9 _ - байх ёстой' });
        if (['xp','gems','hearts','premium'].indexOf(reward_type) === -1) return res.json({ ok: false, error: 'Шагналын төрөл буруу' });
        const amt = parseInt(reward_amount) || 0;
        if (amt < 0) return res.json({ ok: false, error: 'Шагналын хэмжээ буруу' });
        if (reward_type === 'premium' && (amt < 1 || amt > PREMIUM_MAX_DAYS)) {
          return res.json({ ok: false, error: 'Premium хоног 1-' + PREMIUM_MAX_DAYS + ' байх ёстой' });
        }
        const r = await pool.query(
          `INSERT INTO promo_codes (code, reward_type, reward_amount, description, max_uses, expires_at, is_public)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [clean, reward_type, amt, description || null,
           max_uses ? parseInt(max_uses) : null, expires_at || null, isPublic]
        );
        return res.json({ ok: true, promo: r.rows[0] });
      }

      // Admin — кодыг нийтийн (бүртгэлийн имэйлд илгээх) / хувийн болгох
      if (action === 'setPublic') {
        const id = parseInt(body.id);
        if (!id) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const r = await pool.query('UPDATE promo_codes SET is_public=$2 WHERE id=$1 RETURNING id, code, is_public', [id, body.is_public === true]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Код олдсонгүй' });
        return res.json({ ok: true, promo: r.rows[0] });
      }

      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    if (req.method === 'GET') {
      // Admin — бүх код жагсаалт
      const r = await pool.query('SELECT * FROM promo_codes ORDER BY created_at DESC LIMIT 200');
      return res.json({ ok: true, codes: r.rows });
    }

    if (req.method === 'DELETE') {
      const { id } = body;
      if (!id) return res.status(400).json({ ok: false });
      await pool.query('DELETE FROM promo_codes WHERE id=$1', [id]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    console.error('[promo]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
