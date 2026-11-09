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
