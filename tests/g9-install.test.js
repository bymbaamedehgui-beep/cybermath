// 9-р ангийн замыг суулгах (api/nodes.js installPath('9')) — сурах бичгийн дараалал (ORDER), бататгалын «📝» нэр (FORCE_NAMES),
// 7–8-р ангийн давтлага (COPIES). Юуг ч устгахгүй, хоосон (109–125) ба бусад ангийн node хөндөгдөхгүй, дахин дарахад 0.
// Бодит DB 0 — tests/_gamefake.js + энд nodes/questions. Ажиллуулах: node --test tests/g9-install.test.js
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const G = require(path.join(F.API, '_g9path.js'));
const api = require(path.join(F.API, 'nodes.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) };

const NODES = new Map(), QS = [];
function seed() {
  NODES.clear(); QS.length = 0;
  G.ORDER.forEach(([id]) => { if (id < 900) NODES.set(id, { id, name: 'Хуучин ' + id, grade: '9', sort_order: id }); });
  [109, 114, 125].forEach(id => NODES.set(id, { id, name: id === 114 ? '' : String(id), grade: '9', sort_order: id }));
  NODES.set(149, { id: 149, name: 'Интеграл', grade: '11', sort_order: 149 });
  G.COPIES.forEach(([, s]) => {
    if (NODES.has(s)) return;
    NODES.set(s, { id: s, name: 'Эх ' + s, grade: s < 700 ? '8' : '7', sort_order: s });
    for (let k = 0; k < 3; k++) QS.push({ id: QS.length + 1, node_id: s, text: 'q' + s + '-' + k, correct: 'a', choices: ['a', 'b', 'c', 'd'], hint: null, difficulty: 'easy', created_at: 't' + s });
  });
}
F.db.extra.push(function (q, p) {
  let m;
  if (q === 'SELECT id FROM nodes WHERE id = ANY($1::int[])') return { rows: p[0].filter(id => NODES.has(id)).map(id => ({ id })) };
  if (/^INSERT INTO nodes \(id, name, type, icon, grade, sort_order\) VALUES (\(\$\d+,\$\d+,\$\d+,\$\d+,\$\d+,\$\d+\),?)+ ON CONFLICT \(id\) DO NOTHING$/.test(q)) {
    for (let i = 0; i < p.length; i += 6) if (!NODES.has(p[i])) NODES.set(p[i], { id: p[i], name: p[i + 1], grade: p[i + 4], sort_order: p[i + 5] });
    return { rows: [] };
  }
  if (q === "UPDATE nodes SET name = $3 WHERE id = $1 AND COALESCE(name, '') = $2") {
    const n = NODES.get(p[0]); if (!n || (n.name || '') !== p[1]) return { rows: [], rowCount: 0 };
    n.name = p[2]; return { rows: [], rowCount: 1 };
  }
  if ((m = /^UPDATE nodes n SET (sort_order|name) = v\.(so|nm) FROM \(VALUES (.+)\) AS v\(id, (so|nm)\) WHERE n\.id = v\.id AND n\.grade = \$1 AND n\.(sort_order|name) IS DISTINCT FROM v\.(so|nm)$/.exec(q))) {
    const col = m[1]; let c = 0;
    assert.strictEqual(m[3].split('),(').length, (p.length - 1) / 2, 'VALUES мөрийн тоо');
    for (let i = 1; i < p.length; i += 2) { const n = NODES.get(p[i]); if (n && n.grade === p[0] && n[col] !== p[i + 1]) { n[col] = p[i + 1]; c++; } }
    return { rows: [], rowCount: c };
  }
  if (q === 'SELECT node_id, text FROM questions WHERE node_id = ANY($1::int[])') {
    return { rows: QS.filter(x => p[0].indexOf(x.node_id) >= 0).map(x => ({ node_id: x.node_id, text: x.text })) };
  }
  if (/^INSERT INTO questions \(text, node_id, correct, choices, hint, difficulty\) VALUES (\(\$\d+,\$\d+,\$\d+,\$\d+,\$\d+,\$\d+\),?)+$/.test(q)) {
    assert.ok(p.length <= 6 * 500, '≤ 500 мөр');
    for (let i = 0; i < p.length; i += 6) QS.push({ id: QS.length + 1, text: p[i], node_id: p[i + 1], correct: p[i + 2], choices: p[i + 3], hint: p[i + 4], difficulty: p[i + 5] });
    return { rows: [] };
  }
  if (/FROM information_schema\.columns WHERE table_name = 'questions'/.test(q)) {
    return { rows: [['id', "nextval('questions_id_seq'::regclass)"], ['text', null], ['node_id', null], ['correct', null], ['choices', null], ['hint', null],
      ['difficulty', "'medium'::text"], ['created_at', 'now()']].map(([c, d]) => ({ column_name: c, column_default: d, is_generated: 'NEVER', is_identity: 'NO' })) };
  }
  if ((m = /^INSERT INTO questions \(node_id, (.+)\) SELECT \$1, (.+) FROM questions q WHERE q\.node_id = \$2 AND NOT EXISTS \(SELECT 1 FROM questions d WHERE d\.node_id = \$1 AND d\.text = q\.text\)$/.exec(q))) {
    const cols = m[1].split(', ').map(s => s.replace(/"/g, ''));
    assert.deepStrictEqual(m[2].split(', '), m[1].split(', ').map(c => 'q.' + c));
    assert.ok(cols.indexOf('id') < 0 && cols.indexOf('node_id') < 0 && cols.indexOf('text') >= 0 && cols.indexOf('created_at') >= 0, 'баганууд');
    const src = QS.filter(x => x.node_id === p[1] && !QS.some(d => d.node_id === p[0] && d.text === x.text));
    src.forEach(x => { const r = { id: QS.length + 1, node_id: p[0] }; cols.forEach(c => { r[c] = x[c]; }); QS.push(r); });
    return { rows: [], rowCount: src.length };
  }
  if (/^UPDATE questions SET hint = \$3::jsonb, choices = \$4::text\[\], correct = \$5 WHERE node_id = \$1/.test(q)) return { rows: [], rowCount: 0 };
  return null;
});
const POST = body => F.call(api, { method: 'POST', body, headers: ADMIN });

beforeEach(() => { F.reset(); seed(); });

test('installPath 9: сурах бичгийн дараалал, 📝 бататгал, давтлага хуулбар; хоосон/бусад анги хөндөгдөхгүй; дахин дарахад 0', async () => {
  const r = await POST({ action: 'installPath', grade: '9' });
  assert.strictEqual(r.statusCode, 200);
  const d = r.body;
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.nodes_added, G.NODES.length, 'шинэ давтлага node');
  assert.strictEqual(d.exam_named, G.FORCE_NAMES.length);
  assert.strictEqual(d.copied, G.COPIES.length * 3, 'эх node бүрийн 3 бодлого');
  assert.ok(d.ordered > 100);
  G.ORDER.forEach(([id, so]) => assert.strictEqual(NODES.get(id).sort_order, so, 'sort_order ' + id));
  G.FORCE_NAMES.forEach(([id, nm]) => { assert.strictEqual(NODES.get(id).name, nm); assert.match(nm, /^\u{1F4DD} /u); });
  G.NODES.forEach(n => assert.strictEqual(QS.filter(x => x.node_id === n[0]).length, G.COPIES.filter(c => c[0] === n[0]).length * 3, 'давтлага ' + n[0]));
  // хоосон 109–125 ба бусад анги — хөндөгдөхгүй; эх 7–8-р ангийн бодлого хэвээр
  assert.deepStrictEqual([109, 114, 125].map(id => [NODES.get(id).name, NODES.get(id).sort_order]), [['109', 109], ['', 114], ['125', 125]]);
  assert.deepStrictEqual(NODES.get(149), { id: 149, name: 'Интеграл', grade: '11', sort_order: 149 });
  G.COPIES.forEach(([, s]) => { assert.strictEqual(QS.filter(x => x.node_id === s).length, 3); assert.notStrictEqual(NODES.get(s).grade, '9'); });
  const n1 = QS.length;
  const r2 = await POST({ action: 'installPath', grade: '9' });
  assert.strictEqual(r2.body.ok, true);
  ['nodes_added', 'questions_added', 'ordered', 'exam_named', 'copied', 'renamed'].forEach(k => assert.strictEqual(r2.body[k], 0, 'дахин: ' + k));
  assert.strictEqual(QS.length, n1, 'давхардахгүй');
});
