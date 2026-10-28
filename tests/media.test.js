// Дасгалын төвийн «Видео» / «Интерактив» цэс: api/_media.js (api/worksheets.js-ээр дамжина).
// Ажиллуулах: node --test tests/media.test.js   (бодит DB / Vercel Blob 0 — санах ойн pool, Blob stub)
'use strict';
const path = require('path');
const Module = require('module');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const API = path.resolve(__dirname, '..', 'api');
process.env.JWT_SECRET = 'test-secret-media';
process.env.DATABASE_URL = 'postgres://fake:fake@127.0.0.1:1/none';

// ── санах ойн DB: зөвхөн _media.js-ийн асуултууд (бусад нь бүртгэгдэнэ) ──
const db = { videos: [], ints: [], nextId: 1, log: [], other: [] };
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const vrow = (v) => ({ id: v.id, slug: v.slug, title: v.title, url: v.url, pos: v.pos });
const pool = {
  async query(sql, p) {
    const q = norm(sql); p = p || []; db.log.push(q);
    if (/^CREATE (TABLE|INDEX) IF NOT EXISTS (ws_videos|ws_interactive|idx_ws_videos_slug)/.test(q)) return { rows: [], rowCount: 0 };
    if (q === 'SELECT id, slug, title, url, pos FROM ws_videos ORDER BY slug, pos, id') return { rows: db.videos.slice().sort((a, b) => a.slug.localeCompare(b.slug) || a.pos - b.pos || a.id - b.id).map(vrow) };
    if (q === 'SELECT id, slug, title, url, pos FROM ws_videos WHERE slug=$1 ORDER BY pos, id') return { rows: db.videos.filter((v) => v.slug === p[0]).sort((a, b) => a.pos - b.pos || a.id - b.id).map(vrow) };
    if (q.startsWith('INSERT INTO ws_videos')) { const v = { id: db.nextId++, slug: p[0], title: p[1], url: p[2], pos: p[3] }; db.videos.push(v); return { rows: [vrow(v)] }; }
    if (q.startsWith('UPDATE ws_videos SET')) { const v = db.videos.find((x) => x.id === p[0]); if (!v) return { rows: [] }; Object.assign(v, { slug: p[1], title: p[2], url: p[3], pos: p[4] }); return { rows: [vrow(v)] }; }
    if (q === 'DELETE FROM ws_videos WHERE id=$1 RETURNING url') { const i = db.videos.findIndex((x) => x.id === p[0]); if (i < 0) return { rows: [] }; const v = db.videos.splice(i, 1)[0]; return { rows: [{ url: v.url }] }; }
    if (q === 'SELECT 1 FROM ws_videos WHERE url=$1 LIMIT 1') return { rows: db.videos.filter((v) => v.url === p[0]).map(() => ({ '?column?': 1 })) };
    if (q === 'SELECT id, title, descr, grade, slug, pos, updated_at FROM ws_interactive ORDER BY pos, id') return { rows: db.ints.slice().sort((a, b) => a.pos - b.pos || a.id - b.id).map((x) => ({ id: x.id, title: x.title, descr: x.descr, grade: x.grade, slug: x.slug, pos: x.pos, updated_at: x.updated_at })) };
    if (q === 'SELECT html FROM ws_interactive WHERE id=$1') return { rows: db.ints.filter((x) => x.id === p[0]).map((x) => ({ html: x.html })) };
    if (q.startsWith('INSERT INTO ws_interactive')) { const x = { id: db.nextId++, title: p[0], descr: p[1], grade: p[2], slug: p[3], html: p[4], pos: p[5], updated_at: new Date() }; db.ints.push(x); return { rows: [{ id: x.id }] }; }
    if (q.startsWith('UPDATE ws_interactive SET')) { const x = db.ints.find((y) => y.id === p[0]); if (!x) return { rows: [] }; Object.assign(x, { title: p[1], descr: p[2], grade: p[3], slug: p[4], html: p[5], pos: p[6], updated_at: new Date() }); return { rows: [{ id: x.id }] }; }
    if (q === 'DELETE FROM ws_interactive WHERE id=$1') { const n = db.ints.length; db.ints = db.ints.filter((x) => x.id !== p[0]); return { rows: [], rowCount: n - db.ints.length }; }
    db.other.push(q);
    throw new Error('fake db: unexpected query ' + q.slice(0, 80));
  },
  connect() { throw new Error('fake db: connect'); },
};
require.cache[path.join(API, '_db.js')] = { id: path.join(API, '_db.js'), filename: path.join(API, '_db.js'), loaded: true, exports: pool };

// ── Vercel Blob stub ──
const blob = { tokens: [], dels: [] };
const blobClient = { generateClientTokenFromReadWriteToken: async (o) => { blob.tokens.push(o); return 'vercel_blob_client_fake_' + blob.tokens.length; } };
const blobMain = { del: async (u) => { blob.dels.push(u); } };
const origLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === '@vercel/blob/client') return blobClient;
  if (req === '@vercel/blob') return blobMain;
  return origLoad.apply(this, arguments);
};

const MEDIA = require(path.join(API, '_media.js'));
const jwt = require(require.resolve('jsonwebtoken', { paths: [API] }));
const ADMIN = { authorization: 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET) };
const USER = { authorization: 'Bearer ' + jwt.sign({ email: 'a@b.mn', ws: true }, process.env.JWT_SECRET) };

function mkRes() {
  const r = { statusCode: 200, headers: {}, body: undefined, ended: false };
  r.status = (c) => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.json = (o) => { r.body = o; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}
async function call(handler, method, query, body, headers) {
  const res = mkRes();
  const handled = await handler({ method, query: query || {}, body: body || {}, headers: headers || {} }, res);
  return { res, handled };
}
const GET = (q) => call(MEDIA.handle, 'GET', q);
const POST = (body, h) => call(MEDIA.handle, 'POST', {}, body, h === undefined ? ADMIN : h);

beforeEach(() => { db.videos = []; db.ints = []; db.nextId = 1; db.log = []; db.other = []; blob.tokens = []; blob.dels = []; delete process.env.BLOB_READ_WRITE_TOKEN; });

test('videoUrl: зөвхөн https YouTube / Vimeo / Drive / Blob / .mp4', () => {
  const ok = ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30', 'https://m.youtube.com/shorts/abcdefgh',
    'https://vimeo.com/123456', 'https://drive.google.com/file/d/abc/view', 'https://x1.public.blob.vercel-storage.com/ws-video/a-xyz.mp4', 'https://cdn.example.com/v.mp4'];
  const bad = ['http://youtu.be/x', 'https://evil.com/page', 'javascript:alert(1)', 'https://youtube.com.evil.com/x', 'https://a.b/x y.mp4', '', 'ftp://x/v.mp4', 'https://x.blob.vercel-storage.com.evil.io/a'];
  ok.forEach((u) => assert.ok(MEDIA.videoUrl(u), 'OK ' + u));
  bad.forEach((u) => assert.strictEqual(MEDIA.videoUrl(u), null, 'NO ' + u));
});

test('GET ?media=1 — хоосон жагсаалт, CDN кэштэй; ?t= бол кэшгүй; бусад GET-д хамаарахгүй', async () => {
  let { res, handled } = await GET({ media: '1' });
  assert.ok(handled); assert.deepStrictEqual(res.body, { ok: true, videos: [], ints: [] });
  assert.match(res.headers['cache-control'], /s-maxage=60/);
  ({ res } = await GET({ media: '1', t: '123' }));
  assert.strictEqual(res.headers['cache-control'], 'no-store');
  ({ handled } = await GET({ titles: '1' }));
  assert.strictEqual(handled, false);
  ({ handled } = await call(MEDIA.handle, 'POST', {}, { action: 'book_get' }, ADMIN));
  assert.strictEqual(handled, false);
});

test('vid_save: админ биш → 401; буруу холбоос/хуудас → 400; зөв бол хадгалж ?media_slug-д гарна', async () => {
  let { res } = await POST({ action: 'vid_save', slug: 'trig-sin.html', url: 'https://youtu.be/dQw4w9WgXcQ' }, USER);
  assert.strictEqual(res.statusCode, 401);
  ({ res } = await POST({ action: 'vid_save', slug: 'trig-sin.html', url: 'https://evil.com/x' }));
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'vid_save', slug: '../etc/passwd', url: 'https://youtu.be/dQw4w9WgXcQ' }));
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'vid_save', slug: 'Trig-Sin.html', title: '  Жишээ 1  ', url: 'https://youtu.be/dQw4w9WgXcQ', pos: 2 }));
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.video, { id: 1, slug: 'trig-sin.html', title: 'Жишээ 1', url: 'https://youtu.be/dQw4w9WgXcQ', pos: 2 });
  await POST({ action: 'vid_save', slug: 'trig-sin.html', url: 'https://vimeo.com/123456', pos: 0 });
  await POST({ action: 'vid_save', slug: 'trig-cos.html', url: 'https://cdn.example.com/a.mp4' });
  ({ res } = await GET({ media_slug: 'trig-sin.html' }));
  assert.deepStrictEqual(res.body.videos.map((v) => v.id), [2, 1]);          // pos-оор
  ({ res } = await GET({ media: '1' }));
  assert.strictEqual(res.body.videos.length, 3);
  // засах
  ({ res } = await POST({ action: 'vid_save', id: 1, slug: 'trig-sin.html', title: 'Шинэ', url: 'https://youtu.be/dQw4w9WgXcQ', pos: 0 }));
  assert.strictEqual(res.body.video.title, 'Шинэ');
  ({ res } = await POST({ action: 'vid_save', id: 99, slug: 'trig-sin.html', url: 'https://youtu.be/dQw4w9WgXcQ' }));
  assert.strictEqual(res.statusCode, 404);
});

test('vid_del: Blob файлыг өөр мөр заагаагүй үед л устгана', async () => {
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_fake';
  const u = 'https://abc.public.blob.vercel-storage.com/ws-video/x-123.mp4';
  await POST({ action: 'vid_save', slug: 'a.html', url: u });
  await POST({ action: 'vid_save', slug: 'b.html', url: u });
  await POST({ action: 'vid_save', slug: 'c.html', url: 'https://youtu.be/dQw4w9WgXcQ' });
  let { res } = await POST({ action: 'vid_del', id: 1 });
  assert.deepStrictEqual(res.body, { ok: true, deleted: 1 }); assert.deepStrictEqual(blob.dels, []);   // b.html ижил файлыг заасаар
  await POST({ action: 'vid_del', id: 2 });
  assert.deepStrictEqual(blob.dels, [u]);
  await POST({ action: 'vid_del', id: 3 });
  assert.deepStrictEqual(blob.dels, [u]);                                                            // YouTube — Blob биш
  ({ res } = await POST({ action: 'vid_del', id: 3 }, USER));
  assert.strictEqual(res.statusCode, 401);
});

test('vid_token: Blob тохиргоогүй → 503; төрөл/хэмжээ шалгана; client token-ийн хязгаар', async () => {
  let { res } = await POST({ action: 'vid_token', name: 'a.mp4', type: 'video/mp4', size: 1000 });
  assert.strictEqual(res.statusCode, 503);
  process.env.BLOB_READ_WRITE_TOKEN = 'vercel_blob_rw_fake';
  ({ res } = await POST({ action: 'vid_token', name: 'a.exe', type: 'application/x-msdownload', size: 1000 }));
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'vid_token', name: 'a.mp4', type: 'video/mp4', size: 2 * 1024 * 1024 * 1024 }));
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'vid_token', name: 'Жишээ 1 (Бутархай).MOV', type: 'video/quicktime', size: 5e6 }));
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.pathname, 'ws-video/1.mov');
  const o = blob.tokens[0];
  assert.strictEqual(o.token, 'vercel_blob_rw_fake'); assert.strictEqual(o.pathname, 'ws-video/1.mov'); assert.strictEqual(o.addRandomSuffix, true);
  assert.deepStrictEqual(o.allowedContentTypes, ['video/mp4', 'video/webm', 'video/quicktime']);
  assert.ok(o.maximumSizeInBytes >= 1e9 && o.validUntil > Date.now());
  ({ res } = await POST({ action: 'vid_token', name: 'lesson.mp4', type: 'video/mp4', size: 1 }, USER));
  assert.strictEqual(res.statusCode, 401);
});

test('int_save / int_html / int_del: админы HTML', async () => {
  let { res } = await POST({ action: 'int_save', title: '', html: '<p>x</p>' });
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'int_save', title: 'Медиан', html: '   ' }));
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'int_save', title: 'Медиан', html: 'x'.repeat(600 * 1024 + 1) }));
  assert.strictEqual(res.statusCode, 400);
  ({ res } = await POST({ action: 'int_save', title: 'Медиан', descr: 'тайлбар', grade: '8', slug: 'bad slug!', html: '<!doctype html><p>1</p>' }, USER));
  assert.strictEqual(res.statusCode, 401);
  ({ res } = await POST({ action: 'int_save', title: 'Медиан', descr: 'тайлбар', grade: '8', slug: 'bad slug!', html: '<!doctype html><p>1</p>' }));
  assert.deepStrictEqual(res.body, { ok: true, id: 1 });
  assert.strictEqual(db.ints[0].slug, null);
  ({ res } = await GET({ media: '1' }));
  assert.deepStrictEqual(res.body.ints.map((x) => [x.id, x.title, x.grade]), [[1, 'Медиан', '8']]);
  assert.ok(!('html' in res.body.ints[0]));
  ({ res } = await GET({ int_html: '1' }));
  assert.deepStrictEqual(res.body, { ok: true, html: '<!doctype html><p>1</p>' });
  await POST({ action: 'int_save', id: 1, title: 'Медиан 2', html: '<p>2</p>' });
  ({ res } = await GET({ int_html: '1' }));
  assert.strictEqual(res.body.html, '<p>2</p>');
  ({ res } = await POST({ action: 'int_del', id: 1 }));
  assert.deepStrictEqual(res.body, { ok: true, deleted: 1 });
  ({ res } = await GET({ int_html: '1' }));
  assert.deepStrictEqual(res.body, { ok: false, html: '' });
});

test('api/worksheets.js: ?media=1 нь бусад хүснэгтийн DDL-ээс өмнө хариулна', async () => {
  const ws = require(path.join(API, 'worksheets.js'));
  const res = mkRes();
  await ws({ method: 'GET', query: { media: '1' }, body: {}, headers: {} }, res);
  assert.deepStrictEqual(res.body, { ok: true, videos: [], ints: [] });
  assert.deepStrictEqual(db.other, []);
  assert.ok(!db.log.some((q) => /ws_sets/.test(q)));
});
