// index.html — 9-р ангийн зам: DB-д сурах бичгийн дараалал («📝» бататгал) суусан бол бусад анги шиг sort_order-оор (cmBuildPathMap),
// үгүй бол хуучин SVG (слот = node id). Хоосон нэртэй node (109–125) замд биш, багш 9-р ангийн замыг харна, бататгалын эх сэдэв.
// Ажиллуулах: node --test tests/g9-pathmap.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').replace(/\r\n/g, '\n');
const fn = name => { const i = html.indexOf('function ' + name + '('); assert.ok(i >= 0, name); const j = html.indexOf('\n}\n', i); return html.slice(i, j + 3); };
const G = require('../api/_g9path');
const SLOTS = []; for (let i = 1; i <= 107; i++) SLOTS.push(i); for (let i = 126; i <= 162; i++) SLOTS.push(i);

function run(grade, nodes) {
  const ctx = { window: {}, hidden: null };
  ctx.cmUserGrade = () => grade; ctx.cmSlotOrder = () => SLOTS.slice(); ctx.cmHideSlots = x => { ctx.hidden = x; };
  vm.createContext(ctx);
  vm.runInContext(fn('cmBuildExamMap') + fn('cmG9Ordered') + fn('cmBuildPathMap'), ctx);
  ctx.cmBuildPathMap(nodes);
  return ctx;
}
// Суулгасны дараах 9-р анги: ORDER (sort_order), бататгал «📝», давтлага; + хоосон 109–125, бусад анги
function installed() {
  const ex = new Map(G.FORCE_NAMES), rv = new Map(G.NODES.map(n => [n[0], n[1]]));
  const out = G.ORDER.map(([id, so]) => ({ id, grade: '9', sort_order: so, name: ex.get(id) || rv.get(id) || 'Хичээл ' + id }));
  [109, 110, 114, 125].forEach(id => out.push({ id, grade: '9', sort_order: id, name: id === 114 ? '' : String(id) }));
  out.push({ id: 143, grade: '10x', sort_order: 143, name: 'Бататгал 1' }, { id: 149, grade: '11', sort_order: 149, name: 'Интеграл' });
  return out;
}

test('9-р анги: дараалал суугаагүй (📝 алга) — хуучин SVG зам хэвээр', () => {
  const legacy = [{ id: 1, grade: '9', sort_order: 1, name: 'Рационал тоо' }, { id: 5, grade: '9', sort_order: 5, name: 'Бататгал 1' }];
  const c = run('9', legacy);
  assert.strictEqual(c.window._PATH.on, false);
  assert.strictEqual(run('teacher', legacy).window._PATH.on, false);
});

test('9-р анги: дараалал суусан — sort_order-оор слотод, хоосон/бусад ангийн node замд биш, бататгалын эх сэдэв', () => {
  const c = run('9', installed()), P = c.window._PATH;
  assert.strictEqual(P.on, true);
  assert.strictEqual(P.count, G.ORDER.length);
  G.ORDER.forEach(([id], i) => assert.strictEqual(P.n2s[id], SLOTS[i], 'слот ' + id));
  [109, 110, 114, 125, 143, 149].forEach(id => assert.strictEqual(P.n2s[id], undefined, 'замд биш ' + id));
  assert.deepStrictEqual(c.hidden, SLOTS.slice(G.ORDER.length));
  // 2-р бататгал (11) — 1-р бататгалаас (5) хойших хичээлүүд: 902 давтлага, 6–10
  assert.deepStrictEqual(Array.from(P.exam[11]), [902, 6, 7, 8, 9, 10]);
  assert.deepStrictEqual(Array.from(P.exam[5]), [901, 1, 2, 3, 4]);
  assert.strictEqual(Object.keys(P.exam).length, G.FORCE_NAMES.length);
});

test('багш: дараалал суусан бол 9-р ангийн замыг sort_order-оор харна', () => {
  const P = run('teacher', installed()).window._PATH;
  assert.strictEqual(P.on, true);
  assert.strictEqual(P.n2s[G.ORDER[0][0]], 1);
});

test('бусад анги өөрчлөгдөөгүй (8-р анги — өөрийн node-уудаар)', () => {
  const nodes = installed().concat([{ id: 501, grade: '8', sort_order: 501, name: 'Рационал тоо' }, { id: 502, grade: '8', sort_order: 502, name: 'Тоог тоймлох' }]);
  const P = run('8', nodes).window._PATH;
  assert.strictEqual(P.on, true);
  assert.deepStrictEqual([P.n2s[501], P.n2s[502], P.count], [1, 2, 2]);
});

test('tryOpenLesson: өмнөх слот SVG дарааллаар (126-ийн өмнөх нь 107)', () => {
  const i = html.indexOf('function tryOpenLesson(id)'), body = html.slice(i, html.indexOf('\n  }\n', i));
  assert.match(body, /var _ord = cmSlotOrder\(\), _pi = _ord\.indexOf\(id\), _prev = _pi > 0 \? _ord\[_pi - 1\] : id - 1;/);
  assert.match(body, /if \(id === 1 \|\| c\.indexOf\(_prev\) !== -1 \|\| c\.indexOf\(id\) !== -1 \|\| id <= cmPlacementSlot\(\)\) \{/);
});
