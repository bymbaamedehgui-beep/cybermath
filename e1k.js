/* e1k.js — «ЭЕШ 1000 бодлого» ажлын хуудасны нийтлэг хөдөлгүүр (eesh1000-N.html).
   Хуудас бүр зөвхөн генераторууд + E1K.page({ title, sub, first, probs: [p1, …] }) дуудна.
   Генератор () → { q, a, fig?, side?, wk?, wide? }   (null буцаавал дахин оролдоно)
     q    — асуулт (HTML, $…$ TeX). Алхамтай бол steps([...]), нүд: var b = Bx(); b('a', 5) → \bx{a}; хариу: b.key()
     a    — хариу ($…$ TeX; кирилл үгтэй бол өөрөө $-ээ тавина)
     fig  — Fig(...).svg() эсвэл tbl([...]); side:true бол асуултын баруун талд
     wk   — бодолтын зайн өндөр (мм, анхдагч 30)
   TeX-д < > БҮҮ бич — \lt \gt \le \ge (HTML таг болж эвдэрнэ).
   ws-store.js: WS_PAGED — хэвлэхэд нэг хуудсанд шахахгүй (25 бодлого олон хуудас). */
(function (root) {
  'use strict';

  /* ───────── санамсаргүй ба тоо ───────── */
  var RNG = Math.random;
  function rnd(a, b) { return a + Math.floor(RNG() * (b - a + 1)); }
  function nz(a, b) { var v; do { v = rnd(a, b); } while (v === 0); return v; }
  function pick(a) { return a[rnd(0, a.length - 1)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(0, i), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function setRng(f) { RNG = f || Math.random; }
  // fn-ийг guard-аар шүүж 400 удаа хүртэл оролдоно
  function gen(fn, guard) { for (var t = 0; t < 400; t++) { var g = null; try { g = fn(); } catch (e) { g = null; } if (g && (!guard || guard(g))) return g; } return null; }

  // Аравтын бутархай: 6.5, -0.25 (хөвөгч алдааг арилгана)
  function dec(x, k) {
    var v = +(+x).toFixed(k == null ? 6 : k); if (v === 0) v = 0;
    var s = String(v);
    if (/e/i.test(s)) s = v.toFixed(k == null ? 6 : k).replace(/\.?0+$/, '');
    return s;
  }
  // Хураасан бутархай (бүхэл n, d): fr(6, 4) → \dfrac{3}{2}; fr(-4, 2) → -2; cmd: 'frac' | 'tfrac'
  function fr(n, d, cmd) {
    if (d === undefined) d = 1;
    if (d === 0) return null;
    if (d < 0) { n = -n; d = -d; }
    var g = gcd(n, d); n /= g; d /= g;
    if (d === 1) return String(n);
    return (n < 0 ? '-' : '') + '\\' + (cmd || 'dfrac') + '{' + Math.abs(n) + '}{' + d + '}';
  }
  function frs(n, d) { return fr(n, d, 'frac'); }
  // Залгах тэмдэг: sgn(5) → '+5', sgn(-3) → '-3';  par(-3) → '(-3)'
  function sgn(n) { return n < 0 ? '-' + dec(-n) : '+' + dec(n); }
  function par(n) { return n < 0 ? '(' + dec(n) + ')' : dec(n); }
  // Гишүүн: tm(c, 'x^2', first) — c тоо эсвэл [n, d]; 0 бол ''; 1/−1 коэффициентийг бичихгүй
  function tm(c, v, first) {
    var n, d;
    if (Array.isArray(c)) { n = c[0]; d = c[1]; } else { n = c; d = 1; }
    if (d < 0) { n = -n; d = -d; }
    if (!n) return '';
    if (Math.round(n) === n && Math.round(d) === d) { var g = gcd(n, d); n /= g; d /= g; }
    var neg = n < 0, a = Math.abs(n), body;
    if (d === 1) body = (a === 1 && v) ? '' : dec(a);
    else body = '\\frac{' + dec(a) + '}{' + d + '}';
    return (neg ? '-' : (first ? '' : '+')) + body + (v || '');
  }
  // Олон гишүүнт (их зэргээс): poly([1, -3, 0, 2]) → x^3-3x^2+2
  function poly(cs, v) {
    v = v || 'x';
    var deg = cs.length - 1, out = '', first = true;
    cs.forEach(function (c, i) {
      var p = deg - i, vv = p === 0 ? '' : p === 1 ? v : v + '^{' + p + '}', t = tm(c, vv, first);
      if (t) { out += t; first = false; }
    });
    return out || '0';
  }
  // √n хялбарчлах: surd(12) → { k: 2, r: 3, tex: '2\\sqrt{3}' }
  function surd(n) {
    var k = 1, r = n;
    for (var i = 2; i * i <= r; i++) while (r % (i * i) === 0) { r /= i * i; k *= i; }
    return { k: k, r: r, tex: rt(k, r) };
  }
  // k√r TeX (k бүхэл): rt(3, 2) → 3\sqrt{2}; rt(-1, 5) → -\sqrt{5}
  function rt(k, r) {
    if (r === 1 || k === 0) return String(k);
    return (k === -1 ? '-' : k === 1 ? '' : String(k)) + '\\sqrt{' + r + '}';
  }
  // Матриц: mat([[1, 2], [3, 4]])
  function mat(rows) { return '\\begin{pmatrix}' + rows.map(function (r) { return r.map(function (x) { return typeof x === 'number' ? dec(x) : x; }).join('&'); }).join('\\\\') + '\\end{pmatrix}'; }
  // Цэг: pt(3, -2) → (3;\,-2)
  function pt() { return '(' + [].map.call(arguments, function (x) { return typeof x === 'number' ? dec(x) : x; }).join(';\\,') + ')'; }
  var DEG = '^\\circ';
  // Тооны дагавар (тоог уншихад сүүлийн үгээр): sfx(4, 'ын') → '4-ийн', sfx(6, 'д') → '6-д', sfx(2, 'аас') → '2-оос',
  // sfx(20, 'аар') → '20-оор', sfx(5, 'тай') → '5-тай', sfx(10, 'ыг') → '10-ыг'. Аравтын бутархайд сүүлийн цифрээр (3.4 → дөрөв).
  // suf(45, 'ын') → 'ын' (зөвхөн дагавар: $45^circ$-ын)
  var SFX = { 0: ['ийн', 'т', 'ээс', 'ээр', 'тэй', 'ийг'], 1: ['ийн', 'д', 'ээс', 'ээр', 'тэй', 'ийг'], 2: ['ын', 'т', 'оос', 'оор', 'той', 'ыг'], 3: ['ын', 'т', 'аас', 'аар', 'тай', 'ыг'],
    4: ['ийн', 'т', 'өөс', 'өөр', 'тэй', 'ийг'], 5: ['ын', 'д', 'аас', 'аар', 'тай', 'ыг'], 6: ['ийн', 'д', 'аас', 'аар', 'тай', 'г'], 7: ['ийн', 'д', 'оос', 'оор', 'той', 'г'],
    8: ['ын', 'д', 'аас', 'аар', 'тай', 'ыг'], 9: ['ийн', 'д', 'өөс', 'өөр', 'тэй', 'ийг'], 10: ['ын', 'т', 'аас', 'аар', 'тай', 'ыг'], 20: ['ийн', 'д', 'оос', 'оор', 'той', 'ийг'],
    30: ['ийн', 'д', 'аас', 'аар', 'тай', 'ийг'], 40: ['ийн', 'д', 'өөс', 'өөр', 'тэй', 'ийг'], 50: ['ийн', 'д', 'аас', 'аар', 'тай', 'ийг'], 60: ['ын', 'т', 'аас', 'аар', 'тай', 'ыг'],
    70: ['ын', 'д', 'аас', 'аар', 'тай', 'ыг'], 80: ['ын', 'д', 'аас', 'аар', 'тай', 'г'], 90: ['ийн', 'т', 'өөс', 'өөр', 'тэй', 'ийг'], 100: ['ийн', 'д', 'аас', 'аар', 'тай', 'г'],
    1000: ['ны', 'д', 'аас', 'аар', 'тай', 'ыг'], 1e6: ['ын', 'д', 'аас', 'аар', 'тай', 'ыг'] };
  var SFXK = { 'ын': 0, 'ийн': 0, 'д': 1, 'т': 1, 'аас': 2, 'ээс': 2, 'аар': 3, 'ээр': 3, 'тай': 4, 'тэй': 4, 'ыг': 5, 'ийг': 5 };
  function sfx(x, kind) {
    var s = dec(x), k = SFXK[kind], w;
    if (k == null) throw new Error('sfx: ' + kind);
    var ds = s.replace('-', '').split('.');
    if (ds[1]) w = +ds[1].slice(-1);
    else {
      var n = Math.abs(Math.round(+x));
      w = n % 10 ? n % 10 : n % 100 ? n % 100 : n % 1000 ? 100 : n === 0 ? 0 : n % 1e6 ? 1000 : 1e6;
    }
    return s + '-' + SFX[w][k];
  }
  function suf(x, kind) { return sfx(x, kind).split('-').pop(); }

  /* ───────── ЭЕШ-ийн нүд ба алхам ───────── */
  // var b = Bx(); b('A', 39) → \bx{ab} (утгын цифр бүрд нэг үсэг); b('A') дахин → мөн \bx{ab}; b.key() → $ab=39$, …
  function Bx() {
    var L = 'abcdefghijklmnopqrstuvwxyz', i = 0, map = {}, list = [];
    function b(key, val) {
      if (map[key]) return '\\bx{' + map[key].l + '}';
      var s = String(val);
      if (!/^\d+$/.test(s)) throw new Error('нүд ' + key + ' = ' + s + ' (зөвхөн цифр)');
      if (i + s.length > 26) throw new Error('нүд хэтэрлээ');
      var o = { l: L.substr(i, s.length), v: s }; i += s.length; map[key] = o; list.push(o);
      return '\\bx{' + o.l + '}';
    }
    b.key = function () { return list.map(function (o) { return '$' + o.l + '=' + o.v + '$'; }).join(', '); };
    b.count = function () { return i; };
    return b;
  }
  function steps(arr) {
    return '<div class="steps">' + arr.map(function (s, i) { return '<div class="sp"><span class="spn">(' + (i + 1) + ')</span><span class="stx">' + s + '</span></div>'; }).join('') + '</div>';
  }
  // Хүснэгт: tbl([['Тоо', 1, 2], ['Давтамж', 5, 3]]) — мөр бүрийн эхний нүд гарчиг
  function tbl(rows, o) {
    o = o || {};
    return '<table class="e1k-tbl">' + rows.map(function (r) {
      return '<tr>' + r.map(function (c, j) { var tag = j === 0 && !o.noHead ? 'th' : 'td'; return '<' + tag + '>' + (typeof c === 'number' ? dec(c) : c) + '</' + tag + '>'; }).join('') + '</tr>';
    }).join('') + '</table>';
  }

  /* ───────── Зураг (SVG) ─────────
     var f = Fig({ w: 260 })  — ертөнцийн координатаар зурна, хэмжээг өөрөө тааруулна (тэнхлэгийн масштаб ижил).
       { view: [x0, x1, y0, y1] }  — харах муж (тэнхлэг/тор/функцийн графикт заавал)
       { free: true, w, h }        — x, y масштаб тусдаа (ж: хуримтлагдсан давтамж)
     f.seg(A, B, st) · f.path(pts, st) · f.poly(pts, st) · f.rect(x0, y0, x1, y1, st) · f.circle(C, r, st)
     f.arc(C, r, a0, a1, st) · f.curve(fn, a, b, st) · f.dot(P, st) · f.arrow(A, B, st) · f.text(P, 'A_1', st)
     f.angle(V, A, B, st) · f.right(V, A, B, st) · f.axes(st) · f.grid(step, st) · f.ticks(xs, ys, st) · f.raw(T => '…')
     st: { w: зузаан, c: өнгө, dash: '4 3', fill, op, pos: 'n'|'ne'|…|градус, size, plain (кирилл бичиг), r, open, h }
     f.svg() → '<svg …>' */
  var INK = '#1b1b1b', FID = 0;
  function escH(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function n2(v) { return +(+v).toFixed(2); }
  // SVG бичиг: 'A_1', 'x^5', "f'(x)" — латин үсэг налуу; '^'/'_' дээд/доод индекс; plain бол шууд
  function lab(s, size, plain) {
    s = String(s);
    if (plain) return escH(s);
    var it = function (t) { return escH(t.replace(/-/g, '−')).replace(/[A-Za-z]+/g, function (m) { return '<tspan font-style="italic">' + m + '</tspan>'; }); };
    var out = '', i = 0, sub = n2(size * 0.7);
    while (i < s.length) {
      var c = s[i];
      if ((c === '^' || c === '_') && i + 1 < s.length) {
        var j = i + 1, t;
        if (s[j] === '{') { var k = s.indexOf('}', j); if (k < 0) k = s.length; t = s.slice(j + 1, k); i = k + 1; } else { t = s[j]; i = j + 1; }
        var dy = c === '^' ? -0.42 * size : 0.28 * size;
        out += '<tspan dy="' + n2(dy) + '" font-size="' + sub + '">' + it(t) + '</tspan><tspan dy="' + n2(-dy) + '">​</tspan>';
        continue;
      }
      var e = i; while (e < s.length && s[e] !== '^' && s[e] !== '_') e++;
      out += it(s.slice(i, e)); i = e;
    }
    return out;
  }
  function Fig(o) {
    o = o || {};
    var ops = [], B = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity }, uid = ++FID;
    function ext(p) { if (!p) return; if (p[0] < B.x0) B.x0 = p[0]; if (p[0] > B.x1) B.x1 = p[0]; if (p[1] < B.y0) B.y0 = p[1]; if (p[1] > B.y1) B.y1 = p[1]; }
    function sty(st, defW) {
      st = st || {};
      return ' stroke="' + (st.c || INK) + '" stroke-width="' + (st.w || defW || 1.4) + '"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : '')
        + ' fill="' + (st.fill || 'none') + '"' + (st.op != null ? ' fill-opacity="' + st.op + '"' : '') + ' stroke-linecap="round" stroke-linejoin="round"';
    }
    function P(T, p) { return n2(T.X(p[0])) + ',' + n2(T.Y(p[1])); }
    function head(x1, y1, x2, y2, h, c) {   // (x2, y2)-д сумны толгой (дэлгэцийн координат)
      var a = Math.atan2(y2 - y1, x2 - x1), w = h * 0.42;
      var p1 = [x2 - h * Math.cos(a) + w * Math.sin(a), y2 - h * Math.sin(a) - w * Math.cos(a)], p2 = [x2 - h * Math.cos(a) - w * Math.sin(a), y2 - h * Math.sin(a) + w * Math.cos(a)];
      return '<polygon points="' + n2(x2) + ',' + n2(y2) + ' ' + n2(p1[0]) + ',' + n2(p1[1]) + ' ' + n2(p2[0]) + ',' + n2(p2[1]) + '" fill="' + (c || INK) + '"/>';
    }
    function textAt(x, y, s, st) {
      st = st || {};
      var size = st.size || 13, off = st.off != null ? st.off : 6, pos = st.pos == null ? 'c' : st.pos, anchor = 'middle', dy = 0.35 * size;
      if (typeof pos === 'number') {
        var a = pos * Math.PI / 180, cx = Math.cos(a), cy = Math.sin(a);
        x += (off + size * 0.35) * cx; y -= (off + size * 0.35) * cy;
        anchor = cx > 0.35 ? 'start' : cx < -0.35 ? 'end' : 'middle';
        if (anchor !== 'middle') { x -= cx * size * 0.3; }
      } else {
        if (/n/.test(pos)) { y -= off + (pos === 'n' ? 0.1 * size : 0); dy = 0; }
        if (/s/.test(pos)) { y += off + (pos === 's' ? 0.1 * size : 0); dy = 0.72 * size; }
        if (/e/.test(pos)) { x += off * (pos === 'e' ? 1 : 0.6); anchor = 'start'; }
        if (/w/.test(pos)) { x -= off * (pos === 'w' ? 1 : 0.6); anchor = 'end'; }
      }
      if (st.anchor) anchor = st.anchor;
      var fam = st.plain ? "'Segoe UI',Arial,sans-serif" : "'KaTeX_Main','Times New Roman',serif";
      return '<text x="' + n2(x) + '" y="' + n2(y + dy) + '" font-size="' + size + '" font-family="' + fam + '" text-anchor="' + anchor + '" fill="' + (st.c || INK) + '"'
        + (st.bold ? ' font-weight="700"' : '') + (st.halo ? ' stroke="#fff" stroke-width="3" paint-order="stroke" stroke-linejoin="round"' : '') + (st.rot ? ' transform="rotate(' + st.rot + ' ' + n2(x) + ' ' + n2(y + dy) + ')"' : '') + '>' + lab(s, size, st.plain) + '</text>';
    }
    var f = {
      seg: function (a, b, st) { ext(a); ext(b); ops.push(function (T) { return '<line x1="' + n2(T.X(a[0])) + '" y1="' + n2(T.Y(a[1])) + '" x2="' + n2(T.X(b[0])) + '" y2="' + n2(T.Y(b[1])) + '"' + sty(st) + '/>'; }); return f; },
      path: function (pts, st) { pts.forEach(ext); ops.push(function (T) { return '<polyline points="' + pts.map(function (p) { return P(T, p); }).join(' ') + '"' + sty(st) + '/>'; }); return f; },
      poly: function (pts, st) { pts.forEach(ext); ops.push(function (T) { return '<polygon points="' + pts.map(function (p) { return P(T, p); }).join(' ') + '"' + sty(st) + '/>'; }); return f; },
      rect: function (x0, y0, x1, y1, st) { return f.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], st); },
      circle: function (c, r, st) { ext([c[0] - r, c[1] - r]); ext([c[0] + r, c[1] + r]); ops.push(function (T) { return '<ellipse cx="' + n2(T.X(c[0])) + '" cy="' + n2(T.Y(c[1])) + '" rx="' + n2(r * T.sx) + '" ry="' + n2(r * T.sy) + '"' + sty(st) + '/>'; }); return f; },
      arc: function (c, r, a0, a1, st) {   // ертөнцийн нум, a0 → a1 (градус, цагийн зүүний эсрэг)
        var n = Math.max(8, Math.ceil(Math.abs(a1 - a0) / 3)), pts = [];
        for (var i = 0; i <= n; i++) { var a = (a0 + (a1 - a0) * i / n) * Math.PI / 180; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
        return f.path(pts, st);
      },
      curve: function (fn, a, b, st, N) {   // y = fn(x), [a; b]; харах мужаас гарвал тасална
        N = N || 260;
        ops.push(function (T) {
          var v = T.v, mY = (v.y1 - v.y0) * 0.02, segs = [], cur = [];
          for (var i = 0; i <= N; i++) {
            var x = a + (b - a) * i / N, y = fn(x);
            if (!isFinite(y) || y > v.y1 + mY * 30 || y < v.y0 - mY * 30) { if (cur.length > 1) segs.push(cur); cur = []; continue; }
            cur.push(n2(T.X(x)) + ',' + n2(T.Y(y)));
          }
          if (cur.length > 1) segs.push(cur);
          return segs.map(function (s) { return '<polyline points="' + s.join(' ') + '"' + sty(st, 1.6) + ' clip-path="url(#e1kc' + uid + ')"/>'; }).join('');
        });
        return f;
      },
      dot: function (p, st) { st = st || {}; ext(p); ops.push(function (T) { return '<circle cx="' + n2(T.X(p[0])) + '" cy="' + n2(T.Y(p[1])) + '" r="' + (st.r || 2.6) + '" fill="' + (st.open ? '#fff' : (st.c || INK)) + '" stroke="' + (st.c || INK) + '" stroke-width="1.2"/>'; }); return f; },
      arrow: function (a, b, st) {
        st = st || {}; ext(a); ext(b);
        ops.push(function (T) {
          var x1 = T.X(a[0]), y1 = T.Y(a[1]), x2 = T.X(b[0]), y2 = T.Y(b[1]), h = st.h || 8, L = Math.hypot(x2 - x1, y2 - y1) || 1;
          var xe = x2 - (x2 - x1) / L * h * 0.6, ye = y2 - (y2 - y1) / L * h * 0.6;
          return '<line x1="' + n2(x1) + '" y1="' + n2(y1) + '" x2="' + n2(xe) + '" y2="' + n2(ye) + '"' + sty(st) + '/>' + head(x1, y1, x2, y2, h, st.c);
        });
        return f;
      },
      text: function (p, s, st) { ops.push(function (T) { return textAt(T.X(p[0]), T.Y(p[1]), s, st); }); return f; },
      // Өнцгийн нум V оройд, VA → VB (бага өнцөг); st.r (px), st.label, st.n (давхар нум)
      angle: function (V, A, B, st) {
        st = st || {};
        ops.push(function (T) {
          var vx = T.X(V[0]), vy = T.Y(V[1]), r = st.r || 14;
          var a1 = Math.atan2(T.Y(A[1]) - vy, T.X(A[0]) - vx), a2 = Math.atan2(T.Y(B[1]) - vy, T.X(B[0]) - vx), d = a2 - a1;
          while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          var s = '', k;
          for (k = 0; k < (st.n || 1); k++) {
            var rr = r + k * 3.5, x1 = vx + rr * Math.cos(a1), y1 = vy + rr * Math.sin(a1), x2 = vx + rr * Math.cos(a1 + d), y2 = vy + rr * Math.sin(a1 + d);
            s += '<path d="M' + n2(x1) + ',' + n2(y1) + ' A' + rr + ',' + rr + ' 0 0 ' + (d > 0 ? 1 : 0) + ' ' + n2(x2) + ',' + n2(y2) + '"' + sty(st, 1.1) + '/>';
          }
          if (st.label != null) {
            var am = a1 + d / 2, lr = r + 5 + (st.size || 12) * 0.55 + (st.loff || 0);
            s += textAt(vx + lr * Math.cos(am), vy + lr * Math.sin(am), st.label, { size: st.size || 12, plain: st.plain });
          }
          return s;
        });
        return f;
      },
      right: function (V, A, B, st) {
        st = st || {};
        ops.push(function (T) {
          var vx = T.X(V[0]), vy = T.Y(V[1]), s = st.s || 8;
          var ux = T.X(A[0]) - vx, uy = T.Y(A[1]) - vy, ul = Math.hypot(ux, uy) || 1, wx = T.X(B[0]) - vx, wy = T.Y(B[1]) - vy, wl = Math.hypot(wx, wy) || 1;
          ux *= s / ul; uy *= s / ul; wx *= s / wl; wy *= s / wl;
          return '<polyline points="' + n2(vx + ux) + ',' + n2(vy + uy) + ' ' + n2(vx + ux + wx) + ',' + n2(vy + uy + wy) + ' ' + n2(vx + wx) + ',' + n2(vy + wy) + '"' + sty(st, 1.1) + '/>';
        });
        return f;
      },
      // Тэнхлэг (харах мужийн хүрээнд, сумтай): st.x, st.y — нэр ('x', 'y'), st.o — эхийн нэр ('O', '0' эсвэл false)
      axes: function (st) {
        st = st || {};
        ops.push(function (T) {
          var v = T.v, s = '', ex = st.ext != null ? st.ext : 10;
          if (v.y0 <= 0 && v.y1 >= 0) {
            var y = T.Y(0), xa = T.X(v.x0), xb = T.X(v.x1) + ex;
            s += '<line x1="' + n2(xa) + '" y1="' + n2(y) + '" x2="' + n2(xb - 4) + '" y2="' + n2(y) + '" stroke="' + INK + '" stroke-width="1.2"/>' + head(xa, y, xb, y, 8);
            if (st.x !== false) s += textAt(xb - 2, y, st.x || 'x', { pos: 'se', size: 13 });
          }
          if (v.x0 <= 0 && v.x1 >= 0) {
            var x = T.X(0), ya = T.Y(v.y0), yb = T.Y(v.y1) - ex;
            s += '<line x1="' + n2(x) + '" y1="' + n2(ya) + '" x2="' + n2(x) + '" y2="' + n2(yb + 4) + '" stroke="' + INK + '" stroke-width="1.2"/>' + head(x, ya, x, yb, 8);
            if (st.y !== false) s += textAt(x, yb + 2, st.y || 'y', { pos: 'e', size: 13, off: 7 });
          }
          if (st.o !== false && v.x0 <= 0 && v.x1 >= 0 && v.y0 <= 0 && v.y1 >= 0) s += textAt(T.X(0), T.Y(0), st.o || 'O', { pos: 'sw', size: 12, halo: true });
          return s;
        });
        return f;
      },
      grid: function (step, st) {
        st = st || {};
        var sx = typeof step === 'object' ? step.x : step, sy = typeof step === 'object' ? step.y : step;
        ops.unshift(function (T) {
          var v = T.v, s = '', c = st.c || '#c9c9c9', w = st.w || 0.7, i;
          for (i = Math.ceil(v.x0 / sx - 1e-9); i * sx <= v.x1 + 1e-9; i++) s += '<line x1="' + n2(T.X(i * sx)) + '" y1="' + n2(T.Y(v.y0)) + '" x2="' + n2(T.X(i * sx)) + '" y2="' + n2(T.Y(v.y1)) + '" stroke="' + c + '" stroke-width="' + w + '"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : '') + '/>';
          for (i = Math.ceil(v.y0 / sy - 1e-9); i * sy <= v.y1 + 1e-9; i++) s += '<line x1="' + n2(T.X(v.x0)) + '" y1="' + n2(T.Y(i * sy)) + '" x2="' + n2(T.X(v.x1)) + '" y2="' + n2(T.Y(i * sy)) + '" stroke="' + c + '" stroke-width="' + w + '"' + (st.dash ? ' stroke-dasharray="' + st.dash + '"' : '') + '/>';
          return s;
        });
        return f;
      },
      // Тэнхлэг дээрх хуваарь: xs/ys — утгууд (эсвэл [утга, 'бичиг']); st.len (px), st.size
      ticks: function (xs, ys, st) {
        st = st || {};
        ops.push(function (T) {
          var s = '', L = st.len || 3.5, size = st.size || 11.5;
          (xs || []).forEach(function (t) {
            var v = Array.isArray(t) ? t[0] : t, l = Array.isArray(t) ? t[1] : dec(t), x = T.X(v), y = T.Y(0);
            s += '<line x1="' + n2(x) + '" y1="' + n2(y - L) + '" x2="' + n2(x) + '" y2="' + n2(y + L) + '" stroke="' + INK + '" stroke-width="1.1"/>';
            if (l !== '') s += textAt(x, y + L, l, { pos: 's', size: size, off: 2, halo: st.halo !== false });
          });
          (ys || []).forEach(function (t) {
            var v = Array.isArray(t) ? t[0] : t, l = Array.isArray(t) ? t[1] : dec(t), x = T.X(0), y = T.Y(v);
            s += '<line x1="' + n2(x - L) + '" y1="' + n2(y) + '" x2="' + n2(x + L) + '" y2="' + n2(y) + '" stroke="' + INK + '" stroke-width="1.1"/>';
            if (l !== '') s += textAt(x - L, y, l, { pos: 'w', size: size, off: 3, halo: st.halo !== false });
          });
          return s;
        });
        return f;
      },
      raw: function (fn) { ops.push(fn); return f; },
      ext: function (p) { ext(p); return f; },
      uid: function () { return 'e1k' + uid + '_' + (++FID); },
      svg: function () {
        var v;
        if (o.view) v = { x0: o.view[0], x1: o.view[1], y0: o.view[2], y1: o.view[3] };
        else {
          if (!isFinite(B.x0)) B = { x0: 0, x1: 1, y0: 0, y1: 1 };
          var m = o.margin || 0;
          v = { x0: B.x0 - m, x1: B.x1 + m, y0: B.y0 - m, y1: B.y1 + m };
          if (v.x1 - v.x0 < 1e-9) { v.x0 -= 1; v.x1 += 1; } if (v.y1 - v.y0 < 1e-9) { v.y0 -= 1; v.y1 += 1; }
        }
        var pad = o.pad != null ? o.pad : 16, padL = o.padL != null ? o.padL : pad, padR = o.padR != null ? o.padR : pad, padT = o.padT != null ? o.padT : pad, padB = o.padB != null ? o.padB : pad;
        var sx, sy, W = o.w || 260;
        if (o.free) { sx = (W - padL - padR) / (v.x1 - v.x0); sy = ((o.h || 200) - padT - padB) / (v.y1 - v.y0); }
        else {
          sx = sy = o.unit || (W - padL - padR) / (v.x1 - v.x0);
          if (!o.unit && o.h && (v.y1 - v.y0) * sy > o.h - padT - padB) sx = sy = (o.h - padT - padB) / (v.y1 - v.y0);
        }
        var w = (v.x1 - v.x0) * sx + padL + padR, h = (v.y1 - v.y0) * sy + padT + padB;
        var T = { X: function (x) { return padL + (x - v.x0) * sx; }, Y: function (y) { return padT + (v.y1 - y) * sy; }, sx: sx, sy: sy, v: v };
        var clip = '<defs><clipPath id="e1kc' + uid + '"><rect x="' + n2(T.X(v.x0) - 1) + '" y="' + n2(T.Y(v.y1) - 1) + '" width="' + n2((v.x1 - v.x0) * sx + 2) + '" height="' + n2((v.y1 - v.y0) * sy + 2) + '"/></clipPath></defs>';
        return '<svg xmlns="http://www.w3.org/2000/svg" class="e1k-fig" viewBox="0 0 ' + n2(w) + ' ' + n2(h) + '" width="' + n2(w) + '" height="' + n2(h) + '" style="overflow:visible">' + clip + ops.map(function (op) { return op(T); }).join('') + '</svg>';
      }
    };
    return f;
  }
  // Монотон куб интерполяц (Fritsch–Carlson): spline([[x, y], …]) → f(x) — цэгүүдийг яг дайрна, өсөх цэгүүдэд өснө
  function spline(pts) {
    var n = pts.length, xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; }), d = [], m = [], i;
    for (i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    m[0] = d[0]; m[n - 1] = d[n - 2];
    for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
      if (s > 9) { var t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; }
    }
    return function (x) {
      if (x <= xs[0]) return ys[0]; if (x >= xs[n - 1]) return ys[n - 1];
      var k = 0; while (k < n - 2 && x > xs[k + 1]) k++;
      var h = xs[k + 1] - xs[k], t = (x - xs[k]) / h, t2 = t * t, t3 = t2 * t;
      return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
    };
  }

  var H = { rnd: rnd, nz: nz, pick: pick, shuffle: shuffle, gcd: gcd, lcm: lcm, gen: gen, dec: dec, fr: fr, frs: frs, sgn: sgn, par: par, tm: tm, poly: poly,
    surd: surd, rt: rt, mat: mat, pt: pt, DEG: DEG, sfx: sfx, suf: suf, Bx: Bx, steps: steps, tbl: tbl, Fig: Fig, spline: spline, setRng: setRng, mulberry: mulberry };
  if (typeof module === 'object' && module.exports) { module.exports = H; return; }
  Object.keys(H).forEach(function (k) { if (!(k in root)) root[k] = H[k]; });

  /* ───────── хуудас ───────── */
  var MACROS = { '\\bx': '\\boxed{\\mathit{#1}}' };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var ICO = {
    ref: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    prt: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>'
  };
  var CSS = [
    ':root{--purple:#7B52EE;--purple2:#A855F7;--ink:#1a1030;--soft:#7a7390}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    "body{font-family:'Segoe UI',Arial,sans-serif;color:var(--ink);background:#eceaf3;padding:16px;line-height:1.5}",
    '.bar{max-width:820px;margin:0 auto 14px;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap}',
    '.btn{font-weight:800;border:0;cursor:pointer;border-radius:999px;padding:.6rem 1.3rem;font-size:.9rem;color:#fff;background:linear-gradient(135deg,var(--purple),var(--purple2));box-shadow:0 6px 16px -6px rgba(123,82,238,.6)}',
    '.btn:hover{filter:brightness(1.06)} .btn.refresh{background:linear-gradient(135deg,#16a34a,#22c55e)}',
    '.bar label{font-weight:700;color:var(--purple);display:flex;align-items:center;gap:6px;font-size:.88rem}',
    '.sheet{background:#fff;width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:11mm 12mm;box-shadow:0 12px 44px -18px rgba(0,0,0,.35)}',
    '.head{text-align:center;border-bottom:2.5px solid var(--purple);padding-bottom:7px;margin-bottom:7px}',
    '.head h1{font-size:18px;color:#5a32d6;font-weight:800}.head .e1k-sub{font-size:11.5px;color:var(--soft);margin-top:2px;font-weight:600}',
    '.meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;font-size:11.5px;margin:8px 2px 12px;gap:4px 8px}.meta>span{border-bottom:1px dotted #b3a9cf;padding:0 22px 2px 4px}',
    '.q{break-inside:avoid;page-break-inside:avoid;margin:0 0 10px}',
    '.qh{display:flex;gap:6px;align-items:baseline}.ql{font-weight:800;color:var(--purple);font-size:13px;min-width:28px;flex:none}',
    '.qb{flex:1;min-width:0}.qm{font-size:13px;line-height:1.55}',
    '.qrow{flex:1;min-width:0;display:flex;gap:12px;align-items:flex-start}.qrow>.qm{flex:1;min-width:0}',
    '.fig{display:flex;justify-content:center;margin:5px 0 2px}.fig.side{flex:none;margin:0}',
    '.fig>svg{display:block;max-width:100%;height:auto}',
    '.e1k-tbl{border-collapse:collapse;margin:3px auto;font-size:12.5px}.e1k-tbl th,.e1k-tbl td{border:1px solid #333;padding:2px 12px;text-align:center;font-weight:400}.e1k-tbl th{text-align:left}',
    '.steps{margin:4px 0 0}.sp{display:flex;gap:6px;align-items:baseline;margin:3px 0}.spn{flex:none;min-width:24px}.stx{flex:1;min-width:0}',
    '.nw{white-space:nowrap}',
    '.wk{border:1.1px solid #e2daf5;border-radius:7px;background:linear-gradient(#fff,#fbf9ff);margin:5px 0 0 34px}',
    '.ans-page{margin-top:9mm;border-top:2px dashed #ddd;padding-top:7mm}.ans-page h2{font-size:15px;color:#5a32d6;margin-bottom:8px}',
    '.ans-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 22px;font-size:12px;line-height:1.5}.ans-grid .a.wide{grid-column:1/-1}',
    '.ans-grid .a{display:flex;gap:5px;align-items:baseline}.ans-grid .a .an{color:var(--purple);font-weight:800;min-width:28px;flex:none}',
    '#answers{display:none}',
    '.e1k-p12 .qm,.e1k-p12 .ql{font-size:12pt}.e1k-p12 .e1k-tbl{font-size:11.5pt}.e1k-p12 .ans-grid{font-size:11pt}',
    '.katex svg{max-width:none!important;height:inherit!important}',
    '.katex .fbox{border-color:#111}',
    '@media (max-width:640px){.qrow{flex-direction:column}.fig.side{align-self:center}.ans-grid{grid-template-columns:1fr}}',
    '@media print{body{background:#fff;padding:0}.bar{display:none}.sheet{box-shadow:none;width:auto;min-height:auto;padding:0;margin:0}',
    '.ans-page{break-before:page;margin-top:0;border-top:0;padding-top:0}',
    /* ws-store-ийн хөл ганцаараа шинэ хуудсанд гарахгүй — сүүлийн бодлоготой хамт шилжинэ */
    '.sheet>.cm-foot{break-before:avoid;page-break-before:avoid;margin-top:6px}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('e1k-css')) return;
    var st = document.createElement('style'); st.id = 'e1k-css'; st.textContent = CSS + '\n@page{size:A4;margin:11mm 12mm}'; document.head.appendChild(st);
  }
  function render(el) {
    try { renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false, macros: MACROS }); } catch (e) {}
  }
  function ansTex(a) { a = String(a); return /[$<]/.test(a) || /[А-Яа-яЁёӨөҮү]/.test(a) ? a : '$' + a + '$'; }
  function textLen(s) { return String(s).replace(/<[^>]*>/g, '').replace(/\\[a-z]+/gi, '').replace(/[${}]/g, '').length; }

  function page(cfg) {
    injectCSS();
    var first = cfg.first || 1, CUR = null;
    var bar = document.getElementById('bar'), sh = document.getElementById('sheet');
    bar.className = 'bar';
    var sw0 = lsGet('e1k_sw') !== '0';
    bar.innerHTML = '<button class="btn refresh" type="button" onclick="build()">' + ICO.ref + 'Шинэ бодлого</button>'
      + '<label><input type="checkbox" id="sw"' + (sw0 ? ' checked' : '') + '> Бодолтын зай</label>'
      + '<label><input type="checkbox" id="sa"> Хариу хавсаргах</label>'
      + '<button class="btn" type="button" onclick="window.print()">' + ICO.prt + 'Хэвлэх / PDF</button>';
    var sw = document.getElementById('sw'), sa = document.getElementById('sa');
    sw.addEventListener('change', function () { lsSet('e1k_sw', sw.checked ? '1' : '0'); layout(); });
    sa.addEventListener('change', toggleAns);
    function toggleAns() { var el = document.getElementById('answers'); if (el) el.style.display = sa.checked ? 'block' : 'none'; }
    window.toggleAns = toggleAns;
    function valid(g) { return g && typeof g.q === 'string' && g.q && g.a != null && String(g.a) !== ''; }
    window.build = function () {
      CUR = cfg.probs.map(function (fn, i) {
        var g = gen(fn, valid);
        if (!g) { try { console.error('e1k: ' + (first + i) + '-р бодлогын генератор бүтэлгүй'); } catch (e) {} g = { q: '—', a: '—' }; }
        return g;
      });
      layout();
    };
    function layout() {
      if (!CUR) return window.build();
      var WK = sw.checked, html = '', ak = '';
      html += '<div class="head"><h1>' + escH(cfg.title) + '</h1>' + (cfg.sub ? '<div class="e1k-sub">' + escH(cfg.sub) + '</div>' : '') + '</div>'
        + '<div class="meta"><span>Нэр: </span><span>Анги: </span><span>Огноо: </span><span>Оноо: </span></div>';
      CUR.forEach(function (g, i) {
        var n = cfg.nums ? cfg.nums[i] : first + i, fig = g.fig ? '<div class="fig' + (g.side ? ' side' : '') + '">' + g.fig + '</div>' : '', body = '<div class="qm">' + g.q + '</div>';
        html += '<div class="q" data-n="' + n + '"><div class="qh"><span class="ql">' + n + '.</span>'
          + (g.side && fig ? '<div class="qrow">' + body + fig + '</div>' : '<div class="qb">' + body + fig + '</div>') + '</div>'
          + (WK ? '<div class="wk" style="height:' + (g.wk || 30) + 'mm"></div>' : '') + '</div>';
        var at = ansTex(g.a);
        ak += '<div class="a' + (g.wide || textLen(at) > 64 ? ' wide' : '') + '"><span class="an">' + n + '.</span><span>' + at + '</span></div>';
      });
      html += '<div class="ans-page" id="answers"><h2>Хариунууд</h2><div class="ans-grid">' + ak + '</div></div>';
      sh.innerHTML = html;
      sh.classList.toggle('e1k-p12', WK);
      render(sh); toggleAns();
      window.WS_TITLE = cfg.title; window.WS_ITEMS = [];
    }
    window.layout = layout;
    window.WS_PAGED = 'e1k-pages';      // ws-store: хэвлэхэд 1 хуудсанд шахахгүй
    root.E1K.cur = function () { return CUR; };
    try { if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(function () { if (CUR) layout(); }); } catch (e) {}
    window.build();
  }
  root.E1K = { page: page, H: H, render: render };
})(typeof window !== 'undefined' ? window : this);
