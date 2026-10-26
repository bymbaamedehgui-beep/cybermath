/* Дасгал ажлын дэвтэр — анги бүрийн ном. Дасгалын төвийн ажлын хуудсууд БҮТНЭЭРЭЭ, агуулгын дарааллаар (бүлэг → сэдэв,
   жишиг/шалгалт орно) ар араасаа, хуудас бүр шинэ хуудаснаас; эхэнд нүүр + агуулга (хэвлэсэн хуудасны дугаараар).
   Админ хуудас бүрийг хянана: бодолтын зайтай эсэх (унтраавал хуудасны өөрийн зайгүй загвараар дахин ачаална), зайн
   хэмжээ (бүхэлд нь болон даалгавар тус бүрээр − / +), номд оруулах эсэх, «Шалгасан» тэмдэг; хэвлэхэд хэдэн хуудас
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

  /* ── 2) Ажлын хуудсыг далд iframe-д зурж #sheet-ийг стильтэй нь хуулна. work: бодолтын зайтай (?work=1) эсэх ── */
  function loadSheet(slug, work) {
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
            // ws-store.js-ийн зааврын засвар (?instr=) серверээс ирэхийг хүлээнэ
            setTimeout(function () { try { fin(null, snapshot(d)); } catch (e) { fin(e); } }, 900);
          } else setTimeout(wait, 120);
        })();
      };
      f.src = '/' + slug + (work ? '?work=1' : '');
      document.body.appendChild(f);
    });
  }
  function snapshot(d) {
    var sh = d.getElementById('sheet') || d.querySelector('.sheet');
    if (!sh || !sh.children.length) throw new Error('хуудас зурагдсангүй');
    var cl = sh.cloneNode(true);
    [].forEach.call(cl.querySelectorAll('#answers, .ans-page, .sols-page, .cm-grip, .cm-del, script'), function (x) { x.remove(); });
    [].forEach.call(cl.querySelectorAll('[contenteditable], [data-cm-ed]'), function (x) { x.removeAttribute('contenteditable'); x.removeAttribute('data-cm-ed'); });
    cl.removeAttribute('contenteditable');
    var root = '', styles = [];
    [].forEach.call(d.querySelectorAll('style'), function (s) {
      var t = (s.textContent || '').replace(/:root\s*\{([^}]*)\}/g, function (m, x) { root += x + ';'; return ''; })
        .replace(/@page\s*\{[^}]*\}/g, '').replace(/@import[^;]+;/g, '')
        // Хэвлэхтэй яг ижил харагдуулна: print дүрэм дэлгэцэнд ч, screen дүрэм хэзээ ч биш
        .replace(/@media\s+print/g, '@media all').replace(/@media\s+(only\s+)?screen/g, '@media (max-width:0px)');
      if (t.trim()) styles.push(t);
    });
    return { html: cl.outerHTML, styles: styles, root: root };
  }
  // Ажлын хуудасны нийтлэг «Бодолтын зай %» (localStorage) номд нөлөөлөхгүй — ачаалах хооронд 1 болгож, дараа нь сэргээнэ
  function scaleOff() {
    var prev = null; try { prev = localStorage.getItem(WKS_KEY); localStorage.setItem(WKS_KEY, '1'); } catch (e) {}
    return function () { try { if (prev == null) localStorage.removeItem(WKS_KEY); else localStorage.setItem(WKS_KEY, prev); } catch (e) {} };
  }
  // Засварлагчаас нэг хуудсыг дахин ачаална (бодолтын зайтай ↔ зайгүй)
  function snapOne(slug, work) {
    var restore = scaleOff();
    return loadSheet(slug, work).then(function (s) { restore(); return s; }, function (e) { restore(); throw e; });
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
        return loadSheet(it.slug, work).then(function (s) { it.snap = s; }, function (e) { it.err = String((e && e.message) || e); })
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
    var ICO_OK = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    var D = null, SET = {}, ITEMS = [], timers = {}, onlyLong = false, onlyTodo = false, BLK = new Map();
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var clamp = function (v) { return Math.max(0, Math.min(2, Math.round(v * 10) / 10)); };
    function hdr() { var t = ''; try { t = localStorage.getItem('cm_admin_token') || ''; } catch (e) {} return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }; }
    function cfg(slug) { return SET[slug] || (SET[slug] = { s: 1, g: [], off: false, nw: false, ok: false }); }
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
        SET[k] = { s: s.s == null ? 1 : +s.s, g: Array.isArray(s.g) ? s.g.map(function (v) { return v == null ? null : +v; }) : [], off: !!s.off, nw: !!s.nw, ok: !!s.ok };
      });
      D.blocks.forEach(function (t, i) { BLK.set(t, i); });
      var st = document.createElement('style');
      st.textContent = D.blocks.map(function (t, i) { return '.cb-' + i + '{' + t + '}'; }).join('\n');
      document.head.appendChild(st);
      render();
      var katex = document.querySelector('link[href*="katex"]');
      var ready = [document.fonts ? document.fonts.ready : null];
      if (katex && !katex.sheet) ready.push(new Promise(function (r) { katex.onload = katex.onerror = r; }));
      // Эхний тооцоо багцаар: бүгдийг уншаад → бүгдийг бичээд → бүгдийг уншаад → бүгдийг бичнэ (119 хуудсанд layout-ыг дахин дахин бодуулахгүй)
      Promise.race([Promise.all(ready), new Promise(function (r) { setTimeout(r, 5000); })]).then(function () {
        ITEMS.forEach(measure);
        ITEMS.forEach(function (x) { setHeights(x); });
        var res = ITEMS.map(calc);
        ITEMS.forEach(function (x, i) { paint(x, res[i]); });
        totals();
      });
    };

    function render() {
      var app = document.getElementById('app'), h = '';
      var nOk = D.list.filter(function (it) { return it.snap; }).length;
      // Хэрэгслийн мөр — санамсаргүй хуваагдахгүйн тулд 2 тодорхой мөр: (1) нэр, тоо, явц (2) удирдлага
      h += '<div class="tb"><div class="tb-r"><b>Дасгал ажлын дэвтэр · ' + esc(D.label) + '</b><span id="sum"></span><span id="prog" class="prog"></span></div>'
        + '<div class="tb-r"><label class="tb-f"><input type="checkbox" id="onlyTodo"> Зөвхөн шалгаагүй</label>'
        + '<label class="tb-f"><input type="checkbox" id="onlyLong"> Зөвхөн 2+ хуудастай</label>'
        + '<span class="tb-g">Бүх хуудасны зай <button type="button" data-all="-1">−</button><button type="button" data-all="1">+</button></span>'
        + '<select id="jump"><option value="">Хуудас руу очих…</option>' + D.list.map(function (it) { return '<option value="' + it.n + '">№' + it.n + ' ' + esc(it.title) + '</option>'; }).join('') + '</select>'
        + '<button type="button" id="prt">Хэвлэх / PDF</button></div></div>'
        + '<div class="tip">Хуудас бүрийг хянана: <b>Бодолтын зайтай</b> эсэх, зайн хэмжээ (<b>−</b> / <b>+</b> — хуудас бүхэлд нь эсвэл даалгавар тус бүрээр), '
        + '<b>Номд оруулах</b> эсэхийг тохируулаад <b>Шалгасан</b> гэж тэмдэглэнэ. <span class="tip-r">Улаан тасархай шугам</span> — хэвлэхэд хуудас солигдох газар. '
        + 'Өөрчлөлт бүр автоматаар хадгалагдана.</div>';
      // Нүүр — цайвар хуудас + CyberMath өнгө: тод хайрцаггүй; хар хөх томьёо, хар хөх сүүдэртэй шар ангийн дугаар,
      // хар хөх тоон шулуун дээр зогсох шувуу. Ягаан — зөвхөн жижиг дэлгэрэнгүйд.
      var nTopics = 0; D.chapters.forEach(function (c) { nTopics += c.topics.length; });
      var gm = String(D.label).match(/^(\d+)\s*-?\s*р?\s*анги$/i);
      var nl = '<svg class="cv-line" viewBox="0 0 170 14" aria-hidden="true" fill="none" stroke="#14214A" stroke-linecap="round"><path d="M3 5H165" stroke-width=".6"/><path d="M162 3l3 2-3 2" stroke-width=".6"/>';
      for (var k = -4; k <= 4; k++) {
        var xk = 85 + k * 17;
        nl += '<path d="M' + xk + ' 3V7" stroke-width=".5"/><text x="' + xk + '" y="12.4" fill="#14214A" stroke="none" font-size="3.4" font-weight="700" text-anchor="middle" font-family="Montserrat,Segoe UI,Arial">' + (k < 0 ? '−' + (-k) : k) + '</text>';
      }
      nl += '</svg>';
      h += '<section class="cover"><div class="cv-in">'
        + '<div class="cv-brand"><img src="/assets/cybermath-mascot.svg" alt=""><b>CYBERMATH</b><span>Дасгалын төв</span></div>'
        + '<div class="cv-kick">МАТЕМАТИК</div><h1>Дасгал ажлын<br>дэвтэр</h1><i class="cv-bar"></i>'
        + '<div class="cv-art"><div class="cv-fx f1">a² + b² = c²</div><div class="cv-fx f2">∫ π √x</div><div class="cv-fx f3">y = ax² + bx + c</div><div class="cv-fx f4">sin²α + cos²α = 1</div>'
        + (gm ? '<div class="cv-num' + (gm[1].length > 1 ? ' two' : '') + '">' + gm[1] + '</div>' : '')
        + '<div class="cv-cl"><b' + (gm ? '' : ' class="big"') + '>' + esc(D.label) + '</b><span>' + D.chapters.length + ' бүлэг · ' + nTopics + ' сэдэв · ' + nOk + ' ажлын хуудас</span></div>'
        + nl + '<img class="cv-chick" src="/assets/chicks/chick-1.svg" alt=""></div>'
        + '<div class="cv-label"><div><i>Нэр</i><u></u></div><div><i>Анги</i><u></u></div><div><i>Сургууль</i><u></u></div></div>'
        + '<div class="cv-foot"><span>cyber-math.com/dasgal</span><span>' + D.year + '</span></div></div></section>';
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
          + '<div class="wsx-bar"><span class="no">№' + it.n + '</span><span class="nm"><b>' + esc(it.title) + '</b><small>' + where + '</small></span>'
          + '<span class="pgs"></span><span class="pno"></span>'
          + '<label class="tg"><input type="checkbox" data-a="wk"' + (s.nw ? '' : ' checked') + '> Бодолтын зайтай</label>'
          + '<span class="ctl">Зай <button type="button" data-a="s" data-d="-1">−</button><b class="sv">' + pct(s.s) + '</b><button type="button" data-a="s" data-d="1">+</button></span>'
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
      document.getElementById('jump').onchange = function () {
        var e = document.getElementById('ws-' + this.value);
        if (e) window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - tbEl.offsetHeight - 10, behavior: 'smooth' });
        this.value = '';
      };
      document.getElementById('onlyLong').onchange = function () { onlyLong = this.checked; ITEMS.forEach(vis); };
      document.getElementById('onlyTodo').onchange = function () { onlyTodo = this.checked; ITEMS.forEach(vis); };
      app.addEventListener('click', onClick);
      app.addEventListener('change', function (e) {
        var t = e.target, a = t.getAttribute('data-a'); if (!a) return;
        var sec = t.closest('.wsx'); if (!sec) return;
        var x = sec._it, s = cfg(x.it.slug);
        if (a === 'inc') { s.off = !t.checked; sec.classList.toggle('off', s.off); totals(); save(x); }
        else if (a === 'ok') { s.ok = t.checked; sec.classList.toggle('done', s.ok); totals(); vis(x); save(x); }
        else if (a === 'wk') { s.nw = !t.checked; reload(x); }
      });
    }
    // Хуудасны бэлтгэл (анх ба дахин ачаалсны дараа): хөлд №, даалгаврын гарчгийн хажууд − / +, бодолтын зайнууд
    function prep(x) {
      x.sheet = x.paper.firstElementChild; x.units = null;
      var ft = x.sheet.querySelector('.cm-foot'); if (ft && !ft.querySelector('.wsx-no')) ft.insertAdjacentHTML('afterbegin', '<span class="wsx-no"><b>№' + x.it.n + '</b> · </span>');
      x.heads = [].slice.call(x.sheet.querySelectorAll('.task, .sec'));
      x.boxes = [].slice.call(x.sheet.querySelectorAll('.wk, .work, .pw, .wgrid'));
      x.boxes.forEach(function (b) {
        var k = -1; x.heads.forEach(function (hd, i) { if (hd.compareDocumentPosition(b) & 4) k = i; });
        b.setAttribute('data-g', k);
      });
      x.heads.forEach(function (hd, i) {
        if (!x.boxes.some(function (b) { return +b.getAttribute('data-g') === i; })) return;
        if (getComputedStyle(hd).position === 'static') hd.style.position = 'relative';
        hd.insertAdjacentHTML('beforeend', '<span class="wsx-sc" data-g="' + i + '"><button type="button" data-a="g" data-d="-1">−</button><b>100%</b><button type="button" data-a="g" data-d="1">+</button></span>');
      });
      x.sec.querySelector('.ctl').classList.toggle('none', !x.boxes.length);
    }
    function measure(x) { x.boxes.forEach(function (b) { b.setAttribute('data-h0', b.getBoundingClientRect().height || parseFloat(getComputedStyle(b).height) || 40); }); }
    // Бодолтын зайтай ↔ зайгүй: ажлын хуудсыг тухайн горимоор нь дахин ачаална (Дасгалын төвийн цонх нээлттэй байх ёстой)
    function reload(x) {
      var s = cfg(x.it.slug), op = window.opener;
      if (!op || op.closed || !op.WSBOOK || !op.WSBOOK.snap) { setSt(x, 'Дасгалын төвийн хуудас хаагдсан тул дахин ачаалж чадсангүй', 'err'); return; }
      setSt(x, 'Ачаалж байна…', 'busy'); x.sec.classList.add('busy');
      op.WSBOOK.snap(x.it.slug, !s.nw).then(function (snap) {
        x.paper.className = 'wsx-paper ' + clsFor(snap.styles);
        x.paper.setAttribute('style', snap.root);
        x.paper.innerHTML = snap.html;
        prep(x); measure(x); apply(x); totals(); save(x);
      }, function (e) { setSt(x, 'Ачаалж чадсангүй: ' + esc(String((e && e.message) || e)), 'err'); })
        .then(function () { x.sec.classList.remove('busy'); });
    }

    function onClick(e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.hasAttribute('data-all')) {         // бүх хуудасны зайг 10%-иар
        var d0 = +b.getAttribute('data-all'), xs = ITEMS.filter(function (x) { return x.boxes.length; });
        xs.forEach(function (x) { var s = cfg(x.it.slug); s.s = clamp(s.s + d0 * 0.1); setHeights(x); });
        var rs = xs.map(calc);
        xs.forEach(function (x, i) { paint(x, rs[i]); save(x); });
        totals(); return;
      }
      var a = b.getAttribute('data-a'); if (!a) return;
      var sec = b.closest('.wsx'); if (!sec) return;
      var x = sec._it, s = cfg(x.it.slug), d = +b.getAttribute('data-d');
      if (a === 's') s.s = clamp(s.s + d * 0.1);
      if (a === 'g') { var k = +b.parentNode.getAttribute('data-g'); s.g[k] = clamp((s.g[k] == null ? 1 : s.g[k]) + d * 0.1); }
      apply(x); totals(); save(x);
    }

    // Бодолтын зайн өндөр = анхны өндөр (data-h0) × хуудасны масштаб × тухайн даалгаврын масштаб (0 бол нуугдана)
    function setHeights(x) {
      var s = cfg(x.it.slug);
      x.boxes.forEach(function (b) {
        var k = +b.getAttribute('data-g'), sc = s.s * (k >= 0 && s.g[k] != null ? s.g[k] : 1), h0 = +b.getAttribute('data-h0') || 0;
        if (sc <= 0) { b.style.setProperty('display', 'none', 'important'); return; }
        b.style.removeProperty('display');
        b.style.setProperty('height', Math.max(4, Math.round(h0 * sc)) + 'px', 'important');
        b.style.setProperty('min-height', '0', 'important');
      });
      x.sec.querySelector('.ctl .sv').textContent = pct(s.s);
      [].forEach.call(x.sec.querySelectorAll('.wsx-sc'), function (c) { var k = +c.getAttribute('data-g'); c.querySelector('b').textContent = pct(s.g[k] == null ? 1 : s.g[k]); });
    }
    function apply(x) { setHeights(x); paint(x, calc(x)); }
    // Хуваагдахгүй хэсгүүд (хуудас бүрд нэг удаа): ажлын хуудасны CSS-д break-inside:avoid (бодлого .q, тест .t-item, задгай .free…)
    // + гарчиг, хүснэгтийн мөр, зураг. ba — break-after:avoid (даалгаврын гарчиг дараагийн бодлоготойгоо хамт шилжинэ)
    var KEEP = '.q, .prob, .task, .sec, .head, .meta, .rule, .cm-foot, tr, .fig, .formulas, .boxes, .guide, .intro, .steps, .case, img, svg, canvas, .katex-display';
    function units(x) {
      var out = [];
      (function walk(el) {
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
          if (c.classList.contains('wsx-sc') || c.classList.contains('gd')) continue;
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
      return { pages: pages, br: br };
    }
    function paint(x, r) {
      var pages = r.pages, br = r.br;
      x.pages = pages;
      [].forEach.call(x.paper.querySelectorAll('.gd'), function (g) { g.remove(); });
      br.forEach(function (y, i) { x.paper.insertAdjacentHTML('beforeend', '<div class="gd" style="top:calc(11mm + ' + Math.round(y) + 'px)"><span>' + (i + 2) + '-р хуудас</span></div>'); });
      var pg = x.sec.querySelector('.pgs');
      pg.textContent = pages + ' хуудас'; pg.className = 'pgs p' + Math.min(pages, 3);
      vis(x);
    }
    function vis(x) { x.sec.classList.toggle('hid', (onlyLong && x.pages < 2) || (onlyTodo && cfg(x.it.slug).ok)); }
    // Хуудасны дугаар (хэвлэхэд доод талд гарна): 1 — нүүр (дугааргүй), 2… — агуулга, дараа нь номд орсон ажлын хуудсууд.
    // Агуулгад зөвхөн номд орсон хуудастай бүлэг/сэдэв, тэр сэдвийн эхний хуудасны дугаартай.
    function totals(depth) {
      var inc = ITEMS.filter(function (x) { return !cfg(x.it.slug).off; });
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
        x.sec.querySelector('.pno').textContent = cfg(x.it.slug).off ? 'номд ороогүй' : 'х. ' + x.p0 + (n > 1 ? '–' + (x.p0 + n - 1) : '');
      });
      document.getElementById('sum').innerHTML = 'Нийт <b>' + (p - 1) + '</b> хуудас · ' + inc.length + ' ажлын хуудас'
        + ' <span class="s1">1 хуудастай ' + one + '</span> <span class="s2">2+ хуудастай ' + more + '</span>';
      var ok = ITEMS.filter(function (x) { return cfg(x.it.slug).ok; }).length;
      document.getElementById('prog').innerHTML = 'Шалгасан <b>' + ok + '</b> / ' + ITEMS.length;
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
    function setSt(x, html, cls) { var e = x.sec.querySelector('.sst'); e.innerHTML = html; e.className = 'sst ' + (cls || ''); }
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
    '.tb-r:last-child #prt{margin-left:auto}',
    '.tb #sum{color:#c4cdea;font-size:13px}.tb #sum b{color:#FFC93C;font-size:15px}',
    '.tb .s1,.tb .s2{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:800}.tb .s1{background:rgba(34,197,94,.2);color:#86efac}.tb .s2{background:rgba(245,158,11,.22);color:#fcd34d}',
    '.tb .prog{margin-right:auto;padding:3px 10px;border-radius:99px;background:rgba(34,197,94,.18);color:#bbf7d0;font-weight:800;font-size:12.5px}.tb .prog b{color:#fff}',
    '.tb button,.tb select{border:0;border-radius:10px;padding:8px 13px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer}',
    '.tb #prt{background:#FFC93C;color:#3a2600}.tb select{background:#22305e;color:#fff;max-width:260px}',
    '.tb-g{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px}.tb-g button{background:#22305e;color:#fff;padding:5px 11px}',
    '.tb-f{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;cursor:pointer}',
    '.tip{max-width:210mm;margin:14px auto 0;padding:10px 14px;border-left:3px solid #7B52EE;border-radius:8px;background:#fff;font-size:13px;line-height:1.5;color:#4b4566}.tip-r{color:#dc2626;font-weight:800}',
    /* нүүр — цайвар хуудас + CyberMath өнгө (хар хөх томьёо, шар дугаар), ягаан бага */
    '.cover{page:cover;position:relative;width:210mm;height:297mm;margin:16px auto;overflow:hidden;background:#FBFAF6;box-shadow:0 10px 30px -14px rgba(20,33,74,.35);font-family:Montserrat,"Segoe UI",Arial,sans-serif;color:#14214A}',
    '.cover *{box-sizing:border-box}',
    '.cover:before{content:"";position:absolute;right:-40mm;top:-46mm;width:130mm;height:130mm;border-radius:50%;background:radial-gradient(circle,rgba(255,201,60,.30),rgba(255,201,60,0) 68%)}',
    '.cover:after{content:"";position:absolute;left:0;right:0;bottom:0;height:62mm;background:linear-gradient(rgba(20,33,74,.05) .25mm,transparent .25mm) 0 0/6mm 6mm,linear-gradient(90deg,rgba(20,33,74,.05) .25mm,transparent .25mm) 0 0/6mm 6mm;-webkit-mask-image:linear-gradient(transparent,#000 60%);mask-image:linear-gradient(transparent,#000 60%)}',
    '.cv-in{position:absolute;inset:0;z-index:2;padding:20mm 20mm 15mm;display:flex;flex-direction:column}',
    '.cv-brand{display:flex;align-items:center;gap:2.5mm;font-size:10pt;letter-spacing:.16em}',
    '.cv-brand img{width:8mm;height:8mm}.cv-brand b{font-weight:800;color:#14214A}.cv-brand span{padding-left:2.5mm;border-left:.4mm solid #C9CCDB;letter-spacing:.04em;font-weight:600;color:#7A7F9A}',
    '.cv-kick{margin-top:15mm;font-size:11pt;font-weight:700;letter-spacing:.32em;color:#7B61FF}',
    '.cover h1{margin:4mm 0 0;font-size:48pt;line-height:1.02;font-weight:800;letter-spacing:-.6pt;color:#14214A}',
    '.cv-bar{display:block;width:26mm;height:2.4mm;margin-top:8mm;border-radius:1.2mm;background:linear-gradient(90deg,#FFC93C,#FFB020)}',
    '.cv-art{position:relative;margin-top:12mm;height:104mm}',
    '.cv-art:before{content:"";position:absolute;right:-8mm;top:-12mm;width:84mm;height:84mm;border-radius:50%;background:radial-gradient(circle,rgba(255,201,60,.24),rgba(255,201,60,0) 66%)}',
    ".cv-fx{position:absolute;font-family:'Cambria Math',Cambria,'Times New Roman',serif;font-style:italic;font-weight:700;color:#14214A;white-space:nowrap}",
    '.cv-fx.f1{left:56mm;top:40mm;font-size:22pt;opacity:.85}.cv-fx.f2{left:64mm;top:26mm;font-size:16pt;opacity:.5}',
    '.cv-fx.f3{right:2mm;bottom:18mm;font-size:14pt;opacity:.75}.cv-fx.f4{left:52mm;top:60mm;font-size:13pt;opacity:.6}',
    '.cv-num{position:absolute;right:8mm;top:2mm;font-size:210pt;line-height:.8;font-weight:900;letter-spacing:-6pt;background:linear-gradient(170deg,#FFE7A0 0%,#FFC93C 45%,#FFA319 100%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(1.8mm 1.8mm 0 #14214A)}',
    '.cv-num.two{font-size:150pt;letter-spacing:-5pt;right:4mm;top:10mm}',
    '.cv-cl{position:absolute;left:0;top:0;max-width:80mm}',
    '.cv-cl b{display:block;font-size:22pt;font-weight:800;color:#14214A}.cv-cl b.big{font-size:26pt;line-height:1.1}',
    '.cv-cl span{display:block;margin-top:2mm;font-size:10.5pt;font-weight:600;color:#6B7090}',
    '.cv-line{position:absolute;left:0;bottom:0;width:100%;height:14mm}',
    '.cv-chick{position:absolute;left:8mm;bottom:8.5mm;width:40mm;filter:drop-shadow(0 3mm 4mm rgba(20,33,74,.18))}',
    '.cv-label{margin-top:auto;display:grid;gap:7mm}',
    '.cv-label div{display:flex;align-items:flex-end;gap:4mm}',
    '.cv-label i{min-width:24mm;font-style:normal;font-size:9pt;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#8A8FA8}',
    '.cv-label u{flex:1;height:6mm;border-bottom:.45mm solid #C9CCDB;text-decoration:none}',
    '.cv-foot{display:flex;justify-content:space-between;margin-top:9mm;padding-right:4mm;font-size:9pt;font-weight:600;letter-spacing:.06em;color:#8A8FA8}',
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
    '.wsx-bar .ctl{display:inline-flex;align-items:center;gap:5px;font-weight:700}.wsx-bar .ctl.none{display:none}',
    '.wsx-bar button{border:1.5px solid #E7E2F7;background:#fff;color:#5B3BD9;border-radius:8px;width:28px;height:26px;font:inherit;font-weight:900;cursor:pointer;line-height:1}',
    '.wsx-bar button:hover{border-color:#5B3BD9}.wsx-bar .sv{min-width:42px;text-align:center}',
    '.wsx-bar .tg{display:inline-flex;align-items:center;gap:5px;font-weight:700;cursor:pointer;white-space:nowrap}',
    '.wsx-bar .okc{padding:3px 9px;border-radius:99px;background:#F1F5F9}',
    '.wsx.done .wsx-bar{box-shadow:inset 4px 0 0 #22c55e,0 8px 20px -14px rgba(20,33,74,.5)}.wsx.done .okc{background:#dcfce7;color:#15803d}',
    '.wsx-bar .sst{font-size:12px;font-weight:800;min-width:96px}.sst.ok{color:#15803d}.sst.busy{color:#8a84a3}.sst.err{color:#b91c1c}',
    '.wsx.off .wsx-paper{opacity:.35}.wsx.hid{display:none}.wsx.busy .wsx-paper{opacity:.45;pointer-events:none}',
    '.wsx-paper{position:relative;width:188mm;padding:11mm;box-sizing:content-box;background:#fff;box-shadow:0 10px 30px -14px rgba(20,33,74,.45)}',
    '.wsx-paper>.sheet{width:auto!important;max-width:none!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;border:0!important}',
    '.wsx-paper .gd{position:absolute;left:0;right:0;height:0;border-top:2px dashed #ef4444;z-index:30;pointer-events:none}',
    '.wsx-paper .gd span{position:absolute;right:4px;top:-11px;background:#ef4444;color:#fff;font:800 10px/1 "Segoe UI",Arial,sans-serif;padding:3px 7px;border-radius:99px}',
    '.wsx-paper .wsx-sc{position:absolute;right:0;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px;margin:0;padding:2px 4px;border-radius:9px;background:#fff;border:1.5px solid #E7E2F7;font:800 11px/1 "Segoe UI",Arial,sans-serif;color:#5B3BD9;z-index:25}',
    '.wsx-paper .wsx-sc button{width:20px;height:20px;margin:0;padding:0;border:0;border-radius:6px;background:#F1EDFF;color:#5B3BD9;font:900 13px/1 "Segoe UI",Arial,sans-serif;cursor:pointer}',
    '.wsx-paper .wsx-sc b{min-width:34px;text-align:center}',
    '.wsx-err{width:210mm;margin:16px auto;padding:12px 16px;border-radius:12px;background:#fee2e2;color:#b91c1c;font-weight:800;font-size:13px}',
    '.wsx-no b{color:#5a32d6}',
    // хэвлэхэд: хуудасны дугаар доод талд (@page) — № давхар дугаар болохгүйн тулд нуугдана; агуулгын хуудаслалт tocPages()-ийн дагуу
    '@media print{body{background:#fff}.tb,.tip,.wsx-bar,.wsx-sc,.gd,.wsx-err,.wsx-no{display:none!important}.wsx.off{display:none!important}.wsx.hid{display:block!important}',
    '.toc-pb{break-before:page;margin-top:0!important}',
    '.cover,.toc,.wsx{margin:0!important;box-shadow:none!important}.toc{padding:0;width:auto}.wsx{width:auto}.wsx-paper{width:auto;padding:0;box-shadow:none;opacity:1!important}}',
  ].join('');

  window.WSBOOK = { build: build, snap: snapOne, _main: bookMain, _css: BOOK_CSS };   // snap — засварлагч хуудсыг дахин ачаална; _main/_css — урьдчилан харах тест
})();
