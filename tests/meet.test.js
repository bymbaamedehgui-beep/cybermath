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
    if (q === "SELECT sval FROM ws_settings WHERE skey='meet_room'") return { rows: 'meet_room' in db.settings ? [{ sval: db.settings.meet_room }] : [] };
    if (q.startsWith("INSERT INTO ws_settings (skey, sval, updated_at) VALUES ('meet_room'")) { db.settings.meet_room = p[0]; return { rows: [] }; }
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
    if (q === 'DELETE FROM ws_meet_regs WHERE id=$1 RETURNING id') {
      const i = db.regs.findIndex((x) => x.id === p[0]);
      return { rows: i < 0 ? [] : db.regs.splice(i, 1).map((x) => ({ id: String(x.id) })) };
    }
    throw new Error('тодорхойгүй SQL: ' + q);
  },
};
// ── Daily REST API (санах ойд): өрөө үүсгэх/шинэчлэх, уулзалтын токен ──
const fcalls = [], drooms = {};
global.fetch = async (url, opt) => {
  opt = opt || {};
  const body = opt.body ? JSON.parse(opt.body) : null;
  fcalls.push({ url, method: opt.method, headers: opt.headers || {}, body });
  const res = (status, j) => ({ ok: status < 400, status, json: async () => j });
  let m;
  if ((m = /\/v1\/rooms\/([\w-]+)$/.exec(url))) { const r = drooms[m[1]]; if (!r) return res(404, { error: 'not-found' }); Object.assign(r.config, body.properties); return res(200, r); }
  if (/\/v1\/rooms$/.test(url)) { const r = { name: body.name, privacy: body.privacy, url: 'https://cm.daily.co/' + body.name, config: body.properties }; drooms[body.name] = r; return res(200, r); }
  if (/\/v1\/meeting-tokens$/.test(url)) return res(200, { token: 'tok.' + body.properties.room_name + '.' + (body.properties.is_owner ? 'owner' : 'guest') });
  return res(500, { error: 'unexpected ' + url });
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
  assert.strictEqual(m.count, 0, 'бүртгүүлсэн хүний тоо');
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
  assert.ok(!('poster' in JSON.parse(db.settings.meet)), 'постер DB-д хадгалагдахгүй (кодын статик файл)');
  const g = await get();
  assert.strictEqual(g.body.meet.poster, MEET.DEFAULT.poster);
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

test('админ: бүртгэлээс хүн устгах — тэр хүнд холбоос очихоо болино, бусад нь хэвээр, дахин бүртгүүлж болно', async () => {
  assert.strictEqual((await post({ action: 'meet_regs' }, true)).body.regs.length, 2);
  assert.strictEqual((await post({ action: 'meet_del', id: first.id })).code, 401, 'зөвхөн админ');
  assert.strictEqual(db.regs.length, 2);
  const d = await post({ action: 'meet_del', id: first.id }, true);
  assert.deepStrictEqual([d.code, d.body.ok, d.body.id], [200, true, first.id]);
  assert.deepStrictEqual((await post({ action: 'meet_regs' }, true)).body.regs.map((x) => x.phone), ['88001122']);
  assert.deepStrictEqual((await post({ action: 'meet_me', id: first.id, key: first.key })).body, { ok: false }, 'устгагдсан хүнд холбоос алга');
  assert.strictEqual((await post({ action: 'meet_del', id: first.id }, true)).code, 404);
  assert.strictEqual((await post({ action: 'meet_del', id: 'abc' }, true)).code, 404);
  const again = await post(REG);
  assert.strictEqual(again.body.ok, true);
  assert.notStrictEqual(again.body.id, first.id);
  assert.strictEqual(db.regs.length, 2);
});

test('CyberMath дотор уулзалт (Daily): түлхүүргүй бол идэвхгүй; зөвхөн бүртгүүлсэн хүнд 30 минутын өмнөөс токен; өрөө private', async () => {
  const reg = db.regs.find((x) => x.phone === '99112233');
  const me = { action: 'meet_join', id: reg.id, key: reg.rkey };
  delete process.env.DAILY_API_KEY;
  assert.strictEqual((await post(me)).code, 400, 'inapp асаагаагүй');
  await post({ action: 'meet_set', title: 'x', at: '2026-11-13T19:00:00+08:00', mins: 90, link: 'https://meet.google.com/abc-defg-hij', active: true, inapp: true }, true);
  assert.strictEqual(JSON.parse(db.settings.meet).inapp, true);
  assert.deepStrictEqual([(await get()).body.meet.inapp, (await get()).body.meet.platform], [false, 'Google Meet'], 'түлхүүргүй бол Google Meet хэвээр');
  assert.strictEqual((await post(me)).code, 400);
  assert.strictEqual((await post({ action: 'meet_get' }, true)).body.daily, false);
  assert.strictEqual((await post({ action: 'meet_host' }, true)).code, 503);
  assert.strictEqual(fcalls.length, 0, 'түлхүүргүй үед Daily-г дуудахгүй');

  process.env.DAILY_API_KEY = 'test-daily-key';
  const g = await get();
  assert.deepStrictEqual([g.body.meet.inapp, g.body.meet.platform], [true, 'CyberMath']);
  assert.strictEqual((await post({ action: 'meet_get' }, true)).body.daily, true);
  assert.match((await post(me)).body.error, /30 минутын өмнө/, 'өмнөх өдөр нэгдэхгүй');
  now = Date.parse('2026-11-13T18:31:00+08:00');
  assert.strictEqual((await post({ action: 'meet_join', id: reg.id, key: 'buruu' })).code, 403, 'буруу түлхүүр');
  const j = await post(me);
  assert.deepStrictEqual([j.code, j.body.ok, j.body.url, j.body.token], [200, true, 'https://cm.daily.co/cm-meet-2026-11-13', 'tok.cm-meet-2026-11-13.guest']);
  const create = fcalls.find((x) => /\/v1\/rooms$/.test(x.url));
  assert.deepStrictEqual([create.method, create.body.name, create.body.privacy], ['POST', 'cm-meet-2026-11-13', 'private']);
  assert.strictEqual(create.body.properties.exp, Date.parse('2026-11-13T20:30:00+08:00') / 1000 + 3600, 'уулзалт дуусгаад 1 цагийн дараа хаагдана');
  ['enable_chat', 'enable_advanced_chat', 'enable_screenshare', 'enable_emoji_reactions', 'enable_hand_raising', 'enable_breakout_rooms', 'enable_people_ui',
    'enable_pip_ui', 'enable_network_ui', 'enable_noise_cancellation_ui', 'enable_video_processing_ui', 'enable_prejoin_ui']
    .forEach((k) => assert.strictEqual(create.body.properties[k], true, 'Meet/Zoom шиг боломж: ' + k));
  const tok = fcalls.filter((x) => /meeting-tokens$/.test(x.url)).pop();
  assert.deepStrictEqual([tok.body.properties.room_name, tok.body.properties.user_name, tok.body.properties.is_owner, tok.body.properties.enable_screenshare,
    tok.body.properties.start_audio_off], ['cm-meet-2026-11-13', reg.name, false, true, true], 'токен бүртгэлийн нэртэй, хөтлөгч биш, дэлгэц хуваалцаж болно, дуу унтраалттай орно');
  assert.strictEqual(tok.headers.Authorization, 'Bearer test-daily-key');
  const rooms = () => fcalls.filter((x) => /\/v1\/rooms/.test(x.url)).length, n = rooms();
  assert.strictEqual((await post(me)).body.ok, true);
  assert.strictEqual(rooms(), n, 'дахин нэгдэхэд өрөөний API-г дуудахгүй (DB-д хадгалсан)');
  assert.strictEqual((await post({ action: 'meet_host' })).code, 401, 'хөтлөгч — зөвхөн админ');
  const h = await post({ action: 'meet_host' }, true);
  assert.deepStrictEqual([h.body.ok, h.body.token], [true, 'tok.cm-meet-2026-11-13.owner']);
  const ht = fcalls.filter((x) => /meeting-tokens$/.test(x.url)).pop().body.properties;
  assert.deepStrictEqual([ht.is_owner, ht.enable_recording, ht.start_audio_off], [true, 'local', false], 'хөтлөгч: эзэн, бичлэг хийж болно, дуутай орно');
  assert.ok(!('enable_recording' in tok.body.properties), 'оролцогч бичлэг хийхгүй');
  assert.strictEqual(rooms(), n + 1, 'хөтлөгч өрөөний тохиргоог шинэчилнэ');
  now = Date.parse('2026-11-13T20:31:00+08:00');
  assert.strictEqual((await post(me)).code, 400, 'дууссаны дараа нэгдэхгүй');
  now = NOW0;
  delete process.env.DAILY_API_KEY;
});

test('туршилтын өрөө (meet_test): зөвхөн админ, тусдаа private өрөө 2 цаг, хөтлөгч/оролцогчийн токен, үндсэн уулзалтад хүрэхгүй', async () => {
  assert.strictEqual((await post({ action: 'meet_test' })).code, 401);
  delete process.env.DAILY_API_KEY;
  assert.strictEqual((await post({ action: 'meet_test' }, true)).code, 503);
  process.env.DAILY_API_KEY = 'test-daily-key';
  const before = [db.settings.meet, db.settings.meet_room, db.regs.length], n0 = fcalls.length;
  const r = await post({ action: 'meet_test' }, true);
  assert.strictEqual(r.body.ok, true);
  const calls = fcalls.slice(n0), room = calls.find((x) => /\/v1\/rooms$/.test(x.url));
  assert.match(room.body.name, /^cm-test-[0-9a-f]{10}$/);
  assert.strictEqual(room.body.privacy, 'private');
  assert.strictEqual(room.body.properties.exp, Math.floor(now / 1000) + 7200, '2 цаг');
  assert.strictEqual(room.body.properties.enable_hand_raising, true, 'үндсэн өрөөтэй ижил боломжууд');
  assert.deepStrictEqual([r.body.url, r.body.exp], ['https://cm.daily.co/' + room.body.name, Math.floor(now / 1000) + 7200]);
  const toks = calls.filter((x) => /meeting-tokens$/.test(x.url)).map((x) => x.body.properties);
  assert.deepStrictEqual(toks.map((p) => [p.room_name, p.is_owner, p.enable_recording || null]), [[room.body.name, true, 'local'], [room.body.name, false, null]]);
  assert.deepStrictEqual([r.body.host, r.body.guest], ['tok.' + room.body.name + '.owner', 'tok.' + room.body.name + '.guest']);
  assert.deepStrictEqual([db.settings.meet, db.settings.meet_room, db.regs.length], before, 'үндсэн уулзалт, өрөө, бүртгэл хэвээр');
  delete process.env.DAILY_API_KEY;
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
  ['meet_get', 'meet_set', 'meet_regs', 'meet_del', 'meet_test'].forEach((a) => assert.match(adm, new RegExp("wsPostW\\('" + a + "'")));
  assert.match(adm, /'\/meet#room='\+enc\(\{u:d\.url,t:d\.host,e:d\.exp,o:1\}\)/, 'туршилтын хөтлөгчийн холбоос');
  assert.match(mh, /\/\^#room=\(\[A-Za-z0-9_-\]\+\)\$\//, 'туршилтын өрөөний холбоосыг уншина');
  assert.match(mh, /daily\\\.co\\\//, 'зөвхөн daily.co өрөөний URL-д нэгдэнэ');
  assert.match(adm, /id="meet-inapp" type="checkbox"/);
  assert.match(adm, /inapp:document\.getElementById\('meet-inapp'\)\.checked/);
  assert.match(adm, /window\.open\('\/meet\?host=1'/, 'хөтлөгч — /meet?host=1 (CyberMath загвартай өрөө)');
  assert.match(mh, /action: 'meet_join'/);
  assert.match(mh, /action: 'meet_host'/);
  assert.match(mh, /Authorization: 'Bearer ' \+ ADM/, 'хөтлөгчийн хүсэлт админы токентой');
  assert.match(mh, /daily-js@0\.94\.0\/dist\/daily\.js/, 'daily-js тогтмол хувилбар');
  assert.match(mh, /DAILY_SRI = 'sha384-[A-Za-z0-9+/]{64}'/);
  assert.match(mh, /s\.integrity = DAILY_SRI; s\.crossOrigin = 'anonymous'/, 'SRI шалгалттай ачаална');
  assert.match(mh, /createFrame\(\$\('cStage'\), \{[^}]*theme: THEME/, 'CyberMath өнгөтэй');
  assert.match(mh, /f\.allow = 'camera; microphone;[^']*display-capture/, 'нөөц iframe: камер, микрофон, дэлгэц хуваалцах');
  assert.match(mh, /'t=' \+ encodeURIComponent\(token\)/, 'нөөц iframe: токенийг өрөөний URL-д');
  assert.match(mh, /id="roomCard"/); assert.match(mh, /id="cLeave"/);
  ['setLocalAudio(!call.localAudio())', 'setLocalVideo(!call.localVideo())', 'call.startScreenShare()', 'call.stopScreenShare()', "'local-screen-share-started'"]
    .forEach((s) => assert.ok(mh.indexOf(s) > 0, 'микрофон, камер, дэлгэц хуваалцах товч: ' + s));
  assert.match(adm, /onclick="meetDel\('\+\(\+x\.id\)\+'\)"/, 'мөр бүрт устгах товч');
  assert.match(adm, /window\.meetDel=async function\(id\)\{[\s\S]{0,200}if\(!confirm\(/, 'устгахаас өмнө асууна');
  assert.match(mh, /d\.ok === false && !d\.error/, 'устгагдсан бол хуудас маягтаа дахин харуулна');
  [mh, ws.slice(ws.indexOf('Багш нарт зориулсан онлайн уулзалт'), ws.indexOf('<script src="/ppt-cart.js">')), R('api/_meet.js').split('async function handle')[0]]
    .forEach((s) => assert.doesNotMatch(s.replace(/📝|👤|📞|📧|🏫|📚/g, ''), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'UI-д эможи бүү'));
});
