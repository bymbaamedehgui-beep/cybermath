// texnum.js — бодолтын TeX томьёон дахь ТООН тооцоог шалгах.
//   evalTex('2\\cdot 3+\\dfrac{1}{2}') → 6.5;  үсэг/функц/вектор орвол null (шалгахгүй).
//   chainIssues('S=\\dfrac12\\cdot 6\\cdot 8=24') → [] ; '…=25' бол ['… ≠ …'].
//   Томьёо `\nc`-ээр эхэлбэл шалгахгүй.
'use strict';

const REL = [
  ['\\approx', '≈'], ['\\leqslant', '≤'], ['\\geqslant', '≥'], ['\\leq', '≤'], ['\\geq', '≥'], ['\\le', '≤'], ['\\ge', '≥'],
  ['\\neq', '≠'], ['\\ne', '≠'], ['\\lt', '<'], ['\\gt', '>'], ['=', '='], ['<', '<'], ['>', '>'],
];
const SEP_CMDS = ['\\Longleftrightarrow', '\\Leftrightarrow', '\\Longrightarrow', '\\Rightarrow', '\\implies', '\\iff', '\\Leftarrow',
  '\\qquad', '\\quad', '\\to', '\\mapsto', '\\text', '\\mbox', '\\textbf', '\\textit', '\\mathrm', '\\hbox'];

// Томьёог «өгүүлбэр» (clause) болгон хуваах: \text{…}, \quad, ⇒, дээд түвшний таслал/цэгтэй таслал, aligned/cases мөр
function clauses(t) {
  if (/^\s*\\nc\b/.test(t)) return [];
  let s = t;
  // матриц/тодорхойлогч — тоон утгагүй гэж үзнэ
  s = s.replace(/\\begin\{([pbvBV]?matrix|array)\}[\s\S]*?\\end\{\1\}/g, ' M ');
  // \text{…} төрлийн бичвэр → тусгаарлагч
  s = s.replace(/\\(text|mbox|textbf|textit|hbox)\s*\{[^{}]*\}/g, ' § ');
  s = s.replace(/\\(mathrm|operatorname)\s*\{([^{}]*)\}/g, ' $2 ');      // \mathrm{d}x, \operatorname{tg} → үсэг
  // aligned: «\\ &=» → гинжийг үргэлжлүүлнэ, бусад мөр → тусгаарлагч
  s = s.replace(/\\begin\{(aligned|align\*?|gathered|cases|split)\}/g, ' § ').replace(/\\end\{(aligned|align\*?|gathered|cases|split)\}/g, ' § ');
  s = s.replace(/\\\\\s*&?\s*(?=(=|\\approx|\\le|\\ge|\\lt|\\gt|\\ne)(?![a-zA-Z]))/g, ' ');
  s = s.replace(/\\\\/g, ' § ').replace(/&/g, ' ');
  SEP_CMDS.forEach((c) => { s = s.split(c).join(' § '); });
  // дээд түвшний , ; → тусгаарлагч ({,} аравтын таслалаас бусад)
  s = s.replace(/\{,\}/g, '.');
  let out = [], cur = '', d = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      // \{ \} \, \; \! \  \| — тэмдэгт
      // \, \; \! \: — нимгэн зай (мянгатын тусгаарлагч 1\,092\,727 → 1092727); «\ » — энгийн зай
      if (s[i + 1] === ',' || s[i + 1] === ';' || s[i + 1] === '!' || s[i + 1] === ':') { i++; continue; }
      if (s[i + 1] === ' ') { cur += ' '; i++; continue; }
      if (s[i + 1] === '{' || s[i + 1] === '}') { cur += '\\' + s[i + 1]; i++; continue; }
      cur += c; continue;
    }
    if (c === '{' || c === '(' || c === '[') d++;
    if (c === '}' || c === ')' || c === ']') d = Math.max(0, d - 1);
    // өгүүлбэрийн төгсгөлийн цэг «…=26.» (аравтын 2.5, үечилсэн 2.(07)-оос бусад) → тусгаарлагч
    const endDot = c === '.' && d === 0 && !/[0-9]/.test(s[i + 1] || '') && !(s[i + 1] === '(' && /[0-9]/.test(s[i - 1] || ''));
    if (c === '§' || endDot || (d === 0 && (c === ',' || c === ';'))) { if (cur.trim()) out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

// Нэг clause-ийг харьцааны тэмдгээр (дээд түвшинд) хэсэглэх: [{e:'…'}, {r:'='}, {e:'…'}, …]
function splitRel(c) {
  const parts = []; let cur = '', d = 0, i = 0;
  while (i < c.length) {
    const ch = c[i];
    if (ch === '{' || ch === '(' || ch === '[') d++;
    if (ch === '}' || ch === ')' || ch === ']') d = Math.max(0, d - 1);
    if (d === 0) {
      let hit = null;
      for (const [k, v] of REL) {
        if (c.startsWith(k, i) && !(k[0] === '\\' && /[a-zA-Z]/.test(c[i + k.length] || ''))) { hit = [k, v]; break; }
      }
      if (hit) { parts.push({ e: cur }); parts.push({ r: hit[1] }); cur = ''; i += hit[0].length; continue; }
    }
    cur += ch; i++;
  }
  parts.push({ e: cur });
  return parts;
}

/* ── Тоон үнэлгээ (recursive descent) ── */
function evalTex(src) {
  let s = String(src);
  if (/\\nc\b/.test(s)) return null;
  s = s.replace(/\\(left|right|bigl|bigr|Bigl|Bigr|biggl|biggr|big|Big|bigg|Bigg|displaystyle|textstyle|limits)(?![a-zA-Z])/g, '');
  s = s.replace(/\\[,;:! ]/g, '').replace(/~/g, '').replace(/\{,\}/g, '.');
  s = s.replace(/\^\s*\{?\s*\\circ\s*\}?/g, '');           // градус — нэгж
  s = s.replace(/\\(cdot|times)(?![a-zA-Z])/g, '*').replace(/\\div(?![a-zA-Z])/g, '/').replace(/:/g, '/');
  s = s.replace(/\\%/g, '%');
  s = s.replace(/\\(boxed|mathbf)(?![a-zA-Z])/g, '');
  let i = 0;
  const N = s.length;
  const ws = () => { while (i < N && /\s/.test(s[i])) i++; };
  const fail = () => { throw new Error('nn'); };
  const peek = () => { ws(); return s[i]; };
  function cmdName() { // s[i] === '\\'
    let j = i + 1; while (j < N && /[a-zA-Z]/.test(s[j])) j++;
    return s.slice(i + 1, j);
  }
  function arg() { // {…} эсвэл ганц тэмдэгт/команд
    ws();
    if (s[i] === '{') { i++; const v = expr(); ws(); if (s[i] !== '}') fail(); i++; return v; }
    if (/[0-9]/.test(s[i])) { const v = +s[i]; i++; return v; }
    if (s[i] === '\\') return primary();
    fail();
  }
  function number() {
    let j = i; while (j < N && /[0-9]/.test(s[j])) j++;
    let intp = s.slice(i, j), frac = '';
    if (s[j] === '.' && /[0-9(]/.test(s[j + 1] || '')) {
      let k = j + 1; while (k < N && /[0-9]/.test(s[k])) k++;
      frac = s.slice(j + 1, k);
      // үечилсэн бутархай 2.(07)
      const m = /^\((\d+)\)/.exec(s.slice(k));
      if (m) {
        i = k + m[0].length;
        const P = m[1];
        return +(intp || '0') + (+(frac || '0') + (+P) / (Math.pow(10, P.length) - 1)) / Math.pow(10, frac.length);
      }
      i = k; return +((intp || '0') + '.' + frac);
    }
    if (!intp) fail();
    i = j; return +intp;
  }
  function fact(n) { if (n < 0 || n !== Math.floor(n) || n > 170) fail(); let r = 1; for (let k = 2; k <= n; k++) r *= k; return r; }
  function comb(n, k) { if (k < 0 || k > n || n !== Math.floor(n) || k !== Math.floor(k)) fail(); return fact(n) / (fact(k) * fact(n - k)); }
  function primary() {
    ws();
    const c = s[i];
    if (c === undefined) fail();
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(s[i + 1] || ''))) return number();
    if (c === '(' || c === '[' || c === '{') {
      const close = { '(': ')', '[': ']', '{': '}' }[c]; i++;
      const v = expr(); ws(); if (s[i] !== close) fail(); i++; return v;
    }
    if (c === '|') { i++; const v = expr(); ws(); if (s[i] !== '|') fail(); i++; return Math.abs(v); }
    if (c === 'C' && s[i + 1] === '_') { // C_n^k
      i += 2; const n = arg(); ws(); if (s[i] !== '^') fail(); i++; const k = arg(); return comb(n, k);
    }
    if (c === 'π') { i++; return Math.PI; }
    if (c === '\\') {
      const nm = cmdName(); i += 1 + nm.length;
      if (nm === 'frac' || nm === 'dfrac' || nm === 'tfrac' || nm === 'cfrac') { const a = arg(), b = arg(); if (b === 0) fail(); return a / b; }
      if (nm === 'sqrt') {
        ws(); let n = 2;
        if (s[i] === '[') { i++; n = expr(); ws(); if (s[i] !== ']') fail(); i++; }
        const v = arg();
        if (n === 2) { if (v < 0) fail(); return Math.sqrt(v); }
        return v < 0 && n % 2 === 1 ? -Math.pow(-v, 1 / n) : Math.pow(v, 1 / n);
      }
      if (nm === 'binom' || nm === 'dbinom') { const n = arg(), k = arg(); return comb(n, k); }
      if (nm === 'pi') return Math.PI;
      if (nm === '{' || nm === '') fail();
      fail();     // \sin, \log, \vec, \alpha … — тоон биш
    }
    fail();       // үсэг гэх мэт
  }
  function postfix() {
    let v = primary();
    for (;;) {
      ws();
      if (s[i] === '!' ) { i++; v = fact(v); continue; }
      if (s[i] === '%') { i++; v = v / 100; continue; }
      break;
    }
    return v;
  }
  function power() {
    const b = postfix();
    ws();
    if (s[i] === '^') { i++; const e = powArg(); const r = Math.pow(b, e); if (!isFinite(r)) fail(); return r; }
    return b;
  }
  function powArg() {
    ws();
    if (s[i] === '{') { i++; const v = expr(); ws(); if (s[i] !== '}') fail(); i++; return v; }
    if (/[0-9]/.test(s[i])) { const v = +s[i]; i++; return v; }
    if (s[i] === '-' ) { i++; return -powArg(); }
    if (s[i] === '\\') return primary();
    fail();
  }
  function unary() {
    ws();
    if (s[i] === '-') { i++; return -unary(); }
    if (s[i] === '+') { i++; return unary(); }
    return power();
  }
  function startsPrimary() {
    ws(); const c = s[i];
    if (c === undefined) return false;
    if (/[0-9(\[{|π]/.test(c)) return true;
    if (c === '\\') { const nm = cmdName(); return ['frac', 'dfrac', 'tfrac', 'cfrac', 'sqrt', 'binom', 'dbinom', 'pi'].includes(nm) || true; }
    if (/[a-zA-Z]/.test(c)) return true;   // үсэг — primary() fail хийнэ
    return false;
  }
  function term() {
    let v = unary();
    for (;;) {
      ws();
      if (s[i] === '*') { i++; v *= unary(); continue; }
      if (s[i] === '/') { i++; const d = unary(); if (d === 0) fail(); v /= d; continue; }
      if (s[i] && s[i] !== '+' && s[i] !== '-' && s[i] !== ')' && s[i] !== ']' && s[i] !== '}' && s[i] !== '|' && startsPrimary()) { v *= power(); continue; }
      break;
    }
    return v;
  }
  function expr() {
    let v = term();
    for (;;) {
      ws();
      if (s[i] === '+') { i++; v += term(); continue; }
      if (s[i] === '-') { i++; v -= term(); continue; }
      break;
    }
    return v;
  }
  try {
    ws(); if (i >= N) return null;
    const v = expr(); ws();
    if (i < N) return null;
    return Number.isFinite(v) ? v : null;
  } catch (e) { return null; }
}

function decimals(e) { const m = /^\s*-?\d*\.(\d+)\s*$/.exec(e.replace(/\{,\}/g, '.')); return m ? m[1].length : (/^\s*-?\d+\s*$/.test(e) ? 0 : null); }
const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

// Нэг томьёо (TeX) дахь тоон гинжийн зөрүүнүүд
function chainIssues(t) {
  const out = [];
  clauses(t).forEach((c) => {
    const parts = splitRel(c);
    for (let k = 1; k + 1 < parts.length; k += 2) {
      const L = parts[k - 1].e, R = parts[k + 1].e, r = parts[k].r;
      const a = evalTex(L), b = evalTex(R);
      if (a == null || b == null) continue;
      let ok;
      if (r === '=') ok = close(a, b);
      else if (r === '≈') { const d = decimals(R); const tol = d == null ? 0.02 * Math.max(1, Math.abs(b)) : 0.5 * Math.pow(10, -d) + 1e-9; ok = Math.abs(a - b) <= tol; }
      else if (r === '<') ok = a < b && !close(a, b);
      else if (r === '>') ok = a > b && !close(a, b);
      else if (r === '≤') ok = a <= b || close(a, b);
      else if (r === '≥') ok = a >= b || close(a, b);
      else if (r === '≠') ok = !close(a, b);
      if (!ok) out.push(L.trim() + ' ' + r + ' ' + R.trim() + '   (' + +a.toPrecision(10) + ' vs ' + +b.toPrecision(10) + ')');
    }
  });
  return out;
}

module.exports = { evalTex, chainIssues, clauses, splitRel };

if (require.main === module) {
  // өөрийн шалгалт
  const T = (x, v) => { const r = evalTex(x); if (v === null ? r !== null : r === null || !close(r, v)) { console.log('FAIL evalTex', JSON.stringify(x), '→', r, 'хүлээсэн', v); process.exitCode = 1; } };
  T('2\\cdot 3+4', 10); T('-3^2', -9); T('(-3)^2', 9); T('\\dfrac{1}{2}\\cdot 6\\cdot 8', 24); T('\\frac12', 0.5); T('2\\sqrt{3}', 2 * Math.sqrt(3));
  T('\\sqrt{8^2+6^2}', 10); T('16+2\\cdot 10', 36); T('2^{\\frac{1}{2}+\\frac{3}{2}}', 4); T('64^{\\frac{1}{3}}', 4); T('\\left(\\dfrac{1}{3}\\right)^{-2}-25^{\\frac{1}{2}}', 4);
  T('2.(07)', 2 + 7 / 99); T('0.(3)', 1 / 3); T('12\\,000', 12000); T('7{,}5', 7.5); T('C_5^2', 10); T('C_{5}^{2}', 10); T('5!', 120); T('\\binom{6}{3}', 20);
  T('180^\\circ-60^\\circ', 120); T('20\\%', 0.2); T('2^2:2^2', 1); T('x+1', null); T('\\sin 30^\\circ', null); T('a_3', null); T('\\pi\\cdot 8\\cdot 12', 96 * Math.PI);
  T('-\\dfrac{16}{3}+16-\\dfrac{16}{3}+16', 32 - 32 / 3); T('\\sqrt[3]{-8}', -2); T('3(4+1)', 15); T('|-3|+1', 4); T('\\dfrac{5\\cdot 4}{2}', 10); T('1.03^4', 1.12550881);
  T('\\left(-\\dfrac{2}{3}\\cdot 2^3+8\\cdot 2\\right)-\\left(-\\dfrac{2}{3}\\cdot(-2)^3+8\\cdot(-2)\\right)', 64 / 3);
  const C = (x, n) => { const r = chainIssues(x); if (r.length !== n) { console.log('FAIL chain', JSON.stringify(x), r); process.exitCode = 1; } };
  C('P=16+2\\cdot 10=36', 0); C('P=16+2\\cdot 10=35', 1); C('AB=\\sqrt{8^2+6^2}=10', 0); C('x_1=2,\\ x_2=3', 0); C('D=25-4\\cdot 6=1\\gt 0', 0); C('D=25-4\\cdot 6=1\\lt 0', 1);
  C('\\sigma=\\sqrt{4.85}\\approx 2.2', 0); C('\\sigma=\\sqrt{4.85}\\approx 2.3', 1); C('A(1;\\,-2)', 0); C('\\begin{aligned}S&=2\\cdot 3\\\\&=6\\end{aligned}', 0);
  C('\\begin{aligned}S&=2\\cdot 3\\\\&=7\\end{aligned}', 1); C('a=2\\cdot 3=6\\quad b=5', 0); C('3+4=7\\text{ ш}', 0); C('\\nc 2+2=5', 0); C('\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}=\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}', 0);
  C('2x+1=5\\Rightarrow x=2', 0); C('5+3-1=7', 0); C('\\dfrac{7}{20}=0.35', 0); C('x\\in\\left]-\\infty;\\,-1\\right]', 0); C('\\int_0^1 x\\,dx=\\dfrac12', 0);
  C('1\\,000\\,000\\cdot 1.03^3=1\\,092\\,727', 0); C('1\\,000\\,000\\cdot 1.03^3\\approx 1\\,092\\,727', 0); C('1\\,092\\,727-1\\,090\\,000=2\\,727', 0); C('1\\,092\\,727-1\\,090\\,000=2\\,728', 1);
  C('BH=\\sqrt{34^2-30^2}=16.', 0); C('BH=\\sqrt{34^2-30^2}=17.', 1); C('x=2.(07)=2.(07).', 0); C('S=2.5\\cdot 2=5.', 0); C('S=2.5\\cdot 2=6.', 1);
  C('4.2=1.4x\\Rightarrow x=3', 0); C('12\\%', 0); C('-2\\lt x\\le 3', 0); C('25\\cdot 4=100', 0); C('S=\\dfrac{4\\sqrt2\\cdot4\\sqrt2}{2}+\\dfrac{4\\cdot4\\sqrt3}{2}+\\dfrac{4\\sqrt3\\cdot2}{2}=16+8\\sqrt3+4\\sqrt3=16+12\\sqrt3', 0);
  console.log(process.exitCode ? 'texnum: АЛДААТАЙ' : 'texnum: бүх өөрийн шалгалт OK');
}
