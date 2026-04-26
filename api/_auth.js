const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

// Token-аас email + role гаргах. Алдаатай бол null буцаана.
function verifyToken(req) {
  const auth = req.headers.authorization || req.headers.Authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

// Хэрэглэгчийн өөрийнх эсэхийг шалгах
// req-ээс token авч email-тай харьцуулна.
// Token байхгүй ч хуучин (миграцын үед) ажиллах боломжтой — STRICT флагаар хатуу болгоно.
function checkUserAccess(req, requestedEmail, options) {
  options = options || {};
  const decoded = verifyToken(req);

  // Хатуу горим — token шаардлагатай
  if (options.strict) {
    if (!decoded) return { ok: false, error: 'Унтраалга буруу. Дахин нэвтэрнэ үү.' };
    if (decoded.admin) return { ok: true, isAdmin: true };
    if (decoded.email !== requestedEmail) return { ok: false, error: 'Зөвхөн өөрийнхөө өгөгдлийг харна' };
    return { ok: true, email: decoded.email, role: decoded.role };
  }

  // Уян хатан горим — token байвал шалгана, байхгүй бол анхааруулга өгнө
  if (decoded) {
    if (decoded.admin) return { ok: true, isAdmin: true };
    if (decoded.email !== requestedEmail) return { ok: false, error: 'Зөвхөн өөрийнхөө өгөгдлийг харна' };
    return { ok: true, email: decoded.email, role: decoded.role };
  }

  // Token байхгүй — backward compat үед ажиллана
  return { ok: true, legacy: true };
}

// Зөвхөн админ
function requireAdmin(req) {
  const decoded = verifyToken(req);
  if (!decoded || !decoded.admin) {
    return { ok: false, error: 'Зөвхөн админ' };
  }
  return { ok: true };
}

module.exports = { verifyToken, checkUserAccess, requireAdmin };
