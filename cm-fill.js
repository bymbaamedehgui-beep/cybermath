/* cm-fill.js — хичээлийн 20 бодлогын 6–7-г «хариу нөхөх» болгоно (2026-11-09, эзэмшигч: «нэг удаа гарч ирж байгаа 20 бодлогын
   дор хаяж 6-7 нь хариу нөхөх бодлого байлгамаар байна. Язгуур дор, энгийн бутархай, матриц нтр гээд алийг нь нөхөх боломжтой болго»).
   - inject(lesson): зөв хариу нь тоон бүтэцтэй (тоо, бутархай, язгуур, π, градус, %, x₁=…, координат, матриц) сонгох бодлогыг
     type 'fillx' болгоно. «Аль нь…» гэх мэт сонголт шаардсан асуулт сонголттой хэвээр.
   - Загвар: зөв хариуны бүтцийг хадгалж тоонуудыг MathLive нүдээр (\placeholder) солино: \dfrac{□}{□}, □\sqrt{□}, (□;□), матриц.
   - Шалгах: тоон утгаар (6/10 = 3/5, 2√3 = 1·√12), x₁, x₂-ийн дараалал хамаагүй, цэгийн жагсаалт дараалалгүй.
   Хөтөч (window.cmFill) ба Node (module.exports — tests/cm-fill.test.js) хоёуланд. */
(function (root) {
  'use strict';
  var EPS = 1e-7;

  /* ── TeX → тоо ── */
  function prep(s) {
    s = String(s == null ? '' : s).trim().replace(/^\$+|\$+$/g, '').trim();
    s = s.replace(/\\left|\\right/g, '').replace(/\\displaystyle|\\textstyle/g, '');
    s = s.replace(/\\dfrac|\\tfrac/g, '\\frac').replace(/\\cdot|\\times/g, '*').replace(/\\div/g, '/');
    s = s.replace(/\\operatorname\{tg\}|\\tg\b/g, '\\tan').replace(/\\operatorname\{ctg\}|\\ctg\b/g, '\\cot').replace(/\\mathrm\{e\}/g, 'e');
    s = s.replace(/\\mleft|\\mright/g, '').replace(/\\lvert|\\rvert|\\vert/g, '|');
    s = s.replace(/(\d)\\,(?=\d{3}(?!\d))/g, '$1');                 // мянгатын зай: 10\,235 → 10235
    s = s.replace(/\{,\}/g, '.').replace(/\\[,;:!]|\\ |~/g, ' ').replace(/\s+/g, ' ').trim();
    return s;
  }
  function tokenize(s) {
    var out = [], i = 0, m;
    while (i < s.length) {
      var c = s[i];
      if (c === ' ') { i++; continue; }
      if ((m = /^\d+(?:\.\d+)?|^\.\d+/.exec(s.slice(i)))) { out.push({ t: 'n', v: parseFloat(m[0]), s: m[0] }); i += m[0].length; continue; }
      if (c === '\\') {
        if ((m = /^\\([a-zA-Z]+)/.exec(s.slice(i)))) {
          out.push(GREEK[m[1]] ? { t: 'v', v: m[1] } : { t: 'c', v: m[1] }); i += m[0].length; continue;
        }
        out.push({ t: 'c', v: s[i + 1] || '' }); i += 2; continue;
      }
      if (/[a-zA-Z]/.test(c)) { out.push({ t: 'v', v: c }); i++; continue; }
      out.push({ t: 'o', v: c }); i++;
    }
    return out;
  }
  var GREEK = { alpha: 1, beta: 1, gamma: 1, theta: 1, varphi: 1, phi: 1, lambda: 1, mu: 1, omega: 1, tau: 1 };
  var FUNCS = { sin: Math.sin, cos: Math.cos, tan: Math.tan, cot: function (x) { return 1 / Math.tan(x); }, ln: Math.log,
    log: function (x) { return Math.log(x) / Math.LN10; }, exp: Math.exp };
  function Parser(toks, vars) { this.k = toks; this.i = 0; this.vars = vars || {}; this.abs = 0; }
  Parser.prototype.peek = function () { return this.k[this.i]; };
  Parser.prototype.isO = function (v) { var t = this.k[this.i]; return t && t.t === 'o' && t.v === v; };
  Parser.prototype.eat = function (v) { if (!this.isO(v)) throw new Error('expected ' + v); this.i++; };
  Parser.prototype.expr = function () {
    var v = this.term();
    while (this.isO('+') || this.isO('-')) { var op = this.k[this.i++].v, r = this.term(); v = op === '+' ? v + r : v - r; }
    return v;
  };
  Parser.prototype.startsAtom = function () {
    var t = this.peek(); if (!t) return false;
    if (t.t === 'n' || t.t === 'v') return true;
    if (t.t === 'o') return t.v === '(' || t.v === '{' || (t.v === '|' && this.abs === 0);
    return t.t === 'c' && (/^(frac|sqrt|pi|placeholder)$/.test(t.v) || !!FUNCS[t.v]);
  };
  // Функцийн аргумент: (…) эсвэл далд үржвэрээр нийлсэн энгийн гишүүд (\sin 2x = sin(2x)), өөр функц дээр зогсоно
  Parser.prototype.fnArg = function () {
    if (this.isO('(') || this.isO('{')) return this.power();
    var v = this.power();
    for (;;) {
      var t = this.peek();
      if (!t || !this.startsAtom() || (t.t === 'c' && FUNCS[t.v]) || (t.t === 'o' && t.v === '|')) return v;
      v *= this.power();
    }
  };
  Parser.prototype.term = function () {
    var v = this.unary();
    for (;;) {
      if (this.isO('*')) { this.i++; v *= this.unary(); continue; }
      if (this.isO('/')) { this.i++; v /= this.unary(); continue; }
      if (this.startsAtom()) { v *= this.power(); continue; }        // далд үржвэр: 2\sqrt{3}, 3\pi, 2(x+1)
      return v;
    }
  };
  Parser.prototype.unary = function () {
    if (this.isO('-')) { this.i++; return -this.unary(); }
    if (this.isO('+')) { this.i++; return this.unary(); }
    return this.power();
  };
  Parser.prototype.power = function () {
    var b = this.post(this.atom());
    if (this.isO('^')) {
      this.i++;
      var t = this.peek();
      if (t && t.t === 'o' && t.v === '{' && this.k[this.i + 1] && this.k[this.i + 1].t === 'c' && this.k[this.i + 1].v === 'circ') { this.i += 2; this.eat('}'); return b; }
      if (t && t.t === 'c' && t.v === 'circ') { this.i++; return b; }   // градус — нэгж
      var e = this.unaryAtom();
      return Math.pow(b, e);
    }
    return b;
  };
  Parser.prototype.unaryAtom = function () { if (this.isO('-')) { this.i++; return -this.unaryAtom(); } return this.atom(); };
  Parser.prototype.post = function (v) { var t = this.peek(); if (t && t.t === 'c' && t.v === '%') { this.i++; } return v; };   // хувь — нэгж
  Parser.prototype.group = function () {
    if (this.isO('{')) { this.i++; var v = this.expr(); this.eat('}'); return v; }
    return this.atom();
  };
  Parser.prototype.atom = function () {
    var t = this.k[this.i];
    if (!t) throw new Error('eof');
    if (t.t === 'n') { this.i++; return t.v; }
    if (t.t === 'o' && t.v === '(') { this.i++; var a = this.expr(); this.eat(')'); return a; }
    if (t.t === 'o' && t.v === '{') { return this.group(); }
    if (t.t === 'o' && t.v === '|' && this.abs === 0) { this.i++; this.abs++; var av = this.expr(); this.abs--; this.eat('|'); return Math.abs(av); }
    if (t.t === 'v') {
      this.i++;
      if (!(t.v in this.vars)) throw new Error('var ' + t.v);
      return this.vars[t.v];
    }
    if (t.t === 'c') {
      this.i++;
      if (t.v === 'pi') return Math.PI;
      if (FUNCS[t.v]) {                                         // \sin x, \sin^{2}x, \cos(2x), \ln x
        var pw = 1;
        if (this.isO('^')) { this.i++; pw = this.unaryAtom(); }
        return Math.pow(FUNCS[t.v](this.fnArg()), pw);
      }
      if (t.v === 'frac') { var n = this.group(), d = this.group(); return n / d; }
      if (t.v === 'sqrt') {
        var idx = 2;
        if (this.isO('[')) { this.i++; idx = this.expr(); this.eat(']'); }
        var r = this.group();
        if (r < 0 && idx % 2 === 1) return -Math.pow(-r, 1 / idx);
        return Math.pow(r, 1 / idx);
      }
      if (t.v === 'placeholder') { throw new Error('placeholder'); }
    }
    throw new Error('token ' + (t.v || t.t));
  };
  function evalTex(s, vars) {
    var p = new Parser(tokenize(prep(s)), vars);
    var v = p.expr();
    if (p.i !== p.k.length) throw new Error('trailing');
    if (typeof v !== 'number' || !isFinite(v)) throw new Error('nan');
    return v;
  }
  function tryEval(s) { try { return evalTex(s); } catch (e) { return null; } }
  function near(a, b) { return Math.abs(a - b) <= EPS * Math.max(1, Math.abs(a), Math.abs(b)); }

  /* ── Дээд түвшинд хуваах (хаалт/{} доторхыг хөндөхгүй) ── */
  function splitTop(s, sep) {
    var out = [], d = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '{' || c === '(' || c === '[') d++;
      else if (c === '}' || c === ')' || c === ']') d--;
      if (d === 0 && s.substr(i, sep.length) === sep) { out.push(cur.trim()); cur = ''; i += sep.length - 1; continue; }
      cur += c;
    }
    out.push(cur.trim());
    return out;
  }

  /* ── Загвар: тоонуудыг \placeholder[pK]{}-ээр (нэгж хасах тэмдгийг хамт), x_1-ийн доод индекс, \sqrt[3]-ийн илтгэгчийг хадгална.
     Тэргүүн хасах тэмдгийг ИЛ ГАРГАХГҮЙ (тэмдгийн алдаа гол төөрөгдүүлэгч): -\frac{3}{5} → \frac{□}{□} (хүртвэрт −3),
     -\sqrt{3} / -\pi → □\sqrt{□} / □\pi (коэффициент −1). own — зөв хариуны нүд бүрийн утга (тест, шалгалтад). ── */
  function templ(part, ctr, coef) {
    var s = String(part).trim(), out = '', i = 0, ids = [], own = [], neg = false;
    var lead = /^-\s*/.exec(s);
    if (lead && !/^-\s*\d/.test(s)) {
      s = s.slice(lead[0].length);
      if (/^\\frac\{\s*\d/.test(s)) neg = true;
      else { var id0 = 'p' + (ctr.n++); ids.push(id0); own.push('-1'); out = '\\placeholder[' + id0 + ']{}'; }
    } else if (coef && !/^-?\s*\d|^\\frac\{\s*\d/.test(s)) {     // ±-ийн тэгш хэмтэй хос: x₁-д ч коэффициентийн нүд
      var id1 = 'p' + (ctr.n++); ids.push(id1); own.push('1'); out = '\\placeholder[' + id1 + ']{}';
    }
    while (i < s.length) {
      var c = s[i];
      if (c === '_') {                                              // доод индекс — хэвээр
        var m1 = /^_(\{[^}]*\}|\w)/.exec(s.slice(i)); out += m1[0]; i += m1[0].length; continue;
      }
      if (s.substr(i, 6) === '\\sqrt[') {                           // \sqrt[n] — n хэвээр
        var j = s.indexOf(']', i); out += s.slice(i, j + 1); i = j + 1; continue;
      }
      var m = /^\d+(?:\.\d+)?/.exec(s.slice(i));
      if (m) {
        var num = m[0];
        // нэгж хасах: өмнөх тэмдэгт «-» бөгөөд түүний өмнө юу ч алга эсвэл ( { [ = , ; & ^ + - * / зай
        var k = out.length - 1; while (k >= 0 && out[k] === ' ') k--;
        if (k >= 0 && out[k] === '-') {
          var q = k - 1; while (q >= 0 && out[q] === ' ') q--;
          if (q < 0 || /[({\[=,;&^+\-*/]/.test(out[q]) || /\\pm$/.test(out.slice(0, q + 1))) { out = out.slice(0, k); num = '-' + num; }
        }
        if (neg) { num = '-' + num; neg = false; }
        var id = 'p' + (ctr.n++);
        ids.push(id); own.push(num);
        out += '\\placeholder[' + id + ']{}';
        i += m[0].length;
        continue;
      }
      out += c; i++;
    }
    return { tpl: out, ids: ids, own: own };
  }

  /* ── Зөв хариуг шинжлэх → { kind, parts:[{tpl, ids}], val, tpl } | null ── */
  var BAD = /[Ѐ-ӿ]|\\(lt|gt|le|ge|leq|geq|neq|ne|infty|in|notin|cup|cap|emptyset|varnothing|cdots|ldots|dots|approx|text|mathrm|operatorname|sin|cos|tg|log|ln|vec|overrightarrow|overline|angle|triangle|parallel|perp|sim|cong|Rightarrow|to|mapsto)\b|[<>≤≥∞]/;
  var INTERVAL = /^\s*\]|\[\s*$|\]\s*(ба|∪|,)|;\s*\\?infty/;
  function analyze(correct) {
    var s = prep(correct);
    if (!s || BAD.test(s.replace(/\\begin\{[pb]matrix\}|\\end\{[pb]matrix\}/g, '')) || INTERVAL.test(s)) return null;
    var ctr = { n: 0 }, parts = [], kind, val;
    var mm = /^\\begin\{([pb])matrix\}([\s\S]*)\\end\{\1matrix\}$/.exec(s);
    if (mm) {
      var rows = mm[2].split('\\\\').map(function (r) { return r.split('&').map(function (c) { return c.trim(); }); });
      var w = rows[0].length;
      if (rows.some(function (r) { return r.length !== w; })) return null;
      val = [];
      var tpl = '\\begin{' + mm[1] + 'matrix}' + rows.map(function (r) {
        return r.map(function (c) { var v = tryEval(c); if (v === null) throw 0; val.push(v); var t = templ(c, ctr); parts.push(t); return t.tpl; }).join('&');
      }).join('\\\\') + '\\end{' + mm[1] + 'matrix}';
      return finish({ kind: 'mat', val: val, parts: parts, tpl: tpl });
    }
    var items = splitTop(s, ',');
    // x=4 · x_1=-3, x_2=2 · x=\pm 6 · x=6, y=3
    var asg = items.map(function (it) { return /^([a-zA-Z](?:_\{?\d+\}?)?)\s*=\s*(.+)$/.exec(it); });
    if (asg.every(Boolean)) {
      var names = asg.map(function (a) { return a[1].replace(/[{}]/g, ''); });
      var bases = names.map(function (n) { return n[0]; });
      var same = bases.every(function (b) { return b === bases[0]; });
      if (!same && names.length > 1 && new Set(names).size !== names.length) return null;
      val = []; var tpls = [];
      for (var a = 0; a < asg.length; a++) {
        var rhs = asg[a][2], pm = /^\\pm\s*/.exec(rhs);
        var body = pm ? rhs.slice(pm[0].length) : rhs;
        var v = tryEval(body); if (v === null) return null;
        if (pm) {
          // x=±5 → x₁=□, x₂=□: хоёр шийдийг хоёуланг нь оруулна (± тэмдэг ил гарахгүй, дараалал хамаагүй)
          if (asg.length !== 1) return null;
          var nm = asg[a][1].replace(/_\{?\d+\}?$/, '');
          var t1 = templ(body, ctr, true), t2 = templ('-' + body, ctr, true);
          parts.push(t1, t2); val.push(v, -v);
          return finish({ kind: 'set', val: val, parts: parts, tpl: nm + '_1=' + t1.tpl + ',\\ ' + nm + '_2=' + t2.tpl });
        }
        val.push(v);
        var t = templ(body, ctr); parts.push(t);
        tpls.push(asg[a][1] + '=' + t.tpl);
      }
      // ижил үсэг (x₁, x₂ эсвэл ±) → олонлог; өөр үсэг → нэр бүрээр (дараалал хадгална)
      return finish({ kind: same ? 'set' : 'seq', val: val, parts: parts, tpl: tpls.join(',\\ ') });
    }
    // (a;b) · A(a;b;c) · (a;b), (c;d)
    var tup = items.map(function (it) { return /^([A-Z](?:_\{?\d+\}?)?)?\((.+)\)$/.exec(it); });
    if (tup.every(Boolean)) {
      var tv = [], tt = [];
      for (var b = 0; b < tup.length; b++) {
        var comps = splitTop(tup[b][2], ';'); if (comps.length < 2) return null;
        var cv = [], ct = [];
        for (var c2 = 0; c2 < comps.length; c2++) {
          var x = tryEval(comps[c2]); if (x === null) return null;
          cv.push(x); var t2 = templ(comps[c2], ctr); parts.push(t2); ct.push(t2.tpl);
        }
        tv.push(cv); tt.push((tup[b][1] || '') + '(' + ct.join(';\\,') + ')');
      }
      return finish({ kind: tup.length > 1 ? 'pts' : 'tup', val: tv, parts: parts, tpl: tt.join(',\\ ') });
    }
    if (items.length !== 1) return null;
    val = tryEval(s); if (val === null) return null;
    var t3 = templ(s, ctr); parts.push(t3);
    return finish({ kind: 'num', val: val, parts: parts, tpl: t3.tpl });
  }
  function finish(o) {
    var n = o.parts.reduce(function (a, p) { return a + p.ids.length; }, 0);
    if (!n || n > (o.kind === 'mat' ? 9 : 6)) return null;
    o.n = n;
    return o;
  }
  function safeAnalyze(c) { try { return analyze(c); } catch (e) { return null; } }

  /* ── Чөлөөт талбар (илэрхийлэл): хариу нь хувьсагчтай — y=…, y'=…, f^{-1}(x)=… угтвартай эсвэл шууд илэрхийлэл.
     Шалгах: хувьсагчдын хэд хэдэн утга дээр хоёр илэрхийллийг тулгана; «задал» бодлогод хариу нь үржвэр хэлбэртэй байх
     ёстой; асуултын илэрхийллийг хуулж бичихээс сэргийлж хариуны урт (токен) хязгаартай. ── */
  var DESIG = /^(y'|y|[fgh]'\(x\)|[fgh]\(x\)|f\^\{-1\}\(x\)|[sv]'\(t\)|[sva]\(t\)|S_\{?n\}?|a_\{?n\}?|b_\{?n\}?)\s*=\s*/;
  var SAMPLE = [0.73, -1.37, 1.91, -0.58, 2.47, 0.29, -2.13, 1.13, 3.07, -0.91];
  function varsOf(s) {
    var seen = {}, out = [];
    tokenize(prep(s)).forEach(function (t) { if (t.t === 'v' && !seen[t.v]) { seen[t.v] = 1; out.push(t.v); } });
    return out.sort();
  }
  function samples(vars) {
    var out = [];
    for (var i = 0; i < SAMPLE.length; i++) {
      var env = {};
      vars.forEach(function (v, j) { env[v] = SAMPLE[(i + 3 * j) % SAMPLE.length] + 0.11 * j; });
      out.push(env);
    }
    return out;
  }
  function evalEnv(s, env) { try { return evalTex(s, env); } catch (e) { return null; } }
  function sameExpr(u, c, vars) {
    var all = vars.slice(); varsOf(u).forEach(function (v) { if (all.indexOf(v) < 0) all.push(v); });
    var ok = 0;
    var envs = samples(all);
    for (var i = 0; i < envs.length; i++) {
      var a = evalEnv(u, envs[i]), b = evalEnv(c, envs[i]);
      if (b === null) continue;                                  // зөв хариу тодорхойлогдоогүй цэг — алгасна
      if (a === null || Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a), Math.abs(b))) return false;
      ok++;
    }
    return ok >= 3;
  }
  // Дээд түвшинд +/− алга (эхний хасахаас бусад), хаалттай → үржвэр хэлбэр: 3x(2x-3), (x+3)(x-5), -(x-2)^{2}
  function isProduct(s) {
    s = prep(s).replace(/\s+/g, '');
    if (s.indexOf('(') < 0) return false;
    var d = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (c === '(' || c === '{' || c === '[') d++;
      else if (c === ')' || c === '}' || c === ']') d--;
      else if (d === 0 && (c === '+' || c === '-') && i > 0 && s[i - 1] !== '^') return false;
    }
    return true;
  }
  var FACTOR_Q = /задал|үржигдэхүүн болгон|үржвэр хэлбэр|хаалтаас гарга/i;
  function analyzeExpr(correct, qtext) {
    var s = prep(correct);
    if (!s || /[Ѐ-ӿ]/.test(s) || /\\(lt|gt|le|ge|leq|geq|neq|ne|infty|pm|mp|cup|cap|in|approx|vec|overrightarrow|angle|circ)\b|[<>≤≥∞%]/.test(s) || INTERVAL.test(s)) return null;
    var m = DESIG.exec(s), prefix = '', body = s;
    if (m) { prefix = m[1] + '='; body = s.slice(m[0].length).trim(); }
    if (!body || /[=,;]/.test(body) || /\\begin/.test(body)) return null;
    var vars = varsOf(body);
    if (!vars.length) return null;                              // хувьсагчгүй — тоон загвар
    var ok = samples(vars).filter(function (env) { return evalEnv(body, env) !== null; }).length;
    if (ok < 4) return null;
    var factor = isProduct(body) && FACTOR_Q.test(String(qtext || ''));
    return { kind: 'expr', expr: body, vars: vars, factor: factor, tok: tokenize(body).length, n: 1,
      parts: [{ tpl: '\\placeholder[p0]{}', ids: ['p0'], own: [body] }], tpl: prefix + '\\placeholder[p0]{}' };
  }
  function safeExpr(c, q) { try { return analyzeExpr(c, q); } catch (e) { return null; } }

  /* ── Хэрэглэгчийн утгаар шалгах: vals[id] = LaTeX ── */
  function partValue(part, vals) {
    var s = part.tpl;
    for (var i = 0; i < part.ids.length; i++) {
      var u = String(vals[part.ids[i]] == null ? '' : vals[part.ids[i]]).trim().replace(/(\d),(\d)/g, '$1.$2');
      if (!u) throw new Error('empty');
      var uv = evalTex(u);                                   // нүд бүр өөрөө тоо (бутархай, язгуур байж болно)
      s = s.split('\\placeholder[' + part.ids[i] + ']{}').join('(' + uv + ')');
    }
    return evalTex(s);
  }
  function sameMulti(a, b) {
    if (a.length !== b.length) return false;
    var used = b.map(function () { return false; });
    return a.every(function (x) {
      for (var j = 0; j < b.length; j++) if (!used[j] && near(x, b[j])) { used[j] = true; return true; }
      return false;
    });
  }
  function checkVals(fx, vals) {
    try {
      if (fx.kind === 'expr') {
        var u = prep(String(vals.p0 == null ? '' : vals.p0));
        var dm = DESIG.exec(u); if (dm) u = u.slice(dm[0].length).trim();   // «y=» дахин бичсэн бол хасна
        if (!u || /[=,;]/.test(u)) return false;
        if (fx.factor && !isProduct(u)) return false;
        if (tokenize(u).length > fx.tok + 8) return false;
        return sameExpr(u, fx.expr, fx.vars);
      }
      var pv = fx.parts.map(function (p) { return partValue(p, vals); });
      if (fx.kind === 'num') return near(pv[0], fx.val);
      if (fx.kind === 'mat') return pv.length === fx.val.length && pv.every(function (v, i) { return near(v, fx.val[i]); });
      if (fx.kind === 'set' || fx.kind === 'seq') {
        var got = [];
        fx.parts.forEach(function (p, i) { if (p.pm) got.push(pv[i], -pv[i]); else got.push(pv[i]); });
        if (fx.kind === 'seq') return got.length === fx.val.length && got.every(function (v, i) { return near(v, fx.val[i]); });
        return sameMulti(got, fx.val);
      }
      // цэг: бүрэлдэхүүн дарааллаар, олон цэг бол цэгүүдийн дараалал хамаагүй
      var k = 0, pts = fx.val.map(function (cv) { return cv.map(function () { return pv[k++]; }); });
      if (fx.kind === 'tup') return pts[0].every(function (v, i) { return near(v, fx.val[0][i]); });
      var used = fx.val.map(function () { return false; });
      return pts.every(function (p) {
        for (var j = 0; j < fx.val.length; j++) {
          if (!used[j] && p.length === fx.val[j].length && p.every(function (v, i) { return near(v, fx.val[j][i]); })) { used[j] = true; return true; }
        }
        return false;
      });
    } catch (e) { return false; }
  }
  // Зөв хариуны «өөрийн» нүдний утгууд (загварт буцааж тавихад зөв гарах ёстой — тест)
  function ownVals(fx) {
    var v = {};
    fx.parts.forEach(function (p) { p.ids.forEach(function (id, i) { v[id] = p.own[i]; }); });
    return v;
  }

  /* ── Хичээлд оруулах ── */
  var ASKS_CHOICE = /(^|[^А-Яа-яӨөҮүЁё])[Аа]ль(\s|$)|аль нь|сонго|зөв бэ|буруу бэ/;
  // «… шулууны тэгшитгэл аль нь вэ?» — төгсгөлийн «X аль нь вэ?» нь сонголтгүйгээр ч хариулж болох асуулт → «X ямар вэ?»
  // («Аль цэг…», «Аль функц тэгш вэ?», «Дараах тоонуудын аль нь…» — жинхэнэ сонгох асуулт, хасагдана)
  var WHICH_END = /\s+аль нь вэ\?\s*$/;
  function eligible(q) {
    if (!q || (q.type && q.type !== 'choice')) return null;
    var text = String(q.q || q.text || ''), t2 = text.replace(WHICH_END, ' ямар вэ?');
    if (ASKS_CHOICE.test(t2)) return null;
    var c = q.correctAnswer != null ? q.correctAnswer : q.correct;
    var fx = safeAnalyze(c) || safeExpr(c, text);
    if (fx && t2 !== text) fx.text = t2;
    return fx;
  }
  function inject(lesson, opt) {
    if (!lesson || !lesson.questions || !lesson.questions.length) return 0;
    var qs = lesson.questions, n = qs.length;
    var want = (opt && opt.count != null) ? opt.count : Math.min(7, Math.max(n >= 15 ? 6 : 0, Math.round(n * 0.35)));
    var cand = [];
    qs.forEach(function (q, i) { if (i === 0) return; var fx = eligible(q); if (fx) cand.push({ i: i, fx: fx }); });
    // жигд тараана: сонгогдсон индексийг хичээлийн туршид
    var pick = [];
    if (cand.length <= want) pick = cand;
    else { var step = cand.length / want; for (var k = 0; k < want; k++) pick.push(cand[Math.floor(k * step + step / 2)]); }
    pick.forEach(function (c) { var q = qs[c.i]; q.type = 'fillx'; q.fx = c.fx; if (c.fx.text) q.q = c.fx.text; });
    return pick.length;
  }

  /* ── Харагдац (хөтөч) ── */
  function answerHtml(q) {
    return '<div id="options" class="cmfx" style="grid-template-columns:1fr;gap:8px;">'
      + '<div style="border:2.5px solid #7B52EE;border-radius:14px;background:#fff;padding:10px 12px;display:flex;justify-content:center;">'
      + '<math-field id="cmfx-mf" read-only style="font-size:1.45rem;min-width:120px;background:transparent;border:0;outline:0;color:#1a1040;"></math-field></div>'
      + '<div style="text-align:center;font-size:0.76rem;color:#8b8ba3;font-weight:700;">'
      + (q && q.fx && q.fx.kind === 'expr' ? 'Хариугаа бүтнээр нь бичээд «Шалгах» дарна уу (бутархай, язгуур, зэрэг — математик гараас)'
        : 'Хоосон нүдийг бөглөөд «Шалгах» дарна уу') + '</div>'
      + '</div>';
  }
  // Математик гар гарахад цонхыг дээш шилжүүлж оруулах талбарыг ил үлдээнэ (index.html initIndexFillMf-тэй ижил)
  var kbHooked = false;
  function showKeyboard() {
    var kb = root && root.mathVirtualKeyboard; if (!kb) return;
    try { kb.container = document.body; } catch (e) {}
    if (!kbHooked) {
      kbHooked = true;
      kb.addEventListener('geometrychange', function () {
        var h = kb.boundingRect ? kb.boundingRect.height : 0, ov = document.getElementById('quiz-modal');
        if (!ov) return;
        if (h > 10 && kb.visible) { ov.style.alignItems = 'flex-start'; ov.style.paddingTop = '8px'; ov.style.paddingBottom = h + 'px'; }
        else { ov.style.paddingTop = ''; ov.style.paddingBottom = ''; }
      });
    }
    try { kb.show({ animate: true }); } catch (e) {}
  }
  function hideKeyboard() { var kb = root && root.mathVirtualKeyboard; try { if (kb && kb.visible) kb.hide(); } catch (e) {} }
  function promptVals(mf, fx) {
    var vals = {};
    fx.parts.forEach(function (p) { p.ids.forEach(function (id) { var v = ''; try { v = mf.getPromptValue(id) || ''; } catch (e) {} vals[id] = v; }); });
    return vals;
  }
  function allFilled(mf, fx) { var v = promptVals(mf, fx); return Object.keys(v).every(function (k) { return String(v[k]).trim() !== ''; }); }
  function mount(q) {
    if (!q || q.type !== 'fillx') return;
    var mf = document.getElementById('cmfx-mf'); if (!mf) return;
    try { mf.menuItems = []; } catch (e) {}
    mf.mathVirtualKeyboardPolicy = 'auto';
    mf.value = q.fx.tpl;
    var btn = document.getElementById('check-btn');
    if (btn) btn.disabled = true;
    mf.addEventListener('input', function () { var b = document.getElementById('check-btn'); if (b) b.disabled = !allFilled(mf, q.fx); });
    mf.addEventListener('focus', showKeyboard);
    mf.addEventListener('keydown', function (e) {                // Enter → шалгах (бүх нүд бөглөсөн бол)
      if (e.key !== 'Enter') return;
      var b = document.getElementById('check-btn');
      if (b && !b.disabled && typeof root.checkAnswer === 'function') { e.preventDefault(); b.click(); }
    });
    setTimeout(function () { try { mf.focus(); } catch (e) {} showKeyboard(); }, 60);
  }
  function check(q) {
    var mf = document.getElementById('cmfx-mf');
    if (!mf || !q.fx) return { ok: false, answer: '' };
    var vals = promptVals(mf, q.fx), ok = checkVals(q.fx, vals);
    q.fx.parts.forEach(function (p) { p.ids.forEach(function (id) { try { mf.setPromptState(id, ok ? 'correct' : 'incorrect', true); } catch (e) {} }); });
    try { mf.readOnly = true; } catch (e) {}
    hideKeyboard();
    return { ok: ok, answer: Object.keys(vals).map(function (k) { return vals[k]; }).join('|') };
  }

  var api = { prep: prep, evalTex: evalTex, analyze: safeAnalyze, analyzeExpr: safeExpr, isProduct: isProduct, checkVals: checkVals, ownVals: ownVals, eligible: eligible, inject: inject,
    answerHtml: answerHtml, mount: mount, check: check };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.cmFill = api;
})(typeof window !== 'undefined' ? window : null);
