/* CyberMath — «Амжилт» табын шинэ цайвар загвар: C «Шатлалын зам» (эзэмшигч 3 саналаас сонгосон). Хэв маяг: cm-ach.css
   Сайтын өгөгдөл, функц хэвээр: getAchievementsList() (renderAchievements-ийн эх), _currentUser, амьтны карт #pet-card (updatePetCard бөглөнө).
   Табын эхэнд #mx-ach зурна; эх харагдац далд үлдэнэ (таб дээр .mx-on). Өгөгдөл танигдахгүй бол эх нь хэвээр.
   «Өндгөө гаргах» нь сайтын #pet-action-btn-ийг дарна (openHatchModal). Унтраах: ?ui=old (cm-ui.js-тэй нэг түлхүүр cm_ui). Embed горимд юу ч хийхгүй. */
(function () {
  'use strict';
  var d = document, H = d.documentElement;
  if (window.top !== window.self || H.classList.contains('cm-embed')) return;
  try {
    var q = new URLSearchParams(location.search).get('ui');
    if (q === 'old' || (q !== 'new' && localStorage.getItem('cm_ui') === 'old')) return;
  } catch (e) {}

  function S(p) { return '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">' + p + '</svg>'; }
  var G = {
    book: '<path d="M3.5 5.3c0-.8.7-1.3 1.4-1.2 2.3.3 4.4 1 6.1 2.2V20c-1.8-1.1-3.9-1.7-6.1-2-.8-.1-1.4-.7-1.4-1.4zM20.5 5.3c0-.8-.7-1.3-1.4-1.2-2.3.3-4.4 1-6.1 2.2V20c1.8-1.1 3.9-1.7 6.1-2 .8-.1 1.4-.7 1.4-1.4z"/>',
    flame: '<path d="M12 2.2c.5 2.9 2.2 4.6 3.8 6.4 1.6 1.8 2.9 3.7 2.9 6.3A6.7 6.7 0 0 1 12 21.6a6.7 6.7 0 0 1-6.7-6.7c0-2.8 1.4-4.9 3.3-6.5-.1 1.9.5 3.3 1.8 4.1-.2-3.6.8-7.2 1.6-10.3z"/>',
    bolt: '<path d="M14 2 5 14h6.5L10 22l9-12h-6.5z"/>',
    gem: '<path d="M6.5 3.5h11L21.5 9 12 21 2.5 9z"/>',
    crown: '<path d="M4 17 2.6 7.2l5 3.7L12 4.2l4.4 6.7 5-3.7L20 17zM4.6 18.4h14.8V21H4.6z"/>',
    star: '<path d="M12 2.5l2.9 6 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.2 1.3-6.6L2.5 9.3l6.6-.8z"/>',
    lock: '<path d="M7 10V8a5 5 0 0 1 10 0v2h.5A1.5 1.5 0 0 1 19 11.5v8a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-8A1.5 1.5 0 0 1 6.5 10zm2.5 0h5V8a2.5 2.5 0 0 0-5 0z"/>',
    heart: '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 5.3 3 1.7-1.8 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/>',
    paw: '<circle cx="5.4" cy="10.2" r="2.2"/><circle cx="9.2" cy="5.7" r="2.3"/><circle cx="14.8" cy="5.7" r="2.3"/><circle cx="18.6" cy="10.2" r="2.2"/><path d="M12 11c3 0 6.2 3.6 6.2 6.4 0 2-1.6 2.9-3.3 2.6-1.1-.2-1.9-.7-2.9-.7s-1.8.5-2.9.7c-1.7.3-3.3-.6-3.3-2.6C5.8 14.6 9 11 12 11z"/>',
    trophy: '<path d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.3A5 5 0 0 1 13 14.9V17h3v3H8v-3h3v-2.1A5 5 0 0 1 8.3 12H8a4 4 0 0 1-4-4V5h3zm0 4H6v1a2 2 0 0 0 1 1.7zm10 0v2.7A2 2 0 0 0 18 8V7z"/>',
    egg: '<path d="M12 2.5c3.6 0 7 5.6 7 10.8 0 4.6-3 8.2-7 8.2s-7-3.6-7-8.2C5 8.1 8.4 2.5 12 2.5z"/>'
  };
  // Ангилал: өнгө, нэгж («… үлдлээ»), дүрс
  var CAT = {
    les: { n: 'Хичээл', u: 'хичээл', ic: 'book', c: '#7B52EE', c2: '#B79CFF', cd: '#5B3BD9', bg: '#EFE9FF' },
    str: { n: 'Streak', u: 'өдөр', ic: 'flame', c: '#FF6B2C', c2: '#FFB27A', cd: '#D9480F', bg: '#FFEDE3' },
    xp: { n: 'XP', u: 'XP', ic: 'bolt', c: '#F5A400', c2: '#FFD84A', cd: '#A86E00', bg: '#FFF4D2' },
    gem: { n: 'Gem', u: 'gem', ic: 'gem', c: '#12B5C8', c2: '#7DE7F2', cd: '#0A8696', bg: '#DFF8FB' },
    oth: { n: 'Бусад', u: '', ic: 'star', c: '#7B52EE', c2: '#B79CFF', cd: '#5B3BD9', bg: '#EFE9FF' }
  };
  var ORDER = ['les', 'str', 'xp', 'gem', 'oth'];
  // Медалийн зэрэг: 1 хүрэл, 2 мөнгө, 3 алт, 4 нил ягаан, 5 цэнхэр (gem); 0 — түгжээтэй (саарал)
  var TIER = { first_lesson: 1, lessons_10: 2, lessons_50: 3, lessons_100: 4, streak_3: 1, streak_7: 2, streak_30: 4, xp_100: 1, xp_500: 2, xp_1000: 3, xp_5000: 4, gems_500: 5 };
  var EMB = { 0: '#A39CBD', 1: '#8A4614', 2: '#56627E', 3: '#966100', 4: '#fff', 5: '#fff' };
  function gr(id, a, b, c, rad) {
    return rad ? '<radialGradient id="mxa-' + id + '" cx="36%" cy="30%" r="82%"><stop offset="0" stop-color="' + a + '"/><stop offset=".55" stop-color="' + b + '"/><stop offset="1" stop-color="' + c + '"/></radialGradient>'
      : '<linearGradient id="mxa-' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
  }
  var DEFS = '<svg class="mxa-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>' +
    gr('e1', '#F7BE8A', '#8F4C17') + gr('f1', '#FFE1C2', '#E8924A', '#B5631F', 1) + gr('e2', '#FFFFFF', '#7C879F') + gr('f2', '#FFFFFF', '#CCD3E3', '#8D98B2', 1) +
    gr('e3', '#FFE68A', '#B07500') + gr('f3', '#FFF6C9', '#FFC113', '#D08F00', 1) + gr('e4', '#CDBBFF', '#3F22B0') + gr('f4', '#E9E1FF', '#8D66FF', '#5432D4', 1) +
    gr('e5', '#B2F3F9', '#067482') + gr('f5', '#E2FCFE', '#2DD2E2', '#0A97A8', 1) + gr('e0', '#F1EEF8', '#B3ADC9') + gr('f0', '#FBFAFE', '#E2DEEE', '#C5BFD9', 1) +
    gr('ra', '#8D66FF', '#5B3BD9') + gr('rb', '#7448F0', '#4527B8') + gr('r0', '#D8D3E8', '#BDB6D3') +
    '<linearGradient id="mxa-ring" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD84A"/><stop offset="1" stop-color="#FF9F1C"/></linearGradient></defs></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }   // 5240 → «5 240»
  function short(n) { return n >= 1000 && n % 1000 === 0 ? (n / 1000) + 'K' : String(n); }
  function catOf(id) { return /^(first_lesson|lessons_)/.test(id) ? 'les' : /^streak_/.test(id) ? 'str' : /^xp_/.test(id) ? 'xp' : /^gems?_/.test(id) ? 'gem' : 'oth'; }
  function pctOf(a) { return a.target > 0 ? Math.round(a.progress / a.target * 100) : 0; }
  function left(a) { return (a.target - a.progress) + (CAT[a.cat].u ? ' ' + CAT[a.cat].u : '') + ' үлдлээ'; }
  function unlockedN(l) { return l.filter(function (a) { return a.unlocked; }).length; }

  // Сайтын getAchievementsList()-ээс: ангилал, зэрэг, дугаар; ангилал дотор зорилтоор эрэмбэлнэ
  function data() {
    if (typeof window.getAchievementsList !== 'function') return null;
    var list; try { list = window.getAchievementsList(); } catch (e) { return null; }
    if (!list || !list.length) return null;
    var u = window._currentUser || {}, cats = {};
    list.forEach(function (a) {
      if (!a || !a.id) return;
      var k = catOf(String(a.id)), t = Math.max(0, +a.target || 0);
      (cats[k] = cats[k] || []).push({ id: String(a.id), name: a.name || '', desc: a.desc || '', target: t, progress: Math.max(0, Math.min(+a.progress || 0, t)), unlocked: !!a.unlocked, cat: k, ic: a.id === 'xp_5000' ? 'crown' : CAT[k].ic });
    });
    var all = [];
    ORDER.forEach(function (k) {
      if (!cats[k]) return;
      cats[k].sort(function (a, b) { return a.target - b.target; });
      cats[k].forEach(function (a, i) { a.tier = TIER[a.id] || (k === 'gem' ? 5 : Math.min(4, i + 1)); a.num = short(a.target); all.push(a); });
    });
    if (!all.length) return null;
    var next = all.filter(function (a) { return !a.unlocked && a.target > 0; }).sort(function (x, y) {
      return (y.progress / y.target - x.progress / x.target) || ((x.target - x.progress) - (y.target - y.progress));
    })[0] || null;
    return { cats: cats, all: all, nu: unlockedN(all), next: next, val: { les: (u.completedLessons || []).length, str: +u.streak || 0, xp: +u.xp || 0, gem: +u.gems || 0 } };
  }

  // Медаль: тууз + хүрээ + нүүр + товгор дүрс + зорилтын дугаар; түгжээтэй нь саарал (col — өнгөтэй хэвээр, цоожтой)
  function medal(a, sz, col) {
    col = a.unlocked || col;
    var t = col ? a.tier : 0, em = G[a.ic], rA = col ? 'ra' : 'r0', rB = col ? 'rb' : 'r0';
    return '<svg class="mxa-md" width="' + sz + '" height="' + Math.round(sz * 76 / 64) + '" viewBox="-32 -32 64 76" aria-hidden="true" focusable="false">' +
      '<path d="M-14 10-21 41-12.5 36.5-5.5 43 1 15Z" fill="url(#mxa-' + rA + ')"/><path d="M14 10 21 41 12.5 36.5 5.5 43-1 15Z" fill="url(#mxa-' + rB + ')"/>' +
      '<circle r="28.5" fill="url(#mxa-e' + t + ')"/><circle r="24" fill="url(#mxa-f' + t + ')"/>' +
      '<circle r="20.4" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="1.2"/>' +
      '<g transform="translate(-12.5 -13.4) scale(1.04)"><g fill="#fff" fill-opacity="' + (t >= 4 ? '.25' : '.6') + '" transform="translate(0 1.1)">' + em + '</g><g fill="' + EMB[t] + '">' + em + '</g></g>' +
      '<path d="M-18-8A19.5 19.5 0 0 1-3.5-19.6" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.6" stroke-linecap="round"/>' +
      '<g transform="translate(0 25.5)"><rect x="-15.5" y="-7.6" width="31" height="15.2" rx="7.6" fill="' + (col ? '#1E1A4D' : '#9C96BC') + '" stroke="#fff" stroke-width="1.6"/>' +
      '<text y="3.7" text-anchor="middle" font-family="Unbounded,Nunito,sans-serif" font-weight="700" font-size="9.4" fill="' + (col ? '#FFD84A' : '#fff') + '">' + esc(a.num) + '</text></g>' +
      (a.unlocked ? '' : '<g transform="translate(20.5 -20.5)"><circle r="9.6" fill="#fff" stroke="#DCD6EE" stroke-width="1.2"/><g transform="translate(-6 -6.5) scale(.5)" fill="#68628F">' + G.lock + '</g></g>') +
      '</svg>';
  }

  // Амьтан: сайтын #pet-card-аас (updatePetCard бөглөсөн текст, зураг, товч)
  var t0 = Date.now(), LATE = 8000;
  function petInfo() {
    var card = d.getElementById('pet-card'); if (!card) return null;
    var tx = function (id) { var e = d.getElementById(id); return e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : ''; };
    var img = card.querySelector('#pet-sprite img'), name = tx('pet-name'), lv = tx('pet-level'), spT = tx('pet-species'), sp = spT.split(' · ');
    var xm = /(-?\d+)\s*\/\s*(\d+)/.exec(tx('pet-xp-text')), hm = /(\d+)\s*%/.exec(tx('pet-happiness')), lm = /(\d+)/.exec(lv);
    var egg = name === 'Өндөг' || lv === '—', loaded = egg || !!img || (!!name && name !== 'Pet');
    return {
      st: egg ? 'egg' : loaded ? 'pet' : (Date.now() - t0 > LATE ? 'egg' : 'wait'),   // ачаалал удвал сайтын анхны төлөв шиг өндөг + товч
      img: img ? img.getAttribute('src') || '' : '', name: name, lv: lm ? +lm[1] : 1, sp: sp[0] || '', buff: sp.slice(1).join(' · '),
      xp: xm ? Math.max(0, +xm[1]) : 0, need: xm ? (+xm[2] || 100) : 100, hp: hm ? +hm[1] : null, note: egg ? spT : ''
    };
  }
  function chip(ic, t, cls) { return '<span class="mxa-chip' + (cls ? ' ' + cls : '') + '">' + S(G[ic]) + esc(t) + '</span>'; }
  function ring(f) {
    var R = 75, C = 2 * Math.PI * R;
    return '<svg class="mxa-rg" viewBox="0 0 170 170" aria-hidden="true" focusable="false"><circle cx="85" cy="85" r="' + R + '" fill="none" stroke="rgba(255,255,255,.2)" stroke-width="10"/>' +
      (f > 0 ? '<circle cx="85" cy="85" r="' + R + '" fill="none" stroke="url(#mxa-ring)" stroke-width="10" stroke-linecap="round" stroke-dasharray="' + (C * Math.min(1, f)).toFixed(1) + ' ' + C.toFixed(1) + '"/>' : '') + '</svg>';
  }
  function heroHtml(p, D) {
    var av, info, eb = '<span class="mxa-eb"><i></i>Миний амьтан</span>';
    var pic = p && p.img ? '<img src="' + esc(p.img) + '" alt="" onerror="this.remove()">' : '';
    if (p && p.st === 'pet') {
      av = ring(p.xp / p.need) + '<div class="mxa-in">' + S(G.paw) + pic + '</div><span class="mxa-lvb">Lv ' + p.lv + '</span>';
      info = eb + '<h3>' + esc(p.name || p.sp) + '</h3><div class="mxa-chips">' + (p.sp ? chip('paw', p.sp) : '') + (p.buff ? chip('bolt', p.buff, 'gold') : '') +
        (p.hp != null ? chip('heart', 'Аз жаргал ' + p.hp + '%', 'pk') : '') + '</div>' +
        '<p class="mxa-xpl"><b>' + p.xp + ' / ' + p.need + ' XP</b> · Lv ' + (p.lv + 1) + ' хүртэл ' + Math.max(0, p.need - p.xp) + ' XP</p>';
    } else if (p && p.st === 'egg') {
      av = ring(0) + '<div class="mxa-in egg">' + (pic ? S(G.egg) + pic : S(G.egg)) + '</div>';
      info = eb + '<h3>Өндөг</h3><p class="mxa-note">' + esc(p.note || 'Өндгөө гаргаж амьтнаа таниулна уу') + '</p>' +
        '<div><button type="button" class="mxa-btn" data-act="hatch">' + S(G.egg) + 'Өндгөө гаргах</button></div>';
    } else {
      av = ring(0) + '<div class="mxa-in mxa-sk"></div>';
      info = eb + '<h3 class="mxa-skt" aria-hidden="true"></h3><p class="mxa-note">Ачаалж байна…</p>';
    }
    var segs = D.all.map(function (a) { return '<i' + (a.unlocked ? ' class="on"' : '') + ' style="--c:' + CAT[a.cat].c2 + '"></i>'; }).join('');
    var lg = ORDER.filter(function (k) { return D.cats[k]; }).map(function (k) {
      return '<span style="--c:' + CAT[k].c2 + '"><i></i>' + CAT[k].n + ' ' + unlockedN(D.cats[k]) + '/' + D.cats[k].length + '</span>';
    }).join('');
    return '<section class="mxa-hero"><span class="mxa-dc" style="width:340px;height:340px;right:-90px;top:-170px"></span><span class="mxa-dc" style="width:220px;height:220px;right:-30px;top:-110px"></span>' +
      '<div class="mxa-av">' + av + '</div><div class="mxa-pi">' + info + '</div>' +
      '<div class="mxa-ms"><span class="mxa-eb"><i></i>Миний медаль</span><div class="mxa-t"><b>' + D.nu + '</b><span>/ ' + D.all.length + '</span></div>' +
      '<div class="mxa-segs" style="grid-template-columns:repeat(' + D.all.length + ',1fr)" role="img" aria-label="' + D.nu + ' / ' + D.all.length + ' медаль нээгдсэн">' + segs + '</div><div class="mxa-lg">' + lg + '</div></div></section>';
  }
  function nextHtml(D) {
    var a = D.next;
    if (!a) return '<section class="mxa-card mxa-next done"><span class="mxa-cup">' + S(G.trophy) + '</span><div class="mxa-nt"><small>Гайхалтай!</small><b>Бүх медаль нээгдлээ</b><span>' + D.all.length + ' медалиа бүгдийг цуглууллаа.</span></div></section>';
    var c = CAT[a.cat];
    return '<section class="mxa-card mxa-next" style="--c:' + c.c + ';--c2:' + c.c2 + ';--cd:' + c.cd + '">' + medal(a, 52, 1) +
      '<div class="mxa-nt"><small>Дараагийн зорилго</small><b>' + esc(a.name) + '</b><span>' + esc(a.desc) + '</span></div>' +
      '<div class="mxa-np"><div class="mxa-row"><span>' + a.progress + ' / ' + a.target + '</span><b>' + esc(left(a)) + '</b></div><div class="mxa-bar"><i style="width:' + pctOf(a) + '%"></i></div></div></section>';
  }
  // Замын дүүргэлт: зангилаа бүр тэнцүү зайтай, хоёр зангилааны хооронд шугаман (эхний түгжээтэй медалийн явцаар)
  function fillOf(l) {
    for (var i = 0; i < l.length; i++) {
      if (l[i].unlocked) continue;
      var lo = i ? l[i - 1].target : 0, hi = l[i].target;
      return (i + (hi > lo ? Math.max(0, Math.min(1, (l[i].progress - lo) / (hi - lo))) : 0)) / l.length;
    }
    return 1;
  }
  function curText(k, D, l) {
    var v = D.val[k];
    if (k === 'les') return fmt(v) + ' хичээл дуусгасан';
    if (k === 'str') return v + ' өдөр дараалан';
    if (k === 'xp') return fmt(v) + ' XP цуглуулсан';
    if (k === 'gem') return fmt(v) + ' gem';
    return unlockedN(l) + ' / ' + l.length + ' нээгдсэн';
  }
  function tracksHtml(D) {
    return '<div class="mxa-tracks">' + ORDER.filter(function (k) { return D.cats[k]; }).map(function (k) {
      var l = D.cats[k], n = l.length, u = unlockedN(l), c = CAT[k], fi = -1;
      for (var j = 0; j < n; j++) if (!l[j].unlocked) { fi = j; break; }
      var nodes = l.map(function (a, i) {
        return '<div class="mxa-nd' + (a.unlocked ? '' : ' lk') + (i === fi ? ' nx' : '') + '" style="left:' + ((i + 1) / n * 100).toFixed(3) + '%" title="' + esc(a.name + ' — ' + a.desc) + '">' +
          medal(a, 54, i === fi) + '<b>' + esc(a.name) + '</b><small>' + (a.unlocked ? esc(a.desc.replace(/ (дуусгасан|цуглуулсан|дараалан)$/, '')) : a.progress + ' / ' + a.target) + '</small></div>';
      }).join('');
      return '<section class="mxa-card mxa-tr" style="--c:' + c.c + ';--c2:' + c.c2 + ';--cd:' + c.cd + ';--bg:' + c.bg + '" aria-label="' + esc(c.n) + ': ' + u + ' / ' + n + ' медаль">' +
        '<div class="mxa-th"><span class="mxa-ci">' + S(G[c.ic]) + '</span><div><b>' + esc(c.n) + '</b><small>' + esc(curText(k, D, l)) + '</small></div><em>' + u + ' / ' + n + '</em></div>' +
        '<div class="mxa-ln"><div class="mxa-rail"><i style="width:' + (fillOf(l) * 100).toFixed(1) + '%"></i></div><span class="mxa-s0"></span>' + nodes + '</div></section>';
    }).join('') + '</div>';
  }

  function part(box, cls, html) {   // өөрчлөгдсөн хэсгийг л шинэчилнэ (замын хөдөлгөөн дахин эхлэхгүй)
    var el = box.querySelector(':scope > .' + cls);
    if (!el) { el = d.createElement('div'); el.className = cls; box.appendChild(el); }
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
  }
  function render() {
    var tab = d.getElementById('tab-achievements'); if (!tab) return;
    var D = data();
    if (!D) { tab.classList.remove('mx-on'); return; }
    var box = d.getElementById('mx-ach');
    if (!box) {
      box = d.createElement('div'); box.id = 'mx-ach'; box.className = 'mxa'; box.innerHTML = DEFS;
      tab.insertBefore(box, tab.firstChild); box.addEventListener('click', onClick);
    }
    part(box, 'mxa-p1', heroHtml(petInfo(), D));
    part(box, 'mxa-p2', nextHtml(D));
    part(box, 'mxa-p3', tracksHtml(D));
    tab.classList.add('mx-on');
  }
  var pend = 0;
  function sched() {
    if (pend) return; pend = 1;
    setTimeout(function () { pend = 0; try { render(); } catch (e) { try { console.warn('cm-ach', e); } catch (x) {} } }, 30);
  }
  function onClick(e) {
    var b = e.target.closest('[data-act]'); if (!b) return;
    if (b.getAttribute('data-act') === 'hatch') {
      var sb = d.getElementById('pet-action-btn');   // сайтын товч: onclick нь openHatchModal
      if (sb) sb.click(); else if (typeof window.openHatchModal === 'function') window.openHatchModal();
    }
  }

  function init() {
    try {
      var cont = d.getElementById('achievements-container'), card = d.getElementById('pet-card');
      if (!d.getElementById('tab-achievements') || !cont) return;
      new MutationObserver(sched).observe(cont, { childList: true });   // renderAchievements (табыг нээх бүрт)
      if (card) new MutationObserver(sched).observe(card, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style', 'src'] });
      window.addEventListener('cm-user-loaded', sched);
      render();
      setTimeout(sched, LATE + 300);
    } catch (e) { try { console.warn('cm-ach', e); } catch (x) {} }
  }
  window.cmAch = { render: render, _data: data, _fill: fillOf };   // _-тай нь тестэд
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
