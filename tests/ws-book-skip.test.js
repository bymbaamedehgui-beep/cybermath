// Дасгалын дэвтэр: 10-р ангийн төгсгөлийн «ЖИШИГ ДААЛГАВАР — бодолт хавсаргасан» 10 хувилбар номд орохгүй (ws-book.js BOOK_SKIP).
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
const JD = Array.from({ length: 10 }, (_, i) => ['jishig-daalgavar-' + (i + 1) + '-10.html', 'Жишиг даалгавар-' + (i + 1)]);
const grade = label => ({
  label: label,
  chapters: [{ roman: 'I', title: 'Бүлэг', own: [], kids: [
    { num: '1.1', title: 'Сэдэв', exam: false, own: [['zereg-1-10.html', 'Зэрэг-1']], kids: [] },
    { num: '', title: 'I бүлэг — Жишиг', exam: true, own: [['jishig-3-1-10.html', 'III бүлэг — Жишиг даалгавар 1']], kids: [] },
  ] }],
  extras: [{ num: '', title: 'Жишиг даалгавар — бодолт хавсаргасан', exam: true, own: JD.slice(), kids: [] }],
  rest: [],
});

test('10-р анги: Жишиг даалгавар-1…10 номд орохгүй, бүлгийн жишиг ба бусад хуудас хэвээр', () => {
  const o = outlineOf(grade('10-р анги'));
  assert.deepStrictEqual(slugs(o), ['zereg-1-10.html', 'jishig-3-1-10.html']);
  assert.strictEqual(o.chapters.length, 1, 'хоосорсон «Нэмэлт» бүлэг гарахгүй');
});

test('10-р анги: «Бусад хуудас»-нд байсан ч хасна', () => {
  const d = grade('10-р анги'); d.extras = []; d.rest = JD.slice(0, 3).concat([['other-10.html', 'Бусад']]);
  assert.deepStrictEqual(slugs(outlineOf(d)), ['zereg-1-10.html', 'jishig-3-1-10.html', 'other-10.html']);
});

test('Бусад ангид нөлөөлөхгүй', () => {
  assert.strictEqual(slugs(outlineOf(grade('11-р анги'))).length, 12);
});

test('ws-book.js-ийн шинэ хувилбарыг ачаална (кэш)', () => {
  assert.match(R('ws-browse.js'), /s\.src = '\/ws-book\.js\?v=19';/);
});
