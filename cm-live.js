/* CyberMath — даалгаврын хугацаат шууд хяналт (api/presence.js).
   Сурагч: багшийн оноосон цагтай даалгаврын хугацаанд (ж: 10:10–11:00) 5 сек тутам төлөвөө илгээнэ —
     task: даалгаврын хичээл нээлттэй (асуултын дугаартай) · site: сайтын өөр хэсэг · away: апп сольсон / дэлгэц унтарсан.
     Гарах мөчид (visibilitychange, pagehide) шууд away. Сурагчид тэмдэг харуулахгүй (эзэмшигчийн шийдвэр 2026-11-19).
   Багш: ангийн цонх (#classroom-detail-modal) нээлттэй бөгөөд тухайн ангид явагдаж буй цагтай даалгавар байвал
     «Шууд хяналт» самбар (5 сек тутам шинэчлэгдэнэ). Цагийг серверийнхээр (утасны цаг буруу байж болно). */
(function () {
  'use strict';
  if (window.top !== window.self || window.CMLive) return;
  var d = document, HB = 5000;
  function tok() { try { return localStorage.getItem('cm_token') || ''; } catch (e) { return ''; } }
  // cm_current-ийг _saveCurrentUser үргэлж шинэчилдэг; window._currentUser нь нэвтрэлт солигдоход хуучирч болно
  function me() { try { return JSON.parse(localStorage.getItem('cm_current') || 'null') || window._currentUser || null; } catch (e) { return window._currentUser || null; } }
  function isTeacher(u) { return !!(u && (u.role === 'teacher' || u.grade === 'teacher')); }
  function api(url, opt) {
    opt = opt || {};
    opt.headers = Object.assign({ Authorization: 'Bearer ' + tok() }, opt.headers || {});
    return fetch(url, opt).then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function hm(iso) { var t = new Date(iso); return ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2); }
  // тоо нэгжээсээ мөр шилжиж салахгүй (U+00A0)
  function dur(s) { s = Math.max(0, Math.round(s || 0)); return s < 60 ? s + ' сек' : Math.floor(s / 60) + ' мин' + (s % 60 ? ' ' + (s % 60) + ' сек' : ''); }

  /* ── Сурагч ── */
  var mine = [], skew = 0, mineAt = 0, mineBusy = false, curCid = null, member = true, lastLes = '';
  function now() { return Date.now() + skew; }
  function quiz() { try { return typeof window.cmQuizState === 'function' ? window.cmQuizState() : null; } catch (e) { return null; } }
  function activeCh() {
    var t = now();
    for (var i = 0; i < mine.length; i++) { var c = mine[i]; if (t >= Date.parse(c.startAt) && t <= Date.parse(c.endAt)) return c; }
    return null;
  }
  function loadMine() {
    if (mineBusy || !tok()) return;
    mineBusy = true; mineAt = Date.now();
    api('/api/presence?action=mine').then(function (j) { if (j && j.ok) { mine = j.list || []; member = j.member !== false; if (j.now) skew = j.now - Date.now(); } })
      .catch(function () {}).then(function () { mineBusy = false; });
  }
  function state(ch) {
    if (d.hidden || (d.hasFocus && !d.hasFocus())) return { st: 'away' };
    var qs = quiz();
    if (qs && qs.open && qs.lesson && ch.lessons.indexOf(String(qs.lesson)) >= 0) return { st: 'task', q: qs.q || '', lesson: qs.lesson };
    return { st: 'site', lesson: qs && qs.open ? qs.lesson : '' };
  }
  function send(ch, s, keep) {
    try {
      fetch('/api/presence?action=beat', { method: 'POST', keepalive: !!keep, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() },
        body: JSON.stringify({ cid: ch.cid, st: s.st, q: s.q || '', lesson: s.lesson || '' }) }).catch(function () {});
    } catch (e) {}
  }
  function student() { var u = me(); return !!(u && !isTeacher(u) && tok()); }
  function tick() {
    if (!student()) return;
    // Жагсаалтыг 2 мин тутам (ангигүй бол 10 мин); хичээл шинээр нээхэд эрт — сая оноосон даалгавар байж болно
    var qs = quiz(), les = qs && qs.open ? String(qs.lesson || '') : '';
    var fresh = !!les && les !== lastLes && Date.now() - mineAt > 30000;
    lastLes = les;
    if (!mineAt || fresh || Date.now() - mineAt > (member ? 2 : 10) * 60000) loadMine();
    var ch = activeCh(); curCid = ch ? ch.cid : null;
    if (ch && !d.hidden) send(ch, state(ch));
  }
  function leave() { if (!student()) return; var ch = activeCh(); if (ch) send(ch, { st: 'away' }, true); }
  function back() { if (!student()) return; var ch = activeCh(); if (ch && !d.hidden) send(ch, state(ch)); }
  d.addEventListener('visibilitychange', function () { if (d.hidden) leave(); else back(); });
  window.addEventListener('pagehide', leave);
  window.addEventListener('blur', function () { setTimeout(function () { if (d.hasFocus && !d.hasFocus() && !d.hidden) back(); }, 150); });
  window.addEventListener('focus', back);

  /* ── Багш: «Шууд хяналт» самбар ── */
  var panel = null, curCls = null, actAt = 0, pick = null, liveT = 0, skewT = 0, cur = [];
  function clsId() { try { return typeof window.cmCurClassroom === 'function' ? window.cmCurClassroom() : null; } catch (e) { return null; } }
  function modalOpen() { var m = d.getElementById('classroom-detail-modal'); return !!(m && m.style.display !== 'none' && getComputedStyle(m).display !== 'none'); }
  var CSS = '#cml{background:#fff;border:1.5px solid #E4DEF7;border-radius:16px;padding:12px 14px;margin:0 0 16px;font-family:"Baloo 2",sans-serif;color:#211C54}'
    + '#cml .h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}#cml .h b{font-size:1rem;font-weight:900}'
    + '#cml .dot{width:9px;height:9px;border-radius:50%;background:#EF4444;box-shadow:0 0 0 0 rgba(239,68,68,.6);animation:cmlP 1.6s infinite}'
    + '@keyframes cmlP{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}70%{box-shadow:0 0 0 8px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}'
    + '#cml .tm{font-size:.8rem;font-weight:700;color:#6B6690}#cml select{font:inherit;font-size:.8rem;border:1.5px solid #E4DEF7;border-radius:8px;padding:2px 6px}'
    + '#cml .sum{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}#cml .sum span{font-size:.78rem;font-weight:800;border-radius:999px;padding:3px 10px}'
    + '#cml table{width:100%;border-collapse:collapse;font-size:.82rem}#cml td,#cml th{padding:5px 6px;border-top:1px solid #F1EDFB;text-align:left}#cml th{font-size:.72rem;color:#9A95B8;font-weight:800}'
    + '#cml .p{display:inline-flex;align-items:center;gap:5px;font-weight:800;border-radius:999px;padding:2px 9px;font-size:.76rem;white-space:nowrap}'
    + '#cml .task{background:#DCFCE7;color:#15803D}#cml .site{background:#FEF3C7;color:#B45309}#cml .away{background:#FEE2E2;color:#B91C1C}#cml .lost{background:#EDE9FE;color:#6D28D9}#cml .none{background:#F1F5F9;color:#64748B}'
    + '#cml .r{text-align:right}#cml .nm{font-weight:700;line-height:1.25}#cml .mt{font-size:.72rem;color:#9A95B8;font-weight:700;line-height:1.3;font-variant-numeric:tabular-nums}'
    + '#cml .em{color:#9A95B8;font-size:.8rem;padding:6px 0}'
    + '@media (max-width:420px){#cml{padding:10px}#cml .p{font-size:.7rem;padding:2px 7px}#cml td,#cml th{padding:5px 3px}#cml .sum span{font-size:.72rem;padding:2px 8px}}';
  function stopPanel() { clearTimeout(liveT); liveT = 0; if (panel) { panel.remove(); panel = null; } }
  function ensurePanel() {
    var anchor = d.getElementById('live-class-dashboard');
    if (!anchor || !anchor.parentNode) return null;
    if (!d.getElementById('cml-css')) { var st = d.createElement('style'); st.id = 'cml-css'; st.textContent = CSS; d.head.appendChild(st); }
    if (!panel || !panel.isConnected) {
      panel = d.createElement('div'); panel.id = 'cml';
      anchor.parentNode.insertBefore(panel, anchor);
      panel.addEventListener('change', function (e) { if (e.target && e.target.id === 'cml-pick') { pick = e.target.value; poll(); } });
    }
    return panel;
  }
  function loadActive() {
    actAt = Date.now();
    var c = curCls;
    api('/api/presence?action=active&class=' + encodeURIComponent(c)).then(function (j) {
      if (c !== curCls || !j || !j.ok) return;
      if (j.now) skewT = j.now - Date.now();
      var t = Date.now() + skewT;
      // явагдаж буй, эсвэл 15 мин дотор эхлэх/дууссан цагтай даалгавар
      cur = (j.list || []).filter(function (x) { return t >= Date.parse(x.startAt) - 15 * 60000 && t <= Date.parse(x.endAt) + 15 * 60000; });
      if (!cur.length) { stopPanel(); return; }
      if (!pick || !cur.some(function (x) { return x.cid === pick; })) pick = cur[0].cid;
      if (ensurePanel() && !liveT) poll();
    }).catch(function () {});
  }
  function render(j) {
    if (!panel || !j || !j.ok) return;
    var ch = j.challenge, t = (j.now || Date.now()), s = Date.parse(ch.startAt), e = Date.parse(ch.endAt);
    var phase = t < s ? 'Эхлэхэд ' + dur((s - t) / 1000) : t > e ? 'Дууссан' : 'Дуусахад ' + dur((e - t) / 1000);
    // away — утас өөрөө гарсан гэж мэдэгдсэн (апп сольсон/дэлгэц түгжсэн); lost — 15+ сек дохиогүй (интернэт тасарсан байж болно)
    var LBL = { task: 'Даалгавар дээр', site: 'Сайтын өөр хэсэгт', away: 'Гарсан', lost: 'Холболтгүй', none: 'Ороогүй' };
    var SH = { task: 'Даалгавар', site: 'Өөр хэсэгт', away: 'Гарсан', lost: 'Холболтгүй', none: 'Ороогүй' };   // мөрөнд богино (утсанд багтана)
    var cnt = { task: 0, site: 0, away: 0, lost: 0, none: 0 };
    j.rows.forEach(function (r) { if (!SH[r.st]) r.st = 'none'; cnt[r.st]++; });
    var sel = cur.length > 1 ? '<select id="cml-pick">' + cur.map(function (x) { return '<option value="' + esc(x.cid) + '"' + (x.cid === pick ? ' selected' : '') + '>' + esc(x.title) + '</option>'; }).join('') + '</select>' : '';
    panel.innerHTML = '<div class="h"><span class="dot"></span><b>Шууд хяналт</b><span class="tm">' + esc(ch.title) + ' · ' + hm(ch.startAt) + '–' + hm(ch.endAt) + ' · ' + phase + '</span>' + sel + '</div>'
      + '<div class="sum"><span class="task">' + LBL.task + ': ' + cnt.task + '</span><span class="site">' + LBL.site + ': ' + cnt.site + '</span><span class="away">' + LBL.away + ': ' + cnt.away + '</span>'
      + (cnt.lost ? '<span class="lost">' + LBL.lost + ': ' + cnt.lost + '</span>' : '') + '<span class="none">' + LBL.none + ': ' + cnt.none + '</span></div>'
      + (j.rows.length ? '<table><thead><tr><th>Сурагч</th><th class="r">Төлөв</th></tr></thead><tbody>'
        + j.rows.map(function (r) {
          var p = r.st === 'task' ? SH.task + (r.q ? ' · ' + esc(r.q) : '') : (r.st === 'away' || r.st === 'lost') && r.ago != null ? SH[r.st] + ' · ' + dur(r.ago) : SH[r.st];
          // Гарсан/тасарсан тоо, гадуур хугацаа — нэрийн доор (утсанд 4 багана багтахгүй)
          var mt = [];
          if (r.leaves) mt.push(r.leaves + ' удаа гарсан');
          if (r.gaps) mt.push(r.gaps + ' удаа тасарсан');
          if (r.away) mt.push('гадуур ' + dur(r.away));
          return '<tr><td><div class="nm">' + esc(r.name) + '</div>' + (mt.length ? '<div class="mt">' + mt.join(' · ') + '</div>' : '') + '</td>'
            + '<td class="r"><span class="p ' + r.st + '">' + p + '</span></td></tr>';
        }).join('') + '</tbody></table>' : '<div class="em">Ангид сурагч алга.</div>');
  }
  function poll() {
    clearTimeout(liveT); liveT = 0;
    if (!pick || !curCls || !modalOpen()) return;
    api('/api/presence?action=live&class=' + encodeURIComponent(curCls) + '&cid=' + encodeURIComponent(pick)).then(render).catch(function () {})
      .then(function () { if (modalOpen() && panel) liveT = setTimeout(poll, HB); });
  }
  function watchTeacher() {
    var u = me(); if (!u || !tok()) return;
    if (!modalOpen()) { if (panel || liveT) stopPanel(); curCls = null; return; }
    var c = clsId(); if (c == null || c === '') return;
    c = String(c);
    if (c !== curCls) { curCls = c; pick = null; stopPanel(); loadActive(); }
    else if (Date.now() - actAt > 60000) loadActive();
  }

  setInterval(tick, HB);
  setInterval(watchTeacher, 1000);
  setTimeout(tick, 1500);
  window.CMLive = { tick: tick, loadMine: loadMine, _s: function () { return { mine: mine, skew: skew, cur: curCid }; } };
})();
