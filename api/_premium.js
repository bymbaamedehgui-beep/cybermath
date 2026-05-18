// Premium хугацаа дууссан эсэхийг шалгаж, дууссан бол автоматаар free болгоно.
// User row-ыг modify хийгээд буцаана.
const pool = require('./_db');

async function ensureExpiryCheck(user) {
  if (!user) return user;
  if (user.plan !== 'premium') return user;
  const exp = user.premium_expiry || user.premium_until;
  if (!exp) return user;
  if (new Date(exp) >= new Date()) return user; // хугацаа дуусаагүй
  // Дууссан — free руу шилжүүлнэ
  try {
    await pool.query(
      `UPDATE users SET plan='free', premium_expiry=NULL WHERE LOWER(email)=LOWER($1)`,
      [user.email]
    );
  } catch (e) {
    console.error('[premium expiry]', e.message);
  }
  user.plan = 'free';
  user.premium_expiry = null;
  user.premium_until = null;
  return user;
}

module.exports = { ensureExpiryCheck };
