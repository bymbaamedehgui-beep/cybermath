// Нүүр сонголт (index.html #cm-pick): cyber-math.com руу ороход «Тоглоомын төв · Дасгалын төв»-ийн аль нэгийг сонгоно (2026-11-06).
//   - "/"-д шууд орсон үед л гарна: query/hash, iframe/embed, суулгасан апп (standalone), энэ табад «Тоглоомын төв» сонгосон бол гарахгүй
//   - «Дасгалын төв» → /dasgal (танилцуулга, энгийн холбоос), «Тоглоомын төв» → сонголтыг хааж landing/апп хэвээр
// Ажиллуулах: node --test tests/entry-pick.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const i0 = html.indexOf('<!-- ═══ Нүүр сонголт'), i1 = html.indexOf('<!-- ═══ /Нүүр сонголт ═══ -->');
const blk = i0 >= 0 && i1 > i0 ? html.slice(i0, i1) : '';

test('index.html: сонголтын дэлгэц <body>-ийн эхэнд, splash-аас өмнө', () => {
  assert.ok(blk, 'блок олдсонгүй');
  const b = html.indexOf('<body>'), sp = html.indexOf('<div id="cm-splash"');
  assert.ok(b < i0 && i1 < sp, 'байрлал: <body> → сонголт → splash');
  assert.strictEqual((html.match(/id="cm-pick"/g) || []).length, 1);
});

test('сонголт: гарах нөхцөл ба товчнууд', () => {
  assert.match(blk, /window\.top !== window\.self \|\| d\.classList\.contains\('cm-embed'\)/, 'iframe/embed-д гарахгүй');
  assert.match(blk, /if \(L\.search \|\| \(L\.hash && L\.hash\.length > 1\)\) return;/, 'query/hash-тай холбоост гарахгүй');
  assert.match(blk, /display-mode: standalone/, 'суулгасан апп-д гарахгүй');
  assert.match(blk, /sessionStorage\.getItem\('cm_center'\)/);
  assert.match(blk, /if \(c === 'game'\) return;/, 'энэ табад тоглоомын төв сонгосон бол дахин асуухгүй');
  assert.match(blk, /data-pick="game"[\s\S]*Тоглоомын төв/);
  assert.match(blk, /href="\/dasgal" data-pick="ws"[\s\S]*Дасгалын төв/, 'Дасгалын төв → /dasgal (танилцуулга)');
  assert.doesNotMatch(blk, /href="\/worksheets"/);
  assert.match(blk, /html\.cm-pick #cm-splash \{ display: none !important; \}/, 'сонголт гарахад splash нуугдана');
  assert.doesNotMatch(blk, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, 'эможи бүү');
});

test('сонголтын inline скриптүүд синтакс алдаагүй', () => {
  const re = /<script>([\s\S]*?)<\/script>/g; let m, n = 0;
  while ((m = re.exec(blk))) { new Function(m[1]); n++; }
  assert.strictEqual(n, 2);
});
