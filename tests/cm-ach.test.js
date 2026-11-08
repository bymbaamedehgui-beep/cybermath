// «Амжилт» табын шинэ цайвар загвар C «Шатлалын зам» — cm-ach.js / cm-ach.css (2026-11-08, эзэмшигч 3 саналаас сонгосон).
//   - Сайтын өгөгдөл/функц хэвээр: getAchievementsList(), _currentUser, амьтны карт #pet-card (updatePetCard) — эх нь далд (html.cmx + .mx-on)
//   - «Өндгөө гаргах» сайтын #pet-action-btn-ийг дарна (openHatchModal)
// Ажиллуулах: node --test tests/cm-ach.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('index.html'), js = R('cm-ach.js'), css = R('cm-ach.css'), v = JSON.parse(R('vercel.json'));

test('холболт: css cm-ui.css-ийн дараа, js defer, vercel build', () => {
  const iUi = html.indexOf('<link rel="stylesheet" href="/cm-ui.css'), iCss = html.indexOf('<link rel="stylesheet" href="/cm-ach.css?v=');
  assert.ok(iUi >= 0 && iCss > iUi, 'css дараалал');
  assert.match(html, /<script src="\/cm-ach\.js\?v=\d+" defer><\/script>/);
  const srcs = v.builds.map(b => b.src);
  assert.ok(srcs.includes('cm-ach.js') && srcs.includes('cm-ach.css'));
});

test('cm-ach.js: синтакс, embed хамгаалалт, ?ui=old унтраалга, эможигүй', () => {
  new Function(js);
  assert.match(js, /window\.top !== window\.self \|\| H\.classList\.contains\('cm-embed'\)/);
  assert.match(js, /if \(q === 'old' \|\| \(q !== 'new' && localStorage\.getItem\('cm_ui'\) === 'old'\)\) return;/);
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможи бүү');
  assert.doesNotMatch(css, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('Сайтын функцийг дарж бичихгүй; өндөг гаргах нь сайтын товчоор', () => {
  assert.doesNotMatch(js, /\b(getAchievementsList|renderAchievements|switchTab|openHatchModal|hatchPet|feedPet|loadPet|updatePetCard)\s*=(?!=)/);
  assert.doesNotMatch(js, /switchTab\(/);
  assert.match(js, /var sb = d\.getElementById\('pet-action-btn'\);/);
  assert.match(js, /if \(sb\) sb\.click\(\); else if \(typeof window\.openHatchModal === 'function'\) window\.openHatchModal\(\);/);
});

test('Эх харагдацыг зөвхөн html.cmx + .mx-on үед нууна; бүх класс mxa- угтвартай (сайтын .hero/.card-тай давхцахгүй)', () => {
  assert.match(css, /^#mx-ach \{ display: none; \}/m);
  assert.match(css, /^html\.cmx #tab-achievements\.mx-on > :not\(#mx-ach\) \{ display: none !important; \}/m);
  assert.match(css, /^html\.cmx #tab-achievements\.mx-on > #mx-ach \{ display: block; \}/m);
  assert.match(js, /if \(!D\) \{ tab\.classList\.remove\('mx-on'\); return; \}/);
  const body = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bad = [...new Set((body.match(/\.[a-zA-Z][\w-]*/g) || []).map(s => s.slice(1)))]
    .filter(c => !/^mxa/.test(c) && !['cmx', 'mx-on', 'on', 'lk', 'nx', 'gold', 'pk', 'egg', 'done'].includes(c));
  assert.deepStrictEqual(bad, [], 'угтваргүй класс');
  // JS-ийн гаргадаг классууд ч мөн
  const cls = [...js.matchAll(/class="([^"]+)"/g)].flatMap(m => m[1].split("'")[0].split(/\s+/)).filter(Boolean);   // тогтмол хэсэг (нэмэлт төлөв: lk, nx, gold…)
  assert.deepStrictEqual(cls.filter(c => !/^mxa/.test(c) && !['on', 'gold', 'pk', 'egg', 'done'].includes(c)), []);
});

test('Сайтын тэмдэглэгээтэй нийцтэй: уншдаг id, текст, амжилтын id-ууд index.html-д байгаа', () => {
  for (const id of ['tab-achievements', 'achievements-container', 'pet-card', 'pet-sprite', 'pet-name', 'pet-level', 'pet-species', 'pet-xp-text', 'pet-happiness', 'pet-action-btn', 'pet-hatch-modal'])
    assert.ok(html.indexOf('id="' + id + '"') >= 0, id);
  assert.match(html, /if \(tab === 'achievements'\) renderAchievements\(\);/);
  assert.match(html, /function getAchievementsList\(\) \{/);
  assert.match(html, /window\._currentUser = _currentUser;/);
  // updatePetCard(null) — өндөгний төлөвийг эдгээрээр танина
  assert.match(html, /nameEl\.textContent = 'Өндөг';/);
  assert.match(html, /lvlEl\.textContent = '—';/);
  assert.match(html, /spEl\.textContent = sp\.name \+ ' · ' \+ sp\.buff;/);
  assert.match(html, /xpTextEl\.textContent = xpInLevel \+ ' \/ ' \+ needed \+ ' XP';/);
  for (const id of ['first_lesson', 'lessons_10', 'lessons_50', 'lessons_100', 'streak_3', 'streak_7', 'streak_30', 'xp_100', 'xp_500', 'xp_1000', 'xp_5000', 'gems_500'])
    assert.ok(html.indexOf("id: '" + id + "'") >= 0, id);
});

// Сайтын жинхэнэ getAchievementsList()-ийг vm-д ажиллуулж cm-ach-ийн тооцоог шалгана
function load(user) {
  const a = html.indexOf('function getAchievementsList()'), b = html.indexOf('function renderAchievements()');
  assert.ok(a > 0 && b > a);
  const win = {}; win.top = win; win.self = win;
  const doc = { documentElement: { classList: { contains: () => false } }, readyState: 'complete', getElementById: () => null, addEventListener() {} };
  const ctx = vm.createContext({ window: win, document: doc, location: { search: '' }, localStorage: { getItem: () => null }, URLSearchParams, setTimeout, console, MutationObserver: function () { return { observe() {} }; } });
  win._currentUser = user;
  vm.runInContext('var _currentUser = window._currentUser;\n' + html.slice(a, b) + '\nwindow.getAchievementsList = getAchievementsList;', ctx);
  vm.runInContext(js, ctx);
  assert.ok(win.cmAch && typeof win.cmAch._data === 'function');
  return win.cmAch;
}
const L50 = Array.from({ length: 50 }, (_, i) => i + 1);
const J = x => JSON.parse(JSON.stringify(x));   // vm-ийн массив/объектыг энэ орчных болгоно

test('тооцоо: ангилал, зэрэг, дараагийн зорилго, замын дүүргэлт (дэлгэцийн зурагтай ижил өгөгдөл)', () => {
  const A = load({ xp: 5240, gems: 820, streak: 2, completedLessons: L50 }), D = A._data();
  assert.deepStrictEqual(J(Object.keys(D.cats)), ['les', 'str', 'xp', 'gem']);
  assert.deepStrictEqual(['les', 'str', 'xp', 'gem'].map(k => D.cats[k].length), [4, 3, 4, 1]);
  assert.strictEqual(D.all.length, 12);
  assert.strictEqual(D.nu, 8);
  assert.strictEqual(D.all.map(a => a.tier).join(''), '123412412345');
  assert.deepStrictEqual(J(D.cats.xp.map(a => a.num)), ['100', '500', '1K', '5K']);
  assert.strictEqual(D.next.id, 'streak_3');   // 2/3 — хамгийн ойр
  assert.deepStrictEqual(J(D.val), { les: 50, str: 2, xp: 5240, gem: 820 });
  const f = k => Math.round(A._fill(D.cats[k]) * 1000) / 10;
  assert.deepStrictEqual(['les', 'str', 'xp', 'gem'].map(f), [75, 22.2, 100, 100]);
});

test('тооцоо: шинэ хэрэглэгч ба бүгд нээгдсэн', () => {
  let D = load({ xp: 0, gems: 0, streak: 0, completedLessons: [] })._data();
  assert.strictEqual(D.nu, 0);
  assert.strictEqual(D.next.id, 'first_lesson');   // бүгд 0% — үлдэгдэл хамгийн бага
  const A = load({ xp: 9999, gems: 999, streak: 99, completedLessons: Array.from({ length: 150 }, (_, i) => i) });
  D = A._data();
  assert.strictEqual(D.nu, 12);
  assert.strictEqual(D.next, null);
  assert.ok(Object.keys(D.cats).every(k => A._fill(D.cats[k]) === 1));
  // Нэвтрээгүй (_currentUser null) — алдаагүй
  assert.strictEqual(load(null)._data().nu, 0);
});
