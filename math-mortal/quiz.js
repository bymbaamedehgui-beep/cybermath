/* MATH MORTAL — бодлогын эх сурвалж.
 *
 * Бодлогыг АНГИ (6–12) + СЭДЭВ-ээр нь сонгоно (тоглоомуудын нийтлэг сан):
 *   GET /api/questions?game_topics=<анги>               → тухайн ангийн бүлэг/сэдвүүд {chapters:[{name, topics:[{id,name,n}]}]}
 *   GET /api/questions?game=<анги>&topic=<сэдэв|0>&n=60 → тэр сэдвийн (0 бол ангийн бүх сэдвийн) 4 сонголттой бодлогууд
 * Сэдэв сонгоогүй бол ангийн бүх сэдвээс холино. Сэдвээс HUD-д тохирох бодлого
 * олдохгүй бол ангийн бүх сэдвээс авна. Хялбар бодлогыг илүүд үзнэ.
 * URL-ийн ?grade=<6..12>&topic=<node_id> (Дасгалын төв) нь анги/сэдвийг урьдчилан
 * сонгоно — сольж болно, гэхдээ localStorage-д ХАДГАЛАХГҮЙ (cyber-math.com-той хуваалцдаг).
 * Сүлжээгүй / API алдаа гарвал доорх нөөц генератор ажиллана тул тоглоом
 * хэзээ ч зогсохгүй («Офлайн — жишиг бодлого» тэмдэг гарна).
 *
 * Бодлогын текстийг LaTeX хэлбэрээр ХЭВЭЭР нь дамжуулна ($x^2$, \frac{a}{b}).
 * mathtext.js доторх setMathText() үүнийг KaTeX-ээр жинхэнэ математик бичиглэл
 * болгож харуулдаг. Тоглоомын HUD жижиг тул ХЭТ УРТ бодлогыг л хаяна.
 */

const STORAGE_KEY = 'mortal-arena-quiz-settings';
const DEFAULTS = { grade: 7, topic: 'math', node: 0, seconds: 15 };
const GRADE_MIN = 6, GRADE_MAX = 12;
const TOPICS = new Set(['math', 'science', 'language']);
const TIME_CHOICES = new Set([5, 10, 15, 20, 30, 45, 60]);

/* Тоглоомд 6–12-р ангийн, цөөн үйлдэлтэй (HUD-д багтах) бодлогыг хэрэглэнэ.
   Урт / өгүүлбэртэй бодлогыг fitsHud() хасна — HUD дээр уншиж амжихгүй. */
const CM_GRADES = new Set([6, 7, 8, 9, 10, 11, 12]);
const GRADE_RE = /^(6|7|8|9|10|11|12)$/;
const API_BASE = (typeof location !== 'undefined' && /cyber-math|localhost|127\.0\.0\.1/.test(location.host))
  ? '' : 'https://cyber-math.com';
const BATCH = 60;
const MIN_TOPIC = 4;        /* сонголтод гарах сэдвийн хамгийн бага бодлогын тоо */
const EASY_BIAS = 0.6;      /* хялбар бодлого сонгогдох магадлал (санд байвал) */
const MAX_LEN = 120;        /* HUD-д тохирох хамгийн урт бодлого (тэмдэгт) */
const MAX_OPT_LEN = 26;     /* нэг сонголтын хамгийн урт */

/* Дасгалын төвөөс ирсэн анги/сэдэв: ?grade=<6..12>&topic=<node_id|0> ('g' нэрийг gate хасдаг) */
function urlSelection() {
  try {
    if (typeof location === 'undefined') return null;
    const sp = new URLSearchParams(location.search || '');
    const g = sp.get('grade');
    if (!g || !GRADE_RE.test(g)) return null;
    const t = sp.get('topic') || '';
    return { grade: Number(g), node: /^\d{1,6}$/.test(t) ? Number.parseInt(t, 10) : 0 };
  } catch { return null; }
}

function normalizeSettings(value = {}) {
  const grade = Math.max(GRADE_MIN, Math.min(GRADE_MAX, Number.parseInt(value.grade, 10) || DEFAULTS.grade));
  const topic = TOPICS.has(value.topic) ? value.topic : DEFAULTS.topic;
  const node = Math.max(0, Number.parseInt(value.node, 10) || 0);
  const requestedSeconds = Number.parseInt(value.seconds, 10) || DEFAULTS.seconds;
  const seconds = TIME_CHOICES.has(requestedSeconds) ? requestedSeconds : DEFAULTS.seconds;
  return { grade, topic, node, seconds };
}

export function getQuizSettings() {
  return normalizeSettings({
    grade: document.getElementById('grade-select')?.value,
    topic: document.getElementById('topic-select')?.value,
    node: document.getElementById('node-select')?.value,
    seconds: document.getElementById('question-time')?.value
  });
}

export function applyQuizSettings(settings, persist = true) {
  const normalized = normalizeSettings(settings);
  const gradeEl = document.getElementById('grade-select');
  const topicEl = document.getElementById('topic-select');
  const nodeEl = document.getElementById('node-select');
  const timeEl = document.getElementById('question-time');
  if (gradeEl) gradeEl.value = String(normalized.grade);
  if (topicEl) topicEl.value = normalized.topic;
  /* Сэдвийн жагсаалт хараахан ачаалагдаагүй бол утгыг нь дараа нь тавина */
  if (nodeEl && [...nodeEl.options].some(o => o.value === String(normalized.node))) {
    nodeEl.value = String(normalized.node);
  }
  if (timeEl) timeEl.value = String(normalized.seconds);
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch { /* Settings still work for this session. */ }
  }
  return normalized;
}

/* ───────── Сэдвийн жагсаалт ───────── */
const topicCache = new Map();          /* анги → [{id, name, n, chapter}] */

/* game_topics хариуг хавтгай жагсаалт болгоно (бүлгийн нэртэй) */
function topicsOf(d, grade) {
  const list = [];
  if (!d || d.ok === false || String(d.grade) !== String(grade)) return list;
  for (const ch of (Array.isArray(d.chapters) ? d.chapters : [])) {
    for (const t of (ch && Array.isArray(ch.topics) ? ch.topics : [])) {
      const id = Number.parseInt(t && t.id, 10);
      const n = Number(t && t.n) || 0;
      if (id > 0 && t.name && n >= MIN_TOPIC) list.push({ id, name: String(t.name), n, chapter: String((ch && ch.name) || '') });
    }
  }
  return list;
}

async function fetchTopics(grade) {
  if (!CM_GRADES.has(grade)) return [];
  if (topicCache.has(grade)) return topicCache.get(grade);
  try {
    const r = await fetch(`${API_BASE}/api/questions?game_topics=${grade}`);
    const d = await r.json();
    const list = topicsOf(d, grade);
    topicCache.set(grade, list);
    return list;
  } catch { topicCache.set(grade, []); return []; }
}

/* Сэдвийн сонголтыг тухайн ангийн жагсаалтаар дүүргэнэ (бүлэгтэй бол optgroup) */
async function fillTopicSelect(grade, wantNode) {
  const sel = document.getElementById('node-select');
  const field = document.getElementById('node-field');
  if (!sel) return;
  sel.disabled = true;
  sel.replaceChildren(new Option('Бүх сэдэв', '0'));
  const list = await fetchTopics(grade);
  /* Хариу ирэх хооронд анги солигдсон бол хуучин жагсаалтыг бүү тавь */
  const curGrade = document.getElementById('grade-select')?.value;
  if (curGrade && curGrade !== String(grade)) return;
  let group = null, groupName = null;
  for (const t of list) {
    let parent = sel;
    if (t.chapter) {
      if (groupName !== t.chapter) {
        group = document.createElement('optgroup');
        group.label = t.chapter;
        groupName = t.chapter;
        sel.appendChild(group);
      }
      parent = group;
    }
    parent.appendChild(new Option(t.name, String(t.id)));
  }
  sel.disabled = false;
  /* Өмнөх сонголт энэ ангид байвал сэргээнэ */
  sel.value = list.some(t => String(t.id) === String(wantNode)) ? String(wantNode) : '0';
  if (field) field.style.display = list.length ? '' : 'none';
  prefetch(grade, Number(sel.value));
}

export function initQuizSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Ignore invalid stored preferences. */ }
  /* Дасгалын төвөөс ирсэн анги/сэдэв хадгалсан тохиргоог дарна — гэхдээ хадгалахгүй */
  const fromUrl = urlSelection();
  const persist = !fromUrl;
  const initial = fromUrl
    ? { ...DEFAULTS, ...(saved || {}), topic: 'math', grade: fromUrl.grade, node: fromUrl.node }
    : (saved || DEFAULTS);
  const applied = applyQuizSettings(initial, false);
  fillTopicSelect(applied.grade, applied.node);

  const changed = (reloadTopics) => {
    const settings = applyQuizSettings(getQuizSettings(), persist);
    if (reloadTopics) fillTopicSelect(settings.grade, settings.node);
    else prefetch(settings.grade, settings.node);
    window.dispatchEvent(new CustomEvent('arena:settings-changed', { detail: settings }));
  };
  document.getElementById('grade-select')?.addEventListener('change', () => changed(true));
  for (const id of ['topic-select', 'node-select', 'question-time']) {
    document.getElementById(id)?.addEventListener('change', () => changed(false));
  }
  /* Математик биш сэдэв сонгоход "Сэдэв" талбар хэрэггүй */
  const syncField = () => {
    const field = document.getElementById('node-field');
    if (field) field.style.display = (getQuizSettings().topic === 'math') ? '' : 'none';
  };
  document.getElementById('topic-select')?.addEventListener('change', syncField);
  syncField();
}

/* ───────── Урт хэмжих: LaTeX-ийг ЗӨВХӨН УРТ мэдэхийн тулд хуулбарлана.
   Харуулахдаа эх LaTeX-ийг KaTeX рендерлэнэ. ───────── */
function visibleLength(input) {
  return String(input ?? '')
    .replace(/\$([^$]*)\$/g, '$1')
    .replace(/\\[a-zA-Z]+\s*/g, 'x')
    .replace(/[{}\\]/g, '')
    .trim().length;
}

/* Тоглоомын HUD-д тохирох бодлого эсэх */
function fitsHud(q) {
  const t = String(q.text ?? '');
  if (!t) return false;
  if (visibleLength(t) > MAX_LEN) return false;
  if (/<\s*(img|table|svg|br)/i.test(t)) return false;        /* зураг/хүснэгттэй бодлого HUD-д тохирохгүй */
  if (/\\begin\{/.test(t)) return false;                      /* матриц, тэнцэтгэлийн систем */
  if ((t.match(/(?<!\\)\$/g) || []).length % 2) return false; /* эвдэрсэн LaTeX */
  if (/[\r\n]/.test(t.trim())) return false;                  /* олон мөр */
  return true;
}

/* ───────────────── CyberMath-ын сан ───────────────── */
let pool = [];           /* бэлэн бодлогууд */
let poolKey = null;      /* тэдгээр нь аль анги/сэдвийнх — "7|0", "8|512" */
let loading = null;
const noServer = new Set();   /* тохиромжтой бодлого ирээгүй анги/сэдэв — дахин татахгүй */

function keyOf(grade, node) { return grade + '|' + (node || 0); }

/* «Офлайн — жишиг бодлого» тэмдэг (#math-offline) — серверээс бодлого ирээгүй үед */
function setOffline(on) {
  try {
    const el = document.getElementById('math-offline');
    if (el) el.hidden = !on;
  } catch { /* DOM-гүй орчин */ }
}

/* /api/questions?game=… хариуг HUD-д тохирох бодлого болгоно */
function cleanQuestions(d, grade) {
  const clean = [];
  if (!d || d.ok === false || String(d.grade) !== String(grade) || !Array.isArray(d.questions)) return clean;
  for (const q of d.questions) {
    if (!q || !fitsHud(q)) continue;
    const opts = (Array.isArray(q.choices) ? q.choices : []).map(c => String(c).trim());
    const answer = String(q.correct ?? '').trim();
    if (opts.length !== 4 || new Set(opts).size !== 4) continue;
    if (!opts.includes(answer)) continue;
    if (opts.some(o => !o || visibleLength(o) > MAX_OPT_LEN)) continue;
    clean.push({ q: String(q.text), answer, options: opts, easy: q.difficulty === 'easy' });
  }
  return clean;
}

function prefetch(grade, node) {
  const g = Number(grade);
  const nd = Number(node) || 0;
  const key = keyOf(g, nd);
  if (!CM_GRADES.has(g) || noServer.has(key)) {
    if (poolKey !== key) { pool = []; poolKey = null; }
    return Promise.resolve();
  }
  if (poolKey === key && pool.length > 8) return Promise.resolve();
  if (loading) return loading;
  const load = (topic) => fetch(`${API_BASE}/api/questions?game=${g}&topic=${topic}&n=${BATCH}`)
    .then(r => r.json())
    .then(d => cleanQuestions(d, g));
  const offlineIfCurrent = () => {
    try {
      const s = getQuizSettings();
      if (s.topic === 'math' && keyOf(s.grade, s.node) === key) setOffline(true);
    } catch { /* ignore */ }
  };
  loading = load(nd)
    /* Сэдвээс HUD-д тохирох бодлого олдоогүй бол ангийн бүх сэдвээс */
    .then(clean => (clean.length || !nd) ? clean : load(0))
    .then(clean => {
      if (clean.length) {
        pool = clean; poolKey = key;
        /* Эхний бодлого дотоод генератораар гарсан бол сольж өгөхийн тулд мэдэгдэнэ */
        window.dispatchEvent(new CustomEvent('arena:pool-ready', { detail: { key } }));
      } else { noServer.add(key); offlineIfCurrent(); }   /* тохиромжтой бодлого алга — цаашид бүү тат */
    })
    .catch(() => { noServer.add(key); offlineIfCurrent(); /* сүлжээгүй — нөөц генератор ажиллана */ })
    .finally(() => { loading = null; });
  return loading;
}

/* ───────────────── Нөөц генератор (сүлжээгүй үед) ───────────────── */
function makeOptions(answer, distractors) {
  const values = [answer];
  for (const candidate of distractors) {
    if (!values.some(value => String(value) === String(candidate))) values.push(candidate);
    if (values.length === 3) break;
  }
  let offset = 1;
  while (values.length < 3) {
    const candidate = typeof answer === 'number' ? answer + offset : `${answer} (${offset})`;
    if (!values.some(value => String(value) === String(candidate))) values.push(candidate);
    offset++;
  }
  return values.sort(() => Math.random() - 0.5);
}

function mathQuestion(grade) {
  const operations = grade <= 2 ? ['+', '-'] : grade <= 5 ? ['+', '-', '*'] : ['+', '-', '*', '/'];
  const op = operations[Math.floor(Math.random() * operations.length)];
  let a, b, answer;
  if (op === '+') {
    const max = grade <= 2 ? 20 : grade <= 5 ? 100 : grade <= 8 ? 500 : 1000;
    a = Math.floor(Math.random() * max) + 1;
    b = Math.floor(Math.random() * max) + 1;
    answer = a + b;
  } else if (op === '-') {
    const max = grade <= 2 ? 20 : grade <= 5 ? 100 : grade <= 8 ? 500 : 1000;
    a = Math.floor(Math.random() * max) + 1;
    b = Math.floor(Math.random() * (Math.min(max, a) + 1));
    answer = a - b;
  } else if (op === '*') {
    const max = grade <= 5 ? 12 : grade <= 8 ? 30 : 99;
    a = Math.floor(Math.random() * max) + 2;
    b = Math.floor(Math.random() * Math.min(max, 20)) + 2;
    answer = a * b;
  } else {
    b = Math.floor(Math.random() * 12) + 2;
    answer = Math.floor(Math.random() * 20) + 2;
    a = b * answer;
  }
  const symbol = op === '*' ? '\\times' : op === '/' ? '\\div' : op;
  const spread = Math.max(3, Math.ceil(Math.abs(answer) * (grade > 8 ? 0.12 : 0.2)));
  const distractors = [];
  while (distractors.length < 2) {
    const value = Math.max(0, answer + (Math.floor(Math.random() * spread * 2 + 1) - spread));
    if (value !== answer && !distractors.includes(value)) distractors.push(value);
  }
  return { q: `$${a} ${symbol} ${b} = ?$`, answer, options: makeOptions(answer, distractors) };
}

const QUESTION_BANKS = {
  science: [
    { q: 'Ургамал нарны гэрлээр шим тэжээл үүсгэх үйл явцыг юу гэдэг вэ?', answer: 'Фотосинтез', wrong: ['Ууршилт', 'Хөлдөлт'] },
    { q: 'Усны химийн томьёо аль вэ?', answer: '$H_2O$', wrong: ['$CO_2$', '$O_2$'] },
    { q: 'Дэлхий нарыг нэг бүтэн тойроход ойролцоогоор хэдэн өдөр вэ?', answer: '365 өдөр', wrong: ['30 өдөр', '24 өдөр'] },
    { q: 'Хүн амьсгалахад агаараас голчлон аль хийг ашигладаг вэ?', answer: 'Хүчилтөрөгч', wrong: ['Азот', 'Гели'] },
    { q: 'Ус далайн түвшинд хэдэн хэмд буцалдаг вэ?', answer: '$100^\\circ C$', wrong: ['$0^\\circ C$', '$50^\\circ C$'] },
    { q: 'Нарны аймгийн хамгийн том гараг аль вэ?', answer: 'Бархасбадь', wrong: ['Ангараг', 'Сугар'] },
    { q: 'Соронз аль металлыг хүчтэй татдаг вэ?', answer: 'Төмөр', wrong: ['Мөнгө', 'Хөнгөн цагаан'] },
    { q: 'Хүний зүрхний үндсэн үүрэг юу вэ?', answer: 'Цус шахах', wrong: ['Хоол боловсруулах', 'Агаар шүүх'] },
  ],
  language: [
    { q: '"Ном" гэдэг үг хэдэн үетэй вэ?', answer: '1 үе', wrong: ['2 үе', '3 үе'] },
    { q: '"Сайхан" гэдэг үгийн эсрэг утга аль вэ?', answer: 'Муухай', wrong: ['Гоё', 'Дулаан'] },
    { q: 'Монгол хэлний цагаан толгойд хэдэн үсэг байдаг вэ?', answer: '35', wrong: ['26', '42'] },
    { q: '"Гүйх" ямар аймгийн үг вэ?', answer: 'Үйл үг', wrong: ['Нэр үг', 'Тэмдэг нэр'] },
    { q: '"Улаан" ямар асуултад хариулах вэ?', answer: 'Ямар?', wrong: ['Хэн?', 'Хэд?'] },
    { q: '"Би сургуульд явлаа." өгүүлбэрийн үйл үг аль вэ?', answer: 'Явлаа', wrong: ['Би', 'Сургуульд'] },
    { q: '"Нар" гэдэг үг ямар утгатай нэр үг вэ?', answer: 'Ерийн нэр', wrong: ['Оноосон нэр', 'Үйл үг'] },
    { q: '"Эрдэм ном" гэдэг хэллэгийн утгад хамгийн ойр нь аль вэ?', answer: 'Мэдлэг боловсрол', wrong: ['Тоглоом наадам', 'Аян зам'] },
  ],
};

export function createQuizQuestion(settings = getQuizSettings()) {
  const normalized = normalizeSettings(settings);
  if (normalized.topic === 'math') {
    const key = keyOf(normalized.grade, normalized.node);
    /* CyberMath-ын санд байвал түүнээс — сан багасахад дахин татна */
    if (poolKey === key && pool.length) {
      /* Хялбар бодлогыг илүүд үзнэ (санд байвал EASY_BIAS магадлалаар) */
      const easy = [];
      pool.forEach((p, i) => { if (p.easy) easy.push(i); });
      const idx = (easy.length && Math.random() < EASY_BIAS)
        ? easy[Math.floor(Math.random() * easy.length)]
        : Math.floor(Math.random() * pool.length);
      const picked = pool.splice(idx, 1)[0];
      if (pool.length < 8) prefetch(normalized.grade, normalized.node);
      setOffline(false);
      return { q: picked.q, answer: picked.answer, options: picked.options.slice().sort(() => Math.random() - 0.5) };
    }
    prefetch(normalized.grade, normalized.node);
    setOffline(noServer.has(key));
    return Object.assign(mathQuestion(normalized.grade), { local: true });
  }
  setOffline(false);
  const bank = QUESTION_BANKS[normalized.topic] || QUESTION_BANKS.science;
  const item = bank[Math.floor(Math.random() * bank.length)];
  return { q: item.q, answer: item.answer, options: makeOptions(item.answer, item.wrong) };
}

/* Тестэд */
export const __test = { visibleLength, fitsHud, normalizeSettings, urlSelection, topicsOf, cleanQuestions };
