/* ЭЕШ шалгагч (eyeshcheck.com) — ЭЕШ хуудсуудын (eesh-YYYY-songoh / eesh-YYYY-nohoh, эсвэл хоёр хэсэг НЭГ хуудсанд: eesh-YYYY)
   ба бүлгийн шалгалтын материалын (cmx.js — window.CM_EXAM: 10 тест, хувилбарын кодтой) «ЭЕШ шалгагч» товч.
   Дарахад: Дасгалын төвийн бүртгэлээр нэвтэрсэн эсэх → эрх (POST /api/eyesh?action=status) → эрхгүй бол QPay
   (POST /api/qpay?action=create {plan:'eyesh'}, 1 сар) → нэг удаагийн код (POST /api/eyesh?action=handoff) →
   eyeshcheck.com/api/cm/sso руу form POST (шинэ таб): тэнд энэ хувилбарын зөв хариулттай шалгалт шууд үүснэ.
   Хуудас бүр одоогийн хувилбараа localStorage 'cm_eesh_<он>_p<хэсэг>'-д санана — нөгөө хэсгийг тэр хуудаснаас хамт оруулна
   (хоёр хэсэг нэг хуудсанд бол санахгүй — хоёуланг нь энэ хуудаснаас авна).
   2-р хэсгийг зөвхөн ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтах хувилбараар оруулна (эх хувилбар үргэлж багтана).
   Хувилбарын тоо (1–6): eyeshcheck-д НЭГ шалгалт, хувилбар бүр (A–F) өөрийн түлхүүртэй — сурагч хариултын хуудасны «ХУВИЛБАР»-ыг
   будна. A = сонгосон хувилбар, B… = түүнээс тогтмол үр (dseeds; бүлгийн шалгалтад cmx.js setSeeds) тул хэвлэсэн багцыг дараа ч
   сэргээнэ. ЭЕШ: хувилбаруудыг энэ цонхноос хэвлэнэ (хуудас бүрт «ХУВИЛБАР B»); тусдаа хуудастай онд нөгөө хэсгийн B… хувилбарыг
   тэр хуудас localStorage-д бэлдэнэ (vars). Бүлгийн шалгалт: CMX.printSet — ХУВИЛБАР урьдчилан будагдсан, нийтлэг шалгалтын код. */
(function () {
  'use strict';
  var m = /\/eesh-(\d{4})(?:-(songoh|nohoh))?(?:\.html)?$/.exec(location.pathname);
  // WS: бүлгийн шалгалт (cmx.js) — хувилбарын кодоор тогтмол тест; 2-р хэсэг (задгай) нь хариултын хуудасны ар талд, гараар дүгнэнэ
  var WS = !m && typeof window.CM_EXAM === 'function';
  if ((!m && !WS) || window.EYESH) return;
  // BOTH: хоёр хэсэг нэг хуудсанд (eesh-2022) — нэг үрээр хамт үүсдэг тул хоёуланг нь энэ хуудаснаас авна
  var BOTH = !!m && !m[2];
  var YEAR = m ? +m[1] : 0, PART = m && m[2] === 'nohoh' ? 2 : 1, YY = YEAR % 100;
  var PAGES = { 1: '/eesh-' + YEAR + '-songoh.html', 2: '/eesh-' + YEAR + '-nohoh.html' };
  var RESUME = 'cm_eyesh_resume', SSO_RE = /^https:\/\/eyeshcheck\.com\//;
  var POLL_MS = 3000, POLL_MAX = 200;
  // Эх хувилбарын хариу — нөгөө хэсгийн хуудсыг энэ төхөөрөмж дээр нээгээгүй үед эхээр нь оруулахад л хэрэглэнэ.
  // Хуудасны генератортой (e24_generate/e24n_generate/e23n_generate('orig')) тулгаж tests/eyesh.test.js шалгана.
  // parts — дэд асуултын оноо (хуудсан дээрх «(2 оноо)»), 2023 онд бодлого бүр бүтнээрээ 7 оноо.
  var ORIG = {
    2024: {
      1: { v: 'orig', g: '', key: 'EDCAADCBDEAACDEAACBBDEDAACDEAACBDEAA' },
      2: { v: 'orig', g: '', items: [
        { ans: { a: '3', b: '7', c: '1', d: '4', e: '7', f: '1', g: '1', h: '4' }, parts: [['abc', 2], ['def', 3], ['gh', 2]] },
        { ans: { a: '5', bc: '11', d: '8', ef: '10', gh: '33' }, parts: [['abc', 2], ['def', 3], ['gh', 2]] },
        { ans: { a: '6', bc: '24', d: '9', e: '2', fg: '11' }, parts: [['abc', 2], ['de', 2], ['fg', 3]] },
        { ans: { a: '0', b: '7', c: '9', d: '1', e: '9', fgh: '157' }, parts: [['abab', 1], ['cde', 4], ['fgh', 2]] }
      ] }
    },
    2023: {
      2: { v: 'orig', g: '', items: [
        { ans: { a: '6', b: '8', c: '3', d: '2', e: '5', f: '4', g: '8' }, parts: [] },
        { ans: { a: '1', b: '2', c: '3', de: '18', fg: '36', h: '2' }, parts: [] },
        { ans: { a: '2', b: '4', c: '5', d: '3', ef: '10', g: '1', h: '5' }, parts: [] },
        { ans: { ab: '36', c: '6', d: '6', e: '6', f: '2', g: '3' }, parts: [] }
      ] }
    }
  };
  var ICO = {
    logo: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="18" rx="2.5"/><path d="M9 3.5h6v3H9z"/><path d="m9 13.5 2 2 4-4.5"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    ext: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4"/></svg>',
    qr: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/></svg>',
    login: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',
    bank: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    prt: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>'
  };

  // Хувилбарын тоо — eyeshcheck lib/eyesh.js VARIANTS (A–F); сүүлд сонгосон тоог (ЭЕШ — он бүрт, бүлгийн шалгалт — cmx.js-тэй нэг) санана
  var VL = ['A', 'B', 'C', 'D', 'E', 'F'], NMAX = VL.length, NKEY = 'cm_eyc_n_' + (WS ? 'ws' : YEAR);
  function nPref() { var n = parseInt(lsGet(NKEY), 10); return n >= 1 && n <= NMAX ? n : 1; }
  function fnv(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  // ЭЕШ: суурь хувилбараас ('orig' | 1000–9999) B, C… хувилбарын үр — тогтмол, бие биетэйгээ давхцахгүй
  function dseeds(base, n) {
    var out = [base], used = {}; used[base] = 1;
    for (var i = 1; i < n; i++) {
      var h = fnv('eyc|' + base + '|' + i), s;
      do { s = 1000 + h % 9000; h = fnv(h + '#'); } while (used[s]);
      used[s] = 1; out.push(s);
    }
    return out;
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function tok() { return lsGet('cm_ws_token') || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ymd(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function post(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { s: r.status, d: d || {} }; }); });
  }

  /* ── Хувилбар: одоогийн хуудаснаас + санасан ── */
  function stNow(p) { return window[(p || PART) === 1 ? '__E' + YY : '__E' + YY + 'N'] || null; }
  // Нөхөх бодлогын html → [['abc', 2], …]: «(N оноо)» хүртэлх нүднүүд нэг дэд асуулт. Эхэнд нь ирсэн «(7 оноо)» (2023) — хуваахгүй.
  function partsOf(html) {
    var s = String(html || '').replace(/<svg[\s\S]*?<\/svg>/g, ' '), re = /<span class="bx">([^<]*)<\/span>|\((\d+)\s*оноо\)/g, x, acc = '', out = [];
    while ((x = re.exec(s))) {
      if (x[1] != null) acc += x[1];
      else { if (acc) out.push([acc, +x[2]]); acc = ''; }
    }
    return out;
  }
  function exportSt(st, p) {
    var o = { v: st.seed, g: st.seed === 'orig' ? '' : String(st.g || '') };
    if (p === 1) {
      var f = window['e' + YY + '_letters'];
      o.key = typeof f === 'function' ? String(f(st)) : '';
    } else {
      o.items = st.items.map(function (it) { return { ans: it.ans || {}, parts: partsOf(it.html) }; });
    }
    return o;
  }
  function exportCur(p) {
    p = p || PART;
    var st = stNow(p); if (!st || !st.items) return null;
    return exportSt(st, p);
  }
  // Энэ хуудсанд p-р хэсгийн генератор бий эсэх (хоёр хэсэг нэг хуудсанд бол хоёулаа): e24_generate / e24n_generate
  function genName(p) { return 'e' + YY + (p === 1 ? '' : 'n') + '_generate'; }
  function hasGen(p) { return !WS && (BOTH || PART === p) && typeof window[genName(p)] === 'function'; }
  // p-р хэсгийн seed хувилбарыг хуудсыг өөрчлөхгүйгээр үүсгэнэ (build()-ийн st.g-тэй ижил build тэмдэгтэй)
  var GENC = {};
  function genExport(p, seed) {
    var k = p + ':' + seed;
    if (GENC[k]) return GENC[k];
    var st = null;
    try { st = window[genName(p)](seed, window); } catch (e) { st = null; }
    if (!st || !st.items) return null;
    st.g = seed === 'orig' ? '' : String(window['E' + YY + (p === 2 && !BOTH ? 'N' : '') + '_BUILD'] || '');
    return (GENC[k] = exportSt(st, p));
  }
  function okKey(o) { return !!o && /^[A-E]{36}$/.test(String(o.key || '')); }
  // Бүх 4 бодлогын нүд a–h-д багтаж, давхардахгүй эсэх (eyeshcheck-ийн хариултын хуудас 2.1–2.4 × a–h)
  function fits(o) {
    if (!o || !Array.isArray(o.items) || o.items.length !== 4) return false;
    return o.items.every(function (it) {
      var seen = {}, n = 0;
      return Object.keys(it.ans || {}).every(function (k) {
        if (!/^[a-h]+$/.test(k)) return false;
        for (var i = 0; i < k.length; i++) { if (seen[k[i]]) return false; seen[k[i]] = 1; n++; }
        return true;
      }) && n > 0;
    });
  }
  var PRINTING = false;   // хувилбаруудыг хэвлэж байх үед (build() олон удаа) санахгүй
  function remember() {
    if (WS || BOTH || PRINTING) return;
    var o = exportCur(); if (!o) return;
    o.t = Date.now();
    lsSet('cm_eesh_' + YEAR + '_p' + PART, JSON.stringify(o));
    // Олон хувилбар хэрэглэсэн төхөөрөмж дээр энэ хэсгийн B–F хувилбарыг нөгөө хэсгийн хуудсанд бэлдэнэ (хуудас хүлээлгэхгүй)
    if (nPref() > 1 && hasGen(PART)) setTimeout(function () { prepVars(o.v, o.t); }, 80);
  }
  function prepVars(v, t) {
    var c = exportCur(); if (!c || c.v !== v || PRINTING) return;
    c.t = t;
    c.vars = dseeds(c.v, NMAX).slice(1).map(function (s) { return genExport(PART, s); });
    if (c.vars.every(Boolean)) lsSet('cm_eesh_' + YEAR + '_p' + PART, JSON.stringify(c));
  }
  function readMem(p) {
    try { var o = JSON.parse(lsGet('cm_eesh_' + YEAR + '_p' + p) || 'null'); return o && (o.v === 'orig' || (o.v >= 1000 && o.v <= 9999)) ? o : null; }
    catch (e) { return null; }
  }
  function vtxt(o) { return o.v === 'orig' ? 'Эх (' + YEAR + ')' : 'Хувилбар №' + o.v + (o.g ? '·' + o.g : ''); }
  function vshort(o) { return o.v === 'orig' ? 'Эх' : '№' + o.v; }

  // Сонголтын жагсаалт: s1 — 1-р хэсэг (заавал), s2 — 2-р хэсэг (сүүлд нь «Оруулахгүй»)
  function sources() {
    if (BOTH) {
      var c1 = exportCur(1), c2 = exportCur(2), b1 = [], b2 = [];
      if (okKey(c1)) b1.push({ id: 'cur', o: c1, hint: 'энэ хуудас' });
      if (c2) b2.push({ id: 'cur', o: c2, hint: 'энэ хуудас', bad: !fits(c2) });
      b2.push({ id: 'none', o: null, hint: 'зөвхөн 1-р хэсэг' });
      return { s1: b1, s2: b2 };
    }
    var me = exportCur(), mem = readMem(3 - PART), orig = ORIG[YEAR] || {}, s1 = [], s2 = [];
    if (PART === 1) {
      if (okKey(me)) s1.push({ id: 'cur', o: me, hint: 'энэ хуудас' });
      if (mem && Array.isArray(mem.items)) s2.push({ id: 'mem', o: mem, hint: 'сүүлд нээсэн', bad: !fits(mem) });
      if (orig[2] && !(mem && mem.v === 'orig' && fits(mem))) s2.push({ id: 'orig', o: orig[2], hint: 'эх даалгавар' });
    } else {
      if (okKey(mem)) s1.push({ id: 'mem', o: mem, hint: 'сүүлд нээсэн' });
      if (orig[1] && !(okKey(mem) && mem.v === 'orig')) s1.push({ id: 'orig', o: orig[1], hint: 'эх даалгавар' });
      if (me) s2.push({ id: 'cur', o: me, hint: 'энэ хуудас', bad: !fits(me) });
      if (orig[2] && !(me && me.v === 'orig' && fits(me))) s2.push({ id: 'orig', o: orig[2], hint: 'эх даалгавар' });
    }
    s2.push({ id: 'none', o: null, hint: 'зөвхөн 1-р хэсэг' });
    return { s1: s1, s2: s2 };
  }
  // Сонголт x (p-р хэсэг)-ийн A…n хувилбар → [o, …] эсвэл null (бэлэн биш). Энэ хуудасны хэсгийг шууд бодно;
  // нөгөө хэсгийнхийг тэр хуудасны бэлдсэн vars-аас (сүүлд нээсэн) — эх хүснэгтийнх (ORIG)-д B… байхгүй.
  function varsOf(p, x, n) {
    if (!x || !x.o) return null;
    if (n <= 1) return [x.o];
    var list;
    if (hasGen(p)) list = dseeds(x.o.v, n).map(function (s, i) { return i ? genExport(p, s) : x.o; });
    else if (Array.isArray(x.o.vars) && x.o.vars.length >= n - 1) list = [x.o].concat(x.o.vars.slice(0, n - 1));
    else return null;
    return list.every(function (o) { return o && (p === 1 ? okKey(o) : fits(o)); }) ? list : null;
  }
  // Сонгосон хувилбаруудаар eyeshcheck-ийн шалгалт (api/_eyesh.js normExam) — бэлэн биш бол null
  function eeshExam() {
    var src = sources(), a = pick(src.s1, S.sel1), b = pick(src.s2, S.sel2), n = S.n;
    if (!a) return null;
    var A1 = varsOf(1, a, n), A2 = b && b.o ? varsOf(2, b, n) : null;
    if (!A1 || (b && b.o && !A2)) return null;
    var p1 = function (o) { return { v: o.v, g: o.g || '', key: o.key }; }, p2 = function (o) { return { v: o.v, g: o.g || '', items: o.items }; };
    var ex = { year: YEAR, title: (S.title || '').trim(), p1: p1(A1[0]), p2: A2 ? p2(A2[0]) : null };
    if (n > 1) ex.variants = A1.slice(1).map(function (o, i) { return { p1: p1(o), p2: A2 ? p2(A2[i + 1]) : null }; });
    return ex;
  }

  /* ── Харагдац ── */
  function css() {
    if (document.getElementById('eyc-css')) return;
    var st = document.createElement('style'); st.id = 'eyc-css';
    st.textContent =
      '.eyc-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:34px;padding:0 12px;border-radius:12px;border:1.4px solid #C4B5FD;background:#fff;color:#5B3BD9;font-family:inherit;font-weight:800;font-size:.82rem;line-height:1;cursor:pointer;white-space:nowrap}'
      + '.eyc-btn:hover{background:#F5F3FF}.eyc-btn svg{flex:none}'
      + '.bar.cmbar>.eyc-btn{order:6}'
      + 'html.cm-ws-locked .eyc-btn,html.cm-trial:not(.cm-free) .eyc-btn{display:none!important}'
      + '@media (max-width:640px){.bar.cmbar.cmbar-stuck>.eyc-btn{display:none!important}}'
      + '@media print{.eyc-btn,.eyc-ov{display:none!important}}'
      // Хувилбарын тоо (заавал асууна), жагсаалт, хэвлэх
      + '.eyc-q{border-color:#D8CCFB}.eyc-q.need{border-color:#A855F7;box-shadow:0 0 0 3px rgba(168,85,247,.13)}.eyc-q .eyc-st{font-size:.9rem}'
      + '.eyc-seg{display:flex;gap:6px;margin:4px 0 2px}'
      + '.eyc-seg button{flex:1;min-width:0;height:34px;border-radius:10px;border:1.4px solid #E4DEF7;background:#fff;color:#3d2f86;font-family:inherit;font-weight:800;font-size:.92rem;cursor:pointer}'
      + '.eyc-seg button.on{background:linear-gradient(135deg,#7B52EE,#A855F7);border-color:transparent;color:#fff}'
      + '.eyc-vl{display:grid;gap:3px;margin:8px 0 2px;font-size:.84rem}'
      + '.eyc-vl div{display:flex;align-items:center;gap:8px}'
      + '.eyc-vl i{font-style:normal;display:inline-grid;place-items:center;min-width:22px;height:22px;border-radius:7px;background:#F3F0FF;color:#5B3BD9;font-weight:900}'
      + '.eyc-vl small{color:#8a84a3;font-size:.76rem}'
      + '.eyc-pr{display:flex;align-items:center;gap:8px;margin-top:9px;flex-wrap:wrap}'
      + '.eyc-pr label{display:flex;align-items:center;gap:6px;font-size:.8rem;font-weight:800;color:#3d2f86}'
      + '.eyc-pr input{width:62px;box-sizing:border-box;border:1.4px solid #E4DEF7;border-radius:9px;padding:6px 8px;font-family:inherit;font-weight:800;font-size:.88rem;color:#2a2346}'
      + '.eyc-pr .eyc-go{width:auto;flex:1;min-height:38px;font-size:.88rem;box-shadow:none}'
      // Хэвлэсэн хувилбар бүрийн тэмдэг ба түлхүүрийн хуудас
      + '.eyc-vb{display:flex;align-items:center;justify-content:center;gap:10px;width:fit-content;margin:0 auto 6px;border:2px solid #5a32d6;border-radius:10px;padding:3px 12px;color:#3d2f86;font-weight:900;font-size:13px;letter-spacing:.05em;text-align:left}'
      + '.eyc-vb>b{font-size:22px;line-height:1.1;color:#5a32d6}'
      + '.eyc-vb span{font-weight:600;font-size:10.5px;letter-spacing:0;color:#5b5675;max-width:270px;line-height:1.25}'
      + '.eyc-kt{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}'
      + '.eyc-kt th,.eyc-kt td{border:1px solid #d9d2f0;padding:4px 6px;text-align:left;vertical-align:top}'
      + '.eyc-kt th{background:#f5f2ff;color:#3d2f86}.eyc-kt td.L{font-weight:900;font-size:15px;color:#5a32d6;text-align:center;width:28px}'
      + '.eyc-kt td.k{font-family:ui-monospace,Consolas,monospace;font-weight:700;letter-spacing:.06em;word-break:break-all}'
      + '#eyc-batch{display:none}'
      + '.eyc-ov{position:fixed;inset:0;z-index:9000;background:rgba(24,16,48,.45);display:flex;align-items:flex-start;justify-content:center;padding:6vh 14px 14px;overflow:auto;font-family:inherit}'
      + '.eyc-card{position:relative;width:100%;max-width:460px;box-sizing:border-box;background:#fff;border-radius:20px;box-shadow:0 30px 70px -25px rgba(40,20,110,.55);padding:20px 20px 18px;color:#2a2346;line-height:1.4}'
      + '.eyc-x{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:10px;border:0;background:#F4F2FB;color:#5b5675;cursor:pointer;display:grid;place-items:center}'
      + '.eyc-h{display:flex;align-items:center;gap:10px;font-weight:900;font-size:1.12rem;margin:0 44px 2px 0}'
      + '.eyc-h i{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;display:grid;place-items:center;flex:none}'
      + '.eyc-sub{font-size:.86rem;color:#6b6585;margin:8px 0 12px}'
      + '.eyc-sec{border:1.4px solid #EEEAF8;border-radius:14px;padding:9px 12px;margin-bottom:10px}'
      + '.eyc-st{font-weight:800;font-size:.84rem;color:#3d2f86;margin-bottom:4px}'
      + '.eyc-opt{display:flex;align-items:flex-start;gap:8px;padding:4px 0;font-size:.88rem;cursor:pointer}'
      + '.eyc-opt input{margin:3px 0 0;accent-color:#7B52EE;flex:none}.eyc-opt.dis{opacity:.55;cursor:not-allowed}'
      + '.eyc-opt small{color:#8a84a3;font-size:.76rem;margin-left:4px}'
      + '.eyc-note{font-size:.78rem;color:#5b5675;border-left:3px solid #A855F7;padding:2px 0 2px 8px;margin:6px 0 2px}'
      + '.eyc-note a{color:#5B3BD9;font-weight:800}'
      + '.eyc-lbl{display:block;font-weight:800;font-size:.8rem;color:#3d2f86;margin:2px 0 4px}'
      + '.eyc-ti{width:100%;box-sizing:border-box;border:1.4px solid #E4DEF7;border-radius:10px;padding:9px 11px;font-family:inherit;font-size:.88rem;color:#2a2346;margin-bottom:12px}'
      + '.eyc-ti:focus{outline:2px solid #C4B5FD;border-color:#A78BFA}'
      + '.eyc-go{width:100%;min-height:46px;border:0;border-radius:14px;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;font-family:inherit;font-weight:900;font-size:.95rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 4px 0 #5532C9;padding:8px 14px}'
      + '.eyc-go[disabled]{opacity:.55;cursor:default}.eyc-go.sec{background:#F3F0FF;color:#5B3BD9;box-shadow:none}'
      + '.eyc-msg{font-size:.84rem;color:#6b6585;margin:9px 0 0;min-height:1.1em}.eyc-msg.err{color:#b91c1c}.eyc-msg.ok{color:#15803d;font-weight:700}'
      + '.eyc-buy{border-radius:14px;background:#F7F4FF;padding:11px 14px;margin:2px 0 10px}'
      + '.eyc-price{font-weight:900;font-size:1.05rem;color:#3d2f86}'
      + '.eyc-buy ul{margin:5px 0 0;padding-left:18px;font-size:.84rem;color:#4a4466}'
      + '.eyc-alt{font-size:.82rem;color:#6b6585;margin-top:10px;text-align:center}'
      + '.eyc-link{background:none;border:0;color:#5B3BD9;font-family:inherit;font-weight:800;font-size:.84rem;cursor:pointer;padding:2px 0;text-decoration:underline}'
      + '.eyc-qr{text-align:center}.eyc-qr .cap{font-size:.84rem;color:#6b6585;margin-bottom:6px}'
      + '.eyc-qr img.q{width:220px;height:220px;max-width:66vw;max-height:66vw}'
      + '.eyc-short{display:inline-flex;align-items:center;gap:6px;margin-top:6px;font-weight:800;font-size:.86rem;color:#5B3BD9;text-decoration:none}'
      + '.eyc-banks{display:grid;grid-template-columns:repeat(auto-fill,minmax(84px,1fr));gap:8px;margin-top:10px}'
      + '.eyc-bank{display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.7rem;color:#3f3a5c;text-decoration:none;padding:7px 4px;border-radius:10px;background:#F6F4FD;text-align:center}'
      + '.eyc-bank img{width:36px;height:36px;border-radius:9px}.eyc-bank i{width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:#5B3BD9}';
    (document.head || document.documentElement).appendChild(st);
  }
  function addButton() {
    var bar = document.querySelector('.bar'); if (!bar || bar.querySelector('.eyc-btn')) return;
    var b = document.createElement('button'); b.type = 'button'; b.className = 'eyc-btn';
    b.title = WS ? 'Энэ хувилбарын (кодын) тестийн зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ' : 'Энэ хувилбарын зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ';
    b.innerHTML = ICO.logo + 'ЭЕШ шалгагч';
    b.addEventListener('click', open);
    bar.appendChild(b);
  }

  /* ── Цонх ── */
  var S = { st: null, sel1: null, sel2: null, n: 1, title: '', titleEdited: false, busy: false, inv: null, invEmail: '', pollT: null, polls: 0, ready: null };
  var ov = null;
  function body() { return ov && ov.querySelector('[data-body]'); }
  function msg(cls, html) { var el = ov && ov.querySelector('[data-msg]'); if (el) { el.className = 'eyc-msg' + (cls ? ' ' + cls : ''); el.innerHTML = html; } }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function stopPoll() { if (S.pollT) { clearInterval(S.pollT); S.pollT = null; } }
  function close() { stopPoll(); S.inv = null; S.busy = false; if (ov) { ov.remove(); ov = null; } document.removeEventListener('keydown', onKey); }
  function open() {
    if (ov) return;
    css(); remember();
    ov = document.createElement('div'); ov.className = 'eyc-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'ЭЕШ шалгагч');
    ov.innerHTML = '<div class="eyc-card"><button type="button" class="eyc-x" aria-label="Хаах">' + ICO.x + '</button>'
      + '<div class="eyc-h"><i>' + ICO.logo + '</i>ЭЕШ шалгагч</div><div data-body></div></div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) close(); });
    ov.querySelector('.eyc-x').onclick = close;
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    if (!tok()) return drawLogin(false);
    S.n = 0;   // хувилбарын тоог шалгалт бүрт асууна (сонгох хүртэл үүсгэхгүй)
    drawCompose();
    loadStatus();
  }
  function loadStatus() {
    S.st = null; drawAction();
    post('/api/eyesh?action=status', { wstoken: tok() }).then(function (x) {
      if (!ov) return;
      if (x.s === 401 || x.d.needLogin) return drawLogin(true);
      S.st = x.d.ok ? x.d : { err: x.d.error || 'Эрхийг шалгаж чадсангүй.' };
      drawAction();
    }).catch(function () { if (ov) { S.st = { err: 'Сүлжээний алдаа.' }; drawAction(); } });
  }
  function drawLogin(expired) {
    stopPoll();
    body().innerHTML = '<div class="eyc-sub">' + (expired ? 'Нэвтрэлтийн хугацаа дууссан байна. ' : '')
      + 'Энэ хувилбарын зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ. <b>Дасгалын төвийн бүртгэлээрээ</b> нэвтэрч ашиглана — '
      + 'eyeshcheck.com-д тусад нь бүртгүүлэх шаардлагагүй. Нэвтэрсний дараа энэ хуудас руу буцаж ирнэ.</div>'
      + '<button type="button" class="eyc-go" data-login>' + ICO.login + 'Нэвтрэх / Бүртгүүлэх</button>';
    body().querySelector('[data-login]').onclick = function () {
      lsSet(RESUME, JSON.stringify({ p: location.pathname, u: location.pathname + location.search, t: Date.now() }));
      location.href = '/worksheets.html?login=1&next=' + encodeURIComponent(location.pathname);
    };
  }
  function optHtml(name, list, sel) {
    return list.map(function (x) {
      var dis = !!x.bad, lab = x.o ? vtxt(x.o) : 'Оруулахгүй';
      return '<label class="eyc-opt' + (dis ? ' dis' : '') + '"><input type="radio" name="' + name + '" value="' + x.id + '"'
        + (x.id === sel ? ' checked' : '') + (dis ? ' disabled' : '') + '><span>' + esc(lab) + '<small>' + esc(x.nv ? S.n + ' хувилбар бэлэн биш' : x.hint) + '</small></span></label>';
    }).join('');
  }
  function pick(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id && !list[i].bad) return list[i]; return null; }
  function autoTitle(a, b) {
    var nv = S.n > 1 ? ' · ' + S.n + ' хувилбар' : '';
    if (BOTH) return 'ЭЕШ ' + YEAR + ' · ' + vshort(a.o) + (b && b.o ? '' : ' · Сонгох') + nv;
    return 'ЭЕШ ' + YEAR + ' · Сонгох ' + vshort(a.o) + (b && b.o ? ' · Нөхөх ' + vshort(b.o) : '') + nv;
  }
  // «Хэдэн хувилбартай шалгалт үүсгэх вэ?» (1–6, шалгалт бүрт асууна) ба жагсаалт. rows: [[үсэг, тайлбар, тайлбар2], …];
  // foot: тэмдэглэл + хэвлэх товч (n > 1 үед)
  function nSecHtml(rows, foot) {
    var h = '<div class="eyc-sec eyc-q' + (S.n ? '' : ' need') + '"><div class="eyc-st">Хэдэн хувилбартай шалгалт үүсгэх вэ?</div>'
      + '<div class="eyc-seg" role="radiogroup" aria-label="Хувилбарын тоо">';
    for (var i = 1; i <= NMAX; i++) h += '<button type="button" role="radio" aria-checked="' + (i === S.n) + '" data-n="' + i + '"' + (i === S.n ? ' class="on"' : '') + '>' + i + '</button>';
    h += '</div>';
    if (!S.n) return h + '<div class="eyc-note">1 — бүх сурагч нэг хувилбар. 2–6 — хувилбар бүр өөр бодлоготой нэг шалгалт; сурагч хариултын хуудасны «ХУВИЛБАР»-ыг будна.</div></div>';
    if (S.n === 1) return h + '<div class="eyc-note">Бүх сурагч нэг хувилбар.</div></div>';
    if (rows) h += '<div class="eyc-vl">' + rows.map(function (r) { return '<div><i>' + esc(r[0]) + '</i><span>' + esc(r[1]) + (r[2] ? ' <small>' + esc(r[2]) + '</small>' : '') + '</span></div>'; }).join('') + '</div>';
    return h + (foot || '') + '</div>';
  }
  function bindN(redraw) {
    [].forEach.call(body().querySelectorAll('.eyc-seg button'), function (b) {
      b.onclick = function () {
        var n = +b.getAttribute('data-n'); if (n === S.n) return;
        S.n = n; lsSet(NKEY, String(n));
        if (n > 1) remember();   // нөгөө хэсгийн хуудсанд энэ хэсгийн B… хувилбарыг бэлдэнэ
        redraw();
      };
    });
  }
  function wsCur() { try { return window.CM_EXAM(S.n || 1); } catch (e) { return null; } }
  function drawComposeWs() {
    var e = wsCur(), sig = e ? e.seed + '/' + S.n : '';
    if (!S.titleEdited || S.wsSig !== sig) { S.title = e ? e.title : ''; S.titleEdited = false; }
    S.wsSig = sig;
    var seeds = e ? [e.seed].concat((e.variants || []).map(function (v) { return v.seed; })) : [];
    var canPrint = !!(window.CMX && typeof window.CMX.printSet === 'function');
    var h = '<div class="eyc-sub">Энэ хувилбарын тестийн зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ. Сурагчдын хариултын хуудсыг утсаараа уншуулж дүгнэнэ.</div>'
      + nSecHtml(e ? seeds.map(function (s, i) { return [(e.letters || [])[i] || VL[i], 'код ' + s, i ? '' : 'энэ хуудас']; }) : null,
          '<div class="eyc-note">Багцыг доорх товчоор (эсвэл хуудасны «Олон хувилбар»-аар ижил тоогоор) хэвлэнэ: хариултын хуудас бүрт ХУВИЛБАР урьдчилан будагдсан, '
          + 'шалгалтын код нь бүгдэд нэг. eyeshcheck-д А, Б, В… нь A, B, C… гэж харагдана.</div>'
          + (canPrint && e ? '<div class="eyc-pr"><button type="button" class="eyc-go sec" data-print>' + ICO.prt + S.n + ' хувилбарыг хэвлэх</button></div>' : ''))
      + '<div class="eyc-sec"><div class="eyc-st">1-р хэсэг · Сонгох даалгавар' + (e ? ' (' + e.n + ')' : '') + '</div>'
      + (e ? '<div class="eyc-opt" style="cursor:default"><span>Хувилбарын код <b style="font-family:ui-monospace,Consolas,monospace;letter-spacing:.06em">' + esc(e.seed) + '</b><small>энэ хуудас</small></span></div>'
           + '<div class="eyc-note">Хэвлэсэн хувилбарынхаа кодтой таарч байгааг шалгана уу. Өөр хувилбарынх бол хуудасны «Код» талбарт кодыг оруулаад (Enter) энэ товчийг дахин дарна.</div>'
         : '<div class="eyc-note">Энэ хувилбарын зарим бодлого үүсээгүй байна. «Шинэ хувилбар» дарж дахин оролдоно уу.</div>')
      + '</div>'
      + '<div class="eyc-sec"><div class="eyc-st">2-р хэсэг · Задгай даалгавар</div><div class="eyc-note" style="margin-top:2px">Хариултын хуудасны ар талд бодно — багш гараар дүгнэж, хуудсан дээрх хүснэгтэд оноог бичнэ.</div></div>'
      + '<label class="eyc-lbl" for="eyc-ti">Шалгалтын нэр</label><input class="eyc-ti" id="eyc-ti" maxlength="120">'
      + '<div data-act></div>';
    body().innerHTML = h;
    S.sel1 = e ? 'cur' : null;
    var ti = body().querySelector('#eyc-ti');
    ti.value = S.title;
    ti.oninput = function () { S.title = ti.value; S.titleEdited = !!ti.value.trim(); };
    bindN(drawComposeWs);
    var pb = body().querySelector('[data-print]');
    if (pb) pb.onclick = function () { try { window.CMX.printSet(S.n); } catch (er) { msg('err', 'Хэвлэж чадсангүй.'); } };
    drawAction();
  }
  function drawCompose() {
    if (WS) return drawComposeWs();
    var src = sources(), s1 = src.s1, s2 = src.s2, n = S.n;
    // Олон хувилбарт: B… хувилбар нь бэлэн биш сонголтыг (нөгөө хэсгийн хуудсыг энэ тоогоор нээгээгүй, эх хүснэгт) идэвхгүй болгоно
    if (n > 1) {
      s1.forEach(function (x) { if (!x.bad && !varsOf(1, x, n)) x.bad = x.nv = true; });
      s2.forEach(function (x) { if (x.o && !x.bad && !varsOf(2, x, n)) x.bad = x.nv = true; });
    }
    var ok1 = s1.filter(function (x) { return !x.bad; });
    if (!pick(s1, S.sel1)) S.sel1 = ok1.length ? ok1[0].id : null;
    // 2-р хэсгийн анхдагч: энэ хуудас / сүүлд нээсэн хувилбар (багтвал). Тэр нь a–h-д багтахгүй эсвэл огт нээгээгүй бол
    // «Оруулахгүй» — эхийг автоматаар сонговол багшийн хэвлэсэнтэй өөр түлхүүрээр дүгнэх эрсдэлтэй (эхийг өөрөө сонгоно)
    if (!pick(s2, S.sel2)) { var own = s2.filter(function (x) { return x.id === 'cur' || x.id === 'mem'; })[0]; S.sel2 = own && !own.bad ? own.id : 'none'; }
    var bad2 = s2.filter(function (x) { return x.bad && !x.nv; })[0];
    var nv1 = s1.some(function (x) { return x.nv; }), nv2 = s2.some(function (x) { return x.nv; });
    var other = PAGES[3 - PART], otherN = PART === 1 ? 2 : 1;
    var nvNote = function () {
      return '<div class="eyc-note">' + otherN + '-р хэсгийн ' + n + ' хувилбарыг бэлдэхийн тулд энэ төхөөрөмж дээр ' + otherN + '-р хэсгийн хуудсыг нээнэ үү '
        + '(тэнд хувилбаруудаа хэвлэнэ). <a href="' + other + '">' + otherN + '-р хэсэг рүү</a></div>';
    };
    var h = '<div class="eyc-sub">Энэ хувилбарын зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ. Сурагчдын хариултын хуудсыг утсаараа уншуулж дүгнэнэ. '
      + 'Шалгалтын материал (хувилбаруудын хуудас, хариу) eyeshcheck-ийн «ЭЕШ материал»-д хадгалагдана.</div>'
      + nSecHtml(variantRows(), printFoot())
      + '<div class="eyc-sec"><div class="eyc-st">1-р хэсэг · Сонгох даалгавар (36)</div>'
      + (s1.length ? optHtml('eyc1', s1, S.sel1)
         : PART === 1 ? '<div class="eyc-note">Энэ хувилбарын зарим бодлого үүсээгүй байна. «Шинэ хувилбар» дарж дахин оролдоно уу.</div>'
         : '<div class="eyc-note">1-р хэсгийн хуудсыг нээж хувилбараа гаргаад энэ товчийг дахин дарна уу. <a href="' + PAGES[1] + '">1-р хэсэг рүү</a></div>')
      + (nv1 && !BOTH && PART === 2 ? nvNote() : '')
      + '</div>'
      + '<div class="eyc-sec"><div class="eyc-st">2-р хэсэг · Нөхөх даалгавар (2.1–2.4)</div>' + optHtml('eyc2', s2, S.sel2)
      + (bad2 ? '<div class="eyc-note">' + esc(vtxt(bad2.o)) + '-ийн хариу олон оронтой тул ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтахгүй. '
              + (BOTH ? 'Хуудсан дээрх «Шинэ хувилбар» эсвэл «Эх хувилбар» товчоор өөр хувилбар гаргах эсвэл 2-р хэсгийг оруулахгүй байж болно.'
                 : PART === 2 && ORIG[YEAR] && ORIG[YEAR][2] ? 'Хуудсан дээрх «Эх хувилбар» товчоор эх даалгаврыг гаргаж хэвлээд энд эхийг нь сонгоно уу.'
                 : 'Эх хувилбарыг сонгох эсвэл 2-р хэсгийг оруулахгүй байж болно.') + '</div>' : '')
      + (nv2 && !BOTH && PART === 1 ? nvNote() : '')
      + '</div>'
      + '<label class="eyc-lbl" for="eyc-ti">Шалгалтын нэр</label><input class="eyc-ti" id="eyc-ti" maxlength="120">'
      + '<div data-act></div>';
    body().innerHTML = h;
    var ti = body().querySelector('#eyc-ti');
    function syncTitle() {
      var a = pick(s1, S.sel1), b = pick(s2, S.sel2);
      if (!S.titleEdited) S.title = a ? autoTitle(a, b) : '';
      ti.value = S.title;
    }
    ti.oninput = function () { S.title = ti.value; S.titleEdited = !!ti.value.trim(); };
    [].forEach.call(body().querySelectorAll('input[type=radio]'), function (r) {
      r.onchange = function () { if (r.name === 'eyc1') S.sel1 = r.value; else S.sel2 = r.value; if (S.n > 1) drawCompose(); else { syncTitle(); drawAction(); } };
    });
    bindN(drawCompose);
    var pb = body().querySelector('[data-print]');
    if (pb) pb.onclick = function () { var c = body().querySelector('#eyc-cp'); printVariants(c ? parseInt(c.value, 10) : S.n); };
    syncTitle();
    drawAction();
  }
  // Сонгосон хувилбаруудын жагсаалт: [['A', 'Сонгох №4821·f3 · Нөхөх Эх'], …]
  function variantRows() {
    if (S.n < 2) return null;
    var src = sources(), a = pick(src.s1, S.sel1), b = pick(src.s2, S.sel2);
    var A1 = a ? varsOf(1, a, S.n) : null, A2 = b && b.o ? varsOf(2, b, S.n) : null;
    if (!A1) return null;
    var lab = function (o) { return o.v === 'orig' ? 'Эх' : '№' + o.v + (o.g ? '·' + o.g : ''); };
    return A1.map(function (o, i) {
      return [VL[i], BOTH ? lab(o) : 'Сонгох ' + lab(o) + (A2 ? ' · Нөхөх ' + lab(A2[i]) : ''), i ? '' : 'сонгосон хувилбар'];
    });
  }
  // Хэвлэх хэсэг (n > 1): энэ хуудасны хэсэг(үүд)-ийн хувилбаруудыг «ХУВИЛБАР A/B…» тэмдэгтэй хэвлэнэ
  function printFoot() {
    var part = BOTH ? '' : (PART === 1 ? '1-р хэсгийн' : '2-р хэсгийн') + ' ';
    return '<div class="eyc-note">Сурагч хариултын хуудасны «ХУВИЛБАР» хэсэгт өөрийн хувилбарын үсгийг будна — eyeshcheck тэр хувилбарын түлхүүрээр дүгнэнэ. '
      + 'Хувилбар бүрийн хуудсан дээр «ХУВИЛБАР A/B…» хэвлэгдэнэ' + (BOTH ? '' : '; ' + (PART === 1 ? '2' : '1') + '-р хэсгийн хувилбаруудыг тэр хуудаснаас хэвлэнэ') + '.</div>'
      + '<div class="eyc-pr"><label for="eyc-cp">Хувь</label><input type="number" id="eyc-cp" min="1" max="80" value="' + S.n + '" title="Хэвлэх хуудасны тоо — хувилбарууд ээлжилнэ (A, B, C…)">'
      + '<button type="button" class="eyc-go sec" data-print>' + ICO.prt + (part ? part + 'хувилбаруудыг' : 'Хувилбаруудыг') + ' хэвлэх</button></div>';
  }
  function drawAction() {
    var a = ov && ov.querySelector('[data-act]'); if (!a) return;
    if (!S.st) { a.innerHTML = '<div class="eyc-msg" data-msg>Эрхийг шалгаж байна…</div>'; return; }
    if (S.st.err) {
      a.innerHTML = '<div class="eyc-msg err" data-msg>' + esc(S.st.err) + '</div><button type="button" class="eyc-link" data-retry>Дахин оролдох</button>';
      a.querySelector('[data-retry]').onclick = loadStatus;
      return;
    }
    var canGo = !!buildExam();
    if (S.st.active) {
      a.innerHTML = '<button type="button" class="eyc-go" data-go' + (canGo ? '' : ' disabled') + '>' + ICO.ext + 'eyeshcheck-д шалгалт үүсгэх</button>'
        + '<div class="eyc-msg" data-msg>' + (S.n ? 'ЭЕШ шалгагчийн эрх <b>' + esc(ymd(S.st.expiry)) + '</b> хүртэл.' : 'Дээрээс хувилбарын тоог сонгоно уу.') + '</div>';
      a.querySelector('[data-go]').onclick = go;
      return;
    }
    a.innerHTML = '<div class="eyc-buy"><div class="eyc-price">1 сар — ' + fmt(S.st.price || 9900) + '₮</div><ul>'
      + '<li>Сарын турш шалгалт хязгааргүй үүсгэнэ</li>'
      + '<li>Сурагчдын хариултын хуудсыг утсаараа уншуулж шууд дүгнэнэ</li>'
      + '<li>Дүн, сэдвээрх тайлан, Excel</li></ul></div>'
      + '<button type="button" class="eyc-go" data-pay>' + ICO.qr + 'QPay-аар төлөх</button>'
      + '<div class="eyc-msg" data-msg></div>'
      + '<div class="eyc-alt">eyeshcheck.com-д эрх нь идэвхтэй багш уу? <button type="button" class="eyc-link" data-free' + (canGo ? '' : ' disabled') + '>Шууд нэвтрэх</button></div>';
    a.querySelector('[data-pay]').onclick = pay;
    a.querySelector('[data-free]').onclick = go;
  }
  function buildExam() {
    if (!S.n) return null;   // хувилбарын тоог сонгоогүй
    if (WS) {
      var e = wsCur(); if (!e) return null;
      var o = { kind: 'ws', slug: e.slug, seed: e.seed, key: e.key, scores: e.scores, topics: e.topics, title: (S.title || '').trim() || e.title };
      if (S.n > 1) { if (!e.variants) return null; o.variants = e.variants; }
      return o;
    }
    return eeshExam();
  }

  /* ── Хувилбаруудыг хувилах (ЭЕШ): энэ хуудасны хэсэг(үүд)-ийг A, B… хувилбараар build() хийж «ХУВИЛБАР A» тэмдэгтэй хуулна ──
     cb(plan, html[], restore) — restore() хуудсыг өмнөх хувилбарт нь буцаана. plan: { n, seeds, K1, K2 } эсвэл алдаа бол cb дуудахгүй. */
  function planOf() {
    var n = S.n, src = sources(), a = pick(src.s1, S.sel1), b = pick(src.s2, S.sel2);
    var mine = BOTH || PART === 1 ? a : b;
    if (!n || !mine || !mine.o) return null;
    // түлхүүрт: хоёр хэсгийн хувилбарууд (тусдаа хуудастай онд нөгөө хэсгийнх — бэлдсэн бол)
    return { n: n, a: a, b: b, mine: mine, seeds: dseeds(mine.o.v, n), K1: a ? varsOf(1, a, n) : null, K2: b && b.o ? varsOf(2, b, n) : null };
  }
  function capture(plan, cb) {
    var sheet = document.getElementById('sheet');
    if (!sheet || typeof window.build !== 'function' || PRINTING) return false;
    var st0 = stNow(BOTH ? 1 : PART), keep = st0 ? st0.seed : null, n = plan.n, html = [], i = 0;
    var sa = document.getElementById('sa'), saOn = !!(sa && sa.checked);
    if (saOn) { sa.checked = false; try { if (typeof window.toggleAns === 'function') window.toggleAns(); } catch (e) {} }   // сурагчийн хувьд хариугүй
    PRINTING = true;
    var restore = function () {
      PRINTING = false;
      if (keep != null) { try { window.build(keep); } catch (e) {} }
      if (saOn && sa) { sa.checked = true; try { if (typeof window.toggleAns === 'function') window.toggleAns(); } catch (e) {} }
      remember();
    };
    (function step() {
      if (i >= n) return cb(html, restore);
      try { window.build(plan.seeds[i]); } catch (e) {}
      // ws-store #sheet-ийг MutationObserver-ээр (тамга, нэр/огноо талбар) тэмдэглэсний дараа хуулна
      setTimeout(function () {
        if (n > 1) {
          var badge = '<div class="eyc-vb">ХУВИЛБАР <b>' + VL[i] + '</b><span>Хариултын хуудасны «ХУВИЛБАР» хэсэгт <b>' + VL[i] + '</b>-г будна уу</span></div>';
          var hd = sheet.querySelector('.head');
          if (hd) hd.insertAdjacentHTML('afterbegin', badge); else sheet.insertAdjacentHTML('afterbegin', badge);
        }
        html.push(sheet.innerHTML);
        i++; step();
      }, 0);
    })();
    return true;
  }
  /* copies — нийт хуудас (хувилбарууд ээлжилнэ); төгсгөлд нь бүх хувилбарын түлхүүр. Хэвлэсний дараа хуудас өмнөх хувилбартаа буцна.
     Хувилсан хуудсыг материал болгож санана (тусдаа хуудастай онд нөгөө хэсгийн хуудаснаас шалгалт үүсгэхэд хамт илгээнэ). */
  function printVariants(copies) {
    var plan = planOf();
    if (!plan) return msg('err', !S.n ? 'Хувилбарын тоог сонгоно уу.' : BOTH || PART === 1 ? '1-р хэсгийн хувилбар сонгоогүй байна.' : '2-р хэсгийг «Оруулахгүй» гэж сонгосон тул энэ хуудаснаас хэвлэх зүйлгүй.');
    var n = plan.n, cp = Math.max(1, Math.min(80, copies || n));
    msg('', 'Хувилбаруудыг бэлдэж байна…');
    capture(plan, function (html, restore) {
      var box = document.createElement('div'); box.id = 'eyc-batch';
      var cls = 'sheet eyc-bs' + (window.WS_PAGED ? ' ' + window.WS_PAGED : '');
      for (var c = 0; c < cp; c++) { var d = document.createElement('div'); d.className = cls; d.innerHTML = html[c % n]; box.appendChild(d); }
      var k = document.createElement('div'); k.className = cls; k.innerHTML = keyHtml(plan.K1, plan.K2, cp); box.appendChild(k);
      document.body.appendChild(box);
      saveDoc(plan, html);
      var pcss = document.createElement('style'); pcss.id = 'eyc-pcss';
      pcss.textContent = '@media print{body>*:not(#eyc-batch){display:none!important}#eyc-batch{display:block!important}'
        + '.eyc-bs{break-after:page;page-break-after:always;box-shadow:none!important;width:auto!important;min-height:auto!important;margin:0!important;padding:0!important;background:#fff}'
        + '.eyc-bs:last-child{break-after:auto;page-break-after:auto}}';
      document.head.appendChild(pcss);
      var done = function () {
        window.removeEventListener('afterprint', done);
        box.remove(); pcss.remove(); restore();
        if (ov && !S.inv) drawCompose();
      };
      window.addEventListener('afterprint', done);
      msg('', '');
      setTimeout(function () { window.print(); }, 120);
    });
  }

  /* ── Шалгалтын материал → eyeshcheck «ЭЕШ материал» (шалгалттай нь, сурагчид харахгүй) ──
     material = gzip+base64( { v:1, year, docs:[doc…] } ); doc = { part (0 — хоёр хэсэг, 1, 2), title, n, cls, css, sheets:[{L, label, html}], key }.
     Тусдаа хуудастай онд нөгөө хэсгийн doc-ыг тэр хуудас хувилбаруудаа хэвлэх/шалгалт үүсгэхэд localStorage-д санана. */
  var MAT_MAX = 3000000;
  function b64(u8) { var s = '', CH = 0x8000; for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH)); return btoa(s); }
  function gzip64(str) {
    if (typeof CompressionStream !== 'function' || typeof Response !== 'function') return Promise.resolve(null);
    try {
      return new Response(new Blob([str]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer()
        .then(function (buf) { return b64(new Uint8Array(buf)); }).catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  function gunzip64(s) {
    if (typeof DecompressionStream !== 'function' || !s) return Promise.resolve(null);
    try {
      var bin = atob(s), u = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      return new Response(new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'))).text().catch(function () { return null; });
    } catch (e) { return Promise.resolve(null); }
  }
  // KaTeX-ийн MathML (давхар) ба скриптийг хасна — материал жижиг
  function slim(h) {
    var d = document.createElement('div'); d.innerHTML = h;
    [].forEach.call(d.querySelectorAll('.katex-mathml,script'), function (x) { x.remove(); });
    [].forEach.call(d.querySelectorAll('[contenteditable]'), function (x) { x.removeAttribute('contenteditable'); });
    return d.innerHTML;
  }
  function labOf(o) { return o.v === 'orig' ? 'Эх' : '№' + o.v + (o.g ? '·' + o.g : ''); }
  function sigOf(o, n) { return o.v + '|' + n + '|' + (o.g || ''); }
  function docOf(plan, html) {
    var part = BOTH ? 0 : PART, list = (part === 2 ? plan.K2 : plan.K1) || [];
    var sheets = html.map(function (h, i) { return { L: VL[i], label: list[i] ? labOf(list[i]) : '', html: slim(h) }; });
    var head = 'ЭЕШ ' + YEAR + (part ? ' · ' + part + '-р хэсэг (' + (part === 1 ? 'сонгох' : 'нөхөх') + ')' : '') + ' · ' + labOf(plan.mine.o);
    return {
      part: part, n: plan.n, title: head + (plan.n > 1 ? ' · ' + plan.n + ' хувилбар' : ''), cls: String(window.WS_PAGED || ''),
      css: [].map.call(document.querySelectorAll('style'), function (s) { return s.id === 'eyc-pcss' ? '' : s.textContent; }).join('\n'),
      sheets: sheets, key: keyHtml(part === 2 ? null : plan.K1, part === 1 ? null : plan.K2, 0)
    };
  }
  function docKey(p) { return 'cm_eesh_' + YEAR + '_mat' + p; }
  function saveDoc(plan, html) {   // тусдаа хуудастай онд нөгөө хэсгийн хуудсанд
    if (BOTH) return;
    var doc = docOf(plan, html);
    gzip64(JSON.stringify(doc)).then(function (gz) { if (gz && gz.length < MAT_MAX / 2) lsSet(docKey(PART), JSON.stringify({ sig: sigOf(plan.mine.o, plan.n), gz: gz })); });
  }
  // Энэ хуудасны хэсгийн материалыг хувилж + нөгөө хэсгийн санасныг (тохирвол) нийлүүлнэ → Promise<material|null>
  function materialFor() {
    return new Promise(function (resolve) {
      var plan = planOf(), docs = [];
      var other = function () {
        if (BOTH) return Promise.resolve(null);
        var sel = planOf0(), x = PART === 1 ? sel.b : sel.a, saved = null;
        if (!x || !x.o) return Promise.resolve(null);
        try { saved = JSON.parse(lsGet(docKey(3 - PART)) || 'null'); } catch (e) { saved = null; }
        if (!saved || saved.sig !== sigOf(x.o, S.n)) return Promise.resolve(null);
        return gunzip64(saved.gz).then(function (t) { try { return t ? JSON.parse(t) : null; } catch (e) { return null; } });
      };
      var finish = function () {
        other().then(function (od) {
          if (od) docs.push(od);
          docs.sort(function (p, q) { return p.part - q.part; });
          if (!docs.length) return resolve(null);
          return gzip64(JSON.stringify({ v: 1, year: YEAR, docs: docs })).then(function (gz) { resolve(gz && gz.length <= MAT_MAX ? gz : null); });
        }).catch(function () { resolve(null); });
      };
      if (!plan || !capture(plan, function (html, restore) {
        restore();
        docs.push(docOf(plan, html));
        if (!BOTH) saveDoc(plan, html);
        finish();
      })) finish();
    });
  }
  // planOf()-ийн сонголтууд (энэ хуудасны хэсэг «Оруулахгүй» байсан ч)
  function planOf0() { var src = sources(); return { a: pick(src.s1, S.sel1), b: pick(src.s2, S.sel2) }; }
  // Түлхүүрийн хуудас: хувилбар бүрийн 1-р хэсгийн үсэг, 2-р хэсгийн нүд (cp — хэвлэсэн хуудасны тоо, 0 — материалд)
  function keyHtml(K1, K2, cp) {
    var n = S.n, cells = function (ans) { return Object.keys(ans || {}).map(function (k) { return k + '=' + ans[k]; }).join(' '); };
    var lab = function (o) { return o.v === 'orig' ? 'Эх' : '№' + o.v + (o.g ? '·' + o.g : ''); };
    var rows = '';
    for (var i = 0; i < n; i++) {
      var o1 = K1 && K1[i], o2 = K2 && K2[i];
      rows += '<tr><td class="L">' + VL[i] + '</td><td>' + (o1 ? esc(lab(o1)) : '') + (o2 && (!BOTH || !o1) ? (o1 ? '<br>Нөхөх ' : '') + esc(lab(o2)) : '') + '</td>'
        + (K1 ? '<td class="k">' + (o1 ? esc(String(o1.key).replace(/(.{5})(?=.)/g, '$1 ')) : '—') + '</td>' : '')
        + (K2 ? '<td>' + (o2 ? o2.items.map(function (it, k) { return '<div><b>2.' + (k + 1) + '</b> ' + esc(cells(it.ans)) + '</div>'; }).join('') : '—') + '</td>' : '') + '</tr>';
    }
    return '<div class="head"><h1>Хариуны түлхүүр — ЭЕШ ' + YEAR + (n > 1 ? ' · ' + n + ' хувилбар' : '') + '</h1>'
      + '<div style="font-size:11px;color:#5b5675;margin-top:3px">' + (cp ? cp + ' хуудас хэвлэв. ' : '')
      + (n > 1 ? 'eyeshcheck сурагч бүрийн хуудсыг будсан «ХУВИЛБАР»-аар нь дүгнэнэ.' : '') + '</div></div>'
      + '<table class="eyc-kt"><thead><tr><th></th><th>Хувилбар</th>' + (K1 ? '<th>1-р хэсэг (1–36)</th>' : '') + (K2 ? '<th>2-р хэсэг</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>';
  }
  // Шинэ табд POST хийнэ (кодыг URL-д оруулахгүй — түүх, лог-д үлдэхгүй)
  function submit(url, code, target) {
    var f = document.createElement('form'); f.method = 'POST'; f.action = url; f.target = target; f.style.display = 'none';
    var i = document.createElement('input'); i.type = 'hidden'; i.name = 'code'; i.value = code; f.appendChild(i);
    document.body.appendChild(f); f.submit(); setTimeout(function () { f.remove(); }, 1500);
  }
  var WAIT = '<!doctype html><meta charset="utf-8"><title>ЭЕШ шалгагч</title><body style="margin:0;display:grid;place-items:center;height:90vh;'
    + 'font:700 16px/1.5 system-ui,sans-serif;color:#5B3BD9">eyeshcheck.com нээж байна…</body>';
  function go() {
    var ex = buildExam();
    if (!ex) return msg('err', !S.n ? 'Хувилбарын тоог сонгоно уу.' : S.n > 1 ? 'Сонгосон хэсгүүдийн ' + S.n + ' хувилбар бэлэн биш байна.' : '1-р хэсгийн хувилбар сонгоогүй байна.');
    if (S.busy) return;
    S.busy = true;
    var w = null;
    try { w = window.open('', 'eyeshcheck'); } catch (e) { w = null; }
    if (w) { try { w.document.open(); w.document.write(WAIT); w.document.close(); } catch (e) {} }
    msg('', WS ? 'Шалгалт үүсгэж байна…' : 'Шалгалтын материалыг бэлдэж байна…');
    (WS ? Promise.resolve(null) : materialFor()).then(function (mat) {
      msg('', 'Шалгалт үүсгэж байна…');
      var body = { wstoken: tok(), exam: ex };
      if (mat) body.material = mat;
      return post('/api/eyesh?action=handoff', body);
    }).then(function (x) {
      S.busy = false;
      var d = x.d;
      if (x.s === 401 || d.needLogin) { if (w) w.close(); return drawLogin(true); }
      if (!d.ok || !d.code || !SSO_RE.test(String(d.url || ''))) { if (w) w.close(); return msg('err', esc(d.error || 'Алдаа гарлаа. Дахин оролдоно уу.')); }
      if (w && !w.closed) { submit(d.url, d.code, 'eyeshcheck'); return drawDone(null); }
      drawDone(d);   // шинэ таб хаагдсан — товч дарахад нээнэ (код 2 минут хүчинтэй)
    }).catch(function () { S.busy = false; if (w) w.close(); msg('err', 'Сүлжээний алдаа. Дахин оролдоно уу.'); });
  }
  function drawDone(pending) {
    var a = ov && ov.querySelector('[data-act]'); if (!a) return;
    if (pending) {
      a.innerHTML = '<button type="button" class="eyc-go" data-open>' + ICO.ext + 'eyeshcheck.com-г нээх</button>'
        + '<div class="eyc-msg" data-msg>Хөтөч шинэ табыг хаасан байна. Дээрх товчийг дарна уу.</div>';
      a.querySelector('[data-open]').onclick = function () { submit(pending.url, pending.code, '_blank'); drawDone(null); };
      return;
    }
    a.innerHTML = '<div class="eyc-msg ok" data-msg>' + ICO.ok + ' eyeshcheck.com шинэ табд нээгдлээ — шалгалт тэнд үүсч байна.</div>'
      + '<button type="button" class="eyc-go sec" data-again style="margin-top:10px">' + ICO.ext + 'Дахин нээх</button>';
    a.querySelector('[data-again]').onclick = function () { drawAction(); go(); };
  }

  /* ── QPay ── */
  function bankItem(u) {
    if (!u || typeof u !== 'object') return '';
    var link = String(u.link || u.url || ''); if (!link || /^\s*(javascript|data|vbscript):/i.test(link)) return '';
    var name = String(u.name || u.description || 'Банк'), logo = String(u.logo || ''), okLogo = /^https:\/\//i.test(logo);
    return '<a class="eyc-bank" href="' + esc(link) + '">' + (okLogo ? '<img alt="" src="' + esc(logo) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' : '')
      + '<i' + (okLogo ? ' style="display:none"' : '') + '>' + ICO.bank + '</i><span>' + esc(name) + '</span></a>';
  }
  function pay() {
    if (S.busy) return;
    S.busy = true; msg('', 'Нэхэмжлэх үүсгэж байна…');
    post('/api/qpay?action=create', { plan: 'eyesh', wstoken: tok() }).then(function (x) {
      S.busy = false;
      var d = x.d;
      if (x.s === 401 || d.needLogin) return drawLogin(true);
      if (!d.ok || !d.invoice || !d.invoice.invoice_id) return msg('err', esc(d.error || 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.'));
      S.inv = d.invoice; S.invEmail = String(d.email || '').toLowerCase();
      drawInvoice(d.amount);
    }).catch(function () { S.busy = false; msg('err', 'Сүлжээний алдаа. Дахин оролдоно уу.'); });
  }
  function drawInvoice(amount) {
    var inv = S.inv, img = typeof inv.qr_image === 'string' ? inv.qr_image.replace(/\s+/g, '') : '';
    var h = '<div class="eyc-sub">ЭЕШ шалгагч · 1 сар — <b>' + fmt(amount || (S.st && S.st.price) || 9900) + '₮</b>. Төлбөр баталгаажмагц шалгалтаа үүсгэнэ.</div>'
      + '<div class="eyc-qr"><div class="cap">QPay эсвэл банкны аппаар уншуулж төлнө үү</div>';
    if (img && /^[A-Za-z0-9+\/=]+$/.test(img)) h += '<img class="q" alt="QPay QR" src="data:image/png;base64,' + img + '">';
    if (typeof inv.qPay_shortUrl === 'string' && /^https:\/\//i.test(inv.qPay_shortUrl))
      h += '<div><a class="eyc-short" href="' + esc(inv.qPay_shortUrl) + '" target="_blank" rel="noopener">' + ICO.phone + 'Утаснаас төлөх</a></div>';
    var banks = (Array.isArray(inv.urls) ? inv.urls : []).map(bankItem).join('');
    if (banks) h += '<div class="eyc-banks">' + banks + '</div>';
    h += '</div><div class="eyc-msg" data-msg>Төлбөрийг хүлээж байна…</div>'
      + '<button type="button" class="eyc-go sec" data-back style="margin-top:10px">Буцах</button>';
    body().innerHTML = h;
    body().querySelector('[data-back]').onclick = function () { stopPoll(); S.inv = null; drawCompose(); };
    poll();
  }
  function poll() {
    stopPoll(); S.polls = 0;
    S.pollT = setInterval(function () {
      if (!ov || !S.inv) return stopPoll();
      if (++S.polls > POLL_MAX) {
        stopPoll();
        msg('err', 'Төлбөр баталгаажсангүй. Төлсөн бол «Дахин шалгах»-ыг дарна уу.');
        var b = document.createElement('button'); b.type = 'button'; b.className = 'eyc-link'; b.textContent = 'Дахин шалгах';
        b.onclick = function () { b.remove(); msg('', 'Төлбөрийг хүлээж байна…'); poll(); };
        var m0 = ov.querySelector('[data-msg]'); if (m0) m0.parentNode.insertBefore(b, m0.nextSibling);
        return;
      }
      post('/api/qpay?action=check', { invoice_id: S.inv.invoice_id, email: S.invEmail }).then(function (x) {
        var c = x.d;
        if (!c || c.paid !== true || !S.pollT) return;
        stopPoll(); S.inv = null;
        S.st = { ok: true, active: true, expiry: c.eyesh || null, price: S.st && S.st.price };
        drawCompose();
        if (!c.eyesh) loadStatus();
        else msg('ok', ICO.ok + ' Төлбөр баталгаажлаа! ЭЕШ шалгагчийн эрх ' + esc(ymd(c.eyesh)) + ' хүртэл.');
      }).catch(function () {});
    }, POLL_MS);
  }

  /* ── Эхлүүлэх ── */
  function hookBuild() {
    var ob = window.build;
    if (typeof ob !== 'function' || ob.__eyc) return;
    var nb = function () { var r = ob.apply(this, arguments); try { remember(); if (WS && ov && !S.inv) drawCompose(); } catch (e) {} return r; };
    nb.__eyc = 1;
    window.build = nb;
  }
  // Нэвтрэхээр явсан бол буцаж ирэхэд (?v=… хувилбартай URL-ээ сэргээж) цонхыг үргэлжлүүлж нээнэ
  function resume() {
    var r = null;
    try { r = JSON.parse(lsGet(RESUME) || 'null'); } catch (e) { r = null; }
    if (!r || r.p !== location.pathname || !(Date.now() - r.t < 20 * 60 * 1000)) { if (r && r.p === location.pathname) lsDel(RESUME); return; }
    if (!tok()) return;
    if (r.u !== location.pathname + location.search && !r.n && /^\/[A-Za-z0-9._\-\/]*(\?[A-Za-z0-9=&._\-]*)?$/.test(r.u)) {
      r.n = 1; lsSet(RESUME, JSON.stringify(r)); location.replace(r.u); return;
    }
    lsDel(RESUME);
    setTimeout(open, 300);
  }
  function boot() {
    css(); addButton(); hookBuild(); remember(); resume();
  }
  window.EYESH = { open: open, remember: remember, exportCur: exportCur, fits: fits, partsOf: partsOf, ORIG: ORIG, buildExam: buildExam, sources: sources, ws: WS, both: BOTH,
    dseeds: dseeds, varsOf: varsOf, NMAX: NMAX,
    // тест: цонхны сонголт (n — хувилбарын тоо, sel1/sel2 — эх сурвалж), нөгөө хуудасны B… хувилбарыг шууд бэлдэх
    _set: function (o) { if (o.n) S.n = o.n; if ('sel1' in o) S.sel1 = o.sel1; if ('sel2' in o) S.sel2 = o.sel2; },
    _prepVars: function () { var c = exportCur(); if (c) prepVars(c.v, Date.now()); },
    _material: function () { return materialFor(); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
