/* CyberMath — утсан дээрх апп маягийн харагдац (≤768px). Хэв маяг: app-mobile.css
   1) Апп (нэвтэрсэн/демо): доод таб (Зам · Тоглоом · Mathlet · Тэргүүлэгч · Цааш) ба «Цааш» хуудас.
      Табыг сайтын жинхэнэ товчоор (.tabs .tab-btn → switchTab) сольдог тул табын логик хэвээр; замын SVG-д хүрэхгүй.
   2) Угтах дэлгэц (нэвтрээгүй landing): нэг дэлгэцтэй, «Дэлгэрэнгүй»-гээр маркетингийн хэсгүүд нээгдэнэ.
   3) «Апп болгож суулгах»: Android-д суулгах цонх, iPhone-д алхам алхмаар заавар.
   Ширээний дэлгэц, embed (iframe) горимд юу ч хийхгүй. */
(function () {
  'use strict';
  if (window.top !== window.self || document.documentElement.classList.contains('cm-embed')) return;
  var MQ = window.matchMedia('(max-width: 768px)');
  function S(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var IC = {
    path: S('<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5L9 4Z"/><path d="M9 4v13.5M15 6.5V20"/>'),
    games: S('<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M15.5 11.5h.01M17.5 13.5h.01" stroke-width="3"/>'),
    mathlet: S('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>'),
    trophy: S('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    grid: S('<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>'),
    medal: S('<circle cx="12" cy="14.5" r="6"/><path d="M8.5 3h7L14 8.6h-4L8.5 3Z"/><path d="m12 11.8.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 13.9l2-.3.9-1.8Z"/>'),
    exam: S('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1"/><path d="m9 13 2 2 4-4"/>'),
    cls: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    friends: S('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>'),
    profile: S('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="10" r="3"/><path d="M6.2 18.4a7 7 0 0 1 11.6 0"/>'),
    play: S('<circle cx="12" cy="12" r="10"/><path d="m10 8 6 4-6 4V8Z"/>'),
    install: S('<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M12 7v7M9 11l3 3 3-3M10 18h4"/>'),
    share: S('<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/>'),
    plusbox: S('<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M12 8v8M8 12h8"/>'),
    dots: S('<path d="M12 5h.01M12 12h.01M12 19h.01" stroke-width="3.2"/>'),
    down: S('<path d="M12 4v15M6 13l6 6 6-6"/>')
  };
  var NAV = [['path', 'Зам', IC.path], ['games', 'Тоглоом', IC.games], ['mathlet', 'Mathlet', IC.mathlet], ['leaderboard', 'Тэргүүлэгч', IC.trophy], ['more', 'Цааш', IC.grid]];
  var app = null, land = null, nav = null, sheet = null, built = false;

  // Анхаар: tab-mathlet / tab-classroom / tab-exam нь #cybermath-app-ийн гадна (body-д) байрладаг
  var TC = '.tab-content[id^="tab-"]';
  function tabBtn(k) { return document.querySelector('.tabs .tab-btn[onclick*="switchTab(\'' + k + '\')"]'); }
  function activeTab() { var c = document.querySelector(TC + '.active'); return c ? c.id.replace(/^tab-/, '') : 'path'; }
  function visible(el) { return !!el && el.style.display !== 'none' && getComputedStyle(el).display !== 'none'; }

  function go(k) {
    closeSheet();
    var b = tabBtn(k); if (!b) return;
    if (activeTab() !== k) b.click();      // сайтын өөрийн switchTab (event.target = жинхэнэ товч)
    window.scrollTo(0, 0);
    sync();
  }
  function sync() {
    var k = activeTab();
    document.body.className = document.body.className.replace(/(^|\s)cm-tab-\S+/g, '').trim();
    document.body.classList.add('cm-tab-' + k);
    if (!nav) return;
    var inNav = NAV.some(function (n) { return n[0] === k; });
    [].forEach.call(nav.children, function (b) {
      var on = b.getAttribute('data-k') === (inNav ? k : 'more');
      b.classList.toggle('on', on);
      if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
  }

  /* ── Доороос гарах хуудас (bottom sheet) ── */
  function openSheet(title, html, bind) {
    if (!sheet) {
      sheet = document.createElement('div'); sheet.id = 'cm-sheet';
      sheet.innerHTML = '<div class="bd"></div><div class="pn" role="dialog"><div class="hd"></div><h4></h4><div class="bx"></div></div>';
      sheet.querySelector('.bd').addEventListener('click', closeSheet);
      document.body.appendChild(sheet);
    }
    sheet.querySelector('.pn').setAttribute('aria-label', title);
    sheet.querySelector('h4').textContent = title;
    sheetOnClose = null;
    var bx = sheet.querySelector('.bx'); bx.innerHTML = html; if (bind) bind(bx);
    sheet.classList.add('on');
    requestAnimationFrame(function () { requestAnimationFrame(function () { sheet.classList.add('show'); }); });
  }
  var sheetOnClose = null;   // хаагдах үед (товч, арын хэсэг, Esc) нэг удаа дуудагдана
  function closeSheet() {
    if (!sheet || !sheet.classList.contains('on')) return;
    if (sheetOnClose) { var f = sheetOnClose; sheetOnClose = null; try { f(); } catch (e) {} }
    sheet.classList.remove('show');
    setTimeout(function () { if (!sheet.classList.contains('show')) sheet.classList.remove('on'); }, 330);
  }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });

  function moreItems() {
    var exam = tabBtn('exam'), soon = exam && /SOON|удахгүй/i.test(exam.textContent);
    var L = [
      ['Амжилт', IC.medal, function () { go('achievements'); }],
      ['Шалгалт', IC.exam, function () { go('exam'); }, soon ? 'Удахгүй' : ''],
      ['Найзууд', IC.friends, function () { closeSheet(); if (window.openFriends) window.openFriends(); }],
      ['Профайл', IC.profile, function () { closeSheet(); if (window.handleAvatarClick) window.handleAvatarClick(); }],
      ['Зааварчилгаа', IC.play, function () { closeSheet(); if (window.openTutorialModal) window.openTutorialModal(); }]
    ];
    if (visible(document.getElementById('tab-btn-classroom'))) L.splice(2, 0, ['Анги', IC.cls, function () { go('classroom'); }]);
    if (!standalone()) L.push(['Апп суулгах', IC.install, function () { install(); }]);
    return L;
  }
  function openMore() {
    var items = moreItems();
    openSheet('Цааш', '<div class="gr">' + items.map(function (it, i) {
      return '<button type="button" data-i="' + i + '"><i>' + it[1] + '</i>' + it[0] + (it[3] ? '<em>' + it[3] + '</em>' : '') + '</button>';
    }).join('') + '</div>', function (bx) {
      [].forEach.call(bx.querySelectorAll('button[data-i]'), function (b) { b.addEventListener('click', function () { items[+b.getAttribute('data-i')][2](); }); });
    });
  }

  /* ── Апп болгож суулгах (PWA: manifest.json display=standalone) ── */
  var deferred = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', function () { deferred = null; closeSheet(); });
  function standalone() { return (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  function platform() {
    var ua = navigator.userAgent;
    return {
      ios: /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1),
      inapp: /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger|Line\/|KAKAOTALK|TikTok|musical_ly/i.test(ua),   // Facebook/Messenger г.м. доторх хөтөч
      iosOther: /CriOS|FxiOS|EdgiOS/i.test(ua)                                                        // iPhone дээрх Chrome/Firefox/Edge
    };
  }
  function a2hsSteps(pl) {
    if (pl.inapp) return '<ol><li>Баруун дээд буланд <b>⋯</b> цэсийг дарна.</li><li><b>' + (pl.ios ? 'Safari' : 'Chrome') +
      '-аар нээх</b> (Open in browser)-ийг сонгоно.</li><li>Нээгдсэн хөтөч дээр <b>Нүүр дэлгэцэнд нэмэх</b>-ийг хийнэ.</li></ol>';
    if (pl.ios && pl.iosOther) return '<ol><li>Хаягийн мөрөн дэх <b>Хуваалцах</b> ' + IC.share + ' товчийг дарна.</li><li><b>Нүүр дэлгэцэнд нэмэх</b> (Add to Home Screen) ' +
      IC.plusbox + '-г сонгоно.</li><li><b>Нэмэх</b> (Add) дарна.</li></ol>';
    if (pl.ios) return '<ol><li>Safari-гийн доод мөрөн дэх <b>Хуваалцах</b> ' + IC.share + ' товчийг дарна.</li><li>Цэсээ доош гүйлгээд <b>Нүүр дэлгэцэнд нэмэх</b> (Add to Home Screen) ' +
      IC.plusbox + '-г сонгоно.</li><li>Баруун дээд буланд <b>Нэмэх</b> (Add) дарна.</li></ol>';
    return '<ol><li>Хөтчийн баруун дээд буланд <b>⋮</b> цэсийг дарна.</li><li><b>Нүүр дэлгэцэнд нэмэх</b> (Add to Home screen) эсвэл <b>Апп суулгах</b>-ийг сонгоно.</li><li><b>Нэмэх</b> / <b>Суулгах</b> дарна.</li></ol>';
  }
  // auto=true: өөрөө гарч ирсэн санал — «Дахин харуулахгүй» чектэй
  function installSheet(auto) {
    var pl = platform(), can = !!deferred && !pl.ios && !pl.inapp;   // Android Chrome: шууд суулгах цонх
    openSheet('Нүүр дэлгэцэндээ нэмээрэй',
      '<p class="tx">CyberMath-ыг утасныхаа нүүр дэлгэцэнд нэмбэл апп шиг нэг товшилтоор нээгдэж, хөтчийн мөргүй бүтэн дэлгэцээр ажиллана.</p>' +
      (can ? '' : a2hsSteps(pl)) +
      '<button type="button" class="ok">' + (can ? 'Нүүр дэлгэцэнд нэмэх' : 'Ойлголоо') + '</button>' +
      (auto ? '<label class="nomore"><input type="checkbox"> Дахин харуулахгүй</label>' : '') +
      (pl.ios && !pl.iosOther && !pl.inapp ? '<div class="arw" aria-hidden="true">' + IC.down + '</div>' : ''),
      function (bx) {
        var cb = bx.querySelector('.nomore input');
        sheetOnClose = function () { if (cb && cb.checked) lsSet(A2HS_OFF, '1'); };
        bx.querySelector('.ok').addEventListener('click', function () {
          closeSheet();
          if (can && deferred) { var d = deferred; deferred = null; d.prompt(); if (d.userChoice && d.userChoice.catch) d.userChoice.catch(function () {}); }
        });
      });
  }
  function install() {   // гараар («Цааш», угтах дэлгэц): Android-д шууд суулгах цонх, бусад нь заавар
    if (deferred && !platform().inapp) {
      closeSheet();
      var d = deferred; deferred = null;
      d.prompt(); if (d.userChoice && d.userChoice.catch) d.userChoice.catch(function () {});
      return;
    }
    installSheet(false);
  }
  /* Утсаар орсон хүнд нэг сесс-д нэг удаа «Нүүр дэлгэцэндээ нэмээрэй» санал (бусад цонх нээлттэй бол хүлээнэ) */
  var A2HS_OFF = 'cm_a2hs_off', A2HS_SEEN = 'cm_a2hs_seen';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  function busy() {
    if (document.querySelector('.modal-overlay.open')) return true;
    var am = document.getElementById('auth-modal'); if (am && am.style.display === 'flex') return true;
    var sp = document.getElementById('cm-splash'); if (sp && visible(sp) && +getComputedStyle(sp).opacity > 0.05) return true;
    return !!(sheet && sheet.classList.contains('on'));
  }
  function autoPrompt() {
    if (standalone() || lsGet(A2HS_OFF) === '1' || ssGet(A2HS_SEEN) === '1') return;
    if (!(navigator.maxTouchPoints > 0 || 'ontouchstart' in window)) return;
    var tries = 0;
    (function tryShow() {
      if (lsGet(A2HS_OFF) === '1' || ssGet(A2HS_SEEN) === '1' || !MQ.matches) return;
      var on = document.body.classList.contains('cm-app-on') || document.body.classList.contains('cm-land-on');
      if (!on || busy()) { if (++tries < 40) setTimeout(tryShow, 3000); return; }
      ssSet(A2HS_SEEN, '1');
      installSheet(true);
    })();
  }

  /* ── Апп (доод навигаци) ── */
  function build() {
    if (built) return; built = true;
    nav = document.createElement('nav'); nav.id = 'cm-bnav'; nav.setAttribute('aria-label', 'Үндсэн цэс');
    nav.innerHTML = NAV.map(function (n) { return '<button type="button" data-k="' + n[0] + '"><i>' + n[2] + '</i><span>' + n[1] + '</span></button>'; }).join('');
    nav.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var k = b.getAttribute('data-k');
      if (k === 'more') openMore(); else go(k);
    });
    document.body.appendChild(nav);
    // Табыг өөр газраас (switchTab) сольсон ч навигаци дагана
    var mo = new MutationObserver(sync);
    [].forEach.call(document.querySelectorAll(TC), function (c) { mo.observe(c, { attributes: true, attributeFilter: ['class'] }); });
    sync();
  }
  /* ── Угтах дэлгэц (landing) ── */
  function buildLand() {
    if (document.getElementById('cm-land-more')) return;   // сайт hero-г дахин зурсан бол дахин нэмнэ
    var hc = document.querySelector('#hero .hero-content'); if (!hc) return;
    var more = document.createElement('button'); more.type = 'button'; more.id = 'cm-land-more'; more.textContent = 'Дэлгэрэнгүй мэдээлэл';
    more.addEventListener('click', function () {
      document.body.classList.add('cm-land-more');
      var f = document.getElementById('features'); if (f) setTimeout(function () { f.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 50);
    });
    hc.appendChild(more);
    if (!standalone()) {
      var ins = document.createElement('button'); ins.type = 'button'; ins.id = 'cm-land-install'; ins.textContent = 'Утсандаа апп болгож суулгах';
      ins.addEventListener('click', install);
      hc.appendChild(ins);
    }
  }
  function update() {
    var appOn = MQ.matches && visible(app);
    var landOn = MQ.matches && !appOn && visible(land);
    if (appOn) build();
    if (landOn) buildLand();
    document.body.classList.toggle('cm-app-on', appOn);
    document.body.classList.toggle('cm-land-on', landOn);
    if (!appOn && !landOn) closeSheet();
    if (appOn) sync();
  }
  function init() {
    app = document.getElementById('cybermath-app'); land = document.getElementById('landing-page');
    if (!app) return;
    var mo = new MutationObserver(update);
    mo.observe(app, { attributes: true, attributeFilter: ['style', 'class'] });
    if (land) mo.observe(land, { attributes: true, attributeFilter: ['style', 'class'] });
    if (MQ.addEventListener) MQ.addEventListener('change', update); else if (MQ.addListener) MQ.addListener(update);
    update();
    setTimeout(autoPrompt, 3500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
