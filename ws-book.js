/* Дасгалын дэвтэр — анги бүрийн ном. Дасгалын төвийн ажлын хуудсууд БҮТНЭЭРЭЭ, агуулгын дарааллаар (бүлэг → сэдэв,
   жишиг/шалгалт орно) ар араасаа, хуудас бүр шинэ хуудаснаас; эхэнд нүүр + агуулга (№-ээр).
   Админ хуудас бүрийн бодолтын зайг бүхэлд нь болон хэсэг (даалгавар) тус бүрээр − / + -ээр тааруулж, хэвлэхэд хэдэн
   хуудас эзлэхийг шууд харна (улаан тасархай = хуудас солигдох газар). Бодлогын тоо өөрчлөгдөхгүй — зөвхөн зай.
   Тохиргоо серверт (api/worksheets.js book_get/book_set) өөрчлөлт бүрд автоматаар хадгалагдана.
   Ажлын хуудсыг ?work=1 (бодолтын зайтай) горимоор далд iframe-д ачаалж #sheet-ийг өөрийн CSS-тэй нь хуулна
   (ижил CSS блок нэг удаа, .cb-N дотор nesting). Нээх: Дасгалын төв → анги (админ) → «Дасгалын дэвтэр». */
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

  /* ── 2) Ажлын хуудсыг бодолтын зайтай (?work=1) далд iframe-д зурж, #sheet-ийг стильтэй нь хуулна ── */
  function loadSheet(slug) {
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
            try { var sw = d.getElementById('sw'); if (sw && !sw.checked) { sw.checked = true; if (typeof w.layout === 'function') w.layout(); } } catch (e) {}
            // ws-store.js-ийн зааврын засвар (?instr=) серверээс ирэхийг хүлээнэ
            setTimeout(function () { try { fin(null, snapshot(d)); } catch (e) { fin(e); } }, 900);
          } else setTimeout(wait, 120);
        })();
      };
      f.src = '/' + slug + '?work=1';
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
      pw.document.write('<!doctype html><html lang="mn"><head><meta charset="utf-8"><title>Дасгалын дэвтэр — ' + esc(o.label) + '</title></head>'
        + '<body style="margin:0;font:700 15px \'Segoe UI\',Arial,sans-serif;color:#4b4566;background:#f4f2f8;text-align:center;padding:110px 20px">'
        + '<div style="font-size:22px;font-weight:900;color:#14214a;margin-bottom:10px">Дасгалын дэвтэр · ' + esc(o.label) + '</div>'
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
    // Ажлын хуудасны нийтлэг «Бодолтын зай %» (localStorage) номд нөлөөлөхгүй — ачаалах хооронд 1 болгоно
    var prev = null; try { prev = localStorage.getItem(WKS_KEY); localStorage.setItem(WKS_KEY, '1'); } catch (e) {}
    var done = 0, next = 0;
    function worker() {
      if (pw.closed) return Promise.resolve();
      var it = list[next++]; if (!it) return Promise.resolve();
      return loadSheet(it.slug).then(function (s) { it.snap = s; }, function (e) { it.err = String((e && e.message) || e); })
        .then(function () {
          done++;
          try { pw.document.getElementById('st').textContent = 'Ажлын хуудсуудыг ачаалж байна… ' + done + ' / ' + list.length; } catch (e) {}
          return worker();
        });
    }
    var ws = []; for (var i = 0; i < CONC; i++) ws.push(worker());
    Promise.all(ws).then(function () {
      try { if (prev == null) localStorage.removeItem(WKS_KEY); else localStorage.setItem(WKS_KEY, prev); } catch (e) {}
      if (pw.closed) return;
      var blocks = [], idx = new Map();
      list.forEach(function (it) {
        if (!it.snap) return;
        it.cls = it.snap.styles.map(function (t) { if (!idx.has(t)) { idx.set(t, blocks.length); blocks.push(t); } return 'cb-' + idx.get(t); }).join(' ');
      });
      var D = { label: o.label, year: new Date().getFullYear(), list: list, blocks: blocks, settings: settings,
        chapters: o.chapters.map(function (c) { return { roman: c.roman, title: c.title, topics: c.topics.map(function (t) { return { num: t.num, title: t.title }; }) }; }) };
      pw.document.open();
      pw.document.write('<!doctype html><html lang="mn"><head><meta charset="utf-8"><base href="' + location.origin + '/">'
        + '<title>Дасгалын дэвтэр — ' + esc(o.label) + '</title>'
        + '<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css">'
        + '<style>' + BOOK_CSS + '</style></head><body><div id="app"></div>'
        + '<script>(' + bookMain.toString() + ')();<\/script></body></html>');
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
    var D = null, SET = {}, ITEMS = [], timers = {}, onlyLong = false;
    var pct = function (v) { return Math.round(v * 100) + '%'; };
    var clamp = function (v) { return Math.max(0, Math.min(2, Math.round(v * 10) / 10)); };
    function hdr() { var t = ''; try { t = localStorage.getItem('cm_admin_token') || ''; } catch (e) {} return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }; }
    function cfg(slug) { return SET[slug] || (SET[slug] = { s: 1, g: [], off: false }); }

    window.__bookInit = function (data) {
      D = data;
      Object.keys(D.settings || {}).forEach(function (k) {
        var s = D.settings[k] || {};
        SET[k] = { s: s.s == null ? 1 : +s.s, g: Array.isArray(s.g) ? s.g.map(function (v) { return v == null ? null : +v; }) : [], off: !!s.off };
      });
      var st = document.createElement('style');
      st.textContent = D.blocks.map(function (t, i) { return '.cb-' + i + '{' + t + '}'; }).join('\n');
      document.head.appendChild(st);
      render();
      var katex = document.querySelector('link[href*="katex"]');
      var ready = [document.fonts ? document.fonts.ready : null];
      if (katex && !katex.sheet) ready.push(new Promise(function (r) { katex.onload = katex.onerror = r; }));
      // Эхний тооцоо багцаар: бүгдийг уншаад → бүгдийг бичээд → бүгдийг уншаад → бүгдийг бичнэ (119 хуудсанд layout-ыг дахин дахин бодуулахгүй)
      Promise.race([Promise.all(ready), new Promise(function (r) { setTimeout(r, 5000); })]).then(function () {
        ITEMS.forEach(function (x) { x.boxes.forEach(function (b) { b.setAttribute('data-h0', b.getBoundingClientRect().height || parseFloat(getComputedStyle(b).height) || 40); }); });
        ITEMS.forEach(function (x) { setHeights(x); });
        var res = ITEMS.map(calc);
        ITEMS.forEach(function (x, i) { paint(x, res[i]); });
        totals();
      });
    };

    function render() {
      var app = document.getElementById('app'), h = '';
      var nOk = D.list.filter(function (it) { return it.snap; }).length;
      h += '<div class="tb"><b>Дасгалын дэвтэр · ' + esc(D.label) + '</b><span id="sum"></span>'
        + '<span class="tb-g">Бүх хуудасны зай <button type="button" data-all="-1">−</button><button type="button" data-all="1">+</button></span>'
        + '<label class="tb-f"><input type="checkbox" id="onlyLong"> Зөвхөн 2+ хуудастай</label>'
        + '<select id="jump"><option value="">Хуудас руу очих…</option>' + D.list.map(function (it) { return '<option value="' + it.n + '">№' + it.n + ' ' + esc(it.title) + '</option>'; }).join('') + '</select>'
        + '<button type="button" id="prt">Хэвлэх / PDF</button></div>'
        + '<div class="tip">Бодолтын зайг <b>−</b> / <b>+</b> товчоор тааруулна (хуудас бүхэлд нь эсвэл даалгавар тус бүрээр). '
        + '<span class="tip-r">Улаан тасархай шугам</span> — хэвлэхэд хуудас солигдох газар. Өөрчлөлт бүр автоматаар хадгалагдана.</div>';
      // Нүүр
      var nTopics = 0; D.chapters.forEach(function (c) { nTopics += c.topics.length; });
      h += '<section class="cover"><div class="cv-in"><div class="cv-top">CYBERMATH · ДАСГАЛЫН ТӨВ</div>'
        + '<img class="cv-bird" src="/assets/chicks/chick-1.svg" alt=""><h1>Дасгалын<br>дэвтэр</h1>'
        + '<div class="cv-grade">' + esc(D.label) + '</div>'
        + '<div class="cv-meta">' + D.chapters.length + ' бүлэг · ' + nTopics + ' сэдэв · ' + nOk + ' ажлын хуудас</div>'
        + '<div class="cv-name"><span>Нэр</span><span>Анги</span></div>'
        + '<div class="cv-f1">a² + b² = c²</div><div class="cv-f2">∫ π √x</div>'
        + '<div class="cv-foot">cyber-math.com/dasgal · ' + D.year + '</div></div></section>';
      // Агуулга (№-ээр — хуудасны дугаар биш, тиймээс зай өөрчлөгдсөн ч зөв хэвээр)
      h += '<section class="toc"><h2>Агуулга</h2>';
      D.chapters.forEach(function (c, ci) {
        var rng = function (ti) {
          var ns = D.list.filter(function (it) { return it.ci === ci && (ti == null || it.ti === ti) && it.snap; }).map(function (it) { return it.n; });
          return ns.length ? '№' + ns[0] + (ns.length > 1 ? '–' + ns[ns.length - 1] : '') : '';
        };
        h += '<div class="toc-ch"><span>' + esc(c.roman || '') + '</span><b>' + esc(c.title) + '</b><i></i><em>' + rng(null) + '</em></div>';
        c.topics.forEach(function (t, ti) { h += '<div class="toc-tp"><span>' + esc(t.num) + '</span>' + esc(t.title) + '<i></i><em>' + rng(ti) + '</em></div>'; });
      });
      h += '</section>';
      // Ажлын хуудсууд
      D.list.forEach(function (it) {
        var c = D.chapters[it.ci], t = c && c.topics[it.ti];
        var where = esc((c && c.roman ? c.roman + ' · ' : '') + (t ? (t.num ? t.num + ' ' : '') + t.title : ''));
        if (!it.snap) { h += '<section class="wsx-err" id="ws-' + it.n + '">№' + it.n + ' ' + esc(it.title) + ' — ачаалж чадсангүй (' + esc(it.err || '') + ')</section>'; return; }
        var s = cfg(it.slug);
        h += '<section class="wsx' + (s.off ? ' off' : '') + '" id="ws-' + it.n + '" data-n="' + it.n + '">'
          + '<div class="wsx-bar"><span class="no">№' + it.n + '</span><span class="nm"><b>' + esc(it.title) + '</b><small>' + where + '</small></span>'
          + '<span class="pgs"></span>'
          + '<span class="ctl">Бодолтын зай <button type="button" data-a="s" data-d="-1">−</button><b class="sv">' + pct(s.s) + '</b><button type="button" data-a="s" data-d="1">+</button></span>'
          + '<label class="inc"><input type="checkbox" data-a="inc"' + (s.off ? '' : ' checked') + '> Номд оруулах</label>'
          + '<span class="sst"></span></div>'
          + '<div class="wsx-paper ' + it.cls + '" style="' + esc(it.snap.root) + '">' + it.snap.html + '</div></section>';
      });
      app.innerHTML = h;
      // Хуудас бүрийн бэлтгэл: хөлд №, даалгаврын гарчгийн хажууд − / +, бодолтын зайнууд
      D.list.forEach(function (it) {
        if (!it.snap) return;
        var sec = document.getElementById('ws-' + it.n), paper = sec.querySelector('.wsx-paper'), sheet = paper.firstElementChild;
        var it2 = { it: it, sec: sec, paper: paper, sheet: sheet, heads: [], boxes: [] };
        var ft = sheet.querySelector('.cm-foot'); if (ft) ft.insertAdjacentHTML('afterbegin', '<b class="wsx-no">№' + it.n + '</b> · ');
        it2.heads = [].slice.call(sheet.querySelectorAll('.task, .sec'));
        it2.boxes = [].slice.call(sheet.querySelectorAll('.wk, .work, .pw, .wgrid'));
        it2.boxes.forEach(function (b) {
          var k = -1; it2.heads.forEach(function (hd, i) { if (hd.compareDocumentPosition(b) & 4) k = i; });
          b.setAttribute('data-g', k);
        });
        it2.heads.forEach(function (hd, i) {
          var has = it2.boxes.some(function (b) { return +b.getAttribute('data-g') === i; });
          if (!has) return;
          if (getComputedStyle(hd).position === 'static') hd.style.position = 'relative';
          hd.insertAdjacentHTML('beforeend', '<span class="wsx-sc" data-g="' + i + '"><button type="button" data-a="g" data-d="-1">−</button><b>100%</b><button type="button" data-a="g" data-d="1">+</button></span>');
        });
        if (!it2.boxes.length) sec.querySelector('.ctl').classList.add('none');
        sec._it = it2; ITEMS.push(it2);
      });
      document.getElementById('prt').onclick = function () { window.print(); };
      document.getElementById('jump').onchange = function () { var e = document.getElementById('ws-' + this.value); if (e) e.scrollIntoView({ behavior: 'smooth', block: 'start' }); this.value = ''; };
      document.getElementById('onlyLong').onchange = function () { onlyLong = this.checked; ITEMS.forEach(function (x) { vis(x); }); };
      app.addEventListener('click', onClick);
      app.addEventListener('change', function (e) {
        var t = e.target; if (!t.matches('[data-a="inc"]')) return;
        var x = t.closest('.wsx')._it, s = cfg(x.it.slug);
        s.off = !t.checked; x.sec.classList.toggle('off', s.off); totals(); save(x);
      });
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
    // Хэвлэхэд хэдэн хуудас: хуваагдахгүй элемент (бодлого, гарчиг…) хуудасны хил давбал бүхэлдээ дараагийн хуудас руу
    function calc(x) {
      if (x.sec.classList.contains('hid')) { x.sec.classList.remove('hid'); x.unhid = true; }   // нуугдсан бол хэмжээ 0 — түр харуулна
      var top0 = x.sheet.getBoundingClientRect().top, start = 0, pages = 1, br = [];
      var els = x.sheet.querySelectorAll('.q, .prob, .task, .sec, .head, .meta, .rule, .cm-foot, tr, .fig, .formulas, .boxes, .guide, .intro, .steps, .case');
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect(); if (!r.height) continue;
        var t = r.top - top0, b = r.bottom - top0;
        while (b > start + PAGE_H + 0.5) {
          if (t > start + 1 && b - t <= PAGE_H) start = t; else start += PAGE_H;
          pages++; br.push(start);
        }
      }
      var total = x.sheet.getBoundingClientRect().height;
      while (total > start + PAGE_H + 0.5) { start += PAGE_H; pages++; br.push(start); }
      return { pages: pages, br: br };
    }
    function paint(x, r) {
      var pages = r.pages, br = r.br;
      x.pages = pages; x.unhid = false;
      [].forEach.call(x.paper.querySelectorAll('.gd'), function (g) { g.remove(); });
      br.forEach(function (y, i) { x.paper.insertAdjacentHTML('beforeend', '<div class="gd" style="top:calc(11mm + ' + Math.round(y) + 'px)"><span>' + (i + 2) + '-р хуудас</span></div>'); });
      var pg = x.sec.querySelector('.pgs');
      pg.textContent = pages + ' хуудас'; pg.className = 'pgs p' + Math.min(pages, 3);
      vis(x);
    }
    function vis(x) { x.sec.classList.toggle('hid', onlyLong && x.pages < 2); }
    function totals() {
      var inc = ITEMS.filter(function (x) { return !cfg(x.it.slug).off; });
      var pages = 0, one = 0, more = 0;
      inc.forEach(function (x) { pages += x.pages || 1; if ((x.pages || 1) > 1) more++; else one++; });
      var toc = document.querySelector('.toc'), tocP = Math.max(1, Math.ceil((toc ? toc.getBoundingClientRect().height - 22 * MM : 0) / PAGE_H));
      document.getElementById('sum').innerHTML = 'Нийт ≈ <b>' + (pages + 1 + tocP) + '</b> хуудас · ' + inc.length + ' ажлын хуудас'
        + ' <span class="s1">1 хуудастай ' + one + '</span> <span class="s2">2+ хуудастай ' + more + '</span>';
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
    '.tb{position:sticky;top:0;z-index:50;display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px;padding:10px 18px;background:#14214a;color:#fff;font-size:14px}',
    '.tb #sum{color:#c4cdea;font-size:13px;margin-right:auto}.tb #sum b{color:#FFC93C;font-size:15px}',
    '.tb .s1,.tb .s2{display:inline-block;margin-left:6px;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:800}.tb .s1{background:rgba(34,197,94,.2);color:#86efac}.tb .s2{background:rgba(245,158,11,.22);color:#fcd34d}',
    '.tb button,.tb select{border:0;border-radius:10px;padding:8px 13px;font-family:inherit;font-weight:800;font-size:13px;cursor:pointer}',
    '.tb #prt{background:#FFC93C;color:#3a2600}.tb select{background:#22305e;color:#fff;max-width:260px}',
    '.tb-g{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px}.tb-g button{background:#22305e;color:#fff;padding:5px 11px}',
    '.tb-f{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;cursor:pointer}',
    '.tip{max-width:210mm;margin:14px auto 0;padding:10px 14px;border-left:3px solid #7B52EE;border-radius:8px;background:#fff;font-size:13px;color:#4b4566}.tip-r{color:#dc2626;font-weight:800}',
    /* нүүр */
    '.cover{page:cover;position:relative;width:210mm;height:297mm;margin:16px auto;overflow:hidden;color:#fff;background:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px) 0 0/8mm 8mm,linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px) 0 0/8mm 8mm,linear-gradient(150deg,#0d1836 0%,#14214a 55%,#1b2d63 100%)}',
    '.cv-in{position:absolute;inset:0;padding:26mm 22mm;display:flex;flex-direction:column}',
    '.cv-in:after{content:"";position:absolute;right:-30mm;top:-30mm;width:120mm;height:120mm;border-radius:50%;background:radial-gradient(circle,rgba(255,193,19,.28),rgba(255,193,19,0) 68%)}',
    '.cv-top{font-size:10pt;font-weight:900;letter-spacing:.24em;color:#FFC93C}',
    '.cv-bird{width:46mm;margin:24mm 0 8mm;filter:drop-shadow(0 6mm 8mm rgba(0,0,0,.35))}',
    '.cover h1{margin:0;font-size:52pt;line-height:1.02;font-weight:900}',
    '.cv-grade{align-self:flex-start;margin-top:9mm;padding:3mm 8mm;border-radius:99px;background:#FFC93C;color:#3a2600;font-size:20pt;font-weight:900}',
    '.cv-meta{margin-top:7mm;font-size:13pt;font-weight:700;color:#c4cdea}',
    '.cv-name{margin-top:auto;display:flex;gap:10mm;font-size:12pt;font-weight:700;color:#dfe5f7}',
    '.cv-name span{flex:1;border-bottom:1.5px solid rgba(255,255,255,.45);padding-bottom:2mm}.cv-name span:last-child{flex:.45}',
    '.cv-foot{margin-top:9mm;font-size:10pt;font-weight:800;color:#8fa0d6;letter-spacing:.05em}',
    ".cv-f1,.cv-f2{position:absolute;font:italic 700 34pt/1 'Cambria Math',Cambria,'Times New Roman',serif;color:rgba(255,255,255,.1);white-space:nowrap}",
    '.cv-f1{right:20mm;top:118mm}.cv-f2{right:34mm;top:48mm;font-size:24pt;color:rgba(255,255,255,.08)}',
    /* агуулга */
    '.toc{break-before:page;width:188mm;margin:16px auto;background:#fff;padding:11mm;box-sizing:content-box}',
    '.toc h2{margin:0 0 6mm;font-size:24pt;font-weight:900;color:#14214a}',
    '.toc-ch,.toc-tp{display:flex;align-items:baseline;gap:3mm}',
    '.toc-ch{margin:4mm 0 1.2mm;font-size:12pt;color:#14214a}.toc-ch span{min-width:9mm;font-weight:900;color:#7B52EE}',
    '.toc-tp{margin:0 0 1mm 9mm;font-size:10.5pt;color:#3d3757}.toc-tp span{min-width:9mm;font-weight:800;color:#8a84a3}',
    '.toc-ch i,.toc-tp i{flex:1;border-bottom:1.5px dotted #cfcae0;transform:translateY(-1mm)}',
    '.toc-ch em,.toc-tp em{font-style:normal;font-weight:900;white-space:nowrap}',
    /* ажлын хуудас */
    '.wsx{break-before:page;width:210mm;margin:16px auto}',
    '.wsx-bar{position:sticky;top:52px;z-index:20;display:flex;align-items:center;flex-wrap:wrap;gap:6px 12px;padding:8px 12px;margin-bottom:8px;border-radius:12px;background:#fff;box-shadow:0 8px 20px -14px rgba(20,33,74,.5);font-size:13px}',
    '.wsx-bar .no{font-weight:900;color:#fff;background:#14214a;border-radius:8px;padding:3px 8px}',
    '.wsx-bar .nm{display:flex;flex-direction:column;min-width:0;flex:1 1 220px}.wsx-bar .nm small{color:#8a84a3;font-weight:700}',
    '.wsx-bar .pgs{font-weight:900;border-radius:99px;padding:3px 10px}.pgs.p1{background:#dcfce7;color:#15803d}.pgs.p2{background:#fef3c7;color:#b45309}.pgs.p3{background:#fee2e2;color:#b91c1c}',
    '.wsx-bar .ctl{display:inline-flex;align-items:center;gap:5px;font-weight:700}.wsx-bar .ctl.none{display:none}',
    '.wsx-bar button{border:1.5px solid #E7E2F7;background:#fff;color:#5B3BD9;border-radius:8px;width:28px;height:26px;font:inherit;font-weight:900;cursor:pointer;line-height:1}',
    '.wsx-bar button:hover{border-color:#5B3BD9}.wsx-bar .sv{min-width:42px;text-align:center}',
    '.wsx-bar .inc{display:inline-flex;align-items:center;gap:5px;font-weight:700;cursor:pointer}',
    '.wsx-bar .sst{font-size:12px;font-weight:800;min-width:96px}.sst.ok{color:#15803d}.sst.busy{color:#8a84a3}.sst.err{color:#b91c1c}',
    '.wsx.off .wsx-paper{opacity:.35}.wsx.hid{display:none}',
    '.wsx-paper{position:relative;width:188mm;padding:11mm;box-sizing:content-box;background:#fff;box-shadow:0 10px 30px -14px rgba(20,33,74,.45)}',
    '.wsx-paper>.sheet{width:auto!important;max-width:none!important;min-height:0!important;margin:0!important;padding:0!important;box-shadow:none!important;border:0!important}',
    '.wsx-paper .gd{position:absolute;left:0;right:0;height:0;border-top:2px dashed #ef4444;z-index:30;pointer-events:none}',
    '.wsx-paper .gd span{position:absolute;right:4px;top:-11px;background:#ef4444;color:#fff;font:800 10px/1 "Segoe UI",Arial,sans-serif;padding:3px 7px;border-radius:99px}',
    '.wsx-paper .wsx-sc{position:absolute;right:0;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;gap:4px;margin:0;padding:2px 4px;border-radius:9px;background:#fff;border:1.5px solid #E7E2F7;font:800 11px/1 "Segoe UI",Arial,sans-serif;color:#5B3BD9;z-index:25}',
    '.wsx-paper .wsx-sc button{width:20px;height:20px;margin:0;padding:0;border:0;border-radius:6px;background:#F1EDFF;color:#5B3BD9;font:900 13px/1 "Segoe UI",Arial,sans-serif;cursor:pointer}',
    '.wsx-paper .wsx-sc b{min-width:34px;text-align:center}',
    '.wsx-err{width:210mm;margin:16px auto;padding:12px 16px;border-radius:12px;background:#fee2e2;color:#b91c1c;font-weight:800;font-size:13px}',
    '.wsx-no{color:#5a32d6}',
    '@media print{body{background:#fff}.tb,.tip,.wsx-bar,.wsx-sc,.gd,.wsx-err{display:none!important}.wsx.off{display:none!important}.wsx.hid{display:block!important}',
    '.cover,.toc,.wsx{margin:0!important;box-shadow:none!important}.toc{padding:0;width:auto}.wsx{width:auto}.wsx-paper{width:auto;padding:0;box-shadow:none}}',
  ].join('');

  window.WSBOOK = { build: build };
})();
