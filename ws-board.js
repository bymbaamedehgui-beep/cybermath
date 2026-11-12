/* ws-board.js — ажлын хуудсыг смарт дэлгэц дээр хуваасан дэлгэцээр: зүүн талд хуудас, баруун талд гараар бичих самбар
   (2026-11-12, эзэмшигч: «смарт дэлгэц дээр гаргаад нэг товч дарахад самбар … гардаг байлгавал», Б хувилбарыг сонгосон).
   - ws-store.js-ийн «Самбар» товч дарахад л ачаална → wsBoard.open() / toggle().
   - Зүүн талын бодлого (.q) дээр дарахад заавартайгаа самбарын дээд хэсэгт томоор гарна; бодлого бүр өөрийн хуудастай, «+» шинэ хуудас.
   - Үзэг (4 өнгө, 2 зузаан), буцаах/дахих, цэвэрлэх, дэвсгэр (тор · шугам · хоосон); хуваагчийг чирж өргөнийг тохируулна.
   - Ухаалаг баллуур (эзэмшигч: «Бүгдийг нь арилгах болон арилгах зүйлээ хүрээлээд арилгах эсвэл харандаа шиг зураад арилгах
     сонголттой … 2 хуруугаар мэдэрдэг. алгаа тавихад баллуур болдог»): баллуурын цэс — зурж арилгах · хүрээлж арилгах ·
     бүгдийг арилгах; хоёр хуруу эсвэл алга тавихад түр баллуур (бичиж байх үед хүрсэн гарыг тоохгүй; цэснээс унтраана).
   - Хэвлэхэд гарахгүй; бичлэг санах ойд (хуудсыг дахин ачаалбал арилна).
   Хөтөч (window.wsBoard) ба Node (module.exports — tests/ws-board.test.js — түүх, хүрээлэх, хоёр хуруу/алганы тооцоо). */
(function (root) {
  'use strict';

  /* ── Хуудасны түүх: зурлага нэмэх, устгах (хүрээлж), цэвэрлэх, буцаах, дахих ── */
  function newPage(q, pin) { return { q: q || null, pin: pin || '', strokes: [], undo: [], redo: [] }; }
  function addStroke(pg, s) { pg.strokes.push(s); pg.undo.push({ t: 'add', s: s }); pg.redo.length = 0; }
  function clearPage(pg) {
    if (!pg.strokes.length) return false;
    pg.undo.push({ t: 'clear', prev: pg.strokes }); pg.strokes = []; pg.redo.length = 0;
    return true;
  }
  // idx — өсөх эрэмбэтэй индексүүд. Буцаахад анхны байранд нь оруулна (баллуурын зурлагатай дараалал хадгалагдана)
  function delStrokes(pg, idx) {
    if (!idx.length) return false;
    var items = idx.map(function (i) { return [i, pg.strokes[i]]; });
    for (var k = idx.length - 1; k >= 0; k--) pg.strokes.splice(idx[k], 1);
    pg.undo.push({ t: 'del', items: items }); pg.redo.length = 0;
    return true;
  }
  function undo(pg) {
    var op = pg.undo.pop(); if (!op) return false;
    if (op.t === 'add') pg.strokes.pop();
    else if (op.t === 'del') op.items.forEach(function (it) { pg.strokes.splice(it[0], 0, it[1]); });
    else pg.strokes = op.prev;
    pg.redo.push(op); return true;
  }
  function redo(pg) {
    var op = pg.redo.pop(); if (!op) return false;
    if (op.t === 'add') pg.strokes.push(op.s);
    else if (op.t === 'del') { for (var k = op.items.length - 1; k >= 0; k--) pg.strokes.splice(op.items[k][0], 1); }
    else { op.prev = pg.strokes; pg.strokes = []; }
    pg.undo.push(op); return true;
  }

  /* ── Хүрээлж арилгах: зурлагын уртын ХАГАСААС ИХ нь хүрээн дотор бол бүхэлд нь арилгана — хүрээг давсан үсгийн сүүл
     үлдэхгүй, харин хажуугаар нь өнгөрсөн урт шугам (тоон шулуун, бодлогыг тойруулсан зураас) хэвээр. Баллуурын зурлагад хүрэхгүй. ── */
  function inPoly(x, y, poly) {
    var a = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) a = !a;
    }
    return a;
  }
  function polyArea(poly) {
    var a = 0;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) a += (poly[j][0] + poly[i][0]) * (poly[j][1] - poly[i][1]);
    return Math.abs(a / 2);
  }
  function insideFrac(s, poly) {
    var p = s.p, tot = 0, ins = 0;
    for (var i = 1; i < p.length; i++) {                     // урт хэрчмийг 6px алхмаар шалгана (нэг цэгээр биш)
      var dx = p[i][0] - p[i - 1][0], dy = p[i][1] - p[i - 1][1], L = Math.hypot(dx, dy), k = Math.max(1, Math.ceil(L / 6));
      for (var j = 0; j < k; j++) {
        var u = (j + 0.5) / k; tot += L / k;
        if (inPoly(p[i - 1][0] + dx * u, p[i - 1][1] + dy * u, poly)) ins += L / k;
      }
    }
    if (tot > 0) return ins / tot;
    return p.length && inPoly(p[0][0], p[0][1], poly) ? 1 : 0;     // цэг
  }
  function eraseLasso(pg, poly) {
    if (!poly || poly.length < 3 || polyArea(poly) < 120) return false;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    poly.forEach(function (q) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); });
    var idx = [];
    pg.strokes.forEach(function (s, i) {
      if (s.er || !s.p.some(function (q) { return q[0] >= x0 && q[0] <= x1 && q[1] >= y0 && q[1] <= y1; })) return;
      if (insideFrac(s, poly) >= 0.5) idx.push(i);
    });
    return delStrokes(pg, idx);
  }

  /* ── Хоёр хуруу / алга: хүрэлтүүдийн төв ба баллуурын радиус (s — хүрэлтийн хэмжээ CSS px, мэдэгдэхгүй бол 0) ── */
  function gestureOf(ts) {
    var n = ts.length, x = 0, y = 0, r = 0;
    ts.forEach(function (t) { x += t.x; y += t.y; }); x /= n; y /= n;
    ts.forEach(function (t) { r = Math.max(r, Math.hypot(t.x - x, t.y - y) + (t.s || 0) / 2); });
    return { x: x, y: y, r: Math.round(Math.max(26, Math.min(150, r + 14))) };
  }
  // Алга: хамгийн жижиг (хурууны) хүрэлтээс 2.6 дахин том, дор хаяж 44px. Зарим самбар хэмжээг өөр нэгжээр өгдөг тул эхний
  // хүрэлт хэзээ ч алга болохгүй (minS = Infinity) — эс тэгвээс хуруу бүр баллуур болж зурах боломжгүй болно.
  function palmAt(minS) { return Math.max(44, minS * 2.6); }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { newPage: newPage, addStroke: addStroke, clearPage: clearPage, delStrokes: delStrokes, undo: undo, redo: redo,
      inPoly: inPoly, polyArea: polyArea, insideFrac: insideFrac, eraseLasso: eraseLasso, gestureOf: gestureOf, palmAt: palmAt };
    return;
  }

  var D = document, W = root;
  var COLORS = [['#1f1d2e', 'Хар'], ['#2563eb', 'Хөх'], ['#dc2626', 'Улаан'], ['#16a34a', 'Ногоон']];
  var SIZES = [3, 7], ERASER = 34, SHEET_W = 793.7;            // 210мм
  var BGS = [['grid', 'Дөрвөлжин тор'], ['lines', 'Шугам'], ['blank', 'Хоосон']];
  // Хоёр дахь хуруу: эхний зурлага 600мс, 30px-ээс бага бол «хоёр хуруу»; 320px-ээс хол бол өөр гар (тоохгүй)
  var EARLY = 600, SHORT = 30, NEAR = 320;
  var st = { on: false, pages: [newPage()], cur: 0, color: COLORS[0][0], size: SIZES[0], eraser: false, erMode: 'draw', gest: true, bg: 0, frac: 0.58, z: null };
  var el = {}, ctx = null, octx = null, dpr = 1, live = null, curZ = 1;
  var tp = {}, dead = {}, minS = Infinity;     // идэвхтэй хүрэлтүүд (id → {x, y, s}), тоохгүй хүрэлтүүд, хамгийн жижиг хүрэлт
  try { var f = parseFloat(localStorage.getItem('cm_wsb_w')); if (f >= 0.35 && f <= 0.75) st.frac = f; } catch (e) {}
  try { if (localStorage.getItem('cm_wsb_er') === 'lasso') st.erMode = 'lasso'; if (localStorage.getItem('cm_wsb_g') === '0') st.gest = false; } catch (e) {}
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  var I = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICO = {
    pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    eraser: I('<path d="M19 20H8.5l-4.2-4.3a1.5 1.5 0 0 1 0-2.1L14 4a1.5 1.5 0 0 1 2.1 0l4.2 4.2a1.5 1.5 0 0 1 0 2.1L11 20"/><path d="M18 13.3 10.7 6"/>'),
    lasso: I('<path d="M7 15.6C3.9 14.2 2.8 11 4.7 8.2 7.4 4.4 14.7 3.5 18.6 6.3c3 2.2 2.2 6-1.9 7.7-2.6 1.1-5.6 1.3-8.3.8" stroke-dasharray="2.6 2.4"/><path d="M8.6 14.9c-1.7.9-2.2 2.7-1 4 1 1.1 2.9.8 3.2-.7"/>'),
    caret: I('<path d="m6 15 6-6 6 6"/>', 14),
    undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    redo: I('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    trash: I('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    grid: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
    lines: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>'),
    blank: I('<rect x="3" y="3" width="18" height="18" rx="2"/>'),
    prev: I('<path d="m15 18-6-6 6-6"/>'), next: I('<path d="m9 18 6-6-6-6"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'), close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  };

  function css() {
    if (D.getElementById('wsb-css')) return;
    var s = D.createElement('style'); s.id = 'wsb-css';
    s.textContent = '@media screen{'
      + 'html.wsb-on body{margin-right:var(--wsb-w,58vw)!important}'
      + 'html.wsb-on .sheet{width:210mm!important;max-width:none!important;margin-left:auto!important;margin-right:auto!important}'
      + 'html.wsb-on #sheet .q{cursor:pointer;border-radius:8px;transition:background .12s,box-shadow .12s}'
      + 'html.wsb-on #sheet .q:hover{background:#F5F1FF;box-shadow:0 0 0 2px #E4DAFF}'
      + 'html.wsb-on #sheet .q.wsb-pinned{background:#F1EBFF;box-shadow:0 0 0 2.5px #7B52EE}'
      + '#wsBoard{position:fixed;top:0;right:0;bottom:0;width:var(--wsb-w,58vw);z-index:95;display:flex;flex-direction:column;background:#fff;'
        + 'border-left:1px solid #E4DAFF;box-shadow:-18px 0 40px -30px rgba(60,30,150,.55);font-family:inherit}'
      + '#wsBoard[hidden]{display:none}'
      + '.wsb-split{position:absolute;left:-9px;top:0;bottom:0;width:18px;cursor:col-resize;touch-action:none;z-index:2}'
      + '.wsb-split::after{content:"";position:absolute;left:7px;top:50%;width:4px;height:64px;margin-top:-32px;border-radius:4px;background:#C9BBF7}'
      + '.wsb-pin{flex:none;max-height:34%;overflow:auto;padding:14px 18px 12px;border-bottom:1px solid #EEE8FF;background:#FBFAFF;font-size:26px;line-height:1.45;color:#1f1d2e}'
      + '.wsb-pin .wsb-task{font-size:.72em;font-weight:800;color:#5a32d6;margin-bottom:6px;border-left:4px solid #A855F7;padding-left:9px}'
      /* Смарт дэлгэцэд ангийн арын ширээнээс харагдахаар: хуудасны жижиг фонтын дүрмийг дарж том (KaTeX нь em-ээр дагана) */
      + '.wsb-pin .wsb-q{font-size:34px}'
      + '.wsb-pin .wsb-q *:not(.katex):not(.katex *){font-size:inherit!important}'
      + '.wsb-pin .wsb-q img,.wsb-pin .wsb-q svg:not(.katex svg){max-height:30vh;max-width:100%;height:auto}'
      + '.wsb-pin .wsb-empty{font-size:16px;font-weight:700;color:#8A84A8;display:flex;align-items:center;gap:10px}'
      + '.wsb-paper{position:relative;flex:1;min-height:0;background-color:#fff}'
      + '.wsb-paper.bg-grid{background-image:linear-gradient(#ECE6FB 1px,transparent 1px),linear-gradient(90deg,#ECE6FB 1px,transparent 1px);background-size:32px 32px}'
      + '.wsb-paper.bg-lines{background-image:linear-gradient(#E4DCFA 1px,transparent 1px);background-size:100% 44px}'
      + '.wsb-paper canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}'
      + '.wsb-paper canvas.wsb-ov{pointer-events:none}'
      + '.wsb-tools{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;border-top:1px solid #EEE8FF;background:#fff}'
      + '.wsb-tools button{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;height:48px;padding:0 10px;'
        + 'border-radius:14px;border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:15px;font-weight:800;cursor:pointer}'
      + '.wsb-tools button:active{transform:translateY(1px)}'
      + '.wsb-tools button.on{background:#F1EBFF;border-color:#7B52EE;color:#4B2BBF}'
      + '.wsb-tools .wsb-c{width:48px;padding:0}'
      + '.wsb-tools .wsb-c i{display:block;width:24px;height:24px;border-radius:50%;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(0,0,0,.12)}'
      + '.wsb-tools .wsb-c.on i{box-shadow:0 0 0 3px #fff,0 0 0 5.5px #7B52EE}'
      + '.wsb-tools .wsb-er{gap:2px;padding:0 6px 0 10px}'
      + '.wsb-tools .wsb-er>svg+svg{opacity:.5}'
      + '.wsb-tools .wsb-sep{width:1px;height:30px;background:#EEE8FF;margin:0 2px}'
      + '.wsb-tools .wsb-n{min-width:64px;text-align:center;font-weight:800;color:#5a32d6;font-size:15px}'
      + '.wsb-tools .wsb-close{margin-left:auto;background:#7B52EE;border-color:#7B52EE;color:#fff}'
      /* Баллуурын цэс (баллуур товчны дээр) */
      + '.wsb-erm{position:absolute;z-index:3;box-sizing:border-box;width:280px;display:flex;flex-direction:column;gap:6px;padding:8px;background:#fff;'
        + 'border:1px solid #E4DAFF;border-radius:18px;box-shadow:0 18px 44px -18px rgba(60,30,150,.55)}'
      + '.wsb-erm[hidden]{display:none}'
      + '.wsb-erm button{box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;height:54px;padding:0 14px;border-radius:13px;'
        + 'border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:16px;font-weight:800;cursor:pointer;text-align:left}'
      + '.wsb-erm button.on{background:#F1EBFF;border-color:#7B52EE;color:#4B2BBF}'
      + '.wsb-erm button:disabled{opacity:.45;cursor:default}'
      + '.wsb-erm .wsb-erm-all{color:#B42318}'
      + '.wsb-erm label{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 8px 2px;margin-top:2px;border-top:1px solid #F0EBFF;'
        + 'font-size:14px;font-weight:800;color:#4b3f7a;cursor:pointer;line-height:1.3}'
      + '.wsb-erm label input{flex:none;width:22px;height:22px;margin:0;accent-color:#7B52EE}'
      + '.wsb-erm label small{display:block;font-size:12px;font-weight:700;color:#8A84A8}'
      /* Ажлын хуудасны томруулалт (зүүн доод булан); хөтчийн чимхэж томруулахыг хааж, зөвхөн хуудсанд */
      + 'html.wsb-on,html.wsb-on body{touch-action:pan-x pan-y}'
      + '#wsbZoom{display:none}'
      + 'html.wsb-on #wsbZoom{position:fixed;left:14px;bottom:14px;z-index:96;display:flex;align-items:center;gap:6px;padding:6px;background:rgba(255,255,255,.96);'
        + 'border:1px solid #E4DAFF;border-radius:18px;box-shadow:0 14px 34px -18px rgba(60,30,150,.55);font-family:inherit}'
      + '#wsbZoom button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;height:48px;padding:0 10px;border-radius:13px;'
        + 'border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:15px;font-weight:800;cursor:pointer}'
      + '#wsbZoom button:active{transform:translateY(1px)}'
      + '#wsbZoom .wsbz-l{min-width:58px;text-align:center;font-weight:800;color:#5a32d6;font-size:15px}'
      + '}'
      + '@media print{#wsBoard{display:none!important}html.wsb-on body{margin-right:0!important}html.wsb-on .sheet{zoom:1!important}}';
    D.head.appendChild(s);
  }

  function build() {
    if (el.box) return;
    css();
    var b = D.createElement('div'); b.id = 'wsBoard'; b.hidden = true; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Самбар');
    var tools = '';
    COLORS.forEach(function (c, i) { tools += '<button type="button" class="wsb-c" data-c="' + i + '" title="' + c[1] + ' үзэг" aria-label="' + c[1] + ' үзэг"><i style="background:' + c[0] + '"></i></button>'; });
    tools += '<button type="button" class="wsb-sz" title="Үзэгний зузаан">' + ICO.pen + '<span>Нарийн</span></button>'
      + '<button type="button" class="wsb-er" title="Баллуур" aria-label="Баллуур" aria-haspopup="menu" aria-expanded="false"></button>'
      + '<span class="wsb-sep"></span>'
      + '<button type="button" class="wsb-undo" title="Буцаах (Ctrl+Z)" aria-label="Буцаах">' + ICO.undo + '</button>'
      + '<button type="button" class="wsb-redo" title="Дахих (Ctrl+Y)" aria-label="Дахих">' + ICO.redo + '</button>'
      + '<button type="button" class="wsb-clear" title="Энэ хуудсыг цэвэрлэх" aria-label="Цэвэрлэх">' + ICO.trash + '</button>'
      + '<button type="button" class="wsb-bg" title="Дэвсгэр"></button>'
      + '<span class="wsb-sep"></span>'
      + '<button type="button" class="wsb-prev" title="Өмнөх хуудас" aria-label="Өмнөх хуудас">' + ICO.prev + '</button>'
      + '<span class="wsb-n"></span>'
      + '<button type="button" class="wsb-next" title="Дараагийн хуудас" aria-label="Дараагийн хуудас">' + ICO.next + '</button>'
      + '<button type="button" class="wsb-add" title="Шинэ хоосон хуудас" aria-label="Шинэ хуудас">' + ICO.plus + '</button>'
      + '<button type="button" class="wsb-close" title="Самбарыг хаах (Esc)">' + ICO.close + '<span>Хаах</span></button>';
    var erm = '<div class="wsb-erm" role="menu" aria-label="Баллуур" hidden>'
      + '<button type="button" data-er="draw" role="menuitemradio">' + ICO.eraser + 'Зурж арилгах</button>'
      + '<button type="button" data-er="lasso" role="menuitemradio">' + ICO.lasso + 'Хүрээлж арилгах</button>'
      + '<button type="button" data-er="all" role="menuitem" class="wsb-erm-all">' + ICO.trash + 'Бүгдийг арилгах</button>'
      + '<label><input type="checkbox"><span>Хоёр хуруу, алгаар арчих<small>Бичиж байх үед гар хүрвэл тооцохгүй</small></span></label>'
      + '</div>';
    b.innerHTML = '<div class="wsb-split" title="Чирж өргөнийг тохируулна" aria-hidden="true"></div><div class="wsb-pin"></div>'
      + '<div class="wsb-paper"><canvas></canvas><canvas class="wsb-ov" aria-hidden="true"></canvas></div><div class="wsb-tools">' + tools + '</div>' + erm;
    D.body.appendChild(b);
    el = { box: b, pin: b.querySelector('.wsb-pin'), paper: b.querySelector('.wsb-paper'), cv: b.querySelector('canvas'), ov: b.querySelector('.wsb-ov'),
      tools: b.querySelector('.wsb-tools'), split: b.querySelector('.wsb-split'), erm: b.querySelector('.wsb-erm') };
    ctx = el.cv.getContext('2d'); octx = el.ov.getContext('2d');
    el.tools.addEventListener('click', onTool);
    el.erm.addEventListener('click', onErMenu);
    el.erm.querySelector('input').addEventListener('change', function (e) { st.gest = e.target.checked; save('cm_wsb_g', st.gest ? '1' : '0'); });
    D.addEventListener('pointerdown', function (e) { if (!el.erm.hidden && !(e.target.closest && e.target.closest('.wsb-erm,.wsb-er'))) menu(false); }, true);
    bindDraw(); bindSplit(); bindZoom();
    if (W.ResizeObserver) new ResizeObserver(fit).observe(el.paper); else W.addEventListener('resize', fit);
    W.addEventListener('resize', zoomSheet);
    D.addEventListener('click', onSheetClick, true);
    D.addEventListener('keydown', onKey);
  }

  /* ── Зурах ── */
  function page() { return st.pages[st.cur]; }
  function fit() {
    if (!st.on) return;
    var r = el.paper.getBoundingClientRect(); dpr = W.devicePixelRatio || 1;
    el.cv.width = el.ov.width = Math.max(1, Math.round(r.width * dpr)); el.cv.height = el.ov.height = Math.max(1, Math.round(r.height * dpr));
    render(); ov();
  }
  function stroke(c, s, from) {
    var p = s.p; if (!p.length) return;
    c.save();
    c.globalCompositeOperation = s.er ? 'destination-out' : 'source-over';
    c.strokeStyle = c.fillStyle = s.er ? '#000' : s.c; c.lineWidth = s.w; c.lineCap = 'round'; c.lineJoin = 'round';
    if (p.length === 1) { c.beginPath(); c.arc(p[0][0], p[0][1], s.w / 2, 0, Math.PI * 2); c.fill(); c.restore(); return; }
    var i0 = Math.max(1, from || 1);
    c.beginPath();
    if (i0 === 1) c.moveTo(p[0][0], p[0][1]); else c.moveTo((p[i0 - 1][0] + p[i0][0]) / 2, (p[i0 - 1][1] + p[i0][1]) / 2);
    for (var i = i0; i < p.length - 1; i++) c.quadraticCurveTo(p[i][0], p[i][1], (p[i][0] + p[i + 1][0]) / 2, (p[i][1] + p[i + 1][1]) / 2);
    if (from == null) c.lineTo(p[p.length - 1][0], p[p.length - 1][1]);
    c.stroke(); c.restore();
  }
  // Хоёр хуруу / алганы баллуур: цэг бүр [x, y, радиус]; null — хуруу нэмэгдэх/хасагдахад тасарна (төв үсрэхэд зурвас үлдээхгүй)
  function stamp(c, s, from) {
    c.save(); c.globalCompositeOperation = 'destination-out'; c.strokeStyle = c.fillStyle = '#000'; c.lineCap = 'round';
    for (var i = from || 0; i < s.p.length; i++) {
      var a = s.p[i], b = s.p[i - 1]; if (!a) continue;
      if (b) { c.lineWidth = Math.max(a[2], b[2]) * 2; c.beginPath(); c.moveTo(b[0], b[1]); c.lineTo(a[0], a[1]); c.stroke(); }
      else { c.beginPath(); c.arc(a[0], a[1], a[2], 0, Math.PI * 2); c.fill(); }
    }
    c.restore();
  }
  function draw(c, s, from) { if (s.g) stamp(c, s, from); else stroke(c, s, from); }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, el.cv.width, el.cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    page().strokes.forEach(function (s) { draw(ctx, s); });
    if (live && live.s) draw(ctx, live.s);
  }
  // Түр давхарга: хүрээлэх зам (тасархай), баллуурын хүрээ
  function ov(ring) {
    if (!octx) return;
    var c = octx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, el.ov.width, el.ov.height); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (live && live.kind === 'lasso' && live.lasso.length > 1) {
      c.save(); c.setLineDash([9, 7]); c.lineWidth = 2.5; c.lineJoin = 'round'; c.strokeStyle = '#7B52EE'; c.fillStyle = 'rgba(123,82,238,.08)';
      c.beginPath(); live.lasso.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    if (ring) {
      c.save(); c.lineWidth = 2; c.strokeStyle = '#7B52EE'; c.fillStyle = 'rgba(123,82,238,.10)';
      c.beginPath(); c.arc(ring[0], ring[1], ring[2], 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
    }
  }
  function pt(e) { var r = el.cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10]; }

  /* ── Нэг хуруу / үзэг / хулгана — сонгосон хэрэгсэл. Хоёр хуруу эсвэл алга — түр баллуур (суллахад өмнөх хэрэгсэлдээ).
     Бичиж байх үед (зурлага 600мс эсвэл 30px-ээс давсан) хүрсэн гарыг алга тавьсан гэж үзээд тоохгүй. ── */
  function fresh() { return live.touch && Date.now() - live.t0 < EARLY && live.len < SHORT; }
  function near(a, b) { var p = tp[a], q = tp[b]; return !p || !q || Math.hypot(p.x - q.x, p.y - q.y) < NEAR; }
  function begin(e, p) {
    var penEr = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) > 0);    // үзэгний ар талын баллуур
    var L = { id: e.pointerId, t0: Date.now(), len: 0, touch: e.pointerType === 'touch' };
    if (st.eraser && st.erMode === 'lasso' && !penEr) { L.kind = 'lasso'; L.lasso = [p]; live = L; ov(); return; }
    var er = penEr || st.eraser;
    L.kind = 'ink'; L.s = { c: st.color, w: er ? ERASER : st.size, er: er, p: [p] }; live = L;
    stroke(ctx, L.s); if (er) ov([p[0], p[1], ERASER / 2]);
  }
  function gStart() { live = { kind: 'g', s: { er: true, g: 1, w: 0, p: [] } }; gStep(false); }
  function gStep(cut) {
    var ts = Object.keys(tp).map(function (k) { return tp[k]; }); if (!ts.length) return;
    var g = gestureOf(ts), s = live.s, last = s.p[s.p.length - 1];
    if (cut && last) { s.p.push(null); last = null; }
    if (last && Math.hypot(last[0] - g.x, last[1] - g.y) < 1.5 && Math.abs(last[2] - g.r) < 2) { ov([g.x, g.y, g.r]); return; }
    s.p.push([Math.round(g.x * 10) / 10, Math.round(g.y * 10) / 10, g.r]);
    stamp(ctx, s, s.p.length - 1);
    ov([g.x, g.y, g.r]);
  }
  function bindDraw() {
    var cv = el.cv;
    cv.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      var p = pt(e), touch = e.pointerType === 'touch', sz = Math.max(e.width || 0, e.height || 0);
      if (sz <= 2) sz = 0;                                                           // хэмжээ мэдэгдэхгүй
      if (touch) tp[e.pointerId] = { x: p[0], y: p[1], s: sz };
      if (live && live.kind === 'g') { if (touch) gStep(true); else dead[e.pointerId] = 1; return; }    // алга/хоёр хурууны баллуурт нэмэгдэв
      if (live) {
        if (touch && st.gest && fresh() && near(live.id, e.pointerId)) { live = null; render(); gStart(); return; }   // дөнгөж эхэлсэн зурлага → хоёр хуруу
        delete tp[e.pointerId]; dead[e.pointerId] = 1; return;                       // бичиж байхад хүрсэн гар (алга) — тоохгүй
      }
      if (touch && st.gest && sz && sz >= palmAt(minS)) { gStart(); return; }        // алга
      if (touch && sz) minS = Math.min(minS, sz);
      begin(e, p);
    });
    cv.addEventListener('pointermove', function (e) {
      var id = e.pointerId, t = tp[id]; if (dead[id]) return;
      if (t) { var q = pt(e), sz = Math.max(e.width || 0, e.height || 0); t.x = q[0]; t.y = q[1]; if (sz > 2) t.s = sz; }
      if (!live) return;
      if (live.kind === 'g') { if (t) { e.preventDefault(); gStep(false); } return; }
      if (id !== live.id) return;
      e.preventDefault();
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs = [e];
      if (live.kind === 'lasso') {
        evs.forEach(function (ev) {
          var q = pt(ev), l = live.lasso[live.lasso.length - 1], d = Math.hypot(q[0] - l[0], q[1] - l[1]);
          if (d >= 2) { live.lasso.push(q); live.len += d; }
        });
        ov(); return;
      }
      var s = live.s, n0 = s.p.length;
      evs.forEach(function (ev) { var q = pt(ev), l = s.p[s.p.length - 1]; live.len += Math.hypot(q[0] - l[0], q[1] - l[1]); s.p.push(q); });
      stroke(ctx, s, Math.max(1, n0 - 1));
      if (s.er) { var z = s.p[s.p.length - 1]; ov([z[0], z[1], s.w / 2]); }
    });
    var end = function (e) {
      var id = e.pointerId;
      delete tp[id];
      if (dead[id]) { delete dead[id]; return; }
      if (!live) return;
      if (live.kind === 'g') {
        if (Object.keys(tp).length) { gStep(true); return; }                         // үлдсэн хуруугаар үргэлжилнэ
        var g = live.s; live = null; ov();
        if (g.p.some(Boolean)) addStroke(page(), g);
        render(); sync(); return;
      }
      if (id !== live.id) return;
      var L = live; live = null; ov();
      if (L.kind === 'lasso') { if (eraseLasso(page(), L.lasso)) render(); sync(); return; }
      addStroke(page(), L.s); render(); sync();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  /* ── Хэрэгслүүд ── */
  function onTool(e) {
    var b = e.target.closest('button'); if (!b) return;
    var pg = page();
    if (b.classList.contains('wsb-c')) { st.color = COLORS[+b.getAttribute('data-c')][0]; st.eraser = false; menu(false); }
    else if (b.classList.contains('wsb-sz')) { st.size = st.size === SIZES[0] ? SIZES[1] : SIZES[0]; st.eraser = false; menu(false); }
    else if (b.classList.contains('wsb-er')) { if (!st.eraser) { st.eraser = true; menu(true); } else menu(el.erm.hidden); }   // эхний дарахад баллуур + цэс
    else if (b.classList.contains('wsb-undo')) { undo(pg); render(); }
    else if (b.classList.contains('wsb-redo')) { redo(pg); render(); }
    else if (b.classList.contains('wsb-clear')) { if (clearPage(pg)) render(); }
    else if (b.classList.contains('wsb-bg')) st.bg = (st.bg + 1) % BGS.length;
    else if (b.classList.contains('wsb-prev')) go(st.cur - 1);
    else if (b.classList.contains('wsb-next')) go(st.cur + 1);
    else if (b.classList.contains('wsb-add')) { st.pages.push(newPage()); go(st.pages.length - 1); }
    else if (b.classList.contains('wsb-close')) { close(); return; }
    sync();
  }
  function onErMenu(e) {
    var b = e.target.closest('button'); if (!b || b.disabled) return;
    var k = b.getAttribute('data-er');
    if (k === 'all') { if (clearPage(page())) render(); st.eraser = false; }        // бүгдийг арилгаад үзэг рүү (буцаах боломжтой)
    else { st.erMode = k; st.eraser = true; save('cm_wsb_er', k); }
    menu(false); sync();
  }
  function menu(show) {
    var er = el.tools.querySelector('.wsb-er');
    if (show) {
      var r = er.getBoundingClientRect(), R = el.box.getBoundingClientRect();
      el.erm.style.left = Math.round(Math.max(8, Math.min(R.width - 288, r.left - R.left))) + 'px';
      el.erm.style.bottom = Math.round(R.bottom - r.top + 8) + 'px';
    }
    el.erm.hidden = !show; er.setAttribute('aria-expanded', String(!!show));
  }
  function sync() {
    var pg = page(), t = el.tools, lasso = st.erMode === 'lasso';
    [].forEach.call(t.querySelectorAll('.wsb-c'), function (b) { b.classList.toggle('on', !st.eraser && COLORS[+b.getAttribute('data-c')][0] === st.color); });
    t.querySelector('.wsb-sz span').textContent = st.size === SIZES[0] ? 'Нарийн' : 'Бүдүүн';
    t.querySelector('.wsb-sz').classList.toggle('on', st.size !== SIZES[0] && !st.eraser);
    var er = t.querySelector('.wsb-er');
    er.innerHTML = (lasso ? ICO.lasso : ICO.eraser) + ICO.caret;
    er.title = 'Баллуур: ' + (lasso ? 'хүрээлж арилгах' : 'зурж арилгах');
    er.classList.toggle('on', st.eraser);
    [].forEach.call(el.erm.querySelectorAll('[data-er]'), function (b) {
      var k = b.getAttribute('data-er');
      if (k === 'all') { b.disabled = !pg.strokes.length; return; }
      b.classList.toggle('on', st.eraser && st.erMode === k); b.setAttribute('aria-checked', String(st.eraser && st.erMode === k));
    });
    el.erm.querySelector('input').checked = st.gest;
    t.querySelector('.wsb-undo').disabled = !pg.undo.length;
    t.querySelector('.wsb-redo').disabled = !pg.redo.length;
    t.querySelector('.wsb-clear').disabled = !pg.strokes.length;
    var bg = BGS[st.bg];
    t.querySelector('.wsb-bg').innerHTML = ICO[bg[0]] + '<span>' + bg[1] + '</span>';
    el.paper.className = 'wsb-paper bg-' + bg[0];
    t.querySelector('.wsb-n').textContent = (st.cur + 1) + ' / ' + st.pages.length;
    t.querySelector('.wsb-prev').disabled = st.cur === 0;
    t.querySelector('.wsb-next').disabled = st.cur === st.pages.length - 1;
    el.cv.style.cursor = st.eraser && !lasso ? 'cell' : 'crosshair';
  }
  function go(i) {
    st.cur = Math.max(0, Math.min(st.pages.length - 1, i));
    var pg = page();
    el.pin.innerHTML = pg.pin || '<div class="wsb-empty">' + I('<path d="M15 4.5 19.5 9M4 20l5.5-1.5L19 9l-4.5-4.5L5 14z"/>', 20) + 'Зүүн талын бодлого дээр дарахад энд томоор гарна</div>';
    [].forEach.call(D.querySelectorAll('#sheet .q.wsb-pinned'), function (q) { q.classList.remove('wsb-pinned'); });
    if (pg.q && D.contains(pg.q)) pg.q.classList.add('wsb-pinned');
    render(); sync();
  }

  /* ── Бодлогыг самбарт гаргах ── */
  function clean(n) {
    var c = n.cloneNode(true);
    [].forEach.call(c.querySelectorAll('.wk,.work,.wsc-row,.cm-del,button,input,select,script,.ws-vid'), function (x) { x.parentNode.removeChild(x); });   // .wk/.work — бодолтын зай (990 / 138 хуудас)
    [].forEach.call(c.querySelectorAll('[id]'), function (x) { x.removeAttribute('id'); });
    [].forEach.call(c.querySelectorAll('[contenteditable]'), function (x) { x.removeAttribute('contenteditable'); });
    c.removeAttribute('id'); c.classList.remove('wsb-pinned');
    return c.innerHTML;
  }
  function taskOf(q) {
    var sh = D.getElementById('sheet'), n = q;
    while (n && n.parentNode !== sh && n.parentNode) n = n.parentNode;
    for (var p = n; p; p = p.previousElementSibling) { if (p.classList && p.classList.contains('task')) return p; }
    return null;
  }
  function pin(q) {
    for (var i = 0; i < st.pages.length; i++) if (st.pages[i].q === q) return go(i);
    var t = taskOf(q);
    var html = (t ? '<div class="wsb-task">' + clean(t) + '</div>' : '') + '<div class="wsb-q">' + clean(q) + '</div>';
    var pg = page();
    if (!pg.q && !pg.strokes.length && !pg.undo.length) { pg.q = q; pg.pin = html; return go(st.cur); }   // хоосон хуудсыг ашиглана
    st.pages.push(newPage(q, html)); go(st.pages.length - 1);
  }
  function onSheetClick(e) {
    if (!st.on) return;
    var q = e.target.closest && e.target.closest('#sheet .q'); if (!q) return;
    if (e.target.closest('button,a,input,select,label,[contenteditable="true"]')) return;
    e.preventDefault(); e.stopPropagation(); pin(q);
  }
  function onKey(e) {
    if (!st.on) return;
    if (e.key === 'Escape' && !el.erm.hidden) { menu(false); return; }          // цэсний сонголт (checkbox) дээр байсан ч
    var tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape') { close(); return; }
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(page()); else undo(page()); render(); sync(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(page()); render(); sync(); }
    // Хөтчийн томруулалтын товчлолыг зөвхөн ажлын хуудсанд
    else if ((e.ctrlKey || e.metaKey) && (k === '=' || k === '+' || e.code === 'NumpadAdd')) { e.preventDefault(); setZ(curZ * 1.2); }
    else if ((e.ctrlKey || e.metaKey) && (k === '-' || e.code === 'NumpadSubtract')) { e.preventDefault(); setZ(curZ / 1.2); }
    else if ((e.ctrlKey || e.metaKey) && (k === '0' || e.code === 'Numpad0')) { e.preventDefault(); st.z = null; zoomSheet({ x: paneW() / 2, y: W.innerHeight / 2 }); }
  }

  /* ── Хуваах шугам, хуудасны томруулалт ──
     Самбартай үед зөвхөн ажлын хуудас (.sheet) томорно — «− % + Багтаах», Ctrl+дугуй, Ctrl +/−/0, хоёр хуруугаар чимхэх.
     Хөтчийн томруулалтыг (самбар, товчлуурын мөр хамт томордог) энэ үед хаана. st.z = null бол зүүн талдаа багтаана. */
  function setW() { D.documentElement.style.setProperty('--wsb-w', Math.round(st.frac * 1000) / 10 + 'vw'); zoomSheet(); }
  function paneW() { return W.innerWidth * (1 - st.frac); }
  function fitZ() { return Math.max(0.35, Math.min(1.4, (paneW() - 28) / SHEET_W)); }
  function zoomSheet(keep) {
    if (!st.on) return;
    var sh = D.getElementById('sheet') || D.querySelector('.sheet'), z = st.z || fitZ(), u = 0, v = 0, r0;
    if (keep && sh) { r0 = sh.getBoundingClientRect(); u = (keep.x - r0.left) / curZ; v = (keep.y - r0.top) / curZ; }
    [].forEach.call(D.querySelectorAll('.sheet'), function (s) { s.style.zoom = String(Math.round(z * 1000) / 1000); });
    curZ = z;
    spacer();
    if (keep && sh) { var r1 = sh.getBoundingClientRect(); W.scrollBy(r1.left + u * z - keep.x, r1.top + v * z - keep.y); }
    if (el.zl) el.zl.textContent = Math.round(z * 100) + '%';
  }
  function setZ(z, keep) {
    st.z = Math.max(0.4, Math.min(3, z));
    if (Math.abs(st.z - fitZ()) < 0.02) st.z = null;               // багтаасан хэмжээнд ойртвол автомат багтаалт руу
    zoomSheet(keep || { x: paneW() / 2, y: W.innerHeight / 2 });
  }
  // Томруулсан хуудасны баруун хэсэг самбарын доор нуугдахгүй — гүйлгэх мужийг самбарын өргөнөөр сунгана
  function spacer() {
    var sp = D.getElementById('wsbSpacer');
    if (!sp) { sp = D.createElement('div'); sp.id = 'wsbSpacer'; sp.setAttribute('aria-hidden', 'true'); sp.style.cssText = 'position:absolute;top:0;width:1px;height:1px;pointer-events:none;visibility:hidden'; D.body.appendChild(sp); }
    var right = 0;
    [].forEach.call(D.querySelectorAll('.sheet'), function (s) { right = Math.max(right, s.getBoundingClientRect().right + W.scrollX); });
    sp.style.left = Math.max(0, Math.round(right + (W.innerWidth - paneW()) + 6)) + 'px';
  }
  function bindZoom() {
    var zb = D.createElement('div'); zb.id = 'wsbZoom'; zb.setAttribute('role', 'group'); zb.setAttribute('aria-label', 'Ажлын хуудсыг томруулах');
    zb.innerHTML = '<button type="button" data-z="-" aria-label="Жижигрүүлэх" title="Жижигрүүлэх (Ctrl −)">' + I('<path d="M5 12h14"/>') + '</button>'
      + '<span class="wsbz-l">100%</span>'
      + '<button type="button" data-z="+" aria-label="Томруулах" title="Томруулах (Ctrl +)">' + I('<path d="M12 5v14M5 12h14"/>') + '</button>'
      + '<button type="button" data-z="0" class="wsbz-fit" title="Зүүн талдаа багтаах (Ctrl 0)">' + I('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', 20) + '<span>Багтаах</span></button>';
    D.body.appendChild(zb);
    el.zl = zb.querySelector('.wsbz-l');
    zb.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-z');
      if (k === '0') { st.z = null; zoomSheet({ x: paneW() / 2, y: W.innerHeight / 2 }); }
      else setZ(curZ * (k === '+' ? 1.2 : 1 / 1.2));
    });
    // Ctrl + хулганы дугуй / тачпадын чимхэлт (Chrome-д ctrlKey-тэй wheel болж ирдэг)
    W.addEventListener('wheel', function (e) {
      if (!st.on || !e.ctrlKey) return;
      e.preventDefault();
      if (e.clientX < paneW()) setZ(curZ * Math.exp(-e.deltaY * 0.0025), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    // Хоёр хуруугаар чимхэх (смарт самбар) — зүүн талд л
    var pin0 = null;
    var dist = function (t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); };
    D.addEventListener('touchstart', function (e) {
      if (!st.on || e.touches.length !== 2) return;
      if (e.touches[0].clientX >= paneW() || e.touches[1].clientX >= paneW()) return;
      pin0 = { d: dist(e.touches), z: curZ };
    }, { passive: true });
    D.addEventListener('touchmove', function (e) {
      if (!pin0 || e.touches.length !== 2) return;
      e.preventDefault();
      var t = e.touches, mid = { x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 };
      setZ(pin0.z * dist(t) / Math.max(1, pin0.d), mid);
    }, { passive: false });
    D.addEventListener('touchend', function (e) { if (e.touches.length < 2) pin0 = null; }, { passive: true });
  }
  function bindSplit() {
    var drag = null;
    el.split.addEventListener('pointerdown', function (e) { e.preventDefault(); drag = e.pointerId; try { el.split.setPointerCapture(e.pointerId); } catch (x) {} });
    el.split.addEventListener('pointermove', function (e) {
      if (drag !== e.pointerId) return;
      st.frac = Math.max(0.35, Math.min(0.75, 1 - e.clientX / W.innerWidth)); setW();
    });
    var up = function (e) { if (drag !== e.pointerId) return; drag = null; try { localStorage.setItem('cm_wsb_w', String(st.frac)); } catch (x) {} };
    el.split.addEventListener('pointerup', up); el.split.addEventListener('pointercancel', up);
  }

  function open() {
    build(); st.on = true;
    D.documentElement.classList.add('wsb-on'); el.box.hidden = false;
    setW(); fit(); go(st.cur);
  }
  function close() {
    if (!st.on) return;
    st.on = false; live = null; tp = {}; dead = {};
    menu(false); ov();
    D.documentElement.classList.remove('wsb-on'); el.box.hidden = true;
    [].forEach.call(D.querySelectorAll('.sheet'), function (s) { s.style.zoom = ''; });
    var sp = D.getElementById('wsbSpacer'); if (sp) sp.parentNode.removeChild(sp);
    [].forEach.call(D.querySelectorAll('#sheet .q.wsb-pinned'), function (q) { q.classList.remove('wsb-pinned'); });
  }
  root.wsBoard = { open: open, close: close, toggle: function () { if (st.on) close(); else open(); }, isOpen: function () { return st.on; }, _st: st };
})(typeof window !== 'undefined' ? window : globalThis);
