/* CyberMath — суралцах сессийн бүртгэл, багшийн оноосон тестийн хамгаалалт, багшийн «Хугацаа ба оролцоо» тайлан. API: /api/sessions
   1) Сурагч хичээл (#quiz-modal) нээх бүр нэг сесс: идэвхтэй минут (цонх харагдаж, фокустай), нийт хугацаа, хэдэн удаа цонх/апп-аас гарсан,
      дэлгэцийн зураг авах оролдлого (PrtSc, Ctrl/Cmd+P, Cmd+Shift+3/4/5), дууссан (оноо) эсвэл дундаас хаасан. Эхлэхэд, минут тутам, дуусахад илгээнэ.
   2) Багшийн оноосон (ангийн хичээл cls_… ба «Багшийн даалгавар»-ын хичээл) үед хамгаалалт: сурагчийн нэр/и-мэйл/цагтай усан тэмдэг,
      цонхноос гарахад бодлогыг бүдгэрүүлнэ, хуулах/баруун товч/хэвлэхийг хаана, PrtSc дээр санах ойг дарж анхааруулна. Вэб дээр
      дэлгэцийн зургийг 100% хаах боломжгүй (үйлдлийн систем авдаг) — эдгээр нь саад, илрүүлэлт, ул мөр.
   3) window.cmShowClassTime(ангийн id) — багшид сурагч бүрийн хичээл/тестийн тоо, минут, нээсэн, дундаас хаасан, цонхноос гарсан, зураг.
   Бодлогын логикийг өөрчлөхгүй (зөвхөн ажиглана). Embed (iframe) горимд юу ч хийхгүй. */
(function () {
  'use strict';
  var d = document, H = d.documentElement;
  if (window.top !== window.self || H.classList.contains('cm-embed')) return;
  var HB = 60000, S = null, CH = null, CHAT = 0, modal = null, content = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function token() { try { return localStorage.getItem('cm_token') || ''; } catch (e) { return ''; } }
  function user() { return window._currentUser || null; }
  function isStudent() { var u = user(); return !!(u && u.email && u.role !== 'teacher' && u.grade !== 'teacher'); }
  function uid() { return (Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).replace(/[^a-z0-9]/g, '').slice(0, 24); }
  function lid() { try { return typeof currentLessonId !== 'undefined' ? currentLessonId : null; } catch (e) { return null; } }
  function clsMeta() { try { return typeof _activeClassroomLesson !== 'undefined' ? _activeClassroomLesson : null; } catch (e) { return null; } }
  function scoreNow() {
    try { return { score: typeof score !== 'undefined' ? +score : null, total: typeof currentLesson !== 'undefined' && currentLesson && currentLesson.questions ? currentLesson.questions.length : null }; }
    catch (e) { return { score: null, total: null }; }
  }
  function noEmoji(s) { return String(s || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, '').replace(/\s+/g, ' ').trim(); }
  function nodeName(id) {
    try { var L = JSON.parse(localStorage.getItem('cm_nodes') || '[]') || []; for (var i = 0; i < L.length; i++) if (String(L[i].id) === String(id)) return noEmoji(L[i].name); } catch (e) {}
    return 'Хичээл ' + id;
  }
  function isField(t) {
    var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    return tag === 'input' || tag === 'textarea' || tag === 'math-field' || !!(t && t.isContentEditable);
  }

  /* ── «Багшийн даалгавар»-ын хичээлүүд (getChallenges — 10 мин кэш) ── */
  function loadChallenges() {
    var u = user(); if (!u || !u.email || !isStudent() || (CH && Date.now() - CHAT < 600000)) return;
    CHAT = Date.now();
    var f = typeof window.authFetch === 'function' ? window.authFetch : fetch;
    f('/api/users', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: u.email, action: 'getChallenges' }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        var set = {};
        ((j && j.challenges) || []).forEach(function (c) { (c && Array.isArray(c.lessons) ? c.lessons : []).forEach(function (l) { set[String(parseInt(l, 10))] = 1; }); });
        CH = set;
      }).catch(function () {});
  }
  function assigned(id) { return String(id).indexOf('cls_') === 0 || !!(CH && CH[String(parseInt(id, 10))]); }

  /* ── Сесс ── */
  function active() { return d.visibilityState === 'visible' && d.hasFocus(); }
  function tick() { if (S && S.on && S.since) { var now = Date.now(); S.act += now - S.since; S.since = now; } }
  function payload(s) {
    var now = Date.now(), act = s.act + (s.on && s.since ? now - s.since : 0);
    return { sid: s.sid, kind: s.kind, ref: s.ref, ref_name: s.name, classroom_id: s.cid, started_at: s.t0, active_sec: Math.round(act / 1000),
      total_sec: Math.round((now - s.t0) / 1000), leaves: s.leaves, shots: s.shots, completed: !!s.completed, closed_early: !!s.closed,
      score: s.score == null ? null : s.score, total: s.total == null ? null : s.total, secure: !!s.secure };
  }
  function send(s) {
    s = s || S; var t = token(); if (!s || !t) return;
    try {
      fetch('/api/sessions?action=log', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + t },
        body: JSON.stringify(payload(s)) }).catch(function () {});
    } catch (e) {}
  }
  function start() {
    var id = lid(); if (id == null || id === '' || !isStudent()) return;
    var ref = String(id), cls = ref.indexOf('cls_') === 0, meta = cls ? clsMeta() : null, now = Date.now(), on = active();
    S = { sid: uid(), kind: cls ? 'class' : 'lesson', ref: ref, name: cls ? noEmoji((meta && meta.lesson_name) || 'Ангийн хичээл') : nodeName(id),
      cid: (meta && parseInt(meta.classroom_id, 10)) || null, t0: now, act: 0, on: on, since: on ? now : 0, leaves: 0, shots: 0, secure: assigned(id) };
    send();
    if (S.secure) secureOn();
  }
  function stop(completed) {
    if (!S) return;
    tick();
    var s = S; S = null;
    s.completed = !!completed; s.closed = !completed;
    if (completed) { var r = scoreNow(); s.score = r.score; s.total = r.total; }
    send(s);
    secureOff();
  }
  function onModal() {
    if (!modal) return;
    if (modal.classList.contains('open')) {
      if (S && String(lid()) !== S.ref) stop(false);
      if (!S && !content.querySelector('.results-card')) start();
    } else if (S) stop(false);
  }
  function onContent() {
    if (!modal || !modal.classList.contains('open')) return;
    if (!S) { onModal(); return; }
    if (content.querySelector('.results-card')) stop(true);
    else if (String(lid()) !== S.ref) { stop(false); start(); }
  }
  // Цонх/апп-аас гарах — 120мс хүлээж шалгана (iframe дотор фокус шилжвэл гарсан биш)
  var chk = 0;
  function check() {
    clearTimeout(chk);
    chk = setTimeout(function () {
      if (!S) return;
      var a = active(); if (a === S.on) return;
      if (S.on) { tick(); S.on = false; S.since = 0; S.leaves++; hide(true); }
      else { S.on = true; S.since = Date.now(); hide(false); }
    }, 120);
  }

  /* ── Хамгаалалт (багшийн оноосон) ── */
  var STYLE = 'html.cm-secure #quiz-modal{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}' +
    'html.cm-secure #quiz-modal input,html.cm-secure #quiz-modal textarea,html.cm-secure #quiz-modal math-field{-webkit-user-select:text;user-select:text}' +
    '#quiz-modal .cm-wm{position:fixed;inset:0;z-index:2;pointer-events:none;opacity:.13;background-repeat:repeat;background-size:440px 230px}' +
    '#quiz-modal .cm-sec-note{position:fixed;left:50%;bottom:12px;transform:translateX(-50%);z-index:3;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px);' +
    'padding:8px 14px;border-radius:999px;background:#1E1A4D;color:#fff;font:800 12.5px/1.3 Nunito,sans-serif;box-shadow:0 12px 26px -14px rgba(30,26,77,.7);pointer-events:none}' +
    '#quiz-modal .cm-sec-note svg{width:16px;height:16px;flex:none;color:#FFD84A}' +
    '#quiz-modal .cm-sec-mask{display:none;position:fixed;inset:0;z-index:4;align-items:center;justify-content:center;padding:24px;text-align:center;cursor:pointer;' +
    'background:rgba(243,240,255,.9);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px)}' +
    '#quiz-modal .cm-sec-mask div{max-width:380px;padding:22px;border-radius:22px;background:#fff;box-shadow:0 26px 50px -30px rgba(30,26,77,.55);color:#1E1A4D}' +
    '#quiz-modal .cm-sec-mask b{display:block;font:800 18px/1.3 Nunito,sans-serif;margin-bottom:6px}#quiz-modal .cm-sec-mask span{font:700 14px/1.45 Nunito,sans-serif;color:#68628F}' +
    'html.cm-sec-hide #quiz-modal .cm-sec-mask{display:flex}html.cm-sec-hide #quiz-content{filter:blur(16px)}' +
    '#quiz-modal .cm-sec-warn{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:5;padding:10px 16px;border-radius:14px;background:#F04461;color:#fff;' +
    'font:800 13.5px/1.35 Nunito,sans-serif;box-shadow:0 16px 30px -16px rgba(240,68,97,.8);max-width:calc(100% - 24px);text-align:center}' +
    '@media print{html.cm-secure body{display:none!important}}';
  var SHIELD = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/></svg>';
  var parts = [];
  function el(cls, html) { var x = d.createElement('div'); x.className = cls; if (html) x.innerHTML = html; modal.appendChild(x); parts.push(x); return x; }
  function wmUrl(t) {
    var s = '<svg xmlns="http://www.w3.org/2000/svg" width="440" height="230"><text x="20" y="130" transform="rotate(-18 220 115)" font-family="Nunito,Arial,sans-serif" ' +
      'font-size="15" font-weight="700" fill="#1E1A4D">' + esc(t) + '</text></svg>';
    return 'url("data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s) + '")';
  }
  function stamp() { var n = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; }; return n.getFullYear() + '.' + p(n.getMonth() + 1) + '.' + p(n.getDate()) + ' ' + p(n.getHours()) + ':' + p(n.getMinutes()); }
  function secureOn() {
    if (!modal) return;
    if (!d.getElementById('cm-sec-style')) { var st = d.createElement('style'); st.id = 'cm-sec-style'; st.textContent = STYLE; d.head.appendChild(st); }
    secureOff();
    var u = user() || {}, who = ((u.lastName || '') + ' ' + (u.firstName || '')).trim();
    H.classList.add('cm-secure');
    el('cm-wm').style.backgroundImage = wmUrl([who, u.email, stamp()].filter(Boolean).join(' · '));
    el('cm-sec-note', SHIELD + '<span>Хамгаалалттай тест — цонхноос гарах, дэлгэцийн зураг авах оролдлого багшид бүртгэгдэнэ</span>');
    el('cm-sec-mask', '<div><b>Тест түр нуугдлаа</b><span>Тестийн үед өөр цонх, апп руу гарсан нь багшид бүртгэгдэнэ. Үргэлжлүүлэхийн тулд энд дарна уу.</span></div>');
    if (!(S && S.on)) hide(true);
  }
  function secureOff() {
    H.classList.remove('cm-secure', 'cm-sec-hide');
    parts.forEach(function (x) { if (x.parentNode) x.parentNode.removeChild(x); }); parts = [];
  }
  function hide(h) { if (S && S.secure) H.classList.toggle('cm-sec-hide', h); }
  var warnT = 0;
  function shot() {
    if (S) S.shots++;
    try { if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('CyberMath: тестийн үед дэлгэцийн зураг авахыг хориглоно').catch(function () {}); } catch (e) {}
    var w = modal && modal.querySelector('.cm-sec-warn');
    if (!w && modal) { w = el('cm-sec-warn'); }
    if (w) { w.textContent = 'Тестийн үед дэлгэцийн зураг авах, хэвлэхийг хориглоно — оролдлого багшид бүртгэгдлээ'; clearTimeout(warnT); warnT = setTimeout(function () { if (w.parentNode) w.parentNode.removeChild(w); }, 3500); }
  }
  function guardEv(e) {
    if (!H.classList.contains('cm-secure') || !modal || isField(e.target) || !modal.contains(e.target)) return;
    e.preventDefault();
  }

  /* ── Багшийн тайлан ── */
  var CSS2 = '#ct-modal{position:fixed;inset:0;z-index:1250;display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow:auto;background:rgba(20,14,48,.45)}' +
    '#ct-modal .bx{width:100%;max-width:1060px;background:#fff;border-radius:24px;box-shadow:0 30px 70px -30px rgba(20,14,48,.6);font-family:Nunito,"Baloo 2",sans-serif;color:#1E1A4D;overflow:hidden}' +
    '#ct-modal .hd{display:flex;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid #EEEAF8;background:linear-gradient(90deg,#F6F3FF,#fff)}' +
    '#ct-modal .hd h3{margin:0;flex:1;font:800 18px/1.25 Nunito,sans-serif}#ct-modal .hd small{display:block;font-weight:700;color:#68628F;font-size:12.5px;margin-top:2px}' +
    '#ct-modal .x{width:38px;height:38px;border-radius:12px;border:1px solid #E6E0F7;background:#fff;cursor:pointer;font-size:18px;color:#68628F}' +
    '#ct-modal .bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:12px 20px}' +
    '#ct-modal .ch{height:34px;padding:0 14px;border-radius:999px;border:1.5px solid #E6E0F7;background:#fff;cursor:pointer;font:800 13px Nunito,sans-serif;color:#4B4475}' +
    '#ct-modal .ch.on{background:#7B52EE;border-color:#7B52EE;color:#fff}#ct-modal .sp{flex:1}' +
    '#ct-modal .csv{height:34px;padding:0 14px;border-radius:10px;border:1.5px solid #E6E0F7;background:#fff;cursor:pointer;font:800 13px Nunito,sans-serif;color:#1E1A4D}' +
    '#ct-modal .bd{padding:0 20px 20px}#ct-modal .note{margin:10px 0 0;padding:10px 12px;border-left:4px solid #C084FC;color:#4B4475;font-size:12.5px;line-height:1.45}' +
    '#ct-modal table{width:100%;border-collapse:collapse;font-size:13.5px}#ct-modal th{text-align:left;font-size:11.5px;letter-spacing:.04em;color:#68628F;font-weight:900;padding:8px 8px;border-bottom:1.5px solid #EEEAF8;white-space:nowrap}' +
    '#ct-modal td{padding:9px 8px;border-bottom:1px solid #F2EFFA;vertical-align:top}#ct-modal tbody tr{cursor:pointer}#ct-modal tbody tr:hover{background:#FAF8FF}' +
    '#ct-modal td b{font-weight:900}#ct-modal td small{display:block;color:#9C96BC;font-size:11.5px}#ct-modal .w{color:#C42640;font-weight:900}#ct-modal .ok{color:#0E8A51;font-weight:900}' +
    '#ct-modal .tg{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:900;background:#F1ECFF;color:#5B3BD9;margin-right:4px}#ct-modal .tg.t{background:#E6FAFD;color:#0B7F8C}' +
    '#ct-modal .tg.s{background:#FFF1F3;color:#C42640}#ct-modal .back{border:0;background:none;color:#6D45E8;font:800 13px Nunito,sans-serif;cursor:pointer;padding:6px 0}' +
    '#ct-modal .spin{width:30px;height:30px;margin:30px auto;border-radius:50%;border:3px solid #E6E0F7;border-top-color:#7B52EE;animation:ctSpin .8s linear infinite}@keyframes ctSpin{to{transform:rotate(360deg)}}' +
    '@media (max-width:760px){#ct-modal .hide-m{display:none}#ct-modal table{font-size:12.5px}#ct-modal td,#ct-modal th{padding:7px 5px}}';
  function mins(sec) { sec = +sec || 0; if (sec < 60) return sec ? '<1 мин' : '0'; var m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' ц ' + (m % 60) + ' мин' : m + ' мин'; }
  function mmss(sec) { sec = +sec || 0; var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }
  function when(v) { var t = new Date(v); if (isNaN(t)) return ''; var p = function (x) { return (x < 10 ? '0' : '') + x; }; return p(t.getMonth() + 1) + '.' + p(t.getDate()) + ' ' + p(t.getHours()) + ':' + p(t.getMinutes()); }
  function apiGet(qs) {
    var f = typeof window.authFetch === 'function' ? window.authFetch : fetch;
    return f('/api/sessions?' + qs).then(function (r) { return r.json().catch(function () { return { ok: false }; }); });
  }
  window.cmShowClassTime = function (classroomId) {
    if (!classroomId) return;
    if (!d.getElementById('ct-style')) { var st = d.createElement('style'); st.id = 'ct-style'; st.textContent = CSS2; d.head.appendChild(st); }
    var m = d.getElementById('ct-modal'); if (m) m.remove();
    m = d.createElement('div'); m.id = 'ct-modal';
    m.innerHTML = '<div class="bx" role="dialog" aria-modal="true" aria-label="Хугацаа ба оролцоо"><div class="hd"><h3>Хугацаа ба оролцоо<small></small></h3>' +
      '<button type="button" class="x" data-a="close" aria-label="Хаах"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="bar"><button type="button" class="ch on" data-days="7">7 хоног</button>' +
      '<button type="button" class="ch" data-days="30">30 хоног</button><button type="button" class="ch" data-days="0">Бүгд</button><span class="sp"></span>' +
      '<button type="button" class="csv" data-a="csv">CSV татах</button></div><div class="bd"><div class="spin"></div></div></div>';
    d.body.appendChild(m);
    var days = 7, data = null, body = m.querySelector('.bd');
    function close() { m.remove(); d.removeEventListener('keydown', esc1); }
    function esc1(e) { if (e.key === 'Escape') close(); }
    d.addEventListener('keydown', esc1);
    function load() {
      body.innerHTML = '<div class="spin"></div>';
      apiGet('action=class&classroom_id=' + encodeURIComponent(classroomId) + '&days=' + days).then(function (j) {
        if (!j || !j.ok) { body.innerHTML = '<div class="note">' + esc((j && j.error) || 'Тайлан ачаалж чадсангүй') + '</div>'; return; }
        data = j; m.querySelector('.hd small').textContent = (j.classroom && j.classroom.name ? j.classroom.name + ' · ' : '') + (days ? 'сүүлийн ' + days + ' хоног' : 'бүх хугацаа');
        var st = j.students || [];
        if (!st.length) { body.innerHTML = '<div class="note">Энэ ангид сурагч алга.</div>'; return; }
        var rows = st.map(function (s, i) {
          var L = s.lesson || {}, T = s.test || {};
          return '<tr data-i="' + i + '"><td><b>' + esc(s.name) + '</b><small>' + esc(s.email) + '</small></td>' +
            '<td>' + (L.n || 0) + ' <small>' + mins(L.sec) + (L.n ? ' · дундаж ' + mins(Math.round(L.sec / L.n)) : '') + '</small></td>' +
            '<td>' + (T.n || 0) + ' <small>' + mins(T.sec) + (T.n ? ' · дундаж ' + mins(Math.round(T.sec / T.n)) : '') + '</small></td>' +
            '<td>' + (s.opens || 0) + '</td><td' + (s.early ? ' class="w"' : '') + '>' + (s.early || 0) + '</td>' +
            '<td' + (s.leaves ? ' class="w"' : '') + '>' + (s.leaves || 0) + '</td><td' + (s.shots ? ' class="w"' : '') + '>' + (s.shots || 0) + '</td>' +
            '<td class="hide-m">' + (s.last ? when(s.last) : '—') + '</td></tr>';
        }).join('');
        body.innerHTML = '<table><thead><tr><th>Сурагч</th><th>Хичээл</th><th>Тест</th><th>Нээсэн</th><th>Дундаас хаасан</th><th>Цонхноос гарсан</th>' +
          '<th>Зураг авах</th><th class="hide-m">Сүүлд</th></tr></thead><tbody>' + rows + '</tbody></table>' +
          '<div class="note">Минут — бодлогын цонх нээлттэй, идэвхтэй байсан хугацаа. «Тест» — таны оноосон ангийн хичээл ба даалгавар. ' +
          '«Цонхноос гарсан» — хичээл/тестийн дундуур өөр цонх, апп руу шилжсэн тоо. «Зураг авах» — тестийн үед PrtSc, хэвлэх оролдлого. Мөрөн дээр дарж дэлгэрэнгүйг харна.</div>';
      }).catch(function () { body.innerHTML = '<div class="note">Сүлжээний алдаа. Дахин оролдоно уу.</div>'; });
    }
    function detail(s) {
      body.innerHTML = '<button type="button" class="back" data-a="back">‹ Бүх сурагч</button><div class="spin"></div>';
      apiGet('action=student&classroom_id=' + encodeURIComponent(classroomId) + '&email=' + encodeURIComponent(s.email) + '&days=' + days).then(function (j) {
        if (!j || !j.ok) { body.innerHTML = '<button type="button" class="back" data-a="back">‹ Бүх сурагч</button><div class="note">' + esc((j && j.error) || 'Ачаалж чадсангүй') + '</div>'; return; }
        var ss = j.sessions || [];
        var rows = ss.map(function (x) {
          var state = x.completed ? '<span class="ok">Дууссан' + (x.total ? ' · ' + x.score + '/' + x.total : '') + '</span>' : (x.closed_early ? '<span class="w">Дундаас хаасан</span>' : 'Үргэлжилж байна');
          return '<tr><td>' + when(x.at) + '</td><td><b>' + esc(x.name || x.ref) + '</b><br><span class="tg' + (x.test ? ' t' : '') + '">' + (x.test ? 'Тест' : 'Хичээл') + '</span>' +
            (x.secure ? '<span class="tg s">Хамгаалалттай</span>' : '') + '</td><td><b>' + mmss(x.active_sec) + '</b><small>нийт ' + mmss(x.total_sec) + '</small></td>' +
            '<td>' + state + '</td><td' + (x.leaves ? ' class="w"' : '') + '>' + x.leaves + '</td><td' + (x.shots ? ' class="w"' : '') + '>' + x.shots + '</td></tr>';
        }).join('');
        body.innerHTML = '<button type="button" class="back" data-a="back">‹ Бүх сурагч</button><div style="font:800 15px Nunito,sans-serif;margin:4px 0 10px">' + esc(s.name) + '</div>' +
          (ss.length ? '<table><thead><tr><th>Огноо</th><th>Хичээл / тест</th><th>Идэвхтэй</th><th>Төлөв</th><th>Цонхноос гарсан</th><th>Зураг авах</th></tr></thead><tbody>' + rows + '</tbody></table>'
            : '<div class="note">Энэ хугацаанд бүртгэл алга.</div>');
      }).catch(function () { body.innerHTML = '<button type="button" class="back" data-a="back">‹ Бүх сурагч</button><div class="note">Сүлжээний алдаа.</div>'; });
    }
    function csv() {
      if (!data || !data.students) return;
      var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var lines = [['Сурагч', 'И-мэйл', 'Хичээл (тоо)', 'Хичээл (мин)', 'Тест (тоо)', 'Тест (мин)', 'Нээсэн', 'Дундаас хаасан', 'Цонхноос гарсан', 'Зураг авах', 'Сүүлд'].join(',')];
      data.students.forEach(function (s) {
        var L = s.lesson || {}, T = s.test || {};
        lines.push([s.name, s.email, L.n || 0, Math.round((L.sec || 0) / 60), T.n || 0, Math.round((T.sec || 0) / 60), s.opens || 0, s.early || 0, s.leaves || 0, s.shots || 0, s.last ? when(s.last) : ''].map(q).join(','));
      });
      var blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' }), a = d.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'hugatsaa-' + ((data.classroom && data.classroom.name) || 'angi').replace(/[^\wА-Яа-яӨөҮүЁё-]+/g, '_') + '.csv';
      d.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    }
    m.addEventListener('click', function (e) {
      if (e.target === m) { close(); return; }
      var b = e.target.closest('[data-a],[data-days],tr[data-i]'); if (!b) return;
      if (b.hasAttribute('data-days')) { days = +b.getAttribute('data-days'); [].forEach.call(m.querySelectorAll('.ch'), function (c) { c.classList.toggle('on', c === b); }); load(); return; }
      var a = b.getAttribute('data-a');
      if (a === 'close') close(); else if (a === 'back') load(); else if (a === 'csv') csv();
      else if (b.hasAttribute('data-i') && data && data.students) detail(data.students[+b.getAttribute('data-i')]);
    });
    load();
  };

  /* ── Эхлүүлэх ── */
  function init() {
    modal = d.getElementById('quiz-modal'); content = d.getElementById('quiz-content');
    if (!modal || !content) return;
    new MutationObserver(onModal).observe(modal, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(onContent).observe(content, { childList: true });
    window.addEventListener('blur', check); window.addEventListener('focus', check); d.addEventListener('visibilitychange', check);
    setInterval(function () { if (S) { tick(); send(); } }, HB);
    window.addEventListener('pagehide', function () { if (S) { tick(); S.closed = true; send(); } });
    ['copy', 'cut', 'contextmenu', 'dragstart', 'selectstart'].forEach(function (t) { d.addEventListener(t, guardEv, true); });
    d.addEventListener('keydown', function (e) {
      if (!H.classList.contains('cm-secure')) return;
      var k = e.key || '';
      if (((e.ctrlKey || e.metaKey) && /^p$/i.test(k)) || (e.metaKey && e.shiftKey && /^[345]$/.test(k))) { e.preventDefault(); shot(); }
    }, true);
    d.addEventListener('keyup', function (e) { if (H.classList.contains('cm-secure') && e.key === 'PrintScreen') { e.preventDefault(); shot(); } }, true);
    modal.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.cm-sec-mask')) { try { window.focus(); } catch (x) {} check(); } });
    // Нэвтэрсэн сурагчийн даалгаврын хичээлүүд — апп ачаалагдсаны дараа
    setTimeout(loadChallenges, 4000);
    d.addEventListener('visibilitychange', function () { if (!d.hidden) loadChallenges(); });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
