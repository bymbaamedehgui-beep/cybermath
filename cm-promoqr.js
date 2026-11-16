/* cm-promoqr.js — промо кодын QR (2026-11-16, эзэмшигч: «уншуулахад шууд эрх нь нээгдэх QR кодыг гаргаарай» — CYBERMATH2026 постер).
   - QR = <сайт>/?promo=КОД. Шагналыг /api/promo redeem өгнө (сервер код, хугацаа, нэг хэрэглэгчид нэг удаа, max_uses-ийг шалгана).
   - Нэвтэрсэн сурагч холбоосоор орвол _onLogin → afterLogin() «Промо» цонхыг кодтой нь нээж шууд ашиглана.
   - Багш: код бөглөгдсөн цонх нээгдэнэ, өөрөө «Ашиглах» дарна — сурагчдад зориулсан хязгаарлагдмал кодын эрхийг туршиж үзэхэд зарцуулахгүй.
   - Нэвтрээгүй хүн: init() кодыг хадгалж, бүртгэл/нэвтрэх цонхонд урамшууллын мэдэгдэл харуулна; нэвтэрмэгц afterLogin ашиглана.
   Хөтөч (window.cmPromoQr) ба Node (module.exports — tests/promo-qr.test.js) хоёуланд. */
(function (root) {
  'use strict';
  var KEY = 'cm_pending_promo';
  function byId(id) { return document.getElementById(id); }

  /* QR-ын текст эсвэл location.search → промо код; ?promo=-гүй бол '' (api/promo.js-ийн кодын дүрэм: A-Z 0-9 _ -, 3-30) */
  function parseCode(text) {
    var m = /[?&]promo=([A-Za-z0-9_-]{3,30})(?=[&#\s]|$)/.exec(String(text == null ? '' : text));
    return m ? m[1].toUpperCase() : '';
  }
  function promoUrl(code, origin) { return (origin || root.location.origin) + '/?promo=' + encodeURIComponent(code); }

  function remember(code) { try { sessionStorage.setItem(KEY, code); } catch (e) {} }
  function remembered() { try { return parseCode('?promo=' + (sessionStorage.getItem(KEY) || '')); } catch (e) { return ''; } }
  function forget() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    try {
      var u = new URL(root.location.href);
      if (!u.searchParams.has('promo')) return;
      u.searchParams.delete('promo');
      root.history.replaceState({}, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function me() {
    var u = root._currentUser;
    if (!u) { try { u = JSON.parse(localStorage.getItem('cm_current') || 'null'); } catch (e) { u = null; } }
    return u && u.email ? u : null;
  }

  /* ── Ашиглах ── */
  function afterLogin() {
    var code = parseCode(root.location.search) || remembered(), u = me();
    if (!code || !u) return;
    if (typeof root.openPromoModal !== 'function' || typeof root.redeemPromo !== 'function') {
      // Нэвтэрсэн хэрэглэгчид _onLogin хуудас задлагдаж дуусахаас өмнө ажиллаж болно («Промо» цонх index.html-ийн төгсгөлд) — дараа нь дахин
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', afterLogin);
      return;
    }
    forget();
    var n = byId('pq-invite');
    if (n && n.parentNode) n.parentNode.removeChild(n);
    root.openPromoModal();
    byId('promo-input').value = code;
    if (u.role === 'teacher' || u.grade === 'teacher') return;
    root.redeemPromo();                             // алдаа (ашигласан, дууссан г.м.) цонх дээрээ харагдана
  }

  /* ── Бүртгэлгүй / нэвтрээгүй хүний мэдэгдэл ── */
  function showNotice(code) {
    var bar = byId('auth-tab-bar'), n = byId('pq-invite');
    if (!bar) return;
    if (!n) {
      n = document.createElement('div');
      n.id = 'pq-invite';
      n.style.cssText = 'flex-shrink:0;border-left:4px solid #7B52EE;padding:6px 12px;margin-bottom:14px;font-family:\'Baloo 2\',sans-serif;';
      bar.parentNode.insertBefore(n, bar);
    }
    n.textContent = '';
    var t = document.createElement('div'), s = document.createElement('div');
    t.style.cssText = 'font-weight:900;font-size:0.98rem;color:#3C3C3C;line-height:1.3;';
    t.textContent = 'Урамшууллын код: ' + code;
    s.style.cssText = 'font-size:0.82rem;color:#777;line-height:1.35;';
    s.textContent = 'Бүртгүүлж эсвэл нэвтэрмэгц код автоматаар идэвхжинэ.';
    n.appendChild(t); n.appendChild(s);
  }
  function init() {
    var code = parseCode(root.location.search);
    if (!code) return;
    if (me()) { if (root._cmLoginDone) afterLogin(); return; }   // нэвтэрсэн бол _onLogin → afterLogin (_onLogin түрүүлсэн бол энд)
    remember(code);
    setTimeout(function () {
      if (typeof root.openAuthModal !== 'function') return;
      var returning = false;
      try { returning = !!localStorage.getItem('cm_last_user'); } catch (e) {}
      root.openAuthModal(returning ? 'login' : 'register');
      showNotice(code);
    }, 700);
  }

  var api = { parseCode: parseCode, promoUrl: promoUrl, init: init, afterLogin: afterLogin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.cmPromoQr = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
