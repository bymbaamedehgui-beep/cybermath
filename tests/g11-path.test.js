// 11-р ангийн хичээлийн зам — api/_g11path.js (51 node × 60 бодлого) ба api/nodes.js installPath (админ «11-р ангийн замыг суулгах»).
// Бодит DB 0 — tests/_gamefake.js + энд nodes/questions. Ажиллуулах: node --test tests/g11-path.test.js
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const G = require(path.join(F.API, '_g11path.js'));
const api = require(path.join(F.API, 'nodes.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) };
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// ── Хуурамч nodes / questions ──
const NODES = new Map(), QS = [], INSERTS = [];
const OLD = () => { NODES.clear(); QS.length = 0; INSERTS.length = 0;
  [[149, 'Интеграл'], [150, 'Жишиг-1'], [151, 'Жишиг 2'], [152, 'Жишиг 3']].forEach(([id, name]) => NODES.set(id, { id, name, type: 'lesson', icon: 'x', grade: '11', sort_order: id }));
  NODES.set(601, { id: 601, name: 'Тооны модул', type: 'locked', icon: '|x|', grade: '12', sort_order: 601 }); };
F.db.extra.push(function (q, p) {
  if (q === 'SELECT id FROM nodes WHERE id = ANY($1::int[])') return { rows: p[0].filter(id => NODES.has(id)).map(id => ({ id })) };
  if (/^INSERT INTO nodes \(id, name, type, icon, grade, sort_order\) VALUES (\(\$\d+,\$\d+,\$\d+,\$\d+,\$\d+,\$\d+\),?)+ ON CONFLICT \(id\) DO NOTHING$/.test(q)) {
    for (let i = 0; i < p.length; i += 6) if (!NODES.has(p[i])) NODES.set(p[i], { id: p[i], name: p[i + 1], type: p[i + 2], icon: p[i + 3], grade: p[i + 4], sort_order: p[i + 5] });
    return { rows: [] };
  }
  if (q === 'SELECT id, sort_order FROM nodes WHERE grade = $1 AND (id < $2 OR id > $3) ORDER BY COALESCE(NULLIF(sort_order, 0), id), id') {
    return { rows: Array.from(NODES.values()).filter(n => n.grade === p[0] && (n.id < p[1] || n.id > p[2]))
      .sort((a, b) => ((a.sort_order || a.id) - (b.sort_order || b.id)) || a.id - b.id).map(n => ({ id: n.id, sort_order: n.sort_order })) };
  }
  if (q === 'UPDATE nodes SET sort_order = $2 WHERE id = $1') { const n = NODES.get(p[0]); if (n) n.sort_order = p[1]; return { rows: [] }; }
  if (q === 'SELECT node_id, COUNT(*)::int AS n FROM questions WHERE node_id BETWEEN $1 AND $2 GROUP BY node_id') {
    const c = {}; QS.forEach(x => { if (x.node_id >= p[0] && x.node_id <= p[1]) c[x.node_id] = (c[x.node_id] || 0) + 1; });
    return { rows: Object.keys(c).map(k => ({ node_id: +k, n: c[k] })) };
  }
  if (/^INSERT INTO questions \(text, node_id, correct, choices, hint, difficulty\) VALUES (\(\$\d+,\$\d+,\$\d+,\$\d+,\$\d+,\$\d+\),?)+$/.test(q)) {
    if (p.length > 6 * 500) throw new Error('нэг INSERT-д 500-аас олон мөр');
    const ids = new Set();
    for (let i = 0; i < p.length; i += 6) { QS.push({ text: p[i], node_id: p[i + 1], correct: p[i + 2], choices: p[i + 3], hint: p[i + 4], difficulty: p[i + 5] }); ids.add(p[i + 1]); }
    ids.forEach(id => assert.strictEqual(QS.filter(x => x.node_id === id).length, 60, id + ': node бүтнээрээ нэг INSERT-д'));
    INSERTS.push(p.length / 6);
    return { rows: [] };
  }
  return null;
});
const POST = (body, h) => F.call(api, { method: 'POST', body, headers: h === undefined ? ADMIN : h });

beforeEach(() => { F.reset(); OLD(); });

test('_g11path: 51 node (801–851), нэр/дүрс, эхнийх нээлттэй, эможигүй', () => {
  assert.deepStrictEqual(G.NODES.map(n => n[0]), Array.from({ length: 51 }, (_, i) => 801 + i));
  G.NODES.forEach((n, i) => {
    assert.strictEqual(n.length, 6);
    assert.ok(n[1] && n[3], n[0] + ' нэр/дүрс');
    assert.strictEqual(n[2], i ? 'locked' : 'lesson');
    assert.strictEqual(n[4], '11'); assert.strictEqual(n[5], n[0]);
    assert.doesNotMatch(n[1] + n[3], EMOJI);
  });
  assert.strictEqual(new Set(G.NODES.map(n => n[1])).size, 51, 'нэр давхардахгүй');
});

test('_g11path: хичээл бүр 60 бодлого (18/24/18), 4 өөр сонголт, зөв хариу дотор нь, санамжтай, давхардалгүй', () => {
  const by = {};
  G.QUESTIONS.forEach((q, i) => {
    const at = q.node_id + '#' + i;
    (by[q.node_id] = by[q.node_id] || []).push(q);
    assert.ok(Array.isArray(q.choices) && q.choices.length === 4 && new Set(q.choices).size === 4, at + ' сонголт');
    assert.ok(q.choices.indexOf(q.correct) >= 0, at + ' зөв хариу');
    assert.ok(q.hint && q.text, at + ' санамж/текст');
    assert.ok(['easy', 'medium', 'hard'].indexOf(q.difficulty) >= 0, at);
    const all = q.text + q.choices.join('') + q.hint;
    assert.doesNotMatch(all, /[<>]/, at + ' түүхий < > (\\lt \\gt ашигла)');
    assert.doesNotMatch(all, EMOJI, at + ' эможи');
    [q.text, q.hint].concat(q.choices).forEach(s => assert.strictEqual((String(s).match(/\$/g) || []).length % 2, 0, at + ' $ тэнцвэргүй: ' + s));
  });
  assert.deepStrictEqual(Object.keys(by).map(Number), G.NODES.map(n => n[0]));
  Object.keys(by).forEach(id => {
    const L = by[id], c = { easy: 0, medium: 0, hard: 0 };
    L.forEach(q => { c[q.difficulty]++; });
    assert.deepStrictEqual(c, { easy: 18, medium: 24, hard: 18 }, id);
    assert.strictEqual(new Set(L.map(q => q.text)).size, 60, id + ' давхардсан бодлого');
  });
});

test('installPath: node + бодлого нэмнэ, хуучин 11-р ангийн node-ыг замын төгсгөлд (951+), бусад ангид хүрэхгүй', async () => {
  const r = await POST({ action: 'installPath', grade: '11' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, grade: '11', nodes_added: 51, nodes_total: 51, questions_added: G.QUESTIONS.length,
    questions_total: G.QUESTIONS.length, nodes_filled: 51, old_moved: 4 });
  assert.ok(INSERTS.length >= 7 && INSERTS.every(n => n <= 500), 'багц ≤500 мөр: ' + INSERTS.join(','));
  assert.deepStrictEqual([149, 150, 151, 152].map(id => NODES.get(id).sort_order), [951, 952, 953, 954]);
  assert.strictEqual(NODES.get(601).sort_order, 601);
  const q0 = QS.find(x => x.node_id === 801);
  assert.ok(Array.isArray(q0.choices) && JSON.parse(q0.hint).text, 'choices TEXT[], hint JSONB {text}');
  assert.strictEqual(NODES.get(801).type, 'lesson');
});

test('installPath: дахин дарахад юу ч нэмэхгүй; админы засварласан нэр, устгасан node-ийн бусдыг хөндөхгүй', async () => {
  NODES.set(805, { id: 805, name: 'Админы нэр', type: 'locked', icon: 'y', grade: '11', sort_order: 805 });
  await POST({ action: 'installPath', grade: '11' });
  assert.strictEqual(NODES.get(805).name, 'Админы нэр');
  const n = QS.length;
  const r = await POST({ action: 'installPath', grade: '11' });
  assert.strictEqual(r.body.nodes_added, 0);
  assert.strictEqual(r.body.questions_added, 0);
  assert.strictEqual(r.body.old_moved, 0);
  assert.strictEqual(QS.length, n);
});

test('installPath: бодлоготой node-д нэмэхгүй (админы устгасныг сэргээхгүй, генератор өөрчлөгдсөн ч давхардахгүй)', async () => {
  QS.push({ text: 'Админы үлдээсэн ганц бодлого', node_id: 810, correct: 'a', choices: ['a', 'b', 'c', 'd'], hint: null, difficulty: 'easy' });
  const r = await POST({ action: 'installPath', grade: '11' });
  assert.strictEqual(r.body.nodes_filled, 50);
  assert.strictEqual(r.body.questions_added, G.QUESTIONS.length - 60);
  assert.strictEqual(QS.filter(x => x.node_id === 810).length, 1);
  QS.splice(0, QS.length, ...QS.filter(x => x.node_id !== 851));          // 851-ийн бодлогыг бүгдийг устгасан бол дахин дүүргэнэ
  const r2 = await POST({ action: 'installPath', grade: '11' });
  assert.strictEqual(r2.body.nodes_filled, 1);
  assert.strictEqual(QS.filter(x => x.node_id === 851).length, 60);
});

test('installPath: зөвхөн админ; танихгүй анги → ok:false', async () => {
  const a = await POST({ action: 'installPath', grade: '11' }, {});
  assert.strictEqual(a.statusCode, 401);
  assert.strictEqual(QS.length, 0);
  const b = await POST({ action: 'installPath', grade: '13' });
  assert.strictEqual(b.body.ok, false);
  assert.deepStrictEqual(F.db.unknown, []);
});
