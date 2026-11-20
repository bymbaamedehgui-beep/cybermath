// Дасгалын төвийн хугацаат багц + «шинэ хэрэглэгчийн 7 хоногийн хямдрал» (эзэмшигч 2026-11-20).
//  • Үнийн суурь: нэг анги × нэг сар = WS_GRADE_PRICE (9,900₮). Багцын жинхэнэ (зурсан) үнэ = анги × сар × 9,900.
//  • 1 сар — нэг анги (plan 'wsgrade'); 3 сар → 3 анги сонгоно, 6 сар → 6 анги (ws_grade_access); 12 сар → бүх анги (ws_access).
//  • Хямдралтай үнэ (BUNDLES[].price):
//    – ажлын хуудасны эрх ХУДАЛДАН АВААГҮЙ данс — бүртгүүлснээс хойш OFFER_DAYS хоног (OFFER_FROM-оос өмнө бүртгүүлсэн
//      хуучин данс — OFFER_FROM-оос, «өнөөдрөөс эхлээд»), дараа нь жинхэнэ үнэ;
//    – худалдан авч байсан хэрэглэгч — сунгахдаа ҮРГЭЛЖ хямдралтай (эзэмшигч: сунгах цонхонд хямдралыг харуулах), тоолуургүй.
//  • Хугацааг ЗӨВХӨН DB-ийн NOW()-оор (клиентийн цагт итгэхгүй). Шалгаж чадахгүй бол хямдралгүй (fail-closed).
const pool = require('./_db');

const BUNDLES = [
  { months: 3, grades: 3, price: 39900 },
  { months: 6, grades: 6, price: 69900 },
  { months: 12, grades: 0, price: 119900 },   // 0 — бүх анги
];
const OFFER_DAYS = 7;
const OFFER_FROM_DEFAULT = '2026-11-21T00:00:00+08:00';   // хуучин данс: 11/27-ны 23:59 (Улаанбаатар) хүртэл
const DAY_MS = 864e5;

function perMonth() { return parseInt(process.env.WS_GRADE_PRICE || '9900', 10); }
function offerFrom() {
  const t = Date.parse(process.env.WS_OFFER_FROM || OFFER_FROM_DEFAULT);
  return isFinite(t) ? t : Date.parse(OFFER_FROM_DEFAULT);
}
function bundle(months) {
  const m = parseInt(months, 10);
  return BUNDLES.filter(function (b) { return b.months === m; })[0] || null;
}
// «Бүх анги»-ийн жинхэнэ үнэд зөвхөн «N-р анги»-ийг тоолно (ЭЕШ, Олимпиад г.м. нэмэлт бүлэг үнэгүй дагалдана)
function numericCount(grades) {
  const n = (grades || []).filter(function (g) { return /^\d+-р анги$/.test(g); }).length;
  return n || 11;
}
function gradeCount(b, grades) { return b.grades || numericCount(grades); }
function listPrice(months, grades) {
  const b = bundle(months);
  return b ? gradeCount(b, grades) * b.months * perMonth() : 0;
}
function price(months, eligible, grades) {
  const b = bundle(months);
  if (!b) return 0;
  const list = listPrice(months, grades);
  return eligible ? Math.min(b.price, list) : list;
}
// Клиентэд: багц бүрийн жинхэнэ ба төлөх үнэ (eligible биш бол хоёулаа жинхэнэ үнэ)
function view(eligible, grades) {
  return BUNDLES.map(function (b) {
    return { months: b.months, grades: b.grades || 'all', count: gradeCount(b, grades),
      list: listPrice(b.months, grades), price: price(b.months, eligible, grades) };
  });
}
// Сонгосон ангиуд: давхардалгүй, бүгд каталогт, ЯГ need ширхэг. Эс бөгөөс null. Дараалал — каталогийн (all) дарааллаар.
function normGrades(input, need, all) {
  if (!Array.isArray(input) || input.length > 40) return null;
  const set = new Set();
  for (const x of input) {
    if (typeof x !== 'string') return null;
    const g = x.trim();
    if (!g || all.indexOf(g) < 0) return null;
    set.add(g);
  }
  if (set.size !== need) return null;
  return all.filter(function (g) { return set.has(g); });
}

const OFFER_SQL = `SELECT NOW() AS now,
  (SELECT created_at FROM ws_login WHERE email=$1) AS reg,
  (EXISTS (SELECT 1 FROM ws_purchases WHERE LOWER(email)=$1)
    OR EXISTS (SELECT 1 FROM ws_pending WHERE LOWER(email)=$1 AND granted)) AS bought`;
// → { eligible, until (ISO|null — зөвхөн шинэ хэрэглэгчийн тоолуур), customer (худалдан авч байсан), server_now (ms), bought, days }
async function offer(email) {
  email = String(email || '').trim().toLowerCase();
  if (!email) return { eligible: false, until: null, days: OFFER_DAYS };
  try {
    const r = (await pool.query(OFFER_SQL, [email])).rows[0] || {};
    const now = r.now ? new Date(r.now).getTime() : Date.now();
    if (r.bought) return { eligible: true, customer: true, until: null, server_now: now, bought: true, days: OFFER_DAYS };
    const reg = r.reg ? new Date(r.reg).getTime() : 0;
    const until = Math.max(reg || 0, offerFrom()) + OFFER_DAYS * DAY_MS;
    const eligible = now < until;
    return { eligible: eligible, customer: false, until: eligible ? new Date(until).toISOString() : null, server_now: now,
      bought: false, days: OFFER_DAYS };
  } catch (e) {
    console.error('[wsoffer]', e.message);
    return { eligible: false, until: null, days: OFFER_DAYS, error: true };   // харуулахад жинхэнэ үнэ; нэхэмжлэх үүсгэхгүй (503)
  }
}

module.exports = { BUNDLES, OFFER_DAYS, OFFER_SQL, bundle, listPrice, price, view, normGrades, offer, offerFrom, perMonth };
