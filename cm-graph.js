/* CyberMath — График байгуулах бодлого (GeoGebra маягийн самбар), шалгалт ба «График харах». Хэв маяг: cm-graph.css
   1) Самбар: координатын хавтгай, торонд наалддаг цэг, хэрчим/шулуун/цацраг/вектороор холбох, чирж зөөх, устгах, буцаах.
   2) Бодлого: график/функцтэй сэдэв бүрийн хичээлд (openLesson → cmGraph.inject) параметртэй генератороор 2 бодлого нэмнэ
      (DB-д бичихгүй, type:'graph'). Шалгалт (checkAnswer → cmGraph.check): шулууныг дурын 2 цэгээр, хэрчим, цэгүүд;
      парабол, гипербол г.м. муруйд сурагч цэгээ тавиад «Цэгүүдийг холбох» товч дарна — муруй ЯГ түүний цэгүүдээр татагдана,
      цэгүүд функц дээр байгаа эсэхийг шалгана; буруу бол зөв графикийг ногооноор харуулна.
   3) «График харах»: шалгасны дараа самбар дээр зөв графикийг асааж/унтраана; бусад бодлогын текстэд y = f(x) байвал
      функцийн графикийг зурна (renderQuestion → cmGraph.viewFor).
   Сайтын функцийг дарж бичихгүй — index.html эдгээрийг дуудна. Хуучин (?ui=old) ба шинэ загварт хоёуланд ажиллана. */
(function () {
  'use strict';
  var d = document, UID = 0;

  /* ════════ Тоо, бичиглэл ════════ */
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function near(a, b) { return Math.abs(a - b) < 1e-6; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function rat(v) { for (var q = 1; q <= 12; q++) { var p = v * q; if (near(p, Math.round(p))) return { p: Math.round(p), q: q }; } return { p: v, q: 1 }; }
  function fr(v) {   // LaTeX: бүхэл эсвэл энгийн бутархай
    var r = rat(v); if (r.q === 1) return String(r.p);
    return (r.p < 0 ? '-' : '') + '\\dfrac{' + Math.abs(r.p) + '}{' + r.q + '}';
  }
  function dc(v) { return near(v, Math.round(v)) ? String(Math.round(v)) : String(+v.toFixed(2)); }   // координат: 0.5 г.м.
  function mn(v) { return dc(v).replace('-', '−'); }
  function P(n, p) { return n + '(' + dc(p[0]) + ';\\,' + dc(p[1]) + ')'; }
  function and(l) { return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' ба ' + l[l.length - 1]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function poly(a, b, c) {   // ax² + bx + c → LaTeX
    var s = '';
    function term(k, v) {
      if (near(k, 0)) return;
      var ab = Math.abs(k), co = v && near(ab, 1) ? '' : fr(ab);
      s += (s ? (k < 0 ? ' - ' : ' + ') : (k < 0 ? '-' : '')) + co + v;
    }
    term(a, 'x^2'); term(b, 'x'); term(c, '');
    return s || '0';
  }
  function lin(m, b) { return poly(0, m, b); }
  function stdEq(m, b) {   // y = mx + b → Ax + By = C (бүхэл коэффициент)
    var r = rat(m), A = -r.p, B = r.q, C = r.q * b, k = 1;
    for (var t = 1; t <= 12; t++) if (near(C * t, Math.round(C * t))) { k = t; break; }
    A *= k; B *= k; C = Math.round(C * k);
    var g = gcd(gcd(A, B), C); A /= g; B /= g; C /= g;
    if (A < 0 || (A === 0 && B < 0)) { A = -A; B = -B; C = -C; }
    var s = A ? (A === 1 ? '' : A === -1 ? '-' : A) + 'x' : '';
    if (B) s += (s ? (B < 0 ? ' - ' : ' + ') : (B < 0 ? '-' : '')) + (Math.abs(B) === 1 ? '' : Math.abs(B)) + 'y';
    return s + ' = ' + (C + 0);
  }
  function V(x0, x1, y0, y1, o) {
    o = o || {};
    return { x0: x0, x1: x1, y0: y0, y1: y1, xs: o.xs || 1, ys: o.ys || 1, sx: o.sx || o.xs || 1, sy: o.sy || o.ys || 1,
      xl: o.xl || 'x', yl: o.yl || 'y', xf: o.xf || '', lx: o.lx || 0, ly: o.ly || 0 };
  }
  function inV(p, v) { return p[0] >= v.x0 && p[0] <= v.x1 && p[1] >= v.y0 && p[1] <= v.y1; }
  function onGrid(y, s) { return near(y / s, Math.round(y / s)); }
  // y = mx + b дээрх, харагдах муж дахь торны цэгүүд
  function gridPts(m, b, v) {
    var out = [];
    for (var x = Math.ceil(v.x0); x <= v.x1; x++) { var y = m * x + b; if (y >= v.y0 && y <= v.y1 && onGrid(y, v.sy)) out.push([x, +y.toFixed(6)]); }
    return out;
  }
  function two(ps) { return ps.length < 2 ? null : [ps[0], ps[ps.length - 1]]; }
  function rp(v, avoid, minD, m) {   // санамсаргүй бүхэл цэг (зах, өөр цэгээс хол)
    m = m == null ? 1 : m;
    for (var i = 0; i < 300; i++) {
      var p = [ri(Math.ceil(v.x0) + m, Math.floor(v.x1) - m), ri(Math.ceil(v.y0) + m, Math.floor(v.y1) - m)];
      if ((avoid || []).every(function (a) { return Math.hypot(a[0] - p[0], a[1] - p[1]) >= (minD || 2); })) return p;
    }
    return [1, 1];
  }
  function dirX(x) { return x > 0 ? 'баруун тийш ' + dc(x) : x < 0 ? 'зүүн тийш ' + dc(-x) : 'хэвтээ чиглэлд шилжихгүй'; }
  function dirY(y) { return y > 0 ? 'дээш ' + dc(y) : y < 0 ? 'доош ' + dc(-y) : 'босоо чиглэлд шилжихгүй'; }
  // Хугарсан шугамын функц (зам-хугацаа, давтамж, өгөгдлийн график)
  function pw(pts) {
    var f = function (x) {
      for (var i = 0; i + 1 < pts.length; i++) {
        var a = pts[i], b = pts[i + 1];
        if (x >= a[0] - 1e-9 && x <= b[0] + 1e-9) return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
      }
      return NaN;
    };
    f.pts = pts; return f;
  }
  function tbl(r1, r2, h1, h2) {   // KaTeX хүснэгт
    return '$$\\begin{array}{|c|' + r1.map(function () { return 'c|'; }).join('') + '}\\hline \\text{' + h1 + '} & ' + r1.join(' & ') +
      ' \\\\ \\hline \\text{' + h2 + '} & ' + r2.join(' & ') + ' \\\\ \\hline\\end{array}$$';
  }

  /* ════════ Бодлогын генераторууд ════════
     Буцаах: t — текст, v — хавтгай, tools — хэрэгсэл, given — өгөгдсөн зураг, ans — хариу, h — тайлбар (Тайлбар харах / буруу үед) */
  var L6 = V(-6, 6, -6, 6), SL = [1, -1, 2, -2, 3, -3, 1 / 2, -1 / 2, 2 / 3, -2 / 3, 3 / 2, -3 / 2];
  function lineTask(m, b, v) {   // y = mx + b-ийн хариу (харагдах 2 торны цэгтэй) эсвэл null
    var ps = gridPts(m, b, v); return ps.length >= 2 ? [ps[0], ps[ps.length - 1]] : null;
  }
  function linHint(m, b, v) {
    var ps = gridPts(m, b, v), a = ps[Math.floor((ps.length - 1) / 3)], c = ps[Math.min(ps.length - 1, Math.floor((ps.length - 1) / 3) + Math.max(1, Math.round(rat(m).q)))];
    if (!c || (a[0] === c[0])) c = ps[ps.length - 1];
    return '$x = ' + dc(a[0]) + '$ үед $y = ' + dc(a[1]) + '$, $x = ' + dc(c[0]) + '$ үед $y = ' + dc(c[1]) + '$. $(' + dc(a[0]) + ';\\,' + dc(a[1]) + ')$ ба $(' +
      dc(c[0]) + ';\\,' + dc(c[1]) + ')$ цэгүүдийг дайруулан шулуун татна.';
  }
  function triPts(v, ok) {
    for (var i = 0; i < 400; i++) {
      var A = rp(v, [], 0), B = rp(v, [A], 3), C = rp(v, [A, B], 3);
      var area = Math.abs((B[0] - A[0]) * (C[1] - A[1]) - (C[0] - A[0]) * (B[1] - A[1]));
      if (area >= 6 && (!ok || ok([A, B, C]))) return [A, B, C];
    }
    return [[1, 1], [4, 1], [2, 4]];
  }
  var MAP = {
    Ox: { f: function (p) { return [p[0], -p[1]]; }, t: '$Ox$ тэнхлэгийн', h: '$Ox$ тэнхлэгийн хувьд тэгш хэм: $(x;\\,y) \\to (x;\\,-y)$.' },
    Oy: { f: function (p) { return [-p[0], p[1]]; }, t: '$Oy$ тэнхлэгийн', h: '$Oy$ тэнхлэгийн хувьд тэгш хэм: $(x;\\,y) \\to (-x;\\,y)$.' },
    yx: { f: function (p) { return [p[1], p[0]]; }, t: '$y = x$ шулууны', h: '$y = x$ шулууны хувьд тэгш хэм: $(x;\\,y) \\to (y;\\,x)$.' },
    O: { f: function (p) { return [-p[0], -p[1]]; }, t: 'координатын эх $O$ цэгийн', h: '$O$ цэгийн хувьд тэгш хэм: $(x;\\,y) \\to (-x;\\,-y)$.' }
  };
  function imgTask(T, rule, text, hint) {   // гурвалжны дүрс (тэгш хэм, зөөлт, эргүүлэлт)
    var I = T.map(rule), nm = ['A', 'B', 'C'];
    return { t: '$ABC$ гурвалжны оройнууд: ' + and(T.map(function (p, i) { return '$' + P(nm[i], p) + '$'; })) + '. ' + text,
      v: L6, tools: ['point', 'seg'], names: ['A_1', 'B_1', 'C_1'], given: [{ t: 'poly', pts: T, ns: nm }],
      ans: { k: 'segs', segs: [[I[0], I[1]], [I[1], I[2]], [I[2], I[0]]] },
      h: hint + ' Жишээ нь $' + P('A', T[0]) + ' \\to ' + P('A_1', I[0]) + '$. Гурван оройг олоод хэрчмээр холбоно.' };
  }
  function reflect(axes) {
    var ax = pick(axes), M = MAP[ax];
    var T = triPts(L6, function (t) {
      return t.every(function (p) { var q = M.f(p); return p[0] && p[1] && p[0] !== p[1] && p[0] !== -p[1] && inV(q, L6) && Math.hypot(q[0] - p[0], q[1] - p[1]) >= 2; });
    });
    return imgTask(T, M.f, M.t + ' хувьд тэгш хэмтэй $A_1B_1C_1$ гурвалжныг байгуул.', M.h);
  }
  /* Цэгүүдээр байгуулах функцийн график: сурагч цэгээ тавиад «Цэгүүдийг холбох» хэрэгслээр цэгүүдээ дарааллаар нь сонгоно —
     муруй нь ЯГ сонгосон цэгүүдээр, сонгосон дарааллаар гөлгөр (smooth) эсвэл шулуун хэсгүүдээр (line) татагдана. */
  var JOIN = '«Цэгүүдийг холбох» товчийг дараад цэгүүдээ дарааллаар нь сонгож холбо.';
  function curveTask(o) {
    return { t: o.t, v: o.v, tools: ['point', 'join'], ans: { k: 'curve', fn: o.f, need: o.need || [], side: o.side || null, br: o.br || [], min: o.min || 0, join: o.join || 'smooth' }, h: o.h };
  }
  function hyperTask(k, num) {
    var D = { 4: [[-4, -2, -1, 1, 2, 4], 5], 6: [[-6, -3, -2, -1, 1, 2, 3, 6], 7], 8: [[-8, -4, -2, -1, 1, 2, 4, 8], 9], 12: [[-6, -4, -3, -2, 2, 3, 4, 6], 7] }[Math.abs(k)];
    var xs = D[0], R = D[1], f = function (x) { return k / x; };
    return curveTask({ f: f, need: xs, br: [0], min: xs.length, v: V(-R, R, -R, R),
      t: '$y = ' + (k < 0 ? '-' : '') + '\\dfrac{' + Math.abs(k) + '}{x}$ функцийн графикийн $x = ' + xs.join(';\\ ') + '$ утгад харгалзах цэгүүдийг байгуулаад ' + JOIN + ' Салаа бүрийг тусад нь холбоно.',
      h: 'Утга бүрд $y = \\dfrac{' + k + '}{x}$-ийг бодно: ' + xs.slice(xs.length / 2).map(function (x) { return '$(' + x + ';\\,' + dc(k / x) + ')$'; }).join(', ') +
        ' г.м. $x = 0$ үед функц тодорхойлогдохгүй тул график хоёр салаатай.' });
  }
  var GEN = {
    pts: function () {
      var v = L6, n = pick([3, 4]), ps = [], nm = 'ABCD';
      while (ps.length < n) { var p = rp(v, ps, 2); if (p[0] || p[1]) ps.push(p); }
      if (Math.random() < 0.7) {
        var k = ri(0, n - 1), q = ps[k].slice(); q[ri(0, 1)] = 0;
        if ((q[0] || q[1]) && ps.every(function (a) { return a[0] !== q[0] || a[1] !== q[1]; })) ps[k] = q;
      }
      return { t: 'Координатын хавтгайд ' + and(ps.map(function (p, i) { return '$' + P(nm[i], p) + '$'; })) + ' цэгүүдийг байгуул.',
        v: v, tools: ['point'], names: nm.split(''), ans: { k: 'points', pts: ps },
        h: 'Координатын эхээс эхлээд абсцисс ($x$)-ийн дагуу, дараа нь ординат ($y$)-ын дагуу шилжинэ. $' + P(nm[0], ps[0]) + '$: ' + dirX(ps[0][0]) + ', ' + dirY(ps[0][1]) + ' нэгж.' };
    },
    table: function () {
      var m = pick([1, 2, -1, -2]), b = ri(-2, 2), xs = Math.abs(m) === 2 ? [-1, 0, 1, 2] : [-2, 0, 1, 3];
      var ps = xs.map(function (x) { return [x, m * x + b]; });
      return { t: '$y = ' + lin(m, b) + '$ хамаарлын $x = ' + xs.join(';\\ ') + '$ утгад харгалзах цэгүүдийг координатын хавтгайд байгуул.',
        v: L6, tools: ['point'], ans: { k: 'points', pts: ps },
        h: 'Утга бүрийг томьёонд орлуулна: ' + ps.map(function (p) { return '$x = ' + p[0] + '$ үед $y = ' + dc(p[1]) + '$'; }).join(', ') + '.' };
    },
    seg: function () {
      var A = rp(L6), B = rp(L6, [A], 4);
      return { t: '$' + P('A', A) + '$ ба $' + P('B', B) + '$ цэгүүдийг байгуулж, $AB$ хэрчмийг зур.', v: L6, tools: ['point', 'seg'], names: ['A', 'B'],
        ans: { k: 'segs', segs: [[A, B]] }, h: 'Хоёр цэгийг координатаар нь тавиад, «Хэрчим» хэрэгслээр $A$, дараа нь $B$ дээр дарна.' };
    },
    lineAB: function () {
      var A = rp(L6), B = rp(L6, [A], 3);
      return { t: '$' + P('A', A) + '$ ба $' + P('B', B) + '$ цэгүүдийг дайрсан шулууныг зур.', v: L6, tools: ['point', 'line'], names: ['A', 'B'],
        ans: { k: 'lines', lines: [[A, B]] }, h: 'Хоёр цэгийг координатаар нь тавиад, «Шулуун» хэрэгслээр хоёуланг нь дайруулан татна. Хоёр цэгээр ганц л шулуун татагдана.' };
    },
    ray: function () {
      var A = rp(L6), B = rp(L6, [A], 3);
      return { t: '$' + P('A', A) + '$ цэгээс эхэлж $' + P('B', B) + '$ цэгийг дайрсан $AB$ цацрагийг зур.', v: L6, tools: ['point', 'ray'], names: ['A', 'B'],
        ans: { k: 'rays', rays: [[A, B]] }, h: 'Цацраг нэг цэгээс эхэлж нэг зүгт хязгааргүй үргэлжилнэ. «Цацраг» хэрэгслээр эхлээд $A$, дараа нь $B$ дээр дарна.' };
    },
    tri: function () {
      var T = triPts(L6), nm = ['A', 'B', 'C'];
      return { t: and(T.map(function (p, i) { return '$' + P(nm[i], p) + '$'; })) + ' оройтой $ABC$ гурвалжныг байгуул.', v: L6, tools: ['point', 'seg'], names: nm,
        ans: { k: 'segs', segs: [[T[0], T[1]], [T[1], T[2]], [T[2], T[0]]] }, h: 'Гурван оройг тавиад $AB$, $BC$, $CA$ хэрчмүүдийг зурна.' };
    },
    mid: function () {
      var A, B, M;
      do { A = rp(L6); B = [A[0] + 2 * ri(-4, 4), A[1] + 2 * ri(-4, 4)]; } while (!inV(B, L6) || Math.hypot(B[0] - A[0], B[1] - A[1]) < 4);
      M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      return { t: '$' + P('A', A) + '$ ба $' + P('B', B) + '$ цэгүүдийг холбосон $AB$ хэрчмийн дундаж цэг $M$-ийг байгуул.', v: L6, tools: ['point'], names: ['M'],
        given: [{ t: 'seg', a: A, b: B }, { t: 'pt', p: A, n: 'A' }, { t: 'pt', p: B, n: 'B' }], ans: { k: 'points', pts: [M] },
        h: '$M\\left(\\dfrac{x_A + x_B}{2};\\,\\dfrac{y_A + y_B}{2}\\right) = M\\left(\\dfrac{' + A[0] + ' + (' + B[0] + ')}{2};\\,\\dfrac{' + A[1] + ' + (' + B[1] + ')}{2}\\right) = ' + P('M', M) + '$.' };
    },
    linear: function () {
      var m, b, L;
      do { m = pick(SL); b = ri(-4, 4); L = lineTask(m, b, L6); } while (!L || gridPts(m, b, L6).length < 3);
      return { t: '$y = ' + lin(m, b) + '$ функцийн графикийг байгуул.', v: L6, tools: ['point', 'line'], ans: { k: 'lines', lines: [L] }, h: linHint(m, b, L6) };
    },
    direct: function () {
      var m = pick([1, -1, 2, -2, 3, -3, 1 / 2, -1 / 2, 1 / 3, -1 / 3, 2 / 3, -2 / 3]), r = rat(m);
      return { t: '$y = ' + lin(m, 0) + '$ шууд пропорционал хамаарлын графикийг байгуул.', v: L6, tools: ['point', 'line'], ans: { k: 'lines', lines: [lineTask(m, 0, L6)] },
        h: 'Шууд пропорционал хамаарлын график $O(0;\\,0)$ цэгийг дайрна. $x = ' + r.q + '$ үед $y = ' + r.p + '$ тул $O(0;\\,0)$ ба $(' + r.q + ';\\,' + r.p + ')$ цэгийг дайруулан шулуун татна.' };
    },
    general: function () {
      var a, b;
      do { a = pick([-6, -4, -3, -2, 2, 3, 4, 6]); b = pick([-6, -4, -3, -2, 2, 3, 4, 6]); } while (Math.abs(a) + Math.abs(b) < 5);
      return { t: '$' + stdEq(-b / a, b) + '$ тэгшитгэлтэй шулууныг байгуул.', v: L6, tools: ['point', 'line'], ans: { k: 'lines', lines: [[[a, 0], [0, b]]] },
        h: '$x = 0$ үед $y = ' + b + '$, $y = 0$ үед $x = ' + a + '$. Тэнхлэгүүдтэй огтлолцох $(0;\\,' + b + ')$ ба $(' + a + ';\\,0)$ цэгүүдийг дайруулан шулуун татна.' };
    },
    axisPar: function () {
      var A; do { A = rp(L6); } while (!A[0] || !A[1]);
      var k = ri(0, 2);
      if (k === 2) {
        var c = pick([-4, -3, -2, 2, 3, 4]), vert = Math.random() < 0.5;
        return { t: '$' + (vert ? 'x' : 'y') + ' = ' + c + '$ шулууныг байгуул.', v: L6, tools: ['point', 'line'],
          ans: { k: 'lines', lines: [vert ? [[c, 0], [c, 1]] : [[0, c], [1, c]]] },
          h: vert ? '$x = ' + c + '$ шулуун дээрх бүх цэгийн абсцисс $' + c + '$ — $Oy$ тэнхлэгт параллель босоо шулуун.' : '$y = ' + c + '$ шулуун дээрх бүх цэгийн ординат $' + c + '$ — $Ox$ тэнхлэгт параллель хэвтээ шулуун.' };
      }
      var hor = k === 0;
      return { t: '$' + P('A', A) + '$ цэгийг дайрсан, $' + (hor ? 'Ox' : 'Oy') + '$ тэнхлэгт параллель шулууныг зур.', v: L6, tools: ['point', 'line'], given: [{ t: 'pt', p: A, n: 'A' }],
        ans: { k: 'lines', lines: [hor ? [[0, A[1]], [1, A[1]]] : [[A[0], 0], [A[0], 1]]] },
        h: hor ? '$Ox$ тэнхлэгт параллель шулуун дээрх бүх цэгийн ординат ижил: $y = ' + A[1] + '$.' : '$Oy$ тэнхлэгт параллель шулуун дээрх бүх цэгийн абсцисс ижил: $x = ' + A[0] + '$.' };
    },
    slopePt: function () {
      var m, A, b, L;
      do { m = pick(SL); A = rp(L6); b = A[1] - m * A[0]; L = lineTask(m, b, L6); } while (!L || !onGrid(b, 1 / 6));
      var r = rat(m);
      return { t: 'Налалт нь $k = ' + fr(m) + '$ бөгөөд $' + P('A', A) + '$ цэгийг дайрсан шулууныг байгуул.', v: L6, tools: ['point', 'line'], given: [{ t: 'pt', p: A, n: 'A' }],
        ans: { k: 'lines', lines: [L] },
        h: '$k = \\dfrac{' + r.p + '}{' + r.q + '}$: $A$ цэгээс баруун тийш $' + r.q + '$, ' + (r.p > 0 ? 'дээш' : 'доош') + ' $' + Math.abs(r.p) + '$ нэгж шилжиж хоёр дахь цэгийг олно. Хоёр цэгийг дайруулан шулуун татна.' };
    },
    slopeInt: function () {
      var m, b, L;
      do { m = pick(SL); b = ri(-4, 4); L = lineTask(m, b, L6); } while (!L || gridPts(m, b, L6).length < 3);
      var r = rat(m);
      return { t: 'Налалт нь $k = ' + fr(m) + '$, $Oy$ тэнхлэгийг $(0;\\,' + b + ')$ цэгт огтолдог шулууныг байгуул.', v: L6, tools: ['point', 'line'], ans: { k: 'lines', lines: [L] },
        h: 'Шулуун $y = ' + lin(m, b) + '$. $(0;\\,' + b + ')$ цэгээс баруун тийш $' + r.q + '$, ' + (r.p > 0 ? 'дээш' : 'доош') + ' $' + Math.abs(r.p) + '$ нэгж шилжиж хоёр дахь цэгийг олно.' };
    },
    parallel: function () {
      var m, b0, A, b, L, G;
      do {
        m = pick([1, -1, 2, -2, 1 / 2, -1 / 2, 3, -3]); b0 = ri(-3, 3); A = rp(L6); b = A[1] - m * A[0];
        L = lineTask(m, b, L6); G = lineTask(m, b0, L6);
      } while (!L || !G || near(b, b0) || !onGrid(b, 0.5));
      return { t: '$y = ' + lin(m, b0) + '$ шулуунтай параллель, $' + P('A', A) + '$ цэгийг дайрсан шулууныг зур.', v: L6, tools: ['point', 'line'],
        given: [{ t: 'line', a: G[0], b: G[1] }, { t: 'pt', p: A, n: 'A' }], ans: { k: 'lines', lines: [L] },
        h: 'Параллель шулуунуудын налалт тэнцүү: $k = ' + fr(m) + '$. Хайж буй шулуун $y = ' + lin(m, b) + '$.' };
    },
    perp: function () {
      var m, b0, A, k2, b, L, G;
      do {
        m = pick([1, -1, 2, -2, 1 / 2, -1 / 2]); k2 = -1 / m; b0 = ri(-3, 3); A = rp(L6); b = A[1] - k2 * A[0];
        L = lineTask(k2, b, L6); G = lineTask(m, b0, L6);
      } while (!L || !G || !onGrid(b, 0.5));
      return { t: '$y = ' + lin(m, b0) + '$ шулуунд перпендикуляр, $' + P('A', A) + '$ цэгийг дайрсан шулууныг зур.', v: L6, tools: ['point', 'line'],
        given: [{ t: 'line', a: G[0], b: G[1] }, { t: 'pt', p: A, n: 'A' }], ans: { k: 'lines', lines: [L] },
        h: 'Перпендикуляр шулуунуудын налалтын үржвэр $-1$: $k = -\\dfrac{1}{' + fr(m) + '} = ' + fr(k2) + '$. Хайж буй шулуун $y = ' + lin(k2, b) + '$.' };
    },
    system: function () {
      var Pn, m1, m2, b1, b2, L1, L2;
      do {
        Pn = [ri(-3, 3), ri(-3, 3)]; m1 = pick([1, -1, 2, -2, 3, -3, 1 / 2, -1 / 2]); m2 = pick([1, -1, 2, -2, 3, -3, 1 / 2, -1 / 2]);
        b1 = Pn[1] - m1 * Pn[0]; b2 = Pn[1] - m2 * Pn[0]; L1 = lineTask(m1, b1, L6); L2 = lineTask(m2, b2, L6);
      } while (near(m1, m2) || !L1 || !L2 || !onGrid(b1, 0.5) || !onGrid(b2, 0.5) || Math.abs(b1) > 6 || Math.abs(b2) > 6);
      var e1 = Math.random() < 0.5 ? 'y = ' + lin(m1, b1) : stdEq(m1, b1), e2 = Math.random() < 0.5 ? 'y = ' + lin(m2, b2) : stdEq(m2, b2);
      return { t: 'Тэгшитгэлийн системийг графикийн аргаар бод: $\\begin{cases} ' + e1 + ' \\\\ ' + e2 + ' \\end{cases}$ Хоёр шулууныг зурж, огтлолцлын цэгийг «Цэг» хэрэгслээр тэмдэглэ.',
        v: L6, tools: ['point', 'line'], ans: { k: 'lines', lines: [L1, L2], mark: Pn },
        h: 'Шулуун бүрийн 2 цэгийг олно: $y = ' + lin(m1, b1) + '$ ба $y = ' + lin(m2, b2) + '$. Огтлолцох цэг $(' + Pn[0] + ';\\,' + Pn[1] + ')$ нь системийн шийд.' };
    },
    quad: function () {
      var a = pick([1, -1]), h = ri(-3, 3), k = a > 0 ? ri(-5, 1) : ri(-1, 5), f = function (x) { return a * (x - h) * (x - h) + k; };
      return curveTask({ f: f, need: [h], side: { x: h, n: 2 }, v: L6,
        t: '$y = ' + poly(a, -2 * a * h, a * h * h + k) + '$ функцийн графикийг байгуул: оройг нь, мөн оройн хоёр талд тус бүр 2 цэгийг тэмдэглээд ' + JOIN,
        h: 'Орой: $x_0 = -\\dfrac{b}{2a} = ' + h + '$, $y_0 = ' + k + '$. $x = ' + (h - 1) + '$ ба $x = ' + (h + 1) + '$ үед $y = ' + (k + a) + '$; $x = ' + (h - 2) + '$ ба $x = ' + (h + 2) + '$ үед $y = ' + (k + 4 * a) + '$.' });
    },
    axSq: function () {
      var a = pick([1, -1, 2, -2, 1 / 2, -1 / 2]), xs = Math.abs(a) === 0.5 ? [-4, -2, 0, 2, 4] : [-2, -1, 0, 1, 2], up = a > 0, f = function (x) { return a * x * x; };
      var v = Math.abs(a) === 1 ? V(-4, 4, up ? -1 : -5, up ? 5 : 1) : V(-5, 5, up ? -1 : -9, up ? 9 : 1, { sy: Math.abs(a) === 0.5 ? 0.5 : 1 });
      return curveTask({ f: f, need: [0], side: { x: 0, n: 2 }, v: v,
        t: '$y = ' + poly(a, 0, 0) + '$ функцийн графикийг байгуул: оройг нь, мөн хоёр талд тус бүр 2 цэгийг тэмдэглээд ' + JOIN,
        h: 'Орой $O(0;\\,0)$. ' + xs.filter(function (x) { return x > 0; }).map(function (x) { return '$x = \\pm' + x + '$ үед $y = ' + dc(a * x * x) + '$'; }).join(', ') + '.' });
    },
    hyper: function () { return hyperTask(pick([4, -4, 6, -6, 8, -8, 12, -12])); },
    cubic: function () {
      var a = pick([1, -1]), f = function (x) { return a * x * x * x; };
      return curveTask({ f: f, need: [-2, -1, 0, 1, 2], min: 5, v: V(-4, 4, -9, 9, { ly: 2 }),
        t: '$y = ' + (a < 0 ? '-' : '') + 'x^3$ функцийн графикийн $x = -2;\\ -1;\\ 0;\\ 1;\\ 2$ утгад харгалзах цэгүүдийг байгуулаад ' + JOIN,
        h: '$x = -2;\\ -1;\\ 0;\\ 1;\\ 2$ үед $y = ' + [-2, -1, 0, 1, 2].map(function (x) { return dc(f(x)); }).join(';\\ ') + '$.' });
    },
    exp: function () {
      var half = Math.random() < 0.5, xs = half ? [-3, -2, -1, 0, 1] : [-1, 0, 1, 2, 3], f = function (x) { return Math.pow(half ? 0.5 : 2, x); };
      return curveTask({ f: f, need: xs, min: 5, v: half ? V(-5, 3, -1, 9, { sy: 0.5 }) : V(-3, 5, -1, 9, { sy: 0.5 }),
        t: '$y = ' + (half ? '\\left(\\dfrac{1}{2}\\right)^x' : '2^x') + '$ функцийн графикийн $x = ' + xs.join(';\\ ') + '$ утгад харгалзах цэгүүдийг байгуулаад ' + JOIN,
        h: 'Утгууд: ' + xs.map(function (x) { return '$(' + x + ';\\,' + dc(f(x)) + ')$'; }).join(', ') + '. График $Ox$ тэнхлэгийг огтлохгүй, $(0;\\,1)$ цэгийг дайрна.' });
    },
    log: function () {
      var half = Math.random() < 0.4, xs = [0.5, 1, 2, 4, 8], f = function (x) { return x > 0 ? (half ? -1 : 1) * Math.log(x) / Math.log(2) : NaN; };
      return curveTask({ f: f, need: xs, min: 5, v: half ? V(-1, 9, -4, 3, { sx: 0.5 }) : V(-1, 9, -3, 4, { sx: 0.5 }),
        t: '$y = \\log_{' + (half ? '\\frac{1}{2}' : '2') + '} x$ функцийн графикийн $x = \\dfrac{1}{2};\\ 1;\\ 2;\\ 4;\\ 8$ утгад харгалзах цэгүүдийг байгуулаад ' + JOIN,
        h: 'Утгууд: ' + xs.map(function (x) { return '$(' + dc(x) + ';\\,' + dc(f(x)) + ')$'; }).join(', ') + '. График $(1;\\,0)$ цэгийг дайрна.' });
    },
    absv: function () {
      var s = pick([1, -1]), h = ri(-2, 2), k = s > 0 ? ri(-4, 1) : ri(-1, 4), f = function (x) { return s * Math.abs(x - h) + k; };
      var inner = h === 0 ? 'x' : 'x ' + (h > 0 ? '- ' + h : '+ ' + (-h));
      return curveTask({ f: f, need: [h], side: { x: h, n: 1 }, v: L6, join: 'line',
        t: '$y = ' + (s < 0 ? '-' : '') + '|' + inner + '|' + (k ? (k > 0 ? ' + ' + k : ' - ' + (-k)) : '') + '$ функцийн графикийг байгуул: оройг нь, мөн хоёр талд тус бүр цэг тэмдэглээд ' + JOIN,
        h: 'Орой $(' + h + ';\\,' + k + ')$. $x = ' + (h - 2) + '$ ба $x = ' + (h + 2) + '$ үед $y = ' + (k + 2 * s) + '$.' });
    },
    inv: function () {
      var m, b, im, ib, L, G;
      do { m = pick([2, -2, 3, 1 / 2, -1 / 2, 1 / 3]); b = ri(-3, 3); im = 1 / m; ib = -b / m; L = lineTask(im, ib, L6); G = lineTask(m, b, L6); } while (!L || !G || near(m, 1) || (near(m, -1) && !b));
      return { t: '$y = ' + lin(m, b) + '$ функцийн урвуу функцийн графикийг байгуул.', v: L6, tools: ['point', 'line'],
        given: [{ t: 'line', a: G[0], b: G[1] }, { t: 'line', a: [-6, -6], b: [6, 6], dash: 1 }], ans: { k: 'lines', lines: [L] },
        h: '$x$ ба $y$-ийг сольж, $y$-ээр илэрхийлнэ: $y = ' + lin(im, ib) + '$. Урвуу функцийн график $y = x$ шулууны хувьд тэгш хэмтэй.' };
    },
    tangent: function () {
      var x0 = pick([-2, -1, 1, 2]), m = 2 * x0, b = -x0 * x0, v = V(-5, 5, -5, 9);
      return { t: '$y = x^2$ функцийн графикт абсцисс нь $x_0 = ' + x0 + '$ цэгт татсан шүргэгч шулууныг зур.', v: v, tools: ['point', 'line'],
        given: [{ t: 'fn', f: function (x) { return x * x; } }, { t: 'pt', p: [x0, x0 * x0], n: 'A' }], ans: { k: 'lines', lines: [lineTask(m, b, v)] },
        h: '$y\' = 2x$, $k = y\'(' + x0 + ') = ' + m + '$. Шүргэгч: $y = ' + m + '(x ' + (x0 > 0 ? '- ' + x0 : '+ ' + (-x0)) + ') + ' + (x0 * x0) + ' = ' + lin(m, b) + '$.' };
    },
    reflect6: function () { return reflect(['Ox', 'Oy']); },
    reflect10: function () { return reflect(['Ox', 'Oy', 'yx', 'O']); },
    translate: function () {
      var a, T;
      do { a = [ri(-4, 4), ri(-4, 4)]; } while (!a[0] && !a[1] || Math.abs(a[0]) + Math.abs(a[1]) < 3);
      T = triPts(L6, function (t) { return t.every(function (p) { return inV([p[0] + a[0], p[1] + a[1]], L6); }); });
      return imgTask(T, function (p) { return [p[0] + a[0], p[1] + a[1]]; }, '$\\vec{a} = (' + a[0] + ';\\,' + a[1] + ')$ вектороор зөөхөд гарах $A_1B_1C_1$ гурвалжныг байгуул.',
        'Зөөлт: $(x;\\,y) \\to (x ' + (a[0] < 0 ? '- ' + (-a[0]) : '+ ' + a[0]) + ';\\,y ' + (a[1] < 0 ? '- ' + (-a[1]) : '+ ' + a[1]) + ')$.');
    },
    rotate: function () {
      var cw = Math.random() < 0.5, rule = cw ? function (p) { return [p[1], -p[0]]; } : function (p) { return [-p[1], p[0]]; };
      var T = triPts(L6, function (t) { return t.every(function (p) { var q = rule(p); return inV(q, L6) && (p[0] || p[1]); }); });
      return imgTask(T, rule, '$O$ цэгийг тойруулан цагийн зүүний ' + (cw ? 'дагуу' : 'эсрэг') + ' $90^\\circ$ эргүүлэхэд гарах $A_1B_1C_1$ гурвалжныг байгуул.',
        'Цагийн зүүний ' + (cw ? 'дагуу' : 'эсрэг') + ' $90^\\circ$ эргүүлэлт: $(x;\\,y) \\to ' + (cw ? '(y;\\,-x)' : '(-y;\\,x)') + '$.');
    },
    vec: function () {
      var A, a, B;
      do { A = rp(L6); a = [ri(-4, 4), ri(-4, 4)]; B = [A[0] + a[0], A[1] + a[1]]; } while (!inV(B, L6) || Math.abs(a[0]) + Math.abs(a[1]) < 3);
      return { t: '$' + P('A', A) + '$ цэгээс эхэлсэн $\\vec{a} = (' + a[0] + ';\\,' + a[1] + ')$ векторыг байгуул.', v: L6, tools: ['point', 'vec'], names: ['A', 'B'],
        ans: { k: 'vecs', vecs: [[A, B]] }, h: 'Векторын төгсгөл: $(' + A[0] + ' + (' + a[0] + ');\\,' + A[1] + ' + (' + a[1] + ')) = (' + B[0] + ';\\,' + B[1] + ')$. «Вектор» хэрэгслээр эхлэл, дараа нь төгсгөл дээр дарна.' };
    },
    vsum: function () {
      var a, b, op, R;
      do {
        a = [ri(-4, 4), ri(-4, 4)]; b = [ri(-4, 4), ri(-4, 4)]; op = pick(['+', '-', '2a']);
        R = op === '+' ? [a[0] + b[0], a[1] + b[1]] : op === '-' ? [a[0] - b[0], a[1] - b[1]] : [2 * a[0], 2 * a[1]];
      } while (!inV(R, L6) || !inV(a, L6) || !inV(b, L6) || Math.abs(R[0]) + Math.abs(R[1]) < 2 || Math.abs(a[0]) + Math.abs(a[1]) < 2 || Math.abs(b[0]) + Math.abs(b[1]) < 2 || (a[0] * b[1] === a[1] * b[0]));
      var ex = op === '+' ? '\\vec{a} + \\vec{b}' : op === '-' ? '\\vec{a} - \\vec{b}' : '2\\vec{a}';
      return { t: '$\\vec{a} = (' + a[0] + ';\\,' + a[1] + ')$' + (op === '2a' ? '' : ', $\\vec{b} = (' + b[0] + ';\\,' + b[1] + ')$') + ' өгөгдөв. $O(0;\\,0)$ цэгээс эхэлсэн $' + ex + '$ векторыг байгуул.',
        v: L6, tools: ['point', 'vec'], given: [{ t: 'vec', a: [0, 0], b: a, n: 'a' }].concat(op === '2a' ? [] : [{ t: 'vec', a: [0, 0], b: b, n: 'b' }]),
        ans: { k: 'vecs', vecs: [[[0, 0], R]] }, h: 'Координатаар: $' + ex + ' = (' + R[0] + ';\\,' + R[1] + ')$. $O$ цэгээс $(' + R[0] + ';\\,' + R[1] + ')$ цэг хүртэл вектор зурна.' };
    },
    circTan: function () {
      var A = pick([[3, 4], [4, 3], [-3, 4], [-4, 3], [3, -4], [4, -3], [-3, -4], [-4, -3], [0, 5], [5, 0], [0, -5], [-5, 0]]), v = V(-8, 8, -8, 8);
      var g = gcd(A[0], A[1]), dr = [-A[1] / g, A[0] / g], B = [A[0] + dr[0], A[1] + dr[1]];
      if (!inV(B, v)) B = [A[0] - dr[0], A[1] - dr[1]];
      var kt = A[1] ? -A[0] / A[1] : null;
      return { t: '$O(0;\\,0)$ төвтэй, $5$ радиустай тойрог өгөгдөв. Тойргийг $' + P('A', A) + '$ цэгт шүргэх шулууныг зур.', v: v, tools: ['point', 'line'],
        given: [{ t: 'circle', c: [0, 0], r: 5 }, { t: 'pt', p: [0, 0], n: 'O' }, { t: 'pt', p: A, n: 'A' }], ans: { k: 'lines', lines: [[A, B]] },
        h: 'Шүргэгч нь шүргэлтийн цэгт татсан $OA$ радиуст перпендикуляр.' + (kt == null ? ' $OA$ хэвтээ тул шүргэгч босоо: $x = ' + A[0] + '$.' : A[0] === 0 ? ' $OA$ босоо тул шүргэгч хэвтээ: $y = ' + A[1] + '$.' :
          ' $OA$-ийн налалт $' + fr(A[1] / A[0]) + '$ тул шүргэгчийн налалт $' + fr(kt) + '$.') };
    },
    distTime: function () {
      var v1 = pick([40, 60, 80]), t1 = pick([1, 2]), st = 1, v2 = pick([20, 40, 60]), t2 = pick([1, 2]), back = Math.random() < 0.4, s1 = v1 * t1;
      if (back && v2 * t2 > s1) t2 = 1;
      if (back && v2 * t2 > s1) v2 = 20;
      var s2 = back ? s1 - v2 * t2 : s1 + v2 * t2, T = t1 + st + t2, top = Math.max(s1, s2);
      var pts = [[0, 0], [t1, s1], [t1 + st, s1], [T, s2]], y1 = Math.ceil(top / 20) * 20 + 20;
      return curveTask({ f: pw(pts), need: pts.map(function (p) { return p[0]; }), min: 4, join: 'line', v: V(0, T + 1, 0, y1, { xs: 0.5, sx: 0.5, ys: 20, lx: 2, xl: 't, цаг', yl: 'S, км' }),
        t: 'Машин $A$ хотоос гараад эхний $' + t1 + '$ цагт $' + v1 + '$ км/ц хурдтай явж, $' + st + '$ цаг зогсоод, дараагийн $' + t2 + '$ цагт $' + v2 + '$ км/ц хурдтай ' +
          (back ? '$A$ хот руу буцаж' : 'цааш') + ' явав. Машины $A$ хотоос холдох зай $S$ (км) хугацаа $t$ (цаг)-аас хамаарах графикийг байгуул: гол цэгүүдийг тэмдэглээд ' + JOIN,
        h: 'Гол цэгүүд: ' + pts.map(function (p) { return '$(' + p[0] + ';\\,' + p[1] + ')$'; }).join(', ') + '. Зогссон үед зай өөрчлөгдөхгүй — хэвтээ хэрчим.' });
    },
    lineGraph: function () {
      var ys = [], y = pick([10, 15, 20]);
      for (var i = 0; i < 6; i++) { ys.push(y); y = Math.max(5, Math.min(40, y + pick([-10, -5, 5, 10, 15]))); }
      var pts = ys.map(function (v, i) { return [i + 1, v]; });
      return curveTask({ f: pw(pts), need: [1, 2, 3, 4, 5, 6], min: 6, join: 'line', v: V(0, 7, 0, 45, { ys: 5, xl: 'өдөр', yl: 'хуудас' }),
        t: 'Сурагчийн долоо хоногийн эхний $6$ өдөр уншсан хуудасны тоог хүснэгтэд үзүүлэв. Шугаман график байгуул: цэгүүдийг тэмдэглээд ' + JOIN +
          tbl([1, 2, 3, 4, 5, 6], ys, 'Өдөр', 'Хуудас'),
        h: 'Өдөр бүрд нэг цэг: ' + pts.map(function (p) { return '$(' + p[0] + ';\\,' + p[1] + ')$'; }).join(', ') + '. Дараалсан цэгүүд шулуун хэсгээр холбогдоно.' });
    },
    cumFreq: function () {
      var fq = [], N = 0;
      for (var i = 0; i < 5; i++) { var f = ri(1, 6); fq.push(f); N += f; }
      var pts = [[0, 0]], c = 0;
      fq.forEach(function (f, i) { c += f; pts.push([(i + 1) * 10, c]); });
      return curveTask({ f: pw(pts), need: [0, 10, 20, 30, 40, 50], min: 6, join: 'line', v: V(0, 55, 0, Math.ceil(N / 2) * 2 + 2, { xs: 5, sx: 5, ys: 2, sy: 1, lx: 2, xl: 'оноо', yl: 'F' }),
        t: 'Сурагчдын тестийн оноог давтамжийн хүснэгтэд үзүүлэв. Хуримтлагдсан давтамжийн графикийг байгуул: $(0;\\,0)$ цэгээс эхлээд завсар бүрийн баруун хил дээр хуримтлагдсан давтамжийн цэгийг тэмдэглээд ' + JOIN +
          tbl(['0\\text{–}10', '10\\text{–}20', '20\\text{–}30', '30\\text{–}40', '40\\text{–}50'], fq, 'Оноо', 'Давтамж'),
        h: 'Хуримтлагдсан давтамж: ' + pts.map(function (p) { return '$(' + p[0] + ';\\,' + p[1] + ')$'; }).join(', ') + '.' });
    },
    scatter: function () {
      var xs = shuffle([1, 2, 3, 4, 5, 6, 7, 8]).slice(0, 6).sort(function (a, b) { return a - b; });
      var ps = xs.map(function (x) { return [x, Math.max(1, Math.min(10, x + ri(0, 3)))]; });
      return { t: 'Сурагчдын долоо хоногт хичээл давтсан цаг ($x$) ба шалгалтын оноо ($y$)-г хүснэгтэд үзүүлэв. Цэгэн диаграмм байгуул.' +
          tbl(ps.map(function (p) { return p[0]; }), ps.map(function (p) { return p[1]; }), 'x', 'y'),
        v: V(0, 9, 0, 11, { xl: 'x, цаг', yl: 'y, оноо' }), tools: ['point'], ans: { k: 'points', pts: ps },
        h: 'Хос бүр нэг цэг: ' + ps.map(function (p) { return '$(' + p[0] + ';\\,' + p[1] + ')$'; }).join(', ') + '.' };
    },
    trig: function () {
      var A = pick([1, 2, 3]), cos = Math.random() < 0.5, f = function (u) { return A * (cos ? Math.cos(u * Math.PI / 2) : Math.sin(u * Math.PI / 2)); };
      var vals = [0, 1, 2, 3, 4].map(function (u) { return dc(f(u)); });
      return curveTask({ f: f, need: [0, 1, 2, 3, 4], min: 5, v: V(0, 4, -3, 3, { xs: 0.5, sx: 1, xf: 'pi2' }),
        t: '$y = ' + (A === 1 ? '' : A) + (cos ? '\\cos' : '\\sin') + ' x$ функцийн графикийг $[0;\\,2\\pi]$ завсарт $x = 0;\\ \\dfrac{\\pi}{2};\\ \\pi;\\ \\dfrac{3\\pi}{2};\\ 2\\pi$ цэгүүдээр байгуулаад ' + JOIN,
        h: 'Эдгээр цэгт $y = ' + vals.join(';\\ ') + '$.' });
    },
    rational: function () {
      var h = ri(-1, 1), k = ri(-1, 1), xs = [h - 4, h - 2, h - 1, h + 1, h + 2, h + 4], f = function (x) { return 4 / (x - h) + k; };
      var den = h === 0 ? 'x' : 'x ' + (h > 0 ? '- ' + h : '+ ' + (-h));
      return curveTask({ f: f, need: xs, br: [h], min: 6, v: L6,
        t: '$y = \\dfrac{4}{' + den + '}' + (k ? (k > 0 ? ' + ' + k : ' - ' + (-k)) : '') + '$ функцийн графикийн $x = ' + xs.join(';\\ ') + '$ утгад харгалзах цэгүүдийг байгуулаад ' + JOIN + ' Салаа бүрийг тусад нь холбоно.',
        h: 'Утгууд: ' + xs.map(function (x) { return '$(' + x + ';\\,' + dc(f(x)) + ')$'; }).join(', ') + '. $x = ' + h + '$ үед функц тодорхойлогдохгүй тул график хоёр салаатай.' });
    }
  };
  // Сэдэв (node id) → генераторууд. Хичээл бүрт эндээс 2-ыг санамсаргүй сонгоно.
  var NODES = {
    // 6-р анги
    '324': ['direct', 'direct'], '333': ['table', 'table'], '334': ['pts', 'pts'], '335': ['lineAB', 'axisPar'], '336': ['seg', 'lineAB', 'ray', 'tri'],
    '337': ['axisPar', 'parallel', 'perp'], '349': ['reflect6', 'reflect6'], '363': ['lineGraph', 'scatter'],
    // 7-р анги
    '720': ['direct', 'direct'], '729': ['general', 'linear', 'lineAB'], '730': ['linear', 'linear', 'slopeInt'], '738': ['mid', 'mid'], '758': ['lineGraph', 'lineGraph'],
    // 8-р анги
    '510': ['hyper', 'hyper'], '521': ['system', 'system'], '526': ['linear', 'general'], '527': ['slopePt', 'slopeInt'], '528': ['system', 'system'], '529': ['hyper', 'hyper'],
    '530': ['axSq', 'axSq'], '531': ['linear', 'hyper', 'axSq'], '535': ['circTan', 'circTan'], '548': ['distTime', 'distTime'], '557': ['lineGraph', 'scatter'],
    // 9-р анги
    '52': ['linear', 'linear', 'general'], '53': ['system', 'system'], '54': ['quad', 'axSq'], '55': ['quad', 'quad'], '57': ['inv', 'inv'], '58': ['slopePt', 'slopeInt', 'parallel', 'perp'],
    // 10-р анги
    '413': ['pts', 'seg'], '414': ['slopePt', 'slopeInt'], '415': ['lineAB', 'general', 'parallel', 'perp'], '417': ['pts', 'lineAB', 'mid', 'slopePt'],
    '418': ['absv', 'absv'], '419': ['quad', 'quad'], '420': ['hyper', 'hyper'], '421': ['axSq', 'cubic'], '422': ['exp', 'exp'], '423': ['tangent', 'tangent'],
    '424': ['linear', 'quad', 'hyper', 'exp'], '441': ['vec', 'vec'], '442': ['vsum', 'vsum'], '452': ['translate', 'rotate'], '454': ['reflect10', 'reflect10'],
    '462': ['cumFreq', 'cumFreq'], '463': ['scatter', 'scatter'],
    // 12-р анги
    '611': ['log', 'log'], '613': ['rational', 'rational'], '614': ['trig', 'trig']
  };
  function make(name) {
    var G = GEN[name] && GEN[name]();
    if (!G) return null;
    return { id: null, q: G.t, options: [], correct: -1, hint: { text: G.h }, type: 'graph', correctAnswer: '', image: null, answer_template: null,
      time_limit: null, difficulty: 'medium', cmg: name, graph: { v: G.v, tools: G.tools, given: G.given || [], ans: G.ans, names: G.names || null } };
  }
  function inject(L, id) {
    var fam = NODES[String(id)];
    if (!fam || !L || !Array.isArray(L.questions) || !L.questions.length) return;
    var pool = shuffle(fam.slice()), out = [], n = L.questions.length;
    for (var i = 0; i < pool.length && out.length < 2; i++) { try { var q = make(pool[i]); if (q) out.push(q); } catch (e) {} }
    out.forEach(function (q, k) { L.questions.splice(Math.min(L.questions.length, Math.round(n * (k + 1) / (out.length + 1)) + k), 0, q); });
  }

  /* ════════ Шалгалт ════════ */
  function samePt(a, b) { return near(a[0], b[0]) && near(a[1], b[1]); }
  function onLn(p, a, b) { var dx = b[0] - a[0], dy = b[1] - a[1]; return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) < 1e-6 * (1 + Math.abs(dx) + Math.abs(dy)); }
  var SAME = {
    seg: function (s, w) { return (samePt(s[0], w[0]) && samePt(s[1], w[1])) || (samePt(s[0], w[1]) && samePt(s[1], w[0])); },
    line: function (s, w) { return onLn(w[0], s[0], s[1]) && onLn(w[1], s[0], s[1]); },
    ray: function (s, w) { return samePt(s[0], w[0]) && onLn(w[1], s[0], s[1]) && ((s[1][0] - s[0][0]) * (w[1][0] - w[0][0]) + (s[1][1] - s[0][1]) * (w[1][1] - w[0][1])) > 0; },
    vec: function (s, w) { return samePt(s[0], w[0]) && samePt(s[1], w[1]); }
  };
  var NOUN = { seg: 'хэрчим', line: 'шулуун', ray: 'цацраг', vec: 'вектор' };
  // S: { pts:[{id,x,y}], objs:[{id,t,a:[x,y],b:[x,y]}] } → { ok, msg, good:{id:1} }
  function evaluate(A, S) {
    var good = {}, ok = false, msg = '', O = S.objs;
    function xy(p) { return [p.x, p.y]; }
    if (A.k === 'points') {
      var miss = A.pts.filter(function (n) { return !S.pts.some(function (h) { return samePt(xy(h), n); }); });
      var extra = S.pts.filter(function (h) { var g = A.pts.some(function (n) { return samePt(xy(h), n); }); if (g) good[h.id] = 1; return !g; });
      ok = !miss.length && !extra.length && !O.length;
      msg = ok ? 'Бүх цэг зөв байрласан.' : miss.length ? (miss.length === A.pts.length ? 'Цэгүүд буруу байрласан.' : miss.length + ' цэг дутуу эсвэл буруу байрласан.') :
        extra.length ? 'Илүү цэг тавьсан байна.' : 'Энд зөвхөн цэг тавина.';
    } else if (A.k === 'curve') {
      var f = A.fn, br = A.br || [];
      var on = S.pts.filter(function (q) { var y = f(q.x); return isFinite(y) && Math.abs(y - q.y) < 1e-6; });
      var off = S.pts.length - on.length;
      on.forEach(function (q) { good[q.id] = 1; });
      on.sort(function (a, b) { return a.x - b.x; });
      var xs = on.map(function (q) { return q.x; });
      var needOk = (A.need || []).every(function (x) { return xs.some(function (v) { return near(v, x); }); });
      var sideOk = !A.side || (xs.filter(function (x) { return x < A.side.x - 1e-9; }).length >= A.side.n && xs.filter(function (x) { return x > A.side.x + 1e-9; }).length >= A.side.n);
      // Сурагч аль цэгийг ямар дарааллаар холбохоо өөрөө сонгоно («Цэгүүдийг холбох» → муруй crv). Зөв график: салаа бүр дотор
      // x-ээр зэргэлдээ цэг бүр холбогдсон, өөр холболтгүй (цэг алгасах, буцах, салаа хооронд холбох нь буруу).
      var C = O.filter(function (o) { return o.t === 'crv'; }), other = O.length - C.length, req = [], got = [];
      for (var i = 0; i + 1 < on.length; i++) {
        var a = on[i], b = on[i + 1];
        if (!near(a.x, b.x) && !br.some(function (x0) { return a.x < x0 && b.x > x0; })) req.push([xy(a), xy(b)]);
      }
      C.forEach(function (o) { for (var j = 0; j + 1 < o.ps.length; j++) got.push([o.ps[j], o.ps[j + 1]]); });
      var miss = req.filter(function (r) { return !got.some(function (g) { return SAME.seg(g, r); }); }).length;
      var extra = got.filter(function (g) { return !req.some(function (r) { return SAME.seg(g, r); }); }).length;
      ok = !off && needOk && sideOk && on.length >= (A.min || 2) && C.length > 0 && !miss && !extra && !other;
      if (ok) C.forEach(function (o) { good[o.id] = 1; });
      msg = ok ? 'График зөв байгуулагдсан.' : off ? off + ' цэг функцийн график дээр оршихгүй байна.' : !needOk ? 'Шаардлагатай цэг дутуу байна.' :
        !sideOk ? 'Оройн хоёр талд тус бүр дор хаяж ' + A.side.n + ' цэг хэрэгтэй.' : on.length < (A.min || 2) ? 'Цэг дутуу байна.' :
        !C.length ? 'Цэгүүдээ «Цэгүүдийг холбох» хэрэгслээр сонгож холбоно уу.' :
        extra ? 'Цэгүүдийг $x$-ийн дарааллаар, алгасалгүй холбоно уу' + (br.length ? '; салаануудыг хооронд нь холбохгүй.' : '.') :
        miss ? 'Зарим зэргэлдээ цэг холбогдоогүй байна.' : 'Илүүдэл зураас байна.';
    } else {
      var T = { segs: 'seg', lines: 'line', rays: 'ray', vecs: 'vec' }[A.k], want = A[A.k], mine = O.filter(function (o) { return o.t === T; }), other = O.length - mine.length, use = {}, hit = 0;
      want.forEach(function (w) {
        var m = mine.filter(function (o) { return !use[o.id] && SAME[T]([o.a, o.b], w); })[0];
        if (m) { use[m.id] = 1; good[m.id] = 1; hit++; }
      });
      var extraO = mine.filter(function (o) { return !use[o.id]; }).length, markOk = true;
      if (A.mark) { var mp = S.pts.filter(function (q) { return samePt(xy(q), A.mark); })[0]; markOk = !!mp; if (mp) good[mp.id] = 1; }
      O.forEach(function (o) { if (good[o.id]) S.pts.forEach(function (q) { if (samePt(xy(q), o.a) || samePt(xy(q), o.b)) good[q.id] = 1; }); });
      ok = hit === want.length && !extraO && !other && markOk;
      var nn = NOUN[T];
      msg = ok ? 'Зөв байгуулсан.' : other && !hit ? 'Энд ' + nn + ' зурах хэрэгтэй.' : hit < want.length ? (want.length > 1 ? (want.length - hit) + ' ' + nn + ' буруу эсвэл дутуу.' : nn.charAt(0).toUpperCase() + nn.slice(1) + ' буруу байна.') :
        extraO || other ? 'Илүүдэл зураас байна.' : 'Огтлолцлын цэгийг «Цэг» хэрэгслээр тэмдэглээгүй байна.';
    }
    return { ok: ok, msg: msg, good: good };
  }
  function solItems(A) {
    var out = [];
    if (A.k === 'points') A.pts.forEach(function (p) { out.push({ t: 'pt', p: p }); });
    else if (A.k === 'curve') {
      out.push({ t: 'fn', f: A.fn, br: A.br });
      (A.need || []).forEach(function (x) { out.push({ t: 'pt', p: [x, A.fn(x)] }); });
    } else {
      var T = { segs: 'seg', lines: 'line', rays: 'ray', vecs: 'vec' }[A.k];
      A[A.k].forEach(function (w) { out.push({ t: T, a: w[0], b: w[1] }); });
      if (A.mark) out.push({ t: 'pt', p: A.mark });
    }
    return out;
  }

  /* ════════ Зураг (SVG мөр) ════════ */
  function r1(v) { return Math.round(v * 10) / 10; }
  function geo(v, W) {
    var nx = Math.round((v.x1 - v.x0) / v.xs), ny = Math.round((v.y1 - v.y0) / v.ys);
    var lab = Math.max(String(mn(v.y0)).length, String(mn(v.y1)).length), padL = v.x0 < 0 ? 14 : Math.max(22, 10 + lab * 7), padR = 18, padT = 18, padB = v.y0 < 0 ? 14 : 24;
    var s = Math.max(14, Math.min(48, (W - padL - padR) / nx));
    if (ny * s + padT + padB > 560) s = Math.max(12, (560 - padT - padB) / ny);
    var g = { v: v, s: s, nx: nx, ny: ny, padL: padL, padT: padT, W: r1(nx * s + padL + padR), H: r1(ny * s + padT + padB) };
    g.X = function (x) { return r1(padL + (x - v.x0) / v.xs * s); };
    g.Y = function (y) { return r1(padT + (v.y1 - y) / v.ys * s); };
    g.wx = function (px) { return v.x0 + (px - padL) / s * v.xs; };
    g.wy = function (py) { return v.y1 - (py - padT) / s * v.ys; };
    return g;
  }
  function xlab(v, x) {
    if (v.xf !== 'pi2') return mn(x);
    var k = Math.round(x * 2);   // x нь π/2-ын нэгжээр
    if (k % 2) return '';
    var n = k / 2;
    return n === 1 ? 'π/2' : n === 2 ? 'π' : n === 3 ? '3π/2' : n === 4 ? '2π' : mn(n) + 'π/2';
  }
  function arrowHead(x, y, deg, cls) { return '<path d="M0,0 L-9,-4.5 L-9,4.5 Z" class="' + cls + '" transform="translate(' + x + ',' + y + ') rotate(' + deg + ')"/>'; }
  function gridSvg(g, cid) {
    var v = g.v, h = '', i, x, y, xr = g.padL + g.nx * g.s, yb = g.padT + g.ny * g.s;
    h += '<defs><clipPath id="' + cid + '"><rect x="' + g.padL + '" y="' + g.padT + '" width="' + r1(g.nx * g.s) + '" height="' + r1(g.ny * g.s) + '"/></clipPath></defs>';
    h += '<rect x="0" y="0" width="' + g.W + '" height="' + g.H + '" class="bg"/>';
    for (i = 0; i <= g.nx; i++) { x = r1(g.padL + i * g.s); h += '<line x1="' + x + '" y1="' + g.padT + '" x2="' + x + '" y2="' + r1(yb) + '" class="gl"/>'; }
    for (i = 0; i <= g.ny; i++) { y = r1(g.padT + i * g.s); h += '<line x1="' + g.padL + '" y1="' + y + '" x2="' + r1(xr) + '" y2="' + y + '" class="gl"/>'; }
    var ax = v.x0 <= 0 && v.x1 >= 0 ? 0 : v.x0, ay = v.y0 <= 0 && v.y1 >= 0 ? 0 : v.y0, X0 = g.X(ax), Y0 = g.Y(ay);
    h += '<line x1="' + g.padL + '" y1="' + Y0 + '" x2="' + r1(xr + 9) + '" y2="' + Y0 + '" class="ax"/>' + arrowHead(r1(xr + 13), Y0, 0, 'ah');
    h += '<line x1="' + X0 + '" y1="' + r1(yb) + '" x2="' + X0 + '" y2="' + (g.padT - 9) + '" class="ax"/>' + arrowHead(X0, g.padT - 13, -90, 'ah');
    var kx = v.lx || (g.s < 22 ? 2 : 1), ky = v.ly || (g.s < 22 ? 2 : 1);
    for (i = 0; i <= g.nx; i++) {
      var xv = v.x0 + i * v.xs, xi = Math.round(xv / v.xs);
      if (near(xv, ax) || xi % kx) continue;
      var t = xlab(v, xv); if (t) h += '<text x="' + g.X(xv) + '" y="' + r1(Y0 + 14) + '" class="tk" text-anchor="middle">' + t + '</text>';
    }
    for (i = 0; i <= g.ny; i++) {
      var yv = v.y0 + i * v.ys, yi = Math.round(yv / v.ys);
      if (near(yv, ay) || yi % ky) continue;
      h += '<text x="' + r1(X0 - 5) + '" y="' + r1(g.Y(yv) + 4) + '" class="tk" text-anchor="end">' + mn(yv) + '</text>';
    }
    h += '<text x="' + r1(X0 - 5) + '" y="' + r1(Y0 + 14) + '" class="tk" text-anchor="end">' + (ax === 0 && ay === 0 ? 'O' : '') + '</text>';
    h += '<text x="' + r1(xr + 4) + '" y="' + r1(Y0 - 8) + '" class="al" text-anchor="end">' + esc(v.xl) + '</text>';
    h += '<text x="' + r1(X0 + 8) + '" y="' + (g.padT + 2) + '" class="al">' + esc(v.yl) + '</text>';
    return h;
  }
  // Шулууныг хавтгайн хүрээгээр тайрна (t0 = 0 бол цацраг)
  function clipLine(g, a, b, ray) {
    var v = g.v, dx = b[0] - a[0], dy = b[1] - a[1], t0 = ray ? 0 : -1e9, t1 = 1e9;
    [[dx, a[0], v.x0, v.x1], [dy, a[1], v.y0, v.y1]].forEach(function (c) {
      if (Math.abs(c[0]) < 1e-12) { if (c[1] < c[2] || c[1] > c[3]) { t0 = 1; t1 = 0; } return; }
      var u = (c[2] - c[1]) / c[0], w = (c[3] - c[1]) / c[0];
      t0 = Math.max(t0, Math.min(u, w)); t1 = Math.min(t1, Math.max(u, w));
    });
    if (t0 > t1) return null;
    return [[a[0] + dx * t0, a[1] + dy * t0], [a[0] + dx * t1, a[1] + dy * t1]];
  }
  function lbl(g, p, n, dx, dy) {
    if (!n) return '';
    var t = String(n).replace(/_(\d)/, function (m, k) { return '₀₁₂₃₄₅₆₇₈₉'.charAt(+k); });
    return '<text x="' + r1(g.X(p[0]) + (dx || 7)) + '" y="' + r1(g.Y(p[1]) - (dy || 7)) + '" class="pl">' + esc(t) + '</text>';
  }
  function item(g, it, cls) {
    var v = g.v, h = '', L;
    if (it.t === 'pt') return '<circle cx="' + g.X(it.p[0]) + '" cy="' + g.Y(it.p[1]) + '" r="' + (cls === 'sol' ? 8 : 5.5) + '" class="' + cls + ' pt"/>' + lbl(g, it.p, it.n);
    if (it.t === 'seg' || it.t === 'vec') {
      h = '<line x1="' + g.X(it.a[0]) + '" y1="' + g.Y(it.a[1]) + '" x2="' + g.X(it.b[0]) + '" y2="' + g.Y(it.b[1]) + '" class="' + cls + ' ln"/>';
      if (it.t === 'vec') {
        var ang = Math.atan2(g.Y(it.b[1]) - g.Y(it.a[1]), g.X(it.b[0]) - g.X(it.a[0])) * 180 / Math.PI;
        h += arrowHead(g.X(it.b[0]), g.Y(it.b[1]), r1(ang), cls + ' vh');
        if (it.n) h += '<text x="' + r1((g.X(it.a[0]) + g.X(it.b[0])) / 2 + 6) + '" y="' + r1((g.Y(it.a[1]) + g.Y(it.b[1])) / 2 - 6) + '" class="pl vn">' + esc(it.n) + '</text>';
      }
      return h;
    }
    if (it.t === 'line' || it.t === 'ray') {
      L = clipLine(g, it.a, it.b, it.t === 'ray'); if (!L) return '';
      return '<line x1="' + g.X(L[0][0]) + '" y1="' + g.Y(L[0][1]) + '" x2="' + g.X(L[1][0]) + '" y2="' + g.Y(L[1][1]) + '" class="' + cls + ' ln' + (it.dash ? ' dash' : '') + '"/>';
    }
    if (it.t === 'poly') {
      h = '<polygon points="' + it.pts.map(function (p) { return g.X(p[0]) + ',' + g.Y(p[1]); }).join(' ') + '" class="' + cls + ' pg"/>';
      it.pts.forEach(function (p, i) { h += '<circle cx="' + g.X(p[0]) + '" cy="' + g.Y(p[1]) + '" r="4.5" class="' + cls + ' pt"/>' + lbl(g, p, it.ns && it.ns[i]); });
      return h;
    }
    if (it.t === 'circle') return '<circle cx="' + g.X(it.c[0]) + '" cy="' + g.Y(it.c[1]) + '" r="' + r1(it.r / v.xs * g.s) + '" class="' + cls + ' ci"/>';
    if (it.t === 'fn') {
      var f = it.f, dd = '', pen = false, prev = null;
      if (f.pts) return '<polyline points="' + f.pts.map(function (p) { return g.X(p[0]) + ',' + g.Y(p[1]); }).join(' ') + '" class="' + cls + ' fn ' + (it.c || '') + '"/>';
      var span = v.y1 - v.y0, py = null;
      for (var i = 0; i <= 360; i++) {
        var x = v.x0 + (v.x1 - v.x0) * i / 360, y = f(x);
        var brk = prev != null && (it.br || []).some(function (b) { return prev < b && x >= b; });
        if (!isFinite(y) || brk || Math.abs(y) > 1e4) { pen = false; prev = x; continue; }
        if (pen && Math.abs(y - py) > span * 1.5) pen = false;   // асимптотын үсрэлтийг холбохгүй
        dd += (pen ? 'L' : 'M') + g.X(x) + ',' + g.Y(Math.max(v.y0 - span, Math.min(v.y1 + span, y)));
        pen = true; prev = x; py = y;
      }
      return dd ? '<path d="' + dd + '" class="' + cls + ' fn ' + (it.c || '') + '"/>' : '';
    }
    return '';
  }
  /* «Цэгүүдийг холбох»: сурагчийн цэгүүдийг x-ээр эрэмбэлж, тодорхойлогдохгүй цэг (br) дээр салаалаад холбоно.
     smooth — clamped кубын сплайн (төгсгөлийн уламжлалыг гурван цэгийн параболоор; квадрат функцийг яг давтана, жигд бус
     алхамтай гипербол/логарифмд долгион гаргахгүй), дараа нь Fritsch–Carlson-оор хэлбэлзлийг хязгаарлана;
     line — шулуун хэсгүүд (|x|, зам-хугацаа, өгөгдлийн график). */
  function slopes(P) {
    var n = P.length, h = [], dl = [], m = [], i;
    for (i = 0; i + 1 < n; i++) { h[i] = P[i + 1][0] - P[i][0]; dl[i] = (P[i + 1][1] - P[i][1]) / h[i]; }
    m[0] = n > 2 ? dl[0] - h[0] * (dl[1] - dl[0]) / (h[0] + h[1]) : dl[0];
    m[n - 1] = n > 2 ? dl[n - 2] + h[n - 2] * (dl[n - 2] - dl[n - 3]) / (h[n - 3] + h[n - 2]) : dl[n - 2];
    if (n > 2) {   // дотоод цэгүүд: h_i·m_{i-1} + 2(h_{i-1}+h_i)·m_i + h_{i-1}·m_{i+1} = 3(h_i·d_{i-1} + h_{i-1}·d_i) — Томасын алгоритм
      var cp = [], rp = [];
      for (i = 1; i < n - 1; i++) {
        var a = h[i], b = 2 * (h[i - 1] + h[i]), c = h[i - 1], r = 3 * (h[i] * dl[i - 1] + h[i - 1] * dl[i]);
        if (i === 1) r -= a * m[0];
        if (i === n - 2) r -= c * m[n - 1];
        var den = b - (i > 1 ? a * cp[i - 1] : 0);
        cp[i] = c / den; rp[i] = (r - (i > 1 ? a * rp[i - 1] : 0)) / den;
      }
      for (i = n - 2; i >= 1; i--) m[i] = rp[i] - (i < n - 2 ? cp[i] * m[i + 1] : 0);
    }
    for (i = 0; i + 1 < n; i++) {
      if (!dl[i]) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / dl[i], b = m[i + 1] / dl[i];
      if (a < 0) { m[i] = 0; a = 0; }
      if (b < 0) { m[i + 1] = 0; b = 0; }
      var s = a * a + b * b;
      if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * dl[i]; m[i + 1] = t * b * dl[i]; }
    }
    return m;
  }
  // Сонгосон дарааллаар холбох: x нь нэг чиглэлд өсөх/буурах бол y = f(x) сплайн (параболыг яг давтана),
  // үгүй бол (сурагч эргэлдүүлж сонгосон) хавтгайн Catmull–Rom муруй — ямар ч байсан ЯГ сонгосон дарааллаар.
  function chainPath(g, P, mode) {
    if (P.length < 2) return '';
    var d = 'M' + g.X(P[0][0]) + ',' + g.Y(P[0][1]), i;
    if (mode === 'line' || P.length === 2) { for (i = 1; i < P.length; i++) d += 'L' + g.X(P[i][0]) + ',' + g.Y(P[i][1]); return d; }
    var inc = true, dec = true;
    for (i = 1; i < P.length; i++) { if (!(P[i][0] > P[i - 1][0] + 1e-9)) inc = false; if (!(P[i][0] < P[i - 1][0] - 1e-9)) dec = false; }
    if (inc || dec) {
      var Q = inc ? P : P.slice().reverse(), m = slopes(Q), seg = [];
      for (i = 0; i + 1 < Q.length; i++) {
        var a = Q[i], b = Q[i + 1], h = b[0] - a[0];
        seg.push([[g.X(a[0]), g.Y(a[1])], [g.X(a[0] + h / 3), g.Y(a[1] + m[i] * h / 3)], [g.X(b[0] - h / 3), g.Y(b[1] - m[i + 1] * h / 3)], [g.X(b[0]), g.Y(b[1])]]);
      }
      if (dec) seg = seg.reverse().map(function (s) { return s.slice().reverse(); });
      seg.forEach(function (s) { d += 'C' + s[1].join(',') + ' ' + s[2].join(',') + ' ' + s[3].join(','); });
      return d;
    }
    var px = P.map(function (p) { return [g.X(p[0]), g.Y(p[1])]; });
    for (i = 0; i + 1 < px.length; i++) {
      var p0 = px[Math.max(0, i - 1)], p1 = px[i], p2 = px[i + 1], p3 = px[Math.min(px.length - 1, i + 2)];
      d += 'C' + r1(p1[0] + (p2[0] - p0[0]) / 6) + ',' + r1(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + r1(p2[0] - (p3[0] - p1[0]) / 6) + ',' + r1(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + p2[0] + ',' + p2[1];
    }
    return d;
  }
  function staticSvg(v, items, W) {
    var g = geo(v, W || 440), cid = 'cmgc' + (++UID), h = gridSvg(g, cid) + '<g clip-path="url(#' + cid + ')">';
    items.forEach(function (it) { if (it.t !== 'pt') h += item(g, it, it.cls || 'gv'); });
    h += '</g>';
    items.forEach(function (it) { if (it.t === 'pt') h += item(g, it, it.cls || 'gv'); });
    return '<svg class="cmg-svg" viewBox="0 0 ' + g.W + ' ' + g.H + '" role="img" aria-label="Функцийн график">' + h + '</svg>';
  }

  /* ════════ Самбар ════════ */
  function S(p) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>'; }
  var TOOL = {
    point: ['Цэг', S('<circle cx="12" cy="12" r="4.5" fill="currentColor" stroke="none"/>'), 'Торны цэг дээр дарж цэг тавина. Цэгийг чирж зөөнө.'],
    seg: ['Хэрчим', S('<path d="M5 18 19 6"/><circle cx="5" cy="18" r="2.4" fill="currentColor"/><circle cx="19" cy="6" r="2.4" fill="currentColor"/>'), 'Хоёр цэг дээр дараалан дарж хэрчим зурна.'],
    line: ['Шулуун', S('<path d="M2 21 22 3"/><circle cx="8" cy="15.6" r="2.3" fill="currentColor"/><circle cx="16" cy="8.4" r="2.3" fill="currentColor"/>'), 'Хоёр цэг дээр дараалан дарж шулуун татна.'],
    ray: ['Цацраг', S('<path d="M5 18 22 4"/><circle cx="5" cy="18" r="2.6" fill="currentColor"/>'), 'Эхлэл цэг, дараа нь дайрах цэг дээр дарна.'],
    vec: ['Вектор', S('<path d="M5 19 18 6"/><path d="M10 6h8v8"/>'), 'Эхлэл цэг, дараа нь төгсгөлийн цэг дээр дарна.'],
    join: ['Цэгүүдийг холбох', S('<path d="M3 18c3-9 6-12 9-12s6 3 9 12"/><circle cx="3" cy="18" r="1.8" fill="currentColor"/><circle cx="12" cy="6" r="1.8" fill="currentColor"/><circle cx="21" cy="18" r="1.8" fill="currentColor"/>'),
      'Холбох цэгүүдээ дарааллаар нь сонгоно. Дуусгахдаа сүүлийн цэг дээрээ дахин дарна.'],
    erase: ['Устгах', S('<path d="m7 20-4-4 10-10 7 7-7 7"/><path d="M7 20h13"/><path d="m8 11 6 6"/>'), 'Устгах цэг эсвэл зураас дээр дарна.']
  };
  var ICU = S('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'), ICC = S('<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>'),
    ICE = S('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>');
  var B = null;   // одоогийн самбар

  function Board(host, G) {
    var me = this;
    this.host = host; this.G = G; this.v = G.v; this.pts = []; this.objs = []; this.hist = []; this.uid = 0; this.cid = 'cmgb' + (++UID);
    this.pend = null; this.sel = null; this.lock = false; this.res = null; this.showSol = false; this.drag = null; this.chain = null;
    var tools = G.tools.concat(['erase']);
    this.tool = G.tools.filter(function (t) { return t !== 'point' && t !== 'join'; })[0] || 'point';
    host.classList.add('cmg');
    host.innerHTML = '<div class="cmg-tools" role="toolbar" aria-label="Зурах хэрэгсэл">' + tools.map(function (k) {
      return '<button type="button" data-tool="' + k + '" aria-pressed="false" title="' + TOOL[k][2] + '">' + TOOL[k][1] + '<span>' + TOOL[k][0] + '</span></button>';
    }).join('') +
      '<i class="sp"></i><button type="button" class="ic" data-act="undo" title="Буцаах" aria-label="Буцаах">' + ICU + '</button>' +
      '<button type="button" class="ic" data-act="clear" title="Цэвэрлэх" aria-label="Цэвэрлэх">' + ICC + '</button></div>' +
      '<div class="cmg-stage"><svg class="cmg-svg" role="application" aria-label="Координатын хавтгай"></svg></div>' +
      '<div class="cmg-foot"><span class="cmg-tip"></span><span class="cmg-list"></span></div><div class="cmg-res" hidden></div>';
    this.stage = host.querySelector('.cmg-stage'); this.svg = host.querySelector('.cmg-svg');
    this.tipEl = host.querySelector('.cmg-tip'); this.listEl = host.querySelector('.cmg-list'); this.resEl = host.querySelector('.cmg-res');
    host.querySelector('.cmg-tools').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || me.lock) return;
      if (b.getAttribute('data-tool')) me.setTool(b.getAttribute('data-tool'));
      else if (b.getAttribute('data-act') === 'undo') me.undo();
      else if (b.getAttribute('data-act') === 'clear') me.clear();
    });
    this.resEl.addEventListener('click', function (e) { if (e.target.closest('[data-sol]')) { me.showSol = !me.showSol; me.draw(); me.renderRes(); } });
    var sv = this.svg;
    sv.addEventListener('pointerdown', function (e) { me.down(e); });
    sv.addEventListener('pointermove', function (e) { me.move(e); });
    sv.addEventListener('pointerup', function (e) { me.up(e); });
    sv.addEventListener('pointercancel', function () { me.drag = null; });
    sv.addEventListener('pointerleave', function () { if (me.hov) me.hov.innerHTML = ''; });
    this.layout(); this.setTool(this.tool);
    if (window.ResizeObserver) {
      this.ro = new ResizeObserver(function () { if (!me.host.isConnected) { me.ro.disconnect(); return; } if (me.layout()) me.draw(); });
      this.ro.observe(this.stage);
    }
  }
  Board.prototype.layout = function () {
    var w = Math.round(this.stage.clientWidth || 0) || 360;
    if (this.g && Math.abs(w - this.w) < 4) return false;
    this.w = w; this.g = geo(this.v, w);
    this.svg.setAttribute('viewBox', '0 0 ' + this.g.W + ' ' + this.g.H);
    return true;
  };
  Board.prototype.setTool = function (t) {
    this.tool = t; this.pend = null; this.chain = null;
    [].forEach.call(this.host.querySelectorAll('[data-tool]'), function (b) { var on = b.getAttribute('data-tool') === t; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    this.draw();
  };
  Board.prototype.byId = function (id) { for (var i = 0; i < this.pts.length; i++) if (this.pts[i].id === id) return this.pts[i]; return null; };
  Board.prototype.ptAt = function (x, y) { for (var i = 0; i < this.pts.length; i++) if (near(this.pts[i].x, x) && near(this.pts[i].y, y)) return this.pts[i]; return null; };
  Board.prototype.name = function () {
    var used = {}, giv = (this.G.given || []);
    this.pts.forEach(function (p) { used[p.n] = 1; });
    giv.forEach(function (it) { if (it.n) used[it.n] = 1; (it.ns || []).forEach(function (n) { used[n] = 1; }); });
    var pref = this.G.names || [];
    for (var i = 0; i < pref.length; i++) if (!used[pref[i]]) return pref[i];
    var L = 'ABCDEFGHKLMNPQRSTUVWXYZ';
    for (var j = 0; j < L.length; j++) if (!used[L[j]]) return L[j];
    return 'P' + (this.pts.length + 1);
  };
  Board.prototype.addPt = function (x, y) {
    var p = this.ptAt(x, y); if (p) return p;
    p = { id: ++this.uid, x: x, y: y, n: this.name() }; this.pts.push(p); return p;
  };
  Board.prototype.snap = function (px, py) {
    var v = this.v, g = this.g, x = Math.round(g.wx(px) / v.sx) * v.sx, y = Math.round(g.wy(py) / v.sy) * v.sy;
    x = Math.min(v.x1, Math.max(v.x0, x)); y = Math.min(v.y1, Math.max(v.y0, y));
    return [+x.toFixed(6), +y.toFixed(6)];
  };
  Board.prototype.loc = function (e) { var r = this.svg.getBoundingClientRect(); return { px: (e.clientX - r.left) * this.g.W / r.width, py: (e.clientY - r.top) * this.g.H / r.height }; };
  Board.prototype.hitPt = function (px, py, R) {
    var g = this.g, best = null, bd = R || 16;
    this.pts.forEach(function (p) { var dd = Math.hypot(g.X(p.x) - px, g.Y(p.y) - py); if (dd < bd) { bd = dd; best = p; } });
    return best;
  };
  Board.prototype.hitObj = function (px, py) {
    var g = this.g, me = this, best = null, bd = 10;
    function dist(a, b, kind) {
      var A = [g.X(a.x), g.Y(a.y)], Bp = [g.X(b.x), g.Y(b.y)], dx = Bp[0] - A[0], dy = Bp[1] - A[1], l2 = dx * dx + dy * dy || 1;
      var t = ((px - A[0]) * dx + (py - A[1]) * dy) / l2;
      if (kind === 'seg' || kind === 'vec' || kind === 'crv') t = Math.max(0, Math.min(1, t)); else if (kind === 'ray') t = Math.max(0, t);
      return Math.hypot(A[0] + t * dx - px, A[1] + t * dy - py);
    }
    this.objs.forEach(function (o) {
      var dd = Infinity;
      if (o.t === 'crv') { for (var i = 0; i + 1 < o.ps.length; i++) { var a = me.byId(o.ps[i]), b = me.byId(o.ps[i + 1]); if (a && b) dd = Math.min(dd, dist(a, b, 'crv')); } }
      else { var p = me.byId(o.a), q = me.byId(o.b); if (p && q) dd = dist(p, q, o.t); }
      if (dd < bd) { bd = dd; best = o; }
    });
    return best;
  };
  Board.prototype.snapshot = function () { return JSON.stringify({ p: this.pts, o: this.objs, u: this.uid }); };
  Board.prototype.push = function (s) { if (s !== this.snapshot()) { this.hist.push(s); if (this.hist.length > 60) this.hist.shift(); } };
  Board.prototype.down = function (e) {
    if (this.lock || (e.pointerType === 'mouse' && e.button !== 0)) return;
    var L = this.loc(e), hp = this.hitPt(L.px, L.py, e.pointerType === 'touch' ? 22 : 16);
    this.drag = { id: hp ? hp.id : null, x: L.px, y: L.py, moved: false, snap: null };
    try { this.svg.setPointerCapture(e.pointerId); } catch (x) {}
    e.preventDefault();
  };
  Board.prototype.move = function (e) {
    if (this.lock) return;
    var L = this.loc(e), dr = this.drag;
    if (dr && dr.id != null && this.tool !== 'erase') {
      if (!dr.moved && Math.hypot(L.px - dr.x, L.py - dr.y) < 6) return;
      if (!dr.moved) { dr.moved = true; dr.snap = this.snapshot(); if (this.tool !== 'join') this.pend = null; }
      var p = this.byId(dr.id), s = this.snap(L.px, L.py);
      if (p && (p.x !== s[0] || p.y !== s[1]) && !this.ptAt(s[0], s[1])) { p.x = s[0]; p.y = s[1]; this.sel = p.id; this.draw(); }
      return;
    }
    if (!dr && e.pointerType === 'mouse' && this.hov) {
      var q = this.snap(L.px, L.py), g = this.g, h = '<circle cx="' + g.X(q[0]) + '" cy="' + g.Y(q[1]) + '" r="6" class="hov"/>';
      var pe = this.pend != null && this.byId(this.pend);
      if (pe) h = '<line x1="' + g.X(pe.x) + '" y1="' + g.Y(pe.y) + '" x2="' + g.X(q[0]) + '" y2="' + g.Y(q[1]) + '" class="rb"/>' + h;
      this.hov.innerHTML = this.tool === 'erase' ? '' : h;
    }
  };
  Board.prototype.up = function (e) {
    var dr = this.drag; this.drag = null;
    if (!dr || this.lock) return;
    if (dr.moved) { this.push(dr.snap); this.changed(); return; }
    var L = this.loc(e); this.click(L.px, L.py, dr.id);
  };
  Board.prototype.click = function (px, py, hid) {
    var t = this.tool, hp = hid != null ? this.byId(hid) : null, s0 = this.snapshot(), me = this;
    if (t === 'erase') {
      if (hp) {
        this.pts = this.pts.filter(function (p) { return p !== hp; });
        this.objs = this.objs.filter(function (o) {
          if (o.t !== 'crv') return o.a !== hp.id && o.b !== hp.id;
          o.ps = o.ps.filter(function (id) { return id !== hp.id; }); return o.ps.length >= 2;
        });
      } else { var o = this.hitObj(px, py); if (o) this.objs = this.objs.filter(function (x) { return x !== o; }); }
      this.sel = null; this.chain = null; this.push(s0); this.changed(); return;
    }
    if (t === 'join') {   // сурагч аль цэгийг ямар дарааллаар холбохоо өөрөө сонгоно
      if (!hp) { this.tipEl.textContent = 'Холбох цэг дээрээ дарна. Шинэ цэгийг «Цэг» хэрэгслээр тавина.'; return; }
      var c = this.chain;
      if (!c) { this.chain = { id: ++this.uid, t: 'crv', ps: [hp.id] }; this.pend = hp.id; this.sel = hp.id; this.changed(); return; }
      if (hp.id === c.ps[c.ps.length - 1]) { this.chain = null; this.pend = null; this.changed(); return; }   // дуусгах
      if (c.ps.indexOf(hp.id) >= 0) return;
      c.ps.push(hp.id); if (c.ps.length === 2) this.objs.push(c);
      this.pend = hp.id; this.sel = hp.id; this.push(s0); this.changed(); return;
    }
    if (t === 'point') {
      var s = this.snap(px, py), p = hp || this.addPt(s[0], s[1]);
      this.sel = p.id; this.push(s0); this.changed(); return;
    }
    var q = hp; if (!q) { var s2 = this.snap(px, py); q = this.addPt(s2[0], s2[1]); }
    if (this.pend == null || !this.byId(this.pend)) { this.pend = q.id; this.sel = q.id; this.push(s0); this.changed(); return; }
    if (this.pend === q.id) { this.pend = null; this.push(s0); this.changed(); return; }
    var a = this.pend, b = q.id, sym = t === 'seg' || t === 'line';
    var dup = this.objs.some(function (o) { return o.t === t && ((o.a === a && o.b === b) || (sym && o.a === b && o.b === a)); });
    if (!dup) this.objs.push({ id: ++this.uid, t: t, a: a, b: b });
    // Хэрчим гинжээр үргэлжилнэ (муруй, гурвалжин): зогсоохдоо сүүлийн цэг дээрээ дахин дарна
    this.pend = t === 'seg' ? b : null; this.sel = b; this.push(s0); me.changed();
  };
  Board.prototype.undo = function () {
    var s = this.hist.pop(); if (!s) return;
    var o = JSON.parse(s); this.pts = o.p; this.objs = o.o; this.uid = o.u; this.pend = null; this.sel = null; this.chain = null; this.changed();
  };
  Board.prototype.clear = function () {
    if (!this.pts.length && !this.objs.length) return;
    this.hist.push(this.snapshot()); this.pts = []; this.objs = []; this.pend = null; this.sel = null; this.chain = null; this.changed();
  };
  Board.prototype.changed = function () {
    this.draw();
    var cb = d.getElementById('check-btn');
    if (cb && !this.lock) cb.disabled = !(this.pts.length || this.objs.length);
  };
  Board.prototype.cls = function (id) { return !this.res ? 'st' : this.res.good[id] ? 'ok' : 'bad'; };
  Board.prototype.draw = function () {
    var g = this.g, me = this, h = gridSvg(g, this.cid) + '<g clip-path="url(#' + this.cid + ')">';
    (this.G.given || []).forEach(function (it) { if (it.t !== 'pt') h += item(g, it, 'gv'); });
    if (this.showSol) solItems(this.G.ans).forEach(function (it) { if (it.t !== 'pt') h += item(g, it, 'sol'); });
    this.objs.forEach(function (o) {
      if (o.t === 'crv') {   // «Цэгүүдийг холбох» — сонгосон цэгүүдээр, сонгосон дарааллаар
        var P = o.ps.map(function (id) { return me.byId(id); }).filter(Boolean).map(function (p) { return [p.x, p.y]; }), cd = chainPath(g, P, me.G.ans.join);
        if (cd) h += '<path d="' + cd + '" class="' + me.cls(o.id) + ' ln jn"/>';
        return;
      }
      var a = me.byId(o.a), b = me.byId(o.b); if (a && b) h += item(g, { t: o.t, a: [a.x, a.y], b: [b.x, b.y] }, me.cls(o.id));
    });
    h += '</g>';
    (this.G.given || []).forEach(function (it) { if (it.t === 'pt') h += item(g, it, 'gv'); });
    if (this.showSol) solItems(this.G.ans).forEach(function (it) { if (it.t === 'pt') h += item(g, it, 'sol'); });
    this.pts.forEach(function (p) { h += item(g, { t: 'pt', p: [p.x, p.y], n: p.n }, me.cls(p.id)); });
    var pe = this.pend != null && this.byId(this.pend);
    if (pe) h += '<circle cx="' + g.X(pe.x) + '" cy="' + g.Y(pe.y) + '" r="11" class="pend"/>';
    if (this.chain) this.chain.ps.forEach(function (id, i) {   // сонгосон дараалал
      var p = me.byId(id); if (!p) return;
      h += '<g class="ord"><circle cx="' + r1(g.X(p.x) - 11) + '" cy="' + r1(g.Y(p.y) + 13) + '" r="8"/><text x="' + r1(g.X(p.x) - 11) + '" y="' + r1(g.Y(p.y) + 17) + '" text-anchor="middle">' + (i + 1) + '</text></g>';
    });
    var se = !this.lock && this.sel != null && this.byId(this.sel);
    if (se) {
      var t = esc(String(se.n).replace(/_(\d)/, function (m, k) { return '₀₁₂₃₄₅₆₇₈₉'.charAt(+k); })) + '(' + mn(se.x) + '; ' + mn(se.y) + ')', w = t.length * 6.6 + 12;
      var x = g.X(se.x) + 10, y = g.Y(se.y) - 30;
      if (x + w > g.W - 2) x = g.X(se.x) - 10 - w; if (y < 2) y = g.Y(se.y) + 10;
      h += '<g class="tag"><rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(w) + '" height="20" rx="6"/><text x="' + r1(x + w / 2) + '" y="' + r1(y + 14) + '" text-anchor="middle">' + t + '</text></g>';
    }
    h += '<g class="hovg"></g>';
    this.svg.innerHTML = h;
    this.hov = this.svg.querySelector('.hovg');
    var canJoin = this.G.tools.indexOf('join') >= 0;
    this.tipEl.textContent = this.lock ? '' : this.tool === 'join' ? (this.chain ? 'Дараагийн цэгээ сонгоно. Дуусгахдаа сүүлийн цэг дээрээ дахин дарна.' : 'Холбох эхний цэгээ сонгоно.') :
      this.pend == null ? (canJoin && this.tool === 'point' ? 'Цэгүүдээ тавиад «Цэгүүдийг холбох» дээр дарж, холбох цэгүүдээ дарааллаар нь сонгоно.' : TOOL[this.tool][2]) :
      this.tool === 'seg' && this.objs.length ? 'Дараагийн цэг дээр дарж үргэлжлүүлнэ. Зогсоохдоо сүүлийн цэг дээрээ дахин дарна.' : 'Одоо хоёр дахь цэг дээр дарна.';
    this.listEl.textContent = this.pts.map(function (p) { return String(p.n).replace(/_(\d)/, function (m, k) { return '₀₁₂₃₄₅₆₇₈₉'.charAt(+k); }) + '(' + mn(p.x) + '; ' + mn(p.y) + ')'; }).join('  ');
  };
  Board.prototype.renderRes = function () {
    var r = this.res; if (!r) return;
    this.resEl.hidden = false;
    this.resEl.className = 'cmg-res ' + (r.ok ? 'ok' : 'bad');
    this.resEl.innerHTML = '<span>' + esc(r.ok ? r.msg : r.msg + ' Зөв график ногоон тасархай шугамаар харагдана.') + '</span>' +
      '<button type="button" data-sol="1">' + ICE + (this.showSol ? 'График нуух' : 'График харах') + '</button>';
  };
  Board.prototype.check = function () {
    var me = this;
    var S = { pts: this.pts, objs: this.objs.map(function (o) {
      if (o.t === 'crv') return { id: o.id, t: 'crv', ps: o.ps.map(function (id) { var p = me.byId(id); return [p.x, p.y]; }) };
      var a = me.byId(o.a), b = me.byId(o.b); return { id: o.id, t: o.t, a: [a.x, a.y], b: [b.x, b.y] };
    }) };
    this.chain = null;
    var r = evaluate(this.G.ans, S);
    this.res = r; this.lock = true; this.pend = null; this.sel = null; this.showSol = !r.ok;
    this.host.classList.add('locked');
    [].forEach.call(this.host.querySelectorAll('.cmg-tools button'), function (b) { b.disabled = true; });
    this.draw(); this.renderRes();
    var sum = this.pts.map(function (p) { return p.n + '(' + dc(p.x) + ';' + dc(p.y) + ')'; }).join(' ');
    return { ok: r.ok, answer: sum };
  };

  /* ════════ «График харах» — бодлогын текст дэх y = f(x) ════════ */
  var VIEW_NODES = {};
  ['324', '333', '335', '337', '720', '729', '730', '510', '521', '526', '527', '528', '529', '530', '531', '52', '53', '54', '55', '57', '58',
    '414', '415', '418', '419', '420', '421', '422', '423', '424', '611', '613'].forEach(function (k) { VIEW_NODES[k] = 1; });
  // LaTeX баруун тал → JS функц (x-ээс өөр үсэг, танихгүй тушаалтай бол null)
  function parseFn(src) {
    var t = String(src).replace(/\\left|\\right|\\displaystyle/g, '').replace(/\\[,;:!]|\\ |~/g, '').replace(/\{,\}/g, '.').replace(/\s+/g, '');
    t = t.replace(/\\cdot|\\times/g, '*').replace(/−/g, '-');
    for (var i = 0; i < 8 && /\\[dt]?frac/.test(t); i++) t = t.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '(($1)/($2))').replace(/\\[dt]?frac(\d)(\d)/g, '(($1)/($2))');
    for (i = 0; i < 4 && /\\sqrt/.test(t); i++) t = t.replace(/\\sqrt\{([^{}]*)\}/g, 'S($1)');
    t = t.replace(/\|([^|]+)\|/g, 'A($1)').replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/\^(\d+|x)/g, '^($1)');
    if (/[\\{}|]/.test(t) || /[a-wyz]/.test(t) || /[B-RT-Z]/.test(t)) return null;
    t = t.replace(/(\d|x|\))(?=[x(SA])/g, '$1*');
    // a^(b) → Math.pow(a,b): суурь нь тоо, x эсвэл (…) / S(…) / A(…)
    for (i = 0; i < 10 && t.indexOf('^') >= 0; i++) {
      var k = t.indexOf('^'), j = k - 1, depth = 0;
      if (t[j] === ')') { for (; j >= 0; j--) { if (t[j] === ')') depth++; else if (t[j] === '(') { depth--; if (!depth) break; } } if (j > 0 && /[SA]/.test(t[j - 1])) j--; }
      else { while (j > 0 && /[\d.x]/.test(t[j - 1])) j--; if (!/[\d.x]/.test(t[j] || '')) return null; }
      if (t[k + 1] !== '(') return null;
      var e = k + 1; depth = 0;
      for (; e < t.length; e++) { if (t[e] === '(') depth++; else if (t[e] === ')') { depth--; if (!depth) break; } }
      if (e >= t.length) return null;
      t = t.slice(0, j) + 'Math.pow(' + t.slice(j, k) + ',' + t.slice(k + 2, e) + ')' + t.slice(e + 1);
    }
    t = t.replace(/S\(/g, 'Math.sqrt(').replace(/A\(/g, 'Math.abs(');
    if (!/^[-+*/().,\dx]*$/.test(t.replace(/Math\.(pow|sqrt|abs)\(/g, '('))) return null;
    try {
      var f = new Function('x', '"use strict"; return (' + t + ');'), ok = 0;
      [-3, -2, -1.5, -0.5, 0.5, 1, 2, 3].forEach(function (x) { var y = f(x); if (typeof y === 'number' && isFinite(y)) ok++; });
      return ok >= 4 ? f : null;
    } catch (err) { return null; }
  }
  function findFns(text) {
    var out = [], re = /\$\$([\s\S]+?)\$\$|\$([^$]+)\$|\\\(([\s\S]+?)\\\)/g, m;
    while ((m = re.exec(text)) && out.length < 3) {
      var c = m[1] || m[2] || m[3] || '', r2 = /(^|[,;:{(&]|\\\\|\\quad|\\qquad|\\text\{[^}]*\}|\\begin\{[a-z]+\})\s*(y|f\(x\))\s*=\s*/g, mm;
      while ((mm = r2.exec(c)) && out.length < 3) {
        var rest = c.slice(mm.index + mm[0].length), dep = 0, i;
        for (i = 0; i < rest.length; i++) {
          var ch = rest[i];
          if (ch === '{' || ch === '(') dep++; else if (ch === '}' || ch === ')') { if (!dep) break; dep--; }
          else if (!dep && (/[,;&<>=]/.test(ch) || /^\\(\\|quad|qquad|text|end|le(?!ft)|ge|ne|in(?!fty)|mid)/.test(rest.slice(i)))) break;
        }
        var ex = rest.slice(0, i).replace(/\\[,;:!]\s*$/, '').trim(), f = ex && parseFn(ex);
        if (f && !out.some(function (o) { return [-2, 0.5, 1, 3].every(function (x) { var a = o.f(x), b = f(x); return (!isFinite(a) && !isFinite(b)) || near(a, b); }); })) out.push({ f: f, tex: 'y = ' + ex });
      }
    }
    return out;
  }
  function viewFor(q) {
    try {
      if (!q || q.type === 'graph') return '';
      var id = typeof currentLessonId !== 'undefined' ? String(currentLessonId) : '';
      if (!VIEW_NODES[id]) return '';
      var t = String(q.q || '');
      if (/байгуулахгүй/i.test(t)) return '';
      var fs = findFns(t); if (!fs.length) return '';
      var lo = -6, hi = 6;
      fs.forEach(function (o) { for (var x = -6; x <= 6; x += 0.5) { var y = o.f(x); if (isFinite(y) && Math.abs(y) <= 10) { lo = Math.min(lo, Math.floor(y)); hi = Math.max(hi, Math.ceil(y)); } } });
      var v = V(-6, 6, Math.max(-10, lo), Math.min(10, hi), { ly: hi - lo > 14 ? 2 : 0 });
      var items = fs.map(function (o, i) { return { t: 'fn', f: o.f, br: [0], c: 'c' + i }; });
      // асимптотыг (x = 0) зөвхөн функц тэнд тасардаг үед л тасална
      items.forEach(function (it) { var a = it.f(-1e-7), b = it.f(1e-7); if (isFinite(a) && isFinite(b) && Math.abs(a - b) < 1e-3) it.br = []; });
      return '<div class="cmg-view">' + staticSvg(v, items, 440) + '<div class="cmg-legend">' + fs.map(function (o, i) {
        return '<span><i class="c' + i + '"></i>$' + o.tex + '$</span>';
      }).join('') + '</div></div>';
    } catch (e) { return ''; }
  }

  /* ════════ Сайттай холбох ════════ */
  function answerHtml() { return '<div id="options" class="cmg-opts" style="grid-template-columns:1fr;"><div id="cmg-host" class="cmg"></div></div>'; }
  function mount(q) {
    var host = d.getElementById('cmg-host');
    if (!host || !q || q.type !== 'graph' || !q.graph) { B = null; return; }
    if (host._cmg) return;
    try { B = host._cmg = new Board(host, q.graph); } catch (e) {
      B = null; try { console.warn('cm-graph', e); } catch (x) {}
      var cb = d.getElementById('check-btn'); if (cb) cb.disabled = false;   // самбар ачаалагдахгүй бол хичээл гацахгүй
    }
  }
  function check(q) {
    var host = d.getElementById('cmg-host');
    if (!B || !host || B.host !== host) return { ok: false, answer: '' };
    return B.check();
  }
  window.cmGraph = { inject: inject, answerHtml: answerHtml, mount: mount, check: check, viewFor: viewFor,
    _gen: GEN, _nodes: NODES, _make: make, _evaluate: evaluate, _parseFn: parseFn, _findFns: findFns, _slopes: slopes, _board: function () { return B; } };
})();
