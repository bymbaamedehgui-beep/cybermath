// Ажлын хуудас: даалгавар тус бүрээс хэдэн бодлого хэвлэх (ws-store.js «− тоо +», эзэмшигч 2026-11-10).
// Удирдлага хэвлэхэд харагдахгүй, 0 — даалгавар хэвлэгдэхгүй, хэвлэхэд дугаар дараална, хадгалах багцад нуусан бодлого орохгүй,
// гарчгийн агуулгад (админы засвар) хүрэхгүй. Хөтчийн бүрэн шалгалт: scratchpad ux/wsc_check.js. Ажиллуулах: node --test tests/ws-counts.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const js = fs.readFileSync(path.join(__dirname, '..', 'ws-store.js'), 'utf8').replace(/\r\n/g, '\n');

test('ws-store.js: синтакс', () => { new Function(js); });

test('хэвлэхэд: удирдлага, нуусан бодлого/хариу, 0 болсон даалгавар харагдахгүй; дэлгэцэнд бүдэг гарчиг үлдэнэ', () => {
  assert.match(js, /@media print\{\.wsc-row,\.wsc\{display:none!important\}\.task\.wsc-off\{display:none!important\}/);
  assert.match(js, /\.wsc-h\{display:none!important\}/);
  assert.match(js, /@media screen\{\.wsc-has\{padding-right:112px!important\}\.task\.wsc-off\{opacity:\.38\}\}/);
});

test('тоо: 0..нийт, бүгд бол хадгалахгүй (анхдагч), хуудас бүрт localStorage; «Шинэ бодлого»/бодолтын зайны дараа дахин хэрэгжинэ', () => {
  assert.match(js, /var WSC_KEY='cm_wsc_'\+/);
  assert.match(js, /v=Math\.max\(0,Math\.min\(max,Math\.round\(\+v\|\|0\)\)\);\n    if\(v>=max\)delete C\[i\]; else C\[i\]=v;/);
  assert.match(js, /new MutationObserver\(function\(\)\{ if\(!sh\.querySelector\('\.cm-wm'\)\)brandSheet\(\); enhanceMeta\(\); applyEdits\(\); wscApply\(\); \}\)/);
  assert.match(js, /addWorkResize\(\); try\{wscApply\(\);\}catch\(e\)\{\} \}/);
});

test('гарчгийн агуулгад хүрэхгүй (удирдлага дараагийн мөрөнд), хэвлэхэд дугаарыг түр дараалуулж буцаана', () => {
  assert.match(js, /g\.h\.parentNode\.insertBefore\(r,g\.h\.nextSibling\);/);
  assert.doesNotMatch(js, /g\.h\.appendChild\(/);
  assert.match(js, /window\.addEventListener\('beforeprint',wscBeforePrint\);\n  window\.addEventListener\('afterprint',wscAfterPrint\);/);
});

test('«Тэмдэглэх» багц: нуусан бодлого, хариу орохгүй', () => {
  assert.match(js, /querySelectorAll\('#answers \.ans-grid \.a:not\(\.wsc-h\)'\)/);
  assert.match(js, /querySelectorAll\('#sheet \.grid \.q:not\(\.wsc-h\), \.grid \.q:not\(\.wsc-h\)'\)/);
});
