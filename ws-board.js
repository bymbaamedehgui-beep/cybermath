/* ws-board.js — ажлын хуудсыг смарт дэлгэц дээр хуваасан дэлгэцээр: зүүн талд хуудас, баруун талд гараар бичих самбар
   (2026-11-12, эзэмшигч: «смарт дэлгэц дээр гаргаад нэг товч дарахад самбар … гардаг байлгавал», Б хувилбарыг сонгосон).
   - ws-store.js-ийн «Самбар» товч дарахад л ачаална → wsBoard.open() / toggle().
   - Зүүн талын бодлого (.q) дээр дарахад заавартайгаа самбарын дээд хэсэгт томоор гарна; бодлого бүр өөрийн хуудастай, «+» шинэ хуудас.
   - Үзэг (4 өнгө, 2 зузаан), баллуур, буцаах/дахих, цэвэрлэх, дэвсгэр (тор · шугам · хоосон); хуваагчийг чирж өргөнийг тохируулна.
   - Хэвлэхэд гарахгүй; бичлэг санах ойд (хуудсыг дахин ачаалбал арилна).
   Хөтөч (window.wsBoard) ба Node (module.exports — tests/ws-board.test.js — зөвхөн түүхийн логик). */
(function (root) {
  'use strict';

  /* ── Хуудасны түүх: зурлага нэмэх, цэвэрлэх, буцаах, дахих ── */
  function newPage(q, pin) { return { q: q || null, pin: pin || '', strokes: [], undo: [], redo: [] }; }
  function addStroke(pg, s) { pg.strokes.push(s); pg.undo.push({ t: 'add', s: s }); pg.redo.length = 0; }
  function clearPage(pg) {
    if (!pg.strokes.length) return false;
    pg.undo.push({ t: 'clear', prev: pg.strokes }); pg.strokes = []; pg.redo.length = 0;
    return true;
  }
  function undo(pg) {
    var op = pg.undo.pop(); if (!op) return false;
    if (op.t === 'add') pg.strokes.pop(); else pg.strokes = op.prev;
    pg.redo.push(op); return true;
  }
  function redo(pg) {
    var op = pg.redo.pop(); if (!op) return false;
    if (op.t === 'add') pg.strokes.push(op.s); else { op.prev = pg.strokes; pg.strokes = []; }
    pg.undo.push(op); return true;
  }
  if (typeof module !== 'undefined' && module.exports) { module.exports = { newPage: newPage, addStroke: addStroke, clearPage: clearPage, undo: undo, redo: redo }; return; }

  var D = document, W = root;
  var COLORS = [['#1f1d2e', 'Хар'], ['#2563eb', 'Хөх'], ['#dc2626', 'Улаан'], ['#16a34a', 'Ногоон']];
  var SIZES = [3, 7], ERASER = 34, SHEET_W = 793.7;            // 210мм
  var BGS = [['grid', 'Дөрвөлжин тор'], ['lines', 'Шугам'], ['blank', 'Хоосон']];
  var st = { on: false, pages: [newPage()], cur: 0, color: COLORS[0][0], size: SIZES[0], eraser: false, bg: 0, frac: 0.58, z: null };
  var el = {}, ctx = null, dpr = 1, live = null, curZ = 1;
  try { var f = parseFloat(localStorage.getItem('cm_wsb_w')); if (f >= 0.35 && f <= 0.75) st.frac = f; } catch (e) {}

  var I = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var ICO = {
    pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    eraser: I('<path d="M19 20H8.5l-4.2-4.3a1.5 1.5 0 0 1 0-2.1L14 4a1.5 1.5 0 0 1 2.1 0l4.2 4.2a1.5 1.5 0 0 1 0 2.1L11 20"/><path d="M18 13.3 10.7 6"/>'),
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
      + '.wsb-tools{flex:none;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 10px;border-top:1px solid #EEE8FF;background:#fff}'
      + '.wsb-tools button{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;height:48px;padding:0 10px;'
        + 'border-radius:14px;border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:15px;font-weight:800;cursor:pointer}'
      + '.wsb-tools button:active{transform:translateY(1px)}'
      + '.wsb-tools button.on{background:#F1EBFF;border-color:#7B52EE;color:#4B2BBF}'
      + '.wsb-tools .wsb-c{width:48px;padding:0}'
      + '.wsb-tools .wsb-c i{display:block;width:24px;height:24px;border-radius:50%;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(0,0,0,.12)}'
      + '.wsb-tools .wsb-c.on i{box-shadow:0 0 0 3px #fff,0 0 0 5.5px #7B52EE}'
      + '.wsb-tools .wsb-sep{width:1px;height:30px;background:#EEE8FF;margin:0 2px}'
      + '.wsb-tools .wsb-n{min-width:64px;text-align:center;font-weight:800;color:#5a32d6;font-size:15px}'
      + '.wsb-tools .wsb-close{margin-left:auto;background:#7B52EE;border-color:#7B52EE;color:#fff}'
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
      + '<button type="button" class="wsb-er" title="Баллуур">' + ICO.eraser + '</button>'
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
    b.innerHTML = '<div class="wsb-split" title="Чирж өргөнийг тохируулна" aria-hidden="true"></div><div class="wsb-pin"></div>'
      + '<div class="wsb-paper"><canvas></canvas></div><div class="wsb-tools">' + tools + '</div>';
    D.body.appendChild(b);
    el = { box: b, pin: b.querySelector('.wsb-pin'), paper: b.querySelector('.wsb-paper'), cv: b.querySelector('canvas'), tools: b.querySelector('.wsb-tools'), split: b.querySelector('.wsb-split') };
    ctx = el.cv.getContext('2d');
    el.tools.addEventListener('click', onTool);
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
    el.cv.width = Math.max(1, Math.round(r.width * dpr)); el.cv.height = Math.max(1, Math.round(r.height * dpr));
    render();
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
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, el.cv.width, el.cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    page().strokes.forEach(function (s) { stroke(ctx, s); });
    if (live) stroke(ctx, live.s);
  }
  function pt(e) { var r = el.cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10]; }
  function bindDraw() {
    var cv = el.cv;
    cv.addEventListener('pointerdown', function (e) {
      if (live || (e.pointerType === 'mouse' && e.button !== 0)) return;   // нэг л заагч — алга, хоёр дахь хуруу зурахгүй
      e.preventDefault();
      try { cv.setPointerCapture(e.pointerId); } catch (x) {}
      live = { id: e.pointerId, s: { c: st.color, w: st.eraser ? ERASER : st.size, er: st.eraser, p: [pt(e)] } };
      stroke(ctx, live.s);
    });
    cv.addEventListener('pointermove', function (e) {
      if (!live || e.pointerId !== live.id) return;
      e.preventDefault();
      var n0 = live.s.p.length, evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      (evs.length ? evs : [e]).forEach(function (ev) { live.s.p.push(pt(ev)); });
      stroke(ctx, live.s, Math.max(1, n0 - 1));
    });
    var end = function (e) {
      if (!live || e.pointerId !== live.id) return;
      var s = live.s; live = null;
      addStroke(page(), s); render(); sync();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  /* ── Хэрэгслүүд ── */
  function onTool(e) {
    var b = e.target.closest('button'); if (!b) return;
    var pg = page();
    if (b.classList.contains('wsb-c')) { st.color = COLORS[+b.getAttribute('data-c')][0]; st.eraser = false; }
    else if (b.classList.contains('wsb-sz')) { st.size = st.size === SIZES[0] ? SIZES[1] : SIZES[0]; st.eraser = false; }
    else if (b.classList.contains('wsb-er')) st.eraser = !st.eraser;
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
  function sync() {
    var pg = page(), t = el.tools;
    [].forEach.call(t.querySelectorAll('.wsb-c'), function (b) { b.classList.toggle('on', !st.eraser && COLORS[+b.getAttribute('data-c')][0] === st.color); });
    t.querySelector('.wsb-sz span').textContent = st.size === SIZES[0] ? 'Нарийн' : 'Бүдүүн';
    t.querySelector('.wsb-sz').classList.toggle('on', st.size !== SIZES[0] && !st.eraser);
    t.querySelector('.wsb-er').classList.toggle('on', st.eraser);
    t.querySelector('.wsb-undo').disabled = !pg.undo.length;
    t.querySelector('.wsb-redo').disabled = !pg.redo.length;
    t.querySelector('.wsb-clear').disabled = !pg.strokes.length;
    var bg = BGS[st.bg];
    t.querySelector('.wsb-bg').innerHTML = ICO[bg[0]] + '<span>' + bg[1] + '</span>';
    el.paper.className = 'wsb-paper bg-' + bg[0];
    t.querySelector('.wsb-n').textContent = (st.cur + 1) + ' / ' + st.pages.length;
    t.querySelector('.wsb-prev').disabled = st.cur === 0;
    t.querySelector('.wsb-next').disabled = st.cur === st.pages.length - 1;
    el.cv.style.cursor = st.eraser ? 'cell' : 'crosshair';
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
    st.on = false; live = null;
    D.documentElement.classList.remove('wsb-on'); el.box.hidden = true;
    [].forEach.call(D.querySelectorAll('.sheet'), function (s) { s.style.zoom = ''; });
    var sp = D.getElementById('wsbSpacer'); if (sp) sp.parentNode.removeChild(sp);
    [].forEach.call(D.querySelectorAll('#sheet .q.wsb-pinned'), function (q) { q.classList.remove('wsb-pinned'); });
  }
  root.wsBoard = { open: open, close: close, toggle: function () { if (st.on) close(); else open(); }, isOpen: function () { return st.on; }, _st: st };
})(typeof window !== 'undefined' ? window : globalThis);
