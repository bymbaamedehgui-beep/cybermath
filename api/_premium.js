// Premium хугацаа дууссан эсэхийг шалгаж, дууссан бол автоматаар free болгоно.
// User row-ыг modify хийгээд буцаана.
// plan='premium' боловч хугацаа (premium_expiry/premium_until) огт тэмдэглэгдээгүй бол
// хүчингүй гэж үзэж free болгоно (сервер premium олгохдоо үргэлж хугацаа тавьдаг).
const pool = require('./_db');

async function ensureExpiryCheck(user) {
  if (!user) return user;
  if (user.plan !== 'premium') return user;
  const exp = user.premium_expiry || user.premium_until;
  if (exp && new Date(exp) >= new Date()) return user; // хугацаа дуусаагүй
  // Дууссан эсвэл хугацаагүй — free руу шилжүүлнэ
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
