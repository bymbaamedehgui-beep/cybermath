// Тоглоомын төвийн туршилтын хаалга (index.html #cm-pv-pill блок) — статик шалгалт.
//   Premium-гүй → тоглоом бүрийг нэг удаа 2 минут (api/games.js ?action=preview), дараа нь Premium-ийн цонх;
//   найзын өрөөнд нэгдэх / Дасгалын төвийн embed хамаарахгүй; нүүрний тариф, FAQ, Premium-ийн цонхны бичвэр шинэчлэгдсэн.
// Ажиллуулах: node --test tests/cm-gate-ui.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const WT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(WT, 'index.html'), 'utf8');
const i0 = html.indexOf('<!-- ═══ Тоглоомын төв: Premium-гүй хэрэглэгчийн туршилт');
const i1 = html.indexOf('<!-- ═══ /Тоглоомын төв: туршилт ═══ -->');
const blk = i0 >= 0 && i1 > i0 ? html.slice(i0, i1) : '';

test('блок </body>-ийн өмнө, startGame ба онлайн өрөөний модулийн дараа', () => {
  assert.ok(blk, 'блок олдсонгүй');
  assert.ok(i1 < html.lastIndexOf('</body>'));
  assert.ok(html.indexOf('function startGame(type)') < i0);
  assert.ok(html.indexOf('window.olJoinRoom = function') < i0, 'olJoinRoom-ийг ороохын тулд дараа нь ачаалагдана');
  assert.strictEqual((html.match(/id="cm-pv-pill"/g) || []).length, 1);
});

test('хаалга: preview/pstatus, embed алгасна, нэгдсэн хүн хязгааргүй, хугацаа дуусахад хааж Premium цонх', () => {
  assert.match(blk, /api\('preview', \{ game: key \}\)/);
  assert.match(blk, /api\('pstatus'\)/);
  assert.match(blk, /if \(fromEmbed === true \|\| embed\(\) \|\| LATE\[type\] \|\| FREE\[type\]\) return ORIG\.apply\(self, a\);/);
  assert.match(blk, /guest\('olJoinRoom'\); guest\('sbhJoinByCode'\);/);
  ['cmStartMode', 'dmStartMode', 'gmStartMode', 'luStartMode', 'drStart', 'sbhStart', 'sbhCreateRoom'].forEach(n => assert.match(blk, new RegExp("wrap\\('" + n + "'"), n));
  assert.match(blk, /window\.olCreateRoom = function/);
  assert.match(blk, /if \(left <= 0\) \{ var k = r\.key; stop\(\); S\.used\[k\] = 1; kill\(k\); paint\(\); offer\(k, false\); \}/);
  assert.match(blk, /if \(!gameOpen\(\)\) return stop\(\);/, 'тоглоомоос гарвал цонх гаргахгүй');
  assert.match(blk, /window\.showPremiumInfo\(\)/);
  assert.doesNotMatch(blk, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможи бүү');
  const re = /<script>([\s\S]*?)<\/script>/g; let m, n = 0;
  while ((m = re.exec(blk))) { new Function(m[1]); n++; }
  assert.strictEqual(n, 1);
});

test('клиентийн үнэгүй тоглоомын жагсаалт = сервер (api/_cmpreview.js FREE_KEYS)', () => {
  const PV = require(path.join(WT, 'api', '_cmpreview.js'));
  const m = blk.match(/var FREE = \{([^}]*)\}/);
  assert.ok(m);
  const keys = m[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean);
  assert.deepStrictEqual(keys.sort(), PV.FREE_KEYS.slice().sort());
});

test('нүүрний тариф, FAQ, чатбот, Premium-ийн цонх шинэ дүрэмтэй', () => {
  assert.doesNotMatch(html, /Бүх 16 тоглоом/);
  assert.match(html, /Тоглоом бүрийг 2 минут туршина<\/li>/);
  assert.match(html, /Бүх 17 тоглоом хязгааргүй<\/li>/);
  assert.match(html, /Тоглоом бүрийг нэг удаа 2 минут үнэгүй туршина\. Premium эрхтэй бол бүх 17 тоглоом/);
  assert.match(html, /Тоглоомын төвийн 17 тоглоом Premium-д багтана/);
  assert.match(html, /<b>Бүх 17 тоглоом<\/b><span>MATH MORTAL, Мянгат, Муурнууд… хязгааргүй<\/span>/);
});
