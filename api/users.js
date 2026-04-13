const pool = require('./_db');
const { sendPremiumEmail, sendFreeEmail } = require('./_email');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const r = await pool.query('SELECT id,email,first_name,last_name,grade,plan,xp,gems,hearts,streak,avatar,completed_lessons,created_at FROM users ORDER BY created_at DESC');
      return res.json({ ok: true, users: r.rows });
    }

    if (req.method === 'PUT') {
      const { email, plan, xp, gems, hearts, streak, avatar, completed_lesson, stars_data, streak_data } = req.body || {};
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email' });

      // completed_lesson array-д нэмэх
      if (completed_lesson !== undefined) {
        await pool.query(
          `UPDATE users SET completed_lessons = array_append(COALESCE(completed_lessons,'{}'), $1::int)
           WHERE email=$2 AND NOT ($1::int = ANY(COALESCE(completed_lessons,'{}')))`,
          [completed_lesson, email]
        );
      }

      // Бусад талбарууд
      const sets = [];
      const vals = [];
      let i = 1;
      if (plan   !== undefined) { sets.push(`plan=$${i++}`);   vals.push(plan); }
      if (xp     !== undefined) { sets.push(`xp=$${i++}`);     vals.push(xp); }
      if (gems   !== undefined) { sets.push(`gems=$${i++}`);   vals.push(gems); }
      if (hearts !== undefined) { sets.push(`hearts=$${i++}`); vals.push(hearts); }
      if (streak !== undefined) { sets.push(`streak=$${i++}`); vals.push(streak); }
      if (avatar !== undefined) { sets.push(`avatar=$${i++}`); vals.push(avatar); }

      if (sets.length) {
        vals.push(email);
        await pool.query(`UPDATE users SET ${sets.join(',')} WHERE email=$${i}`, vals);
      }

      // Plan солиход email мэдэгдэл
      if (plan !== undefined && email) {
        try {
          const sendEmail = require('./email');
          const isPremium = plan === 'premium';
          await sendEmail({
            to: email,
            subject: isPremium ? 'CyberMath - Premium эрх идэвхжлээ! ⭐' : 'CyberMath - Тарифф өөрчлөгдлөө',
            html: isPremium ? `
              <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0b1a;color:#f0eeff;border-radius:16px;">
                <h2 style="color:#FFC800;margin:0 0 8px;">⭐ Premium эрх идэвхжлээ!</h2>
                <p>Таны бүртгэл Premium болж, бүх хичээлүүд нээгдлээ.</p>
                <p style="color:#8880aa;font-size:14px;">CyberMath багийн мэндчилгээтэй</p>
              </div>` : `
              <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px;background:#0d0b1a;color:#f0eeff;border-radius:16px;">
                <h2 style="color:#A855F7;margin:0 0 8px;">CyberMath - Тарифф өөрчлөгдлөө</h2>
                <p>Таны бүртгэл Free тариффт шилжлээ.</p>
                <p style="color:#8880aa;font-size:14px;">Асуулт байвал admin@cybermath.mn-д хандана уу.</p>
              </div>`
          });
        } catch(e) { console.log('Email error:', e.message); }
      }
      // Plan өөрчлөгдсөн бол имэйл илгээх
      if (plan !== undefined) {
        const u = await pool.query('SELECT first_name, email FROM users WHERE email=$1', [email]);
        if (u.rows.length) {
          const firstName = u.rows[0].first_name;
          if (plan === 'premium') sendPremiumEmail(email, firstName).catch(()=>{});
          else if (plan === 'free') sendFreeEmail(email, firstName).catch(()=>{});
        }
      }
      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { email } = req.body || {};
      await pool.query('DELETE FROM users WHERE email=$1', [email]);
      return res.json({ ok: true });
    }

    res.status(405).end();
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
};
