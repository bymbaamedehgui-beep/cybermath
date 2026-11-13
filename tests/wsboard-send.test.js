// «Самбарт илгээх» — api/_wsboard.js (код үүсгэх эрх, цэвэрлэгээ, токен зөвхөн тэр хуудсанд, холбогдсон самбарт шууд илгээх)
// + самбар тал зөвхөн харах (ws-store.js) холболт. Ажиллуулах: node --test tests/wsboard-send.test.js   (бодит DB 0 — санах ойн pool)
'use strict';
const path = require('path');
const fs = require('fs');
const { test } = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = 'test-secret-wsboard';
const API = path.resolve(__dirname, '..', 'api');
const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const jwt = require('jsonwebtoken');

const db = { codes: [], access: { 'all@x.mn': true, 'b@x.mn': true }, grades: { 'g10@x.mn': ['10-р анги'] }, limited: false, tick: 0, clock: Date.now(), keys: [] };
const live = (c) => c.expires_at > new Date();
const pool = { async query(sql, p) {
  const q = norm(sql); p = p || [];
  if (q.startsWith('CREATE TABLE IF NOT EXISTS ws_board_codes')) return { rows: [] };
  if (q.startsWith('ALTER TABLE ws_board_codes ADD COLUMN IF NOT EXISTS view TEXT')) return { rows: [] };
  if (q === 'SELECT 1 FROM ws_access WHERE email=$1 AND expires_at > NOW()') return { rows: db.access[p[0]] ? [{ '?column?': 1 }] : [] };
  if (q === 'DELETE FROM ws_board_codes WHERE expires_at < NOW()') { db.codes = db.codes.filter(live); return { rows: [] }; }
  if (q.startsWith('INSERT INTO ws_board_codes')) {
    if (db.codes.some((c) => c.code === p[0])) return { rows: [] };
    const row = { code: p[0], slug: p[1], email: p[2], title: p[3], html: p[4], answers: p[5], created_at: new Date(db.clock += 1000), us: 1 + (db.tick++ % 998), expires_at: new Date(Date.now() + 12 * 3600e3),
      rev: 0, hrev: 0, brev: 0, view: null, bd: null, seen_at: null };
    db.codes.push(row); return { rows: [{ code: row.code, expires_at: row.expires_at }] };
  }
  if (q === 'SELECT code, slug, email, title, html, answers, created_at, expires_at, NOW() AS now FROM ws_board_codes WHERE code=$1 AND expires_at > NOW()') return { rows: db.codes.filter((c) => c.code === p[0] && live(c)).map((c) => Object.assign({}, c, { now: new Date(db.clock + 1) })) };
  const mine = (e) => db.codes.filter((c) => c.email === e && live(c)).sort((a, b) => b.created_at - a.created_at || b.us - a.us);
  const pick = (c) => ({ code: c.code, slug: c.slug, title: c.title, created_at: c.created_at });
  // Postgres: created_at микросекундтэй (us), pg драйвер JS Date-д миллисекунд хүртэл тайрна — бодит харьцуулалтыг дуурайна
  if (q === 'SELECT code, slug, title, created_at FROM ws_board_codes WHERE email=$1 AND expires_at > NOW() AND created_at > $2 AND code <> $3 ORDER BY created_at DESC LIMIT 1') return { rows: mine(p[0]).filter((c) => c.created_at.getTime() * 1000 + c.us > p[1].getTime() * 1000 && c.code !== p[2]).slice(0, 1).map(pick) };
  if (q === 'SELECT code, slug, title, created_at FROM ws_board_codes WHERE email=$1 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 20') return { rows: mine(p[0]).slice(0, 20).map(pick) };
  if (q.startsWith('UPDATE ws_board_codes SET view=$3, rev=rev+1, seen_at=NOW()')) {
    const row = db.codes.find((c) => c.code === p[0] && c.email === p[1] && live(c)); if (!row) return { rows: [] };
    row.view = p[2]; row.rev++; row.seen_at = new Date();
    if (p[3] != null) { row.html = p[3]; row.answers = p[4]; row.hrev++; }
    if (p[5] != null) { row.bd = p[5]; row.brev++; }
    return { rows: [{ rev: row.rev }] };
  }
  if (q.startsWith('SELECT rev, hrev, brev, (seen_at > NOW() - INTERVAL')) {
    const row = db.codes.find((c) => c.code === p[0] && live(c)); if (!row) return { rows: [] };
    return { rows: [{ rev: row.rev, hrev: row.hrev, brev: row.brev, live: !!row.seen_at && row.seen_at > new Date(Date.now() - 45000),
      view: row.rev > p[1] ? row.view : null, html: row.hrev > p[2] ? row.html : null, answers: row.hrev > p[2] ? row.answers : null, bd: row.brev > p[3] ? row.bd : null }] };
  }
  throw new Error('SQL: ' + q);
} };
const stub = (f, e) => { const id = path.join(API, f); require.cache[id] = { id, filename: id, loaded: true, exports: e }; };
stub('_db.js', pool);
const realGuard = require(path.join(API, '_guard.js'));
stub('_guard.js', Object.assign({}, realGuard, { rateLimit: async (k) => { db.keys.push(k); return !db.limited; }, clientIp: () => '10.1.1.1' }));
stub('_wsgrade.js', { gradesForSlug: async (s) => (/-10\.html$/.test(s) ? ['10-р анги'] : ['12-р анги']), activeGrades: async (e) => (db.grades[e] || []).map((g) => ({ grade: g })) });
const B = require(path.join(API, '_wsboard.js'));

const wsTok = (email) => jwt.sign({ ws: true, email }, process.env.JWT_SECRET, { algorithm: 'HS256' });
const ADMIN = 'Bearer ' + jwt.sign({ admin: true }, process.env.JWT_SECRET, { algorithm: 'HS256' });
function call(req) {
  return new Promise((resolve, reject) => {
    const res = { code: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; },
      json(b) { resolve({ code: this.code, body: b, headers: this.headers }); return this; } };
    B.handle(Object.assign({ headers: {}, query: {} }, req), res).then((h) => { if (!h) resolve(null); }, reject);
  });
}
const send = (body, headers) => call({ method: 'POST', body: Object.assign({ action: 'board_send' }, body), headers: headers || {} });
const get = (query, headers) => call({ method: 'GET', query, headers: headers || {} });
const HTML = '<div class="task">1. Хялбарчил.</div><div class="grid"><div class="q" data-k="a"><span class="katex">log<sub>3</sub>13</span></div></div>';

test('бусад хүсэлтэд хүрэхгүй', async () => {
  assert.strictEqual(await get({ titles: '1' }), null);
  assert.strictEqual(await call({ method: 'POST', body: { action: 'save' } }), null);
});

test('код гаргах эрх: нэвтрээгүй 401, эрхгүй 403, бүх ангийн эрх / ангийн эрх / админ OK', async () => {
  assert.strictEqual((await send({ slug: 'logarifm-chanar-1-12.html', html: HTML })).code, 401);
  assert.strictEqual((await send({ wstoken: 'buruu', slug: 'logarifm-chanar-1-12.html', html: HTML })).code, 401);
  assert.strictEqual((await send({ wstoken: wsTok('noaccess@x.mn'), slug: 'logarifm-chanar-1-12.html', html: HTML })).code, 403);
  assert.strictEqual((await send({ wstoken: wsTok('g10@x.mn'), slug: 'logarifm-chanar-1-12.html', html: HTML })).code, 403, '10-р ангийн эрх 12-р ангийн хуудсанд хүрэхгүй');
  const g = await send({ wstoken: wsTok('g10@x.mn'), slug: 'shuluun-10.html', html: HTML });
  assert.strictEqual(g.code, 200); assert.match(g.body.code, /^\d{6}$/);
  assert.strictEqual((await send({ wstoken: wsTok('all@x.mn'), slug: 'logarifm-chanar-1-12.html', html: HTML })).code, 200);
  assert.strictEqual((await send({ slug: 'logarifm-chanar-1-12.html', html: HTML }, { authorization: ADMIN })).code, 200);
  assert.strictEqual((await send({ wstoken: wsTok('all@x.mn'), slug: 'a.html', html: '<b> </b>' })).code, 400, 'хоосон хуудас');
  assert.strictEqual((await send({ wstoken: wsTok('all@x.mn'), slug: 'a.html', html: 'x'.repeat(3.2 * 1024 * 1024) })).code, 413);
  db.limited = true; assert.strictEqual((await send({ wstoken: wsTok('all@x.mn'), slug: 'a.html', html: HTML })).code, 429); db.limited = false;
});

test('хадгалахдаа скрипт, үйл явдлын атрибут, javascript: холбоосыг арилгана', async () => {
  const r = await send({ wstoken: wsTok('all@x.mn'), slug: 'xss-12.html', title: '  Лог  ',
    html: HTML + '<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a><iframe src="//e"></iframe>', answers: '<p onmouseover=alert(1)>1</p>' });
  const row = db.codes.find((c) => c.code === r.body.code);
  assert.doesNotMatch(row.html + row.answers, /<script|onerror|onmouseover|javascript:|<iframe/i);
  assert.match(row.html, /class="katex"/, 'математик хэвээр');
  assert.strictEqual(row.title, 'Лог');
});

test('самбар: кодоор хуулбар + токен; peek-д хуулбаргүй; хүчингүй код 404; токен ЗӨВХӨН тэр хуудсанд', async () => {
  const s = await send({ wstoken: wsTok('all@x.mn'), slug: 'logarifm-chanar-1-12.html', title: 'Логарифмын чанар-1', html: HTML, answers: '<div class="a">1</div>' });
  const code = s.body.code;
  const peek = await get({ board: code, peek: '1' });
  assert.deepStrictEqual([peek.body.slug, peek.body.title, 'html' in peek.body, typeof peek.body.pair], ['logarifm-chanar-1-12.html', 'Логарифмын чанар-1', false, 'string']);
  const full = await get({ board: code.slice(0, 3) + ' ' + code.slice(3) });
  assert.strictEqual(full.body.html, HTML);
  assert.strictEqual(full.body.answers, '<div class="a">1</div>');
  assert.strictEqual(full.headers['Cache-Control'], 'no-store');
  assert.ok(B.verify(full.body.token, 'logarifm-chanar-1-12.html'));
  assert.ok(B.verify(full.body.token, 'LOGARIFM-CHANAR-1-12'), 'curSlug хэлбэрт хамаарахгүй');
  assert.ok(!B.verify(full.body.token, 'logarifm-chanar-2-12.html'), 'өөр хуудас нээгдэхгүй');
  assert.ok(!B.verify(full.body.pair, 'logarifm-chanar-1-12.html'), 'холболтын токен хуудас нээхгүй');
  assert.ok(!B.verify(wsTok('all@x.mn'), 'logarifm-chanar-1-12.html'), 'ердийн нэвтрэлтийн токен самбарын токен биш');
  assert.ok(!B.verify(jwt.sign({ typ: 'wsb', slug: 'logarifm-chanar-1-12.html' }, 'oor-nuuts'), 'logarifm-chanar-1-12.html'));
  assert.strictEqual((await get({ board: '000000' })).code, 404);
  assert.strictEqual((await get({ board: '12' })).code, 400);
  db.codes.find((c) => c.code === code).expires_at = new Date(Date.now() - 1000);
  assert.strictEqual((await get({ board: code })).code, 404, 'хугацаа дууссан');
});

test('шууд илгээх: холбогдсон самбар тэр багшийн дараагийн илгээлтийг кодгүйгээр авна; бусад багшийнхыг авахгүй', async () => {
  const first = await send({ wstoken: wsTok('b@x.mn'), slug: 'p1-12.html', title: 'Эхний', html: HTML });
  const opened = await get({ board: first.body.code });
  const P = { authorization: 'Bearer ' + opened.body.pair };
  const next = async (after, not) => (await get({ board_next: '1', after: after.toISOString(), not }, P)).body.next;
  // created_at-ийн микросекунд JSON-д тайрагддаг: not-гүй бол одоо нээлттэй код өөрөө «шинэ» болж самбар 8 сек тутам дахин ачаалагдана
  assert.strictEqual((await next(opened.body.created_at, '')).code, first.body.code, 'тайралтын аюулыг дуурайв');
  assert.strictEqual(await next(opened.body.created_at, first.body.code), undefined, 'шинэ илгээлт алга');
  assert.ok(opened.body.now > opened.body.created_at, 'серверийн цаг');
  assert.strictEqual(await next(opened.body.now, first.body.code), undefined);
  await send({ wstoken: wsTok('all@x.mn'), slug: 'oor-12.html', title: 'Өөр багш', html: HTML });
  assert.strictEqual(await next(opened.body.now, first.body.code), undefined, 'өөр багшийнх ирэхгүй');
  const second = await send({ wstoken: wsTok('b@x.mn'), slug: 'p2-12.html', title: 'Хоёр дахь', html: HTML });
  const nx = await get({ board_next: '1', after: opened.body.now.toISOString(), not: first.body.code }, P);
  assert.deepStrictEqual([nx.body.next.code, nx.body.next.slug, 'html' in nx.body.next], [second.body.code, 'p2-12.html', false]);
  const reopened = await get({ board: first.body.code }, P);
  assert.strictEqual(await next(reopened.body.now, first.body.code), undefined, 'жагсаалтаас хуучныг нээхэд сүүлийнх рүү үсрэхгүй');
  const list = await get({ board_list: '1' }, P);
  assert.deepStrictEqual(list.body.items.map((x) => x.title), ['Хоёр дахь', 'Эхний'], 'сүүлийнх эхэндээ');
  assert.strictEqual(await next(list.body.items[0].created_at, list.body.items[0].code), undefined, '/s: жагсаалтын сүүлийнхээс хойш шинэ алга');
  assert.strictEqual((await get({ board_list: '1' })).code, 401, 'холболтгүй');
  assert.strictEqual((await get({ board_list: '1' }, { authorization: 'Bearer ' + wsTok('b@x.mn') })).code, 401, 'ердийн нэвтрэлтийн токен биш');
  assert.strictEqual((await get({ board_list: '1' }, { authorization: 'Bearer ' + opened.body.token })).code, 401, 'хуудасны токен биш');
});

test('хязгаар: нэг сургуулийн олон самбар (нэг IP) бие биенээ хаахгүй — холбогдсон самбар багш+IP-ээр', async () => {
  const s = await send({ wstoken: wsTok('all@x.mn'), slug: 'rl-12.html', html: HTML });
  const o = await get({ board: s.body.code });
  const P = { authorization: 'Bearer ' + o.body.pair };
  db.keys = [];
  await get({ board: s.body.code });
  await get({ board: s.body.code }, P);
  await get({ board_next: '1' }, P);
  await get({ board_list: '1' }, P);
  assert.deepStrictEqual(db.keys, ['wsboard:get:10.1.1.1', 'wsboard:get:all@x.mn:10.1.1.1', 'wsboard:poll:all@x.mn:10.1.1.1', 'wsboard:poll:all@x.mn:10.1.1.1']);
});

test('шууд дагалт: зөвхөн тэр кодыг гаргасан багш шинэчилнэ; самбар зөвхөн өөрчлөгдсөнийг авна; скрипт цэвэрлэнэ', async () => {
  const s = await send({ wstoken: wsTok('all@x.mn'), slug: 'live-12.html', html: HTML });
  const code = s.body.code, tok = (await get({ board: code })).body.token;
  const V = (o) => JSON.stringify(Object.assign({ fw: 0.5, fx: 0.25, ft: -0.1 }, o || {}));
  const pv = (body, headers) => call({ method: 'POST', body: Object.assign({ action: 'board_view', code }, body), headers: headers || {} });
  const gv = (r, h, d, t) => get({ board_view: '1', t: t || tok, r: String(r), h: String(h), d: String(d) });
  assert.strictEqual((await pv({ view: V() })).code, 401, 'нэвтрээгүй');
  assert.strictEqual((await pv({ wstoken: wsTok('b@x.mn'), view: V() })).body.gone, true, 'өөр багшийн код');
  assert.strictEqual((await pv({ wstoken: wsTok('all@x.mn'), view: '{"a":"<script>"}' })).code, 400);
  assert.strictEqual((await pv({ wstoken: wsTok('all@x.mn'), view: V(), bd: 'буруу' })).code, 400);
  let g = await gv(0, 0, 0);
  assert.deepStrictEqual([g.body.rev, g.body.live, 'view' in g.body, 'html' in g.body, 'bd' in g.body], [0, false, false, false, false], 'компьютер хараахан мэдэгдээгүй');
  assert.strictEqual(g.headers['Cache-Control'], 'no-store');
  assert.strictEqual((await pv({ wstoken: wsTok('all@x.mn'), view: V({ fw: 0.8 }) })).body.rev, 1);
  g = await gv(0, 0, 0);
  assert.deepStrictEqual([g.body.rev, g.body.live, JSON.parse(g.body.view).fw, 'html' in g.body], [1, true, 0.8, false]);
  assert.strictEqual('view' in (await gv(1, 0, 0)).body, false, 'өөрчлөгдөөгүйг дахин явуулахгүй');
  const bd = JSON.stringify({ open: true, frac: 0.5, bg: 3, tone: 1, cur: 0, n: 2, z: 1.3, W: 800, H: 600,
    page: { qi: 2, pin: '<b onclick="x()">1</b><script>alert(1)</script>', strokes: [{ c: '#1f1d2e', w: 3, p: [[1, 2], [3, 4]] }] } });
  assert.strictEqual((await pv({ wstoken: wsTok('all@x.mn'), view: V(), html: HTML + '<script>x</script>', answers: '<i>a</i>', bd })).body.rev, 2);
  g = await gv(1, 0, 0);
  assert.ok(g.body.html.includes('class="katex"') && !/<script/i.test(g.body.html), 'агуулга цэвэрлэгдсэн');
  const b2 = JSON.parse(g.body.bd);
  assert.deepStrictEqual([b2.open, b2.n, b2.z, b2.bg, b2.tone, b2.page.qi, b2.page.strokes.length, /onclick|<script/i.test(b2.page.pin)], [true, 2, 1.3, 3, 1, 2, 1, false]);
  g = await gv(2, 1, 1);
  assert.deepStrictEqual(['view' in g.body, 'html' in g.body, 'bd' in g.body], [false, false, false]);
  assert.strictEqual((await get({ board_view: '1', t: 'buruu' })).code, 401);
  assert.strictEqual((await get({ board_view: '1', t: wsTok('all@x.mn') })).code, 401, 'нэвтрэлтийн токен самбарын токен биш');
  const a = await send({ slug: 'adm-12.html', html: HTML }, { authorization: ADMIN });
  assert.strictEqual((await call({ method: 'POST', body: { action: 'board_view', code: a.body.code, view: V() }, headers: { authorization: ADMIN } })).body.rev, 1, 'админы код');
  db.codes.find((c) => c.code === code).expires_at = new Date(Date.now() - 1000);
  assert.strictEqual((await gv(0, 0, 0)).body.gone, true, 'хугацаа дууссан код');
  assert.strictEqual((await pv({ wstoken: wsTok('all@x.mn'), view: V() })).body.gone, true);
});

test('холболт: wsstatus токеныг шалгана, worksheets.js, ws-store.js (зөвхөн харах), /s хуудас', () => {
  const q = R('api/qpay.js').replace(/\r\n/g, '\n'), ws = q.indexOf("req.query.action === 'wsstatus'");
  assert.match(q, /if \(b\.wsb && WSB\.verify\(b\.wsb, b\.slug\)\) return res\.json\(\{ ok: true, enabled: true, active: true, scope: 'board', grades: \[\] \}\);/);
  assert.ok(ws > 0 && q.indexOf('WSB.verify(b.wsb', ws) < q.indexOf('emailFromToken(b.wstoken)', ws), 'имэйл/туршилтаас өмнө');
  const w = R('api/worksheets.js');
  assert.ok(w.indexOf('WSBOARD.handle(req, res)') > 0 && w.indexOf('WSBOARD.handle(req, res)') < w.indexOf('MEDIA.handle(req, res)'));
  const s = R('ws-store.js').replace(/\r\n/g, '\n');
  assert.match(s, /slug:curSlug\(\),wsb:ss\('cm_wsb:'\+curSlug\(\)\)\};/);
  assert.match(s, /if\(!IS_QR\)\{[^}]*boardBtn\(\);applyBoardCode\(\);\}/);
  assert.doesNotMatch(s, /sendBtn|ws-send|board_send|liveStart|Самбарт илгээх'/, '«Самбарт илгээх» товчийг хассан (эзэмшигч: «самбарт илгээх товчийг устгая»)');
  assert.match(s, /function safeHTML\(html\)/);
  assert.match(s, /html\.ws-view \.bar>\*:not\(\.ws-board\):not\(\.ws-viewbadge\)\{display:none!important\}/, 'самбар талд зөвхөн «Самбар» товч');
  assert.match(s, /if\(\(e\.ctrlKey\|\|e\.metaKey\)&&e\.key==='Enter'\)\{e\.preventDefault\(\);e\.stopImmediatePropagation\(\);\} \},true\);/, 'Ctrl+Enter-ээр шинэчлэхгүй');
  assert.match(s, /function applyBoardCode\(\)\{\n    if\(!BOARD_CODE\)return;\n    viewOnly\(\);/);
  assert.match(s, /putSheet\(d\.html,d\.answers\);\n        follow\(d\.token\);/);
  assert.doesNotMatch(s, /bb\.click\(\)/, 'самбарыг автоматаар нээхгүй — компьютер дээр нээлттэй бол л');
  assert.match(s, /'\/api\/worksheets\?board_view=1&t='\+encodeURIComponent\(tok\)/);
  assert.match(s, /setTimeout\(poll,S\.live\?1000:5000\)/, 'компьютер идэвхтэй үед 1 сек');
  assert.match(s, /watchNext\(d\.now\|\|d\.created_at,BOARD_CODE\);/, 'серверийн цаг + одоогийн кодыг хасна');
  assert.match(s, /'&not='\+\(not\|\|''\)/);
  assert.match(s, /if\(r\.status===401\)\{try\{localStorage\.removeItem\('cm_wsb_pair'\);\}catch\(e\)\{\}return 0;\}/, 'хүчингүй холболтоор давтахгүй');
  const v = JSON.parse(R('vercel.json'));
  assert.ok(v.routes.some((r) => r.src === '/s' && r.dest === '/s.html'));
  const sh = R('s.html');
  assert.match(sh, /fetch\('\/api\/worksheets\?board=' \+ code \+ '&peek=1', p \? \{ headers: \{ Authorization: 'Bearer ' \+ p \} \} : \{\}\)/);
  assert.match(sh, /since = top \? top\.created_at : '', not = top \? top\.code : ''/, '/s: самбарын цаг биш, серверийн цаг');
  assert.match(sh, /'&not=' \+ not, H\)/);
  assert.match(sh, /location\.href = '\/' \+ d\.slug \+ '\?b=' \+ code;/);
  assert.doesNotMatch(sh, /delete|устгах<\/button>/i, 'самбар дээр устгах үйлдэл байхгүй');
  assert.doesNotMatch(sh + s.slice(s.indexOf('Самбар тал: <хуудас>.html?b=КОД'), s.indexOf('Смарт дэлгэц: «Самбар»')), /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
});
