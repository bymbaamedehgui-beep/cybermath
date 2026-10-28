// ЭЕШ шалгагч (eyeshcheck.com)-ийн холболт. Дуудагчид: eyesh-link.js (ЭЕШ хуудсуудын «ЭЕШ шалгагч» товч), eyeshcheck-ийн сервер.
//   POST ?action=status  {wstoken}       → { ok, email, price, days, expiry|null, active }
//   POST ?action=handoff {wstoken, exam} → { ok, url, code, ttl } — eyeshcheck руу нэвтрэх НЭГ УДААГИЙН код (2 минут).
//        Клиент кодыг URL-д биш, eyeshcheck.com/api/cm/sso руу form POST-оор илгээнэ (тэнд шалгалт шууд үүснэ).
//   POST ?action=redeem  {code}          → { ok, kind:'teacher', email, name, paidUntil|null, exam } — eyeshcheck-ийн сервер,
//        код нэг удаа. Админы код бол зөвхөн { ok, kind:'admin' }.
//   POST ?action=admin_handoff (админ токен) → { ok, url, code, ttl } — админ хэсгийн «ЭЕШ шалгагч» цэс (admin.html)
//        eyeshcheck.com/cm-admin-г iframe-ээр нээж, кодыг postMessage-ээр өгнө → eyeshcheck өөрийн admin дансаар нэвтэрнэ.
// Эрх: api/qpay.js create {plan:'eyesh', wstoken} → settleEyesh (ws_eyesh_access +30 хоног).
// Эрхгүй ч handoff өгнө — eyeshcheck-д өөрөө идэвхтэй эрхтэй багш нэмэлт төлбөргүй ашиглана (eyeshcheck өөрөө шалгана).
// Имэйлийг ЗӨВХӨН ws токеноос авна. Дасгалын төвийн бүртгэл имэйлийн эзэмшлийг батлахгүй (SMS) тул eyeshcheck нь өмнө нь
// бүртгэлтэй багшийн данстай НУУЦ ҮГЭЭР нэг удаа холбуулна — эс бөгөөс өөр хүний имэйлээр түүний данс руу орж болно.
'use strict';
const pool = require('./_db');
const EY = require('./_eyesh');
const { rateLimit, clientIp, wsEmail, requireAdmin } = require('./_guard');

const TOO_MANY = 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST хүсэлт шаардлагатай' });
  if (!process.env.JWT_SECRET) { console.error('[eyesh] JWT_SECRET тохируулаагүй'); return res.status(500).json({ ok: false, error: 'Серверийн тохиргооны алдаа' }); }
  const action = String(req.query.action || '');
  const b = req.body || {};
  try {
    // eyeshcheck-ийн сервер: кодыг зарцуулж имэйл, нэр, Дасгалын төв дээрх эрхийн хугацаа, шалгалтыг авна
    if (action === 'redeem') {
      if (!(await rateLimit('eyesh_rd_ip:' + clientIp(req), 300, 600))) return res.status(429).json({ ok: false, error: TOO_MANY });
      const r = await EY.redeem(b.code);
      if (!r) return res.status(404).json({ ok: false, error: 'Код хүчингүй, ашиглагдсан эсвэл хугацаа нь дууссан' });
      if (r.email === EY.ADMIN_HANDOFF) return res.json({ ok: true, kind: 'admin' });
      let name = '';
      try {
        const u = await pool.query('SELECT name FROM ws_login WHERE lower(email)=$1 LIMIT 1', [r.email]);
        name = u.rows.length ? String(u.rows[0].name || '').trim().slice(0, 200) : '';
      } catch (e) { /* нэр заавал биш */ }
      return res.json({ ok: true, kind: 'teacher', email: r.email, name: name, paidUntil: await EY.expiry(r.email), exam: r.exam });
    }
    if (action === 'admin_handoff') {
      // 401 нь admin.html-ийн adminFetch-ийг гаргана — зөвхөн админ токен хүчингүй үед л
      if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Админ эрх шаардлагатай' });
      if (!(await rateLimit('eyesh_adm_ip:' + clientIp(req), 60, 600))) return res.status(429).json({ ok: false, error: TOO_MANY });
      const code = await EY.createHandoff(EY.ADMIN_HANDOFF, null);
      return res.json({ ok: true, url: EY.ADMIN_URL, code: code, ttl: EY.HANDOFF_SEC });
    }
    const email = wsEmail(b.wstoken);
    if (!email) return res.status(401).json({ ok: false, needLogin: true, error: 'Эхлээд Дасгалын төвийн бүртгэлээрээ нэвтэрнэ үү.' });
    const em = String(email).toLowerCase();
    if (em === EY.ADMIN_HANDOFF) return res.status(401).json({ ok: false, needLogin: true, error: 'Эхлээд Дасгалын төвийн бүртгэлээрээ нэвтэрнэ үү.' });
    if (action === 'status') {
      if (!(await rateLimit('eyesh_st:' + em.slice(0, 254), 120, 600))) return res.status(429).json({ ok: false, error: TOO_MANY });
      const exp = await EY.expiry(em);
      return res.json({ ok: true, email: em, price: EY.eyeshPrice(), days: EY.EYESH_DAYS, expiry: exp, active: !!exp });
    }
    if (action === 'handoff') {
      if (!(await rateLimit('eyesh_ho:' + em.slice(0, 254), 30, 600)) || !(await rateLimit('eyesh_ho_ip:' + clientIp(req), 120, 600)))
        return res.status(429).json({ ok: false, error: TOO_MANY });
      const n = EY.normExam(b.exam);
      if (!n.ok) return res.status(400).json({ ok: false, error: n.error });
      const code = await EY.createHandoff(em, n.exam);
      return res.json({ ok: true, url: EY.SSO_URL, code: code, ttl: EY.HANDOFF_SEC });
    }
    return res.status(400).json({ ok: false, error: 'Үйлдэл буруу' });
  } catch (e) {
    console.error('[eyesh]', action, e.message);
    return res.status(500).json({ ok: false, error: 'Түр алдаа гарлаа. Дахин оролдоно уу.' });
  }
};
