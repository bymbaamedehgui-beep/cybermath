// «Хариу нөхөх» — cm-fill.js (2026-11-09, эзэмшигч: «нэг удаа гарч ирж байгаа 20 бодлогын дор хаяж 6-7 нь хариу нөхөх бодлого
//   байлгамаар байна. Язгуур дор, энгийн бутархай, матриц нтр гээд алийг нь нөхөх боломжтой болго»).
// Ажиллуулах: node --test tests/cm-fill.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const F = require('../cm-fill.js');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

const fill = (fx, arr) => { const v = {}; let k = 0; fx.parts.forEach(p => p.ids.forEach(id => { v[id] = arr[k++]; })); return v; };

test('TeX → тоо: бутархай, язгуур, π, зэрэг, градус, %, мянгатын зай, далд үржвэр', () => {
  const E = F.evalTex;
  assert.strictEqual(E('$\\dfrac{3}{4}$'), 0.75);
  assert.ok(Math.abs(E('2\\sqrt{3}') - 2 * Math.sqrt(3)) < 1e-12);
  assert.ok(Math.abs(E('\\dfrac{4\\pi}{3}') - 4 * Math.PI / 3) < 1e-12);
  assert.strictEqual(E('\\sqrt[3]{-8}'), -2);
  assert.strictEqual(E('2^{10}'), 1024);
  assert.strictEqual(E('45^{\\circ}'), 45);
  assert.strictEqual(E('25\\%'), 25);
  assert.strictEqual(E('10\\,235'), 10235);
  assert.strictEqual(E('-\\left(3-5\\right)\\cdot 2'), 4);
  assert.strictEqual(E('3{,}5'), 3.5);
  assert.throws(() => E('2x+1'));
});

test('Загвар: тоо → нүд, бүтэц хадгалагдана, тэргүүн хасах тэмдэг ил гарахгүй', () => {
  const T = c => { const fx = F.analyze(c); return fx && fx.tpl.replace(/\\placeholder\[p\d+\]\{\}/g, '□'); };
  assert.strictEqual(T('$-40$'), '□');
  assert.strictEqual(T('$\\dfrac{3}{5}$'), '\\frac{□}{□}');
  assert.strictEqual(T('$-\\dfrac{3}{5}$'), '\\frac{□}{□}');
  assert.strictEqual(T('$2\\sqrt{3}$'), '□\\sqrt{□}');
  assert.strictEqual(T('$-\\sqrt{3}$'), '□\\sqrt{□}');
  assert.strictEqual(T('$\\dfrac{1}{\\sqrt{3}}$'), '\\frac{□}{\\sqrt{□}}');
  assert.strictEqual(T('$\\sqrt[3]{5}$'), '\\sqrt[3]{□}');
  assert.strictEqual(T('$45^{\\circ}$'), '□^{\\circ}');
  assert.strictEqual(T('$x=\\pm 5$'), 'x_1=□,\\ x_2=□');
  assert.strictEqual(T('$x=\\pm\\sqrt{7}$'), 'x_1=□\\sqrt{□},\\ x_2=□\\sqrt{□}');
  assert.strictEqual(T('$x_1=-3,\\ x_2=2$'), 'x_1=□,\\ x_2=□');
  assert.strictEqual(T('$(5;\\,-6)$'), '(□;\\,□)');
  assert.strictEqual(T('$B(-12;\\,11)$'), 'B(□;\\,□)');
  assert.strictEqual(T('$\\begin{pmatrix}24&-20\\\\12&-24\\end{pmatrix}$'), '\\begin{pmatrix}□&□\\\\□&□\\end{pmatrix}');
  // Тоон бус / сонголт шаардсан хариу — нөхөх болохгүй
  ['$x\\lt 3$', '$]-\\infty;\\ 4[$', 'Эерэг', '$\\operatorname{tg}\\alpha$', '$8\\sin\\alpha$', '$y=2x-1$', '$x^{2}-9x+14=0$'].forEach(c => assert.strictEqual(F.analyze(c), null, c));
});

test('Шалгах: тоон утгаар — тэнцүү хэлбэрүүдийг зөвшөөрнө, буруу/хоосныг зөвшөөрөхгүй', () => {
  let fx = F.analyze('$-\\dfrac{3}{5}$');
  assert.ok(F.checkVals(fx, fill(fx, ['-3', '5'])));
  assert.ok(F.checkVals(fx, fill(fx, ['-6', '10'])), '6/10 = 3/5');
  assert.ok(F.checkVals(fx, fill(fx, ['3', '-5'])));
  assert.ok(!F.checkVals(fx, fill(fx, ['3', '5'])), 'тэмдэг буруу');
  assert.ok(!F.checkVals(fx, fill(fx, ['-3', ''])), 'хоосон нүд');
  fx = F.analyze('$2\\sqrt{3}$');
  assert.ok(F.checkVals(fx, fill(fx, ['2', '3'])) && F.checkVals(fx, fill(fx, ['1', '12'])) && !F.checkVals(fx, fill(fx, ['3', '2'])));
  fx = F.analyze('$x_1=-3,\\ x_2=2$');
  assert.ok(F.checkVals(fx, fill(fx, ['2', '-3'])), 'шийдийн дараалал хамаагүй');
  assert.ok(!F.checkVals(fx, fill(fx, ['3', '-2'])));
  fx = F.analyze('$x=\\pm 5$');
  assert.ok(F.checkVals(fx, fill(fx, ['-5', '5'])) && !F.checkVals(fx, fill(fx, ['5', '5'])));
  fx = F.analyze('$(5;\\,-6)$');
  assert.ok(F.checkVals(fx, fill(fx, ['5', '-6'])) && !F.checkVals(fx, fill(fx, ['-6', '5'])), 'цэгийн координат дарааллаар');
  fx = F.analyze('$(-1;\\,0),\\ (7;\\,0)$');
  assert.ok(F.checkVals(fx, fill(fx, ['7', '0', '-1', '0'])), 'олон цэг — дараалал хамаагүй');
  fx = F.analyze('$\\begin{pmatrix}1&-4\\\\0&1\\end{pmatrix}$');
  assert.ok(F.checkVals(fx, fill(fx, ['1', '-4', '0', '1'])) && !F.checkVals(fx, fill(fx, ['1', '0', '-4', '1'])));
  fx = F.analyze('$\\dfrac{1}{2}$');
  assert.ok(F.checkVals(fx, fill(fx, ['0.5', '1'])) && F.checkVals(fx, fill(fx, ['\\frac{1}{2}', '1'])) && F.checkVals(fx, fill(fx, ['0,5', '1'])), 'нүдэнд бутархай/аравтын');
});

test('Чөлөөт талбар (илэрхийлэл): хувьсагчийн утгаар тулгана; «задал» — үржвэр хэлбэр; хуулж бичихийг хүлээн авахгүй', () => {
  const T = (c, qt, u) => { const fx = F.analyzeExpr(c, qt); assert.ok(fx, c); return F.checkVals(fx, { p0: u }); };
  const Z = 'Олон гишүүнтийг үржигдэхүүн болгон задал';
  assert.ok(T('$(x+3)(x-5)$', Z, '(x-5)(x+3)'));
  assert.ok(!T('$(x+3)(x-5)$', Z, 'x^2-2x-15'), 'задлаагүй');
  assert.ok(T('$3x^{2}+2$', 'уламжлалыг ол', '2+3x^2') && !T('$3x^{2}+2$', 'уламжлалыг ол', '3x^2+3'));
  assert.ok(T("$y'=3x^{2}+2$", 'уламжлал', "y'=3x^2+2"), 'угтварыг дахин бичсэн');
  assert.ok(T('$\\dfrac{x+3}{2}$', 'урвуу функц', '\\frac{x}{2}+\\frac{3}{2}'));
  assert.ok(T('$8\\sin\\alpha$', 'хялбарчил', '8\\tan\\alpha\\cos\\alpha'), 'тригонометр');
  assert.ok(T('$\\left|x-1\\right|$', 'модул', '|1-x|'), 'модул');
  assert.ok(T('$a_{n}=3\\cdot 2^{n-1}$', 'ерөнхий гишүүн', '1.5\\cdot2^n'));
  assert.ok(!T('$4x+4$', 'хялбарчил', '(x+2)^2-x^2+(x+1)-(x+1)+0x+0'), 'хэт урт — хуулсан');
  const fx = F.analyzeExpr("$y'=3x^{2}+2$", 'q');
  assert.strictEqual(fx.tpl, "y'=\\placeholder[p0]{}");
  assert.strictEqual(F.analyzeExpr('$x\\lt 3$', 'q'), null);
  assert.strictEqual(F.analyzeExpr('$5$', 'q'), null, 'тоо — тоон загвар');
});

test('«X аль нь вэ?» → нөхөх үед «X ямар вэ?»; «Аль цэг…», «Дараах … аль нь …» сонголттой хэвээр', () => {
  const fx = F.eligible({ q: '$y=x+5$ шулуун $Ox$ тэнхлэгийг огтлох цэг аль нь вэ?', correctAnswer: '$(-5;\\,0)$', type: 'choice' });
  assert.ok(fx && fx.text === '$y=x+5$ шулуун $Ox$ тэнхлэгийг огтлох цэг ямар вэ?');
  assert.strictEqual(F.eligible({ q: 'Аль цэг $y=2x+2$ шулуун дээр орших вэ?', correctAnswer: '$(4;\\,10)$', type: 'choice' }), null);
  assert.strictEqual(F.eligible({ q: 'Дараах тоонуудын аль нь иррационал вэ?', correctAnswer: '$\\sqrt{2}$', type: 'choice' }), null);
  const L = { questions: [{ q: 'a', type: 'choice', correctAnswer: 'Эерэг' }, { q: 'Шийд аль нь вэ?', type: 'choice', correctAnswer: '$x=4$' }] };
  assert.strictEqual(F.inject(L, { count: 1 }), 1);
  assert.strictEqual(L.questions[1].q, 'Шийд ямар вэ?');
});

test('Хичээл: 20 бодлогоос 7 нөхөх (эхнийх сонголт), «аль нь…» асуулт сонголттой хэвээр', () => {
  const qs = [];
  for (let i = 0; i < 20; i++) qs.push({ q: i % 4 === 0 ? 'Аль нь зөв бэ?' : 'Хэд вэ?', type: 'choice', correctAnswer: '$' + (i + 2) + '$', options: ['a'] });
  const L = { questions: qs };
  assert.strictEqual(F.inject(L), 7);
  const fx = L.questions.filter(q => q.type === 'fillx');
  assert.strictEqual(fx.length, 7);
  assert.strictEqual(L.questions[0].type, 'choice');
  assert.ok(fx.every(q => !/Аль/.test(q.q)));
  // тохирох бодлого цөөн бол байгаагаараа
  const L2 = { questions: qs.map((q, i) => Object.assign({}, q, { type: 'choice', correctAnswer: i < 4 ? '$5$' : 'Эерэг' })) };
  assert.strictEqual(F.inject(L2), 3);
});

test('11-р ангийн бүх бодлого: тохирох хариу ≥ 55%, зөв утгыг загварт тавихад үргэлж зөв, тэмдэг ил гарахгүй', () => {
  const G = require('../api/_g11path.js');
  let n = 0;
  G.QUESTIONS.forEach(q => {
    const fx = F.eligible({ q: q.text, correctAnswer: q.correct, type: 'choice' });
    if (!fx) return;
    n++;
    assert.ok(F.checkVals(fx, F.ownVals(fx)), q.node_id + ' ' + q.correct + ' → ' + fx.tpl);
    assert.doesNotMatch(fx.tpl.replace(/\\placeholder\[p\d+\]\{\}/g, '□'), /^-|=-|\(-|;\\,-/, q.correct);
  });
  assert.ok(n / G.QUESTIONS.length >= 0.7, 'тохирох ' + n + '/' + G.QUESTIONS.length);
});

test('index.html холболт: script, inject, answerHtml, mount, checkAnswer; vercel build', () => {
  const html = R('index.html'), v = JSON.parse(R('vercel.json'));
  assert.match(html, /<script src="\/cm-fill\.js\?v=\d+" defer><\/script>/);
  assert.match(html, /window\.cmFill\.inject\(currentLesson\)/);
  assert.match(html, /if \(type === 'fillx' && window\.cmFill\) return window\.cmFill\.answerHtml\(qData\);/);
  assert.match(html, /if \(window\.cmFill\) window\.cmFill\.mount\(qData\);/);
  assert.match(html, /type === 'fillx'\) \{\s*\n\s*var _fx = window\.cmFill \? window\.cmFill\.check\(qData\)/);
  assert.ok(v.builds.some(b => b.src === 'cm-fill.js'), 'vercel.json builds');
});
