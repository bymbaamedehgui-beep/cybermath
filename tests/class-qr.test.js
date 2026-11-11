// Ангид QR-аар нэгдэх — cm-classqr.js (2026-11-11, эзэмшигч: «ангид нэгдэхдээ давхар QR уншуулдаг байлгая. Энэ QR нь бүртгүүлээгүй
//   хүнд давхар урилгын QR болдог байх ёстой»): нэвтэрсэн сурагч шууд нэгдэнэ, нэвтрээгүй хүн урилга харж бүртгүүлсний/нэвтэрсний дараа нэгдэнэ.
// Ажиллуулах: node --test tests/class-qr.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Q = require('../cm-classqr.js');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SRC = R('cm-classqr.js');

test('parseCode: зөвхөн ?class=КОД-той текст', () => {
  assert.strictEqual(Q.parseCode('https://cyber-math.com/?class=k7m2qx'), 'K7M2QX');
  assert.strictEqual(Q.parseCode('?class=K7M2QX&utm=1'), 'K7M2QX');
  assert.strictEqual(Q.parseCode('https://cyber-math.com/?a=1&class=K7M2QX#x'), 'K7M2QX');
  assert.strictEqual(Q.parseCode('https://cyber-math.com/?class=K7M2QX7'), 'K7M2QX7', 'давхцлын үед код 7 тэмдэгт болдог');
  assert.strictEqual(Q.parseCode(Q.joinUrl('K7M2QX', 'https://cyber-math.com')), 'K7M2QX');
  ['https://cyber-math.com/?mathlet=K7M2QX', 'K7M2QX', 'student@example.com', '?class=ABC', '?class=K7M2QX"><b>', '?class=', '', null, undefined]
    .forEach(s => assert.strictEqual(Q.parseCode(s), '', String(s)));
});

/* Хуудасны хиймэл орчин: DOM-ийн хэрэгтэй хэсэг, хугацаа хэмжигч, fetch */
function page(o) {
  o = o || {};
  const calls = { join: [], auth: [], toast: [], fetch: [], tab: 0, cb: null };
  const store = init => { const m = Object.assign({}, init); return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, m }; };
  const els = {}, timers = [];
  const mk = tag => ({ tag, id: '', style: {}, children: [], textContent: '', parentNode: null,
    appendChild(c) { this.children.push(c); c.parentNode = this; if (c.id) els[c.id] = c; return c; },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; if (c.id) els[c.id] = c; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; if (c.id) delete els[c.id]; } });
  const right = mk('div'), body = mk('body');
  els['auth-tab-bar'] = Object.assign(mk('div'), { parentNode: right });
  els['join-code-input'] = Object.assign(mk('input'), { value: '' });
  els['reg-grade'] = Object.assign(mk('select'), { value: '', options: ['', '1', '9', '12'].map(value => ({ value })) });
  els['tab-btn-classroom'] = Object.assign(mk('button'), { click() { calls.tab++; } });
  const loc = new URL(o.url || 'https://cyber-math.com/');
  const location = { get href() { return loc.href; }, get search() { return loc.search; }, get origin() { return loc.origin; } };
  const win = {
    location, _currentUser: o.user || null, _myClassrooms: [],
    history: { replaceState(_s, _t, u) { const n = new URL(u, loc.href); loc.pathname = n.pathname; loc.search = n.search; loc.hash = n.hash; } },
    openJoinClassroom() { els['join-code-input'].value = ''; },
    doJoinClassroom(cb) { calls.join.push(els['join-code-input'].value); calls.cb = cb; },
    openAuthModal(t) { calls.auth.push(t); },
    showToast(t) { calls.toast.push(t); },
  };
  const ses = store(o.session), loc2 = store(o.local);
  const ctx = { window: win, sessionStorage: ses, localStorage: loc2, URL, navigator: {}, console,
    document: { readyState: 'complete', body, getElementById: id => els[id] || null, createElement: mk, addEventListener() {} },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {},
    fetch: u => { calls.fetch.push(u); return Promise.resolve(o.reply || { status: 200, ok: true, json: () => Promise.resolve({ ok: true, classroom: { name: '9А анги', grade: '9' } }) }); } };
  vm.runInNewContext(SRC, ctx);
  return { win, els, calls, ses, body, url: () => loc.pathname + loc.search,
    micro: () => new Promise(r => setImmediate(r)),
    settle: async () => { await new Promise(r => setImmediate(r)); timers.splice(0).forEach(fn => fn()); } };
}
const STUDENT = { email: 'sar@example.com', role: 'student', grade: '9' };
const noticeText = p => p.els['cq-invite'].children.map(c => c.textContent).join(' | ');

test('нэвтэрсэн сурагч холбоосоор орвол шууд нэгдэж, ангийн таб нээгдэнэ, хаягаас арилна, нэг л удаа', () => {
  const p = page({ url: 'https://cyber-math.com/?class=k7m2qx', user: STUDENT });
  assert.deepStrictEqual(p.calls.fetch, [], 'нэвтэрсэн бол урилга татахгүй');
  p.win.cmClassQr.afterLogin();
  assert.deepStrictEqual(p.calls.join, ['K7M2QX']);
  assert.strictEqual(p.url(), '/');
  assert.strictEqual(p.calls.tab, 0, 'нэгдсэний дараа л таб солино');
  p.calls.cb();
  assert.strictEqual(p.calls.tab, 1);
  p.win.cmClassQr.afterLogin();
  assert.strictEqual(p.calls.join.length, 1, '_onLogin дахин дуудагдвал давтахгүй');
});

test('QR-гүй ердийн нэвтрэлтэд юу ч хийхгүй', () => {
  const p = page({ user: STUDENT });
  p.win.cmClassQr.afterLogin();
  assert.deepStrictEqual(p.calls.join, []);
  assert.deepStrictEqual(p.calls.toast, []);
});

test('багш (role эсвэл grade) QR нээвэл ангид нэгдэхгүй', () => {
  [{ email: 't@example.com', role: 'teacher' }, { email: 't@example.com', grade: 'teacher' }].forEach(user => {
    const p = page({ url: 'https://cyber-math.com/?class=K7M2QX', user });
    p.win.cmClassQr.afterLogin();
    assert.deepStrictEqual(p.calls.join, []);
    assert.strictEqual(p.calls.toast.length, 1);
    assert.strictEqual(p.url(), '/');
  });
});

test('бүртгэлгүй хүн: код хадгалагдаж, урилга + бүртгэлийн цонх + анги бөглөгдөнө; бүртгүүлмэгц нэгдэнэ', async () => {
  const p = page({ url: 'https://cyber-math.com/?class=K7M2QX' });
  assert.deepStrictEqual(p.calls.fetch, ['/api/classroom?join_code=K7M2QX']);
  assert.strictEqual(p.ses.m.cm_pending_class, 'K7M2QX');
  await p.settle(); await p.settle();
  assert.deepStrictEqual(p.calls.auth, ['register']);
  assert.match(noticeText(p), /Ангийн урилга: 9А анги/);
  assert.match(noticeText(p), /автоматаар нэгдэнэ/);
  assert.strictEqual(p.els['reg-grade'].value, '9');
  assert.strictEqual(p.url(), '/?class=K7M2QX', 'нэвтрэх хүртэл хаяг хэвээр (дахин ачаалж болно)');
  assert.deepStrictEqual(p.calls.join, []);
  p.win._currentUser = STUDENT;
  p.win.cmClassQr.afterLogin();
  assert.deepStrictEqual(p.calls.join, ['K7M2QX']);
  assert.strictEqual(p.ses.m.cm_pending_class, undefined);
  assert.strictEqual(p.els['cq-invite'], undefined, 'урилга цонхноос арилна');
  assert.strictEqual(p.url(), '/');
});

test('хаяг алдагдсан ч хадгалсан кодоор нэгдэнэ', () => {
  const p = page({ session: { cm_pending_class: 'K7M2QX' }, user: STUDENT });
  p.win.cmClassQr.afterLogin();
  assert.deepStrictEqual(p.calls.join, ['K7M2QX']);
});

test('энэ төхөөрөмжөөр өмнө нэвтэрсэн бол нэвтрэх цонх нээгдэнэ', async () => {
  const p = page({ url: 'https://cyber-math.com/?class=K7M2QX', local: { cm_last_user: 'old@example.com' } });
  await p.settle(); await p.settle();
  assert.deepStrictEqual(p.calls.auth, ['login']);
});

test('цонхонд байхгүй анги бөглөхгүй', async () => {
  const p = page({ url: 'https://cyber-math.com/?class=K7M2QX', reply: { status: 200, ok: true, json: () => Promise.resolve({ ok: true, classroom: { name: 'Дугуйлан', grade: '' } }) } });
  await p.settle(); await p.settle();
  assert.strictEqual(p.els['reg-grade'].value, '');
});

test('хүчингүй код (404): урилга гарахгүй, код устана, мэдэгдэл', async () => {
  const p = page({ url: 'https://cyber-math.com/?class=K7M2QX', reply: { status: 404, ok: false, json: () => Promise.resolve({ ok: false }) } });
  await p.micro();                                    // мэдэгдлийг 7 секундын дараа арилгах хугацаа хэмжигч ажиллахаас өмнө
  assert.deepStrictEqual(p.calls.auth, []);
  assert.strictEqual(p.ses.m.cm_pending_class, undefined);
  assert.strictEqual(p.url(), '/');
  assert.match(p.body.children[0].textContent, /хүчингүй/);
});

test('серверийн түр алдаа: код хадгалагдаж, нэргүй урилгаар үргэлжилнэ', async () => {
  const p = page({ url: 'https://cyber-math.com/?class=K7M2QX', reply: { status: 500, ok: false, json: () => Promise.resolve({}) } });
  await p.settle(); await p.settle();
  assert.deepStrictEqual(p.calls.auth, ['register']);
  assert.strictEqual(p.ses.m.cm_pending_class, 'K7M2QX');
  assert.match(noticeText(p), /^Ангийн урилга \|/);
});

test('cm-classqr.js: нэрийг HTML-ээр бичихгүй, админы урилгын эрх өгөхгүй, эможи/шар хайрцаггүй', () => {
  assert.doesNotMatch(SRC, /innerHTML[^;]*c\.name/);
  assert.match(SRC, /byId\('cq-name'\)\.textContent = c\.name/);
  assert.doesNotMatch(SRC.replace(/^\/\*[\s\S]*?\*\//, ''), /inviteToken|_inviteToken/, 'SMS баталгаажуулалтыг алгасахгүй');
  assert.doesNotMatch(SRC, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.doesNotMatch(SRC, /#FFC800|#FFF3|#FEF3C7|#fff8e/i);
});

test('index.html / vercel.json холболт', () => {
  const html = R('index.html').replace(/\r\n/g, '\n');
  assert.match(html, /<script src="\/cm-classqr\.js\?v=\d+" defer><\/script>/);
  const v = JSON.parse(R('vercel.json'));
  assert.ok(v.builds.some(b => b.src === 'cm-classqr.js' && b.use === '@vercel/static'), 'шинэ статик файлын build entry');
  const onLogin = html.slice(html.indexOf('function _onLogin()'), html.indexOf('// URL-аас Mathlet room code-ийг шалгах'));
  assert.match(onLogin, /window\.cmClassQr\.afterLogin\(\)/, '_onLogin бүх нэвтрэх замын нэгдэх цэг');
  assert.match(html, /onclick="cmClassQr\.startScan\(\)"/);
  assert.match(html, /<video id="join-qr-video" playsinline muted/, 'iPhone-д playsinline заавал');
  assert.strictEqual((html.match(/cmClassQr\.showById\(/g) || []).length, 2, 'ангийн карт + дэлгэрэнгүй');
  assert.doesNotMatch(html, /onclick="document\.getElementById\('join-classroom-modal'\)/, '✕ камерыг унтраах ёстой');
  const fn = html.slice(html.indexOf('function closeJoinClassroom'), html.indexOf('window.closeClassroomDetailModal'));
  assert.match(fn, /cmClassQr\.stopScan\(\)/);
  assert.match(fn, /function doJoinClassroom\(onJoined\)/);
  assert.match(fn, /if \(typeof onJoined === 'function'\) onJoined\(\); else loadStudentClassroom\(\);/);
  assert.match(fn, /\.catch\(function\(\)\{ err\.textContent/);
});

function classroomApi(query) {
  const db = require.resolve('../api/_db.js'), mod = require.resolve('../api/classroom.js');
  require.cache[db] = { id: db, filename: db, loaded: true, exports: { query } };
  delete require.cache[mod];
  return require('../api/classroom.js');
}
function call(h, req) {
  return new Promise(resolve => {
    const res = { code: 200, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { resolve({ code: this.code, body: b }); }, end() { resolve({ code: this.code }); } };
    h(req, res);
  });
}

test('API: урилгын хайлт багшийн имэйл буцаахгүй, олдоогүй бол 404', async () => {
  const seen = [];
  const h = classroomApi(async (sql, v) => { seen.push([sql, v]); return { rows: v[0] === 'K7M2QX' ? [{ name: '9А анги', grade: '9', join_code: 'K7M2QX' }] : [] }; });
  const ok = await call(h, { method: 'GET', query: { join_code: 'k7m2qx' } });
  assert.deepStrictEqual(ok.body.classroom, { name: '9А анги', grade: '9', join_code: 'K7M2QX' });
  assert.doesNotMatch(seen[0][0], /SELECT \*|teacher_email/);
  const no = await call(h, { method: 'GET', query: { join_code: 'NOPE00' } });
  assert.strictEqual(no.code, 404);
});

test('API: QR-ыг дахин уншуулахад гишүүн давхардахгүй (UNIQUE-гүй хүснэгтэд ч)', async () => {
  const members = [];
  const h = classroomApi(async (sql, v) => {
    if (/SELECT \* FROM classrooms WHERE join_code/.test(sql)) return { rows: [{ id: 7, name: '9А анги', join_code: v[0] }] };
    if (/SELECT 1 FROM class_members/.test(sql)) return { rows: members.filter(m => m[0] === v[0] && m[1] === v[1]) };
    if (/INSERT INTO class_members/.test(sql)) { members.push(v); return { rows: [] }; }
    return { rows: [] };
  });
  const req = { method: 'POST', query: {}, body: { action: 'join', student_email: 'sar@example.com', join_code: 'k7m2qx' } };
  for (let i = 0; i < 2; i++) { const r = await call(h, req); assert.strictEqual(r.body.ok, true); assert.strictEqual(r.body.classroom.name, '9А анги'); }
  assert.deepStrictEqual(members, [[7, 'sar@example.com']]);
});
