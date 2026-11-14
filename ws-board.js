/* ws-board.js — ажлын хуудсыг смарт дэлгэц дээр хуваасан дэлгэцээр: зүүн талд хуудас, баруун талд гараар бичих самбар
   (2026-11-12, эзэмшигч: «смарт дэлгэц дээр гаргаад нэг товч дарахад самбар … гардаг байлгавал», Б хувилбарыг сонгосон).
   - ws-store.js-ийн «Самбар» товч дарахад л ачаална → wsBoard.open() / toggle().
   - Зүүн талын бодлого (.q) дээр дарахад заавартайгаа самбарын дээд хэсэгт томоор гарна; бодлого бүр өөрийн хуудастай, «+» шинэ хуудас.
   - Бичих хэрэгсэл (эзэмшигч: «Үзэг, харандаа, тодруулагчаас сонгодог байлгах», «нарийн бүдүүн эсэхийг өөрөө тохируулдаг»,
     «Өнгөний сонголтийг нэг товч дээр дарахад өнгөнүүд нь гарч ирдэг»): үзэг · харандаа · тодруулагч, зузааныг гулсуураар;
     нэг өнгөний товч → өнгөний самбар; бичих хэсэгт «+» биш улаан цэг заагч.
   - Дэвсгэр (эзэмшигч: «самбарыг хар юмуу бараан өнгөтэй болгож болдог»): хээ — тор · шугам · хоосон · координатын хавтгай;
     өнгө — цагаан · хар · ногоон · хөх. Бараан самбар дээр бараан бэх хос өнгөөрөө харагдана (өгөгдөл өөрчлөгдөхгүй).
   - Геометр (эзэмшигч: «Geogebra шиг томруулж жижгэрүүлж болдог мөн цэг тэмдэглээд холбодог байх шулуун, хэрчим …
     Геометрийн дүрсүүд нэмэх»): цэг · хэрчим · шулуун · цацраг · олон өнцөгт · тойрог · гурвалжин · тэгш өнцөгт · зөөх · устгах,
     y = f(x) график; координатын хавтгайг (бичгийн хамт) томруулах/жижигрүүлэх — товч, хулганы дугуй, хоёр хуруугаар чимхэх.
   - Тооны машин (эзэмшигч: «тооны машин гаргах хэсэг бас нэм. Бүх хэрэгслүүдтэй»): тригонометр (градус/радиан), урвуу, √ ∛,
     зэрэг, lg ln, 10ˣ eˣ, n!, |x|, %, Ans, бутархай хэлбэр; чирж зөөнө.
   - Ухаалаг баллуур (эзэмшигч: «Бүгдийг нь арилгах болон арилгах зүйлээ хүрээлээд арилгах эсвэл харандаа шиг зураад арилгах
     сонголттой … 2 хуруугаар мэдэрдэг. алгаа тавихад баллуур болдог»): зурж арилгах (хэмжээтэй) · хүрээлж арилгах ·
     бүгдийг арилгах; хоёр хуруу эсвэл алга тавихад түр баллуур (бичиж байх үед хүрсэн гарыг тоохгүй; цэснээс унтраана).
   - Буцаах/дахих (бичиг, геометр), цэвэрлэх; хуваагчийг чирж өргөнийг тохируулна.
   - «Самбарт илгээх»: компьютерын самбарыг (state/rev) смарт самбар зөвхөн харах горимоор дагана (mirror).
   - Хэвлэхэд гарахгүй; бичлэг санах ойд (хуудсыг дахин ачаалбал арилна).
   Хөтөч (window.wsBoard) ба Node (module.exports — tests/ws-board.test.js). */
(function (root) {
  'use strict';

  /* ── Хуудасны түүх: зурлага нэмэх, устгах (хүрээлж), цэвэрлэх, геометр, буцаах, дахих ── */
  function newPage(q, pin) { return { q: q || null, pin: pin || '', strokes: [], undo: [], redo: [] }; }
  function emptyGeo() { return { pts: [], objs: [], fns: [], n: 0 }; }
  function addStroke(pg, s) { pg.strokes.push(s); pg.undo.push({ t: 'add', s: s }); pg.redo.length = 0; }
  function clearPage(pg) {
    var g = pg.geo && (pg.geo.pts.length || pg.geo.fns.length);
    if (!pg.strokes.length && !g) return false;
    pg.undo.push({ t: 'clear', prev: pg.strokes, gprev: pg.geo || null }); pg.strokes = []; if (pg.geo) pg.geo = emptyGeo(); pg.redo.length = 0;
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
  // Геометрийн өөрчлөлт: өмнөх төлвийн хуулбар түүхэнд (буцаах/дахихад солилцоно)
  function geoOp(pg, prev) { pg.undo.push({ t: 'geo', prev: prev }); pg.redo.length = 0; }
  function undo(pg) {
    var op = pg.undo.pop(); if (!op) return false;
    if (op.t === 'add') pg.strokes.pop();
    else if (op.t === 'del') op.items.forEach(function (it) { pg.strokes.splice(it[0], 0, it[1]); });
    else if (op.t === 'geo') { var g = pg.geo; pg.geo = op.prev; op.prev = g; }
    else { pg.strokes = op.prev; if (op.gprev) pg.geo = op.gprev; }
    pg.redo.push(op); return true;
  }
  function redo(pg) {
    var op = pg.redo.pop(); if (!op) return false;
    if (op.t === 'add') pg.strokes.push(op.s);
    else if (op.t === 'del') { for (var k = op.items.length - 1; k >= 0; k--) pg.strokes.splice(op.items[k][0], 1); }
    else if (op.t === 'geo') { var g = pg.geo; pg.geo = op.prev; op.prev = g; }
    else { op.prev = pg.strokes; pg.strokes = []; if (op.gprev) { op.gprev = pg.geo; pg.geo = emptyGeo(); } }
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

  // Сүлжээгээр ирсэн (компьютерын самбарын) зурлагыг шалгаад k дахин томруулна; буруу бол null
  function normStroke(s, k) {
    if (!s || !Array.isArray(s.p) || s.p.length > 20000) return null;
    var o = { p: [], w: Math.max(0, Math.min(400, +s.w || 0)) * k };
    if (s.er) o.er = true;
    else if (/^#[0-9a-f]{6}$/i.test(s.c)) o.c = s.c;
    else return null;
    if (!s.er && (s.t === 'pencil' || s.t === 'hl')) o.t = s.t;
    if (s.er && s.g) o.g = 1;
    for (var i = 0; i < s.p.length; i++) {
      var q = s.p[i];
      if (q === null && o.g) { o.p.push(null); continue; }
      if (!Array.isArray(q) || !isFinite(q[0]) || !isFinite(q[1])) return null;
      o.p.push(o.g ? [q[0] * k, q[1] * k, Math.max(0.1, Math.min(400, +q[2] || 26)) * k] : [q[0] * k, q[1] * k]);
    }
    return o;
  }
  // Өнгөний самбар: цайвар самбарт (12) ба бараан самбарт (12) — ижил байрлалынх нь хос (хар↔цагаан, шар↔цайвар шар …)
  var INK_L = [['#1f1d2e', 'Хар'], ['#6b7280', 'Саарал'], ['#dc2626', 'Улаан'], ['#ea580c', 'Улбар шар'], ['#ca8a04', 'Шар'], ['#16a34a', 'Ногоон'],
    ['#0d9488', 'Номин'], ['#0284c7', 'Цэнхэр'], ['#2563eb', 'Хөх'], ['#7c3aed', 'Нил ягаан'], ['#db2777', 'Ягаан'], ['#92400e', 'Бор']];
  var INK_D = [['#ffffff', 'Цагаан'], ['#d1d5db', 'Саарал'], ['#fca5a5', 'Улаан'], ['#fdba74', 'Улбар шар'], ['#fde047', 'Шар'], ['#86efac', 'Ногоон'],
    ['#5eead4', 'Номин'], ['#7dd3fc', 'Цэнхэр'], ['#93c5fd', 'Хөх'], ['#c4b5fd', 'Нил ягаан'], ['#f9a8d4', 'Ягаан'], ['#fcd34d', 'Алтан']];
  // Бэхний харагдах өнгө (өгөгдөл хэвээр): самбарын өнгө солигдоход хос өнгө нь; бусад өнгөнд — бараан дээр бараан бэх цагаан, цагаан дээр цайвар бэх хар
  function lum(h) { return (0.2126 * parseInt(h.slice(1, 3), 16) + 0.7152 * parseInt(h.slice(3, 5), 16) + 0.0722 * parseInt(h.slice(5, 7), 16)) / 255; }
  function inkOn(c, dark) {
    var lc = String(c).toLowerCase();
    for (var i = 0; i < INK_L.length; i++) {
      if (dark && INK_L[i][0] === lc) return INK_D[i][0];
      if (!dark && INK_D[i][0] === lc) return INK_L[i][0];
    }
    var L = lum(lc); return dark ? (L < 0.22 ? '#ffffff' : c) : (L > 0.86 ? '#1f1d2e' : c);
  }

  /* ── Илэрхийлэл (eval-гүй өөрийн задлагч): функцийн график — y = 2x + 1, x² − 4, 2sin x, √x, |x − 3|, (x+1)(x−1);
     тооны машин — градус/радиан, урвуу тригонометр, n!, %, Ans. Хаагаагүй хаалтыг төгсгөлд нь хаана. Буруу бол null ── */
  var NAMES = ['arcctg', 'arcsin', 'arccos', 'arctan', 'arctg', 'sqrt', 'cbrt', 'sin', 'cos', 'tan', 'ctg', 'cot', 'abs', 'exp', 'log', 'ans', 'lg', 'ln', 'tg', 'pi', 'x', 'e'];
  function fact(v) { if (v < 0 || v !== Math.floor(v) || v > 170) return NaN; var r = 1; for (var i = 2; i <= v; i++) r *= i; return r; }
  function compileExpr(src, o) {
    o = o || {};
    var s = String(src == null ? '' : src).toLowerCase().replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/, '')
      .replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/²/g, '^2').replace(/³/g, '^3').replace(/(\d),(\d)/g, '$1.$2');
    if (!s.trim() || s.length > 160) return null;
    var tk = [], i = 0, m;
    while (i < s.length) {
      var ch = s[i], rest = s.slice(i);
      if (/\s/.test(ch)) { i++; continue; }
      if ((m = /^(\d+\.?\d*|\.\d+)/.exec(rest))) { tk.push({ n: parseFloat(m[0]) }); i += m[0].length; continue; }
      if (/[a-z]/.test(ch)) {
        var w = null;
        for (var k = 0; k < NAMES.length; k++) if (rest.indexOf(NAMES[k]) === 0) { w = NAMES[k]; break; }
        if (!w) return null;
        i += w.length;
        if (w === 'x') { if (!o.x) return null; tk.push({ v: 1 }); }
        else if (w === 'pi') tk.push({ n: Math.PI });
        else if (w === 'e') tk.push({ n: Math.E });
        else if (w === 'ans') { if (typeof o.ans !== 'number') return null; tk.push({ n: o.ans }); }
        else tk.push({ f: w });
        continue;
      }
      if (ch === 'π') { tk.push({ n: Math.PI }); i++; continue; }
      if (ch === '√') { tk.push({ f: 'sqrt' }); i++; continue; }
      if (ch === '∛') { tk.push({ f: 'cbrt' }); i++; continue; }
      if ('+-*/^()|!%'.indexOf(ch) >= 0) { tk.push({ o: ch }); i++; continue; }
      return null;
    }
    var D2R = o.deg ? Math.PI / 180 : 1, R2D = o.deg ? 180 / Math.PI : 1;
    var odd90 = function (v) { return o.deg && Math.abs(((v % 180) + 180) % 180 - 90) < 1e-9; }, m180 = function (v) { return o.deg && Math.abs(((v % 180) + 180) % 180) < 1e-9; };
    var tan = function (v) { return odd90(v) ? NaN : Math.tan(v * D2R); }, ctg = function (v) { return m180(v) ? NaN : 1 / Math.tan(v * D2R); };
    var lg = function (v) { return Math.log(v) / Math.LN10; };
    var F = { sin: function (v) { return Math.sin(v * D2R); }, cos: function (v) { return Math.cos(v * D2R); }, tan: tan, tg: tan, ctg: ctg, cot: ctg,
      arcsin: function (v) { return Math.asin(v) * R2D; }, arccos: function (v) { return Math.acos(v) * R2D; },
      arctan: function (v) { return Math.atan(v) * R2D; }, arctg: function (v) { return Math.atan(v) * R2D; }, arcctg: function (v) { return (Math.PI / 2 - Math.atan(v)) * R2D; },
      sqrt: Math.sqrt, cbrt: function (v) { return v < 0 ? -Math.pow(-v, 1 / 3) : Math.pow(v, 1 / 3); }, abs: Math.abs, exp: Math.exp, ln: Math.log, lg: lg, log: lg };
    var p = 0, ab = 0;
    var op = function (t, c) { return !!t && t.o === c; };
    // Утгыг параметрээр барина (давталт доторх var-ийг closure хуваалцвал өөрийгөө дуудаж төгсгөлгүй болно)
    var bin = function (g, a, b) { return function (x) { return g(a(x), b(x)); }; }, un = function (g, a) { return function (x) { return g(a(x)); }; };
    var ADD = function (u, v) { return u + v; }, SUB = function (u, v) { return u - v; }, MUL = function (u, v) { return u * v; }, DIV = function (u, v) { return u / v; };
    var NEG = function (u) { return -u; }, PCT = function (u) { return u / 100; };
    var startsAtom = function (t) { return !!t && (t.n != null || !!t.v || !!t.f || op(t, '(') || (op(t, '|') && !ab)); };
    function expr() {
      var a = term();
      for (;;) {
        var t = tk[p]; if (!op(t, '+') && !op(t, '-')) return a;
        p++; a = bin(t.o === '+' ? ADD : SUB, a, term());
      }
    }
    function term() {
      var a = unary();
      for (;;) {
        var t = tk[p];
        if (op(t, '*') || op(t, '/')) { p++; a = bin(t.o === '*' ? MUL : DIV, a, unary()); }
        else if (startsAtom(t)) a = bin(MUL, a, power());      // далд үржвэр: 2x, 3(x+1), x(x−1)
        else return a;
      }
    }
    function unary() {
      var t = tk[p];
      if (op(t, '-')) { p++; return un(NEG, unary()); }
      if (op(t, '+')) { p++; return unary(); }
      return power();
    }
    function power() {
      var a = post(atom());
      if (op(tk[p], '^')) { p++; a = bin(Math.pow, a, unary()); }
      return a;
    }
    function post(a) {
      for (;;) {
        var t = tk[p];
        if (op(t, '!')) { p++; a = un(fact, a); }
        else if (op(t, '%')) { p++; a = un(PCT, a); }
        else return a;
      }
    }
    function atom() {
      var t = tk[p++]; if (!t) throw 0;
      if (t.n != null) { var n = t.n; return function () { return n; }; }
      if (t.v) return function (x) { return x; };
      if (t.f) return un(F[t.f], op(tk[p], '(') ? atom() : power());   // sin x, sin(x)^2
      if (op(t, '(')) { var e = expr(); if (op(tk[p], ')')) p++; else if (p < tk.length) throw 0; return e; }
      if (op(t, '|')) { ab++; var e2 = expr(); ab--; if (!op(tk[p++], '|')) throw 0; return un(Math.abs, e2); }
      throw 0;
    }
    try { var f = expr(); return p === tk.length ? f : null; } catch (e) { return null; }
  }
  function compileFn(src) { return compileExpr(src, { x: true }); }
  function calcEval(src, deg, ans) { var f = compileExpr(src, { deg: deg, ans: ans }); return f ? f(0) : NaN; }
  // Энгийн бутархай (хуваарь ≤ 10000, гинжин бутархай): 0.75 → [3, 4]; таарахгүй бол null
  function toFrac(v) {
    if (!isFinite(v) || Math.abs(v) > 1e9) return null;
    var sg = v < 0 ? -1 : 1, x = Math.abs(v), h0 = 0, h1 = 1, k0 = 1, k1 = 0, y = x;
    for (var i = 0; i < 40; i++) {
      var a = Math.floor(y), h = a * h1 + h0, k = a * k1 + k0;
      if (k > 10000) break;
      h0 = h1; h1 = h; k0 = k1; k1 = k;
      if (Math.abs(x - h1 / k1) < 1e-10 * Math.max(1, x)) return [sg * h1, k1];
      if (y - a < 1e-12) break;
      y = 1 / (y - a);
    }
    return null;
  }
  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '⁻' };
  // Тооны машины хариу: 12 оронтой; маш том/жижиг бол a×10ⁿ; хасах тэмдэг «−»
  function fmtCalc(v) {
    if (!isFinite(v)) return null;
    if (Math.abs(v) < 1e-12) v = 0;
    var s;
    if (v !== 0 && (Math.abs(v) >= 1e12 || Math.abs(v) < 1e-6)) {
      var e = v.toExponential(9).split('e'), mant = String(+e[0]);
      s = mant + '×10' + String(+e[1]).replace(/[-0-9]/g, function (d) { return SUP[d]; });
    } else s = String(+v.toPrecision(12));
    return s.replace(/^-/, '−');
  }
  // Координатын тэмдэглэгээ: 2 орон хүртэл, хасах «−»
  function fmtNum(v) { var r = Math.round(v * 100) / 100; return (r < 0 ? '−' : '') + String(Math.abs(r)); }
  // Цэгийн нэр: A … Z, A₁ … Z₁, A₂ …
  function ptName(n) { var L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', k = Math.floor(n / 26); return L[n % 26] + (k ? String(k).replace(/\d/g, function (d) { return '₀₁₂₃₄₅₆₇₈₉'[d]; }) : ''); }
  // Сүлжээгээр ирсэн геометр (компьютерын самбар): бүтэц, тоо, өнгө, функцийг шалгана; холбоос нь алга болсон дүрсийг хасна
  function normGeo(g) {
    if (!g || typeof g !== 'object') return null;
    var hex = /^#[0-9a-f]{6}$/i, fin = function (v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) < 1e6; };
    var out = emptyGeo(), ids = {};
    out.n = Math.max(0, Math.min(100000, g.n | 0));
    (Array.isArray(g.pts) ? g.pts : []).slice(0, 2000).forEach(function (q) {
      if (q && (q.id | 0) === q.id && fin(q.x) && fin(q.y) && hex.test(q.c)) { out.pts.push({ id: q.id, x: q.x, y: q.y, nm: String(q.nm || '').slice(0, 8), c: q.c }); ids[q.id] = 1; }
    });
    (Array.isArray(g.objs) ? g.objs : []).slice(0, 2000).forEach(function (ob) {
      if (!ob || ['seg', 'line', 'ray', 'poly', 'circ', 'curve'].indexOf(ob.t) < 0 || !Array.isArray(ob.p) || !hex.test(ob.c)) return;
      var p = ob.p.slice(0, 200).filter(function (id) { return ids[id]; });
      if (p.length !== ob.p.length || p.length < (ob.t === 'poly' ? 3 : 2)) return;
      out.objs.push(ob.t === 'curve' && ob.cl ? { t: ob.t, p: p, c: ob.c, cl: 1 } : { t: ob.t, p: p, c: ob.c });
    });
    (Array.isArray(g.fns) ? g.fns : []).slice(0, 20).forEach(function (f) {
      if (f && typeof f.f === 'string' && f.f.length <= 80 && hex.test(f.c) && compileFn(f.f)) out.fns.push({ f: f.f, c: f.c });
    });
    return out;
  }

  /* ── Санамж (эзэмшигч: «Тухайн ажлын хуудастай хамааралтай томьёо теоремыг хэт нуршихгүй ойлгомжтой байдлаар санамж гэсэн
     товчинд … самбараа нээсэн үед л харагдах ёстой», «Санамжийн томьёог бүх сэдэвт нэмээрэй»): хуудасны гарчиг/хаягаас сэдвийг
     таньж гол томьёог (KaTeX) товч харуулна — тусгай сэдэв эхэнд, ерөнхий нь сүүлд (2 хүртэл карт). Сэдэв таарахгүй бол (бүлгийн
     жишиг, шалгалт) тухайн ангийн гол томьёо. tests/ws-board.test.js — ажлын хуудас бүр санамжтай. ── */
  var HINTS = [
    // 2-р анги (гарчигт «(2-р анги)») — хүүхдэд ойлгомжтой жишээтэй
    [/(үржүүлэх|хуваах).*\(2-р анги\)/, 'Үржүүлэх, хуваах', ['2 \\times 3 = 3 + 3 = 6', '3 \\times 4 = 4 \\times 3 = 12', '12 \\div 3 = 4 \\iff 4 \\times 3 = 12', 'a \\times 1 = a,\\quad a \\times 0 = 0']],
    [/(нэмэх|хасах|гишүүд).*\(2-р анги\)/, 'Нэмэх, хасах', ['\\text{нэмэгдэхүүн} + \\text{нэмэгдэхүүн} = \\text{нийлбэр}', '\\text{хасагдагч} - \\text{хасагч} = \\text{ялгавар}', '46 + 7 = 46 + 4 + 3 = 53', '62 - 6 = 62 - 2 - 4 = 56']],
    [/(урт|хүрээ).*\(2-р анги\)/, 'Урт', ['1\\ \\text{см} = 10\\ \\text{мм}', '1\\ \\text{дм} = 10\\ \\text{см}', '1\\ \\text{м} = 10\\ \\text{дм} = 100\\ \\text{см}', '\\text{Хүрээ} = \\text{бүх талын нийлбэр}']],
    [/(цаг унших|хугацаа|улирал|гараг).*\(2-р анги\)/, 'Хугацаа', ['1\\ \\text{цаг} = 60\\ \\text{минут}', '\\text{Хагас цаг} = 30\\ \\text{минут}', '1\\ \\text{хоног} = 24\\ \\text{цаг}', '1\\ \\text{долоо хоног} = 7\\ \\text{хоног}']],
    // анализ
    [/шүргэгчийн налалт|\/shurgegch-(hard|nalalt)/, 'Шүргэгч', ["k = f'(x_0) = \\operatorname{tg}\\alpha", "y = f(x_0) + f'(x_0)(x - x_0)"]],
    [/уламжлал|ulamjlal/, 'Уламжлал', ["(x^n)' = n x^{n-1}", "(\\sin x)' = \\cos x,\\quad (\\cos x)' = -\\sin x", "(\\operatorname{tg} x)' = \\dfrac{1}{\\cos^2 x}", "(e^x)' = e^x,\\quad (\\ln x)' = \\dfrac{1}{x}", "(uv)' = u'v + uv'", "\\left(\\dfrac{u}{v}\\right)' = \\dfrac{u'v - uv'}{v^2}", "\\big(f(g(x))\\big)' = f'(g(x)) \\cdot g'(x)"]],
    [/интеграл|integral|эх функц/, 'Интеграл', ['\\int x^n dx = \\dfrac{x^{n+1}}{n + 1} + C', '\\int \\dfrac{dx}{x} = \\ln|x| + C', '\\int_a^b f(x)\\,dx = F(b) - F(a)']],
    // зэрэг, логарифм, язгуур
    [/логарифм|logarifm|\blog-/, 'Логарифм', ['\\log_a b = c \\iff a^c = b', '\\log_a(xy) = \\log_a x + \\log_a y', '\\log_a \\tfrac{x}{y} = \\log_a x - \\log_a y', '\\log_a x^k = k\\log_a x', '\\log_a b = \\dfrac{\\log_c b}{\\log_c a}', 'a^{\\log_a b} = b']],
    [/илтгэгч тэгшитгэл|илтгэгч тэнцэтгэл|ижил суурьт|iltgegch-teng/, 'Илтгэгч тэгшитгэл', ['a^{f(x)} = a^{g(x)} \\iff f(x) = g(x)', 'a > 1:\\ a^{f} > a^{g} \\iff f > g', '0 < a < 1:\\ a^{f} > a^{g} \\iff f < g', 't = a^x > 0\\ \\text{— шинэ хувьсагч}']],
    [/aˣ|eˣ|ln x|илтгэгч функц|логарифм функц/, 'Илтгэгч ба логарифм функц', ['y = a^x:\\ a > 1\\ \\text{өсөх},\\ 0 < a < 1\\ \\text{буурах}', '\\text{График } (0;\\ 1)\\text{ цэгээр гарна}', 'y = \\log_a x \\iff x = a^y', 'y = \\ln x \\iff x = e^y']],
    [/^(?!.*(зэрэгцээ|zeregts)).*(зэрэг|зэргийн|zereg|илтгэгч|iltgegch)/, 'Зэрэг', ['a^m \\cdot a^n = a^{m+n}', 'a^m : a^n = a^{m-n}', '(a^m)^n = a^{mn}', '(ab)^n = a^n b^n', 'a^0 = 1,\\quad a^{-n} = \\dfrac{1}{a^n}', 'a^{\\frac{m}{n}} = \\sqrt[n]{a^m}']],
    [/иррационал/, 'Иррационал тоо', ['\\text{Рационал: } \\tfrac{m}{n};\\ \\text{иррационал: } \\sqrt{2},\\ \\pi', '\\sqrt{ab} = \\sqrt{a}\\sqrt{b}', '\\dfrac{1}{\\sqrt{a}} = \\dfrac{\\sqrt{a}}{a}']],
    [/язгуур|yazguur|sqrt/, 'Язгуур', ['\\sqrt{ab} = \\sqrt{a}\\sqrt{b}', '\\sqrt{\\tfrac{a}{b}} = \\dfrac{\\sqrt{a}}{\\sqrt{b}}', '(\\sqrt{a})^2 = a,\\quad \\sqrt{a^2} = |a|', '\\sqrt[n]{a^m} = a^{\\frac{m}{n}}']],
    // квадрат
    [/квадрат функц|квадрат график|парабол|kvadrat-funk|parabol|grafik-ax2/, 'Квадрат функц', ['y = ax^2 + bx + c', 'x_0 = -\\dfrac{b}{2a},\\quad y_0 = -\\dfrac{D}{4a}', 'y = a(x - h)^2 + k:\\ \\text{орой } (h;\\ k)', 'a > 0 \\Rightarrow \\text{салаа дээш}']],
    [/квадрат тэгшитгэл|kvadrat-tegsh|kv-tegsh|виет/, 'Квадрат тэгшитгэл', ['ax^2 + bx + c = 0', 'D = b^2 - 4ac', 'x_{1,2} = \\dfrac{-b \\pm \\sqrt{D}}{2a}', 'x_1 + x_2 = -\\dfrac{b}{a},\\quad x_1 x_2 = \\dfrac{c}{a}']],
    [/квадрат тэнцэтгэл биш/, 'Квадрат тэнцэтгэл биш', ['a > 0,\\ x_1 < x_2:', 'ax^2 + bx + c > 0 \\iff x < x_1,\\ x > x_2', 'ax^2 + bx + c < 0 \\iff x_1 < x < x_2', '\\text{Интервал бүрд тэмдгийг шалгана}']],
    // алгебр
    [/^(?!.*(анхны|хаалт задлах)).*(товчилсон|tovchilson|үржвэрийн томьёо|задла|zadlal|квадратуудын ялгавар|нийлбэрийн квадрат|ялгаврын квадрат|бүтэн квадрат|кубын томьёо|7 томьёо)/, 'Товчилсон үржүүлэх томьёо', ['(a \\pm b)^2 = a^2 \\pm 2ab + b^2', 'a^2 - b^2 = (a - b)(a + b)', '(a \\pm b)^3 = a^3 \\pm 3a^2b + 3ab^2 \\pm b^3', 'a^3 \\pm b^3 = (a \\pm b)(a^2 \\mp ab + b^2)', 'x^2 + bx = \\left(x + \\tfrac{b}{2}\\right)^2 - \\tfrac{b^2}{4}']],
    [/безу|олон гишүүнтийн хуваалт/, 'Олон гишүүнтийн хуваалт', ['P(x) = (x - a)\\,Q(x) + r,\\quad r = P(a)', 'P(a) = 0 \\iff (x - a) \\mid P(x)', '\\text{Бүхэл язгуур — сул гишүүний хуваагч}']],
    [/гишүүнчлэн үржүүлэх|олон гишүүнтээр үржих|× олон гишүүнт|хаалт задлах/, 'Гишүүнчлэн үржүүлэх', ['a(b + c) = ab + ac', '(a + b)(c + d) = ac + ad + bc + bd', 'x^m \\cdot x^n = x^{m+n}']],
    [/ерөнхий үржигдэхүүн/, 'Ерөнхий үржигдэхүүн', ['ab + ac = a(b + c)', 'ab - ac = a(b - c)', 'ax^2 + bx = x(ax + b)']],
    [/нэг гишүүнт|олон гишүүнт/, 'Нэг ба олон гишүүнт', ['(a x^m)(b x^n) = ab\\, x^{m+n}', 'a x^n + b x^n = (a + b) x^n', '\\text{Зэрэг — хамгийн их илтгэгч}']],
    [/^(?!.*гишүүнт).*стандарт хэлбэр/, 'Стандарт хэлбэр', ['a \\cdot 10^n,\\quad 1 \\le a < 10', '(a \\cdot 10^m)(b \\cdot 10^n) = ab \\cdot 10^{m+n}', '\\dfrac{a \\cdot 10^m}{b \\cdot 10^n} = \\dfrac{a}{b} \\cdot 10^{m-n}']],
    [/рационал тэгшитгэл|квадратад шилждэг|биквадрат/, 'Рационал тэгшитгэл', ['\\dfrac{P(x)}{Q(x)} = 0 \\iff P(x) = 0,\\ Q(x) \\ne 0', 'x^4 + px^2 + q = 0:\\ t = x^2 \\ge 0', '\\text{Хариуг мужаар шалгана}']],
    [/рационал функц/, 'Рационал функц', ['y = \\dfrac{P(x)}{Q(x)},\\quad Q(x) \\ne 0', '\\text{Босоо асимптот: } Q(x) = 0']],
    // тригонометр
    [/тэгш өнцөгт гурвалж|талын урт олох|өнцөг олох · тригонометр|гарын хурууны/, 'Тэгш өнцөгт гурвалжин', ['\\sin\\alpha = \\dfrac{\\text{эсрэг катет}}{\\text{гипотенуз}}', '\\cos\\alpha = \\dfrac{\\text{хавсарсан катет}}{\\text{гипотенуз}}', '\\operatorname{tg}\\alpha = \\dfrac{\\text{эсрэг катет}}{\\text{хавсарсан катет}}', '\\sin 30^\\circ = \\tfrac12,\\ \\sin 45^\\circ = \\tfrac{\\sqrt2}{2},\\ \\sin 60^\\circ = \\tfrac{\\sqrt3}{2}', '\\operatorname{tg} 30^\\circ = \\tfrac{1}{\\sqrt3},\\ \\operatorname{tg} 45^\\circ = 1,\\ \\operatorname{tg} 60^\\circ = \\sqrt3']],
    [/тусгай.*өнцг|том өнцг/, 'Тусгай өнцөг', ['\\sin 30^\\circ = \\tfrac12,\\ \\sin 45^\\circ = \\tfrac{\\sqrt2}{2},\\ \\sin 60^\\circ = \\tfrac{\\sqrt3}{2}', '\\cos 30^\\circ = \\tfrac{\\sqrt3}{2},\\ \\cos 60^\\circ = \\tfrac12', '\\operatorname{tg} 30^\\circ = \\tfrac{1}{\\sqrt3},\\ \\operatorname{tg} 45^\\circ = 1', '\\sin(180^\\circ - \\alpha) = \\sin\\alpha', '\\cos(180^\\circ - \\alpha) = -\\cos\\alpha']],
    [/тригонометр функцийн тэмдэг/, 'Тригонометр функцийн тэмдэг', ['\\sin\\alpha > 0:\\ \\text{I, II мөч}', '\\cos\\alpha > 0:\\ \\text{I, IV мөч}', '\\operatorname{tg}\\alpha > 0:\\ \\text{I, III мөч}']],
    [/мөч/, 'Координатын мөч', ['\\text{I: } (+;\\ +),\\quad \\text{II: } (-;\\ +)', '\\text{III: } (-;\\ -),\\quad \\text{IV: } (+;\\ -)', '\\text{I: } 0^\\circ\\text{–}90^\\circ,\\quad \\text{II: } 90^\\circ\\text{–}180^\\circ', '\\text{III: } 180^\\circ\\text{–}270^\\circ,\\quad \\text{IV: } 270^\\circ\\text{–}360^\\circ']],
    [/радиан|нэгж тойрог|эргэлтийн өнцөг|давхацсан/, 'Эргэлтийн өнцөг, радиан', ['180^\\circ = \\pi\\ \\text{рад}', '1\\ \\text{рад} = \\dfrac{180^\\circ}{\\pi} \\approx 57^\\circ', 'l = R\\alpha,\\quad S = \\tfrac12 R^2\\alpha', '\\alpha + 360^\\circ \\cdot k\\ \\text{— давхацсан өнцөг}']],
    [/тригонометр|trigonometr|синус|косинус|тангенс|\bsin|\bcos|\btg\b/, 'Тригонометр', ['\\sin^2\\alpha + \\cos^2\\alpha = 1', '\\operatorname{tg}\\alpha = \\dfrac{\\sin\\alpha}{\\cos\\alpha}', '1 + \\operatorname{tg}^2\\alpha = \\dfrac{1}{\\cos^2\\alpha}', '\\sin 2\\alpha = 2\\sin\\alpha\\cos\\alpha', '\\cos 2\\alpha = \\cos^2\\alpha - \\sin^2\\alpha']],
    // геометр (тусгай нь эхэнд)
    [/медиан(?!.*өгөгд)/, 'Медиан', ['\\text{Медианууд нэг цэгт огтлолцоно}', 'AO : OA_1 = 2 : 1', 'm_a = \\tfrac12\\sqrt{2b^2 + 2c^2 - a^2}']],
    [/биссектрис/, 'Биссектрис', ['\\dfrac{AL}{LC} = \\dfrac{AB}{BC}', '\\text{Цэг нь өнцгийн талуудаас ижил зайтай}']],
    [/гурвалжны шугам/, 'Гурвалжны шугамууд', ['\\text{Медиан — эсрэг талын дундаж руу}', '\\text{Биссектрис — өнцгийг тэнцүү хуваана}', '\\text{Өндөр — эсрэг талд перпендикуляр}', '\\text{Дундаж шугам} = \\tfrac12\\ \\text{суурь}']],
    [/гурвалжинд багтсан|гурвалжныг багтаасан|багтсан ба багтаасан тойрог|гадаад радиус/, 'Багтсан, багтаасан тойрог', ['r = \\dfrac{S}{p},\\quad p = \\dfrac{a + b + c}{2}', 'R = \\dfrac{abc}{4S} = \\dfrac{a}{2\\sin A}', '\\text{Тэгш өнцөгт: } R = \\tfrac{c}{2},\\ r = \\tfrac{a + b - c}{2}']],
    [/багтсан өнцөг|төв өнцөг|нумын хамаарал|тойрог ба өнцөг/, 'Багтсан өнцөг', ['\\text{Багтсан} = \\tfrac12\\ \\text{төв өнцөг}', '\\text{Диаметрт тулсан өнцөг} = 90^\\circ', '\\text{Нэг нумд тулсан өнцгүүд тэнцүү}']],
    [/(багтсан|багтаасан).*(олон|дөрвөн) өнцөгт|циклик/, 'Багтсан, багтаасан олон өнцөгт', ['\\text{Багтсан: } \\angle A + \\angle C = 180^\\circ', '\\text{Багтаасан: } a + c = b + d', 'S = p\\,r\\quad (p\\text{ — хагас периметр})', 'a_n = 2R\\sin\\dfrac{180^\\circ}{n}']],
    [/хоёр тойрг|хоёр тойрог|шүргэлцсэн тойр/, 'Хоёр тойрог', ['d = R + r\\ \\text{— гаднаас шүргэлцэнэ}', 'd = R - r\\ \\text{— дотроос шүргэлцэнэ}', 'R - r < d < R + r\\ \\text{— огтлолцоно}', 'd > R + r\\ \\text{— огтлолцохгүй}']],
    [/тойргийн тэгшитгэл|toirog-tegsh/, 'Тойргийн тэгшитгэл', ['(x - a)^2 + (y - b)^2 = r^2', '\\text{Төв } (a;\\ b),\\ \\text{радиус } r', 'x^2 + y^2 = r^2\\ \\text{— төв } O']],
    [/харилцан байршил|хэрчим таслах/, 'Харилцан байршил', ['\\text{Тэгшитгэлүүдийг системээр бодно}', 'D > 0:\\ \\text{2 цэгт огтлолцоно}', 'D = 0:\\ \\text{шүргэнэ}', 'D < 0:\\ \\text{огтлолцохгүй}', '\\text{Шулуун, тойрог: } d < r,\\ d = r,\\ d > r']],
    [/^(?!.*(гипербол|\/shurgegch-(hard|nalalt))).*(хөвч|шүргэгч(?!ийн налалт)|огтлогчуу|огтлогчийн|оройтой өнцг)/, 'Тойргийн чанар', ['\\text{Хөвчүүд: } AE \\cdot EB = CE \\cdot ED', '\\text{Шүргэгч, огтлогч: } PT^2 = PA \\cdot PB', '\\text{Шүргэгч} \\perp \\text{радиус}', 'PA = PB\\ \\text{— хоёр шүргэгч}', '\\text{Хөвч-шүргэгчийн өнцөг} = \\tfrac12\\ \\text{нум}', '\\text{Гадна оройтой: } \\tfrac12(\\text{нум}_1 - \\text{нум}_2)']],
    [/фалес/, 'Фалесын теорем', ['\\dfrac{AB}{BC} = \\dfrac{A_1B_1}{B_1C_1}', 'AA_1 \\parallel BB_1 \\parallel CC_1']],
    [/төсөөтэй(?! гишүүд)/, 'Төсөөтэй дүрс', ['\\dfrac{a_1}{a_2} = \\dfrac{b_1}{b_2} = \\dfrac{c_1}{c_2} = k', '\\dfrac{P_1}{P_2} = k,\\quad \\dfrac{S_1}{S_2} = k^2']],
    [/^(?!.*координат).*(параллель шулуун|зэрэгцээ шулуун|солбисон)/, 'Параллель шулуун', ['\\text{Тохирох өнцгүүд тэнцүү}', '\\text{Дотор солбисон өнцгүүд тэнцүү}', '\\text{Нэг талын дотор: } \\alpha + \\beta = 180^\\circ']],
    [/геометр байр|гомотети/, 'Геометр байр', ['OM = r\\ \\text{— тойрог}', 'MA = MB\\ \\text{— дундаж перпендикуляр}', 'OA_1 = k \\cdot OA\\ \\text{— гомотети}']],
    [/пифагор|pifagor/, 'Пифагорын теорем', ['a^2 + b^2 = c^2', 'c = \\sqrt{a^2 + b^2}']],
    [/гурвалжныг ангилах|гурвалжны төрөл|гурвалжин ба .*(ангилах|төрөл)/, 'Гурвалжны төрөл', ['\\text{Өнцгөөр: хурц, тэгш, мохоо}', '\\text{Талаар: зөв, адил хажуут, элдэв}', '\\angle A + \\angle B + \\angle C = 180^\\circ']],
    [/дөрвөн өнцөгтийг ангилах|дөрвөн өнцөгтийн төрөл/, 'Дөрвөн өнцөгт', ['\\text{Параллелограмм — эсрэг талууд} \\parallel', '\\text{Тэгш өнцөгт — 4 өнцөг } 90^\\circ', '\\text{Ромб — 4 тал тэнцүү}', '\\text{Квадрат — тэгш өнцөгт ромб}', '\\text{Трапец — 1 хос тал} \\parallel']],
    [/олон өнцөгт/, 'Олон өнцөгт', ['\\text{Дотоод өнцгүүд: } (n - 2) \\cdot 180^\\circ', '\\text{Гадаад өнцгүүд: } 360^\\circ', '\\text{Диагональ: } \\dfrac{n(n - 3)}{2}']],
    [/гурвалж|gurvaljin/, 'Гурвалжин', ['\\angle A + \\angle B + \\angle C = 180^\\circ', '\\text{Гадаад өнцөг} = \\angle A + \\angle B', 'S = \\tfrac{1}{2} a h_a = \\tfrac{1}{2} ab\\sin C', '\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = 2R', 'c^2 = a^2 + b^2 - 2ab\\cos C']],
    [/өнцөг|өнцг|ontsog/, 'Өнцөг', ['\\text{Тэгш} = 90^\\circ,\\quad \\text{дэлгэмэл} = 180^\\circ', '\\text{Хурц} < 90^\\circ < \\text{мохоо} < 180^\\circ', '\\text{Хамар өнцгүүд: } \\alpha + \\beta = 180^\\circ', '\\text{Босоо өнцгүүд тэнцүү}']],
    [/масштаб/, 'Масштаб', ['\\text{Масштаб} = \\dfrac{\\text{зураг дээрх урт}}{\\text{бодит урт}}', '1:1000 \\Rightarrow 1\\ \\text{см} = 10\\ \\text{м}']],
    [/тэгш хэмтэй дүрс/, 'Тэгш хэм', ['\\text{Тэнхлэг дүрсийг 2 ижил хэсэгт хуваана}', '\\text{Квадрат — 4, тэгш өнцөгт — 2 тэнхлэг}', '\\text{Тойрог — тоо томшгүй олон}']],
    [/биет таних|биет, түүний|дэлгээс/, 'Биет', ['\\text{Шоо: 6 талс, 12 ирмэг, 8 орой}', '\\text{Орой} - \\text{ирмэг} + \\text{талс} = 2', '\\text{Шоо: } S = 6a^2', '\\text{Параллелепипед: } S = 2(ab + bc + ac)']],
    [/талбай|talbai|периметр|perimetr/, 'Талбай, периметр', ['\\text{Тэгш өнцөгт: } S = ab,\\; P = 2(a + b)', '\\text{Гурвалжин: } S = \\tfrac{1}{2} a h', '\\text{Параллелограмм: } S = a h', '\\text{Трапец: } S = \\tfrac{a + b}{2} h', '\\text{Дугуй: } S = \\pi r^2']],
    [/тойрог|тойрг|toirog|дугуй|dugui/, 'Тойрог, дугуй', ['d = 2r', 'C = 2\\pi r = \\pi d', 'S = \\pi r^2', 'l = \\dfrac{\\pi r \\alpha}{180^\\circ}']],
    [/эзлэхүүн|ezlehuun|биет|цилиндр|конус|бөмбөг/, 'Эзлэхүүн', ['\\text{Шоо: } V = a^3', '\\text{Параллелепипед: } V = abc', '\\text{Цилиндр: } V = \\pi r^2 h', '\\text{Конус: } V = \\tfrac{1}{3}\\pi r^2 h', '\\text{Бөмбөрцөг: } V = \\tfrac{4}{3}\\pi r^3', '1\\ \\text{л} = 1\\ \\text{дм}^3 = 1000\\ \\text{см}^3']],
    // координат, вектор, матриц
    [/огторгуй|проекц|координатын хавтгайтай|оройн координат/, 'Огторгуй', ['d^2 = (x_2 - x_1)^2 + (y_2 - y_1)^2', '\\qquad + (z_2 - z_1)^2', 'M\\left(\\tfrac{x_1 + x_2}{2};\\ \\tfrac{y_1 + y_2}{2};\\ \\tfrac{z_1 + z_2}{2}\\right)', 'O\\text{-ийн тэгш хэм: } (-x;\\ -y;\\ -z)', 'Oxy\\text{-ийн тэгш хэм: } (x;\\ y;\\ -z)']],
    [/координат|koordinat|хоёр цэгийн зай|зай ба дундаж|дундаж цэг/, 'Координат', ['d = \\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2}', 'M\\left(\\dfrac{x_1 + x_2}{2};\\ \\dfrac{y_1 + y_2}{2}\\right)']],
    [/вектор|vektor/, 'Вектор', ['\\overrightarrow{AB} = (x_B - x_A;\\ y_B - y_A)', '\\vec a + \\vec b = (x_1 + x_2;\\ y_1 + y_2)', '|\\vec a| = \\sqrt{x^2 + y^2}', '\\vec a \\cdot \\vec b = x_1 x_2 + y_1 y_2']],
    [/^(?!.*тэгш хэмтэй дүрс).*(зөөлт|эргүүлэлт|байршил, хөдөлгөөн|тэгш хэм)/, 'Зөөлт, тэгш хэм', ['\\text{Зөөлт: } (x;\\ y) \\to (x + a;\\ y + b)', 'Ox\\text{: } (x;\\ y) \\to (x;\\ -y)', 'Oy\\text{: } (x;\\ y) \\to (-x;\\ y)', 'O\\text{: } (x;\\ y) \\to (-x;\\ -y)', '90^\\circ\\text{ эргүүлэлт: } (x;\\ y) \\to (-y;\\ x)']],
    [/крамер/, 'Крамерын дүрэм', ['\\Delta = \\begin{vmatrix} a_1 & b_1 \\\\ a_2 & b_2 \\end{vmatrix} = a_1 b_2 - a_2 b_1', 'x = \\dfrac{\\Delta_x}{\\Delta},\\ y = \\dfrac{\\Delta_y}{\\Delta},\\ z = \\dfrac{\\Delta_z}{\\Delta}', '\\Delta \\ne 0\\ \\text{— ганц шийдтэй}']],
    [/матриц|тодорхойлогч/, 'Матриц', ['\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc', 'A^{-1} = \\dfrac{1}{ad - bc}\\begin{pmatrix} d & -b \\\\ -c & a \\end{pmatrix}', 'AX = B \\Rightarrow X = A^{-1}B']],
    // тэнцэтгэл биш, прогресс, систем
    [/модул|modul/, 'Модуль', ['|a| = a\\ (a \\ge 0),\\quad |a| = -a\\ (a < 0)', '|x| < a \\iff -a < x < a', '|x| > a \\iff x < -a \\text{ эсвэл } x > a']],
    [/хагас хавтгай|шийдийн муж|шугаман программ|хоёр хувьсагчтай.*тэнцэтгэл биш/, 'Хагас хавтгай', ['y > kx + b\\ \\text{— шулууны дээд тал}', 'y < kx + b\\ \\text{— доод тал}', '\\text{Их, бага утга — мужийн оройд}']],
    [/тэнцэтгэл биш.*систем/, 'Тэнцэтгэл бишийн систем', ['\\text{Шийд — шийдүүдийн огтлолцол}', '\\{x > a;\\ x < b\\} \\Rightarrow a < x < b']],
    [/тэнцэтгэл биш|тоон завсар/, 'Тэнцэтгэл биш', ['a < b \\Rightarrow a + c < b + c', 'c > 0:\\ ac < bc;\\quad c < 0:\\ ac > bc', '[a;\\ b]:\\ a \\le x \\le b', '(a;\\ b):\\ a < x < b']],
    [/^(?!.*(үйлдлийн дараалал|арифметик дундаж|дүрс)).*(прогресс|дараал|daraalal)/, 'Прогресс', ['a_n = a_1 + (n - 1)d', 'S_n = \\dfrac{(a_1 + a_n)\\,n}{2}', 'b_n = b_1 q^{\\,n-1}', 'S_n = \\dfrac{b_1(q^n - 1)}{q - 1}']],
    [/^(?!.*координатын систем).*систем|штс|огтлолцлын цэг/, 'Тэгшитгэлийн систем', ['\\text{Орлуулах: нэгийг илэрхийлж орлуулна}', '\\text{Нэмэх: коэффициент тэнцүүлж нэмнэ}', '\\text{График: огтлолцлын цэг — шийд}', '\\dfrac{a_1}{a_2} \\ne \\dfrac{b_1}{b_2} \\Rightarrow \\text{ганц шийд}']],
    // шулуун, функц
    [/налалт|шулууны график|шугаман функц|шулууны тэгшитгэл|shugaman-funk|linear|y-kx|координатын арга — (параллель|перпендикуляр)|параллель\/перпендикуляр/, 'Шулуун, налалт', ['y = kx + b', 'k = \\dfrac{y_2 - y_1}{x_2 - x_1} = \\operatorname{tg}\\alpha', '\\parallel:\\ k_1 = k_2,\\qquad \\perp:\\ k_1 k_2 = -1']],
    [/y = a\/x²/, 'y = a/x²', ['y = \\dfrac{a}{x^2},\\quad x \\ne 0', '\\text{Тэгш функц: } Oy\\text{-ийн тэгш хэм}', 'a > 0 \\Rightarrow y > 0', '\\text{Асимптот: } x = 0,\\ y = 0']],
    [/y = a\/x(?!²)|гипербол/, 'Гипербол y = k/x', ['y = \\dfrac{k}{x},\\quad x \\ne 0', 'k > 0:\\ \\text{I, III мөч}', 'k < 0:\\ \\text{II, IV мөч}', '\\text{Асимптот: } x = 0,\\ y = 0']],
    [/axⁿ/, 'y = axⁿ', ['n\\ \\text{тэгш} \\Rightarrow \\text{тэгш функц}', 'n\\ \\text{сондгой} \\Rightarrow \\text{сондгой функц}']],
    [/давхар функц/, 'Давхар функц', ['(f \\circ g)(x) = f(g(x))', '\\text{Муж: } g(x) \\in D(f)']],
    [/урвуу функц|урвуутай|харилцан нэг утгатай/, 'Урвуу функц', ['y = f(x) \\iff x = f^{-1}(y)', 'f(f^{-1}(x)) = x', '\\text{Урвуутай} \\iff \\text{харилцан нэг утгатай}', '\\text{График } y = x\\text{-ийн хувьд тэгш хэмтэй}']],
    [/тэгш ба сондгой|тэгш\/сондгой|сондгой функц/, 'Тэгш, сондгой функц', ['\\text{Тэгш: } f(-x) = f(x),\\ \\text{тэнхлэг } Oy', '\\text{Сондгой: } f(-x) = -f(x),\\ \\text{төв } O']],
    [/өсөх|буурах/, 'Өсөх, буурах', ['x_1 < x_2 \\Rightarrow f(x_1) < f(x_2)\\ \\text{— өсөх}', 'x_1 < x_2 \\Rightarrow f(x_1) > f(x_2)\\ \\text{— буурах}', "f'(x) > 0 \\Rightarrow \\text{өсөх}"]],
    [/^(?!.*уламжлал).*(тодорхойлогдох|утгын муж|муж, дүр|муж ба дүр|муж, параметр|дүр ба|утгын завсар|харгалзаа|функц)/, 'Функц', ['y = f(x):\\ x\\text{ бүрд ганц } y', 'D(f)\\text{ — тодорхойлогдох муж}', 'E(f)\\text{ — утгын муж}', '\\sqrt{u}:\\ u \\ge 0;\\quad \\dfrac{1}{u}:\\ u \\ne 0', '\\text{Босоо шулуун 1 цэгт л огтолно}']],
    // статистик, магадлал, тоолол
    [/арифметик дундаж|өгөгд|далайц|дундаж утга|моод/, 'Өгөгдөл', ['\\bar x = \\dfrac{x_1 + x_2 + \\dots + x_n}{n}', '\\text{Медиан — эрэмбэлсэн өгөгдлийн дунд}', '\\text{Моод — хамгийн олон давтагдсан}', '\\text{Далайц} = \\max - \\min']],
    [/дүрсийн дараалал|дүрсэн дараалал|зүй тогтол|ерөнхий гишүүн/, 'Зүй тогтол', ['a_n = a_1 + (n - 1)d', 'd = a_2 - a_1', '\\text{Дараагийн гишүүн} = \\text{өмнөх} + d']],
    [/сэлгэмэл|хэлхээс|комбинатор|kombinator/, 'Комбинаторик', ['P_n = n!', 'A_n^k = \\dfrac{n!}{(n - k)!}', 'C_n^k = \\dfrac{n!}{k!\\,(n - k)!}']],
    [/магадлал|magadlal|үзэгдэл|үзэгдл|туршилт|зоос|шударга тоглоом|нийцгүй|нийцтэй/, 'Магадлал', ['P(A) = \\dfrac{m}{n},\\quad P(\\bar A) = 1 - P(A)', '\\text{Нийцгүй: } P(A \\cup B) = P(A) + P(B)', '\\text{Нийцтэй: мөн } P(A \\cap B)\\text{-г хасна}', '\\text{Хоёр шоо: } 6 \\cdot 6 = 36\\ \\text{үр дүн}']],
    [/эйлер|венн|олонлог/, 'Олонлог', ['|A \\cup B| = |A| + |B| - |A \\cap B|', 'A \\cap B\\ \\text{— огтлолцол}', 'A \\cup B\\ \\text{— нэгдэл}']],
    [/боломж|тоолох бодлог|үржвэрийн зарчим|тоо зохиох/, 'Тоолох', ['\\text{Үржвэрийн зарчим: } m \\cdot n', '\\text{Нэмэх зарчим: } m + n', '\\text{Боломж} = \\dfrac{\\text{таатай}}{\\text{бүгд}}']],
    [/хэллэг/, 'Хэллэг', ['\\text{Үнэн эсвэл худал өгүүлбэр}', '\\neg A\\ \\text{— үгүйсгэл}', 'A \\land B,\\quad A \\lor B,\\quad A \\Rightarrow B']],
    [/турших арга/, 'Турших арга', ['\\text{Утгуудыг орлуулж шалгана}', '\\text{Бүхэл шийд — сул гишүүний хуваагч}']],
    // тэгшитгэл
    [/тэгшитгэл — [345]-р анги|үл мэдэгдэгч/, 'Үл мэдэгдэгчийг олох', ['x + a = b \\Rightarrow x = b - a', 'x - a = b \\Rightarrow x = b + a', 'a - x = b \\Rightarrow x = a - b', 'x \\cdot a = b \\Rightarrow x = b : a', 'x : a = b \\Rightarrow x = b \\cdot a']],
    [/^(?!.*(квадрат|илтгэгч|рационал|модул|логарифм|тригонометр|— [345]-р анги)).*(шугаман тэгшитгэл|тэгшитгэл зохи|тэгшитгэл —|тэгшитгэл ба дүрс|бутархайтай тэгшитгэл|тэгшитгэл бичих)/, 'Шугаман тэгшитгэл', ['ax + b = 0 \\Rightarrow x = -\\dfrac{b}{a}\\ (a \\ne 0)', 'a = b \\iff a + c = b + c', 'a = b \\iff ac = bc\\ (c \\ne 0)', '\\text{Шалгах: олсон утгаа орлуулна}']],
    // харьцаа, хувь, бутархай
    [/пропорц|proporc|харьцаа|haritsaa/, 'Пропорц', ['\\dfrac{a}{b} = \\dfrac{c}{d} \\iff ad = bc', 'a : b = ak : bk\\ (k \\ne 0)', 'y = kx\\ \\text{— шууд},\\quad y = \\dfrac{k}{x}\\ \\text{— урвуу}', '\\text{Харьцаагаар хуваах } (a : b):', '\\dfrac{a}{a + b} S,\\quad \\dfrac{b}{a + b} S']],
    [/хувь(?!сагч)|хувий|процент/, 'Хувь', ['a\\text{-ийн } p\\% = \\dfrac{a \\cdot p}{100}', 'p = \\dfrac{a}{b} \\cdot 100\\%', '\\text{Өсөлт } p\\%:\\ a\\left(1 + \\tfrac{p}{100}\\right)', '\\text{Бууралт } p\\%:\\ a\\left(1 - \\tfrac{p}{100}\\right)']],
    [/^(?!.*илтгэгч).*(рационал тоо|ижил хуваарь|бутархай|butarhai)/, 'Бутархай', ['\\dfrac{a}{b} \\pm \\dfrac{c}{d} = \\dfrac{ad \\pm bc}{bd}', '\\dfrac{a}{b} \\cdot \\dfrac{c}{d} = \\dfrac{ac}{bd},\\quad \\dfrac{a}{b} : \\dfrac{c}{d} = \\dfrac{ad}{bc}', '\\dfrac{a}{b} = \\dfrac{ak}{bk}\\ (k \\ne 0)', 'a\\tfrac{b}{c} = \\dfrac{ac + b}{c}', '0{,}4 = 0{,}40 > 0{,}35']],
    [/хялбарч|ижил гишүүд|төсөөтэй гишүүд|алгебрын илэрхийлэл|алгебр илэрхийлэл|илэрхийллийн утга|утга олох|алгебрын сонгон|хаалт задлах/, 'Илэрхийлэл хялбарчлах', ['ax + bx = (a + b)x', 'a(b + c) = ab + ac', '-(a - b) = b - a', '\\text{Утга: үсгийн оронд тоо орлуулна}']],
    // тоо
    [/^(?!.*(бутархай|илтгэгч)).*(эерэг|сөрөг|бүхэл тоо|тоон шулуун)/, 'Эерэг, сөрөг тоо', ['(+)(+) = +,\\quad (-)(-) = +', '(+)(-) = -', 'a - b = a + (-b),\\quad -(-a) = a', '|-a| = a,\\quad -5 < -2']],
    [/ром тоо/, 'Ром тоо', ['\\mathrm{I} = 1,\\ \\mathrm{V} = 5,\\ \\mathrm{X} = 10,\\ \\mathrm{L} = 50', '\\mathrm{C} = 100,\\ \\mathrm{D} = 500,\\ \\mathrm{M} = 1000', '\\mathrm{IV} = 4,\\ \\mathrm{IX} = 9,\\ \\mathrm{XL} = 40,\\ \\mathrm{XC} = 90']],
    [/анхны тоо|анхны үржигдэхүүн/, 'Анхны тоо', ['\\text{Зөвхөн 1 ба өөртөө хуваагдана}', '2,\\ 3,\\ 5,\\ 7,\\ 11,\\ 13,\\ 17,\\ 19,\\ 23,\\ 29,\\ \\dots', '60 = 2^2 \\cdot 3 \\cdot 5']],
    [/хиех|хбех/, 'ХИЕХ, ХБЕХ', ['12 = 2^2 \\cdot 3,\\quad 18 = 2 \\cdot 3^2', '\\text{ХИЕХ} = 2 \\cdot 3 = 6', '\\text{ХБЕХ} = 2^2 \\cdot 3^2 = 36', '\\text{ХИЕХ} \\cdot \\text{ХБЕХ} = a \\cdot b']],
    [/хуваагдах тооны шинж|хуваагч|хуваагдагч/, 'Хуваагдах шинж', ['2:\\ \\text{сүүлийн цифр тэгш}', '3:\\ \\text{цифрийн нийлбэр 3-т хуваагдана}', '9:\\ \\text{цифрийн нийлбэр 9-д хуваагдана}', '5:\\ \\text{0 эсвэл 5-аар төгсөнө}', '10:\\ \\text{0-ээр төгсөнө}']],
    [/хүрд/, 'Үржүүлэх хүрд', ['a \\cdot b = b \\cdot a', '9 \\cdot n = 10 \\cdot n - n', '5 \\cdot n = 10 \\cdot n : 2', 'a : b = c \\iff c \\cdot b = a']],
    [/хялбар арга|хялбар тооцоолол|арав, зуугаар/, 'Хялбар тооцоолол', ['37 \\cdot 10 = 370,\\quad 37 \\cdot 100 = 3700', '3700 : 100 = 37', '25 \\cdot 4 = 100,\\quad 125 \\cdot 8 = 1000', 'a(b + c) = ab + ac']],
    // текст бодлого
    [/хөдөлгөөний бодлого|хурд/, 'Хөдөлгөөн', ['s = v \\cdot t,\\quad v = \\dfrac{s}{t},\\quad t = \\dfrac{s}{v}', '\\text{Угтан: } v_1 + v_2,\\quad \\text{хөөж: } v_1 - v_2']],
    [/ажлын бодлого/, 'Ажлын бодлого', ['A = p \\cdot t', '\\text{ажил} = \\text{бүтээмж} \\times \\text{хугацаа}', '\\text{Хамт: } \\dfrac{1}{t} = \\dfrac{1}{t_1} + \\dfrac{1}{t_2}']],
    [/худалдаа/, 'Худалдаа', ['\\text{Үнэ} = \\text{нэгжийн үнэ} \\times \\text{тоо}', '\\text{Хариулт} = \\text{төлсөн} - \\text{үнэ}']],
    [/дахин багасгах|дахин ихэсгэх|зөрүү ба харьцуулах/, 'Харьцуулах', ['k\\ \\text{дахин их: } a = k \\cdot b', 'k\\ \\text{дахин бага: } a = b : k', 'c\\text{-ээр их: } a = b + c']],
    [/хэрчмийн арга|нийлбэр-зөрүү/, 'Нийлбэр, ялгавраар', ['x + y = S,\\quad x - y = d', 'x = \\dfrac{S + d}{2},\\quad y = \\dfrac{S - d}{2}']],
    [/нийлбэрийг үржвэр/, 'Нийлбэр ба үржвэр', ['\\underbrace{a + a + \\dots + a}_{n} = n \\cdot a']],
    [/үйлдлийн дараалал|холимог үйлдэл/, 'Үйлдлийн дараалал', ['1)\\ \\text{Хаалт}', '2)\\ \\text{Зэрэг}', '3)\\ \\times,\\ :\\ \\text{— зүүнээс баруун}', '4)\\ +,\\ -\\ \\text{— зүүнээс баруун}']],
    [/тоймл|тойролт|toimloh/, 'Тоймлох', ['\\text{Дараагийн цифр } \\ge 5 \\Rightarrow +1', '\\text{Дараагийн цифр } < 5 \\Rightarrow \\text{хэвээр}', '\\text{Зуут хүртэл: } 3\\,746 \\approx 3\\,700']],
    [/эеш|eesh/, 'ЭЕШ — гол томьёо', ['x_{1,2} = \\dfrac{-b \\pm \\sqrt{D}}{2a},\\quad D = b^2 - 4ac', '\\log_a(xy) = \\log_a x + \\log_a y', '\\sin^2\\alpha + \\cos^2\\alpha = 1', "(x^n)' = n x^{n-1}", 'S_n = \\dfrac{(a_1 + a_n)n}{2}']],
    [/олимпиад/, 'Олимпиад', ['1 + 2 + \\dots + n = \\dfrac{n(n + 1)}{2}', '\\text{тэгш} + \\text{сондгой} = \\text{сондгой}', 'a \\equiv b \\pmod m \\iff m \\mid (a - b)']],
    // ерөнхий (4 дэх 1 — сул): тусгай сэдэв таарвал гарахгүй
    [/өгүүлбэртэй бодлого|хоёр үйлдэлтэй|үйлдлийн гишүүд|гинжин үйлдэл|урвуу бодлого/, 'Бодлого бодох', ['a + b = c \\Rightarrow a = c - b', 'a - b = c \\Rightarrow a = b + c', 'a \\cdot b = c \\Rightarrow a = c : b', '\\text{Өгөгдөл} \\to \\text{бодолт} \\to \\text{шалгах}'], 1],
    [/дүрс/, 'Дүрс', ['\\text{Гурвалжин — 3 тал, 3 өнцөг}', '\\text{Тэгш өнцөгт — 4 тэгш өнцөг}', '\\text{Квадрат — 4 тал тэнцүү}', '\\text{Тойрог — төвөөс ижил зайтай}'], 1],
    [/урт, хугацаа|хүндийг|хугацааг|хэмжих/, 'Хэмжих нэгж', ['1\\ \\text{км} = 1000\\ \\text{м}', '1\\ \\text{м} = 100\\ \\text{см} = 1000\\ \\text{мм}', '1\\ \\text{т} = 1000\\ \\text{кг},\\quad 1\\ \\text{кг} = 1000\\ \\text{г}', '1\\ \\text{хоног} = 24\\ \\text{цаг}', '1\\ \\text{цаг} = 60\\ \\text{мин},\\quad 1\\ \\text{мин} = 60\\ \\text{с}'], 1],
    [/үржих|үржүүлэх|үржвэр/, 'Үржүүлэх', ['a \\cdot b = b \\cdot a', '(a \\cdot b) \\cdot c = a \\cdot (b \\cdot c)', 'a(b + c) = ab + ac', '\\text{Баганаар: нэгжээс эхэлж үржүүлнэ}'], 1],
    [/хуваах|хуваалт/, 'Хуваах', ['a = b \\cdot q + r,\\quad 0 \\le r < b', '\\text{Шалгах: } q \\cdot b + r = a', 'a : 1 = a,\\quad a : a = 1,\\quad 0 : a = 0', '\\text{Тэгт хуваахгүй}'], 1],
    [/^(?!.*нэмэх арга).*(нэмэх|хасах)/, 'Нэмэх, хасах', ['a + b = b + a', '(a + b) + c = a + (b + c)', 'a - b = c \\iff c + b = a', '\\text{Баганаар: ижил оронг дор нь бичнэ}'], 1],
    [/тоог унших|унших, бичих|тоог жиших|бутархайг жиших|бутархай жиших|эрэмбэлэх|хүртэлх тоо|олон оронтой тоо/, 'Тоо, орон', ['1\\,000\\,000 = 10^6\\ (\\text{сая})', '\\text{Орон: нэгж, аравт, зуут, мянгат}', '\\text{Олон оронтой нь их}', '\\text{Тэнцүү бол ахлах оронгоос жишнэ}'], 1],
  ];
  // Сэдэв таарахгүй (бүлгийн жишиг даалгавар, шалгалтын материал, давтлага) — тухайн ангийн гол томьёо
  var GRADE_HINTS = {
    2: ['a + b = b + a,\\quad a \\times b = b \\times a', '12 \\div 3 = 4 \\iff 4 \\times 3 = 12', '1\\ \\text{м} = 100\\ \\text{см},\\ 1\\ \\text{см} = 10\\ \\text{мм}', '1\\ \\text{цаг} = 60\\ \\text{минут}'],
    3: ['a + b = b + a,\\quad a \\cdot b = b \\cdot a', 'a(b + c) = ab + ac', '1\\ \\text{м} = 100\\ \\text{см},\\ 1\\ \\text{цаг} = 60\\ \\text{мин}'],
    4: ['a = b \\cdot q + r,\\quad r < b', 's = v \\cdot t', '1\\ \\text{кг} = 1000\\ \\text{г},\\ 1\\ \\text{км} = 1000\\ \\text{м}'],
    5: ['\\dfrac{a}{b} \\cdot \\dfrac{c}{d} = \\dfrac{ac}{bd}', 'S = ab,\\quad P = 2(a + b)', '\\text{Хуваагдах шинж: 2, 3, 5, 9, 10}'],
    6: ['(-)(-) = +,\\quad (+)(-) = -', 'ax + b = 0 \\Rightarrow x = -\\tfrac{b}{a}', 'p\\% = \\tfrac{p}{100}', 'a(b + c) = ab + ac'],
    7: ['ax + bx = (a + b)x', '(a + b)(c + d) = ac + ad + bc + bd', 'x^m x^n = x^{m+n}', 'P(A) = \\tfrac{m}{n}'],
    8: ['y = kx + b,\\quad k = \\tfrac{y_2 - y_1}{x_2 - x_1}', '\\text{Систем: орлуулах, нэмэх, график}', 'c < 0:\\ a < b \\Rightarrow ac > bc', 'a \\cdot 10^n,\\quad 1 \\le a < 10'],
    9: ['(a \\pm b)^2 = a^2 \\pm 2ab + b^2', 'a^2 - b^2 = (a - b)(a + b)', 'x_{1,2} = \\tfrac{-b \\pm \\sqrt{D}}{2a}', 'a^2 + b^2 = c^2'],
    10: ['y = \\tfrac{k}{x},\\quad y = a^x', 'k_1 k_2 = -1 \\iff \\perp', '\\tfrac{P(x)}{Q(x)} = 0 \\iff P = 0,\\ Q \\ne 0', '|x| < a \\iff -a < x < a'],
    11: ['\\sin^2\\alpha + \\cos^2\\alpha = 1', '180^\\circ = \\pi', '\\text{Тэгш: } f(-x) = f(x)', '\\det\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix} = ad - bc'],
    12: ["(x^n)' = n x^{n-1}", '\\int x^n dx = \\tfrac{x^{n+1}}{n + 1} + C', '\\log_a b = \\tfrac{\\ln b}{\\ln a}', "(e^x)' = e^x"],
  };
  // txt — хуудасны гарчиг (document.title — «(N-р анги)»-тай) + хаяг; ихдээ 2 карт. Ерөнхий (сул) карт зөвхөн тусгай нь
  // олдоогүй үед. Сэдэв огт таарахгүй бол ангийн гол томьёо.
  function hintsFor(txt) {
    txt = String(txt || '').toLowerCase().replace(/\s+/g, ' ');
    var all = HINTS.filter(function (x) { return x[0].test(txt); }), strong = all.filter(function (x) { return !x[3]; });
    var out = (strong.length ? strong : all).slice(0, 2);
    var g = /(\d{1,2})-р анги/.exec(txt);
    if (!out.length && g && GRADE_HINTS[+g[1]]) out = [[null, g[1] + '-р анги — гол томьёо', GRADE_HINTS[+g[1]]]];
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { newPage: newPage, emptyGeo: emptyGeo, addStroke: addStroke, clearPage: clearPage, delStrokes: delStrokes, geoOp: geoOp, undo: undo, redo: redo,
      inPoly: inPoly, polyArea: polyArea, insideFrac: insideFrac, eraseLasso: eraseLasso, gestureOf: gestureOf, palmAt: palmAt,
      normStroke: normStroke, inkOn: inkOn, INK_L: INK_L, INK_D: INK_D, compileFn: compileFn, calcEval: calcEval, toFrac: toFrac, fmtCalc: fmtCalc,
      fmtNum: fmtNum, ptName: ptName, normGeo: normGeo, HINTS: HINTS, GRADE_HINTS: GRADE_HINTS, hintsFor: hintsFor };
    return;
  }

  var D = document, W = root;
  // Тодруулагчийн өнгө (6)
  var HLS = [['#FACC15', 'Шар'], ['#4ADE80', 'Ногоон'], ['#F472B6', 'Ягаан'], ['#60A5FA', 'Цэнхэр'], ['#FB923C', 'Улбар шар'], ['#C084FC', 'Нил ягаан']];
  var PENS = [['pen', 'Үзэг'], ['pencil', 'Харандаа'], ['hl', 'Тодруулагч']];
  var WR = { pen: [1, 24, 3], pencil: [1, 16, 2], hl: [8, 60, 22] }, ER_R = [12, 120, 34];     // зузаан: [доод, дээд, анхдагч] px
  var SHEET_W = 793.7, UNIT = 40;            // 210мм; координатын нэгж (px, томруулаагүй үед)
  var BGS = [['grid', 'Тор'], ['lines', 'Шугам'], ['blank', 'Хоосон'], ['coord', 'Координат']];
  var TONES = [['white', 'Цагаан', '#ffffff'], ['black', 'Хар', '#15171e'], ['green', 'Ногоон', '#1d3a2c'], ['navy', 'Хөх', '#14213d']];
  var GEO_T = [['pt', 'Цэг'], ['seg', 'Хэрчим'], ['line', 'Шулуун'], ['ray', 'Цацраг'], ['curve', 'Муруй'], ['poly', 'Олон өнцөгт'], ['circ', 'Тойрог'],
    ['tri', 'Гурвалжин'], ['rect', 'Тэгш өнцөгт'], ['move', 'Зөөх'], ['del', 'Устгах']];
  // Хоёр дахь хуруу: эхний зурлага 600мс, 30px-ээс бага бол «хоёр хуруу»; 320px-ээс хол бол өөр гар (тоохгүй)
  var EARLY = 600, SHORT = 30, NEAR = 320;
  var st = { on: false, ro: false, pages: [newPage()], cur: 0, tool: 'pen', color: INK_L[0][0], hl: HLS[0][0], wid: { pen: WR.pen[2], pencil: WR.pencil[2], hl: WR.hl[2] },
    erW: ER_R[2], eraser: false, erMode: 'draw', gest: true, bg: 0, tone: 0, frac: 0.58, z: null, geo: null,
    calc: { open: false, fx: null, fy: null, e: '', r: null, err: false, deg: true, frac: false, ans: 0, done: false, sec: false } };
  var el = {}, ctx = null, octx = null, bctx = null, dpr = 1, live = null, curZ = 1, rv = 0, PAT = {};
  var tp = {}, dead = {}, minS = Infinity;     // идэвхтэй хүрэлтүүд (id → {x, y, s}), тоохгүй хүрэлтүүд, хамгийн жижиг хүрэлт
  var gp = null, hv = null;                    // геометр: олон дарлагатай хэрэгслийн сонгосон цэгүүд, заагчийн байрлал (дэлгэц)
  var clamp = function (v, r) { v = +v; return isFinite(v) ? Math.max(r[0], Math.min(r[1], v)) : r[2]; };
  try { var f = parseFloat(localStorage.getItem('cm_wsb_w')); if (f >= 0.35 && f <= 0.75) st.frac = f; } catch (e) {}
  try { if (localStorage.getItem('cm_wsb_er') === 'lasso') st.erMode = 'lasso'; if (localStorage.getItem('cm_wsb_g') === '0') st.gest = false; } catch (e) {}
  try {
    var pt0 = JSON.parse(localStorage.getItem('cm_wsb_pt') || 'null') || {};
    if (WR[pt0.t]) st.tool = pt0.t;
    if (pt0.w) PENS.forEach(function (t) { if (pt0.w[t[0]] != null) st.wid[t[0]] = clamp(pt0.w[t[0]], WR[t[0]]); });
    if (pt0.e != null) st.erW = clamp(pt0.e, ER_R);
    var bg0 = JSON.parse(localStorage.getItem('cm_wsb_bg') || 'null') || {};
    if (bg0.b >= 0 && bg0.b < BGS.length) st.bg = bg0.b | 0;
    if (bg0.t >= 0 && bg0.t < TONES.length) { st.tone = bg0.t | 0; if (st.tone) st.color = INK_D[0][0]; }
  } catch (e) {}
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function savePt() { save('cm_wsb_pt', JSON.stringify({ t: st.tool, w: st.wid, e: st.erW })); }
  function saveBg() { save('cm_wsb_bg', JSON.stringify({ b: st.bg, t: st.tone })); }
  function bump() { rv++; }                    // компьютерын самбарын өөрчлөлт («Самбарт илгээх» дагалт)
  function dark() { return st.tone > 0; }
  function isCoord() { return BGS[st.bg][0] === 'coord'; }
  function cloneGeo(g) { return JSON.parse(JSON.stringify(g)); }

  var I = function (d, w) { return '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (w || 22) + '" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var DOT = function (x, y) { return '<circle cx="' + x + '" cy="' + y + '" r="2" fill="currentColor"/>'; };
  var ICO = {
    pen: I('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    pencil: I('<path d="M21.2 6.8a2.8 2.8 0 0 0-4-4L3.8 16.2a2 2 0 0 0-.5.8l-1.3 4.4a.5.5 0 0 0 .6.6l4.4-1.3a2 2 0 0 0 .8-.5z"/><path d="m15 5 4 4"/>'),
    hl: I('<path d="m9 11-6 6v3h9l3-3"/><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4"/>'),
    eraser: I('<path d="M19 20H8.5l-4.2-4.3a1.5 1.5 0 0 1 0-2.1L14 4a1.5 1.5 0 0 1 2.1 0l4.2 4.2a1.5 1.5 0 0 1 0 2.1L11 20"/><path d="M18 13.3 10.7 6"/>'),
    lasso: I('<path d="M7 15.6C3.9 14.2 2.8 11 4.7 8.2 7.4 4.4 14.7 3.5 18.6 6.3c3 2.2 2.2 6-1.9 7.7-2.6 1.1-5.6 1.3-8.3.8" stroke-dasharray="2.6 2.4"/><path d="M8.6 14.9c-1.7.9-2.2 2.7-1 4 1 1.1 2.9.8 3.2-.7"/>'),
    caret: I('<path d="m6 15 6-6 6 6"/>', 14),
    undo: I('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    redo: I('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    trash: I('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    grid: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>'),
    lines: I('<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18"/>'),
    blank: I('<rect x="3" y="3" width="18" height="18" rx="2"/>'),
    coord: I('<path d="M12 21V3M3 12h18"/><path d="m9 6 3-3 3 3M18 9l3 3-3 3"/><path d="M6 18c2.5-5.5 5-8 11-9.5"/>'),
    geo: I('<path d="M12 4.5 4 19h16z"/>' + DOT(12, 4.5) + DOT(4, 19) + DOT(20, 19)),
    pt: I('<circle cx="12" cy="12" r="4.5" fill="currentColor"/>'),
    seg: I('<path d="M5 19 19 5"/>' + DOT(5, 19) + DOT(19, 5)),
    line: I('<path d="M2 22 22 2"/>' + DOT(8, 16) + DOT(16, 8)),
    ray: I('<path d="M5 19 22 2"/>' + DOT(5, 19) + DOT(13, 11)),
    poly: I('<path d="M5 18 3.5 9 12 3.5 20.5 9 19 18z"/>'),
    curve: I('<path d="M3 19C6 9 8.5 6 12 6s6 3 9 13"/>' + DOT(3, 19) + DOT(12, 6) + DOT(21, 19)),
    circ: I('<circle cx="12" cy="12" r="8.5"/>' + DOT(12, 12)),
    tri: I('<path d="M12 4 3 20h18z"/>'),
    rect: I('<rect x="3" y="6" width="18" height="12" rx="1"/>'),
    move: I('<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>'),
    del: I('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
    calc: I('<rect x="5" y="2.5" width="14" height="19" rx="2.5"/><path d="M8.5 6.5h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>'),
    center: I('<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>', 20),
    hand: I('<path d="M18 11V6a2 2 0 0 0-4 0v1M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-6-2.4l-3.6-3.6a2 2 0 0 1 2.8-2.8L6 15"/>', 20),
    bulb: I('<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.3 1.1 2.2h5c0-.9.3-1.6 1.1-2.2A6 6 0 0 0 12 3z"/>'),
    prev: I('<path d="m15 18-6-6 6-6"/>'), next: I('<path d="m9 18 6-6-6-6"/>'),
    plus: I('<path d="M12 5v14M5 12h14"/>'), minus: I('<path d="M5 12h14"/>'), close: I('<path d="M6 6l12 12M18 6 6 18"/>'),
  };
  // Заагч: бичих хэсэгт улаан цэг (эзэмшигч: «Бичих хэсэгт улаан цэг гарч ирдэг байлгая. Одоо бол нэмэх тэмдэг»), зурж арилгахад баллуурын дугуй
  function svgCur(svg, x, y, fb) { return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") ' + x + ' ' + y + ', ' + fb; }
  var CUR_DOT = svgCur('<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><circle cx="8" cy="8" r="5" fill="#ef4444" stroke="#fff" stroke-width="2"/></svg>', 8, 8, 'crosshair');
  function curEr(w) {
    var d = Math.round(Math.max(12, Math.min(124, w + 2))), h = d / 2;
    return svgCur('<svg xmlns="http://www.w3.org/2000/svg" width="' + d + '" height="' + d + '"><circle cx="' + h + '" cy="' + h + '" r="' + (h - 1.5) + '" fill="rgba(255,255,255,.35)" stroke="#7B52EE" stroke-width="2"/></svg>', Math.round(h), Math.round(h), 'cell');
  }

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
      + '.wsb-paper{position:relative;flex:1;min-height:0;background-color:#fff;overflow:hidden}'
      /* Тор, шугам — дэвсгэрийн канвас дээр (гүйлгэх, томруулахад бичгийн хамт хөдөлнө) */
      + '.wsb-paper canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;cursor:crosshair}'
      + '.wsb-paper canvas.wsb-bgc{pointer-events:none}'
      /* Түр давхарга: хүрээлэх зам, баллуурын хүрээ, бичиж буй харандаа/тодруулагч (үржүүлэх холимог — бичгийг халхлахгүй) */
      + '.wsb-paper canvas.wsb-ov{pointer-events:none;mix-blend-mode:multiply}'
      /* Бараан самбар (хар · ногоон · хөх) */
      + '#wsBoard.wsb-dark .wsb-paper canvas.wsb-ov{mix-blend-mode:normal}'
      + '#wsBoard.wsb-dark .wsb-pin{background:#10141c;color:#f1f5f9;border-bottom-color:#273042}'
      + '#wsBoard.wsb-dark .wsb-pin .wsb-task{color:#c4b5fd}'
      + '#wsBoard.wsb-dark .wsb-pin .wsb-empty{color:#94a3b8}'
      /* Координатын хавтгайн томруулалт (самбарын зүүн доод буланд) */
      + '.wsb-zc{position:absolute;left:12px;bottom:12px;z-index:2;display:flex;align-items:center;gap:6px;padding:5px;background:rgba(255,255,255,.95);'
        + 'border:1px solid #E4DAFF;border-radius:16px;box-shadow:0 12px 30px -18px rgba(60,30,150,.55)}'
      + '.wsb-zc[hidden],#wsBoard.wsb-ro .wsb-zc{display:none}'
      + '.wsb-zc button{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-width:44px;height:44px;padding:0 8px;border-radius:12px;'
        + 'border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:14px;font-weight:800;cursor:pointer}'
      + '.wsb-zc span{min-width:54px;text-align:center;font-weight:800;color:#5a32d6;font-size:14px}'
      + '.wsb-zc button.on{background:#F1EBFF;border-color:#7B52EE;color:#4B2BBF}'
      /* Гүйлгэх зурвас (баруун талд) — чирж, дарж гүйлгэнэ */
      + '.wsb-vs{position:absolute;top:10px;right:4px;bottom:10px;width:22px;z-index:2;touch-action:none;cursor:pointer}'
      + '.wsb-vs::before{content:"";position:absolute;top:0;bottom:0;left:7px;width:8px;border-radius:6px;background:rgba(123,82,238,.10)}'
      + '.wsb-vs i{position:absolute;left:5px;width:12px;min-height:36px;border-radius:7px;background:rgba(123,82,238,.5);cursor:grab}'
      + '#wsBoard.wsb-ro .wsb-vs{pointer-events:none}'
      + '.wsb-tools{flex:none;display:flex;align-items:center;gap:5px;flex-wrap:wrap;padding:8px 10px;border-top:1px solid #EEE8FF;background:#fff}'
      + '.wsb-tools button{flex:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;height:48px;padding:0 10px;'
        + 'border-radius:14px;border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:15px;font-weight:800;cursor:pointer}'
      + '.wsb-tools button:active{transform:translateY(1px)}'
      + '.wsb-tools button.on{background:#F1EBFF;border-color:#7B52EE;color:#4B2BBF}'
      + '.wsb-tools .wsb-pt,.wsb-tools .wsb-bg{padding:0 6px 0 10px}'
      + '.wsb-tools .wsb-er,.wsb-tools .wsb-col,.wsb-tools .wsb-geo{gap:3px;padding:0 6px 0 10px}'
      + '.wsb-tools .wsb-col i{display:block;width:26px;height:26px;border-radius:50%;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(0,0,0,.16)}'
      + '.wsb-tools button>svg:last-child:not(:first-child){opacity:.5}'
      + '.wsb-tools .wsb-sep{width:1px;height:30px;background:#EEE8FF;margin:0 2px}'
      + '.wsb-tools .wsb-n{min-width:64px;text-align:center;font-weight:800;color:#5a32d6;font-size:15px}'
      + '.wsb-tools .wsb-close{margin-left:auto;background:#7B52EE;border-color:#7B52EE;color:#fff}'
      /* Цэсүүд (хэрэгсэл, өнгө, баллуур, геометр, дэвсгэр) — товчныхоо дээр */
      + '.wsb-menu{position:absolute;z-index:3;box-sizing:border-box;width:280px;display:flex;flex-direction:column;gap:6px;padding:8px;background:#fff;'
        + 'border:1px solid #E4DAFF;border-radius:18px;box-shadow:0 18px 44px -18px rgba(60,30,150,.55)}'
      + '.wsb-menu[hidden]{display:none}'
      + '.wsb-menu button{box-sizing:border-box;display:flex;align-items:center;gap:12px;width:100%;height:54px;padding:0 14px;border-radius:13px;'
        + 'border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:16px;font-weight:800;cursor:pointer;text-align:left}'
      + '.wsb-menu button.on{background:#F1EBFF;border-color:#7B52EE;color:#4B2BBF}'
      + '.wsb-menu button:disabled{opacity:.45;cursor:default}'
      + '.wsb-mh{padding:4px 6px 0;font-size:12.5px;font-weight:800;color:#8A84A8}'
      + '.wsb-row{display:grid;grid-template-columns:1fr 1fr;gap:6px}'
      + '.wsb-menu .wsb-row button{height:48px;gap:8px;padding:0 10px;font-size:14px}'
      + '.wsb-row i{flex:none;width:22px;height:22px;border-radius:7px;box-shadow:inset 0 0 0 1.5px rgba(0,0,0,.18)}'
      + '.wsb-sws{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:2px}'
      + '.wsb-menu .wsb-sws button{height:54px;padding:0;justify-content:center;border-radius:14px;background:transparent}'
      + '.wsb-sws i{display:block;width:30px;height:30px;border-radius:50%;box-shadow:0 0 0 2px #fff,0 0 0 3.5px rgba(0,0,0,.14)}'
      + '.wsb-menu .wsb-sws button.on{border-color:#7B52EE;box-shadow:0 0 0 2px #7B52EE inset}'
      + '.wsb-wd{padding:8px 4px 2px;margin-top:2px;border-top:1px solid #F0EBFF}'
      + '.wsb-wd-h{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:800;color:#6b6590}'
      + '.wsb-wd-h b{color:#4B2BBF}'
      + '.wsb-wd svg{display:block;width:100%;height:44px;margin:6px 0 2px;border-radius:10px;box-shadow:inset 0 0 0 1px #EEE8FF}'
      + '.wsb-wd input{display:block;width:100%;height:34px;margin:0;accent-color:#7B52EE;cursor:pointer}'
      + '.wsb-erm .wsb-erm-all{color:#B42318}'
      + '.wsb-erm label{display:flex;align-items:center;gap:10px;min-height:52px;padding:6px 8px 2px;margin-top:2px;border-top:1px solid #F0EBFF;'
        + 'font-size:14px;font-weight:800;color:#4b3f7a;cursor:pointer;line-height:1.3}'
      + '.wsb-erm label input{flex:none;width:22px;height:22px;margin:0;accent-color:#7B52EE}'
      + '.wsb-erm label small{display:block;font-size:12px;font-weight:700;color:#8A84A8}'
      + '.wsb-geom{width:300px}'
      + '.wsb-fn{display:flex;align-items:center;gap:6px;padding:8px 2px 0;margin-top:2px;border-top:1px solid #F0EBFF}'
      + '.wsb-fn b{font:italic 700 18px "Times New Roman",serif;color:#3F3A5C;white-space:nowrap}'
      + '.wsb-fn input{flex:1;min-width:0;height:44px;box-sizing:border-box;border:1.5px solid #E7E0FA;border-radius:12px;padding:0 10px;font:inherit;font-size:16px;font-weight:700;color:#1f1d2e;outline-color:#7B52EE}'
      + '.wsb-menu .wsb-fn button{width:auto;height:44px;padding:0 14px;background:#7B52EE;border-color:#7B52EE;color:#fff;font-size:15px}'
      + '.wsb-fn-m{min-height:16px;padding:0 4px;font-size:12px;font-weight:700;color:#B42318}'
      /* Тооны машин — чирж зөөнө */
      + '.wsb-calc{position:absolute;z-index:4;box-sizing:border-box;width:348px;background:#fff;border:1px solid #E4DAFF;border-radius:20px;'
        + 'box-shadow:0 24px 60px -24px rgba(60,30,150,.6);overflow:hidden;font-family:inherit}'
      + '.wsb-calc[hidden]{display:none}'
      + '.wsb-ch{display:flex;align-items:center;gap:6px;height:46px;padding:0 6px 0 14px;background:#F5F1FF;cursor:move;touch-action:none;user-select:none;font-weight:800;color:#4B2BBF;font-size:15px}'
      + '.wsb-ch span{flex:1}'
      + '.wsb-ch button{height:34px;min-width:34px;padding:0 9px;border-radius:10px;border:1.5px solid #E4DAFF;background:#fff;color:#4B2BBF;font:inherit;font-size:13px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}'
      + '.wsb-cd{padding:8px 14px 6px;text-align:right;border-bottom:1px solid #F0EBFF}'
      + '.wsb-cd input{display:block;width:100%;box-sizing:border-box;border:0;outline:0;background:transparent;text-align:right;font:inherit;font-size:20px;font-weight:700;color:#3F3A5C;padding:2px 0}'
      + '.wsb-cd b{display:block;min-height:42px;font-size:32px;font-weight:900;color:#1f1d2e;word-break:break-all;line-height:1.3}'
      + '.wsb-cd b.pre{color:#A49DC4}'
      + '.wsb-cd b.err{color:#B42318;font-size:20px}'
      + '.wsb-ck{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;padding:10px}'
      + '.wsb-ck button{height:50px;padding:0;border-radius:12px;border:1.5px solid #E7E0FA;background:#fff;color:#1f1d2e;font:inherit;font-size:18px;font-weight:800;cursor:pointer}'
      + '.wsb-ck button.fn{background:#F8F6FF;color:#4B2BBF;font-size:15px}'
      + '.wsb-ck button.op{background:#F1EBFF;color:#4B2BBF;font-size:21px}'
      + '.wsb-ck button.ac{color:#B42318;font-size:16px}'
      + '.wsb-ck button.eq{background:#7B52EE;border-color:#7B52EE;color:#fff;font-size:24px}'
      + '.wsb-ck button.on{background:#7B52EE;border-color:#7B52EE;color:#fff}'
      + '.wsb-ck button:active{transform:translateY(1px)}'
      + '#wsBoard.wsb-ro .wsb-calc{pointer-events:none}'
      /* Санамж — шар дэвсгэргүй, зүүн ирмэгийн ягаан аксенттай (эзэмшигчийн дүрэм) */
      + '.wsb-hintp{position:absolute;z-index:4;left:14px;box-sizing:border-box;width:min(460px,calc(100% - 28px));max-height:62%;overflow:auto;padding:10px 14px 12px;'
        + 'background:rgba(255,255,255,.97);border:1px solid #EEE8FF;border-left:4px solid #A855F7;border-radius:14px;box-shadow:0 18px 44px -24px rgba(60,30,150,.5)}'
      + '.wsb-hintp[hidden]{display:none}'
      + '.wsb-hh{display:flex;align-items:center;justify-content:space-between;font-weight:900;color:#5a32d6;font-size:15px}'
      + '.wsb-hh button{border:0;background:transparent;cursor:pointer;color:#8A84A8;padding:4px;display:inline-flex}'
      + '.wsb-hc b{display:block;margin:8px 0 2px;font-size:14px;font-weight:800;color:#4B2BBF}'
      + '.wsb-hf{padding:3px 0;font-size:21px;line-height:1.5;color:#1f1d2e}'
      + '.wsb-hf code{font-size:16px}'
      + '#wsBoard.wsb-ro .wsb-hintp{pointer-events:none}'
      /* Компьютерыг дагаж буй самбар — зөвхөн харах */
      + '#wsBoard.wsb-ro .wsb-tools{pointer-events:none;opacity:.55}'
      + '#wsBoard.wsb-ro .wsb-split{display:none}'
      + '#wsBoard.wsb-ro .wsb-paper canvas{cursor:default!important}'
      /* Ажлын хуудасны томруулалт (зүүн доод булан); хөтчийн чимхэж томруулахыг хааж, зөвхөн хуудсанд */
      + 'html.wsb-on,html.wsb-on body{touch-action:pan-x pan-y}'
      + '#wsbZoom{display:none}'
      + 'html.wsb-on #wsbZoom{position:fixed;left:14px;bottom:14px;z-index:96;display:flex;align-items:center;gap:6px;padding:6px;background:rgba(255,255,255,.96);'
        + 'border:1px solid #E4DAFF;border-radius:18px;box-shadow:0 14px 34px -18px rgba(60,30,150,.55);font-family:inherit}'
      + 'html.wsb-on.ws-view #wsbZoom{display:none}'
      + '#wsbZoom button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-width:48px;height:48px;padding:0 10px;border-radius:13px;'
        + 'border:1.5px solid #E7E0FA;background:#fff;color:#3F3A5C;font:inherit;font-size:15px;font-weight:800;cursor:pointer}'
      + '#wsbZoom button:active{transform:translateY(1px)}'
      + '#wsbZoom .wsbz-l{min-width:58px;text-align:center;font-weight:800;color:#5a32d6;font-size:15px}'
      + '}'
      + '@media print{#wsBoard{display:none!important}html.wsb-on body{margin-right:0!important}html.wsb-on .sheet{zoom:1!important}}';
    D.head.appendChild(s);
  }

  function slider(cls, label, r) {
    return '<div class="wsb-wd ' + cls + '"><div class="wsb-wd-h"><span>' + label + '</span><b></b></div>'
      + (cls === 'wsb-ptw' ? '<svg viewBox="0 0 240 44" preserveAspectRatio="none" aria-hidden="true"><path d="M14 30C60 6 104 38 150 20S214 16 226 14" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>' : '')
      + '<input type="range" min="' + r[0] + '" max="' + r[1] + '" step="1" aria-label="' + label + '"></div>';
  }
  // Тооны машины товчнууд: [харагдах, оруулах (#… — үйлдэл), төрөл, 2nd харагдах, 2nd оруулах]
  var CK = [
    ['2nd', '#2nd', 'fn'], ['sin', 'sin(', 'fn', 'sin⁻¹', 'arcsin('], ['cos', 'cos(', 'fn', 'cos⁻¹', 'arccos('], ['tg', 'tg(', 'fn', 'tg⁻¹', 'arctg('], ['π', 'π', 'fn', 'e', 'e'],
    ['√', '√(', 'fn', '∛', '∛('], ['x²', '^2', 'fn', 'x³', '^3'], ['xʸ', '^(', 'fn', '1/x', '^(−1)'], ['lg', 'lg(', 'fn', '10ˣ', '10^('], ['ln', 'ln(', 'fn', 'eˣ', 'e^('],
    ['(', '(', 'fn'], [')', ')', 'fn'], ['n!', '!', 'fn', '|x|', 'abs('], ['%', '%', 'fn'], ['⌫', '#bs', 'ac'],
    ['7', '7'], ['8', '8'], ['9', '9'], ['÷', '÷', 'op'], ['AC', '#ac', 'ac'],
    ['4', '4'], ['5', '5'], ['6', '6'], ['×', '×', 'op'], ['Ans', 'Ans', 'fn'],
    ['1', '1'], ['2', '2'], ['3', '3'], ['−', '−', 'op'], ['a/b', '#frac', 'fn'],
    ['0', '0'], [',', ','], ['×10ⁿ', '×10^(', 'fn'], ['+', '+', 'op'], ['=', '#eq', 'eq'],
  ];
  function build() {
    if (el.box) return;
    css();
    var b = D.createElement('div'); b.id = 'wsBoard'; b.hidden = true; b.setAttribute('role', 'region'); b.setAttribute('aria-label', 'Самбар');
    var tools = '<button type="button" class="wsb-pt" title="Бичих хэрэгсэл: үзэг, харандаа, тодруулагч; зузаан" aria-haspopup="menu" aria-expanded="false"></button>'
      + '<button type="button" class="wsb-col" title="Өнгө" aria-label="Өнгө" aria-haspopup="menu" aria-expanded="false"></button>'
      + '<button type="button" class="wsb-er" title="Баллуур" aria-label="Баллуур" aria-haspopup="menu" aria-expanded="false"></button>'
      + '<button type="button" class="wsb-geo" title="Геометр: цэг, хэрчим, шулуун, дүрс, график" aria-label="Геометр" aria-haspopup="menu" aria-expanded="false"></button>'
      + '<button type="button" class="wsb-calcb" title="Тооны машин" aria-label="Тооны машин">' + ICO.calc + '</button>'
      + '<button type="button" class="wsb-hintb" title="Санамж: энэ сэдвийн гол томьёо, теорем" hidden>' + ICO.bulb + '<span>Санамж</span></button>'
      + '<span class="wsb-sep"></span>'
      + '<button type="button" class="wsb-undo" title="Буцаах (Ctrl+Z)" aria-label="Буцаах">' + ICO.undo + '</button>'
      + '<button type="button" class="wsb-redo" title="Дахих (Ctrl+Y)" aria-label="Дахих">' + ICO.redo + '</button>'
      + '<button type="button" class="wsb-clear" title="Энэ хуудсыг цэвэрлэх" aria-label="Цэвэрлэх">' + ICO.trash + '</button>'
      + '<button type="button" class="wsb-bg" title="Дэвсгэр: хээ, самбарын өнгө" aria-haspopup="menu" aria-expanded="false"></button>'
      + '<span class="wsb-sep"></span>'
      + '<button type="button" class="wsb-prev" title="Өмнөх хуудас" aria-label="Өмнөх хуудас">' + ICO.prev + '</button>'
      + '<span class="wsb-n"></span>'
      + '<button type="button" class="wsb-next" title="Дараагийн хуудас" aria-label="Дараагийн хуудас">' + ICO.next + '</button>'
      + '<button type="button" class="wsb-add" title="Шинэ хоосон хуудас" aria-label="Шинэ хуудас">' + ICO.plus + '</button>'
      + '<button type="button" class="wsb-close" title="Самбарыг хаах (Esc)" aria-label="Самбарыг хаах">' + ICO.close + '</button>';
    var ptm = '<div class="wsb-menu wsb-ptm" role="menu" aria-label="Бичих хэрэгсэл" hidden>'
      + PENS.map(function (t) { return '<button type="button" data-pt="' + t[0] + '" role="menuitemradio">' + ICO[t[0]] + t[1] + '</button>'; }).join('')
      + slider('wsb-ptw', 'Зузаан', WR.pen) + '</div>';
    var colm = '<div class="wsb-menu wsb-colm" role="menu" aria-label="Өнгө" hidden><div class="wsb-sws"></div></div>';
    var erm = '<div class="wsb-menu wsb-erm" role="menu" aria-label="Баллуур" hidden>'
      + '<button type="button" data-er="draw" role="menuitemradio">' + ICO.eraser + 'Зурж арилгах</button>'
      + '<button type="button" data-er="lasso" role="menuitemradio">' + ICO.lasso + 'Хүрээлж арилгах</button>'
      + '<button type="button" data-er="all" role="menuitem" class="wsb-erm-all">' + ICO.trash + 'Бүгдийг арилгах</button>'
      + slider('wsb-erw', 'Баллуурын хэмжээ', ER_R)
      + '<label><input type="checkbox"><span>Хоёр хуруу, алгаар арчих<small>Бичиж байх үед гар хүрвэл тооцохгүй</small></span></label>'
      + '</div>';
    var geom = '<div class="wsb-menu wsb-geom" role="menu" aria-label="Геометр" hidden><div class="wsb-row">'
      + GEO_T.map(function (t) { return '<button type="button" data-geo="' + t[0] + '" role="menuitemradio">' + ICO[t[0]] + t[1] + '</button>'; }).join('')
      + '</div><div class="wsb-fn"><b>y =</b><input type="text" autocomplete="off" spellcheck="false" placeholder="2x + 1,  x^2 − 4,  sin x" aria-label="Функц">'
      + '<button type="button" data-fn="1">Зурах</button></div><div class="wsb-fn-m" role="status"></div></div>';
    var bgm = '<div class="wsb-menu wsb-bgm" role="menu" aria-label="Дэвсгэр" hidden><div class="wsb-mh">Хээ</div><div class="wsb-row">'
      + BGS.map(function (x, i) { return '<button type="button" data-bg="' + i + '" role="menuitemradio">' + ICO[x[0]] + x[1] + '</button>'; }).join('')
      + '</div><div class="wsb-mh">Самбарын өнгө</div><div class="wsb-row">'
      + TONES.map(function (x, i) { return '<button type="button" data-tone="' + i + '" role="menuitemradio"><i style="background:' + x[2] + '"></i>' + x[1] + '</button>'; }).join('')
      + '</div></div>';
    var zc = '<div class="wsb-zc" hidden role="group" aria-label="Координатын хавтгайг томруулах">'
      + '<button type="button" data-pz="-" aria-label="Жижигрүүлэх" title="Жижигрүүлэх">' + ICO.minus + '</button><span>100%</span>'
      + '<button type="button" data-pz="+" aria-label="Томруулах" title="Томруулах">' + ICO.plus + '</button>'
      + '<button type="button" data-pz="0" title="Анхны байрлал, 100%" aria-label="Анхны байрлал">' + ICO.center + '</button>'
      + '<button type="button" data-pz="hand" title="Гүйлгэх: нэг хуруугаар чирж самбарыг гүйлгэнэ">' + ICO.hand + 'Гүйлгэх</button></div>';
    var calc = '<div class="wsb-calc" role="dialog" aria-label="Тооны машин" hidden><div class="wsb-ch"><span>Тооны машин</span>'
      + '<button type="button" class="wsb-cdeg" title="Градус / радиан">DEG</button><button type="button" class="wsb-cx" aria-label="Хаах">' + I('<path d="M6 6l12 12M18 6 6 18"/>', 18) + '</button></div>'
      + '<div class="wsb-cd"><input type="text" inputmode="none" autocomplete="off" spellcheck="false" aria-label="Илэрхийлэл"><b aria-live="polite"></b></div><div class="wsb-ck">'
      + CK.map(function (k, i) { return '<button type="button" data-k="' + i + '"' + (k[2] ? ' class="' + k[2] + '"' : '') + '>' + k[0] + '</button>'; }).join('') + '</div></div>';
    b.innerHTML = '<div class="wsb-split" title="Чирж өргөнийг тохируулна" aria-hidden="true"></div><div class="wsb-pin"></div>'
      + '<div class="wsb-paper"><canvas class="wsb-bgc" aria-hidden="true"></canvas><canvas class="wsb-ink"></canvas><canvas class="wsb-ov" aria-hidden="true"></canvas>' + zc + '<div class="wsb-vs" aria-hidden="true"><i></i></div></div>'
      + '<div class="wsb-tools">' + tools + '</div>' + ptm + colm + erm + geom + bgm + calc
      + '<div class="wsb-hintp" role="dialog" aria-label="Санамж" hidden><div class="wsb-hh"><span>Санамж</span><button type="button" class="wsb-hx" aria-label="Хаах">' + I('<path d="M6 6l12 12M18 6 6 18"/>', 18) + '</button></div><div class="wsb-hb"></div></div>';
    D.body.appendChild(b);
    el = { box: b, pin: b.querySelector('.wsb-pin'), paper: b.querySelector('.wsb-paper'), cv: b.querySelector('.wsb-ink'), ov: b.querySelector('.wsb-ov'), bgc: b.querySelector('.wsb-bgc'),
      tools: b.querySelector('.wsb-tools'), split: b.querySelector('.wsb-split'), zc: b.querySelector('.wsb-zc'), vs: b.querySelector('.wsb-vs'), calc: b.querySelector('.wsb-calc'), hint: b.querySelector('.wsb-hintp'),
      ptm: b.querySelector('.wsb-ptm'), colm: b.querySelector('.wsb-colm'), erm: b.querySelector('.wsb-erm'), geom: b.querySelector('.wsb-geom'), bgm: b.querySelector('.wsb-bgm') };
    ctx = el.cv.getContext('2d'); octx = el.ov.getContext('2d'); bctx = el.bgc.getContext('2d');
    el.tools.addEventListener('click', onTool);
    el.ptm.addEventListener('click', onPtMenu);
    el.colm.addEventListener('click', onColMenu);
    el.erm.addEventListener('click', onErMenu);
    el.geom.addEventListener('click', onGeoMenu);
    el.bgm.addEventListener('click', onBgMenu);
    el.zc.addEventListener('click', onPlaneZoom);
    el.ptm.querySelector('input').addEventListener('input', function (e) { st.wid[st.tool] = clamp(e.target.value, WR[st.tool]); savePt(); sync(); });
    el.erm.querySelector('input[type=range]').addEventListener('input', function (e) { st.erW = clamp(e.target.value, ER_R); savePt(); sync(); });
    el.erm.querySelector('input[type=checkbox]').addEventListener('change', function (e) { st.gest = e.target.checked; save('cm_wsb_g', st.gest ? '1' : '0'); });
    el.geom.querySelector('.wsb-fn input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); addFn(); } });
    D.addEventListener('pointerdown', function (e) {
      var t = e.target && e.target.closest ? e.target : null;
      Object.keys(MENUS).forEach(function (k) { if (!el[k].hidden && !(t && t.closest('.wsb-' + k + ',' + MENUS[k]))) menu(k, false); });
    }, true);
    bindDraw(); bindSplit(); bindZoom(); bindCalc(); bindScroll();
    el.hint.querySelector('.wsb-hx').addEventListener('click', function () { hintOpen(false); });
    var hs = pageHints(); if (hs.length) { el.hint.querySelector('.wsb-hb').innerHTML = hintHtml(hs); el.tools.querySelector('.wsb-hintb').hidden = false; }
    // Хулганы дугуй: гүйлгэнэ (Shift — хэвтээ); Ctrl+дугуй, тачпадын чимхэлт — томруулна; координатын хавтгайд дугуй томруулна (GeoGebra шиг)
    el.paper.addEventListener('wheel', function (e) {
      if (st.ro) return;
      e.preventDefault();
      var r = el.cv.getBoundingClientRect();
      if (e.ctrlKey || isCoord()) zoomAt([e.clientX - r.left, e.clientY - r.top], Math.exp(-e.deltaY * (e.ctrlKey ? 0.004 : 0.0015)));
      else panBy(e.shiftKey ? -e.deltaY : -e.deltaX, e.shiftKey ? 0 : -e.deltaY);
    }, { passive: false });
    if (W.ResizeObserver) new ResizeObserver(fit).observe(el.paper); else W.addEventListener('resize', fit);
    W.addEventListener('resize', zoomSheet);
    D.addEventListener('click', onSheetClick, true);
    D.addEventListener('keydown', onKey);
  }

  /* ── Хуудас, харагдац (томруулалт/гүйлгэлт), координат ──
     Бичиг, геометр «ертөнцийн» координатад хадгалагдана; дэлгэц = ертөнц × s + (x, y). Координатын хавтгайн эх O (ертөнц),
     нэгж UNIT; хавтгайн (x, y) → ертөнц (O.x + x·UNIT, O.y − y·UNIT). Координатын хавтгайгүй үед харагдац үргэлж 1:1. */
  function page() { return st.pages[st.cur]; }
  function V() { var pg = page(); return pg.v || (pg.v = { s: 1, x: 0, y: 0 }); }
  function G() { var pg = page(); return pg.geo || (pg.geo = emptyGeo()); }
  function O() {
    var pg = page(); if (pg.o) return pg.o;
    var r = el.cv.getBoundingClientRect(), v = V();
    return (pg.o = { x: Math.round((r.width / 2 - v.x) / v.s), y: Math.round((r.height / 2 - v.y) / v.s) });
  }
  function toW(p) { var v = V(); return [(p[0] - v.x) / v.s, (p[1] - v.y) / v.s]; }
  function unitPx() { return UNIT * V().s; }
  function plS(x, y) { var o = O(), v = V(); return [(o.x + x * UNIT) * v.s + v.x, (o.y - y * UNIT) * v.s + v.y]; }
  function sPl(p) { var o = O(), w = toW(p); return [(w[0] - o.x) / UNIT, (o.y - w[1]) / UNIT]; }
  function gridStep() { var u = unitPx(), S = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100]; for (var i = 0; i < S.length; i++) if (S[i] * u >= 30) return S[i]; return 100; }
  // Координатын хавтгай дээр торны зангилаа руу наалдана (алхмын 30%-д), бусад үед 0.01 хүртэл
  function snap(pl) {
    var r2 = function (v) { return Math.round(v * 100) / 100; };
    if (!isCoord()) return [r2(pl[0]), r2(pl[1])];
    var g = gridStep(), f = function (v) { var s = Math.round(v / g) * g; return Math.abs(s - v) < 0.3 * g ? +s.toFixed(4) : r2(v); };
    return [f(pl[0]), f(pl[1])];
  }
  function fit() {
    if (!st.on) return;
    var pg0 = page(), v0 = pg0.v;                // хоосон, томруулаагүй хуудсанд координатын эх төвдөө үлдэнэ (хэмжээ өөрчлөгдөхөд)
    if (pg0.o && !st.ro && !pg0.strokes.length && !(pg0.geo && (pg0.geo.pts.length || pg0.geo.fns.length)) && (!v0 || (v0.s === 1 && !v0.x && !v0.y))) pg0.o = null;
    var r = el.paper.getBoundingClientRect(); dpr = W.devicePixelRatio || 1;
    var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    el.cv.width = el.ov.width = el.bgc.width = w; el.cv.height = el.ov.height = el.bgc.height = h;
    drawBg(); render(); ov();
  }
  // Дэвсгэрийн давхарга: координатын хавтгай (торон алхам томруулалтаас хамаарна) + геометр (функц, дүрс, цэг)
  function drawBg() {
    var c = bctx; if (!c) return;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, el.bgc.width, el.bgc.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    var w = el.bgc.width / dpr, h = el.bgc.height / dpr;
    if (isCoord()) plane(c, w, h); else pattern(c, w, h);
    geoDraw(c, w, h);
    if (el.zc) { el.zc.hidden = false; el.zc.querySelector('span').textContent = Math.round(V().s * 100) + '%'; }
  }
  // Тор (32px), шугам (44px) — ертөнцийн координатаар (гүйлгэх, томруулахад бичгийн хамт)
  function pattern(c, w, h) {
    var k = BGS[st.bg][0]; if (k !== 'grid' && k !== 'lines') return;
    var v = V(), gs = (k === 'grid' ? 32 : 44) * v.s, x, y; if (gs < 6) return;
    var x0 = ((v.x % gs) + gs) % gs, y0 = ((v.y % gs) + gs) % gs;
    c.lineWidth = 1; c.strokeStyle = dark() ? (k === 'grid' ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.14)') : (k === 'grid' ? '#ECE6FB' : '#E4DCFA'); c.beginPath();
    if (k === 'grid') for (x = x0; x < w; x += gs) { c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, h); }
    for (y = y0; y < h; y += gs) { c.moveTo(0, Math.round(y) + 0.5); c.lineTo(w, Math.round(y) + 0.5); }
    c.stroke();
  }
  function plane(c, w, h) {
    var dk = dark(), u = unitPx(), g = gridStep(), gs = g * u, o = plS(0, 0), ox = Math.round(o[0]) + 0.5, oy = Math.round(o[1]) + 0.5, i, x, y;
    var i0 = Math.ceil(-ox / gs), i1 = Math.floor((w - ox) / gs), j0 = Math.ceil(-oy / gs), j1 = Math.floor((h - oy) / gs), every = gs < 44 ? 2 : 1;
    c.lineWidth = 1; c.strokeStyle = dk ? 'rgba(255,255,255,.1)' : '#ECE6FB'; c.beginPath();
    for (i = i0; i <= i1; i++) { x = Math.round(ox + i * gs) + 0.5; c.moveTo(x, 0); c.lineTo(x, h); }
    for (i = j0; i <= j1; i++) { y = Math.round(oy + i * gs) + 0.5; c.moveTo(0, y); c.lineTo(w, y); }
    c.stroke();
    var ax = dk ? 'rgba(255,255,255,.8)' : '#3F3A5C', tx = dk ? 'rgba(255,255,255,.72)' : '#6b6590', xAx = oy > 0 && oy < h, yAx = ox > 0 && ox < w;
    c.strokeStyle = c.fillStyle = ax; c.lineWidth = 1.6; c.beginPath();
    if (xAx) { c.moveTo(0, oy); c.lineTo(w - 3, oy); for (i = i0; i <= i1; i++) if (i) { x = ox + i * gs; c.moveTo(x, oy - 4); c.lineTo(x, oy + 4); } }
    if (yAx) { c.moveTo(ox, h); c.lineTo(ox, 3); for (i = j0; i <= j1; i++) if (i) { y = oy + i * gs; c.moveTo(ox - 4, y); c.lineTo(ox + 4, y); } }
    c.stroke();
    if (xAx) { c.beginPath(); c.moveTo(w - 2, oy); c.lineTo(w - 13, oy - 5); c.lineTo(w - 13, oy + 5); c.closePath(); c.fill(); }
    if (yAx) { c.beginPath(); c.moveTo(ox, 2); c.lineTo(ox - 5, 13); c.lineTo(ox + 5, 13); c.closePath(); c.fill(); }
    c.fillStyle = tx; c.font = '600 13px system-ui,-apple-system,"Segoe UI",sans-serif';
    if (xAx) { c.textAlign = 'center'; c.textBaseline = 'top'; for (i = i0; i <= i1; i++) { x = ox + i * gs; if (i && !(i % every) && x > 8 && x < w - 16) c.fillText(fmtNum(i * g), x, oy + 7); } }
    if (yAx) { c.textAlign = 'right'; c.textBaseline = 'middle'; for (i = j0; i <= j1; i++) { y = oy + i * gs; if (i && !(i % every) && y > 16 && y < h - 8) c.fillText(fmtNum(-i * g), ox - 8, y); } }
    c.fillStyle = ax; c.font = 'italic 700 17px "Times New Roman",serif';
    if (xAx) { c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText('x', w - 6, oy + 8); }
    if (yAx) { c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('y', ox + 9, 4); }
    if (xAx && yAx) { c.textAlign = 'right'; c.textBaseline = 'top'; c.fillText('O', ox - 6, oy + 6); }
  }
  // Цэгүүдийг дайрсан гөлгөр муруй (эзэмшигч: «парабол гипербол гэх мэт графикуудыг холбоход муруй байдлаар»): төв зайн
  // (centripetal, α = 0.5) Catmull-Rom → Безье — цэг бүрийг дайрна, гогцоо/үзүүр үүсгэхгүй. Нээлттэй бол үзүүрт тусгал цэг.
  function smooth(c, P, closed) {
    var n = P.length; if (n < 2) return;
    c.moveTo(P[0][0], P[0][1]);
    if (n === 2 && !closed) { c.lineTo(P[1][0], P[1][1]); return; }
    var at = function (i) {
      if (closed) return P[(i % n + n) % n];
      if (i < 0) return [2 * P[0][0] - P[1][0], 2 * P[0][1] - P[1][1]];
      if (i > n - 1) return [2 * P[n - 1][0] - P[n - 2][0], 2 * P[n - 1][1] - P[n - 2][1]];
      return P[i];
    };
    var dd = function (a, b) { return Math.max(1e-4, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1]))); };
    for (var i = 0, m = closed ? n : n - 1; i < m; i++) {
      var p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2), d1 = dd(p0, p1), d2 = dd(p1, p2), d3 = dd(p2, p3);
      var k1 = 3 * d1 * (d1 + d2), k2 = 3 * d3 * (d3 + d2), e1 = 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2, e2 = 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2;
      c.bezierCurveTo((d1 * d1 * p2[0] - d2 * d2 * p0[0] + e1 * p1[0]) / k1, (d1 * d1 * p2[1] - d2 * d2 * p0[1] + e1 * p1[1]) / k1,
        (d3 * d3 * p1[0] - d2 * d2 * p3[0] + e2 * p2[0]) / k2, (d3 * d3 * p1[1] - d2 * d2 * p3[1] + e2 * p2[1]) / k2, p2[0], p2[1]);
    }
    if (closed) c.closePath();
  }
  // Шулуун/цацрагийг харагдах хүрээнээс цааш сунгана (канвас тасална)
  function extend(a, b, w, h, ray) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (!L) return null;
    var k = (w + h) * 4 / L;
    return [ray ? a : [a[0] - dx * k, a[1] - dy * k], [a[0] + dx * k, a[1] + dy * k]];
  }
  function geoDraw(c, w, h) {
    var g = page().geo; if (!g) return;
    var dk = dark(), byId = {}, S = function (q) { return plS(q.x, q.y); };
    g.pts.forEach(function (q) { byId[q.id] = q; });
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (isCoord()) g.fns.forEach(function (fo) {                     // y = f(x) — зөвхөн координатын хавтгай дээр
      var fn = compileFn(fo.f); if (!fn) return;
      var u = unitPx(), o = plS(0, 0), pen = false, py = null, lab = null;
      c.strokeStyle = inkOn(fo.c, dk); c.lineWidth = 2.6; c.beginPath();
      for (var sx = 0; sx <= w; sx += 1.5) {
        var yv = fn((sx - o[0]) / u), sy = o[1] - yv * u;
        if (!isFinite(sy) || Math.abs(sy) > 1e5 || (py !== null && Math.abs(sy - py) > h)) { pen = false; py = null; continue; }
        if (pen) c.lineTo(sx, sy); else { c.moveTo(sx, sy); pen = true; }
        py = sy; if (sy > 24 && sy < h - 24 && sx < w - 60) lab = [sx, sy];
      }
      c.stroke();
      if (lab) {
        var t = 'y = ' + fo.f.replace(/\*/g, '·').replace(/-/g, '−');
        c.font = 'italic 700 16px "Times New Roman",serif'; c.textAlign = 'right'; c.textBaseline = 'bottom';
        c.lineWidth = 4; c.strokeStyle = dk ? 'rgba(21,23,30,.85)' : 'rgba(255,255,255,.92)'; c.strokeText(t, lab[0] - 6, lab[1] - 8);
        c.fillStyle = inkOn(fo.c, dk); c.fillText(t, lab[0] - 6, lab[1] - 8);
      }
    });
    g.objs.forEach(function (ob) {
      var ps = ob.p.map(function (id) { return byId[id]; }); if (ps.some(function (q) { return !q; })) return;
      var a = S(ps[0]), b = ps[1] && S(ps[1]), col = inkOn(ob.c, dk);
      c.strokeStyle = c.fillStyle = col; c.lineWidth = 2.6; c.beginPath();
      if (ob.t === 'seg') { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
      else if (ob.t === 'line' || ob.t === 'ray') { var e = extend(a, b, w, h, ob.t === 'ray'); if (!e) return; c.moveTo(e[0][0], e[0][1]); c.lineTo(e[1][0], e[1][1]); }
      else if (ob.t === 'circ') c.arc(a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), 0, Math.PI * 2);
      else if (ob.t === 'curve') smooth(c, ps.map(S), !!ob.cl);
      else { ps.forEach(function (q, i) { var s = S(q); if (i) c.lineTo(s[0], s[1]); else c.moveTo(s[0], s[1]); }); c.closePath(); c.globalAlpha = 0.12; c.fill(); c.globalAlpha = 1; }
      c.stroke();
    });
    c.font = '700 15px system-ui,-apple-system,"Segoe UI",sans-serif'; c.textAlign = 'left'; c.textBaseline = 'bottom';
    g.pts.forEach(function (q) {
      var s = S(q), col = inkOn(q.c, dk), t = q.nm + (isCoord() ? '(' + fmtNum(q.x) + '; ' + fmtNum(q.y) + ')' : '');
      c.beginPath(); c.arc(s[0], s[1], 5, 0, Math.PI * 2); c.fillStyle = col; c.fill(); c.lineWidth = 1.5; c.strokeStyle = dk ? '#15171e' : '#fff'; c.stroke();
      c.lineWidth = 3.5; c.strokeStyle = dk ? 'rgba(21,23,30,.85)' : 'rgba(255,255,255,.92)'; c.strokeText(t, s[0] + 8, s[1] - 6);
      c.fillStyle = col; c.fillText(t, s[0] + 8, s[1] - 6);
    });
    c.restore();
  }
  // Харандаа: өнгөний мөхлөгт хээ (64px, тогтмол үр — дахин зурахад ижил; цаасан дээр баллах мэт байрандаа)
  function grain(c, color) {
    var key = color + (c === octx ? 'o' : 'm'); if (PAT[key]) return PAT[key];
    var n = D.createElement('canvas'); n.width = n.height = 64;
    var g = n.getContext('2d'), im = g.createImageData(64, 64), d = im.data, seed = 9;
    var r = parseInt(color.slice(1, 3), 16), gn = parseInt(color.slice(3, 5), 16), bl = parseInt(color.slice(5, 7), 16);
    for (var i = 0; i < d.length; i += 4) {
      seed = seed * 16807 % 2147483647; var u = seed / 2147483647;
      d[i] = r; d[i + 1] = gn; d[i + 2] = bl; d[i + 3] = u < 0.2 ? 0 : Math.round(120 + u * 135);
    }
    g.putImageData(im, 0, 0);
    return (PAT[key] = c.createPattern(n, 'repeat'));
  }
  function stroke(c, s, from) {
    var p = s.p; if (!p.length) return;
    c.save();
    if (s.er) { c.globalCompositeOperation = 'destination-out'; c.strokeStyle = c.fillStyle = '#000'; }
    else if (s.t === 'hl') {                     // цайвар самбарт үржүүлэх (доорх бичиг харагдана), бараан самбарт тунгалаг
      c.globalCompositeOperation = dark() ? 'source-over' : 'multiply'; c.globalAlpha = dark() ? 0.5 : 0.4; c.strokeStyle = c.fillStyle = s.c;
    }
    else if (s.t === 'pencil') c.strokeStyle = c.fillStyle = grain(c, inkOn(s.c, dark()));
    else c.strokeStyle = c.fillStyle = inkOn(s.c, dark());
    c.lineWidth = s.w; c.lineCap = 'round'; c.lineJoin = 'round';
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
  // Үзэг, баллуур — үндсэн канвас дээр хэсэгчлэн; харандаа, тодруулагч (тунгалаг) — бичиж дуустал давхарга дээр бүтнээр (давхцал бараантахгүй)
  function onMain(s) { return s.er || !s.t; }
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, el.cv.width, el.cv.height);
    var v = V(); ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
    page().strokes.forEach(function (s) { draw(ctx, s); });
    if (live && live.s && onMain(live.s)) draw(ctx, live.s);
    sbar();
  }
  // Түр давхарга: хүрээлэх зам (тасархай), бичиж буй харандаа/тодруулагч, баллуурын хүрээ (ертөнцийн координат) + геометрийн урьдчилсан зураг (дэлгэц)
  function ov(ring) {
    if (!octx) return;
    var c = octx, v = V();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, el.ov.width, el.ov.height);
    c.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.x, dpr * v.y);
    if (live && live.kind === 'lasso' && live.lasso.length > 1) {
      c.save(); c.setLineDash([9 / v.s, 7 / v.s]); c.lineWidth = 2.5 / v.s; c.lineJoin = 'round'; c.strokeStyle = '#7B52EE'; c.fillStyle = 'rgba(123,82,238,.08)';
      c.beginPath(); live.lasso.forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); });
      c.closePath(); c.fill(); c.stroke(); c.restore();
    }
    if (live && live.kind === 'ink' && !onMain(live.s)) draw(c, live.s);
    if (ring) {
      c.save(); c.lineWidth = 2 / v.s; c.strokeStyle = '#7B52EE'; c.fillStyle = 'rgba(123,82,238,.10)';
      c.beginPath(); c.arc(ring[0], ring[1], ring[2], 0, Math.PI * 2); c.fill(); c.stroke(); c.restore();
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    geoPreview(c);
  }
  function pt(e) { var r = el.cv.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * 10) / 10, Math.round((e.clientY - r.top) * 10) / 10]; }

  /* ── Нэг хуруу / үзэг / хулгана — сонгосон хэрэгсэл. Хоёр хуруу эсвэл алга — түр баллуур (суллахад өмнөх хэрэгсэлдээ);
     координатын хавтгай дээр хоёр хурууны зай өөрчлөгдвөл чимхэж томруулна. Бичиж байх үед (зурлага 600мс эсвэл 30px-ээс
     давсан) хүрсэн гарыг алга тавьсан гэж үзээд тоохгүй. ── */
  function fresh() { return live.touch && Date.now() - live.t0 < EARLY && live.len < SHORT; }
  function near(a, b) { var p = tp[a], q = tp[b]; return !p || !q || Math.hypot(p.x - q.x, p.y - q.y) < NEAR; }
  function begin(e, sp) {
    var penEr = e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) > 0);    // үзэгний ар талын баллуур
    var L = { id: e.pointerId, t0: Date.now(), len: 0, touch: e.pointerType === 'touch', ls: sp }, p = toW(sp), s = V().s;
    if (st.eraser && st.erMode === 'lasso' && !penEr) { L.kind = 'lasso'; L.lasso = [p]; live = L; ov(); return; }
    var er = penEr || st.eraser, t = st.tool;
    L.kind = 'ink';
    L.s = er ? { c: st.color, w: st.erW / s, er: true, p: [p] } : { c: t === 'hl' ? st.hl : st.color, w: st.wid[t] / s, er: false, p: [p] };
    if (!er && t !== 'pen') L.s.t = t;
    live = L;
    if (onMain(L.s)) stroke(ctx, L.s); else ov();
    if (er) ov([p[0], p[1], st.erW / 2 / s]);
  }
  function touches() { return Object.keys(tp).map(function (k) { return tp[k]; }); }
  function pinch0(ts) { var v = V(); return { d: Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y) || 1, c: [(ts[0].x + ts[1].x) / 2, (ts[0].y + ts[1].y) / 2], v: { s: v.s, x: v.x, y: v.y } }; }
  function gStart() {
    live = { kind: 'g', s: { er: true, g: 1, w: 0, p: [] } };
    var ts = touches();
    if (ts.length === 2) { live.mode = 'pend'; live.z0 = pinch0(ts); return; }   // хөдөлгөөнөөр нь: чимхэх (томруулах) эсвэл зэрэгцээ (арчих)
    gStep(false);
  }
  function gStep(cut) {
    var ts = touches(); if (!ts.length) return;
    if (live.mode === 'pend' || live.mode === 'zoom') {
      if (ts.length !== 2) { if (live.mode === 'zoom') { live.z0 = null; return; } live.mode = null; }
      else if (cut || !live.z0) { live.z0 = pinch0(ts); return; }
      else {
        var z = live.z0, d = Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y), cc = [(ts[0].x + ts[1].x) / 2, (ts[0].y + ts[1].y) / 2];
        if (live.mode === 'pend') {
          if (Math.abs(d / z.d - 1) > 0.18) live.mode = 'zoom';
          else if (Math.hypot(cc[0] - z.c[0], cc[1] - z.c[1]) > 16) live.mode = null;   // зэрэгцээ хөдөлгөөн → арчина
          else return;
        }
        if (live.mode === 'zoom') {
          var v = V(), sc = Math.max(0.2, Math.min(8, z.v.s * d / z.d)), wx = (z.c[0] - z.v.x) / z.v.s, wy = (z.c[1] - z.v.y) / z.v.s;
          v.s = sc; v.x = cc[0] - wx * sc; v.y = cc[1] - wy * sc;
          bump(); drawBg(); render(); return;
        }
      }
    }
    var g = gestureOf(ts), s = live.s, last = s.p[s.p.length - 1], vs = V().s, wp = toW([g.x, g.y]), wr = g.r / vs;
    if (cut && last) { s.p.push(null); last = null; }
    if (last && Math.hypot(last[0] - wp[0], last[1] - wp[1]) < 1.5 / vs && Math.abs(last[2] - wr) < 2 / vs) { ov([wp[0], wp[1], wr]); return; }
    s.p.push([Math.round(wp[0] * 10) / 10, Math.round(wp[1] * 10) / 10, Math.round(wr * 10) / 10]);
    stamp(ctx, s, s.p.length - 1);
    ov([wp[0], wp[1], wr]);
  }

  /* ── Геометр (эзэмшигч: «цэг тэмдэглээд холбодог байх шулуун, хэрчим … Геометрийн дүрсүүд»): дарахад цэг (байгаа цэг дээр
     дарвал түүнийг авна), хэрчим/шулуун/цацраг/тойрог — 2 цэг (дараалан дарах эсвэл чирэх), олон өнцөгт — эхний цэг дээр дарж
     хаана, гурвалжин/тэгш өнцөгт — чирж зурна, зөөх — цэгийг чирнэ (хоосон газар чирвэл хавтгай гүйнэ), устгах — дарсан зүйл. ── */
  function ptAt(sp, r) {
    var best = null, bd = r || 16;
    G().pts.forEach(function (q) { var s = plS(q.x, q.y), d = Math.hypot(s[0] - sp[0], s[1] - sp[1]); if (d < bd) { bd = d; best = q; } });
    return best;
  }
  function addPt(pl) {
    var g = G(), q = { id: g.pts.reduce(function (m, x) { return Math.max(m, x.id); }, 0) + 1, x: pl[0], y: pl[1], nm: ptName(g.n++), c: st.color };
    g.pts.push(q); return q;
  }
  function pick(sp) { return ptAt(sp) || addPt(snap(sPl(sp))); }
  function segDist(p, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  }
  function hitObj(ob, sp) {
    var g = G(), byId = {}; g.pts.forEach(function (q) { byId[q.id] = q; });
    var ps = ob.p.map(function (id) { return byId[id] && plS(byId[id].x, byId[id].y); }); if (ps.some(function (q) { return !q; })) return false;
    var r = el.cv.getBoundingClientRect(), a = ps[0], b = ps[1];
    if (ob.t === 'seg') return segDist(sp, a, b) < 12;
    if (ob.t === 'line' || ob.t === 'ray') { var e = extend(a, b, r.width, r.height, ob.t === 'ray'); return !!e && segDist(sp, e[0], e[1]) < 12; }
    if (ob.t === 'circ') return Math.abs(Math.hypot(sp[0] - a[0], sp[1] - a[1]) - Math.hypot(b[0] - a[0], b[1] - a[1])) < 12;
    if (ob.t === 'curve') { for (var j = 0; j < ps.length - (ob.cl ? 0 : 1); j++) if (segDist(sp, ps[j], ps[(j + 1) % ps.length]) < 16) return true; return false; }
    for (var i = 0; i < ps.length; i++) if (segDist(sp, ps[i], ps[(i + 1) % ps.length]) < 12) return true;
    return inPoly(sp[0], sp[1], ps);
  }
  function hitFn(fo, sp) { var fn = compileFn(fo.f); if (!fn) return false; var u = unitPx(), o = plS(0, 0), y = fn((sp[0] - o[0]) / u); return isFinite(y) && Math.abs(o[1] - y * u - sp[1]) < 14; }
  function delAt(sp) {
    var g = G(), q = ptAt(sp);
    if (q) { g.pts = g.pts.filter(function (x) { return x !== q; }); g.objs = g.objs.filter(function (o) { return o.p.indexOf(q.id) < 0; }); return; }
    for (var i = g.objs.length - 1; i >= 0; i--) if (hitObj(g.objs[i], sp)) { g.objs.splice(i, 1); return; }
    if (isCoord()) for (var j = g.fns.length - 1; j >= 0; j--) if (hitFn(g.fns[j], sp)) { g.fns.splice(j, 1); return; }
  }
  // Чирж зурах дүрс: гурвалжин (суурь доор, орой дунд), тэгш өнцөгт — оройнууд нь нэртэй цэгүүд
  function shape(t, a, b) {
    var p0 = snap(sPl(a)), p1 = snap(sPl(b)), x0 = Math.min(p0[0], p1[0]), x1 = Math.max(p0[0], p1[0]), y0 = Math.min(p0[1], p1[1]), y1 = Math.max(p0[1], p1[1]);
    if (x1 - x0 < 1e-6 || y1 - y0 < 1e-6) return;
    var vs = t === 'rect' ? [[x0, y0], [x1, y0], [x1, y1], [x0, y1]] : [[x0, y0], [x1, y0], [Math.round((x0 + x1) / 2 * 100) / 100, y1]];
    G().objs.push({ t: 'poly', p: vs.map(function (v) { return addPt(v).id; }), c: st.color });
  }
  function geoDown(e, sp) {
    live = { kind: 'geo', id: e.pointerId, t0: Date.now(), len: 0, touch: e.pointerType === 'touch', s0: sp, ls: sp };
    if (st.geo === 'move') {
      var q = ptAt(sp, 22);
      if (q) { live.drag = q; live.prev = cloneGeo(G()); }
      else { var v = V(); live.pan = { x: v.x, y: v.y }; }
    }
    hv = sp; ov();
  }
  function geoMove(sp) {
    live.len += Math.hypot(sp[0] - live.ls[0], sp[1] - live.ls[1]); live.ls = sp; hv = sp;
    if (live.drag) { var pl = snap(sPl(sp)); live.drag.x = pl[0]; live.drag.y = pl[1]; live.moved = true; drawBg(); return; }
    if (live.pan) { var v = V(); v.x = live.pan.x + sp[0] - live.s0[0]; v.y = live.pan.y + sp[1] - live.s0[1]; drawBg(); render(); return; }
    ov();
  }
  function geoUp(sp) {
    var L = live, t = st.geo, drag = L.len > 12; live = null; hv = drag ? null : sp;
    if (t === 'move') { if (L.drag && L.moved) geoOp(page(), L.prev); bump(); drawBg(); render(); ov(); sync(); return; }
    var g = G(), before = JSON.stringify(g), prev = JSON.parse(before);
    if (t === 'tri' || t === 'rect') { if (drag) shape(t, L.s0, sp); }
    else if (t === 'del') { if (!drag) delAt(sp); }
    else if (t === 'pt') { if (!ptAt(sp)) addPt(snap(sPl(sp))); }
    else if (t === 'curve') {                    // дараалан дарна; сүүлийн цэг дээр дахин — дуусна, эхний цэг дээр — битүү
      var qc = ptAt(sp), cur = gp && gp.t === 'curve' ? gp.ids : null;
      if (cur && qc && cur.length >= 3 && qc.id === cur[0]) { g.objs.push({ t: 'curve', p: cur.slice(), c: st.color, cl: 1 }); gp = null; }
      else if (cur && qc && cur.length >= 2 && qc.id === cur[cur.length - 1]) { g.objs.push({ t: 'curve', p: cur.slice(), c: st.color }); gp = null; }
      else { qc = qc || addPt(snap(sPl(sp))); if (!cur) gp = { t: 'curve', ids: [] }; if (gp.ids[gp.ids.length - 1] !== qc.id) gp.ids.push(qc.id); }
    }
    else if (t === 'poly') {
      var q = ptAt(sp);
      if (gp && gp.t === 'poly' && q && q.id === gp.ids[0] && gp.ids.length >= 3) { g.objs.push({ t: 'poly', p: gp.ids.slice(), c: st.color }); gp = null; }
      else {
        q = q || addPt(snap(sPl(sp)));
        if (!gp || gp.t !== 'poly') gp = { t: 'poly', ids: [] };
        if (gp.ids[gp.ids.length - 1] !== q.id) gp.ids.push(q.id);
      }
    }
    else if (drag) { var a = pick(L.s0), b = pick(sp); if (a !== b) g.objs.push({ t: t, p: [a.id, b.id], c: st.color }); gp = null; }   // хэрчим, шулуун, цацраг, тойрог — чирж
    else {
      var p2 = pick(sp);
      if (!gp || gp.t !== t) gp = { t: t, ids: [p2.id] };
      else { if (p2.id !== gp.ids[0]) g.objs.push({ t: t, p: [gp.ids[0], p2.id], c: st.color }); gp = null; }
    }
    if (JSON.stringify(g) !== before) { geoOp(page(), prev); bump(); }
    drawBg(); ov(); sync();
  }
  // Урьдчилсан зураг: сонгосон цэгүүд, заагч хүртэлх тасархай шугам/тойрог/олон өнцөгт, чирж буй дүрс
  function geoPreview(c) {
    if (!st.geo) return;
    var g = page().geo, byId = {}; if (g) g.pts.forEach(function (q) { byId[q.id] = q; });
    c.save(); c.strokeStyle = '#7B52EE'; c.fillStyle = 'rgba(123,82,238,.10)'; c.lineWidth = 2; c.setLineDash([7, 6]);
    if (live && live.kind === 'geo' && (st.geo === 'tri' || st.geo === 'rect') && live.len > 12) {
      var a = live.s0, b = live.ls, x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      c.beginPath();
      if (st.geo === 'rect') c.rect(x0, y0, x1 - x0, y1 - y0); else { c.moveTo(x0, y1); c.lineTo(x1, y1); c.lineTo((x0 + x1) / 2, y0); c.closePath(); }
      c.fill(); c.stroke();
    } else if (live && live.kind === 'geo' && ['seg', 'line', 'ray', 'circ'].indexOf(st.geo) >= 0 && live.len > 12) {
      line2(c, st.geo, live.s0, live.ls);
    } else if (gp && hv && g) {
      var ps = gp.ids.map(function (id) { return byId[id] && plS(byId[id].x, byId[id].y); }).filter(Boolean);
      if (ps.length) {
        if (gp.t === 'poly') { c.beginPath(); ps.concat([hv]).forEach(function (q, i) { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke(); }
        else if (gp.t === 'curve') {
          c.beginPath(); smooth(c, ps.concat([hv]), false); c.stroke();
          if (ps.length >= 2) { var lp = ps[ps.length - 1]; c.setLineDash([]); c.font = '700 13px system-ui,sans-serif'; c.fillStyle = '#7B52EE'; c.textAlign = 'left'; c.textBaseline = 'top'; c.fillText('дахин дарж дуусгана', lp[0] + 12, lp[1] + 10); }
        }
        else line2(c, gp.t, ps[0], hv);
        c.setLineDash([]); ps.forEach(function (q) { c.beginPath(); c.arc(q[0], q[1], 9, 0, Math.PI * 2); c.stroke(); });
      }
    }
    c.restore();
  }
  function line2(c, t, a, b) {
    c.beginPath();
    if (t === 'circ') c.arc(a[0], a[1], Math.hypot(b[0] - a[0], b[1] - a[1]), 0, Math.PI * 2);
    else { c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); }
    c.stroke();
  }
  // y = f(x): координатын хавтгай руу шилжиж графикийг нэмнэ
  function addFn() {
    var inp = el.geom.querySelector('.wsb-fn input'), msg = el.geom.querySelector('.wsb-fn-m');
    var src = inp.value.trim().replace(/^\s*(y|f\s*\(\s*x\s*\))\s*=\s*/i, '').slice(0, 80);
    if (!compileFn(src)) { msg.textContent = 'Буруу илэрхийлэл. Жишээ: 2x + 1,  x^2 − 4,  sin x,  √x,  |x − 3|'; return; }
    var prev = cloneGeo(G());
    if (!isCoord()) { st.bg = 3; saveBg(); }
    G().fns.push({ f: src, c: st.tool === 'hl' ? st.hl : st.color });
    geoOp(page(), prev); bump(); inp.value = ''; msg.textContent = '';
    drawBg(); render(); sync();
  }

  function bindDraw() {
    var cv = el.cv;
    cv.addEventListener('pointerdown', function (e) {
      if (st.ro || (e.pointerType === 'mouse' && e.button !== 0)) return;
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
      if (st.pan) { var v0 = V(); live = { kind: 'pan', id: e.pointerId, t0: Date.now(), len: 0, touch: touch, s0: p, ls: p, v0: { x: v0.x, y: v0.y } }; return; }   // «Гүйлгэх»
      if (st.geo && !(e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32) > 0))) { geoDown(e, p); return; }
      begin(e, p);
    });
    cv.addEventListener('pointermove', function (e) {
      var id = e.pointerId, t = tp[id]; if (dead[id]) return;
      if (t) { var q = pt(e), sz = Math.max(e.width || 0, e.height || 0); t.x = q[0]; t.y = q[1]; if (sz > 2) t.s = sz; }
      if (!live) { if (st.geo && gp && e.pointerType !== 'touch') { hv = pt(e); ov(); } return; }   // хулганаар: дараагийн цэг хүртэл урьдчилан
      if (live.kind === 'g') { if (t) { e.preventDefault(); gStep(false); } return; }
      if (id !== live.id) return;
      e.preventDefault();
      if (live.kind === 'geo') { geoMove(pt(e)); return; }
      if (live.kind === 'pan') { var q2 = pt(e), vv = V(); live.len += Math.hypot(q2[0] - live.ls[0], q2[1] - live.ls[1]); live.ls = q2; vv.x = live.v0.x + q2[0] - live.s0[0]; vv.y = live.v0.y + q2[1] - live.s0[1]; drawBg(); render(); return; }
      var evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; if (!evs.length) evs = [e];
      if (live.kind === 'lasso') {
        evs.forEach(function (ev) {
          var sq = pt(ev), d = Math.hypot(sq[0] - live.ls[0], sq[1] - live.ls[1]);
          if (d >= 2) { live.lasso.push(toW(sq)); live.len += d; live.ls = sq; }
        });
        ov(); return;
      }
      var s = live.s, n0 = s.p.length;
      evs.forEach(function (ev) { var sq = pt(ev); live.len += Math.hypot(sq[0] - live.ls[0], sq[1] - live.ls[1]); live.ls = sq; s.p.push(toW(sq)); });
      if (!onMain(s)) { ov(); return; }
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
        if (g.p.some(Boolean)) { addStroke(page(), g); bump(); }
        render(); sync(); return;
      }
      if (id !== live.id) return;
      if (live.kind === 'geo') { if (e.type === 'pointercancel') { live = null; ov(); } else geoUp(pt(e)); return; }
      if (live.kind === 'pan') { live = null; bump(); sync(); return; }
      var L = live; live = null; ov();
      if (L.kind === 'lasso') { if (eraseLasso(page(), L.lasso)) { render(); bump(); } sync(); return; }
      addStroke(page(), L.s); bump(); render(); sync();
    };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  /* ── Хэрэгслүүд, цэсүүд ── */
  var MENUS = { ptm: '.wsb-pt', colm: '.wsb-col', erm: '.wsb-er', geom: '.wsb-geo', bgm: '.wsb-bg' };
  function menu(k, show) {
    var m = el[k], b = el.tools.querySelector(MENUS[k]);
    if (show) {
      Object.keys(MENUS).forEach(function (o) { if (o !== k && !el[o].hidden) menu(o, false); });
      var r = b.getBoundingClientRect(), R = el.box.getBoundingClientRect(), mw = k === 'geom' ? 300 : 280;
      m.style.left = Math.round(Math.max(8, Math.min(R.width - mw - 8, r.left - R.left))) + 'px';
      m.style.bottom = Math.round(R.bottom - r.top + 8) + 'px';
    }
    m.hidden = !show; b.setAttribute('aria-expanded', String(!!show));
  }
  function anyMenu() { return Object.keys(MENUS).some(function (k) { return !el[k].hidden; }); }
  function closeMenus() { Object.keys(MENUS).forEach(function (k) { menu(k, false); }); }
  function onTool(e) {
    var b = e.target.closest('button'); if (!b) return;
    var pg = page();
    if (b.classList.contains('wsb-pt')) { if (st.eraser || st.geo || st.pan) { st.eraser = false; st.geo = null; st.pan = false; gp = null; closeMenus(); ov(); } else menu('ptm', el.ptm.hidden); }   // баллуур/геометрээс нэг дарж бичих рүү
    else if (b.classList.contains('wsb-col')) menu('colm', el.colm.hidden);
    else if (b.classList.contains('wsb-er')) { st.geo = null; st.pan = false; gp = null; if (!st.eraser) { st.eraser = true; menu('erm', true); } else menu('erm', el.erm.hidden); }   // эхний дарахад баллуур + цэс
    else if (b.classList.contains('wsb-geo')) menu('geom', el.geom.hidden);
    else if (b.classList.contains('wsb-calcb')) { calcOpen(!st.calc.open); }
    else if (b.classList.contains('wsb-hintb')) { hintOpen(el.hint.hidden); }
    else if (b.classList.contains('wsb-bg')) menu('bgm', el.bgm.hidden);
    else if (b.classList.contains('wsb-undo')) { undo(pg); gp = null; render(); drawBg(); bump(); }
    else if (b.classList.contains('wsb-redo')) { redo(pg); gp = null; render(); drawBg(); bump(); }
    else if (b.classList.contains('wsb-clear')) { if (clearPage(pg)) { gp = null; render(); drawBg(); bump(); } }
    else if (b.classList.contains('wsb-prev')) go(st.cur - 1);
    else if (b.classList.contains('wsb-next')) go(st.cur + 1);
    else if (b.classList.contains('wsb-add')) { st.pages.push(newPage()); go(st.pages.length - 1); }
    else if (b.classList.contains('wsb-close')) { close(); return; }
    sync();
  }
  function onPtMenu(e) {                         // хэрэгсэл сонгоход цэс нээлттэй үлдэнэ — зузаанаа тохируулна
    var b = e.target.closest('button[data-pt]'); if (!b) return;
    st.tool = b.getAttribute('data-pt'); st.eraser = false; st.geo = null; st.pan = false; gp = null; savePt(); sync(); ov();
  }
  function onColMenu(e) {
    var b = e.target.closest('button[data-col]'); if (!b) return;
    var c = b.getAttribute('data-col');
    if (st.tool === 'hl') st.hl = c; else st.color = c;
    st.eraser = false; menu('colm', false); sync();
  }
  function onErMenu(e) {
    var b = e.target.closest('button[data-er]'); if (!b || b.disabled) return;
    var k = b.getAttribute('data-er');
    if (k === 'all') { if (clearPage(page())) { gp = null; render(); drawBg(); bump(); } st.eraser = false; }        // бүгдийг арилгаад бичих рүү (буцаах боломжтой)
    else { st.erMode = k; st.eraser = true; save('cm_wsb_er', k); }
    menu('erm', false); sync();
  }
  function onGeoMenu(e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-geo')) { st.geo = b.getAttribute('data-geo'); st.eraser = false; st.pan = false; gp = null; menu('geom', false); sync(); ov(); }
    else if (b.hasAttribute('data-fn')) addFn();
  }
  function onBgMenu(e) {                         // хээ, өнгө хоёуланг сонгож болохоор цэс нээлттэй үлдэнэ
    var b = e.target.closest('button'); if (!b) return;
    if (b.hasAttribute('data-bg')) st.bg = +b.getAttribute('data-bg');
    else if (b.hasAttribute('data-tone')) setTone(+b.getAttribute('data-tone'));
    else return;
    saveBg();
    bump(); drawBg(); render(); sync();
  }
  // Цайвар ↔ бараан самбар: сонгосон бэх хос өнгө рүүгээ шилжинэ (хар → цагаан, шар → цайвар шар …)
  function setTone(i) {
    var was = dark(); st.tone = Math.max(0, Math.min(TONES.length - 1, i | 0));
    if (was !== dark()) st.color = inkOn(st.color, dark());
  }
  function sync() {
    var pg = page(), t = el.tools, lasso = st.erMode === 'lasso', hl = st.tool === 'hl', dk = dark(), pal = hl ? HLS : dk ? INK_D : INK_L, cur = hl ? st.hl : st.color;
    var name = PENS.filter(function (x) { return x[0] === st.tool; })[0][1], pb = t.querySelector('.wsb-pt');
    pb.innerHTML = ICO[st.tool] + '<span>' + name + '</span>' + ICO.caret; pb.classList.toggle('on', !st.eraser && !st.geo);
    [].forEach.call(el.ptm.querySelectorAll('[data-pt]'), function (b) { var on = b.getAttribute('data-pt') === st.tool; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    var wr = WR[st.tool], w = st.wid[st.tool], ri = el.ptm.querySelector('.wsb-wd input'), pv = el.ptm.querySelector('.wsb-wd svg'), path = pv.querySelector('path'), show = hl ? cur : inkOn(cur, dk);
    ri.min = wr[0]; ri.max = wr[1]; ri.value = w;
    el.ptm.querySelector('.wsb-wd-h b').textContent = w + ' px';
    pv.style.background = TONES[st.tone][2];
    path.setAttribute('stroke', show); path.setAttribute('stroke-width', String(Math.min(w, 40))); path.setAttribute('stroke-opacity', hl ? '.45' : '1');
    var cb = t.querySelector('.wsb-col'); cb.innerHTML = '<i style="background:' + show + '"></i>' + ICO.caret;
    cb.title = 'Өнгө: ' + ((pal.filter(function (c) { return c[0] === cur; })[0] || ['', ''])[1]); cb.classList.toggle('on', !el.colm.hidden);
    el.colm.querySelector('.wsb-sws').innerHTML = pal.map(function (c) {
      return '<button type="button" data-col="' + c[0] + '" title="' + c[1] + '" aria-label="' + c[1] + '"' + (c[0] === cur ? ' class="on"' : '') + '><i style="background:' + c[0] + '"></i></button>';
    }).join('');
    el.colm.style.background = hl ? '#fff' : TONES[dk ? st.tone : 0][2];
    var er = t.querySelector('.wsb-er');
    er.innerHTML = (lasso ? ICO.lasso : ICO.eraser) + ICO.caret;
    er.title = 'Баллуур: ' + (lasso ? 'хүрээлж арилгах' : 'зурж арилгах');
    er.classList.toggle('on', st.eraser);
    [].forEach.call(el.erm.querySelectorAll('[data-er]'), function (b) {
      var k = b.getAttribute('data-er');
      if (k === 'all') { b.disabled = !pg.strokes.length && !(pg.geo && (pg.geo.pts.length || pg.geo.fns.length)); return; }
      b.classList.toggle('on', st.eraser && st.erMode === k); b.setAttribute('aria-checked', String(st.eraser && st.erMode === k));
    });
    var ei = el.erm.querySelector('input[type=range]'); ei.value = st.erW; el.erm.querySelector('.wsb-wd-h b').textContent = st.erW + ' px';
    el.erm.querySelector('input[type=checkbox]').checked = st.gest;
    var gb = t.querySelector('.wsb-geo'), gt = GEO_T.filter(function (x) { return x[0] === st.geo; })[0];
    gb.innerHTML = (gt ? ICO[gt[0]] : ICO.geo) + ICO.caret; gb.title = gt ? 'Геометр: ' + gt[1].toLowerCase() : 'Геометр: цэг, хэрчим, шулуун, дүрс, график';
    gb.classList.toggle('on', !!st.geo);
    [].forEach.call(el.geom.querySelectorAll('[data-geo]'), function (b) { var on = b.getAttribute('data-geo') === st.geo; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    t.querySelector('.wsb-calcb').classList.toggle('on', st.calc.open);
    t.querySelector('.wsb-hintb').classList.toggle('on', !el.hint.hidden);
    t.querySelector('.wsb-undo').disabled = !pg.undo.length;
    t.querySelector('.wsb-redo').disabled = !pg.redo.length;
    t.querySelector('.wsb-clear').disabled = !pg.strokes.length && !(pg.geo && (pg.geo.pts.length || pg.geo.fns.length));
    var bg = BGS[st.bg];
    var bgb = t.querySelector('.wsb-bg'); bgb.innerHTML = ICO[bg[0]] + ICO.caret; bgb.title = 'Дэвсгэр: ' + bg[1].toLowerCase() + ', ' + TONES[st.tone][1].toLowerCase() + ' самбар'; bgb.setAttribute('aria-label', bgb.title);
    [].forEach.call(el.bgm.querySelectorAll('[data-bg]'), function (b) { var on = +b.getAttribute('data-bg') === st.bg; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    [].forEach.call(el.bgm.querySelectorAll('[data-tone]'), function (b) { var on = +b.getAttribute('data-tone') === st.tone; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    el.paper.className = 'wsb-paper bg-' + bg[0]; el.paper.style.backgroundColor = TONES[st.tone][2];
    el.box.classList.toggle('wsb-dark', dk);
    t.querySelector('.wsb-n').textContent = (st.cur + 1) + ' / ' + st.pages.length;
    t.querySelector('.wsb-prev').disabled = st.cur === 0;
    t.querySelector('.wsb-next').disabled = st.cur === st.pages.length - 1;
    el.cv.style.cursor = st.eraser && !lasso ? curEr(st.erW) : CUR_DOT;
    if (st.geo === 'move' || st.pan) el.cv.style.cursor = 'grab';
    el.zc.querySelector('[data-pz="hand"]').classList.toggle('on', !!st.pan);
  }
  function go(i) {
    st.cur = Math.max(0, Math.min(st.pages.length - 1, i)); gp = null;
    var pg = page();
    el.pin.innerHTML = pg.pin || '<div class="wsb-empty">' + I('<path d="M15 4.5 19.5 9M4 20l5.5-1.5L19 9l-4.5-4.5L5 14z"/>', 20) + 'Зүүн талын бодлого дээр дарахад энд томоор гарна</div>';
    [].forEach.call(D.querySelectorAll('#sheet .q.wsb-pinned'), function (q) { q.classList.remove('wsb-pinned'); });
    if (pg.q && D.contains(pg.q)) pg.q.classList.add('wsb-pinned');
    bump(); drawBg(); render(); ov(); sync();
  }

  /* ── Координатын хавтгайн томруулалт: товч (−/+/Төвд), хулганы дугуй, хоёр хуруугаар чимхэх — бичиг, геометр хамт ── */
  function zoomAt(sp, k) {
    var v = V(), s = Math.max(0.2, Math.min(8, v.s * k)), w = toW(sp);
    v.x = sp[0] - w[0] * s; v.y = sp[1] - w[1] * s; v.s = s;
    bump(); drawBg(); render(); ov();
  }
  function onPlaneZoom(e) {
    var b = e.target.closest('button[data-pz]'); if (!b) return;
    var k = b.getAttribute('data-pz'), r = el.cv.getBoundingClientRect(), c = [r.width / 2, r.height / 2];
    if (k === 'hand') { st.pan = !st.pan; if (st.pan) { st.geo = null; gp = null; } sync(); ov(); return; }
    if (k === '0') { var v = V(); v.s = 1; if (isCoord()) { var o = O(); v.x = c[0] - o.x; v.y = c[1] - o.y; } else { v.x = 0; v.y = 0; } bump(); drawBg(); render(); ov(); }
    else zoomAt(c, k === '+' ? 1.25 : 0.8);
  }
  function panBy(dx, dy) { var v = V(); v.x += dx; v.y += dy; bump(); drawBg(); render(); ov(); }
  // Гүйлгэх зурвас: бичгийн хүрээ + доод талд дэлгэцийн 80% хоосон зай (доош үргэлжлүүлэн бичнэ); чирэх эсвэл зурвас дээр дарах
  var SB = null, SBF = null, BBC = typeof WeakMap === 'function' ? new WeakMap() : null;     // SBF — чирж байх үеийн тогтмол муж
  function sbb(s) {
    var b = BBC && BBC.get(s); if (b) return b;
    b = [Infinity, Infinity, -Infinity, -Infinity];
    s.p.forEach(function (q) { if (q) { b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[0]); b[3] = Math.max(b[3], q[1]); } });
    if (BBC) BBC.set(s, b); return b;
  }
  function contentY() {
    var pg = page(), y0 = Infinity, y1 = -Infinity;
    pg.strokes.forEach(function (s) { if (s.er) return; var b = sbb(s); y0 = Math.min(y0, b[1]); y1 = Math.max(y1, b[3]); });
    if (pg.geo && pg.o) pg.geo.pts.forEach(function (q) { var y = pg.o.y - q.y * UNIT; y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
    return y0 <= y1 ? [y0, y1] : null;
  }
  function sbar() {
    if (!el.vs) return;
    var r = el.cv.getBoundingClientRect(), v = V(), vh = r.height / v.s, top = -v.y / v.s, bot = top + vh, ext = contentY();
    var R = SBF || { lo: Math.min(top, 0, ext ? ext[0] - 40 : 0), hi: Math.max(bot + vh * 0.5, ext ? ext[1] + vh * 0.8 : 0) };   // доош үргэлж хагас дэлгэц
    var lo = Math.min(R.lo, top), hi = Math.max(R.hi, bot), th = el.vs.clientHeight, hgt = Math.max(36, Math.min(th, th * vh / (hi - lo))), span = (hi - lo) - vh;
    SB = { lo: lo, hi: hi, vh: vh, th: th, hgt: hgt };
    el.vs.firstChild.style.height = Math.round(hgt) + 'px';
    el.vs.firstChild.style.top = Math.round(Math.max(0, Math.min(th - hgt, span > 0 ? (th - hgt) * (top - lo) / span : 0))) + 'px';
  }
  function setThumb(t) {
    t = Math.max(0, Math.min(SB.th - SB.hgt, t));
    var f = SB.th - SB.hgt > 0 ? t / (SB.th - SB.hgt) : 0, v = V();
    v.y = -(SB.lo + f * Math.max(0, (SB.hi - SB.lo) - SB.vh)) * v.s; drawBg(); render(); ov();
  }
  function bindScroll() {
    var drag = null;
    el.vs.addEventListener('pointerdown', function (e) {
      if (st.ro || !SB) return;
      e.preventDefault(); e.stopPropagation();
      var y = e.clientY - el.vs.getBoundingClientRect().top, t0 = parseFloat(el.vs.firstChild.style.top) || 0;
      if (y < t0 || y > t0 + SB.hgt) { setThumb(y - SB.hgt / 2); t0 = parseFloat(el.vs.firstChild.style.top) || 0; }   // зурвас дээр дарвал тэр хэсэг рүү
      drag = { id: e.pointerId, y0: e.clientY, t0: t0 }; SBF = { lo: SB.lo, hi: SB.hi };
      try { el.vs.setPointerCapture(e.pointerId); } catch (x) {}
    });
    el.vs.addEventListener('pointermove', function (e) { if (drag && drag.id === e.pointerId) setThumb(drag.t0 + e.clientY - drag.y0); });
    var up = function (e) { if (drag && drag.id === e.pointerId) { drag = null; SBF = null; sbar(); bump(); } };
    el.vs.addEventListener('pointerup', up); el.vs.addEventListener('pointercancel', up);
  }

  /* ── Тооны машин ── */
  function calcEl(s) { return el.calc.querySelector(s); }
  function calcOpen(on) {
    var c = st.calc; c.open = !!on; el.calc.hidden = !c.open;
    if (c.open) {
      if (c.fx == null) {                                                      // анх: самбарын баруун дээд буланд
        var R = el.box.getBoundingClientRect(), P = el.paper.getBoundingClientRect();
        c.fx = Math.max(0, (R.width - 348 - 16) / R.width); c.fy = Math.max(0, (P.top - R.top + 12) / R.height);
      }
      calcPlace(); calcShow();
    }
    bump(); sync();
  }
  function calcPlace() {
    var R = el.box.getBoundingClientRect(), c = st.calc;
    el.calc.style.left = Math.round(Math.max(0, Math.min(R.width - 348, c.fx * R.width))) + 'px';
    el.calc.style.top = Math.round(Math.max(0, Math.min(R.height - 120, c.fy * R.height))) + 'px';
  }
  function calcShow() {
    var c = st.calc, inp = calcEl('input'), out = calcEl('b');
    if (inp.value !== c.e) inp.value = c.e;
    calcEl('.wsb-cdeg').textContent = c.deg ? 'DEG' : 'RAD';
    [].forEach.call(el.calc.querySelectorAll('[data-k]'), function (b) {
      var k = CK[+b.getAttribute('data-k')];
      if (k[3]) b.textContent = c.sec ? k[3] : k[0];
      if (k[1] === '#2nd') b.classList.toggle('on', c.sec);
      if (k[1] === '#frac') b.classList.toggle('on', c.frac);
    });
    out.className = '';
    if (c.err) { out.textContent = 'Алдаа'; out.className = 'err'; return; }
    var v = c.done ? c.r : calcEval(c.e, c.deg, c.ans);
    if (typeof v !== 'number' || !isFinite(v)) { out.textContent = c.e.trim() && !c.done ? '' : ''; return; }
    var fr = c.frac ? toFrac(v) : null;
    out.textContent = (c.done ? '= ' : '') + (fr && fr[1] !== 1 ? (fr[0] < 0 ? '−' : '') + Math.abs(fr[0]) + '/' + fr[1] : fmtCalc(v));
    if (!c.done) out.className = 'pre';
  }
  function calcKey(k) {
    var c = st.calc, ins = c.sec && k[4] ? k[4] : k[1];
    if (ins === '#2nd') { c.sec = !c.sec; calcShow(); return; }
    if (ins === '#frac') { c.frac = !c.frac; calcShow(); bump(); return; }
    if (ins === '#ac') { c.e = ''; c.r = null; c.err = false; c.done = false; }
    else if (ins === '#bs') { c.e = c.e.replace(/(arcsin\(|arccos\(|arctg\(|sin\(|cos\(|tg\(|lg\(|ln\(|abs\(|Ans|×10\^\(|10\^\(|e\^\(|\^\(−1\)|√\(|∛\(|\^\(|.)$/, ''); c.done = false; c.err = false; }
    else if (ins === '#eq') {
      if (!c.e.trim()) return;
      var v = calcEval(c.e, c.deg, c.ans);
      if (typeof v === 'number' && isFinite(v)) { c.ans = v; c.r = v; c.err = false; c.done = true; } else { c.err = true; c.done = false; }
    } else {
      if (c.done) c.e = /^[+×÷−^!%]|^\^/.test(ins) ? 'Ans' : '';            // хариуны дараа: тоо → шинэ, үйлдэл → Ans-аас үргэлжилнэ
      c.e += ins; c.done = false; c.err = false;
    }
    if (c.sec && k[4]) c.sec = false;
    calcShow(); bump();
  }
  function bindCalc() {
    el.calc.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('wsb-cx')) { calcOpen(false); return; }
      if (b.classList.contains('wsb-cdeg')) { st.calc.deg = !st.calc.deg; calcShow(); bump(); return; }
      if (b.hasAttribute('data-k')) calcKey(CK[+b.getAttribute('data-k')]);
    });
    var inp = calcEl('input');
    inp.addEventListener('input', function () { st.calc.e = inp.value.slice(0, 200); st.calc.done = false; st.calc.err = false; calcShow(); bump(); });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); calcKey(['=', '#eq']); } else if (e.key === 'Escape') { calcOpen(false); } });
    var h = calcEl('.wsb-ch'), drag = null;
    h.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button') || st.ro) return;
      e.preventDefault(); var r = el.calc.getBoundingClientRect(); drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
      try { h.setPointerCapture(e.pointerId); } catch (x) {}
    });
    h.addEventListener('pointermove', function (e) {
      if (!drag || drag.id !== e.pointerId) return;
      var R = el.box.getBoundingClientRect();
      st.calc.fx = Math.max(0, Math.min(1, (e.clientX - drag.dx - R.left) / R.width)); st.calc.fy = Math.max(0, Math.min(1, (e.clientY - drag.dy - R.top) / R.height));
      calcPlace();
    });
    var up = function (e) { if (drag && drag.id === e.pointerId) { drag = null; bump(); } };
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
  }

  // Санамж — өгөгдөл, сэдэв таних нь дээрх загварын хэсэгт (HINTS, hintsFor)
  function pageHints() {
    var h = D.querySelector('#sheet .head h1, .head h1, #sheet h1');
    return hintsFor(D.title + ' ' + ((h && h.textContent) || '') + ' ' + location.pathname);
  }
  function hintHtml(list) {
    var K = W.katex, esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
    return list.map(function (x) {
      return '<div class="wsb-hc"><b>' + x[1] + '</b>' + x[2].map(function (t) {
        var s; try { s = K ? K.renderToString(t, { throwOnError: false }) : '<code>' + esc(t) + '</code>'; } catch (e) { s = '<code>' + esc(t) + '</code>'; }
        return '<div class="wsb-hf">' + s + '</div>';
      }).join('') + '</div>';
    }).join('');
  }
  function hintOpen(on) {
    el.hint.hidden = !on;
    if (on) { var R = el.box.getBoundingClientRect(), P = el.paper.getBoundingClientRect(); el.hint.style.top = Math.round(P.top - R.top + 12) + 'px'; }
    bump(); sync();
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
    if (!st.on || st.ro) return;
    var q = e.target.closest && e.target.closest('#sheet .q'); if (!q) return;
    if (e.target.closest('button,a,input,select,label,[contenteditable="true"]')) return;
    e.preventDefault(); e.stopPropagation(); pin(q);
  }
  function onKey(e) {
    if (!st.on || st.ro) return;
    if (e.key === 'Escape' && anyMenu()) { closeMenus(); return; }            // цэсний сонголт (гулсуур, checkbox) дээр байсан ч
    var tg = e.target && e.target.tagName;
    if (tg === 'INPUT' || tg === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
    if (e.key === 'Escape') { if (gp) { gp = null; ov(); return; } close(); return; }
    var k = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(page()); else undo(page()); gp = null; render(); drawBg(); bump(); sync(); }
    else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(page()); gp = null; render(); drawBg(); bump(); sync(); }
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
    curZ = z; bump();
    spacer();
    if (keep && sh) { var r1 = sh.getBoundingClientRect(); W.scrollBy(r1.left + u * z - keep.x, r1.top + v * z - keep.y); }
    if (el.zl) el.zl.textContent = Math.round(z * 100) + '%';
    if (st.calc.open) calcPlace();
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
      if (st.ro) return;
      if (e.clientX < paneW()) setZ(curZ * Math.exp(-e.deltaY * 0.0025), { x: e.clientX, y: e.clientY });
    }, { passive: false });
    // Хоёр хуруугаар чимхэх (смарт самбар) — зүүн талд л
    var pin0 = null;
    var dist = function (t) { return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY); };
    D.addEventListener('touchstart', function (e) {
      if (!st.on || st.ro || e.touches.length !== 2) return;
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

  /* ── «Самбарт илгээх»: компьютер өөрийн самбарын төлвийг (одоогийн хуудас) явуулна; смарт самбар зөвхөн харах горимоор дагана ── */
  function state() {
    var pg = page(), qs = D.querySelectorAll('#sheet .q'), r = st.on && el.cv ? el.cv.getBoundingClientRect() : { width: 0, height: 0 }, c = st.calc;
    return { open: st.on, frac: st.frac, bg: st.bg, tone: st.tone, cur: st.cur, n: st.pages.length, z: st.z, W: Math.round(r.width), H: Math.round(r.height),
      calc: { open: c.open, fx: c.fx, fy: c.fy, e: c.e, r: c.done ? c.r : null, err: c.err, deg: c.deg, frac: c.frac }, hint: !!(el.hint && !el.hint.hidden),
      page: { qi: pg.q ? [].indexOf.call(qs, pg.q) : -1, pin: pg.pin || '', strokes: pg.strokes, v: pg.v || null, o: pg.o || null, geo: pg.geo || null } };
  }
  // b — ws-store.js цэвэрлэсэн (pin HTML); зурлага, геометрийг энд шалгана. Ертөнцийн координат хэвээр — харагдацыг самбарын өргөнөөр томруулна
  function mirror(b) {
    if (!b || !b.open) { if (st.ro) close(); return; }
    build();
    closeMenus(); live = null; tp = {}; dead = {}; gp = null; st.geo = null;
    st.ro = true; el.box.classList.add('wsb-ro');
    if (b.frac >= 0.35 && b.frac <= 0.75) st.frac = +b.frac;
    st.bg = b.bg >= 0 && b.bg < BGS.length ? b.bg | 0 : 0;
    st.tone = b.tone >= 0 && b.tone < TONES.length ? b.tone | 0 : 0;
    if (!st.on) { st.on = true; D.documentElement.classList.add('wsb-on'); el.box.hidden = false; }
    setW(); fit();
    var n = Math.max(1, Math.min(200, b.n | 0)), cur = Math.max(0, Math.min(n - 1, b.cur | 0)), pages = [];
    for (var i = 0; i < n; i++) pages.push(newPage());
    var src = b.page || {}, pg = pages[cur], k = b.W > 0 ? el.cv.getBoundingClientRect().width / b.W : 1, sv = src.v || {};
    var num = function (v, d) { return typeof v === 'number' && isFinite(v) ? v : d; };
    pg.pin = typeof src.pin === 'string' ? src.pin : '';
    pg.q = src.qi >= 0 ? D.querySelectorAll('#sheet .q')[src.qi | 0] || null : null;
    pg.v = { s: Math.max(0.05, Math.min(40, num(sv.s, 1) * k)), x: num(sv.x, 0) * k, y: num(sv.y, 0) * k };
    pg.o = src.o && isFinite(src.o.x) && isFinite(src.o.y) ? { x: +src.o.x, y: +src.o.y } : null;
    pg.geo = normGeo(src.geo) || emptyGeo();
    (Array.isArray(src.strokes) ? src.strokes : []).forEach(function (s) { var o = normStroke(s, 1); if (o) pg.strokes.push(o); });
    st.pages = pages;
    var c = b.calc || {}, cc = st.calc;
    cc.e = String(c.e || '').slice(0, 200); cc.r = num(c.r, null); cc.done = cc.r !== null; cc.err = !!c.err; cc.deg = c.deg !== false; cc.frac = !!c.frac;
    cc.fx = num(c.fx, null); cc.fy = num(c.fy, null);
    cc.open = !!c.open; el.calc.hidden = !cc.open; if (cc.open) { if (cc.fx == null) { cc.fx = 0.6; cc.fy = 0.1; } calcPlace(); calcShow(); }
    if (!el.tools.querySelector('.wsb-hintb').hidden || !b.hint) { el.hint.hidden = !b.hint; if (b.hint) { var R = el.box.getBoundingClientRect(), P = el.paper.getBoundingClientRect(); el.hint.style.top = Math.round(P.top - R.top + 12) + 'px'; } }
    go(cur);
  }
  function setZoom(z) { st.z = z > 0 ? Math.max(0.2, Math.min(6, z)) : null; zoomSheet(); }

  function open() {
    build(); st.on = true;
    D.documentElement.classList.add('wsb-on'); el.box.hidden = false;
    setW(); fit(); go(st.cur);
  }
  function close() {
    if (!st.on) return;
    st.on = false; st.ro = false; live = null; tp = {}; dead = {}; gp = null;
    closeMenus(); ov();
    el.box.classList.remove('wsb-ro');
    D.documentElement.classList.remove('wsb-on'); el.box.hidden = true;
    [].forEach.call(D.querySelectorAll('.sheet'), function (s) { s.style.zoom = ''; });
    var sp = D.getElementById('wsbSpacer'); if (sp) sp.parentNode.removeChild(sp);
    [].forEach.call(D.querySelectorAll('#sheet .q.wsb-pinned'), function (q) { q.classList.remove('wsb-pinned'); });
    bump();
  }
  root.wsBoard = { open: open, close: close, toggle: function () { if (st.on) close(); else open(); }, isOpen: function () { return st.on; },
    rev: function () { return rv; }, state: state, mirror: mirror, setZoom: setZoom, isMirror: function () { return st.ro; }, _st: st, _hints: { HINTS: HINTS, GRADE_HINTS: GRADE_HINTS } };
})(typeof window !== 'undefined' ? window : globalThis);
