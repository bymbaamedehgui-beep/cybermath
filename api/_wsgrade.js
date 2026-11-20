// Ажлын хуудсыг АНГИАР худалдан авах эрх.
//  - ws_grade_access(email, grade) — тухайн ангийн бүх ажлын хуудсанд хандах эрх
//  - slug → анги тодорхойлох: catalog.js (суурь) + ws_place/ws_subgroups (админы зөөлт)
// Бүх ангийн эрх (ws_access) нь урьдын адил тусдаа, аль нэг нь идэвхтэй бол хуудас нээлттэй.
const pool = require('./_db');

// ───────────────────────── эрхийн хүснэгт ─────────────────────────
let gradeTableReady = false;
async function ensureGradeTable() {
  if (gradeTableReady) return;
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_grade_access (
    email TEXT NOT NULL,
    grade TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (email, grade)
  )`).catch(() => {});
  gradeTableReady = true;
}

// Сар → хоног (12 сар = 365 хоног, бусад нь 30 хоногоор)
function monthsToDays(months) { return months >= 12 ? 365 : months * 30; }

// db — транзакцын client (заавал биш; ЭЕШ багц api/qpay.js settleEeshPack). DDL (ensureGradeTable) нь pool-оор — транзакцаас өмнө дууд.
async function grantGradeMonths(email, grade, months, db) {
  await ensureGradeTable();
  const exp = new Date();
  exp.setDate(exp.getDate() + monthsToDays(months));
  await (db || pool).query(
    `INSERT INTO ws_grade_access (email, grade, expires_at, updated_at) VALUES ($1,$2,$3,NOW())
     ON CONFLICT (email, grade) DO UPDATE
       SET expires_at = GREATEST(ws_grade_access.expires_at, EXCLUDED.expires_at), updated_at = NOW()`,
    [String(email).trim().toLowerCase(), grade, exp.toISOString()]);
  return exp;
}

// Худалдан авалтын олголт (api/qpay.js settleWsTx): одоогийн дуусах хугацаан ДЭЭР нэмнэ — дуусахаас өмнө сунгавал үлдсэн
// хоног алдагдахгүй. Тиймээс claim-тай транзакц дотор л (db) дууд. Олон ангийг нэг SQL-ээр. DDL-ийг транзакцаас өмнө.
const EXTEND_SQL = `INSERT INTO ws_grade_access (email, grade, expires_at, updated_at)
     SELECT $1, g, NOW() + make_interval(days => $3::int), NOW() FROM unnest($2::text[]) AS g
     ON CONFLICT (email, grade) DO UPDATE
       SET expires_at = GREATEST(ws_grade_access.expires_at, NOW()) + make_interval(days => $3::int), updated_at = NOW()
     RETURNING grade, expires_at`;
async function extendGrades(email, grades, days, db) {
  const r = await (db || pool).query(EXTEND_SQL, [String(email).trim().toLowerCase(), grades, days]);
  return r.rows;
}

async function revokeGrade(email, grade) {
  await ensureGradeTable();
  await pool.query('DELETE FROM ws_grade_access WHERE email=$1 AND grade=$2',
    [String(email).trim().toLowerCase(), grade]);
}

// Хэрэглэгчийн идэвхтэй ангиуд → [{grade, expires_at}]
async function activeGrades(email) {
  if (!email) return [];
  await ensureGradeTable();
  const r = await pool.query(
    'SELECT grade, expires_at FROM ws_grade_access WHERE email=$1 AND expires_at > NOW() ORDER BY grade',
    [String(email).trim().toLowerCase()]);
  return r.rows;
}

// ───────────────────────── slug → анги ─────────────────────────
// catalog.js-ийг node дотор ачаалахад window хэрэгтэй (файл нь window.WS_LIST=... гэж бичдэг)
let catalogMap = null;                       // { slug: [анги, ...] }
function loadCatalog() {
  if (catalogMap) return catalogMap;
  const m = {};
  try {
    if (typeof global.window === 'undefined') global.window = {};
    require('../catalog.js');
    const list = (global.window && global.window.WS_LIST) || [];
    for (const grp of list) {
      const grade = grp[0];
      for (const row of (grp[1] || [])) {
        const slug = String(row[0] || '').toLowerCase();
        if (!slug) continue;
        (m[slug] = m[slug] || []).push(grade);
      }
    }
  } catch (e) { console.error('[wsgrade catalog]', e.message); }
  catalogMap = m;
  return m;
}

// ws_place-ийн зөөлтүүдийг богино хугацаанд кэшлэнэ (хуудас ачаалал бүрд query хийхгүй)
let placeCache = null, placeAt = 0;
const PLACE_TTL = 60 * 1000;
async function loadPlacements() {
  if (placeCache && Date.now() - placeAt < PLACE_TTL) return placeCache;
  const out = { add: {}, remove: {} };                       // { slug: Set(анги) }
  try {
    const sg = await pool.query('SELECT id, grade FROM ws_subgroups');
    const sgGrade = {};
    sg.rows.forEach(r => { sgGrade['sg:' + r.id] = r.grade; });
    const p = await pool.query("SELECT grp, slug, kind FROM ws_place");
    const known = new Set(allGrades());                       // каталогийн тоон бус бүлэг (ЭЕШ, Монгол хэл …)
    for (const r of p.rows) {
      const grade = sgGrade[r.grp] || ((/^\d+-р анги$/.test(r.grp) || known.has(r.grp)) ? r.grp : null);
      if (!grade) continue;                                   // танихгүй бүлэг — алгасна
      const slug = String(r.slug || '').toLowerCase();
      const bag = r.kind === 'remove' ? out.remove : out.add;
      (bag[slug] = bag[slug] || new Set()).add(grade);
    }
  } catch (e) { console.error('[wsgrade place]', e.message); }
  placeCache = out; placeAt = Date.now();
  return out;
}

// vercel.json-ийн богино зам (ж: /negativ → /negativ-too-100.html). ws-store.js slug-ийг URL-ын сүүлийн хэсгээс авдаг тул
// богино замаар нээсэн хуудсын ангийг жинхэнэ файлын нэрээр нь тодорхойлно (эс бөгөөс ангийн эрх тэр хуудсыг нээдэггүй).
let aliasMap = null;
function loadAliases() {
  if (aliasMap) return aliasMap;
  const m = {};
  try {
    const v = require('../vercel.json');
    (v.routes || []).forEach(function (r) {
      if (!r || typeof r.src !== 'string' || typeof r.dest !== 'string') return;
      if (!/^\/[A-Za-z0-9_.-]+\/?$/.test(r.src)) return;
      const d = r.dest.replace(/^\//, '').toLowerCase();
      if (!/^[a-z0-9_.-]+\.html$/.test(d)) return;
      const s = r.src.replace(/^\//, '').replace(/\/$/, '').toLowerCase();
      if (s && s !== d) m[s] = d;
    });
  } catch (e) { console.error('[wsgrade aliases]', e.message); }
  aliasMap = m;
  return m;
}

// Тухайн хуудас ЯМАР ангиудад харагдаж байгааг буцаана (нэгээс олон байж болно)
async function gradesForSlug(slug) {
  slug = String(slug || '').toLowerCase().replace(/^\//, '');
  if (!slug) return [];
  const cat = loadCatalog();
  const pl = await loadPlacements();
  function forSlug(s) {
    const set = new Set(cat[s] || []);
    const rm = pl.remove[s]; if (rm) rm.forEach(g => set.delete(g));
    const ad = pl.add[s]; if (ad) ad.forEach(g => set.add(g));
    return set;
  }
  let set = forSlug(slug);
  if (!set.size) { const real = loadAliases()[slug]; if (real) set = forSlug(real); }
  return Array.from(set);
}

// Каталогт байгаа бүх анги (үнийн жагсаалт, админд)
function allGrades() {
  const cat = loadCatalog();
  const s = new Set();
  Object.keys(cat).forEach(k => cat[k].forEach(g => s.add(g)));
  // тоон ангиуд эхэлж дугаараар, дараа нь хичээлийн бүлгүүд (Монгол хэл г.м) цагаан толгойгоор
  const num = x => { const m = /^(\d+)/.exec(x); return m ? +m[1] : Infinity; };
  return Array.from(s).sort((a, b) => (num(a) - num(b)) || a.localeCompare(b, 'mn'));
}

module.exports = {
  ensureGradeTable, grantGradeMonths, extendGrades, revokeGrade, activeGrades,
  gradesForSlug, allGrades, monthsToDays,
};
