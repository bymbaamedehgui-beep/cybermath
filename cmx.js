/* Бүлгийн «Жишиг даалгавар» ба «Шалгалтын материал» — нийтлэг хөдөлгүүр (6–8-р анги).
   CMX.exam   — I хэсэг: 10 сонголттой тест (А–Г) — сурагч ХАРИУЛТЫН ХУУДСАНД будна; II хэсэг: 5 задгай — хариултын хуудасны
                АР ТАЛД (2 талт хэвлэнэ). Тогтмол хуудсууд (@page margin 0, хуудас бүр өөрийн зайтай):
                [1 хариултын хуудас | 2 ар тал: задгай] [3 тест | 4 ар тал: ноорог (тест 2 хуудас бол 4 нь үргэлжлэл)].
                Цаас: A5 (анхдагч), «A4-т 2» (A4 хэвтээ хуудсанд ижил 2 A5 — хагалж хуваана, 2 талт хэвлэхэд ар тал нь таарна), A4.
                Хувилбар бүр 5 тэмдэгтэй КОДтой (?v=КОД) — ижил кодоос яг ижил бодлогууд гарна (хэвлээд дараа нь ч сэргээнэ).
                «ЭЕШ шалгагч» (eyesh-link.js ← window.CM_EXAM) тухайн кодын тестийн түлхүүртэй шалгалтыг eyeshcheck.com-д үүсгэнэ:
                тестийг утсаар уншуулж дүгнэнэ, задгайг багш гараар (ар талын хүснэгт).
   CMX.jishig — даалгавар → бодлогууд (2 багана, «Бодолтын зай»), нэг хуудсанд (A4 / A5) багтаана; «Хариу хавсаргах».
   Хариултын хуудас: eyeshcheck lib/omr.js-ийн байрлалыг (210×297 хүрээний мм) ЯГ давтана — уншигч 6 тэмдгээр (homography)
   байрлал тогтоодог тул A5-д жигд жижигрүүлж хэвлэхэд ч уншина (A5-д дугуйг томруулж зурна; уншигчийн дээж авах хүрээнээс гарахгүй).
   Шалгалтын код (tag) = examTag(wsRef(slug, код, түлхүүр)) — eyeshcheck ws:-шалгалтын tag-тай таарна (өөр хувилбарын хуудсыг илрүүлнэ).
   ws-store.js: window.WS_PAGED — хэвлэхэд нэг хуудсанд шахахгүй; WS_BATCH_KEEP — «Ангиар хэвлэх» хувилбарыг солихгүй.
   Туслах функцууд (rnd, makeMC …) хуудасны генераторт глобалаар, node-д module.exports-оор (tests/cmx.test.js). */
(function (root) {
  'use strict';
  /* ───────── туслах ───────── */
  var RNG = Math.random;
  function rnd(a, b) { return a + Math.floor(RNG() * (b - a + 1)); }
  function nz(a, b) { var v; do { v = rnd(a, b); } while (v === 0); return v; }
  function pick(a) { return a[rnd(0, a.length - 1)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = rnd(0, i), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) { var t = a % b; a = b; b = t; } return a || 1; }
  function lcm(a, b) { return Math.abs(a * b) / gcd(a, b); }
  // TeX бутархай (хураасан), сөрөг тэмдэг урдаа: fr(-6,4) → -\dfrac{3}{2}
  function fr(n, d) { if (d === 0) return null; var neg = (n < 0) !== (d < 0); n = Math.abs(n); d = Math.abs(d); var g = gcd(n, d); n /= g; d /= g; if (d === 1) return (neg && n ? '-' : '') + n; return (neg ? '-' : '') + '\\dfrac{' + n + '}{' + d + '}'; }
  function sgn(n) { return n < 0 ? '-' + (-n) : '+' + n; }            // +5 / -3 (залгахад)
  function par(n) { return n < 0 ? '(' + n + ')' : '' + n; }           // (-3) / 5
  function th(n) { var s = String(n); return Math.abs(n) >= 10000 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : s; }   // 12\,500 (TeX)
  // i/10^sc аравтын бутархай, сүүлийн тэгийг хасна: dFmt(125,2) → 1.25
  function dFmt(i, sc) { var neg = i < 0; i = Math.abs(Math.round(i)); var s = '' + i; while (s.length <= sc) s = '0' + s; var ip = s.slice(0, s.length - sc), fp = sc ? s.slice(s.length - sc) : ''; fp = fp.replace(/0+$/, ''); return (neg ? '-' : '') + ip + (fp ? '.' + fp : ''); }
  // Сонголттой тест: зөв хариу + төөрөгдүүлэгчид → 4 ялгаатай сонголт (хольсон); давхардвал/дутвал null (генератор дахин оролдоно)
  function C(t) { return { t: String(t) }; }
  function makeMC(cor, distr) {
    if (!cor || cor.t == null || cor.t === 'null' || cor.t === 'NaN') return null;
    var opts = [{ tex: cor.t, ok: true }], used = [cor.t];
    for (var i = 0; i < (distr || []).length && opts.length < 4; i++) {
      var d = distr[i]; if (!d || d.t == null || d.t === 'null' || d.t === 'NaN' || d.t === 'undefined') continue;
      if (used.indexOf(d.t) >= 0) continue;
      used.push(d.t); opts.push({ tex: d.t, ok: false });
    }
    if (opts.length < 4) return null;
    var sh = shuffle(opts), ci = -1; for (var k = 0; k < sh.length; k++) if (sh[k].ok) ci = k;
    return { opts: sh, correct: ci };
  }
  function gen(fn, guard) { for (var t = 0; t < 400; t++) { var g = null; try { g = fn(); } catch (e) { g = null; } if (g && (!guard || guard(g))) return g; } return null; }
  // ── код, ref, tag ──
  function fnv(s, h) { h = h >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function hex8(n) { return ('0000000' + (n >>> 0).toString(16)).slice(-8); }
  // eyeshcheck-ийн шалгалтын ref ('ws:' + 20 hex). api/_eyesh.js wsRef-тэй ЯГ ижил (tests/eyesh.test.js тулгана).
  function wsRef(slug, seed, key) { var s = slug + '|' + seed + '|' + key; return 'ws:' + (hex8(fnv(s, 2166136261)) + hex8(fnv(s, 0x9747b28c)) + hex8(fnv(s + '#', 2166136261))).slice(0, 20); }
  // eyeshcheck lib/omr.js examTag-тай ижил: id → 1..4095
  function examTag(id) { var h = 2166136261; id = String(id || ''); for (var i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 4095) + 1; }
  var SEED_ABC = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  function newSeed() { var s = ''; for (var i = 0; i < 5; i++) s += SEED_ABC.charAt(Math.floor(Math.random() * 32)); return s; }
  function okSeed(s) { return /^[2-9A-HJ-NP-Z]{5}$/.test(String(s || '')); }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // fn-ийг кодоор тогтмол санамсаргүй тоогоор ажиллуулна (Math.random-ийг ч түр орлуулна)
  function seeded(seed, fn) { var r0 = RNG, m0 = Math.random; RNG = mulberry(fnv('cmx:' + seed, 2166136261)); Math.random = RNG; try { return fn(); } finally { RNG = r0; Math.random = m0; } }
  var H = { rnd: rnd, nz: nz, pick: pick, shuffle: shuffle, gcd: gcd, lcm: lcm, fr: fr, sgn: sgn, par: par, th: th, dFmt: dFmt, C: C, makeMC: makeMC, gen: gen,
            fnv: fnv, wsRef: wsRef, examTag: examTag, newSeed: newSeed, okSeed: okSeed, seeded: seeded };
  if (typeof module !== 'undefined' && module.exports) { module.exports = H; return; }
  ['rnd', 'nz', 'pick', 'shuffle', 'gcd', 'lcm', 'fr', 'sgn', 'par', 'th', 'dFmt', 'C', 'makeMC', 'gen'].forEach(function (k) { if (!(k in root)) root[k] = H[k]; });

  var OL = ['А', 'Б', 'В', 'Г'], LAT = ['A', 'B', 'C', 'D'], VCYR = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];
  var MM = 96 / 25.4;
  // Цаас: w×h — хуудасны хэмжээ, m — зай (мм), page — @page size
  var PAPERS = { a5: { w: 148, h: 210, m: 8, page: 'A5' }, a5x2: { w: 148, h: 210, m: 8, page: 'A4 landscape', two: true }, a4: { w: 210, h: 297, m: 11, page: 'A4' } };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var inFrame = (function () { try { return window.top !== window; } catch (e) { return true; } })();
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var ICO = {
    ref: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    prt: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>',
    var: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:5px"><rect x="3" y="3" width="13" height="13" rx="2"/><path d="M8 21h11a2 2 0 0 0 2-2V8"/></svg>'
  };

  /* ───────── загвар ───────── */
  var CSS = [
    ':root{--purple:#7B52EE;--purple2:#A855F7;--ink:#1a1030;--soft:#7a7390}',
    '*{box-sizing:border-box;margin:0;padding:0}',
    "body{font-family:'Segoe UI',Arial,sans-serif;color:var(--ink);background:#eceaf3;padding:16px;line-height:1.45}",
    '.bar{max-width:820px;margin:0 auto 14px;display:flex;gap:10px;justify-content:center;align-items:center;flex-wrap:wrap}',
    '.btn{font-weight:800;border:0;cursor:pointer;border-radius:999px;padding:.6rem 1.3rem;font-size:.9rem;color:#fff;background:linear-gradient(135deg,var(--purple),var(--purple2));box-shadow:0 6px 16px -6px rgba(123,82,238,.6)}',
    '.btn:hover{filter:brightness(1.06)} .btn.refresh{background:linear-gradient(135deg,#16a34a,#22c55e)} .bar .btn.cmx-vbtn{background:linear-gradient(135deg,#0ea5e9,#2563eb)}',
    '.bar label{font-weight:700;color:var(--purple);display:flex;align-items:center;gap:6px;font-size:.88rem}',
    '.bar .cmx-codel input{width:78px;border:1.4px solid #d9cff5;border-radius:8px;padding:4px 7px;font:800 .9rem/1.2 ui-monospace,Consolas,monospace;letter-spacing:.08em;color:#4B2BBF;text-transform:uppercase;background:#fff}',
    '.bar .cmx-paperl select{border:1.4px solid #d9cff5;border-radius:8px;padding:4px 6px;font:800 .84rem/1.2 inherit;color:#4B2BBF;background:#fff;cursor:pointer}',
    /* дэлгэц дээр ч хэвлэхтэй ижил өргөн — хэмжилт хэвлэлттэй таарна */
    '.sheet{background:#fff;width:210mm;max-width:100%;min-height:297mm;margin:0 auto;padding:11mm;box-shadow:0 12px 44px -18px rgba(0,0,0,.35);font-size:11.5px}',
    '.sheet.cmx-js5{width:148mm;min-height:210mm;padding:8mm}',
    '.head{text-align:center;border-bottom:2.5px solid var(--purple);padding-bottom:7px;margin-bottom:7px}',
    '.head h1{font-size:18px;color:#5a32d6;font-weight:800}.head .sub{font-size:11px;color:var(--soft);margin-top:2px}',
    '.meta{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;font-size:11.5px;margin:8px 2px 10px;gap:4px 8px}.meta>span{border-bottom:1px dotted #b3a9cf;padding:0 22px 2px 4px}',
    '.score-top{font-weight:800;color:#5a32d6;white-space:nowrap}.cmx-cd{font-family:ui-monospace,Consolas,monospace;letter-spacing:.06em}',
    '.rule{font-size:11px;color:var(--soft);border-left:3px solid #d9cff5;border-radius:8px;padding:7px 12px;margin-bottom:10px;text-align:center}',
    '.task{font-weight:800;color:#5a32d6;font-size:12.5px;margin:9px 0 7px;border-left:4px solid var(--purple2);padding-left:9px}',
    '.t-item{break-inside:avoid;page-break-inside:avoid;margin-bottom:8px;overflow:hidden}',
    '.t-stem{font-size:12px;margin-bottom:3px}.t-stem .n,.free .n,.ql{font-weight:800;color:var(--purple);margin-right:5px}',
    '.t-fig{float:right;margin:0 0 4px 10px}',
    '.pt{float:right;color:var(--soft);font-size:11px;font-weight:700;white-space:nowrap;margin-left:10px;border:1px solid #e2daf5;border-radius:20px;padding:0 8px}',
    '.ptv{outline:none;cursor:text;font-weight:800;color:#5a32d6;display:inline-block;text-align:center;min-width:13px;border-bottom:1px dotted #b9a9ef}',
    '.opts{display:grid;grid-template-columns:repeat(4,1fr);gap:2px 10px;padding-left:20px;align-items:baseline}',
    '.opts.two{grid-template-columns:1fr 1fr;gap:3px 18px}.opt{font-size:12px}.opt .ol{font-weight:800;color:var(--soft);margin-right:4px}',
    '.free{break-inside:avoid;page-break-inside:avoid;margin-bottom:9px}.free .fs{font-size:12px;margin-bottom:4px}',
    '.frow{display:flex;gap:10px;align-items:stretch}.frow>.wk{flex:1;min-width:0}.ffig{flex:none;display:flex;align-items:center}',
    '.wk{border:1.1px solid #e2daf5;border-radius:7px;background:linear-gradient(#fff,#fbf9ff);margin-top:4px}',
    '.grade{break-inside:avoid;page-break-inside:avoid;margin-top:8px;border:1.5px solid #d9cff5;border-radius:9px;padding:8px 11px}',
    '.gtitle{font-weight:800;color:#5a32d6;font-size:12px;margin-bottom:6px}',
    '.gtbl{border-collapse:collapse;font-size:11.5px;margin-bottom:6px}.gtbl th,.gtbl td{border:1px solid #c9bdec;padding:2px 4px;text-align:center;min-width:26px;height:18px}',
    '.gtbl th{background:#f3eefe;color:#5a32d6;font-weight:800;min-width:52px}.gtbl td.lab{font-weight:800;color:var(--purple);background:#faf8ff}',
    '.gtot{font-weight:800;color:#5a32d6;font-size:12px;margin-top:2px}.gtot u{display:inline-block;min-width:60px;border-bottom:1.5px solid #b3a9cf;text-decoration:none}',
    '.p2h{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;border-bottom:2.5px solid var(--purple);padding-bottom:6px;margin-bottom:8px}',
    '.p2h b{font-size:15px;color:#5a32d6;font-weight:900}.p2h span{font-size:11px;color:var(--soft);text-align:right}',
    '.cmx-note{font-size:11px;color:var(--soft);border-left:3px solid #d9cff5;padding:5px 10px;margin:0 0 9px}.cmx-note b{color:#5a32d6}',
    /* тогтмол хуудсууд (хариултын хуудастай горим) — --pw/--ph/--pm цаасаар */
    '.cmx-pages{--pw:210mm;--ph:297mm;--pm:11mm}.cmx-pages.cmx-a5{--pw:148mm;--ph:210mm;--pm:8mm}',
    '.sheet.cmx-pages{background:transparent;box-shadow:none;padding:0;min-height:0;width:var(--pw)}',
    '.cmx-pages>.cm-foot,.cmx-pages>.cm-wm{display:none!important}',   /* ws-store-ийн хөл/тамга — хуудсуудын гадна илүү хуудас үүсгэнэ */
    '.cmx-pg{position:relative;background:#fff;width:var(--pw);max-width:100%;min-height:var(--ph);margin:0 auto 7mm;padding:var(--pm);box-shadow:0 12px 44px -18px rgba(0,0,0,.35);overflow:hidden;font-size:11.5px;line-height:1.45;color:var(--ink)}',
    '.cmx-a5 .cmx-pg{font-size:10.5px}',
    '.cmx-pg.as{padding:0;min-height:0}.cmx-pg.as svg{display:block;width:100%;height:auto}',
    '.cmx-pglab{position:absolute;top:2.2mm;left:0;right:0;text-align:center;font-size:10px;font-weight:800;color:#b9aedb;pointer-events:none}',
    '.cmx-pg.scr h3{font-size:13px;color:#5a32d6;margin-bottom:6px}',
    '.cmx-pg.scr .grid-bg{height:calc(var(--ph) - 2 * var(--pm) - 12mm);border:1.1px solid #ece6fb;border-radius:8px;background-image:radial-gradient(#d9d2ef 0.9px,transparent 1px);background-size:5mm 5mm;background-position:2.5mm 2.5mm}',
    '.cmx-measure .cmx-pg{width:var(--pw)!important;max-width:none!important;min-height:0!important}.cmx-measure.cmx-pages{width:var(--pw)!important;max-width:none!important}',
    /* A5: нягт бичиг */
    '.cmx-a5 .head{padding-bottom:5px;margin-bottom:5px}.cmx-a5 .head h1{font-size:14.5px}.cmx-a5 .head .sub{font-size:9.5px}',
    '.cmx-a5 .meta{font-size:10px;margin:5px 1px 7px}.cmx-a5 .meta>span{padding:0 12px 2px 3px}.cmx-a5 .score-top{font-size:10px}',
    '.cmx-a5 .task{font-size:11px;margin:6px 0 5px;padding-left:7px}',
    '.cmx-a5 .t-stem,.cmx-a5 .opt,.cmx-a5 .free .fs{font-size:11px}.cmx-a5 .opts{padding-left:14px;gap:1px 8px}.cmx-a5 .pt{font-size:9.5px;padding:0 6px;margin-left:6px}',
    '.cmx-a5 .cmx-note{font-size:9.5px;padding:3px 8px;margin-bottom:6px}.cmx-a5 .p2h{padding-bottom:4px;margin-bottom:6px}.cmx-a5 .p2h b{font-size:12.5px}.cmx-a5 .p2h span{font-size:9px}',
    '.cmx-a5 .free{margin-bottom:6px}.cmx-a5 .grade{padding:5px 8px;margin-top:5px}.cmx-a5 .gtitle,.cmx-a5 .gtot{font-size:10px}.cmx-a5 .gtitle{margin-bottom:4px}',
    '.cmx-a5 .gtbl{font-size:9.5px;margin-bottom:4px}.cmx-a5 .gtbl th,.cmx-a5 .gtbl td{min-width:19px;height:14px;padding:1px 3px}.cmx-a5 .gtbl th{min-width:40px}',
    '.cmx-a5 .ak{font-size:11px}.cmx-a5 .cmx-pg.key h2{font-size:13px}',
    '@media (max-width:840px){.cmx-pg{min-height:0}}',
    '.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px 20px}.q{break-inside:avoid;page-break-inside:avoid}',
    '.qeq{display:flex;gap:6px;align-items:baseline}.ql{min-width:20px}.qm{font-size:12.5px;flex:1;min-width:0}',
    '.fig{display:flex;justify-content:center;margin:4px 0}',
    '.ans-page{margin-top:9mm;border-top:2px dashed #ddd;padding-top:7mm}.ans-page h2,.cmx-pg.key h2{font-size:15px;color:#5a32d6;margin-bottom:8px}',
    '.ak{font-size:12.5px;margin-bottom:5px}.ak .n{font-weight:800;color:var(--purple);min-width:26px;display:inline-block}',
    '.ans-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;font-size:12px}.ans-grid .a .an{color:var(--purple);font-weight:800;margin-right:5px}',
    '#answers{display:none}',
    '.cmx-p12 .qm,.cmx-p12 .ql,.cmx-p12 .task{font-size:12pt}.cmx-p12 .qm .katex{font-size:1.1em}.cmx-p12 .rule{font-size:10.5pt}.cmx-p12 .meta{font-size:11pt}.cmx-p12 .ans-grid{font-size:11pt}',
    '.katex svg{max-width:none!important;height:inherit!important}',
    '#cmx-print2{display:none}',
    '@media print{body{background:#fff;padding:0}.bar{display:none}.sheet{box-shadow:none;width:auto;min-height:auto;padding:0;margin:0}',
    '.ans-page{break-before:page;margin-top:0;border-top:0;padding-top:0}',
    '.cmx-pages{width:auto!important;max-width:none!important}',
    '.cmx-pg{margin:0!important;box-shadow:none!important;width:var(--pw)!important;max-width:none!important;height:calc(var(--ph) - .4mm)!important;min-height:0!important}',
    '.cmx-pg.key{height:auto!important}.cmx-pg.as svg{width:100%!important;height:100%!important}',
    '.cmx-pg+.cmx-pg,.cmx-vset+.cmx-vset>.cmx-pg:first-child,.cmx-vset+.cmx-pg{break-before:page;page-break-before:always}',
    '.cmx-pglab{display:none}',
    '#cmx-vbatch{position:static!important;left:auto!important;width:auto!important}.cmx-vsheet{break-after:page}.cmx-vsheet:last-child{break-after:auto}',
    /* A4 хэвтээ хуудсанд ижил 2 A5 — 2 талт хэвлэхэд ар тал нь (аль ч эргүүлэлтэд) өөрийн нүүртэйгээ таарна */
    '#cmx-print2 .cmx-s2{position:relative;display:flex;width:297mm;height:209.6mm;overflow:hidden;break-after:page;page-break-after:always}',
    '#cmx-print2 .cmx-s2:last-child{break-after:auto;page-break-after:auto}',
    '#cmx-print2 .cmx-s2>.cmx-pg{flex:none;width:148.5mm!important;height:209.6mm!important;break-before:auto!important;page-break-before:auto!important}',
    '#cmx-print2 .cmx-s2>.cmx-pg.key{height:209.6mm!important}',
    '#cmx-print2 .cmx-s2::after{content:"";position:absolute;left:148.5mm;top:0;bottom:0;border-left:.3mm dashed #bdbdbd}}'
  ].join('\n');
  function injectCSS() { if (document.getElementById('cmx-css')) return; var st = document.createElement('style'); st.id = 'cmx-css'; st.textContent = CSS; document.head.appendChild(st); }
  function styleEl(id) { var st = document.getElementById(id); if (!st) { st = document.createElement('style'); st.id = id; document.head.appendChild(st); } return st; }
  // @page: тогтмол хуудастай горимд margin 0 (хуудас бүр өөрийн зайтай), урсгал хуудсанд зайтай
  function setPageCSS(size, margin) { styleEl('cmx-page').textContent = '@page{size:' + size + ';margin:' + margin + '}'; }
  // Хэвлэхэд зөвхөн энэ элементийг (body-ийн хүүхэд) харуулна; '' — хэвийн
  function setPrintTarget(id) { styleEl('cmx-vcss').textContent = id ? '@media print{body>*:not(#' + id + '){display:none!important}body>#' + id + '{display:block!important}}' : ''; }
  function render(el) { try { renderMathInElement(el, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }], throwOnError: false }); } catch (e) {} }
  // Сонголт урт бол 4 баганаас 2 багана руу
  function adjustOpts(scope) {
    [].forEach.call((scope || document).querySelectorAll('.opts'), function (op) {
      op.classList.remove('two'); var cells = op.children; if (!cells.length) return;
      var cellW = cells[0].clientWidth, need2 = false;
      [].forEach.call(cells, function (o) { var prev = o.getAttribute('style') || ''; o.style.position = 'absolute'; o.style.whiteSpace = 'nowrap'; o.style.width = 'auto'; o.style.visibility = 'hidden'; var w = o.offsetWidth; o.setAttribute('style', prev); if (w > cellW + 1) need2 = true; });
      if (need2) op.classList.add('two');
    });
  }
  function hMM(el) { return el ? el.getBoundingClientRect().height / MM : 0; }
  function measure(el, fn) { el.classList.add('cmx-measure'); try { fn(); } finally { el.classList.remove('cmx-measure'); } }

  /* ───────── eyeshcheck-ийн хариултын хуудас (210×297 хүрээ, мм) ───────── */
  var INK = '#111', RED = '#E53935', RING = '#EC6F73', HINT = '#F4A3A5', SHADE = '#FDE7E7';
  var MARK = 8, MARKERS = [[12, 12], [198, 12], [198, 285], [12, 285], [12, 148.5], [198, 148.5]], ORIENT = { x: 24, y: 9.5, s: 5 };
  var TAG = { x0: 44, y: 283, step: 10, n: 12, s: 4 };
  var S1 = { x0: 20, colW: 40, y0: 98, pitch: 5.4, pairGap: 0.6, dx: 5.6, r: 1.9 }, S1_ROWS = 30;
  var ID = { x: 144.8, y: 37, dx: 4.6, dy: 4.6, r: 1.6 }, VER = { x: 134, y: 37, dy: 4.6, r: 1.7 };
  function s1RowY(row) { return S1.y0 + row * S1.pitch + Math.floor(row / 2) * S1.pairGap; }
  function f2(n) { return +(+n).toFixed(2); }
  function bubble(x, y, r, label, filled) {
    return '<circle cx="' + f2(x) + '" cy="' + f2(y) + '" r="' + r + '" fill="' + (filled ? INK : '#fff') + '" stroke="' + (filled ? INK : RING) + '" stroke-width="0.28"/>'
      + (filled ? '' : '<text x="' + f2(x) + '" y="' + f2(y + r * 0.4) + '" text-anchor="middle" font-size="' + f2(r * 1.1) + '" font-weight="700" fill="' + HINT + '">' + label + '</text>');
  }
  function mini(x, y, r, label, mark) {
    var s = '<circle cx="' + f2(x) + '" cy="' + y + '" r="' + r + '" fill="' + (mark === 'fill' ? '#333' : '#fff') + '" stroke="' + (mark === 'ring' ? '#333' : RING) + '" stroke-width="' + (mark === 'ring' ? 0.45 : 0.22) + '"/>';
    if (mark !== 'fill') s += '<text x="' + f2(x) + '" y="' + f2(y + r * 0.4) + '" text-anchor="middle" font-size="' + f2(r * 1.05) + '" font-weight="700" fill="' + HINT + '">' + label + '</text>';
    if (mark === 'x') s += '<path d="M' + f2(x - r) + ' ' + f2(y - r) + 'L' + f2(x + r) + ' ' + f2(y + r) + 'M' + f2(x + r) + ' ' + f2(y - r) + 'L' + f2(x - r) + ' ' + f2(y + r) + '" stroke="#333" stroke-width="0.4"/>';
    if (mark === 'dot') s += '<circle cx="' + f2(x) + '" cy="' + y + '" r="' + f2(r * 0.35) + '" fill="#333"/>';
    if (mark === 'tick') s += '<path d="M' + f2(x - r) + ' ' + y + 'L' + f2(x - r * 0.2) + ' ' + f2(y + r * 0.9) + 'L' + f2(x + r * 1.4) + ' ' + f2(y - r * 1.2) + '" stroke="#333" stroke-width="0.45" fill="none"/>';
    if (mark === 'scrib') s += '<path d="M' + f2(x - r * 0.9) + ' ' + f2(y + r * 0.2) + 'q' + f2(r * 0.5) + ' ' + f2(-r) + ' ' + r + ' 0t' + r + ' 0" stroke="#333" stroke-width="0.7" fill="none"/>';
    if (mark === 'half') s += '<path d="M' + f2(x) + ' ' + f2(y - r) + 'A' + r + ' ' + r + ' 0 0 1 ' + f2(x) + ' ' + f2(y + r) + 'Z" fill="#333"/>';
    return s;
  }
  function box(x, y, w, h, title, titleH, fs) {
    titleH = titleH || 5; fs = fs || f2(titleH * 0.62);
    var s = '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="2" fill="#fff" stroke="' + RED + '" stroke-width="0.4"/>';
    if (title) s += '<path d="M' + x + ' ' + (y + titleH) + 'V' + (y + 2) + 'a2 2 0 0 1 2 -2H' + (x + w - 2) + 'a2 2 0 0 1 2 2V' + (y + titleH) + 'Z" fill="' + RED + '"/>'
      + '<text x="' + (x + w / 2) + '" y="' + (y + titleH - 1.5) + '" text-anchor="middle" font-size="' + fs + '" font-weight="900" fill="#fff">' + title + '</text>';
    return s;
  }
  function txt(x, y, s, size, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '"' + (o.a ? ' text-anchor="' + o.a + '"' : '') + ' font-size="' + size + '" font-weight="' + (o.w || 700) + '" fill="' + (o.c || RED) + '"' + (o.pre ? ' xml:space="preserve"' : '') + '>' + s + '</text>';
  }
  // o: { n (тестийн тоо), title, code, tag (1..4095), ver (0..9 | -1), p1, p2 (нийт оноо), name?, big (A5 — дугуйг томруулна) }
  // big: уншигч дугуйн дотор 0.62r, цагираг 1.2r–1.42r-ээс дээж авдаг (r = 1.9 / 1.6 / 1.7). Зурсан дугуй 2.25 / 1.8 / 1.9 нь
  // дотор талыг томруулах ч цагирагийн дээжид (≥2.28 / ≥1.92 / ≥2.04) хүрэхгүй тул уншилт өөрчлөгдөхгүй.
  function answerSheet(o) {
    var n = Math.min(60, o.n || 10), t = '', i, j, k, rS = o.big ? 2.25 : S1.r, rI = o.big ? 1.8 : ID.r, rV = o.big ? 1.9 : VER.r;
    t += '<rect x="0" y="0" width="210" height="297" fill="#fff"/>';
    MARKERS.forEach(function (c) { t += '<rect x="' + (c[0] - MARK / 2) + '" y="' + (c[1] - MARK / 2) + '" width="' + MARK + '" height="' + MARK + '" fill="' + INK + '"/>'; });
    t += '<rect x="' + ORIENT.x + '" y="' + ORIENT.y + '" width="' + ORIENT.s + '" height="' + ORIENT.s + '" fill="' + INK + '"/>';
    for (i = 0; i < TAG.n; i++) if ((o.tag >> i) & 1) t += '<rect x="' + (TAG.x0 + i * TAG.step) + '" y="' + TAG.y + '" width="' + TAG.s + '" height="' + TAG.s + '" fill="' + INK + '"/>';
    // гарчиг, нэр
    t += txt(105, 20.5, 'ХАРИУЛТЫН ХУУДАС', 6.6, { a: 'middle', w: 900 });
    if (o.title) t += txt(190, 13.8, esc(String(o.title).slice(0, 64)), 2.6, { a: 'end', w: 800, c: '#555' });
    if (o.code) t += txt(190, 17.4, 'Хувилбарын код: ' + esc(o.code), 2.6, { a: 'end', w: 800, c: '#555' });
    t += txt(20, 26, 'Овог нэр:', 2.6) + '<line x1="33" y1="26.4" x2="118" y2="26.4" stroke="' + RED + '" stroke-width="0.2"/>'
      + txt(121, 26, 'Анги:', 2.6) + '<line x1="129" y1="26.4" x2="152" y2="26.4" stroke="' + RED + '" stroke-width="0.2"/>'
      + txt(155, 26, 'Огноо:', 2.6) + '<line x1="164" y1="26.4" x2="190" y2="26.4" stroke="' + RED + '" stroke-width="0.2"/>';
    if (o.name) t += txt(35, 25.6, esc(String(o.name).slice(0, 60)), 3.3, { w: 800, c: INK });
    // санамж
    t += box(20, 29, 72, 56, 'САНАМЖ', 6);
    [['1. Хариултын хуудсыг нугалж, гэмтээж болохгүй', 40], ['2. Шалгалтын хувилбар хариултын хуудасны', 45], ['    хувилбартай таарч буй эсэхийг шалгана уу', 48.4],
      ['3. Зөвхөн харандаа эсвэл хар үзгээр тод,', 53.4], ['    засваргүй дараах байдлаар бөглөнө үү', 56.8]].forEach(function (r) { t += txt(23, r[1], r[0], 2.35, { pre: 1 }); });
    t += txt(23, 62.4, '1-р хэсгийн зөв хариулт:', 2.35) + txt(62, 63.2, '1', 2.4, { a: 'end', w: 800 });
    OL.forEach(function (v, q) { t += mini(65 + q * 4.6, 62.4, 1.5, v, q === 1 ? 'fill' : null); });
    t += txt(23, 69.4, '2-р хэсэг (задгай даалгавар): хариултын', 2.35) + txt(23, 73.4, 'хуудасны АР ТАЛД бодолтоо дэлгэрэнгүй', 2.35)
      + txt(23, 77.4, 'бичнэ — багш гараар дүгнэнэ.', 2.35);
    // анхаарах зүйлс
    t += txt(110, 33, 'Хариултын', 2.6, { a: 'middle', w: 900 }) + txt(110, 36.2, 'хуудас бөглөхөд', 2.6, { a: 'middle', w: 900 }) + txt(110, 39.4, 'анхаарах зүйлс', 2.6, { a: 'middle', w: 900 });
    [['x', 3], ['dot', 2], ['ring', 1], ['tick', 2], ['scrib', 3], ['two', 0], ['half', 3], ['ok', 0]].forEach(function (w, r) {
      var y = 44.6 + r * 5.1, m = w[0];
      t += '<rect x="94" y="' + f2(y - 2.1) + '" width="31" height="4.2" rx="1" fill="' + SHADE + '"/>' + txt(95, f2(y + 0.8), m === 'ok' ? 'Зөв' : 'Буруу', 2.2, { w: 800, c: m === 'ok' ? INK : RED });
      OL.forEach(function (v, q) {
        var mk = m === 'ok' ? (q === 0 ? 'fill' : null) : m === 'two' ? (q === 1 || q === 2 ? 'fill' : null) : (q === w[1] ? m : null);
        t += mini(108 + q * 4.2, f2(y), 1.25, v, mk);
      });
    });
    // хувилбар
    t += box(128, 29, 12, 56, 'ХУВИЛБАР', 5, 1.75);
    for (k = 0; k < 10; k++) t += bubble(VER.x, VER.y + k * VER.dy, rV, VCYR[k], o.ver === k);
    // хяналтын хэсэг — сурагчийн код
    t += box(142, 29, 48, 56, 'ХЯНАЛТЫН ХЭСЭГ', 5);
    for (i = 0; i < 10; i++) if (i % 2 === 1) t += '<rect x="' + f2(ID.x + i * ID.dx - 2.3) + '" y="34.6" width="4.6" height="46.4" fill="' + SHADE + '"/>';
    for (i = 0; i < 10; i++) for (j = 0; j < 10; j++) t += bubble(ID.x + i * ID.dx, ID.y + j * ID.dy, rI, String(j), false);
    t += txt(166, 83.6, 'сурагчийн код (зүүнээс эхэлж бөглөнө)', 2, { a: 'middle' });
    // 1-р хэсэг: зөвхөн шалгалтын мөрүүд, А–Г (уншигч A–D байрлалаар уншина)
    t += txt(20, 92, '1-Р ХЭСЭГ', 3.8, { w: 900 }) + txt(94, 92, '1–' + n + '-г бөглөнө', 2.5, { a: 'end', w: 800, c: INK });
    [0, 1].forEach(function (c) {
      for (var p = 0; p < S1_ROWS / 2; p += 2) {
        var first = c * S1_ROWS + p * 2; if (first >= n) continue;
        var y1 = s1RowY(p * 2), y2 = s1RowY(Math.min(p * 2 + 1, S1_ROWS - 1)), x0 = S1.x0 + c * S1.colW;
        t += '<rect x="' + f2(x0 + 7.4) + '" y="' + f2(y1 - 2.7) + '" width="23.2" height="' + f2((first + 1 < n ? y2 : y1) - y1 + 5.4) + '" rx="1.4" fill="' + SHADE + '"/>';
      }
    });
    for (i = 0; i < n; i++) {
      var col = Math.floor(i / S1_ROWS), row = i % S1_ROWS, xx = S1.x0 + col * S1.colW, y = s1RowY(row);
      t += txt(f2(xx + 7), f2(y + 1), String(i + 1), 2.7, { a: 'end', w: 800 });
      for (k = 0; k < 4; k++) t += bubble(xx + 10 + k * S1.dx, y, rS, OL[k], false);
    }
    // 2-р хэсэг — ар талд; багшийн оноо
    t += txt(104, 92, '2-Р ХЭСЭГ', 3.8, { w: 900 })
      + '<rect x="104" y="96" width="86" height="34" rx="2" fill="#fff" stroke="' + RED + '" stroke-width="0.4"/>'
      + txt(147, 106, 'Задгай даалгавар', 3.4, { a: 'middle', w: 900 })
      + txt(147, 113, 'хуудасны АР ТАЛД бодно', 2.7, { a: 'middle' })
      + txt(147, 119.5, 'энд будахгүй — багш гараар дүгнэнэ', 2.3, { a: 'middle' });
    t += box(104, 136, 86, 33, 'ОНОО (багш бөглөнө)', 5);
    [['1-р хэсэг (тест):', o.p1], ['2-р хэсэг (задгай):', o.p2], ['Нийт оноо:', o.p1 != null && o.p2 != null ? Math.round((o.p1 + o.p2) * 100) / 100 : null]].forEach(function (r, q) {
      var y = 148 + q * 7.4;
      t += txt(108, y, r[0], 2.7, { w: q === 2 ? 900 : 700 }) + '<line x1="146" y1="' + f2(y + 0.6) + '" x2="170" y2="' + f2(y + 0.6) + '" stroke="' + RED + '" stroke-width="0.25"/>'
        + txt(186, y, '/ ' + (r[1] == null ? '' : r[1]), 2.7, { a: 'end', w: 800 });
    });
    t += txt(20, 270.5, 'CyberMath · Дасгалын төв', 3, { w: 900, c: '#5a32d6' })
      + txt(20, 274.6, 'Тестийг ЭЕШ шалгагчаар (eyeshcheck.com) утсаар уншуулж дүгнэнэ', 2.2, { c: '#6b7280' });
    return '<svg viewBox="0 0 210 297" xmlns="http://www.w3.org/2000/svg" font-family="Segoe UI, Arial, sans-serif">' + t + '</svg>';
  }

  /* ───────── шалгалтын материал ───────── */
  // cfg: { title, sub, grade, topic (eyeshcheck: Алгебр|Геометр|Тригонометр|Статистик|Тооны онол|Анализ|Функц|Бусад), time?,
  //        tests: [fn ×10] → { stem, mc: makeMC(C(зөв), [C(..)…]), topic?, fig? }, free: [fn ×5] → { stem, a, fig?, wk? }, testPts?, freePts? }
  function exam(cfg) {
    injectCSS();
    var TPT = cfg.testPts || 1, FPT = (cfg.freePts || [2, 2, 3, 3, 3]).slice();
    var SLUG = (location.pathname.split('/').pop() || '').replace(/\?.*$/, '') || 'exam.html';
    var LSK = 'cmx_seed:' + SLUG;
    var PAPER = PAPERS[lsGet('cmx_paper')] ? lsGet('cmx_paper') : 'a5';
    var bar = document.getElementById('bar'); bar.className = 'bar';
    bar.innerHTML = '<button class="btn refresh" type="button" onclick="build()">' + ICO.ref + 'Шинэ хувилбар</button>'
      + '<label class="cmx-codel" title="Хувилбарын код — ижил кодоор яг ижил бодлогууд гарна. Хэвлэсэн хувилбарынхаа кодыг оруулж (Enter) сэргээнэ.">Код <input id="cmx-code" maxlength="5" autocomplete="off" spellcheck="false"></label>'
      + (inFrame ? '' : '<label title="1-р хуудас: хариултын хуудас (тестийг будна), ар тал нь задгай даалгавар. Дараагийн хуудас: тест, ар тал нь ноорог. 2 талт хэвлэнэ."><input type="checkbox" id="ash" checked> Хариултын хуудастай</label>'
        + '<label class="cmx-paperl" title="A5 — A5 цаасанд. A4-т 2 — A4 цаасны хуудас бүрт ижил 2 A5 (2 талт хэвлээд дундуур нь хайчилна). A4 — бүтэн хэмжээгээр.">Цаас <select id="cmx-paper"><option value="a5">A5</option><option value="a5x2">A4-т 2 ширхэг A5</option><option value="a4">A4</option></select></label>')
      + '<label><input type="checkbox" id="sa"> Хариу хавсаргах</label>'
      + '<button class="btn" type="button" onclick="window.print()">' + ICO.prt + 'Хэвлэх / PDF</button>'
      + '<button class="btn cmx-vbtn" type="button" onclick="CMX.variants()">' + ICO.var + 'Олон хувилбар</button>';
    var ash = document.getElementById('ash'), sa = document.getElementById('sa'), ci = document.getElementById('cmx-code'), ps = document.getElementById('cmx-paper');
    if (ash) ash.addEventListener('change', function () { draw(); });
    if (ps) { ps.value = PAPER; ps.addEventListener('change', function () { PAPER = PAPERS[ps.value] ? ps.value : 'a5'; lsSet('cmx_paper', PAPER); draw(); }); }
    sa.addEventListener('change', toggleAns);
    function applyCode() { var v = String(ci.value || '').trim().toUpperCase(); if (okSeed(v)) { if (!CUR || v !== CUR.seed) load(v); } else ci.value = CUR ? CUR.seed : ''; }
    ci.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); applyCode(); ci.blur(); } });
    ci.addEventListener('change', applyCode);
    var CUR = null;
    function paged() { return !inFrame && (!ash || ash.checked); }
    function pap() { return PAPERS[PAPER]; }
    function toggleAns() { var el = document.getElementById('answers'); if (el) el.style.display = sa.checked ? 'block' : 'none'; }
    window.toggleAns = toggleAns;
    function make(seed) {
      return seeded(seed, function () {
        var seen = {}, T = [], F = [];
        cfg.tests.forEach(function (fn) { var g = gen(fn, function (x) { return x.mc && x.stem && !seen[x.stem]; }); if (g) { seen[g.stem] = 1; T.push(g); } });
        cfg.free.forEach(function (fn) { var g = gen(fn, function (x) { return x.stem && x.a != null && !seen[x.stem]; }); if (g) { seen[g.stem] = 1; F.push(g); } });
        var key = T.map(function (g) { return LAT[g.mc.correct]; }).join('');
        return { seed: seed, T: T, F: F, key: key, ref: wsRef(SLUG, seed, key) };
      });
    }
    function r2(v) { return Math.round(v * 100) / 100; }
    function totals() { return { p1: r2((CUR ? CUR.T.length : cfg.tests.length) * TPT), p2: r2(FPT.reduce(function (s, v) { return s + v; }, 0)) }; }
    function ansTex(a) { return String(a).indexOf('$') >= 0 ? a : '$' + a + '$'; }
    function testHtml(T, pts) {
      return T.map(function (g, i) {
        var opts = g.mc.opts.map(function (o, j) { return '<div class="opt"><span class="ol">' + OL[j] + '.</span>$' + o.tex + '$</div>'; }).join('');
        return '<div class="t-item">' + (g.fig ? '<div class="t-fig">' + g.fig + '</div>' : '') + '<div class="t-stem">' + (pts ? '<span class="pt"><b class="ptv" data-t="1">' + TPT + '</b> оноо</span>' : '') + '<span class="n">' + (i + 1) + '.</span>' + g.stem + '</div><div class="opts">' + opts + '</div></div>';
      }).join('');
    }
    function freeHtml(F, wk) {
      return F.map(function (f, i) {
        var w = '<div class="wk" style="height:' + (f.wk || wk) + 'mm"></div>';
        return '<div class="free"><div class="fs"><span class="pt"><b class="ptv" data-f="' + i + '">' + FPT[i] + '</b> оноо</span><span class="n">' + (11 + i) + '.</span>' + f.stem + '</div>'
          + (f.fig ? '<div class="frow">' + w + '<div class="ffig">' + f.fig + '</div></div>' : w) + '</div>';
      }).join('');
    }
    function gradeHtml(withTest, n) {
      var cells = function (k, f) { var s = ''; for (var i = 0; i < k; i++) s += f(i); return s; }, tt = totals();
      var tr = withTest ? '<table class="gtbl"><tr><th>Тест</th>' + cells(n, function (i) { return '<td class="lab">' + (i + 1) + '</td>'; }) + '</tr><tr><th>Оноо</th>' + cells(n, function () { return '<td></td>'; }) + '</tr></table>'
        : '<div style="margin-bottom:4px"><b style="color:#5a32d6">I хэсэг (тест — ЭЕШ шалгагч):</b> <u style="display:inline-block;min-width:40px;border-bottom:1.5px solid #b3a9cf"></u> / <span class="cmx-p1t">' + tt.p1 + '</span> оноо</div>';
      var fr2 = '<table class="gtbl"><tr><th>Задгай</th>' + cells(FPT.length, function (i) { return '<td class="lab">' + (11 + i) + '</td>'; }) + '</tr><tr><th>Оноо</th>' + cells(FPT.length, function () { return '<td></td>'; }) + '</tr></table>';
      return '<div class="grade"><div class="gtitle">Багшийн засах хүснэгт — авсан оноо</div>' + tr + fr2 + '<div class="gtot">Нийт авсан оноо: <u></u> / <b class="cmx-tot">' + r2(tt.p1 + tt.p2) + '</b> оноо</div></div>';
    }
    function head(P, vl) {
      var tt = totals();
      return '<div class="head"><h1>' + esc(cfg.title) + '</h1><div class="sub">' + esc(cfg.sub || '') + (cfg.sub ? ' · ' : '') + esc(cfg.grade) + '</div></div>'
        + '<div class="meta"><span>Нэр: </span><span>Анги: </span><span>Хугацаа: ' + esc(cfg.time || '40 минут') + '</span><div class="score-top">' + (vl ? 'Хувилбар ' + vl + ' · ' : '') + 'Код: <span class="cmx-cd">' + P.seed + '</span> · Оноо: <b class="cmx-tot">' + r2(tt.p1 + tt.p2) + '</b></div></div>';
    }
    function keyBody(P) {
      return '<h2>Хариунууд · код ' + P.seed + '</h2><div class="ak"><span class="n">Тест:</span> ' + P.T.map(function (g, i) { return (i + 1) + '-' + OL[g.mc.correct]; }).join(', ') + '</div><div style="height:6px"></div>'
        + '<div class="ak" style="font-weight:800;color:#5a32d6">Задгай даалгавар:</div>' + P.F.map(function (f, i) { return '<div class="ak"><span class="n">' + (11 + i) + ')</span> ' + ansTex(f.a) + '</div>'; }).join('');
    }
    // Хариултын хуудасгүй (дэвтрийн iframe, эсвэл унтраасан үед) — A4 нэг урсгал
    function classicHtml(P, vl) {
      return head(P, vl) + '<div class="task">I. Сонголттой тест. Зөв хариуг сонгоно уу. (1–' + P.T.length + ')</div>' + testHtml(P.T, true)
        + '<div class="task">II. Задгай даалгавар. Бодолтоо дэлгэрэнгүй бичнэ үү. (11–' + (10 + P.F.length) + ')</div>' + freeHtml(P.F, 26) + gradeHtml(true, P.T.length);
    }
    // Тогтмол хуудсууд. ver: хариултын хуудсан дээр урьдчилан будах ХУВИЛБАР (0..9), -1 — будахгүй
    function pagesHtml(P, ver, vl) {
      var tt = totals(), sub = esc(cfg.title) + ' · ' + esc(cfg.grade) + (vl ? ' · Хувилбар ' + vl : '');
      return '<div class="cmx-pg as"><span class="cmx-pglab">1 · Хариултын хуудас (нүүр тал)</span>'
          + answerSheet({ n: P.T.length, title: cfg.title + ' · ' + cfg.grade + (vl ? ' · Хувилбар ' + vl : ''), code: P.seed, tag: examTag(P.ref), ver: ver, p1: tt.p1, p2: tt.p2, big: PAPER !== 'a4' }) + '</div>'
        + '<div class="cmx-pg p2"><span class="cmx-pglab">2 · Хариултын хуудасны ар тал — 2 талт хэвлэнэ</span><div class="cmx-in">'
          + '<div class="p2h"><b>II хэсэг · Задгай даалгавар</b><span>' + sub + '<br>Код: <span class="cmx-cd">' + P.seed + '</span></span></div>'
          + '<div class="meta" style="margin-top:0"><span>Нэр: </span><span>Анги: </span><span>Огноо: </span></div>'
          + '<div class="cmx-note">Бодолтоо дэлгэрэнгүй бичнэ үү. Тестийн (1–' + P.T.length + ') хариуг <b>нүүрэн талын хариултын хуудсанд</b> будна.</div>'
          + freeHtml(P.F, 20) + gradeHtml(false, P.T.length) + '</div></div>'
        + '<div class="cmx-pg p1"><span class="cmx-pglab">3 · Тестийн даалгавар</span><div class="cmx-in">' + head(P, vl)
          + '<div class="cmx-note">Зөв хариуг <b>хариултын хуудасны 1-р хэсэгт</b> будна. Энэ хуудсан дээр тэмдэглэсэн хариу тооцогдохгүй. Задгай даалгавар (11–' + (10 + P.F.length) + ') хариултын хуудасны ар талд байна.</div>'
          + '<div class="task">I. Сонголттой тест. Зөв хариуг сонгоно уу. (1–' + P.T.length + ', тус бүр ' + TPT + ' оноо)</div>' + testHtml(P.T, false) + '</div></div>'
        + '<div class="cmx-pg scr"><span class="cmx-pglab">4 · Тестийн хуудасны ар тал</span><div class="cmx-in"><h3>Ноорог</h3><div class="grid-bg"></div></div></div>';
    }
    // Задгайг нэг хуудсанд дүүргэнэ; тест нэг хуудаснаас хэтэрвэл үргэлжлэлийг дараагийн хуудсанд (ноорогийн оронд)
    function avail() { var p = pap(); return p.h - 2 * p.m - 1.5; }
    function fitSet(set) {
      var AV = avail(), p2 = set.querySelector('.cmx-pg.p2 .cmx-in');
      if (p2) {
        var wks = [].slice.call(p2.querySelectorAll('.free .wk')), base = PAPER === 'a4' ? 20 : 14;
        wks.forEach(function (w) { w.style.height = base + 'mm'; });
        var slack = AV - hMM(p2);
        if (slack < 0) { base = Math.max(9, base + slack / Math.max(1, wks.length)); wks.forEach(function (w) { w.style.height = base + 'mm'; }); }
        else if (wks.length) { var add = Math.min(60, slack / wks.length); wks.forEach(function (w) { w.style.height = (base + add) + 'mm'; }); }
      }
      var p1pg = set.querySelector('.cmx-pg.p1'), p1 = p1pg && p1pg.querySelector('.cmx-in');
      if (p1 && hMM(p1) <= AV) {
        // тест нэг хуудсанд багтвал илүү зайг бодлогуудын хооронд тэнцүү хуваана (тооцоо хийх зай)
        var its = p1.querySelectorAll('.t-item'), sl = AV - 2 - hMM(p1);
        if (its.length && sl > 6) { var mb = Math.min(14, sl / its.length); [].forEach.call(its, function (it) { it.style.marginBottom = (2.1 + mb) + 'mm'; }); }
      } else if (p1) {
        var top = p1.getBoundingClientRect().top, items = [].slice.call(p1.querySelectorAll('.t-item')), cut = -1;
        for (var i = 0; i < items.length; i++) if ((items[i].getBoundingClientRect().bottom - top) / MM > AV) { cut = i; break; }
        if (cut > 0) {
          var pg = document.createElement('div'); pg.className = 'cmx-pg p1b';
          pg.innerHTML = '<span class="cmx-pglab">4 · Тестийн даалгавар (үргэлжлэл)</span><div class="cmx-in"><div class="task">I. Сонголттой тест (үргэлжлэл)</div></div>';
          var inn = pg.querySelector('.cmx-in'); items.slice(cut).forEach(function (it) { inn.appendChild(it); });
          p1pg.parentNode.insertBefore(pg, p1pg.nextSibling);
          var scr = set.querySelector('.cmx-pg.scr'); if (scr) scr.remove();
        }
      }
    }
    function syncPts() {
      // засварласан оноо → нийт. Хариултын хуудсан дээрх оноо blur-д дахин зурагдана.
      var sh = document.getElementById('sheet');
      [].forEach.call(sh.querySelectorAll('.ptv[data-f]'), function (el) { var v = parseFloat((el.textContent || '').replace(',', '.')); if (!isNaN(v) && v >= 0 && v <= 20) FPT[+el.getAttribute('data-f')] = v; });
      var t1 = sh.querySelector('.ptv[data-t]'); if (t1) { var v1 = parseFloat((t1.textContent || '').replace(',', '.')); if (!isNaN(v1) && v1 >= 0 && v1 <= 10) TPT = v1; }
      var tt = totals();
      [].forEach.call(sh.querySelectorAll('.cmx-tot'), function (el) { el.textContent = String(r2(tt.p1 + tt.p2)); });
      [].forEach.call(sh.querySelectorAll('.cmx-p1t'), function (el) { el.textContent = String(tt.p1); });
    }
    function pageClasses(el, pg) { el.classList.toggle('cmx-pages', pg); el.classList.toggle('cmx-a5', pg && PAPER !== 'a4'); }
    function applyPage(pg) { if (pg) setPageCSS(pap().page, '0'); else setPageCSS('A4', '11mm'); }
    function draw() {
      var pg = paged(), sh = document.getElementById('sheet');
      window.WS_PAGED = pg ? 'cmx-pages' + (PAPER !== 'a4' ? ' cmx-a5' : '') : '';
      window.WS_BATCH_KEEP = true;
      applyPage(pg);
      pageClasses(sh, pg);
      sh.innerHTML = pg ? pagesHtml(CUR, -1, '') + '<div class="cmx-pg key" id="answers"><span class="cmx-pglab">Хариу (багшид)</span><div class="cmx-in">' + keyBody(CUR) + '</div></div>'
        : classicHtml(CUR, '') + '<div class="ans-page" id="answers">' + keyBody(CUR) + '</div>';
      [].forEach.call(sh.querySelectorAll('.ptv'), function (el) {
        el.setAttribute('contenteditable', 'true');
        el.addEventListener('input', syncPts);
        if (pg) el.addEventListener('blur', function () { var y = window.scrollY; draw(); window.scrollTo(0, y); });
      });
      render(sh);
      measure(sh, function () { try { adjustOpts(sh); } catch (e) {} if (pg) fitSet(sh); });
      toggleAns();
      ci.value = CUR.seed;
      window.WS_ITEMS = []; window.WS_TITLE = cfg.title + ' (' + cfg.grade + ')';
    }
    function setUrl(seed) {
      try { var u = new URL(location.href); u.searchParams.set('v', seed); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) {}
      lsSet(LSK, seed);
    }
    function load(seed) { CUR = make(seed); setUrl(seed); draw(); }
    window.build = function () { load(newSeed()); };
    window.layout = function () { draw(); };
    // KaTeX фонт ачаалагдсаны дараа хэмжээ өөрчлөгдөж болно — дахин тааруулна
    try { if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(function () { if (CUR) draw(); }); } catch (e) {}
    // eyesh-link.js: энэ хувилбарын тестийн түлхүүр (А–Г → A–D) ба код
    window.CM_EXAM = function () {
      if (!CUR || CUR.T.length !== cfg.tests.length || !/^[A-D]+$/.test(CUR.key)) return null;
      return { kind: 'ws', slug: SLUG, seed: CUR.seed, key: CUR.key, ref: CUR.ref, title: cfg.title + ' · ' + cfg.grade + ' · ' + CUR.seed,
        scores: CUR.T.map(function () { return TPT; }), topics: CUR.T.map(function (g) { return g.topic || cfg.topic || 'Бусад'; }), n: CUR.T.length };
    };
    // ── «A4-т 2 ширхэг A5»: хэвлэхийн өмнө хуудас бүрийг хоёр хувилж A4 хэвтээ хуудсанд зэрэгцүүлнэ ──
    function build2up(src) {
      var old = document.getElementById('cmx-print2'); if (old) old.remove();
      var pr = document.createElement('div'); pr.id = 'cmx-print2'; pr.className = 'cmx-pages cmx-a5';
      [].forEach.call(src.querySelectorAll('.cmx-pg'), function (pgEl) {
        if (pgEl.style.display === 'none' || getComputedStyle(pgEl).display === 'none') return;
        var s = document.createElement('div'); s.className = 'cmx-s2';
        for (var c = 0; c < 2; c++) { var cl = pgEl.cloneNode(true); cl.removeAttribute('id'); s.appendChild(cl); }
        pr.appendChild(s);
      });
      document.body.appendChild(pr);
      return pr;
    }
    var printing2 = false;
    function before2up() {
      if (!paged() || PAPER !== 'a5x2' || document.getElementById('cm-batch')) return;
      build2up(document.getElementById('cmx-vbatch') || document.getElementById('sheet'));
      setPrintTarget('cmx-print2'); printing2 = true;
    }
    function after2up() {
      if (!printing2) return; printing2 = false;
      var pr = document.getElementById('cmx-print2'); if (pr) pr.remove();
      setPrintTarget(document.getElementById('cmx-vbatch') ? 'cmx-vbatch' : '');
    }
    window.addEventListener('beforeprint', function () { try { before2up(); } catch (e) {} });
    window.addEventListener('afterprint', function () { try { after2up(); } catch (e) {} });
    // ws-store «Ангиар хэвлэх»: сурагчийн нэрийг хариултын хуудсан дээр ч бичнэ; «A4-т 2» үед A5 хуудсаар хэвлэнэ
    window.WS_BATCH_DONE = function (box) {
      [].forEach.call(box.querySelectorAll('.cm-batch-sheet'), function (cl) {
        var nf = cl.querySelector('.cm-fill[data-ph="нэр…"]'), nm = nf ? (nf.textContent || '').trim() : '', svg = cl.querySelector('.cmx-pg.as svg');
        if (nm && svg) svg.insertAdjacentHTML('beforeend', txt(35, 25.6, esc(nm.slice(0, 60)), 3.3, { w: 800, c: INK }));
      });
      if (paged() && PAPER === 'a5x2') {
        setPageCSS('A5', '0');
        var back = function () { applyPage(paged()); window.removeEventListener('afterprint', back); };
        window.addEventListener('afterprint', back);
      }
    };
    // ── олон хувилбар ──
    function openVariantModal() {
      if (document.getElementById('cmx-vmodal')) return;
      var pg = paged();
      var o = document.createElement('div'); o.id = 'cmx-vmodal';
      o.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(20,15,40,.6);display:grid;place-items:center;padding:16px;font-family:"Segoe UI",Arial,sans-serif';
      o.innerHTML = '<div style="background:#fff;border-radius:16px;max-width:430px;width:100%;padding:20px;box-shadow:0 24px 60px -18px rgba(0,0,0,.5)"><div style="font-weight:900;color:#5a32d6;font-size:1.06rem;margin-bottom:4px">Олон хувилбар гаргах</div>'
        + '<p style="color:#7a7390;font-size:.84rem;margin-bottom:12px;line-height:1.45">Хувилбар бүр өөр бодлоготой, өөрийн кодтой. ' + (pg ? 'Хариултын хуудсан дээр ХУВИЛБАР (А, Б, В…) урьдчилан будагдана. ' : '') + 'Төгсгөлд нь бүх хувилбарын код ба хариу. ЭЕШ шалгагчид хувилбар бүрийг кодоор нь оруулна.</p>'
        + '<label style="display:block;font-size:.85rem;font-weight:700;color:#3a2d5e;margin-bottom:5px">Хувилбарын тоо (2–10)</label><input id="cmx-vcount" type="number" min="2" max="10" value="4" style="width:100%;box-sizing:border-box;border:1.6px solid #e7ddff;border-radius:10px;padding:.55rem .8rem;font-size:1rem;font-weight:700;outline:none;font-family:inherit;margin-bottom:14px">'
        + '<div style="display:flex;gap:8px;justify-content:flex-end"><button id="cmx-vcancel" style="border:1.4px solid #e7ddff;background:#faf7ff;color:#5a32d6;font-weight:800;border-radius:999px;padding:.5rem 1rem;cursor:pointer;font-family:inherit">Болих</button><button id="cmx-vgo" style="border:0;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;font-weight:800;border-radius:999px;padding:.5rem 1.2rem;cursor:pointer;font-family:inherit">Гаргаж хэвлэх</button></div></div>';
      document.body.appendChild(o);
      var cnt = o.querySelector('#cmx-vcount'); try { cnt.focus(); cnt.select(); } catch (e) {}
      o.addEventListener('click', function (e) { if (e.target === o) o.remove(); });
      o.querySelector('#cmx-vcancel').onclick = function () { o.remove(); };
      o.querySelector('#cmx-vgo').onclick = function () { var n = parseInt(cnt.value, 10); if (!n || n < 1) return; o.remove(); variants(Math.max(2, Math.min(10, n))); };
    }
    function variants(N, noPrint) {
      var pg = paged(), old = document.getElementById('cmx-vbatch'); if (old) old.remove();
      var bx = document.createElement('div'); bx.id = 'cmx-vbatch'; pageClasses(bx, pg);
      bx.style.cssText = 'position:absolute;left:-99999px;top:0;width:' + (pg ? pap().w : 210) + 'mm';
      document.body.appendChild(bx);
      var keys = [], used = {}, html = '';
      for (var i = 0; i < N; i++) {
        var s; do { s = newSeed(); } while (used[s]); used[s] = 1;
        var P = make(s), L = VCYR[i];
        html += pg ? '<div class="cmx-vset">' + pagesHtml(P, i, L) + '</div>' : '<div class="sheet cmx-vsheet">' + classicHtml(P, L) + '</div>';
        keys.push({ L: L, seed: s, key: P.key, ref: P.ref, t: P.T.map(function (g, k) { return (k + 1) + '-' + OL[g.mc.correct]; }).join(', '), f: P.F.map(function (f, k) { return (11 + k) + ') ' + ansTex(f.a); }).join(' &nbsp;·&nbsp; ') });
      }
      var kb = '<div class="head"><h1>Хариун түлхүүр — бүх хувилбар</h1><div class="sub">' + esc(cfg.title) + ' · ' + esc(cfg.grade) + '</div></div>'
        + '<div class="cmx-note">ЭЕШ шалгагч: хуудасны «Код» талбарт хувилбарын кодыг оруулж (Enter) «ЭЕШ шалгагч» товчийг дарна — хувилбар бүрт тусдаа шалгалт үүснэ. Өөр хувилбарын хариултын хуудсыг уншуулбал eyeshcheck анхааруулна.</div>'
        + keys.map(function (k) { return '<div style="margin:7px 0;break-inside:avoid;border-left:3px solid #A855F7;padding-left:8px"><div style="font-weight:800;color:#5a32d6;font-size:12.5px;margin-bottom:2px">Хувилбар ' + k.L + ' · код <span class="cmx-cd">' + k.seed + '</span></div><div style="font-size:11px;margin-bottom:2px"><b>Тест:</b> ' + k.t + '</div><div style="font-size:11px"><b>Задгай:</b> ' + k.f + '</div></div>'; }).join('');
      html += pg ? '<div class="cmx-pg key"><div class="cmx-in">' + kb + '</div></div>' : '<div class="sheet cmx-vsheet">' + kb + '</div>';
      bx.innerHTML = html;
      render(bx);
      measure(bx, function () { try { adjustOpts(bx); } catch (e) {} if (pg) [].forEach.call(bx.querySelectorAll('.cmx-vset'), fitSet); });
      applyPage(pg);
      setPrintTarget('cmx-vbatch');
      function cleanup() { var b = document.getElementById('cmx-vbatch'); if (b) b.remove(); setPrintTarget(''); window.removeEventListener('afterprint', cleanup); }
      if (noPrint) return keys;
      window.addEventListener('afterprint', cleanup); setTimeout(function () { window.print(); }, 200);
      return keys;
    }
    CMX.variants = openVariantModal;
    CMX._variants = variants;            // тест: CMX._variants(N, true) — хэвлэхгүйгээр бэлтгэнэ
    CMX._before2up = before2up;          // тест: page.pdf() beforeprint үүсгэдэггүй
    CMX.cur = function () { return CUR; };
    CMX.load = load;
    CMX.paper = function (p) { if (p && PAPERS[p]) { PAPER = p; if (ps) ps.value = p; lsSet('cmx_paper', p); draw(); } return PAPER; };
    // Эхлэх код: ?v= → энэ төхөөрөмж дээр сүүлд нээсэн → шинэ
    var q0 = null; try { q0 = String(new URL(location.href).searchParams.get('v') || '').toUpperCase(); } catch (e) {}
    var l0 = lsGet(LSK);
    load(okSeed(q0) ? q0 : okSeed(l0) ? l0 : newSeed());
  }

  /* ───────── жишиг даалгавар ───────── */
  // cfg: { title, sub, grade, rule?, tasks: [{ label, gen, n (бодолтын зайгүй), nw (зайтай), cols, wk (мм) }] }; gen → { stem, a, fig? }
  // Цаас: A4 (анхдагч) / A5 — хэтэрсэн бодлогыг хасаж нэг хуудсанд багтаана.
  function jishig(cfg) {
    injectCSS();
    var JP = !inFrame && lsGet('cmx_jpaper') === 'a5' ? 'a5' : 'a4';   // дэвтрийн iframe-д үргэлж A4
    var bar = document.getElementById('bar'); bar.className = 'bar';
    bar.innerHTML = '<button class="btn refresh" type="button" onclick="build()">' + ICO.ref + 'Шинэ бодлого</button>'
      + '<label><input type="checkbox" id="sw" checked> Бодолтын зай</label>'
      + '<label><input type="checkbox" id="sa"> Хариу хавсаргах</label>'
      + (inFrame ? '' : '<label class="cmx-paperl">Цаас <select id="cmx-jpaper"><option value="a4">A4</option><option value="a5">A5</option></select></label>')
      + '<button class="btn" type="button" onclick="window.print()">' + ICO.prt + 'Хэвлэх / PDF</button>';
    var sw = document.getElementById('sw'), sa = document.getElementById('sa'), jp = document.getElementById('cmx-jpaper');
    sw.addEventListener('change', function () { window.layout(); });
    sa.addEventListener('change', toggleAns);
    if (jp) { jp.value = JP; jp.addEventListener('change', function () { JP = jp.value === 'a5' ? 'a5' : 'a4'; lsSet('cmx_jpaper', JP); window.layout(); }); }
    function toggleAns() { var el = document.getElementById('answers'); if (el) el.style.display = sa.checked ? 'block' : 'none'; }
    window.toggleAns = toggleAns;
    // ws-store нь хуудасны төгсгөлд хөл (≈10 мм) нэмдэг — түүнийг багтаана
    var FOOT = 10, POOL = null;
    function page() { return JP === 'a5' ? 210 - 16 - 3 - FOOT : 297 - 22 - 3 - FOOT; }
    // Бодлогуудыг үүсгэнэ (бодолтын зайгүй үеийн тоогоор — зайтай үед эхнийхийг нь авна)
    window.build = function () {
      var seen = {};
      POOL = cfg.tasks.map(function (tk) {
        var n = Math.max(tk.n || 8, tk.nw || 4), items = [];
        for (var c = 0, tries = 0; c < n && tries < n * 30; tries++) { var g = gen(tk.gen, function (x) { return x.stem && x.a != null && !seen[x.stem]; }); if (!g) break; seen[g.stem] = 1; items.push(g); c++; }
        return items;
      });
      window.layout();
    };
    window.layout = function () {
      if (!POOL) return window.build();
      var WK = sw.checked, K = 0;
      setPageCSS(JP === 'a5' ? 'A5' : 'A4', JP === 'a5' ? '8mm' : '11mm');
      var html = '<div class="head"><h1>' + esc(cfg.title) + '</h1><div class="sub">' + esc(cfg.sub || '') + (cfg.sub ? ' · ' : '') + esc(cfg.grade) + '</div></div>'
        + '<div class="meta"><span>Нэр: </span><span>Анги: </span><span>Огноо: </span><span>Оноо: </span></div>' + (cfg.rule ? '<div class="rule">' + cfg.rule + '</div>' : '');
      var ak = '';
      cfg.tasks.forEach(function (tk, ti) {
        var items = POOL[ti].slice(0, WK ? (tk.nw || 4) : (tk.n || 8)), cols = JP === 'a5' ? Math.min(2, tk.cols || 2) : (tk.cols || 2);
        html += '<div class="task">' + (ti + 1) + '. ' + esc(tk.label) + '</div><div class="grid" data-sec="' + ti + '" style="grid-template-columns:repeat(' + cols + ',1fr)">'
          + items.map(function (f) {
            var k = K++; ak += '<div class="a" data-k="' + k + '"><span class="an"></span>' + (String(f.a).indexOf('$') >= 0 ? f.a : '$' + f.a + '$') + '</div>';
            return '<div class="q" data-k="' + k + '"><div class="qeq"><span class="ql"></span><span class="qm">' + f.stem + '</span></div>' + (f.fig ? '<div class="fig">' + f.fig + '</div>' : '')
              + (WK ? '<div class="wk" style="height:' + (f.wk || tk.wk || 16) + 'mm"></div>' : '') + '</div>';
          }).join('') + '</div>';
      });
      html += '<div class="ans-page" id="answers"><h2>Хариунууд</h2><div class="ans-grid">' + ak + '</div></div>';
      var sh = document.getElementById('sheet'); sh.innerHTML = html;
      sh.classList.toggle('cmx-p12', WK);      // бодолтын зайтай бол 12pt — ws-store хэвлэхдээ ч ижил (cm-p12)
      sh.classList.toggle('cmx-js5', JP === 'a5');
      // дугаарыг багтаахаас ӨМНӨ тавина («10.» гэх мэт өргөн дугаар мөр нэмж болно), хассаны дараа дахин
      render(sh); relabel(sh); fit(sh, WK); relabel(sh); toggleAns();
      window.WS_ITEMS = []; window.WS_TITLE = cfg.title + ' (' + cfg.grade + ')';
    };
    function relabel(sh) {
      [].forEach.call(sh.querySelectorAll('.grid .q .ql'), function (el, i) { el.textContent = (i + 1) + '.'; });
      [].forEach.call(sh.querySelectorAll('#answers .a .an'), function (el, i) { el.textContent = (i + 1) + '.'; });
    }
    function bodyH(sh) { var a = sh.querySelector('#answers'), d = a ? a.style.display : ''; if (a) a.style.display = 'none'; var cs = getComputedStyle(sh), h = (sh.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / MM; if (a) a.style.display = d; return h; }
    // Нэг хуудсанд багтаах: хамгийн олон бодлоготой хэсгийн сүүлийнхийг хасна; зайтай бол илүү зайг мөрүүдэд тэнцүү хуваана.
    // Хэмжилт хэвлэлтийн өргөнөөр (дэлгэц нарийн байсан ч)
    function fit(sh, WK) {
      var PAGE = page(), w0 = sh.style.width, mw0 = sh.style.maxWidth;
      sh.style.width = JP === 'a5' ? '148mm' : '210mm'; sh.style.maxWidth = 'none'; sh.style.minHeight = '0';
      var ft = [].slice.call(sh.querySelectorAll('.cm-foot,.cm-wm')); ft.forEach(function (x) { x.style.display = 'none'; });
      try {
        // Хамгийн олон МӨРтэй даалгаврын сүүлийн мөрийг бүтнээр нь хасна (нэг нэгээр хасвал 4 баганатай хэсгийн өндөр
        // буурахгүйгээр бодлого үрэгдэнэ); даалгавар бүрт MINQ-аас доош бодлого үлдээхгүй
        var MINQ = JP === 'a5' ? 1 : 2;
        var colsOf = function (g) { return +((g.style.gridTemplateColumns.match(/repeat\((\d+)/) || [0, 2])[1]) || 2; };
        for (var guard = 0; guard < 200 && bodyH(sh) > PAGE; guard++) {
          var grids = sh.querySelectorAll('.grid'), best = null, br = 0;
          for (var s = grids.length - 1; s >= 0; s--) {
            var c = grids[s].querySelectorAll('.q').length, rws = Math.ceil(c / colsOf(grids[s]));
            if (c > MINQ && rws > br) { br = rws; best = grids[s]; }
          }
          if (!best) break;
          var qs = [].slice.call(best.querySelectorAll('.q')), cb = colsOf(best), inLast = qs.length - (Math.ceil(qs.length / cb) - 1) * cb;
          qs.slice(qs.length - Math.min(inLast, qs.length - MINQ)).forEach(function (q) {
            var a = sh.querySelector('#answers .a[data-k="' + q.getAttribute('data-k') + '"]');
            if (a) a.remove(); q.remove();
          });
        }
        // бодлого хасаад ч багтахгүй бол бодолтын хайрцгийг багасгана (≥8 мм)
        var over = bodyH(sh) - PAGE;
        if (over > 0 && WK) {
          var wks = [].slice.call(sh.querySelectorAll('.grid .wk')), rows2 = 0;
          [].forEach.call(sh.querySelectorAll('.grid'), function (g) { var cols = +((g.style.gridTemplateColumns.match(/repeat\((\d+)/) || [0, 2])[1]); rows2 += Math.ceil(g.querySelectorAll('.q').length / cols); });
          var cut2 = (over + 1) / Math.max(1, rows2);
          wks.forEach(function (w) { w.style.height = Math.max(8, parseFloat(w.style.height) - cut2) + 'mm'; });
        }
        if (WK) {
          var slack = PAGE - bodyH(sh), rows = [];
          [].forEach.call(sh.querySelectorAll('.grid'), function (g) {
            var cols = +((g.style.gridTemplateColumns.match(/repeat\((\d+)/) || [0, 2])[1]), qs = g.querySelectorAll('.q');
            for (var i = 0; i < qs.length; i += cols) rows.push([].slice.call(qs, i, i + cols));
          });
          if (slack > 2 && rows.length) {
            var add = Math.min(40, (slack - 1) / rows.length);
            rows.forEach(function (r) { r.forEach(function (q) { var w = q.querySelector('.wk'); if (w) w.style.height = (parseFloat(w.style.height) + add) + 'mm'; }); });
          }
        }
      } finally {
        ft.forEach(function (x) { x.style.display = ''; });
        sh.style.width = w0; sh.style.maxWidth = mw0; sh.style.minHeight = '';
      }
    }
    try { if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(function () { if (POOL) window.layout(); }); } catch (e) {}
    CMX.jpaper = function (p) { if (p === 'a4' || p === 'a5') { JP = p; if (jp) jp.value = p; window.layout(); } return JP; };
    window.build();
  }

  root.CMX = { exam: exam, jishig: jishig, answerSheet: answerSheet, H: H };
})(typeof window !== 'undefined' ? window : this);
