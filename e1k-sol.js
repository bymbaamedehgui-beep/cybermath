/* e1k-sol.js — ЭЕШ 1000 ажлын хуудасны «Бодолтын PPT».
   Тухайн үед үүссэн бодлогуудын (хуудас + seed) алхам алхмаар бодолтыг хөтөч дээр слайдаар тоглуулна — файл татагдахгүй.
   Нэг PPT = нэг бодлогын багц, үнийг сервер тогтооно (SOL_PPT_PRICE, анхдагч 2900₮), нэг удаа худалдаж авна.
     эрх:    POST /api/wsppt?action=sol_has {wstoken, slug, seed} → {owned, login, price, mine:[{seed,title,at}]}
     төлбөр: POST /api/qpay?action=create {plan:'solppt', slug, seed, title, wstoken} → QR → ?action=check (3 сек)
   e1k.js «Бодолтын PPT» товч → E1KSOL.open(ctx); ctx = { slug, seed, title, sub, first, nums, probs:[{q,a,s,sfig,fig,side}],
     render(el), ansTex(a), nwInline(h), rebuild(seed) → шинэ ctx }.
   Эрхгүй бол эхний бодлогыг үзүүлнэ (урьдчилж үзэх). */
(function () {
  'use strict';
  if (window.E1KSOL) return;
  var PRICE = 2900, POLL_MS = 3000, POLL_MAX = 200;
  var W = 1280, H = 720;                       // слайдын суурь хэмжээ (16:9), дэлгэцэнд тааруулж томруулна

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function tok() { return lsGet('cm_ws_token') || ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ymd(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function api(url, body) {
    var h = { 'Content-Type': 'application/json' }, at = lsGet('cm_admin_token');
    if (at) h.Authorization = 'Bearer ' + at;
    return fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body || {}) })
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d || {} }; }, function () { return { s: r.status, d: {} }; }); });
  }

  var ICO = {
    ppt: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="19" height="13" rx="1.6"/><path d="M12 16.5V21M8 21h8"/><path d="M10 7.5v5l4.2-2.5z" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    prev: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    next: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    full: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>',
    step: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h4v-4h4v-4h4V6h4"/></svg>',
    screen: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="19" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/></svg>',
    again: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    bank: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>'
  };

  /* ───────────────────────── стиль ───────────────────────── */
  var CSS = [
    /* цонх (худалдан авах, мэдээлэл) */
    '.e1s-ov{position:fixed;inset:0;z-index:2147482000;background:rgba(20,12,45,.6);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Segoe UI",Arial,sans-serif;color:#1a1030}',
    '.e1s-card{position:relative;width:min(520px,100%);max-height:calc(100vh - 32px);overflow-y:auto;background:#fff;border-radius:20px;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);animation:e1sin .22s ease}',
    '@keyframes e1sin{from{transform:translateY(14px);opacity:.4}to{transform:none;opacity:1}}',
    '.e1s-top{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #eee8fb;color:#5A32D6}.e1s-top h3{margin:0;flex:1;font-size:1.08rem;font-weight:900;color:#1a1030}',
    '.e1s-x{border:0;background:#f5f1ff;color:#5A32D6;width:36px;height:36px;border-radius:11px;display:grid;place-items:center;cursor:pointer}',
    '.e1s-in{padding:16px 18px 18px}',
    '.e1s-hero{display:flex;gap:14px;align-items:center;margin-bottom:12px}',
    '.e1s-thumb{flex:none;width:132px;aspect-ratio:16/9;border-radius:10px;background:linear-gradient(135deg,#1A1040,#3B1D8F);position:relative;overflow:hidden;box-shadow:0 10px 24px -12px rgba(28,18,64,.8)}',
    '.e1s-thumb i{position:absolute;left:12px;right:12px;height:7px;border-radius:4px;background:rgba(255,255,255,.85)}',
    '.e1s-thumb i:nth-child(1){top:14px;width:46%;background:#C4B5FD}.e1s-thumb i:nth-child(2){top:30px;width:70%}.e1s-thumb i:nth-child(3){top:44px;width:58%;opacity:.7}.e1s-thumb i:nth-child(4){top:58px;width:36%;opacity:.45}',
    '.e1s-thumb b{position:absolute;right:10px;bottom:9px;width:22px;height:22px;border-radius:50%;background:#7B52EE;display:grid;place-items:center}',
    '.e1s-thumb b:after{content:"";border-left:7px solid #fff;border-top:4.5px solid transparent;border-bottom:4.5px solid transparent;margin-left:2px}',
    '.e1s-lead{font-size:.93rem;line-height:1.5;color:#3b2a7a}.e1s-lead b{color:#5A32D6}',
    '.e1s-li{list-style:none;margin:6px 0 14px;padding:0;display:grid;gap:7px}.e1s-li li{display:flex;gap:9px;align-items:flex-start;font-size:.88rem;line-height:1.4;color:#3b2a7a}.e1s-li svg{flex:none;color:#7B52EE;margin-top:1px}',
    '.e1s-price{display:flex;align-items:baseline;justify-content:space-between;border-top:1px solid #f0eafc;padding-top:12px;margin-bottom:10px}',
    '.e1s-price span{font-size:.82rem;color:#7c7596;font-weight:700}.e1s-price b{font-size:1.45rem;font-weight:900;color:#1a1030}',
    '.e1s-go{width:100%;border:0;cursor:pointer;font-family:inherit;font-weight:900;font-size:.98rem;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7);border-radius:14px;padding:14px;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 12px 24px -12px rgba(91,50,214,.9)}',
    '.e1s-go:disabled{opacity:.55;cursor:default}',
    '.e1s-sec{margin-top:8px;width:100%;border:1px solid #e7ddff;background:#fff;color:#5A32D6;font-family:inherit;font-weight:800;font-size:.9rem;border-radius:12px;padding:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}',
    '.e1s-note{font-size:.78rem;color:#7c7596;margin-top:10px;line-height:1.45;text-align:center}',
    '.e1s-msg{font-size:.86rem;margin:10px 0 0;text-align:center;color:#5A32D6;line-height:1.45}.e1s-msg.err{color:#c0392b}.e1s-msg.ok{color:#15803d;font-weight:800}',
    '.e1s-mine{margin-top:14px;border-top:1px solid #f0eafc;padding-top:12px}.e1s-mine h4{margin:0 0 8px;font-size:.84rem;color:#5A32D6;font-weight:900}',
    '.e1s-mi{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px dashed #eee8fb;font-size:.85rem}.e1s-mi span{flex:1;color:#3b2a7a}.e1s-mi small{color:#7c7596}',
    '.e1s-mi button{border:0;background:#f5f1ff;color:#5A32D6;font-family:inherit;font-weight:800;font-size:.8rem;border-radius:9px;padding:6px 11px;cursor:pointer}',
    '.e1s-qr{text-align:center;margin-top:6px}.e1s-qr .cap{font-size:.82rem;color:#7c7596;margin-bottom:8px}.e1s-qr img.q{width:210px;max-width:72%;height:auto;aspect-ratio:1;display:block;margin:0 auto}',
    '.e1s-short{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-weight:800;font-size:.86rem;color:#5A32D6;text-decoration:none}',
    '.e1s-banks{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}.e1s-bank{display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;text-decoration:none}',
    '.e1s-bank img,.e1s-bank i{width:34px;height:34px;border-radius:9px;background:#f5f0ff;object-fit:contain;display:flex;align-items:center;justify-content:center;color:#7B52EE;font-style:normal}.e1s-bank span{max-width:100%;color:#555;font-size:.62rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.e1s-spin{width:28px;height:28px;border:3px solid #e7ddff;border-top-color:#7B52EE;border-radius:50%;margin:18px auto;animation:e1sr .8s linear infinite}@keyframes e1sr{to{transform:rotate(360deg)}}',

    /* тоглуулагч */
    '.e1s-pl{position:fixed;inset:0;z-index:2147483000;background:#120a2e;display:flex;flex-direction:column;font-family:"Segoe UI",Arial,sans-serif;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}',
    '.e1s-vp{flex:1;min-height:0;position:relative;overflow:hidden}',
    '.e1s-stage{position:absolute;left:50%;top:50%;width:' + W + 'px;height:' + H + 'px;transform-origin:center center;background:#fff;overflow:hidden;box-shadow:0 30px 80px -30px rgba(0,0,0,.8);cursor:pointer}',
    '.e1s-ctl{flex:none;display:flex;align-items:center;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom));color:#d9cef5;font-size:.86rem}',
    '.e1s-ctl button{border:0;background:rgba(255,255,255,.08);color:#fff;width:40px;height:38px;border-radius:10px;display:grid;place-items:center;cursor:pointer}',
    '.e1s-ctl button:hover{background:rgba(255,255,255,.16)}.e1s-ctl button:disabled{opacity:.35;cursor:default}',
    '.e1s-ctl .e1s-cnt{min-width:110px;text-align:center;font-weight:700;letter-spacing:.2px}.e1s-ctl .e1s-sp{flex:1}',
    '.e1s-ctl .e1s-tt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:40vw;color:#a99bd6;font-weight:600}',
    '.e1s-prog{flex:none;height:3px;background:rgba(255,255,255,.08)}.e1s-prog i{display:block;height:100%;width:0;background:linear-gradient(90deg,#7B52EE,#d946ef);transition:width .3s}',

    /* слайд */
    '.e1s-s{position:absolute;inset:0;padding:34px 48px 30px;display:flex;flex-direction:column;color:#241552;--fs:24px;font-size:var(--fs)}',
    '.e1s-hd{flex:none;display:flex;align-items:center;gap:16px;margin-bottom:16px}',
    '.e1s-badge{width:54px;height:54px;border-radius:14px;background:#7B52EE;color:#fff;display:grid;place-items:center;font-size:26px;font-weight:800}',
    '.e1s-ht{flex:1;font-size:30px;font-weight:700;color:#241552}.e1s-pg{font-size:17px;color:#6B6590;font-weight:600}',
    '.e1s-q{flex:none;background:#F3EEFF;border-radius:16px;padding:16px 24px;line-height:1.5;display:flex;gap:18px;align-items:flex-start}',
    '.e1s-q .e1s-qm{flex:1;min-width:0}.e1s-q .e1s-fig{flex:none;display:flex;justify-content:center;max-width:42%}',
    '.e1s-q.mini{font-size:.82em;padding:10px 20px;opacity:.85}',
    '.e1s-fig svg{display:block;max-width:100%;max-height:190px;width:auto;height:auto}',
    '.e1s-sfig svg{display:block;max-width:100%;height:auto}',
    '.e1s-steps.two{column-count:2;column-gap:40px;column-fill:auto}.e1s-steps.two .e1s-st{break-inside:avoid}',
    '.e1s-body{flex:1;min-height:0;display:flex;gap:28px;margin-top:18px}',
    '.e1s-steps{flex:1;min-width:0;overflow:hidden}',
    '.e1s-st{display:flex;gap:14px;align-items:flex-start;margin:0 0 .55em}',
    '.e1s-sn{flex:none;width:34px;height:34px;border-radius:50%;background:#7B52EE;color:#fff;display:grid;place-items:center;font-size:17px;font-weight:800;margin-top:.12em;opacity:0;transform:scale(.6);transition:opacity .35s,transform .45s cubic-bezier(.3,1.5,.5,1)}',
    '.e1s-sn.on{opacity:1;transform:none}',
    '.e1s-sc{flex:1;min-width:0;line-height:1.45}',
    '.e1s-b{opacity:0;transform:translateY(8px);transition:opacity .45s ease,transform .45s ease}.e1s-b.on{opacity:1;transform:none}',
    '.e1s-b+.e1s-b{margin-top:.25em}',
    // wipe: босоо болон зүүн/баруун талд өргөн нөөц — өндөр хаалт, зэргийн бутархай, налуу үсэг тайрагдахгүй
    '.e1s-eq{opacity:1;transform:none;clip-path:inset(-60% 100% -60% -4%);transition:clip-path .75s cubic-bezier(.45,.2,.2,1)}.e1s-eq.on{clip-path:inset(-60% -8% -60% -4%)}',
    '.e1s-eq .katex-display{margin:.1em 0;text-align:left}.e1s-eq .katex-display>.katex{text-align:left}',
    '.e1s-sc p{margin:0}.e1s-sc b{color:#5A32D6}',
    '.e1s-sfig{flex:none;max-width:40%;align-self:flex-start;background:#F7F5FC;border:1px solid #E3DCF3;border-radius:14px;padding:14px;opacity:0;transition:opacity .5s}.e1s-sfig.on{opacity:1}',
    '.e1s-ans{display:inline-flex;margin:.35em 0 0 48px;background:#EAE2FF;border:1.5px solid #7B52EE;border-radius:16px;padding:.35em .9em;font-size:1.08em;color:#241552;gap:14px;align-items:baseline;max-width:calc(100% - 48px);',
    'opacity:0;transform:scale(.55);transform-origin:left center;transition:opacity .35s,transform .55s cubic-bezier(.3,1.45,.5,1)}',
    '.e1s-ans.on{opacity:1;transform:none}.e1s-ans>b{color:#5A32D6;font-size:.8em;white-space:nowrap}',
    '.e1s-s .e1k-tbl{border-collapse:collapse;margin:.2em 0;font-size:.9em}.e1s-s .e1k-tbl th,.e1s-s .e1k-tbl td{border:1px solid #6B6590;padding:2px 12px;text-align:center;font-weight:400}',
    '.e1s-s .nw{white-space:nowrap}.e1s-s .katex{font-size:1.08em}',
    '.e1s-foot{position:absolute;left:48px;bottom:12px;font-size:13px;color:#a39dbd}',
    /* нүүр / хариу / түгжээ */
    '.e1s-dark{background:linear-gradient(135deg,#1A1040,#3B1D8F);color:#fff;justify-content:center;padding:60px 80px}',
    '.e1s-pill{align-self:flex-start;border:1.5px solid #C4B5FD;color:#C4B5FD;border-radius:999px;padding:7px 18px;font-size:17px;font-weight:700;letter-spacing:.5px}',
    '.e1s-dark h1{font-size:56px;font-weight:800;margin:22px 0 8px;line-height:1.12;max-width:820px}.e1s-dark .sub{font-size:22px;color:#D9CEF5;max-width:780px;line-height:1.4}',
    '.e1s-meta{margin-top:30px;display:flex;gap:12px;flex-wrap:wrap;max-width:780px}.e1s-meta span{background:rgba(123,82,238,.45);border-radius:999px;padding:9px 18px;font-size:18px;font-weight:600}',
    '.e1s-dark .hint{position:absolute;left:80px;bottom:44px;font-size:17px;color:#C4B5FD}.e1s-dark kbd{font-family:inherit;border:1.5px solid #C4B5FD;border-radius:7px;padding:1px 8px;margin:0 3px}',
    '.e1s-motif{position:absolute;right:70px;top:110px;width:330px;height:470px}',
    '.e1s-motif .c{position:absolute;border-radius:50%;background:rgba(42,24,112,.85);border:1.5px solid #7B52EE;display:grid;place-items:center;color:#fff;font-style:normal}',
    '.e1s-agrid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:6px;flex:1;align-content:start}',
    '.e1s-agrid div{background:#F7F5FC;border:1px solid #E3DCF3;border-radius:12px;padding:8px 10px;min-height:74px;display:flex;flex-direction:column;justify-content:space-between;font-size:.8em;overflow:hidden}',
    '.e1s-agrid div b{color:#5A32D6;font-size:15px}.e1s-agrid div span{text-align:center;white-space:nowrap}',
    '.e1s-agrid{grid-auto-flow:dense}.e1s-agrid div.w2{grid-column:span 2}',
    '.e1s-lock{align-items:center;justify-content:center;text-align:center;background:#F7F5FC}',
    '.e1s-lock .ic{color:#7B52EE;margin-bottom:10px}.e1s-lock h2{font-size:38px;font-weight:800;margin:0 0 10px}.e1s-lock p{font-size:21px;color:#3b2a7a;max-width:760px;line-height:1.5}',
    '.e1s-lock button{margin-top:26px;border:0;cursor:pointer;font-family:inherit;font-weight:900;font-size:22px;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7);border-radius:16px;padding:16px 34px;box-shadow:0 16px 30px -14px rgba(91,50,214,.9)}',
    '.e1s-prev{position:absolute;bottom:10px;right:24px;background:#1C1240;color:#fff;border-radius:999px;padding:5px 14px;font-size:13px;font-weight:700}',
    '.e1s-pl.portrait .e1s-vp:before{content:"Утсаа хэвтээ эргүүлбэл слайд том харагдана";position:absolute;left:50%;top:14px;transform:translateX(-50%);z-index:2;background:rgba(123,82,238,.9);color:#fff;font-size:13px;font-weight:700;border-radius:999px;padding:6px 14px;white-space:nowrap}',
    '@media print{.e1s-pl,.e1s-ov{display:none!important}}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('e1s-css')) return;
    var st = document.createElement('style'); st.id = 'e1s-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  /* ───────────────────────── эрх, худалдан авалт ───────────────────────── */
  var CTX = null, OV = null, inv = null, invEmail = '', pollT = null, polls = 0;
  function num(i) { return CTX.nums ? CTX.nums[i] : CTX.first + i; }
  function closeOv() { if (pollT) { clearInterval(pollT); pollT = null; } if (OV) { OV.remove(); OV = null; } inv = null; document.removeEventListener('keydown', ovKey); }
  function ovKey(e) { if (e.key === 'Escape') closeOv(); }
  function showOv(inner) {
    injectCSS();
    if (!OV) {
      OV = document.createElement('div'); OV.className = 'e1s-ov';
      OV.addEventListener('click', function (e) { if (e.target === OV) closeOv(); });
      document.body.appendChild(OV); document.addEventListener('keydown', ovKey);
    }
    OV.innerHTML = '<div class="e1s-card" role="dialog" aria-modal="true" aria-label="Бодолтын PPT"><div class="e1s-top">' + ICO.ppt
      + '<h3>Бодолтын PPT</h3><button type="button" class="e1s-x" aria-label="Хаах">' + ICO.x + '</button></div><div class="e1s-in">' + inner + '</div></div>';
    OV.querySelector('.e1s-x').onclick = closeOv;
    return OV.querySelector('.e1s-in');
  }
  function msg(cls, html) { var m = OV && OV.querySelector('[data-msg]'); if (m) { m.className = 'e1s-msg' + (cls ? ' ' + cls : ''); m.innerHTML = html; } }

  function open(ctx) {
    CTX = ctx;
    showOv('<div class="e1s-spin"></div><div class="e1s-msg">Шалгаж байна…</div>');
    api('/api/wsppt?action=sol_has', { wstoken: tok(), slug: ctx.slug, seed: ctx.seed }).then(function (x) {
      var d = x.d;
      if (!d.ok) { return info({ err: d.error || 'Түр алдаа гарлаа. Дахин оролдоно уу.' }); }
      if (d.price) PRICE = +d.price || PRICE;
      if (d.owned) { closeOv(); return play(true); }
      info({ login: !!d.login, mine: Array.isArray(d.mine) ? d.mine : [] });
    }, function () { info({ err: 'Сүлжээний алдаа. Дахин оролдоно уу.' }); });
  }

  function info(o) {
    var n = CTX.probs.length;
    var h = '<div class="e1s-hero"><div class="e1s-thumb"><i></i><i></i><i></i><i></i><b></b></div>'
      + '<div class="e1s-lead">Энэ хуудасны <b>' + n + ' бодлогын</b> бодолт алхам алхмаар, анимейшнтэй слайдаар. Тоонууд нь <b>яг энэ хуудасныхтай</b> ижил.</div></div>'
      + '<ul class="e1s-li"><li>' + ICO.step + 'Товших бүрт бодолтын дараагийн алхам гарна, хариу хамгийн сүүлд.</li>'
      + '<li>' + ICO.screen + 'Самбар, проектороор бүтэн дэлгэцээр үзүүлнэ.</li>'
      + '<li>' + ICO.again + 'Нэг удаа худалдаж аваад хүссэн үедээ дахин нээнэ.</li></ul>'
      + '<div class="e1s-price"><span>Нэг PPT (энэ ' + n + ' бодлого)</span><b>' + fmt(PRICE) + '₮</b></div>'
      + '<button type="button" class="e1s-go" data-buy>' + ICO.ppt + (tok() ? 'QPay-аар худалдаж авах' : 'Нэвтэрч худалдаж авах') + '</button>'
      + '<button type="button" class="e1s-sec" data-prev>Эхний бодлогыг үзэх</button>'
      + '<div class="e1s-msg' + (o.err ? ' err' : '') + '" data-msg>' + (o.err ? esc(o.err) : '') + '</div>'
      + '<div class="e1s-note">«Шинэ бодлого» дарвал тоонууд өөрчлөгдөж, шинэ PPT болно.</div>';
    var mine = (o.mine || []).filter(function (x) { return x.seed !== CTX.seed; });
    if (mine.length) {
      h += '<div class="e1s-mine"><h4>Энэ хуудсанд худалдаж авсан PPT</h4>' + mine.slice(0, 12).map(function (x, k) {
        return '<div class="e1s-mi"><span>Багц ' + esc(x.seed) + ' <small>· ' + esc(ymd(x.at)) + '</small></span><button type="button" data-mine="' + k + '">Нээх</button></div>';
      }).join('') + '</div>';
    }
    var box = showOv(h);
    box.querySelector('[data-buy]').onclick = buy;
    box.querySelector('[data-prev]').onclick = function () { closeOv(); play(false); };
    [].forEach.call(box.querySelectorAll('[data-mine]'), function (b) {
      b.onclick = function () { var it = mine[+b.getAttribute('data-mine')]; closeOv(); CTX = CTX.rebuild(it.seed); open(CTX); };
    });
  }

  function needLogin() {
    try { sessionStorage.setItem('e1k_sol_pending', JSON.stringify({ slug: CTX.slug, seed: CTX.seed, t: Date.now() })); } catch (e) {}
    location.href = '/worksheets?login=1&next=' + encodeURIComponent(location.pathname);
  }
  function bankItem(u) {
    if (!u || typeof u !== 'object') return '';
    var link = String(u.link || u.url || ''); if (!link || /^\s*(javascript|data|vbscript):/i.test(link)) return '';
    var name = String(u.name || u.description || 'Банк'), logo = String(u.logo || ''), okLogo = /^https:\/\//i.test(logo);
    return '<a class="e1s-bank" href="' + esc(link) + '">' + (okLogo ? '<img alt="" src="' + esc(logo) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' : '')
      + '<i' + (okLogo ? ' style="display:none"' : '') + '>' + ICO.bank + '</i><span>' + esc(name) + '</span></a>';
  }
  function buy() {
    if (!tok()) return needLogin();
    var b = OV && OV.querySelector('[data-buy]'); if (b) b.disabled = true;
    msg('', 'Нэхэмжлэх үүсгэж байна…');
    api('/api/qpay?action=create', { plan: 'solppt', slug: CTX.slug, seed: CTX.seed, title: CTX.title, wstoken: tok() }).then(function (x) {
      var d = x.d;
      if (x.s === 401 || d.needLogin) return needLogin();
      if (d.owned) { closeOv(); return play(true); }
      if (b) b.disabled = false;
      if (!d.ok || !d.invoice || !d.invoice.invoice_id) return msg('err', esc(d.error || 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.'));
      inv = d.invoice; invEmail = String(d.email || '').toLowerCase(); showInvoice(d.amount);
    }, function () { if (b) b.disabled = false; msg('err', 'Сүлжээний алдаа. Дахин оролдоно уу.'); });
  }
  function showInvoice(amount) {
    var img = typeof inv.qr_image === 'string' ? inv.qr_image.replace(/\s+/g, '') : '';
    var h = '<div class="e1s-lead" style="margin-bottom:6px">' + esc(CTX.title) + ' — <b>' + CTX.probs.length + ' бодлогын</b> бодолтын PPT · <b>' + fmt(amount || PRICE) + '₮</b></div>'
      + '<div class="e1s-qr"><div class="cap">QPay эсвэл банкны аппаар уншуулж төлнө үү</div>';
    if (img && /^[A-Za-z0-9+\/=]+$/.test(img)) h += '<img class="q" alt="QPay QR" src="data:image/png;base64,' + img + '">';
    if (typeof inv.qPay_shortUrl === 'string' && /^https:\/\//i.test(inv.qPay_shortUrl)) h += '<div><a class="e1s-short" href="' + esc(inv.qPay_shortUrl) + '" target="_blank" rel="noopener">' + ICO.phone + 'Утаснаас төлөх</a></div>';
    var banks = (Array.isArray(inv.urls) ? inv.urls : []).map(bankItem).join('');
    if (banks) h += '<div class="e1s-banks">' + banks + '</div>';
    h += '</div><div class="e1s-msg" data-msg>Төлбөрийг хүлээж байна…</div>';
    showOv(h);
    poll();
  }
  function poll() {
    if (pollT) clearInterval(pollT); polls = 0;
    pollT = setInterval(function () {
      if (!OV || !inv) { clearInterval(pollT); pollT = null; return; }
      if (++polls > POLL_MAX) {
        clearInterval(pollT); pollT = null;
        msg('err', 'Төлбөр баталгаажсангүй. Төлсөн бол «Дахин шалгах»-ыг дарна уу.');
        var b = document.createElement('button'); b.type = 'button'; b.className = 'e1s-sec'; b.textContent = 'Дахин шалгах';
        b.onclick = function () { b.remove(); msg('', 'Төлбөрийг хүлээж байна…'); poll(); };
        OV.querySelector('.e1s-in').appendChild(b);
        return;
      }
      api('/api/qpay?action=check', { invoice_id: inv.invoice_id, email: invEmail }).then(function (x) {
        var c = x.d;
        if (!c || c.paid !== true || !pollT) return;
        clearInterval(pollT); pollT = null; inv = null;
        var box = showOv('<div class="e1s-msg ok" style="font-size:1rem">' + ICO.check + ' Төлбөр баталгаажлаа!</div>'
          + '<div class="e1s-note" style="margin-bottom:12px">Энэ PPT таны дансанд хадгалагдлаа. Дараа нь энэ хуудасны «Бодолтын PPT» товч → «Энэ хуудсанд худалдаж авсан PPT» жагсаалтаас дахин нээнэ.</div>'
          + '<button type="button" class="e1s-go" data-play>' + ICO.ppt + 'Үзэж эхлэх</button>');
        box.querySelector('[data-play]').onclick = function () { closeOv(); play(true); };
      }, function () {});
    }, POLL_MS);
  }

  /* ───────────────────────── тоглуулагч ───────────────────────── */
  var PL = null, STAGE = null, SL = [], cur = 0, step = 0, beatsNow = [], full = false;

  // Бодолтын мөрийг алхмуудад хуваана: текст (бүдгэрч гарна), $$…$$ тэгшитгэл (зүүнээс бичигдэнэ)
  function beatsOf(html) {
    var s = String(html == null ? '' : html);
    if (/<(table|div|svg)\b/i.test(s)) return [{ k: 'tx', h: s }];
    var out = [];
    s.split(/(\$\$[\s\S]+?\$\$)/).forEach(function (p) {
      if (!p) return;
      if (/^\$\$/.test(p)) { out.push({ k: 'eq', h: p }); return; }
      var t = p.replace(/^\s+|\s+$/g, '');
      if (!t) return;
      if (/^[.,;:]+$/.test(t) && out.length) { out[out.length - 1].h += t; return; }
      out.push({ k: 'tx', h: t });
    });
    return out.length ? out : [{ k: 'tx', h: s }];
  }

  function nSteps(i) { var s = CTX.probs[i].s; return Array.isArray(s) ? s.length : 1; }
  // Бодлогын слайд: { t:'prob', i, a, b } — a…b-1 дугаартай алхмууд (багтахгүй бол renderSlide хоёр слайдад хуваана)
  function deck() {
    var out = [{ t: 'title' }];
    CTX.probs.forEach(function (g, i) { if (full || i === 0) out.push({ t: 'prob', i: i, a: 0, b: nSteps(i) }); });
    out.push(full ? { t: 'answers' } : { t: 'lock' });
    return out;
  }

  function slideTitle() {
    var n = CTX.probs.length;
    return '<div class="e1s-s e1s-dark"><div class="e1s-pill">Бодолтын PPT</div><h1>' + esc(CTX.title) + '</h1>'
      + (CTX.sub ? '<div class="sub">' + esc(CTX.sub) + '</div>' : '')
      + '<div class="e1s-meta"><span>' + n + ' бодлого</span><span>Алхам алхмаар бодолт</span><span>Багц ' + esc(CTX.seed) + '</span></div>'
      + '<div class="e1s-motif">'
      + '<i class="c" style="left:40px;top:0;width:150px;height:150px;font-size:44px">$\\sqrt{x}$</i>'
      + '<i class="c" style="left:210px;top:90px;width:110px;height:110px;font-size:34px">$\\pi$</i>'
      + '<i class="c" style="left:0;top:190px;width:120px;height:120px;font-size:36px">$x^{2}$</i>'
      + '<i class="c" style="left:150px;top:250px;width:160px;height:160px;font-size:40px">$\\dfrac{a}{b}$</i>'
      + '<i class="c" style="left:30px;top:350px;width:100px;height:100px;font-size:32px">%</i></div>'
      + '<div class="hint"><kbd>→</kbd> эсвэл <kbd>Space</kbd> — дараагийн алхам · <kbd>←</kbd> — буцах · <kbd>F</kbd> — бүтэн дэлгэц</div></div>';
  }

  // KaTeX inline томьёог «=»-ийн ард мөр хооронд тасалдаг: тасарсан томьёо хайрцагтаа бүтнээрээ багтах бол
  // мөр таслахгүй болгоно (бүхэлдээ дараагийн мөрөнд шилжинэ). Бодлогын нөхцөл ба бодолтын алхамд аль алинд.
  function unwrap(sl) {
    [].forEach.call(sl.querySelectorAll('.katex'), function (k) {
      if (k.closest('.katex-display')) return;
      var rs = k.getClientRects(); if (rs.length < 2) return;
      var w = 0, i, box = k.closest('.e1s-qm, .e1s-b, .e1s-ans'); if (!box) return;
      for (i = 0; i < rs.length; i++) w += rs[i].width;
      if (w < box.getBoundingClientRect().width - 6) k.style.whiteSpace = 'nowrap';
    });
  }

  // «(» мөрийн төгсгөлд ганцаараа үлдэж томьёо нь дараагийн мөрөнд шилжихгүй: томьёоны (эсвэл .nw бүрхүүлийн) өмнөх
  // нээх хаалт/хашилтыг томьёотой нь нэг nowrap хэсэг болгоно. Зөвхөн богино (хайрцгийн 60%-иас нарийн) томьёонд —
  // урт томьёоны дотоод мөр таслалтыг хаахгүй.
  function glue(sl) {
    [].forEach.call(sl.querySelectorAll('.katex'), function (k) {
      if (k.closest('.katex-display')) return;
      var box = k.closest('.e1s-qm, .e1s-b, .e1s-ans'); if (!box) return;
      // auto-render томьёог ангигүй <span>-д, nwInline түүнийг .nw-д ороодог: эхний хүүхэд байх хүртэл дээш
      var el = k, p;
      while ((p = el.parentNode) && p !== box && p.tagName === 'SPAN' && p.firstChild === el && (!p.className || p.classList.contains('nw'))) el = p;
      var t = el.previousSibling;
      if (!t || t.nodeType !== 3 || !/[(\[«]$/.test(t.nodeValue)) return;
      var w = 0, rs = el.getClientRects(), i;
      for (i = 0; i < rs.length; i++) w += rs[i].width;
      if (w > box.getBoundingClientRect().width * 0.6) return;
      var g = document.createElement('span'); g.className = 'nw';
      g.appendChild(document.createTextNode(t.nodeValue.slice(-1)));
      t.nodeValue = t.nodeValue.slice(0, -1);
      el.parentNode.insertBefore(g, el); g.appendChild(el);
    });
  }

  // Бодлогын нөхцөл: хайрцаг өргөн (≈1180px) тул 70 хүртэлх тэмдэгтийн inline томьёог (дагавартай нь) мөр таслахгүй
  // (nwInline-ийн 40 нь бодолтын нарийн баганад зориулсан). $$…$$-д хүрэхгүй.
  function qWrap(h) {
    return String(h).split('$$').map(function (seg, k) {
      return k % 2 ? seg : seg.replace(/\$([^$]+)\$((?:-[^\s$<.,;:!?)]+)?[.,;:!?)]*)/g, function (m, t, tail) {
        return t.length > 70 ? m : '<span class="nw">$' + t + '$' + tail + '</span>';
      });
    }).join('$$');
  }

  // Хариуны мөр: KaTeX «=»-ийн ард мөр тасалдаг тул «g =» / «5» болж хуваагдахгүйгээр томьёо бүрийг (ард нь залгасан
  // таслал/цэгтэй нь) нэг мөрөнд барина; «$a=1,\ b=6,\ …$» гэх нэг томьёог дээд түвшний таслалаар хэсэг болгоно
  // (хаалт/олонлог доторх таслалд хүрэхгүй). Нүдтэй хариу «$a=1$, $b=6$, …» (Bx.key) ч мөн адил.
  function ansGroups(h) {
    h = String(h);
    if (h.indexOf('$$') >= 0) return h;
    var sp = /^(?:\s|\\[ ,;:!]|\\q?quad)+|(?:\s|\\[ ,;:!]|\\q?quad)+$/g;
    return h.replace(/\$([^$]+)\$([.,;:]?)/g, function (m, t, tail) {
      var parts = [], d = 0, s = 0, i, c;
      for (i = 0; i < t.length; i++) {
        c = t.charAt(i);
        if (c === '\\') { c = t.charAt(i + 1); if (c === '{') d++; else if (c === '}') d--; i++; continue; }
        if (c === '{' || c === '(' || c === '[') d++;
        else if (c === '}' || c === ')' || c === ']') d--;
        else if (c === ',' && d === 0) { parts.push(t.slice(s, i)); s = i + 1; }
      }
      parts.push(t.slice(s));
      if (parts.length < 2 || d !== 0) return t.length > 40 ? m : '<span class="nw">' + m + '</span>';
      return parts.map(function (p, k) {
        return '<span class="nw">$' + p.replace(sp, '') + '$' + (k < parts.length - 1 ? ',' : tail) + '</span>';
      }).join(' ');
    });
  }

  function slideProb(sd) {
    var i = sd.i, g = CTX.probs[i], n = num(i), N = CTX.probs.length, last = sd.b >= nSteps(i);
    // слайдад хэвтээ зай их тул бодлогын зургийг үргэлж текстийн баруун талд (өндөр нь хязгаартай)
    var fig = g.fig ? '<div class="e1s-fig">' + g.fig + '</div>' : '';
    var h = '<div class="e1s-s"><div class="e1s-hd"><span class="e1s-badge">' + n + '</span><span class="e1s-ht">Бодлого ' + n + (sd.a > 0 ? ' (үргэлжлэл)' : '') + '</span><span class="e1s-pg">' + (i + 1) + ' / ' + N + '</span></div>'
      + '<div class="e1s-q' + (sd.a > 0 ? ' mini' : '') + '"><div class="e1s-qm">' + qWrap(g.q) + '</div>' + (sd.a > 0 ? '' : fig) + '</div><div class="e1s-body"><div class="e1s-steps">';
    (Array.isArray(g.s) ? g.s : [g.s]).forEach(function (p, k) {
      if (k < sd.a || k >= sd.b) return;
      var bs = beatsOf(CTX.nwInline ? CTX.nwInline(p) : p);
      h += '<div class="e1s-st"><span class="e1s-sn">' + (k + 1) + '</span><div class="e1s-sc">'
        + bs.map(function (b) { return '<div class="e1s-b' + (b.k === 'eq' ? ' e1s-eq' : '') + '">' + b.h + '</div>'; }).join('')
        + '</div></div>';
    });
    if (last) h += '<div class="e1s-ans"><b>Хариу:</b><span>' + ansGroups(CTX.ansTex(g.a)) + '</span></div>';
    h += '</div>' + (g.sfig ? '<div class="e1s-sfig">' + g.sfig + '</div>' : '') + '</div>'
      + (full ? '' : '<div class="e1s-prev">Урьдчилж үзэх</div>')
      + '<div class="e1s-foot">cyber-math.com · ' + esc(CTX.title) + '</div></div>';
    return h;
  }

  function slideAnswers() {
    return '<div class="e1s-s"><div class="e1s-hd"><span class="e1s-ht">Хариунууд</span><span class="e1s-pg">' + esc(CTX.title) + '</span></div><div class="e1s-agrid">'
      + CTX.probs.map(function (g, i) {
        // урт хариу хоёр нүд эзэлнэ (мөр таслагдахгүй)
        var a = CTX.ansTex(g.a), ln = String(a).replace(/<[^>]*>/g, '').replace(/\\[a-z]+/gi, '').replace(/[${}\\]/g, '').length;
        return '<div' + (ln > 16 ? ' class="w2"' : '') + '><b>' + num(i) + '</b><span>' + a + '</span></div>';
      }).join('')
      + '</div><div class="e1s-foot">cyber-math.com · Багц ' + esc(CTX.seed) + '</div></div>';
  }

  function slideLock() {
    var n = CTX.probs.length;
    return '<div class="e1s-s e1s-lock"><div class="ic">' + ICO.lock + '</div><h2>Үлдсэн ' + (n - 1) + ' бодлогын бодолт</h2>'
      + '<p>Энэ хуудасны бүх бодлогын бодолтыг алхам алхмаар, анимейшнтэй слайдаар үзэхийн тулд PPT-г худалдаж авна уу.</p>'
      + '<button type="button" data-buy>Худалдаж авах — ' + fmt(PRICE) + '₮</button></div>';
  }

  // Слайдын агуулгыг 1280×720-д багтаана (бүх алхам орон зайгаа эзэлсэн байдлаар хэмжинэ):
  // үсгийн хэмжээ 24→17px; багтахгүй бол (бодолтын зураггүй үед) хоёр баганаар 22→15px. Багтвал true.
  // Мөр/баганаас өргөн томьёог (өндрөөр багтсан ч баруун тал нь тайрагдана) тухайн мөрөнд нь ≥ 80% хүртэл жижигрүүлнэ.
  function fit(sl) {
    var body = sl.querySelector('.e1s-body');
    if (!body) return true;
    var steps = body.querySelector('.e1s-steps'), sf = body.querySelector('.e1s-sfig'), bs = steps.querySelectorAll('.e1s-b');
    function size(fs) { sl.style.setProperty('--fs', fs + 'px'); }
    function narrow(minR) {
      var i, b, r;
      for (i = 0; i < bs.length; i++) bs[i].style.fontSize = '';
      for (i = 0; i < bs.length; i++) {
        b = bs[i];
        if (b.scrollWidth <= b.clientWidth + 1) continue;
        r = b.clientWidth / b.scrollWidth;
        if (r < minR) return false;
        b.style.fontSize = (Math.floor(r * 100) - 1) / 100 + 'em';
      }
      return true;
    }
    function ok(minR) {
      if (!narrow(minR)) return false;
      // .e1s-s нь байрлалтай тул хүүхдүүдийн offsetTop нь слайдын дотор (масштабгүй). Алхмуудын (ба хариуны) бодит доод ирмэг
      // + бодолтын зураг; доод талд хөлийн зай үлдээнэ. Хоёр баганад илүүдэл нь гуравдах багана руу (scrollWidth) гарна.
      var bottom = 0;
      [].forEach.call(steps.children, function (c) { bottom = Math.max(bottom, c.offsetTop + c.offsetHeight); });
      if (sf) bottom = Math.max(bottom, sf.offsetTop + sf.offsetHeight);
      return bottom <= H - 34 && steps.scrollWidth <= steps.clientWidth + 1;
    }
    var fs;
    for (fs = 24; fs >= 17; fs--) { size(fs); if (ok(0.8)) return true; }
    if (sf) { for (fs = 16; fs >= 15; fs--) { size(fs); if (ok(0.8)) return true; } }
    else {
      steps.classList.add('two');
      for (fs = 22; fs >= 15; fs--) { size(fs); if (ok(0.8)) return true; }
      steps.classList.remove('two');
    }
    // Багтахгүй (дуудагч алхмуудыг хуваана; ганц алхам үлдвэл ийм хэвээр): нэг багана, өргөн томьёог хязгааргүй жижигрүүлнэ
    for (fs = sf ? 15 : 17; fs >= 14; fs--) { size(fs); if (ok(0)) break; }
    return false;
  }

  function renderSlide(revealAll) {
    var sd = SL[cur], h;
    if (sd.t === 'title') h = slideTitle();
    else if (sd.t === 'prob') h = slideProb(sd);
    else if (sd.t === 'answers') h = slideAnswers();
    else h = slideLock();
    STAGE.innerHTML = h;
    var sl = STAGE.firstChild;
    CTX.render(sl);
    unwrap(sl);
    glue(sl);
    var lb = sl.querySelector('[data-buy]');
    if (lb) lb.onclick = function (e) { e.stopPropagation(); closePlayer(); info({ login: !!tok(), mine: [] }); };
    beatsNow = [];
    if (sd.t === 'prob') {
      // дараалал: алхам бүрийн эхний мөр дугаартайгаа, дараа нь бусад мөр; бодолтын зураг эхний алхамтай; хариу хамгийн сүүлд
      var seq = [];
      [].forEach.call(sl.querySelectorAll('.e1s-st'), function (st) {
        var bs = st.querySelectorAll('.e1s-b'), sn = st.querySelector('.e1s-sn');
        [].forEach.call(bs, function (b, j) { seq.push(j === 0 ? [b, sn] : [b]); });
      });
      var sf = sl.querySelector('.e1s-sfig'); if (sf && seq.length) seq[0].push(sf);
      var an = sl.querySelector('.e1s-ans'); if (an) seq.push([an]);
      beatsNow = seq;
      if (!fit(sl) && sd.b - sd.a > 1) {
        // багтахгүй — алхмуудыг (мөрийн тоогоор тэнцвэржүүлж) хоёр слайдад хуваагаад дахин зурна
        var w = [], tot = 0, acc = 0, k = sd.a + 1;
        var ss = CTX.probs[sd.i].s;
        for (var j = sd.a; j < sd.b; j++) { var c = beatsOf(ss[j]).length + 1; w.push(c); tot += c; }
        for (j = 0; j < w.length - 1; j++) { acc += w[j]; if (acc >= tot / 2) { k = sd.a + j + 1; break; } k = sd.a + j + 2; }
        k = Math.max(sd.a + 1, Math.min(sd.b - 1, k));
        SL.splice(cur, 1, { t: 'prob', i: sd.i, a: sd.a, b: k }, { t: 'prob', i: sd.i, a: k, b: sd.b });
        return renderSlide(revealAll);
      }
    }
    unwrap(sl);   // fit() үсгийн хэмжээг өөрчилсний дараа мөр тасралтыг дахин засна
    step = revealAll ? beatsNow.length : 0;
    for (var i = 0; i < beatsNow.length; i++) beatsNow[i].forEach(function (el) { el.classList.toggle('on', i < step); });
    ui();
  }

  function next() {
    if (step < beatsNow.length) { beatsNow[step].forEach(function (el) { el.classList.add('on'); }); step++; ui(); return; }
    if (cur < SL.length - 1) { cur++; renderSlide(false); }
  }
  function prev() {
    if (step > 0) { step--; beatsNow[step].forEach(function (el) { el.classList.remove('on'); }); ui(); return; }
    if (cur > 0) { cur--; renderSlide(true); }
  }
  function go(i) { cur = Math.max(0, Math.min(SL.length - 1, i)); renderSlide(false); }

  function ui() {
    if (!PL) return;
    var cnt = PL.querySelector('.e1s-cnt'), pr = PL.querySelector('.e1s-prog i');
    var sd = SL[cur], lbl = sd.t === 'prob' ? 'Бодлого ' + num(sd.i) : sd.t === 'title' ? 'Нүүр' : sd.t === 'answers' ? 'Хариунууд' : 'Урьдчилж үзэх';
    cnt.textContent = (cur + 1) + ' / ' + SL.length + (beatsNow.length ? ' · ' + step + '/' + beatsNow.length : '');
    PL.querySelector('.e1s-tt').textContent = lbl;
    pr.style.width = Math.round(100 * (cur + (beatsNow.length ? step / beatsNow.length : 1)) / SL.length) + '%';
    PL.querySelector('[data-p]').disabled = cur === 0 && step === 0;
    PL.querySelector('[data-n]').disabled = cur === SL.length - 1 && step >= beatsNow.length;
  }

  function scale() {
    if (!PL) return;
    var vp = PL.querySelector('.e1s-vp'), w = vp.clientWidth, hh = vp.clientHeight;
    var k = Math.min(w / W, hh / H) * 0.98;
    STAGE.style.transform = 'translate(-50%,-50%) scale(' + k + ')';
    // босоо утсанд слайд жижиг харагдана — хэвтээ эргүүлэхийг санал болгоно
    PL.classList.toggle('portrait', window.innerHeight > window.innerWidth && window.innerWidth < 700);
  }
  // window-ийн capture шатанд — хуудасны бусад товчлол (ж: Ctrl+Enter «Шинэ бодлого») тоглуулагч нээлттэй үед ажиллахгүй
  function onKey(e) {
    if (!PL) return;
    var k = e.key, used = true;
    if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'PageDown' || k === ' ' || k === 'Enter') next();
    else if (k === 'ArrowLeft' || k === 'ArrowUp' || k === 'PageUp' || k === 'Backspace') prev();
    else if (k === 'Home') go(0);
    else if (k === 'End') go(SL.length - 1);
    else if (k === 'Escape') { if (!document.fullscreenElement) closePlayer(); }
    else if (k === 'f' || k === 'F') fs();
    else used = false;
    if (used || e.ctrlKey || e.metaKey) { e.preventDefault(); e.stopImmediatePropagation(); }
  }
  function fs() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (PL.requestFullscreen) PL.requestFullscreen();
    } catch (e) {}
  }
  function closePlayer() {
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
    if (PL) { PL.remove(); PL = null; }
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', scale);
    document.documentElement.style.overflow = '';
  }

  function play(isFull) {
    injectCSS();
    closePlayer();
    full = !!isFull;
    SL = deck(); cur = 0; step = 0;
    PL = document.createElement('div'); PL.className = 'e1s-pl';
    PL.setAttribute('role', 'dialog'); PL.setAttribute('aria-label', 'Бодолтын PPT');
    PL.innerHTML = '<div class="e1s-vp"><div class="e1s-stage"></div></div><div class="e1s-prog"><i></i></div>'
      + '<div class="e1s-ctl"><button type="button" data-p aria-label="Өмнөх">' + ICO.prev + '</button><span class="e1s-cnt"></span>'
      + '<button type="button" data-n aria-label="Дараах">' + ICO.next + '</button><span class="e1s-tt"></span><span class="e1s-sp"></span>'
      + '<button type="button" data-f aria-label="Бүтэн дэлгэц">' + ICO.full + '</button><button type="button" data-x aria-label="Хаах">' + ICO.x + '</button></div>';
    document.body.appendChild(PL);
    document.documentElement.style.overflow = 'hidden';
    STAGE = PL.querySelector('.e1s-stage');
    STAGE.addEventListener('click', function () { next(); });
    PL.querySelector('[data-p]').onclick = prev;
    PL.querySelector('[data-n]').onclick = next;
    PL.querySelector('[data-f]').onclick = fs;
    PL.querySelector('[data-x]').onclick = closePlayer;
    PL.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    PL.addEventListener('dragstart', function (e) { e.preventDefault(); });
    // шударч солих (утас, таблет)
    var tx = null;
    PL.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
    PL.addEventListener('touchend', function (e) { if (tx == null) return; var dx = e.changedTouches[0].clientX - tx; tx = null; if (Math.abs(dx) > 50) { if (dx < 0) next(); else prev(); } });
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', scale);
    if (!play.fsBound) { play.fsBound = true; document.addEventListener('fullscreenchange', function () { setTimeout(scale, 50); }); }
    scale();
    renderSlide(false);
    // KaTeX-ийн фонт ачаалагдсаны дараа дахин багтаана
    try { if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (PL) { var st = step; renderSlide(false); for (var i = 0; i < st; i++) next(); } }); } catch (e) {}
  }

  window.E1KSOL = { open: open, play: function (ctx, isFull) { CTX = ctx; play(isFull); }, beatsOf: beatsOf, ansGroups: ansGroups, glue: glue, close: function () { closePlayer(); closeOv(); } };
})();
