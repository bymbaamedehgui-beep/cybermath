// «Тэргүүлэгч» ба «Mathlet» табын шинэ цайвар загвар — cm-compete.js / cm-compete.css (2026-11-08).
//   - Сайтын өгөгдөл/функц хэвээр: loadLeaderboard, renderMathletHub-ийн гаргасныг уншиж хажууд нь зурна, эх нь далд (html.cmx + .mx-on)
//   - Үйлдэл бүр сайтын функцээр: doJoinMathlet (#mathlet-room-input), resumeMathlet, resumeTeacherMathlet, openMathletSetupForClass
//   - Имэйлээр нэвтэрсэн хэрэглэгчид id ирдэггүй тул «Та»-г нэр + XP-ээр танина (нүүрний cm-ui.js ч мөн)
// Ажиллуулах: node --test tests/cm-compete.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('index.html'), js = R('cm-compete.js'), css = R('cm-compete.css'), ui = R('cm-ui.js'), v = JSON.parse(R('vercel.json'));

test('холболт: css cm-ui.css-ийн дараа, js defer, vercel build', () => {
  const iUi = html.indexOf('<link rel="stylesheet" href="/cm-ui.css'), iCss = html.indexOf('<link rel="stylesheet" href="/cm-compete.css?v=');
  assert.ok(iUi >= 0 && iCss > iUi, 'css дараалал');
  assert.match(html, /<script src="\/cm-compete\.js\?v=\d+" defer><\/script>/);
  const srcs = v.builds.map(b => b.src);
  assert.ok(srcs.includes('cm-compete.js') && srcs.includes('cm-compete.css'));
});

test('cm-compete.js: синтакс, embed хамгаалалт, ?ui=old унтраалга, эможигүй', () => {
  new Function(js);
  assert.match(js, /window\.top !== window\.self \|\| H\.classList\.contains\('cm-embed'\)/);
  assert.match(js, /if \(q === 'old' \|\| \(q !== 'new' && localStorage\.getItem\('cm_ui'\) === 'old'\)\) return;/);
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}✕]/u, 'эможи бүү');
  assert.doesNotMatch(css, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('Сайтын функцийг дарж бичихгүй, switchTab-ийг шууд дуудахгүй — үйлдэл бүр сайтын функцээр', () => {
  assert.doesNotMatch(js, /\b(loadLeaderboard|renderMathletHub|doJoinMathlet|resumeMathlet|resumeTeacherMathlet|openMathletSetupForClass|openMathletJoin|exitMathletRoom|switchTab)\s*=(?!=)/);
  assert.doesNotMatch(js, /switchTab\(\s*k\s*\)|window\.switchTab\(/);
  assert.match(js, /function go\(k\) \{ var b = tabBtn\(k\); if \(!b\) return; if \(activeTab\(\) !== k\) b\.click\(\);/);
  // Кодоор нэгдэх: сайтын талбарт бичээд doJoinMathlet (алдаа, өрөө нээх нь сайтынх)
  assert.match(js, /var real = d\.getElementById\('mathlet-room-input'\);/);
  assert.match(js, /real\.value = code;/);
  assert.match(js, /window\.doJoinMathlet\(\);/);
  assert.match(js, /window\.resumeMathlet\(\)/);
  assert.match(js, /window\.resumeTeacherMathlet\(b\.getAttribute\('data-rt'\)\)/);
  assert.match(js, /window\.openMathletSetupForClass\(\+b\.getAttribute\('data-cls'\)\)/);
});

test('Эх харагдацыг зөвхөн html.cmx + .mx-on үед нууна (?ui=old үед хуучнаараа)', () => {
  assert.match(css, /^#mx-lb, #mx-ml \{ display: none; \}/m);
  assert.match(css, /html\.cmx #tab-leaderboard\.mx-on > :not\(#mx-lb\), html\.cmx #tab-mathlet\.mx-on > :not\(#mx-ml\) \{ display: none !important; \}/);
  assert.match(css, /html\.cmx #tab-leaderboard\.mx-on > #mx-lb, html\.cmx #tab-mathlet\.mx-on > #mx-ml \{ display: block; \}/);
  // таниагүй төлөвт эх харагдац
  assert.match(js, /if \(!P\) \{ tab\.classList\.remove\('mx-on'\); return; \}/);
});

test('Сайтын тэмдэглэгээтэй нийцтэй: уншдаг сонгогч, onclick-ууд index.html-д байгаа', () => {
  // Тэргүүлэгч (loadLeaderboard)
  for (const c of ['lb-row', 'lb-rank', 'lb-avatar', 'lb-name', 'lb-you', 'lb-xp']) assert.ok(html.indexOf('class="' + c + '"') >= 0, c);
  assert.match(html, /<div class="leaderboard-card" id="lb-list">/);
  assert.match(html, /if \(tab === 'leaderboard'\) loadLeaderboard\(\);/);
  // Mathlet (renderMathletHub)
  assert.match(html, /if \(tab === 'mathlet'\) renderMathletHub\(\);/);
  assert.ok(html.indexOf('onclick="openMathletJoin()"') >= 0);
  assert.ok(html.indexOf('onclick="resumeMathlet()"') >= 0);
  assert.ok(html.indexOf("onclick=\"resumeTeacherMathlet(\\'' + actT.room_code + '\\')\"") >= 0);
  assert.ok(html.indexOf("onclick=\"openMathletSetupForClass(' + c.id + ')\"") >= 0);
  assert.ok(html.indexOf('<div style="flex:1;">') >= 0, 'ангийн нэр/тоо flex:1 дотор');
  assert.ok(html.indexOf("onclick=\"switchTab(\\'classroom\\')\"") >= 0);
  assert.match(html, /var code = document\.getElementById\('mathlet-room-input'\)\.value\.trim\(\);/);
  assert.match(html, /localStorage\.setItem\('cm_active_mathlet', code\)/);
});

test('«Та»-г нэр + XP-ээр танина (id байхгүй үед), аватарыг цэвэрлэнэ', () => {
  assert.match(js, /var pick = hit\.length === 1 \? hit\[0\] : same\.length === 1 && Math\.abs\(same\[0\]\.xp - me\.xp\) <= Math\.max\(200, me\.xp \* 0\.05\) \? same\[0\] : null;/);
  assert.match(ui, /if \(mi < 0\) \{   \/\/ имэйл\/нууц үгээр нэвтэрсэн бол id ирдэггүй/);
  assert.match(js, /if \(\/\^on\/i\.test\(a\.name\)\) n\.removeAttribute\(a\.name\);/, 'on* шинжгүй');
  assert.match(js, /\/\^data:image\\\/\(png\|jpe\?g\|gif\|webp\);base64,\[A-Za-z0-9\+\\\/=\]\+\$\/i/, 'зөвхөн base64 зураг');
  assert.match(js, /esc\(u\.name\)/, 'нэрийг escape');
  assert.match(js, /esc\(c\.name\)/);
});

test('Агуулга: тавцан, «Таны байр», XP цуглуулах, алхмууд, 2 хэлбэр, ангигүй үед анги үүсгэх', () => {
  for (const t of ['Шилдэг гурав', 'Таны байр', 'Хичээл <i>үргэлжлүүлэх</i>', 'Тоглоом <i>тоглох</i>', 'Хэрхэн оролцох вэ?', 'Тэмцээн үргэлжилж байна',
    'Таны тэмцээн идэвхтэй байна', 'Аль ангид тэмцээн зохиох вэ?', 'Хариулах 2 хэлбэр', 'Танд анги алга', 'data-go="classroom"']) assert.ok(js.indexOf(t) >= 0, t);
  // оноо: зөв хариулт 100 + хурдны нэмэгдэл (api/users.js-тэй тохирно)
  assert.match(R('api/users.js'), /scores\[email\] = \(scores\[email\] \|\| 0\) \+ 100 \+ Math\.round\(speedBonus\);/);
  assert.match(R('api/users.js'), /const speedBonus = Math\.max\(0, 15000 - elapsed\) \/ 150;/);
});
