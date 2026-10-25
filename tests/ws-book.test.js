// Дасгалын дэвтэр: ажлын хуудас бүрийн бодолтын зайн тохиргоо (api/worksheets.js book_get / book_set) — зөвхөн админ
// Ажиллуулах: node --test tests/ws-book.test.js   (бодит DB 0 — tests/_smsfake.js + ws_book санах ойд)
'use strict';
const F = require('./_smsfake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const ws = require(path.join(F.API, 'worksheets.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const W = (body, o) => F.call(ws, body, o);
const ADMIN = { headers: { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) } };
const USER = { headers: { authorization: 'Bearer ' + jwt.sign({ email: 'a@b.mn', role: 'student' }, process.env.JWT_SECRET) } };

// ws_book хүснэгт (санах ой) — бусад SQL-ийг _smsfake хэвээр
const book = new Map(), seenSql = [];
const orig = F.pool.query;
F.pool.query = async function (sql, p) {
  const q = String(sql).replace(/\s+/g, ' ').trim();
  if (/\bws_book\b/.test(q)) {
    seenSql.push(q);
    if (/^CREATE TABLE IF NOT EXISTS ws_book /.test(q)) return { rows: [] };
    if (q === 'SELECT slug, data FROM ws_book') return { rows: Array.from(book.entries()).map(([slug, data]) => ({ slug: slug, data: JSON.parse(data) })) };
    if (/^INSERT INTO ws_book \(slug, data, updated_at\) VALUES \(\$1,\$2::jsonb,NOW\(\)\) ON CONFLICT \(slug\) DO UPDATE /.test(q)) { book.set(p[0], p[1]); return { rows: [] }; }
    throw new Error('ws_book: тодорхойгүй SQL ' + q);
  }
  return orig.call(this, sql, p);
};

beforeEach(() => { F.reset(); book.clear(); });

test('админ биш (нэвтрээгүй / энгийн хэрэглэгч) → book_get, book_set 401, юу ч бичигдэхгүй', async () => {
  for (const o of [undefined, USER]) {
    assert.strictEqual((await W({ action: 'book_get' }, o)).statusCode, 401);
    assert.strictEqual((await W({ action: 'book_set', slug: 'zadlal-1-9.html', data: { s: 0.5 } }, o)).statusCode, 401);
  }
  assert.strictEqual(book.size, 0);
});

test('book_set: утгыг 0–2 хооронд, 0.01 нарийвчлалтай; хэсэг бүрийн масштаб, null хэвээр; off / nw (зайгүй) / ok (шалгасан)', async () => {
  const r = await W({ action: 'book_set', slug: 'zadlal-1-9.html', data: { s: 0.7, g: [0.5, null, 3, -1, 'x', 0.555], off: 'тийм', nw: 1, ok: true, extra: 'x' } }, ADMIN);
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, data: { s: 0.7, g: [0.5, null, 2, 0, 1, 0.56], off: true, nw: true, ok: true } });
  assert.deepStrictEqual(JSON.parse(book.get('zadlal-1-9.html')), { s: 0.7, g: [0.5, null, 2, 0, 1, 0.56], off: true, nw: true, ok: true });

  const r2 = await W({ action: 'book_set', slug: 'zadlal-1-9.html', data: {} }, ADMIN);
  assert.deepStrictEqual(r2.body.data, { s: 1, g: [], off: false, nw: false, ok: false }, 'хоосон data → анхны утга');
  const r3 = await W({ action: 'book_set', slug: 'x.html', data: { s: 9, g: new Array(60).fill(1) } }, ADMIN);
  assert.strictEqual(r3.body.data.s, 2);
  assert.strictEqual(r3.body.data.g.length, 40, 'хэсэг 40-өөс илүүгүй');
});

test('book_set: slug буруу бол 400 (зам, хэт урт, .html биш)', async () => {
  for (const slug of ['', '../admin.html', 'a/b.html', 'zadlal-1-9', 'x.html<script>', 'a b.html']) {
    const r = await W({ action: 'book_set', slug: slug, data: { s: 1 } }, ADMIN);
    assert.strictEqual(r.statusCode, 400, slug);
  }
  assert.strictEqual(book.size, 0);
});

test('book_get: хадгалсан бүх тохиргоо slug-аар', async () => {
  await W({ action: 'book_set', slug: 'a-9.html', data: { s: 0.6 } }, ADMIN);
  await W({ action: 'book_set', slug: 'b-9.html', data: { s: 1.2, g: [0.4], off: true } }, ADMIN);
  const r = await W({ action: 'book_get' }, ADMIN);
  assert.strictEqual(r.statusCode, 200);
  assert.deepStrictEqual(r.body, { ok: true, book: { 'a-9.html': { s: 0.6, g: [], off: false, nw: false, ok: false }, 'b-9.html': { s: 1.2, g: [0.4], off: true, nw: false, ok: false } } });
  assert.ok(seenSql.some(q => /^CREATE TABLE IF NOT EXISTS ws_book /.test(q)), 'хүснэгтийг шаардлагатай үед үүсгэнэ');
});
