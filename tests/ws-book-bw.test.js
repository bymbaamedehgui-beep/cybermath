// Дасгал ажлын дэвтэр — «Хар цагаан» (эзэмшигч 2026-11-16: «хараар хэвлүүлэхэд бэлдэж янзал. өнгөт хар гэдгээ сонгодог …
// Хавтас буюу урд хойд хуудас өнгөтөөрөө») ба цахим номын холбоос (/devter/<анги>).
// Ажиллуулах: node --test tests/ws-book-bw.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const R = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const src = R('ws-book.js'), br = R('ws-browse.js'), css = R('ws-browse.css');
function load() { const win = { WSB: {} }; win.window = win; vm.runInNewContext(src, win); return win.WSBOOK; }
const main = load()._main.toString();

// Тестийн canvas: hex / rgb(a) / цөөн нэртэй өнгийг хөтөч шиг ('#rrggbb' эсвэл 'rgba(r, g, b, a)') хэвшүүлнэ, бусдыг хүлээж авахгүй
function fakeDoc() {
  const NAMES = { red: [255, 0, 0], white: [255, 255, 255], purple: [128, 0, 128], black: [0, 0, 0] };
  const hex2 = (n) => ('0' + n.toString(16)).slice(-2);
  const ctx = { _v: '#000000' };
  Object.defineProperty(ctx, 'fillStyle', {
    get() { return this._v; },
    set(s) {
      s = String(s).trim().toLowerCase(); let c = null, m;
      if ((m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(s))) c = [m[1] + m[1], m[2] + m[2], m[3] + m[3]].map((h) => parseInt(h, 16)).concat(1);
      else if ((m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/.exec(s))) c = [m[1], m[2], m[3]].map((h) => parseInt(h, 16)).concat(1);
      else if ((m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(s))) c = [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      else if (NAMES[s]) c = NAMES[s].concat(1);
      if (!c) return;
      this._v = c[3] < 1 ? 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + c[3] + ')' : '#' + hex2(c[0]) + hex2(c[1]) + hex2(c[2]);
    } });
  return { createElement: () => ({ getContext: () => ctx }) };
}
const BWsrc = main.slice(main.indexOf('var BW = {'), main.indexOf('function bwDecl('));
const K = new Function('document', BWsrc + '; return { bwStr: bwStr, BW_COVER: BW_COVER, BW_PROP: BW_PROP };')(fakeDoc());

test('өнгө → саарал (Rec.601): hex, rgb(a), нэртэй өнгө, градиент; url(), var(--red), currentColor, transparent хөндөгдөхгүй', () => {
  assert.strictEqual(K.bwStr('#7B52EE'), 'rgb(112, 112, 112)', 'ягаан — цагаан бичиг уншигдах бараан саарал');
  assert.strictEqual(K.bwStr('#fff'), 'rgb(255, 255, 255)');
  assert.strictEqual(K.bwStr('rgba(255, 0, 0, 0.5)'), 'rgba(76, 76, 76, 0.5)', 'тунгалаг хэвээр');
  assert.strictEqual(K.bwStr('1px solid red'), '1px solid rgb(76, 76, 76)');
  assert.strictEqual(K.bwStr('linear-gradient(135deg, rgb(123, 82, 238), #FFC93C)'), 'linear-gradient(135deg, rgb(112, 112, 112), rgb(201, 201, 201))');
  assert.strictEqual(K.bwStr('url(#red) no-repeat, url("img/red.png")'), 'url(#red) no-repeat, url("img/red.png")');
  assert.strictEqual(K.bwStr('var(--red, purple)'), 'var(--red, rgb(53, 53, 53))', 'хувьсагчийн нэр хөндөгдөхгүй');
  ['currentcolor', 'currentColor', 'transparent', 'none', 'inherit', '0 0 0 1.5px'].forEach((v) => assert.strictEqual(K.bwStr(v), v, v));
});

test('нүүр/арын хавтасны дүрэм өнгөтөөрөө; өнгөтэй шинжүүд', () => {
  ['.cover .cv-kick', '.cv-c .c-spine:after', '#cover', '#backcover h1', '.b5 .cvz', '.fp-pg>.cover,.fp-pg>.fm'].forEach((s) => assert.ok(K.BW_COVER.test(s), s));
  ['.toc h2', '.wsx-paper .ev-st', '.fm-imp-h', '.q::before', '.cb-3'].forEach((s) => assert.ok(!K.BW_COVER.test(s), s));
  ['color', 'background-color', 'background-image', 'border-top-color', 'box-shadow', 'fill', 'stroke', 'stop-color', 'text-decoration-color', '--accent']
    .forEach((p) => assert.ok(K.BW_PROP.test(p), p));
  ['font-family', 'width', 'content', 'display'].forEach((p) => assert.ok(!K.BW_PROP.test(p), p));
});

test('bookMain: хар цагаан — CSSOM дүрэм, inline, SVG шинж, зурагт л filter; нүүр алгасна; хуудаслалтад хүрэхгүй', () => {
  assert.match(main, /if \(D\.bw\) bwSet\(true\);/);
  assert.match(main, /if \(r\.selectorText && BW_COVER\.test\(r\.selectorText\)\) continue;/);
  assert.match(main, /BW_ATTR = \['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color'\]/);
  assert.match(main, /if \(\/\^\(img\|canvas\|video\|image\)\$\/i\.test\(e\.tagName\)\)/);
  const bw = main.slice(main.indexOf('var BW = {'), main.indexOf('// ── Цахим ном'));
  assert.doesNotMatch(bw, /fitAll|calc\(|paint\(|zoom|style\.height/, 'зөвхөн өнгө');
  assert.match(main, /<input type="checkbox" id="bwsel"> Хар цагаан<\/label>/);
  assert.match(main, /document\.getElementById\('bwsel'\)\.onchange = function \(\) \{ bwSet\(this\.checked\); \};/);
  new Function(main);
});

test('build: opts.bw → D.bw, цахим номын түлхүүр (ebKey — WSB.ebookKey эсвэл өөрийн хуулбар); гарчигт «Хар цагаан»', () => {
  assert.match(src, /function build\(gi, pw, paper, opts\) \{\s*var b5 = paper === 'b5', bw = !!\(opts && opts\.bw\)/);
  assert.match(src, /var D = \{ paper: b5 \? 'b5' : 'a4', bw: bw, key: ebKey\(o\.label\), label: o\.label,/);
  assert.match(src, /pl = \(b5 \? ' · B5' : ''\) \+ \(bw \? ' · Хар цагаан' : ''\)/);
});

test('цахим ном нийтлэх: өнгөтөөр (хар цагааныг түр унтраана), засварын хэрэгсэлгүй, хэсэглэж gzip → ebook_put → ebook_commit', () => {
  assert.match(main, /try \{ if \(was\) bwSet\(false\); data = ebookData\(\); \}/);
  assert.match(main, /finally \{ if \(was\) bwSet\(true\); \}/);
  assert.match(main, /querySelectorAll\('\.gd, \.toc-warn, \.wsx-sc, \.wsx-bx, \.wsx-hl, script'\)/);
  assert.match(main, /removeAttribute\('contenteditable'\)/);
  assert.match(main, /new CompressionStream\('gzip'\)/);
  assert.match(main, /action: 'ebook_put', key: D\.key, up: up, i: i, n: n, data: ebB64\(parts\[i\+\+\]\)/);
  assert.match(main, /action: 'ebook_commit', key: D\.key, up: up, n: n, pages: data\.pages\.length/);
  assert.match(main, /var EB_PART = 2600000;/);
  assert.match(R('api/_ebook.js'), /const PART_MAX = 3 \* 1024 \* 1024;/, 'серверийн хязгаар EB_PART-аас том');
});

test('ws-browse: цэсэнд Өнгөт / Хар цагаан (хадгалагдана), A4 / B5 нээх, цахим номын холбоос (нээх, хуулах)', () => {
  const menu = br.slice(br.indexOf('function bookMenu'), br.indexOf('function openBook'));
  assert.match(menu, /data-bookc="0"[^>]*>Өнгөт<\/button>/);
  assert.match(menu, /data-bookc="1"[^>]*>Хар цагаан<\/button>/);
  assert.match(menu, /data-bookp="a4"/); assert.match(menu, /data-bookp="b5"/);
  assert.match(menu, /<a href="\/devter\/' \+ key \+ '" target="_blank" rel="noopener">Нээх<\/a><button type="button" data-ebkcp=/);
  assert.match(menu, /fetch\('\/api\/worksheets\?ebook=' \+ key\)/);
  assert.doesNotMatch(menu, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  assert.match(br, /localStorage\.setItem\(BW_KEY, on \? '1' : '0'\)/);
  assert.match(br, /var g = ST\.g, opts = \{ bw: bookBw\(\) \}, go = function \(\) \{ window\.WSBOOK\.build\(g, pw, paper, opts\); \};/);
  assert.match(br, /s\.src = '\/ws-book\.js\?v=23';/);
  assert.match(br, /ebookKey: ebookKey \};/);
  assert.match(css, /\.wsb-bkc\{display:flex;/); assert.match(css, /\.wsb-bke\{display:flex;/);
  assert.doesNotMatch(css.slice(css.indexOf('.wsb-bkc')), /#FFC800|#FFF3|#FEF3C7|#fff8e/i, 'шар хайрцаггүй');
  new Function(br);
});

test('ebookKey: анги → тоо, ЭЕШ → eesh, Олимпиад → olimpiad; бусад нийтлэхгүй; серверийн KEY_RE-тэй таарна', () => {
  const f = br.slice(br.indexOf('function ebookKey'), br.indexOf('function bookMenu'));
  const ebookKey = new Function(f + '; return ebookKey;')();
  const { KEY_RE } = { KEY_RE: /^(?:[2-9]|1[0-2]|eesh|olimpiad)$/ };
  assert.match(R('api/_ebook.js'), /const KEY_RE = \/\^\(\?:\[2-9\]\|1\[0-2\]\|eesh\|olimpiad\)\$\/;/);
  [['2-р анги', '2'], ['9-р анги', '9'], ['12-р анги', '12'], ['ЭЕШ', 'eesh'], ['Олимпиад', 'olimpiad']].forEach(([l, k]) => {
    assert.strictEqual(ebookKey(l), k, l); assert.ok(KEY_RE.test(k), k);
  });
  ['Миний хуудас', '', undefined, '9-р анги ', 'constructor'].forEach((l) => assert.strictEqual(ebookKey(l), '', String(l)));
});
