// Тоглоомын төвийн шинэ цайвар загвар (C «Адал явдал») — cm-ui.js / cm-ui.css (2026-11-08).
//   - Одоо ажиллаж байгаа зүйлсийг эвдэхгүй: тусдаа файл, html.cmx-ээр хүрээлэгдсэн, ?ui=old-оор хуучин хувилбар
//   - Табыг сайтын жинхэнэ товчоор, хичээлийг tryOpenLesson, тоглоомыг startGame-ээр (сайтын функцийг өөрчлөхгүй)
//   - Хуучин hero/табын мөр/streak, XP баннерын агуулга (уриа, Зааварчилгаа, 7 хоногийн цэг, түвшин, XP) «Нүүр»-т байгаа
// Ажиллуулах: node --test tests/cm-ui.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('index.html'), js = R('cm-ui.js'), css = R('cm-ui.css'), mob = R('app-mobile.js');

test('index.html: cm-ui.css app-mobile.css-ийн дараа, cm-ui.js app-mobile.js-ээс ӨМНӨ (defer дараалал)', () => {
  const iCss = html.indexOf('<link rel="stylesheet" href="/cm-ui.css'), iMcss = html.indexOf('<link rel="stylesheet" href="/app-mobile.css">');
  const iJs = html.indexOf('<script src="/cm-ui.js'), iMjs = html.indexOf('<script src="/app-mobile.js');
  assert.ok(iCss > iMcss && iMcss >= 0, 'css дараалал');
  assert.ok(iJs >= 0 && iMjs > iJs, 'js дараалал');
  assert.match(html.slice(iJs, iJs + 60), /defer/);
});

test('vercel.json: cm-ui.js, cm-ui.css статик build-д', () => {
  const v = JSON.parse(R('vercel.json'));
  const srcs = v.builds.map(b => b.src);
  assert.ok(srcs.includes('cm-ui.js') && srcs.includes('cm-ui.css'));
});

test('cm-ui.js: синтакс, embed хамгаалалт, ?ui=old унтраалга, эможигүй', () => {
  new Function(js);
  assert.match(js, /window\.top !== window\.self \|\| H\.classList\.contains\('cm-embed'\)/);
  assert.match(js, /if \(q === 'old'\) localStorage\.setItem\('cm_ui', 'old'\); else if \(q === 'new'\) localStorage\.removeItem\('cm_ui'\);/);
  assert.match(js, /if \(localStorage\.getItem\('cm_ui'\) === 'old'\) return;/);
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможи бүү');
  assert.doesNotMatch(css, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});

test('cm-ui.js: сайтын функцийг шууд өөрчлөхгүй — табыг жинхэнэ товчоор, хичээл/тоглоомыг сайтын функцээр', () => {
  assert.doesNotMatch(js, /window\.(switchTab|tryOpenLesson|startGame|openFriends|handleAvatarClick|openTutorialModal)\s*=(?!=)/, 'сайтын функцийг дарж бичихгүй');
  assert.doesNotMatch(js, /switchTab\(\s*k\s*\)|window\.switchTab\(/, 'switchTab-ийг шууд дуудахгүй (event.target)');
  assert.match(js, /function go\(k\) \{ var b = tabBtn\(k\); if \(!b\) return; if \(activeTab\(\) !== k\) b\.click\(\);/);
  assert.match(js, /window\.tryOpenLesson\(s\)/);
  assert.match(js, /window\.startGame\(k\)/);
  // «Нүүр»-ийн далд товч switchTab('home')-ыг сайтын өөрийн switchTab-аар дуудна
  assert.match(js, /b\.setAttribute\('onclick', "switchTab\('home'\)"\); b\.style\.display = 'none';/);
});

test('Хуучин бүрхүүлийн агуулга «Нүүр»-т: уриа, Зааварчилгаа, 7 хоногийн цэг, түвшин/XP, Төв солих, Найзууд, Профайл', () => {
  assert.match(js, /Алхам алхмаар аварга болцгооё/, 'hero-ийн уриа');
  assert.match(js, /data-act="@tutorial"/, 'Зааварчилгаа (openTutorialModal)');
  assert.match(js, /window\.openTutorialModal\(\)/);
  assert.match(js, /getElementById\('sd-' \+ i\)/, 'streak-ийн 7 хоногийн цэг');
  assert.match(js, /getElementById\('xp-bar'\)/, 'түвшний XP мөр');
  assert.match(js, /\['@pick', 'Төв солих'/);
  assert.match(js, /\['@friends', 'Найзууд'/);
  assert.match(js, /\['@profile', 'Профайл'/);
  for (const k of ['achievements', 'exam', 'classroom']) assert.match(js, new RegExp("\\['" + k + "', "), k + ' «Цааш» цэсэнд');
  for (const k of ['home', 'path', 'games', 'mathlet', 'leaderboard']) assert.match(js, new RegExp("\\['" + k + "', "), k + ' дээд цэсэнд');
  // hero, табын мөр, streak/XP баннерыг зөвхөн html.cmx үед нууна
  assert.match(css, /html\.cmx #cybermath-app \.hero,\s*html\.cmx #cybermath-app \.tabs,\s*html\.cmx #streak-section,\s*html\.cmx #cybermath-app \.xp-banner/);
});

test('Газрын зураг: өдөр/үдэш/шөнө (1), арал руу томруулах (3), сорилын нислэг нэг удаа (10)', () => {
  assert.match(js, /return h >= 6 && h < 17 \? 'day' : \(h >= 17 && h < 20 \? 'dusk' : 'night'\);/);
  assert.match(css, /\.hx-sky\.day \{/); assert.match(css, /\.hx-sky\.dusk \{/); assert.match(css, /\.hx-sky\.night \{/);
  assert.match(js, /data-isl="/); assert.match(js, /class="hx-tl"/);
  assert.match(js, /lsGet\('cmx_flown_' \+ M\.g\) === k/, 'нислэг нэг удаа');
  assert.match(js, /if \(!M\.fb\) maybeFly/, 'түр зураг дээр нислэгийн тэмдгийг үрэхгүй');
  assert.match(js, /if \(!pin \|\| reduced\(\)\) return;/, 'reduced-motion');
  // tryOpenLesson-ийн нээлтийн дүрэмтэй ижил (index.html)
  assert.match(js, /return s === 1 \|\| done\.indexOf\(s\) >= 0 \|\| done\.indexOf\(s - 1\) >= 0 \|\| s <= pl;/);
  assert.match(html, /if \(id === 1 \|\| c\.indexOf\(_prev\) !== -1 \|\| c\.indexOf\(id\) !== -1 \|\| id <= cmPlacementSlot\(\)\) \{/);
});

test('Үнэгүй тоглоомын жагсаалт index.html-ийн gate-тэй ижил', () => {
  const a = /var FREE = (\[[^\]]+\])/.exec(js);
  assert.ok(a, 'cm-ui FREE');
  const b = require(path.join(__dirname, '..', 'api', '_cmpreview.js')).FREE_KEYS;
  assert.ok(Array.isArray(b) && b.length, '_cmpreview FREE_KEYS');
  const norm = s => JSON.parse(s.replace(/'/g, '"')).sort().join(',');
  assert.strictEqual(norm(a[1]), b.slice().sort().join(','));
});

test('app-mobile.js: #tab-home байвал доод таб Нүүр·Зам·Тоглоом·Тэргүүлэгч·Цааш, Mathlet «Цааш»-т; байхгүй бол хуучнаараа', () => {
  new Function(mob);
  assert.match(mob, /return document\.getElementById\('tab-home'\)\s*\?\s*\[\['home', 'Нүүр', IC\.home\], \['path', 'Зам', IC\.path\], \['games', 'Тоглоом', IC\.games\], \['leaderboard', 'Тэргүүлэгч', IC\.trophy\], \['more', 'Цааш', IC\.grid\]\]\s*:\s*NAV;/);
  assert.match(mob, /NAV = navFor\(\);/);
  assert.match(mob, /if \(!NAV\.some\(function \(n\) \{ return n\[0\] === 'mathlet'; \}\)\) L\.unshift\(\['Mathlet', IC\.mathlet/);
});

test('cm-quiz.js: холбогдсон (cm-ui.js-ийн дараа), vercel build, синтакс, ?ui=old унтраалга', () => {
  const q = R('cm-quiz.js');
  new Function(q);
  const iUi = html.indexOf('<script src="/cm-ui.js'), iQ = html.indexOf('<script src="/cm-quiz.js');
  assert.ok(iUi >= 0 && iQ > iUi, 'cm-quiz.js cm-ui.js-ийн дараа');
  assert.ok(JSON.parse(R('vercel.json')).builds.some(b => b.src === 'cm-quiz.js'));
  assert.match(q, /localStorage\.getItem\('cm_ui'\) === 'old'/);
  assert.match(q, /window\.top !== window\.self \|\| H\.classList\.contains\('cm-embed'\)/);
});

test('cm-quiz.js: бодлогын логикийг өөрчлөхгүй, MathLive гарт хүрэхгүй, зөвхөн html.cmx үед', () => {
  const q = R('cm-quiz.js');
  assert.doesNotMatch(q, /\b(renderQuestion|checkAnswer|selectOption|showResults|nextQuestion|toggleHint|toggleMemo|initIndexFillMf)\s*=(?!=)/, 'сайтын функцийг дарж бичихгүй');
  assert.doesNotMatch(q, /mathVirtualKeyboard/, 'MathLive гарыг хөндөхгүй');
  assert.match(q, /function on\(\) \{ return H\.classList\.contains\('cmx'\); \}/);
  assert.match(q, /modal\.classList\.toggle\('cmq', act\)/);
  // Хариулт id/индексээр шалгагддаг тул A–D тэмдэг нь текстэнд нөлөөлөхгүй (selectOption(i), opt-i, data-raw)
  assert.match(html, /onclick="selectOption\(\$\{i\}\)" data-raw="/);
  assert.match(html, /isCorrect = selectedOpt === qData\.correct;/);
  // Бичих талбар (math-field, input) дээр 1–9/Enter-ийг хөндөхгүй
  assert.match(q, /tag === 'input' \|\| tag === 'textarea' \|\| tag === 'select' \|\| tag === 'math-field'/);
  // AI багш — одоогийн чатын функцээр
  assert.match(q, /window\.sendAppChat\(msg\)/);
  assert.match(q, /window\.toggleAppChat\(\)/);
});

test('Бодлогын дэлгэцийн хэв маяг зөвхөн html.cmx #quiz-modal.cmq дотор', () => {
  const i = css.indexOf('/* ════════ Бодлогын дэлгэц (#quiz-modal.cmq');
  assert.ok(i > 0);
  const part = css.slice(i);
  const sels = part.replace(/\/\*[\s\S]*?\*\//g, '').match(/(^|\})\s*([^{}@]+)\{/g) || [];
  sels.map(s => s.replace(/^\}?\s*/, '').replace(/\{$/, '').trim()).filter(s => s && !/^(from|to|\d+%)$/.test(s)).forEach(s => {
    s.split(',').forEach(x => assert.match(x.trim(), /^html\.cmx #quiz-modal\.cmq/, 'хүрээ: ' + x.trim()));
  });
});
test('Гарагийн туг: нээлттэй ба ДУУССАН гараг дээр хоёр туг (дууссанд ногоон тэмдэгтэй хамт, эзэмшигч 2026-11-10)', () => {
  assert.match(js, /if \(st === 'done'\) return flags\(R, id\) \+ '<g transform/);
  assert.match(js, /if \(st === 'open'\) return flags\(R, id\);/);
  assert.match(js, /function flags\(R, id\) \{/);
});
