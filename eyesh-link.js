/* ЭЕШ шалгагч (eyeshcheck.com) — ЭЕШ хуудсуудын (eesh-YYYY-songoh / eesh-YYYY-nohoh) «ЭЕШ шалгагч» товч.
   Дарахад: Дасгалын төвийн бүртгэлээр нэвтэрсэн эсэх → эрх (POST /api/eyesh?action=status) → эрхгүй бол QPay
   (POST /api/qpay?action=create {plan:'eyesh'}, 1 сар) → нэг удаагийн код (POST /api/eyesh?action=handoff) →
   eyeshcheck.com/api/cm/sso руу form POST (шинэ таб): тэнд энэ хувилбарын зөв хариулттай шалгалт шууд үүснэ.
   Хуудас бүр одоогийн хувилбараа localStorage 'cm_eesh_<он>_p<хэсэг>'-д санана — нөгөө хэсгийг тэр хуудаснаас хамт оруулна.
   2-р хэсгийг зөвхөн ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтах хувилбараар оруулна (эх хувилбар үргэлж багтана). */
(function () {
  'use strict';
  var m = /\/eesh-(\d{4})-(songoh|nohoh)(?:\.html)?$/.exec(location.pathname);
  if (!m || window.EYESH) return;
  var YEAR = +m[1], PART = m[2] === 'songoh' ? 1 : 2, YY = YEAR % 100;
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
    ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
  };

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
  function stNow() { return window[PART === 1 ? '__E' + YY : '__E' + YY + 'N'] || null; }
  // Нөхөх бодлогын html → [['abc', 2], …]: «(N оноо)» хүртэлх нүднүүд нэг дэд асуулт. Эхэнд нь ирсэн «(7 оноо)» (2023) — хуваахгүй.
  function partsOf(html) {
    var s = String(html || '').replace(/<svg[\s\S]*?<\/svg>/g, ' '), re = /<span class="bx">([^<]*)<\/span>|\((\d+)\s*оноо\)/g, x, acc = '', out = [];
    while ((x = re.exec(s))) {
      if (x[1] != null) acc += x[1];
      else { if (acc) out.push([acc, +x[2]]); acc = ''; }
    }
    return out;
  }
  function exportCur() {
    var st = stNow(); if (!st || !st.items) return null;
    var o = { v: st.seed, g: st.seed === 'orig' ? '' : String(st.g || '') };
    if (PART === 1) {
      var f = window['e' + YY + '_letters'];
      o.key = typeof f === 'function' ? String(f(st)) : '';
    } else {
      o.items = st.items.map(function (it) { return { ans: it.ans || {}, parts: partsOf(it.html) }; });
    }
    return o;
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
  function remember() {
    var o = exportCur(); if (!o) return;
    o.t = Date.now();
    lsSet('cm_eesh_' + YEAR + '_p' + PART, JSON.stringify(o));
  }
  function readMem(p) {
    try { var o = JSON.parse(lsGet('cm_eesh_' + YEAR + '_p' + p) || 'null'); return o && (o.v === 'orig' || (o.v >= 1000 && o.v <= 9999)) ? o : null; }
    catch (e) { return null; }
  }
  function vtxt(o) { return o.v === 'orig' ? 'Эх (' + YEAR + ')' : 'Хувилбар №' + o.v + (o.g ? '·' + o.g : ''); }
  function vshort(o) { return o.v === 'orig' ? 'Эх' : '№' + o.v; }

  // Сонголтын жагсаалт: s1 — 1-р хэсэг (заавал), s2 — 2-р хэсэг (сүүлд нь «Оруулахгүй»)
  function sources() {
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
    b.title = 'Энэ хувилбарын зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ';
    b.innerHTML = ICO.logo + 'ЭЕШ шалгагч';
    b.addEventListener('click', open);
    bar.appendChild(b);
  }

  /* ── Цонх ── */
  var S = { st: null, sel1: null, sel2: null, title: '', titleEdited: false, busy: false, inv: null, invEmail: '', pollT: null, polls: 0, ready: null };
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
        + (x.id === sel ? ' checked' : '') + (dis ? ' disabled' : '') + '><span>' + esc(lab) + '<small>' + esc(x.hint) + '</small></span></label>';
    }).join('');
  }
  function pick(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id && !list[i].bad) return list[i]; return null; }
  function autoTitle(a, b) { return 'ЭЕШ ' + YEAR + ' · Сонгох ' + vshort(a.o) + (b && b.o ? ' · Нөхөх ' + vshort(b.o) : ''); }
  function drawCompose() {
    var src = sources(), s1 = src.s1, s2 = src.s2;
    if (!pick(s1, S.sel1)) S.sel1 = s1.length ? s1[0].id : null;
    if (!pick(s2, S.sel2)) { var d2 = null; s2.forEach(function (x) { if (!d2 && !x.bad) d2 = x.id; }); S.sel2 = d2; }
    var bad2 = s2.filter(function (x) { return x.bad; })[0];
    var h = '<div class="eyc-sub">Энэ хувилбарын зөв хариулттай шалгалтыг eyeshcheck.com-д шууд үүсгэнэ. Сурагчдын хариултын хуудсыг утсаараа уншуулж дүгнэнэ.</div>'
      + '<div class="eyc-sec"><div class="eyc-st">1-р хэсэг · Сонгох даалгавар (36)</div>'
      + (s1.length ? optHtml('eyc1', s1, S.sel1)
         : PART === 1 ? '<div class="eyc-note">Энэ хувилбарын зарим бодлого үүсээгүй байна. «Шинэ хувилбар» дарж дахин оролдоно уу.</div>'
         : '<div class="eyc-note">1-р хэсгийн хуудсыг нээж хувилбараа гаргаад энэ товчийг дахин дарна уу. <a href="' + PAGES[1] + '">1-р хэсэг рүү</a></div>')
      + '</div>'
      + '<div class="eyc-sec"><div class="eyc-st">2-р хэсэг · Нөхөх даалгавар (2.1–2.4)</div>' + optHtml('eyc2', s2, S.sel2)
      + (bad2 ? '<div class="eyc-note">' + esc(vtxt(bad2.o)) + '-ийн хариу олон оронтой тул ЭЕШ-ийн хариултын хуудасны a–h мөрөнд багтахгүй. '
              + (PART === 2 && ORIG[YEAR] && ORIG[YEAR][2] ? 'Хуудсан дээрх «Эх хувилбар» товчоор эх даалгаврыг гаргаж хэвлээд энд эхийг нь сонгоно уу.'
                                                          : 'Эх хувилбарыг сонгох эсвэл 2-р хэсгийг оруулахгүй байж болно.') + '</div>' : '')
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
      r.onchange = function () { if (r.name === 'eyc1') S.sel1 = r.value; else S.sel2 = r.value; syncTitle(); };
    });
    syncTitle();
    drawAction();
  }
  function drawAction() {
    var a = ov && ov.querySelector('[data-act]'); if (!a) return;
    if (!S.st) { a.innerHTML = '<div class="eyc-msg" data-msg>Эрхийг шалгаж байна…</div>'; return; }
    if (S.st.err) {
      a.innerHTML = '<div class="eyc-msg err" data-msg>' + esc(S.st.err) + '</div><button type="button" class="eyc-link" data-retry>Дахин оролдох</button>';
      a.querySelector('[data-retry]').onclick = loadStatus;
      return;
    }
    var canGo = !!S.sel1;
    if (S.st.active) {
      a.innerHTML = '<button type="button" class="eyc-go" data-go' + (canGo ? '' : ' disabled') + '>' + ICO.ext + 'eyeshcheck-д шалгалт үүсгэх</button>'
        + '<div class="eyc-msg" data-msg>ЭЕШ шалгагчийн эрх <b>' + esc(ymd(S.st.expiry)) + '</b> хүртэл.</div>';
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
    var src = sources(), a = pick(src.s1, S.sel1), b = pick(src.s2, S.sel2);
    if (!a) return null;
    var ex = { year: YEAR, title: (S.title || '').trim(), p1: { v: a.o.v, g: a.o.g || '', key: a.o.key }, p2: null };
    if (b && b.o) ex.p2 = { v: b.o.v, g: b.o.g || '', items: b.o.items };
    return ex;
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
    if (!ex) return msg('err', '1-р хэсгийн хувилбар сонгоогүй байна.');
    if (S.busy) return;
    S.busy = true;
    var w = null;
    try { w = window.open('', 'eyeshcheck'); } catch (e) { w = null; }
    if (w) { try { w.document.open(); w.document.write(WAIT); w.document.close(); } catch (e) {} }
    msg('', 'Шалгалт үүсгэж байна…');
    post('/api/eyesh?action=handoff', { wstoken: tok(), exam: ex }).then(function (x) {
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
    var nb = function () { var r = ob.apply(this, arguments); try { remember(); } catch (e) {} return r; };
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
  window.EYESH = { open: open, remember: remember, exportCur: exportCur, fits: fits, partsOf: partsOf, ORIG: ORIG };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
