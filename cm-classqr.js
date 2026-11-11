/* cm-classqr.js — багшийн нээсэн ангид QR-аар нэгдэх (2026-11-11, эзэмшигч: «ангид нэгдэхдээ давхар QR уншуулдаг байлгая.
   Энэ QR нь бүртгүүлээгүй хүнд давхар урилгын QR болдог байх ёстой»).
   - QR = <сайт>/?class=КОД. Багш: ангийн карт / дэлгэрэнгүй → showById(id).
   - Нэвтэрсэн сурагч холбоосоор орвол _onLogin → afterLogin() шууд нэгтгэнэ (багшийг нэгтгэхгүй).
   - Нэвтрээгүй хүн: init() кодыг хадгалж, бүртгэл/нэвтрэх цонхонд ангийн урилга харуулж, ангийг нь бөглөнө; нэвтэрмэгц afterLogin нэгтгэнэ.
     Утасны баталгаажуулалтыг алгасахгүй — QR нийтэд тархдаг тул админы урилгын (?invite=) эрх өгөхгүй.
   - «Ангид нэгдэх» цонх: startScan() камераар (jsQR) уншина; QR доторх хаяг руу очихгүй, зөвхөн кодыг авна.
   Хөтөч (window.cmClassQr) ба Node (module.exports — tests/class-qr.test.js) хоёуланд. */
(function (root) {
  'use strict';
  var KEY = 'cm_pending_class';
  var ICON_X = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
  function byId(id) { return document.getElementById(id); }

  /* QR-ын текст эсвэл location.search → ангийн код; ?class=-гүй бол '' (mathlet, төлбөрийн QR г.м.) */
  function parseCode(text) {
    var m = /[?&]class=([A-Za-z0-9]{6,12})(?=[&#\s]|$)/.exec(String(text == null ? '' : text));
    return m ? m[1].toUpperCase() : '';
  }
  function joinUrl(code, origin) { return (origin || root.location.origin) + '/?class=' + encodeURIComponent(code); }

  function remember(code) { try { sessionStorage.setItem(KEY, code); } catch (e) {} }
  function remembered() { try { return parseCode('?class=' + (sessionStorage.getItem(KEY) || '')); } catch (e) { return ''; } }
  function forget() {
    try { sessionStorage.removeItem(KEY); } catch (e) {}
    try {
      var u = new URL(root.location.href);
      if (!u.searchParams.has('class')) return;
      u.searchParams.delete('class');
      root.history.replaceState({}, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function me() {
    var u = root._currentUser;
    if (!u) { try { u = JSON.parse(localStorage.getItem('cm_current') || 'null'); } catch (e) { u = null; } }
    return u && u.email ? u : null;
  }

  /* ── Нэгдэх ── */
  function openClassTab() {
    var b = byId('tab-btn-classroom');              // switchTab нь event.target ашигладаг тул жинхэнэ товчийг дарна
    if (b) b.click(); else if (typeof root.loadStudentClassroom === 'function') root.loadStudentClassroom();
  }
  function joinNow(code) {
    root.openJoinClassroom();                       // алдаа гарвал код бөглөгдсөн цонх дээрээ харагдана
    byId('join-code-input').value = code;
    root.doJoinClassroom(openClassTab);
  }
  function afterLogin() {
    var code = parseCode(root.location.search) || remembered(), u = me();
    if (!code || !u) return;
    forget();
    var n = byId('cq-invite');
    if (n && n.parentNode) n.parentNode.removeChild(n);
    if (u.role === 'teacher' || u.grade === 'teacher') {
      if (typeof root.showToast === 'function') root.showToast('Энэ QR нь сурагчид зориулагдсан');
      return;
    }
    joinNow(code);
  }

  /* ── Бүртгэлгүй / нэвтрээгүй хүний урилга ── */
  function banner(text) {
    var b = document.createElement('div');
    b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;padding:12px 18px;text-align:center;font-family:\'Baloo 2\',sans-serif;font-weight:800;font-size:14px;color:#fff;background:linear-gradient(135deg,#FF4B4B,#dc2626);';
    b.textContent = text;
    document.body.appendChild(b);
    setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); }, 7000);
  }
  function showNotice(c) {
    var bar = byId('auth-tab-bar'), n = byId('cq-invite');
    if (!bar) return;
    if (!n) {
      n = document.createElement('div');
      n.id = 'cq-invite';
      n.style.cssText = 'flex-shrink:0;border-left:4px solid #7B52EE;padding:6px 12px;margin-bottom:14px;font-family:\'Baloo 2\',sans-serif;';
      bar.parentNode.insertBefore(n, bar);
    }
    n.textContent = '';
    var t = document.createElement('div'), s = document.createElement('div');
    t.style.cssText = 'font-weight:900;font-size:0.98rem;color:#3C3C3C;line-height:1.3;';
    t.textContent = 'Ангийн урилга' + (c && c.name ? ': ' + c.name : '');
    s.style.cssText = 'font-size:0.82rem;color:#777;line-height:1.35;';
    s.textContent = 'Бүртгүүлж эсвэл нэвтэрмэгц ангид автоматаар нэгдэнэ.';
    n.appendChild(t); n.appendChild(s);
  }
  function invite(c) {
    setTimeout(function () {
      if (typeof root.openAuthModal !== 'function') return;
      var returning = false;
      try { returning = !!localStorage.getItem('cm_last_user'); } catch (e) {}
      root.openAuthModal(returning ? 'login' : 'register');
      showNotice(c);
      var g = byId('reg-grade'), v = c && c.grade != null ? String(c.grade) : '';
      if (g && v && [].some.call(g.options, function (o) { return o.value === v; })) g.value = v;
    }, 700);
  }
  function init() {
    var code = parseCode(root.location.search);
    if (!code || me()) return;                      // нэвтэрсэн бол _onLogin → afterLogin
    remember(code);
    fetch('/api/classroom?join_code=' + encodeURIComponent(code)).then(function (r) {
      if (r.status === 404) {
        forget();
        banner('Энэ ангийн QR хүчингүй байна. Багшаасаа шинэ QR авна уу.');
        return null;
      }
      return r.ok ? r.json() : {};
    }).then(function (d) {
      if (d) invite(d.classroom || null);
    }).catch(function () { invite(null); });        // сүлжээний алдаа — код хадгалагдсан, нэргүй урилгаар үргэлжилнэ
  }

  /* ── Багшид QR харуулах ── */
  function closeQr() { var o = byId('cq-modal'); if (o && o.parentNode) o.parentNode.removeChild(o); }
  function show(c) {
    if (!c || !c.join_code) return;
    closeQr();
    var url = joinUrl(c.join_code), o = document.createElement('div');
    o.id = 'cq-modal';
    o.style.cssText = 'position:fixed;inset:0;background:rgba(10,8,40,0.85);z-index:700;display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(8px);';
    o.innerHTML = '<div style="background:#fff;border-radius:24px;padding:20px 22px;width:100%;max-width:min(92vw,620px);max-height:94vh;overflow-y:auto;box-sizing:border-box;text-align:center;font-family:\'Baloo 2\',sans-serif;">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">'
      + '<div style="text-align:left;min-width:0;"><div style="font-size:0.8rem;font-weight:800;color:#7B52EE;">Ангид нэгдэх QR</div><div id="cq-name" style="font-weight:900;font-size:1.15rem;color:#3C3C3C;line-height:1.25;overflow-wrap:anywhere;"></div></div>'
      + '<button id="cq-close" aria-label="Хаах" style="flex-shrink:0;background:#f5f5f5;border:none;border-radius:50%;width:32px;height:32px;cursor:pointer;color:#555;display:flex;align-items:center;justify-content:center;">' + ICON_X + '</button>'
      + '</div>'
      + '<div id="cq-box" style="width:min(76vw,58vh);margin:12px auto 8px;"></div>'
      + '<div id="cq-code" style="font-weight:900;font-size:1.7rem;letter-spacing:6px;color:#211C54;"></div>'
      + '<div id="cq-url" style="font-size:0.78rem;font-weight:700;color:#7B52EE;overflow-wrap:anywhere;user-select:all;"></div>'
      + '<div style="font-size:0.84rem;color:#777;line-height:1.35;margin:4px 0 12px;">Сурагч утасныхаа камераар уншуулаад ангид нэгдэнэ. Бүртгэлгүй бол бүртгүүлсний дараа автоматаар нэгдэнэ.</div>'
      + '<button id="cq-copy" style="padding:10px 28px;background:#f5f0ff;border:none;border-radius:100px;color:#7B52EE;font-family:\'Baloo 2\',sans-serif;font-weight:800;font-size:0.92rem;cursor:pointer;">Линк хуулах</button>'
      + '</div>';
    o.onclick = function (e) { if (e.target === o) closeQr(); };
    document.body.appendChild(o);
    byId('cq-name').textContent = c.name || '';
    byId('cq-code').textContent = c.join_code;
    byId('cq-url').textContent = url;
    byId('cq-close').onclick = closeQr;
    var copy = byId('cq-copy');
    function copied(t) {
      copy.textContent = t;
      setTimeout(function () { copy.textContent = 'Линк хуулах'; }, 2200);
    }
    copy.onclick = function () {
      var fail = function () { copied('Хуулж чадсангүй, дээрх линкийг сонгож хуулна уу'); };
      if (!navigator.clipboard || !navigator.clipboard.writeText) return fail();
      navigator.clipboard.writeText(url).then(function () { copied('Хууллаа'); }, fail);
    };
    var box = byId('cq-box');
    if (typeof root.QRCode !== 'function') { box.textContent = url; return; }
    new root.QRCode(box, { text: url, width: 640, height: 640, colorDark: '#211C54', colorLight: '#ffffff', correctLevel: root.QRCode.CorrectLevel.H });
    [].forEach.call(box.querySelectorAll('canvas,img'), function (e) { e.style.width = '100%'; e.style.height = 'auto'; });
  }
  function showById(id) {
    var l = root._myClassrooms || [];
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return show(l[i]);
  }

  /* ── Камераар уншуулах («Ангид нэгдэх» цонх) ── */
  var S = { on: false, stream: null, timer: 0, canvas: null };
  function status(t) { var s = byId('join-qr-status'); if (s) s.textContent = t; }
  function stopScan() {
    S.on = false;
    clearTimeout(S.timer);
    if (S.stream) { try { S.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    S.stream = null;
    var v = byId('join-qr-video');
    if (v) v.srcObject = null;
    var b = byId('join-qr-box');
    if (b) b.style.display = 'none';
  }
  function tick() {
    if (!S.on) return;
    S.timer = setTimeout(tick, 200);
    var v = byId('join-qr-video');
    if (!v || v.readyState < 2 || !v.videoWidth) return;
    var w = Math.min(640, v.videoWidth), h = Math.round(v.videoHeight * w / v.videoWidth);
    var c = S.canvas || (S.canvas = document.createElement('canvas'));
    c.width = w; c.height = h;
    var ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(v, 0, 0, w, h);
    var hit = root.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' });
    if (!hit || !hit.data) return;
    var code = parseCode(hit.data);
    if (!code) { status('Энэ QR ангийн QR биш байна'); return; }
    stopScan();
    byId('join-code-input').value = code;
    root.doJoinClassroom(openClassTab);
  }
  function startScan() {
    if (S.on) { stopScan(); return; }
    byId('join-qr-box').style.display = 'block';
    if (typeof root.jsQR !== 'function') { status('QR уншигч ачаалагдсангүй. Кодоо гараар оруулна уу.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { status('Энэ төхөөрөмж камер ашиглах боломжгүй. Кодоо гараар оруулна уу.'); return; }
    S.on = true;
    status('Камер нээж байна...');
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }).then(function (stream) {
      if (!S.on) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }   // хүлээх зуур цонх хаагдсан
      S.stream = stream;
      var v = byId('join-qr-video');
      v.srcObject = stream;
      var p = v.play();
      if (p && p.catch) p.catch(function () {});
      status('Багшийн QR-ыг камерт харуулна уу');
      tick();
    }).catch(function () {
      S.on = false;
      status('Камер нээгдсэнгүй. Хөтчид камерын зөвшөөрөл өгөх эсвэл кодоо гараар оруулна уу.');
    });
  }

  var api = { parseCode: parseCode, joinUrl: joinUrl, init: init, afterLogin: afterLogin, show: show, showById: showById, startScan: startScan, stopScan: stopScan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    root.cmClassQr = api;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
