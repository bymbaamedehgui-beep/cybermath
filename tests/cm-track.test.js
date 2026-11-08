// Суралцах сессийн бүртгэл ба багшийн оноосон тестийн хамгаалалт — cm-track.js (2026-11-08).
//   - Бодлогын логикийг өөрчлөхгүй (зөвхөн #quiz-modal / #quiz-content-ийг ажиглана), embed-д ажиллахгүй
//   - Хамгаалалт зөвхөн багшийн оноосон (cls_… ба даалгаврын хичээл) үед: усан тэмдэг, бүдгэрүүлэх, хуулах/баруун товч/хэвлэх, PrtSc
//   - Багшийн тайлан: «Хугацаа ба оролцоо» товч ангийн дэлгэрэнгүйд, /api/sessions
// Ажиллуулах: node --test tests/cm-track.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('index.html'), js = R('cm-track.js'), v = JSON.parse(R('vercel.json'));

test('холболт: index.html script + ангийн дэлгэрэнгүйн товч, vercel build + /api/sessions route', () => {
  assert.match(html, /<script src="\/cm-track\.js\?v=\d+" defer><\/script>/);
  assert.match(html, /onclick="window\.cmShowClassTime &amp;&amp; cmShowClassTime\(_currentClassroomId\)"/);
  assert.ok(v.builds.some(b => b.src === 'cm-track.js'));
  assert.ok(v.routes.some(r => r.src === '/api/sessions' && r.dest === '/api/sessions.js'));
});

test('cm-track.js: синтакс, embed хамгаалалт, сайтын функцийг дарж бичихгүй, эможигүй', () => {
  new Function(js);
  assert.match(js, /window\.top !== window\.self \|\| H\.classList\.contains\('cm-embed'\)/);
  assert.doesNotMatch(js, /\b(renderQuestion|checkAnswer|selectOption|showResults|nextQuestion|closeModal|openLesson|tryOpenLesson)\s*=(?!=)/);
  assert.doesNotMatch(js, /mathVirtualKeyboard/, 'MathLive гарт хүрэхгүй');
  assert.doesNotMatch(js, /[\u{1F300}-\u{1FAFF}✅❌✕]/u, 'эможи/✕ бүү');
});

test('Бүртгэл: зөвхөн нэвтэрсэн сурагч, сесс бүр эхлэх/минут тутам/дуусах үед, keepalive + Bearer', () => {
  assert.match(js, /function isStudent\(\) \{ var u = user\(\); return !!\(u && u\.email && u\.role !== 'teacher' && u\.grade !== 'teacher'\); \}/);
  assert.match(js, /fetch\('\/api\/sessions\?action=log', \{ method: 'POST', keepalive: true, headers: \{ 'Content-Type': 'application\/json', 'Authorization': 'Bearer ' \+ t \}/);
  assert.match(js, /setInterval\(function \(\) \{ if \(S\) \{ tick\(\); send\(\); \} \}, HB\)/);
  assert.match(js, /window\.addEventListener\('pagehide'/);
  assert.match(js, /if \(content\.querySelector\('\.results-card'\)\) stop\(true\);/, 'дүнгийн дэлгэц = дууссан');
  assert.match(js, /else if \(S\) stop\(false\);/, 'дуусахаас өмнө хаавал = дундаас хаасан');
  // iframe дотор фокус шилжвэл «гарсан» биш (hasFocus) — 120мс хүлээж шалгана
  assert.match(js, /function active\(\) \{ return d\.visibilityState === 'visible' && d\.hasFocus\(\); \}/);
});

test('Хамгаалалт зөвхөн багшийн оноосон үед: ангийн хичээл ба даалгаврын хичээл', () => {
  assert.match(js, /function assigned\(id\) \{ return String\(id\)\.indexOf\('cls_'\) === 0 \|\| !!\(CH && CH\[String\(parseInt\(id, 10\)\)\]\); \}/);
  assert.match(js, /action: 'getChallenges'/);
  assert.match(js, /if \(S\.secure\) secureOn\(\);/);
  // усан тэмдэг (нэр, и-мэйл, цаг), бүдгэрүүлэх, хэвлэх хаах, PrtSc, хуулах/баруун товч
  assert.match(js, /el\('cm-wm'\)\.style\.backgroundImage = wmUrl\(\[who, u\.email, stamp\(\)\]/);
  assert.match(js, /html\.cm-sec-hide #quiz-content\{filter:blur\(16px\)\}/);
  assert.match(js, /@media print\{html\.cm-secure body\{display:none!important\}\}/);
  assert.match(js, /e\.key === 'PrintScreen'/);
  assert.match(js, /\['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'\]/);
  assert.match(js, /if \(!H\.classList\.contains\('cm-secure'\) \|\| !modal \|\| isField\(e\.target\) \|\| !modal\.contains\(e\.target\)\) return;/, 'бичих талбар, бусад хэсэгт хөндөхгүй');
});

test('Багшийн тайлан: хичээл/тест, нээсэн, дундаас хаасан, цонхноос гарсан, зураг авах; 7/30/бүгд; CSV', () => {
  ['Хичээл', 'Тест', 'Нээсэн', 'Дундаас хаасан', 'Цонхноос гарсан', 'Зураг авах'].forEach(t => assert.ok(js.indexOf('<th>' + t + '</th>') >= 0, t));
  assert.match(js, /data-days="7">7 хоног/); assert.match(js, /data-days="30">30 хоног/); assert.match(js, /data-days="0">Бүгд/);
  assert.match(js, /apiGet\('action=class&classroom_id='/);
  assert.match(js, /apiGet\('action=student&classroom_id='/);
  assert.match(js, /data-a="csv">CSV татах/);
});
