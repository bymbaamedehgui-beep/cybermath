// Дасгал ажлын дэвтрийн цахим ном (эзэмшигч 2026-11-16: «шууд цахим ном хэлбэрээр … нэг нэг линк … хэн ч татаж авах засварлах
// боломжгүйгээр»): api/_ebook.js (нийтлэх — зөвхөн админ, унших — хэн ч), devter.html (/devter/<анги>), ws-book.js publishEbook.
// Ажиллуулах: node --test tests/ebook.test.js   (бодит DB 0 — tests/_ebookfake.js санах ойд)
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const API = path.join(__dirname, '..', 'api');
const FAKE = require('./_ebookfake').create();
const dbPath = require.resolve(path.join(API, '_db.js'));
require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: { query: FAKE.query } };
process.env.JWT_SECRET = 'test-secret-ebook';
const EB = require(path.join(API, '_ebook.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [API] }));
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) };
const USER = { authorization: 'Bearer ' + jwt.sign({ email: 'a@b.mn', role: 'student' }, process.env.JWT_SECRET) };
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

function mkRes() {
  return { statusCode: 200, headers: {}, body: undefined, raw: null,
    setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; },
    json(o) { this.body = o; return this; }, end(b) { this.raw = b; return this; } };
}
async function call(method, o) {
  const req = { method: method, headers: Object.assign({}, o.headers || {}), body: o.body || {}, query: o.query || {} };
  const res = mkRes();
  const handled = await EB.handle(req, res);
  return Object.assign(res, { handled: handled });
}
const post = (body, headers) => call('POST', { body: body, headers: headers });
const get = (query) => call('GET', { query: query });
const gz = (s) => zlib.gzipSync(Buffer.from(s, 'utf8'));
const UP = 'abc12345xyz';

beforeEach(() => { FAKE.db.books.clear(); FAKE.db.parts.clear(); });

test('бусад хүсэлтэд хамааралгүй (false) — worksheets.js-ийн үлдсэн замууд хэвээр', async () => {
  assert.strictEqual((await post({ action: 'book_get' }, ADMIN)).handled, false);
  assert.strictEqual((await get({ titles: '1' })).handled, false);
});

test('нийтлэх нь ЗӨВХӨН админ: нэвтрээгүй / энгийн хэрэглэгч → 401, юу ч бичигдэхгүй', async () => {
  for (const h of [undefined, USER]) {
    const r = await post({ action: 'ebook_put', key: '9', up: UP, i: 0, n: 1, data: gz('{}').toString('base64') }, h);
    assert.strictEqual(r.statusCode, 401);
    assert.strictEqual((await post({ action: 'ebook_commit', key: '9', up: UP, n: 1 }, h)).statusCode, 401);
  }
  assert.strictEqual(FAKE.db.parts.size + FAKE.db.books.size, 0);
});

test('шалгалт: анги, хувилбар, хэсгийн дугаар, gzip биш / хэт том өгөгдөл → 400', async () => {
  const ok = gz('{"a":1}').toString('base64');
  const bad = [
    { key: '1', up: UP, i: 0, n: 1, data: ok }, { key: '13', up: UP, i: 0, n: 1, data: ok }, { key: '../x', up: UP, i: 0, n: 1, data: ok },
    { key: '9', up: 'Bad Up!', i: 0, n: 1, data: ok }, { key: '9', up: UP, i: 1, n: 1, data: ok }, { key: '9', up: UP, i: 0, n: 41, data: ok },
    { key: '9', up: UP, i: 0, n: 1, data: Buffer.from('{"plain":true}').toString('base64') },
    { key: '9', up: UP, i: 0, n: 1, data: 'not base64 !!' },
    { key: '9', up: UP, i: 0, n: 1, data: Buffer.concat([Buffer.from([0x1f, 0x8b]), Buffer.alloc(3 * 1024 * 1024)]).toString('base64') },
  ];
  for (const b of bad) assert.strictEqual((await post(Object.assign({ action: 'ebook_put' }, b), ADMIN)).statusCode, 400, JSON.stringify(b).slice(0, 80));
  assert.strictEqual(FAKE.db.parts.size, 0);
});

test('хэсэг бүгд ирсний дараа л идэвхжинэ; нийтийн манифест ба хэсэг (Content-Encoding: gzip, удаан кэш)', async () => {
  const doc = JSON.stringify({ v: 1, label: '9-р анги', pages: [{ k: 'cover' }], papers: ['<div class="wsx-paper">Бодлого</div>'] });
  const a = doc.slice(0, 40), b = doc.slice(40);
  assert.strictEqual((await post({ action: 'ebook_put', key: '9', up: UP, i: 0, n: 2, data: gz(a).toString('base64') }, ADMIN)).body.ok, true);
  assert.strictEqual((await post({ action: 'ebook_commit', key: '9', up: UP, n: 2, pages: 1 }, ADMIN)).statusCode, 409, 'хэсэг дутуу');
  assert.strictEqual((await get({ ebook: '9' })).statusCode, 404, 'нийтлэгдээгүй');
  assert.strictEqual((await get({ ebook: '9', up: UP, i: '0' })).statusCode, 404, 'идэвхгүй хувилбарын хэсэг харагдахгүй');
  await post({ action: 'ebook_put', key: '9', up: UP, i: 1, n: 2, data: gz(b).toString('base64') }, ADMIN);
  const c = await post({ action: 'ebook_commit', key: '9', up: UP, n: 2, pages: 1, label: '9-р анги<script>', paper: 'a4' }, ADMIN);
  assert.strictEqual(c.body.ok, true); assert.strictEqual(c.body.url, '/devter/9');

  const m = await get({ ebook: '9' });
  assert.deepStrictEqual([m.body.ok, m.body.up, m.body.n, m.body.pages, m.body.label, m.body.paper], [true, UP, 2, 1, '9-р ангиscript', 'a4']);
  assert.match(m.headers['Cache-Control'], /public, s-maxage=60/);
  let txt = '';
  for (const i of ['0', '1']) {
    const r = await get({ ebook: '9', up: UP, i: i });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(r.headers['Content-Encoding'], 'gzip');
    assert.match(r.headers['Content-Type'], /^application\/json/);
    assert.strictEqual(r.headers['Cache-Control'], 'public, max-age=31536000, immutable');
    txt += zlib.gunzipSync(r.raw).toString('utf8');
  }
  assert.strictEqual(txt, doc, 'хэсгүүдийг нийлүүлэхэд анхны JSON');
});

test('дахин нийтлэхэд шинэ хувилбар идэвхжиж, хуучны хэсэг устна (хуучин хаяг 404)', async () => {
  const put = (up, s) => post({ action: 'ebook_put', key: 'eesh', up: up, i: 0, n: 1, data: gz(s).toString('base64') }, ADMIN);
  await put(UP, '{"v":1}'); await post({ action: 'ebook_commit', key: 'eesh', up: UP, n: 1 }, ADMIN);
  const UP2 = 'zzz98765aaa';
  await put(UP2, '{"v":2}');
  assert.strictEqual((await get({ ebook: 'eesh', up: UP, i: '0' })).statusCode, 200, 'commit хүртэл хуучин нь ажиллана');
  await post({ action: 'ebook_commit', key: 'eesh', up: UP2, n: 1 }, ADMIN);
  assert.strictEqual((await get({ ebook: 'eesh' })).body.up, UP2);
  assert.strictEqual((await get({ ebook: 'eesh', up: UP, i: '0' })).statusCode, 404);
  assert.strictEqual(zlib.gunzipSync((await get({ ebook: 'eesh', up: UP2, i: '0' })).raw).toString(), '{"v":2}');
  assert.deepStrictEqual(Array.from(FAKE.db.parts.values()).map((x) => x.up), [UP2]);
});

test('буруу анги / хувилбар / дугаар → 404 JSON (DB-ийн бусад хүснэгтэд хүрэхгүй)', async () => {
  for (const q of [{ ebook: 'x' }, { ebook: '' }, { ebook: '9', up: '../..', i: '0' }, { ebook: '9', up: UP, i: '-1' }, { ebook: '9', up: UP, i: 'a' }]) {
    const r = await get(q);
    assert.strictEqual(r.statusCode, 404, JSON.stringify(q)); assert.strictEqual(r.body.ok, false);
  }
  assert.ok(FAKE.db.sql.every((s) => /ws_ebook/.test(s)), 'зөвхөн цахим номын хүснэгт');
});

test('worksheets.js: цахим ном бусад хүснэгтийн DDL-ээс ӨМНӨ (нийтийн уншилт хөнгөн), админы шалгалт _guard.requireAdmin', () => {
  const w = R('api/worksheets.js'), e = R('api/_ebook.js');
  assert.match(w, /const EBOOK = require\('\.\/_ebook'\);/);
  const at = w.indexOf('EBOOK.handle(req, res)');
  assert.ok(at > 0 && at < w.indexOf('CREATE TABLE IF NOT EXISTS ws_sets'), 'DDL-ээс өмнө');
  assert.match(e, /const \{ requireAdmin \} = require\('\.\/_guard'\);/);
  assert.doesNotMatch(e, /cybermath-default-secret/, 'JWT fallback байхгүй');
});

test('devter.html: зөвхөн унших — хэвлэх/татах/засах товчгүй, хэвлэлд нуугдана, хуулах/сонгох/баруун товш хаалттай', () => {
  const h = R('devter.html');
  assert.match(h, /@media print\{body\.ev>\*\{display:none!important\}/);
  assert.match(h, /-webkit-user-select:none;user-select:none;-webkit-touch-callout:none/);
  assert.match(h, /\['contextmenu', 'dragstart', 'copy', 'cut', 'selectstart'\]\.forEach/);
  assert.match(h, /\(e\.ctrlKey \|\| e\.metaKey\) && \/\^\[psacu\]\$\/i\.test\(e\.key\)/);
  assert.doesNotMatch(h, /window\.print|download=|contenteditable|Хэвлэх|Татах/);
  assert.match(h, /<base href="\/">/); assert.match(h, /<meta name="robots" content="noindex">/);
  assert.match(h, /fetch\('\/api\/worksheets\?ebook=' \+ encodeURIComponent\(key\)\)/);
  assert.match(h, /DecompressionStream\('gzip'\)/, 'Content-Encoding задлагдаагүй үеийн нөөц');
  assert.doesNotMatch(h, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможигүй (SVG icon)');
  const v = JSON.parse(R('vercel.json'));
  const rt = v.routes.find((r) => r.dest === '/devter.html');
  assert.ok(rt && new RegExp('^' + rt.src + '$').test('/devter/9') && new RegExp('^' + rt.src + '$').test('/devter/eesh/'));
  assert.ok(!new RegExp('^' + rt.src + '$').test('/devter/9/../x'));
  assert.ok(v.builds.some((b) => b.src === '*.html'), 'devter.html статикаар');
});
