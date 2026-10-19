// 5 минутын үнэгүй туршилт — сервер (api/_wstrial.js + api/qpay.js wsstatus), серверийн (DB) цагаар.
//  • эрх ХЭЗЭЭ Ч аваагүй бүртгэлтэй данс (шинэ ч, деплойгоос өмнөх хуучин ч) → 300 сек; 299 сек дээр нээлттэй, 300 сек
//    дээр хаалттай (DB NOW()-ийг fake clock-оор шилжүүлнэ)
//  • ws_access / ws_grade_access мөртэй (дууссан ч, админы олголт ч), баталгаажаагүй, бэлтгэсэн, урилгын SMS-гүй данс →
//    туршилтгүй; эрх авсан өөр данстай ижил утас/төхөөрөмж → denied; хоёр дахь эхлэл/нэвтрэлт СУНГАХГҮЙ
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

// Анхдагч: SMS-ээр бүртгүүлсэн шинэ данс (утас батлагдсан)
function acct(email, o) {
  const r = Object.assign({ email: email, phone: '99112233', verified: true, pass_hash: '$2a$04$hash', phone_verified_at: new Date(), invite: null, created_at: new Date() }, o || {});
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
  WT._resetReady();                     // деплойн мөчийн anchor кэш (cold start)
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
  // Бүртгэсэн огноогоор шүүхгүй (хуучин данс ч туршилт авна); «эрх авсан» = ws_access / ws_grade_access-д МӨР байгаа
  // эсэх (expires_at-аар шүүхгүй — дууссан эрх ч тооцно)
  assert.doesNotMatch(WT.SQL.ELIG + WT.SQL.PRIOR, /created_at|timestamptz|expires_at/);
  assert.match(WT.SQL.ELIG, /\(l\.phone_verified_at IS NOT NULL OR l\.invite IS NULL\)/);
  assert.match(WT.SQL.ELIG, /NOT EXISTS \(SELECT 1 FROM ws_access a WHERE LOWER\(a\.email\) = l\.email\)/);
  assert.match(WT.SQL.ELIG, /NOT EXISTS \(SELECT 1 FROM ws_grade_access g WHERE LOWER\(g\.email\) = l\.email\)/);
  // параметрийн тоо (pg: илүү параметр → bind алдаа): ELIG $1, PRIOR $1..$3
  assert.deepStrictEqual(WT.SQL.ELIG.match(/\$\d/g).filter((v, i, a) => a.indexOf(v) === i), ['$1']);
  assert.deepStrictEqual(WT.SQL.PRIOR.match(/\$\d/g).filter((v, i, a) => a.indexOf(v) === i).sort(), ['$1', '$2', '$3']);
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

test('хуучин (деплойгоос өмнөх) эрхгүй данс → туршилт авна: токентой (дахин нэвтрэхгүй) хуудас нээхэд эхэлнэ; SMS-ээс өмнөх данс ч', async () => {
  const YEAR = 365 * 864e5;
  // WS_TRIAL_FROM-оос 1 жилийн өмнө бүртгүүлсэн, нэвтрэлт (start) огт дуудагдаагүй — хуучин токеноор хуудас нээв
  acct('old@x.mn', { phone: '99140001', created_at: new Date(Date.now() - YEAR) });
  const d = await status('old@x.mn', { dev: 'devold000000001' });
  assert.deepStrictEqual([d.active, d.scope, d.ws_token, d.trial.active, d.trial.denied, d.trial.seconds], [true, 'trial', null, true, null, 300]);
  assert.strictEqual(Date.parse(d.trial.until) - Date.parse(d.trial.started_at), 300000);
  assert.strictEqual(F.db.trial.trials.get('old@x.mn').device_id, 'devold000000001');
  // дараа нь нэвтэрсэн ч (start) СУНГАХГҮЙ
  F.db.trial.shift = 60000;
  const s = await WT.start('old@x.mn', req('devold000000001'));
  assert.deepStrictEqual([s.until, s.started_at], [d.trial.until, d.trial.started_at]);
  // Хуучин данс нэвтэрч эхлүүлэх (start) зам ч мөн адил
  acct('old2@x.mn', { phone: '99140004', created_at: new Date(Date.now() - 90 * F.DAY) });
  const st = await WT.start('old2@x.mn', req('devold200000001'));
  assert.deepStrictEqual([st.active, st.seconds, st.denied], [true, 300, null]);
  // SMS-ээс өмнөх (имэйлээр баталгаажсан, phone_verified_at-гүй, урилгын бус) хуучин данс
  acct('legacy@x.mn', { phone: '99140002', phone_verified_at: null, invite: null, created_at: new Date(Date.now() - YEAR) });
  const l = await status('legacy@x.mn', { dev: 'devlegacy000001' });
  assert.deepStrictEqual([l.active, l.scope, l.trial.denied], [true, 'trial', null]);
  // утасгүй хуучин данс — зөвхөн төхөөрөмжийн тэмдгээр
  acct('nophone@x.mn', { phone: null, phone_verified_at: null, created_at: new Date(Date.now() - YEAR) });
  assert.strictEqual((await status('nophone@x.mn', { dev: 'devnophone00001' })).scope, 'trial');
  assert.strictEqual(F.db.trial.marks.has('dev:devnophone00001'), true);
  // WS_TRIAL_FROM-ийн огноо SQL-д орохгүй — ирээдүйн огноо ч зөвхөн «идэвхтэй» гэсэн хаалга
  process.env.WS_TRIAL_FROM = new Date(Date.now() + HOUR).toISOString();
  acct('early@x.mn', { phone: '99140003' });
  assert.strictEqual((await status('early@x.mn', { dev: 'devearly0000001' })).scope, 'trial');
  assert.strictEqual(F.db.trial.trials.size, 5);
});

test('баталгаажаагүй, админ бэлтгэсэн (pass_hash !), ws_login мөргүй → туршилтгүй, юу ч бичихгүй', async () => {
  acct('unv@x.mn', { verified: false });
  acct('prep@x.mn', { pass_hash: '!' });
  for (const e of ['unv@x.mn', 'prep@x.mn']) {
    assert.strictEqual(await WT.start(e, req(DEV)), null, e);
    const d = await status(e);
    assert.deepStrictEqual([d.active, d.scope, d.trial], [false, null, undefined], e);
  }
  assert.strictEqual(F.db.trial.trials.size, 0);
  assert.strictEqual(F.db.trial.marks.size, 0);
  // ws_login мөргүй токен
  const g = await status('ghost@x.mn');
  assert.deepStrictEqual([g.active, g.trial], [false, undefined]);
});

test('эрх авсан данс (ws_access / ws_grade_access — хугацаа дууссан ч, админы олголт ч) → туршилт ХЭЗЭЭ Ч авахгүй, юу ч бичихгүй', async () => {
  const devOf = (e) => 'dev' + e.split('@')[0] + '00000000';
  // хугацаа нь дууссан бүх ангийн эрх (wsstatus идэвхтэй эрх олохгүй → туршилт шалгагдана)
  acct('exp@x.mn', { phone: '99150001' });
  F.db.wsAccess.set('exp@x.mn', new Date(Date.now() - 3 * F.DAY));
  // админы гараар олгосон (мөнгөгүй) эрх ч ws_access-ийн мөр — дууссан, хуучин данс
  acct('adm@x.mn', { phone: '99150002', created_at: new Date(Date.now() - 200 * F.DAY) });
  F.db.wsAccess.set('adm@x.mn', new Date(Date.now() - 1000));
  // хугацаа нь дууссан ангийн эрх — тэр ангийн ч, өөр ангийн ч хуудсанд
  acct('gexp@x.mn', { phone: '99150003' });
  F.db.wsGrade.push({ email: 'gexp@x.mn', grade: '6-р анги', expires_at: new Date(Date.now() - F.DAY) });
  // идэвхтэй ангийн эрх — өөр ангийн хуудас (G9), ЭЕШ, slug-гүй нүүрэнд туршилтгүй
  acct('gact@x.mn', { phone: '99150004' });
  F.db.wsGrade.push({ email: 'gact@x.mn', grade: '6-р анги', expires_at: new Date(Date.now() + 20 * F.DAY) });
  const cases = [['exp@x.mn', G6], ['exp@x.mn', EESH], ['adm@x.mn', G9], ['gexp@x.mn', G6], ['gexp@x.mn', G9], ['gact@x.mn', G9], ['gact@x.mn', EESH], ['gact@x.mn', '']];
  for (const [e, slug] of cases) {
    const d = await status(e, { dev: devOf(e), body: { slug: slug } });
    assert.deepStrictEqual([d.active, d.scope, d.trial, d.ws_token, d.account], [false, null, undefined, null, e], e + ' ' + slug);
    assert.strictEqual(await WT.start(e, req(devOf(e))), null, e);
  }
  assert.strictEqual(F.db.trial.trials.size, 0, 'ws_trials-д юу ч бичигдэхгүй');
  assert.strictEqual(F.db.trial.marks.size, 0, 'тэмдэг үүсэхгүй (эрх авсан данс утас/төхөөрөмжөө тэмдгээр эзлэхгүй — PRIOR шалгана)');
  assert.deepStrictEqual(F.db.trial.queries.filter((v, i, a) => a.indexOf(v) === i), ['ELIG'], 'ELIG-ээс цааш явахгүй');
  // өөрийн ангийн хуудсанд төлсөн эрх хэвээр (туршилтын SQL огт ажиллахгүй)
  F.db.trial.queries.length = 0;
  const own = await status('gact@x.mn', { dev: devOf('gact@x.mn'), slug: G6 });
  assert.deepStrictEqual([own.active, own.scope, own.trial], [true, 'grade', undefined]);
  assert.strictEqual(F.db.trial.queries.length, 0);
});

test('деплойн мөч: кодонд хатуу огноогүй; WS_TRIAL_FROM-гүй бол production-ийн АНХНЫ ажиллалт (ws_trial_cfg), preview/локал үүсгэхгүй', async () => {
  const src = fs.readFileSync(path.join(F.API, '_wstrial.js'), 'utf8');
  assert.doesNotMatch(src, /DEFAULT_FROM|['"]20\d\d-\d\d-\d\dT/, 'коммитын мөчийг хатуу бичихгүй');
  assert.strictEqual(WT.DEFAULT_FROM, undefined);
  delete process.env.WS_TRIAL_FROM;
  // Коммит/локал туршилтын үед prod DB-д хүрсэн ч (.env.local) — anchor үүсгэхгүй, туршилтгүй, юу ч бичихгүй
  acct('pre@x.mn', { phone: '99130001', created_at: new Date(Date.now() - 2 * HOUR) });   // «коммитын дараа, деплойгоос өмнө»
  // [VERCEL_ENV, AWS_LAMBDA_FUNCTION_NAME]: локал node/тест, vercel dev, preview (lambda дээр ч)
  for (const [env, lambda] of [[undefined, undefined], ['development', undefined], ['preview', 'fn-preview']]) {
    if (env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = env;
    if (lambda === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME; else process.env.AWS_LAMBDA_FUNCTION_NAME = lambda;
    WT._resetReady();
    assert.strictEqual(await WT.fromIso(), null, String(env));
    const d = await status('pre@x.mn');
    assert.deepStrictEqual([d.active, d.trial], [false, undefined], String(env));
    assert.strictEqual(await WT.start('pre@x.mn', req(DEV)), null);
  }
  assert.strictEqual(F.db.trial.cfgFrom, null, 'non-production → anchor бичихгүй');
  assert.strictEqual(F.db.trial.queries.indexOf('CFG_INS'), -1);
  assert.strictEqual(F.db.trial.trials.size, 0);
  assert.ok(F.logs.some(l => /\[wstrial\] деплойн мөч алга/.test(l)), 'унтраалттайг логт анхааруулна');
  // Production деплой: анхны дуудлагын (DB) мөч = деплойн мөч. Огноо нь зөвхөн хаалга — өмнө бүртгүүлсэн ч туршилт авна
  delete process.env.AWS_LAMBDA_FUNCTION_NAME;
  process.env.VERCEL_ENV = 'production';
  WT._resetReady();
  F.db.trial.shift = 5000;                                         // DB цаг (процессын цагаас тусдаа)
  const a = await WT.fromIso();
  assert.ok(F.db.trial.cfgFrom, 'anchor бичигдэв');
  assert.strictEqual(a, F.db.trial.cfgFrom.toISOString());
  assert.ok(Math.abs(Date.parse(a) - (Date.now() + 5000)) < 2000, 'DB NOW()');
  const dp = await status('pre@x.mn');
  assert.deepStrictEqual([dp.active, dp.scope, dp.trial.denied], [true, 'trial', null], 'деплойгоос өмнөх бүртгэл ч (огноогоор шүүхгүй)');
  acct('post@x.mn', { phone: '99130002', created_at: new Date(Date.now() + 6000) });
  const dn = await status('post@x.mn', { dev: 'devpost00000001' });
  assert.deepStrictEqual([dn.active, dn.scope], [true, 'trial'], 'деплойн дараах бүртгэл');
  // anchor өөрчлөгдөхгүй: дахин деплой / cold start / DB цаг урагшилсан ч эхний мөч хэвээр
  F.db.trial.shift = 10 * HOUR;
  WT._resetReady();
  assert.strictEqual(await WT.fromIso(), a);
  const nIns = F.db.trial.queries.filter(q => q === 'CFG_GET').length;
  await WT.fromIso(); await WT.fromIso();
  assert.strictEqual(F.db.trial.queries.filter(q => q === 'CFG_GET').length, nIns, 'cold start-ын турш кэш');
  // WS_TRIAL_FROM тавьсан бол тэр нь давамгайлна; буруу утга → anchor
  process.env.WS_TRIAL_FROM = '2026-01-01T00:00:00Z';
  assert.strictEqual(await WT.fromIso(), '2026-01-01T00:00:00.000Z');
  process.env.WS_TRIAL_FROM = 'not-a-date';
  assert.strictEqual(await WT.fromIso(), a);
  // Системийн хувьсагчийг ил гаргаагүй Vercel төсөл (VERCEL_ENV байхгүй) — серверлесс runtime дээр anchor үүснэ
  delete process.env.WS_TRIAL_FROM; delete process.env.VERCEL_ENV;
  F.db.trial.cfgFrom = null;
  process.env.AWS_LAMBDA_FUNCTION_NAME = 'fn-prod';
  WT._resetReady();
  try {
    assert.ok(await WT.fromIso(), 'lambda + VERCEL_ENV-гүй → anchor');
    assert.ok(F.db.trial.cfgFrom);
  } finally { delete process.env.AWS_LAMBDA_FUNCTION_NAME; }
  // anchor-ийн DB алдаа → туршилтгүй (fail-closed), нэвтрэлт/эрхэд нөлөөгүй
  WT._resetReady();
  F.db.trial.fail = true;
  const f = await status('post@x.mn');
  assert.deepStrictEqual([f.active, f.trial], [false, undefined]);
});

test('урилгын линкээр (SMS-гүй, утас батлагдаагүй) данс → туршилтгүй; cm_device сольсон, толгойгүй ч; хүний утсыг түрүүлж эзлэхгүй', async () => {
  // fake дээрх бодит урсгал: утасгүй 4 урилгын данс, cm_device бүрт өөр; 3 нь x-device-id толгойгүй
  for (let i = 0; i < 4; i++) acct('inv' + i + '@x.mn', { phone: null, phone_verified_at: null, invite: 'T' });
  for (let i = 0; i < 3; i++) acct('invnd' + i + '@x.mn', { phone: null, phone_verified_at: null, invite: 'T' });
  for (let i = 0; i < 4; i++) {
    const d = await status('inv' + i + '@x.mn', { dev: 'devinv00000000' + i });
    assert.deepStrictEqual([d.active, d.scope, d.trial], [false, null, undefined], 'inv' + i);
    assert.strictEqual(await WT.start('inv' + i + '@x.mn', req('devinv00000000' + i)), null);
  }
  for (let i = 0; i < 3; i++) {
    const d = await status('invnd' + i + '@x.mn', { dev: null });
    assert.deepStrictEqual([d.active, d.trial], [false, undefined], 'invnd' + i);
  }
  assert.strictEqual(F.db.trial.trials.size, 0, 'ws_trials-д юу ч бичигдэхгүй');
  assert.strictEqual(F.db.trial.marks.size, 0, 'dev:/ph: тэмдэг үүсэхгүй');
  // Урилгаар хүний (батлагдаагүй) утсыг бичсэн → 'ph:' эзлэхгүй; жинхэнэ эзэн SMS-ээр бүртгүүлбэл туршилт авна
  acct('squat@x.mn', { phone: '99135555', phone_verified_at: null, invite: 'T' });
  assert.strictEqual((await status('squat@x.mn', { dev: 'devsquat0000001' })).trial, undefined);
  acct('owner@x.mn', { phone: '99135555' });
  const o = await status('owner@x.mn', { dev: 'devowner0000001' });
  assert.deepStrictEqual([o.active, o.scope, o.trial.denied], [true, 'trial', null], 'жинхэнэ эзэн denied биш');
  // Урилгын данс дараа нь утсаа SMS-ээр баталбал (ws_reset → phone_verified_at) энгийн шинэ данс шиг — нэг утсанд нэг
  acct('invok@x.mn', { phone: '99135556', phone_verified_at: null, invite: 'T' });
  assert.strictEqual((await status('invok@x.mn', { dev: 'devinvok0000001' })).trial, undefined);
  F.db.wsLogin.get('invok@x.mn').phone_verified_at = new Date();
  assert.strictEqual((await status('invok@x.mn', { dev: 'devinvok0000001' })).scope, 'trial');
});

test('төлсөн хэрэглэгч шинэ имэйл: эрх АВСАН өөр данстай ижил утас → denied phone (өөр төхөөрөмжөөс ч); ижил cm_device → denied dev', async () => {
  const YEAR = 365 * 864e5;
  const devRow = (e, d) => F.db.devices.set(e + '|' + d, { email: e, device_id: d, label: 'PC', ua: '', ip: '10.0.0.1', fp: 'f', fp_changed_at: new Date(), first_seen: new Date(Date.now() - YEAR), last_seen: new Date() });
  // paid@x.mn: 1 жилийн өмнө бүх ангийн эрх авсан (одоо дууссан), утас 88001122, төхөөрөмж DEV (ws_devices)
  acct('paid@x.mn', { phone: '88001122', created_at: new Date(Date.now() - YEAR) });
  F.db.wsAccess.set('paid@x.mn', new Date(Date.now() - 30 * F.DAY));
  devRow('paid@x.mn', DEV);
  assert.strictEqual((await status('paid@x.mn')).trial, undefined, 'эрх авсан данс өөрөө туршилтгүй');
  acct('new1@x.mn', { phone: '88001122' });
  const s = await status('new1@x.mn', { dev: DEV });
  assert.deepStrictEqual([s.active, s.scope, s.trial.active, s.trial.denied, s.trial.seconds], [false, null, false, 'phone', 0]);
  // өөр төхөөрөмжөөс ч мөн адил (утас = хүн)
  acct('new2@x.mn', { phone: '88001122' });
  assert.strictEqual((await status('new2@x.mn', { dev: DEV2 })).trial.denied, 'phone');
  // төлсөн дансны төхөөрөмж дээр өөр (шинэ) утсаар → denied dev
  acct('new3@x.mn', { phone: '88001133' });
  const d3 = await status('new3@x.mn', { dev: DEV });
  assert.deepStrictEqual([d3.active, d3.trial.denied, d3.trial.seconds], [false, 'dev', 0]);
  // татгалзал тэмдэг бичихгүй — гэхдээ данс нэг удаагийн эрхээ зарцуулсан (дахин оролдоход denied хэвээр)
  assert.strictEqual(F.db.trial.marks.size, 0);
  assert.strictEqual((await status('new3@x.mn', { dev: 'devfresh0000001' })).trial.denied, 'dev');
  // ангийн эрх (ws_grade_access) авсан данс ч мөн адил — утас ба төхөөрөмж
  acct('gpaid@x.mn', { phone: '88001144' });
  F.db.wsGrade.push({ email: 'gpaid@x.mn', grade: '9-р анги', expires_at: new Date(Date.now() + 10 * F.DAY) });
  devRow('gpaid@x.mn', 'devgpaid0000001');
  acct('new4@x.mn', { phone: '88001144' });
  assert.strictEqual((await status('new4@x.mn', { dev: 'devnew40000001' })).trial.denied, 'phone');
  acct('new5@x.mn', { phone: '88001155' });
  assert.strictEqual((await status('new5@x.mn', { dev: 'devgpaid0000001' })).trial.denied, 'dev');
  // SMS-ээс өмнөх (имэйлээр баталгаажсан, phone_verified_at-гүй, урилгын бус) ЭРХТЭЙ хуучин данс — PHONE_TOO_MANY-тэй ижил: хаана
  acct('legacypaid@x.mn', { phone: '88002204', phone_verified_at: null, created_at: new Date(Date.now() - YEAR) });
  F.db.wsAccess.set('legacypaid@x.mn', new Date(Date.now() - YEAR / 2));
  acct('n4@x.mn', { phone: '88002204' });
  assert.strictEqual((await status('n4@x.mn', { dev: 'devn4000000001' })).trial.denied, 'phone');
  // PRIOR хаахгүй: эрхтэй ч баталгаажаагүй мөр (админ олгосон, бүртгэл дуусаагүй), урилгын батлагдаагүй утастай эрхтэй данс,
  // эрхгүй хуучин данс (туршилтаа хараахан эхлүүлээгүй)
  acct('unvpaid@x.mn', { phone: '88002201', verified: false, phone_verified_at: null, created_at: new Date(Date.now() - YEAR) });
  F.db.wsAccess.set('unvpaid@x.mn', new Date(Date.now() + 100 * F.DAY));
  acct('invpaid@x.mn', { phone: '88002202', phone_verified_at: null, invite: 'T', created_at: new Date(Date.now() - YEAR) });
  F.db.wsAccess.set('invpaid@x.mn', new Date(Date.now() + 100 * F.DAY));
  acct('oldfree@x.mn', { phone: '88002203', created_at: new Date(Date.now() - YEAR) });
  devRow('oldfree@x.mn', 'devoldfree00001');
  acct('n1@x.mn', { phone: '88002201' });
  acct('n2@x.mn', { phone: '88002202' });
  acct('n3@x.mn', { phone: '88002203' });
  assert.strictEqual((await status('n1@x.mn', { dev: 'devn1000000001' })).scope, 'trial', 'баталгаажаагүй эрхтэй мөр хаахгүй');
  assert.strictEqual((await status('n2@x.mn', { dev: 'devn2000000001' })).scope, 'trial', 'урилгын батлагдаагүй утас хаахгүй');
  assert.strictEqual((await status('n3@x.mn', { dev: 'devn3000000001' })).scope, 'trial', 'эрхгүй хуучин данстай ижил утас — PRIOR хаахгүй');
  acct('n5@x.mn', { phone: '88002205' });
  assert.strictEqual((await status('n5@x.mn', { dev: 'devoldfree00001' })).scope, 'trial', 'эрхгүй хуучин дансны төхөөрөмж — PRIOR хаахгүй');
  // …харин нэг утас / нэг төхөөрөмж = нэг туршилт: эрхгүй хуучин данс одоо орвол тэмдгээр denied
  const of = await status('oldfree@x.mn', { dev: 'devoldfree00001' });
  assert.deepStrictEqual([of.active, of.trial.denied, of.trial.seconds], [false, 'dev', 0]);
  // хариу/SQL: PRIOR нь зөвхөн туршилт ЭХЛЭХ үед (эхэлсэн туршилтын wsstatus-д ажиллахгүй)
  F.db.trial.queries.length = 0;
  await status('n3@x.mn', { dev: 'devn3000000001' });
  assert.deepStrictEqual(F.db.trial.queries, ['ELIG']);
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

test('төлсөн эрх (ws_access / өөрийн анги) → scope all/grade, туршилтын SQL огт ажиллахгүй; өөр ангийн хуудсанд туршилтгүй', async () => {
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
  const o = await status('gr@x.mn', { slug: G9 });                  // өөр ангийн хуудас — анги худалдаж авсан тул туршилтгүй
  assert.deepStrictEqual([o.active, o.scope, o.ws_token, o.trial], [false, null, null, undefined]);
  assert.strictEqual(F.db.trial.trials.size, 0);
  // туршилтын DB алдаа → туршилтгүй (fail-closed), төлсөн эрхэд нөлөөгүй
  acct('free@x.mn', { phone: '99160001' });
  F.db.trial.fail = true;
  const f1 = await status('free@x.mn', { dev: 'devfree00000001' });
  assert.deepStrictEqual([f1.active, f1.scope, f1.trial], [false, null, undefined]);
  const f2 = await status('paid@x.mn');
  assert.deepStrictEqual([f2.active, f2.scope], [true, 'all']);
  const f3 = await status('gr@x.mn', { slug: G6 });
  assert.deepStrictEqual([f3.active, f3.scope], [true, 'grade']);
  assert.ok(F.logs.some(l => /\[wstrial status\]/.test(l)));
  F.db.trial.fail = false;
  assert.strictEqual((await status('free@x.mn', { dev: 'devfree00000001' })).scope, 'trial', 'DB сэргэвэл эхэлнэ');
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
