/* MATH MORTAL — бодлогын эх сурвалж.
 *
 * Бодлогыг АНГИ + СЭДЭВ-ээр нь сонгоно:
 *   GET /api/questions?arena=<анги>&topics=1        → тухайн ангийн сэдвүүд
 *   GET /api/questions?arena=<анги>&node=<сэдэв>&n=40 → тэр сэдвийн бодлогууд
 * Сэдэв сонгоогүй бол ангийн бүх сэдвээс холино.
 * Сүлжээгүй / API алдаа гарвал доорх нөөц генератор ажиллана тул тоглоом
 * хэзээ ч зогсохгүй.
 *
 * Бодлогын текстийг LaTeX хэлбэрээр ХЭВЭЭР нь дамжуулна ($x^2$, \frac{a}{b}).
 * mathtext.js доторх setMathText() үүнийг KaTeX-ээр жинхэнэ математик бичиглэл
 * болгож харуулдаг. Тоглоомын HUD жижиг тул ХЭТ УРТ бодлогыг л хаяна.
 */

const STORAGE_KEY = 'mortal-arena-quiz-settings';
const DEFAULTS = { grade: 7, topic: 'math', node: 0, seconds: 15 };
const GRADE_MIN = 7, GRADE_MAX = 8;
const TOPICS = new Set(['math', 'science', 'language']);
const TIME_CHOICES = new Set([5, 10, 15, 20, 30, 45, 60]);

/* Тоглоомд 7, 8-р ангийн ХЯЛБАР түвшний, цөөн үйлдэлтэй сэдвүүдийг л хэрэглэнэ.
   Өгүүлбэртэй (нөхцөлтэй) бодлогыг сервер талдаа хасдаг — HUD дээр уншиж амжихгүй. */
const CM_GRADES = new Set([7, 8]);
const API_BASE = (typeof location !== 'undefined' && /cyber-math|localhost|127\.0\.0\.1/.test(location.host))
  ? '' : 'https://cyber-math.com';
const BATCH = 40;
const MAX_LEN = 120;        /* HUD-д тохирох хамгийн урт бодлого (тэмдэгт) */
const MAX_OPT_LEN = 26;     /* нэг сонголтын хамгийн урт */

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
const topicCache = new Map();          /* анги → [{id, name, n}] */

async function fetchTopics(grade) {
  if (!CM_GRADES.has(grade)) return [];
  if (topicCache.has(grade)) return topicCache.get(grade);
  try {
    const r = await fetch(`${API_BASE}/api/questions?arena=${grade}&topics=1`);
    const d = await r.json();
    const list = (d && d.topics) || [];
    topicCache.set(grade, list);
    return list;
  } catch { topicCache.set(grade, []); return []; }
}

/* Сэдвийн сонголтыг тухайн ангийн жагсаалтаар дүүргэнэ */
async function fillTopicSelect(grade, wantNode) {
  const sel = document.getElementById('node-select');
  const field = document.getElementById('node-field');
  if (!sel) return;
  sel.disabled = true;
  sel.replaceChildren(new Option('Бүх сэдэв', '0'));
  const list = await fetchTopics(grade);
  for (const t of list) sel.appendChild(new Option(t.name, String(t.id)));
  sel.disabled = false;
  /* Өмнөх сонголт энэ ангид байвал сэргээнэ */
  sel.value = list.some(t => String(t.id) === String(wantNode)) ? String(wantNode) : '0';
  if (field) field.style.display = list.length ? '' : 'none';
  prefetch(grade, Number(sel.value));
}

export function initQuizSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Ignore invalid stored preferences. */ }
  const applied = applyQuizSettings(saved || DEFAULTS, false);
  fillTopicSelect(applied.grade, applied.node);

  const changed = (reloadTopics) => {
    const settings = applyQuizSettings(getQuizSettings());
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
  const url = `${API_BASE}/api/questions?arena=${g}&n=${BATCH}` + (nd ? `&node=${nd}` : '');
  loading = fetch(url)
    .then(r => r.json())
    .then(d => {
      const clean = [];
      for (const q of (d && d.questions) || []) {
        if (!fitsHud(q)) continue;
        const opts = (q.choices || []).map(c => String(c).trim());
        const answer = String(q.correct ?? '').trim();
        if (opts.length !== 4 || new Set(opts).size !== 4) continue;
        if (!opts.includes(answer)) continue;
        if (opts.some(o => !o || visibleLength(o) > MAX_OPT_LEN)) continue;
        clean.push({ q: String(q.text), answer, options: opts });
      }
      if (clean.length) { pool = clean; poolKey = key; }
      else noServer.add(key);   /* тохиромжтой бодлого алга — цаашид бүү тат */
    })
    .catch(() => { noServer.add(key); /* сүлжээгүй — нөөц генератор ажиллана */ })
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
      const picked = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if (pool.length < 8) prefetch(normalized.grade, normalized.node);
      return { q: picked.q, answer: picked.answer, options: picked.options.slice().sort(() => Math.random() - 0.5) };
    }
    prefetch(normalized.grade, normalized.node);
    return mathQuestion(normalized.grade);
  }
  const bank = QUESTION_BANKS[normalized.topic] || QUESTION_BANKS.science;
  const item = bank[Math.floor(Math.random() * bank.length)];
  return { q: item.q, answer: item.answer, options: makeOptions(item.answer, item.wrong) };
}

/* Тестэд */
export const __test = { visibleLength, fitsHud, normalizeSettings };
