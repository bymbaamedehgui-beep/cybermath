// Шинэ дансны 5 минутын үнэгүй туршилт — сервер (api/_wstrial.js + api/qpay.js wsstatus), серверийн (DB) цагаар.
//  • шинэ данс → 300 сек; 299 сек дээр нээлттэй, 300 сек дээр хаалттай (DB NOW()-ийг fake clock-оор шилжүүлнэ)
//  • хуучин / баталгаажаагүй / бэлтгэсэн данс → туршилтгүй; хоёр дахь эхлэл/нэвтрэлт СУНГАХГҮЙ
//  • клиентийн цаг/параметрээр сунгах боломжгүй; төлсөн эрхтэй хэрэглэгчид нөлөөгүй; WS_TRIAL_SECONDS env
// Ажиллуулах: node --test tests/ws-trial.test.js   (бодит DB/QPay 0 — tests/_gamefake.js)
'use strict';
const F = require('./_gamefake');
const { test, beforeEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

const qpay = require(path.join(F.API, 'qpay.js'));
const WT = require(path.join(F.API, '_wstrial.js'));
const TF = require('./_trialfake');
const jwt = require(require.resolve('jsonwebtoken', { paths: [F.API] }));
const SEC = process.env.JWT_SECRET;

const DEV = 'devaaaa11112222', DEV2 = 'devbbbb33334444';
const G6 = 'jishig-daalgavar-1-6.html', G9 = 'troichlen-zadlal-12.html', EESH = 'eesh-2023-songoh.html';
const tok = (e, dev) => jwt.sign(dev ? { email: e, ws: true, dev: dev } : { email: e, ws: true }, SEC);
const HOUR = 3600e3;

function acct(email, o) {
  const r = Object.assign({ email: email, phone: '99112233', verified: true, pass_hash: '$2a$04$hash', created_at: new Date() }, o || {});
  F.db.wsLogin.set(email, r);
  return r;
}
// wsstatus (ажлын хуудас нээх бүрд ws-store.js дууддаг)
async function status(email, o) {
  o = o || {};
  const headers = {};
  if (o.dev !== null) headers['x-device-id'] = o.dev || DEV;
  const body = Object.assign({ wstoken: o.token !== undefined ? o.token : tok(email, o.dev !== null ? (o.dev || DEV) : null), slug: o.slug || G6 }, o.body || {});
  const r = await F.call(qpay, { method: 'POST', query: { action: 'wsstatus' }, body: body, headers: Object.assign(headers, o.headers || {}) });
  assert.strictEqual(r.statusCode, 200);
  return r.body;
}
const req = (dev, extra) => ({ headers: Object.assign(dev ? { 'x-device-id': dev } : {}, extra || {}), body: {} });

beforeEach(() => {
  F.reset();
  process.env.WS_TRIAL_SECONDS = '300';
  process.env.WS_TRIAL_FROM = new Date(Date.now() - HOUR).toISOString();
});

test('SQL: fake-ууд api/_wstrial.js-ийн ЯГ мөрүүдийг таньдаг (өөрчлөгдвөл энд унана)', () => {
  Object.keys(TF.SQL).forEach(function (k) { assert.strictEqual(TF.norm(WT.SQL[k]), TF.norm(TF.SQL[k]), k); });
  assert.deepStrictEqual(Object.keys(WT.SQL).sort(), Object.keys(TF.SQL).sort());
  // хугацааг ЗӨВХӨН DB-ийн NOW()-оор: идэвхтэй эсэхийг SQL шийднэ, клиентийн утга параметр болж орохгүй
  assert.match(WT.SQL.ELIG, /\(t\.trial_until > NOW\(\)\) AS active, NOW\(\) AS now/);
  assert.match(WT.SQL.INS, /NOW\(\) \+ make_interval\(secs => \$2::int\)/);
  assert.match(WT.SQL.INS, /ON CONFLICT \(email\) DO NOTHING/);
  // ws_login-д ALTER, ws_access-д бичихгүй
  const src = fs.readFileSync(path.join(F.API, '_wstrial.js'), 'utf8');
  assert.doesNotMatch(src, /ALTER TABLE ws_login/);
  assert.doesNotMatch(src, /INSERT INTO ws_access|UPDATE ws_access/);
});

test('шинэ данс: wsstatus → scope trial, 300 сек (DB цагаар), ws_token ГАРГАХГҮЙ, server_now байна; 299с нээлттэй, 300с хаалттай', async () => {
  acct('new@x.mn');
  const d = await status('new@x.mn');
  assert.strictEqual(d.active, true);
  assert.strictEqual(d.scope, 'trial');
  assert.strictEqual(d.email, 'new@x.mn');
  assert.strictEqual(d.ws_token, null, 'туршилтад ws_token сэргээхгүй');
  assert.strictEqual(typeof d.trial.server_now, 'number');
  assert.strictEqual(d.trial.seconds, 300);
  assert.strictEqual(d.trial.active, true);
  assert.strictEqual(d.trial.denied, null);
  assert.strictEqual(Date.parse(d.trial.until) - Date.parse(d.trial.started_at), 300000);
  assert.strictEqual(d.expires_at, d.trial.until);
  const t = F.db.trial.trials.get('new@x.mn');
  assert.ok(t, 'ws_trials мөр (нөөц start — нэвтрэх үеийн start байгаагүй)');
  assert.strictEqual(t.device_id, DEV);
  assert.deepStrictEqual(Array.from(F.db.trial.marks.keys()).sort().map(k => k.split(':')[0]), ['dev', 'ph']);
  assert.ok(Array.from(F.db.trial.marks.keys()).every(k => k.indexOf('99112233') < 0), 'утас түүхийгээр хадгалагдахгүй');

  F.db.trial.shift = 299000;            // DB цаг +299 сек
  let s = await status('new@x.mn');
  assert.deepStrictEqual([s.active, s.scope, s.trial.active], [true, 'trial', true], '299 сек — нээлттэй');
  F.db.trial.shift = 300000;            // DB цаг +300 сек — яг дуусах мөч
  s = await status('new@x.mn');
  assert.deepStrictEqual([s.active, s.scope, s.email, s.ws_token, s.trial.active], [false, null, null, null, false], '300 сек — хаалттай');
  assert.strictEqual(s.account, 'new@x.mn', 'толгойн «Нэвтэрсэн» хэвээр');
  assert.strictEqual(s.trial.until, d.trial.until, 'хугацаа өөрчлөгдөхгүй');
  F.db.trial.shift = 10 * HOUR;
  s = await status('new@x.mn', { slug: EESH });
  assert.strictEqual(s.active, false);
  assert.strictEqual(F.db.trial.trials.size, 1);
});

test('туршилт бүх анги / бүх slug-д (ЭЕШ, slug-гүй каталог) ws_access шиг хүчинтэй', async () => {
  acct('n2@x.mn');
  for (const slug of [G6, G9, EESH, 'unknown-page.html']) {
    const d = await status('n2@x.mn', { slug: slug });
    assert.deepStrictEqual([d.active, d.scope], [true, 'trial'], slug);
  }
  const d = await status('n2@x.mn', { body: { slug: '' } });
  assert.deepStrictEqual([d.active, d.scope], [true, 'trial'], 'slug-гүй (Дасгалын төвийн нүүр)');
});

test('хоёр дахь эхлэл / дахин нэвтрэлт / төхөөрөмж солих → СУНГАХГҮЙ; клиентийн цаг/параметр нөлөөгүй', async () => {
  acct('n3@x.mn');
  const a = await WT.start('n3@x.mn', req(DEV));
  assert.strictEqual(a.active, true);
  F.db.trial.shift = 200000;
  const b = await WT.start('n3@x.mn', req(DEV2));
  assert.strictEqual(b.until, a.until, 'дахин нэвтрэлт хугацааг сунгахгүй');
  assert.strictEqual(b.started_at, a.started_at);
  assert.strictEqual(b.server_now - a.server_now >= 200000, true, 'server_now нь DB цаг');
  // Клиент хүссэн утгаа илгээсэн ч (until, seconds, now, Date толгой…) серверийн хариу өөрчлөгдөхгүй
  const d = await status('n3@x.mn', {
    body: { trial_until: '2099-01-01T00:00:00Z', until: '2099-01-01T00:00:00Z', seconds: 99999, now: 0, server_now: 0, trial: { active: true } },
    headers: { date: 'Thu, 01 Jan 2099 00:00:00 GMT', 'x-client-time': '0' },
  });
  assert.strictEqual(d.trial.until, a.until);
  assert.strictEqual(d.trial.seconds, 300);
  F.db.trial.shift = 300000;
  const e = await status('n3@x.mn', { body: { trial_until: '2099-01-01T00:00:00Z' } });
  assert.strictEqual(e.active, false, 'параметрээр сунгахгүй');
  // Процессын (клиентийн) цагийг урагш/хойш шилжүүлэх нь хамаагүй — зөвхөн DB NOW() шийднэ
  const realNow = Date.now;
  try {
    Date.now = () => realNow() - 10 * HOUR;
    const z = await status('n3@x.mn');
    assert.strictEqual(z.active, false, 'JS цаг хойш тавьсан ч DB цагаар дууссан');
  } finally { Date.now = realNow; }
  assert.strictEqual(F.db.trial.trials.size, 1);
});

test('хуучин данс (created_at < WS_TRIAL_FROM), баталгаажаагүй, админ бэлтгэсэн (pass_hash !) → туршилтгүй, юу ч бичихгүй', async () => {
  acct('old@x.mn', { created_at: new Date(Date.now() - 30 * 864e5) });
  acct('unv@x.mn', { verified: false });
  acct('prep@x.mn', { pass_hash: '!' });
  for (const e of ['old@x.mn', 'unv@x.mn', 'prep@x.mn']) {
    assert.strictEqual(await WT.start(e, req(DEV)), null, e);
    const d = await status(e);
    assert.deepStrictEqual([d.active, d.scope, d.trial], [false, null, undefined], e);
  }
  assert.strictEqual(F.db.trial.trials.size, 0);
  assert.strictEqual(F.db.trial.marks.size, 0);
  // ws_login мөргүй токен
  const g = await status('ghost@x.mn');
  assert.deepStrictEqual([g.active, g.trial], [false, undefined]);
  // WS_TRIAL_FROM тавиагүй → кодын DEFAULT_FROM (коммитын мөч); буруу утга → DEFAULT_FROM
  delete process.env.WS_TRIAL_FROM;
  assert.strictEqual(WT.fromIso(), new Date(WT.DEFAULT_FROM).toISOString());
  process.env.WS_TRIAL_FROM = 'not-a-date';
  assert.strictEqual(WT.fromIso(), new Date(WT.DEFAULT_FROM).toISOString());
  process.env.WS_TRIAL_FROM = new Date(Date.now() + HOUR).toISOString();   // ирээдүйд → өнөөдрийн данс ч хуучин
  acct('early@x.mn');
  assert.strictEqual((await status('early@x.mn')).active, false);
});

test('нэг төхөөрөмж / нэг утас → нэг туршилт: дараагийн шинэ данс denied (0 сек, шууд дууссан)', async () => {
  acct('a@x.mn', { phone: '99110001' });
  acct('b@x.mn', { phone: '99110002' });
  acct('c@x.mn', { phone: '99110001' });
  assert.strictEqual((await status('a@x.mn', { dev: DEV })).scope, 'trial');
  const b = await status('b@x.mn', { dev: DEV });                  // ижил төхөөрөмж, өөр утас
  assert.deepStrictEqual([b.active, b.scope, b.trial.active, b.trial.denied, b.trial.seconds], [false, null, false, 'dev', 0]);
  const c = await status('c@x.mn', { dev: DEV2 });                 // өөр төхөөрөмж, ижил утас
  assert.deepStrictEqual([c.active, c.trial.denied, c.trial.seconds], [false, 'phone', 0]);
  // татгалзсан нь нэг удаагийн эрхийг зарцуулна — өөр төхөөрөмжөөс дахин оролдсон ч туршилтгүй
  const c2 = await status('c@x.mn', { dev: 'devcccc55556666' });
  assert.deepStrictEqual([c2.active, c2.trial.denied], [false, 'phone']);
  assert.strictEqual(F.db.trial.trials.size, 3);
  // fp-ээр ХААХГҮЙ (сургуулийн нэг компьютер)
  acct('d@x.mn', { phone: '99110004' });
  acct('e@x.mn', { phone: '99110005' });
  assert.strictEqual((await status('d@x.mn', { dev: 'devddd000000001', headers: { 'x-device-fp': 'abcdef12' } })).scope, 'trial');
  assert.strictEqual((await status('e@x.mn', { dev: 'deveee000000002', headers: { 'x-device-fp': 'abcdef12' } })).scope, 'trial');
  assert.strictEqual(F.db.trial.trials.get('e@x.mn').fp, 'abcdef12', 'fp зөвхөн аудитад');
});

test('зэрэг эхлэл (2 нэвтрэлт) → нэг мөр, ижил хугацаа', async () => {
  acct('z@x.mn');
  const [a, b, c] = await Promise.all([WT.start('z@x.mn', req(DEV)), WT.start('z@x.mn', req(DEV)), status('z@x.mn')]);
  assert.strictEqual(F.db.trial.trials.size, 1);
  assert.strictEqual(a.until, b.until);
  assert.strictEqual(c.trial.until, a.until);
  assert.strictEqual(a.denied, null);
  assert.strictEqual(b.denied, null, 'өөрийн тэмдэг өөрт нь саад болохгүй');
});

test('төлсөн эрх (ws_access / өөрийн анги) → scope all/grade, туршилтын SQL огт ажиллахгүй; өөр ангийн хуудсанд туршилт', async () => {
  acct('paid@x.mn');
  F.db.wsAccess.set('paid@x.mn', new Date(Date.now() + 40 * F.DAY));
  const p = await status('paid@x.mn');
  assert.deepStrictEqual([p.active, p.scope, p.trial], [true, 'all', undefined]);
  assert.ok(p.ws_token, 'төлсөн эрхэд ws_token хэвээр');
  assert.strictEqual(F.db.trial.queries.length, 0, 'туршилтын SQL 0');
  assert.strictEqual(F.db.trial.trials.size, 0, 'туршилт зарцуулагдахгүй');

  acct('gr@x.mn');
  F.db.wsGrade.push({ email: 'gr@x.mn', grade: '6-р анги', expires_at: new Date(Date.now() + 20 * F.DAY) });
  const g = await status('gr@x.mn', { slug: G6 });
  assert.deepStrictEqual([g.active, g.scope, g.trial], [true, 'grade', undefined]);
  assert.ok(g.ws_token);
  assert.strictEqual(F.db.trial.queries.length, 0);
  const o = await status('gr@x.mn', { slug: G9 });                  // өөр ангийн хуудас — шинэ данс тул туршилт
  assert.deepStrictEqual([o.active, o.scope, o.ws_token], [true, 'trial', null]);
  // туршилтын DB алдаа → туршилтгүй (fail-closed), төлсөн эрхэд нөлөөгүй
  F.db.trial.fail = true;
  const f1 = await status('gr@x.mn', { slug: G9 });
  assert.deepStrictEqual([f1.active, f1.scope, f1.trial], [false, null, undefined]);
  const f2 = await status('paid@x.mn');
  assert.deepStrictEqual([f2.active, f2.scope], [true, 'all']);
  assert.ok(F.logs.some(l => /\[wstrial status\]/.test(l)));
});

test('byEmail / токенгүй / төхөөрөмжийн хязгаар → туршилтгүй (SQL 0); WS_PAYWALL=off хэвээр', async () => {
  acct('n@x.mn');
  let r = await F.call(qpay, { method: 'POST', query: { action: 'wsstatus' }, body: { email: 'n@x.mn', slug: G6 } });
  assert.deepStrictEqual([r.body.active, r.body.needLogin, r.body.trial], [false, true, undefined]);
  r = await F.call(qpay, { method: 'POST', query: { action: 'wsstatus' }, body: { slug: G6 } });
  assert.deepStrictEqual([r.body.active, r.body.trial], [false, undefined]);
  for (let i = 0; i < 4; i++) {
    const d = 'otherdevice' + i + 'xxxxxxx';
    F.db.devices.set('n@x.mn|' + d, { email: 'n@x.mn', device_id: d, label: 'PC', ua: '', ip: '10.0.0.' + i, fp: 'f' + i, fp_changed_at: new Date(), first_seen: new Date(), last_seen: new Date() });
  }
  const b = await status('n@x.mn', { dev: 'newdevice00000001' });
  assert.deepStrictEqual([b.active, b.deviceBlocked, b.trial], [false, true, undefined]);
  assert.strictEqual(F.db.trial.queries.length, 0);
  process.env.WS_PAYWALL = 'off';
  try {
    r = await F.call(qpay, { method: 'POST', query: { action: 'wsstatus' }, body: { wstoken: tok('n@x.mn') } });
    assert.deepStrictEqual(r.body, { ok: true, enabled: false, active: true });
  } finally { delete process.env.WS_PAYWALL; }
});

test('WS_TRIAL_SECONDS: 0/off → бүрэн унтраалттай (SQL 0); 30 → 30 сек; хэт их → 3600; буруу → 300', async () => {
  acct('s@x.mn');
  for (const v of ['0', 'off']) {
    process.env.WS_TRIAL_SECONDS = v;
    const d = await status('s@x.mn');
    assert.deepStrictEqual([d.active, d.trial], [false, undefined], v);
    assert.strictEqual(await WT.start('s@x.mn', req(DEV)), null);
  }
  assert.strictEqual(F.db.trial.queries.length, 0, 'унтраалттай үед туршилтын SQL 0');
  process.env.WS_TRIAL_SECONDS = '30';
  const d = await status('s@x.mn');
  assert.strictEqual(Date.parse(d.trial.until) - Date.parse(d.trial.started_at), 30000);
  assert.strictEqual(d.trial.seconds, 30);
  process.env.WS_TRIAL_SECONDS = '999999'; assert.strictEqual(WT.seconds(), 3600);
  process.env.WS_TRIAL_SECONDS = 'abc'; assert.strictEqual(WT.seconds(), 300);
  delete process.env.WS_TRIAL_SECONDS; assert.strictEqual(WT.seconds(), 300, 'анхдагч 5 минут');
  process.env.WS_TRIAL_SECONDS = '-5'; assert.strictEqual(WT.seconds(), 0);
});

test('WS_TRIAL_IP_DAY (анхдагч унтраалттай): N>0 бол нэг IP-ээс өдөрт N туршилт, хэтэрвэл denied ip', async () => {
  acct('i1@x.mn', { phone: '99120001' }); acct('i2@x.mn', { phone: '99120002' });
  process.env.WS_TRIAL_IP_DAY = '1';
  const ipReq = (dev) => ({ headers: { 'x-device-id': dev, 'x-forwarded-for': '198.51.100.20' }, body: {} });
  assert.strictEqual((await WT.start('i1@x.mn', ipReq('devip0000000001'))).active, true);
  const b = await WT.start('i2@x.mn', ipReq('devip0000000002'));
  assert.deepStrictEqual([b.active, b.denied], [false, 'ip']);
});

test('тодорхойгүй SQL алга', () => { assert.deepStrictEqual(F.db.unknown, []); });
