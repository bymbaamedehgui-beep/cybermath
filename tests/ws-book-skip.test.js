// Дасгалын дэвтэр: ангийн төгсгөлийн «ЖИШИГ ДААЛГАВАР» хувилбарууд номд орохгүй (ws-book.js BOOK_SKIP) —
// 6-р анги 40 («Заавал бодох 360 бодлого»), 10-р анги 10 («бодолт хавсаргасан»).
// Ажиллуулах: node --test tests/ws-book-skip.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = R('ws-book.js');

function outlineOf(d) {
  const deep = n => (n.own || []).slice().concat(...(n.kids || []).map(deep));
  const win = { WSB: { gdata: () => d, deepItems: deep, titleOf: w => w[1] } };
  win.window = win;
  vm.runInNewContext(src, win);
  return win.WSBOOK._outline(0);
}
const slugs = o => JSON.parse(JSON.stringify(o.chapters.flatMap(c => c.topics.flatMap(t => t.items.map(w => w[0])))));   // vm-ийн массивыг энэ орчны массив болгоно
const JD = (n, g) => Array.from({ length: n }, (_, i) => ['jishig-daalgavar-' + (i + 1) + '-' + g + '.html', 'Жишиг даалгавар-' + (i + 1)]);
// Ангийн бүтэц: I бүлэг (сэдэв + бүлгийн жишиг), төгсгөлд «ЖИШИГ ДААЛГАВАР» дэд бүлэг (+ нэмэлт сэдэв)
const grade = (label, g, n, extra) => ({
  label: label,
  chapters: [{ roman: 'I', title: 'Бүлэг', own: [], kids: [
    { num: '1.1', title: 'Сэдэв', exam: false, own: [['zereg-1-' + g + '.html', 'Зэрэг-1']], kids: [] },
    { num: '', title: 'I бүлэг — Жишиг', exam: true, own: [['jishig-1-1-' + g + '.html', 'I бүлэг — Жишиг даалгавар 1']], kids: [] },
  ] }],
  extras: (extra || []).concat([{ num: '', title: 'ЖИШИГ ДААЛГАВАР', exam: true, own: JD(n, g), kids: [] }]),
  rest: [],
});

test('10-р анги: Жишиг даалгавар-1…10 номд орохгүй, бүлгийн жишиг ба бусад хуудас хэвээр', () => {
  const o = outlineOf(grade('10-р анги', 10, 10));
  assert.deepStrictEqual(slugs(o), ['zereg-1-10.html', 'jishig-1-1-10.html']);
  assert.strictEqual(o.chapters.length, 1, 'хоосорсон «Нэмэлт» бүлэг гарахгүй');
});

test('6-р анги: Жишиг даалгавар-1…40 номд орохгүй, «Нэмэлт»-ийн бусад сэдэв (Геометр) үлдэнэ', () => {
  const geo = { num: '', title: 'Геометр (өнцөг)', exam: false, own: [['untsug-1-6.html', 'Өнцөг-1'], ['untsug-2-6.html', 'Өнцөг-2']], kids: [] };
  const o = outlineOf(grade('6-р анги', 6, 40, [geo]));
  assert.deepStrictEqual(slugs(o), ['zereg-1-6.html', 'jishig-1-1-6.html', 'untsug-1-6.html', 'untsug-2-6.html']);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(o.chapters[1].topics.map(t => t.title))), ['Геометр (өнцөг)']);
});

test('«Бусад хуудас»-нд байсан ч хасна', () => {
  const d = grade('10-р анги', 10, 10); d.extras = []; d.rest = JD(3, 10).concat([['other-10.html', 'Бусад']]);
  assert.deepStrictEqual(slugs(outlineOf(d)), ['zereg-1-10.html', 'jishig-1-1-10.html', 'other-10.html']);
});

test('Бусад ангид нөлөөлөхгүй (анги бүр зөвхөн өөрийн slug-аар)', () => {
  assert.strictEqual(slugs(outlineOf(grade('11-р анги', 11, 10))).length, 12);
  assert.strictEqual(slugs(outlineOf(grade('6-р анги', 10, 10))).length, 12, '6-р ангид -10 slug хасагдахгүй');
});

test('ws-book.js-ийн шинэ хувилбарыг ачаална (кэш)', () => {
  assert.match(R('ws-browse.js'), /s\.src = '\/ws-book\.js\?v=20';/);
});
