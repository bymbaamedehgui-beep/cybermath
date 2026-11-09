/* CyberMath — хичээлийн өмнөх «Онол» (cm-onol.js + cm-onol.css; агуулга onol/gNN.js).
   Хичээл бүрт 6–8 алхамтай богино аялал: сонирхолтой эхлэл → гол санаа (чирж, гулсуулж үздэг зураг) → томьёо →
   алхам алхмаар жишээ → анхаарах алдаа → өөрөө шалгах → товчхондоо → «Дасгал эхлэх».
   index.html-д 3 холбоос: openLesson (админы intro_html байхгүй үед cmOnol.has(id) → cmOnol.open), backToIntro
   (дасгалын «Онол» товч), renderQuestion (_hasIntro). Агуулгын сав тухайн ангийн хичээл нээгдэх үед л ачаалагдана.
   Бодлого, оноо, явцад ХҮРЭХГҮЙ — эхлүүлэхдээ сайтын startLessonAfterIntro(id)-г дуудна. */
(function () {
  'use strict';
  var d = document, W = window;
  if (W.cmOnol) return;

  // Ангийн агуулгын сав: node id-ийн муж → файл
  var PACKS = [{ lo: 601, hi: 621, src: '/onol/g12.js?v=1' }, { lo: 801, hi: 851, src: '/onol/g11.js?v=1' }];
  var DATA = {}, WG = {}, S = null, UID = 0;

  /* ════════ Туслах ════════ */
  function $(id) { return d.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function tx(t, disp) {
    if (W.katex) { try { return W.katex.renderToString(String(t), { displayMode: !!disp, throwOnError: false, strict: false }); } catch (e) {} }
    return '<span class="cmo-raw">' + esc(t) + '</span>';
  }
  // $…$ → KaTeX, $$…$$ → төвлөрсөн KaTeX, **…** → тод, \n → шинэ мөр
  function md(s) {
    if (s == null) return '';
    var ph = [];
    s = String(s).replace(/\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g, function (m, a, b) {
      ph.push(a != null ? '<span class="cmo-dm">' + tx(a, true) + '</span>' : tx(b));
      return '\u0001' + (ph.length - 1) + '\u0002';
    });
    s = esc(s).replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
    return s.replace(/\u0001(\d+)\u0002/g, function (m, i) { return ph[+i]; });
  }
  function paras(p) { return !p ? '' : (Array.isArray(p) ? p : [p]).map(function (x) { return '<p>' + md(x) + '</p>'; }).join(''); }
  function mn(v) { v = rnd(v, 3); return v < 0 ? '−' + (-v) : String(v); }   // SVG бичвэрт жинхэнэ хасах тэмдэг
  function par(v) { return v < 0 ? '(' + v + ')' : String(v); }                     // TeX: сөрөг тоог хаалтанд
  function rnd(v, k) { var p = Math.pow(10, k == null ? 2 : k); return Math.round(v * p) / p; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function xm(a) { return a > 0 ? 'x-' + a : a < 0 ? 'x+' + (-a) : 'x'; }          // x − a
  // Олон гишүүнт (ахлах гишүүнээс) → TeX: [1,-1,-4,13] → x^{3}-x^{2}-4x+13
  function polyTex(c, v) {
    v = v || 'x';
    var n = c.length - 1, s = '';
    c.forEach(function (a, i) {
      var e = n - i;
      if (!a) return;
      var b = Math.abs(a);
      s += (a < 0 ? '-' : s ? '+' : '') + (b === 1 && e > 0 ? '' : b) + (e > 0 ? v + (e > 1 ? '^{' + e + '}' : '') : '');
    });
    return s || '0';
  }
  // Тусгай өнцгүүдийн яг утга (градус, [0; 360)) → {sin, cos, tg} TeX; tg тодорхойлогдохгүй бол null
  var BASE = { 0: ['0', '1', '0'], 30: ['\\dfrac{1}{2}', '\\dfrac{\\sqrt{3}}{2}', '\\dfrac{1}{\\sqrt{3}}'], 45: ['\\dfrac{\\sqrt{2}}{2}', '\\dfrac{\\sqrt{2}}{2}', '1'],
    60: ['\\dfrac{\\sqrt{3}}{2}', '\\dfrac{1}{2}', '\\sqrt{3}'], 90: ['1', '0', null] };
  function trig(deg) {
    var r = deg % 180; if (r > 90) r = 180 - r;
    var b = BASE[r], s = deg > 0 && deg < 180 ? 1 : deg % 180 === 0 ? 0 : -1, c = deg < 90 || deg > 270 ? 1 : deg === 90 || deg === 270 ? 0 : -1;
    function sg(t, k) { return t === '0' ? '0' : (k < 0 ? '-' : '') + t; }
    return { sin: sg(b[0], s), cos: sg(b[1], c), tg: b[2] == null ? null : sg(b[2], s * c) };
  }
  function gcd(a, b) { return b ? gcd(b, a % b) : a; }
  function radTex(deg) {
    if (!deg) return '0';
    var g = gcd(deg, 180), n = deg / g, m = 180 / g;
    return m === 1 ? (n === 1 ? '\\pi' : n + '\\pi') : '\\dfrac{' + (n === 1 ? '' : n) + '\\pi}{' + m + '}';
  }
  function piLab(k) {   // k·π/2 → «π/2», «π», «3π/2»
    if (!k) return '0';
    var a = Math.abs(k), s = k < 0 ? '−' : '';
    return s + (a % 2 === 0 ? (a === 2 ? '' : a / 2) + 'π' : (a === 1 ? '' : a) + 'π/2');
  }
  function nice(range) { return range <= 12 ? 1 : range <= 24 ? 2 : 5; }

  function I(p, f) {
    return '<svg viewBox="0 0 24 24" fill="' + (f ? 'currentColor' : 'none') + '" stroke="' + (f ? 'none' : 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var IC = {
    spark: I('<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15.2l-1.8-4.6L5.5 9l4.7-1.4L12 3Z"/><path d="M19 15l.8 2 2 .8-2 .8L19 21l-.8-2.4-2-.8 2-.8L19 15Z"/>'),
    bulb: I('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3Z"/>'),
    sigma: I('<path d="M17 6V4H6l6.5 8L6 20h11v-2"/>'),
    pen: I('<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>'),
    alert: I('<path d="M12 3.5 2.5 20h19L12 3.5Z"/><path d="M12 10v4.5M12 17.2v.1"/>'),
    target: I('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
    star: I('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>'),
    book: I('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v15H5.5A1.5 1.5 0 0 0 4 19.5v-15Z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H20v-3"/>'),
    x: I('<path d="M6 6l12 12M18 6 6 18"/>'),
    left: I('<path d="M15 6l-6 6 6 6"/>'),
    right: I('<path d="M9 6l6 6-6 6"/>'),
    play: I('<path d="M7 4.5v15l12-7.5L7 4.5Z"/>', 1),
    check: I('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    no: I('<path d="M7 7l10 10M17 7 7 17"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'),
    minus: I('<path d="M5 12h14"/>'),
    redo: I('<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.5"/><path d="M4 3.5v5h5"/>'),
    hand: I('<path d="M9 11.5V5.2a1.6 1.6 0 0 1 3.2 0V11"/><path d="M12.2 10.5V8.6a1.6 1.6 0 0 1 3.2 0v2.4"/><path d="M15.4 11V9.8a1.6 1.6 0 0 1 3.2 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.9-2.6L3.8 15a1.6 1.6 0 0 1 2.6-1.8L9 15.5"/>')
  };
  // Алхмын төрөл: шошго, тэмдэг, өнгө
  var KIND = {
    hook: { lb: 'Сонирхолтой нь', ic: 'spark', c: '#0B9FB3' },
    idea: { lb: 'Гол санаа', ic: 'bulb', c: '#7B52EE' },
    rule: { lb: 'Томьёо', ic: 'sigma', c: '#4F46E5' },
    ex: { lb: 'Жишээ', ic: 'pen', c: '#059669' },
    trap: { lb: 'Анхаар', ic: 'alert', c: '#DB2777' },
    check: { lb: 'Өөрөө шалга', ic: 'target', c: '#EA580C' },
    sum: { lb: 'Товчхондоо', ic: 'star', c: '#D97706' }
  };

  /* ════════ Алхмын (картын) HTML ════════ */
  function forms(f) {
    if (!f) return '';
    return '<div class="cmo-fs">' + (Array.isArray(f) ? f : [f]).map(function (x) {
      if (typeof x === 'string') x = { m: x };
      return '<div class="cmo-f">' + (x.h ? '<div class="h">' + md(x.h) + '</div>' : '') + '<div class="m">' + tx(x.m, true) + '</div>' +
        (x.n ? '<div class="n">' + md(x.n) + '</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function table(t) {
    if (!t) return '';
    return '<div class="cmo-tw"><table class="cmo-tbl">' + (t.h ? '<thead><tr>' + t.h.map(function (c) { return '<th>' + md(c) + '</th>'; }).join('') + '</tr></thead>' : '') +
      '<tbody>' + t.r.map(function (r) { return '<tr>' + r.map(function (c, i) { return (i ? '<td>' : '<th>') + md(c) + (i ? '</td>' : '</th>'); }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div>';
  }
  function common(c) {
    return paras(c.p) + forms(c.f) + table(c.tbl) + (c.fig ? '<div class="cmo-fig" aria-hidden="true">' + c.fig + '</div>' : '') +
      (c.w ? '<div class="cmo-w"></div>' : '') + (c.cap ? '<p class="cmo-cap">' + md(c.cap) + '</p>' : '') + paras(c.p2);
  }
  function cardHtml(c, i) {
    var K = KIND[c.k] || KIND.idea, h = '<div class="cmo-kick">' + IC[K.ic] + '<span>' + esc(c.lb || K.lb) + '</span></div>';
    if (c.t) h += '<h3>' + md(c.t) + '</h3>';
    if (c.k === 'hook') {
      h += '<div class="cmo-hook">' + (c.pic ? '<div class="cmo-pic" aria-hidden="true">' + c.pic + '</div>' : '') + '<div class="cmo-htx">' + paras(c.p) + '</div></div>';
      if (c.rv) h += '<button type="button" class="cmo-rv" data-act="rv">' + IC.spark + '<span>' + esc(c.rv.b || 'Хариуг харах') + '</span></button><div class="cmo-rva" hidden>' + paras(c.rv.a) + '</div>';
      h += common({ w: c.w, cap: c.cap, p2: c.p2 });
    } else if (c.k === 'ex') {
      h += (c.q ? '<div class="cmo-q">' + md(c.q) + '</div>' : '') + paras(c.p) + '<ol class="cmo-steps">' + c.s.map(function (s, j) {
        return '<li class="cmo-st" hidden><span class="no">' + (j + 1) + '</span><div><div class="m">' + tx(s.m) + '</div>' + (s.n ? '<div class="n">' + md(s.n) + '</div>' : '') + '</div></li>';
      }).join('') + '</ol><button type="button" class="cmo-ph" data-act="step"></button>' +
        (c.a ? '<div class="cmo-ans" hidden>' + IC.check + '<span>' + md(c.a) + '</span></div>' : '') + common({ w: c.w, p2: c.p2 });
    } else if (c.k === 'trap') {
      h += paras(c.p) + '<div class="cmo-vs"><div class="cmo-bad"><div class="lb">' + IC.no + 'Буруу</div><div class="m">' + tx(c.bad.m) + '</div>' +
        (c.bad.n ? '<div class="n">' + md(c.bad.n) + '</div>' : '') + '</div><div class="cmo-good"><div class="lb">' + IC.check + 'Зөв</div><div class="m">' + tx(c.good.m) + '</div>' +
        (c.good.n ? '<div class="n">' + md(c.good.n) + '</div>' : '') + '</div></div>' + (c.tip ? '<p class="cmo-tip">' + md(c.tip) + '</p>' : '');
    } else if (c.k === 'check') {
      h += '<div class="cmo-cq">' + md(c.q) + '</div><div class="cmo-opts">' + c.o.map(function (o, j) {
        return '<button type="button" class="cmo-opt" data-o="' + j + '"><b>' + 'ABCD'.charAt(j) + '</b><span>' + md(o) + '</span></button>';
      }).join('') + '</div><div class="cmo-fb" aria-live="polite"></div>';
    } else if (c.k === 'sum') {
      h += '<ul class="cmo-sum">' + c.pts.map(function (p) { return '<li>' + IC.check + '<span>' + md(p) + '</span></li>'; }).join('') + '</ul>' + paras(c.p);
    } else h += common(c);
    return '<article class="cmo-card k-' + c.k + '" style="--k:' + K.c + '" hidden>' + h + '</article>';
  }

  /* ════════ Оролцоотой зургууд (widgets) ════════ */
  function loc(svg, e, vw, vh) { var r = svg.getBoundingClientRect(); return { x: (e.clientX - r.left) * vw / r.width, y: (e.clientY - r.top) * vh / r.height }; }
  // Чирэх: цэгийн ойролцоо дарвал чирнэ, хоосон газар товшвол хамгийн ойрын цэг тийш үсэрнэ (босоо гүйлгэлтэд хүрэхгүй)
  function dragger(svg, vw, vh, near, move, after) {
    var on = false, pid = null, sx = 0, sy = 0, who = null;
    svg.addEventListener('pointerdown', function (e) {
      if (e.button > 0) return;
      var p = loc(svg, e, vw, vh), n = near(p);
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; who = n ? n.who : null; on = !!(n && n.dist < 46);
      if (on) { try { svg.setPointerCapture(pid); } catch (x) {} e.preventDefault(); move(p, who); }
    });
    svg.addEventListener('pointermove', function (e) { if (on && e.pointerId === pid) move(loc(svg, e, vw, vh), who); });
    svg.addEventListener('pointerup', function (e) {
      if (e.pointerId !== pid) return;
      if (!on && Math.abs(e.clientX - sx) + Math.abs(e.clientY - sy) < 10) { var p = loc(svg, e, vw, vh), n = near(p); move(p, n ? n.who : null); }
      on = false; pid = null; if (after) after();
    });
    svg.addEventListener('pointercancel', function () { on = false; pid = null; });
  }
  function frame(fn) { var q = 0; return function () { if (!q) q = (W.requestAnimationFrame || setTimeout)(function () { q = 0; fn(); }); }; }
  function hideHint(host) { var h = host.querySelector('.cmo-hint'); if (h) h.classList.add('off'); }
  function slider(k, lb, min, max, step, v) {
    return '<label class="cmo-rg"><span>' + md(lb) + ' = <b data-v="' + k + '"></b></span><input type="range" data-k="' + k + '" min="' + min + '" max="' + max +
      '" step="' + step + '" value="' + v + '"></label>';
  }

  /* Тоон шулуун: abs (|a| — тэг хүртэлх зай), dist (|a−b|), eq (|x−a|=r), ineq (|x−a| ? r) */
  WG.nl = function (host, o) {
    // Утсанд (нарийн) муж жижиг, viewBox нарийн — бичиг томорно
    var nar = host.clientWidth > 0 && host.clientWidth < 520, mode = o.mode || 'abs', min = o.min != null ? o.min : nar ? -8 : -10, max = o.max != null ? o.max : nar ? 8 : 10;
    var VW = nar ? 440 : 640, VH = 150, Y0 = 100, L = 34, R = VW - 34, RM = nar ? 4 : 6;
    var s = { a: o.a != null ? o.a : -4, b: o.b != null ? o.b : 5, r: o.r != null ? Math.min(o.r, RM) : 4, op: o.op || 'lt' };
    var OPS = { lt: '<', le: '\\le', gt: '>', ge: '\\ge' };
    s.a = clamp(s.a, min, max); s.b = clamp(s.b, min, max);
    function X(v) { return L + (v - min) * (R - L) / (max - min); }
    function V(px) { return clamp(Math.round(min + (px - L) * (max - min) / (R - L)), min, max); }
    var ctl = '';
    if (mode === 'eq' || mode === 'ineq') ctl += slider('r', '$r$', mode === 'eq' ? -3 : 1, RM, 1, s.r);
    if (mode === 'ineq') ctl += '<div class="cmo-tg" role="group" aria-label="Тэмдэг">' + Object.keys(OPS).map(function (k) {
      return '<button type="button" data-op="' + k + '">' + tx(OPS[k]) + '</button>';
    }).join('') + '</div>';
    host.innerHTML = '<div class="cmo-plot"><svg class="cmo-svg nl" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Тоон шулуун"></svg>' +
      '<span class="cmo-hint">' + IC.hand + 'Цэгийг чир</span></div>' + (ctl ? '<div class="cmo-sls">' + ctl + '</div>' : '') + '<div class="cmo-wi" aria-live="polite"></div>';
    var svg = host.querySelector('svg'), info = host.querySelector('.cmo-wi'), draw = frame(paint);
    function pts() { return mode === 'dist' ? ['a', 'b'] : ['a']; }
    function lim(k, v) { return mode === 'eq' || mode === 'ineq' ? clamp(v, min + RM, max - RM) : v; }
    function dot(v, col, lb) {
      return '<circle cx="' + X(v) + '" cy="' + Y0 + '" r="12" fill="' + col + '" stroke="#fff" stroke-width="3.5" class="pt"/>' +
        (lb ? '<text class="pl" x="' + X(v) + '" y="' + (Y0 - 22) + '" fill="' + col + '">' + lb + '</text>' : '');
    }
    function ring(v, col, fill) { return '<circle cx="' + X(v) + '" cy="' + Y0 + '" r="8.5" fill="' + (fill ? col : '#fff') + '" stroke="' + col + '" stroke-width="3.5"/>'; }
    function brace(a, b, y, col, lb) {
      var x1 = X(Math.min(a, b)), x2 = X(Math.max(a, b));
      return '<path d="M' + x1 + ' ' + (y + 9) + 'V' + y + 'H' + x2 + 'V' + (y + 9) + '" fill="none" stroke="' + col + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<text class="bl" x="' + (x1 + x2) / 2 + '" y="' + (y - 9) + '" fill="' + col + '">' + lb + '</text>';
    }
    function arc(a, b, col) {
      if (a === b) return '';
      var x1 = X(a), x2 = X(b), h = Math.min(46, Math.abs(x2 - x1) * 0.55);
      return '<path d="M' + x1 + ' ' + (Y0 - 6) + 'Q' + (x1 + x2) / 2 + ' ' + (Y0 - 6 - h * 2) + ' ' + x2 + ' ' + (Y0 - 6) + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-dasharray="5 6"/>' +
        '<text class="bl" x="' + (x1 + x2) / 2 + '" y="' + (Y0 - 12 - h) + '" fill="' + col + '">' + mn(Math.abs(b - a)) + '</text>';
    }
    function paint() {
      var h = '', a = s.a, b = s.b, r = s.r, hi = {};
      if (mode === 'ineq') {
        var lo = a - r, up = a + r, col = '#7B52EE', inside = s.op === 'lt' || s.op === 'le', cl = s.op === 'le' || s.op === 'ge';
        if (inside) h += '<line x1="' + X(lo) + '" y1="' + Y0 + '" x2="' + X(up) + '" y2="' + Y0 + '" stroke="' + col + '" stroke-width="9" stroke-linecap="round" opacity=".85"/>';
        else h += '<line x1="' + (L - 14) + '" y1="' + Y0 + '" x2="' + X(lo) + '" y2="' + Y0 + '" stroke="' + col + '" stroke-width="9" opacity=".85"/>' +
          '<line x1="' + X(up) + '" y1="' + Y0 + '" x2="' + (R + 14) + '" y2="' + Y0 + '" stroke="' + col + '" stroke-width="9" opacity=".85"/>';
        hi[lo] = hi[up] = col;
        h += '<g class="axl">' + axis() + '</g>' + ring(lo, col, cl) + ring(up, col, cl) + arc(a, lo, '#B45309') + arc(a, up, '#B45309') + dot(a, '#F59E0B', 'a');
      } else {
        h += '<g class="axl">' + axis() + '</g>';
        if (mode === 'abs') {
          hi[0] = '#1E1A4D'; hi[a] = '#7B52EE';
          h += brace(0, a || 0.0001, Y0 - 46, '#7B52EE', a ? '|' + mn(a) + '| = ' + Math.abs(a) : '|0| = 0') + dot(a, '#7B52EE');
        } else if (mode === 'dist') {
          hi[a] = '#7B52EE'; hi[b] = '#0B9FB3';
          h += brace(a, b === a ? a + 0.0001 : b, Y0 - 46, '#1E1A4D', 'зай = ' + Math.abs(a - b)) + dot(a, '#7B52EE', 'a') + dot(b, '#0B9FB3', 'b');
        } else if (mode === 'eq') {
          if (r > 0) { hi[a - r] = hi[a + r] = '#059669'; h += arc(a, a - r, '#B45309') + arc(a, a + r, '#B45309') + dot(a - r, '#059669', 'x₁') + dot(a + r, '#059669', 'x₂'); }
          else if (r === 0) { hi[a] = '#059669'; h += dot(a, '#059669', 'x'); }
          else h += '<text class="bl" x="' + X(a) + '" y="' + (Y0 - 50) + '" fill="#DB2777">шийдгүй</text>';
          h += r === 0 ? '' : ring(a, '#F59E0B', true) + '<text class="pl" x="' + X(a) + '" y="' + (Y0 + 44) + '" fill="#B45309">a</text>';
        }
      }
      svg.innerHTML = h;
      // онцолсон шошго
      Object.keys(hi).forEach(function (v) { var t = svg.querySelector('[data-v="' + v + '"]'); if (t) { t.setAttribute('fill', hi[v]); t.removeAttribute('opacity'); t.classList.add('hl'); } });
      var eqt = '\\left|' + xm(a) + '\\right|';
      if (mode === 'abs') info.innerHTML = md('$\\left|' + a + '\\right|=' + Math.abs(a) + '$ — ' + (a < 0 ? 'сөрөг тооны модул нь түүний **эсрэг тоо**' : a > 0 ? 'эерэг тооны модул нь **өөрөө**' : 'тэгийн модул тэг'));
      else if (mode === 'dist') info.innerHTML = md('Зай: $\\left|' + a + '-' + par(b) + '\\right|=\\left|' + (a - b) + '\\right|=' + Math.abs(a - b) + '$');
      else if (mode === 'eq') info.innerHTML = md('$' + eqt + '=' + r + '$: ' + (r > 0 ? '$x=' + (a ? a + '\\pm ' + r : '\\pm ' + r) + '$ → $x_1=' + (a - r) + ',\\ x_2=' + (a + r) + '$ — **2 шийд**' :
        r === 0 ? '$x=' + a + '$ — **1 шийд**' : 'модул сөрөг утга авахгүй — **шийдгүй**'));
      else {
        var op = OPS[s.op], rev = { lt: '>', le: '\\ge', gt: '<', ge: '\\le' }[s.op];
        info.innerHTML = md('$' + eqt + op + r + '$ $\\iff$ ' + (s.op === 'lt' || s.op === 'le' ? '$' + (a - r) + op + 'x' + op + (a + r) + '$ — нэг **завсар**' :
          '$x' + rev + (a - r) + '$ эсвэл $x' + op + (a + r) + '$ — хоёр **хэсэг**'));
        [].forEach.call(host.querySelectorAll('[data-op]'), function (bt) { bt.classList.toggle('on', bt.getAttribute('data-op') === s.op); });
      }
      var rv = host.querySelector('[data-v="r"]'); if (rv) rv.textContent = mn(r);
    }
    function axis() {
      var h = '<line x1="' + (L - 16) + '" y1="' + Y0 + '" x2="' + (R + 16) + '" y2="' + Y0 + '" class="ax"/>' +
        '<path d="M' + (R + 18) + ' ' + Y0 + 'l-10 -6v12z" class="ah"/><path d="M' + (L - 18) + ' ' + Y0 + 'l10 -6v12z" class="ah"/>', ev = (max - min) > 14 ? 2 : 1;
      for (var v = min; v <= max; v++) {
        h += '<line x1="' + X(v) + '" y1="' + (Y0 - (v ? 6 : 10)) + '" x2="' + X(v) + '" y2="' + (Y0 + (v ? 6 : 10)) + '" class="tk"/>';
        h += '<text class="tl" data-v="' + v + '" x="' + X(v) + '" y="' + (Y0 + 28) + '"' + (v % ev && v !== s.a && !(mode === 'dist' && v === s.b) ? ' opacity="0"' : '') + '>' + mn(v) + '</text>';
      }
      return h;
    }
    dragger(svg, VW, VH, function (p) {
      var best = null;
      pts().forEach(function (k) { var dd = Math.abs(p.x - X(s[k])); if (!best || dd < best.dist) best = { who: k, dist: dd }; });
      return best;
    }, function (p, who) {
      if (!who) return;
      var v = lim(who, V(p.x));
      if (v !== s[who]) { s[who] = v; draw(); }
      hideHint(host);
    });
    host.addEventListener('input', function (e) { var k = e.target.getAttribute('data-k'); if (k) { s[k] = +e.target.value; hideHint(host); draw(); } });
    host.addEventListener('click', function (e) { var b = e.target.closest('[data-op]'); if (b) { s.op = b.getAttribute('data-op'); draw(); } });
    paint();
  };

  /* Функцийн график: параметрийн гулсуур, чирэгддэг цэг + шүргэгч, асимптот, тэмдэглэгээ */
  WG.fx = function (host, o) {
    var VW = host.clientWidth > 0 && host.clientWidth < 520 ? 420 : 600, VH = Math.round(VW * (o.ratio || 0.6)), PD = 12, cid = 'cmoc' + (++UID);
    var xa = o.x[0], xb = o.x[1], ya = o.y[0], yb = o.y[1], P = {}, pt = o.pt ? { x: o.pt.x } : null;
    (o.p || []).forEach(function (q) { P[q.k] = q.v; });
    function X(v) { return PD + (v - xa) * (VW - 2 * PD) / (xb - xa); }
    function Y(v) { return VH - PD - (v - ya) * (VH - 2 * PD) / (yb - ya); }
    function XV(px) { return xa + (px - PD) * (xb - xa) / (VW - 2 * PD); }
    function cY(v) { return clamp(Y(v), -4000, 4000); }
    host.innerHTML = '<div class="cmo-plot"><svg class="cmo-svg fx" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="' + esc(o.alt || 'График') + '"></svg>' +
      (pt ? '<span class="cmo-hint">' + IC.hand + (o.pt.hint || 'Цэгийг чирж үз') + '</span>' : '') + '</div>' +
      ((o.p || []).length ? '<div class="cmo-sls">' + o.p.map(function (q) { return slider(q.k, q.lb || '$' + q.k + '$', q.min, q.max, q.step || 1, q.v); }).join('') + '</div>' : '') +
      '<div class="cmo-wi" aria-live="polite"></div>';
    var svg = host.querySelector('svg'), info = host.querySelector('.cmo-wi'), draw = frame(paint);
    function path(fn) {
      var N = o.n || 420, h = '', pen = false, py = null, span = yb - ya;
      for (var k = 0; k <= N; k++) {
        var x = xa + (xb - xa) * k / N, y = fn(x, P);
        if (!isFinite(y) || Math.abs(y) > 1e6) { pen = false; py = null; continue; }
        if (py !== null && Math.abs(y - py) > span * 1.6) pen = false;   // асимптотын үсрэлт
        h += (pen ? 'L' : 'M') + rnd(X(x), 1) + ' ' + rnd(clamp(Y(y), -2 * VH, 3 * VH), 1);
        pen = true; py = y;
      }
      return h;
    }
    function paint() {
      var gx = o.xpi ? Math.PI / 2 : o.gx || nice(xb - xa), gy = o.gy || nice(yb - ya), k, h = '', g = '', t = '';
      var ax = ya <= 0 && yb >= 0 ? Y(0) : VH - PD, ay = xa <= 0 && xb >= 0 ? X(0) : PD;
      for (k = Math.ceil(xa / gx - 1e-9); k * gx <= xb + 1e-9; k++) g += '<line x1="' + X(k * gx) + '" y1="' + PD + '" x2="' + X(k * gx) + '" y2="' + (VH - PD) + '"/>';
      for (k = Math.ceil(ya / gy - 1e-9); k * gy <= yb + 1e-9; k++) g += '<line x1="' + PD + '" y1="' + Y(k * gy) + '" x2="' + (VW - PD) + '" y2="' + Y(k * gy) + '"/>';
      h += '<defs><clipPath id="' + cid + '"><rect x="' + PD + '" y="' + PD + '" width="' + (VW - 2 * PD) + '" height="' + (VH - 2 * PD) + '"/></clipPath></defs>';
      h += '<g class="gr">' + g + '</g><line class="ax" x1="' + PD + '" y1="' + ax + '" x2="' + (VW - PD) + '" y2="' + ax + '"/><line class="ax" x1="' + ay + '" y1="' + PD + '" x2="' + ay + '" y2="' + (VH - PD) + '"/>';
      var lx = o.lx || ((xb - xa) / gx > 14 ? 2 : 1), ly = o.ly || ((yb - ya) / gy > 10 ? 2 : 1);
      for (k = Math.ceil(xa / gx - 1e-9); k * gx <= xb + 1e-9; k++) {
        var X1 = X(k * gx);
        if (!k || k % lx || X1 < PD + 12 || X1 > VW - PD - 12) continue;
        t += '<text class="tl" x="' + X1 + '" y="' + (ax + 18 > VH - 4 ? ax - 8 : ax + 18) + '">' + (o.xpi ? piLab(k) : mn(k * gx)) + '</text>';
      }
      for (k = Math.ceil(ya / gy - 1e-9); k * gy <= yb + 1e-9; k++) {
        var Y1 = Y(k * gy);
        if (!k || k % ly || Y1 < PD + 10 || Y1 > VH - PD - 8) continue;
        t += '<text class="tl e" x="' + (ay - 7 < 22 ? ay + 7 : ay - 7) + '" y="' + (Y1 + 5) + '"' + (ay - 7 < 22 ? ' style="text-anchor:start"' : '') + '>' + mn(k * gy) + '</text>';
      }
      if (ya <= 0 && yb >= 0 && xa <= 0 && xb >= 0) t += '<text class="tl e" x="' + (ay - 7) + '" y="' + (ax + 18) + '">0</text>';
      var as = o.asym ? o.asym(P) : null, cv = '';
      if (as) {
        (as.x || []).forEach(function (v) { cv += '<line class="as" x1="' + X(v) + '" y1="' + PD + '" x2="' + X(v) + '" y2="' + (VH - PD) + '"/>'; });
        (as.y || []).forEach(function (v) { cv += '<line class="as" x1="' + PD + '" y1="' + Y(v) + '" x2="' + (VW - PD) + '" y2="' + Y(v) + '"/>'; });
      }
      (o.lines ? o.lines(P) : []).forEach(function (l) {
        cv += '<line x1="' + X(l[0]) + '" y1="' + cY(l[1]) + '" x2="' + X(l[2]) + '" y2="' + cY(l[3]) + '" stroke="' + (l[4] || '#9A93C4') + '" stroke-width="2.5"' + (l[5] ? ' stroke-dasharray="7 7"' : '') + '/>';
      });
      o.f.forEach(function (f) {
        cv += '<path class="cv" d="' + path(f.fn) + '" stroke="' + (f.c || '#7B52EE') + '"' + (f.dash ? ' stroke-dasharray="8 8" stroke-width="3"' : '') + '/>';
      });
      var f0 = pt ? o.f[o.pt.on || 0].fn : null, yv = pt ? f0(pt.x, P) : 0;
      if (pt && o.pt.d && isFinite(yv)) {
        var m = o.pt.d(pt.x, P);
        cv += '<line class="tn" x1="' + X(xa) + '" y1="' + cY(yv + m * (xa - pt.x)) + '" x2="' + X(xb) + '" y2="' + cY(yv + m * (xb - pt.x)) + '"/>';
      }
      if (pt && o.pt.drop && isFinite(yv)) cv += '<line class="dp" x1="' + X(pt.x) + '" y1="' + Y(yv) + '" x2="' + X(pt.x) + '" y2="' + ax + '"/>';
      h += '<g clip-path="url(#' + cid + ')">' + cv + '</g>' + t;   // тэмдэглэгээ муруйн дээр (цагаан хүрээтэй)
      o.f.forEach(function (f) {
        if (f.lb == null || f.lx == null) return;
        var y = f.fn(f.lx, P);
        if (isFinite(y)) h += '<text class="fl" x="' + X(f.lx) + '" y="' + clamp(Y(y) + (f.ly || -12), 18, VH - 8) + '" fill="' + (f.c || '#7B52EE') + '"' + (f.la ? ' style="text-anchor:' + f.la + '"' : '') + '>' + esc(f.lb) + '</text>';
      });
      (o.marks ? o.marks(P, pt && pt.x) : []).forEach(function (q) {
        if (q.x < xa || q.x > xb || q.y < ya || q.y > yb) return;
        h += '<circle cx="' + X(q.x) + '" cy="' + Y(q.y) + '" r="6.5" fill="' + (q.c || '#1E1A4D') + '" stroke="#fff" stroke-width="2.5"/>' +
          (q.lb ? '<text class="ml" x="' + (X(q.x) + (q.dx || 10)) + '" y="' + (Y(q.y) + (q.dy || -10)) + '" fill="' + (q.c || '#1E1A4D') + '"' + (q.la ? ' style="text-anchor:' + q.la + '"' : '') + '>' + esc(q.lb) + '</text>' : '');
      });
      if (pt && isFinite(yv) && yv >= ya - 1e-9 && yv <= yb + 1e-9) {
        var col = o.f[o.pt.on || 0].c || '#7B52EE';
        h += '<circle class="hl0" cx="' + X(pt.x) + '" cy="' + Y(yv) + '" r="19" fill="' + col + '" opacity=".18"/><circle class="pt" cx="' + X(pt.x) + '" cy="' + Y(yv) + '" r="9.5" fill="' + col + '" stroke="#fff" stroke-width="3.5"/>';
      }
      svg.innerHTML = h;
      (o.p || []).forEach(function (q) { var b = host.querySelector('[data-v="' + q.k + '"]'); if (b) b.textContent = q.fmt ? q.fmt(P[q.k]) : mn(P[q.k]); });
      info.innerHTML = o.info ? md(o.info(P, pt ? pt.x : null)) : '';
    }
    if (pt) {
      svg.style.touchAction = 'pan-y';
      dragger(svg, VW, VH, function (p) {
        var y = o.f[o.pt.on || 0].fn(pt.x, P);
        return { who: 'pt', dist: isFinite(y) ? Math.hypot(p.x - X(pt.x), p.y - Y(y)) : 999 };
      }, function (p) { setX(XV(p.x)); });
    }
    function setX(v) {
      var q = o.pt;
      v = clamp(v, q.min != null ? q.min : xa, q.max != null ? q.max : xb);
      if (q.snapTo) v = q.snapTo.reduce(function (b, c) { return Math.abs(c - v) < Math.abs(b - v) ? c : b; }, q.snapTo[0]);
      else if (q.snap) v = rnd(Math.round(v / q.snap) * q.snap, 6);
      if (q.ok && !q.ok(v)) return;
      if (v !== pt.x) { pt.x = v; draw(); }
      hideHint(host);
    }
    host.addEventListener('input', function (e) {
      var k = e.target.getAttribute('data-k'), q = (o.p || []).filter(function (z) { return z.k === k; })[0];
      if (!q) return;
      var v = +e.target.value;
      if (q.skip && v > q.skip[0] && v < q.skip[1]) { v = v - q.skip[0] < q.skip[1] - v ? q.skip[0] : q.skip[1]; e.target.value = v; }
      P[k] = v; hideHint(host); draw();
    });
    paint();
    return { setX: setX };
  };

  /* Нэгж тойрог: тусгай 16 өнцөг, cos (хэвтээ), sin (босоо), tg; мөчийн тэмдэг */
  WG.uc = function (host, o) {
    var A = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330], k = Math.max(0, A.indexOf(o.deg != null ? o.deg : 150));
    var VW = 440, C = 220, R = 160, draw = frame(paint);
    host.innerHTML = '<div class="cmo-plot uc"><svg class="cmo-svg" viewBox="0 0 440 440" role="img" aria-label="Нэгж тойрог"></svg><span class="cmo-hint">' + IC.hand + 'Цэгийг тойргоор эргүүл</span></div>' +
      '<div class="cmo-ucb"><button type="button" class="cmo-ib" data-d="-1" aria-label="Өмнөх өнцөг">' + IC.left + '</button><div class="cmo-wi" aria-live="polite"></div>' +
      '<button type="button" class="cmo-ib" data-d="1" aria-label="Дараагийн өнцөг">' + IC.right + '</button></div>';
    var svg = host.querySelector('svg'), info = host.querySelector('.cmo-wi');
    svg.style.touchAction = 'none';
    function quad(dg) { return dg % 90 === 0 ? 0 : Math.floor(dg / 90) + 1; }
    function paint() {
      var dg = A[k], th = dg * Math.PI / 180, px = C + R * Math.cos(th), py = C - R * Math.sin(th), q = quad(dg), h = '';
      var QP = [[C, C - R - 30, C + R + 30, C], [C - R - 30, C - R - 30, C, C], [C - R - 30, C, C, C + R + 30], [C, C, C + R + 30, C + R + 30]];
      if (q) h += '<rect x="' + Math.min(QP[q - 1][0], QP[q - 1][2]) + '" y="' + Math.min(QP[q - 1][1], QP[q - 1][3]) + '" width="' + (R + 30) + '" height="' + (R + 30) + '" fill="#7B52EE" opacity=".06"/>';
      ['I', 'II', 'III', 'IV'].forEach(function (n, i) {
        var qx = [C + 118, C - 118, C - 118, C + 118][i], qy = [C - 118, C - 118, C + 128, C + 128][i];
        h += '<text class="qn' + (q === i + 1 ? ' on' : '') + '" x="' + qx + '" y="' + qy + '">' + n + '</text>';
      });
      h += '<line class="ax" x1="14" y1="' + C + '" x2="426" y2="' + C + '"/><line class="ax" x1="' + C + '" y1="14" x2="' + C + '" y2="426"/>' +
        '<circle cx="' + C + '" cy="' + C + '" r="' + R + '" fill="none" stroke="#1E1A4D" stroke-width="2.5"/>';
      A.forEach(function (a) { var t = a * Math.PI / 180; h += '<circle cx="' + (C + R * Math.cos(t)) + '" cy="' + (C - R * Math.sin(t)) + '" r="3.2" fill="#B9B2DA"/>'; });
      h += '<text class="tl" x="' + (C + R + 18) + '" y="' + (C - 8) + '">0</text><text class="tl" x="' + (C + 16) + '" y="' + (C - R - 10) + '">π/2</text>' +
        '<text class="tl" x="' + (C - R - 16) + '" y="' + (C - 8) + '">π</text><text class="tl" x="' + (C + 22) + '" y="' + (C + R + 22) + '">3π/2</text>';
      if (dg) {
        var r0 = 34;
        h += '<path d="M' + (C + r0) + ' ' + C + 'A' + r0 + ' ' + r0 + ' 0 ' + (dg > 180 ? 1 : 0) + ' 0 ' + (C + r0 * Math.cos(th)) + ' ' + (C - r0 * Math.sin(th)) + '" fill="none" stroke="#F59E0B" stroke-width="3"/>' +
          '<text class="al" x="' + (C + 52 * Math.cos(th / 2)) + '" y="' + (C - 52 * Math.sin(th / 2) + 5) + '">α</text>';
      }
      h += '<line x1="' + px + '" y1="' + py + '" x2="' + px + '" y2="' + C + '" stroke="#DB2777" stroke-width="6" stroke-linecap="round"/>' +
        '<line x1="' + C + '" y1="' + C + '" x2="' + px + '" y2="' + C + '" stroke="#0B9FB3" stroke-width="6" stroke-linecap="round"/>' +
        '<line x1="' + C + '" y1="' + C + '" x2="' + px + '" y2="' + py + '" stroke="#1E1A4D" stroke-width="2.5"/>';
      if (Math.abs(px - C) > 30) h += '<text class="vl" x="' + (C + px) / 2 + '" y="' + (C + (py < C ? 24 : -12)) + '" fill="#0B9FB3">cos α</text>';
      if (Math.abs(py - C) > 30) h += '<text class="vl" x="' + (px + (px >= C ? 12 : -12)) + '" y="' + (C + py) / 2 + '" fill="#DB2777" style="text-anchor:' + (px >= C ? 'start' : 'end') + '">sin α</text>';
      h += '<circle class="hl0" cx="' + px + '" cy="' + py + '" r="20" fill="#7B52EE" opacity=".18"/><circle class="pt" cx="' + px + '" cy="' + py + '" r="11" fill="#7B52EE" stroke="#fff" stroke-width="3.5"/>';
      svg.innerHTML = h;
      var v = trig(dg), sgn = ['', 'I мөч: $\\sin\\alpha>0$, $\\cos\\alpha>0$', 'II мөч: $\\sin\\alpha>0$, $\\cos\\alpha<0$', 'III мөч: $\\sin\\alpha<0$, $\\cos\\alpha<0$', 'IV мөч: $\\sin\\alpha<0$, $\\cos\\alpha>0$'][q];
      info.innerHTML = '<div class="uc-a">' + md('$\\alpha=' + radTex(dg) + '\\ \\ (' + dg + '^\\circ)$') + '</div><div class="uc-v">' +
        '<span class="c">' + md('$\\cos\\alpha=' + v.cos + '$') + '</span><span class="s">' + md('$\\sin\\alpha=' + v.sin + '$') + '</span><span class="t">' +
        md(v.tg == null ? '$\\operatorname{tg}\\alpha$ — тодорхойлогдохгүй' : '$\\operatorname{tg}\\alpha=' + v.tg + '$') + '</span></div>' + (sgn ? '<div class="uc-q">' + md(sgn) + '</div>' : '');
    }
    function setA(p) {
      var dg = (Math.atan2(C - p.y, p.x - C) * 180 / Math.PI + 360) % 360, best = 0;
      A.forEach(function (a, i) { var dd = Math.min(Math.abs(a - dg), 360 - Math.abs(a - dg)); if (dd < Math.min(Math.abs(A[best] - dg), 360 - Math.abs(A[best] - dg))) best = i; });
      if (best !== k) { k = best; draw(); }
      hideHint(host);
    }
    dragger(svg, VW, VW, function () { return { who: 'p', dist: 0 }; }, setA);
    host.addEventListener('click', function (e) { var b = e.target.closest('[data-d]'); if (b) { k = (k + +b.getAttribute('data-d') + A.length) % A.length; hideHint(host); paint(); } });
    paint();
  };

  /* Логарифм = «хэдэн удаа үржүүлэх вэ?»: 1-ээс эхлээд ×a / ÷a товчоор зорилгод хүр */
  WG.pow = function (host, o) {
    var a = o.a, G = o.goals, gi = 0, e = 0, ops = [];
    function val(k) { return k >= 0 ? String(Math.pow(a, k)) : '\\dfrac{1}{' + Math.pow(a, -k) + '}'; }
    function paint() {
      var g = G[gi], ok = e === g.k && ops.length > 0, chain = ops.map(function (x) { return '<i class="' + (x > 0 ? 'm' : 'd') + '">' + (x > 0 ? '×' : '÷') + a + '</i>'; }).join('');
      host.innerHTML = '<div class="cmo-pow' + (ok ? ' ok' : '') + '">' +
        '<div class="pw-goal"><span>' + md('Зорилго: $1$-ээс эхэлж, товчоор **$' + g.tex + '$** болго') + '</span>' + (G.length > 1 ? '<small>' + (gi + 1) + ' / ' + G.length + '</small>' : '') + '</div>' +
        '<div class="pw-cur"><span>Одоогийн тоо</span><b>' + tx(val(e), true) + '</b></div>' +
        '<div class="pw-chain">' + (chain || '<em>Товч дарж эхэл</em>') + '</div>' +
        '<div class="pw-btns"><button type="button" data-pw="1"' + (ok || e >= 12 ? ' disabled' : '') + '>× ' + a + '</button><button type="button" data-pw="-1"' + (ok || e <= -8 || g.k > 0 ? ' disabled' : '') + '>÷ ' + a + '</button>' +
        '<button type="button" class="ghost" data-pw="0" aria-label="Эхнээс">' + IC.redo + '</button></div>' +
        (ok ? '<div class="pw-res">' + IC.check + '<span>' + md((e > 0 ? '$\\times ' + a + '$ товчийг **' + e + ' удаа** дарлаа: $' + a + '^{' + e + '}=' + g.tex + '$' : '$\\div ' + a + '$ товчийг **' + (-e) + ' удаа** дарлаа: $' + a + '^{' + e + '}=' + g.tex + '$') +
          '\nТиймээс $\\log_{' + a + '}' + g.tex + '=' + e + '$') + '</span></div>' + (gi < G.length - 1 ? '<button type="button" class="pw-next" data-pw="n">Дараагийн зорилго' + IC.right + '</button>' : '') :
          (e > g.k && g.k >= 0 && ops.length ? '<div class="pw-tip">' + md('Хэтэрлээ — эхнээс нь эхэл') + '</div>' : '')) +
        '</div>';
    }
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-pw]'); if (!b || b.disabled) return;
      var v = b.getAttribute('data-pw');
      if (v === 'n') { gi++; e = 0; ops = []; }
      else if (v === '0') { e = 0; ops = []; }
      else { e += +v; ops.push(+v); }
      paint();
    });
    paint();
  };

  /* Логарифмын шугам: log(bc) = log b + log c — илтгэгчийн хэрчмүүд залгагдана */
  WG.logmul = function (host, o) {
    var a = o.a || 2, m = o.m || 3, n = o.n || 2, MX = 6;
    function row(r, cur) {
      var h = '';
      for (var k = 1; k <= MX; k++) h += '<button type="button" class="cmo-chip' + (k === cur ? ' on' : '') + '" data-r="' + r + '" data-e="' + k + '">' + Math.pow(a, k) + '</button>';
      return h;
    }
    function paint() {
      var VW = host.clientWidth > 0 && host.clientWidth < 520 ? 400 : 600, X = function (k) { return 28 + k * (VW - 56) / (2 * MX); }, s = '', b = Math.pow(a, m), c = Math.pow(a, n), bc = Math.pow(a, m + n);
      for (var k = 0; k <= 2 * MX; k++) s += '<line x1="' + X(k) + '" y1="92" x2="' + X(k) + '" y2="' + (k % 2 ? 98 : 102) + '" class="tk"/><text class="tl" x="' + X(k) + '" y="120">' + k + '</text>';
      s = '<line x1="' + X(0) + '" y1="92" x2="' + X(2 * MX) + '" y2="92" class="ax"/>' + s +
        '<rect x="' + X(0) + '" y="62" width="' + (X(m) - X(0)) + '" height="20" rx="10" fill="#7B52EE"/><rect x="' + X(m) + '" y="62" width="' + (X(m + n) - X(m)) + '" height="20" rx="10" fill="#0B9FB3"/>' +
        '<text class="bl w" x="' + (X(0) + X(m)) / 2 + '" y="78" fill="#fff">' + m + '</text><text class="bl w" x="' + (X(m) + X(m + n)) / 2 + '" y="78" fill="#fff">' + n + '</text>' +
        '<path d="M' + X(0) + ' 48V38H' + X(m + n) + 'V48" fill="none" stroke="#1E1A4D" stroke-width="2.5"/><text class="bl" x="' + (X(0) + X(m + n)) / 2 + '" y="28" fill="#1E1A4D">' + (m + n) + '</text>';
      host.innerHTML = '<div class="cmo-lm"><div class="lm-row"><span>' + md('$b$') + '</span>' + row('b', m) + '</div><div class="lm-row"><span>' + md('$c$') + '</span>' + row('c', n) + '</div>' +
        '<svg class="cmo-svg" viewBox="0 0 ' + VW + ' 132" role="img" aria-label="Илтгэгчийн шугам">' + s + '</svg>' +
        '<div class="cmo-wi">' + md('Үржвэр: $' + b + '\\cdot ' + c + '=' + bc + '$\nЛогарифм: $\\log_{' + a + '}' + b + '+\\log_{' + a + '}' + c + '=' + m + '+' + n + '=' + (m + n) + '=\\log_{' + a + '}' + bc + '$') + '</div></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-e]'); if (!b) return;
      if (b.getAttribute('data-r') === 'b') m = +b.getAttribute('data-e'); else n = +b.getAttribute('data-e');
      paint();
    });
    paint();
  };

  /* Олон гишүүнтийн зэрэг: үржвэрт зэрэг нэмэгдэнэ (хэрчмүүд залгагдана), нийлбэрт их нь үлдэнэ */
  WG.deg = function (host, o) {
    var m = o.m || 3, n = o.n || 2;
    function bar(k, col, k2, col2) {
      var h = '';
      for (var i = 0; i < k; i++) h += '<i style="background:' + col + '"></i>';
      for (i = 0; i < (k2 || 0); i++) h += '<i style="background:' + col2 + '"></i>';
      return h || '<em>0</em>';
    }
    function step(r, v) { return '<span class="dg-st"><button type="button" class="cmo-ib" data-s="' + r + '" data-d="-1" aria-label="Багасгах"' + (v <= 0 ? ' disabled' : '') + '>' + IC.minus + '</button><b>' + v + '</b><button type="button" class="cmo-ib" data-s="' + r + '" data-d="1" aria-label="Нэмэх"' + (v >= 6 ? ' disabled' : '') + '>' + IC.plus + '</button></span>'; }
    function paint() {
      var V = '#7B52EE', T = '#0B9FB3', big = m >= n ? [m, V] : [n, T];
      host.innerHTML = '<div class="cmo-dg">' +
        '<div class="dg-r"><span>' + md('$P$-ийн зэрэг') + '</span>' + step('m', m) + '<div class="dg-b">' + bar(m, V) + '</div></div>' +
        '<div class="dg-r"><span>' + md('$Q$-ийн зэрэг') + '</span>' + step('n', n) + '<div class="dg-b">' + bar(n, T) + '</div></div>' +
        '<div class="dg-r res"><span>' + md('$P\\cdot Q$') + '</span><b class="dg-v">' + (m + n) + '</b><div class="dg-b">' + bar(m, V, n, T) + '</div></div>' +
        '<div class="dg-r res"><span>' + md('$P+Q$') + '</span><b class="dg-v">' + (m === n ? '≤ ' + m : Math.max(m, n)) + '</b><div class="dg-b">' + bar(big[0], big[1]) + '</div></div>' +
        '<div class="cmo-wi">' + md('$\\deg(P\\cdot Q)=' + m + '+' + n + '=' + (m + n) + '$ — зэргүүд **нэмэгдэнэ**.\n$\\deg(P+Q)=' + (m === n ? '\\le ' + m + '$ — зэрэг тэнцүү үед ахлах гишүүд хураагдаж, зэрэг буурч ч болно.' : Math.max(m, n) + '$ — **их нь** үлдэнэ.')) + '</div></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-s]'); if (!b || b.disabled) return;
      if (b.getAttribute('data-s') === 'm') m = clamp(m + +b.getAttribute('data-d'), 0, 6); else n = clamp(n + +b.getAttribute('data-d'), 0, 6);
      paint();
    });
    paint();
  };

  /* Олон гишүүнтийн бүтэц: гишүүн дээр дарахад коэффициент, зэрэг */
  WG.poly = function (host, o) {
    var T = o.terms, sel = 0;
    function paint() {
      var t = T[sel];
      host.innerHTML = '<div class="cmo-pl"><div class="pl-row"><span class="pl-p">' + tx('P(x)=') + '</span>' + T.map(function (q, i) {
        return '<button type="button" class="pl-t' + (i === sel ? ' on' : '') + '" data-t="' + i + '">' + tx(q.t) + (q.tag ? '<small>' + esc(q.tag) + '</small>' : '') + '</button>';
      }).join('') + '</div><div class="cmo-wi">' + md('Гишүүн $' + t.t.replace(/^\+/, '') + '$: коэффициент **$' + t.c + '$**, зэрэг **$' + t.e + '$**' + (t.note ? ' — ' + t.note : '')) + '</div>' +
        (o.foot ? '<p class="pl-f">' + md(o.foot) + '</p>' : '') + '</div>';
    }
    host.addEventListener('click', function (e) { var b = e.target.closest('[data-t]'); if (b) { sel = +b.getAttribute('data-t'); paint(); } });
    paint();
  };

  /* Хорнерын схем: x − t-д хуваах — алхам алхмаар; төгсгөлд ногдвор, үлдэгдэл (= P(t)) */
  WG.horner = function (host, o) {
    var c = o.p, t = o.t, n = c.length, st = 0, tmin = o.tmin != null ? o.tmin : -3, tmax = o.tmax != null ? o.tmax : 3;
    function calc() { var b = [c[0]], pr = [null]; for (var i = 1; i < n; i++) { pr[i] = b[i - 1] * t; b[i] = c[i] + pr[i]; } return { b: b, pr: pr }; }
    function paint() {
      var r = calc(), b = r.b, pr = r.pr, row1 = '<td class="hd"></td>', row2 = '<td class="hd"></td>', row3 = '<td class="hd t">' + mn(t) + '</td>', note;
      for (var i = 0; i < n; i++) {
        row1 += '<td>' + mn(c[i]) + '</td>';
        row2 += '<td class="' + (st === i + 1 && i ? 'nw' : '') + '">' + (i && st > i ? mn(pr[i]) : '') + '</td>';
        row3 += '<td class="' + (i === n - 1 ? 'rm ' : '') + (st === i + 1 ? 'nw' : '') + '">' + (st > i ? mn(b[i]) : '') + '</td>';
      }
      if (!st) note = 'Дээд мөрөнд коэффициентүүд, зүүн талд $t=' + t + '$. **«Алхам»** дар.';
      else if (st === 1) note = 'Эхний коэффициентийг шууд доош нь буулгана: $' + b[0] + '$.';
      else { var i2 = st - 1; note = '$' + par(b[i2 - 1]) + '\\cdot ' + par(t) + '=' + pr[i2] + '$, дараа нь $' + c[i2] + '+' + par(pr[i2]) + '=' + b[i2] + '$.'; }
      if (st === n) note = 'Ногдвор: $S(x)=' + polyTex(b.slice(0, -1)) + '$, үлдэгдэл: $R=' + b[n - 1] + '$.' + (o.bez ? '\nШалгавал $P(' + t + ')=' + b[n - 1] + '$ — яг үлдэгдэлтэй тэнцүү!' : '');
      host.innerHTML = '<div class="cmo-hn"><div class="hn-q">' + md('$P(x)=' + polyTex(c) + '$-ийг $' + xm(t) + '$-д хуваая') + '</div>' +
        '<div class="cmo-tw"><table class="hn-t"><tr>' + row1 + '</tr><tr>' + row2 + '</tr><tr class="sum">' + row3 + '</tr></table></div>' +
        '<div class="cmo-wi">' + md(note) + '</div><div class="hn-c"><span class="dg-st">' + md('$t$') + ' <button type="button" class="cmo-ib" data-h="-" aria-label="t багасгах"' + (t <= tmin ? ' disabled' : '') + '>' + IC.minus + '</button><b>' + mn(t) +
        '</b><button type="button" class="cmo-ib" data-h="+" aria-label="t нэмэх"' + (t >= tmax ? ' disabled' : '') + '>' + IC.plus + '</button></span>' +
        '<button type="button" class="cmo-btn" data-h="s"' + (st >= n ? ' disabled' : '') + '>Алхам</button><button type="button" class="cmo-btn ghost" data-h="a"' + (st >= n ? ' disabled' : '') + '>Бүгдийг</button></div></div>';
    }
    host.addEventListener('click', function (e) {
      var bt = e.target.closest('[data-h]'); if (!bt || bt.disabled) return;
      var v = bt.getAttribute('data-h');
      if (v === 's') st = Math.min(n, st + 1); else if (v === 'a') st = n; else { t = clamp(t + (v === '+' ? 1 : -1), tmin, tmax); st = 0; }
      paint();
    });
    paint();
  };

  /* Хялбар бутархайд задлах: x-т язгуурыг орлуулахад нэг гишүүн «алга болно» */
  WG.cover = function (host, o) {
    var A1 = o.num[0], B1 = o.num[1], p = o.p, q = o.q, r1 = -p, r2 = -q, done = {};
    function N(x) { return A1 * x + B1; }
    var A = N(r1) / (r1 + q), B = N(r2) / (r2 + p), f1 = 'x' + (p < 0 ? p : '+' + p), f2 = 'x' + (q < 0 ? q : '+' + q), nt = polyTex([A1, B1]);
    function sub(r, keepA) {
      var lhs = (A1 === 1 ? '' : A1 === -1 ? '-' : A1 + '\\cdot ') + par(r) + (B1 < 0 ? B1 : '+' + B1);
      var ta = 'A(' + r + (q < 0 ? q : '+' + q) + ')', tb = 'B(' + r + (p < 0 ? p : '+' + p) + ')';
      return lhs + '=' + (keepA ? ta + '+\\cancel{' + tb + '}' : '\\cancel{' + ta + '}+' + tb);
    }
    function paint() {
      var h = '<div class="cmo-cv"><div class="cv-l">' + tx('\\dfrac{' + nt + '}{(' + f1 + ')(' + f2 + ')}=\\dfrac{A}{' + f1 + '}+\\dfrac{B}{' + f2 + '}', true) + '</div>' +
        '<div class="cv-l">' + md('Хуваарийг арилгавал: $' + nt + '=A(' + f2 + ')+B(' + f1 + ')$') + '</div><div class="cv-b">' +
        '<button type="button" class="cmo-btn' + (done.a ? ' on' : '') + '" data-c="a">' + md('$x=' + r1 + '$ орлуул') + '</button>' +
        '<button type="button" class="cmo-btn' + (done.b ? ' on' : '') + '" data-c="b">' + md('$x=' + r2 + '$ орлуул') + '</button></div>';
      if (done.a) h += '<div class="cv-s">' + tx(sub(r1, true)) + '<span>→</span>' + tx(N(r1) + '=' + (r1 + q) + 'A') + '<span>→</span><b>' + tx('A=' + A) + '</b></div>';
      if (done.b) h += '<div class="cv-s">' + tx(sub(r2, false)) + '<span>→</span>' + tx(N(r2) + '=' + (r2 + p) + 'B') + '<span>→</span><b>' + tx('B=' + B) + '</b></div>';
      if (done.a && done.b) h += '<div class="cv-r">' + IC.check + tx('\\dfrac{' + nt + '}{(' + f1 + ')(' + f2 + ')}=\\dfrac{' + A + '}{' + f1 + '}' + (B < 0 ? '-' : '+') + '\\dfrac{' + Math.abs(B) + '}{' + f2 + '}', true) + '</div>';
      else h += '<div class="cmo-wi">' + md('Товч дар: тэр утгад нэг хаалт **тэг** болж, үлдсэн үл мэдэгдэгч шууд олдоно.') + '</div>';
      host.innerHTML = h + '</div>';
    }
    host.addEventListener('click', function (e) { var b = e.target.closest('[data-c]'); if (b) { done[b.getAttribute('data-c')] = 1; paint(); } });
    paint();
  };

  /* Үржвэрийн уламжлал — тэгш өнцөгтийн талбайн өсөлт: (uv)' = u'v + uv' */
  WG.area = function (host, o) {
    var g = 0.5;
    host.innerHTML = '<svg class="cmo-svg" viewBox="0 0 520 300" role="img" aria-label="Тэгш өнцөгтийн талбай"></svg>' +
      '<div class="cmo-sls">' + slider('g', 'Өсөлт', 0, 1, 0.05, g) + '</div><div class="cmo-wi"></div>';
    var svg = host.querySelector('svg'), info = host.querySelector('.cmo-wi'), draw = frame(paint);
    function paint() {
      var x0 = 70, yb = 250, u = 250, v = 150, du = 90 * g, dv = 64 * g, h = '';
      h += '<rect x="' + x0 + '" y="' + (yb - v) + '" width="' + u + '" height="' + v + '" fill="#EDE7FF" stroke="#7B52EE" stroke-width="2.5"/>' +
        '<text class="bl" x="' + (x0 + u / 2) + '" y="' + (yb - v / 2 + 7) + '" fill="#5B3BD9">u · v</text>';
      if (g > 0) {
        h += '<rect x="' + (x0 + u) + '" y="' + (yb - v) + '" width="' + du + '" height="' + v + '" fill="#0B9FB3" opacity=".8"/>' +
          '<rect x="' + x0 + '" y="' + (yb - v - dv) + '" width="' + u + '" height="' + dv + '" fill="#F59E0B" opacity=".85"/>' +
          '<rect x="' + (x0 + u) + '" y="' + (yb - v - dv) + '" width="' + du + '" height="' + dv + '" fill="#C9C3E0"/>';
        if (du > 34) h += '<text class="bl w" x="' + (x0 + u + du / 2) + '" y="' + (yb - v / 2 + 6) + '" fill="#fff">Δu·v</text>';
        if (dv > 18) h += '<text class="bl w" x="' + (x0 + u / 2) + '" y="' + (yb - v - dv / 2 + 6) + '" fill="#fff">u·Δv</text>';
      }
      h += '<text class="tl" x="' + (x0 + u / 2) + '" y="' + (yb + 26) + '">u</text><text class="tl" x="' + (x0 - 18) + '" y="' + (yb - v / 2 + 5) + '">v</text>';
      if (du > 16) h += '<text class="tl" x="' + (x0 + u + du / 2) + '" y="' + (yb + 26) + '">Δu</text>';
      if (dv > 14) h += '<text class="tl" x="' + (x0 - 22) + '" y="' + (yb - v - dv / 2 + 5) + '">Δv</text>';
      svg.innerHTML = h;
      host.querySelector('[data-v="g"]').textContent = Math.round(g * 100) + '%';
      info.innerHTML = md('Шинэ талбай = $uv$ + **цэнхэр** $\\Delta u\\cdot v$ + **шар** $u\\cdot\\Delta v$ + саарал булан $\\Delta u\\,\\Delta v$.\nБулан нь маш жижиг тул хаягдана: $(uv)\'=u\'v+uv\'$');
    }
    host.addEventListener('input', function (e) { if (e.target.getAttribute('data-k') === 'g') { g = +e.target.value; draw(); } });
    paint();
  };

  /* Давхар функц: дотоод → гаднах «машин», уламжлалыг гаднаас дотогш (st өгвөл өөр 3 алхам — ж: f(g(2))-ийн утга) */
  WG.chain = function (host, o) {
    var E = o.ex, ei = 0, st = 0;
    function paint() {
      var x = E[ei], steps = x.st && x.st.length === 3 ? x.st : [
        'Гаднах функцийн уламжлал (дотоодыг хэвээр нь): $' + x.d1 + '$',
        'Дотоод функцийн уламжлал: $' + x.d2 + '$',
        'Үржүүлнэ: $y\'=' + x.res + '$'
      ];
      host.innerHTML = '<div class="cmo-ch"><div class="cmo-tg" role="tablist">' + E.map(function (q, i) {
        return '<button type="button" data-x="' + i + '" class="' + (i === ei ? 'on' : '') + '">' + tx('y=' + q.y) + '</button>';
      }).join('') + '</div><div class="ch-m"><span class="ch-io">' + tx('x') + '</span><i>' + IC.right + '</i><div class="ch-b in"><small>дотоод</small>' + tx('u=' + x.inn) +
        '</div><i>' + IC.right + '</i><div class="ch-b out"><small>гаднах</small>' + tx(x.out) + '</div><i>' + IC.right + '</i><span class="ch-io">' + tx('y') + '</span></div>' +
        '<ol class="ch-s">' + steps.map(function (s, i) { return '<li' + (i < st ? ' class="on"' : '') + '><span class="no">' + (i + 1) + '</span><div>' + (i < st ? md(s) : '<em>?</em>') + '</div></li>'; }).join('') + '</ol>' +
        '<button type="button" class="cmo-btn" data-x="s"' + (st >= 3 ? ' disabled' : '') + '>' + (st >= 3 ? 'Бэлэн' : 'Дараагийн алхам') + '</button></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-x]'); if (!b || b.disabled) return;
      var v = b.getAttribute('data-x');
      if (v === 's') st = Math.min(3, st + 1); else { ei = +v; st = 0; }
      paint();
    });
    paint();
  };

  /* ── 11-р ангийн виджетүүд ── */
  function fracTex(n, d) {   // хураасан бутархай → TeX
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(Math.abs(n), d) || 1; n /= g; d /= g;
    return d === 1 ? String(n) : (n < 0 ? '-' : '') + '\\dfrac{' + Math.abs(n) + '}{' + d + '}';
  }
  var SUB = '₀₁₂₃₄₅₆₇₈₉';
  function sub(n) { return String(n).split('').map(function (c) { return SUB.charAt(+c); }).join(''); }
  function stepper(key, val, lo, hi, label) {
    return '<span class="dg-st">' + (label ? '<em>' + md(label) + '</em>' : '') + '<button type="button" class="cmo-ib" data-st="' + key + '" data-d="-1" aria-label="Багасгах"' + (val <= lo ? ' disabled' : '') + '>' + IC.minus +
      '</button><b>' + val + '</b><button type="button" class="cmo-ib" data-st="' + key + '" data-d="1" aria-label="Нэмэх"' + (val >= hi ? ' disabled' : '') + '>' + IC.plus + '</button></span>';
  }

  /* Интервалын арга: a(x − r₁)(x − r₂) ? 0 — язгуурыг чирнэ, завсар бүрийн тэмдэг, параболын ноорог, шийд */
  WG.sign = function (host, o) {
    var nar = host.clientWidth > 0 && host.clientWidth < 520, VW = nar ? 440 : 640, VH = 240, L = 28, R = VW - 28, Y0 = 150, min = -7, max = 7, cid = 'cmos' + (++UID);
    var OPS = { lt: '<', le: '\\le', gt: '>', ge: '\\ge' };
    var s = { r1: clamp(o.roots ? o.roots[0] : -2, -6, 6), r2: clamp(o.roots ? o.roots[1] : 3, -6, 6), a: o.a < 0 ? -1 : 1, op: OPS[o.op] ? o.op : 'gt' };
    function X(v) { return L + (v - min) * (R - L) / (max - min); }
    function V(px) { return clamp(Math.round(min + (px - L) * (max - min) / (R - L)), -6, 6); }
    host.innerHTML = '<div class="cmo-plot"><svg class="cmo-svg nl" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Интервалын арга"></svg><span class="cmo-hint">' + IC.hand + 'Язгуурыг чир</span></div>' +
      '<div class="cmo-sls"><div class="cmo-tg" role="group" aria-label="Тэмдэг">' + Object.keys(OPS).map(function (k) { return '<button type="button" data-op="' + k + '">' + tx(OPS[k]) + '</button>'; }).join('') + '</div>' +
      '<div class="cmo-tg" role="group" aria-label="Ахлах коэффициент"><button type="button" data-a="1">' + tx('a>0') + '</button><button type="button" data-a="-1">' + tx('a<0') + '</button></div></div>' +
      '<div class="cmo-wi" aria-live="polite"></div>';
    var svg = host.querySelector('svg'), info = host.querySelector('.cmo-wi'), draw = frame(paint);
    function f(x) { return s.a * (x - s.r1) * (x - s.r2); }
    function holds(v) { return s.op === 'lt' ? v < 0 : s.op === 'le' ? v <= 0 : s.op === 'gt' ? v > 0 : v >= 0; }
    function paint() {
      var lo = Math.min(s.r1, s.r2), hi = Math.max(s.r1, s.r2), strict = s.op === 'lt' || s.op === 'gt', h = '', k, pth = '';
      var vy = Math.abs(s.a) * (hi - lo) * (hi - lo) / 4, sc = 78 / Math.max(vy, 3);
      for (k = 0; k <= 280; k++) { var x = min + (max - min) * k / 280; pth += (k ? 'L' : 'M') + rnd(X(x), 1) + ' ' + rnd(clamp(Y0 - f(x) * sc, -400, 700), 1); }
      h += '<defs><clipPath id="' + cid + '"><rect x="0" y="8" width="' + VW + '" height="' + (VH - 16) + '"/></clipPath></defs>';
      // шийдийн хэсэг (тэнхлэг дээр зузаан)
      var segs = [], prev = null;
      for (k = 0; k <= 560; k++) {
        var xx = min + (max - min) * k / 560, ok = holds(f(xx));
        if (ok && prev === null) prev = xx;
        if ((!ok || k === 560) && prev !== null) { segs.push([prev, ok ? xx : min + (max - min) * (k - 1) / 560]); prev = null; }
      }
      segs.forEach(function (sg) { h += '<line x1="' + X(sg[0]) + '" y1="' + Y0 + '" x2="' + X(sg[1]) + '" y2="' + Y0 + '" stroke="#10B981" stroke-width="9" stroke-linecap="round" opacity=".9"/>'; });
      h += '<g clip-path="url(#' + cid + ')"><path d="' + pth + '" fill="none" stroke="#7B52EE" stroke-width="3.5" opacity=".75"/></g>';
      h += '<line x1="' + (L - 14) + '" y1="' + Y0 + '" x2="' + (R + 14) + '" y2="' + Y0 + '" class="ax"/><path d="M' + (R + 16) + ' ' + Y0 + 'l-10 -6v12z" class="ah"/>';
      for (k = min; k <= max; k++) {
        var root = k === s.r1 || k === s.r2;
        h += '<line x1="' + X(k) + '" y1="' + (Y0 - 5) + '" x2="' + X(k) + '" y2="' + (Y0 + 5) + '" class="tk"/><text class="tl' + (root ? ' hl' : '') + '" x="' + X(k) + '" y="' + (Y0 + 26) + '"' +
          (root ? ' fill="#1E1A4D"' : '') + '>' + mn(k) + '</text>';
      }
      // завсар бүрийн тэмдэг
      var cuts = lo === hi ? [min, lo, max] : [min, lo, hi, max];
      for (k = 0; k < cuts.length - 1; k++) {
        var mid = (cuts[k] + cuts[k + 1]) / 2, w = X(cuts[k + 1]) - X(cuts[k]);
        if (w < 26) continue;
        var pos = f(mid) > 0;
        h += '<text class="sg' + (pos ? ' p' : ' m') + '" x="' + X(mid) + '" y="' + (Y0 + (pos ? -14 : 46)) + '">' + (pos ? '+' : '−') + '</text>';
      }
      [s.r1, s.r2].forEach(function (r, i) {
        if (i && s.r1 === s.r2) return;
        h += '<circle class="pt" cx="' + X(r) + '" cy="' + Y0 + '" r="10" fill="' + (strict ? '#fff' : '#10B981') + '" stroke="#1E1A4D" stroke-width="3"/>';
      });
      svg.innerHTML = h;
      var op = OPS[s.op], pf = s.r1 === s.r2 ? '(' + xm(s.r1) + ')^{2}' : '(' + xm(lo) + ')(' + xm(hi) + ')', lhs = (s.a < 0 ? '-' : '') + pf, sol;
      if (lo === hi) {
        var pos2 = s.a > 0;   // a(x−r)²: a>0 бол ≥ 0
        if (s.op === (pos2 ? 'gt' : 'lt')) sol = '$x\\ne ' + lo + '$';
        else if (s.op === (pos2 ? 'ge' : 'le')) sol = 'бүх бодит тоо';
        else if (s.op === (pos2 ? 'lt' : 'gt')) sol = '**шийдгүй**';
        else sol = '$x=' + lo + '$';
      } else {
        var inside = s.a > 0 ? (s.op === 'lt' || s.op === 'le') : (s.op === 'gt' || s.op === 'ge'), l = strict ? '<' : '\\le', g2 = strict ? '>' : '\\ge';
        sol = inside ? '$' + lo + l + 'x' + l + hi + '$' : '$x' + l + lo + '$ эсвэл $x' + g2 + hi + '$';
      }
      info.innerHTML = md('$' + lhs + op + '0$ → ' + sol);
      [].forEach.call(host.querySelectorAll('[data-op]'), function (b) { b.classList.toggle('on', b.getAttribute('data-op') === s.op); });
      [].forEach.call(host.querySelectorAll('[data-a]'), function (b) { b.classList.toggle('on', +b.getAttribute('data-a') === s.a); });
    }
    dragger(svg, VW, VH, function (p) {
      var d1 = Math.abs(p.x - X(s.r1)), d2 = Math.abs(p.x - X(s.r2));
      return d1 <= d2 ? { who: 'r1', dist: d1 } : { who: 'r2', dist: d2 };
    }, function (p, who) { if (!who) return; var v = V(p.x); if (v !== s[who]) { s[who] = v; draw(); } hideHint(host); });
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-op],[data-a]'); if (!b) return;
      if (b.hasAttribute('data-op')) s.op = b.getAttribute('data-op'); else s.a = +b.getAttribute('data-a');
      draw();
    });
    paint();
  };

  /* Прогресс: арифметик (a₁, d) / геометр (b₁, q) — гишүүд багана, ерөнхий гишүүн, Sₙ; ap+sum → Гауссын хос */
  WG.seq = function (host, o) {
    var gp = o.type === 'gp', QS = [-3, -2, -0.5, 0.5, 2, 3], showSum = o.sum !== false;
    var s = { a: o.a1 != null ? o.a1 : (gp ? 1 : 2), d: o.d != null ? o.d : 3, qi: Math.max(0, QS.indexOf(o.q != null ? o.q : 2)), n: clamp(o.n || 6, 2, 10) };
    var PAIR = ['#7B52EE', '#0B9FB3', '#F59E0B', '#DB2777', '#10B981'];
    function term(k) {   // k-р гишүүн → { v, t (SVG), x (TeX) } — q = ±1/2 үед бутархай
      if (!gp) { var v = s.a + (k - 1) * s.d; return { v: v, t: mn(v), x: String(v) }; }
      var q = QS[s.qi], e = k - 1;
      if (Math.abs(q) >= 1) { var w = s.a * Math.pow(q, e); return { v: w, t: mn(w), x: String(w) }; }
      var num = s.a * (q < 0 && e % 2 ? -1 : 1), den = Math.pow(2, e), g = gcd(Math.abs(num), den) || 1;
      num /= g; den /= g;
      return { v: num / den, t: den === 1 ? mn(num) : (num < 0 ? '−' : '') + Math.abs(num) + '/' + den, x: fracTex(num, den) };
    }
    function qTex(q) { return Math.abs(q) >= 1 ? String(q) : (q < 0 ? '-' : '') + '\\dfrac{1}{2}'; }
    function paint() {
      var n = s.n, T = [], k, mx = 0, VW = 600, VH = 240, i;
      for (k = 1; k <= n; k++) { T.push(term(k)); mx = Math.max(mx, Math.abs(T[k - 1].v)); }
      var neg = T.some(function (t) { return t.v < 0; }), pos = T.some(function (t) { return t.v > 0; });
      var base = neg && pos ? 128 : neg ? 40 : 200, room = neg && pos ? 88 : 150, sc = room / Math.max(mx, 1e-9);
      var bw = (VW - 60) / n, h = '<line x1="20" y1="' + base + '" x2="' + (VW - 20) + '" y2="' + base + '" class="ax"/>';
      for (k = 0; k < n; k++) {
        var t = T[k], cx = 30 + bw * (k + 0.5), hgt = Math.max(2, Math.abs(t.v) * sc), y = t.v >= 0 ? base - hgt : base;
        var col = gp ? '#0B9FB3' : (showSum ? PAIR[Math.min(k, n - 1 - k) % PAIR.length] : '#7B52EE');
        h += '<rect x="' + (cx - bw * 0.32) + '" y="' + y + '" width="' + bw * 0.64 + '" height="' + hgt + '" rx="6" fill="' + col + '" opacity=".88"/>' +
          '<text class="bl" x="' + cx + '" y="' + (t.v >= 0 ? y - 8 : y + hgt + 20) + '" fill="#1E1A4D">' + t.t + '</text>' +
          '<text class="tl" x="' + cx + '" y="' + (t.v >= 0 ? base + 20 : base - 8) + '">' + (gp ? 'b' : 'a') + sub(k + 1) + '</text>';
      }
      var ctl = stepper('a', s.a, gp ? -5 : -9, gp ? 5 : 9, gp ? '$b_1$' : '$a_1$') + (gp ? '<span class="dg-st"><em>' + md('$q$') + '</em><button type="button" class="cmo-ib" data-st="q" data-d="-1" aria-label="Багасгах"' +
        (s.qi <= 0 ? ' disabled' : '') + '>' + IC.minus + '</button><b>' + md('$' + qTex(QS[s.qi]) + '$') + '</b><button type="button" class="cmo-ib" data-st="q" data-d="1" aria-label="Нэмэх"' + (s.qi >= QS.length - 1 ? ' disabled' : '') + '>' + IC.plus + '</button></span>'
        : stepper('d', s.d, -5, 5, '$d$')) + stepper('n', s.n, 2, 10, '$n$');
      var last = T[n - 1], sumTxt;
      if (!gp) {
        var S = (s.a + last.v) * n / 2;
        sumTxt = '$a_{' + n + '}=a_1+(' + n + '-1)d=' + s.a + (s.d < 0 ? '' : '+') + (n - 1) * s.d + '=' + last.v + '$' + (showSum ? '\n$S_{' + n + '}=\\dfrac{(a_1+a_{' + n + '})\\cdot ' + n + '}{2}=\\dfrac{(' + s.a + (last.v < 0 ? '' : '+') + last.v + ')\\cdot ' + n + '}{2}=' + S + '$' +
          (n > 2 ? '\nӨнгө нэг хос бүрийн нийлбэр ижил: $a_1+a_{' + n + '}=a_2+a_{' + (n - 1) + '}=' + (s.a + last.v) + '$' : '') : '');
      } else {
        var q = QS[s.qi], P2 = Math.pow(2, n - 1), num = 0;   // Sₙ·2ⁿ⁻¹ — бүхэл
        for (i = 0; i < n; i++) num += s.a * (Math.abs(q) >= 1 ? Math.pow(q, i) * P2 : (q < 0 && i % 2 ? -1 : 1) * Math.pow(2, n - 1 - i));
        var Sx = Math.abs(q) >= 1 ? String(num / P2) : fracTex(num, P2);
        sumTxt = '$b_{' + n + '}=b_1q^{' + (n - 1) + '}=' + last.x + '$' + (showSum ? '\n$S_{' + n + '}=\\dfrac{b_1(q^{' + n + '}-1)}{q-1}=' + Sx + '$' : '');
      }
      host.innerHTML = '<div class="cmo-sq"><svg class="cmo-svg" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Прогрессийн гишүүд">' + h + '</svg>' +
        '<div class="cmo-sls sq-c">' + ctl + '</div><div class="cmo-wi">' + md(sumTxt) + '</div></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-st]'); if (!b || b.disabled) return;
      var k = b.getAttribute('data-st'), dd = +b.getAttribute('data-d');
      if (k === 'q') s.qi = clamp(s.qi + dd, 0, QS.length - 1);
      else if (k === 'a') { s.a = clamp(s.a + dd, gp ? -5 : -9, gp ? 5 : 9); if (gp && s.a === 0) s.a = dd; }
      else if (k === 'd') s.d = clamp(s.d + dd, -5, 5);
      else s.n = clamp(s.n + dd, 2, 10);
      paint();
    });
    paint();
  };

  /* Огторгуйн координат (кабинет проекц): point — цэг ба проекц, dist — |AB| ба дундаж цэг, vec — OA⃗, OB⃗, скаляр үржвэр */
  WG.xyz = function (host, o) {
    var mode = o.mode || 'point', A = (o.A || [2, 3, 4]).slice(), B = (o.B || [-1, 2, 1]).slice(), VW = 440, VH = 400, ox = 220, oy = 200, u = 30, cx = 0.36;
    function S(p) { return [ox + u * (p[1] - cx * p[0]), oy + u * (cx * p[0] - p[2])]; }
    function ln(p, q, cls, extra) { var a = S(p), b = S(q); return '<line x1="' + rnd(a[0], 1) + '" y1="' + rnd(a[1], 1) + '" x2="' + rnd(b[0], 1) + '" y2="' + rnd(b[1], 1) + '" class="' + cls + '"' + (extra || '') + '/>'; }
    function ptc(p, col, lb, dy) {
      var a = S(p);
      return '<circle cx="' + rnd(a[0], 1) + '" cy="' + rnd(a[1], 1) + '" r="7.5" fill="' + col + '" stroke="#fff" stroke-width="2.5"/>' +
        (lb ? '<text class="ml" x="' + rnd(a[0] + 10, 1) + '" y="' + rnd(a[1] + (dy || -10), 1) + '" fill="' + col + '">' + lb + '</text>' : '');
    }
    function arrow(p, col) {
      var a = S([0, 0, 0]), b = S(p), ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L2 = 12;
      return '<line x1="' + a[0] + '" y1="' + a[1] + '" x2="' + rnd(b[0], 1) + '" y2="' + rnd(b[1], 1) + '" stroke="' + col + '" stroke-width="4" stroke-linecap="round"/>' +
        '<path d="M' + rnd(b[0], 1) + ' ' + rnd(b[1], 1) + 'L' + rnd(b[0] - L2 * Math.cos(ang - 0.4), 1) + ' ' + rnd(b[1] - L2 * Math.sin(ang - 0.4), 1) + 'L' + rnd(b[0] - L2 * Math.cos(ang + 0.4), 1) + ' ' + rnd(b[1] - L2 * Math.sin(ang + 0.4), 1) + 'Z" fill="' + col + '"/>';
    }
    function octant(p) {
      if (!p[0] || !p[1] || !p[2]) return 'координатын хавтгай дээр';
      var key = (p[0] > 0 ? '+' : '-') + (p[1] > 0 ? '+' : '-') + (p[2] > 0 ? '+' : '-');
      return { '+++': 'I', '-++': 'II', '--+': 'III', '+-+': 'IV', '++-': 'V', '-+-': 'VI', '---': 'VII', '+--': 'VIII' }[key] + ' мөч';
    }
    function pt3(p) { return '(' + p[0] + ';\\,' + p[1] + ';\\,' + p[2] + ')'; }
    function half(v) { return v % 2 === 0 ? String(v / 2) : fracTex(v, 2); }
    function paint() {
      var h = '', k;
      [[0, 'x'], [1, 'y'], [2, 'z']].forEach(function (ax) {
        var e1 = [0, 0, 0], e2 = [0, 0, 0], e3 = [0, 0, 0]; e1[ax[0]] = 5.6; e2[ax[0]] = -5.4; e3[ax[0]] = 6.1;
        h += ln([0, 0, 0], e2, 'axn') + ln([0, 0, 0], e1, 'ax');
        var t = S(e3); h += '<text class="axl" x="' + rnd(t[0], 1) + '" y="' + rnd(t[1] + 5, 1) + '">' + ax[1] + '</text>';
        for (k = -5; k <= 5; k++) {
          if (!k) continue;
          var q = [0, 0, 0]; q[ax[0]] = k; var c = S(q);
          h += '<circle cx="' + rnd(c[0], 1) + '" cy="' + rnd(c[1], 1) + '" r="' + (k > 0 ? 2.6 : 1.8) + '" fill="' + (k > 0 ? '#4B4475' : '#B9B2DA') + '"/>';
          if (k > 0 && (k % 2 === 1 || ax[0] !== 0)) h += '<text class="tl" x="' + rnd(c[0] + (ax[0] === 2 ? -12 : 0), 1) + '" y="' + rnd(c[1] + (ax[0] === 2 ? 5 : 18), 1) + '">' + k + '</text>';
        }
      });
      var O = [0, 0, 0], info;
      if (mode === 'point') {
        var Axy = [A[0], A[1], 0];
        h += ln(A, Axy, 'cn') + ln(Axy, [A[0], 0, 0], 'cn') + ln(Axy, [0, A[1], 0], 'cn') + ln(A, [0, 0, A[2]], 'cn', ' opacity=".55"');
        h += ptc(Axy, '#9A93C4') + ptc(A, '#7B52EE', 'A' + '(' + A.map(mn).join('; ') + ')');
        info = 'Цэг $A' + pt3(A) + '$ — ' + octant(A) + '.\n$xy$ хавтгай дээрх проекц $A_1' + pt3(Axy) + '$, $z$ тэнхлэг дээрх проекц $(0;\\,0;\\,' + A[2] + ')$.';
      } else if (mode === 'dist') {
        var dx = B[0] - A[0], dy = B[1] - A[1], dz = B[2] - A[2], N = dx * dx + dy * dy + dz * dz, M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2];
        h += ln(A, B, 'sg3') + ptc(A, '#7B52EE', 'A') + ptc(B, '#0B9FB3', 'B') + ptc(M, '#F59E0B', 'M', 18);
        var r = Math.sqrt(N);
        info = '$|AB|=\\sqrt{(' + dx + ')^{2}+(' + dy + ')^{2}+(' + dz + ')^{2}}=\\sqrt{' + N + '}' + (Number.isInteger(r) ? '=' + r : '\\approx ' + rnd(r, 2)) + '$\n' +
          'Дундаж цэг $M\\left(' + half(A[0] + B[0]) + ';\\,' + half(A[1] + B[1]) + ';\\,' + half(A[2] + B[2]) + '\\right)$';
      } else {
        var dot = A[0] * B[0] + A[1] * B[1] + A[2] * B[2], la = Math.sqrt(A[0] * A[0] + A[1] * A[1] + A[2] * A[2]), lb = Math.sqrt(B[0] * B[0] + B[1] * B[1] + B[2] * B[2]);
        h += arrow(A, '#7B52EE') + arrow(B, '#0B9FB3') + ptc(O, '#1E1A4D');
        var aE = S(A), bE = S(B);
        h += '<text class="ml" x="' + rnd(aE[0] + 8, 1) + '" y="' + rnd(aE[1] - 8, 1) + '" fill="#7B52EE">a</text><text class="ml" x="' + rnd(bE[0] + 8, 1) + '" y="' + rnd(bE[1] - 8, 1) + '" fill="#0B9FB3">b</text>';
        var cos = la && lb ? dot / (la * lb) : 0, ang = la && lb ? Math.acos(clamp(cos, -1, 1)) * 180 / Math.PI : 0;
        var col = la && lb && Math.abs(Math.abs(cos) - 1) < 1e-9;
        info = '$\\vec a=' + pt3(A) + ',\\ \\vec b=' + pt3(B) + '$\n$\\vec a\\cdot\\vec b=' + A[0] + '\\cdot ' + par(B[0]) + '+' + A[1] + '\\cdot ' + par(B[1]) + '+' + A[2] + '\\cdot ' + par(B[2]) + '=' + dot + '$' +
          (la && lb ? '\n$\\cos\\varphi=\\dfrac{\\vec a\\cdot\\vec b}{|\\vec a|\\,|\\vec b|}\\approx ' + rnd(cos, 3) + '$, $\\varphi\\approx ' + rnd(ang, 1) + '^{\\circ}$' : '') +
          (dot === 0 && la && lb ? ' — **перпендикуляр!**' : col ? ' — **коллинеар!**' : '');
      }
      var ctl = '<div class="xyz-r"><b class="xa">A</b>' + stepper('A0', A[0], -5, 5, '$x$') + stepper('A1', A[1], -5, 5, '$y$') + stepper('A2', A[2], -5, 5, '$z$') + '</div>' +
        (mode === 'point' ? '' : '<div class="xyz-r"><b class="xb">B</b>' + stepper('B0', B[0], -5, 5, '$x$') + stepper('B1', B[1], -5, 5, '$y$') + stepper('B2', B[2], -5, 5, '$z$') + '</div>');
      host.innerHTML = '<div class="cmo-xyz"><svg class="cmo-svg" viewBox="0 0 ' + VW + ' ' + VH + '" role="img" aria-label="Огторгуйн координат">' + h + '</svg>' +
        '<div class="xyz-c">' + ctl + '</div><div class="cmo-wi">' + md(info) + '</div></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-st]'); if (!b || b.disabled) return;
      var k = b.getAttribute('data-st'), P = k.charAt(0) === 'A' ? A : B, i = +k.charAt(1);
      P[i] = clamp(P[i] + +b.getAttribute('data-d'), -5, 5);
      paint();
    });
    paint();
  };

  /* Паскалын гурвалжин: мөр (n) → (a + b)ⁿ задаргаа, тоон дээр дарахад хоёр «эцэг» */
  WG.pascal = function (host, o) {
    var n = clamp(o.n != null ? o.n : 4, 0, 7), kk = -1, ROWS = 8, C = [[1]], r, k;
    for (r = 1; r < ROWS; r++) { C.push([1]); for (k = 1; k < r; k++) C[r].push(C[r - 1][k - 1] + C[r - 1][k]); C[r].push(1); }
    function expand(m) {
      var s = '';
      for (var j = 0; j <= m; j++) {
        var c = C[m][j], a = m - j, b = j, t = (c === 1 && (a || b) ? '' : String(c)) + (a ? 'a' + (a > 1 ? '^{' + a + '}' : '') : '') + (b ? 'b' + (b > 1 ? '^{' + b + '}' : '') : '');
        s += (j ? '+' : '') + t;
      }
      return s;
    }
    function paint() {
      var h = '<div class="ps-t"><div class="ps-in">';
      for (r = 0; r < ROWS; r++) {
        h += '<div class="ps-r' + (r === n ? ' on' : '') + '"><small>' + 'n=' + r + '</small>';
        for (k = 0; k <= r; k++) {
          var par2 = kk >= 0 && r === n - 1 && (k === kk - 1 || k === kk), me = r === n && k === kk;
          h += '<button type="button" class="ps-c' + (me ? ' me' : par2 ? ' pa' : '') + '" data-r="' + r + '" data-k="' + k + '">' + C[r][k] + '</button>';
        }
        h += '</div>';
      }
      h += '</div></div>';
      var inf = '$(a+b)^{' + n + '}=' + expand(n) + '$\nКоэффициентүүдийн нийлбэр: $' + C[n].join('+') + '=2^{' + n + '}=' + Math.pow(2, n) + '$';
      if (kk > 0 && kk < n) inf += '\n$C_{' + n + '}^{' + kk + '}=C_{' + (n - 1) + '}^{' + (kk - 1) + '}+C_{' + (n - 1) + '}^{' + kk + '}=' + C[n - 1][kk - 1] + '+' + C[n - 1][kk] + '=' + C[n][kk] + '$';
      host.innerHTML = '<div class="cmo-ps">' + h + '<div class="cmo-wi">' + md(inf) + '</div></div>';
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-r]'); if (!b) return;
      n = +b.getAttribute('data-r'); kk = +b.getAttribute('data-k'); paint();
    });
    paint();
  };

  /* 2×2 матриц: тодорхойлогч (диагональ), урвуу матриц эсвэл Крамерын дүрэм */
  WG.det = function (host, o) {
    var m = (o.m || [[2, 1], [3, 4]]).map(function (r) { return r.slice(); }), rhs = (o.rhs || [5, 6]).slice(), mode = o.mode === 'cramer' ? 'cramer' : 'inv';
    function inp(key, v) { return '<input type="number" inputmode="numeric" min="-9" max="9" step="1" data-m="' + key + '" value="' + v + '" aria-label="' + key + '">'; }
    function mat(rows) { return '\\begin{pmatrix}' + rows.map(function (r) { return r.join('&'); }).join('\\\\') + '\\end{pmatrix}'; }
    function paint(keep) {
      var a = m[0][0], b = m[0][1], c = m[1][0], d = m[1][1], D = a * d - b * c, out;
      if (!keep) {
        host.innerHTML = '<div class="cmo-dt"><div class="dt-m"><span class="br">(</span><div class="dt-g">' + inp('00', a) + inp('01', b) + inp('10', c) + inp('11', d) + '</div><span class="br">)</span>' +
          (mode === 'cramer' ? '<span class="dt-x">' + tx('\\begin{pmatrix}x\\\\y\\end{pmatrix}=') + '</span><span class="br">(</span><div class="dt-g one">' + inp('r0', rhs[0]) + inp('r1', rhs[1]) + '</div><span class="br">)</span>' : '') +
          '</div><div class="cmo-wi"></div></div>';
      }
      out = '$\\Delta=\\begin{vmatrix}' + a + '&' + b + '\\\\' + c + '&' + d + '\\end{vmatrix}=' + par(a) + '\\cdot ' + par(d) + '-' + par(b) + '\\cdot ' + par(c) + '=' + D + '$';
      if (mode === 'inv') {
        out += D ? '\n$A^{-1}=' + (D === 1 ? '' : D === -1 ? '-' : '\\dfrac{1}{' + D + '}') + mat([[d, -b], [-c, a]]) + (Math.abs(D) === 1 ? '' : '=' + mat([[fracTex(d, D), fracTex(-b, D)], [fracTex(-c, D), fracTex(a, D)]])) + '$'
          : '\n$\\Delta=0$ тул **урвуу матриц оршин байхгүй**.';
      } else {
        var e = rhs[0], f = rhs[1], Dx = e * d - b * f, Dy = a * f - e * c;
        out += '\n$\\Delta_x=' + Dx + ',\\ \\Delta_y=' + Dy + '$' + (D ? '\n$x=\\dfrac{\\Delta_x}{\\Delta}=' + fracTex(Dx, D) + ',\\ \\ y=\\dfrac{\\Delta_y}{\\Delta}=' + fracTex(Dy, D) + '$' :
          '\n$\\Delta=0$ — систем ' + (Dx || Dy ? '**шийдгүй**' : '**төгсгөлгүй олон шийдтэй**') + '.');
      }
      host.querySelector('.cmo-wi').innerHTML = md(out);
      [].forEach.call(host.querySelectorAll('input[data-m]'), function (x) {
        var k = x.getAttribute('data-m');
        x.classList.toggle('d1', k === '00' || k === '11'); x.classList.toggle('d2', k === '01' || k === '10');
      });
    }
    host.addEventListener('input', function (e) {
      var x = e.target, k = x.getAttribute && x.getAttribute('data-m'); if (!k) return;
      var v = parseInt(x.value, 10); if (!isFinite(v)) return;
      v = clamp(v, -9, 9);
      if (k.charAt(0) === 'r') rhs[+k.charAt(1)] = v; else m[+k.charAt(0)][+k.charAt(1)] = v;
      paint(true);
    });
    paint(false);
  };

  /* ════════ Онолын дэлгэц ════════ */
  function store(k, v) {
    try { var o = JSON.parse(localStorage.getItem('cmo_seen') || '{}'); if (v === undefined) return o[k]; o[k] = v; localStorage.setItem('cmo_seen', JSON.stringify(o)); } catch (e) {}
  }
  function progressQ(id) {
    try { var p = typeof getLessonProgress === 'function' ? getLessonProgress(id) : null; return p && p.currentQ > 0 ? p.currentQ : 0; } catch (e) { return 0; }   // eslint-disable-line no-undef
  }
  function cards() { return S.root.querySelectorAll('.cmo-card'); }
  function cur() { return cards()[S.i]; }

  function show(id, node, opt) {
    var L = DATA[id], modal = $('quiz-modal'), content = $('quiz-content');
    if (!modal || !content || !L) return fallback(id);
    modal.classList.add('open', 'cmo-open');
    var n = L.cards.length, title = (node && node.name) || L.title || 'Онол', segs = '', q = progressQ(id);
    for (var k = 0; k < n; k++) segs += '<button type="button" class="cmo-seg" data-go="' + k + '" aria-label="' + (k + 1) + '-р алхам"><i></i></button>';
    content.innerHTML = '<div class="cmo" role="region" aria-label="Онол: ' + esc(title) + '">' +
      '<div class="cmo-top"><div class="cmo-prog">' + segs + '</div>' +
      '<button type="button" class="cmo-skip" data-act="start">' + (q ? 'Дасгал руу' : 'Шууд дасгал') + IC.right + '</button>' +
      '<button type="button" class="cmo-x" data-act="close" aria-label="Хаах">' + IC.x + '</button></div>' +
      '<div class="cmo-head"><span class="cmo-tag">' + IC.book + 'Онол</span><h2>' + esc(title) + '</h2><small>' + n + ' алхам · ~' + Math.max(2, Math.round(n * 0.55)) + ' мин' +
      (store(id) ? ' · өмнө үзсэн' : '') + '</small></div>' +
      '<div class="cmo-stage">' + L.cards.map(cardHtml).join('') + '</div>' +
      '<div class="cmo-nav"><button type="button" class="cmo-prev" data-act="prev">' + IC.left + '<span>Өмнөх</span></button><span class="cmo-cnt"></span>' +
      '<button type="button" class="cmo-next" data-act="next"><span></span>' + IC.right + '</button></div></div>';
    S = { id: id, L: L, n: n, i: 0, mem: {}, q: q, root: content.querySelector('.cmo'), opt: opt || {} };
    bind(S.root);
    go(0, 0);
    try { modal.scrollTop = 0; } catch (e) {}
  }

  function go(i, dir) {
    if (!S || i < 0 || i >= S.n) return;
    var cs = cards(), next = cs[i];
    if (cs[S.i] && S.i !== i) cs[S.i].hidden = true;
    next.hidden = false;
    next.classList.remove('in-l', 'in-r');
    if (dir) { void next.offsetWidth; next.classList.add(dir < 0 ? 'in-l' : 'in-r'); }
    S.i = i;
    var c = S.L.cards[i], m = S.mem[i] = S.mem[i] || {};
    if (c.w && !m.w) { m.w = 1; var host = next.querySelector('.cmo-w'); try { WG[c.w.w](host, c.w); } catch (e) { host.innerHTML = ''; try { console.warn('cm-onol', e); } catch (x) {} } }
    if (c.k === 'ex') stepUi(next, c, m);
    sync();
    if (i === S.n - 1 && !m.fx) { m.fx = 1; store(S.id, 1); burst(next); }
    var top = S.root.getBoundingClientRect().top;
    if (dir && top < 0) try { S.root.scrollIntoView({ block: 'start' }); } catch (e) {}
  }
  function sync() {
    var c = S.L.cards[S.i], m = S.mem[S.i] || {}, last = S.i === S.n - 1, nx = S.root.querySelector('.cmo-next'), lb;
    [].forEach.call(S.root.querySelectorAll('.cmo-seg'), function (s, k) { s.classList.toggle('done', k < S.i); s.classList.toggle('on', k === S.i); });
    S.root.querySelector('.cmo-prev').disabled = S.i === 0;
    S.root.querySelector('.cmo-cnt').textContent = (S.i + 1) + ' / ' + S.n;
    if (c.k === 'ex' && (m.st || 0) < c.s.length) lb = (m.st || 0) ? 'Дараагийн алхам' : 'Бодолтыг харах';
    else if (last) lb = S.q ? (S.q + 1) + '-р асуултаас үргэлжлүүлэх' : 'Дасгал эхлэх';
    else lb = 'Цааш';
    nx.querySelector('span').textContent = lb;
    nx.classList.toggle('go', last && !(c.k === 'ex' && (m.st || 0) < c.s.length));
    nx.querySelector('svg').outerHTML = last ? IC.play : IC.right;
  }
  // Жишээ: алхмуудыг нэг нэгээр нээнэ
  function stepUi(card, c, m) {
    var k = m.st || 0, li = card.querySelectorAll('.cmo-st'), ph = card.querySelector('.cmo-ph'), an = card.querySelector('.cmo-ans');
    [].forEach.call(li, function (x, j) { x.hidden = j >= k; });
    if (ph) { ph.hidden = k >= c.s.length; ph.innerHTML = IC.plus + '<span>' + (k ? (k + 1) + '-р алхмыг нээх' : 'Эхлээд өөрөө бодоод үз, дараа нь алхмуудыг нээ') + '</span>'; }
    if (an) an.hidden = k < c.s.length;
  }
  function stepNext() {
    var c = S.L.cards[S.i], m = S.mem[S.i];
    if (c.k !== 'ex' || (m.st || 0) >= c.s.length) return false;
    m.st = (m.st || 0) + 1;
    var card = cur();
    stepUi(card, c, m);
    var li = card.querySelectorAll('.cmo-st')[m.st - 1];
    if (li) { li.classList.add('show'); try { if (li.getBoundingClientRect().bottom > (W.innerHeight || 800) - 90) li.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) {} }
    sync();
    return true;
  }
  function primary() {
    if (stepNext()) return;
    if (S.i < S.n - 1) go(S.i + 1, 1); else start();
  }
  function start() {
    var id = S && S.id;
    if (!id) return;
    store(id, 1);
    cleanup();
    if (typeof startLessonAfterIntro === 'function') startLessonAfterIntro(id);   // eslint-disable-line no-undef
  }
  function fallback(id) {
    cleanup();
    if (typeof startLessonAfterIntro === 'function') startLessonAfterIntro(id);   // eslint-disable-line no-undef
  }
  function cleanup() { S = null; var m = $('quiz-modal'); if (m) m.classList.remove('cmo-open'); }
  function check(btn) {
    var c = S.L.cards[S.i], m = S.mem[S.i], card = cur(), j = +btn.getAttribute('data-o'), fb = card.querySelector('.cmo-fb');
    if (m.ok || btn.classList.contains('no')) return;
    if (j === c.c) {
      m.ok = 1; btn.classList.add('ok');
      fb.innerHTML = '<div class="ok">' + IC.check + '<div><b>Зөв!</b> ' + md(c.why || '') + '</div></div>';
      burst(card, btn);
    } else {
      m.bad = (m.bad || 0) + 1; btn.classList.add('no');
      if (m.bad >= 2) {
        m.ok = 1; card.querySelector('.cmo-opt[data-o="' + c.c + '"]').classList.add('ok');
        fb.innerHTML = '<div class="no">' + IC.alert + '<div><b>Зөв хариу: ' + 'ABCD'.charAt(c.c) + '.</b> ' + md(c.why || '') + '</div></div>';
      } else fb.innerHTML = '<div class="try">' + md(c.hint ? 'Дахин бодоод үз. ' + c.hint : 'Дахин бодоод үз.') + '</div>';
    }
    [].forEach.call(card.querySelectorAll('.cmo-opt'), function (b) { if (m.ok) b.disabled = true; });
  }
  function burst(card, at) {
    try { if (W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch (e) {}
    var box = d.createElement('div'), cols = ['#7B52EE', '#FFB300', '#0B9FB3', '#DB2777', '#10B981'];
    box.className = 'cmo-cf'; box.setAttribute('aria-hidden', 'true');
    if (at) { box.style.left = (at.offsetLeft + at.offsetWidth / 2) + 'px'; box.style.top = (at.offsetTop + at.offsetHeight / 2) + 'px'; }
    for (var k = 0; k < 16; k++) {
      var p = d.createElement('i'), a = k / 16 * Math.PI * 2, r = 70 + (k % 4) * 22;
      p.style.background = cols[k % cols.length];
      p.style.setProperty('--x', Math.round(Math.cos(a) * r) + 'px'); p.style.setProperty('--y', Math.round(Math.sin(a) * r - 30) + 'px');
      p.style.animationDelay = (k % 3) * 40 + 'ms';
      box.appendChild(p);
    }
    card.appendChild(box);
    setTimeout(function () { if (box.parentNode) box.parentNode.removeChild(box); }, 1400);
  }

  function bind(root) {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act],[data-go],.cmo-opt');
      if (!t || !S) return;
      if (t.classList.contains('cmo-opt')) return check(t);
      if (t.hasAttribute('data-go')) { var g = +t.getAttribute('data-go'); return go(g, g < S.i ? -1 : 1); }
      var a = t.getAttribute('data-act');
      if (a === 'next') primary();
      else if (a === 'prev') go(S.i - 1, -1);
      else if (a === 'step') stepNext();
      else if (a === 'start') start();
      else if (a === 'rv') { var r = t.nextElementSibling; if (r) { r.hidden = false; t.hidden = true; } }
      else if (a === 'close') { cleanup(); if (typeof closeModal === 'function') closeModal(); else { var m = $('quiz-modal'); if (m) m.classList.remove('open'); } }   // eslint-disable-line no-undef
    });
    // Утсанд: картыг хажуу тийш шудрахад шилжинэ (зураг, гулсуур дээр биш)
    var sx = null, sy = 0;
    root.querySelector('.cmo-stage').addEventListener('touchstart', function (e) {
      if (e.touches.length !== 1 || e.target.closest('.cmo-w,input,button,.cmo-tw,.katex-display')) { sx = null; return; }
      sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    root.querySelector('.cmo-stage').addEventListener('touchend', function (e) {
      if (sx == null || !S) return;
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      sx = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 45) { if (dx < 0) primary(); else go(S.i - 1, -1); }
    }, { passive: true });
  }
  function onKey(e) {
    if (!S || !S.root || !S.root.isConnected) return;
    var m = $('quiz-modal');
    if (!m || !m.classList.contains('open') || e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.closest && t.closest('.cmo-w'))) return;
    if (e.key === 'ArrowRight' || (e.key === 'Enter' && tag !== 'button')) { e.preventDefault(); primary(); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(S.i - 1, -1); }
    else if (/^[1-4]$/.test(e.key) && S.L.cards[S.i].k === 'check') { var o = cur().querySelector('.cmo-opt[data-o="' + (+e.key - 1) + '"]'); if (o && !o.disabled) { e.preventDefault(); check(o); } }
  }

  /* ════════ Сав ачаалах, нээх ════════ */
  function packOf(id) { for (var i = 0; i < PACKS.length; i++) if (id >= PACKS[i].lo && id <= PACKS[i].hi) return PACKS[i]; return null; }
  function load(pk, cb) {
    if (pk.ok) return cb(true);
    if (pk.q) return pk.q.push(cb);
    pk.q = [cb];
    var s = d.createElement('script'), fin = false;
    function done(ok) { if (fin) return; fin = true; clearTimeout(tm); if (ok) pk.ok = 1; var q = pk.q; pk.q = null; q.forEach(function (f) { try { f(ok); } catch (e) {} }); }
    var tm = setTimeout(function () { done(false); }, 15000);
    s.src = pk.src; s.async = true;
    s.onload = function () { done(true); }; s.onerror = function () { done(false); };
    d.head.appendChild(s);
  }
  function has(id) { id = +id; return !!(id && (DATA[id] || packOf(id))); }
  function open(id, node, opt) {
    id = +id;
    if (DATA[id]) return show(id, node, opt);
    var pk = packOf(id), modal = $('quiz-modal'), content = $('quiz-content');
    if (!pk || !modal || !content) return fallback(id);
    modal.classList.add('open', 'cmo-open');
    var tok = {}; S = { tok: tok, id: id, root: null };
    content.innerHTML = '<div class="cmo cmo-ld" role="status"><div class="cmo-sk"></div><div class="cmo-sk s"></div><p>Онол ачаалж байна…</p></div>';
    load(pk, function () {
      if (!S || S.tok !== tok || !modal.classList.contains('open')) return;
      if (DATA[id]) show(id, node, opt); else fallback(id);
    });
  }
  function pack(o) { Object.keys(o).forEach(function (k) { DATA[+k] = o[k]; }); }

  function init() {
    var content = $('quiz-content');
    if (content && W.MutationObserver) new MutationObserver(function () {
      if (S && S.root && !S.root.isConnected) cleanup();
    }).observe(content, { childList: true });
    d.addEventListener('keydown', onKey);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();

  W.cmOnol = { has: has, open: open, pack: pack, md: md, util: { polyTex: polyTex, rnd: rnd, par: par, xm: xm }, _data: DATA, _t: { trig: trig, radTex: radTex, polyTex: polyTex, piLab: piLab, md: md } };
})();
