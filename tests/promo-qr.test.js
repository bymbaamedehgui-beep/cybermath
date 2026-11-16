// Промо кодын QR — cm-promoqr.js (2026-11-16, эзэмшигч: «уншуулахад шууд эрх нь нээгдэх QR кодыг гаргаарай» — CYBERMATH2026):
//   нэвтэрсэн сурагч шууд ашиглана, нэвтрээгүй хүн мэдэгдэл харж бүртгүүлсний/нэвтэрсний дараа ашиглана, багшид зөвхөн бөглөнө.
// Ажиллуулах: node --test tests/promo-qr.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const Q = require('../cm-promoqr.js');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const SRC = R('cm-promoqr.js');

test('parseCode: зөвхөн ?promo=КОД-той текст, api/promo.js-ийн дүрмээр', () => {
  assert.strictEqual(Q.parseCode('https://cyber-math.com/?promo=cybermath2026'), 'CYBERMATH2026');
  assert.strictEqual(Q.parseCode('?promo=CYBERMATH2026&utm=fb'), 'CYBERMATH2026');
  assert.strictEqual(Q.parseCode('https://cyber-math.com/?a=1&promo=FR-2026_X#x'), 'FR-2026_X');
  assert.strictEqual(Q.parseCode(Q.promoUrl('CYBERMATH2026', 'https://cyber-math.com')), 'CYBERMATH2026');
  ['https://cyber-math.com/?class=CYBERMATH2026', 'CYBERMATH2026', '?promo=AB', '?promo=' + 'A'.repeat(31),
   '?promo=CYBER"><b>', '?promo=', '', null, undefined]
    .forEach(s => assert.strictEqual(Q.parseCode(s), '', String(s)));
});

/* Хуудасны хиймэл орчин: DOM-ийн хэрэгтэй хэсэг, хугацаа хэмжигч, «Промо» цонх */
function page(o) {
  o = o || {};
  const calls = { open: 0, redeem: [], auth: [] };
  const store = init => { const m = Object.assign({}, init); return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, m }; };
  const els = {}, timers = [];
  const mk = tag => ({ tag, id: '', style: {}, children: [], textContent: '', parentNode: null,
    appendChild(c) { this.children.push(c); c.parentNode = this; if (c.id) els[c.id] = c; return c; },
    insertBefore(c) { this.children.unshift(c); c.parentNode = this; if (c.id) els[c.id] = c; return c; },
    removeChild(c) { this.children = this.children.filter(x => x !== c); c.parentNode = null; if (c.id) delete els[c.id]; } });
  const right = mk('div'), body = mk('body');
  els['auth-tab-bar'] = Object.assign(mk('div'), { parentNode: right });
  els['promo-input'] = Object.assign(mk('input'), { value: '' });
  const loc = new URL(o.url || 'https://cyber-math.com/');
  const location = { get href() { return loc.href; }, get search() { return loc.search; }, get origin() { return loc.origin; } };
  const win = {
    location, _currentUser: o.user || null, _cmLoginDone: !!o.loginDone,
    history: { replaceState(_s, _t, u) { const n = new URL(u, loc.href); loc.pathname = n.pathname; loc.search = n.search; loc.hash = n.hash; } },
    openPromoModal() { calls.open++; els['promo-input'].value = ''; },
    redeemPromo() { calls.redeem.push(els['promo-input'].value); },
    openAuthModal(t) { calls.auth.push(t); },
  };
  if (o.noModal) { delete win.openPromoModal; delete win.redeemPromo; }
  const ses = store(o.session), loc2 = store(o.local);
  const listeners = [];
  const doc = { readyState: o.readyState || 'complete', body, getElementById: id => els[id] || null, createElement: mk,
    addEventListener(ev, fn) { listeners.push([ev, fn]); } };
  const ctx = { window: win, sessionStorage: ses, localStorage: loc2, URL, navigator: {}, console, document: doc,
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout() {} };
  vm.runInNewContext(SRC, ctx);
  return { win, els, calls, ses, doc, listeners, url: () => loc.pathname + loc.search, settle: () => timers.splice(0).forEach(fn => fn()) };
}
const STUDENT = { email: 'sar@example.com', role: 'student', grade: '9' };
const noticeText = p => p.els['pq-invite'].children.map(c => c.textContent).join(' | ');

test('нэвтэрсэн сурагч холбоосоор орвол «Промо» цонх кодтой нээгдэж шууд ашиглана, хаягаас арилна, нэг л удаа', () => {
  const p = page({ url: 'https://cyber-math.com/?promo=cybermath2026', user: STUDENT });
  p.settle();
  assert.deepStrictEqual(p.calls.auth, [], 'нэвтэрсэн бол нэвтрэх цонх нээхгүй');
  p.win.cmPromoQr.afterLogin();
  assert.strictEqual(p.calls.open, 1);
  assert.deepStrictEqual(p.calls.redeem, ['CYBERMATH2026']);
  assert.strictEqual(p.url(), '/');
  p.win.cmPromoQr.afterLogin();
  assert.strictEqual(p.calls.redeem.length, 1, '_onLogin дахин дуудагдвал давтахгүй');
});

test('QR-гүй ердийн нэвтрэлтэд юу ч хийхгүй', () => {
  const p = page({ user: STUDENT });
  p.win.cmPromoQr.afterLogin();
  assert.strictEqual(p.calls.open, 0);
  assert.deepStrictEqual(p.calls.redeem, []);
});

test('багш (role эсвэл grade): код бөглөгдсөн цонх нээгдэх ч өөрөө ашиглахгүй', () => {
  [{ email: 't@example.com', role: 'teacher' }, { email: 't@example.com', grade: 'teacher' }].forEach(user => {
    const p = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026', user });
    p.win.cmPromoQr.afterLogin();
    assert.strictEqual(p.calls.open, 1);
    assert.strictEqual(p.els['promo-input'].value, 'CYBERMATH2026');
    assert.deepStrictEqual(p.calls.redeem, []);
    assert.strictEqual(p.url(), '/');
  });
});

test('бүртгэлгүй хүн: код хадгалагдаж, мэдэгдэл + бүртгэлийн цонх; бүртгүүлмэгц ашиглана', () => {
  const p = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026' });
  assert.strictEqual(p.ses.m.cm_pending_promo, 'CYBERMATH2026');
  p.settle();
  assert.deepStrictEqual(p.calls.auth, ['register']);
  assert.match(noticeText(p), /Урамшууллын код: CYBERMATH2026/);
  assert.match(noticeText(p), /автоматаар идэвхжинэ/);
  assert.strictEqual(p.url(), '/?promo=CYBERMATH2026', 'нэвтрэх хүртэл хаяг хэвээр (дахин ачаалж болно)');
  assert.deepStrictEqual(p.calls.redeem, []);
  p.win._currentUser = STUDENT;
  p.win.cmPromoQr.afterLogin();
  assert.deepStrictEqual(p.calls.redeem, ['CYBERMATH2026']);
  assert.strictEqual(p.ses.m.cm_pending_promo, undefined);
  assert.strictEqual(p.els['pq-invite'], undefined, 'мэдэгдэл цонхноос арилна');
  assert.strictEqual(p.url(), '/');
});

test('хаяг алдагдсан ч (Google-ээр нэвтрэх г.м.) хадгалсан кодоор ашиглана', () => {
  const p = page({ session: { cm_pending_promo: 'CYBERMATH2026' }, user: STUDENT });
  p.win.cmPromoQr.afterLogin();
  assert.deepStrictEqual(p.calls.redeem, ['CYBERMATH2026']);
});

test('энэ төхөөрөмжөөр өмнө нэвтэрсэн бол нэвтрэх цонх нээгдэнэ', () => {
  const p = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026', local: { cm_last_user: 'old@example.com' } });
  p.settle();
  assert.deepStrictEqual(p.calls.auth, ['login']);
});

test('«Промо» цонх ачаалагдаагүй бол кодыг хадгалсаар үлдээнэ', () => {
  const p = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026', user: STUDENT, noModal: true });
  p.win.cmPromoQr.afterLogin();
  assert.strictEqual(p.url(), '/?promo=CYBERMATH2026');
});

test('_onLogin модулиас түрүүлсэн бол (утсанд defer скрипт хожуу) init өөрөө ашиглана; эс бөгөөс _onLogin-ийг хүлээнэ', () => {
  const late = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026', user: Object.assign({}, STUDENT), loginDone: true });
  assert.deepStrictEqual(late.calls.redeem, ['CYBERMATH2026']);
  assert.strictEqual(late.url(), '/');
  const early = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026', user: STUDENT });
  early.settle();
  assert.deepStrictEqual(early.calls.redeem, [], '_onLogin → afterLogin хүлээнэ');
  assert.deepStrictEqual(early.calls.auth, []);
});

test('хуудас задлагдаж дуусаагүй үед _onLogin ирвэл (утсанд) DOMContentLoaded-ийн дараа ашиглана', () => {
  const p = page({ url: 'https://cyber-math.com/?promo=CYBERMATH2026', user: STUDENT, noModal: true, readyState: 'loading' });
  const modal = { open: p.win.openPromoModal, redeem: p.win.redeemPromo };
  p.win.cmPromoQr.afterLogin();
  const ready = p.listeners.filter(l => l[0] === 'DOMContentLoaded' && l[1] === p.win.cmPromoQr.afterLogin);
  assert.strictEqual(ready.length, 1);
  assert.deepStrictEqual(p.calls.redeem, []);
  p.win.openPromoModal = () => { p.calls.open++; p.els['promo-input'].value = ''; };
  p.win.redeemPromo = () => { p.calls.redeem.push(p.els['promo-input'].value); };
  p.doc.readyState = 'interactive';
  ready[0][1]();
  assert.deepStrictEqual(p.calls.redeem, ['CYBERMATH2026']);
  assert.strictEqual(p.url(), '/');
  assert.strictEqual(modal.open, undefined);
});

test('cm-promoqr.js: кодыг HTML-ээр бичихгүй, шагналыг клиент өгөхгүй, эможи/шар хайрцаггүй', () => {
  assert.doesNotMatch(SRC, /innerHTML/);
  assert.doesNotMatch(SRC.replace(/^\/\*[\s\S]*?\*\//, ''), /fetch\(|authFetch|premium/i, 'шагналыг зөвхөн redeemPromo → /api/promo');
  assert.doesNotMatch(SRC, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.doesNotMatch(SRC, /#FFC800|#FFF3|#FEF3C7|#fff8e/i);
});

test('index.html / vercel.json холболт', () => {
  const html = R('index.html').replace(/\r\n/g, '\n');
  assert.match(html, /<script src="\/cm-promoqr\.js\?v=\d+" defer><\/script>/);
  const v = JSON.parse(R('vercel.json'));
  assert.ok(v.builds.some(b => b.src === 'cm-promoqr.js' && b.use === '@vercel/static'), 'шинэ статик файлын build entry');
  const onLogin = html.slice(html.indexOf('function _onLogin()'), html.indexOf('// URL-аас Mathlet room code-ийг шалгах'));
  assert.match(onLogin, /window\.cmPromoQr\.afterLogin\(\)/, '_onLogin бүх нэвтрэх замын нэгдэх цэг');
  assert.match(onLogin, /window\._cmLoginDone = true;/, 'defer модуль _onLogin-оос хожуу ачаалагдах үед');
  assert.match(html, /window\.openPromoModal = function\(\)/);
  assert.match(html, /window\.redeemPromo = function\(\)/);
  assert.match(html, /<input id="promo-input"/);
});
