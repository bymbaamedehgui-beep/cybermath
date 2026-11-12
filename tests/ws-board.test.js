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
  assert.match(s, /canvas\.wsb-ov\{pointer-events:none\}/, 'түр давхарга зурахад саад болохгүй');
});

test('ws-store.js: «Самбар» товч — ws-board.js-ийг дарахад л ачаална, QR/утсанд гарахгүй', () => {
  const s = R('ws-store.js').replace(/\r\n/g, '\n');
  assert.match(s, /if\(!IS_QR\)\{[^}]*boardBtn\(\);[^}]*\}/);
  assert.match(s, /s\.src='\/ws-board\.js\?v=\d+'/);
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
  assert.match(R('ws-store.js'), /s\.src='\/ws-board\.js\?v=4'/);
});
