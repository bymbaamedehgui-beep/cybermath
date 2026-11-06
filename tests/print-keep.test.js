// Багц хэвлэлт (олон хувилбар · ангиар · ЭЕШ хувилбарууд): хэвлэсний дараа багц ХАДГАЛАГДАНА.
//   2026-11-02 санал хүсэлт: «1-р нүүрийг тэдэн хувь хэвлээд дараагийн хуудсыг хэвлэх гэхэд өөр болоод гарчихдаг» —
//   хэвлэх цонх хаагдмагц багц устаж, шалгалтын материалд дэлгэцийн бодлого ч шинэчлэгддэг байсан.
//   Одоо ws-store-ийн cmKeepBatch «Дахин хэвлэх · Багцыг хаах» самбартай үлдээж, хуучин цэвэрлэгээг зөвхөн хаах үед ажиллуулна.
// Ажиллуулах: node --test tests/print-keep.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WT = path.resolve(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(WT, f), 'utf8');

test('ws-store: cmKeepBatch — багцыг хадгалах самбар, «Хэвлэх» хадгалсан багцыг хэвлэнэ', () => {
  const s = read('ws-store.js');
  assert.match(s, /window\.cmKeepBatch=keepBatch;/);
  assert.match(s, /window\.cmCloseBatch=closeKept;/);
  assert.match(s, /keepBatch\(\{ id:'cm-batch'/, 'ангиар хэвлэх багц хадгалагдана');
  assert.doesNotMatch(s, /window\.addEventListener\('afterprint',cleanup\)/, 'ангиар хэвлэх: afterprint-д устгахгүй');
  assert.match(s, /cmKeptBatch\(\)\)\{ window\.print\(\); return; \}/, 'хадгалсан багц байвал «Хэвлэх» шууд хэвлэнэ');
  assert.match(s, /@media print\{#cm-keepbar\{display:none!important\}\}/, 'самбар хэвлэлтэд гарахгүй');
  assert.match(s, /LOCK_SWEEP=\[[^\]]*'cm-keepbar'/, 'туршилт дуусахад самбар арилна');
  new Function(s);
});

test('cmx.js ба eyesh-link.js: хувилбарын багц хэвлэсний дараа хадгалагдана', () => {
  const c = read('cmx.js');
  assert.match(c, /window\.cmKeepBatch\(\{ id: 'cmx-vbatch'/);
  assert.match(c, /else window\.addEventListener\('afterprint', cleanup\);/, 'ws-store байхгүй үед хуучин зан');
  const e = read('eyesh-link.js');
  assert.match(e, /window\.cmKeepBatch\(\{ id: 'eyc-batch'/);
  assert.match(e, /window\.addEventListener\('afterprint', unwind\);/, 'хэвлэсний дараа хуудсаа сэргээнэ, багц хадгалагдана');
  assert.match(e, /getElementById\('eyc-batch'\) && window\.cmCloseBatch\) window\.cmCloseBatch\(\);/, 'дахин хэвлэхэд хуучин багцыг хаана (давхардахгүй)');
  new Function(c); new Function(e);
});

test('шалгалтын материал (genVariants): бүх хуудас cmKeepBatch-аар, afterprint-д бодлого шинэчлэхгүй', () => {
  const files = fs.readdirSync(WT).filter((f) => f.endsWith('.html') && read(f).includes('function genVariants(N)'));
  assert.ok(files.length >= 21, 'хуудас ' + files.length);
  files.forEach((f) => {
    const s = read(f);
    assert.match(s, /if\(window\.cmKeepBatch\)window\.cmKeepBatch\(\{id:'cm-vbatch',label:N\+' хувилбар \+ хариун түлхүүр',onClose:cleanup\}\);else window\.addEventListener\('afterprint',cleanup\);/, f);
    const re = /<script>([\s\S]*?)<\/script>/g; let m;
    while ((m = re.exec(s))) new Function(m[1]);
  });
});
