/* CyberMath — «Тэргүүлэгч» ба «Mathlet» табын шинэ цайвар загвар (C «Адал явдал»). Хэв маяг: cm-compete.css
   Сайтын өгөгдөл, функц хэвээр: loadLeaderboard (#lb-list), renderMathletHub (#mathlet-hub-content)-ийн гаргасныг уншиж,
   табын эхэнд шинэ харагдацыг зурна (#mx-lb, #mx-ml); эх нь далд үлдэнэ (таб дээр .mx-on). Танигдаагүй төлөвт эх харагдац хэвээр.
   Үйлдэл бүр сайтын өөрийн функцээр: doJoinMathlet, resumeMathlet, resumeTeacherMathlet, openMathletSetupForClass, табыг жинхэнэ товчоор.
   Унтраах: ?ui=old (cm-ui.js-тэй нэг түлхүүр cm_ui). Embed (iframe) горимд юу ч хийхгүй. */
(function () {
  'use strict';
  var d = document, H = d.documentElement;
  if (window.top !== window.self || H.classList.contains('cm-embed')) return;
  try {
    var q = new URLSearchParams(location.search).get('ui');
    if (q === 'old' || (q !== 'new' && localStorage.getItem('cm_ui') === 'old')) return;
  } catch (e) {}

  function S(p, f) {
    return '<svg viewBox="0 0 24 24" fill="' + (f ? 'currentColor' : 'none') + '" stroke="' + (f ? 'none' : 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var IC = {
    trophy: S('<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>'),
    crown: S('<path d="M3.5 8.5 7.8 12 12 5.5l4.2 6.5 4.3-3.5L18.6 19H5.4L3.5 8.5Z"/>', 1),
    play: S('<path d="M7.5 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2a1 1 0 0 0-1.5.86Z"/>', 1),
    games: S('<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7.5 10.5v4M5.5 12.5h4"/><path d="M15.5 11.5h.01M17.5 13.5h.01" stroke-width="3"/>'),
    arrow: S('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    bolt: S('<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>'),
    cls: S('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>'),
    user: S('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a7 7 0 0 1 14 0v1"/>'),
    phone: S('<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/>'),
    qr: S('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'),
    plus: S('<path d="M12 5v14M5 12h14"/>'),
    redo: S('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>')
  };
  // Mathlet-ийн толгойн зураг: шууд асуулт, хариултын сонголт, цаг, оноо (100 + хурдны нэмэгдэл)
  function opt(x, y, c, t) {
    return '<rect x="' + x + '" y="' + y + '" width="80" height="32" rx="10" fill="' + c + '"/><text x="' + (x + 40) + '" y="' + (y + 21) +
      '" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="15" fill="#fff">' + t + '</text>';
  }
  var ART = '<svg viewBox="0 0 340 260" aria-hidden="true" focusable="false">' +
    '<defs><linearGradient id="mx-bolt-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8D66FF"/><stop offset="1" stop-color="#5B3BD9"/></linearGradient></defs>' +
    '<circle cx="186" cy="128" r="116" fill="#EEE8FF"/><circle cx="306" cy="44" r="22" fill="#D9F7FA"/><circle cx="40" cy="206" r="14" fill="#FFF0BF"/>' +
    '<g transform="rotate(-4 180 118)"><rect x="78" y="40" width="204" height="156" rx="22" fill="#fff" stroke="#E6E0F7" stroke-width="1.5"/>' +
    '<text x="180" y="88" text-anchor="middle" font-family="Unbounded,Nunito,sans-serif" font-weight="700" font-size="23" fill="#1E1A4D">7 × 8 = ?</text>' +
    opt(96, 108, '#7B52EE', '54') + opt(184, 108, '#12C6D8', '56') + opt(96, 148, '#FFB300', '48') + opt(184, 148, '#FF5FA2', '63') +
    '<g transform="translate(262 110)"><circle r="12" fill="#12B76A" stroke="#fff" stroke-width="3"/><path d="m-5 0 3.4 3.4L5-4" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></g></g>' +
    '<g transform="translate(292 184)"><circle r="31" fill="#fff"/><circle r="24" fill="none" stroke="#EEE8FF" stroke-width="6"/>' +
    '<circle r="24" fill="none" stroke="#FFB300" stroke-width="6" stroke-linecap="round" stroke-dasharray="150.8" stroke-dashoffset="48" transform="rotate(-90)"/>' +
    '<text y="6" text-anchor="middle" font-family="Unbounded,Nunito,sans-serif" font-weight="700" font-size="15" fill="#1E1A4D">12</text></g>' +
    '<g transform="translate(66 50)"><circle r="28" fill="url(#mx-bolt-g)"/><path d="M3-17-10 3h9l-3 15 14-21H1l2-14Z" fill="#FFD84A"/></g>' +
    '<g transform="translate(112 226)"><circle r="13" fill="#7B52EE" stroke="#fff" stroke-width="3"/><circle cx="22" r="13" fill="#12C6D8" stroke="#fff" stroke-width="3"/>' +
    '<circle cx="44" r="13" fill="#FF5FA2" stroke="#fff" stroke-width="3"/><rect x="66" y="-13" width="62" height="26" rx="13" fill="#1E1A4D"/>' +
    '<text x="97" y="5" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="900" font-size="13" fill="#FFD84A">+186</text></g></svg>';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function noEmoji(s) { return String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim(); }
  function isTeacher() { var u = window._currentUser; return !!(u && (u.role === 'teacher' || u.grade === 'teacher')); }
  function tabBtn(k) { return d.querySelector('.tabs .tab-btn[onclick*="switchTab(\'' + k + '\')"]'); }
  function activeTab() { var c = d.querySelector('.tab-content[id^="tab-"].active'); return c ? c.id.replace(/^tab-/, '') : ''; }
  function go(k) { var b = tabBtn(k); if (!b) return; if (activeTab() !== k) b.click(); window.scrollTo(0, 0); }
  function saved() { var s = ''; try { s = localStorage.getItem('cm_active_mathlet') || ''; } catch (e) {} return /^\d{6}$/.test(s) ? s : ''; }

  /* Сайтын жагсаалтын аватар: зөвхөн data:image зураг эсвэл сайтын SVG (on* шинжгүй, id давхардахгүй), үгүй бол эхний үсэг */
  var UID = 0;
  function avHtml(el, name) {
    var img = el && el.querySelector('img'), svg = el && el.querySelector('svg'), src = img ? img.getAttribute('src') || '' : '';
    if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/i.test(src)) return '<img src="' + src + '" alt="">';
    if (svg) {
      var c = svg.cloneNode(true), k = '-mx' + (++UID);
      [c].concat([].slice.call(c.querySelectorAll('*'))).forEach(function (n) {
        [].slice.call(n.attributes).forEach(function (a) { if (/^on/i.test(a.name)) n.removeAttribute(a.name); });
      });
      c.removeAttribute('width'); c.removeAttribute('height'); c.removeAttribute('style');
      return c.outerHTML.replace(/\sid="([^"]+)"/g, ' id="$1' + k + '"').replace(/url\(#([^)]+)\)/g, 'url(#$1' + k + ')').replace(/href="#([^"]+)"/g, 'href="#$1' + k + '"');
    }
    return '<span class="in">' + esc(String(name || '?').charAt(0).toUpperCase()) + '</span>';
  }

  /* ════════ Тэргүүлэгч ════════ */
  function lbParse(list) {
    var rows = list.querySelectorAll('.lb-row'), top = [], me = null;
    [].forEach.call(rows, function (r) {
      var nm = r.querySelector('.lb-name'), xp = r.querySelector('.lb-xp'), rk = r.querySelector('.lb-rank');
      if (!nm || !xp) return;
      var you = !!nm.querySelector('.lb-you'), c = nm.cloneNode(true), y = c.querySelector('.lb-you');
      if (y) y.parentNode.removeChild(y);
      var name = noEmoji(c.textContent) || 'Сурагч';
      var o = { name: name, xp: parseInt(String(xp.textContent).replace(/\D/g, ''), 10) || 0, me: you, avh: avHtml(r.querySelector('.lb-avatar'), name) };
      if (rk && /^[—-]$/.test(rk.textContent.trim())) { o.rank = 0; if (you) me = o; }   // жагсаалтад ороогүй «Та» мөр
      else { o.rank = top.length + 1; top.push(o); if (you && !me) me = o; }
    });
    if (!top.length && !me) return { msg: (list.textContent || '').replace(/\s+/g, ' ').trim() };
    // Имэйл/нууц үгээр нэвтэрсэн хэрэглэгчид id ирдэггүй тул сайт өөрийг нь жагсаалтаас танихгүй, доор «—» мөр нэмдэг —
    // нэр (сайтын «Нэр О.» хэлбэр) + XP-ээр нь танина; нэрээр ганц, XP нь ойролцоо бол мөн.
    if (me && !me.rank && top.length) {
      var u = window._currentUser || {}, mine = noEmoji(((u.firstName || u.first_name || '') + ' ' + (String(u.lastName || u.last_name || '').charAt(0) + '.')).trim());
      var same = top.filter(function (o) { return o.name === mine; }), hit = same.filter(function (o) { return o.xp === me.xp; });
      var pick = hit.length === 1 ? hit[0] : same.length === 1 && Math.abs(same[0].xp - me.xp) <= Math.max(200, me.xp * 0.05) ? same[0] : null;
      if (pick) { pick.me = true; me = pick; } else if (mine.length > 2 && me.name === 'Та') me.name = mine;
    }
    return { top: top, me: me };
  }
  function lbHead(n, p, acts, card) {
    return '<section class="mx-hd"><div class="tx"><span class="mx-eb"><i></i>Шилдэг ' + n + '</span><h2>Тэргүүлэгчид</h2><p>' + p + '</p>' + acts + '</div>' + card + '</section>';
  }
  function meCard(top, me) {
    if (!me) return '';
    var big, sub, pct, xpl = '';
    if (me.rank === 1) {
      var nx = top[1], lead = nx ? me.xp - nx.xp : 0;
      big = '1-р байр'; sub = lead > 0 ? 'Та тэргүүлж байна! 2-р байрнаас <b>' + num(lead) + ' XP</b> илүү.' : 'Та тэргүүлж байна!'; pct = 100;
    } else if (me.rank > 1) {
      var up = top[me.rank - 2], need = Math.max(1, up.xp - me.xp + 1);
      big = me.rank + '-р байр'; sub = (me.rank - 1) + '-р байранд гарахад <b>' + num(need) + ' XP</b> хэрэгтэй.'; pct = up.xp ? me.xp / up.xp * 100 : 0;
    } else {
      var last = top[top.length - 1];
      big = num(me.xp) + ' XP'; pct = null;
      if (last && top.length >= 20 && me.xp < last.xp) { sub = 'Шилдэг ' + top.length + '-д орохын тулд <b>' + num(last.xp - me.xp + 1) + ' XP</b> цуглуулаарай.'; pct = me.xp / last.xp * 100; }
      else if (!me.xp) sub = 'Анхны XP-ээ цуглуулмагц жагсаалтад орно.';
      else sub = 'XP цуглуулсаар байгаарай — жагсаалт тогтмол шинэчлэгдэнэ.';
    }
    if (me.rank) xpl = '<span class="xp">' + num(me.xp) + ' XP</span>';
    return '<div class="mx-me"><span class="av">' + me.avh + '</span><small>' + (me.rank ? 'Таны байр' : 'Таны XP') + '</small><b>' + big + '</b>' + xpl +
      '<p class="sub">' + sub + '</p>' + (pct == null ? '' : '<span class="bar"><i style="width:' + Math.min(100, Math.max(3, Math.round(pct))) + '%"></i></span>') + '</div>';
  }
  function pd(u, r) {
    return '<div class="pd s' + r + (u.me ? ' me' : '') + '">' + (r === 1 ? '<span class="cr">' + IC.crown + '</span>' : '') + '<span class="av">' + u.avh + '</span>' +
      '<b class="nm">' + esc(u.name) + '</b>' + (u.me ? '<em class="you">Та</em>' : '') + '<span class="x">' + num(u.xp) + ' XP</span><span class="st">' + r + '</span></div>';
  }
  function row(u, max) {
    var w = Math.max(4, Math.min(100, Math.round((u.xp || 0) / (max || 1) * 100)));
    return '<li' + (u.me ? ' class="me"' : '') + '><span class="r">' + (u.rank || '—') + '</span><span class="av">' + u.avh + '</span><span class="nm"><b>' + esc(u.name) +
      (u.me ? '<em class="you">Та</em>' : '') + '</b><i style="--w:' + w + '%"></i></span><span class="x">' + num(u.xp) + '<small>XP</small></span></li>';
  }
  function lbHtml(P) {
    var top = P.top, me = P.me, rest = top.slice(3), out = me && !me.rank;
    var acts = isTeacher() ? '' : '<div class="acts"><button type="button" class="mx-btn gold sm" data-go="home">' + IC.play + '<span>Хичээл <i>үргэлжлүүлэх</i></span></button>' +
      '<button type="button" class="mx-btn ghost sm" data-go="games">' + IC.games + '<span>Тоглоом <i>тоглох</i></span></button></div>';
    var h = lbHead(top.length || 20, 'Нийт цуглуулсан XP-ээр эрэмбэлэв. XP-ийг шинэ хичээл дуусгах, тоглоомд хожих, өдөр бүрийн шагналаар цуглуулна.', acts, meCard(top, me));
    var pod = top.length ? '<section class="mx-card mx-pod"><h3>' + IC.trophy + 'Шилдэг гурав</h3><div class="pod">' +
      [1, 0, 2].map(function (i) { return top[i] ? pd(top[i], i + 1) : '<div class="pd s' + (i + 1) + ' em"></div>'; }).join('') + '</div></section>' : '';
    var ls = '';
    if (rest.length || out) {
      var max = top[0] ? top[0].xp : (me ? me.xp : 1);
      ls = '<section class="mx-card mx-lsw"><ol class="mx-ls">' + rest.map(function (u) { return row(u, max); }).join('') +
        (out ? (rest.length ? '<li class="gap" aria-hidden="true"></li>' : '') + row(me, max) : '') + '</ol></section>';
    }
    return h + '<div class="mx-body' + (pod && ls ? '' : ' solo') + '">' + pod + ls + '</div>';
  }
  function lbRender() {
    var tab = d.getElementById('tab-leaderboard'), list = d.getElementById('lb-list');
    if (!tab || !list) return;
    var P = lbParse(list), box = d.getElementById('mx-lb');
    if (!box) { box = d.createElement('div'); box.id = 'mx-lb'; box.className = 'mx'; tab.insertBefore(box, tab.firstChild); box.addEventListener('click', onClick); }
    if (P.top) box.innerHTML = lbHtml(P);
    else if (!P.msg || /Уншиж/.test(P.msg)) box.innerHTML = lbHead(20, 'Жагсаалтыг ачаалж байна…', '', '<div class="mx-me sk"></div>') +
      '<div class="mx-body"><section class="mx-card mx-pod sk"></section><section class="mx-card mx-lsw sk"><i></i><i></i><i></i><i></i><i></i></section></div>';
    else box.innerHTML = lbHead(20, 'Нийт цуглуулсан XP-ээр эрэмбэлэв.', '', '') + '<section class="mx-card mx-empty"><span class="ic">' + IC.trophy + '</span><b>' + esc(P.msg) + '</b>' +
      '<button type="button" class="mx-btn ghost sm" data-retry="leaderboard">' + IC.redo + 'Дахин ачаалах</button></section>';
    tab.classList.add('mx-on');
  }

  /* ════════ Mathlet ════════ */
  function mlParse(hub) {
    var t = (hub.textContent || '').replace(/\s+/g, ' ').trim();
    if (hub.querySelector('[onclick^="openMathletJoin"]')) return { role: 's' };
    var rb = hub.querySelector('[onclick^="resumeTeacherMathlet("]'), res = null;
    if (rb) {
      var m = /resumeTeacherMathlet\('([^']*)'\)/.exec(rb.getAttribute('onclick') || ''), rt = rb.textContent || '';
      if (m && m[1]) res = { code: m[1], paper: /Цаас/.test(rt), lobby: /Хүлээж/.test(rt) };
    }
    var cs = [].map.call(hub.querySelectorAll('[onclick^="openMathletSetupForClass("]'), function (c) {
      var m = /openMathletSetupForClass\((\d+)\)/.exec(c.getAttribute('onclick') || ''), tx = c.querySelectorAll('div[style*="flex:1"] > div');
      return { id: m ? +m[1] : null, name: noEmoji(tx[0] ? tx[0].textContent : '') || 'Анги', n: tx[1] ? parseInt(tx[1].textContent, 10) || 0 : 0 };
    }).filter(function (c) { return c.id != null; });
    if (cs.length || hub.querySelector('[onclick*="switchTab(\'classroom\')"]')) return { role: 't', res: res, cls: cs };
    if (/Уншиж/.test(t)) return { load: true };
    if (/нэвтэрнэ/.test(t)) return { guest: true };
    return null;
  }
  var HINT = 'Багшийн өгсөн 6 оронтой тоо';
  function mlHero(T, form) {
    return '<section class="mx-hero"><div class="tx"><span class="mx-eb live"><i></i>Шууд тэмцээн</span><h2>Mathlet</h2><p>' +
      (T ? 'Ангиа сонгоод бодлогоо бэлдэж, сурагчидтайгаа шууд тэмцээн зохионо уу. Сурагчид утсаараа эсвэл цаасан картаар хариулна.'
        : 'Багшийн өгсөн 6 оронтой кодоор ангийнхантайгаа нэгэн зэрэг бодлого бодож өрсөлдөөрэй. Зөв, хурдан хариулах тусам оноо өснө.') + '</p>' + form +
      '</div><div class="art">' + ART + '</div></section>';
  }
  function joinForm() {
    var c = '';
    for (var i = 0; i < 6; i++) c += '<span' + (i === 0 ? ' class="cur"' : '') + '></span>';
    return '<form class="mx-join" novalidate><label for="mx-code">Тэмцээний код</label><div class="row"><div class="code">' + c +
      '<input id="mx-code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" spellcheck="false" aria-describedby="mx-code-msg"></div>' +
      '<button type="submit" class="mx-btn gold">Нэгдэх' + IC.arrow + '</button></div><p class="msg" id="mx-code-msg" aria-live="polite">' + HINT + '</p></form>';
  }
  function mlHtml(P) {
    var T = P.role ? P.role === 't' : isTeacher(), h = '';
    if (P.guest) return mlHero(T, '') + '<section class="mx-card mx-empty"><span class="ic">' + IC.bolt + '</span><b>Эхлээд нэвтэрнэ үү</b></section>';
    if (P.load) return mlHero(T, T ? '' : joinForm()) + '<div class="mx-sk-grid"><section class="mx-card sk"></section><section class="mx-card sk"></section><section class="mx-card sk"></section></div>';
    if (!T) {
      var sc = saved();
      if (sc) h += '<section class="mx-res"><span class="ic">' + IC.play + '</span><span class="tx"><b>Тэмцээн үргэлжилж байна</b><small>Код <span class="cd">' + sc +
        '</span> · Оноо тань хадгалагдсан</small></span><button type="button" class="mx-btn vio sm" data-rs="1">Үргэлжлүүлэх' + IC.arrow + '</button></section>';
      h += mlHero(false, joinForm()) + '<div class="mx-sec-h"><h3>Хэрхэн оролцох вэ?</h3></div><div class="mx-steps">' +
        [['Кодоо ав', 'Багш тэмцээн нээхэд 6 оронтой код өгнө.'], ['Нэгдэж хүлээ', 'Кодоо оруулаад багш эхлүүлэхийг хүлээнэ.'],
          ['Хурдан, зөв хариул', 'Зөв хариулт бүр 100 оноо, хурдан хариулбал 100 хүртэл нэмэлт оноо.']].map(function (s, i) {
          return '<div class="mx-card mx-step"><span class="n">' + (i + 1) + '</span><b>' + s[0] + '</b><p>' + s[1] + '</p></div>';
        }).join('') + '</div>';
      return h;
    }
    if (P.res) h += '<section class="mx-res t"><span class="ic">' + IC.bolt + '</span><span class="tx"><b>Таны тэмцээн идэвхтэй байна</b><small>' + (P.res.paper ? 'Цаасаар' : 'Утсаар') +
      ' · ' + (P.res.lobby ? 'Сурагчдыг хүлээж байна' : 'Үргэлжилж байна') + ' · Код <span class="cd">' + esc(P.res.code) + '</span></small></span>' +
      '<button type="button" class="mx-btn vio sm" data-rt="' + esc(P.res.code) + '">Үргэлжлүүлэх' + IC.arrow + '</button></section>';
    var kids = P.cls.reduce(function (s, c) { return s + c.n; }, 0);
    h += mlHero(true, P.cls.length ? '<div class="chips"><span>' + IC.cls + P.cls.length + ' анги</span><span>' + IC.user + kids + ' сурагч</span></div>' : '');
    if (P.cls.length) {
      h += '<div class="mx-sec-h"><h3>Аль ангид тэмцээн зохиох вэ?</h3></div><div class="mx-cls-grid">' + P.cls.map(function (c) {
        return '<button type="button" class="mx-cls" data-cls="' + c.id + '"><span class="top"><span class="ic">' + IC.cls + '</span><span class="tx"><b>' + esc(c.name) + '</b><small>' +
          c.n + ' сурагч</small></span></span><span class="go">' + IC.bolt + '<span>Тэмцээн зохиох</span>' + IC.arrow + '</span></button>';
      }).join('') + '</div>';
    } else {
      h += '<section class="mx-card mx-empty"><span class="ic">' + IC.cls + '</span><b>Танд анги алга</b><p>Тэмцээн зохион байгуулахын тулд эхлээд анги үүсгэнэ үү.</p>' +
        '<button type="button" class="mx-btn gold" data-go="classroom">' + IC.plus + 'Анги үүсгэх</button></section>';
    }
    return h + '<div class="mx-sec-h"><h3>Хариулах 2 хэлбэр</h3></div><div class="mx-modes">' +
      '<div class="mx-card mx-mode"><span class="ic p">' + IC.phone + '</span><span class="tx"><b>Утсаар</b><p>Сурагч бүр өөрийн утсаар кодоор нэгдэж хариулна.</p></span></div>' +
      '<div class="mx-card mx-mode"><span class="ic q">' + IC.qr + '</span><span class="tx"><b>Цаасаар</b><p>Сурагч цаасан QR картаа эргүүлж хариулна, багш утсаараа сканнердана. Сурагчдад утас хэрэггүй.</p></span></div></div>';
  }
  function cells(inp) {
    var v = inp.value, c = inp.parentNode, f = inp.form, m = f && f.querySelector('.msg');
    [].forEach.call(c.querySelectorAll('span'), function (s, i) {
      s.textContent = v.charAt(i); s.classList.toggle('on', i < v.length); s.classList.toggle('cur', i === v.length);
    });
    c.classList.toggle('full', v.length === 6); c.classList.remove('err');
    if (m && m.classList.contains('err')) { m.classList.remove('err'); m.textContent = HINT; }
  }
  function join(f) {
    var inp = f.querySelector('input'), code = String(inp.value || '').replace(/\D/g, '').slice(0, 6), m = f.querySelector('.msg'), c = f.querySelector('.code');
    if (code.length !== 6) {
      m.textContent = '6 оронтой тоо оруулна уу'; m.classList.add('err');
      c.classList.remove('err'); void c.offsetWidth; c.classList.add('err'); inp.focus(); return;
    }
    var real = d.getElementById('mathlet-room-input');
    if (!real || typeof window.doJoinMathlet !== 'function') { if (typeof window.openMathletJoin === 'function') window.openMathletJoin(); return; }
    real.value = code;   // сайтын нэгдэх цонхны талбар — алдаа, өрөө нээх нь doJoinMathlet-ийнх хэвээр
    var b = f.querySelector('button[type="submit"]'); b.disabled = true; setTimeout(function () { b.disabled = false; }, 1500);
    window.doJoinMathlet();
  }
  function mlRender() {
    var tab = d.getElementById('tab-mathlet'), hub = d.getElementById('mathlet-hub-content');
    if (!tab || !hub) return;
    var P = mlParse(hub);
    if (!P) { tab.classList.remove('mx-on'); return; }
    var box = d.getElementById('mx-ml');
    if (!box) {
      box = d.createElement('div'); box.id = 'mx-ml'; box.className = 'mx'; tab.insertBefore(box, tab.firstChild);
      box.addEventListener('click', onClick);
      box.addEventListener('submit', function (e) { var f = e.target.closest('.mx-join'); if (!f) return; e.preventDefault(); join(f); });
      box.addEventListener('input', function (e) { if (e.target.id === 'mx-code') { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6); cells(e.target); } });
      box.addEventListener('focusin', function (e) { if (e.target.id === 'mx-code') e.target.parentNode.classList.add('focus'); });
      box.addEventListener('focusout', function (e) { if (e.target.id === 'mx-code') e.target.parentNode.classList.remove('focus'); });
    }
    var old = d.getElementById('mx-code'), v = old ? old.value : '';
    box.innerHTML = mlHtml(P);
    var ni = d.getElementById('mx-code'); if (ni && v && v !== saved()) { ni.value = v; cells(ni); }   // амжилттай нэгдсэн кодыг дахин бөглөхгүй
    tab.classList.add('mx-on');
  }

  function onClick(e) {
    var b = e.target.closest('[data-go],[data-retry],[data-cls],[data-rt],[data-rs]'); if (!b) return;
    if (b.hasAttribute('data-go')) { go(b.getAttribute('data-go')); return; }
    if (b.hasAttribute('data-retry')) { var t = tabBtn(b.getAttribute('data-retry')); if (t) t.click(); return; }
    if (b.hasAttribute('data-cls')) { if (typeof window.openMathletSetupForClass === 'function') window.openMathletSetupForClass(+b.getAttribute('data-cls')); return; }
    if (b.hasAttribute('data-rt')) { if (typeof window.resumeTeacherMathlet === 'function') window.resumeTeacherMathlet(b.getAttribute('data-rt')); return; }
    if (typeof window.resumeMathlet === 'function') window.resumeMathlet();
  }

  function init() {
    try {
      var list = d.getElementById('lb-list'), hub = d.getElementById('mathlet-hub-content'), sr = d.getElementById('mathlet-student-room');
      if (list) { new MutationObserver(lbRender).observe(list, { childList: true }); lbRender(); }
      if (hub) { new MutationObserver(mlRender).observe(hub, { childList: true }); mlRender(); }
      // Сурагч тэмцээнээс түр гарахад «Үргэлжлүүлэх» карт шууд гарна (кодыг сайт cm_active_mathlet-д хадгалдаг)
      if (sr) new MutationObserver(function () { if (sr.style.display === 'none') mlRender(); }).observe(sr, { attributes: true, attributeFilter: ['style'] });
    } catch (e) { try { console.warn('cm-compete', e); } catch (x) {} }
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
