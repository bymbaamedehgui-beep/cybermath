// Багш нарт зориулсан онлайн уулзалт — api/_meet.js (тохиргоо, бүртгэл, Meet холбоос зөвхөн бүртгүүлсэн хүнд) + хуудасны холболт.
// Ажиллуулах: node --test tests/meet.test.js   (бодит DB 0 — санах ойн pool)
'use strict';
const path = require('path');
const fs = require('fs');
const { test } = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'test-secret-meet';
const API = path.resolve(__dirname, '..', 'api');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// ── санах ойн DB ──
const db = { settings: {}, regs: [], next: 1 };
const pool = {
  async query(sql, p) {
    const q = norm(sql); p = p || [];
    if (/^CREATE TABLE IF NOT EXISTS (ws_settings|ws_meet_regs)/.test(q)) return { rows: [] };
    if (q === "SELECT sval FROM ws_settings WHERE skey='meet'") return { rows: 'meet' in db.settings ? [{ sval: db.settings.meet }] : [] };
    if (q.startsWith("INSERT INTO ws_settings (skey, sval, updated_at) VALUES ('meet'")) { db.settings.meet = p[0]; return { rows: [] }; }
    if (q.startsWith('INSERT INTO ws_meet_regs')) {
      const [meet, rkey, name, phone, email, school, aimag, grades, usage, interests, question] = p;
      let r = db.regs.find((x) => x.meet === meet && x.phone === phone), fresh = !r;
      if (!r) { r = { id: db.next++, meet, rkey, phone, created_at: new Date() }; db.regs.push(r); }
      Object.assign(r, { name, email, school, aimag, grades: JSON.parse(grades), usage, interests: JSON.parse(interests), question, updated_at: new Date() });
      return { rows: [{ id: String(r.id), rkey: r.rkey, fresh }] };
    }
    if (q === 'SELECT name FROM ws_meet_regs WHERE id=$1 AND rkey=$2 AND meet=$3') return { rows: db.regs.filter((x) => x.id === p[0] && x.rkey === p[1] && x.meet === p[2]).map((x) => ({ name: x.name })) };
    if (q === 'SELECT COUNT(*)::int AS n FROM ws_meet_regs WHERE meet=$1') return { rows: [{ n: db.regs.filter((x) => x.meet === p[0]).length }] };
    if (q === 'SELECT * FROM ws_meet_regs WHERE meet=$1 ORDER BY created_at, id') return { rows: db.regs.filter((x) => x.meet === p[0]) };
    throw new Error('тодорхойгүй SQL: ' + q);
  },
};
const stub = (file, exports) => { const id = path.join(API, file); require.cache[id] = { id, filename: id, loaded: true, exports }; };
stub('_db.js', pool);
let limited = false;
stub('_guard.js', { rateLimit: async () => !limited, clientIp: () => '10.0.0.1' });
const MEET = require('../api/_meet.js');
const jwt = require('jsonwebtoken');
const ADMIN = 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET);

// Цагийг тогтооно (2026-11-12 12:00 УБ) — уулзалт 2026-11-13 19:00 УБ
const NOW0 = Date.parse('2026-11-12T12:00:00+08:00');
let now = NOW0;
Date.now = () => now;

function call(req) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b, headers: this.headers }); return this; }, end() { resolve({ code: this.code }); return this; } };
    MEET.handle(Object.assign({ headers: {}, query: {} }, req), res).then((handled) => { if (!handled) resolve(null); }, reject);
  });
}
const get = () => call({ method: 'GET', query: { meet: '1' } });
const post = (body, admin) => call({ method: 'POST', body, headers: admin ? { authorization: ADMIN } : {} });
const REG = { action: 'meet_register', name: 'Б. Сарантуяа', phone: '+976 9911-2233', email: 'Saraa@Example.com', school: '1-р сургууль', aimag: 'Сүхбаатар',
  grades: [10, 9, 'x', 13, 9], usage: 'heard', interests: ['ws', 'ppt', 'bogus'], question: 'Ажлын хуудсыг яаж тохируулах вэ?' };

test('бусад хүсэлтэд хүрэхгүй (worksheets.js үргэлжилнэ)', async () => {
  assert.strictEqual(await call({ method: 'GET', query: { titles: '1' } }), null);
  assert.strictEqual(await post({ action: 'getAnnounce' }), null);
});

test('нийтийн тохиргоо: анхдагч уулзалт, Meet холбоос ил гарахгүй', async () => {
  const r = await get();
  assert.strictEqual(r.code, 200);
  const m = r.body.meet;
  assert.strictEqual(m.key, '2026-11-13');
  assert.strictEqual(m.platform, 'Google Meet');
  assert.strictEqual(m.live, false);
  assert.strictEqual(m.hasLink, false);
  assert.ok(!('link' in m));
  assert.ok(fs.existsSync(path.join(__dirname, '..', m.poster.replace(/^\//, ''))), 'постер файл байх ёстой: ' + m.poster);
  assert.strictEqual(Date.parse(m.end) - Date.parse(m.at), 120 * 60e3);
});

test('бүртгэл: заавал талбар, утас/имэйл шалгах', async () => {
  assert.strictEqual((await post(Object.assign({}, REG, { name: 'Б' }))).code, 400);
  assert.strictEqual((await post(Object.assign({}, REG, { phone: '12345' }))).code, 400);
  assert.strictEqual((await post(Object.assign({}, REG, { email: 'abc@' }))).code, 400);
  limited = true;
  assert.strictEqual((await post(REG)).code, 429);
  limited = false;
  assert.strictEqual(db.regs.length, 0);
});

let first;
test('бүртгэл: хэвийнжүүлж хадгална, холбоос хараахан алга; ижил утсаар дахин бол шинэчилнэ', async () => {
  const r = await post(REG);
  assert.strictEqual(r.code, 200);
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.link, null);
  assert.match(r.body.key, /^[0-9a-f]{24}$/);
  first = r.body;
  const x = db.regs[0];
  assert.deepStrictEqual([x.phone, x.email, x.grades, x.usage, x.interests], ['99112233', 'saraa@example.com', [9, 10], 'heard', ['ws', 'ppt']]);
  const r2 = await post(Object.assign({}, REG, { phone: '99112233', school: '2-р сургууль', usage: 'zzz' }));
  assert.strictEqual(r2.body.id, first.id, 'нэг утас = нэг бүртгэл');
  assert.strictEqual(db.regs.length, 1);
  assert.strictEqual(db.regs[0].school, '2-р сургууль');
  assert.strictEqual(db.regs[0].usage, null);
});

test('meet_me: зөвхөн зөв түлхүүртэй хүнд', async () => {
  assert.strictEqual((await post({ action: 'meet_me', id: first.id, key: 'buruu' })).body.ok, false);
  const r = await post({ action: 'meet_me', id: first.id, key: first.key });
  assert.strictEqual(r.body.ok, true);
  assert.strictEqual(r.body.link, null);
});

test('админ: тохиргоо хадгалах, холбоос зөвхөн бүртгүүлсэн хүнд очно', async () => {
  assert.strictEqual((await post({ action: 'meet_get' })).code, 401);
  assert.strictEqual((await post({ action: 'meet_set', title: 'x', at: '2026-11-13T19:00:00+08:00' })).code, 401);
  assert.strictEqual((await post({ action: 'meet_regs' })).code, 401);
  const base = { action: 'meet_set', title: 'CyberMath танилцуулга', at: '2026-11-13T19:00:00+08:00', mins: 90, active: true };
  assert.strictEqual((await post(Object.assign({}, base, { link: 'http://meet.google.com/abc' }), true)).code, 400, 'https биш');
  assert.strictEqual((await post(Object.assign({}, base, { link: 'javascript:alert(1)' }), true)).code, 400);
  assert.strictEqual((await post(Object.assign({}, base, { at: '2026-11-13T19:00' }), true)).code, 400, 'цагийн бүсгүй огноо');
  const s = await post(Object.assign({}, base, { link: 'https://meet.google.com/abc-defg-hij' }), true);
  assert.strictEqual(s.body.ok, true);
  assert.strictEqual(s.body.cfg.poster, MEET.DEFAULT.poster, 'постер хэвээр');
  const g = await get();
  assert.strictEqual(g.body.meet.hasLink, true);
  assert.ok(!('link' in g.body.meet));
  assert.strictEqual((await post({ action: 'meet_me', id: first.id, key: first.key })).body.link, 'https://meet.google.com/abc-defg-hij');
  const reg2 = await post(Object.assign({}, REG, { phone: '88001122', email: '' }));
  assert.strictEqual(reg2.body.link, 'https://meet.google.com/abc-defg-hij');
  const list = await post({ action: 'meet_regs' }, true);
  assert.strictEqual(list.body.regs.length, 2);
  assert.strictEqual(list.body.usage.heard, 'Сонссон, ашиглаж үзээгүй');
  const info = await post({ action: 'meet_get' }, true);
  assert.deepStrictEqual([info.body.count, info.body.open, info.body.cfg.link], [2, true, 'https://meet.google.com/abc-defg-hij']);
});

test('эхэлмэгц «live», дуусмагц нуугдаж бүртгэл хаагдана; идэвхгүй болговол нуугдана', async () => {
  now = Date.parse('2026-11-13T19:05:00+08:00');
  assert.strictEqual((await get()).body.meet.live, true);
  now = Date.parse('2026-11-13T20:31:00+08:00');                // 90 минутын дараа
  assert.strictEqual((await get()).body.meet, null);
  assert.strictEqual((await post(Object.assign({}, REG, { phone: '99000000' }))).code, 400);
  now = NOW0;
  await post({ action: 'meet_set', title: 'x', at: '2026-11-13T19:00:00+08:00', active: false }, true);
  assert.strictEqual((await get()).body.meet, null);
});

test('холболт: worksheets.js, vercel.json, Дасгалын төвийн баннер, бүртгэлийн хуудас, админ', () => {
  const w = R('api/worksheets.js').replace(/\r\n/g, '\n');
  assert.ok(w.indexOf('MEET.handle(req, res)') > 0 && w.indexOf('MEET.handle(req, res)') < w.indexOf('MEDIA.handle(req, res)'), 'DDL-ээс өмнө');
  const v = JSON.parse(R('vercel.json'));
  assert.ok(v.routes.some((r) => r.src === '/meet' && r.dest === '/meet.html'));
  const ws = R('worksheets.html');
  assert.match(ws, /<div id="meetBanner"><\/div>\s*<div id="eventBanner"><\/div>/);
  assert.match(ws, /fetch\('\/api\/worksheets\?meet=1'\)/);
  assert.match(ws, /cm_meet_pop_/, 'постер цонх өдөрт нэг удаа');
  const mh = R('meet.html');
  ['fName', 'fPhone', 'fEmail', 'fSchool', 'fAimag', 'fGrades', 'fUsage', 'fInterests', 'fQ'].forEach((id) => assert.match(mh, new RegExp('id="' + id + '"'), id));
  Object.keys(MEET.USAGE).concat(Object.keys(MEET.INTERESTS)).forEach((k) => assert.match(mh, new RegExp('data-v="' + k + '"'), k));
  assert.match(mh, /action: 'meet_register'/);
  assert.match(mh, /action: 'meet_me'/);
  const adm = R('admin.html');
  ['meet_get', 'meet_set', 'meet_regs'].forEach((a) => assert.match(adm, new RegExp("wsPostW\\('" + a + "'")));
  [mh, ws.slice(ws.indexOf('Багш нарт зориулсан онлайн уулзалт'), ws.indexOf('<script src="/ppt-cart.js">')), R('api/_meet.js').split('async function handle')[0]]
    .forEach((s) => assert.doesNotMatch(s.replace(/📝|👤|📞|📧|🏫|📚/g, ''), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'UI-д эможи бүү'));
});
