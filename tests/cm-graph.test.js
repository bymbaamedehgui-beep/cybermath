// График байгуулах бодлого (GeoGebra маягийн самбар) — cm-graph.js / cm-graph.css (2026-11-08).
//   - График/функцийн сэдвийн хичээлд 2 бодлого нэмнэ (DB-д бичихгүй), хариу нь самбарт байгуулах боломжтой (хавтгай дотор, торонд)
//   - Шалгалт: төгс сурагч = зөв, алдаатай/хоосон = буруу; парабол/гипербол — сурагч «Цэгүүдийг холбох»-оор аль цэгийг
//     ямар дарааллаар холбохоо өөрөө сонгоно: холбоогүй, эргэлдүүлсэн, салаа хооронд холбосон бол буруу
//   - Гөлгөр холболт квадрат функцийг яг давтана; «График харах» — текст дэх y = f(x)-ийг таних
//   - Сайтын функцийг дарж бичихгүй — index.html зөвхөн cmGraph.inject/answerHtml/mount/check/viewFor-ийг дуудна
// Ажиллуулах: node --test tests/cm-graph.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('index.html'), js = R('cm-graph.js'), css = R('cm-graph.css'), quiz = R('cm-quiz.js'), v = JSON.parse(R('vercel.json'));
const ctx = { console, Math, JSON, Date, isFinite, parseInt, parseFloat, String, Number, Array, Object, Function };
ctx.window = ctx; ctx.document = { getElementById: () => null, readyState: 'complete', addEventListener() {} };
vm.createContext(ctx); vm.runInContext(js, ctx);
const G = ctx.window.cmGraph;
const near = (a, b) => Math.abs(a - b) < 1e-6, onSnap = (x, s) => near(x / s, Math.round(x / s));

test('холболт: css/js index.html-д, vercel build', () => {
  assert.match(html, /<link rel="stylesheet" href="\/cm-graph\.css\?v=\d+">/);
  assert.match(html, /<script src="\/cm-graph\.js\?v=\d+" defer><\/script>/);
  const srcs = v.builds.map(b => b.src);
  assert.ok(srcs.includes('cm-graph.js') && srcs.includes('cm-graph.css'));
});

test('index.html: зөвхөн cmGraph-ийг дуудах цэгүүд (openLesson, renderAnswerSection, renderQuestion, checkAnswer)', () => {
  assert.match(html, /if \(window\.cmGraph\) \{ try \{ window\.cmGraph\.inject\(currentLesson, id\); \} catch \(e\) \{\} \}/);
  assert.match(html, /if \(type === 'graph' && window\.cmGraph\) return window\.cmGraph\.answerHtml\(qData\);/);
  assert.match(html, /if \(window\.cmGraph\) window\.cmGraph\.mount\(qData\);/);
  assert.match(html, /if \(type === 'graph'\) \{\s*var _gr = window\.cmGraph \? window\.cmGraph\.check\(qData\) : \{ ok: false, answer: '' \};\s*isCorrect = !!_gr\.ok;/);
  assert.match(html, /const _cmgView = \(window\.cmGraph && !\(qData\.hint && qData\.hint\.embed\)\) \? window\.cmGraph\.viewFor\(qData\) : '';/);
  assert.match(html, /\$\{\(qData\.hint && qData\.hint\.embed\) \|\| _cmgView \? `/);
  assert.match(html, /Зураг харах\r?\n\s*<\/button>/, '«Зураг харах» товч');
  assert.match(quiz, /R\.querySelector\('\.cmg'\) \? 'Графикаа байгуул'/);
});

test('cm-graph.js: синтакс, эможигүй, сайтын функцийг дарж бичихгүй', () => {
  new Function(js);
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✕]/u);
  assert.doesNotMatch(css, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.doesNotMatch(js, /\b(renderQuestion|checkAnswer|openLesson|renderAnswerSection|toggleGraph|toggleQImage|nextQuestion)\s*=(?!=)/);
  for (const k of ['inject', 'answerHtml', 'mount', 'check', 'viewFor']) assert.equal(typeof G[k], 'function', k);
});

test('Сэдэв бүр хүчинтэй генератортой; inject нь график сэдэвт 2 бодлого нэмнэ, бусдад хөндөхгүй', () => {
  for (const id of Object.keys(G._nodes)) for (const n of G._nodes[id]) assert.ok(G._gen[n], id + ' → ' + n);
  for (const id of ['730', '52', '419', '529', '334']) {
    const L = { questions: Array.from({ length: 20 }, (_, i) => ({ id: i + 1, type: 'choice' })) };
    G.inject(L, id);
    assert.equal(L.questions.length, 22, id);
    assert.equal(L.questions.filter(q => q.type === 'graph').length, 2, id);
  }
  const L2 = { questions: [{ id: 1, type: 'choice' }] }; G.inject(L2, 999999); assert.equal(L2.questions.length, 1);
});

function student(A, vw) {
  const pts = [], objs = []; let id = 0;
  const pt = p => { let q = pts.find(x => near(x.x, p[0]) && near(x.y, p[1])); if (!q) { q = { id: ++id, x: p[0], y: p[1] }; pts.push(q); } return q; };
  if (A.k === 'points') A.pts.forEach(pt);
  else if (A.k === 'curve') {
    const xs = new Set((A.need || []).map(x => +x.toFixed(6))), cand = [];
    for (let x = Math.ceil(vw.x0 / vw.sx) * vw.sx; x <= vw.x1 + 1e-9; x += vw.sx) { const y = A.fn(x); if (isFinite(y) && y >= vw.y0 - 1e-9 && y <= vw.y1 + 1e-9 && onSnap(y, vw.sy)) cand.push(+x.toFixed(6)); }
    if (A.side) {
      let l = [...xs].filter(x => x < A.side.x).length, r = [...xs].filter(x => x > A.side.x).length;
      cand.filter(x => x < A.side.x).sort((a, b) => b - a).forEach(x => { if (l < A.side.n && !xs.has(x)) { xs.add(x); l++; } });
      cand.filter(x => x > A.side.x).sort((a, b) => a - b).forEach(x => { if (r < A.side.n && !xs.has(x)) { xs.add(x); r++; } });
    }
    cand.forEach(x => { if (xs.size < (A.min || 2) && !xs.has(x)) xs.add(x); });
    const sorted = [...xs].sort((a, b) => a - b).map(x => pt([x, +A.fn(x).toFixed(6)]));
    let cur = [];   // «Цэгүүдийг холбох»: салаа бүрийг x-ийн дарааллаар сонгосон муруй
    sorted.forEach(p => { const last = cur[cur.length - 1]; if (last && (A.br || []).some(b => last[0] < b && p.x > b)) { if (cur.length > 1) objs.push({ id: ++id, t: 'crv', ps: cur }); cur = []; } cur.push([p.x, p.y]); });
    if (cur.length > 1) objs.push({ id: ++id, t: 'crv', ps: cur });
    return { pts, objs };
  } else {
    const T = { segs: 'seg', lines: 'line', rays: 'ray', vecs: 'vec' }[A.k];
    A[A.k].forEach(w => { pt(w[0]); pt(w[1]); objs.push({ id: ++id, t: T, a: w[0], b: w[1] }); });
    if (A.mark) pt(A.mark);
  }
  return { pts, objs };
}

test('Генератор бүр (×60): хариу байгуулах боломжтой, төгс сурагч зөв, холбоогүй/хоосон буруу, текст бүрэн', () => {
  for (const n of Object.keys(G._gen)) {
    for (let k = 0; k < 60; k++) {
      const q = G._make(n), g = q.graph, vw = g.v, A = g.ans;
      assert.equal(q.type, 'graph'); assert.equal(q.id, null);
      assert.equal((q.q.match(/\$/g) || []).length % 2, 0, n + ' $ тэнцвэр: ' + q.q);
      assert.doesNotMatch(q.q + q.hint.text, /NaN|undefined|Infinity/, n);
      const all = A.k === 'points' ? A.pts : A.k === 'curve' ? (A.need || []).map(x => [x, A.fn(x)]) : [].concat(...A[A.k]).concat(A.mark ? [A.mark] : []);
      for (const p of all) {
        assert.ok(p[0] >= vw.x0 - 1e-9 && p[0] <= vw.x1 + 1e-9 && p[1] >= vw.y0 - 1e-9 && p[1] <= vw.y1 + 1e-9, n + ' хавтгайгаас гарсан ' + JSON.stringify(p));
        assert.ok(onSnap(p[0], vw.sx) && onSnap(p[1], vw.sy), n + ' торонд наалдахгүй ' + JSON.stringify(p));
      }
      const S = student(A, vw), r = G._evaluate(A, S);
      assert.ok(r.ok, n + ': ' + r.msg);
      assert.ok(!G._evaluate(A, { pts: [], objs: [] }).ok, n + ' хоосон');
      if (A.k === 'curve') {
        assert.deepEqual([...g.tools], ['point', 'join'], n + ' муруйд цэг + «Цэгүүдийг холбох»');
        assert.ok(q.q.indexOf('«Цэгүүдийг холбох»') >= 0, n);
        assert.ok(!G._evaluate(A, Object.assign({}, S, { objs: [] })).ok, n + ' холбоогүй бол буруу');
        const all = S.pts.slice().sort((a, b) => a.x - b.x).map(p => [p.x, p.y]);
        if (all.length >= 3) { const zig = all.slice(); [zig[0], zig[1]] = [zig[1], zig[0]]; assert.ok(!G._evaluate(A, Object.assign({}, S, { objs: [{ id: 99, t: 'crv', ps: zig }] })).ok, n + ' эргэлдүүлж холбосон бол буруу'); }
        if ((A.br || []).length) assert.ok(!G._evaluate(A, Object.assign({}, S, { objs: [{ id: 98, t: 'crv', ps: all }] })).ok, n + ' салаа хооронд холбосон бол буруу');
      }
    }
  }
});

test('Гөлгөр холболт: квадрат функцийг яг давтана, гипербол монотон', () => {
  const sq = [-2, -1, 1, 2, 4].map(x => [x, 2 * (x - 1) * (x - 1) - 3]), m = G._slopes(sq);
  sq.forEach((p, i) => assert.ok(near(m[i], 4 * (p[0] - 1)), 'x=' + p[0]));
  assert.ok(G._slopes([1, 2, 3, 6].map(x => [x, 6 / x])).every(s => s <= 0));
});

test('Харагдац (GeoGebra шиг): гэр нь хуучинтай ижил, томруулахад заагчийн цэг хөдлөхгүй, гүйлгэх, торны алхам, π', () => {
  const vw = { x0: -6, x1: 6, y0: -5, y1: 5, xs: 1, ys: 1, sx: 1, sy: 1, xl: 'x', yl: 'y', xf: '', lx: 0, ly: 0 };
  const g = G._geo(vw, 440);   // padL 14, padT 18, нүд (440-14-18)/12 = 34px
  assert.ok(near(g.X(-6), 14) && near(g.X(0), 218) && near(g.Y(5), 18) && near(g.Y(0), 188), 'гэр: v-ийн муж торонд яг');
  const h = G._geo(vw, 440, g.home);
  for (const x of [-6, -1.5, 0, 3, 6]) assert.ok(Math.abs(h.X(x) - g.X(x)) < 0.11, 'X ' + x);
  for (const y of [-5, 0, 2.5, 5]) assert.ok(Math.abs(h.Y(y) - g.Y(y)) < 0.11, 'Y ' + y);
  const c = G._camZoom(g, null, 2, 100, 80), g2 = G._geo(vw, 440, c);
  assert.ok(Math.abs(g2.wx(100) - g.wx(100)) < 1e-9 && Math.abs(g2.wy(80) - g.wy(80)) < 1e-9, 'заагчийн доорх цэг');
  assert.ok(near(g2.kx, g.kx * 2) && near(g2.ky, g.ky * 2));
  assert.equal(G._camZoom(g, null, 1000, 0, 0).z, 8);
  assert.equal(G._camZoom(g, null, 1e-6, 0, 0).z, 0.2);
  const p = G._geo(vw, 440, G._camPan(g, null, 50, -30));
  assert.ok(Math.abs(p.X(0) - (g.X(0) + 50)) < 0.11 && Math.abs(p.Y(0) - (g.Y(0) - 30)) < 0.11, 'гүйлгэх');
  assert.equal(G._gstep(1, 34, 1), 1, 'гэрт үндсэн алхам');
  assert.equal(G._gstep(1, 34 * 0.2, 1), 2, 'жижигрүүлэхэд 2');
  assert.equal(G._gstep(1, 34 * 0.05, 1), 10, 'улам жижигрүүлэхэд 10');
  assert.equal(G._gstep(1, 34 * 8, 1), 1, 'самбар: цэг наалдах алхмаас нарийн биш');
  assert.equal(G._gstep(1, 34 * 8, 0.1), 0.2, '«График харах»: томруулахад 0.2');
  const pv = Object.assign({}, vw, { xf: 'pi2' });
  assert.deepEqual([1, 2, 3, 4, -1, -2, -3, 0.5].map(x => G._xlab(pv, x)), ['π/2', 'π', '3π/2', '2π', '−π/2', '−π', '−3π/2', '']);
  // «График харах»: томруулах товчтой, хөтөлбөрийн бүртгэлтэй
  const q = { q: '$y = 2x - 3$ функцийн графикийг байгуул', type: 'choice' };
  ctx.currentLessonId = 52; const out = G.viewFor(q); delete ctx.currentLessonId;
  assert.match(out, /class="cmg-view" data-cmgv="v\d+"/);
  assert.match(out, /<div class="cmg-zoom"[^>]*>.*data-z="in".*data-z="out".*data-z="home"/);
  assert.match(js, /sv\.addEventListener\('wheel', function \(e\) \{ navWheel\(me, e\); \}, \{ passive: false \}\);/);
});

test('«График харах»: текст дэх y = f(x)-ийг таних (x-ээс өөр үсэгтэйг алгасна)', () => {
  const ok = [['3x - 8', x => 3 * x - 8], ['\\dfrac{8}{x}', x => 8 / x], ['-x^2+4x-3', x => -x * x + 4 * x - 3], ['\\left(\\dfrac{1}{2}\\right)^x', x => Math.pow(0.5, x)], ['|x-1|-2', x => Math.abs(x - 1) - 2]];
  for (const [s, f] of ok) { const p = G._parseFn(s); assert.ok(p, s); [-2.5, -1, 0.5, 3].forEach(x => assert.ok(near(p(x), f(x)), s + ' @' + x)); }
  for (const s of ['kx+b', '\\dfrac{k}{x}', '\\sin x', 'e^x']) assert.equal(G._parseFn(s), null, s);
  assert.equal(G._findFns('$y=2x+4$ ба $y=3x-1$ шугаман функцүүд').length, 2);
  assert.equal(G._findFns('$x + y = 5$ ба $2x - y = 1$').length, 0, 'y нь тэгшитгэлийн эхэнд биш бол алгасна');
  assert.equal(G._findFns('$\\begin{cases} y = x + 1 \\\\ y = -2x + 4 \\end{cases}$').length, 2);
});
