// «ЭЕШ 1000 бодлого» (e1k.js + eesh1000-N.html):
//   - туслахууд: бутархай, гишүүн/олон гишүүнт, язгуур, дагавар, нүд (Bx), зураг (Fig) — NaN-гүй
//   - хуудас бүр 25 генератор (хэсэг бүрт эх дугаар 1–100: K-р хуудас 25((K−1) mod 4)+1-ээс), олон seed-ээр: алдаагүй, q/a хоосон биш, NaN/undefined алга,
//     $ тэгш тоотой, TeX дотор < > байхгүй (HTML таг болж эвдэрдэг), зураг <svg>/<table>
//   - каталогийн ЭЕШ бүлэгт 8 хуудас (1, 2-р хэсэг), vercel.json-д e1k.js
// Ажиллуулах: node --test tests/e1k.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const WT = path.resolve(__dirname, '..');
const H = require(path.join(WT, 'e1k.js'));
// хэсэг бүр (Математик №P) 4 хуудас: K = 4(P−1)+j, хуудас бүрт эх дугаар 25(j−1)+1…25j
const PAGES = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => ({ k, file: path.join(WT, 'eesh1000-' + k + '.html'), first: 25 * ((k - 1) % 4) + 1 }));

function mathSegs(s) {
  const out = []; let i = 0;
  while (i < s.length) {
    if (s[i] === '\\' && s[i + 1] === '$') { i += 2; continue; }
    if (s[i] === '$') {
      const disp = s[i + 1] === '$', open = disp ? 2 : 1, close = disp ? '$$' : '$';
      let j = i + open;
      while (j < s.length) { if (s[j] === '\\') { j += 2; continue; } if (s.startsWith(close, j)) break; j++; }
      if (j >= s.length) return null;
      out.push(s.slice(i + open, j)); i = j + open; continue;
    }
    i++;
  }
  return out;
}

test('e1k: туслах функцууд', () => {
  assert.strictEqual(H.fr(6, 4), '\\dfrac{3}{2}');
  assert.strictEqual(H.fr(-4, 2), '-2');
  assert.strictEqual(H.fr(3, -9), '-\\dfrac{1}{3}');
  assert.strictEqual(H.poly([1, -3, 0, 2]), 'x^{3}-3x^{2}+2');
  assert.strictEqual(H.poly([-1, 1, -1]), '-x^{2}+x-1');
  assert.strictEqual(H.poly([[2, 3], -5, 12, 1]), '\\frac{2}{3}x^{3}-5x^{2}+12x+1');
  assert.strictEqual(H.poly([0, 0, 0]), '0');
  assert.strictEqual(H.surd(12).tex, '2\\sqrt{3}');
  assert.strictEqual(H.surd(16).tex, '4');
  assert.strictEqual(H.surd(7).tex, '\\sqrt{7}');
  assert.strictEqual(H.rt(-1, 5), '-\\sqrt{5}');
  assert.strictEqual(H.dec(0.1 + 0.2), '0.3');
  assert.strictEqual(H.dec(-0), '0');
  assert.strictEqual(H.sgn(-3) + H.sgn(5), '-3+5');
  assert.strictEqual(H.sfx(4, 'д'), '4-т');
  assert.strictEqual(H.sfx(6, 'д'), '6-д');
  assert.strictEqual(H.sfx(20, 'аар'), '20-иор');
  assert.strictEqual(H.sfx(50, 'аас'), '50-иас');
  assert.strictEqual(H.sfx(120, 'аас'), '120-иос');
  assert.strictEqual(H.sfx(10, 'ыг'), '10-ыг');
  assert.strictEqual(H.sfx(3.4, 'тай'), '3.4-тэй');
  assert.strictEqual(H.suf(45, 'ын'), 'ын');
  const b = H.Bx();
  assert.strictEqual(b('x', 7), '\\bx{a}');
  assert.strictEqual(b('y', 39), '\\bx{bc}');
  assert.strictEqual(b('x'), '\\bx{a}', 'ижил түлхүүр → ижил нүд');
  assert.strictEqual(b.key(), '$a=7$, $bc=39$');
  assert.throws(() => b('z', -1), /цифр/);
  const f = H.Fig({ w: 200 });
  f.poly([[0, 0], [4, 0], [4, 3]]).circle([2, 1], 1).arrow([0, 0], [4, 3]).text([4, 3], 'A_1', { pos: 'ne' }).angle([0, 0], [4, 0], [4, 3], { label: '30^\\circ' });
  const s = f.svg();
  assert.match(s, /^<svg[\s\S]*<\/svg>$/);
  assert.doesNotMatch(s, /NaN|undefined/);
  const g = H.Fig({ view: [-3, 3, -2, 4], unit: 20 }).grid(1).axes({}).ticks([-2, 2], [1, 3]).curve((x) => x * x, -3, 3).svg();
  assert.doesNotMatch(g, /NaN|undefined/);
  const sp = H.spline([[0, 0], [3, 2], [6, 7], [9, 9]]);
  assert.ok(Math.abs(sp(3) - 2) < 1e-12 && Math.abs(sp(6) - 7) < 1e-12);
  for (let x = 0; x < 9; x += 0.25) assert.ok(sp(x + 0.25) >= sp(x) - 1e-12, 'монотон');
});

for (const P of PAGES) {
  test('e1k: ' + path.basename(P.file) + ' — 25 генератор, олон seed-ээр алдаагүй', () => {
    assert.ok(fs.existsSync(P.file), 'файл байхгүй');
    const html = fs.readFileSync(P.file, 'utf8');
    assert.match(html, /<script src="\/e1k\.js\?v=\d+"><\/script>/);
    assert.match(html, /<script src="\/ws-store\.js\?v=\d+"><\/script>/);
    const m = /<script>\n([\s\S]*?E1K\.page\([\s\S]*?\);)\n<\/script>/.exec(html);
    assert.ok(m, 'E1K.page скрипт олдсонгүй');
    let cfg = null;
    const ctx = vm.createContext(Object.assign({ console, E1K: { page: (c) => { cfg = c; } } }, H));
    vm.runInContext(m[1], ctx, { filename: path.basename(P.file) });
    assert.ok(cfg, 'E1K.page дуудагдаагүй');
    assert.strictEqual(cfg.first, P.first);
    assert.strictEqual(cfg.probs.length, 25);
    assert.strictEqual(cfg.title, 'ЭЕШ 1000 ' + Math.ceil(P.k / 4) + '-' + ((P.k - 1) % 4 + 1));   // «ЭЕШ 1000 хэсэг-хуудас»
    cfg.probs.forEach((fn, i) => {
      const n = P.first + i;
      assert.strictEqual(typeof fn, 'function', 'p' + n);
      assert.strictEqual(fn.name, 'p' + n, 'дараалал');
      const seen = new Set();
      for (let r = 0; r < 40; r++) {
        H.setRng(H.mulberry(7919 * (r + 1) + n));
        const g = H.gen(fn, (x) => x && typeof x.q === 'string' && x.q && x.a != null && String(x.a) !== '');
        H.setRng(null);
        assert.ok(g, 'p' + n + ': генератор бүтэлгүй');
        const all = g.q + ' ' + g.a + ' ' + (g.fig || '');
        assert.doesNotMatch(all, /NaN|undefined|Infinity|\[object/, 'p' + n);
        [g.q, String(g.a)].forEach((s) => {
          const segs = mathSegs(s);
          assert.ok(segs, 'p' + n + ': $ тэнцээгүй — ' + s.slice(0, 80));
          segs.forEach((t) => assert.doesNotMatch(t, /[<>]/, 'p' + n + ': TeX дотор < > — ' + t.slice(0, 60)));
        });
        if (g.fig != null) assert.match(String(g.fig), /^\s*<(svg|table|div)/, 'p' + n + ': fig');
        seen.add(g.q + '|' + (g.fig || ''));
      }
      assert.ok(seen.size >= 2, 'p' + n + ': шинэчлэхэд өөрчлөгдөхгүй байна');
    });
  });
}

test('e1k: каталогийн ЭЕШ бүлэгт 8 хуудас (2 хэсэг), vercel.json-д e1k.js', () => {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(fs.readFileSync(path.join(WT, 'catalog.js'), 'utf8'), ctx);
  const g = ctx.window.WS_LIST.find((x) => x[0] === 'ЭЕШ');
  assert.ok(g, 'ЭЕШ бүлэг');
  [1, 2, 3, 4, 5, 6, 7, 8].forEach((k) => {
    const e = g[1].find((x) => x[0] === 'eesh1000-' + k + '.html');
    assert.ok(e, 'eesh1000-' + k + '.html каталогт');
    assert.strictEqual(e[1], 'ЭЕШ 1000 ' + Math.ceil(k / 4) + '-' + ((k - 1) % 4 + 1));
  });
  const vj = JSON.parse(fs.readFileSync(path.join(WT, 'vercel.json'), 'utf8'));
  assert.ok(vj.builds.some((b) => b.src === 'e1k.js'), 'vercel.json builds: e1k.js');
});
