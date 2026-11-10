'use strict';
// 9-р ангийн бодлого нэмэх багц (api/_g9path.js): бататгал слотод бодлого байхгүй, сонголт/хариу зөв, давхардалгүй.
const test = require('node:test');
const assert = require('node:assert');
const G = require('../api/_g9path');

const EXAM = new Set([5, 11, 16, 22, 26, 31, 36, 41, 46, 51, 56, 61, 67, 74, 79, 86, 92, 98, 104, 108, 112, 129, 136, 142]);

test('g9 pack: бүтэц', () => {
  assert.ok(Array.isArray(G.NODES) && Array.isArray(G.RENAMES) && Array.isArray(G.QUESTIONS) && Array.isArray(G.PATCHES));
  assert.ok(G.QUESTIONS.length > 0);
});

test('g9 pack: бататгал слотод бодлого/нэр засвар байхгүй, замын хүрээнд', () => {
  G.QUESTIONS.forEach(q => {
    assert.ok(!EXAM.has(q.node_id), 'бататгал слот ' + q.node_id);
    assert.ok(q.node_id >= 1 && q.node_id <= 160, 'хүрээ ' + q.node_id);
  });
  G.RENAMES.forEach(r => {
    assert.ok(!EXAM.has(r[0]), 'бататгал слотын нэр ' + r[0]);
    assert.strictEqual(typeof r[1], 'string'); assert.ok(r[2] && r[2] !== r[1]);
  });
});

test('g9 pack: сонголт 4, хариу дотор нь, санамжтай, node дотор давхардалгүй', () => {
  const seen = new Set();
  G.QUESTIONS.forEach(q => {
    assert.strictEqual(q.choices.length, 4);
    assert.strictEqual(new Set(q.choices).size, 4);
    assert.ok(q.choices.indexOf(q.correct) >= 0);
    assert.ok(q.hint);
    assert.ok(!/[<>]/.test(q.text + q.choices.join('')));
    const k = q.node_id + '|' + q.text;
    assert.ok(!seen.has(k), 'давхар ' + k); seen.add(k);
  });
});

// ── Сурах бичгийн дараалал (2026-11-10): ORDER / FORCE_NAMES / COPIES / CHAPTERS ──
const PL = require('../api/_placement');
const isExamName = s => /^\u{1F4DD} /u.test(s);

test('g9 order: ≤ 144 слот, давхардалгүй, sort_order 1..N дараалсан, бүх бодлоготой хичээл замд', () => {
  assert.ok(G.ORDER.length > 100 && G.ORDER.length <= 144, 'SVG замын 144 слот');
  assert.strictEqual(new Set(G.ORDER.map(o => o[0])).size, G.ORDER.length);
  G.ORDER.forEach((o, i) => assert.strictEqual(o[1], i + 1));
  const inOrder = new Set(G.ORDER.map(o => o[0]));
  G.QUESTIONS.forEach(q => assert.ok(inOrder.has(q.node_id), 'замд алга: ' + q.node_id));
  [153, 154, 155, 156].forEach(id => assert.ok(inOrder.has(id), 'Жишиг ' + id));
});

test('g9 order: бүх 24 бататгал «📝 …» нэртэй замд, бататгал бүрийн өмнө хичээл бий', () => {
  const ex = new Map(G.FORCE_NAMES);
  assert.strictEqual(ex.size, EXAM.size);
  EXAM.forEach(id => { assert.ok(ex.has(id), 'бататгал ' + id); assert.ok(isExamName(ex.get(id)), ex.get(id)); });
  let bucket = 0;
  G.ORDER.forEach(([id]) => { if (ex.has(id)) { assert.ok(bucket > 0, 'хоосон бататгал ' + id); bucket = 0; } else bucket++; });
});

test('g9 order: давтлага node (900+) шинэ, 7–8-р ангийн эх node-оос хуулна, нэр «Давтлага — …»', () => {
  const inOrder = new Set(G.ORDER.map(o => o[0])), rev = G.NODES.filter(n => n[0] >= 900);
  assert.ok(rev.length >= 10);
  rev.forEach(n => {
    assert.ok(inOrder.has(n[0]), 'замд ' + n[0]);
    assert.match(n[1], /^Давтлага — .+ \((7|8|7–8)-р анги\)$/);
    assert.strictEqual(n[4], '9');
    const src = G.COPIES.filter(c => c[0] === n[0]).map(c => c[1]);
    assert.ok(src.length >= 1, 'эх node ' + n[0]);
    src.forEach(s => assert.ok((s >= 501 && s <= 561) || (s >= 701 && s <= 761), 'эх ' + s));
  });
  G.COPIES.forEach(c => assert.ok(rev.some(n => n[0] === c[0]), 'хуулах node шинэ давтлага биш ' + c[0]));
});

test('g9 order: бүлгийн эхлэл = api/_placement SPLITS_9_ORDERED', () => {
  assert.deepStrictEqual(G.CHAPTERS.map(c => c[0]), PL.SPLITS_9_ORDERED.map(s => s[0]));
  assert.deepStrictEqual(G.CHAPTERS.map(c => c[1]), PL.SPLITS_9_ORDERED.map(s => s[1]));
  const pos = new Map(G.ORDER.map(o => [o[0], o[1]]));
  PL.SPLITS_9_ORDERED.forEach(s => s.slice(1).forEach(id => assert.ok(pos.has(id), 'эхлэл замд ' + id)));
});
