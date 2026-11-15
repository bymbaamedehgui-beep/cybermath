// Дасгалын дэвтэр B5 (176×250 мм): «Дасгал ажлын дэвтэр» → A4 / B5 сонголт; B5-ийн тохиргоо тусдаа, A4-ийнх хөндөгдөхгүй
// Ажиллуулах: node --test tests/ws-book-b5.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = R('ws-book.js'), br = R('ws-browse.js'), css = R('ws-browse.css');
function load() { const win = { WSB: {} }; win.window = win; vm.runInNewContext(src, win); return win.WSBOOK; }
const J = o => JSON.parse(JSON.stringify(o));   // vm-ийн объектыг энэ орчны объект болгоно

test('b5Settings: өөрийн мөргүй хуудас A4-ийн агуулгын сонголтыг өвлөнө («Шалгасан», хуудасны тоо — үгүй); өөрийнх нь давамгайлна', () => {
  const W = load();
  const out = J(W._b5Settings(
    { 'a.html': { off: true, nw: false, t: 'Гарчиг', n: [4], r: 7, g: [0, 1], bh: { '0.1': 12 }, ok: true, p: 2, s: 1 }, 'b.html': { ok: true, p: 1 } },
    { 'b.html': { p: 2, ok: false } }));
  assert.deepStrictEqual(out['a.html'], { off: true, nw: false, t: 'Гарчиг', n: [4], r: 7, g: [0, 1], bh: { '0.1': 12 } });
  assert.deepStrictEqual(out['b.html'], { p: 2, ok: false });
  assert.deepStrictEqual(J(W._b5Settings(undefined, undefined)), {});
});

test('B5 CSS: хуудас 176×250 мм, захын зай 10, талбай 156 мм; A4-ийн CSS хэвээр', () => {
  const W = load();
  assert.match(W._cssB5, /^@page\{size:176mm 250mm;margin:10mm\}/);
  assert.match(W._cssB5, /\.b5 \.wsx-paper\{width:156mm;padding:10mm\}/);
  assert.match(W._css, /^@page\{size:A4;margin:11mm;/);
  assert.match(W._css, /\.wsx-paper\{position:relative;width:188mm;padding:11mm;/);
  assert.ok(!/\.b5\b/.test(W._css), 'A4-ийн CSS-д B5 дүрэм байхгүй');
});

test('build/bookMain: B5 бол book_get/book_set-д paper: b5, попапд B5 CSS, хуудасны өндөр 230 мм; A4 бол хуучнаараа', () => {
  assert.match(src, /JSON\.stringify\(b5 \? \{ action: 'book_get', paper: 'b5' \} : \{ action: 'book_get' \}\)/);
  assert.match(src, /'<style>' \+ BOOK_CSS \+ \(b5 \? BOOK_CSS_B5 : ''\) \+ '<\/style>/);
  assert.match(src, /if \(PAPER\.key\) body\.paper = 'b5';/);
  assert.match(src, /PAPER = \{ pw: 176, ph: 250, m: 10, key: 'b5:' \};\s*PAGE_H = \(PAPER\.ph - 2 \* PAPER\.m\) \* MM; FIT_H = PAGE_H - 8 \* MM;/);
  assert.match(src, /var PAPER = \{ pw: 210, ph: 297, m: 11, key: '' \};/);
  assert.match(src, /localStorage\.setItem\(TG_KEY \+ PAPER\.key \+ D\.label, TG\)/, 'зорилт B5-д тусдаа');
  assert.match(src, /localStorage\.setItem\(VOL_KEY \+ PAPER\.key \+ D\.label, JSON\.stringify\(VR\)\)/, 'дэвтрийн хүрээ B5-д тусдаа');
  new Function(load()._main.toString());
});

test('ws-browse: «Дасгал ажлын дэвтэр» → A4 / B5 сонголт, сонголтоор попап (paper), ws-book.js шинэ хувилбар, эможигүй', () => {
  assert.match(br, /data-bookp="a4"/); assert.match(br, /data-bookp="b5"/);
  assert.match(br, /openBook\(el\.getAttribute\('data-bookp'\)\)/);
  assert.match(br, /window\.WSBOOK\.build\(g, pw, paper\)/);
  assert.match(br, /s\.src = '\/ws-book\.js\?v=21';/);
  assert.match(css, /\.wsb-bkm\{position:absolute;/);
  assert.doesNotMatch(br.slice(br.indexOf('function bookMenu'), br.indexOf('function openBook')), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  new Function(br);
});
