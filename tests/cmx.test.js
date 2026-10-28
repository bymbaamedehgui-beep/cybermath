// Бүлгийн жишиг/шалгалтын хөдөлгүүр (cmx.js) ба 6–8-р ангийн хуудсууд:
//   - хувилбарын код → тогтмол бодлого (seeded), ref/tag нь api/_eyesh.js ба eyeshcheck lib/omr.js-тэй таарна
//   - шалгалтын хуудас бүр: 10 тест (4 ялгаатай сонголт, нэг зөв, A–D түлхүүр) + 5 задгай, NaN/undefined алга
//   - eyesh-link.js: шалгалтын хуудсан дээр (window.CM_EXAM) «ЭЕШ шалгагч» → normExam(kind:'ws') зөвшөөрнө
// Ажиллуулах: node --test tests/cmx.test.js
'use strict';
const F = require('./_gamefake');
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const H = require(path.join(F.WT, 'cmx.js'));
const EY = require(path.join(F.API, '_eyesh.js'));

// eyeshcheck lib/omr.js-ийн examTag-ийн хуулбар (тэнд `for (const ch of …)` — ASCII ref-д charCodeAt-тай ижил)
function eyExamTag(examId) {
  let h = 2166136261;
  for (const ch of String(examId || '')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 4095) + 1;
}

test('cmx: wsRef нь api/_eyesh.js-ийнхтэй ижил; examTag нь eyeshcheck-ийнхтэй ижил (1..4095)', () => {
  for (let i = 0; i < 300; i++) {
    const slug = 'shalgalt-material-' + (1 + (i % 6)) + '-' + (6 + (i % 3)) + '.html', seed = H.newSeed();
    const key = Array.from({ length: 10 }, (_, k) => 'ABCD'[(i * 7 + k * 3) % 4]).join('');
    const ref = H.wsRef(slug, seed, key);
    assert.match(ref, /^ws:[0-9a-f]{20}$/);
    assert.strictEqual(ref, EY.wsRef(slug, seed, key));
    const t = H.examTag(ref);
    assert.strictEqual(t, eyExamTag(ref));
    assert.ok(t >= 1 && t <= 4095);
  }
  assert.notStrictEqual(H.wsRef('a.html', 'K7Q2M', 'ABCD'), H.wsRef('a.html', 'K7Q2M', 'ABCA'), 'түлхүүр өөр → ref өөр');
});

test('cmx: seeded — ижил код ижил дараалал, Math.random сэргээгдэнэ; код 5 тэмдэгт (0, 1, I, O-гүй)', () => {
  const mr = Math.random;
  const a = H.seeded('K7Q2M', () => Array.from({ length: 20 }, () => H.rnd(1, 1000)));
  const b = H.seeded('K7Q2M', () => Array.from({ length: 20 }, () => H.rnd(1, 1000)));
  const c = H.seeded('K7Q2N', () => Array.from({ length: 20 }, () => H.rnd(1, 1000)));
  assert.deepStrictEqual(a, b);
  assert.notDeepStrictEqual(a, c);
  assert.strictEqual(Math.random, mr);
  assert.throws(() => H.seeded('K7Q2M', () => { throw new Error('x'); }));
  assert.strictEqual(Math.random, mr, 'алдаа гарсан ч сэргээнэ');
  for (let i = 0; i < 200; i++) assert.ok(H.okSeed(H.newSeed()));
  ['K7Q0M', 'K7QIM', 'k7q2m', 'K7Q2', 'K7Q2MM', ''].forEach((s) => assert.strictEqual(H.okSeed(s), false, s));
});

test('cmx: makeMC — 4 ялгаатай сонголт, зөв нь нэг; төөрөгдүүлэгч дутвал null', () => {
  const C = H.C;
  for (let i = 0; i < 200; i++) {
    const m = H.makeMC(C(5), [C(5), C(6), C(7), C(6), C(8), C(9)]);
    assert.strictEqual(m.opts.length, 4);
    assert.strictEqual(new Set(m.opts.map((o) => o.tex)).size, 4);
    assert.strictEqual(m.opts.filter((o) => o.ok).length, 1);
    assert.strictEqual(m.opts[m.correct].tex, '5');
  }
  assert.strictEqual(H.makeMC(C(1), [C(2), C(2), C(1)]), null);
  assert.strictEqual(H.makeMC(C('NaN'), [C(2), C(3), C(4)]), null);
  assert.strictEqual(H.fr(-6, 4), '-\\dfrac{3}{2}');
  assert.strictEqual(H.fr(8, 4), '2');
  assert.strictEqual(H.dFmt(125, 2), '1.25');
  assert.strictEqual(H.dFmt(-1200, 3), '-1.2');
  assert.strictEqual(H.th(12500), '12\\,500');
  assert.strictEqual(H.th(9500), '9500');
});

// ── хуудасны генераторыг (CMX.exam / CMX.jishig-д өгөх cfg) vm-д ажиллуулна ──
function pageCfg(file) {
  const h = fs.readFileSync(path.join(F.WT, file), 'utf8');
  const scripts = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.strictEqual(scripts.length, 1, file + ': нэг inline script');
  assert.ok(/<script src="\/cmx\.js\?v=\d+"><\/script>/.test(h), file + ': cmx.js');
  assert.ok(/<script src="\/ws-store\.js\?v=\d+"><\/script>/.test(h), file + ': ws-store.js');
  const ctx = vm.createContext({ console: { log() {}, warn() {}, error() {} }, Math: Object.create(Math) });
  Object.keys(H).forEach((k) => { ctx[k] = H[k]; });
  let cfg = null;
  ctx.CMX = { exam: (c) => { cfg = Object.assign({ kind: 'exam' }, c); }, jishig: (c) => { cfg = Object.assign({ kind: 'jishig' }, c); } };
  vm.runInContext(scripts[0], ctx, { filename: file });
  assert.ok(cfg, file + ': CMX.exam/jishig дуудагдсангүй');
  return cfg;
}
const BAD = /\b(NaN|undefined|null|Infinity)\b|\[object/;
const EYC_TOPICS = ['Алгебр', 'Геометр', 'Тригонометр', 'Статистик', 'Тооны онол', 'Анализ', 'Функц', 'Бусад'];
const PAGES = fs.readdirSync(F.WT).filter((f) => /^(shalgalt-material-[1-6]-[678]|jishig-[1-6]-[12]-[678])\.html$/.test(f)).sort();

test('6–8-р ангийн бүлгийн хуудсууд: шалгалт — 10 тест + 5 задгай, зөв сонголт, ижил код → ижил хувилбар', () => {
  const exams = PAGES.filter((f) => f.startsWith('shalgalt-material-'));
  assert.ok(exams.length >= 1, 'шалгалтын хуудас олдсонгүй');
  for (const f of exams) {
    const cfg = pageCfg(f);
    assert.strictEqual(cfg.kind, 'exam', f);
    assert.strictEqual(cfg.tests.length, 10, f + ' тест');
    assert.strictEqual(cfg.free.length, 5, f + ' задгай');
    assert.ok(/^[IVX]+ бүлэг — Шалгалтын материал$/.test(cfg.title), f + ' гарчиг: ' + cfg.title);
    assert.ok(/^[678]-р анги$/.test(cfg.grade) && f.endsWith('-' + cfg.grade[0] + '.html'), f + ' анги');
    const make = (seed) => H.seeded(seed, () => {
      const seen = {};
      const T = cfg.tests.map((fn) => H.gen(fn, (x) => x.mc && x.stem && !seen[x.stem])).map((g) => { if (g) seen[g.stem] = 1; return g; });
      const Fr = cfg.free.map((fn) => H.gen(fn, (x) => x.stem && x.a != null && !seen[x.stem])).map((g) => { if (g) seen[g.stem] = 1; return g; });
      return { T, Fr };
    });
    for (let i = 0; i < 60; i++) {
      const seed = H.newSeed(), P = make(seed);
      P.T.forEach((g, k) => {
        assert.ok(g, f + ' ' + seed + ' тест ' + (k + 1) + ' үүссэнгүй');
        const o = g.mc.opts.map((x) => x.tex);
        assert.strictEqual(new Set(o).size, 4, f + ' ' + seed + ' тест ' + (k + 1) + ' сонголт: ' + o.join(' | '));
        assert.ok(g.mc.correct >= 0 && g.mc.opts[g.mc.correct].ok, f + ' зөв хариу');
        assert.ok(!BAD.test(g.stem + ' ' + o.join(' ')), f + ' ' + seed + ' тест ' + (k + 1) + ': ' + g.stem + ' || ' + o.join(' | '));
        const tp = g.topic || cfg.topic || 'Бусад';
        assert.ok(EYC_TOPICS.indexOf(tp) >= 0, f + ' сэдэв ' + tp);
      });
      P.Fr.forEach((g, k) => {
        assert.ok(g, f + ' ' + seed + ' задгай ' + (11 + k) + ' үүссэнгүй');
        assert.ok(String(g.a).trim() && !BAD.test(g.stem + ' ' + g.a), f + ' ' + seed + ' задгай ' + (11 + k) + ': ' + g.stem + ' => ' + g.a);
      });
    }
    const s = H.newSeed();
    assert.deepStrictEqual(JSON.stringify(make(s)), JSON.stringify(make(s)), f + ': ижил код → ижил бодлого');
  }
});

test('6–8-р ангийн бүлгийн хуудсууд: жишиг — даалгавар бүр бодлоготой, хариутай', () => {
  const js = PAGES.filter((f) => f.startsWith('jishig-'));
  assert.ok(js.length >= 2, 'жишиг хуудас олдсонгүй');
  for (const f of js) {
    const cfg = pageCfg(f);
    assert.strictEqual(cfg.kind, 'jishig', f);
    assert.ok(/^[IVX]+ бүлэг — Жишиг даалгавар [12]$/.test(cfg.title), f + ' гарчиг: ' + cfg.title);
    assert.ok(cfg.tasks.length >= 3 && cfg.tasks.length <= 5, f + ' даалгаврын тоо');
    for (let i = 0; i < 30; i++) {
      const seen = {};
      cfg.tasks.forEach((tk, ti) => {
        assert.ok(tk.label && /[.?!]$/.test(tk.label), f + ' даалгавар ' + (ti + 1) + ' нэр');
        for (let k = 0; k < Math.max(tk.n || 8, tk.nw || 4); k++) {
          const g = H.gen(tk.gen, (x) => x.stem && x.a != null && !seen[x.stem]);
          if (!g) { assert.ok(k >= 2, f + ' даалгавар ' + (ti + 1) + ': бодлого хэт цөөн (' + k + ')'); break; }
          seen[g.stem] = 1;
          assert.ok(String(g.a).trim() && !BAD.test(g.stem + ' ' + g.a), f + ' даалгавар ' + (ti + 1) + ': ' + g.stem + ' => ' + g.a);
        }
      });
    }
  }
});

test('eyesh-link.js: бүлгийн шалгалтын хуудсан дээр (CM_EXAM) → kind:"ws" шалгалт; normExam ref = cmx wsRef', () => {
  const store = new Map();
  const el = () => ({ style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, classList: { add() {}, remove() {}, toggle() {} } });
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {}, info() {} },
    location: { pathname: '/shalgalt-material-3-6.html', search: '?v=K7Q2M' },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    document: { readyState: 'complete', getElementById: () => null, createElement: el, head: el(), documentElement: el(), querySelector: () => null, addEventListener() {} },
    setTimeout: () => 0, clearInterval() {}, setInterval: () => 0,
  });
  vm.runInContext('var window=this,self=this;', ctx);
  const ex = { kind: 'ws', slug: 'shalgalt-material-3-6.html', seed: 'K7Q2M', key: 'BCAABBBBAB', ref: H.wsRef('shalgalt-material-3-6.html', 'K7Q2M', 'BCAABBBBAB'),
    title: 'III бүлэг — Шалгалтын материал · 6-р анги · K7Q2M', scores: Array(10).fill(1), topics: Array(10).fill('Алгебр'), n: 10 };
  ctx.CM_EXAM = () => JSON.parse(JSON.stringify(ex));
  vm.runInContext(fs.readFileSync(path.join(F.WT, 'eyesh-link.js'), 'utf8'), ctx, { filename: 'eyesh-link.js' });
  assert.strictEqual(ctx.EYESH.ws, true);
  const b = JSON.parse(JSON.stringify(ctx.EYESH.buildExam()));
  assert.deepStrictEqual(Object.keys(b).sort(), ['key', 'kind', 'scores', 'seed', 'slug', 'title', 'topics']);
  const n = EY.normExam(b);
  assert.strictEqual(n.ok, true, JSON.stringify(n));
  assert.strictEqual(n.exam.ref, ex.ref);
  assert.strictEqual(n.exam.sec1Count, 10);
  assert.deepStrictEqual(n.exam.sec1Key, ex.key.split(''));
  assert.strictEqual(n.exam.useSec2, false);
  assert.strictEqual(n.exam.title, ex.title);
  // ЭЕШ-ийн хуудас биш, CM_EXAM-гүй хуудсанд идэвхжихгүй
  const ctx2 = vm.createContext({ console, location: { pathname: '/jishig-3-1-6.html', search: '' }, document: { readyState: 'complete' } });
  vm.runInContext('var window=this,self=this;', ctx2);
  vm.runInContext(fs.readFileSync(path.join(F.WT, 'eyesh-link.js'), 'utf8'), ctx2, { filename: 'eyesh-link.js' });
  assert.strictEqual(ctx2.EYESH, undefined);
});

test('normExam(kind:"ws"): буруу оролт татгалзана; нэр цэвэрлэгдэнэ; түлхүүр өөр → ref өөр', () => {
  const ok = { kind: 'ws', slug: 'shalgalt-material-2-7.html', seed: 'AB3CD', key: 'ABCDABCDAB', scores: Array(10).fill(1), topics: Array(10).fill('Тооны онол') };
  const n = EY.normExam(Object.assign({}, ok, { title: ' <b>II</b> бүлэг\n шалгалт ' }));
  assert.strictEqual(n.ok, true);
  assert.strictEqual(n.exam.title, 'b II /b бүлэг шалгалт');
  assert.strictEqual(EY.normExam(ok).exam.title, 'Шалгалт · AB3CD');
  assert.notStrictEqual(EY.normExam(Object.assign({}, ok, { key: 'ABCDABCDAA' })).exam.ref, n.exam.ref);
  const bad = (o) => assert.strictEqual(EY.normExam(Object.assign({}, ok, o)).ok, false, JSON.stringify(o));
  bad({ slug: '../x.html' }); bad({ slug: 'X.html' }); bad({ slug: 'a.htm' });
  bad({ seed: 'AB0CD' }); bad({ seed: 'abcde' }); bad({ seed: 'ABCD' });
  bad({ key: '' }); bad({ key: 'ABCF' }); bad({ key: 'A'.repeat(61) });
  bad({ scores: Array(9).fill(1) }); bad({ scores: Array(10).fill(0) }); bad({ scores: Array(10).fill(11) }); bad({ scores: Array(10).fill('1') });
  bad({ topics: Array(10).fill('Магадлал') }); bad({ topics: Array(9).fill('Алгебр') });
});
