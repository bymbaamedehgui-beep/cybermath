// api/battle.js — Nice Battle-ийн багшийн өрөө / оноо (хуучин Upstash API-тай ижил хариу).
// Ажиллуулах: node --test tests/battle-api.test.js   (бодит DB 0 — доорх санах ойн pool)
'use strict';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');

const API = path.join(__dirname, '..', 'api');

// ── санах ойн pool: зөвхөн battle.js + _guard.rateLimit-ийн SQL ──
const db = { rooms: new Map(), scores: new Map(), rl: new Map(), fail: false, seq: 0 };
const k2 = (g, c) => g + '|' + c;
const pool = {
  async query(text, params) {
    const t = String(text).replace(/\s+/g, ' ').trim();
    const p = params || [];
    if (db.fail) throw new Error('db down');
    if (/^CREATE TABLE IF NOT EXISTS (battle_rooms|battle_scores|rate_limits) /.test(t)) return { rows: [] };
    if (/^INSERT INTO rate_limits /.test(t)) {
      const c = (db.rl.get(p[0]) || 0) + 1; db.rl.set(p[0], c); return { rows: [{ count: c }] };
    }
    if (/^DELETE FROM rate_limits /.test(t)) return { rows: [] };
    if (t === 'SELECT data FROM battle_rooms WHERE game = $1 AND code = $2') {
      const r = db.rooms.get(k2(p[0], p[1]));
      return { rows: r ? [{ data: JSON.parse(JSON.stringify(r.data)) }] : [] };
    }
    if (t === 'INSERT INTO battle_rooms (game, code, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (game, code) DO NOTHING RETURNING code') {
      const k = k2(p[0], p[1]);
      if (db.rooms.has(k)) return { rows: [] };
      db.rooms.set(k, { data: JSON.parse(p[2]) });
      return { rows: [{ code: p[1] }] };
    }
    if (t === 'SELECT 1 FROM battle_rooms WHERE game = $1 AND code = $2') {
      return { rows: db.rooms.has(k2(p[0], p[1])) ? [{ '?column?': 1 }] : [] };
    }
    if (t === 'DELETE FROM battle_scores WHERE game = $1 AND code = $2') {
      Array.from(db.scores.keys()).forEach((k) => { if (k.startsWith(k2(p[0], p[1]) + '|')) db.scores.delete(k); });
      return { rows: [] };
    }
    if (t === 'DELETE FROM battle_rooms WHERE game = $1 AND code = $2') { db.rooms.delete(k2(p[0], p[1])); return { rows: [] }; }
    if (t === 'SELECT rec FROM battle_scores WHERE game = $1 AND code = $2 ORDER BY score DESC, updated_at ASC LIMIT $3') {
      const rows = Array.from(db.scores.entries()).filter(([k]) => k.startsWith(k2(p[0], p[1]) + '|')).map(([, v]) => v)
        .sort((a, b) => b.score - a.score || a.at - b.at).slice(0, p[2]);
      return { rows: rows.map((v) => ({ rec: JSON.parse(JSON.stringify(v.rec)) })) };
    }
    if (t === 'SELECT name, score FROM battle_scores WHERE game = $1 AND code = $2') {
      const rows = Array.from(db.scores.entries()).filter(([k]) => k.startsWith(k2(p[0], p[1]) + '|')).map(([, v]) => ({ name: v.rec.name, score: v.score }));
      return { rows: rows };
    }
    if (t === 'UPDATE battle_rooms SET updated_at = NOW() WHERE game = $1 AND code = $2 RETURNING code') {
      return { rows: db.rooms.has(k2(p[0], p[1])) ? [{ code: p[1] }] : [] };
    }
    if (/^INSERT INTO battle_scores \(game, code, name, score, rec\) VALUES \(\$1, \$2, \$3, \$4, \$5::jsonb\) ON CONFLICT \(game, code, name\) DO UPDATE /.test(t)) {
      db.scores.set(k2(p[0], p[1]) + '|' + p[2], { score: p[3], rec: JSON.parse(p[4]), at: ++db.seq });
      return { rows: [] };
    }
    if (/^DELETE FROM battle_scores s USING battle_rooms r /.test(t) || /^DELETE FROM battle_rooms WHERE updated_at < /.test(t)) return { rows: [] };
    throw new Error('тодорхойгүй SQL: ' + t.slice(0, 140));
  },
};
const dbFile = path.join(API, '_db.js');
require.cache[dbFile] = { id: dbFile, filename: dbFile, loaded: true, exports: pool };

const battle = require(path.join(API, 'battle.js'));

function mkRes() {
  const r = { statusCode: 200, body: undefined, headers: {}, ended: false };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; r.ended = true; return r; };
  r.end = () => { r.ended = true; return r; };
  return r;
}
async function call(method, op, o) {
  o = o || {};
  const req = {
    method: method,
    headers: { 'x-forwarded-for': o.ip || '203.0.113.9' },
    query: Object.assign({ g: o.g || 'nb', op: op }, o.query || {}),
    body: o.body,
  };
  const res = mkRes();
  await battle(req, res);
  return res;
}
const ROOM = { ships: ['A1', 'A2', 'B5'], heads: ['A1'], code: '482913', name: '8А анги', created: 1761370000000, grade: '8', topic: '512', topicName: 'Квадрат тэгшитгэл' };

beforeEach(() => { db.rooms.clear(); db.scores.clear(); db.rl.clear(); db.fail = false; });

test('OPTIONS / CORS / буруу тоглоом ба op → 404', async () => {
  const o = await call('OPTIONS', 'room');
  assert.strictEqual(o.statusCode, 200);
  assert.strictEqual(o.headers['Access-Control-Allow-Origin'], '*');
  assert.match(o.headers['Access-Control-Allow-Methods'], /DELETE/);
  assert.strictEqual((await call('GET', 'room', { g: 'xx', query: { code: '123456' } })).statusCode, 404);
  assert.strictEqual((await call('GET', 'rooms', { query: { code: '123456' } })).statusCode, 404);
  const g = await call('GET', 'score', { query: { code: '123456' } });
  assert.strictEqual(g.headers['Cache-Control'], 'no-store');
});

test('room: үүсгэх → унших (хуучин JSON хэвээр); давхар код 409; код буруу/алга 400; олдохгүй 404', async () => {
  const c = await call('POST', 'room', { body: ROOM });
  assert.strictEqual(c.statusCode, 200);
  assert.deepStrictEqual(c.body, { ok: true });
  const g = await call('GET', 'room', { query: { code: '482913' } });
  assert.strictEqual(g.statusCode, 200);
  assert.deepStrictEqual(g.body, ROOM);

  const dup = await call('POST', 'room', { body: Object.assign({}, ROOM, { name: 'Өөр багш', ships: [] }) });
  assert.strictEqual(dup.statusCode, 409);
  assert.ok(dup.body.error);
  assert.deepStrictEqual((await call('GET', 'room', { query: { code: '482913' } })).body.ships, ROOM.ships, 'өөр багшийн room дарж бичигдэхгүй');

  assert.strictEqual((await call('GET', 'room', { query: { code: '999999' } })).statusCode, 404);
  assert.strictEqual((await call('GET', 'room', { query: {} })).statusCode, 400);
  assert.strictEqual((await call('GET', 'room', { query: { code: 'a b<script>' } })).statusCode, 400);
  assert.strictEqual((await call('POST', 'room', { body: { name: 'x' } })).statusCode, 400);
  assert.strictEqual((await call('POST', 'room', { body: [1, 2] })).statusCode, 400);
  assert.strictEqual((await call('POST', 'room', { body: Object.assign({}, ROOM, { code: '777777', ships: Array(5000).fill('J10') }) })).statusCode, 413);
  assert.strictEqual((await call('PUT', 'room', { query: { code: '482913' } })).statusCode, 405);
});

test('room: нэг IP-ээс 10 минутад 60-аас олон room → 429', async () => {
  for (let i = 0; i < 60; i++) {
    const r = await call('POST', 'room', { body: Object.assign({}, ROOM, { code: String(100000 + i) }) });
    assert.strictEqual(r.statusCode, 200, 'room ' + i);
  }
  const over = await call('POST', 'room', { body: Object.assign({}, ROOM, { code: '200000' }) });
  assert.strictEqual(over.statusCode, 429);
  const other = await call('POST', 'room', { body: Object.assign({}, ROOM, { code: '200001' }), ip: '198.51.100.7' });
  assert.strictEqual(other.statusCode, 200, 'өөр IP хязгаарлагдахгүй');
});

test('score: room-гүй бол 404; оноо хадгалах, rank, нэрээр шинэчлэх, буурах эрэмбэ, acc', async () => {
  const none = await call('POST', 'score', { body: { code: '482913', name: 'Бат', score: 10, shots: 2, correct: 1 } });
  assert.strictEqual(none.statusCode, 404);
  assert.strictEqual(db.scores.size, 0);

  await call('POST', 'room', { body: ROOM });
  const a = await call('POST', 'score', { body: { code: '482913', name: 'Бат', score: 10, shots: 4, correct: 3, time: '10:01:02', ts: 1761370001000 } });
  assert.deepStrictEqual(a.body, { ok: true, rank: 1 });
  const b = await call('POST', 'score', { body: { code: '482913', name: 'Сараа', score: 30, shots: 5, correct: 5, time: '10:02:00', ts: 1761370002000 } });
  assert.deepStrictEqual(b.body, { ok: true, rank: 1 });
  const c = await call('POST', 'score', { body: { code: '482913', name: 'Дорж', score: 20, shots: 0, correct: 0 } });
  assert.deepStrictEqual(c.body, { ok: true, rank: 2 });
  const a2 = await call('POST', 'score', { body: { code: '482913', name: 'Бат', score: 50, shots: 8, correct: 6, time: '10:05:00', ts: 1761370005000 } });
  assert.deepStrictEqual(a2.body, { ok: true, rank: 1 });

  const g = await call('GET', 'score', { query: { code: '482913' } });
  assert.strictEqual(g.statusCode, 200);
  assert.ok(Array.isArray(g.body));
  assert.deepStrictEqual(g.body.map((r) => [r.name, r.score]), [['Бат', 50], ['Сараа', 30], ['Дорж', 20]]);
  assert.deepStrictEqual(g.body[0], { name: 'Бат', score: 50, shots: 8, correct: 6, time: '10:05:00', ts: 1761370005000, acc: 75 });
  assert.strictEqual(g.body[2].acc, 0);

  assert.strictEqual((await call('POST', 'score', { body: { code: '482913' } })).statusCode, 400);
  assert.strictEqual((await call('POST', 'score', { body: { name: 'x' } })).statusCode, 400);
  assert.deepStrictEqual((await call('GET', 'score', { query: { code: '111111' } })).body, []);
});

test('score/room DELETE: оноо цэвэрлэх; room устгахад оноо ч устна', async () => {
  await call('POST', 'room', { body: ROOM });
  await call('POST', 'score', { body: { code: '482913', name: 'Бат', score: 10, shots: 1, correct: 1 } });
  const d = await call('DELETE', 'score', { query: { code: '482913' } });
  assert.deepStrictEqual(d.body, { ok: true });
  assert.deepStrictEqual((await call('GET', 'score', { query: { code: '482913' } })).body, []);
  assert.strictEqual((await call('GET', 'room', { query: { code: '482913' } })).statusCode, 200, 'оноо цэвэрлэхэд room хэвээр');

  await call('POST', 'score', { body: { code: '482913', name: 'Сараа', score: 5, shots: 1, correct: 1 } });
  const dr = await call('DELETE', 'room', { query: { code: '482913' } });
  assert.deepStrictEqual(dr.body, { ok: true });
  assert.strictEqual((await call('GET', 'room', { query: { code: '482913' } })).statusCode, 404);
  assert.strictEqual(db.scores.size, 0);
});

test('score: room-д 200-аас олон тоглогч орохгүй, байгаа нэр шинэчлэгдэнэ', async () => {
  await call('POST', 'room', { body: ROOM });
  for (let i = 0; i < 200; i++) await call('POST', 'score', { body: { code: '482913', name: 'Тоглогч ' + i, score: i, shots: 1, correct: 1 } });
  const full = await call('POST', 'score', { body: { code: '482913', name: 'Шинэ', score: 999, shots: 1, correct: 1 } });
  assert.strictEqual(full.statusCode, 409);
  const upd = await call('POST', 'score', { body: { code: '482913', name: 'Тоглогч 0', score: 500, shots: 1, correct: 1 } });
  assert.deepStrictEqual(upd.body, { ok: true, rank: 1 });
});

test('DB алдаа → 502 BACKEND_ERROR (клиент «Сервер ажиллахгүй» цонх харуулна)', async () => {
  db.fail = true;
  for (const [m, op, o] of [['GET', 'room', { query: { code: '482913' } }], ['POST', 'room', { body: ROOM }], ['GET', 'score', { query: { code: '482913' } }]]) {
    const r = await call(m, op, o);
    assert.strictEqual(r.statusCode, 502, m + ' ' + op);
    assert.strictEqual(r.body.code, 'BACKEND_ERROR');
  }
});
