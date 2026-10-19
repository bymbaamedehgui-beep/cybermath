// Тоглоомын нийтлэг бодлогын сан (gg-core): api/questions.js
//   GET ?game_topics=<6..12>                      → {ok, grade, total, chapters:[{name, topics:[{id, name, n}]}]}
//   GET ?game=<6..12>&topic=<node_id|0>&n=<1..60> → {ok, grade, topic, questions:[{id, type:'choice', text, choices, correct, hint:{text}|null, difficulty, node_id, topic_name}]}
// мөн MATH MORTAL-ийн arena салбар «хялбарыг илүүд» болсон.
// Ажиллуулах: node tests/games-questions.test.js   (бодит DB 0 — доорх санах ойн pool; танихгүй SQL → throw)
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const API = path.resolve(__dirname, '..', 'api');
process.env.JWT_SECRET = 'test-secret-games-questions';
process.env.DATABASE_URL = 'postgres://fake:fake@127.0.0.1:1/none';

// ── санах ойн DB ──
const db = { nodes: [], qs: [], log: [], ddl: [], unknown: [], sqlFilter: true, nextId: 1 };
function norm(s) { return String(s).replace(/\s+/g, ' ').trim(); }
function nodeById(id) { return db.nodes.find(n => n.id === Number(id)); }
function sortKey(n) { return n.sort_order ? n.sort_order : n.id; }
function sortNodes(a) { return a.slice().sort((x, y) => (sortKey(x) - sortKey(y)) || (x.id - y.id)); }
function shuffled(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

// SQL-ийн «тохирох» нөхцөлийг (gameFitSql) PG-ийн утгаар дуурайна — api/questions.js-ийн gameFit-ээс ТУСДАА бичигдсэн.
function emuTrim(s, chars) { s = String(s); let a = 0, b = s.length; while (a < b && chars.indexOf(s[a]) >= 0) a++; while (b > a && chars.indexOf(s[b - 1]) >= 0) b--; return s.slice(a, b); }
function emuOdd(s) { const y = String(s).split('\\$').join(''); return (y.length - y.split('$').join('').length) % 2 === 1; }
function emuFit(q, T, R) {
  const re = new RegExp(R, 'i');
  if (q.type !== 'choice') return false;
  if (!(q.is_exam === false || q.is_exam == null)) return false;
  if (emuTrim(q.image == null ? '' : q.image, T) !== '') return false;
  if (emuTrim(q.text == null ? '' : q.text, T) === '') return false;
  if (re.test(q.text) || emuOdd(q.text)) return false;
  if (!Array.isArray(q.choices) || q.choices.length !== 4) return false;
  const ne = new Set(q.choices.filter(c => emuTrim(c == null ? '' : c, T) !== '').map(c => emuTrim(c, T)));
  if (ne.size !== 4) return false;
  if (q.choices.map(c => (c == null ? null : emuTrim(c, T))).indexOf(emuTrim(q.correct == null ? '' : q.correct, T)) < 0) return false;
  if (q.choices.some(c => c != null && (re.test(c) || emuOdd(c)))) return false;
  return true;
}
function arenaBase(q) {
  return (q.is_exam === false || q.is_exam == null) && (q.image == null || q.image === '') && Array.isArray(q.choices) && q.choices.length === 4;
}

const RX = {
  topics: /^SELECT n\.id, n\.name, COUNT\(q\.id\)::int AS cnt FROM nodes n LEFT JOIN questions q ON q\.node_id = n\.id AND (.+) WHERE n\.grade = \$1 GROUP BY n\.id, n\.name, n\.sort_order ORDER BY COALESCE\(NULLIF\(n\.sort_order, 0\), n\.id\), n\.id$/,
  nodes: /^SELECT n\.id, n\.name FROM nodes n WHERE n\.grade = \$1 ORDER BY COALESCE\(NULLIF\(n\.sort_order, 0\), n\.id\), n\.id$/,
  game: /^SELECT q\.id, q\.node_id, n\.name AS topic_name, q\.text, q\.choices, q\.correct, q\.hint, q\.difficulty, q\.variant_key, q\.type, q\.image, q\.is_exam FROM questions q JOIN nodes n ON n\.id = q\.node_id WHERE n\.grade = \$1 AND q\.node_id = ANY\(\$2::int\[\]\) AND (.+) ORDER BY random\(\) LIMIT \$3$/,
  arenaBase: "FROM questions q JOIN nodes n ON n.id = q.node_id WHERE n.grade = $1 AND (q.is_exam = false OR q.is_exam IS NULL) AND (q.image IS NULL OR q.image = '') AND q.choices IS NOT NULL AND array_length(q.choices, 1) = 4",
};
function out(q, extra) {
  const n = nodeById(q.node_id);
  return Object.assign({ id: String(q.id), node_id: q.node_id, text: q.text, choices: q.choices, correct: q.correct, hint: q.hint,
    difficulty: q.difficulty, variant_key: q.variant_key, type: q.type, image: q.image, is_exam: q.is_exam, topic_name: n ? n.name : null }, extra || {});
}
const pool = {
  query: async function (sql, p) {
    const s = norm(sql);
    db.log.push({ sql: s, p: p });
    let m;
    if (/^ALTER TABLE /.test(s) || /^CREATE TABLE /.test(s)) { db.ddl.push(s); return { rows: [] }; }
    if ((m = RX.topics.exec(s))) {
      const g = p[0], T = p[1], R = p[2];
      const rows = sortNodes(db.nodes.filter(n => n.grade === g)).map(n => ({ id: n.id, name: n.name,
        cnt: db.qs.filter(q => q.node_id === n.id && emuFit(q, T, R)).length }));
      return { rows: rows };
    }
    if ((m = RX.nodes.exec(s))) {
      return { rows: sortNodes(db.nodes.filter(n => n.grade === p[0])).map(n => ({ id: n.id, name: n.name })) };
    }
    if ((m = RX.game.exec(s))) {
      const g = p[0], ids = p[1], lim = p[2], T = p[3], R = p[4];
      let rows = db.qs.filter(q => { const n = nodeById(q.node_id); return n && n.grade === g && ids.indexOf(q.node_id) >= 0; });
      if (db.sqlFilter) rows = rows.filter(q => emuFit(q, T, R));
      return { rows: shuffled(rows).slice(0, lim).map(q => out(q)) };
    }
    if (s.indexOf(RX.arenaBase) >= 0) {
      const g = p[0];
      let rows = db.qs.filter(q => { const n = nodeById(q.node_id); return n && n.grade === g && arenaBase(q); });
      if (/^SELECT n\.id, n\.name, n\.sort_order, q\.text, q\.choices, q\.correct FROM/.test(s) && /ORDER BY n\.sort_order NULLS LAST, n\.id$/.test(s)) {
        return { rows: rows.map(q => { const n = nodeById(q.node_id); return { id: n.id, name: n.name, sort_order: n.sort_order, text: q.text, choices: q.choices, correct: q.correct }; }) };
      }
      if (/^SELECT q\.id, q\.text, q\.choices, q\.correct, q\.difficulty FROM/.test(s) && /AND \(\$3::int IS NULL OR q\.node_id = \$3\) ORDER BY CASE WHEN q\.difficulty = 'easy' THEN 0 ELSE 1 END, random\(\) LIMIT \$2$/.test(s)) {
        if (p[2] != null) rows = rows.filter(q => q.node_id === p[2]);
        rows = shuffled(rows).sort((a, b) => (a.difficulty === 'easy' ? 0 : 1) - (b.difficulty === 'easy' ? 0 : 1));
        return { rows: rows.slice(0, p[1]).map(q => ({ id: String(q.id), text: q.text, choices: q.choices, correct: q.correct, difficulty: q.difficulty })) };
      }
    }
    db.unknown.push(s);
    throw new Error('mock: танихгүй SQL: ' + s.slice(0, 120));
  },
};
const dbFile = require.resolve(path.join(API, '_db.js'));
require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: pool };

const handler = require(path.join(API, 'questions.js'));
const G = handler._game;

function mkRes() {
  return { statusCode: 200, body: undefined, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; }, end() { return this; } };
}
async function get(query, o) {
  const res = mkRes();
  await handler({ method: (o && o.method) || 'GET', headers: (o && o.headers) || {}, query: query, body: {} }, res);
  return res;
}

// ── өгөгдөл ──
function node(id, grade, name, sort) { db.nodes.push({ id: id, grade: grade, name: name, sort_order: sort == null ? id : sort }); }
function qq(nodeId, o) {
  const id = db.nextId++;
  const q = Object.assign({ id: id, node_id: nodeId, type: 'choice', is_exam: false, image: null, difficulty: 'medium', variant_key: null,
    text: '$' + id + '+1$ хэд вэ?', choices: [String(id + 1), String(id + 2), String(id + 3), String(id + 4)], correct: String(id + 1),
    hint: { text: 'Нэмээрэй: $' + id + '+1$' } }, o || {});
  db.qs.push(q);
  return q;
}
const BAD = [
  { type: 'fill' },
  { is_exam: true },
  { image: 'https://x/y.png' },
  { choices: ['1', '2', '3'], correct: '1' },
  { choices: ['1', '2', '3', '4', '5'], correct: '1' },
  { choices: ['1', '1', '3', '4'], correct: '1' },
  { choices: ['1', ' 1 ', '3', '4'], correct: '1' },
  { choices: ['1', '', '3', '4'], correct: '1' },
  { choices: ['1', '2', '3', '4'], correct: '9' },
  { choices: null },
  { text: 'Зургийг хар <img src="a.png"> ол' },
  { text: 'Мөр<br>шилжилт' },
  { text: '<table><tr><td>1</td></tr></table>' },
  { choices: ['1<br>', '2', '3', '4'], correct: '2' },
  { text: '$x+1 хэд вэ?' },
  { choices: ['$1', '2', '3', '4'], correct: '2' },
  { text: '   ' },
];
function addBad(nodeId) { BAD.forEach(b => qq(nodeId, b)); }

// 8-р анги: бүлэгтэй (📝 Бататгал — X хил), 9-р анги: хавтгай + хог node, 7-р анги: өөр анги
function seed() {
  node(501, '8', 'Рационал тоо', 1);
  node(502, '8', 'Тоог тоймлох', 2);
  node(503, '8', '\u{1F4DD} Бататгал — Тоон олонлог', 3);
  node(504, '8', 'Процент', 4);
  node(505, '8', 'Хоосон сэдэв', 5);         // тохирох бодлогогүй → жагсаалтад гарахгүй
  node(506, '8', '\u{1F4DD} Бататгал — Процент, харьцаа', 6);
  node(507, '8', 'Магадлал', 7);               // сүүлийн хилээс хойш → нэргүй бүлэг
  node(508, '8', '\u{1F3C6} Эцсийн сорил', 8);
  node(509, '8', 'Статистик', 9);
  for (let i = 0; i < 5; i++) qq(501);
  addBad(501);
  for (let i = 0; i < 3; i++) qq(502, { text: '$a<b$ ба $b<c$ бол $a$ ба $c$-г жиш' });   // TeX тэнцэтгэл биш ≠ HTML
  for (let i = 0; i < 6; i++) qq(503);       // бататгал node — сэдэв биш
  for (let i = 0; i < 4; i++) qq(504);
  addBad(505);
  for (let i = 0; i < 2; i++) qq(507);
  for (let i = 0; i < 1; i++) qq(509);

  node(1, '9', 'Рационал тоо', 1);
  node(26, '9', '', 26);                      // нэргүй хог node
  node(31, '9', '3131', 31);                  // зөвхөн тоо — хог
  node(40, '9', 'Квадрат тэгшитгэл', 40);
  for (let i = 0; i < 7; i++) qq(1);
  for (let i = 0; i < 3; i++) qq(26);
  for (let i = 0; i < 3; i++) qq(31);
  for (let i = 0; i < 2; i++) qq(40);

  node(701, '7', 'Тооны модул', 1);
  node(143, '10x', 'Хуучин', 1);
  for (let i = 0; i < 9; i++) qq(701);
  for (let i = 0; i < 9; i++) qq(143);
}

beforeEach(() => {
  db.nodes.length = 0; db.qs.length = 0; db.log.length = 0; db.ddl.length = 0; db.sqlFilter = true; db.nextId = 1;
  seed();
});

// ───────────── game_topics ─────────────
test('game_topics: буруу анги → 400, SQL 0, no-store', async () => {
  for (const g of ['', '5', '13', '10x', '6-old', 'abc', '07', '1 0', ['7', '8']]) {
    db.log.length = 0;
    const r = await get({ game_topics: g });
    assert.strictEqual(r.statusCode, 400, JSON.stringify(g));
    assert.strictEqual(r.body.ok, false);
    assert.strictEqual(r.headers['Cache-Control'], 'no-store');
    assert.strictEqual(db.log.length, 0, 'SQL ажиллаагүй ' + JSON.stringify(g));
  }
});

test('game_topics: бүлэг/сэдэв, зөвхөн тохирох бодлогын тоо, хил node сэдэв биш, n≥1, нийт', async () => {
  const r = await get({ game_topics: '8' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, {
    ok: true, grade: '8', total: 15,
    chapters: [
      { name: 'Тоон олонлог', topics: [{ id: 501, name: 'Рационал тоо', n: 5 }, { id: 502, name: 'Тоог тоймлох', n: 3 }] },
      { name: 'Процент, харьцаа', topics: [{ id: 504, name: 'Процент', n: 4 }] },
      { name: '', topics: [{ id: 507, name: 'Магадлал', n: 2 }, { id: 509, name: 'Статистик', n: 1 }] },
    ],
  });
  assert.strictEqual(r.headers['Access-Control-Allow-Origin'], '*');
  assert.strictEqual(r.headers['Cache-Control'], 'public, max-age=60, s-maxage=300');
  assert.deepStrictEqual(db.ddl, [], 'lazy ALTER ажиллахгүй');
  // SQL: node-ийн ангиар шүүнэ, параметр [анги, trim, regex]
  const call = db.log.find(x => RX.topics.test(x.sql));
  assert.ok(call);
  assert.deepStrictEqual(call.p, ['8', G.GAME_TRIM, G.GAME_TAG_SRC]);
});

test('game_topics: хавтгай анги (бататгалгүй) → нэг нэргүй бүлэг; нэргүй/зөвхөн тоон node хасагдана', async () => {
  const r = await get({ game_topics: '9' });
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body.chapters, [{ name: '', topics: [{ id: 1, name: 'Рационал тоо', n: 7 }, { id: 40, name: 'Квадрат тэгшитгэл', n: 2 }] }]);
  assert.strictEqual(r.body.total, 9);
  const e = await get({ game_topics: '11' });
  assert.deepStrictEqual([e.statusCode, e.body.total, e.body.chapters], [200, 0, []]);
});

test('game_topics: SQL нөхцөл — choice, шалгалтын биш, зураггүй, 4 ялгаатай, зөв хариу дотор, HTML/$ шалгалт', async () => {
  await get({ game_topics: '8' });
  const s = db.log.find(x => RX.topics.test(x.sql)).sql;
  ["q.type = 'choice'", '(q.is_exam = false OR q.is_exam IS NULL)', "btrim(COALESCE(q.image, ''), $2) = ''",
    "btrim(COALESCE(q.text, ''), $2) <> ''", 'q.text !~* $3', 'array_length(q.choices, 1) = 4',
    'COUNT(DISTINCT btrim(c, $2)) FROM unnest(q.choices)', "btrim(COALESCE(q.correct, ''), $2) IN (SELECT btrim(c, $2) FROM unnest(q.choices) AS c)",
    'NOT EXISTS (SELECT 1 FROM unnest(q.choices) AS c WHERE c ~* $3', "chr(92) || '$'"].forEach(f => assert.ok(s.indexOf(f) >= 0, f));
});

test('HTML шошгоны regex: шошгыг барина, TeX тэнцэтгэл бишийг барихгүй', () => {
  const re = new RegExp(G.GAME_TAG_SRC, 'i');
  ['<br>', '<BR/>', '<br />', '<img src="a.png">', '</table>', '<td>', '<span class="x">', '<svg viewBox="0 0 1 1">', '<sup>2</sup>']
    .forEach(t => assert.ok(re.test(t), t));
  ['$a<b$', '$x < y$', '$1<2<3$', '$a<b$, $b>c$', '$x<br$', '$t<\\infty$', '$x < a$ ба $b > y$', '$2<x<5$', 'a <= b']
    .forEach(t => assert.ok(!re.test(t), t));
});

// ───────────── game ─────────────
test('game: буруу параметр → 400, SQL 0', async () => {
  const bad = [
    { game: '' }, { game: '5' }, { game: '13' }, { game: '10x' }, { game: 'abc' }, { game: ['8', '9'] },
    { game: '8', topic: 'abc' }, { game: '8', topic: '-1' }, { game: '8', topic: '1.5' }, { game: '8', topic: '5e2' },
    { game: '8', n: '0' }, { game: '8', n: 'abc' }, { game: '8', n: '-3' }, { game: '8', n: '2.5' },
  ];
  for (const q of bad) {
    db.log.length = 0;
    const r = await get(q);
    assert.strictEqual(r.statusCode, 400, JSON.stringify(q));
    assert.strictEqual(r.body.ok, false);
    assert.strictEqual(r.headers['Cache-Control'], 'no-store');
    assert.strictEqual(db.log.length, 0, JSON.stringify(q));
  }
});

test('game: өөр ангийн / бататгал / хог node-ийн topic → 400', async () => {
  for (const t of ['701', '503', '508', '9999']) {
    const r = await get({ game: '8', topic: t });
    assert.strictEqual(r.statusCode, 400, t);
    assert.ok(!db.log.some(x => RX.game.test(x.sql)), 'бодлогын SQL ажиллаагүй ' + t);
  }
  for (const t of ['26', '31']) assert.strictEqual((await get({ game: '9', topic: t })).statusCode, 400, t);
  assert.strictEqual((await get({ game: '10', topic: '143' })).statusCode, 400, '10x node 10-р ангид биш');
});

test('game: нэг сэдэв — тухайн node-оос л, давхардалгүй, зөвхөн тохирох, хариуны хэлбэр', async () => {
  const r = await get({ game: '8', topic: '501', n: '60' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.headers['Cache-Control'], 'no-store');
  assert.strictEqual(r.headers['Access-Control-Allow-Origin'], '*');
  assert.deepStrictEqual([r.body.ok, r.body.grade, r.body.topic], [true, '8', 501]);
  const qs = r.body.questions;
  assert.strictEqual(qs.length, 5, 'зөвхөн 5 тохирох (17 муу мөр хасагдсан)');
  assert.strictEqual(new Set(qs.map(q => q.id)).size, 5);
  for (const q of qs) {
    assert.deepStrictEqual(Object.keys(q).sort(), ['choices', 'correct', 'difficulty', 'hint', 'id', 'node_id', 'text', 'topic_name', 'type']);
    assert.strictEqual(typeof q.id, 'number');
    assert.strictEqual(q.type, 'choice');
    assert.strictEqual(q.node_id, 501);
    assert.strictEqual(q.topic_name, 'Рационал тоо');
    assert.strictEqual(q.choices.length, 4);
    assert.strictEqual(new Set(q.choices).size, 4);
    assert.ok(q.choices.indexOf(q.correct) >= 0);
    assert.ok(['easy', 'medium', 'hard'].indexOf(q.difficulty) >= 0);
    assert.deepStrictEqual(Object.keys(q.hint), ['text']);
    const src = db.qs.find(x => x.id === q.id);
    assert.deepStrictEqual(q.choices.slice().sort(), src.choices.slice().sort());
  }
  assert.deepStrictEqual(db.ddl, [], 'lazy ALTER ажиллахгүй');
  const call = db.log.find(x => RX.game.test(x.sql));
  assert.deepStrictEqual(call.p, ['8', [501], 400, G.GAME_TRIM, G.GAME_TAG_SRC]);
});

test('game: SQL шүүлт алдсан ч JS давхар шалгалт муу мөрийг хасна', async () => {
  db.sqlFilter = false;
  const r = await get({ game: '8', topic: '501', n: '60' });
  assert.strictEqual(r.statusCode, 200);
  assert.strictEqual(r.body.questions.length, 5);
  const ok = new Set(db.qs.filter(q => q.node_id === 501).slice(0, 5).map(q => q.id));
  r.body.questions.forEach(q => assert.ok(ok.has(q.id), 'муу мөр ' + q.id));
  const e = await get({ game: '8', topic: '505', n: '10' });
  assert.deepStrictEqual([e.statusCode, e.body.questions], [200, []]);
});

test('game: topic=0 (эсвэл байхгүй) → ангийн бүх СЭДВЭЭС, бататгал/хог/өөр анги орохгүй; LIMIT n×4', async () => {
  for (const q of [{ game: '8', topic: '0', n: '60' }, { game: '8', n: '60' }, { game: '8', topic: '', n: '60' }]) {
    db.log.length = 0;
    const r = await get(q);
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.body.topic, 0);
    const qs = r.body.questions;
    assert.strictEqual(qs.length, 15, JSON.stringify(q));
    assert.ok(qs.every(x => [501, 502, 504, 507, 509].indexOf(x.node_id) >= 0));
    const call = db.log.find(x => RX.game.test(x.sql));
    assert.deepStrictEqual(call.p.slice(0, 3), ['8', [501, 502, 504, 505, 507, 509], 240]);
  }
  db.log.length = 0;
  const r9 = await get({ game: '9', n: '5' });
  assert.strictEqual(r9.body.questions.length, 5);
  assert.ok(r9.body.questions.every(x => x.node_id === 1 || x.node_id === 40));
  assert.deepStrictEqual(db.log.find(x => RX.game.test(x.sql)).p.slice(0, 3), ['9', [1, 40], 20]);
});

test('game: n анхдагч 20, дээд 60 (их утгыг хязгаарлана)', async () => {
  for (let i = 0; i < 80; i++) qq(504);
  const a = await get({ game: '8', topic: '504' });
  assert.strictEqual(a.body.questions.length, 20);
  const b = await get({ game: '8', topic: '504', n: '1000' });
  assert.strictEqual(b.statusCode, 200);
  assert.strictEqual(b.body.questions.length, 60);
  const c = await get({ game: '8', topic: '504', n: '1' });
  assert.strictEqual(c.body.questions.length, 1);
});

test('game: variant бүлэг бүрээс эхлээд нэг, дутвал бусад гишүүнээр нөхнө (давхардалгүй)', async () => {
  node(510, '8', 'Хувилбартай', 10);
  for (let v = 0; v < 10; v++) for (let k = 0; k < 3; k++) qq(510, { variant_key: 'v' + v });
  const a = await get({ game: '8', topic: '510', n: '10' });
  assert.strictEqual(new Set(a.body.questions.map(q => db.qs.find(x => x.id === q.id).variant_key)).size, 10);
  const b = await get({ game: '8', topic: '510', n: '25' });
  assert.strictEqual(b.body.questions.length, 25);
  assert.strictEqual(new Set(b.body.questions.map(q => q.id)).size, 25);
  const firstTen = b.body.questions.slice(0, 10).map(q => db.qs.find(x => x.id === q.id).variant_key);
  assert.strictEqual(new Set(firstTen).size, 10, 'эхний 10 нь 10 өөр хувилбар');
});

test('game: түвшин 30/40/30 холино', async () => {
  node(511, '8', 'Түвшин', 11);
  ['easy', 'medium', 'hard'].forEach(d => { for (let i = 0; i < 20; i++) qq(511, { difficulty: d }); });
  const r = await get({ game: '8', topic: '511', n: '10' });
  const cnt = {};
  r.body.questions.forEach(q => { cnt[q.difficulty] = (cnt[q.difficulty] || 0) + 1; });
  assert.deepStrictEqual(cnt, { easy: 3, medium: 4, hard: 3 });
});

test('game: сонголтыг холино (зөв хариу хадгалагдана), «Дээрх бүгд»-тэйг хөндөхгүй; trim; hint/difficulty нормчлол', async () => {
  node(512, '8', 'Холих', 12);
  const base = qq(512, { choices: ['A1', 'B2', 'C3', 'D4'], correct: 'C3' });
  const keep = qq(512, { choices: ['1', '2', '3', 'Дээрх бүгд'], correct: 'Дээрх бүгд' });
  const sp = qq(512, { text: '  $2+2$ ?\n', choices: [' 4 ', '5', '6', '7'], correct: '4 ', hint: '"  тэмдэгт мөр  "', difficulty: 'HARD' });
  const h1 = qq(512, { hint: { text: 'зураг <img src=x>' }, difficulty: null });
  const h2 = qq(512, { hint: { text: '$x' } });
  const h3 = qq(512, { hint: null });
  const h4 = qq(512, { hint: '  шууд мөр  ' });
  let moved = false;
  for (let i = 0; i < 40; i++) {
    const r = await get({ game: '8', topic: '512', n: '60' });
    const by = {}; r.body.questions.forEach(q => { by[q.id] = q; });
    const b = by[base.id];
    assert.strictEqual(b.correct, 'C3');
    assert.ok(b.choices.indexOf('C3') >= 0);
    if (b.choices.join() !== 'A1,B2,C3,D4') moved = true;
    assert.deepStrictEqual(by[keep.id].choices, ['1', '2', '3', 'Дээрх бүгд']);
    assert.strictEqual(by[sp.id].text, '$2+2$ ?');
    assert.deepStrictEqual(by[sp.id].choices.slice().sort(), ['4', '5', '6', '7']);
    assert.strictEqual(by[sp.id].correct, '4');
    assert.strictEqual(by[sp.id].difficulty, 'hard');
    assert.deepStrictEqual(by[sp.id].hint, { text: '"  тэмдэгт мөр  "' });
    assert.strictEqual(by[h1.id].hint, null);
    assert.strictEqual(by[h1.id].difficulty, 'medium');
    assert.strictEqual(by[h2.id].hint, null);
    assert.strictEqual(by[h3.id].hint, null);
    assert.deepStrictEqual(by[h4.id].hint, { text: 'шууд мөр' });
  }
  assert.ok(moved, 'сонголтын дараалал ядаж нэг удаа өөрчлөгдсөн');
});

test('game: тохирох бодлогогүй сэдэв → 200, хоосон', async () => {
  const r = await get({ game: '8', topic: '505' });
  assert.deepStrictEqual([r.statusCode, r.body.ok, r.body.questions], [200, true, []]);
  const r2 = await get({ game: '11' });
  assert.deepStrictEqual([r2.statusCode, r2.body.questions], [200, []]);
  assert.ok(!db.log.some(x => RX.game.test(x.sql) && x.p[0] === '11'), '11-р ангид node алга — бодлогын SQL ажиллахгүй');
});

test('game/game_topics: токен, админ шаардахгүй; OPTIONS 200', async () => {
  assert.strictEqual((await get({ game_topics: '8' }, { headers: {} })).statusCode, 200);
  assert.strictEqual((await get({ game: '8' }, { headers: {} })).statusCode, 200);
  assert.strictEqual((await get({ game: '8' }, { headers: { authorization: 'Bearer garbage' } })).statusCode, 200);
  assert.strictEqual((await get({}, { method: 'OPTIONS' })).statusCode, 200);
  // админы параметр хамт ирвэл админ шалгалт хэвээр
  assert.strictEqual((await get({ game: '8', stats: '1' })).statusCode, 401);
});

test('gameFit ба SQL дуурайлт ижил дүгнэлттэй (BAD мөр бүр хасагдана, сайн мөр үлдэнэ)', () => {
  const rows = db.qs.map(q => out(q));
  rows.forEach(r => {
    const q = db.qs.find(x => String(x.id) === r.id);
    assert.strictEqual(G.gameFit(r), emuFit(q, G.GAME_TRIM, G.GAME_TAG_SRC), 'id ' + r.id);
  });
  BAD.forEach(b => assert.strictEqual(G.gameFit(Object.assign(out(db.qs[0]), b)), false, JSON.stringify(b)));
});

// ───────────── arena (MATH MORTAL) ─────────────
test('arena: зөвхөн хялбараар хязгаарлахгүй — дунд/хүнд ч сэдэвт тоологдоно; зураггүй', async () => {
  node(601, '12', 'Модул', 1);
  for (let i = 0; i < 5; i++) qq(601, { difficulty: 'medium', text: '$|' + (i + 2) + '|$', choices: ['1', '2', '3', '4'], correct: '2' });
  for (let i = 0; i < 5; i++) qq(601, { difficulty: 'easy', image: 'a.png', text: '$|' + i + '|$', choices: ['1', '2', '3', '4'], correct: '2' });
  const t = await get({ arena: '12', topics: '1' });
  assert.deepStrictEqual(t.body.topics, [{ id: 601, name: 'Модул', n: 5 }]);
  const s = db.log.find(x => x.sql.indexOf(RX.arenaBase) >= 0).sql;
  assert.ok(s.indexOf("q.difficulty = 'easy' AND") < 0, 'WHERE-д easy-only алга');
  const q = await get({ arena: '12', n: '10' });
  assert.strictEqual(q.body.questions.length, 5);
  assert.ok(q.body.questions.every(x => x.difficulty === 'medium'));
});

test('arena: хялбар хүрэлцэхэд зөвхөн хялбар, дутвал бусдаар нөхнө', async () => {
  node(602, '12', 'Логарифм', 2);
  for (let i = 0; i < 12; i++) qq(602, { difficulty: 'easy', text: '$\\log_2 ' + (i + 2) + '$', choices: ['1', '2', '3', '4'], correct: '1' });
  for (let i = 0; i < 12; i++) qq(602, { difficulty: 'hard', text: '$\\log_3 ' + (i + 2) + '$', choices: ['1', '2', '3', '4'], correct: '1' });
  const a = await get({ arena: '12', node: '602', n: '10' });
  assert.strictEqual(a.body.questions.length, 10);
  assert.ok(a.body.questions.every(x => x.difficulty === 'easy'));
  const b = await get({ arena: '12', node: '602', n: '20' });
  assert.strictEqual(b.body.questions.length, 20);
  assert.strictEqual(b.body.questions.filter(x => x.difficulty === 'easy').length, 12);
});

test('танихгүй SQL алга', () => {
  assert.deepStrictEqual(db.unknown, []);
});
