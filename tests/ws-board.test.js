// Смарт дэлгэцийн самбар — ws-board.js (2026-11-12, эзэмшигч Б хувилбарыг сонгосон: зүүн талд хуудас, баруун талд гараар бичих самбар)
// Ажиллуулах: node --test tests/ws-board.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const B = require('../ws-board.js');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

test('түүх: нэмэх, буцаах, дахих, цэвэрлэхийг буцаах', () => {
  const pg = B.newPage();
  const s1 = { p: [[1, 1]] }, s2 = { p: [[2, 2]] }, s3 = { p: [[3, 3]] };
  B.addStroke(pg, s1); B.addStroke(pg, s2);
  assert.deepStrictEqual(pg.strokes, [s1, s2]);
  assert.ok(B.undo(pg)); assert.deepStrictEqual(pg.strokes, [s1]);
  assert.ok(B.redo(pg)); assert.deepStrictEqual(pg.strokes, [s1, s2]);
  assert.ok(B.clearPage(pg)); assert.deepStrictEqual(pg.strokes, []);
  assert.strictEqual(B.clearPage(pg), false, 'хоосон хуудсыг цэвэрлэх үйлдэл түүхэнд орохгүй');
  assert.ok(B.undo(pg)); assert.deepStrictEqual(pg.strokes, [s1, s2], 'цэвэрлэснийг буцаана');
  assert.ok(B.redo(pg)); assert.deepStrictEqual(pg.strokes, []);
  assert.ok(B.undo(pg)); B.addStroke(pg, s3);
  assert.deepStrictEqual(pg.strokes, [s1, s2, s3]);
  assert.strictEqual(B.redo(pg), false, 'шинэ зурлага дахих түүхийг арилгана');
  while (B.undo(pg));
  assert.deepStrictEqual(pg.strokes, []);
  assert.strictEqual(B.undo(pg), false);
});

test('хүрээлж арилгах: хагасаас их нь дотор орсон зурлага бүхэлдээ, хажуугаар өнгөрсөн урт шугам үлдэнэ; баллуурын зурлагад хүрэхгүй', () => {
  const pg = B.newPage();
  const box = [[0, 0], [100, 0], [100, 100], [0, 100]];
  const tail = { p: [[20, 20], [50, 20], [80, 20], [110, 20], [130, 20]] };   // сүүл нь хүрээнээс гарсан үсэг (≈82% дотор)
  const line = { p: [[-200, 50], [300, 50]] };                                // хүрээг дайрсан урт шугам (20% дотор)
  const er = { er: true, w: 34, p: [[50, 50], [60, 60]] };
  const dot = { p: [[10, 90]] }, out = { p: [[200, 200], [220, 210]] };
  [tail, line, er, dot, out].forEach((s) => B.addStroke(pg, s));
  assert.ok(Math.abs(B.insideFrac(line, box) - 0.2) < 0.02, 'урт хэрчмийг нэг цэгээр биш, алхмаар шалгана');
  assert.ok(B.eraseLasso(pg, box));
  assert.deepStrictEqual(pg.strokes, [line, er, out]);
  assert.ok(B.undo(pg)); assert.deepStrictEqual(pg.strokes, [tail, line, er, dot, out], 'анхны дараалалдаа буцна');
  assert.ok(B.redo(pg)); assert.deepStrictEqual(pg.strokes, [line, er, out]);
  const n = pg.undo.length;
  assert.strictEqual(B.eraseLasso(pg, [[500, 500], [600, 500], [600, 600], [500, 600]]), false, 'юу ч ороогүй хүрээ түүхэнд орохгүй');
  assert.strictEqual(B.eraseLasso(pg, [[0, 0], [5, 0], [5, 5]]), false, 'санамсаргүй жижиг хүрээ');
  assert.strictEqual(B.eraseLasso(pg, [[0, 0], [1, 1]]), false);
  assert.strictEqual(pg.undo.length, n);
  B.addStroke(pg, { p: [[1, 1]] }); assert.ok(B.undo(pg)); assert.ok(B.undo(pg));
  assert.deepStrictEqual(pg.strokes, [tail, line, er, dot, out], 'устгалын дараах нэмэлтийг буцаахад дараалал эвдрэхгүй');
  assert.ok(B.clearPage(pg)); assert.ok(B.undo(pg)); assert.strictEqual(pg.strokes.length, 5);
});

test('хоёр хуруу / алга: төв ба радиус; алганы босго хамгийн жижиг хүрэлтээр (хэмжээг өөр нэгжээр өгдөг самбар)', () => {
  assert.deepStrictEqual(B.gestureOf([{ x: 100, y: 100, s: 12 }, { x: 140, y: 100, s: 12 }]), { x: 120, y: 100, r: 40 });
  assert.deepStrictEqual(B.gestureOf([{ x: 10, y: 10, s: 90 }]), { x: 10, y: 10, r: 59 });
  assert.strictEqual(B.gestureOf([{ x: 0, y: 0, s: 0 }]).r, 26, 'доод хэмжээ');
  assert.strictEqual(B.gestureOf([{ x: 0, y: 0, s: 900 }]).r, 150, 'дээд хэмжээ');
  assert.strictEqual(B.palmAt(Infinity), Infinity, 'анхны хүрэлт хэзээ ч алга болохгүй');
  assert.strictEqual(B.palmAt(12), 44);
  assert.strictEqual(Math.round(B.palmAt(60)), 156, 'хуруугаа 60 гэж өгдөг самбарт хуруу баллуур болохгүй');
});

test('баллуурын цэс ба хүрэлт: зурж · хүрээлж · бүгдийг арилгах, унтраах сонголт; бичиж байхад хүрсэн гарыг тоохгүй', () => {
  const s = R('ws-board.js');
  assert.match(s, /data-er="draw" role="menuitemradio">' \+ ICO\.eraser \+ 'Зурж арилгах/);
  assert.match(s, /data-er="lasso" role="menuitemradio">' \+ ICO\.lasso \+ 'Хүрээлж арилгах/);
  assert.match(s, /data-er="all" role="menuitem" class="wsb-erm-all">' \+ ICO\.trash \+ 'Бүгдийг арилгах/);
  assert.match(s, /Хоёр хуруу, алгаар арчих/);
  assert.match(s, /if \(touch && st\.gest && fresh\(\) && near\(live\.id, e\.pointerId\)\) \{ live = null; render\(\); gStart\(\); return; \}/, 'дөнгөж эхэлсэн зурлага + хоёр дахь хуруу → баллуур');
  assert.match(s, /delete tp\[e\.pointerId\]; dead\[e\.pointerId\] = 1; return;/, 'бичиж байхад хүрсэн гар');
  assert.match(s, /if \(touch && st\.gest && sz && sz >= palmAt\(minS\)\) \{ gStart\(\); return; \}/, 'алга');
  assert.match(s, /canvas\.wsb-ov\{pointer-events:none;mix-blend-mode:multiply\}/, 'түр давхарга зурахад саад болохгүй');
});

test('компьютерыг дагах: сүлжээгээр ирсэн зурлагыг шалгаж томруулна; буруу өнгө/бүтэц хасагдана', () => {
  assert.deepStrictEqual(B.normStroke({ c: '#1f1d2e', w: 3, p: [[1, 2], [3, 4]] }, 2), { p: [[2, 4], [6, 8]], w: 6, c: '#1f1d2e' });
  assert.deepStrictEqual(B.normStroke({ c: '#FACC15', w: 20, t: 'hl', p: [[1, 1]] }, 1), { p: [[1, 1]], w: 20, c: '#FACC15', t: 'hl' });
  assert.deepStrictEqual(B.normStroke({ er: true, g: 1, w: 0, p: [[1, 1, 30], null, [2, 2, 40]] }, 0.5), { p: [[0.5, 0.5, 15], null, [1, 1, 20]], w: 0, er: true, g: 1 });
  assert.strictEqual(B.normStroke({ c: 'red;background:url(x)', w: 3, p: [[1, 1]] }, 1), null, 'өнгө зөвхөн #rrggbb');
  assert.strictEqual(B.normStroke({ c: '#000000', w: 3, p: [[1, 'x']] }, 1), null);
  assert.strictEqual(B.normStroke({ c: '#000000', w: 3, p: [null] }, 1), null, 'null зөвхөн хоёр хурууны баллуурт');
  assert.strictEqual(B.normStroke({ c: '#000000', t: 'evil', w: 3, p: [[1, 1]] }, 1).t, undefined);
});

test('бэхний өнгө самбарын өнгөнд дасна: хос өнгө рүүгээ (хар↔цагаан, шар↔цайвар шар); бусад өнгөнд гэрэлтэлтээр', () => {
  assert.strictEqual(B.INK_L.length, 12); assert.strictEqual(B.INK_D.length, 12);
  B.INK_L.forEach((c, i) => {
    assert.strictEqual(B.inkOn(c[0], true), B.INK_D[i][0], c[1] + ' → бараан самбарт');
    assert.strictEqual(B.inkOn(B.INK_D[i][0], false), c[0], c[1] + ' → цайвар самбарт');
    assert.strictEqual(B.inkOn(c[0], false), c[0], 'өөрийн самбарт хэвээр');
  });
  assert.strictEqual(B.inkOn('#000000', true), '#ffffff', 'жагсаалтад байхгүй бараан бэх');
  assert.strictEqual(B.inkOn('#fefefe', false), '#1f1d2e', 'жагсаалтад байхгүй цайвар бэх');
  assert.strictEqual(B.inkOn('#123456', false), '#123456');
});

test('бичих хэрэгсэл: үзэг · харандаа · тодруулагч, зузааныг гулсуураар; нэг өнгөний товч → өнгөний самбар; улаан цэг заагч', () => {
  const s = R('ws-board.js');
  assert.match(s, /var PENS = \[\['pen', 'Үзэг'\], \['pencil', 'Харандаа'\], \['hl', 'Тодруулагч'\]\];/);
  assert.match(s, /var WR = \{ pen: \[1, 24, 3\], pencil: \[1, 16, 2\], hl: \[8, 60, 22\] \}, ER_R = \[12, 120, 34\];/, 'зузааны муж');
  assert.match(s, /slider\('wsb-ptw', 'Зузаан', WR\.pen\)/);
  assert.match(s, /slider\('wsb-erw', 'Баллуурын хэмжээ', ER_R\)/);
  assert.match(s, /<button type="button" class="wsb-col" title="Өнгө"/, 'нэг өнгөний товч');
  assert.doesNotMatch(s, /class="wsb-c" data-c=/, 'хэрэгслийн мөрөнд 4 өнгөний товч байхгүй');
  assert.match(s, /fill="#ef4444"/, 'улаан цэг');
  assert.match(s, /el\.cv\.style\.cursor = st\.eraser && !lasso \? curEr\(st\.erW\) : CUR_DOT;/);
  assert.match(s, /c\.globalCompositeOperation = dark\(\) \? 'source-over' : 'multiply'; c\.globalAlpha = dark\(\) \? 0\.5 : 0\.4;/, 'тодруулагч бичгийг халхлахгүй');
  assert.match(s, /if \(st\.ro \|\| \(e\.pointerType === 'mouse' && e\.button !== 0\)\) return;/, 'дагаж буй самбар дээр зурахгүй');
});

test('дэвсгэр: тор · шугам · хоосон · координат; самбарын өнгө цагаан · хар · ногоон · хөх (хадгалагдана, дагалтад ордог)', () => {
  const s = R('ws-board.js');
  assert.match(s, /var BGS = \[\['grid', 'Тор'\], \['lines', 'Шугам'\], \['blank', 'Хоосон'\], \['coord', 'Координат'\]\];/);
  assert.match(s, /var TONES = \[\['white', 'Цагаан', '#ffffff'\], \['black', 'Хар', '#15171e'\], \['green', 'Ногоон', '#1d3a2c'\], \['navy', 'Хөх', '#14213d'\]\];/);
  assert.match(s, /save\('cm_wsb_bg', JSON\.stringify\(\{ b: st\.bg, t: st\.tone \}\)\);/);
  assert.match(s, /return \{ open: st\.on, frac: st\.frac, bg: st\.bg, tone: st\.tone,/, 'компьютерыг дагах төлөвт өнгө');
  assert.match(s, /if \(isCoord\(\)\) plane\(c, w, h\);/);
  assert.match(R('api/_wsboard.js'), /bg: num\(o\.bg, 0, 3, 0\) \| 0, tone: num\(o\.tone, 0, 3, 0\) \| 0,/);
});

test('функц ба тооны машин: eval-гүй задлагч (далд үржвэр, sin x, √, |x|, градус, n!, %, Ans, хаалт хаах), бутархай, нэр', () => {
  const f = (s, x) => B.compileFn(s)(x);
  assert.strictEqual(f('y = 2x + 1', 3), 7);
  assert.strictEqual(f('x^2 − 4', 3), 5);
  assert.strictEqual(f('(x+1)(x-1)', 2), 3);
  assert.strictEqual(f('|x − 3|', 1), 2);
  assert.strictEqual(f('2,5x', 2), 5, 'аравтын таслал');
  assert.ok(Math.abs(f('2sin x', Math.PI / 2) - 2) < 1e-12);
  assert.ok(Math.abs(f('sin(x)^2 + cos(x)^2', 0.7) - 1) < 1e-12);
  assert.strictEqual(f('√x', 9), 3);
  assert.strictEqual(f('-x^2', 3), -9);
  assert.strictEqual(B.compileFn('x+'), null);
  assert.strictEqual(B.compileFn('alert(1)'), null, 'зөвшөөрөөгүй нэр');
  assert.strictEqual(B.compileFn('constructor'), null);
  const c = (s, deg, ans) => B.calcEval(s, deg !== false, ans);
  assert.ok(Math.abs(c('sin(30') - 0.5) < 1e-12, 'градус, хаагаагүй хаалт');
  assert.ok(Math.abs(c('tg(45)') - 1) < 1e-12);
  assert.ok(Number.isNaN(c('tg(90)')), 'tg 90° тодорхойгүй');
  assert.ok(Math.abs(c('arcsin(0,5)') - 30) < 1e-9);
  assert.strictEqual(c('5!'), 120);
  assert.strictEqual(c('50%×8'), 4);
  assert.strictEqual(c('2^10'), 1024);
  assert.strictEqual(c('∛(27)'), 3);
  assert.ok(Math.abs(c('lg(1000)') - 3) < 1e-12);
  assert.strictEqual(c('Ans×2', true, 21), 42);
  assert.ok(Math.abs(c('sin(π/6)', false) - 0.5) < 1e-12, 'радиан');
  assert.deepStrictEqual(B.toFrac(0.75), [3, 4]);
  assert.deepStrictEqual(B.toFrac(-1.5), [-3, 2]);
  assert.strictEqual(B.toFrac(Math.PI), null);
  assert.strictEqual(B.fmtCalc(-0.5), '−0.5');
  assert.strictEqual(B.fmtCalc(1.5e21), '1.5×10²¹');
  assert.strictEqual(B.fmtCalc(2.5e-7), '2.5×10⁻⁷');
  assert.strictEqual(B.fmtCalc(Math.sin(Math.PI)), '0', 'хөвөгч таслалын шуугиан (1.2e-16) → 0');
  assert.deepStrictEqual([B.ptName(0), B.ptName(25), B.ptName(26)], ['A', 'Z', 'A₁']);
  assert.strictEqual(B.fmtNum(-2.5), '−2.5');
});

test('геометр: цэвэрлэх/геометрийн өөрчлөлтийг буцаах, дахих; ирсэн геометрийг шалгана', () => {
  const pg = B.newPage();
  pg.geo = { pts: [{ id: 1, x: 1, y: 2, nm: 'A', c: '#1f1d2e' }], objs: [], fns: [], n: 1 };
  const prev = JSON.parse(JSON.stringify(pg.geo));
  pg.geo.pts.push({ id: 2, x: 3, y: 4, nm: 'B', c: '#1f1d2e' }); B.geoOp(pg, prev);
  assert.ok(B.undo(pg)); assert.strictEqual(pg.geo.pts.length, 1);
  assert.ok(B.redo(pg)); assert.strictEqual(pg.geo.pts.length, 2);
  assert.ok(B.clearPage(pg), 'бичиггүй ч геометртэй бол цэвэрлэнэ'); assert.strictEqual(pg.geo.pts.length, 0);
  assert.ok(B.undo(pg)); assert.strictEqual(pg.geo.pts.length, 2);
  const g = B.normGeo({ pts: [{ id: 1, x: 0, y: 0, nm: 'A', c: '#000000' }, { id: 2, x: 'x', y: 0, c: '#000000' }, { id: 3, x: 2, y: 0, nm: 'C', c: '#000000' }],
    objs: [{ t: 'seg', p: [1, 3], c: '#000000' }, { t: 'seg', p: [1, 2], c: '#000000' }, { t: 'evil', p: [1, 3], c: '#000000' }],
    fns: [{ f: 'x^2', c: '#2563eb' }, { f: 'alert(1)', c: '#2563eb' }], n: 3 });
  assert.deepStrictEqual([g.pts.length, g.objs.length, g.fns.length], [2, 1, 1], 'буруу цэг, холбоосгүй дүрс, зөвшөөрөөгүй функц хасагдана');
});

test('геометр, тооны машин, санамжийн цэс ба товч (самбар нээлттэй үед л)', () => {
  const s = R('ws-board.js');
  ['Цэг', 'Хэрчим', 'Шулуун', 'Цацраг', 'Олон өнцөгт', 'Тойрог', 'Гурвалжин', 'Тэгш өнцөгт', 'Зөөх', 'Устгах'].forEach((n) => assert.ok(s.includes("'" + n + "'"), n));
  assert.match(s, /class="wsb-calcb" title="Тооны машин"/);
  assert.match(s, /class="wsb-hintb" title="Санамж[^"]*" hidden>/, 'таарах сэдэвгүй бол санамжийн товч гарахгүй');
  assert.match(s, /border-left:4px solid #A855F7/, 'санамж шар дэвсгэргүй, ягаан аксенттай');
  assert.doesNotMatch(s, /new Function|eval\(/, 'илэрхийллийг eval-гүй задална');
});

test('самбарыг гүйлгэх, томруулах (бүх дэвсгэрт): дугуй, зурвас, «Гүйлгэх», чимхэх; тор/шугам бичгийн хамт', () => {
  const s = R('ws-board.js');
  assert.match(s, /else panBy\(e\.shiftKey \? -e\.deltaY : -e\.deltaX, e\.shiftKey \? 0 : -e\.deltaY\);/, 'дугуйгаар гүйлгэнэ');
  assert.match(s, /if \(e\.ctrlKey \|\| isCoord\(\)\) zoomAt\(/, 'Ctrl+дугуйгаар томруулна');
  assert.match(s, /if \(ts\.length === 2\) \{ live\.mode = 'pend'; live\.z0 = pinch0\(ts\); return; \}/, 'бүх дэвсгэрт чимхэж томруулна');
  assert.match(s, /function sbar\(\)/); assert.match(s, /class="wsb-vs"/, 'гүйлгэх зурвас');
  assert.match(s, /data-pz="hand"/, '«Гүйлгэх» горим');
  assert.match(s, /if \(isCoord\(\)\) plane\(c, w, h\); else pattern\(c, w, h\);/, 'тор/шугам канвас дээр');
  assert.doesNotMatch(s, /\.wsb-paper\.bg-grid\{background-image/, 'CSS тор гүйлгэхэд хөдлөхгүй тул хасагдсан');
});

test('муруй: цэгүүдийг гөлгөр муруйгаар холбоно (парабол, гипербол); ирсэн муруй, битүү эсэхийг шалгана', () => {
  const s = R('ws-board.js');
  assert.match(s, /\['curve', 'Муруй'\]/);
  assert.match(s, /function smooth\(c, P, closed\)/);
  assert.match(s, /else if \(ob\.t === 'curve'\) smooth\(c, ps\.map\(S\), !!ob\.cl\);/);
  const g = B.normGeo({ pts: [{ id: 1, x: -1, y: 1, c: '#000000' }, { id: 2, x: 0, y: 0, c: '#000000' }, { id: 3, x: 1, y: 1, c: '#000000' }],
    objs: [{ t: 'curve', p: [1, 2, 3], c: '#000000' }, { t: 'curve', p: [1, 2, 3], c: '#000000', cl: 1 }, { t: 'curve', p: [1, 9], c: '#000000' }], n: 3 });
  assert.deepStrictEqual(g.objs, [{ t: 'curve', p: [1, 2, 3], c: '#000000' }, { t: 'curve', p: [1, 2, 3], c: '#000000', cl: 1 }]);
});

test('санамж: ажлын хуудас БҮРД (гарчгаар) томьёо гарна — сэдэв таарахгүй бол ангийн гол томьёо', () => {
  const dir = path.join(__dirname, '..'), miss = [];
  let n = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.html') || f === 'index.html' || f === 'worksheets.html') continue;
    const src = fs.readFileSync(path.join(dir, f), 'utf8');
    if (src.indexOf('ws-store.js') < 0) continue;
    const t = (/<title>([^<]*)<\/title>/.exec(src) || [])[1] || '';
    n++;
    const h = B.hintsFor(t + ' /' + f);
    if (!h.length || h.some((x) => !x[1] || !x[2].length || x[2].some((y) => typeof y !== 'string' || !y))) miss.push(f + ' — ' + t);
  }
  assert.ok(n > 1000, 'ажлын хуудсууд олдсон: ' + n);
  assert.deepStrictEqual(miss, [], 'санамжгүй хуудас');
  assert.strictEqual(B.hintsFor('Логарифмын чанар-1 (12-р анги)')[0][1], 'Логарифм');
  assert.strictEqual(B.hintsFor('I бүлэг — Жишиг даалгавар (7-р анги)')[0][1], '7-р анги — гол томьёо', 'бүлгийн жишиг — ангийн карт');
  assert.ok(B.hintsFor('Квадрат тэнцэтгэл биш — интервалын арга').length <= 2, 'ихдээ 2 карт');
  // Өмнө буруу таарч байсан сэдвүүд (үгийн хувилбар, давхцал)
  const T = (t) => B.hintsFor(t).map((x) => x[1]);
  assert.deepStrictEqual(T('Олонлог-1 (6-р анги) /olonlog-1-6.html'), ['Олонлог'], 'olonlog- — логарифм биш');
  assert.deepStrictEqual(T('Солбисон өнцөг · зэрэгцээ шулуун ба огтлогч /solbison-ongo.html'), ['Параллель шулуун', 'Өнцөг'], 'зэрэгцээ — зэрэг биш');
  assert.strictEqual(T('Гурван хувьсагчтай ШТС — Гаусс 1 (11-р анги)')[0], 'Тэгшитгэлийн систем', 'хувьсагч — хувь биш');
  assert.deepStrictEqual(T('Тоолох бодлогууд-1 (6-р анги)'), ['Тоолох'], 'бодлого → бодлогууд');
  assert.deepStrictEqual(T('Үйлдлийн дараалал-1 (3-р анги)'), ['Үйлдлийн дараалал'], 'прогресс биш');
  assert.deepStrictEqual(T('Шүргэгч, талбай ба урвуу бодлого — хүнд (10-р анги) /shurgegch-hard-2-10.html'), ['Шүргэгч', 'Талбай, периметр'], 'муруйн шүргэгч — тойргийнх биш');
  assert.deepStrictEqual(T('Аравтын бутархай нэмэх — 18 бодлого (6-р анги)'), ['Бутархай'], 'тусгай карт байвал ерөнхий нь гарахгүй');
  assert.deepStrictEqual(T('Баганаар нэмэх, хасах-1 (3-р анги)'), ['Нэмэх, хасах'], 'тусгай карт байхгүй бол ерөнхий нь');
});

test('ws-store.js: «Самбар» товч — ws-board.js-ийг дарахад л ачаална, QR/утсанд гарахгүй', () => {
  const s = R('ws-store.js').replace(/\r\n/g, '\n');
  assert.match(s, /if\(!IS_QR\)\{[^}]*boardBtn\(\);[^}]*\}/);
  assert.match(s, /var BOARD_JS='\/ws-board\.js\?v=\d+'/);
  assert.match(s, /if\(window\.wsBoard\)\{window\.wsBoard\.toggle\(\);return;\}/);
  assert.match(s, /@media \(max-width:900px\)\{'\+B\+'>\.ws-board\{display:none\}\}/);
  assert.doesNotMatch(s, /<script[^>]*ws-board/, 'хуудас бүрт урьдчилж ачаалахгүй');
  const v = JSON.parse(R('vercel.json'));
  assert.ok(v.builds.some((b) => b.src === 'ws-board.js'), 'build entry');
});

test('ws-board.js: хэвлэхэд гарахгүй, эможигүй, том товчтой', () => {
  const s = R('ws-board.js');
  assert.match(s, /@media print\{#wsBoard\{display:none!important\}/);
  assert.match(s, /min-width:48px;height:48px/);
  assert.match(s, /touch-action:none/);
  assert.doesNotMatch(s, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('самбартай үед зөвхөн ажлын хуудас томорно: товч, Ctrl+дугуй/товчлол, чимхэлт; хөтчийн томруулалтыг хаана', () => {
  const s = R('ws-board.js');
  assert.match(s, /html\.wsb-on,html\.wsb-on body\{touch-action:pan-x pan-y\}/, 'хөтчийн чимхэж томруулалтыг хаана');
  assert.match(s, /W\.addEventListener\('wheel', function \(e\) \{\s*if \(!st\.on \|\| !e\.ctrlKey\) return;\s*e\.preventDefault\(\);/);
  assert.match(s, /\}, \{ passive: false \}\);/);
  assert.match(s, /data-z="-"[\s\S]*data-z="\+"[\s\S]*data-z="0"/, '− + Багтаах');
  assert.match(s, /function spacer\(\)/, 'томруулсан хуудас самбарын доор нуугдахгүй');
  assert.match(R('ws-store.js'), /var BOARD_JS='\/ws-board\.js\?v=8'/);
});
