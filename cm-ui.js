/* CyberMath — Тоглоомын төвийн шинэ цайвар загвар (C «Адал явдал»). Хэв маяг: cm-ui.css
   1) Апп (#cybermath-app) харагдах үед html.cmx: компьютерт дээд цэс (#cmx-tabs + «Цааш» #cmx-more), утсанд app-mobile.js-ийн доод таб.
   2) «Нүүр» таб (#tab-home + далд .tab-btn → switchTab('home')): бүлгүүд арал болсон газрын зураг —
      өдөр/үдэш/шөнийн тэнгэр (бодит цагаар), арал дээр дарахад сэдвүүд нь нээгдэнэ, түвшин тогтоох сорилын дараа шувуу
      агаарын бөмбөлгөөр санал болгосон арал руу нисэж очно; доор нь тоглоом, тэргүүлэгчид, streak, Mathlet, сорил, Зааварчилгаа.
   Хуучин hero / табын мөр / streak, XP баннерын агуулга (уриа, Зааварчилгаа, 7 хоногийн цэг, түвшин, XP) «Нүүр»-т шилжинэ.
   Сайтын функцийг өөрчлөхгүй: табыг жинхэнэ товчоор (switchTab нь event.target-д 'active' тавьдаг), хичээлийг tryOpenLesson,
   тоглоомыг startGame-ээр нээнэ. Унтраах: ?ui=old (localStorage cm_ui=old), буцааж асаах ?ui=new.
   Тэнгэрийг шалгах: ?sky=day|dusk|night. Embed (iframe) горимд юу ч хийхгүй. app-mobile.js-ээс өмнө ачаалагдана. */
(function () {
  'use strict';
  var d = document, H = d.documentElement;
  if (window.top !== window.self || H.classList.contains('cm-embed')) return;
  var QS = {};
  try {
    QS = new URLSearchParams(location.search);
    var q = QS.get('ui');
    if (q === 'old') localStorage.setItem('cm_ui', 'old'); else if (q === 'new') localStorage.removeItem('cm_ui');
    if (localStorage.getItem('cm_ui') === 'old') return;
  } catch (e) {}

  function S(p, f) {
    return '<svg viewBox="0 0 24 24" fill="' + (f ? 'currentColor' : 'none') + '" stroke="' + (f ? 'none' : 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var IC = {
    home: S('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
    map: S('<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    games: S('<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M15.5 11.5h.01M17.5 13.5h.01" stroke-width="3"/>'),
    bolt: S('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>'),
    trophy: S('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    medal: S('<circle cx="12" cy="14.5" r="6"/><path d="M8.5 3h7L14 8.6h-4L8.5 3Z"/>'),
    exam: S('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/>'),
    cls: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    friends: S('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
    profile: S('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a7 7 0 0 1 11.6 0"/>'),
    video: S('<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m10 9 5 3-5 3V9Z"/>'),
    swap: S('<path d="M7 4 3 8l4 4"/><path d="M3 8h13a4 4 0 0 1 4 4"/><path d="m17 20 4-4-4-4"/><path d="M21 16H8a4 4 0 0 1-4-4"/>'),
    grid: S('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
    down: S('<path d="m6 9 6 6 6-6"/>'),
    arrow: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    chev: S('<path d="m9 6 6 6-6 6"/>'),
    back: S('<path d="m15 6-6 6 6 6"/>'),
    check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    lock: S('<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>'),
    target: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
    play: S('<path d="M7.5 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2a1 1 0 0 0-1.5.86Z"/>', 1),
    flame: S('<path d="M12.6 2.2c.6 3.1 3.1 4.7 4.6 7.2 1.3 2.2 1.3 4.9-.1 7.1A6 6 0 0 1 6 14.8c-.3-2.4.7-4.2 2.2-5.6.2 1.5.9 2.5 1.9 3-.4-3.6.5-7 2.5-10Z"/>', 1),
    crown: S('<path d="M3.5 8.5 7.8 12 12 5.5l4.2 6.5 4.3-3.5L18.6 19H5.4L3.5 8.5Z"/>', 1),
    balloon: S('<path d="M12 2a7 7 0 0 0-7 7c0 4.5 4 7.5 6 9h2c2-1.5 6-4.5 6-9a7 7 0 0 0-7-7Z"/><path d="M11 18v2h2v-2"/>')
  };
  // Дээд цэс (компьютер) ба «Цааш» цэс. «@…» = таб биш үйлдэл
  var TOP = [['home', 'Нүүр', IC.home], ['path', 'Зам', IC.map], ['games', 'Тоглоом', IC.games], ['mathlet', 'Mathlet', IC.bolt], ['leaderboard', 'Тэргүүлэгч', IC.trophy]];
  var MORE = [['achievements', 'Амжилт', IC.medal], ['exam', 'Шалгалт', IC.exam, 'Шинэ'], ['classroom', 'Анги', IC.cls], ['@friends', 'Найзууд', IC.friends],
    ['@profile', 'Профайл', IC.profile], ['@tutorial', 'Зааварчилгаа', IC.video], ['@pick', 'Төв солих', IC.swap]];
  // Нүүрний тоглоом: [startGame түлхүүр, нэр, төрөл, зураг]
  var GAMES = [['mathmortal', 'MATH MORTAL', '3D тулаан · бодлого бодож баатраа хүчирхэгжүүл', '/assets/pick/game-hero.webp'],
    ['mathkittens', 'Математик Муурнууд', 'Картын тоглоом', '/assets/pick/s-kittens.webp'], ['myangat', 'Мянгат', 'Асуулт хариулт', '/assets/pick/s-myangat.webp'],
    ['blockblast', 'Block Blast Math', 'Оюун ухаан', '/assets/pick/s-blast.webp']];
  var FREE = ['blockblast', 'flagbattle', 'songon', 'nicebattle'];   // index.html-ийн Тоглоомын төвийн gate (FREE_KEYS)-тэй ижил
  var DAYS = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'];

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function txt(id) { var e = d.getElementById(id); return e ? e.textContent.replace(/\s+/g, ' ').trim() : ''; }
  function num(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function noEmoji(s) { return String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim(); }
  function user() { return window._currentUser || null; }
  function isTeacher() { var u = user(); return !!(u && (u.role === 'teacher' || u.grade === 'teacher')); }
  function premium() {
    var u = user(); if (!u || u.plan !== 'premium') return false;
    var exp = u.premium_expiry || u.premium_until; return !exp || new Date(exp) > new Date();
  }
  function grade() { try { return typeof window.cmUserGrade === 'function' ? String(window.cmUserGrade() || '') : ''; } catch (e) { return ''; } }
  function visible(el) { return !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none'; }
  function reduced() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  function tabBtn(k) { return d.querySelector('.tabs .tab-btn[onclick*="switchTab(\'' + k + '\')"]'); }
  function activeTab() { var c = d.querySelector('.tab-content[id^="tab-"].active'); return c ? c.id.replace(/^tab-/, '') : 'path'; }
  function hasClassroom() { var b = tabBtn('classroom'); return !!(b && b.style.display !== 'none'); }
  function go(k) { var b = tabBtn(k); if (!b) return; if (activeTab() !== k) b.click(); window.scrollTo(0, 0); if (k === 'path') setTimeout(focusPath, 80); }
  function act(a) {
    if (a === '@friends') { if (window.openFriends) window.openFriends(); }
    else if (a === '@profile') { if (window.handleAvatarClick) window.handleAvatarClick(); }
    else if (a === '@tutorial') { if (window.openTutorialModal) window.openTutorialModal(); }
    else if (a === '@pick') { if (window.cmShowPick) window.cmShowPick(); else location.href = '/?pick'; }
    else go(a);
  }
  /* Зам анх нээгдэхэд (гүйлгээ дээрээ байвал) одоогийн хичээлийн зангилаа руу — замын initPath далд үед ажилласан байж болно */
  function focusPath() {
    try {
      var sc = d.getElementById('path-scroll'); if (!sc || sc.scrollTop > 40) return;
      var nx = nextInfo(slotOrder(), doneSlots(), plSlot()); if (!nx || nx.slot == null) return;
      var c = d.querySelector('#path-svg circle[onclick="tryOpenLesson(' + nx.slot + ')"]'); if (!c) return;
      var r = c.getBoundingClientRect(), pr = sc.getBoundingClientRect();
      sc.scrollTop += r.top - pr.top - pr.height * 0.45;
    } catch (e) {}
  }

  /* ── «Нүүр» таб: апп-ын табуудын дунд + далд товч ── */
  function ensureHome() {
    if (d.getElementById('tab-home')) return true;
    var path = d.getElementById('tab-path'), tabs = d.querySelector('#cybermath-app .tabs');
    if (!path || !tabs) return false;
    var t = d.createElement('div'); t.className = 'tab-content'; t.id = 'tab-home';
    path.parentNode.insertBefore(t, path);
    var b = d.createElement('button'); b.type = 'button'; b.className = 'tab-btn'; b.textContent = 'Нүүр';
    b.setAttribute('onclick', "switchTab('home')"); b.style.display = 'none';
    tabs.insertBefore(b, tabs.firstChild);
    t.addEventListener('click', onHomeClick);
    t.addEventListener('keydown', function (e) { if (e.key === 'Escape' && SEL != null) { SEL = null; render(true); } });
    return true;
  }

  /* ── Өгөгдөл ── */
  function myAv() { var e = d.getElementById('nav-avatar-inner'); return e ? e.innerHTML : ''; }
  function avHtml(v) {
    if (v && typeof v === 'string' && v.indexOf('data:image') === 0) return '<img src="' + esc(v) + '" alt="">';
    var el = d.getElementById('avc-' + (v || 'default')) || d.getElementById('avc-default') || d.getElementById('avc-1');
    var svg = el && el.querySelector('svg'); return svg ? svg.outerHTML : '';
  }
  var CHICK = null;   // сайтын hero-гийн шувуу (gradient id давхардахгүй байхаар өөрчилнө)
  function chick() {
    if (CHICK !== null) return CHICK;
    var s = d.querySelector('#cybermath-app .hero svg[viewBox="780 240 420 460"]');
    CHICK = s ? s.outerHTML.replace(/\sid="([^"]+)"/g, ' id="$1_hx"').replace(/url\(#([^)]+)\)/g, 'url(#$1_hx)').replace(/\sstyle="[^"]*"/, '') : '';
    return CHICK;
  }
  var BALLOON = '<svg viewBox="0 0 80 96" aria-hidden="true"><path d="M40 4C21 4 8 18 8 35c0 17 14 28 24 38h16c10-10 24-21 24-38C72 18 59 4 40 4Z" fill="#FF5FA2"/>' +
    '<path d="M40 4c-8 0-14 13-14 31 0 17 6 28 9 38h10c3-10 9-21 9-38C54 17 48 4 40 4Z" fill="#FFC113"/><path d="M40 4c-3 0-5 13-5 31 0 17 2 28 3 38h4c1-10 3-21 3-38 0-18-2-31-5-31Z" fill="#7B52EE"/>' +
    '<path d="M32 73l3 12M48 73l-3 12" stroke="#8A6A3A" stroke-width="2"/></svg>';
  function slotOrder() {
    try {
      if (typeof window.cmSlotOrder !== 'function') return [];
      var P = window._PATH || {}, o = window.cmSlotOrder().slice();
      return P.on && P.count ? o.slice(0, P.count) : o;
    } catch (e) { return []; }
  }
  function doneSlots() { try { return (typeof window.cmCompletedSlots === 'function' ? window.cmCompletedSlots() : []).map(Number); } catch (e) { return []; } }
  function plSlot() { try { return typeof window.cmPlacementSlot === 'function' ? (+window.cmPlacementSlot() || 0) : 0; } catch (e) { return 0; } }
  function nidOf(slot) { var P = window._PATH || {}; return P.on ? P.s2n[slot] : slot; }
  function slotOf(nid) { var P = window._PATH || {}; return P.on ? (P.n2s[nid] || 0) : nid; }
  function isOpen(s, done, pl) { return s === 1 || done.indexOf(s) >= 0 || done.indexOf(s - 1) >= 0 || s <= pl; }   // index.html tryOpenLesson-ийн дүрэм
  function nodeName(nid, slot) {
    var nm = '';
    try {
      var L = JSON.parse(lsGet('cm_nodes') || '[]') || [];
      for (var i = 0; i < L.length; i++) if (+L[i].id === +nid) { nm = L[i].name; break; }
    } catch (e) {}
    if (!nm || /^\d+$/.test(String(nm).trim())) {
      try { var t = typeof window.cmLabelEl === 'function' && window.cmLabelEl(slot); if (t && t.textContent.trim()) nm = t.textContent; } catch (e) {}
    }
    return noEmoji(nm) || ('Хичээл ' + slot);
  }
  /* Дараагийн хичээл: сорилын эхлэх слотоос хойших эхний дуусаагүй слот (байхгүй бол эхнээс) */
  function nextInfo(order, done, pl) {
    if (!order.length) return null;
    var from = pl ? Math.max(0, order.indexOf(pl)) : 0, slot = null, i;
    for (i = from; i < order.length && slot == null; i++) if (done.indexOf(order[i]) < 0) slot = order[i];
    for (i = 0; i < order.length && slot == null; i++) if (done.indexOf(order[i]) < 0) slot = order[i];
    return { slot: slot, name: slot == null ? '' : nodeName(nidOf(slot), slot), total: order.length,
      done: order.filter(function (s) { return done.indexOf(s) >= 0; }).length };
  }
  /* Бүлгүүд: /api/placement?action=plan (анги бүрийн бүлэг, сэдвийн id) — sessionStorage-д кэшилнэ */
  var PLAN = {}, PLANING = {};
  function plan(g) {
    if (!g || g === 'teacher') return null;
    if (PLAN.hasOwnProperty(g)) return PLAN[g];
    PLAN[g] = null;
    try { var c = sessionStorage.getItem('cmx_plan_' + g); if (c) { PLAN[g] = JSON.parse(c); return PLAN[g]; } } catch (e) {}
    PLANING[g] = true;
    fetch('/api/placement?action=plan&grade=' + encodeURIComponent(g)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      PLANING[g] = false;
      if (j && j.ok && j.chapters) { PLAN[g] = j; try { sessionStorage.setItem('cmx_plan_' + g, JSON.stringify(j)); } catch (e) {} }
      if (activeTab() === 'home') render(true);
    }).catch(function () { PLANING[g] = false; if (activeTab() === 'home') render(true); });
    return null;
  }
  /* Газрын зургийн загвар: арал = бүлэг (plan), байхгүй бол замыг 6-аар хуваана */
  function model() {
    var g = grade(), order = slotOrder();
    if (!g || g === 'teacher' || !order.length) return null;
    var done = doneSlots(), pl = plSlot(), nx = nextInfo(order, done, pl), p = plan(g), list = [];
    if (p && p.chapters) {
      p.chapters.forEach(function (c) {
        var ts = (c.topics || []).map(function (t) { return { slot: slotOf(+t.id), name: noEmoji(t.name) }; })
          .filter(function (t) { return t.slot && order.indexOf(t.slot) >= 0; });
        if (ts.length) list.push({ name: noEmoji(c.name), topics: ts });
      });
    }
    var fb = !list.length;   // бүлгийн мэдээлэлгүй (ж: 11-р анги, зам ачаалагдаагүй) — замыг 6-аар хуваана
    if (fb) {
      if (PLANING[g]) return { g: g, loading: true };
      for (var i = 0; i < order.length; i += 6) {
        list.push({ name: (i / 6 + 1) + '-р хэсэг', topics: order.slice(i, i + 6).map(function (s) { return { slot: s, name: nodeName(nidOf(s), s) }; }) });
      }
    }
    var cur = -1;
    list.forEach(function (c, i) {
      c.i = i; c.total = c.topics.length;
      c.done = c.topics.filter(function (t) { return done.indexOf(t.slot) >= 0; }).length;
      c.open = c.topics.some(function (t) { return isOpen(t.slot, done, pl); });
      if (nx && nx.slot != null && c.topics.some(function (t) { return t.slot === nx.slot; })) cur = i;
    });
    if (cur < 0 && nx && nx.slot != null) {   // дараагийн хичээл (ж: Бататгал) аль ч аралд ороогүй — өмнөх хамгийн ойр арал
      var ni = order.indexOf(nx.slot);
      list.forEach(function (c, i) { if (c.topics.some(function (t) { return order.indexOf(t.slot) <= ni; })) cur = i; });
    }
    if (cur < 0) cur = nx && nx.slot == null ? list.length - 1 : 0;
    list.forEach(function (c, i) { c.state = c.done === c.total ? 'done' : i === cur ? 'cur' : c.open ? 'open' : 'lock'; });
    return { g: g, list: list, cur: cur, next: nx, done: done, pl: pl, fb: fb };
  }
  /* Тэргүүлэгчид: /api/users?leaderboard=1 (тэргүүлэгчийн табтай ижил) — 2 минут кэш */
  var LB = null, LBAT = 0, lbBusy = false;
  function lb() {
    if (!lbBusy && (!LB || Date.now() - LBAT > 120000)) {
      lbBusy = true;
      var f = typeof window.authFetch === 'function' ? window.authFetch : fetch;
      f('/api/users?leaderboard=1').then(function (r) { return r.json(); }).then(function (j) {
        lbBusy = false; LB = ((j && j.users) || []).slice().sort(function (a, b) { return (+b.xp || 0) - (+a.xp || 0); }); LBAT = Date.now();
        if (activeTab() === 'home') render(false);
      }).catch(function () { lbBusy = false; if (!LB) LB = []; });
    }
    return LB;
  }
  function shortName(u) {
    var f = noEmoji(u.first_name || u.firstName || ''), l = noEmoji(u.last_name || u.lastName || '');
    return (f + (l ? ' ' + l.charAt(0) + '.' : '')).trim() || 'Сурагч';
  }
  function sky() {
    var q = QS && QS.get ? QS.get('sky') : '';
    if (/^(day|dusk|night)$/.test(q || '')) return q;
    var h = new Date().getHours();
    return h >= 6 && h < 17 ? 'day' : (h >= 17 && h < 20 ? 'dusk' : 'night');
  }

  /* ── Газрын зураг ── */
  var GAP = 196, X0 = 124, SEL = null, FLYING = false, LASTSIG = '';
  function mapH() { return window.matchMedia && matchMedia('(max-width: 768px)').matches ? 300 : 470; }
  function geo(n, H) {
    var P = [];
    for (var i = 0; i < n; i++) P.push({ x: X0 + i * GAP, y: Math.round(H * 0.5 + (i % 2 ? -1 : 1) * H * 0.1) });
    return P;
  }
  function roadD(P, dy) {   // dy: замыг цэгээс доош (арал) эсвэл төвөөр (гараг: -16 → p.y)
    var o = 16 + (dy || 0), px = P[0].x - 140, py = P[0].y + o + 18, dd = 'M' + px + ' ' + py;
    P.forEach(function (p) { var mx = (px + p.x) / 2; dd += ' C' + mx + ' ' + py + ' ' + mx + ' ' + (p.y + o) + ' ' + p.x + ' ' + (p.y + o); px = p.x; py = p.y + o; });
    return dd + ' C' + (px + 70) + ' ' + py + ' ' + (px + 90) + ' ' + (py - 24) + ' ' + (px + 170) + ' ' + (py - 34);
  }
  /* ── Гараг (эзэмшигч 2026-11-08: C «Математик гаригууд» — бодит 3D гараг, эргэлддэг бүслүүр, нэр цагаан/тод) ──
     Бүлгийн нэрээс сэдэв (тоо, алгебр, координат, функц, тэгшитгэл, геометр, өгөгдөл, дараалал) → өнгө ба гадаргуугийн хэв.
     Гадаргуу удаан эргэлдэнэ (2 хавтан, plSpin), бүслүүр ард/урд хуваагдана (бөмбөрцгийн ард/өмнө), бөөмс нь тойрон гүйнэ (plRing). */
  var PTH = [[/тоо|бутархай|аравт|хувь|процент/i, 'num'], [/алгебр|илэрхийлэл|олон гишүүнт|үржигдэхүүн|зэрэг|язгуур/i, 'alg'],
    [/координат|вектор|хувиргалт|тэгш хэм|зөөлт/i, 'crd'], [/функц|график|парабол|гипербол|муруй|уламжлал|интеграл/i, 'fun'],
    [/тэгшитгэл|тэнцэтгэл|систем/i, 'eq'], [/тойрог|өнцөг|гурвалжин|дөрвөн|дүрс|геометр|биет|пифагор|талбай|эзлэхүүн|тригонометр|синус|косинус/i, 'geo'],
    [/статистик|өгөгдөл|магадлал|диаграм|харьцаа|пропорц|комбинатор/i, 'dat'], [/дараалал|прогресс|логарифм|илтгэгч/i, 'seq']];
  var PCOL = { num: ['#FFE2A6', '#FFA53D', '#A84E00'], alg: ['#AEF6E8', '#22C1A5', '#0A6255'], crd: ['#C2DAFF', '#4F8DFF', '#173C9C'],
    fun: ['#E0D4FF', '#8E6CFF', '#3A1FA6'], eq: ['#FFD0DF', '#FF6B99', '#991A4A'], geo: ['#E2F8B8', '#86C93A', '#3A720B'],
    dat: ['#C4F5FF', '#1FBFE3', '#08617C'], seq: ['#FFD9C4', '#FF7A45', '#9A320C'] };
  // Дараалсан хоёр бүлэг ижил сэдэвтэй бол хоёр дахь нь өөр өнгөөр (гарагууд ялгаатай харагдана)
  var PCOL2 = { num: ['#FFF3B0', '#F2C21B', '#7D5C00'], alg: ['#C2F7D2', '#36C46A', '#0F5F2B'], crd: ['#C6EEFF', '#33B5F0', '#06507A'],
    fun: ['#F7D6FF', '#D24BEA', '#701883'], eq: ['#FFD3D3', '#F2675F', '#8E1B16'], geo: ['#E8FAB8', '#6BAE12', '#2F5408'],
    dat: ['#B8F7F0', '#14B8A6', '#0B5E57'], seq: ['#FFE0B8', '#F59E3B', '#8A4A06'] };
  var TILT = [-18, 14, -9, 20, -22, 11, -14, 17];
  function ptheme(name, i) {
    var best = null, at = 1e9;
    PTH.forEach(function (t) { var m = t[0].exec(name || ''); if (m && m.index < at) { at = m.index; best = t[1]; } });
    return best || ['num', 'alg', 'crd', 'fun', 'eq', 'geo', 'dat', 'seq'][i % 8];
  }
  function rr(v) { return Math.round(v * 10) / 10; }
  function surf(t, R) {   // гадаргуугийн нэг хавтан (өргөн 2R): цагаан тунгалаг хэв
    var k = R / 44, h = '';
    function T(x, y, fs, s) { h += '<text x="' + rr(x * k) + '" y="' + rr(y * k) + '" font-size="' + rr(fs * k) + '">' + s + '</text>'; }
    function L(dd, w) { h += '<path d="' + dd.replace(/-?\d+(\.\d+)?/g, function (n) { return rr(+n * k); }) + '" stroke-width="' + rr((w || 2.2) * k) + '"/>'; }
    if (t === 'num') { T(-34, -8, 17, '7'); T(2, -22, 13, '3'); T(-14, 24, 13, '½'); T(16, 14, 16, '9'); T(-40, 34, 10, '1'); T(30, -26, 9, '5'); }
    else if (t === 'alg') { T(-30, -4, 19, 'x'); T(6, 20, 14, 'y²'); T(-8, -24, 11, 'a+b'); T(-40, 30, 10, '2x'); T(24, -10, 11, 'xy'); }
    else if (t === 'crd') { for (var i = -44; i < 44; i += 88 / 6) { L('M' + rr(i) + ' -44V44', 1.1); L('M-44 ' + rr(i) + 'H44', 1.1); } L('M-44 6H44', 2.6); L('M-8 -44V44', 2.6); }
    else if (t === 'fun') { L('M-44 0Q-33 -18 -22 0T0 0T22 0T44 0', 2.4); L('M-36 30C-28 -6 -12 -6 -4 30', 2.2); L('M8 -12C14 22 34 22 40 -12', 2.2); }
    else if (t === 'eq') { T(-32, 6, 22, '='); T(6, -16, 14, '&lt;'); T(12, 26, 13, '≥'); T(-40, 34, 10, 'x'); T(26, 6, 11, '±'); }
    else if (t === 'geo') { h += '<circle cx="' + rr(-16 * k) + '" cy="' + rr(-6 * k) + '" r="' + rr(14 * k) + '" stroke-width="' + rr(2.2 * k) + '" fill="none"/>'; L('M6 30L28 -6L40 30Z', 2.2); L('M-38 34H-12M-38 34L-20 14', 2); }
    else if (t === 'dat') { [[-38, 14], [-26, -4], [-14, 6], [-2, -16], [10, 0], [22, -8], [34, 10]].forEach(function (b) { h += '<rect x="' + rr(b[0] * k) + '" y="' + rr(b[1] * k) + '" width="' + rr(8 * k) + '" height="' + rr((34 - b[1]) * k) + '" rx="' + rr(2 * k) + '"/>'; }); }
    else { T(-36, -10, 13, '1'); T(-18, 0, 14, '3'); T(0, 10, 15, '5'); T(20, 20, 16, '7'); T(-30, 30, 10, '…'); }
    return h;
  }
  function palettes(list) {   // бүлэг бүрийн [сэдэв, өнгө]
    var out = [];
    list.forEach(function (c, i) {
      var th = ptheme(c.name, i), prev = out[i - 1];
      out.push([th, prev && prev[0] === th && prev[1] === PCOL[th] ? PCOL2[th] : PCOL[th]]);
    });
    return out;
  }
  function planetSvg(c, i, R, pal) {
    var th = pal[0], col = pal[1];
    var w = rr(3.5 * R + 14), h = rr(2 * R + 30), id = 'pl' + i, rx = rr(1.72 * R), ry = rr(0.4 * R), tilt = TILT[i % TILT.length];
    var spin = c.state === 'cur' ? 20 : c.state === 'lock' ? 46 : 30, rs = c.state === 'cur' ? 3.2 : c.state === 'lock' ? 12 : 6;
    var ringC = c.state === 'cur' ? '#FFD84A' : c.state === 'done' ? '#B8F5D2' : '#FFFFFF';
    function ring() {
      return '<ellipse rx="' + rx + '" ry="' + ry + '" fill="none" stroke="' + col[0] + '" stroke-opacity=".42" stroke-width="' + rr(R * 0.16) + '"/>' +
        '<ellipse rx="' + rr(rx * 0.9) + '" ry="' + rr(ry * 0.9) + '" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>' +
        '<ellipse class="pl-rp" rx="' + rx + '" ry="' + ry + '" fill="none" stroke="' + ringC + '" stroke-width="' + rr(R * 0.055 + 0.6) + '" stroke-linecap="round" style="animation-duration:' + rs + 's"/>';
    }
    var tile = surf(th, R);
    return '<svg class="ig pl" width="' + w + '" height="' + h + '" viewBox="' + rr(-w / 2) + ' ' + rr(-h / 2) + ' ' + w + ' ' + h + '" aria-hidden="true"><defs>' +
      '<radialGradient id="' + id + 'g" cx="34%" cy="30%" r="78%"><stop offset="0" stop-color="' + col[0] + '"/><stop offset=".52" stop-color="' + col[1] + '"/><stop offset="1" stop-color="' + col[2] + '"/></radialGradient>' +
      '<radialGradient id="' + id + 's" cx="32%" cy="28%" r="82%"><stop offset=".5" stop-color="#0B0630" stop-opacity="0"/><stop offset="1" stop-color="#0B0630" stop-opacity=".62"/></radialGradient>' +
      '<radialGradient id="' + id + 'h"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="' + id + 'a"><stop offset=".62" stop-color="' + col[1] + '" stop-opacity=".45"/><stop offset="1" stop-color="' + col[1] + '" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="' + id + 'c"><circle r="' + R + '"/></clipPath>' +
      '<clipPath id="' + id + 'b"><rect x="' + (-2 * R) + '" y="' + (-R) + '" width="' + 4 * R + '" height="' + R + '"/></clipPath>' +
      '<clipPath id="' + id + 'f"><rect x="' + (-2 * R) + '" y="0" width="' + 4 * R + '" height="' + R + '"/></clipPath></defs>' +
      '<circle r="' + rr(R * 1.32) + '" fill="url(#' + id + 'a)"/>' +
      '<g transform="rotate(' + tilt + ')"><g clip-path="url(#' + id + 'b)">' + ring() + '</g></g>' +
      '<circle r="' + R + '" fill="url(#' + id + 'g)"/>' +
      '<g clip-path="url(#' + id + 'c)"><g class="pl-sf" style="--pw:' + (-2 * R) + 'px;animation-duration:' + spin + 's">' +
      '<g class="pl-pt">' + tile + '</g><g class="pl-pt" transform="translate(' + 2 * R + ' 0)">' + tile + '</g></g></g>' +
      '<circle r="' + R + '" fill="url(#' + id + 's)"/>' +
      '<ellipse cx="' + rr(-R * 0.36) + '" cy="' + rr(-R * 0.4) + '" rx="' + rr(R * 0.36) + '" ry="' + rr(R * 0.2) + '" fill="url(#' + id + 'h)" transform="rotate(-32 ' + rr(-R * 0.36) + ' ' + rr(-R * 0.4) + ')"/>' +
      '<circle r="' + R + '" fill="none" stroke="' + col[0] + '" stroke-opacity=".55" stroke-width="1.4"/>' +
      '<g transform="rotate(' + tilt + ')"><g clip-path="url(#' + id + 'f)">' + ring() + '</g></g>' + pBadge(c.state, R, id) + '</svg>';
  }
  function pBadge(st, R, id) {
    var x = rr(R * 0.72), y = rr(-R * 0.72);
    if (st === 'done') return '<g transform="translate(' + x + ' ' + y + ')"><circle r="11" fill="#22C55E" stroke="#fff" stroke-width="2.5"/><path d="m-5 0 3.5 3.5L5.5-4" stroke="#fff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>';
    if (st === 'lock') return '<g transform="translate(' + x + ' ' + y + ')"><circle r="12" fill="#fff" fill-opacity=".92"/><rect x="-6" y="-3" width="12" height="9" rx="2.5" fill="#6A61A8"/><path d="M-3.8 -3v-2.6a3.8 3.8 0 0 1 7.6 0V-3" stroke="#6A61A8" stroke-width="2.2" fill="none"/></g>';
    if (st === 'open') {   // Хоёр туг (эзэмшигч 2026-11-08): Монгол Улсын төрийн далбаа ба CyberMath-ийн алтан туг (B)
      var k = rr(R / 50);
      // хоёр туг баруун тийш намирна (Соёмбо шонгийн талд)
      return '<g transform="translate(' + rr(-32 * k) + ' ' + rr(-40 * k) + ') rotate(-5) scale(' + k + ')">' +
        '<path d="M0 2V-34" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cy="-34.6" r="1.8" fill="#FFD84A"/>' +
        '<rect x="0.8" y="-33" width="30" height="15" fill="#C4272F"/><rect x="10.8" y="-33" width="10" height="15" fill="#015197"/>' + SOYOMBO + '</g>' +
        '<g transform="translate(' + rr(12 * k) + ' ' + rr(-48 * k) + ') rotate(5) scale(' + k + ')">' +
        '<path d="M0 2V-40" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cy="-40.6" r="1.8" fill="#FFD84A"/>' +
        '<g transform="translate(.8 -39)"><defs><linearGradient id="' + id + 'cf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD84A"/><stop offset="1" stop-color="#FFB300"/></linearGradient></defs>' +
        '<rect width="62" height="24.8" rx="2" fill="url(#' + id + 'cf)"/>' + (LOGO ? '<use href="#cmx-logo-n" x="1.9" y="5" width="17.4" height="15.4"/>' : '') +
        '<text x="' + (LOGO ? 22.9 : 5) + '" y="15.6" font-family="Nunito, sans-serif" font-weight="900" font-size="8.4" textLength="' + (LOGO ? 35.9 : 52) + '" lengthAdjust="spacingAndGlyphs" fill="#1E1A4D">CyberMath</text></g></g>';
    }
    return '';
  }
  /* CyberMath-ийн лого (нүүр сонголтын #cm-pick-ээс, хар хөх өнгөөр) — тугт <use>-ээр, газрын зурагт нэг удаа symbol болгоно */
  var LOGO = null;
  function logoSym() {
    if (LOGO === null) {
      var s = d.querySelector('#cm-pick .pk-logo');
      LOGO = s ? s.innerHTML.replace(/#FFC113|#D79F01/gi, '#1E1A4D') : '';
    }
    return LOGO ? '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><symbol id="cmx-logo-n" viewBox="0 0 367 325">' + LOGO + '</symbol></defs></svg>' : '';
  }
  // Соёмбо (жижиг хэмжээнд хялбаршуулсан): гал, нар, сар, гурвалжин, хэвтээ зураас, арга билэг, хоёр багана
  var SOYOMBO = '<g fill="#F9CF02"><path d="M5.8 -32.4 7.1 -30.1H4.5Z"/><circle cx="5.8" cy="-29.1" r=".9"/>' +
    '<path d="M4.55 -28.1A1.25 1.25 0 0 0 7.05 -28.1A1.25 .75 0 0 1 4.55 -28.1Z"/><path d="M4.4 -26.6H7.2L5.8 -25.4Z"/><rect x="4.4" y="-25" width="2.8" height=".6"/>' +
    '<circle cx="5.8" cy="-23.1" r="1.3"/><rect x="4.4" y="-21.5" width="2.8" height=".6"/><path d="M4.4 -20.6H7.2L5.8 -19.4Z"/>' +
    '<rect x="3.3" y="-26.6" width=".6" height="7.3"/><rect x="7.7" y="-26.6" width=".6" height="7.3"/></g>' +
    '<path d="M5.8 -24.4a.65 .65 0 0 1 0 1.3a.65 .65 0 0 0 0 1.3" stroke="#C4272F" stroke-width=".35" fill="none"/>';
  // Шувуу гарагийн орой дээр зогсоно: пин (шувуу) өндөр ≈ 1.095 × өргөн (96 / утсанд 72)
  function pinOff(Hh) { return Hh < 400 ? PR_M + 73 : PR + 99; }
  var PR = 50, PR_M = 32;
  function decoHtml(s) {
    return '<div class="hx-deco"><i class="stars"></i><i class="neb n1"></i><i class="neb n2"></i>' + (s === 'night' ? '<i class="moon"></i>' : '<i class="sun"></i>') + '</div>';
  }
  function lvHtml() {
    var lv = txt('nav-level-badge').replace(/^Lv\s*/i, ''), bar = d.getElementById('xp-bar'), u = user() || {};
    var w = bar && bar.style.width ? bar.style.width : '0%';
    return '<div class="lv">Түвшин ' + esc(lv || '1') + ' · ' + num(u.xp || 0) + ' XP<i><span style="width:' + esc(w) + '"></span></i></div>';
  }
  function helloP() {
    var n = parseInt(txt('streak-count'), 10) || 0;
    return 'Алхам алхмаар аварга болцгооё' + (n > 0 ? ' · ' + n + ' өдөр дараалан' : '');
  }
  function skyHtml(M) {
    var u = user() || {}, nm = noEmoji(u.firstName || u.first_name || ''), s = sky(), T = isTeacher();
    var h = '<section class="hx-sky ' + s + '">' + decoHtml(s) +
      '<div class="hx-hi"><h1>Сайн уу' + (nm ? ', ' + esc(nm) : '') + '!</h1><p>' + esc(T ? 'Алхам алхмаар аварга болцгооё · Багшийн самбар' : helloP()) + '</p></div>';
    if (T || !M) {
      return h + '<div class="hx-stat">' + lvHtml() + '</div><div class="hx-tch"><div class="ck">' + chick() + '</div><p>' + (T ? 'Ангиараа хамтдаа аялцгаая!' : 'Аялал удахгүй эхэлнэ') + '</p></div>' +
        (T ? teacherPanel() : '<div class="hx-panel"><div class="hx-eb"><i></i>Хичээлийн зам</div><h2>Алхам алхмаар суралцъя</h2><div class="mt">Сэдэв бүрийг бодлого бодож давна.</div>' +
          '<div class="ac" style="margin-top:16px"><button type="button" class="hx-btn gold" data-go="path">' + IC.map + 'Зам руу</button></div></div>') + '</section>';
    }
    if (M.loading) {
      return h + '<div class="hx-map"><div class="hx-lay" style="width:100%"><div class="hx-load"><i></i><i></i><i></i></div></div></div>' +
        '<div class="hx-panel"><div class="hx-eb"><i></i>Газрын зураг</div><h2>Ачаалж байна…</h2></div></section>';
    }
    var n = M.list.length, Hh = mapH(), P = geo(n, Hh), W = X0 * 2 + (n - 1) * GAP, R = Hh < 400 ? PR_M : PR, ph = 2 * R + 30, PAL = palettes(M.list);
    // Гарагуудын тойрог зам (төвүүдээр): бүдэг гэрэлтэлт + алтан тасархай
    var lay = logoSym() + '<svg class="hx-road" width="' + (W + 60) + '" height="' + Hh + '" aria-hidden="true"><path d="' + roadD(P, -16) + '" fill="none" stroke="rgba(190,170,255,.16)" stroke-width="14" stroke-linecap="round"/>' +
      '<path d="' + roadD(P, -16) + '" fill="none" stroke="#FFD84A" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="2 12" opacity=".75"/></svg>';
    M.list.forEach(function (c, i) {
      var ss = c.state === 'done' ? 'Дууссан' : c.state === 'lock' ? 'Түгжээтэй' : c.done + '/' + c.total + ' сэдэв';
      lay += '<button type="button" class="hx-isl ' + c.state + (SEL === i ? ' sel' : '') + '" data-isl="' + i + '" style="left:' + P[i].x + 'px;top:' + (P[i].y - ph / 2) + 'px;--bd:' + (-i * 0.9) + 's" ' +
        'aria-label="' + esc((i + 1) + '-р гараг: ' + c.name + ', ' + ss) + '">' + planetSvg(c, i, R, PAL[i]) + '<span class="nm">' + (i + 1) + '. ' + esc(c.name) + '</span><span class="ss">' + ss + '</span></button>';
    });
    var pinTop = P[M.cur].y - pinOff(Hh);
    lay += '<div class="hx-pin" style="left:' + P[M.cur].x + 'px;top:' + pinTop + 'px"><div class="bal">' + BALLOON + '</div><div class="ck">' + chick() + '</div></div>';
    return h + '<div class="hx-stat"><b>' + (M.cur + 1) + ' / ' + n + '</b><span>гараг · ' + esc(M.g) + '-р анги</span>' + lvHtml() + '</div>' +
      '<div class="hx-map" data-w="' + W + '"><div class="hx-lay' + (SEL != null ? ' zoom' : '') + '" style="width:' + (W + 60) + 'px;height:' + Hh + 'px' +
      (SEL != null ? ';--zx:' + P[SEL].x + 'px' : '') + '">' + lay + '</div></div>' + panelHtml(M) + '</section>';
  }
  function panelHtml(M) {
    if (SEL != null && M.list[SEL]) {
      var c = M.list[SEL], nx = M.next, rows = '';
      c.topics.forEach(function (t) {
        var ok = M.done.indexOf(t.slot) >= 0, now = nx && nx.slot === t.slot, op = isOpen(t.slot, M.done, M.pl);
        var cls = ok ? 'ok' : now ? 'now' : op ? 'op' : 'lk';
        rows += '<li><button type="button" class="hx-tp ' + cls + '" data-lesson="' + t.slot + '"><span class="dt">' + (ok ? IC.check : now ? IC.play : op ? '' : IC.lock) + '</span>' +
          '<span class="tn">' + esc(t.name) + '</span><span class="ch">' + (op || ok ? IC.chev : '') + '</span></button></li>';
      });
      var pct = c.total ? Math.round(c.done * 100 / c.total) : 0;
      return '<div class="hx-panel"><button type="button" class="hx-back" data-isl="-1">' + IC.back + 'Газрын зураг</button>' +
        '<div style="margin-top:8px"><span class="hx-chip st' + (c.state === 'done' ? ' done' : '') + '">' + (c.i + 1) + '-р гараг · ' + (c.state === 'done' ? 'Дууссан' : c.state === 'lock' ? 'Түгжээтэй' : 'Нээлттэй') + '</span></div>' +
        '<h2>' + esc(c.name) + '</h2><div class="pw"><span>' + c.done + '/' + c.total + '</span><div class="hx-prog"><i style="width:' + pct + '%"></i></div><span>' + pct + '%</span></div>' +
        '<ul class="hx-tl">' + rows + '</ul></div>';
    }
    var nx = M.next, cc = M.list[M.cur];
    if (!nx || nx.slot == null) {
      return '<div class="hx-panel"><div class="hx-eb"><i></i>Баяр хүргэе</div><h2>Бүх гарагийг туулсан байна</h2><div class="mt">Замаар давтлага хийж медалиа ахиулаарай.</div>' +
        '<div class="ac" style="margin-top:16px"><button type="button" class="hx-btn gold" data-go="path">' + IC.map + 'Замыг харах</button></div></div>';
    }
    var p2 = cc && cc.total ? Math.round(cc.done * 100 / cc.total) : 0;
    return '<div class="hx-panel"><div class="hx-eb"><i></i>' + (nx.done ? 'Дараагийн зогсоол' : 'Аялал эхлэх') + '</div><h2>' + esc(nx.name) + '</h2>' +
      '<div class="mt">' + (cc ? (M.cur + 1) + '-р гараг · <b>' + esc(cc.name) + '</b>' : '') + '</div>' +
      (cc ? '<div class="pw"><span>' + cc.done + '/' + cc.total + '</span><div class="hx-prog"><i style="width:' + p2 + '%"></i></div><span>' + p2 + '%</span></div>' : '<div style="height:14px"></div>') +
      '<div class="ac"><button type="button" class="hx-btn gold" data-lesson="' + nx.slot + '">' + IC.play + 'Аялалаа үргэлжлүүлэх</button>' +
      '<button type="button" class="hx-btn ghost sm" data-isl="' + M.cur + '">Гарагийг харах</button></div></div>';
  }
  function teacherPanel() {
    var hc = hasClassroom();
    return '<div class="hx-panel"><div class="hx-eb"><i></i>Багшийн самбар</div><h2>Ангиа удирдах</h2><div class="mt">Хичээл оноож, сурагч бүрийн гүйцэтгэл, түвшин тогтоох сорилын дүнг хянана.</div>' +
      '<div class="ac" style="margin-top:16px">' + (hc ? '<button type="button" class="hx-btn gold" data-go="classroom">' + IC.cls + 'Миний ангиуд</button>' : '') +
      '<button type="button" class="hx-btn ' + (hc ? 'ghost sm' : 'gold') + '" data-go="mathlet">' + IC.bolt + 'Mathlet тэмцээн</button></div></div>';
  }

  /* ── Доод хэсэг ── */
  function belowHtml() {
    var T = isTeacher(), prem = premium(), g0 = GAMES[0], g = grade();
    var chip = function (k) { return FREE.indexOf(k) >= 0 ? '<span class="hx-chip">Үнэгүй</span>' : (!prem ? '<span class="hx-chip pr">' + IC.crown + 'Premium</span>' : ''); };
    var games = '<section class="hx-card hx-gm"><h3>' + IC.games + 'Өнөөдрийн тоглоом<button type="button" class="hx-link" data-go="games">Бүгд (17)' + IC.chev + '</button></h3>' +
      '<button type="button" class="hx-feat" data-game="' + g0[0] + '"><img src="' + g0[3] + '" alt="" loading="lazy" decoding="async"><span class="tp">' + chip(g0[0]) + '</span>' +
      '<span class="tx"><b>' + esc(g0[1]) + '</b><small>' + esc(g0[2]) + '</small><span class="hx-btn gold sm">' + IC.play + 'Тоглох</span></span></button>' +
      '<div class="hx-gl">' + GAMES.slice(1).map(function (x) {
        return '<button type="button" class="hx-gi" data-game="' + x[0] + '" title="' + esc(x[1] + ' — ' + x[2]) + '"><span class="im"><img src="' + x[3] + '" alt="" loading="lazy" decoding="async">' + chip(x[0]) + '</span><b>' + esc(x[1]) + '</b></button>';
      }).join('') + '</div></section>';
    var L = lb(), u = user() || {}, rows;
    if (!L) rows = '<div class="hx-empty">Ачаалж байна…</div>';
    else if (!L.length) rows = '<div class="hx-empty">Одоогоор жагсаалт хоосон байна.</div>';
    else {
      var me = String(u.email || '').toLowerCase(), mi = -1;
      L.forEach(function (x, i) { if (mi < 0 && ((u.id && x.id === u.id) || (me && String(x.email || '').toLowerCase() === me))) mi = i; });
      if (mi < 0) {   // имэйл/нууц үгээр нэвтэрсэн бол id ирдэггүй — нэр + XP-ээр (cm-compete.js-тэй ижил)
        var sn = shortName(u), cand = [], ux = +u.xp || 0;
        L.forEach(function (x, i) { if (shortName(x) === sn) cand.push(i); });
        var ex = cand.filter(function (i) { return (+L[i].xp || 0) === ux; });
        mi = ex.length === 1 ? ex[0] : cand.length === 1 && Math.abs((+L[cand[0]].xp || 0) - ux) <= Math.max(200, ux * 0.05) ? cand[0] : -1;
      }
      rows = '<ol>' + L.slice(0, 4).map(function (x, i) {
        var mine = i === mi;
        return '<li class="p' + (i + 1) + (mine ? ' me' : '') + '"><span class="r">' + (i + 1) + '</span><span class="av">' + (mine ? myAv() : avHtml(x.avatar)) + '</span><span class="nm">' +
          (mine ? 'Та' : esc(shortName(x))) + '</span><span class="x">' + num(x.xp) + ' XP</span></li>';
      }).join('') + (mi >= 4 ? '<li class="me"><span class="r">' + (mi + 1) + '</span><span class="av">' + myAv() + '</span><span class="nm">Та</span><span class="x">' + num(L[mi].xp) + ' XP</span></li>' : '') + '</ol>';
    }
    var lbc = '<section class="hx-card hx-lb"><h3>' + IC.trophy + 'Тэргүүлэгчид<button type="button" class="hx-link" data-go="leaderboard">Бүгд' + IC.chev + '</button></h3>' + rows + '</section>';
    var n = parseInt(txt('streak-count'), 10) || 0, w = '';
    for (var i = 0; i < 7; i++) {
      var dot = d.getElementById('sd-' + i), lab = dot && dot.textContent.trim() ? dot.textContent.trim() : DAYS[i];
      var st = dot && dot.classList.contains('today') ? 'td' : dot && dot.classList.contains('done') ? 'ok' : '';
      w += '<span class="' + st + '"><b>' + (st === 'td' ? IC.flame : st === 'ok' ? IC.check : '') + '</b>' + esc(lab) + '</span>';
    }
    var pl = null;
    try { pl = (JSON.parse(lsGet('cm_placement') || '{}') || {})[g] || null; } catch (e) {}
    var side = '<div class="hx-side"><div class="hx-mini f"><span class="ic">' + IC.flame + '</span><span class="tx"><b>' + n + ' өдөр дараалан</b><small>' +
      esc(txt('streak-subtitle') || 'Өдөр бүр орж ирснээр streak нэмэгдэнэ!') + '</small></span><div class="hx-wk">' + w + '</div></div>' +
      '<button type="button" class="hx-mini m" data-go="mathlet"><span class="ic">' + IC.bolt + '</span><span class="tx"><b>Mathlet</b><small>' +
      (T ? 'Ангиараа шууд тэмцээн эхлүүлэх' : 'Кодоор ангийн тэмцээнд нэгдэх') + '</small></span><span class="go">' + IC.chev + '</span></button>' +
      '<button type="button" class="hx-mini e" data-go="exam"><span class="ic">' + IC.target + '</span><span class="tx"><b>Түвшин тогтоох сорил</b><small>' +
      (T ? 'Сурагчдын дүн ангийн дэлгэрэнгүйд' : (pl && pl.name ? 'Эхлэх сэдэв: ' + esc(noEmoji(pl.name)) : 'Аль сэдвээс эхлэхээ мэд')) + '</small></span><span class="go">' + IC.chev + '</span></button>' +
      '<button type="button" class="hx-mini t" data-act="@tutorial"><span class="ic">' + IC.video + '</span><span class="tx"><b>Зааварчилгаа</b><small>CyberMath-ыг хэрхэн ашиглах вэ</small></span><span class="go">' + IC.chev + '</span></button></div>';
    return '<div class="hx-below">' + games + lbc + side + '</div>';
  }

  /* ── Зурах ── */
  var provT = 0, provN = 0;
  function render(force) {
    var el = d.getElementById('tab-home'); if (!el) return;
    var T = isTeacher(), M = T ? null : model(), P0 = window._PATH || {};
    // Зам/бүлэг/нэрс хараахан ачаалагдаагүй бол (замын node-ууд, plan) хэсэг хугацаанд дахин шалгана
    var prov = !T && (!M || M.loading || M.fb || (M.next && /^Хичээл \d+$/.test(M.next.name)));
    clearTimeout(provT);
    if (prov && provN < 20) { provN++; provT = setTimeout(function () { if (on && activeTab() === 'home') render(false); }, 1500); }
    if (!prov) provN = 0;
    var sig = JSON.stringify([sky(), mapH(), T, M && M.loading, M && M.fb, M && M.list && M.list.map(function (c) { return c.state + c.done + c.name; }), M && M.cur,
      M && M.next && M.next.slot, M && M.next && M.next.name, SEL, P0.on, P0.count, txt('streak-count'), txt('nav-level-badge'), (user() || {}).firstName]);
    var skyEl = el.querySelector('.hx-sky');
    if (!FLYING && (force || !skyEl || sig !== LASTSIG)) {
      var keep = skyEl && skyEl.querySelector('.hx-map') ? skyEl.querySelector('.hx-map').scrollLeft : null;
      var tmp = d.createElement('div'); tmp.innerHTML = skyHtml(M);
      if (skyEl) el.replaceChild(tmp.firstChild, skyEl); else el.insertBefore(tmp.firstChild, el.firstChild);
      LASTSIG = sig;
      afterSky(M, keep);
    }
    var below = el.querySelector('.hx-below'), tmp2 = d.createElement('div'); tmp2.innerHTML = belowHtml();
    if (below) el.replaceChild(tmp2.firstChild, below); else el.appendChild(tmp2.firstChild);
  }
  function afterSky(M, keep) {
    var mapEl = d.querySelector('#tab-home .hx-map'); if (!mapEl || !M || !M.list) return;
    var Hh = mapH(), P = geo(M.list.length, Hh), lay = mapEl.querySelector('.hx-lay');
    if (lay) lay.style.width = Math.max(mapEl.clientWidth, (+mapEl.getAttribute('data-w') || 0) + 60) + 'px';
    var target = SEL != null ? P[SEL].x : P[M.cur].x;
    if (keep != null && SEL == null) mapEl.scrollLeft = keep;
    else mapEl.scrollTo({ left: Math.max(0, target - mapEl.clientWidth * 0.5), behavior: keep != null && !reduced() ? 'smooth' : 'auto' });
    if (!M.fb) maybeFly(M, mapEl, P, Hh);   // түр (бүлэггүй) зураг дээр нислэгийн тэмдгийг үрэхгүй
  }
  /* Сорилын нислэг: cm_placement[анги].at шинэ бол (нэг удаа) шувуу 1-р арлаас санал болгосон арал руу бөмбөлгөөр нисэнэ */
  function maybeFly(M, mapEl, P, Hh) {
    var k = '';
    try { var o = JSON.parse(lsGet('cm_placement') || '{}') || {}; k = o[M.g] && o[M.g].at ? String(o[M.g].at) : ''; } catch (e) {}
    if (!k || lsGet('cmx_flown_' + M.g) === k) return;
    lsSet('cmx_flown_' + M.g, k);
    if (M.cur <= 0) return;
    var skyEl = mapEl.parentNode, msg = d.createElement('div');
    msg.className = 'hx-fly'; msg.innerHTML = IC.balloon + 'Түвшин тогтоох сорилын дүнгээр ' + (M.cur + 1) + '-р гараг руу нислээ!';
    skyEl.appendChild(msg);
    setTimeout(function () { if (msg.parentNode) msg.parentNode.removeChild(msg); }, 6000);
    var pin = mapEl.querySelector('.hx-pin'); if (!pin || reduced()) return;
    var off = pinOff(Hh), from = P[0], to = P[M.cur], t0 = 0, D = Math.min(4200, 2200 + 240 * M.cur);
    FLYING = true; pin.classList.add('fly');
    pin.style.left = from.x + 'px'; pin.style.top = (from.y - off) + 'px';
    mapEl.scrollLeft = 0;
    function step(t) {
      if (!t0) t0 = t;
      var u = Math.min(1, (t - t0) / D), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      var x = from.x + (to.x - from.x) * e, y = from.y + (to.y - from.y) * e - Math.sin(Math.PI * e) * (Hh < 400 ? 60 : 100);
      pin.style.left = x + 'px'; pin.style.top = (y - off) + 'px';
      mapEl.scrollLeft = Math.max(0, x - mapEl.clientWidth * 0.5);
      if (u < 1) requestAnimationFrame(step);
      else { pin.classList.remove('fly'); pin.classList.add('land'); FLYING = false; }
    }
    setTimeout(function () { requestAnimationFrame(step); }, 500);
  }
  function onHomeClick(e) {
    var b = e.target.closest('[data-go],[data-game],[data-lesson],[data-isl],[data-act]'); if (!b || FLYING) return;
    if (b.hasAttribute('data-isl')) { var i = +b.getAttribute('data-isl'); SEL = i < 0 || SEL === i ? null : i; render(true); return; }
    if (b.hasAttribute('data-go')) { go(b.getAttribute('data-go')); return; }
    if (b.hasAttribute('data-act')) { act(b.getAttribute('data-act')); return; }
    if (b.hasAttribute('data-lesson')) { var s = +b.getAttribute('data-lesson'); try { if (typeof window.tryOpenLesson === 'function') window.tryOpenLesson(s); } catch (x) {} return; }
    var k = b.getAttribute('data-game');
    go('games');
    setTimeout(function () { try { if (typeof window.startGame === 'function') window.startGame(k); } catch (x) {} }, 60);
  }

  /* ── Дээд цэс (компьютер) ── */
  var nav = null, more = null, moreBtn = null;
  function buildNav() {
    if (nav) return;
    var nb = d.querySelector('#cybermath-app .navbar'), stats = nb && nb.querySelector('.nav-stats');
    if (!nb || !stats) return;
    nav = d.createElement('nav'); nav.id = 'cmx-tabs'; nav.setAttribute('aria-label', 'Үндсэн цэс');
    nav.innerHTML = TOP.map(function (n) { return '<a href="#" data-k="' + n[0] + '" title="' + n[1] + '">' + n[2] + '<span>' + n[1] + '</span></a>'; }).join('') +
      '<button type="button" class="more" aria-haspopup="menu" aria-expanded="false" title="Цааш">' + IC.grid + '<span>Цааш</span>' + IC.down + '</button>';
    nb.insertBefore(nav, stats);
    moreBtn = nav.querySelector('.more');
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('[data-k]');
      if (a) { e.preventDefault(); closeMore(); go(a.getAttribute('data-k')); return; }
      if (e.target.closest('.more')) { e.preventDefault(); if (more && more.classList.contains('on')) closeMore(); else openMore(); }
    });
    d.addEventListener('click', function (e) { if (more && more.classList.contains('on') && !more.contains(e.target) && !moreBtn.contains(e.target)) closeMore(); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeMore(); });
    window.addEventListener('resize', closeMore);
  }
  function openMore() {
    if (!more) {
      more = d.createElement('div'); more.id = 'cmx-more'; more.setAttribute('role', 'menu');
      more.addEventListener('click', function (e) { var b = e.target.closest('[data-a]'); if (!b) return; closeMore(); act(b.getAttribute('data-a')); });
      d.body.appendChild(more);
    }
    more.innerHTML = MORE.filter(function (m) { return m[0] !== 'classroom' || hasClassroom(); }).map(function (m) {
      return '<button type="button" role="menuitem" data-a="' + m[0] + '">' + m[2] + m[1] + (m[3] ? '<em>' + m[3] + '</em>' : '') + '</button>';
    }).join('');
    var r = moreBtn.getBoundingClientRect();
    more.style.top = Math.round(r.bottom + 8) + 'px';
    more.style.left = Math.round(Math.max(12, Math.min(window.innerWidth - 262, r.left + r.width / 2 - 125))) + 'px';
    more.classList.add('on'); moreBtn.setAttribute('aria-expanded', 'true');
    var f = more.querySelector('button'); if (f) f.focus();
  }
  function closeMore() { if (more) more.classList.remove('on'); if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false'); }
  function sync() {
    var k = activeTab(), inTop = TOP.some(function (n) { return n[0] === k; });
    if (nav) {
      [].forEach.call(nav.querySelectorAll('a[data-k]'), function (a) {
        var on = a.getAttribute('data-k') === k;
        a.classList.toggle('on', on);
        if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
      });
      if (moreBtn) moreBtn.classList.toggle('on', !inTop);
    }
    if (k === 'home') render(false);
  }

  /* ── Идэвхжүүлэлт ── */
  var app = null, on = false, homed = false, tmr = 0;
  function later() { clearTimeout(tmr); tmr = setTimeout(function () { if (on && activeTab() === 'home') render(false); }, 150); }
  function update() {
    var v = visible(app);
    if (v !== on) { on = v; H.classList.toggle('cmx', v); if (!v) { closeMore(); homed = false; SEL = null; } }   // гарч ороход дахин «Нүүр»-ээс
    if (!v) return;
    buildNav(); sync();
    if (!homed) {
      homed = true;
      // Анхны нээлт: зам (анхдагч таб) дээр байвал, тусгай хаяггүй бол «Нүүр»
      if (activeTab() === 'path' && !(location.hash && location.hash.length > 1)) go('home');
    }
  }
  function init() {
    try {
      app = d.getElementById('cybermath-app');
      if (!app || !ensureHome()) return;
      new MutationObserver(update).observe(app, { attributes: true, attributeFilter: ['style', 'class'] });
      var mo = new MutationObserver(function () { if (on) sync(); });
      [].forEach.call(d.querySelectorAll('.tab-content[id^="tab-"]'), function (c) { mo.observe(c, { attributes: true, attributeFilter: ['class'] }); });
      // Оноо, streak, зүрх, түвшин, ангийн товч өөрчлөгдөхөд (хичээл дууссаны дараа г.м.) нүүр шинэчлэгдэнэ
      var mo2 = new MutationObserver(later);
      ['streak-count', 'heart-count', 'xp-display', 'nav-level-badge', 'nav-avatar-inner', 'sd-0', 'sd-6'].forEach(function (id) {
        var el = d.getElementById(id); if (el) mo2.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
      });
      var cb = tabBtn('classroom'); if (cb) mo2.observe(cb, { attributes: true, attributeFilter: ['style'] });
      var resizeT = 0;
      window.addEventListener('resize', function () { clearTimeout(resizeT); resizeT = setTimeout(function () { if (on && activeTab() === 'home') render(false); }, 200); });
      update();
    } catch (e) { try { console.warn('cm-ui', e); } catch (x) {} }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
