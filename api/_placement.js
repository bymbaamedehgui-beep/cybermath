// Түвшин тогтоох сорил (Тоглоомын төв, «Шалгалт» таб) — бүлэг, бодлого сонголт, дүгнэлт, хадгалалт.
// 2026-11-07 эзэмшигч: «Анги бүрт түвшин тогтоох сорил … аль сэдвээс эхэлж хийхийг нь нарийвчлан гаргаж өгдөг байх»;
// санал болгосон сэдэв хүртэл хичээлийн зам нээгдэнэ (клиент); багш ангийнхаа дүнг харна.
//
// Хоёр шаттай:
//   1-р шат — бүлэг бүрээс 1–2 сэдэв (нийт ≤ STAGE1_MAX), сэдэв бүрээс 1 бодлого → аль бүлэг сул вэ
//   2-р шат — анх «бүгд зөв биш» гарсан бүлгийн (frontier) сэдэв бүрээс 1 бодлого (≤ STAGE2_MAX) → яг эхлэх сэдэв
// Зөв хариуг клиентэд илгээхгүй: асуултын id-ууд гарын үсэгтэй токенд (JWT, тусдаа түлхүүр), шалгалтыг сервер хийнэ.
'use strict';
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('./_db');
const Q = require('./questions')._game;

const GRADES = ['6', '7', '8', '9', '10', '11', '12']; // хичээлийн замтай ангиуд (11 — node 801–851, админ «Суулгах»-аас хойш бодлоготой)
const MIN_Q = 4;                                      // үүнээс цөөн тохирох бодлоготой сэдэв сорилд орохгүй
const STAGE1_MAX = 18;
const STAGE2_MAX = 8;
const TOKEN_TTL = 3 * 3600;
const REVIEW_RE = /^(Бататгал|Жишиг|Сорил|Шалгалт)/i;  // давтлага/жишиг node — сэдэв биш

// Бүлгийн хилгүй (📝 Бататгал node-гүй) ангиудын бүлэг — сурах бичгийн дарааллаар [нэр, бүлгийн эхний node id].
// Сэдэв бүр хамгийн сүүлийн «эхлэл ≤ id» бүлэгт орно (эдгээр ангид id зам дагуу өсдөг).
const SPLITS = {
  '6': [['Бүхэл тоо, хуваагдах чанар, олонлог', 301], ['Аравтын бутархай', 311], ['Энгийн бутархай, процент', 317],
    ['Харьцаа, пропорц, магадлал', 322], ['Алгебрын илэрхийлэл, тэгшитгэл', 327], ['Дараалал, функц, координат', 331],
    ['Өнцөг, гурвалжин, олон өнцөгт', 336], ['Биет, хувиргалт', 347], ['Хэмжигдэхүүн', 352], ['Статистик', 360]],
  '7': [['Бүхэл тоо, зэрэг, язгуур', 701], ['Аравтын ба энгийн бутархай', 708], ['Текст бодлого, процент', 715],
    ['Харьцаа, пропорц, магадлал', 719], ['Алгебрын илэрхийлэл, тэгшитгэл', 722], ['Дараалал, функц', 727],
    ['Өнцөг, гурвалжин, дөрвөн өнцөгт', 731], ['Координат, хувиргалт', 738], ['Хэмжигдэхүүн', 743], ['Статистик, магадлал', 753]],
  '9': [['Рационал ба иррационал тоо', 1], ['Язгуур, зэрэг, стандарт хэлбэр', 6], ['Олон гишүүнт, товч үржүүлэх томьёо', 15],
    ['Алгебрын бутархай', 27], ['Тэгшитгэлийн систем, тэнцэтгэл биш', 33], ['Квадрат ба рационал тэгшитгэл', 40],
    ['Дараалал, арифметик прогресс', 47], ['Функц ба график', 52], ['Гурвалжин, тригонометр', 59], ['Тойрог, төсөө', 65], ['Магадлал', 77],
    // 2026-11-09: сурах бичгийн дутуу сэдвүүд замын төгсгөлийн сул node-д (хуучин SVG зам 107 → 126; бататгал слот 86, 92, 98,
    // 104, 129, 136-г алгасна — index.html EXAM_NODE_SOURCES), 134 — олон гишүүнтийг томьёогоор задлах (нэмэлт)
    ['Тоймлох, процент, харьцаа, магадлал', 80], ['Хувиргалт, вектор, азимут', 89], ['Хэмжигдэхүүн', 97], ['Өгөгдөлтэй ажиллах', 127],
    ['Олон гишүүнтийг задлах (нэмэлт)', 134]],
  '11': [['Квадрат тэгшитгэл ба тэнцэтгэл биш', 801], ['Тэгшитгэлийн систем', 807], ['Функц ба график', 813], ['Прогресс ба бином задаргаа', 822],
    ['Координатын геометр', 828], ['Тригонометр', 835], ['Огторгуй дахь вектор', 840], ['Уламжлал', 844]],
  '12': [['Модуль', 601], ['Олон гишүүнт, рационал илэрхийлэл', 604], ['Логарифм, илтгэгч функц', 608],
    ['Рационал ба тригонометр функц', 613], ['Уламжлал', 615]],
};

function normGrade(g) { g = String(g == null ? '' : g).trim(); return GRADES.indexOf(g) >= 0 ? g : null; }

/* Бүлгүүд: [{ i, name, topics: [{ id, name, n }] }] — замын дарааллаар, MIN_Q-ээс олон тохирох бодлоготой сэдэв л */
async function chapters(grade) {
  const r = await pool.query(
    `SELECT n.id, n.name, COUNT(q.id)::int AS cnt
       FROM nodes n
       LEFT JOIN questions q ON q.node_id = n.id AND ${Q.gameFitSql('$2', '$3')}
      WHERE n.grade = $1
      GROUP BY n.id, n.name, n.sort_order
      ORDER BY COALESCE(NULLIF(n.sort_order, 0), n.id), n.id`, [grade, Q.GAME_TRIM, Q.GAME_TAG_SRC]);
  let chs = Q.gameChapters(r.rows);
  const sp = SPLITS[grade];
  if (sp) {
    const all = [].concat.apply([], chs.map(c => c.topics));
    chs = sp.map(s => ({ name: s[0], topics: [] }));
    all.forEach(t => {
      if (Number(t.id) < sp[0][1]) return;              // эхний бүлгээс өмнөх (хуучин) node — бүлэгт орохгүй
      let k = 0;
      for (let j = 0; j < sp.length; j++) if (Number(t.id) >= sp[j][1]) k = j;
      chs[k].topics.push(t);
    });
  }
  return chs
    .map(c => ({ name: Q.gTrim(c.name), topics: c.topics.filter(t => Number(t.n) >= MIN_Q && !REVIEW_RE.test(Q.gTrim(t.name))) }))
    .filter(c => c.topics.length)
    .map((c, i) => ({ i: i, name: c.name || ('Бүлэг ' + (i + 1)), topics: c.topics.map(t => ({ id: Number(t.id), name: Q.gTrim(t.name), n: Number(t.n) })) }));
}

/* n сэдвийг жигд тараан сонгоно (эрэмбэ хадгална). pos — 0..1 хоорондын байрлалууд */
function at(list, pos) {
  const out = [];
  pos.forEach(p => {
    const k = Math.min(list.length - 1, Math.max(0, Math.round(p * (list.length - 1))));
    if (out.indexOf(list[k]) < 0) out.push(list[k]);
  });
  return out;
}
/* 1-р шат: бүлэг бүрт 1 сэдэв (60%-ийн байрлал); үлдсэн төсвийг том бүлгүүдэд 2 дахь (25%) — [{ t, c }] замын дарааллаар */
function stage1(chs) {
  const two = new Set();
  let budget = STAGE1_MAX - chs.length;
  chs.slice().sort((a, b) => b.topics.length - a.topics.length || a.i - b.i).forEach(c => {
    if (budget > 0 && c.topics.length >= 2) { two.add(c.i); budget--; }
  });
  const out = [];
  chs.forEach(c => {
    at(c.topics, two.has(c.i) ? [0.25, 0.8] : [0.6]).forEach(t => out.push({ t: t.id, c: c.i }));
  });
  return out;
}
/* 2-р шат: frontier бүлгийн 1-р шатанд ороогүй сэдвүүд (≤ STAGE2_MAX, жигд) */
function stage2(ch, used) {
  const rest = ch.topics.filter(t => used.indexOf(t.id) < 0);
  if (rest.length <= STAGE2_MAX) return rest.map(t => ({ t: t.id, c: ch.i }));
  const pos = []; for (let k = 0; k < STAGE2_MAX; k++) pos.push(k / (STAGE2_MAX - 1));
  return at(rest, pos).map(t => ({ t: t.id, c: ch.i }));
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

/* Сэдэв бүрээс 1 тохирох бодлого (хүнд биш нь түрүүлж) → Map topicId → { id, text, choices (холисон), correct } */
async function questionsFor(topicIds) {
  if (!topicIds.length) return new Map();
  const r = await pool.query(
    `SELECT id, node_id, text, choices, correct, difficulty, type, image, is_exam FROM (
       SELECT q.id, q.node_id, q.text, q.choices, q.correct, q.difficulty, q.type, q.image, q.is_exam,
              ROW_NUMBER() OVER (PARTITION BY q.node_id ORDER BY (q.difficulty = 'hard') ASC, random()) AS rn
         FROM questions q
        WHERE q.node_id = ANY($1::int[]) AND ${Q.gameFitSql('$2', '$3')}
     ) z WHERE rn <= 6 ORDER BY node_id, rn`, [topicIds, Q.GAME_TRIM, Q.GAME_TAG_SRC]);
  const out = new Map();
  r.rows.forEach(row => {
    const t = Number(row.node_id);
    if (out.has(t) || !Q.gameFit(row)) return;
    const one = Q.shuffleChoices([{ choices: row.choices.map(Q.gTrim), correct: Q.gTrim(row.correct) }])[0];
    out.set(t, { id: Number(row.id), text: Q.gTrim(row.text), choices: one.choices, correct: Q.gTrim(row.correct) });
  });
  return out;
}
async function correctOf(qids) {
  if (!qids.length) return new Map();
  const r = await pool.query('SELECT id, correct FROM questions WHERE id = ANY($1::bigint[])', [qids]);
  const m = new Map();
  r.rows.forEach(x => m.set(Number(x.id), Q.gTrim(x.correct)));
  return m;
}

/* ── Токен (сорилын явц): асуултын id, сэдэв, бүлэг, шат — зөв хариугүй ── */
function key() {
  const s = process.env.JWT_SECRET || '';
  return s ? crypto.createHmac('sha256', s).update('cybermath/placement/v1').digest() : null;
}
function sign(p) { const k = key(); return k ? jwt.sign(Object.assign({ typ: 'pl' }, p), k, { algorithm: 'HS256', expiresIn: TOKEN_TTL }) : null; }
function verify(t) {
  const k = key(); if (!k || typeof t !== 'string' || t.length > 8000) return null;
  try { const d = jwt.verify(t, k, { algorithms: ['HS256'] }); return d && d.typ === 'pl' ? d : null; } catch (e) { return null; }
}

/* Хариултыг шалгана: items [{ q, t, c }], answers [текст|null] → [{ t, c, ok }] */
async function grade(items, answers) {
  const cm = await correctOf(items.map(x => x.q));
  return items.map((x, k) => {
    const a = Array.isArray(answers) && typeof answers[k] === 'string' ? Q.gTrim(answers[k]) : null;
    const c = cm.get(x.q);
    return { t: x.t, c: x.c, ok: !!(a && c && a === c) };
  });
}

/* 1-р шатын дүнгээс frontier: бүх хариулт нь зөв биш эхний бүлэг (байхгүй бол -1) */
function frontier(chs, r1) {
  for (let i = 0; i < chs.length; i++) {
    const mine = r1.filter(x => x.c === chs[i].i);
    if (mine.length && mine.some(x => !x.ok)) return chs[i].i;
  }
  return -1;
}

/* Эцсийн дүгнэлт */
function result(grade, chs, r1, r2) {
  const all = r1.concat(r2 || []);
  const ok = {}; all.forEach(x => { ok[x.t] = x.ok; });
  const correct = all.filter(x => x.ok).length;
  const f = frontier(chs, r1);
  const chapters = chs.map(c => {
    const xs = all.filter(x => x.c === c.i), y = xs.filter(x => x.ok).length;
    return { i: c.i, name: c.name, total: xs.length, correct: y, status: !xs.length ? 'untested' : y === xs.length ? 'mastered' : y === 0 ? 'weak' : 'partial' };
  });
  const topics = [];
  chs.forEach(c => c.topics.forEach(t => { if (t.id in ok) topics.push({ id: t.id, name: t.name, chapter_i: c.i, ok: ok[t.id] }); }));
  let start = null;
  if (f >= 0) {
    const ch = chs.find(c => c.i === f);
    const first = ch.topics.find(t => ok[t.id] === false) || ch.topics[0];
    start = { id: first.id, name: first.name, chapter: ch.name, chapter_i: ch.i };
  }
  const review = topics.filter(t => !t.ok && (!start || t.id !== start.id)).slice(0, 8)
    .map(t => ({ id: t.id, name: t.name, chapter: chs.find(c => c.i === t.chapter_i).name }));
  return { grade: grade, total: all.length, correct: correct, percent: all.length ? Math.round(correct * 100 / all.length) : 0,
    frontier: f, start: start, chapters: chapters, review: review, topics: topics };
}

/* ── Хадгалалт ── */
let _ready = null;
function ensureTable() {
  if (!_ready) {
    _ready = pool.query(`CREATE TABLE IF NOT EXISTS placement_results (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      grade TEXT NOT NULL,
      score INT NOT NULL,
      total INT NOT NULL,
      start_node INT,
      start_name TEXT,
      start_chapter TEXT,
      detail JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`).then(() => pool.query('CREATE INDEX IF NOT EXISTS placement_results_email_idx ON placement_results (email, created_at DESC)'))
      .catch(e => { _ready = null; throw e; });
  }
  return _ready;
}
async function save(email, res) {
  await ensureTable();
  const s = res.start || {};
  const r = await pool.query(
    `INSERT INTO placement_results (email, grade, score, total, start_node, start_name, start_chapter, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) RETURNING id, created_at`,
    [String(email).toLowerCase(), res.grade, res.correct, res.total, s.id || null, s.name || null, s.chapter || null,
      JSON.stringify({ percent: res.percent, frontier: res.frontier, chapters: res.chapters, review: res.review, topics: res.topics })]);
  return r.rows[0];
}
/* Хэрэглэгчийн анги бүрийн хамгийн сүүлийн дүн */
async function mine(email) {
  await ensureTable();
  const r = await pool.query(
    `SELECT DISTINCT ON (grade) grade, score, total, start_node, start_name, start_chapter, detail, created_at
       FROM placement_results WHERE email = $1 ORDER BY grade, created_at DESC`, [String(email).toLowerCase()]);
  return r.rows;
}
/* Багшийн анги: сурагч бүрийн хамгийн сүүлийн дүн (сорил өгөөгүй нь null) */
async function classResults(classroomId) {
  await ensureTable();
  const r = await pool.query(
    `SELECT cm.student_email AS email, u.first_name, u.last_name,
            p.grade, p.score, p.total, p.start_node, p.start_name, p.start_chapter, p.detail, p.created_at
       FROM class_members cm
       LEFT JOIN users u ON LOWER(u.email) = LOWER(cm.student_email)
       LEFT JOIN LATERAL (
         SELECT * FROM placement_results pr WHERE pr.email = LOWER(cm.student_email) ORDER BY pr.created_at DESC LIMIT 1
       ) p ON TRUE
      WHERE cm.classroom_id = $1
      ORDER BY p.created_at DESC NULLS LAST, u.first_name`, [classroomId]);
  return r.rows;
}

module.exports = { GRADES, SPLITS, STAGE1_MAX, STAGE2_MAX, MIN_Q, normGrade, chapters, stage1, stage2, questionsFor, correctOf,
  sign, verify, grade, frontier, result, ensureTable, save, mine, classResults };
