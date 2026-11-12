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

test('ws-store.js: «Самбар» товч — ws-board.js-ийг дарахад л ачаална, QR/утсанд гарахгүй', () => {
  const s = R('ws-store.js').replace(/\r\n/g, '\n');
  assert.match(s, /if\(!IS_QR\)\{[^}]*boardBtn\(\);\}/);
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
