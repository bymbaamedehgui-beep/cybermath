/* CyberMath — «Эхлэх заавар» (eyeshcheck.com-ын маягаар): анх ороход угтах карт → алхам бүрт тухайн товчийг
   тодруулж (бусдыг бүдгэрүүлж), сумаар зааж, богино бичлэгтэй карт гаргана. Нэг удаа автоматаар (localStorage),
   «Заавар» товчоор дахин. Иж бүрдэл: 'hub' — Дасгалын төв (worksheets.html), 'ws' — ажлын хуудас (ws-store.js ачаална).
   Алхмын товч байхгүй/харагдахгүй бол тэр алхмыг алгасна. Тодруулга дээгүүр хуудас дарагдсаар (сурагч өөрөө дарж үзнэ).
   window.CMTour = { auto(kind), start(kind), stop(), mount(kind) } */
(function () {
  'use strict';
  if (window.CMTour) return;
  var d = document, KEY = 'cm_tour_', VER = '1', VID = '/assets/tour/';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function vis(el) { if (!el) return false; var cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false; var r = el.getBoundingClientRect(); return r.width > 2 && r.height > 2; }
  function first(sel) {
    if (typeof sel === 'function') { var x = sel(); return vis(x) ? x : null; }
    var all = d.querySelectorAll(sel);
    for (var i = 0; i < all.length; i++) if (vis(all[i])) return all[i];
    return null;
  }
  // Ажлын хуудас хоёр загвартай: шинэ (.btn.refresh, #sa) ба хуучин («Шинэ …» товч gen(), #showAns) — текстээр нь олно (ws-store findRefreshBtn шиг)
  function barBtn(re) { var a = d.querySelectorAll('.bar button'); for (var i = 0; i < a.length; i++) if (re.test(a[i].textContent || '') && vis(a[i])) return a[i]; return null; }
  function barLabel(re) { var a = d.querySelectorAll('.bar label'); for (var i = 0; i < a.length; i++) if (re.test(a[i].textContent || '') && vis(a[i])) return a[i]; return null; }
  function S(p, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 18) + '" height="' + (w || 18) + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var IC = {
    help: S('<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.6-3 4.5"/><path d="M12 17.5h.01"/>'),
    play: S('<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4V8Z"/>'),
    x: S('<path d="M18 6 6 18M6 6l12 12"/>', 16),
    map: S('<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5M15 6.5V20"/>', 30)
  };

  /* ── Алхмууд: sel — зорилт (эхний харагдах), t — гарчиг, x — тайлбар, v — бичлэг (assets/tour/<v>.mp4, .jpg) ── */
  var SETS = {
    hub: {
      title: 'Дасгалын төвд тавтай морил!',
      lead: 'Хэдхэн алхмаар ажлын хуудсаа олж, шинэ хувилбар үүсгэн хэвлэнэ. Алхам бүрийг богино бичлэгээр үзүүлье.',
      steps: [
        { sel: '.wsb-gsel, .wsb-pick', t: 'Ангиа сонгоно', x: 'Сурах бичгийн бүлэг, сэдэв бүрээр ажлын хуудас гарч ирнэ.', v: 'hub-grade' },
        { sel: '.wsb-search', t: 'Сэдвээ хайна', x: 'Сэдвийн нэрээр хайж болно — жишээ нь «бутархай».', v: 'hub-search' },
        { sel: '.wsb-cards, .wsb-grid', t: 'Ажлын хуудсаа нээнэ', x: 'Бүлгээ дарж, доторх ажлын хуудсыг сонгоно. Хуудас бүр шинэ бодлоготой хувилбар үүсгэдэг.', v: 'hub-open' },
        { sel: '#wsbNav', t: 'Слайд, тоглоом, видео', x: 'Дээд цэснээс слайд хичээл, тоглоом, интерактив, видео материал үзнэ.', v: 'hub-tabs' }
      ]
    },
    ws: {
      title: 'Ажлын хуудастай танилцъя',
      lead: 'Хэрэгслийн мөрийн товчнууд юу хийдгийг богино бичлэгээр үзүүлье.',
      steps: [
        { sel: function () { return first('.bar .btn.refresh') || barBtn(/^\s*Шинэ/); }, t: 'Шинэ бодлого', x: 'Дарах бүрд тоо нь өөрчлөгдсөн шинэ хувилбар гарна. Гараас Ctrl+Enter.', v: 'ws-new' },
        { opt: 1, sel: function () { return barLabel(/Бодолтын зай|Бодолт хийх/); }, t: 'Бодолтын зай', x: 'Асаавал бодлого бүрийн доор бодох зай гарна — хэвлээд шууд бодно.', v: 'ws-work' },
        { sel: function () { return barLabel(/Хариу хавсаргах/); }, t: 'Хариу хавсаргах', x: 'Асаавал хуудасны төгсгөлд хариу хавсарна — шалгахад хэрэгтэй.', v: 'ws-answers' },
        { sel: '.bar button[onclick*="print"]', t: 'Хэвлэх / PDF', x: 'Хэвлэх эсвэл PDF болгож хадгална.', v: 'ws-print' },
        { opt: 1, sel: '.bar .ws-board', t: 'Самбар', x: 'Смарт дэлгэц дээр хуудсаа томоор үзүүлж, гараар бичнэ.', v: 'ws-board' },
        { opt: 1, sel: '#solBtn', t: 'Бодолтын PPT', x: 'Бодолтыг алхам алхмаар, анимейшнтэй слайдаар үзнэ.', v: 'ws-ppt' }
      ]
    }
  };

  var CSS = '#cmt{position:fixed;inset:0;z-index:9000;pointer-events:none;font-family:inherit;color:#211C54}'
    + '#cmt *{box-sizing:border-box}'
    + '#cmt .cmt-dim{position:fixed;inset:0;background:rgba(17,12,40,.55);pointer-events:auto;display:flex;align-items:center;justify-content:center;padding:16px;animation:cmtF .2s}'
    + '#cmt .cmt-soft{position:fixed;inset:0;background:rgba(17,12,40,.45)}'
    + '#cmt .cmt-hole{position:fixed;border-radius:14px;box-shadow:0 0 0 9999px rgba(17,12,40,.5);transition:left .2s,top .2s,width .2s,height .2s}'
    + '#cmt .cmt-hole:after{content:"";position:absolute;inset:-4px;border-radius:17px;border:3px solid #EC4899;animation:cmtRing 1.4s ease-out infinite}'
    + '#cmt .cmt-arrow{position:fixed;width:46px;height:46px;color:#7B52EE;filter:drop-shadow(0 3px 6px rgba(0,0,0,.3));transition:left .2s,top .2s}'
    + '#cmt .cmt-arrow svg{display:block;width:100%;height:100%;animation:cmtBob 1s ease-in-out infinite}'
    + '#cmt .cmt-arrow.up svg{transform:rotate(180deg);animation-name:cmtBobUp}'
    + '#cmt .cmt-card{position:fixed;pointer-events:auto;background:#fff;border-radius:20px;box-shadow:0 24px 60px -18px rgba(17,12,40,.6);padding:16px;display:flex;flex-direction:column;gap:10px;max-height:calc(100vh - 24px);overflow:auto;animation:cmtUp .22s ease}'
    + '#cmt .cmt-card.w{width:360px}'
    + '#cmt .cmt-card.n{left:8px;right:8px;padding:12px}'
    + '#cmt .cmt-h{display:flex;align-items:center;gap:10px}'
    + '#cmt .cmt-h b{flex:1;font-size:16.5px;font-weight:900;line-height:1.25}'
    + '#cmt .cmt-n{flex:none;width:28px;height:28px;border-radius:99px;background:#7B52EE;color:#fff;display:grid;place-items:center;font-size:13px;font-weight:900}'
    + '#cmt .cmt-dots{display:flex;gap:4px;flex:none}#cmt .cmt-dots i{width:8px;height:8px;border-radius:99px;background:#E4DEF7}#cmt .cmt-dots i.on{background:#7B52EE;width:18px}#cmt .cmt-dots i.ok{background:#22C55E}'
    + '#cmt .cmt-x{flex:none;border:0;background:#F3F0FF;color:#211C54;width:30px;height:30px;border-radius:99px;cursor:pointer;display:grid;place-items:center}'
    + '#cmt .cmt-video{display:block;width:100%;aspect-ratio:16/10;max-height:32vh;object-fit:contain;border-radius:12px;background:#2a2440}'
    + '#cmt .cmt-text{margin:0;font-size:14.5px;line-height:1.5;font-weight:600;color:#3F3A5C}'
    + '#cmt .cmt-btns{display:flex;align-items:center;gap:10px;justify-content:flex-end}'
    + '#cmt .cmt-btn{border:0;border-radius:999px;padding:.6rem 1.15rem;font:inherit;font-size:14px;font-weight:800;cursor:pointer;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff}'
    + '#cmt .cmt-btn.gh{background:#F3F0FF;color:#5B3BD9}#cmt .cmt-skip{margin-right:auto;border:0;background:none;color:#9A95B8;font:inherit;font-size:13px;font-weight:700;cursor:pointer;padding:6px 2px}'
    + '#cmt .cmt-welcome{position:relative;width:min(430px,100%);text-align:center;align-items:center;padding:24px 22px;gap:12px}'
    + '#cmt .cmt-welcome .cmt-ic{width:58px;height:58px;border-radius:18px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#7B52EE,#EC4899)}'
    + '#cmt .cmt-welcome h2{margin:0;font-size:22px;font-weight:900}#cmt .cmt-welcome p{margin:0;font-size:14.5px;line-height:1.5;font-weight:600;color:#6B6690}'
    + '#cmt .cmt-list{list-style:none;margin:2px 0;padding:0;width:100%;display:flex;flex-direction:column;gap:7px;text-align:left}'
    + '#cmt .cmt-list li{display:flex;align-items:center;gap:10px;font-weight:800;font-size:14.5px;background:#F6F4FD;border-radius:12px;padding:8px 12px}'
    + '#cmt .cmt-list li b{width:24px;height:24px;border-radius:99px;display:grid;place-items:center;background:#7B52EE;color:#fff;font-size:12.5px;flex:none}'
    + '#cmt .cmt-welcome .cmt-btns{justify-content:center;width:100%}#cmt .cmt-welcome .cmt-btn{flex:1}'
    + '#cmt .cmt-welcome .cmt-x{position:absolute;top:12px;right:12px}'
    + '@keyframes cmtF{from{opacity:0}to{opacity:1}}@keyframes cmtUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}'
    + '@keyframes cmtRing{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.08)}}'
    + '@keyframes cmtBob{0%,100%{transform:translateY(0)}50%{transform:translateY(7px)}}@keyframes cmtBobUp{0%,100%{transform:rotate(180deg) translateY(0)}50%{transform:rotate(180deg) translateY(7px)}}'
    + '@media (prefers-reduced-motion:reduce){#cmt *{animation:none!important;transition:none!important}}'
    + '@media print{#cmt,.cmt-launch{display:none!important}}'
    /* «Заавар» товч: Дасгалын төвийн дээд мөрөнд ба ажлын хуудасны хэрэгслийн мөрөнд */
    + '.cmt-launch{display:inline-flex;align-items:center;gap:6px;border:1.5px solid #E4DEF7;background:#fff;color:#5B3BD9;border-radius:999px;padding:.42rem .95rem;font:inherit;font-size:.86rem;font-weight:800;cursor:pointer}'
    + '.cmt-launch:hover{background:#F6F4FD}.bar .cmt-launch{order:8;height:34px;padding:0 12px;font-size:.82rem}';

  var ARROW = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"><path d="M9 2.5h6v10.2h4.6L12 21.5 4.4 12.7H9z"/></svg>';

  var root = null, kind = null, set = null, steps = [], cur = -1, tick = 0, keyH = null;
  function css() { if (d.getElementById('cmt-css')) return; var s = d.createElement('style'); s.id = 'cmt-css'; s.textContent = CSS; d.head.appendChild(s); }
  function state(k) { var v = lsGet(KEY + k); return v ? v.split(':') : null; }
  function mark(k, s) { lsSet(KEY + k, VER + ':' + s + ':' + Date.now()); }

  // Тухайн хуудсанд байгаа (харагдах) алхмууд л
  function avail(k) { return SETS[k].steps.filter(function (s) { return !s.opt || !!first(s.sel); }); }

  function stop(how) {
    clearInterval(tick); tick = 0;
    if (keyH) { window.removeEventListener('keydown', keyH, true); keyH = null; }
    if (root) { root.remove(); root = null; }
    if (kind && how) mark(kind, how);
    kind = null; cur = -1;
  }

  function welcome() {
    root.innerHTML = '<div class="cmt-dim"><div class="cmt-card cmt-welcome" role="dialog" aria-modal="true" aria-label="' + esc(set.title) + '">'
      + '<button type="button" class="cmt-x" data-a="x" aria-label="Хаах" title="Хаах — «Заавар» товчоор дахин нээнэ">' + IC.x + '</button>'
      + '<div class="cmt-ic">' + IC.map + '</div><h2>' + esc(set.title) + '</h2><p>' + esc(set.lead) + '</p>'
      + '<ol class="cmt-list">' + steps.map(function (s, i) { return '<li><b>' + (i + 1) + '</b>' + esc(s.t) + '</li>'; }).join('') + '</ol>'
      + '<div class="cmt-btns"><button type="button" class="cmt-btn gh" data-a="later">Дараа үзье</button><button type="button" class="cmt-btn" data-a="go">Эхлэх</button></div>'
      + '</div></div>';
    var go = root.querySelector('[data-a="go"]'); if (go) go.focus();
  }

  function show(i) {
    if (i < 0 || i >= steps.length) return;
    cur = i;
    var s = steps[i], el = first(s.sel);
    // нэмэлт товч (байхгүй бол) — алгасна; гол алхам (ж: анги сонгоогүй үед бүлгийн картууд) — тодруулгагүйгээр бичлэгтэй нь
    if (!el && s.opt) { if (i + 1 < steps.length) return show(i + 1); return stop('done'); }
    if (el) {
      var r = el.getBoundingClientRect();
      if (r.top < 70 || r.bottom > innerHeight - 40) { try { el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { el.scrollIntoView(); } }
    }
    var last = i === steps.length - 1, narrow = innerWidth < 700;
    root.innerHTML = '<div class="cmt-soft"></div><div class="cmt-hole"></div><div class="cmt-arrow">' + ARROW + '</div>'
      + '<div class="cmt-card ' + (narrow ? 'n' : 'w') + '" role="dialog" aria-label="' + esc(s.t) + '">'
      + '<div class="cmt-h"><span class="cmt-n">' + (i + 1) + '</span><b>' + esc(s.t) + '</b><span class="cmt-dots">'
      + steps.map(function (x, j) { return '<i class="' + (j === i ? 'on' : (j < i ? 'ok' : '')) + '"></i>'; }).join('') + '</span>'
      + '<button type="button" class="cmt-x" data-a="x" aria-label="Хаах" title="Хаах — «Заавар» товчоор дахин нээнэ">' + IC.x + '</button></div>'
      + '<video class="cmt-video" muted autoplay loop playsinline preload="auto" poster="' + VID + s.v + '.jpg" src="' + VID + s.v + '.mp4"></video>'
      + '<p class="cmt-text">' + esc(s.x) + '</p>'
      + '<div class="cmt-btns"><button type="button" class="cmt-skip" data-a="x">Алгасах</button>'
      + (i > 0 ? '<button type="button" class="cmt-btn gh" data-a="prev">Өмнөх</button>' : '')
      + '<button type="button" class="cmt-btn" data-a="next">' + (last ? 'Дуусгах' : 'Дараах') + '</button></div></div>';
    var v = root.querySelector('video');
    // бичлэг байхгүй/тоглуулж чадахгүй бол картаас авч хаяна (алхам хэвээр)
    v.addEventListener('error', function () { v.remove(); place(); });
    try { var pr = v.play(); if (pr && pr.catch) pr.catch(function () {}); } catch (e) {}
    place();
    var nb = root.querySelector('[data-a="next"]'); if (nb) nb.focus({ preventScroll: true });
  }

  // Тодруулга, сум, картын байрлал (зорилт гүйлгэгдэх/дахин зурагдахад байнга шинэчилнэ)
  function place() {
    if (!root) return;
    var bl = blocked(); root.style.display = bl ? 'none' : '';      // нэвтрэх цонх г.м. гарвал түр нууна
    if (bl || cur < 0) return;
    var s = steps[cur], el = first(s.sel), hole = root.querySelector('.cmt-hole'), ar = root.querySelector('.cmt-arrow'), card = root.querySelector('.cmt-card'), soft = root.querySelector('.cmt-soft');
    if (!hole || !card) return;
    var W = innerWidth, H = innerHeight;
    if (soft) soft.style.display = el ? 'none' : '';
    if (!el) {
      // зорилтгүй алхам: бүдэг дэвсгэр дээр голлуулсан карт
      hole.style.display = 'none'; ar.style.display = 'none';
      card.style.top = card.style.bottom = card.style.left = card.style.right = '';
      if (W < 700) card.style.bottom = '10px';
      else { card.style.left = Math.round((W - 360) / 2) + 'px'; card.style.top = Math.round(Math.max(20, (H - card.offsetHeight) / 2)) + 'px'; }
      return;
    }
    var r = el.getBoundingClientRect(), p = 8;
    var L = Math.max(4, r.left - p), T = Math.max(4, r.top - p), R = Math.min(W - 4, r.right + p), B = Math.min(H - 4, r.bottom + p);
    hole.style.display = ''; hole.style.left = L + 'px'; hole.style.top = T + 'px'; hole.style.width = Math.max(10, R - L) + 'px'; hole.style.height = Math.max(10, B - T) + 'px';
    var cx = (L + R) / 2, up = T < 64;   // дээр зай бага бол сум доороос (дээш заана)
    ar.style.display = ''; ar.className = 'cmt-arrow' + (up ? ' up' : '');
    ar.style.left = Math.round(Math.min(W - 50, Math.max(4, cx - 23))) + 'px';
    ar.style.top = Math.round(up ? B + 6 : T - 52) + 'px';
    // карт: зорилтын эсрэг талд (дээд/доод, зүүн/баруун) — зорилт ба сумыг халхлахгүй
    var ch = card.offsetHeight, below = (T + B) / 2 < H * 0.52;
    card.style.top = card.style.bottom = card.style.left = card.style.right = '';
    if (W < 700) {
      if (below) card.style.bottom = '10px'; else card.style.top = '10px';
    } else {
      if (cx < W / 2) card.style.right = '20px'; else card.style.left = '20px';
      var y = below ? H - ch - 20 : 20;
      // хэвтээ давхцал байвал (өргөн зорилт) босоо талыг сольж үзнэ
      var cl = cx < W / 2 ? W - 20 - 360 : 20, cr = cl + 360;
      if (cr > L && cl < R && y < B + 50 && y + ch > T - 56) y = below ? Math.max(20, Math.min(H - ch - 20, B + 60)) : Math.max(20, T - ch - 66);
      card.style.top = Math.round(y) + 'px';
    }
  }

  function onClick(e) {
    var b = e.target.closest('[data-a]'); if (!b || !root || !root.contains(b)) return;
    var a = b.getAttribute('data-a');
    if (a === 'x') stop('closed');
    else if (a === 'later') stop('later');
    else if (a === 'go') show(0);
    else if (a === 'next') { if (cur >= steps.length - 1) stop('done'); else show(cur + 1); }
    else if (a === 'prev') show(Math.max(0, cur - 1));
  }

  function start(k) {
    if (!SETS[k]) return false;
    stop();
    steps = avail(k);
    if (!steps.length) return false;
    css(); kind = k; set = SETS[k];
    root = d.createElement('div'); root.id = 'cmt'; root.addEventListener('click', onClick);
    d.body.appendChild(root);
    welcome();
    keyH = function (e) {
      if (!root) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); stop('closed'); }
      else if (cur >= 0 && (e.key === 'ArrowRight' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey))) { e.preventDefault(); e.stopPropagation(); if (cur >= steps.length - 1) stop('done'); else show(cur + 1); }
      else if (cur > 0 && e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); show(cur - 1); }
    };
    window.addEventListener('keydown', keyH, true);
    tick = setInterval(place, 250);
    return true;
  }

  // Анх ороход нэг удаа: хаасан/дуусгасан бол дахин гаргахгүй; «Дараа үзье» бол 1 өдрийн дараа
  function due(k) {
    var st = state(k); if (!st) return true;
    return st[1] === 'later' && Date.now() - (+st[2] || 0) > 864e5;
  }
  // Нэвтрэх цонх, төлбөрийн түгжээ, PPT тоглуулагч, бусад цонх нээлттэй бол заавар хүлээнэ/түр нууна
  var BLOCK = '#wsLogin, #wsLock, .e1s-pl, #modal.on, .modal.on, #cm-sheet.on, #bulkModal.on, #qrModal.on';
  function blocked() { var a = d.querySelectorAll(BLOCK); for (var i = 0; i < a.length; i++) if (vis(a[i])) return true; return false; }
  function busy() {
    if (d.getElementById('cmt') || blocked()) return true;
    return /[?&](qr|b|embed)=/.test(location.search) || window.self !== window.top;
  }
  function auto(k) {
    mount(k);
    if (!due(k)) return;
    var n = 0;
    (function wait() {
      if (++n > 240) return;                                  // ~2 мин хүлээгээд болино (зочинд нэвтрэх цонх гарч болно)
      if (busy() || !avail(k).length || (k === 'hub' && !d.querySelector('.wsb-main, .wsb-pick'))) return setTimeout(wait, 500);
      // нэвтрэх цонх хуудас ачаалсны дараа (API-ийн хариугаар) хоцорч гарч болно — тэр үед хүлээлтээ үргэлжлүүлнэ
      setTimeout(function () { if (!due(k)) return; if (busy()) return wait(); start(k); }, 600);
    })();
  }

  // «Заавар» товч
  function mount(k) {
    css();
    if (k === 'hub') {
      if (d.querySelector('.cmt-launch')) return;
      var fb = d.getElementById('fbBtn');
      if (!fb || !fb.parentNode) return;
      var b = d.createElement('button'); b.type = 'button'; b.className = 'cmt-launch'; b.innerHTML = IC.help + 'Заавар'; b.title = 'Дасгалын төвийн эхлэх заавар';
      b.onclick = function () { start('hub'); };
      fb.parentNode.insertBefore(b, fb);
    } else if (k === 'ws') {
      var bar = d.querySelector('.bar'); if (!bar || bar.querySelector('.cmt-launch')) return;
      var w = d.createElement('button'); w.type = 'button'; w.className = 'cmt-launch'; w.innerHTML = IC.help + 'Заавар'; w.title = 'Хэрэгслийн мөрийн товчнуудын заавар';
      w.onclick = function () { start('ws'); };
      bar.appendChild(w);
    }
  }

  window.CMTour = { auto: auto, start: start, stop: function () { stop(); }, mount: mount, sets: SETS };
  // Дасгалын төв: ws-browse.js цэсээ DOMContentLoaded-д зурдаг тул түүний дараа шалгана (ажлын хуудсанд ws-store.js auto('ws')-ийг дуудна)
  function boot() { if (d.getElementById('wsbNav') || d.querySelector('.wsb-main') || /^\/worksheets(\.html)?\/?$/.test(location.pathname)) auto('hub'); }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
