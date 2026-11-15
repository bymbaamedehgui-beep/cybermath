// 5-р ангийн хичээлийн зам — api/_g5path.js (44 хичээл × 60 бодлого + 6 «📝 Бататгал») ба api/nodes.js installPath
// (админ «5-р ангийн замыг суулгах»); тоглоом/сорилын бүлэг нь бататгалаар хуваагдана (api/questions gameChapters).
// Бодит DB 0 — tests/_gamefake.js + энд nodes/questions. Ажиллуулах: node --test tests/g5-path.test.js
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const G = require(path.join(F.API, '_g5path.js'));
const api = require(path.join(F.API, 'nodes.js'));
const Q = require(path.join(F.API, 'questions.js'))._game;
const PL = require(path.join(F.API, '_placement.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) };
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const EXAM = [1009, 1018, 1026, 1036, 1043, 1050];
const LESSONS = G.NODES.map(n => n[0]).filter(id => EXAM.indexOf(id) < 0);

// ── Хуурамч nodes / questions ──
const NODES = new Map(), QS = [], INSERTS = [];
const OLD = () => { NODES.clear(); QS.length = 0; INSERTS.length = 0;
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
  if (q === 'SELECT node_id, COUNT(*)::int AS n FROM questions WHERE node_id = ANY($1::int[]) GROUP BY node_id') {
    const c = {}; QS.forEach(x => { if (p[0].indexOf(x.node_id) >= 0) c[x.node_id] = (c[x.node_id] || 0) + 1; });
    return { rows: Object.keys(c).map(k => ({ node_id: +k, n: c[k] })) };
  }
  if (q === "UPDATE nodes SET name = $3 WHERE id = $1 AND COALESCE(name, '') = $2") {
    const n = NODES.get(p[0]); if (!n || (n.name || '') !== p[1]) return { rows: [], rowCount: 0 };
    n.name = p[2]; return { rows: [], rowCount: 1 };
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

test('_g5path: 50 node (1001–1050), 44 хичээл + 6 «📝 Бататгал — …», эхнийх нээлттэй, 5-р анги', () => {
  assert.deepStrictEqual(G.NODES.map(n => n[0]), Array.from({ length: 50 }, (_, i) => 1001 + i));
  G.NODES.forEach((n, i) => {
    assert.strictEqual(n.length, 6);
    assert.ok(n[1] && n[3], n[0] + ' нэр/дүрс');
    assert.strictEqual(n[2], i ? 'locked' : 'lesson');
    assert.strictEqual(n[4], '5'); assert.strictEqual(n[5], n[0]);
    assert.doesNotMatch(n[3], EMOJI, n[0] + ' дүрс эможигүй');
    if (EXAM.indexOf(n[0]) >= 0) assert.match(n[1], /^📝 Бататгал — \S/, n[0] + ' бататгалын нэр («📝» нь index.html/api-ийн таних тэмдэг)');
    else assert.doesNotMatch(n[1], EMOJI, n[0]);
  });
  assert.strictEqual(new Set(G.NODES.map(n => n[1])).size, 50, 'нэр давхардахгүй');
  assert.strictEqual(LESSONS.length, 44);
});

test('_g5path: хичээл бүр 60 бодлого (18/24/18), 4 өөр сонголт, зөв хариу дотор нь, санамжтай; бататгалд бодлого алга', () => {
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
    assert.ok(Q.gameFit({ type: 'choice', text: q.text, choices: q.choices, correct: q.correct }), at + ' тоглоомын санд тохирно (gameFit)');
  });
  assert.deepStrictEqual(Object.keys(by).map(Number), LESSONS);
  Object.keys(by).forEach(id => {
    const L = by[id], c = { easy: 0, medium: 0, hard: 0 };
    L.forEach(q => { c[q.difficulty]++; });
    assert.deepStrictEqual(c, { easy: 18, medium: 24, hard: 18 }, id);
    assert.strictEqual(new Set(L.map(q => q.text)).size, 60, id + ' давхардсан бодлого');
    const pos = [0, 0, 0, 0]; L.forEach(q => { pos[q.choices.indexOf(q.correct)]++; });
    assert.ok(pos.every(n => n >= 5), id + ' зөв хариуны байрлал жигд биш: ' + pos.join('/'));
  });
});

test('бүлэг: бататгалаар 6 бүлэг (тоглоомын сонголт, түвшин тогтоох сорил), сурах бичгийн дарааллаар', () => {
  const chs = Q.gameChapters(G.NODES.map(n => ({ id: n[0], name: n[1], cnt: EXAM.indexOf(n[0]) >= 0 ? 0 : 60 })));
  assert.deepStrictEqual(chs.map(c => c.topics.length), [8, 8, 7, 9, 6, 6]);
  assert.deepStrictEqual(chs.map(c => c.name), G.NODES.filter(n => EXAM.indexOf(n[0]) >= 0).map(n => n[1].replace(/^📝 Бататгал — /, '')));
  assert.strictEqual(PL.normGrade('5'), '5');
  assert.strictEqual(PL.normGrade('4'), null);
});

test('installPath(5): 50 node + 2640 бодлого, node бүр нэг INSERT-д (≤500 мөр), бусад ангид хүрэхгүй; дахин дарахад 0', async () => {
  const r = await POST({ action: 'installPath', grade: '5' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, grade: '5', nodes_added: 50, nodes_total: 50, questions_added: 2640,
    questions_total: 2640, nodes_filled: 44, patched: 0, renamed: 0, old_moved: 0, ordered: 0, exam_named: 0, copied: 0 });
  assert.strictEqual(G.QUESTIONS.length, 2640);
  assert.ok(INSERTS.length >= 6 && INSERTS.every(n => n <= 500), 'багц ≤500 мөр: ' + INSERTS.join(','));
  EXAM.forEach(id => assert.strictEqual(QS.filter(x => x.node_id === id).length, 0, id + ' бататгалд бодлого нэмэхгүй'));
  assert.strictEqual(NODES.get(1001).type, 'lesson');
  assert.strictEqual(NODES.get(601).sort_order, 601);
  const q0 = QS.find(x => x.node_id === 1001);
  assert.ok(Array.isArray(q0.choices) && JSON.parse(q0.hint).text, 'choices TEXT[], hint JSONB {text}');
  const n = QS.length, r2 = await POST({ action: 'installPath', grade: '5' });
  assert.deepStrictEqual([r2.body.nodes_added, r2.body.questions_added, QS.length], [0, 0, n]);
});

test('installPath(5): бодлоготой хичээлд нэмэхгүй (админы устгасныг сэргээхгүй), бүх бодлогыг нь устгасан хичээлийг дүүргэнэ', async () => {
  QS.push({ text: 'Админы үлдээсэн ганц бодлого', node_id: 1005, correct: 'a', choices: ['a', 'b', 'c', 'd'], hint: null, difficulty: 'easy' });
  const r = await POST({ action: 'installPath', grade: '5' });
  assert.strictEqual(r.body.nodes_filled, 43);
  assert.strictEqual(QS.filter(x => x.node_id === 1005).length, 1);
  QS.splice(0, QS.length, ...QS.filter(x => x.node_id !== 1049));
  assert.strictEqual((await POST({ action: 'installPath', grade: '5' })).body.nodes_filled, 1);
  assert.strictEqual(QS.filter(x => x.node_id === 1049).length, 60);
});

test('холбоос: api/nodes.js PATHS-д 5, админд «5-р ангийн замыг суулгах»', () => {
  const src = fs.readFileSync(path.join(F.API, 'nodes.js'), 'utf8');
  assert.match(src, /'5': \{ load: \(\) => require\('\.\/_g5path'\), lo: 1001, hi: 1099, move: true, fill: 'empty' \}/);
  const adm = fs.readFileSync(path.join(F.API, '..', 'admin.html'), 'utf8');
  assert.match(adm, /onclick="qrvInstall\('5'\)"[^>]*>5-р ангийн замыг суулгах<\/button>/);
});
