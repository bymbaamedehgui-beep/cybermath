// 2-р ангийн ажлын хуудас (Математик II; генератор + зургийн сан ART — g2art.js, scratchpad g2*):
//   - каталогийн «2-р анги» бүлэг: хуудас бүр файлтай, нэр «<сэдэв>-<n>», гарчиг «… (2-р анги)», ws-store.js ачаална
//   - хуудас бүрийн генератор олон seed-ээр: q/a/key мөр, NaN/undefined алга, $ тэгш, TeX дотор < > + үсэг алга,
//     fig дотор $ алга (KaTeX auto-render эвдэхгүй), зураг (svg) хуудас бүрд ≥ 2 даалгаварт
//   - api/seed.js: place_g2c1…12_v1 блок, grade='2-р анги' л; admin.html WS_GRADES-д 2-р анги
// Ажиллуулах: node --test tests/g2.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const WT = path.resolve(__dirname, '..');
const G = '2-р анги';
const ctx0 = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(path.join(WT, 'catalog.js'), 'utf8'), ctx0);
const GROUP = ctx0.window.WS_LIST.find((x) => x[0] === G);

function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function mathSegs(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '$') { i += 2; continue; }
    if (s[i] === '$') { let j = i + 1; while (j < s.length && s[j] !== '$') { if (s[j] === '\\') j++; j++; } if (j >= s.length) return null; out.push(s.slice(i + 1, j)); i = j + 1; continue; }
    i++;
  }
  return out;
}

test('g2: каталогт «2-р анги» бүлэг — хуудас бүр файлтай, нэр «<сэдэв>-<n>»', () => {
  assert.ok(GROUP, 'каталогт 2-р анги');
  assert.ok(GROUP[1].length >= 100, 'хуудасны тоо: ' + GROUP[1].length);
  const seen = new Set();
  GROUP[1].forEach(([slug, title]) => {
    assert.match(slug, /^[a-z0-9-]+-\d+-2\.html$/, slug);
    assert.ok(!seen.has(slug), 'давхар: ' + slug); seen.add(slug);
    assert.match(title, /^\S.*-\d+$/, title);
    const html = fs.readFileSync(path.join(WT, slug), 'utf8');
    assert.ok(html.includes('<title>' + title + ' (2-р анги)</title>'), slug + ': <title>');
    assert.ok(html.includes('<script src="/ws-store.js?v='), slug + ': ws-store.js');
  });
  const idx = ctx0.window.WS_LIST.findIndex((x) => x[0] === G), i3 = ctx0.window.WS_LIST.findIndex((x) => x[0] === '3-р анги');
  assert.ok(idx >= 0 && idx < i3, '2-р анги 3-р ангийн өмнө');
});

const PAGES = GROUP ? GROUP[1] : [];
for (const [slug] of PAGES) {
  test('g2: ' + slug + ' — генератор бүр олон seed-ээр алдаагүй, зурагтай', () => {
    const html = fs.readFileSync(path.join(WT, slug), 'utf8');
    const a = html.indexOf('<script>\n'), b = html.indexOf('\nvar WSPEC=');
    assert.ok(a > 0 && b > a, 'скрипт');
    const lib = html.slice(a + 9, b), m = /\nvar WSPEC=(\{.*\});\n/.exec(html);
    assert.ok(m, 'WSPEC');
    const spec = JSON.parse(m[1]);
    const ctx = vm.createContext({ Math: Object.create(Math), JSON, console });
    vm.runInContext(lib, ctx, { filename: slug });
    assert.ok(ctx.ART && typeof ctx.ART.icon === 'function', 'ART');
    let pics = 0, total = 0;
    spec.tasks.forEach((t, ti) => {
      const fn = ctx[t.fn];
      assert.strictEqual(typeof fn, 'function', t.fn);
      const keys = new Set(); let pic = 0, n = 0;
      for (let r = 0; r < 40; r++) {
        ctx.Math.random = mulberry(7919 * (r + 1) + 31 * ti + slug.length);
        let g = null;
        for (let k = 0; k < 200 && !g; k++) g = fn();
        assert.ok(g, t.fn + ': генератор бүтэлгүй');
        n++;
        assert.ok(typeof g.q === 'string' && typeof g.a === 'string' && g.a.trim() && g.key, t.fn + ': q/a/key');
        assert.doesNotMatch(g.q + ' ' + g.a + ' ' + (g.fig || ''), /NaN|undefined|Infinity|\[object/, t.fn);
        [g.q.replace(/<svg[\s\S]*?<\/svg>/g, ''), g.a].forEach((s) => {
          const segs = mathSegs(s);
          assert.ok(segs, t.fn + ': $ тэнцээгүй — ' + s.slice(0, 80));
          segs.forEach((x) => assert.doesNotMatch(x, /[<>]\s*[A-Za-zА-Яа-яӨөҮүЁё\\]/, t.fn + ': TeX дотор < > — ' + x.slice(0, 60)));
        });
        if (g.fig != null) assert.ok(String(g.fig).indexOf('$') < 0, t.fn + ': fig дотор $');
        if (g.fig || /<svg/.test(g.q)) pic++;
        keys.add(g.key);
      }
      assert.ok(keys.size >= Math.min(t.cap, 3), t.fn + ': шинэчлэхэд өөрчлөгдөхгүй (' + keys.size + ')');
      if (pic > n / 2) pics++;
      total += t.cap;
    });
    assert.ok(pics >= 2, 'зурагтай даалгавар ' + pics + ' (≥ 2)');
    assert.ok(total >= 14 && total <= 24, 'бодлогын тоо ' + total);
  });
}

test('g2: api/seed.js — place_g2c1…12_v1, grade=\'2-р анги\' л; admin WS_GRADES', () => {
  const s = fs.readFileSync(path.join(WT, 'api/seed.js'), 'utf8');
  for (let n = 1; n <= 12; n++) assert.ok(s.includes("skey='place_g2c" + n + "_v1'"), 'place_g2c' + n + '_v1');
  const a = s.indexOf('const cf_g2c1 '), b = s.indexOf("'place_g2c12_v1','1'");
  assert.ok(a > 0 && b > a, 'блокийн муж');
  const blk = s.slice(a, b), grades = blk.match(/grade='[^']*'/g) || [];
  assert.ok(grades.length > 0 && grades.every((x) => x === "grade='" + G + "'"), 'grade= зөвхөн 2-р анги');
  assert.ok(!/VALUES \('(?!2-р анги)[^']*-р анги'/.test(blk), 'INSERT VALUES зөвхөн 2-р анги');
  GROUP[1].forEach(([slug]) => assert.ok(blk.includes('"' + slug + '"'), 'seed-д байрлал: ' + slug));
  assert.match(fs.readFileSync(path.join(WT, 'admin.html'), 'utf8'), /var WS_GRADES=\['2-р анги','3-р анги',/);
});
