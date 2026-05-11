const pool = require('./_db');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Lazy table create
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

    if (req.method === 'POST') {
      const body = req.body || {};
      const action = body.action;

      // Хэрэглэгчээс — промо код хэрэглэх (ашиглах)
      if (action === 'redeem') {
        const { code, email } = body;
        if (!code || !email) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const clean = String(code).trim().toUpperCase();

        const r = await pool.query('SELECT * FROM promo_codes WHERE UPPER(code)=$1', [clean]);
        if (!r.rows.length) return res.json({ ok: false, error: 'Код буруу байна' });
        const promo = r.rows[0];

        if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
          return res.json({ ok: false, error: 'Кодын хугацаа дууссан' });
        }
        if (promo.max_uses && promo.used_count >= promo.max_uses) {
          return res.json({ ok: false, error: 'Кодын ашиглах эрх дууссан' });
        }
        // Уг хэрэглэгч аль хэдийн ашигласан эсэх
        const used = await pool.query(
          'SELECT 1 FROM promo_redemptions WHERE LOWER(user_email)=LOWER($1) AND UPPER(code)=$2',
          [email, clean]
        );
        if (used.rows.length) return res.json({ ok: false, error: 'Та энэ кодыг аль хэдийн ашигласан' });

        // Шагнал олгох
        let appliedDesc = '';
        if (promo.reward_type === 'xp') {
          await pool.query('UPDATE users SET xp = COALESCE(xp,0) + $1 WHERE email=$2', [promo.reward_amount, email]);
          appliedDesc = '+' + promo.reward_amount + ' XP';
        } else if (promo.reward_type === 'gems') {
          await pool.query('UPDATE users SET gems = COALESCE(gems,0) + $1 WHERE email=$2', [promo.reward_amount, email]);
          appliedDesc = '+' + promo.reward_amount + ' 💎';
        } else if (promo.reward_type === 'hearts') {
          await pool.query('UPDATE users SET hearts = LEAST(COALESCE(hearts,0) + $1, 5) WHERE email=$2', [promo.reward_amount, email]);
          appliedDesc = '+' + promo.reward_amount + ' ❤';
        } else if (promo.reward_type === 'premium') {
          const days = promo.reward_amount || 30;
          await pool.query(
            `UPDATE users SET plan='premium', premium_expiry = COALESCE(premium_expiry, NOW()) + ($1 || ' days')::interval WHERE email=$2`,
            [String(days), email]
          );
          appliedDesc = '⭐ Premium ' + days + ' хоног';
        } else {
          return res.json({ ok: false, error: 'Шагнал тогтоогдоогүй' });
        }

        await pool.query(
          'INSERT INTO promo_redemptions (code, user_email) VALUES ($1, $2)',
          [clean, email]
        );
        await pool.query('UPDATE promo_codes SET used_count = used_count + 1 WHERE id=$1', [promo.id]);

        return res.json({
          ok: true,
          reward: {
            type: promo.reward_type,
            amount: promo.reward_amount,
            description: promo.description || appliedDesc,
            label: appliedDesc
          }
        });
      }

      // Admin — Шинэ код үүсгэх
      if (action === 'create') {
        const { code, reward_type, reward_amount, description, max_uses, expires_at } = body;
        if (!code || !reward_type) return res.status(400).json({ ok: false, error: 'Missing fields' });
        const clean = String(code).trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,30}$/.test(clean)) return res.json({ ok: false, error: 'Код 3-30 тэмдэгт A-Z 0-9 _ - байх ёстой' });
        if (['xp','gems','hearts','premium'].indexOf(reward_type) === -1) return res.json({ ok: false, error: 'Шагналын төрөл буруу' });
        const r = await pool.query(
          `INSERT INTO promo_codes (code, reward_type, reward_amount, description, max_uses, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
          [clean, reward_type, parseInt(reward_amount) || 0, description || null,
           max_uses ? parseInt(max_uses) : null, expires_at || null]
        );
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
      const { id } = req.body || {};
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
