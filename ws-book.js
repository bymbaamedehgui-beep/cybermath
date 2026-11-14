/* Дасгал ажлын дэвтэр — анги бүрийн ном. Дасгалын төвийн ажлын хуудсууд БҮТНЭЭРЭЭ, агуулгын дарааллаар (бүлэг → сэдэв,
   жишиг/шалгалт орно) ар араасаа, хуудас бүр шинэ хуудаснаас; эхэнд нүүр + агуулга (хэвлэсэн хуудасны дугаараар).
   Хэвлэхэд хуудас бүр ДҮҮРЭН (fitAll): ажлын хуудас 1 хуудас, эсвэл урт бол бодлогын хооронд тэнцүү хуваасан 2+ хуудас —
   хуудас тус бүрийг бодолтын зай нь дүүргэнэ, бодлого ганцаараа дараагийн хуудас руу халихгүй.
   Админ хуудас бүрийг хянана: бодолтын зайтай эсэх (унтраавал хуудасны өөрийн зайгүй загвараар дахин ачаална), хуудасны
   тоо (Авто / 1 / 2), даалгавар тус бүрийн зай (− / +), номд оруулах эсэх, «Шалгасан» тэмдэг; хэвлэхэд хэдэн хуудас
   эзлэхийг шууд харна (улаан тасархай = хуудасны хил). Тохиргоо серверт (api/worksheets.js book_get/book_set)
   өөрчлөлт бүрд автоматаар хадгалагдана. Ажлын хуудсыг далд iframe-д зурж #sheet-ийг өөрийн CSS-тэй нь хуулна
   (ижил CSS блок нэг удаа, .cb-N дотор nesting). Нээх: Дасгалын төв → анги (админ) → «Дасгал ажлын дэвтэр». */
(function () {
  'use strict';
  var CONC = 3, WKS_KEY = 'cm_ws_wk_scale';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function adminHdr() {
    var t = ''; try { t = localStorage.getItem('cm_admin_token') || ''; } catch (e) {}
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t };
  }

  /* ── 1) Агуулга: бүлэг → сэдэв (жишиг/шалгалт орно) → ажлын хуудсууд ── */
  function outline(gi) {
    var d = window.WSB && WSB.gdata(gi); if (!d) return null;
    var chapters = [];
    var addNode = function (n, topics) {
      var items = WSB.deepItems(n);
      if (items.length) topics.push({ num: n.exam ? '' : (n.num || ''), title: n.exam ? 'Жишиг ба шалгалт' : n.title, items: items });
    };
    d.chapters.forEach(function (c) {
      var topics = [];
      if (c.own && c.own.length) topics.push({ num: '', title: c.title, items: c.own.slice() });
      (c.kids || []).forEach(function (k) { addNode(k, topics); });
      if (topics.length) chapters.push({ roman: c.roman || '', title: c.title, topics: topics });
    });
    var extra = [];
    d.extras.forEach(function (n) { addNode(n, extra); });
    if (d.rest.length) extra.push({ num: '', title: 'Бусад хуудас', items: d.rest.slice() });
    if (extra.length) chapters.push({ roman: '', title: 'Нэмэлт', topics: extra });
    return { label: d.label, chapters: chapters };
  }

  /* ── 2) Ажлын хуудсыг далд iframe-д зурж #sheet-ийг стильтэй нь хуулна. work: бодолтын зайтай (?work=1) эсэх;
     o — номын тохиргоо (n: даалгавар тус бүрийн бодлогын тоо, r: үр) ── */
  // Шинэ хөдөлгүүрийн (TASKS + build) бодлогыг тогтмол үрээр дахин үүсгэнэ: ном нээх бүрд ИЖИЛ бодлого («Шинэ бодлого» — r-ийг
  // солино). Даалгавар бүр өөрийн санамсаргүй урсгалтай — нэг даалгаврын бодлогын тоог өөрчлөхөд бусад нь хэвээр үлдэнэ.
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) {
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // Бодлогын тоо (даалгавар бүр): админы заасан тоо, эс бөгөөс сүүлийн мөр дүүрэхээр баганын тоогоор ДЭЭШ тоймлоно (4 баганад 6 → 8) —
  // номд хоосон нүд үлдэхгүй. snapshot() илүүг нь хасна (w.__bookN); w.__bookCols — баганын тоо («бодлого − / +» бүтэн мөрөөр алхана).
  // Бодолтын зайгүй горимд хөдөлгүүр нөөцийг (cap+3) харуулаад trimToFit-ээр нэг хуудсанд багтаадаг — нөөцийг бүтэн мөр болгож,
  // trimToFit-ийг мөр мөрөөр хасдаг rowTrim-ээр солино (нэг нэгээр хасахад сүүлийн мөр дутуу үлддэг).
  function gridCols(w, g) { return (w.getComputedStyle(g).gridTemplateColumns || '').split(/\s+/).filter(function (v) { return v && v !== 'none'; }).length; }
  function rowTrim(w, keep) {
    return function (sheet, target) {
      var gs = [].slice.call(sheet.querySelectorAll('.grid[data-gr]'));
      var qsOf = function (g) { return [].filter.call(g.children, function (c) { return c.classList.contains('q'); }); };
      var drop = function (g, m) {
        var qs = qsOf(g);
        while (m-- > 0 && qs.length) { var q = qs.pop(), a = sheet.querySelector('#answers .a[data-k="' + q.getAttribute('data-k') + '"]'); if (a) a.remove(); q.remove(); }
      };
      var hOf = function () { return typeof w.probeH === 'function' ? w.probeH(sheet) : sheet.scrollHeight; };
      gs.forEach(function (g) { var c = gridCols(w, g) || 1, k = qsOf(g).length; if (c > 1 && k > c && k % c) drop(g, k % c); });
      for (var h = hOf(), guard = 0; h > target && guard < 80; guard++) {
        var best = null, bestR = 1;
        gs.forEach(function (g, j) { if (keep[j]) return; var c = gridCols(w, g) || 1, r = Math.ceil(qsOf(g).length / c); if (r > bestR) { bestR = r; best = g; } });
        if (!best) break;
        drop(best, gridCols(w, best) || 1); h = hOf();
      }
      if (typeof w.relabel === 'function') w.relabel(sheet);
    };
  }
  function reseed(w, slug, o) {
    if (!w.TASKS || !w.TASKS.forEach || typeof w.build !== 'function') return;
    var base = slug + ':' + ((o && o.r) || 0), n = (o && Array.isArray(o.n)) ? o.n : [];
    var d = w.document, grids = d.querySelectorAll('.grid[data-gr]'), sw = d.getElementById('sw'), work = sw ? sw.checked : true;
    var eff = [], colsA = [], keep = [];
    w.TASKS.forEach(function (t, j) {
      var g = grids.length === w.TASKS.length ? grids[j] : null, cols = +t.cols || 1, shown = t.cap;
      if (g) {
        cols = gridCols(w, g) || cols;
        shown = [].filter.call(g.children, function (c) { return c.classList.contains('q'); }).length || t.cap;
      }
      var set = n[j] != null && n[j] > 0, up = function (v) { return cols > 1 ? Math.ceil(v / cols) * cols : v; };
      colsA[j] = cols; keep[j] = set;
      if (work) { eff[j] = set ? +n[j] : up(shown); t.cap = eff[j]; }
      else { eff[j] = set ? +n[j] : null; t.cap = Math.max(up(t.cap + 3), set ? +n[j] : 0) - 3; }   // зайгүй: тоог rowTrim шийднэ
      if (t.cap < 1) t.cap = 1;
      var orig = t.fn, R = rng(hash(base + ':' + j));
      if (typeof orig !== 'function') return;
      t.fn = function () { var M = w.Math, keep = M.random; M.random = R; try { return orig.apply(this, arguments); } finally { M.random = keep; } };
    });
    w.__bookN = eff; w.__bookCols = colsA;
    if (!work && typeof w.trimToFit === 'function') w.trimToFit = rowTrim(w, keep);
    var kr = w.Math.random; w.Math.random = rng(hash(base));
    try { w.build(); } finally { w.Math.random = kr; }
  }
  function loadSheet(slug, work, o) {
    work = work !== false;
    return new Promise(function (ok, no) {
      var f = document.createElement('iframe'), done = false, t0 = Date.now();
      f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
      f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1000px;height:1400px;border:0;visibility:hidden';
      var to = setTimeout(function () { fin(new Error('timeout')); }, 30000);
      function fin(err, val) { if (done) return; done = true; clearTimeout(to); f.remove(); if (err) no(err); else ok(val); }
      f.onload = function () {
        var w = f.contentWindow, d = f.contentDocument;
        (function wait() {
          var sh = d && (d.getElementById('sheet') || d.querySelector('.sheet'));
          if ((sh && sh.children.length) || Date.now() - t0 > 9000) {
            try {
              var sw = d.getElementById('sw');                      // шинэ хөдөлгүүр: «Бодолтын зай» шилжүүлэгч
              if (sw && sw.checked !== work) { sw.checked = work; if (typeof w.layout === 'function') w.layout(); }
              if (!work && w.WS_HAS_WORK && w.WS_WORK) {             // хуучин хөдөлгүүр (ws-store.js-ийн шилжүүлэгч)
                w.WS_WORK = false; var cb = d.querySelector('.cm-work-cb'); if (cb) cb.checked = false;
                if (typeof w.build === 'function') w.build();
              }
            } catch (e) {}
            try { reseed(w, slug, o); } catch (e) {}
            // ws-store.js-ийн зааврын засвар (?instr=) серверээс ирэхийг хүлээнэ
            setTimeout(function () { try { fin(null, snapshot(d, w, o)); } catch (e) { fin(e); } }, 900);
          } else setTimeout(wait, 120);
        })();
      };
      f.src = '/' + slug + (work ? '?work=1' : '');
      document.body.appendChild(f);
    });
  }
  function snapshot(d, w, o) {
    var sh = d.getElementById('sheet') || d.querySelector('.sheet');
    if (!sh || !sh.children.length) throw new Error('хуудас зурагдсангүй');
    var cl = sh.cloneNode(true);
    [].forEach.call(cl.querySelectorAll('#answers, .ans-page, .sols-page, .cm-grip, .cm-del, script'), function (x) { x.remove(); });
    [].forEach.call(cl.querySelectorAll('[contenteditable], [data-cm-ed]'), function (x) { x.removeAttribute('contenteditable'); x.removeAttribute('data-cm-ed'); });
    cl.removeAttribute('contenteditable');
    // Шинэ хөдөлгүүр: даалгавар бүр нэг .grid[data-gr] (TASKS-ийн дарааллаар). c0 — анхны тоо (cap), n — харагдаж буй тоо,
    // cols — баганын тоо. reseed()-ийн тоо (w.__bookN; мөр дүүргэсэн эсвэл админы заасан)-ноос илүүг хасна.
    var tasks = null;
    try {
      var grids = cl.querySelectorAll('.grid[data-gr]'), want = (w && w.__bookN) || ((o && Array.isArray(o.n)) ? o.n : []), cols = (w && w.__bookCols) || [];
      if (w && w.WSPEC && Array.isArray(w.WSPEC.tasks) && w.TASKS && grids.length && grids.length === w.TASKS.length) {
        tasks = [].map.call(grids, function (g, j) {
          var qs = [].filter.call(g.children, function (c) { return c.classList.contains('q'); });
          if (want[j] != null && want[j] > 0) qs.slice(want[j]).forEach(function (q) { q.remove(); });
          return { c0: +w.WSPEC.tasks[j].cap || qs.length, n: want[j] != null && want[j] > 0 ? Math.min(qs.length, want[j]) : qs.length, cols: cols[j] || 1 };
        });
      }
    } catch (e) { tasks = null; }
    var root = '', styles = [];
    [].forEach.call(d.querySelectorAll('style'), function (s) {
      var t = (s.textContent || '').replace(/:root\s*\{([^}]*)\}/g, function (m, x) { root += x + ';'; return ''; })
        .replace(/@page\s*\{[^}]*\}/g, '').replace(/@import[^;]+;/g, '')
        // Хэвлэхтэй яг ижил харагдуулна: print дүрэм дэлгэцэнд ч, screen дүрэм хэзээ ч биш
        .replace(/@media\s+print/g, '@media all').replace(/@media\s+(only\s+)?screen/g, '@media (max-width:0px)');
      if (t.trim()) styles.push(t);
    });
    return { html: cl.outerHTML, styles: styles, root: root, tasks: tasks };
  }
  // Ажлын хуудасны нийтлэг «Бодолтын зай %» (localStorage) номд нөлөөлөхгүй — ачаалах хооронд 1 болгож, дараа нь сэргээнэ
  function scaleOff() {
    var prev = null; try { prev = localStorage.getItem(WKS_KEY); localStorage.setItem(WKS_KEY, '1'); } catch (e) {}
    return function () { try { if (prev == null) localStorage.removeItem(WKS_KEY); else localStorage.setItem(WKS_KEY, prev); } catch (e) {} };
  }
  // Засварлагчаас нэг хуудсыг дахин ачаална (бодолтын зайтай ↔ зайгүй, бодлогын тоо, шинэ бодлого)
  function snapOne(slug, work, o) {
    var restore = scaleOff();
    return loadSheet(slug, work, o).then(function (s) { restore(); return s; }, function (e) { restore(); throw e; });
  }

  /* ── 3) Бүтээх: татах явц попапд, дараа нь ном ── */
  function build(gi, pw) {
    var o = outline(gi);
    if (!o || !o.chapters.length) { try { pw.document.body.textContent = 'Энэ ангид ажлын хуудас алга.'; } catch (e) {} return; }
    var list = [], seen = {};
    o.chapters.forEach(function (c, ci) {
      c.topics.forEach(function (t, ti) {
        t.items.forEach(function (w) {
          if (seen[w[0]]) return; seen[w[0]] = 1;
          list.push({ n: list.length + 1, slug: w[0], title: WSB.titleOf(w), ci: ci, ti: ti });
        });
      });
    });
    try {
      pw.document.open();
      pw.document.write('<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>Дасгал ажлын дэвтэр — ' + esc(o.label) + '</title></head>'
        + '<body style="margin:0;font:700 15px \'Segoe UI\',Arial,sans-serif;color:#4b4566;background:#f4f2f8;text-align:center;padding:110px 20px">'
        + '<div style="font-size:22px;font-weight:900;color:#14214a;margin-bottom:10px">Дасгал ажлын дэвтэр · ' + esc(o.label) + '</div>'
        + '<div id="st">Ажлын хуудсуудыг ачаалж байна…</div><div style="margin-top:8px;font-size:13px;color:#8a84a3">Энэ цонхыг болон Дасгалын төвийн хуудсыг бүү хаагаарай.</div></body></html>');
      pw.document.close();
    } catch (e) {}
    // ЗӨВХӨН АДМИН: серверээр (book_get, админы JWT) баталгаажсаны дараа л ажлын хуудсуудыг ачаална
    fetch('/api/worksheets', { method: 'POST', headers: adminHdr(), body: JSON.stringify({ action: 'book_get' }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (x) {
        if (!(x.j && x.j.ok)) {
          try { pw.document.getElementById('st').textContent = x.status === 401 ? 'Зөвхөн админ ашиглана. /admin хуудсаар нэвтэрнэ үү.' : 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.'; } catch (e) {}
          return;
        }
        load(x.j.book || {});
      }, function () { try { pw.document.getElementById('st').textContent = 'Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.'; } catch (e) {} });
    function load(settings) {
      var restore = scaleOff(), done = 0, next = 0;
      function worker() {
        if (pw.closed) return Promise.resolve();
        var it = list[next++]; if (!it) return Promise.resolve();
        var work = !(settings[it.slug] && settings[it.slug].nw);   // «бодолтын зайгүй» гэж тэмдэглэсэн бол зайгүй загвараар
        return loadSheet(it.slug, work, settings[it.slug]).then(function (s) { it.snap = s; }, function (e) { it.err = String((e && e.message) || e); })
          .then(function () {
            done++;
            try { pw.document.getElementById('st').textContent = 'Ажлын хуудсуудыг ачаалж байна… ' + done + ' / ' + list.length; } catch (e) {}
            return worker();
          });
      }
      var ws = []; for (var i = 0; i < CONC; i++) ws.push(worker());
      Promise.all(ws).then(function () {
        restore();
        if (pw.closed) return;
        var blocks = [], idx = new Map();
        list.forEach(function (it) {
          if (!it.snap) return;
          it.cls = it.snap.styles.map(function (t) { if (!idx.has(t)) { idx.set(t, blocks.length); blocks.push(t); } return 'cb-' + idx.get(t); }).join(' ');
        });
        var D = { label: o.label, year: new Date().getFullYear(), list: list, blocks: blocks, settings: settings,
          chapters: o.chapters.map(function (c) { return { roman: c.roman, title: c.title, topics: c.topics.map(function (t) { return { num: t.num, title: t.title }; }) }; }) };
        pw.document.open();
        // Скрипт stylesheet-ээс ӨМНӨ: хүлээгдэж буй CSS-ийн дараах inline скрипт хойшилдог тул __bookInit доор шууд дуудагдахгүй болно
        pw.document.write('<!doctype html><html lang="mn"><head><meta charset="utf-8"><base href="' + location.origin + '/">'
          + '<title>Дасгал ажлын дэвтэр — ' + esc(o.label) + '</title>'
          + '<script>(' + bookMain.toString() + ')();<\/script>'
          + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">'
          + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800;900&display=swap">'
          + '<style>' + BOOK_CSS + '</style></head><body><div id="app"></div></body></html>');
        pw.document.close();
        pw.__bookInit(D);
      });
    }
  }

  /* ── 4) Ном/засварлагч (попап цонхонд ажиллана — энэ функцийн гаднах хувьсагч ашиглахгүй) ── */
  function bookMain() {
    var MM = 96 / 25.4, PAGE_H = 275 * MM;      // A4 297 − дээд/доод 11 мм (@page)
    // Хуудас бүр ДҮҮРЭН (fitAll): ажлын хуудас 1 хуудас (бодолтын зайг томруулж/багасгаж дүүргэнэ) эсвэл 2+ хуудас (бодлогын хооронд
    // тэнцүү хувааж, хуудас тус бүрийн бодолтын зайгаар дүүргэнэ) — бодлого ганцаараа халихгүй. AF_MIN…AF_MAX — бодолтын зайн
    // коэффициент (анхны хэмжээтэй харьцуулсан); 1 хуудсанд F1_MIN-ээс бага болох бол 2 хуудас. Бодолтын зайгүй хуудас бага зэрэг
    // халивал (≤ 1/Z1) хуудсыг Z1+ болгож 1 хуудсанд (текстийг үүнээс илүү жижигрүүлэхгүй). FIT_H — 8 мм нөөц: хэвлэхэд мөр
    // шилжилт дэлгэцээс бага зэрэг өөр (урт өгүүлбэр нэг мөр илүү) — 3 мм-д 2-р ангийн 6 хуудас нэг хуудсаар халисан.
    var FIT_H = PAGE_H - 8 * MM, AF_MIN = 0.4, AF_MAX = 3, ZM_MIN = 0.5, Z1 = 0.94, F1_MIN = 0.55;
    var HEADS = '.task, .sec, h1, h2, h3, h4, h5, .intro';   // гарчиг — дараагийн бодлогоосоо хуудсаар салахгүй
    var ICO_OK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var D = null, SET = {}, ITEMS = [], timers = {}, onlyLong = false, onlyTodo = false, BLK = new Map();
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var clamp = function (v) { return Math.max(0, Math.min(2, Math.round(v * 10) / 10)); };
    function hdr() { var t = ''; try { t = localStorage.getItem('cm_admin_token') || ''; } catch (e) {} return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }; }
    // p — хуудасны тоо (0 автомат, 1/2/3 — админ сонгосон); s — хуучин «Зай %» (одоо хэрэглэхгүй, хадгалагдсан хэвээр);
    // t — засварласан гарчиг; bh — бодолтын зай тус бүр { "даалгавар.дугаар": мм, 0 — зайгүй }; n — даалгавар тус бүрийн бодлогын тоо;
    // r — бодлогын үр («Шинэ бодлого» солино)
    function cfg(slug) { return SET[slug] || (SET[slug] = { s: 1, g: [], off: false, nw: false, ok: false, p: 0, t: '', bh: {}, n: [], r: 0 }); }
    /* COVERKIT:BEGIN — нүүрний загварууд */
    // Нүүр: c Томьёо · c1 Спираль дэвтэр · c2 Наалт · c3 Хавчуурга · a Сансар · b Геометр · d Долгион · o анхны. QR — https://cyber-math.com
    var COVERS = [['c', 'C · Томьёо'], ['c1', 'C1 · Спираль дэвтэр'], ['c2', 'C2 · Наалт'], ['c3', 'C3 · Хавчуурга'], ['a', 'A · Сансар'], ['b', 'B · Геометр'], ['d', 'D · Долгион'], ['o', 'Анхны']];
    var CV_KEY = 'cm_book_cover', CV = 'c', COVER_DATA = null, KIT = null;
    try { var cv0 = localStorage.getItem(CV_KEY); if (cv0 && COVERS.some(function (c) { return c[0] === cv0; })) CV = cv0; } catch (e) {}
    function coverHTML(v) { KIT = KIT || coverKit(); return KIT.cover(Object.assign({ v: v }, COVER_DATA)).replace('<section class="cover', '<section id="cover" class="cover'); }
    function coverKit() {
      var QR_N = 25, QR_D = 'M0 0h7v1h-7zM11 0h1v1h-1zM14 0h1v1h-1zM18 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM8 1h5v1h-5zM18 1h1v1h-1zM24 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM12 2h1v1h-1zM15 2h2v1h-2zM18 2h1v1h-1zM20 2h3v1h-3zM24 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h1v1h-1zM10 3h1v1h-1zM12 3h3v1h-3zM18 3h1v1h-1zM20 3h3v1h-3zM24 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM11 4h3v1h-3zM16 4h1v1h-1zM18 4h1v1h-1zM20 4h3v1h-3zM24 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM9 5h2v1h-2zM12 5h3v1h-3zM16 5h1v1h-1zM18 5h1v1h-1zM24 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h7v1h-7zM8 7h1v1h-1zM11 7h2v1h-2zM0 8h1v1h-1zM6 8h1v1h-1zM8 8h1v1h-1zM10 8h6v1h-6zM17 8h2v1h-2zM21 8h3v1h-3zM1 9h1v1h-1zM3 9h3v1h-3zM8 9h2v1h-2zM14 9h2v1h-2zM17 9h1v1h-1zM19 9h5v1h-5zM0 10h3v1h-3zM5 10h4v1h-4zM10 10h1v1h-1zM12 10h2v1h-2zM15 10h2v1h-2zM19 10h3v1h-3zM23 10h2v1h-2zM0 11h2v1h-2zM5 11h1v1h-1zM8 11h1v1h-1zM10 11h1v1h-1zM12 11h1v1h-1zM14 11h1v1h-1zM16 11h3v1h-3zM21 11h1v1h-1zM24 11h1v1h-1zM1 12h1v1h-1zM5 12h2v1h-2zM8 12h2v1h-2zM16 12h1v1h-1zM18 12h2v1h-2zM24 12h1v1h-1zM0 13h1v1h-1zM2 13h2v1h-2zM5 13h1v1h-1zM8 13h1v1h-1zM12 13h2v1h-2zM15 13h2v1h-2zM19 13h1v1h-1zM23 13h1v1h-1zM0 14h1v1h-1zM2 14h1v1h-1zM4 14h4v1h-4zM10 14h1v1h-1zM13 14h4v1h-4zM18 14h4v1h-4zM23 14h2v1h-2zM0 15h1v1h-1zM4 15h2v1h-2zM10 15h1v1h-1zM12 15h1v1h-1zM19 15h1v1h-1zM21 15h2v1h-2zM24 15h1v1h-1zM0 16h1v1h-1zM2 16h1v1h-1zM4 16h1v1h-1zM6 16h3v1h-3zM10 16h1v1h-1zM12 16h3v1h-3zM16 16h5v1h-5zM22 16h1v1h-1zM8 17h2v1h-2zM13 17h1v1h-1zM16 17h1v1h-1zM20 17h1v1h-1zM0 18h7v1h-7zM9 18h1v1h-1zM12 18h2v1h-2zM16 18h1v1h-1zM18 18h1v1h-1zM20 18h1v1h-1zM24 18h1v1h-1zM0 19h1v1h-1zM6 19h1v1h-1zM10 19h2v1h-2zM14 19h1v1h-1zM16 19h1v1h-1zM20 19h1v1h-1zM0 20h1v1h-1zM2 20h3v1h-3zM6 20h1v1h-1zM10 20h2v1h-2zM15 20h6v1h-6zM22 20h3v1h-3zM0 21h1v1h-1zM2 21h3v1h-3zM6 21h1v1h-1zM12 21h3v1h-3zM17 21h2v1h-2zM23 21h2v1h-2zM0 22h1v1h-1zM2 22h3v1h-3zM6 22h1v1h-1zM9 22h2v1h-2zM13 22h3v1h-3zM21 22h2v1h-2zM24 22h1v1h-1zM0 23h1v1h-1zM6 23h1v1h-1zM12 23h2v1h-2zM15 23h6v1h-6zM24 23h1v1h-1zM0 24h7v1h-7zM8 24h1v1h-1zM10 24h4v1h-4zM16 24h1v1h-1zM18 24h1v1h-1zM21 24h1v1h-1zM24 24h1v1h-1z';
      var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      function qr() {
        var s = QR_N + 4;
        return '<svg class="cv-qr" viewBox="-2 -2 ' + s + ' ' + s + '" shape-rendering="crispEdges" role="img" aria-label="cyber-math.com">'
          + '<rect x="-2" y="-2" width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + QR_D + '" fill="#14214A"/></svg>';
      }
      // ангийн түвшинд тохирох чимэглэлийн томьёо
      function fx(g) {
        g = +g || 0;
        if (g && g <= 2) return ['2 + 3 = 5', '10 − 4 = 6', '3 × 4 = 12', '15 ÷ 3 = 5'];
        if (g && g <= 4) return ['7 × 8 = 56', '100 − 45 = 55', '36 ÷ 4 = 9', '½ + ½ = 1'];
        if (g && g <= 6) return ['a + b = b + a', '¾ − ¼ = ½', 'S = a · b', '2,5 × 4 = 10'];
        if (g && g <= 8) return ['x + 5 = 12', 'y = kx + b', 'a² − b²', '√49 = 7'];
        return ['a² + b² = c²', 'y = ax² + bx + c', 'sin²α + cos²α = 1', '∫ x dx'];
      }
      function rnd(seed) { var a = seed; return function () { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; }
      // томьёо: KaTeX ачаалагдсан бол бичгийн хэлбэрээр, эс бөгөөс энгийн бичвэрээр (ном KaTeX-ийг ачаалсны дараа нүүрийг дахин зурна)
      function fm(tex, alt) {
        var K = typeof window !== 'undefined' && window.katex;
        if (K) { try { return K.renderToString(tex, { throwOnError: false, output: 'html' }); } catch (e) {} }
        return '<span class="cf-t">' + esc(alt) + '</span>';
      }
      // C = { v, label, num ('' — ангийн дугааргүй), ch, tp, ws, year }
      function cover(C) {
        var v = C.v || 'a', num = String(C.num || ''), two = num.length > 1, F = fx(num);
        var brand = '<div class="cv-brand"><img src="/assets/cybermath-mascot.svg" alt=""><b>CYBERMATH</b><span>Дасгалын төв</span></div>';
        var vol = C.vol ? String(C.vol) : '', vb = vol ? '<span class="cv-vol">' + esc(vol) + '</span>' : '';
        var title = '<div class="cv-kick">МАТЕМАТИК</div><h1>Дасгал ажлын<br>дэвтэр' + vb + '</h1>';
        var stats = [C.ch + ' бүлэг', C.tp + ' сэдэв', C.ws + ' ажлын хуудас'];
        var fields = function (extra) {
          return '<div class="cv-fields"><div><i>Нэр</i><u></u></div><div><i>Анги</i><u></u></div><div><i>Сургууль</i><u></u></div>'
            + (extra ? '<div><i>Хичээлийн жил</i><u></u></div>' : '') + '</div>';
        };
        var fl0 = '<div class="cv-fields"><div><i>Нэр</i><u></u></div><div><i>Анги</i><u></u></div><div><i>Сургууль</i><u></u></div>'
          + '<div class="yr"><i>Хичээлийн жил</i><u>20</u><b>–</b><u>20</u></div></div>';
        var qrb = '<div class="cv-qrb">' + qr() + '<div class="cv-qrt"><b>Онлайн дасгал</b><span>Утсаараа уншуулаад<br>cyber-math.com руу ороорой</span></div></div>';
        var foot = '<div class="cv-foot"><span>cyber-math.com</span><span>' + esc(C.year) + '</span></div>';
        var big = num ? esc(num) : '', gl = num ? '<span>АНГИ</span>' : '';
        var h = '<section class="cover cv-' + v + '">';
        if (v === 'a') {                                                     // ── Сансар: хар хөх шөнө, ангийн дугаар — гариг ──
          var R = rnd(7), st = '';
          for (var i = 0; i < 110; i++) st += '<circle cx="' + (R() * 210).toFixed(1) + '" cy="' + (R() * 297).toFixed(1) + '" r="' + (0.16 + R() * 0.5).toFixed(2) + '" opacity="' + (0.3 + R() * 0.65).toFixed(2) + '"/>';
          var spark = function (x, y, s) { return '<path d="M' + x + ' ' + (y - s) + 'Q' + x + ' ' + y + ' ' + (x + s) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y + s) + 'Q' + x + ' ' + y + ' ' + (x - s) + ' ' + y + 'Q' + x + ' ' + y + ' ' + x + ' ' + (y - s) + 'Z" fill="#FFE7A0"/>'; };
          var orb = function (rx, ry, t, r, c) {                            // эргэлтийн тойрог дээрх жижиг гариг (−16° хазайлт)
            var a = -16 * Math.PI / 180, x0 = rx * Math.cos(t), y0 = ry * Math.sin(t);
            return '<circle cx="' + (146 + x0 * Math.cos(a) - y0 * Math.sin(a)).toFixed(1) + '" cy="' + (140 + x0 * Math.sin(a) + y0 * Math.cos(a)).toFixed(1) + '" r="' + r + '" fill="' + c + '"/>';
          };
          h += '<svg class="cv-bg" viewBox="0 0 210 297" preserveAspectRatio="none" aria-hidden="true"><g fill="#fff">' + st + '</g>'
            + spark(28, 112, 2.6) + spark(188, 26, 2) + spark(24, 200, 1.6) + spark(104, 196, 1.9) + spark(196, 228, 1.4)
            + '<g fill="none" stroke="#fff" stroke-opacity=".16" stroke-width=".35"><ellipse cx="146" cy="140" rx="92" ry="31" transform="rotate(-16 146 140)"/>'
            + '<ellipse cx="146" cy="140" rx="122" ry="44" transform="rotate(-16 146 140)" stroke-dasharray="1.2 2.4"/></g>'
            + orb(92, 31, 2.75, 4.2, '#7B61FF') + orb(122, 44, 0.42, 2.6, '#FF6FA8') + orb(92, 31, 5.75, 2.1, '#34D399') + '</svg>'
            + '<div class="cv-in">' + brand + title
            + '<div class="a-lb">' + (num ? '<b>' + esc(C.label) + '</b>' : '') + stats.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>'
            + '<svg class="a-pl" viewBox="0 0 120 100" aria-hidden="true"><defs>'
            + '<radialGradient id="cvAb" cx="36%" cy="30%" r="74%"><stop offset="0" stop-color="#FFF4C4"/><stop offset=".45" stop-color="#FFC93C"/><stop offset="1" stop-color="#F59E0B"/></radialGradient>'
            + '<radialGradient id="cvAg"><stop offset=".5" stop-color="#FFC93C" stop-opacity=".34"/><stop offset="1" stop-color="#FFC93C" stop-opacity="0"/></radialGradient></defs>'
            + '<circle cx="60" cy="50" r="52" fill="url(#cvAg)"/>'
            + '<g transform="rotate(-16 60 50)"><path d="M3 50a57 15 0 0 1 114 0" fill="none" stroke="#FFE7A0" stroke-opacity=".5" stroke-width="2.6"/></g>'
            + '<circle cx="60" cy="50" r="33" fill="url(#cvAb)"/><path d="M33 39q27-9 54 0" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2.4" stroke-linecap="round"/>'
            + (num ? '<text x="60" y="' + (two ? 57 : 59) + '" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial" font-weight="900" font-size="' + (two ? 25 : 32) + '" fill="#14214A">' + big + '</text>' : '')
            + '<g transform="rotate(-16 60 50)"><path d="M3 50a57 15 0 0 0 114 0" fill="none" stroke="#FFE7A0" stroke-width="2.6" stroke-linecap="round"/></g></svg>'
            + '<div class="a-card">' + fields() + qrb + '</div>' + foot + '</div>';
        } else if (v === 'b') {                                              // ── Геометр: цайвар дэвсгэр, тод дүрсүүд ──
          var dots = '';
          for (var dy = 0; dy < 6; dy++) for (var dx = 0; dx < 8; dx++) dots += '<circle cx="' + (150 + dx * 6) + '" cy="' + (16 + dy * 6) + '" r=".75"/>';
          h += '<svg class="cv-bg" viewBox="0 0 210 297" aria-hidden="true"><g fill="#14214A" opacity=".35">' + dots + '</g>'
            + '<circle cx="150" cy="136" r="54" fill="#FFC93C"/><circle cx="150" cy="136" r="61" fill="none" stroke="#14214A" stroke-width=".5" stroke-dasharray="1.4 2.2"/>'
            + '<path d="M210 180a21 21 0 0 0 0 42z" fill="#14214A"/>'
            + '<polygon points="22,190 64,190 43,154" fill="#7B61FF"/><polygon points="30,190 72,190 51,154" fill="none" stroke="#14214A" stroke-width=".55"/>'
            + '<rect x="82" y="170" width="19" height="19" rx="2.5" fill="#FF7A59" transform="rotate(16 91.5 179.5)"/>'
            + '<path d="M112 196l6-6 6 6 6-6 6 6 6-6" fill="none" stroke="#14214A" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>'
            + '<circle cx="78" cy="132" r="4.5" fill="none" stroke="#FF6FA8" stroke-width="1.5"/>'
            + '<path d="M0 205h20M0 209h12" stroke="#FFC93C" stroke-width="1.6" stroke-linecap="round"/></svg>'
            + '<div class="cv-in">' + brand + title
            + '<div class="b-num' + (two ? ' two' : '') + (num ? '' : ' lbl') + '">' + (num ? big + gl : esc(C.label)) + '</div>'
            + '<div class="b-st">' + stats.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>'
            + '<div class="b-low">' + fields() + qrb + '</div>' + foot + '</div>';
        } else if (v === 'c') {                                              // ── C Томьёо: нурууны тууз, наалт хаяг, B-гийн шар тойрог, 1–12-р ангийн томьёо ──
          // Цөөн томьёо [TeX, KaTeX-гүй үеийн бичиг, зүүн (мм), дээд (мм), хэмжээ (pt), өнгө, эргэлт] + геометрийн дүрс: тод (өнгөт,
          // жижиг — гурвалжин, шоо, тойрог, зургаан өнцөгт, өнцөг) ба бүдэг (том — тойрог, координатын хавтгай дээрх парабол)
          var FM = [
            ['a^2+b^2=c^2', 'a² + b² = c²', 66, 32, 15, '#14214A', 0],
            ['\\tfrac12+\\tfrac14=\\tfrac34', '½ + ¼ = ¾', 67, 47, 13, '#0F9F94', 0],
            ['x_{1,2}=\\dfrac{-b\\pm\\sqrt{D}}{2a}', 'x = (−b ± √D) / 2a', 34, 210, 12.5, '#14214A', 0],
            ['S=\\pi r^2', 'S = πr²', 107, 215, 14, '#FF7A59', 0]
          ];
          var it = function (x, y, t, c) { return '<text x="' + x + '" y="' + y + '" font-family="Cambria Math,Cambria,Times New Roman,serif" font-style="italic" font-weight="700" font-size="4.2" fill="' + c + '">' + t + '</text>'; };
          var geo = '<svg class="cv-bg" viewBox="0 0 210 297" aria-hidden="true">'
            // бүдэг: том тойрог радиустай, координатын хавтгай дээрх парабол
            + '<g fill="none" stroke="#14214A" stroke-width=".45" opacity=".16"><circle cx="100" cy="56" r="25"/><path d="M100 56l17.7-17.7"/></g>'
            + '<circle cx="100" cy="56" r=".9" fill="#14214A" opacity=".2"/>'
            + '<g fill="none" stroke="#14214A" stroke-width=".45" stroke-linecap="round" opacity=".3"><path d="M36 266H102M100 264.4l2 1.6-2 1.6M50 272V240M48.4 242l1.6-2 1.6 2"/>'
            + '<path d="M58 265.3v1.4M66 265.3v1.4M74 265.3v1.4M82 265.3v1.4M90 265.3v1.4M49.3 258h1.4M49.3 250h1.4"/></g>'
            + '<path d="M54 242Q70 282 86 242" fill="none" stroke="#7B61FF" stroke-width=".9" opacity=".45"/>'
            + '<g fill="#FF7A59" opacity=".6"><circle cx="54" cy="242" r=".9"/><circle cx="70" cy="262" r=".9"/><circle cx="86" cy="242" r=".9"/></g>'
            // тод: тэгш өнцөгт гурвалжин (a, b, c), шоо
            + '<polygon points="36,50 62,50 36,30" fill="#7B61FF" fill-opacity=".12" stroke="#7B61FF" stroke-width=".9" stroke-linejoin="round"/>'
            + '<path d="M36 46h4v4" fill="none" stroke="#7B61FF" stroke-width=".55"/>' + it(32.4, 41.6, 'a', '#7B61FF') + it(48, 54.8, 'b', '#7B61FF') + it(50.8, 38.6, 'c', '#7B61FF')
            + '<g fill="none" stroke="#14214A" stroke-width=".8" stroke-linejoin="round"><path d="M38 64h14v14h-14zM38 64l6-5h14l-6 5M52 78l6-5V59"/>'
            + '<path d="M44 59v14h14M44 73l-6 5" stroke-width=".45" stroke-dasharray="1.2 1"/></g>'
            // тод: тойрог (r), зургаан өнцөгт, өнцөг (α)
            + '<circle cx="96" cy="221" r="7" fill="#FF7A59" fill-opacity=".12" stroke="#FF7A59" stroke-width=".9"/><path d="M96 221h7" stroke="#FF7A59" stroke-width=".7"/>'
            + '<circle cx="96" cy="221" r=".8" fill="#FF7A59"/>' + it(98.2, 219.6, 'r', '#FF7A59')
            + '<polygon points="155.5,221 151.75,227.5 144.25,227.5 140.5,221 144.25,214.5 151.75,214.5" fill="#0F9F94" fill-opacity=".12" stroke="#0F9F94" stroke-width=".9" stroke-linejoin="round"/>'
            + '<path d="M192 229H164L184 211.5" fill="none" stroke="#7B61FF" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>'
            + '<path d="M172 229A8 8 0 0 0 170.02 223.73" fill="none" stroke="#7B61FF" stroke-width=".6"/>' + it(174, 226.6, 'α', '#7B61FF')
            + '</svg>';
          h += '<div class="c-spine"><span>МАТЕМАТИК · ДАСГАЛ АЖЛЫН ДЭВТЭР' + (vol ? ' ' + esc(vol) : '') + '</span></div>' + geo
            + '<div class="cf-wall" aria-hidden="true">' + FM.map(function (f) {
              return '<span class="cf" style="left:' + f[2] + 'mm;top:' + f[3] + 'mm;font-size:' + f[4] + 'pt;color:' + f[5] + (f[6] ? ';transform:rotate(' + f[6] + 'deg)' : '') + '">' + fm(f[0], f[1]) + '</span>';
            }).join('') + '</div>'
            + (num ? '<div class="cp-num' + (two ? ' two' : '') + '"><b>' + big + '</b><span>АНГИ</span></div>' : '')
            + '<div class="cv-in">' + brand
            + '<div class="c-card"><i class="c-tape"></i>' + title + (num ? '' : '<div class="c-lbl">' + esc(C.label) + '</div>')
            + '<div class="c-st">' + esc(stats.join(' · ')) + '</div>' + fl0 + '</div>'
            + '<div class="c-low">' + qrb + '</div>' + foot + '</div>';
        } else if (v === 'd') {                                              // ── Долгион: ягаан-хөх градиент, давалгаа, томьёоны «чип» ──
          var chips = [[126, 24], [118, 90], [22, 122], [46, 154]];
          h += '<div class="d-top">' + chips.map(function (p, i) { return '<span class="d-chip" style="left:' + p[0] + 'mm;top:' + p[1] + 'mm">' + esc(F[i]) + '</span>'; }).join('')
            + '<svg class="d-wave" viewBox="0 0 210 40" preserveAspectRatio="none" aria-hidden="true">'
            + '<path d="M0 20C40 6 80 32 120 18S190 4 210 16V40H0z" fill="#fff" fill-opacity=".22"/>'
            + '<path d="M0 27C50 14 92 39 140 25S196 16 210 24V40H0z" fill="#fff" fill-opacity=".45"/>'
            + '<path d="M0 32C46 24 100 44 150 32S200 26 210 30V40H0z" fill="#fff"/></svg></div>'
            + '<div class="cv-in">' + brand + title
            + '<div class="d-tile' + (two ? ' two' : '') + (num ? '' : ' lbl') + '">' + (num ? '<b>' + big + '</b>' + gl : '<b>' + esc(C.label) + '</b>') + '</div>'
            + '<div class="d-low"><div class="d-st">' + stats.map(function (s) { return '<span>' + esc(s) + '</span>'; }).join('') + '</div>'
            + '<div class="d-row">' + fields() + qrb + '</div></div>' + foot + '</div>';
        } else if (v === 'c1' || v === 'c2' || v === 'c3') {                 // ── «Торон дэвтэр»-ийн 3 сайжруулсан хувилбар ──
          var sk2 = function (d, c, w, o) { return '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (w || 1) + '" stroke-linecap="round" stroke-linejoin="round"' + (o ? ' opacity="' + o + '"' : '') + '/>'; };
          var fl = fl0;
          var star5 = function (cx, cy, R, fill, stroke, sw) {
            var p = []; for (var s = 0; s < 10; s++) { var a = Math.PI * s / 5 - Math.PI / 2, rr = s % 2 ? R * 0.45 : R; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); }
            return '<polygon points="' + p.join(' ') + '" fill="' + fill + '"' + (stroke ? ' stroke="' + stroke + '" stroke-width="' + sw + '" stroke-linejoin="round"' : '') + '/>';
          };
          if (v === 'c1') {                                                  // C1 Спираль дэвтэр: утсан нуруу, улаан зах, тамга, картан дээр суусан дэгдээхэй
            var sp = '';
            for (var yy = 12; yy < 292; yy += 9.4) {
              sp += '<circle cx="7.6" cy="' + yy.toFixed(1) + '" r="1.75" fill="#14214A" opacity=".85"/>'
                + '<path d="M-1 ' + (yy - 3.6).toFixed(1) + 'C3.6 ' + (yy - 5.3).toFixed(1) + ' 8.9 ' + (yy - 4).toFixed(1) + ' 8.3 ' + (yy - 0.6).toFixed(1) + '" fill="none" stroke="url(#c1w)" stroke-width="1.3" stroke-linecap="round"/>';
            }
            h += '<svg class="cv-bg" viewBox="0 0 210 297" aria-hidden="true"><defs><linearGradient id="c1w" x1="0" y1="0" x2="1" y2="1">'
              + '<stop offset="0" stop-color="#F3F4F6"/><stop offset=".5" stop-color="#A3A9B6"/><stop offset="1" stop-color="#4B5563"/></linearGradient></defs>' + sp
              + sk2('M146 30h7M149.5 26.5v7', '#7B61FF', 1.2) + sk2('M164 42l5 5M169 42l-5 5', '#FF7A59', 1.2) + sk2('M180 30h7M180 33.5h7', '#14214A', 1.1)
              + star5(192, 46, 4.2, 'none', '#FFB020', .9)
              // доод хэсэг: шугам, гурвалжин, циркуль
              + '<g transform="rotate(-6 66 200)"><rect x="38" y="194" width="56" height="11" rx="1.6" fill="#FFF6D6" stroke="#14214A" stroke-width=".55"/>'
              + sk2('M42 194v4M47 194v2.5M52 194v4M57 194v2.5M62 194v4M67 194v2.5M72 194v4M77 194v2.5M82 194v4M87 194v2.5M92 194v4', '#14214A', .45) + '</g>'
              + sk2('M108 214h28l-28-26z', '#7B61FF', 1) + sk2('M108 209h5v5', '#7B61FF', .6)
              + sk2('M146 212a14 14 0 0 1 28 0z', '#FF7A59', 1) + sk2('M160 212v-4M150.1 202.1l2.8 2.8M169.9 202.1l-2.8 2.8M146.6 207h3.4M173.4 207h-3.4', '#FF7A59', .6)
              + '<g transform="rotate(-35 187 201)"><rect x="177" y="198.5" width="17" height="5" rx=".6" fill="#FFC93C" stroke="#14214A" stroke-width=".5"/>'
              + '<path d="M194 198.5l5 2.5-5 2.5z" fill="#FDE7C3" stroke="#14214A" stroke-width=".5" stroke-linejoin="round"/><path d="M197.6 200.3l1.4.7-1.4.7z" fill="#14214A"/>'
              + '<rect x="174" y="198.5" width="3.2" height="5" rx=".6" fill="#F472B6" stroke="#14214A" stroke-width=".5"/></g>'
              + sk2('M80 254c7-8 16-8 19-2s-3 8-5 3.6 5-9 13-7', '#7B61FF', .9) + sk2('M103.6 246.4l3.4 1.2-2.4 2.8', '#7B61FF', .9)
              + '</svg>'
              + '<div class="cv-in">' + brand
              + '<div class="c1-card"><img class="c1-chick" src="/assets/chicks/chick-1.svg" alt="">'
              + '<div class="c1-hd"><span>МАТЕМАТИК</span><span>' + esc(C.label) + '</span></div>'
              + '<div class="c1-bd"><h1>Дасгал ажлын<br>дэвтэр' + vb + '</h1><div class="c-st">' + esc(stats.join(' · ')) + '</div>' + fl + '</div>'
              + (num ? '<div class="c1-stamp' + (two ? ' two' : '') + '"><b>' + big + '</b><span>АНГИ</span></div>' : '') + '</div>'
              + '<div class="c1-low"><div class="c1-note">' + esc(F[0]) + '</div><div class="c1-qr"><i class="tp t1"></i><i class="tp t2"></i>' + qrb + '</div></div>'
              + foot + '</div>';
          } else if (v === 'c2') {                                           // C2 Наалт: өнгөт наалтууд, одон тэмдэг, «Уншуулаарай!»
            var stk = function (inner, tr) { return '<g filter="url(#c2s)"' + (tr ? ' transform="' + tr + '"' : '') + '>' + inner + '</g>'; };
            var dot = function (x, y, r, c, sym) { return stk('<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + c + '" stroke="#fff" stroke-width="1.5"/>' + sym); };
            var wl = function (d, w) { return sk2(d, '#fff', w || 1.5); };
            var burst = function (cx, cy, R, r, n) { var p = []; for (var s = 0; s < n * 2; s++) { var a = Math.PI * s / n - Math.PI / 2, rr = s % 2 ? r : R; p.push((cx + rr * Math.cos(a)).toFixed(2) + ',' + (cy + rr * Math.sin(a)).toFixed(2)); } return p.join(' '); };
            var defs = '<defs><filter id="c2s" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".5" dy=".9" stdDeviation=".7" flood-color="#14214A" flood-opacity=".3"/></filter></defs>';
            h += '<div class="c-spine c2-spine"><span>МАТЕМАТИК · ДАСГАЛ АЖЛЫН ДЭВТЭР' + (vol ? ' ' + esc(vol) : '') + '</span></div>'
              + '<svg class="cv-bg" viewBox="0 0 210 297" aria-hidden="true">' + defs
              + dot(128, 40, 7, '#FF7A59', wl('M124.5 40h7M128 36.5v7')) + dot(150, 30, 5.5, '#34D399', wl('M147 30h6', 1.3) + '<circle cx="150" cy="27.4" r=".9" fill="#fff"/><circle cx="150" cy="32.6" r=".9" fill="#fff"/>')
              + stk(star5(171, 44, 9, '#FFC93C', '#fff', 1.5)) + dot(193, 30, 6, '#7B61FF', wl('M190.4 27.4l5.2 5.2M195.6 27.4l-5.2 5.2'))
              + stk('<polygon points="40,212 64,212 52,191" fill="#34D399" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>')
              + stk('<rect x="76" y="194" width="46" height="12" rx="2" fill="#FFC93C" stroke="#fff" stroke-width="1.5"/>'
                + sk2('M80 194v4M85 194v2.5M90 194v4M95 194v2.5M100 194v4M105 194v2.5M110 194v4M115 194v2.5', '#14214A', .5), 'rotate(-8 99 200)')
              + dot(138, 208, 7, '#38BDF8', wl('M134.6 205.8h6.8M134.6 210.2h6.8', 1.4))
              + stk('<rect x="150" y="190" width="34" height="13" rx="6.5" fill="#FF7A59" stroke="#fff" stroke-width="1.5"/><text x="167" y="199.2" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial" font-weight="900" font-size="6.6" fill="#fff" letter-spacing="1">1 2 3</text>')
              + stk('<rect x="184" y="210" width="13" height="13" rx="2" fill="#7B61FF" stroke="#fff" stroke-width="1.5"/>', 'rotate(14 190.5 216.5)')
              + '</svg>'
              + '<svg class="cv-fg" viewBox="0 0 210 297" aria-hidden="true">'
              + (num ? stk('<polygon points="' + burst(181, 70, 21, 17.4, 16) + '" fill="#FFC93C" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>'
                + '<circle cx="181" cy="70" r="14.2" fill="none" stroke="#14214A" stroke-width=".5" stroke-dasharray="1 1.3"/>'
                + '<text x="181" y="' + (two ? 74.2 : 75.6) + '" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial" font-weight="900" font-size="' + (two ? 15 : 20) + '" fill="#14214A">' + big + '</text>'
                + '<text x="181.4" y="81.6" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial" font-weight="800" font-size="3.4" letter-spacing="1" fill="#14214A">АНГИ</text>', 'rotate(10 181 70)') : '')
              + '</svg>'
              + '<div class="cv-in">' + brand
              + '<div class="c2-card">' + title + (num ? '' : '<div class="c-lbl">' + esc(C.label) + '</div>') + '<div class="c-st">' + esc(stats.join(' · ')) + '</div>' + fl + '</div>'
              + '<div class="c2-low"><img class="c2-chick" src="/assets/chicks/chick-1.svg" alt=""><div class="c2-qr"><b class="c2-tag">Уншуулаарай!</b>' + qrb + '</div></div>'
              + foot + '</div>';
          } else {                                                           // C3 Хавчуурга: баруун ирмэгт бүлгийн өнгөт хавчуурга (I…XII), индекс карт
            var rom = function (n) { var R = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']], s = ''; R.forEach(function (p) { while (n >= p[0]) { s += p[1]; n -= p[0]; } }); return s; };
            var chs = (C.chs && C.chs.length ? C.chs : []).slice();
            if (!chs.length) for (var ci = 1; ci <= (+C.ch || 0); ci++) chs.push(rom(ci));
            chs = chs.slice(0, 14);
            var nT = chs.length, t0 = 22, th = nT ? Math.min(19, (252 - (nT - 1) * 1.4) / nT) : 0;
            var COLS = ['#FFC93C', '#7B61FF', '#FF7A59', '#34D399', '#38BDF8', '#F472B6'], TXT = ['#14214A', '#fff', '#fff', '#14214A', '#14214A', '#fff'];
            var tabs = chs.map(function (r, i) {
              var y = t0 + i * (th + 1.4);
              return '<rect x="194.2" y="' + y.toFixed(1) + '" width="1" height="' + th.toFixed(1) + '" fill="#14214A" opacity=".12"/>'
                + '<rect x="195" y="' + y.toFixed(1) + '" width="22" height="' + th.toFixed(1) + '" rx="2.6" fill="' + COLS[i % 6] + '"/>'
                + '<text x="202.4" y="' + (y + th / 2 + 1.5).toFixed(1) + '" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial" font-weight="800" font-size="' + (String(r).length > 3 ? 3.4 : 4.2) + '" fill="' + TXT[i % 6] + '">' + esc(r) + '</text>';
            }).join('');
            h += '<div class="c-spine"><span>МАТЕМАТИК · ДАСГАЛ АЖЛЫН ДЭВТЭР' + (vol ? ' ' + esc(vol) : '') + '</span></div>'
              + '<svg class="cv-bg" viewBox="0 0 210 297" aria-hidden="true">' + tabs
              + sk2('M128 30h7M131.5 26.5v7', '#7B61FF', 1.2) + sk2('M146 40l5 5M151 40l-5 5', '#FF7A59', 1.2) + sk2('M164 28h7M164 31.5h7', '#14214A', 1.1)
              + sk2('M178 26q1-4 5-3.6M180 23v6.4M182.6 23.2q.2 4.6 1.6 6', '#14214A', 1) + star5(112, 44, 3.8, 'none', '#FFB020', .9)
              + sk2('M120 206h40l-40 14z', '#7B61FF', 1) + sk2('M124 206v3M129 206v2M134 206v3M139 206v2M144 206v3M149 206v2', '#7B61FF', .6)
              + sk2('M168 218a10 10 0 0 1 20 0z', '#FF7A59', 1) + sk2('M178 218v-9', '#FF7A59', .55)
              + '</svg>'
              + '<div class="cv-in">' + brand
              + '<div class="c3-card"><div class="c3-top">' + title + '</div>'
              + (num ? '<div class="c3-tile' + (two ? ' two' : '') + '"><b>' + big + '</b><span>АНГИ</span></div>' : '<div class="c-lbl">' + esc(C.label) + '</div>')
              + '<div class="c-st">' + esc(stats.join(' · ')) + '</div>' + fl + '</div>'
              + '<div class="c3-low"><img src="/assets/chicks/chick-1.svg" alt=""><div class="c3-qr"><b>Онлайн дасгал</b>' + qrb + '</div></div>'
              + foot + '</div>';
          }
        } else {                                                             // ── Анхны загвар (QR нэмсэн) ──
          var nl = '<svg class="cv-line" viewBox="0 0 170 14" aria-hidden="true" fill="none" stroke="#14214A" stroke-linecap="round"><path d="M3 5H165" stroke-width=".6"/><path d="M162 3l3 2-3 2" stroke-width=".6"/>';
          for (var k = -4; k <= 4; k++) {
            var xk = 85 + k * 17;
            nl += '<path d="M' + xk + ' 3V7" stroke-width=".5"/><text x="' + xk + '" y="12.4" fill="#14214A" stroke="none" font-size="3.4" font-weight="700" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial">' + (k < 0 ? '−' + (-k) : k) + '</text>';
          }
          nl += '</svg>';
          h += '<div class="cv-in">' + brand + '<div class="cv-kick">МАТЕМАТИК</div><h1>Дасгал ажлын<br>дэвтэр' + vb + '</h1><i class="cv-bar"></i>'
            + '<div class="cv-art"><div class="cv-fx f1">' + esc(F[0]) + '</div><div class="cv-fx f2">' + esc(F[3]) + '</div><div class="cv-fx f3">' + esc(F[1]) + '</div><div class="cv-fx f4">' + esc(F[2]) + '</div>'
            + (num ? '<div class="cv-num' + (two ? ' two' : '') + '">' + big + '</div>' : '')
            + '<div class="cv-cl"><b' + (num ? '' : ' class="big"') + '>' + esc(C.label) + '</b><span>' + esc(stats.join(' · ')) + '</span></div>'
            + nl + '<img class="cv-chick" src="/assets/chicks/chick-1.svg" alt=""></div>'
            + '<div class="o-low">' + fields() + qrb + '</div>' + foot + '</div>';
        }
        return h + '</section>';
      }
      return { cover: cover, qr: qr };
    }
    /* COVERKIT:END */
    // CSS блок → .cb-N (дахин ачаалсан хуудсанд шинэ блок гарвал энд нэмнэ)
    function clsFor(styles) {
      var add = '';
      var cls = styles.map(function (t) {
        if (!BLK.has(t)) { var i = BLK.size; BLK.set(t, i); add += '.cb-' + i + '{' + t + '}\n'; }
        return 'cb-' + BLK.get(t);
      }).join(' ');
      if (add) { var st = document.createElement('style'); st.textContent = add; document.head.appendChild(st); }
      return cls;
    }

    window.__bookInit = function (data) {
      D = data;
      Object.keys(D.settings || {}).forEach(function (k) {
        var s = D.settings[k] || {};
        SET[k] = { s: s.s == null ? 1 : +s.s, g: Array.isArray(s.g) ? s.g.map(function (v) { return v == null ? null : +v; }) : [], off: !!s.off, nw: !!s.nw, ok: !!s.ok,
          p: [1, 2, 3].indexOf(+s.p) >= 0 ? +s.p : 0, t: typeof s.t === 'string' ? s.t : '',
          bh: s.bh && typeof s.bh === 'object' && !Array.isArray(s.bh) ? Object.assign({}, s.bh) : {},
          n: Array.isArray(s.n) ? s.n.map(function (v) { return v == null ? null : +v; }) : [], r: +s.r || 0 };
      });
      D.blocks.forEach(function (t, i) { BLK.set(t, i); });
      var st = document.createElement('style');
      st.textContent = D.blocks.map(function (t, i) { return '.cb-' + i + '{' + t + '}'; }).join('\n');
      document.head.appendChild(st);
      render();
      if (!window.katex) {                                                 // нүүрний томьёо KaTeX-ээр (ачаалагдсаны дараа нүүрийг дахин зурна)
        var ks = document.createElement('script');
        ks.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js';
        ks.onload = function () { redrawCover(true); };
        document.head.appendChild(ks);
      }
      var katex = document.querySelector('link[href*="katex"]');
      var ready = [document.fonts ? document.fonts.ready : null];
      if (katex && !katex.sheet) ready.push(new Promise(function (r) { katex.onload = katex.onerror = r; }));
      // Эхний тооцоо багцаар: бүгдийг уншаад → бүгдийг бичээд → бүгдийг уншаад → бүгдийг бичнэ (119 хуудсанд layout-ыг дахин дахин бодуулахгүй)
      Promise.race([Promise.all(ready), new Promise(function (r) { setTimeout(r, 5000); })]).then(function () {
        ITEMS.forEach(measure);
        fitAll(ITEMS);
        var res = ITEMS.map(calc);
        ITEMS.forEach(function (x, i) { paint(x, res[i]); });
        totals();
        retarget();                                                        // ангийн ном 200 (эсвэл 300) хуудас
      });
    };

    // Дэвтэр (I, II …) ба бүлгийн хүрээ — ангийн номыг хэд хэдэн дэвтэр болгон хэвлэнэ (энэ хөтөчид, анги бүрээр хадгалагдана)
    var VOL_KEY = 'cm_book_vol:', VR = { v: 'I', a: 0, b: 0 };
    function chOpt(sel) { return D.chapters.map(function (c, i) { return '<option value="' + i + '"' + (i === sel ? ' selected' : '') + '>' + esc(c.roman || c.title) + '</option>'; }).join(''); }
    function inVol(x) { return x.it.ci >= VR.a && x.it.ci <= VR.b; }
    function inBook(x) { return !cfg(x.it.slug).off && inVol(x); }
    // Нүүрний өгөгдөл — тухайн дэвтэрт орсон бүлэг, сэдэв, ажлын хуудсаар
    function coverData() {
      var gm = String(D.label).match(/^(\d+)\s*-?\s*р?\s*анги$/i), chs = [], tp = 0, ws = 0;
      D.chapters.forEach(function (c, i) { if (i < VR.a || i > VR.b) return; if (c.roman) chs.push(c.roman); tp += c.topics.length; });
      D.list.forEach(function (it) { if (it.snap && it.ci >= VR.a && it.ci <= VR.b && !cfg(it.slug).off) ws++; });
      COVER_DATA = { label: D.label, num: gm ? gm[1] : '', ch: chs.length || (VR.b - VR.a + 1), tp: tp, ws: ws, year: D.year, chs: chs, vol: VR.v };
    }
    var cvKey = '';
    function redrawCover(force) {
      coverData(); var k = CV + JSON.stringify(COVER_DATA) + (window.katex ? 'k' : '');
      if (k === cvKey && !force) return; cvKey = k;
      var old = document.getElementById('cover'); if (old) old.outerHTML = coverHTML(CV);
    }
    function render() {
      var app = document.getElementById('app'), h = '';
      try { TG = TG_DEF[D.label] || 'auto'; var tg0 = localStorage.getItem(TG_KEY + D.label); if (tg0 && /^(auto|min|none|[1-9][0-9]{1,2})$/.test(tg0)) TG = tg0; } catch (e) {}
      var nCh = D.chapters.length; VR = { v: 'I', a: 0, b: Math.max(0, nCh - 1) };
      try {
        var vr = JSON.parse(localStorage.getItem(VOL_KEY + D.label) || 'null');
        if (vr) { VR.v = typeof vr.v === 'string' ? vr.v : 'I'; VR.a = Math.max(0, Math.min(nCh - 1, vr.a | 0)); VR.b = Math.max(VR.a, Math.min(nCh - 1, vr.b == null ? nCh - 1 : vr.b | 0)); }
      } catch (e) {}
      // Хэрэгслийн мөр — санамсаргүй хуваагдахгүйн тулд 2 тодорхой мөр: (1) нэр, тоо, явц (2) удирдлага
      h += '<div class="tb"><div class="tb-r"><b>Дасгал ажлын дэвтэр · ' + esc(D.label) + '</b><span id="sum"></span><span id="prog" class="prog"></span></div>'
        + '<div class="tb-r"><label class="tb-f"><input type="checkbox" id="onlyTodo"> Зөвхөн шалгаагүй</label>'
        + '<label class="tb-f"><input type="checkbox" id="onlyLong"> Зөвхөн 2+ хуудастай</label>'
        + '<select id="jump"><option value="">Хуудас руу очих…</option>' + D.list.map(function (it) { return '<option value="' + it.n + '">№' + it.n + ' ' + esc(it.title) + '</option>'; }).join('') + '</select>'
        + '<label class="tb-f">Нүүр <select id="cvsel">' + COVERS.map(function (c) { return '<option value="' + c[0] + '"' + (c[0] === CV ? ' selected' : '') + '>' + c[1] + '</option>'; }).join('') + '</select></label>'
        + '<label class="tb-f" title="Нүүрэнд гарах дэвтрийн дугаар">Дэвтэр <select id="volsel">' + ['', 'I', 'II', 'III', 'IV'].map(function (v) { return '<option value="' + v + '"' + (v === VR.v ? ' selected' : '') + '>' + (v || '—') + '</option>'; }).join('') + '</select></label>'
        + '<label class="tb-f" title="Энэ дэвтэрт орох бүлгүүд">Бүлэг <select id="cha">' + chOpt(VR.a) + '</select>–<select id="chb">' + chOpt(VR.b) + '</select></label>'
        + '<label class="tb-f" title="Ангийн номын нийт хуудас (Авто: 200, багтах боломжгүй бол 300)">Зорилт <select id="tgsel">' + [['auto', 'Авто (200/300)'], ['min', 'Хамгийн бага'], ['100', '100'], ['150', '150'], ['200', '200'], ['250', '250'], ['300', '300'], ['none', 'Хязгааргүй']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === TG ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>'
        + '<button type="button" id="flipb">Ном шиг харах</button><button type="button" id="prt">Хэвлэх / PDF</button></div></div>'
        + '<div class="tip">Хэвлэхэд <b>хуудас бүр дүүрэн</b>: ажлын хуудас 1 хуудас эсвэл (урт бол) бодлогын хооронд тэнцүү хуваасан 2 хуудас болж, '
        + 'бодолтын зай нь хуудсыг дүүргэнэ. <b>Хуудас: Авто / 1 / 2</b>-оор өөрөө сонгож болно. <b>Гарчгийг</b> дарж засна. Бодолтын зай бүрийг '
        + '<b>баруун доод булангаас нь чирж</b> томруулна/жижигрүүлнэ, <b>×</b> — тэр зайг арилгана; даалгаврын гарчгийн <b>−</b> / <b>+</b> — зайн хэмжээ, '
        + '<b>Зайгүй</b> — бүх зайг нь арилгана, <b>↺</b> — анхных; <b>бодлого − / +</b> — бодлогын тоог бүтэн мөрөөр (анхдагчаар мөр бүр дүүрэн), <b>Шинэ бодлого</b> — өөр бодлого. CyberMath тамга хэвлэх хуудас бүрийн голд. '
        + '<b>Зорилт</b> — ангийн номыг яг 200 хуудас (багтахгүй бол 300) болгоно: 2 хуудастайг 1 болгож зай багасгана, шаардлагатай бол бага бодолттой даалгаврын зайг хасна. Хуудас бүрт огноо, төгсгөлд нь <b>үнэлгээний мөр</b> (сурагч өөрийгөө, багш) автоматаар орно. <b>Ном шиг харах</b> — хэвлэхэд яг ямар харагдахыг '
        + 'хоёр нүүрээр эргүүлж үзнэ. <span class="tip-r">Улаан тасархай</span> — хуудас солигдох газар. Өөрчлөлт бүр автоматаар хадгалагдана.</div>';
      // Нүүр — 8 загвар («Нүүр» сонголт, энэ хөтөчид хадгалагдана), дэвтрийн дугаар, cyber-math.com руу орох QR-тай
      coverData(); cvKey = CV + JSON.stringify(COVER_DATA) + (window.katex ? 'k' : '');
      h += coverHTML(CV);
      // Агуулга — хэвлэсэн хуудасны дугаараар (хуудас бүрийн доод талын дугаартай таарна); дугаарыг totals() тооцоолно
      // Хэвлэх цонхны захын зай/масштаб өөрчлөгдвөл хуудаслалт агуулгатай таарахгүй — тэр үед л агуулгын хуудсанд гарна (container query)
      h += '<section class="toc"><div class="toc-warn">Хэвлэх тохиргоог засна уу: <b>Margins (Захын зай) — Default</b>, <b>Scale (Масштаб) — Default (100%)</b>. '
        + 'Өөр тохиргоогоор хэвлэвэл хуудасны дугаар агуулгатай таарахгүй.</div><h2>Агуулга</h2>';
      D.chapters.forEach(function (c, ci) {
        h += '<div class="toc-ch" data-ci="' + ci + '"><span>' + esc(c.roman || '') + '</span><b>' + esc(c.title) + '</b><i></i><em></em></div>';
        c.topics.forEach(function (t, ti) { h += '<div class="toc-tp" data-ci="' + ci + '" data-ti="' + ti + '"><span>' + esc(t.num) + '</span>' + esc(t.title) + '<i></i><em></em></div>'; });
      });
      h += '</section>';
      // Ажлын хуудсууд
      D.list.forEach(function (it) {
        var c = D.chapters[it.ci], t = c && c.topics[it.ti];
        var where = esc((c && c.roman ? c.roman + ' · ' : '') + (t ? (t.num ? t.num + ' ' : '') + t.title : ''));
        if (!it.snap) { h += '<section class="wsx-err" id="ws-' + it.n + '">№' + it.n + ' ' + esc(it.title) + ' — ачаалж чадсангүй (' + esc(it.err || '') + ')</section>'; return; }
        var s = cfg(it.slug);
        h += '<section class="wsx' + (s.off ? ' off' : '') + (s.ok ? ' done' : '') + '" id="ws-' + it.n + '" data-n="' + it.n + '">'
          + '<div class="wsx-bar"><span class="no">№' + it.n + '</span><span class="nm"><b>' + esc(s.t || it.title) + '</b><small>' + where + '</small></span>'
          + '<span class="pgs"></span><span class="fit"></span><span class="pno"></span>'
          + '<label class="tg"><input type="checkbox" data-a="wk"' + (s.nw ? '' : ' checked') + '> Бодолтын зайтай</label>'
          + '<span class="ctl pgsel">Хуудас <button type="button" data-a="p" data-v="0">Авто</button><button type="button" data-a="p" data-v="1">1</button><button type="button" data-a="p" data-v="2">2</button></span>'
          + (it.snap.tasks ? '<button type="button" class="nb" data-a="new" title="Энэ хуудасны бодлогыг шинээр сонгоно (тоо, тохиргоо хэвээр)">Шинэ бодлого</button>' : '')
          + '<label class="tg"><input type="checkbox" data-a="inc"' + (s.off ? '' : ' checked') + '> Номд оруулах</label>'
          + '<label class="tg okc"><input type="checkbox" data-a="ok"' + (s.ok ? ' checked' : '') + '> Шалгасан</label>'
          + '<span class="sst"></span></div>'
          + '<div class="wsx-paper ' + it.cls + '" style="' + esc(it.snap.root) + '">' + it.snap.html + '</div></section>';
      });
      app.innerHTML = h;
      D.list.forEach(function (it) {
        if (!it.snap) return;
        var sec = document.getElementById('ws-' + it.n), x = { it: it, sec: sec, paper: sec.querySelector('.wsx-paper') };
        prep(x); sec._it = x; ITEMS.push(x);
      });
      // Хуудасны удирдлагын мөр хэрэгслийн мөрийн бодит өндрийн доор наалдана (--tbh)
      var tbEl = document.querySelector('.tb');
      var setTbh = function () { document.documentElement.style.setProperty('--tbh', tbEl.offsetHeight + 'px'); };
      setTbh(); window.addEventListener('resize', setTbh);
      document.getElementById('prt').onclick = function () { window.print(); };
      document.getElementById('flipb').onclick = function () { openFlip(); };
      document.getElementById('tgsel').onchange = function () { TG = this.value; try { localStorage.setItem(TG_KEY + D.label, TG); } catch (e) {} tgStuck = -1; ITEMS.forEach(function (x) { x.tgBad = false; }); retarget(); };
      document.getElementById('cvsel').onchange = function () { CV = this.value; try { localStorage.setItem(CV_KEY, CV); } catch (e) {} redrawCover(true); };
      var saveVR = function () { try { localStorage.setItem(VOL_KEY + D.label, JSON.stringify(VR)); } catch (e) {} };
      document.getElementById('volsel').onchange = function () { VR.v = this.value; saveVR(); redrawCover(); };
      document.getElementById('cha').onchange = function () {
        VR.a = +this.value; if (VR.b < VR.a) { VR.b = VR.a; document.getElementById('chb').value = String(VR.b); }
        saveVR(); totals();
      };
      document.getElementById('chb').onchange = function () {
        VR.b = +this.value; if (VR.a > VR.b) { VR.a = VR.b; document.getElementById('cha').value = String(VR.a); }
        saveVR(); totals();
      };
      document.getElementById('jump').onchange = function () {
        var e = document.getElementById('ws-' + this.value);
        if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - tbEl.offsetHeight - 10, behavior: 'smooth' });
        this.value = '';
      };
      document.getElementById('onlyLong').onchange = function () { onlyLong = this.checked; ITEMS.forEach(vis); };
      document.getElementById('onlyTodo').onchange = function () { onlyTodo = this.checked; ITEMS.forEach(vis); };
      bindEdit(app);
    }
    // Засварын үйлдлүүд — үндсэн засварлагч (#app) ба «Ном шиг харах» (#flip) хоёуланд ижил: хуудасны эзэн (.wsx эсвэл .fp-w) нь _it-тэй.
    // «Ном шиг харах»-д хуудас бүр хуулбар — үйлдэл жинхэнэ хуудсанд хэрэгжиж (apply), дараа нь нүүрүүд дахин зурагдана.
    function hostOf(el) { var h = el && el.closest ? (el.closest('.wsx') || el.closest('.fp-w')) : null; return h && h._it ? h : null; }
    function syncBar(x) {
      var s = cfg(x.it.slug), q = function (a) { return x.sec.querySelector('.wsx-bar [data-a="' + a + '"]'); };
      if (q('inc')) q('inc').checked = !s.off; if (q('ok')) q('ok').checked = s.ok; if (q('wk')) q('wk').checked = !s.nw;
      x.sec.classList.toggle('off', s.off); x.sec.classList.toggle('done', s.ok);
    }
    function onChange(e) {
      var t = e.target, a = t.getAttribute && t.getAttribute('data-a'); if (!a) return;
      var h = hostOf(t); if (!h) return;
      var x = h._it, s = cfg(x.it.slug);
      if (a === 'inc') { s.off = !t.checked; syncBar(x); totals(); save(x); }
      else if (a === 'ok') {
        s.ok = t.checked;
        if (s.ok) {                                                        // зорилтын сонголт (хуудасны тоо, хассан зай) тогтворжино
          if (x.tp && !s.p) s.p = x.tp;
          if (x.rm) Object.keys(x.rm).forEach(function (k) { if (+k >= 0 && s.g[+k] == null) s.g[+k] = 0; });
        }
        syncBar(x); totals(); vis(x); save(x);
      }
      else if (a === 'wk') { s.nw = !t.checked; syncBar(x); reload(x); }
    }
    // Гарчиг засах: бичих бүрд хадгална (ажлын хуудасныхтай ижил бол хоосон — анхных), Enter — дуусгах, гарахад хуудсыг дахин дүүргэнэ
    function onInput(e) {
      var t = e.target.closest ? e.target.closest('.wsx-ttl') : null; if (!t) return;
      var h = hostOf(t); if (!h) return;
      var x = h._it, s = cfg(x.it.slug), v = t.textContent.replace(/\s+/g, ' ').trim(), lt = x.sheet.querySelector('.wsx-ttl');
      s.t = v && v !== t.getAttribute('data-t0') ? v.slice(0, 160) : '';
      if (lt && lt !== t) lt.textContent = s.t || lt.getAttribute('data-t0') || '';
      x.sec.querySelector('.wsx-bar .nm b').textContent = s.t || x.it.title;
      save(x);
    }
    function onKey(e) { var t = e.target.closest ? e.target.closest('.wsx-ttl') : null; if (t && e.key === 'Enter') { e.preventDefault(); t.blur(); } }
    function onBlur(e) {
      var t = e.target.closest ? e.target.closest('.wsx-ttl') : null; if (!t) return;
      var h = hostOf(t); if (!h) return;
      var x = h._it, lt = x.sheet.querySelector('.wsx-ttl');
      if (!t.textContent.trim()) {
        cfg(x.it.slug).t = ''; [t, lt].forEach(function (e2) { if (e2) e2.textContent = e2.getAttribute('data-t0') || ''; });
        x.sec.querySelector('.wsx-bar .nm b').textContent = x.it.title; save(x);
      }
      apply(x); totals();
    }
    function onDbl(e) {                                                    // бариулыг 2 дарвал — тэр зай дахин авто
      var g = e.target.closest ? e.target.closest('.wsx-grip') : null; if (!g) return;
      var b = g.closest('[data-bk]'), h = hostOf(g); if (!b || !h) return;
      var x = h._it; delete cfg(x.it.slug).bh[b.getAttribute('data-bk')]; apply(x); totals(); save(x);
    }
    function bindEdit(root) {
      root.addEventListener('click', onClick); root.addEventListener('change', onChange); root.addEventListener('input', onInput);
      root.addEventListener('keydown', onKey); root.addEventListener('focusout', onBlur); root.addEventListener('pointerdown', onGrip);
      root.addEventListener('dblclick', onDbl);
    }
    var ICO_X = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    var ICO_GRIP = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M21 9L9 21M21 15.5l-5.5 5.5"/></svg>';
    var ICO_RS = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5V9H9"/></svg>';
    var EV_STAR = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.2 6L12 16.5l-5.5 2.9 1.2-6-4.5-4.2 6.1-.8z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
    var DATE = '<div class="wsx-date">20<i class="y"></i> он <i></i> сар <i></i> өдөр</div>';
    // Номд сурагчийн нэр хуудас бүрт хэрэггүй (нүүрэнд бий): «Нэр / Анги / Огноо / Оноо» талбарын оронд огноо (он, сар, өдөр)
    function metaFix(x) {
      if (x.sheet.querySelector('.wsx-date')) return;
      var m = x.sheet.querySelector('.meta');
      if (m) {
        [].slice.call(m.children).forEach(function (c) { if (/^\s*(Нэр|Анги|Огноо|Оноо)\s*:/.test(c.textContent)) c.remove(); });
        m.classList.add('wsx-meta'); m.insertAdjacentHTML('beforeend', DATE);
      } else {
        var hd = x.sheet.querySelector('.head'), el = '<div class="wsx-meta wsx-meta0">' + DATE + '</div>';
        if (hd && hd.parentNode === x.sheet) hd.insertAdjacentHTML('afterend', el); else x.sheet.insertAdjacentHTML('afterbegin', el);
      }
    }
    // Ажлын хуудасны төгсгөлд үнэлгээний мөр: сурагч өөрийгөө (5 од), багш (оноо, гарын үсэг)
    function evRow(x) {
      if (x.sheet.querySelector('.wsx-ev')) return;
      var st = ''; for (var i = 0; i < 5; i++) st += EV_STAR;
      var h = '<div class="wsx-ev"><div class="ev-c"><b>Өөрийгөө үнэл</b><span class="ev-st">' + st + '</span></div>'
        + '<div class="ev-c ev-t"><b>Багшийн үнэлгээ</b><span>Оноо <i></i></span><span>Гарын үсэг <i class="w"></i></span></div></div>';
      var ft = x.sheet.querySelector('.cm-foot');
      if (ft && ft.parentNode === x.sheet) ft.insertAdjacentHTML('beforebegin', h); else x.sheet.insertAdjacentHTML('beforeend', h);
    }
    // Хуудасны бэлтгэл (анх ба дахин ачаалсны дараа): хөлд №, засах гарчиг, огноо, үнэлгээний мөр; даалгаврын гарчигт
    // зайн − / +, «Зайгүй», ↺ ба бодлогын тоо − / +; бодолтын зай бүрт × ба чирэх бариул (түлхүүр «даалгавар.дугаар»)
    function prep(x) {
      x.sheet = x.paper.firstElementChild; x.units = null;
      var s = cfg(x.it.slug);
      var ft = x.sheet.querySelector('.cm-foot'); if (ft && !ft.querySelector('.wsx-no')) ft.insertAdjacentHTML('afterbegin', '<span class="wsx-no"><b>№' + x.it.n + '</b> · </span>');
      var h1 = x.sheet.querySelector('.head h1') || x.sheet.querySelector('h1');
      if (h1) {
        h1.setAttribute('data-t0', h1.textContent.replace(/\s+/g, ' ').trim());
        if (s.t) h1.textContent = s.t;
        h1.classList.add('wsx-ttl'); h1.setAttribute('spellcheck', 'false'); h1.title = 'Гарчгийг засах';
        h1.setAttribute('contenteditable', 'plaintext-only'); if (h1.contentEditable !== 'plaintext-only') h1.setAttribute('contenteditable', 'true');
      }
      metaFix(x); evRow(x);
      var wm0 = x.sheet.querySelector('.cm-wm:not(.wsx-wm)');               // тамгыг хэвлэх хуудас бүрт stamps() байрлуулна
      if (wm0) { x.wmHTML = wm0.outerHTML; wm0.remove(); }
      x.heads = [].slice.call(x.sheet.querySelectorAll('.task, .sec'));
      var headOf = function (el) { var k = -1; x.heads.forEach(function (hd, i) { if (hd.compareDocumentPosition(el) & 4) k = i; }); return k; };
      // бодолтын зай: нүд (.wk .work .pw .wgrid .wz) ба бодлогын доорх хариултын мөр (.bl .wl — блок үед л; мөр доторх «____» биш)
      x.boxes = [].slice.call(x.sheet.querySelectorAll('.wk, .work, .pw, .wgrid, .wz, .bl, .wl')).filter(function (b) {
        return !/^(inline|none|contents)/.test(getComputedStyle(b).display) && !b.parentNode.closest('.wk, .work, .pw, .wgrid, .wz, .bl, .wl');
      });
      var cnt = {};
      x.boxes.forEach(function (b) {
        var k = headOf(b), j = cnt[k] = cnt[k] == null ? 0 : cnt[k] + 1;
        b.setAttribute('data-g', k); b.setAttribute('data-bk', k + '.' + j);
        if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
        b.insertAdjacentHTML('beforeend', '<span class="wsx-bx"><button type="button" data-a="bx" title="Энэ бодолтын зайг арилгах">' + ICO_X + '</button>'
          + '<i class="wsx-grip" title="Чирж томруулах / жижигрүүлэх (2 дарвал — авто)">' + ICO_GRIP + '</i></span><span class="wsx-hl"></span>');
      });
      // шинэ хөдөлгүүр: даалгавар бүр нэг .grid[data-gr] (TASKS-ийн дарааллаар) — бодлогын тоо − / +
      var T = x.it.snap && x.it.snap.tasks, grids = T ? [].slice.call(x.sheet.querySelectorAll('.grid[data-gr]')) : [];
      if (!T || grids.length !== T.length) grids = [];
      x.heads.forEach(function (hd, i) {
        var hasB = x.boxes.some(function (b) { return +b.getAttribute('data-g') === i; }), gs = [];
        grids.forEach(function (g, j) { if (headOf(g) === i) gs.push(j); });
        if (!hasB && !gs.length) return;
        if (getComputedStyle(hd).position === 'static') hd.style.position = 'relative';
        var c = '<span class="wsx-sc" data-g="' + i + '">';
        if (hasB) c += '<span class="z" title="Бодолтын зайн хэмжээ (бусадтай харьцуулсан)"><button type="button" data-a="g" data-d="-1">−</button><b>100%</b><button type="button" data-a="g" data-d="1">+</button></span>'
          + '<button type="button" class="zx" data-a="gx" title="Энэ даалгаврын бодолтын зайг арилгах / буцаах">Зайгүй</button>'
          + '<button type="button" class="rs" data-a="rs" title="Гараар тохируулсан зайг анхных болгох" hidden>' + ICO_RS + '</button>';
        gs.forEach(function (j) {
          c += '<span class="cnt" data-t="' + j + '" title="Бодлогын тоо (бүтэн мөрөөр нэмж хасна)"><button type="button" data-a="n" data-d="-1">−</button><b>' + T[j].n + '</b>'
            + '<button type="button" data-a="n" data-d="1">+</button><i>бодлого</i></span>';
        });
        hd.insertAdjacentHTML('beforeend', c + '</span>');
      });
    }
    // Бодолтын зайг баруун доод булангаас чирж өндрийг тохируулна (0.5 мм алхам) — хэвлэхэд яг тэр өндөр, хуудас дахин дүүргэгдэнэ
    function onGrip(e) {
      var g = e.target.closest ? e.target.closest('.wsx-grip') : null; if (!g || e.button) return;
      var b = g.closest('[data-bk]'), host = hostOf(g); if (!b || !host) return;
      e.preventDefault();
      // дэлгэц дээрх харьцаа (хуудасны zoom ба «Ном шиг харах»-ын масштаб хоёуланг): харагдах өндөр / CSS өндөр
      var x = host._it, s = cfg(x.it.slug), key = b.getAttribute('data-bk'), rc = b.getBoundingClientRect();
      var h0 = parseFloat(getComputedStyle(b).height) || rc.height, z = rc.height && h0 ? rc.height / h0 : 1;
      var y0 = e.clientY, hl = b.querySelector(':scope > .wsx-hl');
      var hOf = function (ev) { return Math.max(4 * MM, h0 + (ev.clientY - y0) / z); };
      var mv = function (ev) { var hh = hOf(ev); b.style.setProperty('height', Math.round(hh) + 'px', 'important'); if (hl) hl.textContent = (Math.round(hh / MM * 2) / 2) + ' мм'; };
      var end = function (ev) {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
        b.classList.remove('wsx-drag');
        if (ev.type === 'pointerup') { s.bh[key] = Math.min(280, Math.round(hOf(ev) / MM * 2) / 2); save(x); }
        apply(x); totals();
      };
      b.classList.add('wsx-drag');
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    }
    function measure(x) { x.boxes.forEach(function (b) { b.setAttribute('data-h0', b.getBoundingClientRect().height || parseFloat(getComputedStyle(b).height) || 40); }); }
    // Бодолтын зайтай ↔ зайгүй: ажлын хуудсыг тухайн горимоор нь дахин ачаална (Дасгалын төвийн цонх нээлттэй байх ёстой)
    function reload(x) {
      var s = cfg(x.it.slug), op = window.opener;
      if (!op || op.closed || !op.WSBOOK || !op.WSBOOK.snap) { setSt(x, 'Дасгалын төвийн хуудас хаагдсан тул дахин ачаалж чадсангүй', 'err'); return; }
      setSt(x, 'Ачаалж байна…', 'busy'); x.sec.classList.add('busy');
      op.WSBOOK.snap(x.it.slug, !s.nw, { n: s.n, r: s.r }).then(function (snap) {
        x.it.snap = snap;
        x.paper.className = 'wsx-paper ' + clsFor(snap.styles);
        x.paper.setAttribute('style', snap.root);
        x.paper.innerHTML = snap.html;
        prep(x); measure(x); apply(x); totals(); save(x);
      }, function (e) { setSt(x, 'Ачаалж чадсангүй: ' + esc(String((e && e.message) || e)), 'err'); })
        .then(function () { x.sec.classList.remove('busy'); });
    }

    function onClick(e) {
      var b = e.target.closest('button'); if (!b) return;
      var a = b.getAttribute('data-a'); if (!a) return;
      var host = hostOf(b); if (!host) return;
      var x = host._it, s = cfg(x.it.slug), sc = b.closest('.wsx-sc'), gk = sc ? sc.getAttribute('data-g') : null;
      if (a === 'g') s.g[+gk] = clamp((s.g[+gk] == null ? 1 : s.g[+gk]) + (+b.getAttribute('data-d')) * 0.1);
      else if (a === 'gx') s.g[+gk] = s.g[+gk] != null && s.g[+gk] <= 0 ? 1 : 0;        // даалгаврын бүх зай: арилгах ↔ буцаах
      else if (a === 'rs') Object.keys(s.bh).forEach(function (key) { if (key.split('.')[0] === gk) delete s.bh[key]; });
      else if (a === 'bx') { var bx = b.closest('[data-bk]'); if (!bx) return; s.bh[bx.getAttribute('data-bk')] = 0; }
      else if (a === 'n') {                                                // бодлогын тоо — товшилт дууссаны дараа хуудсыг дахин ачаална
        var ct = b.closest('.cnt'), j = +ct.getAttribute('data-t'), T = x.it.snap && x.it.snap.tasks; if (!T || !T[j]) return;
        // бүтэн мөрөөр алхана (4 баганад 6 → + 8, − 4): мөр дутуу үлдэхгүй; дараалсан товшилтод харагдаж буй тооноос
        var c = T[j].cols || 1, cur = +ct.querySelector('b').textContent || T[j].n, up = +b.getAttribute('data-d') > 0;
        var nv = Math.max(c, Math.min(40, up ? (Math.floor(cur / c) + 1) * c : (Math.ceil(cur / c) - 1) * c));
        if (nv === cur) return;
        s.n[j] = nv; ct.querySelector('b').textContent = nv;
        setSt(x, 'Бодлогын тоо өөрчлөгдөж байна…', 'busy');
        clearTimeout(x.nT); x.nT = setTimeout(function () { reload(x); }, 700);
        return;
      }
      else if (a === 'new') { s.r = 1 + Math.floor(Math.random() * 999999999); reload(x); return; }
      else if (a === 'p') s.p = +b.getAttribute('data-v') || 0;
      else return;
      apply(x); totals(); save(x);
    }

    // Даалгаврын жин (гарчгийн − / +): тэр даалгаврын бодолтын зай бусдаасаа их/бага; 0 — нуух
    function wOf(x, b) {
      var s = cfg(x.it.slug), k = +b.getAttribute('data-g');
      if (k >= 0 && s.g[k] != null) return s.g[k];
      return x.rm && x.rm[k] ? 0 : 1;                                     // хуудасны зорилтод бодолтын зайг нь хассан даалгавар
    }
    // Гараар тогтоосон өндөр (мм) — bh["даалгавар.дугаар"]; 0 — тэр зайг арилгасан; null — авто (хуудсыг дүүргэхэд оролцоно)
    function fixOf(x, b) { var s = cfg(x.it.slug), key = b.getAttribute('data-bk'); return key != null && s.bh[key] != null ? +s.bh[key] : null; }
    // Бодолтын зайн өндөр = анхны өндөр (data-h0) × даалгаврын жин × тухайн хуудсыг дүүргэх коэффициент (x.bf[i]; fitAll),
    // гараар тогтоосон бол яг тэр өндөр
    function setHeights(x) {
      var s = cfg(x.it.slug);
      x.boxes.forEach(function (b, i) {
        var f = fixOf(x, b), w = wOf(x, b), sc = w * (x.bf && x.bf[i] != null ? x.bf[i] : 1), h0 = +b.getAttribute('data-h0') || 0;
        b.classList.toggle('wsx-fix', f != null && f > 0);
        if (w <= 0 || f === 0) { b.style.setProperty('display', 'none', 'important'); return; }
        b.style.removeProperty('display');
        b.style.setProperty('height', (f != null ? Math.round(f * MM) : Math.max(4, Math.round(h0 * sc))) + 'px', 'important');
        b.style.setProperty('min-height', '0', 'important');
        var hl = b.querySelector(':scope > .wsx-hl'); if (hl) hl.textContent = f != null ? f + ' мм' : '';
      });
      [].forEach.call(x.sec.querySelectorAll('.wsx-sc'), function (c) {
        var k = c.getAttribute('data-g'), g = s.g[+k] == null ? 1 : s.g[+k], z = c.querySelector('.z b'), zx = c.querySelector('.zx'), rs = c.querySelector('.rs');
        if (z) z.textContent = pct(g);
        if (zx) { zx.classList.toggle('on', g <= 0); zx.textContent = g <= 0 ? 'Зай нэмэх' : 'Зайгүй'; }
        if (rs) rs.hidden = !Object.keys(s.bh).some(function (key) { return key.split('.')[0] === k; });
      });
      [].forEach.call(x.sec.querySelectorAll('.pgsel button'), function (bt) { bt.classList.toggle('on', +bt.getAttribute('data-v') === (s.p || 0)); });
    }
    function apply(x) { fitAll([x]); paint(x, calc(x)); }

    // ── Хуудас дүүргэх (fitAll) ── хэмжилт багцаар: бүгдийг бичээд → бүгдийг уншина (150 орчим хуудсанд layout цөөн удаа)
    // A) Бодолтын зайг хамгийн бага (AF_MIN) болгож хэмжинэ: агуулгын өндөр H, хуваагдахгүй нэгжүүд, бодолтын зайнууд.
    // B) Хуудасны тоо P (plan): багтвал 1 (зай хэт багасахаар бол 2); зайгүй хуудас бага зэрэг халивал хэмжээг 75%+ болгож 1;
    //    эс бөгөөс ⌈H/FIT_H⌉. Админ «Хуудас: 1/2»-оор сонгож болно.
    // C) P ≥ 2: «цэвэр» таслал — өмнөх бүх нэгжийн доороос эхэлсэн (2 баганатай мөрийн дунд биш), гарчгаасаа салахгүй, хуудсуудын
    //    агуулга тэнцүү. Таслалын нэгжид .wsx-pb (хэвлэхэд break-before:page).
    // D) Хуудас бүрийн бодолтын зайг (FIT_H − агуулга)/зай-аар дүүргэнэ; хэмжиж нарийвчилна (2 баганатай торонд шугаман биш).
    function sheetH(x) { return x.sheet.getBoundingClientRect().height; }
    function fitAll(list) {
      var xs = list.filter(function (x) { return x.sheet; });
      xs.forEach(function (x) {                                           // A — бичнэ
        x.sec.classList.remove('hid'); x.zm = 1; x.sheet.style.zoom = '';
        [].forEach.call(x.sheet.querySelectorAll('.wsx-pb'), function (e) { e.classList.remove('wsx-pb'); });
        [].forEach.call(x.sheet.querySelectorAll('.wsx-fill'), function (e) { e.remove(); });
        x.bf = x.boxes.map(function () { return AF_MIN; }); setHeights(x);
      });
      xs.forEach(function (x) {                                           // A — уншина
        var top0 = x.sheet.getBoundingClientRect().top, U = x.units || (x.units = units(x));
        x.m = { H: sheetH(x),
          U: U.map(function (u) { var r = u.el.getBoundingClientRect(); return { el: u.el, t: r.top - top0, b: r.bottom - top0, h: r.height, ba: u.ba || u.el.matches(HEADS),
            tb: /table/.test(getComputedStyle(u.el.parentNode).display), ev: u.el.classList.contains('wsx-ev') }; }),
          // гараар тогтоосон өндөртэй зай хуудсыг дүүргэхэд оролцохгүй (жин 0)
          B: x.boxes.map(function (b) { return { t: b.getBoundingClientRect().top - top0, k: +b.getAttribute('data-g'),
            h0w: fixOf(x, b) != null ? 0 : (+b.getAttribute('data-h0') || 0) * Math.max(0, wOf(x, b)) }; }) };
      });
      xs.forEach(plan);                                                    // B, C
      xs.forEach(function (x) {                                           // D — бичнэ
        x.sheet.style.zoom = x.zm < 1 ? x.zm : '';
        x.cuts.forEach(function (u) { u.el.classList.add('wsx-pb'); });
        setHeights(x);
      });
      for (var round = 0, R = 6; round < R; round++) {
        xs.forEach(function (x) { x.got = pageContents(x); });           // уншина
        var ch = false;
        xs.forEach(function (x) { if (refine(x, round === R - 1)) ch = true; });   // бичнэ
        if (!ch) break;
      }
      // E) Бодолтын зай хуудсыг дүүргэж чадаагүй бол (зайгүй/цөөн даалгавартай) хуудасны доор «Бодолтын зай» талбай
      xs.forEach(function (x) { x.got = pageContents(x); });
      xs.forEach(addFillers);
      var fx = xs.filter(function (x) { return x.fills.length; });
      fx.forEach(function (x) { x.got = pageContents(x); });
      fx.forEach(function (x) {
        x.fills.forEach(function (f) {
          var over = x.got[f.q] - FIT_H; if (over <= 0) return;
          f.h -= over + MM;
          if (f.h < 10 * MM) f.el.remove(); else f.el.style.height = Math.round(f.h) + 'px';
        });
      });
    }
    function addFillers(x) {
      x.fills = [];
      if (cfg(x.it.slug).nw || x.zm < 1) return;                          // админ зайг унтраасан / жижигрүүлсэн хуудас
      x.got.forEach(function (g, q) {
        var h = FIT_H - g - 5 * MM; if (h < 14 * MM) return;
        var el = document.createElement('div'), ref = q < x.cuts.length ? x.cuts[q].el : null, par = ref ? ref.parentNode : x.sheet;
        if (!ref) {                                                       // сүүлийн хуудас: үнэлгээний мөрийн (эсвэл хөлийн) өмнө
          var ev = x.sheet.querySelector('.wsx-ev'), ft = x.sheet.querySelector('.cm-foot');
          if (ev && ev.parentNode === x.sheet) ref = ev; else if (ft && ft.parentNode === x.sheet) ref = ft;
        }
        // хүснэгтийн мөрийн өмнө / нэг мөрт flex дотор блок оруулж болохгүй — тэр хуудсыг дүүргэхгүй үлдээнэ
        var cs = getComputedStyle(par), d = cs.display;
        if (/table/.test(d) || (/flex/.test(d) && !/column/.test(cs.flexDirection) && cs.flexWrap === 'nowrap')) return;
        if (/grid/.test(d)) el.style.gridColumn = '1 / -1'; else if (/flex/.test(d)) el.style.flex = '0 0 100%';
        el.className = 'wsx-fill'; el.style.height = Math.round(h) + 'px';
        par.insertBefore(el, ref);
        x.fills.push({ el: el, q: q, h: h });
      });
    }
    // Хуудас бүрийн агуулгын өндөр (таслалын нэгжүүдийн дээд хооронд)
    function pageContents(x) {
      var r0 = x.sheet.getBoundingClientRect(), ys = [0];
      x.cuts.forEach(function (u) { ys.push(u.el.getBoundingClientRect().top - r0.top); });
      ys.push(r0.height);
      var out = []; for (var j = 0; j < ys.length - 1; j++) out.push(ys[j + 1] - ys[j]);
      return out;
    }
    function plan(x) {
      var m = x.m, s = cfg(x.it.slug), H = m.H;
      var Wsum = function (lo, hi) { var t = 0; m.B.forEach(function (b) { if (b.t >= lo && b.t < hi) t += b.h0w; }); return t; };
      // Хуудасны тоо: бодолтын зай дунджаар F1_MIN-ээс багагүй байх хамгийн цөөн хуудас (H1 — зай F1_MIN үеийн өндөр);
      // бодолтын зайгүй хуудас бага зэрэг халивал (≤ 1/Z1) хэмжээг багасгаж 1 хуудсанд
      var W = Wsum(-1e9, 1e9), H1 = H + (F1_MIN - AF_MIN) * W;
      var P = s.p || x.tp || 0;                                            // tp — хуудасны зорилтын тоо (retarget)
      if (!P) P = W > 0 ? Math.max(1, Math.ceil(H1 / FIT_H)) : (H * Z1 <= FIT_H ? 1 : Math.ceil(H / FIT_H));
      x.cuts = []; x.zm = 1;
      if (P >= 2) {
        var cand = [], maxB = 0, last = null;
        m.U.forEach(function (u, k) {
          if (!u.h) return;
          var clean = u.t >= maxB - 1;                                     // өмнөх бүх нэгжийн доороос (дотоод/хажуугийн нэгж биш)
          if (clean && k > 0 && u.t > 1 && !(last && last.ba) && !u.ev) cand.push(u);   // үнэлгээний мөр өмнөхөөсөө салахгүй
          if (clean) last = u;
          maxB = Math.max(maxB, u.b);
        });
        // Таслал бүрээс өмнөх бодолтын зай (угтвар нийлбэр) — хуудасны зай = Wc[i] − Wc[j]
        var Wc = cand.map(function (u) { return Wsum(-1e9, u.t); });
        // Хуудасны «өртөг»: дүүргэж чадахгүй зай (талбай нэмэгдэнэ; хүснэгтийн дундах таслалын өмнө талбай оруулж чадахгүй тул ×3) +
        // F1_MIN-ээс бага (давчуу) зай + агуулгын тэнцвэр. relax — админ хуудасны тоог зааж өгсөн: халихыг их торгуультай зөвшөөрнө.
        var pageCost = function (c0, Wq, cut, n, relax) {
          if (c0 < 10 * MM) return Infinity;
          if (c0 > FIT_H && !relax) return Infinity;
          var gap = Math.max(0, FIT_H - c0 - (AF_MAX - AF_MIN) * Wq), f = Wq > 0 ? AF_MIN + (FIT_H - c0) / Wq : AF_MAX;
          return (c0 > FIT_H ? 1e6 + (c0 - FIT_H) * 100 : 0) + gap * (cut && cut.tb ? 3 : 1) + Math.max(0, F1_MIN - f) * Wq * 2 + 0.3 * Math.abs(c0 - H / n);
        };
        // n хуудсанд хуваах хамгийн бага өртөгтэй таслалууд (динамик програмчлал)
        var split = function (n, relax) {
          var M = cand.length, dp = [], i, j, k, v;
          for (k = 1; k < n; k++) {
            dp[k] = [];
            for (i = 0; i < M; i++) {
              var bv = Infinity, arg = -1;
              if (k === 1) bv = pageCost(cand[i].t, Wc[i], cand[i], n, relax);
              else for (j = 0; j < i; j++) {
                if (!(dp[k - 1][j].v < Infinity)) continue;
                v = dp[k - 1][j].v + pageCost(cand[i].t - cand[j].t, Wc[i] - Wc[j], cand[i], n, relax);
                if (v < bv) { bv = v; arg = j; }
              }
              dp[k][i] = { v: bv, prev: arg };
            }
          }
          var fin = null;
          for (i = 0; i < M; i++) {
            if (!(dp[n - 1][i].v < Infinity)) continue;
            v = dp[n - 1][i].v + pageCost(H - cand[i].t, W - Wc[i], null, n, relax);
            if (v < Infinity && (!fin || v < fin.v)) fin = { v: v, i: i };
          }
          if (!fin) return null;
          var cuts = [], ii = fin.i;
          for (k = n - 1; k >= 1; k--) { cuts.unshift(cand[ii]); ii = dp[k][ii].prev; }
          return cuts;
        };
        var cuts = null;
        if (s.p || x.tp) cuts = split(P, true);
        else for (var n = P; !cuts && n <= Math.min(P + 2, 8); n++) cuts = split(n, false);
        x.cuts = cuts || [];
        if (!x.cuts.length) P = 1;                                         // хуваах газаргүй (нэг нэгж хуудаснаас урт) — 1 хуудсанд жижигрүүлнэ
      }
      // Хуудас тус бүр: агуулга (зай хамгийн бага үед), зай, дүүргэх коэффициент
      var ys = [0].concat(x.cuts.map(function (u) { return u.t; })).concat([H]);
      x.pg = [];
      for (var q = 0; q < ys.length - 1; q++) {
        var lo = ys[q], hi = q === ys.length - 2 ? 1e9 : ys[q + 1], c0 = ys[q + 1] - ys[q], Wq = Wsum(q ? lo : -1e9, hi);
        x.pg.push({ c0: c0, W: Wq, f: Wq > 0 ? Math.max(AF_MIN, Math.min(AF_MAX, AF_MIN + (FIT_H - c0) / Wq)) : AF_MIN,
          lo: c0 <= FIT_H ? { f: AF_MIN, g: c0 } : null, hi: null, prev: { f: AF_MIN, g: c0 } });
      }
      x.boxPage = m.B.map(function (b) { var q = 0; while (q < x.cuts.length && b.t >= x.cuts[q].t) q++; return q; });
      x.bf = x.boxPage.map(function (q) { return x.pg[q].f; });
      if (!x.cuts.length && H > FIT_H) x.zm = Math.max(ZM_MIN, FIT_H / H);   // 1 хуудас, зай хамгийн бага ч халина
    }
    // Хэмжсэн агуулгаар нарийвчилна (хуудас бүр тусдаа). Бодолтын зай: [lo, hi] хашилт — lo: багтсан хамгийн их f, hi: халисан
    // хамгийн бага f; hi олдоогүй бол хэмжсэн налуугаар томруулна (зургийн хажуух нүд эхэндээ мөрийн өндрийг өөрчлөхгүй — тэгвэл
    // алхмыг томруулна). last — сүүлийн удаа: халисан хуудсыг lo руу буцаана. zoom: өргөн томорч мөр цөөрдөг (шугаман биш) —
    // томруулж үзээд, халивал багасгана.
    function refine(x, last) {
      var ch = false;
      if (x.zm < 1) {
        var g0 = x.got[0];
        if (g0 > FIT_H && x.zm > ZM_MIN) { x.zm = Math.max(ZM_MIN, x.zm * FIT_H / g0 - 0.004); ch = true; }
        else if (!last && g0 < FIT_H - 4 * MM) { x.zm = Math.min(1, x.zm * FIT_H / g0 - 0.004); ch = true; }
        if (ch) x.sheet.style.zoom = x.zm < 1 ? x.zm : '';
        return ch;
      }
      x.pg.forEach(function (p, q) {
        var g = x.got[q]; if (g == null || !p.W) return;
        if (g <= FIT_H) { if (!p.lo || p.f >= p.lo.f) p.lo = { f: p.f, g: g }; }
        else if (!p.hi || p.f < p.hi.f) p.hi = { f: p.f, g: g };
        if (g <= FIT_H && (FIT_H - g < 2 * MM || p.f >= AF_MAX - 0.001)) return;      // дүүрсэн (эсвэл дээд хязгаар)
        var nf;
        if (last || !p.lo) { if (g <= FIT_H) return; nf = p.lo ? p.lo.f : AF_MIN; }
        else if (p.hi) {
          var lo = p.lo, hi = p.hi;
          nf = hi.g - lo.g > 0.5 ? lo.f + (FIT_H - MM - lo.g) * (hi.f - lo.f) / (hi.g - lo.g) : (lo.f + hi.f) / 2;
          nf = Math.min(hi.f - 0.003, Math.max(lo.f + 0.003, nf));
          if (hi.f - lo.f < 0.01) nf = lo.f;
        } else {
          var slope = (g - p.prev.g) / Math.max(1e-6, p.f - p.prev.f);
          nf = slope < 0.15 * p.W ? p.f + Math.max(0.3, p.f - AF_MIN) : p.f + (FIT_H - MM - g) / slope;
          nf = Math.min(AF_MAX, nf);
        }
        p.prev = { f: p.f, g: g };
        if (Math.abs(nf - p.f) > 0.002) { p.f = nf; ch = true; }
      });
      if (ch) { x.bf = x.boxPage.map(function (q) { return x.pg[q].f; }); setHeights(x); }
      return ch;
    }
    // Хуваагдахгүй хэсгүүд (хуудас бүрд нэг удаа): ажлын хуудасны CSS-д break-inside:avoid (бодлого .q, тест .t-item, задгай .free…)
    // + гарчиг, хүснэгтийн мөр, зураг. ba — break-after:avoid (даалгаврын гарчиг дараагийн бодлоготойгоо хамт шилжинэ)
    var KEEP = '.q, .prob, .task, .sec, .head, .meta, .wsx-meta0, .wsx-ev, .rule, .cm-foot, tr, .fig, .formulas, .boxes, .guide, .intro, .steps, .case, img, svg, canvas, .katex-display';
    function units(x) {
      var out = [];
      (function walk(el) {
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
          if (c.classList.contains('wsx-sc') || c.classList.contains('gd') || c.classList.contains('wsx-bx') || c.classList.contains('wsx-hl')) continue;
          var cs = getComputedStyle(c);
          if (cs.display === 'none' || cs.position === 'absolute' || cs.position === 'fixed') continue;
          var av = /avoid/.test(cs.breakInside);
          if (av || c.matches(KEEP)) out.push({ el: c, av: av, ba: /avoid/.test(cs.breakAfter) });
          if (!c.matches('svg, img, canvas, .katex, .katex-display, tr')) walk(c);
        }
      })(x.sheet);
      return out;
    }
    // Хэвлэхэд хэдэн хуудас (Chrome-ийн хуудаслалтыг дуурайна): хуваагдахгүй хэсэг хуудасны хил давбал бүхэлдээ дараагийн
    // хуудас руу; хуудаснаас урт break-inside:avoid хэсэг шинэ хуудаснаас эхэлж хуваагдана; бусад агуулга хаана ч хуваагдана
    function calc(x) {
      if (x.sec.classList.contains('hid')) x.sec.classList.remove('hid');   // нуугдсан бол хэмжээ 0 — түр харуулна (vis() буцааж нууна)
      var top0 = x.sheet.getBoundingClientRect().top, start = 0, pages = 1, br = [], prev = null;
      var U = x.units || (x.units = units(x));
      var nb = function (y) { start = y; pages++; br.push(y); };
      for (var i = 0; i < U.length; i++) {
        var u = U[i], r = u.el.getBoundingClientRect(); if (!r.height) continue;
        var t = r.top - top0, b = r.bottom - top0;
        while (t >= start + PAGE_H) nb(start + PAGE_H);                  // өмнөх хуваагдах агуулга хуудас дүүргэсэн
        if (u.el.classList.contains('wsx-pb') && t > start + 1) nb(t);   // fitAll-ийн таслал (хэвлэхэд break-before:page)
        if (b > start + PAGE_H + 0.5) {
          if (t > start + 1 && (b - t <= PAGE_H || u.av)) {
            var adj = prev && prev.ba && !prev.el.contains(u.el) && prev.t > start + 1 && t - prev.b < 12 * MM;
            nb(adj ? prev.t : t);
          }
          while (b > start + PAGE_H + 0.5) nb(start + PAGE_H);           // хуудаснаас урт — хуваагдана
        }
        prev = { el: u.el, t: t, b: b, ba: u.ba };
      }
      var total = x.sheet.getBoundingClientRect().height;
      while (total > start + PAGE_H + 0.5) nb(start + PAGE_H);
      return { pages: pages, br: br, total: total };
    }
    function paint(x, r) {
      var pages = r.pages, br = r.br;
      x.pages = pages; x.br = br; x.tot = r.total;                         // «Ном шиг харах» хуудас бүрийг эндээс хэрчинэ
      [].forEach.call(x.paper.querySelectorAll('.gd'), function (g) { g.remove(); });
      br.forEach(function (y, i) { x.paper.insertAdjacentHTML('beforeend', '<div class="gd" style="top:calc(11mm + ' + Math.round(y) + 'px)"><span>' + (i + 2) + '-р хуудас</span></div>'); });
      var pg = x.sec.querySelector('.pgs');
      pg.textContent = pages + ' хуудас'; pg.className = 'pgs p' + Math.min(pages, 3);
      // Хуудас дүүргэсэн бодолтын зай (анхны хэмжээтэй харьцуулсан, хуудас тус бүрээр) эсвэл жижигрүүлсэн хэмжээ
      var zm = x.zm || 1, fit = x.sec.querySelector('.fit'), pw = (x.pg || []).filter(function (p) { return p.W > 0; });
      var nf = x.sheet.querySelectorAll('.wsx-fill').length;
      fit.textContent = [pw.length ? 'зай ' + pw.map(function (p) { return pct(p.f); }).join(' / ') : '', zm < 0.995 ? 'хэмжээ ' + pct(zm) : '',
        nf ? '+ ' + nf + ' зайн талбай' : ''].filter(Boolean).join(' · ');
      fit.className = 'fit' + (zm < 0.8 || pw.some(function (p) { return p.f < F1_MIN - 0.001; }) ? ' small' : '');
      stamps(x, r);
      vis(x);
    }
    // CyberMath тамга (ws-store-ийн .cm-wm) — ажлын хуудасны голд биш, хэвлэх ХУУДАС БҮРИЙН голд (2 хуудастай бол хоёуланд).
    // Байрлал нь sheet-ийн CSS px (zoom-оор хуваана); үнэмлэхүй байрлалтай тул хуудаслалтад нөлөөлөхгүй.
    function stamps(x, r) {
      [].forEach.call(x.sheet.querySelectorAll('.wsx-wm'), function (e) { e.remove(); });
      if (!x.wmHTML) return;
      var zm = x.zm || 1, st = [0].concat(r.br), tot = r.total;
      st.forEach(function (y0, q) {
        var y1 = Math.min(q + 1 < st.length ? st[q + 1] : tot, y0 + PAGE_H), d = document.createElement('div');
        d.innerHTML = x.wmHTML; var wm = d.firstElementChild; if (!wm) return;
        wm.classList.remove('mid'); wm.classList.add('wsx-wm'); wm.style.top = Math.round((y0 + (y1 - y0) / 2) / zm) + 'px';
        x.sheet.insertBefore(wm, x.sheet.firstChild);
      });
    }
    function vis(x) { x.sec.classList.toggle('hid', (onlyLong && x.pages < 2) || (onlyTodo && cfg(x.it.slug).ok)); }
    // Хуудасны дугаар (хэвлэхэд доод талд гарна): 1 — нүүр (дугааргүй), 2… — агуулга, дараа нь номд орсон ажлын хуудсууд.
    // Агуулгад зөвхөн номд орсон хуудастай бүлэг/сэдэв, тэр сэдвийн эхний хуудасны дугаартай.
    function totals(depth) {
      ITEMS.forEach(function (x) { x.sec.classList.toggle('out', !inVol(x)); });
      var inc = ITEMS.filter(inBook);
      var one = 0, more = 0, has = {}, first = {};
      inc.forEach(function (x) { if ((x.pages || 1) > 1) more++; else one++; has[x.it.ci] = has[x.it.ci + '.' + x.it.ti] = 1; });
      var rows = [].slice.call(document.querySelectorAll('.toc-ch, .toc-tp'));
      var key = function (r) { var ti = r.getAttribute('data-ti'); return r.getAttribute('data-ci') + (ti == null ? '' : '.' + ti); };
      rows.forEach(function (r) { r.classList.toggle('toc-x', !has[key(r)]); });
      var tocP = tocPages(), p = 2 + tocP;
      inc.forEach(function (x) {
        x.p0 = p; p += x.pages || 1;
        [x.it.ci, x.it.ci + '.' + x.it.ti].forEach(function (k) { if (!(k in first)) first[k] = x.p0; });
      });
      rows.forEach(function (r) { r.querySelector('em').textContent = first[key(r)] || ''; });
      if (tocPages() !== tocP && !depth) return totals(1);   // дугаар бичсэнээр агуулгын урт өөрчлөгдвөл дахин тооцно
      ITEMS.forEach(function (x) {
        var n = x.pages || 1;
        x.sec.querySelector('.pno').textContent = !inVol(x) ? 'энэ дэвтэрт ороогүй' : cfg(x.it.slug).off ? 'номд ороогүй' : 'х. ' + x.p0 + (n > 1 ? '–' + (x.p0 + n - 1) : '');
      });
      TOTAL = p - 1;
      var T = TG === 'none' ? 0 : TG === 'min' ? (tgAutoT || 1) : TG === 'auto' ? (tgAutoT || 200) : +TG, dT = TOTAL - T;
      document.getElementById('sum').innerHTML = 'Нийт <b>' + TOTAL + '</b> хуудас'
        + (T ? (TG === 'min' ? ' <span class="tg">хамгийн бага</span>' : TG === 'auto' && T !== 200 && T !== 300 ? ' <span class="tg off">200-д багтахгүй — 300-аас бага</span>'
          : ' <span class="tg' + (dT ? ' off' : '') + '">зорилт ' + T + (dT ? ' (' + (dT > 0 ? '+' : '') + dT + (dT < 0 ? ', ажлын хуудас цөөн' : '') + ')' : ' — таарсан') + '</span>') : '')
        + ' · ' + inc.length + ' ажлын хуудас <span class="s1">1 хуудастай ' + one + '</span> <span class="s2">2+ хуудастай ' + more + '</span>';
      var ok = ITEMS.filter(function (x) { return cfg(x.it.slug).ok; }).length;
      document.getElementById('prog').innerHTML = 'Шалгасан <b>' + ok + '</b> / ' + ITEMS.length;
      redrawCover();                                                       // нүүрний бүлэг/сэдэв/хуудасны тоо дэвтрийн хүрээгээр
      refreshFlip();
      if (T && dT && !tgBusy && ITEMS.length && TOTAL !== tgStuck) { clearTimeout(tgTimer); tgTimer = setTimeout(retarget, 900); }   // засварын дараа зорилт руу
    }

    // ── Хуудасны зорилт: ангийн ном яг T хуудас (Авто — 200; 200-д багтах боломжгүй бол 300). Хуудасны тоог гараар заасан (s.p),
    // «Шалгасан» ба номд ороогүй хуудсанд хүрэхгүй. Бусдад ажиллах үеийн x.tp (хуудасны тоо) ба x.rm (бодолтын зайг нь хассан
    // даалгавар): илүү бол 2+ хуудастайг нэгээр цөөлнө — эхлээд зай багасгаад (AF_MIN хүртэл) багтдагийг, дараа нь бага бодолттой
    // даалгаврын (харьцуулах, нөхөх, тэмдэг тавих…) зайг хасаж багтаана; дутуу бол агуулга ихтэйг нэг хуудсаар нэмнэ (зай ≤ 2×).
    // «Шалгасан» болгоход эдгээр сонголт s.p / s.g-д хадгалагдаж тогтворжино.
    // Ангийн анхдагч зорилт (эзэмшигч 2026-11-14: 10-р анги 250, 11-р анги 100); бусад нь Авто (200, багтахгүй бол 300)
    // 6–12-р анги — «Хамгийн бага» (эзэмшигч 2026-11-14: боломжит хамгийн бага хуудас)
    var TG_DEF = { '6-р анги': 'min', '7-р анги': 'min', '8-р анги': 'min', '9-р анги': 'min', '10-р анги': 'min', '11-р анги': 'min', '12-р анги': 'min' };
    var TG_KEY = 'cm_book_target:', TG = 'auto', TOTAL = 0, tgBusy = false, tgTimer = null, tgAutoT = 0, tgStuck = -1;
    var SMALL = /харьцуул|жиш|тэмдэг|[<>]|үнэн|худал|сонго|дугуйл|холбо|нөх|бөглө|тоймло|ойролцоо|унш|тоол|дараалал|үргэлжлүүл|орны|цифр|нэрл|хувиргаарай|шилжүүл/i;
    var BIG = /бодоорой|баганаар|үгэн|тэгшитгэл|тэнцэтгэл|зур|байгуул|нотол|батал/i;
    function tgLabel(hd) { if (!hd) return ''; var c = hd.cloneNode(true), sc = c.querySelector('.wsx-sc'); if (sc) sc.remove(); return c.textContent; }
    // Олон баганатай даалгаварт нэг мөрийн нүднүүд зэрэгцээ — хасахад хэмнэгдэх өндөр нь МӨР бүрийн хамгийн өндөр нүд (нүдний нийлбэр биш)
    function tgInfo(x) {
      var s = cfg(x.it.slug), m = x.m; if (!m) return null;
      var G = {}, W = 0;
      m.B.forEach(function (b) {
        if (!(b.h0w > 0)) return;
        var g = G[b.k] || (G[b.k] = { k: b.k, rows: {}, n: 0 }), r = Math.round(b.t / 4);
        g.rows[r] = Math.max(g.rows[r] || 0, b.h0w); g.n++;
      });
      var gs = Object.keys(G).map(function (k) {
        var g = G[k], lab = tgLabel(x.heads[g.k]), sm = SMALL.test(lab), bg = BIG.test(lab), w = 0, nr = 0;
        Object.keys(g.rows).forEach(function (r) { w += g.rows[r]; nr++; });
        g.w = w; g.h = AF_MIN * w; W += w;
        g.sc = (w / Math.max(1, nr)) * (sm ? 0.5 : 1) * (bg ? 4 : 1); g.big = bg && !sm; return g;
      }).filter(function (g) { return g.k < 0 || s.g[g.k] == null; }).sort(function (a, b) { return a.sc - b.sc; });
      return { H: m.H, W: W, gs: gs };
    }
    // P → P−1: зайг AF_MIN хүртэл багасгаж, хүрэхгүй бол бага бодолттой даалгаврын зайг хасна; сүүлчийн арга — текстийг ≥ Z1 (94%)
    // хүртэл жижигрүүлэх (номын бодолтын зайгүй хуудасны дүрэмтэй ижил) — өндөр өртөгтэй тул эцэст нь сонгогдоно
    function dropPlan(x, I) {
      var P = x.pages || 1; if (P < 2) return null;
      var lim = (P - 1) * FIT_H - 2 * MM, H = I.H, W = I.W, rm = [];
      for (var i = 0; i < I.gs.length && H > lim; i++) { if (I.gs[i].big) continue; H -= I.gs[i].h; W -= I.gs[i].w; rm.push(I.gs[i].k); }
      var zoom = H > lim;
      if (zoom && (P - 1 > 1 || H * Z1 > lim)) return null;
      var f = W > 0 ? AF_MIN + Math.max(0, lim - H) / W : 3;
      return { x: x, P: P - 1, rm: rm, cost: rm.length * 10 + (zoom ? 60 + (H / lim - 1) * 400 : 0) + 1 / Math.max(0.05, f) };
    }
    // P → P+1 (зөвхөн зай хэт томрохгүй бол: ≤ 2×), ажиллах үед хассан зайтай хуудсыг хөндөхгүй
    function addPlan(x, I) {
      var P = x.pages || 1; if (P >= 3 || I.W <= 0 || (x.rm && Object.keys(x.rm).length)) return null;
      var f = AF_MIN + ((P + 1) * FIT_H - I.H) / I.W;
      return f <= 2 ? { x: x, P: P + 1, rm: null, cost: f } : null;
    }
    function tgAdjustable(x) { var s = cfg(x.it.slug); return inBook(x) && !s.ok && !s.p && x.m && !x.tgBad; }
    function tgValue() { return /^[0-9]+$/.test(TG) ? +TG : 200; }
    // Ажиллах үеийн бүх сонголтыг (tp, rm) буцаана — ном анхны (авто) хуудаслалттай болно
    function tgReset() {
      var rs = ITEMS.filter(function (x) { return x.tp || (x.rm && Object.keys(x.rm).length) || x.tgBad; });
      rs.forEach(function (x) { x.tp = 0; x.rm = null; x.tgBad = false; });
      if (rs.length) { fitAll(rs); rs.forEach(function (x) { paint(x, calc(x)); }); }
      totals();
    }
    // Авто: эхлээд яг 200; хүрэхгүй бол (ажлын хуудас олон) бүгдийг буцааж, 300-аас их номыг яг 300 болгоно (300-аас бага бол байгаагаар).
    // Ажлын хуудас цөөн (200-д хүргэхийн тулд хиймлээр томруулах шаардлагатай) номыг томруулахгүй.
    function retarget() {
      if (tgBusy || !ITEMS.length) return;
      tgBusy = true;
      try {
        if (TG === 'none') { tgReset(); tgAutoT = 0; }
        else if (TG === 'min') { toward(1); tgAutoT = TOTAL; tgStuck = TOTAL; }   // хамгийн бага: боломжтой бүх хуудсыг нэгээр цөөлнө
        else {
          var T = tgAutoT = tgValue();
          toward(T);
          if (TG === 'auto' && TOTAL > T) {
            tgReset();
            if (TOTAL > 300) toward(tgAutoT = 300); else tgAutoT = TOTAL;    // 200-д багтахгүй — 300 (эсвэл түүнээс бага бол байгаагаар)
          }
          tgStuck = TOTAL !== tgAutoT ? TOTAL : -1;                        // хүрч чадаагүй бол дараагийн засвар хүртэл дахин оролдохгүй
        }
      } finally { tgBusy = false; }
      totals();
    }
    function toward(T) {
          for (var round = 0; round < 30; round++) {
            var d = TOTAL - T; if (!d) break;
            var plans = [];
            ITEMS.forEach(function (x) { if (!tgAdjustable(x)) return; var I = tgInfo(x); if (!I) return; var pl = d > 0 ? dropPlan(x, I) : addPlan(x, I); if (pl) plans.push(pl); });
            // дутуу үед: бүх боломжоор нэмсэн ч хүрэхгүй бол (цөөн ажлын хуудастай анги) хиймлээр томруулахгүй
            if (!plans.length || (d < 0 && round === 0 && plans.length < -d)) break;
            plans.sort(function (a, b) { return a.cost - b.cost; });
            var pick = plans.slice(0, Math.abs(d)), xs = pick.map(function (pl) { return pl.x; });
            var was = xs.map(function (x) { return { tp: x.tp, rm: x.rm, pages: x.pages || 1 }; });
            pick.forEach(function (pl) { pl.x.tp = pl.P; if (pl.rm && pl.rm.length) { pl.x.rm = Object.assign({}, pl.x.rm || {}); pl.rm.forEach(function (k) { pl.x.rm[k] = 1; }); } });
            fitAll(xs);
            var res = xs.map(calc);
            // буцаана (дахин сонгохгүй): 94%-иас (Z1) их жижгэрсэн, эсвэл хуудасны тоо хүссэн зүг рүү өөрчлөгдөөгүй
            var back = xs.filter(function (x, i) { return (x.zm && x.zm < Z1 - 0.005) || (d > 0 ? res[i].pages >= was[i].pages : res[i].pages <= was[i].pages); });
            back.forEach(function (x) { var w = was[xs.indexOf(x)]; x.tp = w.tp; x.rm = w.rm; x.tgBad = true; });
            if (back.length) { fitAll(back); back.forEach(function (x) { res[xs.indexOf(x)] = calc(x); }); }
            xs.forEach(function (x, i) { paint(x, res[i]); });
            totals();                                                      // TOTAL шинэчлэгдэнэ (tgBusy — дахин retarget товлохгүй)
          }
    }

    // ── «Ном шиг харах»: хэвлэхэд гарах хуудсуудыг (нүүр, агуулга, ажлын хуудас бүрийн хуудас) эргүүлж, тэр дор нь засаж шалгана ──
    // Хуудас бүр = A4 (210×297 мм), 11 мм захтай; ажлын хуудсыг calc()-ийн хуудаслалтаар (x.br) хэрчиж харуулна — хэвлэлтийн
    // яг тэр хуваалт. «2 нүүр»: нүүр баруун талд ганцаараа, дараа нь 2–3, 4–5 … (хоёр талт хэвлэлт); «1 нүүр»: нэг хуудсыг томоор.
    // Хуудас нь жинхэнэ ажлын хуудасны хуулбар: засварын үйлдэл (гарчиг, зай чирэх, ×, − / +, бодлогын тоо) жинхэнэд хэрэгжиж,
    // дараа нь харагдаж буй хуудсууд дахин зурагдана. Доод мөрөнд харагдаж буй ажлын хуудас бүрийн «Шалгасан», хуудасны тоо.
    var FP = null;
    function pageList() {
      var P = [{ k: 'cover' }], toc = document.querySelector('.toc'), nT = tocPages();
      if (toc) {
        var c0 = toc.getBoundingClientRect().top + 11 * MM, end = toc.getBoundingClientRect().bottom - 11 * MM - c0;
        var st = [0].concat([].map.call(toc.querySelectorAll('.toc-pb'), function (r) { return r.getBoundingClientRect().top - c0; }));
        for (var i = 0; i < nT; i++) P.push({ k: 'toc', from: st[i] || 0, to: i + 1 < st.length ? st[i + 1] : end, no: 2 + i });
      }
      ITEMS.forEach(function (x) {
        if (!inBook(x)) return;
        var br = x.br || [], st2 = [0].concat(br), n = x.pages || 1;
        for (var q = 0; q < n; q++) P.push({ k: 'ws', x: x, q: q, n: n, from: st2[q] || 0, to: q + 1 < st2.length ? st2[q + 1] : (x.tot || PAGE_H), no: x.p0 + q });
      });
      return P;
    }
    // bare — эргэх навчинд (засварын хэрэгсэлгүй)
    function pageEl(p, bare) {
      var el = document.createElement('div'); el.className = 'fp-w';
      var pg = document.createElement('div'); pg.className = 'fp-pg'; el.appendChild(pg);
      if (!p) { pg.classList.add('fp-blank'); return el; }
      if (p.k === 'cover') { var cv = document.getElementById('cover'); if (cv) { cv = cv.cloneNode(true); cv.removeAttribute('id'); pg.appendChild(cv); } return el; }
      var src = p.k === 'toc' ? document.querySelector('.toc') : p.x.paper; if (!src) return el;
      var cl = src.cloneNode(true);
      [].forEach.call(cl.querySelectorAll('.gd, .toc-warn' + (bare ? ', .wsx-sc, .wsx-bx, .wsx-hl' : '')), function (e) { e.remove(); });
      if (bare) [].forEach.call(cl.querySelectorAll('[contenteditable]'), function (e) { e.removeAttribute('contenteditable'); });
      cl.removeAttribute('id'); cl.classList.add('fp-src'); cl.style.top = (-p.from) + 'px';
      var vp = document.createElement('div'); vp.className = 'fp-vp'; vp.style.height = Math.max(0, Math.min(PAGE_H, p.to - p.from)) + 'px';
      vp.appendChild(cl); pg.appendChild(vp);
      pg.insertAdjacentHTML('beforeend', '<div class="fp-no">' + p.no + '</div>');
      if (p.k === 'ws' && !bare) el._it = p.x;
      return el;
    }
    // Доод мөр: харагдаж буй ажлын хуудасны удирдлага (жинхэнэ хуудасны тохиргоог өөрчилнө)
    function ctlEl(p) {
      var el = document.createElement('div'); el.className = 'fp-w fp-ctl';
      if (!p || p.k !== 'ws') { el.innerHTML = '<span class="t">' + (p ? (p.k === 'cover' ? 'Нүүр' : 'Агуулга') : '') + '</span>'; return el; }
      var x = p.x, s = cfg(x.it.slug), pb = function (v, l) { return '<button type="button" data-a="p" data-v="' + v + '"' + ((s.p || 0) === v ? ' class="on"' : '') + '>' + l + '</button>'; };
      el._it = x; el.classList.toggle('ok', s.ok);
      el.innerHTML = '<b>№' + x.it.n + '</b><span class="t">' + esc(s.t || x.it.title) + (p.n > 1 ? ' <i>' + (p.q + 1) + '/' + p.n + '</i>' : '') + '</span>'
        + '<label class="okc"><input type="checkbox" data-a="ok"' + (s.ok ? ' checked' : '') + '> Шалгасан</label>'
        + '<span class="pgsel">Хуудас ' + pb(0, 'Авто') + pb(1, '1') + pb(2, '2') + '</span>'
        + (x.it.snap && x.it.snap.tasks ? '<button type="button" class="nb" data-a="new">Шинэ бодлого</button>' : '');
      return el;
    }
    function spread(s) { return s === 0 ? [null, FP.P[0]] : [FP.P[2 * s - 1], FP.P[2 * s] || null]; }
    function smax() { return Math.ceil((FP.P.length - 1) / 2); }
    function vis2() { return FP.mode === 2 ? spread(FP.s) : [FP.P[FP.i]]; }
    function showView() {
      var v = vis2(), L = FP.ov.querySelector('.fp-l'), R = FP.ov.querySelector('.fp-r');
      FP.ov.classList.toggle('one', FP.mode === 1);
      if (FP.mode === 2) { L.replaceChildren(pageEl(v[0])); R.replaceChildren(pageEl(v[1])); }
      else { L.replaceChildren(); R.replaceChildren(pageEl(v[0])); }
      var c = FP.ov.querySelector('.fp-ctls'); c.replaceChildren();
      var seen = [];
      v.forEach(function (p) { if (p && p.k === 'ws' && seen.indexOf(p.x) >= 0) return; if (p && p.x) seen.push(p.x); c.appendChild(ctlEl(p)); });
      var nos = v.filter(Boolean).map(function (p) { return p.k === 'cover' ? 1 : p.no; });
      FP.ov.querySelector('.fp-pn').textContent = 'х. ' + nos.join('–') + ' / ' + FP.P.length;
      var first = FP.mode === 2 ? FP.s <= 0 : FP.i <= 0, last = FP.mode === 2 ? FP.s >= smax() : FP.i >= FP.P.length - 1;
      [].forEach.call(FP.ov.querySelectorAll('[data-f="prev"]'), function (b) { b.disabled = first; });
      [].forEach.call(FP.ov.querySelectorAll('[data-f="next"]'), function (b) { b.disabled = last; });
      var ok = ITEMS.filter(function (x) { return inBook(x) && cfg(x.it.slug).ok; }).length, all = ITEMS.filter(inBook).length;
      FP.ov.querySelector('.fp-ok').innerHTML = 'Шалгасан <b>' + ok + '</b> / ' + all;
      fitFlip();
    }
    // i — хуудасны индекс (0 — нүүр) руу шилжинэ (2 нүүрт тэр хуудсыг агуулсан нүүрүүд)
    function goPage(i) { i = Math.max(0, Math.min(FP.P.length - 1, i)); FP.i = i; FP.s = Math.floor((i + 1) / 2); showView(); }
    function turn(dir) {
      if (!FP || FP.busy) return;
      if (FP.mode === 1) { var ni = FP.i + dir; if (ni < 0 || ni >= FP.P.length) return; goPage(ni); return; }
      var ns = FP.s + dir; if (ns < 0 || ns > smax()) return;
      var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) { FP.s = ns; FP.i = ns ? 2 * ns - 1 : 0; showView(); return; }
      FP.busy = true;
      var book = FP.ov.querySelector('.fp-book'), cur = spread(FP.s), nxt = spread(ns);
      var leaf = document.createElement('div'), front = document.createElement('div'), back = document.createElement('div');
      leaf.className = 'fp-leaf ' + (dir > 0 ? 'fwd' : 'bwd'); front.className = 'fp-face fp-front'; back.className = 'fp-face fp-back';
      if (dir > 0) { front.appendChild(pageEl(cur[1], true)); back.appendChild(pageEl(nxt[0], true)); FP.ov.querySelector('.fp-r').replaceChildren(pageEl(nxt[1], true)); }
      else { front.appendChild(pageEl(cur[0], true)); back.appendChild(pageEl(nxt[1], true)); FP.ov.querySelector('.fp-l').replaceChildren(pageEl(nxt[0], true)); }
      leaf.appendChild(front); leaf.appendChild(back); book.appendChild(leaf);
      leaf.getBoundingClientRect();
      var fin = function () { if (!FP || !leaf.parentNode) return; leaf.remove(); FP.busy = false; FP.s = ns; FP.i = ns ? 2 * ns - 1 : 0; showView(); };
      leaf.addEventListener('transitionend', fin, { once: true }); setTimeout(fin, 1100);
      leaf.classList.add('go');
    }
    // Засварын дараа (totals): хуудасны жагсаалтыг дахин бодож, одоогийн нүүрийг дахин зурна (гарчиг бичиж байхад хүлээнэ)
    function refreshFlip() {
      if (!FP || FP.busy) return;
      var ae = document.activeElement; if (ae && FP.ov.contains(ae) && ae.isContentEditable) return;
      FP.P = pageList(); FP.ov.querySelector('.fp-go').max = FP.P.length;
      if (FP.mode === 2) FP.s = Math.min(FP.s, smax()); else FP.i = Math.min(FP.i, FP.P.length - 1);
      showView();
    }
    // Дараагийн шалгаагүй ажлын хуудас (одоогийн нүүрний дараахаас, төгсгөлд хүрвэл эхнээс)
    function nextTodo() {
      var cur = vis2().filter(Boolean), last = cur.length ? FP.P.indexOf(cur[cur.length - 1]) : -1;
      for (var k = 1; k <= FP.P.length; k++) {
        var i = (last + k) % FP.P.length, p = FP.P[i];
        if (p.k === 'ws' && p.q === 0 && !cfg(p.x.it.slug).ok) { goPage(i); return; }
      }
      FP.ov.querySelector('.fp-ok').innerHTML += ' · бүгд шалгагдсан';
    }
    function fitFlip() {
      if (!FP) return;
      var st = FP.ov.querySelector('.fp-stage'), w = st.clientWidth - 80, h = st.clientHeight - 24, W = (FP.mode === 2 ? 420 : 210) * MM;
      var k = Math.max(0.1, Math.min(w / W, h / (297 * MM)));
      FP.k = k; FP.ov.querySelector('.fp-book').style.transform = 'translate(-50%,-50%) scale(' + k + ')';
    }
    function closeFlip() {
      if (!FP) return; FP.ov.remove(); document.body.classList.remove('fp-open');
      window.removeEventListener('keydown', FP.key); window.removeEventListener('resize', fitFlip); FP = null;
    }
    function openFlip() {
      if (FP) return;
      var ov = document.createElement('div'); ov.id = 'flip';
      ov.innerHTML = '<div class="fp-bar"><b>Ном шиг харах</b><span class="fp-pn"></span><span class="fp-ok"></span>'
        + '<button type="button" data-f="todo">Дараагийн шалгаагүй ›</button>'
        + '<span class="fp-seg"><button type="button" data-f="m2" class="on">2 нүүр</button><button type="button" data-f="m1">1 нүүр (том)</button></span>'
        + '<label class="fp-tg"><input type="checkbox" class="fp-ed" checked> Засах хэрэгсэл</label>'
        + '<label>Хуудас <input type="number" class="fp-go" min="1" step="1"></label>'
        + '<button type="button" data-f="first">Эхэнд</button><button type="button" data-f="last">Төгсгөлд</button>'
        + '<button type="button" data-f="print">Хэвлэх</button><button type="button" data-f="close">Хаах</button></div>'
        + '<div class="fp-stage"><button type="button" class="fp-nav l" data-f="prev" aria-label="Өмнөх">‹</button>'
        + '<div class="fp-book"><div class="fp-l"></div><div class="fp-r"></div></div>'
        + '<button type="button" class="fp-nav r" data-f="next" aria-label="Дараах">›</button></div>'
        + '<div class="fp-ctls"></div>'
        + '<div class="fp-hint">← → товч эсвэл хажуугийн сумаар эргүүлнэ. Хуудас дээр шууд засна: гарчиг, бодолтын зайн бариул, ×, − / +, бодлогын тоо. '
        + '«Засах хэрэгсэл»-ийг унтраавал хэвлэхэд яг гарах байдлаар харагдана.</div>';
      document.body.appendChild(ov); document.body.classList.add('fp-open');
      FP = { P: pageList(), s: 0, i: 0, mode: 2, ov: ov, busy: false, k: 1 };
      FP.key = function (e) {
        var t = e.target; if (t && (/INPUT|SELECT|TEXTAREA/.test(t.tagName) || t.isContentEditable)) return;
        if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); turn(1); }
        else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(-1); }
        else if (e.key === 'Escape') closeFlip();
      };
      window.addEventListener('keydown', FP.key); window.addEventListener('resize', fitFlip);
      bindEdit(ov);                                                       // хуудас дээрх засвар, доод мөрийн удирдлага
      ov.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-f]'); if (!b) return;
        var f = b.getAttribute('data-f');
        if (f === 'next') turn(1); else if (f === 'prev') turn(-1); else if (f === 'first') goPage(0); else if (f === 'last') goPage(FP.P.length - 1);
        else if (f === 'todo') nextTodo(); else if (f === 'print') window.print(); else if (f === 'close') closeFlip();
        else if (f === 'm1' || f === 'm2') {
          FP.mode = f === 'm1' ? 1 : 2; if (FP.mode === 1 && !FP.i && FP.s) FP.i = 2 * FP.s - 1;
          [].forEach.call(ov.querySelectorAll('.fp-seg button'), function (x) { x.classList.toggle('on', x === b); });
          goPage(FP.i);
        }
      });
      ov.querySelector('.fp-ed').addEventListener('change', function () { ov.classList.toggle('clean', !this.checked); });
      ov.querySelector('.fp-go').max = FP.P.length;
      ov.querySelector('.fp-go').addEventListener('change', function () { goPage((+this.value || 1) - 1); });
      goPage(0);
    }
    // Агуулга хэдэн хуудас: мөр хуваагдахгүй, бүлгийн гарчиг дараагийн мөрөөсөө салахгүй. Шинэ хуудас эхлэх мөрөнд
    // .toc-pb (хэвлэхэд break-before:page, дээд зайгүй) — хэвлэхэд яг энэ тооцоогоор хуудаслана.
    function tocPages() {
      var rows = [].slice.call(document.querySelectorAll('.toc h2, .toc-ch, .toc-tp'));
      rows.forEach(function (r) { r.classList.remove('toc-pb'); });
      rows = rows.filter(function (r) { return r.getBoundingClientRect().height > 0; });
      if (!rows.length) return 1;
      var top0 = rows[0].getBoundingClientRect().top, start = 0, pages = 1;
      for (var i = 1; i < rows.length; i++) {
        if (rows[i].getBoundingClientRect().bottom - top0 <= start + PAGE_H + 0.5) continue;
        var s = rows[i - 1].classList.contains('toc-ch') && i > 1 ? rows[i - 1] : rows[i];
        s.classList.add('toc-pb'); start = s.getBoundingClientRect().top - top0; pages++;
      }
      return pages;
    }
    function setSt(x, html, cls) {
      var e = x.sec.querySelector('.sst'); e.innerHTML = html; e.className = 'sst ' + (cls || '');
      if (FP) [].forEach.call(FP.ov.querySelectorAll('.fp-ctl'), function (c) {   // «Ном шиг харах»-ын доод мөрөнд ч харуулна
        if (c._it !== x) return;
        var q = c.querySelector('.fst') || c.appendChild(document.createElement('span'));
        q.className = 'fst ' + (cls || ''); q.innerHTML = html;
      });
    }
    function save(x) {
      var slug = x.it.slug; setSt(x, 'Хадгалж байна…', 'busy');
      clearTimeout(timers[slug]);
      timers[slug] = setTimeout(function () {
        fetch('/api/worksheets', { method: 'POST', headers: hdr(), body: JSON.stringify({ action: 'book_set', slug: slug, data: cfg(slug) }) })
          .then(function (r) { return r.json(); })
          .then(function (j) { if (j && j.ok) setSt(x, ICO_OK + ' Хадгалсан', 'ok'); else setSt(x, 'Хадгалагдсангүй: ' + esc((j && j.error) || ''), 'err'); })
          .catch(function () { setSt(x, 'Сүлжээний алдаа — дахин оролдоно уу', 'err'); });
      }, 700);
    }
  }

  var BOOK_CSS = [
    '@page{size:A4;margin:11mm;@bottom-center{content:counter(page);font:700 8.5pt "Segoe UI",Arial,sans-serif;color:#8a84a3}}',
    '@page cover{margin:0;@bottom-center{content:none}}',
    "html,body{margin:0}body{font-family:'Segoe UI',Arial,sans-serif;color:#1a1530;background:#e9e7f1;-webkit-print-color-adjust:exact;print-color-adjust:exact}",
    /* хэрэгслийн мөр */
    '.tb{position:sticky;top:0;z-index:50;display:flex;flex-direction:column;gap:8px;padding:9px 18px;background:#14214a;color:#fff;font-size:14px}',
    '.tb-r{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px}',
    '.tb-r:last-child #flipb{margin-left:auto}.tb #flipb{background:#22305e;color:#fff;box-shadow:inset 0 0 0 1.5px #3B4A80}',
    '.tb #sum{color:#c4cdea;font-size:13px}.tb #sum b{color:#FFC93C;font-size:15px}',
    '.tb #sum .tg{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:800;background:rgba(34,197,94,.2);color:#86efac}.tb #sum .tg.off{background:rgba(245,158,11,.22);color:#fcd34d}',
    '.tb .s1,.tb .s2{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:800}.tb .s1{background:rgba(34,197,94,.2);color:#86efac}.tb .s2{background:rgba(245,158,11,.22);color:#fcd34d}',
    '.tb .prog{margin-right:auto;padding:3px 10px;border-radius:99px;background:rgba(34,197,94,.18);color:#bbf7d0;font-weight:800;font-size:12.5px}.tb .prog b{color:#fff}',
    '.tb button,.tb select{border:0;border-radius:10px;padding:8px 13px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer}',
    '.tb #prt{background:#FFC93C;color:#3a2600}.tb select{background:#22305e;color:#fff;max-width:260px}',
    '.tb-f{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;cursor:pointer}',
    '.tip{max-width:210mm;margin:14px auto 0;padding:10px 14px;border-left:3px solid #7B52EE;border-radius:8px;background:#fff;font-size:13px;line-height:1.5;color:#4b4566}.tip-r{color:#dc2626;font-weight:800}',
    /* COVERCSS:BEGIN */
  '.cover{page:cover;position:relative;width:210mm;height:297mm;margin:16px auto;overflow:hidden;background:#FBFAF6;box-shadow:0 10px 30px -14px rgba(20,33,74,.35);font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#14214A}',
  '.cover *{box-sizing:border-box}',
  '.cover .cv-bg{position:absolute;left:0;top:0;width:100%;height:100%;z-index:1}',
  '.cover .cv-in{position:absolute;inset:0;z-index:2;padding:20mm 20mm 14mm;display:flex;flex-direction:column}',
  '.cover .cv-brand{display:flex;align-items:center;gap:2.5mm;font-size:10pt;letter-spacing:.16em}',
  '.cover .cv-brand img{width:8mm;height:8mm}.cover .cv-brand b{font-weight:800;color:#14214A}.cover .cv-brand span{padding-left:2.5mm;border-left:.4mm solid #C9CCDB;letter-spacing:.04em;font-weight:600;color:#7A7F9A}',
  '.cover .cv-kick{margin-top:15mm;font-size:11pt;font-weight:700;letter-spacing:.32em;color:#7B61FF}',
  '.cover h1{margin:4mm 0 0;font-size:46pt;line-height:1.03;font-weight:800;letter-spacing:-.6pt;color:#14214A}',
  '.cover .cv-vol{display:inline-flex;align-items:center;justify-content:center;min-width:1.12em;height:1.12em;margin-left:.2em;padding:0 .16em;border-radius:.22em;background:#14214A;color:#FFC93C;font-size:.7em;line-height:1;letter-spacing:0;vertical-align:.1em}',
  '.cv-a .cv-vol,.cv-d .cv-vol{background:#FFC93C;color:#14214A}',
  '.cover .cv-fields{display:grid;gap:6.5mm;flex:1;min-width:0}',
  '.cover .cv-fields div{display:flex;align-items:flex-end;gap:4mm}',
  '.cover .cv-fields i{min-width:24mm;font-style:normal;font-size:8.5pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#8A8FA8}',
  '.cover .cv-fields u{flex:1;height:6mm;border-bottom:.45mm solid #C9CCDB;text-decoration:none}',
  '.cover .cv-qrb{display:flex;align-items:center;gap:3.5mm;flex:none}',
  '.cover .cv-qr{display:block;width:27mm;height:27mm;flex:none}',
  '.cover .cv-qrt b{display:block;font-size:10.5pt;font-weight:800;color:#14214A}',
  '.cover .cv-qrt span{display:block;margin-top:1.4mm;font-size:8pt;font-weight:600;line-height:1.4;color:#6B7090}',
  '.cover .cv-foot{display:flex;justify-content:space-between;margin-top:8mm;padding-right:2mm;font-size:9pt;font-weight:600;letter-spacing:.06em;color:#8A8FA8}',
  /* a — Сансар */
  '.cv-a{background:radial-gradient(120% 90% at 72% 40%,#26397E 0%,#14214A 46%,#0A1230 100%);color:#fff}',
  '.cv-a .cv-brand b,.cv-a h1{color:#fff}.cv-a .cv-brand span{color:#B6C3EE;border-left-color:rgba(255,255,255,.3)}.cv-a .cv-kick{margin-top:16mm;color:#FFC93C}',
  '.cv-a .a-pl{position:absolute;right:0;top:92mm;width:132mm;height:110mm;z-index:1}',
  '.cv-a .a-lb{position:absolute;left:20mm;top:128mm;display:flex;flex-direction:column;gap:2.2mm;z-index:2}',
  '.cv-a .a-lb b{font-size:21pt;font-weight:800;color:#fff;margin-bottom:2.5mm}',
  '.cv-a .a-lb span{display:flex;align-items:center;gap:2.4mm;font-size:10.5pt;font-weight:700;color:#C9D3F5}',
  '.cv-a .a-lb span:before{content:"";width:2mm;height:2mm;border-radius:50%;background:#FFC93C;flex:none}',
  '.cv-a .a-card{margin-top:auto;display:flex;align-items:center;gap:9mm;padding:7mm 8mm;border-radius:6mm;background:#fff;color:#14214A;box-shadow:0 3mm 9mm rgba(0,0,0,.28)}',
  '.cv-a .cv-foot{color:#9AA8D8}',
  /* b — Геометр */
  '.cv-b{background:#FBFAF6}',
  '.cv-b .b-num{position:absolute;left:96mm;top:82mm;width:108mm;height:108mm;display:flex;flex-direction:column;align-items:center;justify-content:center;font-size:150pt;line-height:.78;font-weight:900;letter-spacing:-4pt;color:#14214A;z-index:2}',
  '.cv-b .b-num.two{font-size:108pt;letter-spacing:-3pt}.cv-b .b-num.lbl{font-size:26pt;letter-spacing:0;line-height:1.1;text-align:center;padding:0 12mm}',
  '.cv-b .b-num span{margin-top:6mm;font-size:12pt;line-height:1;font-weight:800;letter-spacing:.42em;padding-left:.42em}',
  '.cv-b .b-st{position:absolute;left:20mm;top:112mm;display:flex;flex-direction:column;gap:2mm;z-index:2}',
  '.cv-b .b-st span{font-size:11pt;font-weight:700;color:#4B5175}.cv-b .b-st span:first-child{color:#7B61FF}',
  '.cv-b .b-low{margin-top:auto;display:flex;align-items:flex-end;gap:10mm;padding-top:7mm;border-top:.5mm solid #14214A}',
  /* c — Томьёо: нурууны тууз, наалт хаяг, B-гийн шар тойрог (ангийн дугаар), 1–12-р ангийн томьёоны чимэглэл (тор, хэрэгсэлгүй) */
  '.cv-c{background:#FBFAF6}',
  '.cv-c .c-spine{position:absolute;left:0;top:0;bottom:0;width:17mm;background:#14214A;display:flex;align-items:center;justify-content:center;z-index:3}',
  '.cv-c .c-spine:after{content:"";position:absolute;right:-2.4mm;top:0;bottom:0;width:2.4mm;background:#FFC93C}',
  '.cv-c .c-spine span{transform:rotate(-90deg);white-space:nowrap;font-size:9pt;font-weight:800;letter-spacing:.42em;color:#FFC93C}',
  '.cv-c .cf-wall{position:absolute;inset:0;z-index:1}',
  '.cv-c .cf{position:absolute;white-space:nowrap;line-height:1.1;transform-origin:left center}',
  ".cv-c .cf-t{font-family:'Cambria Math',Cambria,'Times New Roman',serif;font-style:italic;font-weight:700}",
  '.cv-c .cf .katex{font-size:1.12em}',
  '.cv-c .cp-num{position:absolute;left:126mm;top:24mm;width:68mm;height:68mm;border-radius:50%;background:#FFC93C;z-index:3;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#14214A;font-weight:900}',
  '.cv-c .cp-num:before{content:"";position:absolute;inset:-4.6mm;border-radius:50%;border:.45mm dashed #14214A}',
  '.cv-c .cp-num b{font-size:104pt;line-height:.78;letter-spacing:-3pt}.cv-c .cp-num.two b{font-size:72pt;letter-spacing:-2pt}',
  '.cv-c .cp-num span{margin-top:4.5mm;font-size:9pt;line-height:1;font-weight:800;letter-spacing:.42em;padding-left:.42em}',
  '.cv-c .cv-in{padding:18mm 17mm 13mm 33mm}',
  '.cv-c .c-card{position:relative;margin-top:58mm;padding:12mm 12mm 11mm;border:.7mm solid #14214A;border-radius:6mm;background:#fff;box-shadow:2.4mm 2.4mm 0 #14214A}',
  '.cv-c .c-tape{position:absolute;left:14mm;top:-5mm;width:44mm;height:10mm;transform:rotate(-4deg);background:rgba(255,201,60,.8)}',
  '.cv-c .cv-kick{margin:0}.cv-c h1{font-size:33pt;max-width:100mm}',
  '.cv-c .c-lbl{margin-top:4mm;font-size:18pt;font-weight:800}',
  '.cv-c .c-st{margin-top:4mm;font-size:10pt;font-weight:700;color:#6B7090}',
  '.cv-c .cv-fields{margin-top:8mm;gap:6.5mm}.cv-c .cv-fields i{min-width:36mm}',
  '.cv-c .c-low{margin-top:auto;display:flex;justify-content:flex-end}',
  '.cv-c .cv-qrb{padding:3.5mm 5mm 3.5mm 3.5mm;border:.6mm solid #14214A;border-radius:4mm;background:#fff;box-shadow:1.6mm 1.6mm 0 #14214A}',
  /* c1 / c2 / c3 — «Торон дэвтэр»-ийн сайжруулсан хувилбарууд */
  '.cover .cv-fg{position:absolute;left:0;top:0;width:100%;height:100%;z-index:3;pointer-events:none}',
  '.cover .cv-fields .yr u{flex:0 0 21mm;display:flex;align-items:flex-end;padding-bottom:.7mm;font-size:10.5pt;font-weight:800;line-height:1;color:#14214A}',
  '.cover .cv-fields .yr b{font-weight:700;color:#8A8FA8;padding-bottom:.7mm}',
  '.cv-c1 .c-st,.cv-c2 .c-st,.cv-c3 .c-st{margin-top:4mm;font-size:10pt;font-weight:700;color:#6B7090}',
  '.cv-c2 .c-lbl,.cv-c3 .c-lbl{margin-top:4mm;font-size:18pt;font-weight:800}',
  '.cv-c2 .c-spine,.cv-c3 .c-spine{position:absolute;left:0;top:0;bottom:0;width:17mm;background:#14214A;display:flex;align-items:center;justify-content:center;z-index:4}',
  '.cv-c2 .c-spine:after,.cv-c3 .c-spine:after{content:"";position:absolute;right:-2.4mm;top:0;bottom:0;width:2.4mm;background:#FFC93C}',
  '.cv-c2 .c-spine span,.cv-c3 .c-spine span{transform:rotate(-90deg);white-space:nowrap;font-size:9pt;font-weight:800;letter-spacing:.42em;color:#FFC93C}',
  // C1 Спираль дэвтэр
  '.cv-c1{background:linear-gradient(90deg,transparent 23.6mm,#F4A3A3 23.6mm,#F4A3A3 24.1mm,transparent 24.1mm),linear-gradient(#DDE7F8 .25mm,transparent .25mm) 0 0/5mm 5mm,linear-gradient(90deg,#DDE7F8 .25mm,transparent .25mm) 0 0/5mm 5mm,#fff}',
  '.cv-c1 .cv-in{padding:18mm 18mm 13mm 32mm}',
  '.cv-c1 .c1-card{position:relative;margin-top:38mm;border:.6mm solid #14214A;border-radius:6mm;background:#fff;box-shadow:2.4mm 2.4mm 0 #14214A}',
  '.cv-c1 .c1-hd{display:flex;justify-content:space-between;align-items:center;padding:3.6mm 8mm;border-radius:5.2mm 5.2mm 0 0;background:#14214A;color:#FFC93C;font-size:9.5pt;font-weight:800;letter-spacing:.3em}',
  '.cv-c1 .c1-hd span+span{letter-spacing:.06em;color:#fff;margin-right:30mm}',
  '.cv-c1 .c1-bd{padding:10mm 9mm 10mm}',
  '.cv-c1 h1{margin:0;font-size:34pt;max-width:104mm}',
  '.cv-c1 .cv-fields{margin-top:9mm;gap:7.5mm}.cv-c1 .cv-fields i{min-width:36mm}.cv-c1 .cv-fields u{border-bottom-style:dotted;border-bottom-color:#8A8FA8}',
  '.cv-c1 .c1-chick{position:absolute;right:62mm;top:-31.4mm;width:27mm;z-index:3}',
  '.cv-c1 .c1-stamp{position:absolute;right:-7mm;top:22mm;width:38mm;height:38mm;border-radius:50%;background:#FFC93C;border:.7mm solid #14214A;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#14214A;font-weight:900;transform:rotate(-10deg);box-shadow:1.6mm 1.6mm 0 #14214A}',
  '.cv-c1 .c1-stamp:before{content:"";position:absolute;inset:2.2mm;border-radius:50%;border:.4mm dashed #14214A;opacity:.55}',
  '.cv-c1 .c1-stamp b{font-size:48pt;line-height:.86;letter-spacing:-1pt}.cv-c1 .c1-stamp.two b{font-size:34pt}',
  '.cv-c1 .c1-stamp span{margin-top:1.4mm;font-size:7pt;letter-spacing:.32em;padding-left:.32em}',
  '.cv-c1 .c1-low{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between}',
  ".cv-c1 .c1-note{margin:0 0 10mm 2mm;font:italic 700 17pt 'Cambria Math',Cambria,'Times New Roman',serif;color:#7B61FF;transform:rotate(-4deg)}",
  '.cv-c1 .c1-qr{position:relative;padding:4mm 5mm 4mm 4mm;border-radius:3mm;background:#fff;box-shadow:0 1.2mm 3mm rgba(20,33,74,.2);transform:rotate(-2deg)}',
  '.cv-c1 .c1-qr .tp{position:absolute;top:-3.2mm;width:17mm;height:6.4mm;background:rgba(255,201,60,.8)}',
  '.cv-c1 .c1-qr .t1{left:-5mm;transform:rotate(-26deg)}.cv-c1 .c1-qr .t2{right:-5mm;transform:rotate(26deg)}',
  // C2 Наалт
  '.cv-c2{background:linear-gradient(rgba(20,33,74,.07) .25mm,transparent .25mm) 0 0/5mm 5mm,linear-gradient(90deg,rgba(20,33,74,.07) .25mm,transparent .25mm) 0 0/5mm 5mm,#FFFCF3}',
  '.cv-c2 .c2-spine{background:#7B61FF}.cv-c2 .c2-spine span{color:#fff}',
  '.cv-c2 .cv-in{padding:18mm 17mm 13mm 33mm}',
  '.cv-c2 .c2-card{position:relative;margin-top:30mm;padding:14mm 12mm 12mm;border:.7mm solid #14214A;border-radius:7mm;background:#fff;box-shadow:2.6mm 2.6mm 0 #7B61FF}',
  '.cv-c2 .cv-kick{margin:0}.cv-c2 h1{font-size:34pt;max-width:104mm}',
  '.cv-c2 .cv-fields{margin-top:9mm;gap:7.5mm}.cv-c2 .cv-fields i{min-width:36mm}',
  '.cv-c2 .c2-low{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between}',
  '.cv-c2 .c2-chick{width:46mm;margin:0 0 -2mm 2mm;transform:rotate(-6deg);filter:drop-shadow(0 0 .45mm #fff) drop-shadow(0 0 .45mm #fff) drop-shadow(0 0 .45mm #fff) drop-shadow(0 1.2mm 1.4mm rgba(20,33,74,.3))}',
  '.cv-c2 .c2-qr{position:relative;padding:5mm 5mm 4mm 4mm;border-radius:5mm;background:#fff;border:.5mm dashed #7B61FF;box-shadow:0 1.4mm 3.2mm rgba(20,33,74,.2);transform:rotate(2.5deg)}',
  '.cv-c2 .c2-tag{position:absolute;left:50%;top:-4.6mm;transform:translateX(-50%) rotate(-3deg);padding:1.5mm 4.5mm;border-radius:99px;background:#FF7A59;color:#fff;font-size:10pt;font-weight:900;white-space:nowrap;box-shadow:0 .8mm 1.6mm rgba(20,33,74,.25)}',
  // C3 Хавчуурга
  '.cv-c3{background:linear-gradient(#DDE7F8 .25mm,transparent .25mm) 0 0/5mm 5mm,linear-gradient(90deg,#DDE7F8 .25mm,transparent .25mm) 0 0/5mm 5mm,#fff}',
  '.cv-c3 .cv-in{padding:18mm 28mm 13mm 31mm}',
  '.cv-c3 .c3-card{position:relative;margin-top:30mm;padding:12mm 11mm 11mm;border:.55mm solid #14214A;border-radius:4mm;background:#fff;box-shadow:2.2mm 2.2mm 0 #14214A}',
  '.cv-c3 .c3-card:before{content:"";position:absolute;left:0;right:0;top:0;height:4.5mm;border-radius:3.4mm 3.4mm 0 0;background:#7B61FF}',
  '.cv-c3 .c3-top{padding-bottom:1mm}.cv-c3 .cv-kick{margin:0}.cv-c3 h1{font-size:33pt;max-width:96mm}',
  '.cv-c3 .c-st{padding-bottom:4mm;border-bottom:.45mm solid #F87171}',
  '.cv-c3 .cv-fields{margin-top:7mm;gap:7.5mm}.cv-c3 .cv-fields i{min-width:36mm}.cv-c3 .cv-fields u{border-bottom-color:#93C5FD}',
  '.cv-c3 .c3-tile{position:absolute;right:-9mm;top:-9mm;width:36mm;height:36mm;border-radius:8mm;background:#14214A;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#FFC93C;font-weight:900;transform:rotate(7deg);box-shadow:0 2.4mm 5mm rgba(20,33,74,.3)}',
  '.cv-c3 .c3-tile b{font-size:52pt;line-height:.84;letter-spacing:-1pt}.cv-c3 .c3-tile.two b{font-size:36pt}',
  '.cv-c3 .c3-tile span{margin-top:1.6mm;font-size:7pt;letter-spacing:.34em;padding-left:.34em;color:#fff}',
  '.cv-c3 .c3-low{margin-top:auto;display:flex;align-items:flex-end;justify-content:space-between}',
  '.cv-c3 .c3-low img{width:48mm;margin-bottom:-2mm}',
  '.cv-c3 .c3-qr{border:.55mm solid #14214A;border-radius:4mm;background:#fff;overflow:hidden;box-shadow:1.6mm 1.6mm 0 #14214A}',
  '.cv-c3 .c3-qr>b{display:block;padding:2mm 4mm;background:#7B61FF;color:#fff;font-size:8.5pt;font-weight:800;letter-spacing:.14em;text-transform:uppercase}',
  '.cv-c3 .c3-qr .cv-qrb{padding:3.5mm 5mm 3.5mm 3.5mm}.cv-c3 .cv-qrt b{display:none}',
  /* d — Долгион */
  '.cv-d{background:#fff}',
  '.cv-d .d-top{position:absolute;left:0;right:0;top:0;height:200mm;background:linear-gradient(155deg,#937DFF 0%,#5B3BD9 40%,#14214A 100%);overflow:hidden;z-index:1}',
  '.cv-d .d-top:before{content:"";position:absolute;right:-34mm;top:-34mm;width:124mm;height:124mm;border-radius:50%;background:radial-gradient(circle,rgba(255,201,60,.38),rgba(255,201,60,0) 64%)}',
  '.cv-d .d-wave{position:absolute;left:0;bottom:-.3mm;width:100%;height:42mm}',
  ".cv-d .d-chip{position:absolute;padding:1.8mm 4.6mm;border-radius:99px;background:rgba(255,255,255,.13);border:.3mm solid rgba(255,255,255,.3);color:#fff;font:italic 700 12pt 'Cambria Math',Cambria,'Times New Roman',serif;white-space:nowrap}",
  '.cv-d .cv-brand b,.cv-d h1{color:#fff}.cv-d .cv-brand span{color:#DCD4FF;border-left-color:rgba(255,255,255,.35)}.cv-d .cv-kick{margin-top:16mm;color:#FFC93C}',
  '.cv-d .d-tile{position:absolute;right:20mm;top:114mm;width:64mm;height:64mm;border-radius:15mm;background:linear-gradient(160deg,#FFE9A8,#FFC93C 52%,#FFA319);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#14214A;font-weight:900;box-shadow:0 4mm 11mm rgba(10,18,48,.38);transform:rotate(-6deg);z-index:2}',
  '.cv-d .d-tile b{font-size:112pt;line-height:.78;letter-spacing:-3pt}.cv-d .d-tile.two b{font-size:78pt}.cv-d .d-tile.lbl b{font-size:22pt;letter-spacing:0;text-align:center;line-height:1.1;padding:0 5mm}',
  '.cv-d .d-tile span{margin-top:3.5mm;font-size:10pt;letter-spacing:.36em;padding-left:.36em}',
  '.cv-d .d-low{margin-top:auto}',
  '.cv-d .d-st{display:flex;gap:3mm;margin-bottom:8mm}',
  '.cv-d .d-st span{padding:1.6mm 4mm;border-radius:99px;background:#F1EDFF;color:#5B3BD9;font-size:9.5pt;font-weight:800}',
  '.cv-d .d-row{display:flex;align-items:flex-end;gap:10mm}',
  /* o — анхны загвар */
  '.cv-o:before{content:"";position:absolute;right:-40mm;top:-46mm;width:130mm;height:130mm;border-radius:50%;background:radial-gradient(circle,rgba(255,201,60,.30),rgba(255,201,60,0) 68%)}',
  '.cv-o:after{content:"";position:absolute;left:0;right:0;bottom:0;height:62mm;background:linear-gradient(rgba(20,33,74,.05) .25mm,transparent .25mm) 0 0/6mm 6mm,linear-gradient(90deg,rgba(20,33,74,.05) .25mm,transparent .25mm) 0 0/6mm 6mm;-webkit-mask-image:linear-gradient(transparent,#000 60%);mask-image:linear-gradient(transparent,#000 60%)}',
  '.cv-o h1{font-size:48pt;line-height:1.02}',
  '.cv-o .cv-bar{display:block;width:26mm;height:2.4mm;margin-top:8mm;border-radius:1.2mm;background:linear-gradient(90deg,#FFC93C,#FFB020)}',
  '.cv-o .cv-art{position:relative;margin-top:10mm;height:96mm}',
  '.cv-o .cv-art:before{content:"";position:absolute;right:-8mm;top:-12mm;width:84mm;height:84mm;border-radius:50%;background:radial-gradient(circle,rgba(255,201,60,.24),rgba(255,201,60,0) 66%)}',
  ".cv-o .cv-fx{position:absolute;font-family:'Cambria Math',Cambria,'Times New Roman',serif;font-style:italic;font-weight:700;color:#14214A;white-space:nowrap}",
  '.cv-o .cv-fx.f1{left:56mm;top:40mm;font-size:22pt;opacity:.85}.cv-o .cv-fx.f2{left:64mm;top:26mm;font-size:16pt;opacity:.5}',
  '.cv-o .cv-fx.f3{right:2mm;bottom:18mm;font-size:14pt;opacity:.75}.cv-o .cv-fx.f4{left:52mm;top:60mm;font-size:13pt;opacity:.6}',
  '.cv-o .cv-num{position:absolute;right:8mm;top:2mm;font-size:200pt;line-height:.8;font-weight:900;letter-spacing:-6pt;background:linear-gradient(170deg,#FFE7A0 0%,#FFC93C 45%,#FFA319 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(1.8mm 1.8mm 0 #14214A)}',
  '.cv-o .cv-num.two{font-size:145pt;letter-spacing:-5pt;right:4mm;top:10mm}',
  '.cv-o .cv-cl{position:absolute;left:0;top:0;max-width:80mm}',
  '.cv-o .cv-cl b{display:block;font-size:22pt;font-weight:800;color:#14214A}.cv-o .cv-cl b.big{font-size:26pt;line-height:1.1}',
  '.cv-o .cv-cl span{display:block;margin-top:2mm;font-size:10.5pt;font-weight:600;color:#6B7090}',
  '.cv-o .cv-line{position:absolute;left:0;bottom:0;width:100%;height:14mm}',
  '.cv-o .cv-chick{position:absolute;left:8mm;bottom:8.5mm;width:40mm;filter:drop-shadow(0 3mm 4mm rgba(20,33,74,.18))}',
  '.cv-o .o-low{margin-top:auto;display:flex;align-items:flex-end;gap:10mm}',
    /* COVERCSS:END */
    /* агуулга */
    '.toc{break-before:page;width:188mm;margin:16px auto;background:#fff;padding:11mm;box-sizing:content-box;position:relative;container-type:inline-size}',
    // хэвлэхэд .toc-ийн өргөн = хуудасны талбай; 188 мм (A4 − 2×11 мм) биш бол захын зай эсвэл масштаб өөрчлөгдсөн
    // (media query цаасны бүтэн өргөнөөр шалгагддаг тул тохиромжгүй)
    '.toc-warn{display:none}',
    '@container (min-width:192mm) or (max-width:184mm){.toc-warn{display:block;position:absolute;z-index:9;top:0;right:0;width:108mm;padding:3mm 4mm;border:.7mm solid #dc2626;border-radius:3mm;background:#fff;color:#b91c1c;font:600 10pt/1.45 "Segoe UI",Arial,sans-serif}}',
    '.toc h2{margin:0 0 6mm;font-size:24pt;font-weight:900;color:#14214a}',
    '.toc-ch,.toc-tp{display:flex;align-items:baseline;gap:3mm}',
    '.toc-ch{margin:4mm 0 1.2mm;font-size:12pt;color:#14214a}.toc-ch span{min-width:9mm;font-weight:900;color:#7B52EE}',
    '.toc-tp{margin:0 0 1mm 9mm;font-size:10.5pt;color:#3d3757}.toc-tp span{min-width:9mm;font-weight:800;color:#8a84a3}',
    '.toc-ch i,.toc-tp i{flex:1;border-bottom:1.5px dotted #cfcae0;transform:translateY(-1mm)}',
    '.toc-ch em,.toc-tp em{font-style:normal;font-weight:900;white-space:nowrap}.toc-x{display:none!important}',
    /* ажлын хуудас */
    '.wsx{break-before:page;width:210mm;margin:16px auto}',
    '.wsx-bar{position:sticky;top:calc(var(--tbh,96px) + 6px);z-index:20;display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding:8px 12px;margin-bottom:8px;border-radius:12px;background:#fff;box-shadow:0 8px 20px -14px rgba(20,33,74,.5);font-size:13px}',
    '.wsx-bar .no{font-weight:900;color:#fff;background:#14214a;border-radius:8px;padding:3px 8px}',
    '.wsx-bar .nm{display:flex;flex-direction:column;min-width:0;flex:1 1 220px}.wsx-bar .nm small{color:#8a84a3;font-weight:700}',
    '.wsx-bar .pgs{font-weight:900;border-radius:99px;padding:3px 10px}.pgs.p1{background:#dcfce7;color:#15803d}.pgs.p2{background:#fef3c7;color:#b45309}.pgs.p3{background:#fee2e2;color:#b91c1c}',
    '.wsx-bar .pno{font-weight:800;color:#14214a;white-space:nowrap}.wsx.off .pno{color:#b91c1c}',
    '.wsx-bar .fit:empty{display:none}.wsx-bar .fit{font-weight:800;font-size:12px;border-radius:99px;padding:3px 9px;background:#EEF2FF;color:#3730A3;white-space:nowrap}',
    '.wsx-bar .fit.small{background:#fef3c7;color:#b45309}',
    '.wsx-bar .ctl{display:inline-flex;align-items:center;gap:5px;font-weight:700}.wsx-bar .ctl.none{display:none}',
    '.wsx-bar button{border:1.5px solid #E7E2F7;background:#fff;color:#5B3BD9;border-radius:8px;width:28px;height:26px;font:inherit;font-weight:900;cursor:pointer;line-height:1}',
    '.wsx-bar button:hover{border-color:#5B3BD9}',
    '.wsx-bar .pgsel button{width:auto;padding:0 8px}.wsx-bar .pgsel button.on{background:#5B3BD9;color:#fff;border-color:#5B3BD9}',
    '.wsx-bar .tg{display:inline-flex;align-items:center;gap:5px;font-weight:700;cursor:pointer;white-space:nowrap}',
    '.wsx-bar .okc{padding:3px 9px;border-radius:99px;background:#F1F5F9}',
    '.wsx.done .wsx-bar{box-shadow:inset 4px 0 0 #22c55e,0 8px 20px -14px rgba(20,33,74,.5)}.wsx.done .okc{background:#dcfce7;color:#15803d}',
    '.wsx-bar .sst{font-size:12px;font-weight:800;min-width:96px}.sst.ok{color:#15803d}.sst.busy{color:#8a84a3}.sst.err{color:#b91c1c}',
    '.wsx.off .wsx-paper{opacity:.35}.wsx.hid{display:none}.wsx.busy .wsx-paper{opacity:.45;pointer-events:none}',
    '.wsx-paper{position:relative;width:188mm;padding:11mm;box-sizing:content-box;background:#fff;box-shadow:0 10px 30px -14px rgba(20,33,74,.45)}',
    '.wsx-paper>.sheet{width:auto!important;max-width:none!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;border:0!important}',
    '.wsx-paper .wsx-fill{position:relative;box-sizing:border-box;margin-top:4mm;border:1.1px solid #e2daf5;border-radius:7px;background:#fff linear-gradient(#f1edfb 1px,transparent 1px) 0 6mm/100% 6mm;break-inside:avoid}',
    '.wsx-paper .wsx-fill:before{content:"Бодолтын зай";position:absolute;left:9px;top:0;transform:translateY(-55%);padding:0 5px;background:#fff;font:700 8pt/1 "Segoe UI",Arial,sans-serif;color:#a89cd0}',
    '.wsx-paper .gd{position:absolute;left:0;right:0;height:0;border-top:2px dashed #ef4444;z-index:30;pointer-events:none}',
    '.wsx-paper .gd span{position:absolute;right:4px;top:-11px;background:#ef4444;color:#fff;font:800 10px/1 "Segoe UI",Arial,sans-serif;padding:3px 7px;border-radius:99px}',
    '.wsx-paper .wsx-sc{position:absolute;right:0;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px;margin:0;padding:2px 4px;border-radius:9px;background:#fff;border:1.5px solid #E7E2F7;font:800 11px/1 "Segoe UI",Arial,sans-serif;color:#5B3BD9;z-index:25}',
    '.wsx-paper .wsx-sc button{width:20px;height:20px;margin:0;padding:0;border:0;border-radius:6px;background:#F1EDFF;color:#5B3BD9;font:900 13px/1 "Segoe UI",Arial,sans-serif;cursor:pointer}',
    '.wsx-paper .wsx-sc b{min-width:34px;text-align:center}',
    '.wsx-paper .wsx-sc{opacity:.62;transition:opacity .15s}.wsx-paper .task:hover>.wsx-sc,.wsx-paper .sec:hover>.wsx-sc,.wsx-paper .wsx-sc:hover{opacity:1}',
    '.wsx-paper .wsx-sc .z,.wsx-paper .wsx-sc .cnt{display:inline-flex;align-items:center;gap:3px}',
    '.wsx-paper .wsx-sc .cnt{padding-left:6px;margin-left:2px;border-left:1.5px solid #E7E2F7}.wsx-paper .wsx-sc .cnt b{min-width:18px}.wsx-paper .wsx-sc .cnt i{font-style:normal;font-weight:700;color:#8a84a3;margin-left:1px}',
    '.wsx-paper .wsx-sc .zx{width:auto;padding:0 7px;font-size:11px}.wsx-paper .wsx-sc .zx.on{background:#5B3BD9;color:#fff}',
    '.wsx-paper .wsx-sc .rs{display:inline-grid;place-items:center}.wsx-paper .wsx-sc [hidden]{display:none}',
    '.wsx-bar .nb{width:auto;padding:0 9px}',
    '.wsx.out .wsx-paper{opacity:.35}.wsx.out .pno{color:#b45309}',
    /* бодолтын зай бүрийн × ба чирэх бариул, гараар тогтоосон өндөр; засах гарчиг (зөвхөн дэлгэцэнд) */
    '@media screen{.wsx-paper .wsx-bx{position:absolute;right:2px;bottom:2px;z-index:26;display:flex;gap:3px;opacity:.3;transition:opacity .15s}',
    '.wsx-paper [data-bk]:hover>.wsx-bx,.wsx-paper .wsx-drag>.wsx-bx{opacity:1}',
    '.wsx-paper .wsx-bx>*{display:grid;place-items:center;width:18px;height:18px;margin:0;padding:0;box-sizing:border-box;border-radius:5px;background:#fff;border:1.3px solid #C9BDF3;color:#5B3BD9;cursor:pointer}',
    '.wsx-paper .wsx-bx .wsx-grip{cursor:ns-resize;touch-action:none}',
    '.wsx-paper .wsx-fix{outline:1.4px dashed #A78BFA;outline-offset:-1px}.wsx-paper .wsx-drag{outline:2px solid #7C3AED;outline-offset:-1px}',
    '.wsx-paper .wsx-hl{position:absolute;left:4px;bottom:3px;z-index:26;font:800 9px/1 "Segoe UI",Arial,sans-serif;color:#7C3AED;pointer-events:none}',
    '.wsx-paper .wsx-ttl{cursor:text;border-radius:4px}.wsx-paper .wsx-ttl:hover{outline:1.5px dashed #A78BFA;outline-offset:3px}.wsx-paper .wsx-ttl:focus{outline:2px solid #7C3AED;outline-offset:3px}}',
    /* огноо (нэргүй) ба үнэлгээний мөр */
    '.wsx-paper .wsx-meta{display:flex!important;align-items:flex-end;flex-wrap:wrap;gap:3mm 6mm}',
    '.wsx-paper .wsx-meta0{justify-content:flex-end;margin:1.5mm 0 3mm}',
    '.wsx-paper .wsx-date{margin-left:auto;white-space:nowrap;font:600 10pt/1.3 "Segoe UI",Arial,sans-serif;color:#4b4566;border:0!important;padding:0!important;flex:none!important;min-width:0!important}',
    '.wsx-paper .wsx-date i{display:inline-block;width:9mm;height:3.6mm;margin:0 1mm;border-bottom:1px solid #8a84a3;vertical-align:baseline}.wsx-paper .wsx-date i.y{width:7mm;margin-left:.4mm}',
    '.wsx-paper .g2s{display:none!important}',
    '.wsx-paper .cm-foot{display:none!important}',                      // номд «№N · CyberMath Дасгалын төв · …» хөл хэрэггүй
    '.wsx-paper .wsx-ev{display:flex;align-items:center;gap:4mm;margin-top:5mm;padding:2.6mm 4mm;border:1.2px solid #D9D3EE;border-radius:3mm;break-inside:avoid;background:#fff;font:600 9.5pt/1.2 "Segoe UI",Arial,sans-serif;color:#4b4566}',
    '.wsx-paper .ev-c{display:flex;align-items:center;gap:2.5mm;flex:1;min-width:0}.wsx-paper .ev-c+.ev-c{border-left:1.2px solid #E7E2F7;padding-left:4mm}',
    '.wsx-paper .ev-c b{font-weight:800;color:#5B3BD9;white-space:nowrap}',
    '.wsx-paper .ev-st{display:inline-flex;gap:1.2mm;color:#EAB308}.wsx-paper .ev-st svg{display:block}',
    '.wsx-paper .ev-t span{display:inline-flex;align-items:flex-end;gap:1.5mm;white-space:nowrap}',
    '.wsx-paper .ev-t i{display:inline-block;width:14mm;height:4mm;border-bottom:1px solid #8a84a3}.wsx-paper .ev-t i.w{width:24mm}',
    /* «Ном шиг харах» — хоёр нүүр, хуудас эргүүлэх */
    '#flip{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;background:#2B2840;font-family:"Segoe UI",Arial,sans-serif}',
    'body.fp-open{overflow:hidden}',
    '.fp-bar{display:flex;align-items:center;flex-wrap:wrap;gap:8px 10px;padding:9px 16px;background:#14214a;color:#fff;font-size:14px}',
    '.fp-bar>b{margin-right:auto}.fp-bar .fp-pn{font-weight:800;color:#FFC93C;margin-right:6px}',
    '.fp-bar button{border:0;border-radius:10px;padding:8px 13px;background:#22305e;color:#fff;font:inherit;font-weight:800;font-size:13px;cursor:pointer}.fp-bar button:disabled{opacity:.4;cursor:default}',
    '.fp-bar button[data-f="close"]{background:#FFC93C;color:#3a2600}',
    '.fp-bar label{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px}.fp-bar input{width:64px;border:0;border-radius:8px;padding:6px 8px;font:inherit;font-weight:800}',
    '.fp-stage{position:relative;flex:1;overflow:hidden}',
    '.fp-book{position:absolute;left:50%;top:50%;width:420mm;height:297mm;display:flex;transform-origin:center center;perspective:3200px}',
    '.fp-l,.fp-r,.fp-l>.fp-w,.fp-r>.fp-w,.fp-face>.fp-w{position:relative;width:210mm;height:297mm}',
    '#flip.one .fp-book{width:210mm}#flip.one .fp-l{display:none}',
    '.fp-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:20;width:44px;height:64px;border:0;border-radius:12px;background:rgba(255,255,255,.1);color:#fff;font:900 30px/1 "Segoe UI",Arial,sans-serif;cursor:pointer}',
    '.fp-nav.l{left:12px}.fp-nav.r{right:12px}.fp-nav:hover:not(:disabled){background:rgba(255,255,255,.22)}.fp-nav:disabled{opacity:.2;cursor:default}',
    '.fp-ctls{display:flex;justify-content:center;gap:12px;padding:8px 16px;background:#1d1a33}',
    '.fp-ctl{display:flex;align-items:center;gap:8px;min-width:0;max-width:49%;padding:6px 10px;border-radius:12px;background:#fff;color:#14214a;font-size:13px;font-weight:700}',
    '.fp-ctl.ok{box-shadow:inset 4px 0 0 #22c55e}.fp-ctl>b{color:#fff;background:#14214a;border-radius:7px;padding:2px 7px;white-space:nowrap}',
    '.fp-ctl .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.fp-ctl .t i{font-style:normal;color:#8a84a3}',
    '.fp-ctl .okc{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:99px;background:#F1F5F9;white-space:nowrap;cursor:pointer}.fp-ctl.ok .okc{background:#dcfce7;color:#15803d}',
    '.fp-ctl .pgsel{display:inline-flex;align-items:center;gap:3px;white-space:nowrap}',
    '.fp-ctl button{border:1.5px solid #E7E2F7;background:#fff;color:#5B3BD9;border-radius:8px;height:26px;padding:0 8px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}',
    '.fp-ctl .pgsel button.on{background:#5B3BD9;color:#fff;border-color:#5B3BD9}',
    '.fp-ctl .fst{font-size:12px;font-weight:800;color:#8a84a3;white-space:nowrap}.fp-ctl .fst.ok{color:#15803d}.fp-ctl .fst.busy{color:#b45309}.fp-ctl .fst.err{color:#b91c1c}',
    '.fp-seg{display:inline-flex;gap:2px}.fp-seg button{border-radius:0}.fp-seg button:first-child{border-radius:10px 0 0 10px}.fp-seg button:last-child{border-radius:0 10px 10px 0}.fp-seg button.on{background:#5B3BD9}',
    '.fp-ok{color:#bbf7d0;font-weight:700;font-size:13px}.fp-ok b{color:#fff}',
    '#flip.clean .wsx-sc,#flip.clean .wsx-bx,#flip.clean .wsx-hl{display:none!important}#flip.clean .wsx-fix{outline:0!important}#flip.clean .wsx-ttl:hover{outline:0!important}',
    '.fp-pg{position:relative;width:210mm;height:297mm;overflow:hidden;background:#fff;box-shadow:0 6mm 14mm rgba(0,0,0,.35)}',
    '.fp-pg.fp-blank{background:transparent;box-shadow:none}',
    '.fp-pg:after{content:"";position:absolute;top:0;bottom:0;width:14mm;pointer-events:none}.fp-pg.fp-blank:after{display:none}',
    '.fp-l .fp-pg:after,.fp-back .fp-pg:after{right:0;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.12))}',
    '.fp-r .fp-pg:after,.fp-front .fp-pg:after{left:0;background:linear-gradient(90deg,rgba(0,0,0,.14),rgba(0,0,0,0))}',
    '.fp-leaf.bwd .fp-front .fp-pg:after{left:auto;right:0;background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,.12))}.fp-leaf.bwd .fp-back .fp-pg:after{right:auto;left:0;background:linear-gradient(90deg,rgba(0,0,0,.14),rgba(0,0,0,0))}',
    '.fp-pg>.cover{margin:0!important;box-shadow:none!important}',
    '.fp-vp{position:absolute;left:11mm;top:11mm;width:188mm;overflow:hidden}',
    '.fp-src{position:absolute!important;left:0;margin:0!important;padding:0!important;width:188mm!important;box-shadow:none!important;background:transparent!important;opacity:1!important}',
    '.fp-no{position:absolute;left:0;right:0;bottom:0;height:11mm;display:grid;place-items:center;font:700 8.5pt "Segoe UI",Arial,sans-serif;color:#8a84a3}',
    '.fp-leaf{position:absolute;top:0;width:210mm;height:297mm;transform-style:preserve-3d;transition:transform .75s cubic-bezier(.32,.08,.2,1);z-index:5}',
    '.fp-leaf.fwd{left:210mm;transform-origin:left center}.fp-leaf.fwd.go{transform:rotateY(-180deg)}',
    '.fp-leaf.bwd{left:0;transform-origin:right center}.fp-leaf.bwd.go{transform:rotateY(180deg)}',
    '.fp-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden}.fp-back{transform:rotateY(180deg)}',
    '.fp-hint{padding:7px 16px 10px;text-align:center;color:#C9C4E0;font-size:12px}',
    '.wsx-err{width:210mm;margin:16px auto;padding:12px 16px;border-radius:12px;background:#fee2e2;color:#b91c1c;font-weight:800;font-size:13px}',
    '.wsx-no b{color:#5a32d6}',
    // хэвлэхэд: хуудасны дугаар доод талд (@page) — № давхар дугаар болохгүйн тулд нуугдана; агуулгын хуудаслалт tocPages()-ийн дагуу
    '@media print{body{background:#fff}.tb,.tip,.wsx-bar,.wsx-sc,.gd,.wsx-err,.wsx-no{display:none!important}.wsx.off,.wsx.out,#flip,.wsx-bx,.wsx-hl{display:none!important}.wsx.hid{display:block!important}.wsx-fix,.wsx-drag{outline:0!important}',
    '.toc-pb{break-before:page;margin-top:0!important}.wsx-paper .wsx-pb{break-before:page!important;margin-top:0!important}',
    '.cover,.toc,.wsx{margin:0!important;box-shadow:none!important}.toc{padding:0;width:auto}.wsx{width:auto}.wsx-paper{width:auto;padding:0;box-shadow:none;opacity:1!important}}',
  ].join('');

  window.WSBOOK = { build: build, snap: snapOne, _main: bookMain, _css: BOOK_CSS };   // snap — засварлагч хуудсыг дахин ачаална; _main/_css — урьдчилан харах тест
})();
