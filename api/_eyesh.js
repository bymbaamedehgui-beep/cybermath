// ЭЕШ шалгагч (eyeshcheck.com) — Дасгалын төвийн НЭМЭЛТ эрх: 1 сар (EYESH_PRICE, анхдагч 9900₮), сарын турш шалгалт хязгааргүй.
// Дуудагчид: api/qpay.js (create plan='eyesh' → settleEyesh), api/eyesh.js (эрх, нэвтрэх код, eyeshcheck-ийн redeem).
//   ws_eyesh_access    (email) → expires_at      — дахин авбал үлдсэн хоног дээр НЭМЭГДЭНЭ
//   ws_eyesh_purchases (invoice_id UNIQUE)       — борлуулалтын бүртгэл (тайлангийн «ЭЕШ шалгагч» сав)
//   ws_eyesh_handoff   (code_hash) → email, exam, material — eyeshcheck руу нэвтрэх НЭГ УДААГИЙН код (HANDOFF_SEC). Кодыг
//                                                  өөрийг нь хадгалахгүй (sha256), redeem нь мөрийг устгаж буцаана — давтан ашиглагдахгүй.
//                                                  material — шалгалтын материал (хувилбаруудын хуудас, gzip+base64; eyesh-link.js),
//                                                  eyeshcheck «ЭЕШ материал»-д шалгалттай нь хадгалагдана (сурагчид харахгүй).
'use strict';
const crypto = require('crypto');
const pool = require('./_db');

const EYESH_DAYS = 30;
const HANDOFF_SEC = 120;
const SSO_URL = 'https://eyeshcheck.com/api/cm/sso';
// Админы «ЭЕШ шалгагч» цэс (admin.html) → eyeshcheck.com/cm-admin (iframe) руу нэвтрэх НЭГ УДААГИЙН код. Имэйл байж
// болохгүй энэ тэмдгээр (ws_eyesh_handoff.email) багшийн кодоос ялгагдана; redeem нь зөвхөн { kind:'admin' } буцаана.
const ADMIN_HANDOFF = '@admin';
const ADMIN_URL = 'https://eyeshcheck.com/cm-admin';
function eyeshPrice() {
  const n = parseInt(process.env.EYESH_PRICE, 10);
  return Number.isFinite(n) && n >= 100 && n <= 1000000 ? n : 9900;
}

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async function () {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_eyesh_access (
        email TEXT PRIMARY KEY,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_eyesh_purchases (
        id SERIAL PRIMARY KEY,
        invoice_id TEXT UNIQUE,
        email TEXT NOT NULL,
        amount INT NOT NULL,
        days INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_ws_eyesh_purch_created ON ws_eyesh_purchases(created_at)');
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_eyesh_handoff (
        code_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        exam JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
      )`);
      await pool.query('ALTER TABLE ws_eyesh_handoff ADD COLUMN IF NOT EXISTS material TEXT');
    })().catch(function (e) {
      ready = null;
      if (e && (e.code === '23505' || e.code === '42P07')) return;   // зэрэг CREATE — аль хэдийн бий
      throw e;
    });
  }
  return ready;
}

// Идэвхтэй эрхийн дуусах огноо (ISO) эсвэл null
async function expiry(email) {
  if (!email) return null;
  await ensure();
  const r = await pool.query('SELECT expires_at FROM ws_eyesh_access WHERE email=$1 AND expires_at > NOW()', [String(email).toLowerCase()]);
  return r.rows.length ? new Date(r.rows[0].expires_at).toISOString() : null;
}
// Олголт: дуусаагүй бол дуусах огноон дээр, дууссан бол одооноос days хоног. db — транзакцын client.
async function grant(email, days, db) {
  const r = await (db || pool).query(
    `INSERT INTO ws_eyesh_access (email, expires_at) VALUES ($1, NOW() + make_interval(days => $2::int))
     ON CONFLICT (email) DO UPDATE
       SET expires_at = GREATEST(ws_eyesh_access.expires_at, NOW()) + make_interval(days => $2::int), updated_at = NOW()
     RETURNING expires_at`, [String(email).toLowerCase(), days]);
  return new Date(r.rows[0].expires_at).toISOString();
}
async function record(p, db) {
  await (db || pool).query(
    `INSERT INTO ws_eyesh_purchases (invoice_id, email, amount, days) VALUES ($1,$2,$3,$4)
     ON CONFLICT (invoice_id) DO NOTHING`,
    [p.invoice_id, String(p.email).toLowerCase(), p.amount | 0, p.days | 0]);
}

// ── Шалгалтын тодорхойлолт (клиентээс ирсэн хувилбарыг шалгаж eyeshcheck-ийн загварт хөрвүүлнэ) ──
// Сэдэв — eyeshcheck-ийн «Математик» жагсаалтын нэрс (pages/index.js TOPICS_BY_SUBJECT). Хувилбар бүрт бодлогын төрөл эхтэйгээ ижил.
const TOPICS = {
  2024: ['Тооны онол', 'Статистик', 'Алгебр', 'Алгебр', 'Геометр', 'Статистик', 'Геометр', 'Анализ', 'Тооны онол', 'Тооны онол',
         'Алгебр', 'Геометр', 'Тригонометр', 'Геометр', 'Анализ', 'Алгебр', 'Статистик', 'Статистик', 'Анализ', 'Алгебр',
         'Алгебр', 'Статистик', 'Функц', 'Алгебр', 'Геометр', 'Алгебр', 'Геометр', 'Статистик', 'Тооны онол', 'Алгебр',
         'Анализ', 'Геометр', 'Геометр', 'Анализ', 'Алгебр', 'Геометр'],
  2023: ['Тооны онол', 'Геометр', 'Геометр', 'Бусад', 'Алгебр', 'Статистик', 'Функц', 'Геометр', 'Статистик', 'Алгебр',
         'Тооны онол', 'Тригонометр', 'Геометр', 'Алгебр', 'Анализ', 'Статистик', 'Геометр', 'Алгебр', 'Алгебр', 'Алгебр',
         'Тригонометр', 'Геометр', 'Геометр', 'Геометр', 'Анализ', 'Статистик', 'Статистик', 'Анализ', 'Тригонометр', 'Алгебр',
         'Статистик', 'Анализ', 'Геометр', 'Алгебр', 'Анализ', 'Алгебр'],
  2022: ['Тооны онол', 'Статистик', 'Функц', 'Бусад', 'Алгебр', 'Геометр', 'Геометр', 'Анализ', 'Тооны онол', 'Алгебр',
         'Алгебр', 'Геометр', 'Статистик', 'Геометр', 'Анализ', 'Тригонометр', 'Алгебр', 'Статистик', 'Геометр', 'Анализ',
         'Алгебр', 'Алгебр', 'Алгебр', 'Алгебр', 'Функц', 'Тригонометр', 'Геометр', 'Анализ', 'Геометр', 'Статистик',
         'Анализ', 'Алгебр', 'Геометр', 'Статистик', 'Геометр', 'Алгебр'],
};
const SEC1_N = 36, S2_SUBS = ['2.1', '2.2', '2.3', '2.4'], S2_ROWS = 'abcdefgh', S2_PTS = 7;
// Нэг шалгалтын хувилбарууд (eyeshcheck lib/eyesh.js VARIANTS): A нь үндсэн, B–F нь exam.variants. Сурагч хариултын хуудасны
// «ХУВИЛБАР»-ыг будна → тэр хувилбарын түлхүүрээр дүгнэнэ.
const VAR_L = ['A', 'B', 'C', 'D', 'E', 'F'];
// ЭЕШ-ийн оноо: 1–8 → 1, 9–28 → 2, 29–36 → 3 (нийт 72) + нөхөх 4 × 7 = 28
function sec1Pts(n) { return n <= 8 ? 1 : (n <= 28 ? 2 : 3); }
function normVariant(v) {
  if (v === 'orig') return 'orig';
  const n = Number(v);
  return Number.isInteger(n) && n >= 1000 && n <= 9999 ? n : null;
}
function normBuild(g) { g = String(g == null ? '' : g).toLowerCase(); return /^[0-9a-z]{0,8}$/.test(g) ? g : null; }
function vText(v, g) { return v === 'orig' ? 'Эх' : '№' + v + (g ? '·' + g : ''); }
// total оноог нүднүүдэд тэнцүү хуваана (0.001 нарийвчлал, үлдэгдлийг сүүлчийнхэд) → нийлбэр яг total
function splitPts(cells, total, out) {
  const n = cells.length, per = Math.floor(total * 1000 / n) / 1000;
  cells.forEach(function (c, i) { out[c] = i < n - 1 ? per : Math.round((total - per * (n - 1)) * 1000) / 1000; });
}
// Нөхөх даалгаврын нэг бодлого: ans {a:'3', bc:'11', …} (нүд бүр a–h-д, нэг цифр/тэмдэгт), parts [['abc', 2], …] —
// дэд асуултын оноо (хуудсан дээрх «(2 оноо)»), нийлбэр нь 7. parts буруу/байхгүй бол 7 оноог бүх нүдэнд тэнцүү хуваана.
// → { cells: {a:'3', …}, score: {a:0.667, …} } эсвэл null (a–h-д багтахгүй / буруу)
function normS2Item(it) {
  if (!it || typeof it !== 'object' || !it.ans || typeof it.ans !== 'object' || Array.isArray(it.ans)) return null;
  const cells = {};
  for (const name of Object.keys(it.ans)) {
    const val = String(it.ans[name]);
    if (!/^[a-h]{1,8}$/.test(name) || !/^[0-9.\-]{1,8}$/.test(val) || val.length !== name.length) return null;
    for (let i = 0; i < name.length; i++) { if (cells[name[i]] != null) return null; cells[name[i]] = val[i]; }
  }
  const letters = Object.keys(cells).sort();
  if (!letters.length) return null;
  const score = {}, seen = {};
  let ok = Array.isArray(it.parts) && it.parts.length > 0 && it.parts.length <= 8, sum = 0;
  if (ok) {
    for (const p of it.parts) {
      const pts = Array.isArray(p) ? Number(p[1]) : NaN;
      const pc = Array.isArray(p) && typeof p[0] === 'string' && p[0].length <= 40
        ? p[0].split('').filter(function (c, i, a) { return cells[c] != null && !seen[c] && a.indexOf(c) === i; }) : [];
      if (!(Number.isInteger(pts) && pts >= 1 && pts <= S2_PTS) || !pc.length) { ok = false; break; }
      pc.forEach(function (c) { seen[c] = 1; });
      splitPts(pc, pts, score);
      sum += pts;
    }
    if (ok && (sum !== S2_PTS || letters.some(function (c) { return !seen[c]; }))) ok = false;
  }
  if (!ok) { Object.keys(score).forEach(function (k) { delete score[k]; }); splitPts(letters, S2_PTS, score); }
  return { cells: cells, score: score };
}
// ── Бүлгийн шалгалтын материал (cmx.js, 6–8-р анги): 10 тест, хувилбарын код ──
// ref = wsRef(slug, код, түлхүүр) — cmx.js-ийн wsRef-тэй ЯГ ижил: хариултын хуудсан дээр хэвлэсэн шалгалтын код (tag) нь
// eyeshcheck-ийн ws:-шалгалтын tag (examTag(ref))-тэй таарна.
const EYC_TOPICS = ['Алгебр', 'Геометр', 'Тригонометр', 'Статистик', 'Тооны онол', 'Анализ', 'Функц', 'Бусад'];
function fnv(s, h) { h = h >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function hex8(n) { return ('0000000' + (n >>> 0).toString(16)).slice(-8); }
function wsRef(slug, seed, key) { const s = slug + '|' + seed + '|' + key; return 'ws:' + (hex8(fnv(s, 2166136261)) + hex8(fnv(s, 0x9747b28c)) + hex8(fnv(s + '#', 2166136261))).slice(0, 20); }
function cleanTitle(t) { return String(t == null ? '' : t).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120); }
//   raw = { kind:'ws', slug:'shalgalt-material-3-6.html', seed:'K7Q2M', key:'ABDC…', scores:[1,…], topics:['Алгебр',…], title?,
//           variants?: [{ seed, key, scores, topics }, …] }  — олон хувилбар (B, C…): нэг шалгалт, хуудас бүрт нэг шалгалтын код
//   (ref = wsRef(slug, 'K7Q2M+…', 'ABDC…+…') — cmx.js setRef-тэй ЯГ ижил), ХУВИЛБАР нь хариултын хуудсан дээр урьдчилан будагдана.
function normWsExam(raw) {
  const fail = function (e) { return { ok: false, error: e }; };
  const slug = String(raw.slug || ''), seed = String(raw.seed || ''), key = String(raw.key || '');
  if (!/^[a-z0-9][a-z0-9-]{0,80}\.html$/.test(slug)) return fail('Хуудас буруу байна');
  if (!/^[2-9A-HJ-NP-Z]{5}$/.test(seed)) return fail('Хувилбарын код буруу байна');
  if (!/^[A-E]{1,60}$/.test(key)) return fail('Тестийн зарим бодлого үүсээгүй байна. «Шинэ хувилбар» дарж дахин оролдоно уу.');
  const n = key.length;
  const okSc = function (sc) { return Array.isArray(sc) && sc.length === n && sc.every(function (v) { return typeof v === 'number' && isFinite(v) && v > 0 && v <= 10; }); };
  const okTp = function (tp) { return Array.isArray(tp) && tp.length === n && tp.every(function (t) { return EYC_TOPICS.indexOf(t) >= 0; }); };
  if (!okSc(raw.scores)) return fail('Тестийн оноо буруу байна');
  if (!okTp(raw.topics)) return fail('Тестийн сэдэв буруу байна');
  const vr = raw.variants == null ? [] : raw.variants;
  if (!Array.isArray(vr) || vr.length > VAR_L.length - 1) return fail('Хувилбарын тоо буруу байна');
  const variants = {}, seeds = [seed], keys = [key];
  for (let i = 0; i < vr.length; i++) {
    const x = vr[i] || {}, L = VAR_L[i + 1], s = String(x.seed || ''), k = String(x.key || '');
    if (!/^[2-9A-HJ-NP-Z]{5}$/.test(s) || seeds.indexOf(s) >= 0) return fail(L + ' хувилбарын код буруу байна');
    if (k.length !== n || !/^[A-E]+$/.test(k)) return fail(L + ' хувилбарын тестийн зарим бодлого үүсээгүй байна. Дахин оролдоно уу.');
    if (!okSc(x.scores) || !okTp(x.topics)) return fail(L + ' хувилбарын тестийн оноо/сэдэв буруу байна');
    variants[L] = { sec1Key: k.split(''), sec1Scores: x.scores.slice(), topics: x.topics.slice() };
    seeds.push(s); keys.push(k);
  }
  const multi = seeds.length > 1;
  const title = cleanTitle(raw.title) || ('Шалгалт · ' + seed + (multi ? ' · ' + seeds.length + ' хувилбар' : ''));
  const exam = {
    ref: multi ? wsRef(slug, seeds.join('+'), keys.join('+')) : wsRef(slug, seed, key), title: title, subject: 'Математик',
    sec1Count: n, sec1Key: key.split(''), sec1Scores: raw.scores.slice(), topics: raw.topics.slice(),
    useSec2: false, sec2Config: {}, sec2Score: 1,
    meta: { kind: 'ws', slug: slug, seed: seed },
  };
  if (multi) { exam.variants = variants; exam.meta.seeds = seeds; }
  return { ok: true, exam: exam };
}
// 1-р хэсэг { v, g, key } → { v, g, key } | алдааны мөр (pre — хувилбарын тэмдэг, ж: 'B хувилбарын ')
function normEeshP1(p1, pre) {
  const v = normVariant(p1 && p1.v), g = normBuild(p1 && p1.g), key = String((p1 && p1.key) || '');
  if (v == null || g == null) return pre + '1-р хэсгийн хувилбар буруу байна';
  if (!new RegExp('^[A-E]{' + SEC1_N + '}$').test(key)) return pre + '1-р хэсгийн зарим бодлого үүсээгүй байна. «Шинэ хувилбар» дарж дахин оролдоно уу.';
  return { v: v, g: g, key: key };
}
// 2-р хэсэг { v, g, items[4] } → { v, g, cfg } | алдааны мөр
function normEeshP2(p2, pre) {
  const v = normVariant(p2 && p2.v), g = normBuild(p2 && p2.g), items = p2 && p2.items;
  if (v == null || g == null || !Array.isArray(items) || items.length !== S2_SUBS.length) return pre + '2-р хэсгийн хувилбар буруу байна';
  const cfg = {};
  for (let k = 0; k < S2_SUBS.length; k++) {
    const s = normS2Item(items[k]);
    if (!s) return pre + '2-р хэсгийн ' + S2_SUBS[k] + '-ийн хариу ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтахгүй байна';
    const c = { _enabled: true };
    S2_ROWS.split('').forEach(function (r) { c[r] = s.cells[r] != null ? { ans: s.cells[r], score: s.score[r] } : { ans: '', score: 1 }; });
    cfg[S2_SUBS[k]] = c;
  }
  return { v: v, g: g, cfg: cfg };
}
// 2-р хэсгийн нүдний хариу (ref-д): ['31471114', …]
function s2Sig(cfg) { return S2_SUBS.map(function (s) { return S2_ROWS.split('').map(function (r) { return cfg[s][r].ans; }).join(''); }); }
// Клиентийн хувилбар → eyeshcheck-ийн шалгалт:
//   raw = { year, title?, p1: { v, g, key: 'EDCA…'(36) }, p2: null | { v, g, items: [{ ans, parts }] ×4 },
//           variants?: [{ p1, p2 }, …] }                                                           — ЭЕШ (variants: B, C… хувилбар)
//   raw = { kind:'ws', … }                                                                            — бүлгийн шалгалт
// → { ok:true, exam } эсвэл { ok:false, error }. exam.ref — ижил хариутай шалгалтыг eyeshcheck-д давхар үүсгэхгүй.
// Олон хувилбартай бол exam.variants = { B:{ sec1Key, sec1Scores, topics, sec2Config? }, … } (2-р хэсэг A-д байвал бүгдэд).
function normExam(raw) {
  const fail = function (e) { return { ok: false, error: e }; };
  if (!raw || typeof raw !== 'object') return fail('Шалгалтын мэдээлэл дутуу байна');
  if (raw.kind === 'ws') return normWsExam(raw);
  const year = parseInt(raw.year, 10);
  if (!TOPICS[year]) return fail('Энэ ЭЕШ-ийн хувилбарыг ЭЕШ шалгагчид оруулах боломжгүй');
  const a1 = normEeshP1(raw.p1, '');
  if (typeof a1 === 'string') return fail(a1);
  const sec1Key = a1.key.split(''), sec1Scores = [], topics = TOPICS[year].slice();
  for (let n = 1; n <= SEC1_N; n++) sec1Scores.push(sec1Pts(n));
  const useSec2 = !!raw.p2, a2 = useSec2 ? normEeshP2(raw.p2, '') : null;
  if (typeof a2 === 'string') return fail(a2);
  const sec2Config = useSec2 ? a2.cfg : {};
  const vr = raw.variants == null ? [] : raw.variants;
  if (!Array.isArray(vr) || vr.length > VAR_L.length - 1) return fail('Хувилбарын тоо буруу байна');
  const variants = {}, vmeta = [], vsig = [];
  for (let i = 0; i < vr.length; i++) {
    const L = VAR_L[i + 1], x = vr[i] || {}, pre = L + ' хувилбарын ';
    const b1 = normEeshP1(x.p1, pre);
    if (typeof b1 === 'string') return fail(b1);
    const o = { sec1Key: b1.key.split(''), sec1Scores: sec1Scores.slice(), topics: topics.slice() }, m = { L: L, p1: { v: b1.v, g: b1.g }, p2: null };
    if (useSec2) {
      if (!x.p2) return fail(pre + '2-р хэсэг дутуу байна');
      const b2 = normEeshP2(x.p2, pre);
      if (typeof b2 === 'string') return fail(b2);
      o.sec2Config = b2.cfg; m.p2 = { v: b2.v, g: b2.g };
    }
    variants[L] = o; vmeta.push(m); vsig.push([b1.key, useSec2 ? s2Sig(o.sec2Config) : null]);
  }
  const auto = 'ЭЕШ ' + year + ' · Сонгох ' + vText(a1.v, a1.g) + (useSec2 ? ' · Нөхөх ' + vText(a2.v, a2.g) : '')
    + (vr.length ? ' · ' + (vr.length + 1) + ' хувилбар' : '');
  const title = String(raw.title == null ? '' : raw.title).replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || auto;
  const sig = [year, sec1Key, useSec2 ? s2Sig(sec2Config) : null];
  if (vr.length) sig.push(vsig);                     // нэг хувилбартайд ref өмнөхтэй ижил хэвээр
  const ref = 'eesh' + year + ':' + crypto.createHash('sha1').update(JSON.stringify(sig)).digest('hex').slice(0, 20);
  const exam = {
    ref: ref, title: title, subject: 'Математик', sec1Count: SEC1_N, sec1Key: sec1Key, sec1Scores: sec1Scores, topics: topics,
    useSec2: useSec2, sec2Config: sec2Config, sec2Score: 1,
    meta: { year: year, p1: { v: a1.v, g: a1.g }, p2: useSec2 ? { v: a2.v, g: a2.g } : null },
  };
  if (vr.length) { exam.variants = variants; exam.meta.variants = vmeta; }
  return { ok: true, exam: exam };
}

// Шалгалтын материал (eyesh-link.js): gzip-ийн base64 ('H4sI…'), MATERIAL_MAX тэмдэгт хүртэл → мөр | null (буруу/байхгүй).
// Агуулгыг энд задлахгүй — eyeshcheck задалж шалгаад өөрийн өгөгдлийн санд хадгална.
const MATERIAL_MAX = 3000000;
function normMaterial(m) {
  return typeof m === 'string' && m.length <= MATERIAL_MAX && /^H4sI[A-Za-z0-9+/]+={0,2}$/.test(m) && m.length % 4 === 0 ? m : null;
}

// ── Нэг удаагийн нэвтрэх код ──
function codeHash(code) { return crypto.createHash('sha256').update(String(code)).digest('hex'); }
async function createHandoff(email, exam, material) {
  await ensure();
  const code = crypto.randomBytes(32).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await pool.query(
    `INSERT INTO ws_eyesh_handoff (code_hash, email, exam, material, expires_at) VALUES ($1,$2,$3,$4, NOW() + make_interval(secs => $5::int))`,
    [codeHash(code), String(email).toLowerCase(), exam ? JSON.stringify(exam) : null, normMaterial(material), HANDOFF_SEC]);
  // Хуучирсан мөрүүдийг цэвэрлэнэ (алдаа гарсан ч код өгнө)
  pool.query("DELETE FROM ws_eyesh_handoff WHERE expires_at < NOW() - INTERVAL '1 day'").catch(function () {});
  return code;
}
// Кодыг НЭГ УДАА зарцуулна: мөрийг устгасан хүсэлт л авна. → { email, exam, material } эсвэл null (буруу/хугацаа дууссан/ашиглагдсан)
async function redeem(code) {
  if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  await ensure();
  const r = await pool.query('DELETE FROM ws_eyesh_handoff WHERE code_hash=$1 RETURNING email, exam, material, (expires_at > NOW()) AS live', [codeHash(code)]);
  const row = r.rows[0];
  if (!row || row.live !== true) return null;
  return { email: row.email, exam: row.exam || null, material: row.material || null };
}

module.exports = { EYESH_DAYS, HANDOFF_SEC, SSO_URL, ADMIN_HANDOFF, ADMIN_URL, TOPICS, VAR_L, MATERIAL_MAX, eyeshPrice, ensure, expiry, grant, record,
                   normExam, normS2Item, normMaterial, createHandoff, redeem, codeHash, wsRef, EYC_TOPICS };
