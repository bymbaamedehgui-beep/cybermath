/* Слайд хичээлийн сагс — Дасгалын төв (worksheets.html) ба тоглуулагч (ppt.html).
   1 хичээл × 1 сар (үнийг сервер тогтооно, анхдагч 1900₮). Сагсанд олныг хийгээд НЭГ QPay нэхэмжлэхээр төлнө.
     localStorage 'cm_ppt_cart' = [{id,title,grade,slides,poster}]
     төлбөр: POST /api/qpay?action=create {plan:'ppt', ids, wstoken} → QR / банкны апп → POST ?action=check (3 сек)
     эрх:    POST /api/wsppt?action=mine {wstoken} → { price, owned:{id: expires_at} }
   window.PPTCART = { add(d), remove(id), has(id), items(), count(), open(), owned(), price(), refreshOwned(), bindButton(el) }
   Үйл явдал: window 'pptcart:change' (сагс/эрх өөрчлөгдөхөд), 'pptcart:paid' (detail: {ids, ppt}) */
(function () {
  'use strict';
  if (window.PPTCART) return;
  var KEY = 'cm_ppt_cart', PRICE = 1900, OWNED = {}, POLL_MS = 3000, POLL_MAX = 200;

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function ymd(iso) { var d = new Date(iso); return isNaN(d) ? '' : d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function tok() { return lsGet('cm_ws_token') || ''; }
  function emit(name, detail) { try { window.dispatchEvent(new CustomEvent(name, { detail: detail || {} })); } catch (e) {} }

  var ICO = {
    cart: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.4 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.2L21.5 8H6.1"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    book: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="m9 9.5 2 2 4-4"/></svg>',
    phone: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/></svg>',
    bank: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18L12 4z"/><path d="M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18"/></svg>',
    play: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>'
  };

  /* ── өгөгдөл ── */
  function items() { try { var a = JSON.parse(lsGet(KEY) || '[]'); return Array.isArray(a) ? a.filter(function (x) { return x && x.id > 0; }) : []; } catch (e) { return []; } }
  function save(a) { lsSet(KEY, JSON.stringify(a.slice(0, 30))); render(); emit('pptcart:change'); }
  function has(id) { id = +id; return items().some(function (x) { return x.id === id; }); }
  function add(d) {
    if (!d || !(+d.id > 0)) return;
    var a = items(); if (has(d.id)) { toast('Сагсанд аль хэдийн байна'); return; }
    a.push({ id: +d.id, title: String(d.title || 'Слайд хичээл').slice(0, 160), grade: String(d.grade || '').slice(0, 40), slides: +d.slides || 0, poster: /^https:\/\//.test(d.poster || '') ? d.poster : '' });
    save(a); toast('Сагсанд нэмлээ — ' + a.length + ' хичээл · ' + fmt(a.length * PRICE) + '₮', true);
  }
  function remove(id) { id = +id; save(items().filter(function (x) { return x.id !== id; })); }
  function removeMany(ids) { var m = {}; (ids || []).forEach(function (i) { m[+i] = 1; }); save(items().filter(function (x) { return !m[x.id]; })); }

  function refreshOwned() {
    return fetch('/api/wsppt?action=mine', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ wstoken: tok() }) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (j && j.ok) { if (j.price) PRICE = +j.price || PRICE; OWNED = j.owned || {}; render(); emit('pptcart:change'); } return OWNED; })
      .catch(function () { return OWNED; });
  }

  /* ── стиль ── */
  var css = ''
    + '.pc-fab{position:fixed;right:16px;bottom:16px;z-index:150;display:none;align-items:center;gap:8px;border:0;cursor:pointer;font:800 14px/1 inherit;font-family:inherit;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7);border-radius:999px;padding:12px 16px 12px 14px;box-shadow:0 14px 30px -12px rgba(91,50,214,.85)}'
    + '.pc-fab.on{display:inline-flex}.pc-fab b{background:#fff;color:#5A32D6;border-radius:999px;min-width:22px;height:22px;display:inline-grid;place-items:center;font-size:12px;padding:0 6px}'
    + '.pc-ov{position:fixed;inset:0;z-index:260;background:rgba(20,12,45,.55);display:flex;justify-content:flex-end;font-family:inherit}'
    + '.pc-dr{position:relative;width:min(440px,100%);height:100%;background:#fff;display:flex;flex-direction:column;box-shadow:-20px 0 50px -20px rgba(0,0,0,.45);color:#1a1030;animation:pcin .22s ease}'
    + '@keyframes pcin{from{transform:translateX(30px);opacity:.5}to{transform:none;opacity:1}}'
    + '.pc-hd{display:flex;align-items:center;gap:10px;padding:16px 18px;border-bottom:1px solid #eee8fb}.pc-hd h3{margin:0;font-size:1.08rem;font-weight:900;flex:1}'
    + '.pc-x{border:0;background:#f5f1ff;color:#5A32D6;width:36px;height:36px;border-radius:11px;display:grid;place-items:center;cursor:pointer}'
    + '.pc-bd{flex:1;overflow-y:auto;padding:14px 18px;-webkit-overflow-scrolling:touch}'
    + '.pc-hl{display:flex;gap:10px;align-items:flex-start;border-left:3px solid #d946ef;background:transparent;padding:6px 0 6px 11px;margin:0 0 14px;font-size:.86rem;line-height:1.45;color:#3b2a7a}.pc-hl svg{flex:none;color:#7B52EE;margin-top:1px}.pc-hl b{color:#5A32D6}'
    + '.pc-it{display:flex;gap:11px;align-items:center;padding:10px 0;border-bottom:1px solid #f1ecfb}'
    + '.pc-th{flex:none;width:76px;aspect-ratio:16/9;border-radius:8px;background:#1C1240 center/cover no-repeat;display:grid;place-items:center;color:#fff}'
    + '.pc-in{flex:1;min-width:0}.pc-t{font-weight:800;font-size:.9rem;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}'
    + '.pc-m{font-size:.75rem;color:#7c7596;margin-top:3px}.pc-own{font-size:.72rem;color:#15803d;font-weight:700;margin-top:3px}'
    + '.pc-p{flex:none;text-align:right;font-weight:900;font-size:.88rem;white-space:nowrap}.pc-p small{display:block;font-weight:700;color:#7c7596;font-size:.68rem}'
    + '.pc-rm{flex:none;border:0;background:none;color:#b8afd6;cursor:pointer;padding:6px;border-radius:8px}.pc-rm:hover{color:#e54545;background:#fff1f1}'
    + '.pc-empty{text-align:center;color:#7c7596;font-size:.9rem;padding:40px 10px}'
    + '.pc-ft{border-top:1px solid #eee8fb;padding:14px 18px calc(14px + env(safe-area-inset-bottom))}'
    + '.pc-tot{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px}.pc-tot span{font-size:.82rem;color:#7c7596;font-weight:700}.pc-tot b{font-size:1.35rem;font-weight:900}'
    + '.pc-go{width:100%;border:0;cursor:pointer;font-family:inherit;font-weight:900;font-size:.98rem;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7);border-radius:14px;padding:14px;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 12px 24px -12px rgba(91,50,214,.9)}'
    + '.pc-go:disabled{opacity:.55;cursor:default}'
    + '.pc-msg{font-size:.84rem;margin:10px 0 0;text-align:center;color:#5A32D6;line-height:1.45}.pc-msg.err{color:#c0392b}.pc-msg.ok{color:#15803d;font-weight:700}'
    + '.pc-qr{text-align:center;margin-top:12px}.pc-qr .cap{font-size:.8rem;color:#7c7596;margin-bottom:8px}.pc-qr img.q{width:200px;max-width:70%;height:auto;aspect-ratio:1;display:block;margin:0 auto}'
    + '.pc-short{display:inline-flex;align-items:center;gap:6px;margin-top:8px;font-weight:800;font-size:.84rem;color:#5A32D6;text-decoration:none}'
    + '.pc-banks{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:10px}.pc-bank{display:flex;flex-direction:column;align-items:center;gap:3px;width:62px;text-decoration:none}'
    + '.pc-bank img,.pc-bank i{width:34px;height:34px;border-radius:9px;background:#f5f0ff;object-fit:contain;display:flex;align-items:center;justify-content:center;color:#7B52EE;font-style:normal}.pc-bank span{max-width:100%;color:#555;font-size:.62rem;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.pc-sec{margin-top:8px;width:100%;border:1px solid #e7ddff;background:#fff;color:#5A32D6;font-family:inherit;font-weight:800;font-size:.86rem;border-radius:12px;padding:10px;cursor:pointer}'
    + '.pc-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:300;background:#1C1240;color:#fff;font-family:inherit;font-weight:700;font-size:.86rem;padding:10px 16px;border-radius:12px;box-shadow:0 12px 30px -12px rgba(0,0,0,.6);display:flex;align-items:center;gap:10px;max-width:calc(100% - 32px)}'
    + '.pc-toast button{border:0;background:#7B52EE;color:#fff;font-family:inherit;font-weight:800;border-radius:9px;padding:6px 10px;cursor:pointer;white-space:nowrap}'
    + '@media (max-width:480px){.pc-fab{right:12px;bottom:12px}.pc-th{width:60px}}';
  var st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st);

  /* ── товч (хөвөгч эсвэл хуудасны өөрийн товч) ── */
  var fab = null, bound = [];
  function ensureFab() {
    if (fab || bound.length) return;
    fab = document.createElement('button'); fab.type = 'button'; fab.className = 'pc-fab'; fab.setAttribute('aria-label', 'Сагс');
    fab.onclick = open; document.body.appendChild(fab);
  }
  function bindButton(el) { if (!el) return; bound.push(el); el.addEventListener('click', function (e) { e.preventDefault(); open(); }); if (fab) { fab.remove(); fab = null; } render(); }
  function render() {
    var a = items(), n = a.length;
    if (fab) { fab.classList.toggle('on', n > 0); fab.innerHTML = ICO.cart + 'Сагс <b>' + n + '</b>' + (n ? '<span style="opacity:.9;font-weight:700">' + fmt(n * PRICE) + '₮</span>' : ''); }
    bound.forEach(function (el) {
      var c = el.querySelector('[data-pc-count]');
      if (c) { c.textContent = n; c.style.display = n ? '' : 'none'; }
    });
    if (dr) drawBody();
  }

  /* ── toast ── */
  var tt = null;
  function toast(msg, withOpen) {
    if (tt) { tt.remove(); tt = null; }
    tt = document.createElement('div'); tt.className = 'pc-toast';
    tt.innerHTML = '<span>' + esc(msg) + '</span>' + (withOpen ? '<button type="button">Сагс харах</button>' : '');
    var b = tt.querySelector('button'); if (b) b.onclick = function () { tt.remove(); tt = null; open(); };
    document.body.appendChild(tt);
    var me = tt; setTimeout(function () { if (tt === me) { me.remove(); tt = null; } }, 3200);
  }

  /* ── сагсны цонх ── */
  var dr = null, body = null, foot = null, inv = null, invEmail = '', pollT = null, polls = 0, busy = false, paidView = false;
  function close() { if (pollT) { clearInterval(pollT); pollT = null; } if (dr) { dr.remove(); dr = null; } document.removeEventListener('keydown', onKey); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function open() {
    if (dr) return;
    dr = document.createElement('div'); dr.className = 'pc-ov';
    dr.innerHTML = '<div class="pc-dr" role="dialog" aria-modal="true" aria-label="Сагс"><div class="pc-hd">' + ICO.cart + '<h3>Слайд хичээлийн сагс</h3><button type="button" class="pc-x" aria-label="Хаах">' + ICO.x + '</button></div>'
      + '<div class="pc-bd"></div><div class="pc-ft"></div></div>';
    dr.addEventListener('click', function (e) { if (e.target === dr) close(); });
    dr.querySelector('.pc-x').onclick = close;
    document.body.appendChild(dr); document.addEventListener('keydown', onKey);
    body = dr.querySelector('.pc-bd'); foot = dr.querySelector('.pc-ft');
    inv = null; paidView = false; drawBody(); drawFoot();
    if (tok()) refreshOwned();
  }
  function drawBody() {
    if (!dr || inv || paidView) return;
    var a = items();
    var h = '<div class="pc-hl">' + ICO.book + '<div>Слайд бүрт <b>сурах бичгийн бүх бодлогын бодолт, бодох арга</b> алхам алхмаар, анимейшнтэйгээр орсон. Нэг хичээл <b>' + fmt(PRICE) + '₮</b> — <b>1 сар</b> үзнэ.</div></div>';
    if (!a.length) h += '<div class="pc-empty">Сагс хоосон байна.<br>Бүлгийн мөрөн дэх «Сагсанд» товчоор хичээл нэмнэ үү.</div>';
    a.forEach(function (x) {
      var own = OWNED[x.id];
      h += '<div class="pc-it"><div class="pc-th"' + (x.poster ? ' style="background-image:url(\'' + esc(x.poster) + '\')"' : '') + '>' + (x.poster ? '' : ICO.play) + '</div>'
        + '<div class="pc-in"><div class="pc-t">' + esc(x.title) + '</div><div class="pc-m">' + esc(x.grade) + (x.slides ? ' · ' + x.slides + ' слайд' : '') + '</div>'
        + (own ? '<div class="pc-own">Эрхтэй: ' + esc(ymd(own)) + ' хүртэл — төлбөл 1 сараар сунгагдана</div>' : '') + '</div>'
        + '<div class="pc-p">' + fmt(PRICE) + '₮<small>1 сар</small></div>'
        + '<button type="button" class="pc-rm" data-rm="' + x.id + '" aria-label="Хасах">' + ICO.trash + '</button></div>';
    });
    body.innerHTML = h;
    [].forEach.call(body.querySelectorAll('[data-rm]'), function (b) { b.onclick = function () { remove(+b.getAttribute('data-rm')); drawFoot(); }; });
    drawFoot();
  }
  function drawFoot() {
    if (!dr || inv || paidView) return;
    var n = items().length;
    foot.innerHTML = '<div class="pc-tot"><span>Нийт (' + n + ' хичээл × ' + fmt(PRICE) + '₮, 1 сар)</span><b>' + fmt(n * PRICE) + '₮</b></div>'
      + '<button type="button" class="pc-go"' + (n && !busy ? '' : ' disabled') + '>' + ICO.cart + (tok() ? 'QPay-аар төлөх' : 'Нэвтэрч төлөх') + '</button><div class="pc-msg" data-msg></div>';
    foot.querySelector('.pc-go').onclick = pay;
  }
  function msg(cls, html) { var m = dr && dr.querySelector('[data-msg]'); if (m) { m.className = 'pc-msg' + (cls ? ' ' + cls : ''); m.innerHTML = html; } }
  function needLogin() {
    if (typeof window.openLogin === 'function') {           // Дасгалын төв — хуудсан дээрээ нэвтрэх цонх
      close(); window.__afterLogin = function () { refreshOwned().then(open); }; window.openLogin(false); return;
    }
    var next = location.pathname + (/^\?id=\d+$/.test(location.search) ? location.search : '');
    location.href = '/worksheets.html?login=1&next=' + encodeURIComponent(next);
  }
  function bankItem(u) {
    if (!u || typeof u !== 'object') return '';
    var link = String(u.link || u.url || ''); if (!link || /^\s*(javascript|data|vbscript):/i.test(link)) return '';
    var name = String(u.name || u.description || 'Банк'), logo = String(u.logo || ''), okLogo = /^https:\/\//i.test(logo);
    return '<a class="pc-bank" href="' + esc(link) + '">' + (okLogo ? '<img alt="" src="' + esc(logo) + '" onerror="this.style.display=\'none\';this.nextSibling.style.display=\'flex\'">' : '')
      + '<i' + (okLogo ? ' style="display:none"' : '') + '>' + ICO.bank + '</i><span>' + esc(name) + '</span></a>';
  }
  function pay() {
    var a = items(); if (!a.length || busy) return;
    if (!tok()) return needLogin();
    busy = true; drawFoot(); msg('', 'Нэхэмжлэх үүсгэж байна…');
    var ids = a.map(function (x) { return x.id; });
    fetch('/api/qpay?action=create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ plan: 'ppt', ids: ids, wstoken: tok() }) })
      .then(function (r) { return r.json().then(function (d) { return { s: r.status, d: d }; }); })
      .then(function (x) {
        busy = false; var d = x.d || {};
        if (x.s === 401 || d.needLogin) { drawFoot(); return needLogin(); }
        if (!d.ok || !d.invoice || !d.invoice.invoice_id) { drawFoot(); return msg('err', esc(d.error || 'Нэхэмжлэх үүсгэж чадсангүй. Дахин оролдоно уу.')); }
        inv = d.invoice; invEmail = String(d.email || '').toLowerCase(); showInvoice(ids, d.amount);
      })
      .catch(function () { busy = false; drawFoot(); msg('err', 'Сүлжээний алдаа. Дахин оролдоно уу.'); });
  }
  function showInvoice(ids, amount) {
    var img = typeof inv.qr_image === 'string' ? inv.qr_image.replace(/\s+/g, '') : '';
    var h = '<div class="pc-hl">' + ICO.book + '<div><b>' + ids.length + ' хичээл</b> — нийт <b>' + fmt(amount || ids.length * PRICE) + '₮</b>. Төлбөр баталгаажмагц бүх слайд <b>1 сар</b> бүтнээр нээгдэнэ.</div></div>'
      + '<div class="pc-qr"><div class="cap">QPay эсвэл банкны аппаар уншуулж төлнө үү</div>';
    if (img && /^[A-Za-z0-9+\/=]+$/.test(img)) h += '<img class="q" alt="QPay QR" src="data:image/png;base64,' + img + '">';
    if (typeof inv.qPay_shortUrl === 'string' && /^https:\/\//i.test(inv.qPay_shortUrl)) h += '<div><a class="pc-short" href="' + esc(inv.qPay_shortUrl) + '" target="_blank" rel="noopener">' + ICO.phone + 'Утаснаас төлөх</a></div>';
    var banks = (Array.isArray(inv.urls) ? inv.urls : []).map(bankItem).join('');
    if (banks) h += '<div class="pc-banks">' + banks + '</div>';
    h += '</div>';
    body.innerHTML = h;
    foot.innerHTML = '<div class="pc-msg" data-msg>Төлбөрийг хүлээж байна…</div><button type="button" class="pc-sec" data-back>Сагс руу буцах</button>';
    foot.querySelector('[data-back]').onclick = function () { if (pollT) { clearInterval(pollT); pollT = null; } inv = null; drawBody(); };
    poll(ids);
  }
  function poll(ids) {
    if (pollT) clearInterval(pollT); polls = 0;
    pollT = setInterval(function () {
      if (!dr || !inv) { clearInterval(pollT); pollT = null; return; }
      if (++polls > POLL_MAX) {
        clearInterval(pollT); pollT = null;
        msg('err', 'Төлбөр баталгаажсангүй. Төлсөн бол «Дахин шалгах»-ыг дарна уу.');
        var b = document.createElement('button'); b.type = 'button'; b.className = 'pc-sec'; b.textContent = 'Дахин шалгах';
        b.onclick = function () { b.remove(); msg('', 'Төлбөрийг хүлээж байна…'); poll(ids); }; foot.appendChild(b);
        return;
      }
      fetch('/api/qpay?action=check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoice_id: inv.invoice_id, email: invEmail }) })
        .then(function (r) { return r.json(); })
        .then(function (c) {
          if (!c || c.paid !== true || !pollT) return;
          clearInterval(pollT); pollT = null;
          paidView = true;
          removeMany(ids);
          var ppt = c.ppt || {}; Object.keys(ppt).forEach(function (k) { OWNED[k] = ppt[k]; });
          body.innerHTML = '<div class="pc-empty" style="color:#15803d;font-weight:800">' + ICO.check + ' Төлбөр баталгаажлаа!<br><span style="font-weight:600;color:#3b2a7a">' + ids.length + ' хичээл 1 сарын турш бүтнээр нээгдлээ.</span></div>';
          foot.innerHTML = '<button type="button" class="pc-go" data-done>' + ICO.play + 'Үзэж эхлэх</button>';
          foot.querySelector('[data-done]').onclick = function () { close(); emit('pptcart:paid', { ids: ids, ppt: ppt }); };
          inv = null; emit('pptcart:change'); emit('pptcart:paid', { ids: ids, ppt: ppt, silent: true });
        }).catch(function () {});
    }, POLL_MS);
  }

  window.PPTCART = {
    add: add, remove: remove, has: has, items: items, count: function () { return items().length; },
    open: open, owned: function () { return OWNED; }, price: function () { return PRICE; }, setPrice: function (p) { if (+p > 0) { PRICE = +p; render(); } },
    refreshOwned: refreshOwned, bindButton: bindButton
  };
  function boot() {
    ensureFab(); render();
    if (tok()) refreshOwned();
    if (/[?&]cart=1(?:[&#]|$)/.test(location.search)) setTimeout(open, 400);
  }
  // Өөр таб/цонхонд сагс өөрчлөгдвөл
  window.addEventListener('storage', function (e) { if (e.key === KEY) { render(); emit('pptcart:change'); } });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 0); }); else setTimeout(boot, 0);
})();
