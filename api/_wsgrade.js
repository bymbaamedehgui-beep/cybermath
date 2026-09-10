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

async function grantGradeMonths(email, grade, months) {
  await ensureGradeTable();
  const exp = new Date();
  exp.setDate(exp.getDate() + monthsToDays(months));
  await pool.query(
    `INSERT INTO ws_grade_access (email, grade, expires_at, updated_at) VALUES ($1,$2,$3,NOW())
     ON CONFLICT (email, grade) DO UPDATE
       SET expires_at = GREATEST(ws_grade_access.expires_at, EXCLUDED.expires_at), updated_at = NOW()`,
    [String(email).trim().toLowerCase(), grade, exp.toISOString()]);
  return exp;
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
    for (const r of p.rows) {
      const grade = sgGrade[r.grp] || (/^\d+-р анги$/.test(r.grp) ? r.grp : null);
      if (!grade) continue;                                   // танихгүй бүлэг — алгасна
      const slug = String(r.slug || '').toLowerCase();
      const bag = r.kind === 'remove' ? out.remove : out.add;
      (bag[slug] = bag[slug] || new Set()).add(grade);
    }
  } catch (e) { console.error('[wsgrade place]', e.message); }
  placeCache = out; placeAt = Date.now();
  return out;
}

// Тухайн хуудас ЯМАР ангиудад харагдаж байгааг буцаана (нэгээс олон байж болно)
async function gradesForSlug(slug) {
  slug = String(slug || '').toLowerCase().replace(/^\//, '');
  if (!slug) return [];
  const cat = loadCatalog();
  const pl = await loadPlacements();
  const set = new Set(cat[slug] || []);
  const rm = pl.remove[slug]; if (rm) rm.forEach(g => set.delete(g));
  const ad = pl.add[slug]; if (ad) ad.forEach(g => set.add(g));
  return Array.from(set);
}

// Каталогт байгаа бүх анги (үнийн жагсаалт, админд)
function allGrades() {
  const cat = loadCatalog();
  const s = new Set();
  Object.keys(cat).forEach(k => cat[k].forEach(g => s.add(g)));
  return Array.from(s).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
}

module.exports = {
  ensureGradeTable, grantGradeMonths, revokeGrade, activeGrades,
  gradesForSlug, allGrades, monthsToDays,
};
