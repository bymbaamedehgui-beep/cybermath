// Хичээлийн өмнөх «Онол» — cm-onol.js / cm-onol.css / onol/g12.js (2026-11-09, эзэмшигч: «12-р ангиас эхлээд хичээл бүрийн урд онол… маш сонирхолтой, ойлгомжтой»)
//   - index.html: openLesson-д админы intro_html давамгайлна, байхгүй бол cmOnol; дасгалын «Онол» товч (backToIntro, _hasIntro)
//   - Агуулга: 12-р ангийн 21 хичээл (node 601–621), алхам бүр hook → … → sum, шалгах асуултын хариу зөв индекстэй
// Ажиллуулах: node --test tests/cm-onol.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('index.html'), js = R('cm-onol.js'), css = R('cm-onol.css'), g12 = R('onol/g12.js'), g11 = R('onol/g11.js'), g10 = R('onol/g10.js'), v = JSON.parse(R('vercel.json'));
// Агуулгын багцууд: анги, онолын файл, хичээлийн замын node-ууд (нэр нь гарчигтай ижил байх ёстой)
// n — бүх хичээлд онол бэлэн бол яг тэр тоо; 11-р ангийн онол хэсэгчлэн нэмэгдэж байгаа (null — онол бүр замын node-той л таарна)
// 10-р анги: node жагсаалт (зам нь DB-д, бодлогын багцгүй) — онолын гарчиг node-ийн нэртэй (447, 453, 456 засагдсан нэрээр)
const G10 = { NODES: [[401, 'Олонлог'], [402, 'Бүхэл тоон илтгэгчтэй зэрэг'], [403, 'n зэргийн язгуур'], [404, 'Рационал илтгэгчтэй зэрэг'],
  [405, 'Стандарт хэлбэрээр бичсэн тоо'], [406, 'Бодит тооны үйлдлийн чанар'], [408, 'Рационал илтгэгчтэй алгебрын илэрхийлэл'],
  [409, 'Үржигдэхүүн болгон задлах'], [410, 'Алгебрын бутархай — үржүүлэх, хуваах'], [411, 'Алгебрын бутархай — нэмэх, хасах'],
  [413, 'Координатын систем, цэгийн координат'], [414, 'Шулууны налалт'], [415, 'Шулууны тэгшитгэл'], [416, 'Тойргийн тэгшитгэл'],
  [418, 'Функц, тодорхойлогдох муж ба дүр'], [419, 'Квадрат функц'], [420, 'y = a/x функц'], [421, 'y = axⁿ функцийн график'],
  [422, 'y = aˣ функцийн график'], [423, 'Муруйн шүргэгч, шүргэгчийн налалт'], [425, 'Шугаман тэнцэтгэл биш ба систем'],
  [426, 'Квадрат тэгшитгэл'], [427, 'Квадрат тэгшитгэлд шилждэг тэгшитгэл'], [428, 'Хоёр хувьсагчтай тэнцэтгэл биш'],
  [429, 'Илтгэгч тэгшитгэл'], [431, 'Тойрогт багтсан өнцөг'], [432, 'Багтсан ба багтаасан олон өнцөгт'], [433, 'Хөвч, шүргэгч, огтлогчийн чанар'],
  [434, 'Цэгийн геометр байр'], [436, 'Өнцгийн тригонометр харьцаа'], [437, 'Косинус, синусын теорем'], [438, 'Гурвалжны талбай'],
  [440, 'Вектор ба түүн дээрх үйлдэл'], [441, 'Координатын хавтгай дээрх вектор'], [442, 'Векторын үйлдэл координатаар'],
  [443, 'Скаляр үржвэр, векторын өнцөг'], [445, 'Мэдээллийн матриц'], [446, 'Матриц нэмэх, тоогоор үржүүлэх'], [447, 'Матриц үржүүлэх үйлдэл'],
  [448, 'Нэгж матриц'], [449, 'Матрицын тодорхойлогч'], [450, 'Урвуу матриц'], [452, 'Координатын хавтгай дахь хувиргалт'],
  [453, 'Цэгийн хувьд тэгш хэм'], [454, 'Тэнхлэгийн тэгш хэм'], [455, 'Эргүүлэлт'], [456, 'Параллель зөөлт'], [457, 'Гомотет'],
  [459, 'Бүлэглэсэн өгөгдлийн дунджууд'], [460, 'Гистограмм'], [461, 'Квартил ба далайц'], [462, 'Хуримтлагдсан давтамжийн график'],
  [463, 'Цэгэн диаграмм, корреляц'], [465, 'Факториал'], [466, 'Сэлгэмэл ба хэсэглэл'], [467, 'Нийцтэй ба нийцгүй үзэгдэл'],
  [468, 'Нийлмэл үзэгдлийн магадлал'], [469, 'Нумын урт, сектор, сегментийн талбай'], [470, 'Гадаргуугийн талбай ба эзлэхүүн'],
  [471, 'Биетийн хавтгай огтлол']] };
const PACKS = [{ g: '12', src: g12, path: '../api/_g12path.js', n: 21 }, { g: '11', src: g11, path: '../api/_g11path.js', n: null },
  { g: '10', src: g10, nodes: G10, n: null }];
const J = x => JSON.parse(JSON.stringify(x));
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// Хөдөлгүүрийг DOM-гүй ачаална (туслах функцуудыг шалгах)
function engine() {
  const doc = { readyState: 'complete', getElementById: () => null, addEventListener() {}, createElement: () => ({}) };
  const ctx = { document: doc, console };
  ctx.window = ctx; vm.createContext(ctx);
  vm.runInContext(js, ctx);
  return ctx.window.cmOnol;
}
// Агуулгын савыг ачаална
function content(src) {
  const D = {}, E = engine();
  const ctx = { console, Math }; ctx.window = { cmOnol: { util: E.util, pack: o => Object.assign(D, o) } };
  vm.createContext(ctx); vm.runInContext(src || g12, ctx);
  return D;
}
// Карт доторх бүх бичвэр (md) ба цэвэр TeX
function walk(c, onMd, onTex) {
  ['t', 'q', 'a', 'cap', 'why', 'hint', 'tip'].forEach(k => c[k] != null && onMd(c[k], k));
  [].concat(c.p || [], c.p2 || [], c.pts || [], c.o || [], (c.rv && c.rv.a) || []).forEach(s => onMd(s, 'text'));
  (Array.isArray(c.f) ? c.f : c.f ? [c.f] : []).forEach(f => { if (typeof f === 'string') f = { m: f }; onTex(f.m, 'f'); f.h && onMd(f.h, 'fh'); f.n && onMd(f.n, 'fn'); });
  (c.s || []).forEach(s => { onTex(s.m, 's'); s.n && onMd(s.n, 'sn'); });
  ['bad', 'good'].forEach(k => { if (c[k]) { onTex(c[k].m, k); c[k].n && onMd(c[k].n, k); } });
  if (c.tbl) [].concat(c.tbl.h || [], ...c.tbl.r).forEach(s => onMd(s, 'tbl'));
  // chain: уламжлалын (d1, d2, res) эсвэл утгын 3 алхамтай (st — md бичвэр) хэлбэр
  if (c.w && c.w.w === 'chain') c.w.ex.forEach(e => {
    ['y', 'inn', 'out', 'd1', 'd2', 'res'].forEach(k => e[k] != null && onTex(e[k], 'chain'));
    (e.st || []).forEach(s => onMd(s, 'chain-st'));
  });
}
const texOf = s => { const out = []; String(s).replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, (m, a, b) => { out.push(a != null ? a : b); return ''; }); return out; };

test('холболт: css/js толгойд, vercel build (cm-onol.js, cm-onol.css, onol/*.js)', () => {
  const iAch = html.indexOf('<link rel="stylesheet" href="/cm-ach.css'), iCss = html.indexOf('<link rel="stylesheet" href="/cm-onol.css?v=');
  assert.ok(iAch >= 0 && iCss > iAch, 'css дараалал');
  assert.match(html, /<script src="\/cm-onol\.js\?v=\d+" defer><\/script>/);
  const srcs = v.builds.map(b => b.src);
  ['cm-onol.js', 'cm-onol.css', 'onol/*.js'].forEach(s => assert.ok(srcs.includes(s), s));
  assert.match(js, /src: '\/onol\/g12\.js\?v=\d+'/);
  assert.match(js, /\{ lo: 801, hi: 851, src: '\/onol\/g11\.js\?v=\d+' \}/);
});

test('index.html: intro_html давамгайлна, дараа нь cmOnol; «Онол» товч ба backToIntro', () => {
  const i = html.indexOf('function openLesson(id)'), body = html.slice(i, html.indexOf('window.showResumeChoiceModal', i));
  const a = body.indexOf('showIntroAndStart(id, node);'), b = body.indexOf('if (window.cmOnol && window.cmOnol.has(id)) {'), c = body.lastIndexOf('continueOpenLesson(id);');
  assert.ok(a > 0 && b > a && c > b, 'intro_html → cmOnol → continueOpenLesson');
  assert.match(body, /window\.cmOnol\.open\(id, node\);\s*\n\s*return;/);
  assert.match(html, /var onol = !\(node && node\.intro_html\) && !!\(window\.cmOnol && window\.cmOnol\.has\(currentLessonId\)\);/);
  assert.match(html, /if \(onol\) window\.cmOnol\.open\(currentLessonId, node, \{ resume: true \}\);\s*\n\s*else showIntroAndStart\(currentLessonId, node\);/);
  assert.match(html, /const _hasIntro = !!\(_node && _node\.intro_html && _node\.intro_html\.trim\(\)\.length > 0\) \|\| !!\(window\.cmOnol && window\.cmOnol\.has\(currentLessonId\)\);/);
});

test('cm-onol.js: синтакс, сайтын функцийг дарж бичихгүй, startLessonAfterIntro-оор эхлүүлнэ, эможигүй, .cmo- угтвар', () => {
  new Function(js); new Function(g12); new Function(g11);
  assert.doesNotMatch(js, /\b(openLesson|continueOpenLesson|startLessonAfterIntro|showIntroAndStart|backToIntro|closeModal|renderQuestion|checkAnswer|getLessonProgress)\s*=(?!=)/);
  assert.match(js, /if \(typeof startLessonAfterIntro === 'function'\) startLessonAfterIntro\(id\);/);
  [js, css, g12, g11].forEach(s => assert.doesNotMatch(s, EMOJI, 'эможи бүү'));
  const cls = new Set();
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\.([a-zA-Z][\w-]*)/g, (m, c) => { cls.add(c); return m; });
  // Сайтын ерөнхий класс зөвхөн .cmo / #quiz-modal.cmo-open дотор л; бусад нь .cmo- угтвартай эсвэл виджетийн дотоод богино класс
  const foreign = [...cls].filter(c => !/^cmo/.test(c) && !/^(quiz-card|katex|katex-display|cmx|in-r|in-l|show|ok|no|try|on|off|done|go|ghost|hd|t|rm|nw|sum|res|uc|w|tl|e|hl|pl|bl|fl|ml|cv|as|tn|dp|pt|hl0|qn|vl|al|ax|ah|tk|gr|nl|fx|n|h|m|d|lb|s|c|in|out|pw-[\w-]+|lm-row|dg-[\w-]+|pl-[\w-]+|hn-[\w-]+|cv-[\w-]+|ch-[\w-]+|uc-[\w-]+|k-trap|sg|sg3|p|axn|axl|cn|sq-[\w-]+|xyz-[\w-]+|xa|xb|ps-[\w-]+|me|pa|dt-[\w-]+|br|one|d1|d2)$/.test(c));
  // Эдгээр богино класс бүгд .cmo… угтвартай сонгогчийн дотор байх ёстой
  css.replace(/\/\*[\s\S]*?\*\//g, '').split('}').forEach(rule => {
    const sel = rule.split('{')[0].trim();
    if (!sel || /^@|^(from|to|\d+%)/.test(sel)) return;
    sel.split(',').forEach(s => { s = s.trim(); if (s && !/^(@|from|to|\d)/.test(s)) assert.match(s, /(^|\s)(\.cmo|#quiz-modal\.cmo-open|html\.cmx #quiz-modal\.cmo-open)/, 'хамрах хүрээгүй: ' + s); });
  });
  assert.deepStrictEqual(foreign, [], 'сайтын ерөнхий класс бүү загварчил');
  // KaTeX-ийн дотоод span-д нөлөөлөхгүй: «… span {» биш, «> span»
  assert.doesNotMatch(css, /[\w)\]] span \{/);
  assert.match(css, /^\.cmo \[hidden\] \{ display: none !important; \}/m);
});

test('Тусгай өнцгийн яг утга (нэгж тойрог) — тоон утгатай таарна', () => {
  const T = engine()._t;
  const num = s => {
    if (s == null) return null;
    let neg = 1; if (s[0] === '-') { neg = -1; s = s.slice(1); }
    const map = { '0': 0, '1': 1, '\\dfrac{1}{2}': 0.5, '\\dfrac{\\sqrt{3}}{2}': Math.sqrt(3) / 2, '\\dfrac{\\sqrt{2}}{2}': Math.SQRT1_2, '\\dfrac{1}{\\sqrt{3}}': 1 / Math.sqrt(3), '\\sqrt{3}': Math.sqrt(3) };
    assert.ok(s in map, 'танигдахгүй: ' + s); return neg * map[s];
  };
  [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330].forEach(d => {
    const r = d * Math.PI / 180, x = T.trig(d);
    assert.ok(Math.abs(num(x.sin) - Math.sin(r)) < 1e-9, 'sin ' + d);
    assert.ok(Math.abs(num(x.cos) - Math.cos(r)) < 1e-9, 'cos ' + d);
    if (d % 180 === 90) assert.strictEqual(x.tg, null); else assert.ok(Math.abs(num(x.tg) - Math.tan(r)) < 1e-9, 'tg ' + d);
  });
  assert.strictEqual(T.radTex(150), '\\dfrac{5\\pi}{6}');
  assert.strictEqual(T.radTex(180), '\\pi');
  assert.strictEqual(T.radTex(270), '\\dfrac{3\\pi}{2}');
  assert.strictEqual(T.radTex(30), '\\dfrac{\\pi}{6}');
  assert.strictEqual(T.polyTex([1, -1, -4, 13]), 'x^{3}-x^{2}-4x+13');
  assert.strictEqual(T.polyTex([4, -17, 0, 24]), '4x^{3}-17x^{2}+24');
  assert.strictEqual(T.polyTex([-1, 0]), '-x');
  assert.deepStrictEqual(['0', 'π/2', 'π', '3π/2', '2π', '−π/2'], [0, 1, 2, 3, 4, -1].map(T.piLab));
});

test('md(): бичвэрийг escape хийнэ, **тод**, $…$ KaTeX-гүй үед ч эвдрэхгүй', () => {
  const md = engine()._t.md;
  assert.strictEqual(md('a < b **c**'), 'a &lt; b <b>c</b>');
  assert.match(md('x $1<2$ y'), /^x <span class="cmo-raw">1&lt;2<\/span> y$/);
});

PACKS.forEach(P => test('Агуулга: ' + P.g + '-р ангийн онол, нэр нь node-тэй ижил, бүтэц зөв', () => {
  const D = content(P.src), G = P.nodes || require(P.path);
  const ids = Object.keys(D).map(Number).sort((a, b) => a - b), all = G.NODES.map(n => n[0]);
  if (P.n) assert.strictEqual(ids.length, P.n);
  assert.ok(ids.length && ids.every(id => all.indexOf(id) >= 0), 'онол бүр замын node-той: ' + ids.join(','));
  const W = new Set((js.match(/WG\.(\w+) = function/g) || []).map(s => s.slice(3, -11)));
  G.NODES.filter(n => D[n[0]]).forEach(n => {
    const L = D[n[0]], ks = L.cards.map(c => c.k);
    assert.strictEqual(L.title, n[1], 'гарчиг ' + n[0]);
    assert.ok(L.cards.length >= 6 && L.cards.length <= 10, n[0] + ' картын тоо');
    assert.strictEqual(ks[0], 'hook', n[0]); assert.strictEqual(ks[ks.length - 1], 'sum', n[0]);
    ['ex', 'check', 'trap'].forEach(k => assert.ok(ks.includes(k), n[0] + ' ' + k));
    assert.ok(ks.some(k => k === 'idea' || k === 'rule'), n[0]);
    L.cards.forEach((c, i) => {
      assert.ok(['hook', 'idea', 'rule', 'ex', 'trap', 'check', 'sum'].includes(c.k), n[0] + '#' + i);
      if (c.k === 'check') {
        assert.ok(c.o.length >= 3 && c.o.length <= 4 && Number.isInteger(c.c) && c.c >= 0 && c.c < c.o.length, n[0] + '#' + i + ' хариу');
        assert.strictEqual(new Set(c.o).size, c.o.length, n[0] + '#' + i + ' давхар сонголт');
        assert.ok(c.why, n[0] + '#' + i + ' тайлбар');
      }
      if (c.k === 'ex') assert.ok(c.s.length >= 2 && c.s.every(s => s.m), n[0] + '#' + i);
      if (c.k === 'trap') assert.ok(c.bad && c.good, n[0] + '#' + i);
      if (c.k === 'sum') assert.ok(c.pts.length >= 3, n[0] + '#' + i);
      if (c.w) assert.ok(W.has(c.w.w), n[0] + '#' + i + ' зураг ' + c.w.w);
    });
  });
}));

PACKS.forEach(P => test('Агуулга ' + P.g + '-р анги: TeX ($ тэнцвэр, хаалт, \\left/\\right), тригонометрийн бичиглэл, эможигүй', () => {
  const D = content(P.src), bad = [];
  Object.keys(D).forEach(id => D[id].cards.forEach((c, i) => {
    const at = id + '#' + i;
    const tex = t => {
      let dep = 0; for (const ch of t.replace(/\\[{}]/g, '')) { if (ch === '{') dep++; else if (ch === '}' && --dep < 0) break; }
      if (dep !== 0) bad.push(at + ' {} ' + t);
      if ((t.match(/\\left\b/g) || []).length !== (t.match(/\\right\b/g) || []).length) bad.push(at + ' left/right ' + t);
      if (/\\(sin|cos|operatorname\{tg\})\s*-/.test(t)) bad.push(at + ' сөрөг аргумент хаалтгүй ' + t);
      if (/(^|[^\\a-z])\|-/.test(t)) bad.push(at + ' |− зай (\\left|…\\right| ашигла) ' + t);
      if (/[Ѐ-ӿ]/.test(t.replace(/\\text\{[^}]*\}/g, ''))) bad.push(at + ' кирилл математик горимд ' + t);
    };
    walk(c, s => {
      if ((String(s).match(/\$/g) || []).length % 2) bad.push(at + ' $ тэнцвэргүй ' + s);
      if (EMOJI.test(s)) bad.push(at + ' эможи');
      texOf(s).forEach(tex);
    }, tex);
  }));
  assert.deepStrictEqual(bad, []);
}));

PACKS.forEach(PK => test('Агуулга ' + PK.g + '-р анги: тооны дагавар ($N$-аас, -т/-д, -ыг/-ийг…) сурах бичгийн дүрмээр', () => {
  // Сүүлийн дуудагдах үгээр: 2 хоёр → -оос/-т/-оор/-ыг/-ын, 6 зургаа → -гаас/-д/-гаар/-г/-гийн …
  const W = {
    0: ['ээс', 'д', 'ээр', 'ийг', 'ийн'], 1: ['ээс', 'д', 'ээр', 'ийг', 'ийн'], 2: ['оос', 'т', 'оор', 'ыг', 'ын'], 3: ['аас', 'т', 'аар', 'ыг', 'ын'],
    4: ['өөс', 'т', 'өөр', 'ийг', 'ийн'], 5: ['аас', 'д', 'аар', 'ыг', 'ын'], 6: ['гаас', 'д', 'гаар', 'г', 'гийн'], 7: ['гоос', 'д', 'гоор', 'г', 'гийн'],
    8: ['аас', 'д', 'аар', 'ыг', 'ын'], 9: ['өөс', 'д', 'өөр', 'ийг', 'ийн'], 10: ['аас', 'т', 'аар', 'ыг', 'ын'], 20: ['иос', 'д', 'иор', 'ийг', 'ийн'],
    50: ['иас', 'д', 'иар', 'ийг', 'ийн'], 60: ['аас', 'т', 'аар', 'ыг', 'ын'], 90: ['ээс', 'т', 'ээр', 'ийг', 'ийн'], 100: ['гаас', 'д', 'гаар', 'г', 'гийн']
  };
  const key = n => {
    const s = String(n).replace('-', '');
    if (s.includes('.')) return +s[s.length - 1];
    const k = +s;
    if (k === 0) return 0;
    if (k % 100 === 0) return 100;
    if (k % 10 === 0) return k % 100;
    return k % 10;
  };
  const caseOf = sfx => /с$/.test(sfx) ? 0 : /^[дт]$/.test(sfx) ? 1 : /р$/.test(sfx) ? 2 : /г$/.test(sfx) ? 3 : /н$/.test(sfx) ? 4 : -1;
  const D = content(PK.src), bad = [];
  const scan = (s, at) => String(s).replace(/\$(-?\d+(?:\.\d+)?)\$-([Ѐ-ӿ]+)/g, (m, n, sfx) => {
    const c = caseOf(sfx), w = W[key(n)];
    if (c >= 0 && w && w[c] !== sfx) bad.push(at + ': ' + m + ' → -' + w[c]);
    return m;
  });
  Object.keys(D).forEach(id => D[id].cards.forEach((c, i) => walk(c, s => scan(s, id + '#' + i), () => {})));
  assert.deepStrictEqual(bad, []);
}));

PACKS.forEach(PK => test('Агуулга ' + PK.g + '-р анги: функцийн зургууд (fx) бүх цэгт тоо/бичвэр буцаана', () => {
  const D = content(PK.src);
  Object.keys(D).forEach(id => D[id].cards.forEach((c, i) => {
    const w = c.w; if (!w || w.w !== 'fx') return;
    const P = {}; (w.p || []).forEach(q => { P[q.k] = q.v; });
    const xs = [w.x[0], (w.x[0] + w.x[1]) / 2, w.x[1], w.pt ? w.pt.x : 0];
    xs.forEach(x => w.f.forEach(f => { const y = f.fn(x, P); assert.ok(typeof y === 'number', id + '#' + i); }));
    if (w.pt) {
      [w.pt.min, w.pt.x, w.pt.max].forEach(x => {
        const y = w.f[w.pt.on || 0].fn(x, P);
        assert.ok(isFinite(y) && y >= w.y[0] - 1e-9 && y <= w.y[1] + 1e-9, id + '#' + i + ' цэг графикт харагдана x=' + x);
        if (w.pt.d) assert.ok(isFinite(w.pt.d(x, P)), id + '#' + i + ' налалт');
      });
    }
    if (w.info) assert.strictEqual(typeof w.info(P, w.pt ? w.pt.x : null), 'string');
    if (w.marks) assert.ok(Array.isArray(w.marks(P, w.pt ? w.pt.x : null)));
  }));
}));
