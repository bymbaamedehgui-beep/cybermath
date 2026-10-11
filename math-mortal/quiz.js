/* MATH MORTAL — бодлогын эх сурвалж.
 *
 * Анхдагчаар CyberMath-ын жинхэнэ бодлогын сангаас (сурах бичгийн дагуу,
 * анги тус бүрээр) татна:  GET /api/questions?arena=<анги>&n=40
 * Сүлжээгүй / API алдаа гарвал доорх нөөц генератор ажиллана тул тоглоом
 * хэзээ ч зогсохгүй.
 *
 * Бодлогын текстийг LaTeX хэлбэрээр ХЭВЭЭР нь дамжуулна ($x^2$, \frac{a}{b}).
 * game3d.js дахь renderMathUI() үүнийг KaTeX-ээр жинхэнэ математик бичиглэл
 * болгож харуулдаг. Тоглоомын HUD жижиг тул ХЭТ УРТ бодлогыг л хаяна.
 */

const STORAGE_KEY = 'mortal-arena-quiz-settings';
const DEFAULTS = { grade: 5, topic: 'math', seconds: 15 };
const TOPICS = new Set(['math', 'science', 'language']);
const TIME_CHOICES = new Set([5, 10, 15, 20, 30, 45, 60]);

/* CyberMath-ын learning path бодлогын сан байгаа ангиуд */
const CM_GRADES = new Set([6, 7, 8, 9, 10, 11, 12]);
const API_BASE = (typeof location !== 'undefined' && /cyber-math|localhost|127\.0\.0\.1/.test(location.host))
  ? '' : 'https://cyber-math.com';
const BATCH = 40;
const MAX_LEN = 120;        /* HUD-д тохирох хамгийн урт бодлого (тэмдэгт) */
const MAX_OPT_LEN = 26;     /* нэг сонголтын хамгийн урт */

function normalizeSettings(value = {}) {
  const grade = Math.max(1, Math.min(12, Number.parseInt(value.grade, 10) || DEFAULTS.grade));
  const topic = TOPICS.has(value.topic) ? value.topic : DEFAULTS.topic;
  const requestedSeconds = Number.parseInt(value.seconds, 10) || DEFAULTS.seconds;
  const seconds = TIME_CHOICES.has(requestedSeconds) ? requestedSeconds : DEFAULTS.seconds;
  return { grade, topic, seconds };
}

export function getQuizSettings() {
  const gradeEl = document.getElementById('grade-select');
  const topicEl = document.getElementById('topic-select');
  const timeEl = document.getElementById('question-time');
  return normalizeSettings({
    grade: gradeEl?.value,
    topic: topicEl?.value,
    seconds: timeEl?.value
  });
}

export function applyQuizSettings(settings, persist = true) {
  const normalized = normalizeSettings(settings);
  const gradeEl = document.getElementById('grade-select');
  const topicEl = document.getElementById('topic-select');
  const timeEl = document.getElementById('question-time');
  if (gradeEl) gradeEl.value = String(normalized.grade);
  if (topicEl) topicEl.value = normalized.topic;
  if (timeEl) timeEl.value = String(normalized.seconds);
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch { /* Settings still work for this session. */ }
  }
  return normalized;
}

export function initQuizSettings() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { /* Ignore invalid stored preferences. */ }
  const applied = applyQuizSettings(saved || DEFAULTS, false);
  prefetch(applied.grade);
  const changed = () => {
    const settings = applyQuizSettings(getQuizSettings());
    prefetch(settings.grade);
    window.dispatchEvent(new CustomEvent('arena:settings-changed', { detail: settings }));
  };
  for (const id of ['grade-select', 'topic-select', 'question-time']) {
    document.getElementById(id)?.addEventListener('change', changed);
  }
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
let poolGrade = null;    /* тэдгээр нь аль ангийнх */
let loading = null;

function prefetch(grade) {
  const g = Number(grade);
  if (!CM_GRADES.has(g)) { pool = []; poolGrade = null; return Promise.resolve(); }
  if (poolGrade === g && pool.length > 8) return Promise.resolve();
  if (loading) return loading;
  loading = fetch(`${API_BASE}/api/questions?arena=${g}&n=${BATCH}`)
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
      if (clean.length) { pool = clean; poolGrade = g; }
    })
    .catch(() => { /* сүлжээгүй — нөөц генератор ажиллана */ })
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
    /* CyberMath-ын санд байвал түүнээс — сан багасахад дахин татна */
    if (poolGrade === normalized.grade && pool.length) {
      const picked = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
      if (pool.length < 8) prefetch(normalized.grade);
      return { q: picked.q, answer: picked.answer, options: picked.options.slice().sort(() => Math.random() - 0.5) };
    }
    prefetch(normalized.grade);
    return mathQuestion(normalized.grade);
  }
  const bank = QUESTION_BANKS[normalized.topic] || QUESTION_BANKS.science;
  const item = bank[Math.floor(Math.random() * bank.length)];
  return { q: item.q, answer: item.answer, options: makeOptions(item.answer, item.wrong) };
}

/* Тестэд */
export const __test = { visibleLength, fitsHud };
