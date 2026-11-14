/* Дасгалын төв — «Агуулгын хүснэгт»: анги → бүлэг → сэдэв → хуудас (ws-browse.css).
   worksheets.html-ийн өгөгдлийг (LIST, CAMB, SGBY, SGCHILD, sgOrderedItems, OVERRIDES, HIDDEN …) уншиж зурна.
   Хуудсыг нээх, урьдчилан харах (цоожтой), баруун товшилтын цэс — одоогийн функцууд хэвээр (catalogClick, openMenu, initPreview).
   Хуучин #catalog (чирэх, нэр солих г.м.) — зөвхөн админы засах горимд харагдана.
   ЭЕШ бүлэг — тусгай «Бэнто» нүүр (eesh-topics.js): он оны материал, ЭЕШ 1000 агуулгаар (салбар → сэдэв) ба хэсгээр. */
(function () {
  'use strict';
  if (window.WSB || typeof renderCatalog !== 'function' || !document.querySelector('.wrap')) return;

  var ROOT, ASIDE, MAIN, qTimer = null, CACHE = {}, SEARCH = null;
  var ST = { g: -1, ch: null, t: null, q: '', nw: false, nwAll: false };     // анги (index), нээлттэй бүлэг, сонгосон хэсэг (sg id | 'rest'), хайлт, шинэ хуудас (бүх анги эсэх)
  var OPEN_KEY = 'wsb_open', LAST_KEY = 'wsb_last', GRADE_KEY = 'wsb_grade';
  var MQ = window.matchMedia ? window.matchMedia('(max-width:899px)') : { matches: false };

  var ICO = {
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
    chev: '<svg class="cv" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m9 18 6-6-6-6"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    trophy: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/></svg>',
    star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="m12 2.5 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/></svg>',
    book: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/></svg>',
    tag: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>',
    play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>',
    slide: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/></svg>',
    intr: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 20 4M14 4h6v6"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
    vid: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="3"/><path d="m16.5 10 5-3v10l-5-3z"/></svg>',
    game: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="2" y="7" width="20" height="12" rx="4"/><path d="M7 13h4M9 11v4"/></svg>'
  };

  function lsJ(k, d) { try { var v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } }
  function lsW(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var OPENED = {}; (lsJ(OPEN_KEY, []) || []).forEach(function (s) { OPENED[s] = 1; });

  /* ───────── өгөгдөл ───────── */
  function groups() { return (window.LIST || []).concat(window.CAMB || []); }
  function isMath(label) { return /^\d+-р анги$/.test(label); }
  function vis(w) { return !(window.HIDDEN && HIDDEN[w[0]]); }
  function titleOf(w) { return (window.OVERRIDES && OVERRIDES[w[0]]) || w[1]; }
  function sentence(s) {   // БҮГД ТОМ үсэг бол «Эхний үсэг том, бусад жижиг»
    s = String(s || '').trim();
    if (/[a-zа-яөүё]/.test(s)) return s;
    var l = s.toLowerCase(); return l.charAt(0).toUpperCase() + l.slice(1);
  }
  function isExam(name) { return /жишиг|шалгалт|сорил/i.test(name); }
  function examTitle(n) { var p = n.name.split(/\s+[—–-]\s+/); return sentence(p.length > 1 ? p[p.length - 1] : n.name); }
  function node(sg, items, depth) {
    var own = sgOrderedItems(sg.id, items).filter(vis);
    var kids = (SGCHILD[sg.id] || []).map(function (c) { return node(c, items, depth + 1); }).filter(function (n) { return n.total > 0; });
    var total = own.length; kids.forEach(function (k) { total += k.total; });
    var name = String(sg.name || '').trim(), roman = '', num = '', title = name;
    var m = name.match(/^([IVXLC]+)\s*БҮЛЭГ\.?\s*(.*)$/i);
    if (m) { roman = m[1].toUpperCase(); title = sentence(m[2] || name); }
    else { var t = name.match(/^(\d+(?:\.\d+)*)\.?\s+(.+)$/); if (t) { num = t[1]; title = t[2]; } }
    return { id: sg.id, name: name, roman: roman, num: num, title: title, exam: isExam(name), own: own, kids: kids, total: total, depth: depth };
  }
  function gdata(i) {
    if (CACHE[i]) return CACHE[i];
    var grp = groups()[i]; if (!grp) return null;
    var label = grp[0];
    var items = applyOrder(withPlacements(grp[1], label), label).filter(vis);
    var mem = gradeMemberSet(label);
    var tops = (SGBY[label] || []).map(function (sg) { return node(sg, items, 0); }).filter(function (n) { return n.total > 0; });
    var chapters = tops.filter(function (n) { return n.roman; }), extras = tops.filter(function (n) { return !n.roman; });
    if (!chapters.length) { chapters = extras; extras = []; }      // бүлэггүй бүлэг (ЭЕШ, Монгол хэл…) — энгийн жагсаалт
    var d = { i: i, label: label, items: items, rest: items.filter(function (w) { return !mem[w[0]]; }), chapters: chapters, extras: extras, map: {}, flat: [] };
    var walk = function (n, parent, ch) { d.map[n.id] = n; n.parent = parent; n.chapter = ch; n.kids.forEach(function (k) { walk(k, n, ch); }); };
    chapters.concat(extras).forEach(function (n) { walk(n, null, n); });
    // Өмнөх/дараагийн сэдвийн дараалал: бүлэг бүрийн 1-р түвшний сэдвүүд (дэд сэдэвгүй бүлэг — өөрөө)
    chapters.concat(extras).forEach(function (n) { if (n.kids.length) n.kids.forEach(function (k) { d.flat.push(k); }); else d.flat.push(n); });
    if (d.rest.length) d.flat.push({ id: 'rest', title: 'Бусад хуудас', num: '', exam: false });
    CACHE[i] = d; return d;
  }
  function deepItems(n) { var a = (n.own || []).slice(); (n.kids || []).forEach(function (k) { a = a.concat(deepItems(k)); }); return a; }
  function seenCount(list) { var c = 0; list.forEach(function (w) { if (OPENED[w[0]]) c++; }); return c; }
  function topicCount(n) { return n.kids.filter(function (k) { return !k.exam; }).length; }

  /* ───────── HTML ───────── */
  function progHtml(list) {
    var s = seenCount(list); if (!s) return '';
    return '<span class="wsb-prog"><span class="wsb-bar"><i style="width:' + Math.round(s * 100 / list.length) + '%"></i></span>' + s + '/' + list.length + ' үзсэн</span>';
  }
  /* Картын жижиг зураг: assets/thumbs/index.json = { slug: hash } (scripts/ws-thumbs.js үүсгэнэ). Зураггүй бол бүдүүвч. */
  var THUMBS = null;
  function thumbImg(slug) {
    var h = THUMBS && THUMBS[slug];
    return h ? '<img src="/assets/thumbs/' + esc(slug.replace(/\.html$/, '').replace(/[\\/]/g, '__')) + '.webp?v=' + esc(h) + '" alt="" loading="lazy" decoding="async">' : '';
  }
  function loadThumbs() {
    fetch('/assets/thumbs/index.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j || typeof j !== 'object') return;
      THUMBS = j;
      if (ROOT) [].forEach.call(ROOT.querySelectorAll('.card.wbc .wbc-a4:not(.has-img), .card.eh-cont .eh-th:not(.has-img)'), function (a) {   // ачаалагдахаас өмнө зурсан картууд
        var im = thumbImg(a.parentNode.getAttribute('data-slug') || '');
        if (im) { a.classList.add('has-img'); a.insertAdjacentHTML('beforeend', im); }
      });
    }).catch(function () {});
  }
  function card(w, grade, label, sub) {
    var slug = w[0], t = titleOf(w), im = thumbImg(slug);
    var tag = (window.NEWSET && NEWSET[slug]) ? '<span class="newtag">Шинэ</span>' : ((window.WS_FREE && WS_FREE[slug]) ? '<span class="freetag">Үнэгүй</span>' : '');
    return '<a class="card wbc' + (OPENED[slug] ? ' seen' : '') + '" draggable="false" href="/' + esc(slug) + '" target="_blank" data-href="/' + esc(slug) + '" data-slug="' + esc(slug)
      + '" data-orig="' + esc(w[1]) + '" data-title="' + esc(t) + '" data-grade="' + esc(grade) + '">' + tag
      + '<span class="wbc-a4' + (im ? ' has-img' : '') + '" aria-hidden="true"><i></i><i></i><i></i><u></u><i></i><i></i>' + im + '</span>'
      + '<span class="t">' + esc(label || t) + '</span>' + (sub ? '<span class="wbc-sub">' + esc(sub) + '</span>' : '') + '</a>';
  }
  function grid(cards) { return '<div class="wsb-grid">' + cards.join('') + '</div>'; }
  /* Сэдвийн хуудсууд: «-1, -2 …» гэж дугаарлагдсан цуврал → «Хуудас 1, 2», бусад нь нэрээрээ («Арга тус бүрээр») */
  function sections(list, grade, topicTitle) {
    var sets = {}, order = [], entries = [];
    list.forEach(function (w) {
      var m = titleOf(w).match(/^(.*?)\s*[-–—]\s*(\d+)$/);
      if (m && m[1].trim()) {
        var k = m[1].trim().toLowerCase();
        if (!sets[k]) { sets[k] = { base: m[1].trim(), items: [] }; order.push(k); }
        sets[k].items.push({ w: w, n: m[2] });
        entries.push({ set: k, w: w });
      } else entries.push({ w: w });
    });
    var isSet = function (k) { return k && sets[k].items.length >= 2; };
    var singles = entries.filter(function (e) { return !isSet(e.set); }).map(function (e) { return e.w; });
    var real = order.filter(isSet);
    if (!real.length) return grid(singles.map(function (w) { return card(w, grade); }));
    var tt = String(topicTitle || '').toLowerCase(), h = '';
    if (singles.length) h += '<div class="wsb-sec">Арга тус бүрээр</div>' + grid(singles.map(function (w) { return card(w, grade); }));
    real.forEach(function (k) {
      var S = sets[k], bl = S.base.toLowerCase();
      var head = (real.length === 1 && !singles.length) ? 'Хуудсууд'
        : ((tt && (tt.indexOf(bl) >= 0 || bl.indexOf(tt) >= 0)) ? 'Холимог дасгал' : S.base);
      h += '<div class="wsb-sec">' + esc(head) + '</div>' + grid(S.items.map(function (x) { return card(x.w, grade, 'Хуудас ' + x.n, S.base + '-' + x.n); }));
    });
    return h;
  }

  function optHtml(gs, i) { var n = gs[i][1].length; return '<option value="' + i + '"' + (ST.g === i ? ' selected' : '') + '>' + esc(gs[i][0]) + '</option>'; }
  function asideHtml() {
    var gs = groups(), d = ST.g >= 0 ? gdata(ST.g) : null;
    var math = [], other = [];
    gs.forEach(function (g, i) { (isMath(g[0]) ? math : other).push(i); });
    var h = '<label class="wsb-gsel"><select aria-label="Анги сонгох">' + (ST.g < 0 ? '<option value="-1" selected>Ангиа сонгоно уу</option>' : '')
      + '<optgroup label="Математик">' + math.map(function (i) { return optHtml(gs, i); }).join('') + '</optgroup>'
      + (other.length ? '<optgroup label="Бусад">' + other.map(function (i) { return optHtml(gs, i); }).join('') + '</optgroup>' : '')
      + '</select>' + ICO.down + '</label>'
      + '<div class="wsb-search">' + ICO.search + '<input type="search" placeholder="Хайх… (бутархай, зэрэг)" autocomplete="off" value="' + esc(ST.q) + '"></div>';
    var last = lsJ(LAST_KEY, null);
    if (last && last.g >= 0 && last.t != null && !(ST.g === last.g && ST.t === last.t)) {
      var ld = gdata(last.g), ln = ld && (last.t === 'rest' ? { title: 'Бусад хуудас', num: '' } : (isEesh(ld) ? enode(edata(ld), last.t) : ld.map[last.t]));
      if (ln) h += '<button type="button" class="wsb-cont" data-go="' + last.g + ':' + last.t + '"><i>' + ICO.play + '</i><span><b>' + esc((ln.num ? ln.num + ' ' : '') + ln.title) + '</b><small>' + esc(ld.label) + ' · үргэлжлүүлэх</small></span></button>';
    }
    if (newCount()) {   // сонгосон ангид шинэ байвал тэр ангийнх, үгүй бол бүх ангийн тоо
      var nG = d ? newHits(ST.g).length : 0, nn = nG || newHits(-1).length;
      if (nn) h += '<button type="button" class="wsb-ch new' + (ST.nw ? ' on' : '') + '" data-new="1"><span class="wsb-rn">' + ICO.star + '</span><span class="nm">Шинэ хуудсууд<small>' + (nG ? esc(d.label) + ' · ' + nG + ' хуудас' : nn + ' хуудас нэмэгдсэн') + '</small></span></button>';
    }
    h += '<div class="wsb-lbl">Агуулгын хүснэгт</div>';
    if (!d) return h + '<div class="wsb-empty wsb-dk">Дээрээс ангиа сонгоно уу</div><div class="wsb-gbtns wsb-mb">' + gs.map(function (g, i) { var dd = gdata(i); return '<button type="button" class="wsb-gb" data-gpick="' + i + '">' + esc(g[0]) + '<small>' + (dd ? dd.items.length : g[1].length) + ' хуудас</small></button>'; }).join('') + '</div>' + linksHtml();
    if (isEesh(d)) return h + eAside(d, edata(d)) + linksHtml();
    d.chapters.forEach(function (n) { h += chRow(n, false); });
    if (d.extras.length) { h += '<div class="wsb-lbl">Нэмэлт</div>'; d.extras.forEach(function (n) { h += chRow(n, true); }); }
    if (d.rest.length) h += '<button type="button" class="wsb-ch ext' + (ST.t === 'rest' ? ' on' : '') + '" data-t="rest"><span class="wsb-rn">+</span><span class="nm">Бусад хуудас<small>' + d.rest.length + ' хуудас</small></span></button>';
    return h + linksHtml();
  }
  function chRow(n, ext) {
    var kids = n.kids.length > 0, open = kids && ST.ch === n.id;
    var meta = kids ? (topicCount(n) + ' сэдэв · ' + n.total + ' хуудас') : (n.total + ' хуудас');
    var h = '<button type="button" class="wsb-ch' + (ext ? ' ext' : '') + (open ? ' open' : '') + ((ST.t === n.id || (!kids && ST.ch === n.id)) ? ' on' : '') + '" data-ch="' + n.id + '"' + (kids ? ' aria-expanded="' + open + '"' : '') + '>'
      + '<span class="wsb-rn">' + esc(n.roman || n.num || '+') + '</span><span class="nm">' + esc(n.exam ? examTitle(n) : n.title) + '<small>' + meta + '</small></span>' + (kids ? ICO.chev : '') + '</button>';
    if (open) h += '<div class="wsb-tps">' + n.kids.map(tpRow).join('') + '</div>';
    return h;
  }
  function tpRow(k) {
    return '<button type="button" class="wsb-tp' + (k.exam ? ' ex' : '') + (ST.t === k.id ? ' on' : '') + '" data-t="' + k.id + '"><b>' + (k.exam ? ICO.trophy : esc(k.num || '•')) + '</b><span>'
      + esc(k.exam ? 'Бүлгийн жишиг ба шалгалт' : k.title) + '</span><em>' + k.total + '</em></button>';
  }
  function linksHtml() {
    var h = '', sl = document.getElementById('slidesSec'), gm = document.getElementById('gamesSec');
    if (sl && !sl.hidden) h += '<a href="#slides" data-view="slidesSec">' + ICO.slide + 'Слайд хичээлүүд</a>';
    if (gm && !gm.hidden) h += '<a href="#games" data-view="gamesSec">' + ICO.game + 'Тоглоомууд</a>';
    if (document.getElementById('intSec')) h += '<a href="#interactive" data-view="intSec">' + ICO.intr + 'Интерактив жишээ</a>';
    if (document.getElementById('vidSec')) h += '<a href="#videos" data-view="vidSec">' + ICO.vid + 'Жишээ видео</a>';
    return h ? '<div class="wsb-links">' + h + '</div>' : '';
  }

  function crumb(d, n) {
    var h = '<div class="wsb-crumb"><a data-crumb="g">' + esc(d.label) + '</a>';
    if (n && n.chapter && n.chapter !== n) h += ' › <a data-crumb="ch" data-id="' + n.chapter.id + '">' + esc(n.chapter.roman ? n.chapter.roman + ' бүлэг' : n.chapter.title) + '</a>';
    if (n) h += ' › <b>' + esc(n.exam ? 'Жишиг ба шалгалт' : ((n.num ? n.num + ' ' : '') + n.title)) + '</b>';
    return h + '</div>';
  }
  function back() { return '<button type="button" class="wsb-mback">' + ICO.left + 'Агуулга</button>'; }
  function pickHtml() {
    var gs = groups();
    return '<div class="wsb-pick"><h2>Ангиа сонгоно уу</h2><p>Сурах бичгийн бүлэг, сэдэв бүрээр ажлын хуудас — хариутай, хэвлэх / PDF.</p><div class="wsb-gbtns">'
      + gs.map(function (g, i) { var d = gdata(i); return '<button type="button" class="wsb-gb" data-gpick="' + i + '">' + esc(g[0]) + '<small>' + (d ? d.items.length : g[1].length) + ' хуудас</small></button>'; }).join('') + '</div></div>';
  }
  function gradeHtml(d) {
    var book = d.chapters.length && typeof isAdmin === 'function' && isAdmin()
      ? '<button type="button" class="wsb-nwsw" data-book="1">' + ICO.book + ' Дасгал ажлын дэвтэр</button>' : '';
    var h = '<div class="wsb-head"><span class="wsb-num">' + esc((d.label.match(/^\d+/) || [''])[0] || '·') + '</span><h2>' + esc(d.label) + '</h2>' + book + '</div>'
      + '<div class="wsb-meta"><span>' + d.items.length + ' хуудас</span>' + progHtml(d.items) + '</div>'
      + (d.label === 'ЭЕШ' && window.EESH_TOOL ? '<div class="wsb-eesh">' + EESH_TOOL + '</div>' : '');
    if (d.chapters.length) h += '<div class="wsb-sec">Бүлгүүд</div><div class="wsb-cards">' + d.chapters.map(ccHtml).join('') + '</div>';
    if (d.extras.length) h += '<div class="wsb-sec">Нэмэлт</div><div class="wsb-cards">' + d.extras.map(ccHtml).join('') + '</div>';
    if (d.rest.length) h += '<div class="wsb-sec">Бусад хуудас</div>' + grid(d.rest.map(function (w) { return card(w, d.label); }));
    return h;
  }
  function ccHtml(n) {
    var kids = n.kids.length > 0, list = deepItems(n), s = seenCount(list);
    return '<button type="button" class="wsb-cc' + (n.exam ? ' ex' : '') + '" data-' + (kids ? 'ch' : 't') + '="' + n.id + '"><span class="r"><span class="wsb-rn">' + (n.exam ? ICO.trophy : esc(n.roman || n.num || '+')) + '</span>'
      + '<span><b>' + esc(n.exam ? examTitle(n) : n.title) + '</b><small>' + (kids ? topicCount(n) + ' сэдэв · ' : '') + n.total + ' хуудас' + (s ? ' · ' + s + ' үзсэн' : '') + '</small></span></span>'
      + (s ? '<span class="wsb-bar" style="width:100%"><i style="width:' + Math.round(s * 100 / list.length) + '%"></i></span>' : '') + '</button>';
  }
  function chapterHtml(d, n) {
    var list = deepItems(n);
    var h = back() + crumb(d, null).replace('</div>', ' › <b>' + esc(n.roman ? n.roman + ' бүлэг' : n.title) + '</b></div>')
      + '<div class="wsb-head"><span class="wsb-num">' + esc(n.roman || n.num || '+') + '</span><h2>' + esc(n.title) + '</h2>' + pptSpan(n.id) + '</div>'
      + '<div class="wsb-meta"><span>' + topicCount(n) + ' сэдэв · ' + n.total + ' хуудас</span>' + progHtml(list) + '</div>'
      + '<div class="wsb-cards">' + n.kids.map(ccHtml).join('') + '</div>';
    if (n.own.length) h += '<div class="wsb-sec">Бүлгийн хуудсууд</div>' + sections(n.own, d.label, n.title);
    return h;
  }
  function topicHtml(d, n) {
    var isRest = n.id === 'rest', list = isRest ? d.rest : deepItems(n);
    var h = back() + crumb(d, isRest ? null : n).replace(isRest ? '</div>' : '$$', isRest ? ' › <b>Бусад хуудас</b></div>' : '$$')
      + '<div class="wsb-head"><span class="wsb-num' + (n.exam ? ' ex' : '') + '">' + (n.exam ? ICO.trophy : esc(n.num || n.roman || '+')) + '</span><h2>' + esc(n.exam ? 'Жишиг ба шалгалт' : n.title) + '</h2>'
      + (isRest ? '' : pptSpan(n.id)) + '</div>'
      + '<div class="wsb-meta">' + (n.chapter && n.chapter !== n ? '<span>' + esc((n.chapter.roman ? n.chapter.roman + ' бүлэг · ' : '') + n.chapter.title) + '</span><span>·</span>' : '')
      + '<span>' + list.length + ' хуудас</span>' + progHtml(list) + '</div>';
    if (isRest) h += grid(d.rest.map(function (w) { return card(w, d.label); }));
    else {
      if (n.own.length) h += sections(n.own, d.label, n.title);
      n.kids.forEach(function (k) {   // дэд сэдэв (ховор): гарчигтай тусдаа хэсэг
        h += '<div class="wsb-sec">' + esc((k.num ? k.num + ' ' : '') + k.title) + pptSpan(k.id) + '</div>' + sections(deepItems(k), d.label, k.title);
      });
    }
    // Өмнөх / дараагийн сэдэв, бүлгийн жишиг ба шалгалт
    var ix = -1; d.flat.forEach(function (x, i) { if (x.id === n.id) ix = i; });
    var pv = ix > 0 ? d.flat[ix - 1] : null, nx = ix >= 0 && ix < d.flat.length - 1 ? d.flat[ix + 1] : null;
    var ex = (!n.exam && n.chapter && n.chapter !== n) ? n.chapter.kids.filter(function (k) { return k.exam; })[0] : null;
    var nav = '';
    if (pv) nav += '<button type="button" class="wsb-nb" data-t="' + pv.id + '">' + ICO.left + '<span><small>Өмнөх сэдэв</small>' + esc(navTitle(pv)) + '</span></button>';
    if (nx) nav += '<button type="button" class="wsb-nb nx" data-t="' + nx.id + '"><span><small>Дараагийн сэдэв</small>' + esc(navTitle(nx)) + '</span>' + ICO.chev + '</button>';
    if (ex && ex !== nx) nav += '<button type="button" class="wsb-nb ex" data-t="' + ex.id + '">' + ICO.trophy + '<span><small>Бүлгээ дуусгасан уу?</small>' + esc((n.chapter.roman ? n.chapter.roman + ' бүлгийн ' : '') + 'жишиг ба шалгалт') + '</span></button>';
    if (nav) h += '<div class="wsb-nav">' + nav + '</div>';
    return h;
  }
  function pptSpan(id) { return '<span class="sg-ppt" data-sgid="' + id + '">' + (typeof pptChips === 'function' ? pptChips(id) : '') + '</span>'; }
  function navTitle(x) { return x.exam ? 'Жишиг ба шалгалт' : ((x.num ? x.num + ' ' : '') + x.title); }

  /* ───────── ЭЕШ нүүр (Бэнто): он оны материал · ЭЕШ 1000 агуулгаар (салбар → сэдэв) · хэсгээр ─────────
     Бүтэц нь eesh-topics.js-ээс (scripts/e1k/build_topics.js), хуудсууд нь каталогийн ЭЕШ бүлгээс — дэд бүлэг хэрэггүй.
     ST.t: null — нүүр, 'y' — он оны материал, 'e-<сэдэв>' — сэдэв, 'p<хэсэг>' — ЭЕШ 1000-ын хэсэг, 'o' — бусад хуудас */
  var EESH_LAST = 'wsb_eesh_last', EA = false, eDirty = false;   // EA — утсанд ЭЕШ-ийн агуулгын хүснэгт (нүүрийн оронд) харагдаж байгаа эсэх
  var EDOM = { alg: ['#7B52EE', '#EFEAFE', '#4B2BBF'], an: ['#0E9F9A', '#E2F5F3', '#0B6E6A'], geo: ['#EA6A2A', '#FDEDE4', '#A4481A'], mag: ['#2E9E5B', '#E6F5EC', '#1F6B3E'] };
  var EBOOK = ['#3B2A9E', '#5B3BD9', '#7B52EE', '#9B6DF4'];
  var eI = function (p, s) { return '<svg width="' + (s || 20) + '" height="' + (s || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; };
  var eT = function (t, fs) { return '<svg width="22" height="20" viewBox="0 0 24 22" aria-hidden="true"><text x="12" y="16" text-anchor="middle" font-size="' + (fs || 13) + '" font-weight="900" fill="currentColor">' + t + '</text></svg>'; };
  var EI = {
    home: eI('<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10"/>', 16), cal: eI('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
    cal16: eI('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>', 16), stack: eI('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
    spark: eI('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>', 18),
    lock: eI('<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', 13),
    link: eI('<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>', 16),
    scan: eI('<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="m8 12 3 3 5-6"/>'),
    check: eI('<path d="m5 12 5 5 9-10"/>', 14)
  };
  var TICO = {
    too: eT('123', 10), modul: eT('|x|'), 'olon-gishuunt': eT('x²'), logarifm: eT('log', 10), funkts: eI('<path d="M3 18c5 0 5-12 10-12s5 8 8 8"/>'),
    daraalal: eI('<circle cx="5" cy="17" r="1.6"/><circle cx="10" cy="13" r="1.6"/><circle cx="15" cy="9" r="1.6"/><circle cx="20" cy="5" r="1.6"/>'),
    trigonometr: eI('<path d="M2 12c2.5-7 5-7 7.5 0s5 7 7.5 0 3-5 5-3"/>'), ulamjlal: eI('<path d="M3 18c6 0 9-6 18-12"/><path d="M4 9l16 6"/>'),
    integral: eT('∫', 17), magadlal: eI('<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/>'),
    kompleks: eT('a+bi', 8), vektor: eI('<path d="M5 19 19 5M10 5h9v9"/>'), huvirgalt: eI('<path d="M20 11A8 8 0 1 0 17.5 17"/><path d="M20 4v7h-7"/>'),
    geometr: eI('<path d="M12 4 21 20H3z"/>'), _: eI('<path d="M4 6h16M4 12h16M4 18h10"/>')
  };
  function isEesh(d) { return !!(d && d.label === 'ЭЕШ' && window.EESH_TOPICS && EESH_TOPICS.topics); }
  function edata(d) {
    if (d.ee) return d.ee;
    var T = window.EESH_TOPICS, by = {}, used = {}, e = { T: T, years: [], parts: [], topics: [], tby: {}, other: [], probs: 0 };
    d.items.forEach(function (w) { by[w[0]] = w; });
    var take = function (slug) { var w = by[slug]; if (w) used[slug] = 1; return w || null; };
    d.items.forEach(function (w) { var m = /^eesh-(\d{4})\.html$/.exec(w[0]); if (m) { used[w[0]] = 1; e.years.push({ y: +m[1], w: w }); } });
    e.years.sort(function (a, b) { return b.y - a.y; });
    (T.parts || []).forEach(function (p) {             // [хэсэг, бодлого, хуудас бүрийн бодлого]; файл eesh1000-K.html, K = 4(P−1)+j
      var P = p[0], ws = [], from = 1;
      p[2].forEach(function (n, j) { var w = take('eesh1000-' + (4 * (P - 1) + j + 1) + '.html'); if (w) ws.push({ w: w, j: j + 1, a: from, b: from + n - 1 }); from += n; });
      if (ws.length) e.parts.push({ P: P, n: p[1], ws: ws });
    });
    T.topics.forEach(function (t) {
      var x = { s: t.s, n: t.n, d: t.d, c: t.c || [], ws: [], total: 0 };
      (t.p || []).forEach(function (pg, j) { var w = take('eesh1000-' + t.s + '-' + (j + 1) + '.html'); if (w) { x.ws.push({ w: w, j: j + 1, n: pg[0], sub: pg[1] }); x.total += pg[0]; } });
      if (x.ws.length) { e.topics.push(x); e.tby[x.s] = x; e.probs += x.total; }
    });
    e.other = d.items.filter(function (w) { return !used[w[0]]; });
    return (d.ee = e);
  }
  function enode(e, t) {
    var m;
    if (t === 'y') return e.years.length ? { k: 'y', title: 'Он оны материал' } : null;
    if (t === 'o') return e.other.length ? { k: 'o', title: 'Бусад хуудас' } : null;
    if ((m = /^p(\d+)$/.exec(t))) { var p = e.parts.filter(function (x) { return x.P === +m[1]; })[0]; return p ? { k: 'p', title: 'ЭЕШ 1000 · ' + p.P + '-р хэсэг', p: p } : null; }
    if ((m = /^e-([a-z-]+)$/.exec(String(t))) && e.tby[m[1]]) return { k: 'e', title: e.tby[m[1]].n, x: e.tby[m[1]] };
    return null;
  }
  function edomName(e, k) { var r = ''; (e.T.doms || []).forEach(function (x) { if (x[0] === k) r = x[1]; }); return r; }
  function eyears(e) { var y = e.years; return y.length ? (y.length > 1 ? y[y.length - 1].y + '–' + y[0].y : '' + y[0].y) : ''; }
  // .card — нээх, урьдчилан харах, давхар товшилтын цэс одоогийн каталогийнхтой ижил (catalogClick, initPreview)
  function eattrs(w) {
    return 'draggable="false" href="/' + esc(w[0]) + '" target="_blank" data-href="/' + esc(w[0]) + '" data-slug="' + esc(w[0]) + '" data-orig="' + esc(w[1]) + '" data-title="' + esc(titleOf(w)) + '" data-grade="ЭЕШ"';
  }
  function eback() { return '<button type="button" class="eh-back" data-et="">' + ICO.left + 'ЭЕШ</button>'; }
  function eseen(slug) { return OPENED[slug] ? ' class="on"' : ''; }
  function eHtml(d, e) {
    var n = ST.t != null ? enode(e, ST.t) : null, h;
    if (!n) h = eHome(d, e);
    else if (n.k === 'e') h = eTopic(e, n.x);
    else if (n.k === 'p') h = ePart(e, n.p);
    else h = eList(e, n.k);
    return '<div class="eh">' + h + '</div>';
  }
  function eRing(p) {
    var S = 120, c = S / 2, r = c - 10, L = 2 * Math.PI * r;
    return '<svg class="eh-ring" width="' + S + '" height="' + S + '" viewBox="0 0 ' + S + ' ' + S + '" aria-hidden="true"><circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="12"/>'
      + (p > 0 ? '<circle cx="' + c + '" cy="' + c + '" r="' + r + '" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-dasharray="' + Math.max(1, L * p).toFixed(1) + ' ' + L.toFixed(1) + '" transform="rotate(-90 ' + c + ' ' + c + ')"/>' : '')
      + '<text x="50%" y="48%" text-anchor="middle" font-size="27" font-weight="900" fill="#fff">' + Math.round(p * 100) + '%</text>'
      + '<text x="50%" y="65%" text-anchor="middle" font-size="11" font-weight="800" fill="rgba(255,255,255,.8)">явц</text></svg>';
  }
  function eChip(x, dots) {
    var c = EDOM[x.d] || EDOM.alg;
    return '<button type="button" class="eh-chip" data-et="e-' + esc(x.s) + '" style="background:' + c[1] + ';color:' + c[2] + '"><span class="ic">' + (TICO[x.s] || TICO._) + '</span>' + esc(x.n)
      + ' <span class="n">' + x.total + '</span>' + (dots ? '<span class="pd">' + x.ws.map(function (p) { return '<i' + eseen(p.w[0]) + '></i>'; }).join('') + '</span>' : '') + '</button>';
  }
  function eTool() {
    return window.EESH_URL ? '<a class="eh-tool" href="' + esc(EESH_URL) + '" target="_blank" rel="noopener"><i>' + EI.scan + '</i><span><b>ЭЕШ шалгагч</b><small>Хариултын хуудсыг утасны камераар шалгана · оноо шууд</small></span>' + ICO.chev + '</a>' : '';
  }
  function eHome(d, e) {
    var all = d.items, s = seenCount(all), adm = typeof isAdmin === 'function' && isAdmin();
    var stat = function (v, l) { return '<span class="eh-stat"><b>' + v + '</b><small>' + l + '</small></span>'; };
    var last = lsJ(EESH_LAST, ''), lw = null, lab = 'Үргэлжлүүлэх';
    all.forEach(function (w) { if (w[0] === last) lw = w; });
    if (!lw) { lw = e.years.length ? e.years[0].w : all[0]; lab = 'Эхлэх'; }
    var h = back() + '<div class="eh-bento"><div class="eh-bx eh-hero"><i class="c1"></i><i class="c2"></i><div class="eh-hrow">' + eRing(all.length ? s / all.length : 0)
      + '<div><h2>ЭЕШ-д бэлдье</h2><p>Он оны материал ба ЭЕШ 1000 бодлого — сэдвээр, хэсгээр</p></div></div>'
      + '<div class="eh-stats">' + (e.probs ? stat(e.probs, 'бодлого') : '') + (e.topics.length ? stat(e.topics.length, 'сэдэв') : '') + (e.years.length ? stat(e.years.length, 'жилийн ЭЕШ') : '') + stat(s + '/' + all.length, 'үзсэн хуудас') + '</div>';
    if (lw) { var im = thumbImg(lw[0]); h += '<a class="card eh-cont" ' + eattrs(lw) + '><span class="eh-th' + (im ? ' has-img' : '') + '">' + im + '</span><span class="tx"><small>' + lab + '</small><b>' + esc(titleOf(lw)) + '</b></span><span class="pl">' + ICO.play + '</span></a>'; }
    h += '</div>';
    if (e.years.length) h += '<div class="eh-bx eh-years"><h3>' + EI.cal + 'Он оны материал<span class="cnt">' + eyears(e) + '</span></h3><div class="eh-books">'
      + e.years.map(function (x, i) { return '<a class="card eh-book" ' + eattrs(x.w) + ' style="background:' + EBOOK[i % EBOOK.length] + '"><span class="tag">' + (OPENED[x.w[0]] ? 'Үзсэн' : 'ЭЕШ') + '</span><b>' + x.y + '</b><small>Сонгох · нөхөх</small></a>'; }).join('')
      + '</div>' + eTool() + '</div>';
    // Салбарууд: олон сэдэвтэй нь — сэдвийн товчнууд, ганц сэдэвтэй нь (Магадлал) — хуудсаараа; эхний мөрөнд админы хэрэгсэл
    var multi = [], single = [];
    (e.T.doms || []).forEach(function (dm) {
      var ts = e.topics.filter(function (x) { return x.d === dm[0]; });
      if (ts.length) (ts.length > 1 ? multi : single).push({ k: dm[0], name: dm[1], ts: ts });
    });
    var domBx = function (g, span) {
      var c = EDOM[g.k] || EDOM.alg, tot = 0; g.ts.forEach(function (x) { tot += x.total; });
      return '<div class="eh-bx eh-dom eh-s' + span + '"><h3><span class="eh-dot" style="background:' + c[0] + '"></span>' + esc(g.name) + '<span class="cnt">' + tot + ' бодлого</span></h3><div class="eh-tg">'
        + g.ts.map(function (x) { return eChip(x, true); }).join('') + '</div></div>';
    };
    var oneBx = function (g, span) {
      var c = EDOM[g.k] || EDOM.alg, x = g.ts[0];
      return '<div class="eh-bx eh-one eh-s' + span + '"><h3><span class="eh-dot" style="background:' + c[0] + '"></span><button type="button" class="eh-h" data-et="e-' + esc(x.s) + '">' + esc(g.name) + '</button><span class="cnt">' + x.total + ' бодлого</span></h3><div class="eh-pg">'
        + x.ws.map(function (p) { return '<a class="card" ' + eattrs(p.w) + ' style="background:' + c[1] + ';color:' + c[2] + '"><span class="tx">' + esc(p.sub) + '</span><span class="v">' + (OPENED[p.w[0]] ? EI.check : p.n) + '</span></a>'; }).join('') + '</div></div>';
    };
    var admBx = adm ? '<div class="eh-bx eh-adm eh-s3"><span class="eh-badge">' + EI.lock + 'Админ</span><h3>' + EI.spark + 'ЭЕШ материал үүсгэх</h3>'
      + '<p>Блюпринтээр (сонгох + нөхөх) бүх ЭЕШ бодлогоос санамсаргүй материал үүсгэж, хэвлэх эсвэл сурагчдад онлайн холбоос өгнө.</p><span class="eh-btn">' + EI.link + 'Удахгүй</span></div>' : '';
    if (multi.length) h += domBx(multi[0], 6);
    var free = 6 - (adm ? 3 : 0);
    single.forEach(function (g) { h += oneBx(g, single.length === 1 ? free : 3); });
    h += admBx;
    multi.slice(1).forEach(function (g, i, a) { h += domBx(g, a.length % 2 && i === a.length - 1 ? 12 : 6); });
    if (e.parts.length) h += '<div class="eh-bx eh-parts"><h3>' + EI.stack + 'ЭЕШ 1000 · хэсгээр<span class="cnt">Математик №' + e.parts[0].P + (e.parts.length > 1 ? '–' + e.parts[e.parts.length - 1].P : '') + '</span></h3><div class="eh-pts">'
      + e.parts.map(function (p) {
        return '<button type="button" class="eh-part" data-et="p' + p.P + '"><b>' + p.P + '-р хэсэг</b><small>' + p.n + ' бодлого · ' + p.ws.length + ' хуудас</small><span class="pp">'
          + p.ws.map(function (x) { return '<span' + eseen(x.w[0]) + '>' + p.P + '-' + x.j + '</span>'; }).join('') + '</span></button>';
      }).join('') + '</div></div>';
    if (e.other.length) h += '<div class="eh-bx eh-s12"><h3>Бусад хуудас<span class="cnt">' + e.other.length + '</span></h3>' + grid(e.other.map(function (w) { return card(w, 'ЭЕШ'); })) + '</div>';
    return h + '</div>';
  }
  function eHead(bg, ico, title, sub) {
    return '<div class="wsb-crumb"><a data-et="">ЭЕШ</a> › <b>' + esc(title) + '</b></div><div class="eh-dhead" style="background:' + bg + '"><span class="big">' + ico + '</span><div><h2>' + esc(title) + '</h2><p>' + esc(sub) + '</p></div>' + eback() + '</div>';
  }
  function eTopic(e, x) {
    var c = EDOM[x.d] || EDOM.alg, dn = edomName(e, x.d), mx = Math.max.apply(null, x.c.concat([1]));
    var h = eHead('linear-gradient(130deg,' + c[2] + ',' + c[0] + ')', TICO[x.s] || TICO._, x.n, (dn ? dn + ' · ' : '') + x.total + ' бодлого · ' + x.ws.length + ' хуудас');
    if (x.c.length) h += '<div class="eh-split">' + x.c.map(function (v, i) {
      return '<div class="sp"><small>' + ((e.T.parts[i] || [i + 1])[0]) + '-р хэсгээс</small><b>' + v + '</b><span class="mb"><i style="width:' + Math.round(100 * v / mx) + '%;background:' + c[0] + '"></i></span></div>';
    }).join('') + '</div>';
    h += '<div class="wsb-sec">Хуудсууд</div>' + grid(x.ws.map(function (p) { return card(p.w, 'ЭЕШ', x.n + '-' + p.j, p.sub + ' · ' + p.n + ' бодлого'); }));
    var sib = e.topics.filter(function (y) { return y.d === x.d && y !== x; });
    if (sib.length) h += '<div class="wsb-sec">' + esc(dn) + ' — бусад сэдэв</div><div class="eh-tg">' + sib.map(function (y) { return eChip(y, false); }).join('') + '</div>';
    return h;
  }
  function ePart(e, p) {
    var h = eHead('linear-gradient(130deg,#24196A,#5B3BD9)', EI.stack, 'ЭЕШ 1000 · ' + p.P + '-р хэсэг', 'Математик №' + p.P + ' · ' + p.n + ' бодлого · ' + p.ws.length + ' хуудас')
      + '<div class="wsb-sec">Хуудсууд</div>' + grid(p.ws.map(function (x) { return card(x.w, 'ЭЕШ', null, x.a + '–' + x.b + '-р бодлого'); }));
    var o = e.parts.filter(function (q) { return q !== p; });
    if (o.length) h += '<div class="wsb-sec">Бусад хэсэг</div><div class="eh-tg">' + o.map(function (q) {
      return '<button type="button" class="eh-chip" data-et="p' + q.P + '" style="background:#EFEAFE;color:#4B2BBF"><span class="ic">' + EI.stack + '</span>' + q.P + '-р хэсэг <span class="n">' + q.n + '</span></button>';
    }).join('') + '</div>';
    return h;
  }
  function eList(e, k) {
    if (k === 'y') return eHead('linear-gradient(130deg,#24196A,#7B52EE)', EI.cal, 'Он оны материал', eyears(e) + ' оны ЭЕШ · сонгох ба нөхөх даалгавар · ' + e.years.length + ' хуудас')
      + '<div class="wsb-sec">Хуудсууд</div>' + grid(e.years.map(function (x) { return card(x.w, 'ЭЕШ'); })) + (window.EESH_TOOL ? '<div class="eh-ebar">' + EESH_TOOL + '</div>' : '');
    return eHead('linear-gradient(130deg,#24196A,#5B3BD9)', '+', 'Бусад хуудас', e.other.length + ' хуудас') + '<div class="wsb-sec">Хуудсууд</div>' + grid(e.other.map(function (w) { return card(w, 'ЭЕШ'); }));
  }
  function eAside(d, e) {
    var row = function (t, ico, name, sub, cls) {
      return '<button type="button" class="wsb-ch' + (cls || '') + (ST.t === t || (t === '' && ST.t == null) ? ' on' : '') + '" data-et="' + t + '"><span class="wsb-rn">' + ico + '</span><span class="nm">' + esc(name) + '<small>' + esc(sub) + '</small></span></button>';
    };
    var h = row('', EI.home, 'ЭЕШ нүүр', d.items.length + ' хуудас');
    if (e.years.length) h += row('y', EI.cal16, 'Он оны материал', eyears(e) + ' · ' + e.years.length + ' хуудас');
    (e.T.doms || []).forEach(function (dm) {
      var ts = e.topics.filter(function (x) { return x.d === dm[0]; }); if (!ts.length) return;
      var c = EDOM[dm[0]] || EDOM.alg;
      h += '<div class="wsb-lbl eh-al"><i style="background:' + c[0] + '"></i>' + esc(dm[1]) + '</div><div class="wsb-tps eh-tps">' + ts.map(function (x) {
        return '<button type="button" class="wsb-tp' + (ST.t === 'e-' + x.s ? ' on' : '') + '" data-et="e-' + esc(x.s) + '" title="' + esc(x.n) + ' · ' + x.total + ' бодлого" style="--eh:' + c[0] + '"><b><i></i></b><span>' + esc(x.n) + '</span><em>' + x.total + '</em></button>';
      }).join('') + '</div>';
    });
    if (e.parts.length) h += '<div class="wsb-lbl">ЭЕШ 1000 · хэсгээр</div><div class="wsb-tps eh-tps">' + e.parts.map(function (p) {
      return '<button type="button" class="wsb-tp' + (ST.t === 'p' + p.P ? ' on' : '') + '" data-et="p' + p.P + '"><b>' + p.P + '</b><span>' + p.P + '-р хэсэг</span><em>' + p.n + '</em></button>';
    }).join('') + '</div>';
    if (e.other.length) h += row('o', '+', 'Бусад хуудас', e.other.length + ' хуудас', ' ext');
    return h;
  }

  /* Хайлт — бүх ангиас (гарчиг + сэдвийн нэр) */
  function newCount() { var n = 0; if (window.NEWSET) for (var k in NEWSET) if (NEWSET.hasOwnProperty(k)) n++; return n; }
  // Шинэ хуудсууд: gi ангийнх (gi < 0 → бүх анги). Нэг хуудас хэд хэдэн сэдэвт байрласан бол нэг л удаа.
  function newHits(gi) {
    if (!SEARCH) SEARCH = buildSearch();
    var seen = {};
    return SEARCH.filter(function (e) {
      var s = e.w[0];
      if (!(window.NEWSET && NEWSET[s]) || (gi >= 0 && e.gi !== gi) || seen[s]) return false;
      seen[s] = 1; return true;
    });
  }
  // Анхдагч нь сонгосон ангийнх; «Бүх анги» товчоор бусдыг харна. Тэр ангид шинэ алга бол шууд бүх анги.
  function newHtml() {
    var d = ST.g >= 0 ? gdata(ST.g) : null;
    var mine = d ? newHits(ST.g) : [], all = newHits(-1);
    var useAll = !mine.length || ST.nwAll, hits = useAll ? all : mine;
    var sw = mine.length && mine.length < all.length
      ? '<button type="button" class="wsb-nwsw" data-nwall="' + (useAll ? 0 : 1) + '">' + (useAll ? 'Зөвхөн ' + esc(d.label) + ' (' + mine.length + ')' : 'Бүх анги (' + all.length + ')') + '</button>' : '';
    var note = d && !mine.length ? esc(d.label) + ': шинэ хуудас алга, бүх ангийнхыг харуулав. ' : '';
    return resultsHtml(back() + '<div class="wsb-head"><span class="wsb-num">' + ICO.star + '</span><h2>Шинэ хуудсууд' + (useAll ? '' : ' · ' + esc(d.label)) + ' — ' + hits.length + '</h2>' + sw + '</div>'
      + '<div class="wsb-meta"><span>' + note + 'Сүүлд орсноос хойш нэмэгдсэн. Нээсэн хуудас жагсаалтаас гарна.</span></div>', hits, { per: 60, total: 400, hint: 'эсвэл ангиа сонгоно уу' });
  }
  function norm(s) { return String(s || '').toLowerCase().replace(/[«»"'.,:;!?()[\]{}—–-]+/g, ' ').replace(/\s+/g, ' ').trim(); }
  function buildSearch() {
    var out = [];
    groups().forEach(function (g, gi) {
      var d = gdata(gi); if (!d) return;
      var put = function (list, n, path) { list.forEach(function (w) { out.push({ w: w, gi: gi, id: n ? n.id : 'rest', path: path, hay: norm(titleOf(w) + ' ' + path) }); }); };
      if (isEesh(d)) {                                   // ЭЕШ: нүүрийн бүтцээр (он, сэдэв, хэсэг)
        var e = edata(d), putE = function (id, path, w, extra) { out.push({ w: w, gi: gi, id: id, path: path, hay: norm(titleOf(w) + ' ' + path + ' ' + (extra || '')) }); };
        e.years.forEach(function (x) { putE('y', d.label + ' › Он оны материал', x.w); });
        e.topics.forEach(function (x) { x.ws.forEach(function (p) { putE('e-' + x.s, d.label + ' › ' + edomName(e, x.d) + ' › ' + x.n, p.w, p.sub); }); });
        e.parts.forEach(function (p) { p.ws.forEach(function (x) { putE('p' + p.P, d.label + ' › ЭЕШ 1000 · ' + p.P + '-р хэсэг', x.w); }); });
        e.other.forEach(function (w) { putE('o', d.label + ' › Бусад хуудас', w); });
        return;
      }
      var walk = function (n) {
        var path = d.label + ' › ' + (n.chapter && n.chapter !== n ? (n.chapter.roman ? n.chapter.roman + ' бүлэг › ' : n.chapter.title + ' › ') : '') + (n.num ? n.num + ' ' : '') + (n.exam ? 'Жишиг ба шалгалт' : n.title);
        put(n.own, n, path); n.kids.forEach(walk);
      };
      d.chapters.concat(d.extras).forEach(walk);
      put(d.rest, null, d.label + ' › Бусад хуудас');
    });
    return out;
  }
  function searchHtml() {
    if (!SEARCH) SEARCH = buildSearch();
    var toks = norm(ST.q).split(' ').filter(Boolean);
    var hits = SEARCH.filter(function (e) { for (var i = 0; i < toks.length; i++) if (e.hay.indexOf(toks[i]) < 0) return false; return true; });
    return resultsHtml(back() + '<div class="wsb-head"><h2>«' + esc(ST.q) + '» — ' + hits.length + ' хуудас</h2></div>', hits);
  }
  // lim = { per: сэдэв бүрд, total: нийт } — хайлтад 12 / 120 (гарчиг дээр дарж бүгдийг үзнэ)
  function resultsHtml(h, hits, lim) {
    if (!hits.length) return h + '<div class="wsb-empty">Олдсонгүй. Өөр үгээр хайгаад үзээрэй.</div>';
    var per = (lim && lim.per) || 12, total = (lim && lim.total) || 120;
    var byKey = {}, keys = [], shown = 0;
    hits.forEach(function (e) { var k = e.gi + ':' + e.id; if (!byKey[k]) { byKey[k] = []; keys.push(k); } byKey[k].push(e); });
    keys.forEach(function (k) {
      if (shown >= total) return;
      var arr = byKey[k], e0 = arr[0], lab = groups()[e0.gi][0];
      h += '<div class="wsb-rhead"><a data-go="' + k + '">' + esc(e0.path) + '</a></div>' + grid(arr.slice(0, per).map(function (e) { shown++; return card(e.w, lab); }));
    });
    if (shown < hits.length) h += '<div class="wsb-empty">' + hits.length + ' хуудаснаас ' + shown + '-г харууллаа. Бүгдийг харахын тулд гарчиг дээр дарж сэдэв рүү орно уу' + (lim && lim.hint ? ', ' + lim.hint : '') + '.</div>';
    return h;
  }

  /* ───────── зурах ───────── */
  function render(keepAside) {
    if (!ROOT) return;
    var d = ST.g >= 0 ? gdata(ST.g) : null;
    if (ST.g >= 0 && !d) { ST.g = -1; ST.ch = ST.t = null; }
    var ee = isEesh(d) ? edata(d) : null;
    if (ee && ST.t != null && !enode(ee, ST.t)) ST.t = null;
    ROOT.classList.toggle('wsb-ee', !!ee && !ST.q && !ST.nw);
    if (!keepAside) ASIDE.innerHTML = asideHtml();
    if (ee) {
      MAIN.innerHTML = ST.q ? searchHtml() : ST.nw ? newHtml() : eHtml(d, ee);
      ROOT.classList.toggle('wsb-m-main', !!(ST.q || ST.nw || ST.t != null || !EA));
      return;
    }
    var n = d && ST.t != null ? (ST.t === 'rest' ? { id: 'rest', title: 'Бусад хуудас' } : d.map[ST.t]) : null;
    if (ST.t != null && !n) ST.t = null;
    var ch = d && ST.ch != null ? d.map[ST.ch] : null;
    MAIN.innerHTML = ST.q ? searchHtml() : ST.nw ? newHtml() : (!d ? pickHtml() : (n ? topicHtml(d, n) : (ch ? chapterHtml(d, ch) : gradeHtml(d))));
    ROOT.classList.toggle('wsb-m-main', !!(ST.q || ST.nw || ST.t != null));
  }
  function hashOf() { return ST.g < 0 ? '' : '#ws=g' + ST.g + (ST.t != null ? 't' + ST.t : (ST.ch != null ? 'c' + ST.ch : '')); }
  function go(patch, opts) {
    opts = opts || {};
    if (curView() !== 'wsb') view('wsb', { hash: false, scroll: false });   // каталогийн үйлдэл — «Ажлын хуудас» таб руу
    if (!('nw' in patch)) ST.nw = false;
    EA = false;
    for (var k in patch) ST[k] = patch[k];
    if (ST.g >= 0) lsW(GRADE_KEY, groups()[ST.g] ? groups()[ST.g][0] : '');
    var h = hashOf();
    if (!opts.noHash && h && h !== location.hash) { try { history.pushState({ wsb: 1 }, '', location.pathname + location.search + h); } catch (e) {} }
    render(opts.keepAside);
    if (opts.scroll !== false) {
      var top = (MQ.matches ? ROOT : MAIN).getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight * 0.6) ROOT.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }
  function parseHash() {
    var m = String(location.hash || '').match(/^#ws=g(\d+)(?:t(\d+|rest|e-[a-z-]+|p\d+|[yo])|c(\d+))?$/);   // e-/p/y/o — ЭЕШ нүүрийн хэсэг
    if (!m) return false;
    var g = +m[1], d = gdata(g); if (!d) return false;
    var t = m[2] ? (/^\d+$/.test(m[2]) ? +m[2] : m[2]) : null, c = m[3] ? +m[3] : null;
    if (typeof t === 'number' && d.map[t]) c = d.map[t].chapter ? d.map[t].chapter.id : null;
    ST.g = g; ST.t = t; ST.ch = c; return true;
  }
  function initialState() {
    if (parseHash()) return;
    var lab = lsJ(GRADE_KEY, ''), gs = groups();
    for (var i = 0; i < gs.length; i++) if (gs[i][0] === lab) { ST.g = i; return; }
  }

  // Дасгал ажлын дэвтэр (админ): попапыг товшилтоос шууд нээнэ (blocker), ws-book.js-ийг хэрэгтэй үед л ачаална
  function openBook() {
    var pw = window.open('', '_blank');
    if (!pw) { alert('Popup блоклогдсон байна. Хөтчийн popup зөвшөөрлийг идэвхжүүлээд дахин дарна уу.'); return; }
    var g = ST.g, go = function () { window.WSBOOK.build(g, pw); };
    if (window.WSBOOK) { go(); return; }
    var s = document.createElement('script'); s.src = '/ws-book.js?v=12';
    s.onload = go; s.onerror = function () { try { pw.document.body.textContent = 'ws-book.js ачаалагдсангүй'; } catch (e) {} };
    document.head.appendChild(s);
  }

  /* ───────── үйлдэл ───────── */
  function onClick(e) {
    var t = e.target;
    var c = t.closest('.card');
    if (c && ROOT.contains(c)) {
      var slug = c.getAttribute('data-slug');
      if (slug && !OPENED[slug] && !(window.editMode)) { OPENED[slug] = 1; lsW(OPEN_KEY, Object.keys(OPENED).slice(-3000)); c.classList.add('seen'); }
      if (ST.g >= 0) lsW(LAST_KEY, { g: ST.g, t: ST.t != null ? ST.t : null });
      if (slug && !window.editMode && isEesh(gdata(ST.g))) { lsW(EESH_LAST, slug); eDirty = true; }   // ЭЕШ нүүрийн «Үргэлжлүүлэх», явц
      if (typeof catalogClick === 'function') catalogClick(e);
      return;
    }
    var el;
    if ((el = t.closest('[data-view]'))) { e.preventDefault(); view(el.getAttribute('data-view')); return; }
    if ((el = t.closest('[data-new]'))) { go({ nw: !ST.nw, nwAll: false, q: '' }, { noHash: true }); return; }
    if ((el = t.closest('[data-nwall]'))) { ST.nwAll = el.getAttribute('data-nwall') === '1'; render(true); return; }
    if ((el = t.closest('[data-book]'))) { openBook(); return; }
    if ((el = t.closest('[data-gpick]'))) { go({ g: +el.getAttribute('data-gpick'), ch: null, t: null, q: '' }); return; }
    if ((el = t.closest('[data-et]'))) { go({ t: el.getAttribute('data-et') || null, ch: null, q: '' }); return; }   // ЭЕШ нүүр / хэсэг
    if ((el = t.closest('[data-go]'))) {
      var p = el.getAttribute('data-go').split(':'), g = +p[0], id = /^\d+$/.test(p[1]) ? +p[1] : p[1], dd = gdata(g);
      var cc = (dd && typeof id === 'number' && dd.map[id] && dd.map[id].chapter) ? dd.map[id].chapter.id : null;
      go({ g: g, t: id, ch: cc, q: '' }); return;
    }
    if ((el = t.closest('.wsb-mback'))) {
      if (ST.q || ST.nw) { ST.q = ''; ST.nw = false; render(); return; }
      if (ST.t == null && isEesh(gdata(ST.g))) { EA = true; render(true); ROOT.scrollIntoView({ block: 'start' }); return; }   // ЭЕШ нүүр → агуулгын хүснэгт
      if (ST.t != null || ST.ch != null) { go({ t: null, ch: MQ.matches ? ST.ch : null }, {}); return; }
      return;
    }
    if ((el = t.closest('[data-crumb]'))) {
      if (el.getAttribute('data-crumb') === 'g') go({ t: null, ch: null, q: '' });
      else go({ t: null, ch: +el.getAttribute('data-id'), q: '' });
      return;
    }
    if ((el = t.closest('[data-ch]'))) {
      var d = gdata(ST.g), n = d && d.map[+el.getAttribute('data-ch')]; if (!n) return;
      if (!n.kids.length) { go({ t: n.id, ch: n.id, q: '' }); return; }   // дэд сэдэвгүй — шууд хуудсууд
      var inAside = ASIDE.contains(el);
      if (inAside && ST.ch === n.id && ST.t == null) { go({ ch: null }, { scroll: false }); return; }   // хураах
      if (inAside && MQ.matches) { ST.ch = ST.ch === n.id ? null : n.id; ASIDE.innerHTML = asideHtml(); return; } // утсанд: зөвхөн задлах
      go({ ch: n.id, t: null, q: '' });
      return;
    }
    if ((el = t.closest('[data-t]'))) {
      var d2 = gdata(ST.g), id2 = el.getAttribute('data-t'), tid = id2 === 'rest' ? 'rest' : +id2;
      var n2 = tid === 'rest' ? null : d2 && d2.map[tid];
      go({ t: tid, ch: n2 && n2.chapter ? n2.chapter.id : ST.ch, q: '' });
    }
  }

  /* Дээд цэс = таб: Ажлын хуудас · Слайд хичээл · Тоглоом · Интерактив · Видео — нэг удаад зөвхөн сонгосон хэсэг (body[data-wsv],
     ws-browse.css); /worksheets#slides, #games, #interactive, #videos хаягаар шууд тэр таб нээгдэнэ, «Буцах» өмнөх таб руу.
     Интерактив/Видео — ws-media.js. «Үнэ ба эрх» — худалдан авах цонх */
  var VIEW_HASH = { gamesSec: '#games', slidesSec: '#slides', intSec: '#interactive', vidSec: '#videos' };
  function curView() { return document.body.getAttribute('data-wsv') || 'wsb'; }
  function viewFromHash() { for (var k in VIEW_HASH) if (VIEW_HASH[k] === location.hash) return k; return 'wsb'; }
  // o: { hash: false — хаяг өөрчлөхгүй, scroll: false — гүйлгэхгүй, force: хоосон (ачаалагдаж буй) хэсгийг ч нээнэ }
  function view(k, o) {
    o = o || {};
    if (!VIEW_HASH[k]) k = 'wsb';
    var sec = k === 'wsb' ? ROOT : document.getElementById(k);
    if (!sec || (sec.hidden && !o.force)) { if (typeof toast === 'function') toast('Энэ хэсэг одоохондоо хоосон байна'); return false; }
    var was = curView();
    document.body.setAttribute('data-wsv', k);
    var nav = document.getElementById('wsbNav'), on = null;
    if (nav) [].forEach.call(nav.querySelectorAll('a[data-nav]'), function (a) { var m = a.getAttribute('data-nav') === k; a.classList.toggle('on', m); if (m) on = a; });
    if (on && nav.scrollWidth > nav.clientWidth) {        // утсанд цэс хөндлөн гүйдэг — идэвхтэй таб харагдана
      var nr = nav.getBoundingClientRect(), ar = on.getBoundingClientRect();
      if (ar.left < nr.left) nav.scrollLeft -= nr.left - ar.left + 8; else if (ar.right > nr.right) nav.scrollLeft += ar.right - nr.right + 8;
    }
    if (o.hash !== false) {
      var h = k === 'wsb' ? hashOf() : VIEW_HASH[k];
      if (h !== location.hash) { try { history.pushState({ wsv: k }, '', location.pathname + location.search + h); } catch (e) {} }
    }
    if (o.scroll !== false) {                             // хэсгийн эхлэл дэлгэцэнд харагдахгүй бол л гүйлгэнэ (цэс дээд талдаа үлдэнэ)
      var top = sec.getBoundingClientRect().top;
      if (top < 0 || top > window.innerHeight - 120) sec.scrollIntoView({ block: 'start', behavior: was === k ? 'smooth' : 'auto' });
    }
    return true;
  }
  function topNav() {
    var bar = document.querySelector('.topbar'); if (!bar || document.getElementById('wsbNav')) return;
    var nav = document.createElement('nav'); nav.id = 'wsbNav'; nav.setAttribute('aria-label', 'Дасгалын төвийн цэс');
    nav.innerHTML = '<a href="#" data-nav="wsb" class="on">' + ICO.book + 'Ажлын хуудас</a>'
      + '<a href="#slides" data-nav="slidesSec">' + ICO.slide + 'Слайд хичээл</a>'
      + '<a href="#games" data-nav="gamesSec">' + ICO.game + 'Тоглоом</a>'
      + (document.getElementById('intSec') ? '<a href="#interactive" data-nav="intSec">' + ICO.intr + 'Интерактив</a>' : '')
      + (document.getElementById('vidSec') ? '<a href="#videos" data-nav="vidSec">' + ICO.vid + 'Видео</a>' : '')
      + '<a href="#" data-nav="buy">' + ICO.tag + 'Үнэ ба эрх</a>';
    var back = bar.querySelector('.back');
    bar.insertBefore(nav, back ? back.nextSibling : bar.firstChild);
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-nav]'); if (!a) return;
      e.preventDefault();
      var k = a.getAttribute('data-nav');
      if (k === 'buy') { if (typeof openBuy === 'function') openBuy(); return; }
      view(k);
    });
  }

  function init() {
    loadThumbs();
    topNav();
    ROOT = document.createElement('section'); ROOT.id = 'wsb'; ROOT.setAttribute('aria-label', 'Ажлын хуудасны агуулга');
    ROOT.innerHTML = '<aside class="wsb-aside"></aside><div class="wsb-main" aria-live="polite"></div>';
    ASIDE = ROOT.firstChild; MAIN = ROOT.lastChild;
    var wrap = document.querySelector('.wrap'), before = document.getElementById('gamesSec') || document.querySelector('.controls');
    wrap.insertBefore(ROOT, before && before.parentNode === wrap ? before : null);
    document.body.classList.add('wsb-on');
    view(viewFromHash(), { hash: false, scroll: false, force: true });
    document.body.classList.toggle('wsb-admin', typeof isAdmin === 'function' && !!isAdmin());
    ROOT.addEventListener('click', onClick);
    ROOT.addEventListener('dblclick', function (e) { if (e.target.closest('.card')) e.preventDefault(); });
    ROOT.addEventListener('contextmenu', function (e) {
      var c = e.target.closest('.card'); if (!c || typeof openMenu !== 'function') return;
      e.preventDefault(); openMenu(c, e.clientX, e.clientY);
    });
    ROOT.addEventListener('change', function (e) {
      if (e.target.matches('.wsb-gsel select')) { var v = +e.target.value; if (v >= 0) go({ g: v, ch: null, t: null, q: '' }); }
    });
    ROOT.addEventListener('input', function (e) {
      if (!e.target.matches('.wsb-search input')) return;
      var v = e.target.value;
      clearTimeout(qTimer);
      qTimer = setTimeout(function () { ST.q = v.trim(); render(true); }, 160);
    });
    if (typeof initPreview === 'function') initPreview('wsb');
    window.addEventListener('popstate', function () {
      var v = viewFromHash();
      EA = false;
      view(v, { hash: false, scroll: false, force: true });
      if (v !== 'wsb') return;                                         // тоглоом/слайд таб — каталогийн төлөв хэвээр
      if (parseHash() || !/^#ws=/.test(location.hash)) { if (!/^#ws=/.test(location.hash)) { ST.t = null; ST.ch = null; } render(); }
    });
    if (MQ.addEventListener) MQ.addEventListener('change', function () { render(); });
    document.addEventListener('visibilitychange', function () {   // ЭЕШ нүүр: хуудсаа нээгээд буцаж ирэхэд явц, «Үргэлжлүүлэх» шинэчлэгдэнэ
      if (eDirty && document.visibilityState === 'visible' && curView() === 'wsb' && !ST.q && !ST.nw && isEesh(gdata(ST.g))) { eDirty = false; render(true); }
    });
    initialState();
    render();
  }

  /* Өгөгдөл өөрчлөгдөх бүрд (дэд бүлэг ачаалах, админ засвар …) дахин зурна */
  var _rc = renderCatalog;
  window.renderCatalog = renderCatalog = function () {
    var r = _rc.apply(this, arguments);
    CACHE = {}; SEARCH = null;
    if (ROOT) { if (ST.g < 0 || !gdata(ST.g)) initialState(); render(); }
    return r;
  };
  if (typeof toggleEdit === 'function') {
    var _te = toggleEdit;
    window.toggleEdit = toggleEdit = function () { var r = _te.apply(this, arguments); if (ROOT && !window.editMode) { CACHE = {}; SEARCH = null; render(); } return r; };
  }
  // gdata/groups/titleOf/deepItems — ws-book.js (Дасгал ажлын дэвтэр) каталогийн бүтцийг эндээс уншина;
  // view — дээд цэсний таб солих (worksheets.html-ийн GW.scrollTo / PPTW.scrollTo дууддаг)
  window.WSB = { render: function () { CACHE = {}; SEARCH = null; render(); }, state: ST, gdata: gdata, groups: groups, titleOf: titleOf, deepItems: deepItems, view: view };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
