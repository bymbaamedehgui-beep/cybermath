// Дасгалын төвийн «Слайд» цэс — ангиар ангилах (2026-11-12, эзэмшигч: «Слайд цэс дотор анги ангиар нь ангилдаг байлгая»)
// Ажиллуулах: node --test tests/ppt-grades.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'worksheets.html'), 'utf8');
const pick = (name) => { const m = new RegExp('function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n  \\}|function ' + name + '\\([^)]*\\)\\{[^\\n]*\\}').exec(html); assert.ok(m, name + ' олдсонгүй'); return m[0]; };
const ctx = {};
vm.runInNewContext(pick('gnum') + '\n' + pick('ordered') + '\nthis.ordered=ordered;', ctx);
const D = (id, grade, title) => ({ id, grade, title });

test('анги тоогоор өснө, анги дотор «бүлэг.сэдэв» дугаараар, дугааргүй нь төгсгөлд (серверийн дарааллаар)', () => {
  const L = [D(2, '12-р анги', '2.1 Нэг ба олон гишүүнт'), D(5, '12-р анги', 'II бүлэг — нэмэлт даалгавар'), D(6, '12-р анги', '2.4 Рационал'),
    D(7, '10-р анги', '4.2 Шулууны налалт'), D(8, '10-р анги', '4.1 Тэгш өнцөгт'), D(16, '10-р анги', '5.2 Квадрат функц'), D(17, '10-р анги', '5.10 Туршилт'),
    D(30, '9-р анги', '1.3 Гурав'), D(31, '9-р анги', 'Давтлага'), D(32, '9-р анги', 'Нэмэлт')];
  const ids = JSON.parse(JSON.stringify(ctx.ordered(L))).map((d) => d.id);
  assert.deepStrictEqual(ids, [30, 31, 32, 8, 7, 16, 17, 2, 6, 5]);
});

test('слайдын хэсэгт ангийн чип ба бүлэглэлт', () => {
  assert.match(html, /<div class="chips pgr" id="pptGrades" role="group" aria-label="Анги" hidden><\/div>\s*<div class="pcards" id="pcards"><\/div>/);
  assert.match(html, /chipsEl\.hidden=GRALL\.length<2;/, '1 ангид слайд байвал чип гарахгүй');
  assert.match(html, /if\(band!==lastBand\)\{lastBand=band;pg=null;\}/, 'зүүн талын анги солигдоход чип дагана');
  assert.match(html, /box\.className='pgroups'/);
  assert.match(html, /<div class="pgrp"><div class="pgrp-h">'\+esc\(gr\)/);
});
