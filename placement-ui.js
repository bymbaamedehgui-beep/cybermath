/* Түвшин тогтоох сорил — Тоглоомын төвийн «Шалгалт» таб (index.html #tab-exam), API /api/placement.
   2026-11-07 эзэмшигч: «Анги бүрт түвшин тогтоох сорил … аль сэдвээс эхэлж хийхийг нь нарийвчлан гаргаж өгдөг байх»;
   санал болгосон сэдэв хүртэл хичээлийн зам нээгдэнэ (localStorage cm_placement → index.html cmPlacementSlot);
   багш ангийнхаа дүнг харна (window.plShowClass — ангийн дэлгэрэнгүй цонхны товч).
   Хоёр шаттай: 1) бүлэг бүрээс 1–2 бодлого → сул бүлэг; 2) тэр бүлгийн сэдэв бүрээс 1 → яг эхлэх сэдэв.
   Зөв хариуг сервер шалгана (клиентэд очдоггүй). Embed (Дасгалын төв) горимд юу ч хийхгүй. */
(function () {
  'use strict';
  var d = document;
  if (window.top !== window.self || d.documentElement.classList.contains('cm-embed')) return;
  var GRADES = ['6', '7', '8', '9', '10', '12'];
  var LS = 'cm_placement';   // { "7": { start: nodeId, name, chapter, at } }
  var S = { grade: null, plan: {}, t: null, stage: 1, qs: [], k: 0, ans: [], sel: null, chapter: '', result: null, saved: false, last: {}, busy: false, synced: false };
  var root = null;

  /* ── Туслах ── */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function tex(s) {
    var out = '';
    String(s == null ? '' : s).split(/(\$[^$]+\$)/g).forEach(function (p) {
      if (/^\$[^$]+\$$/.test(p) && window.katex) { try { out += window.katex.renderToString(p.slice(1, -1), { throwOnError: false }); return; } catch (e) {} }
      out += esc(p).replace(/\n/g, '<br>');
    });
    return out;
  }
  function api(method, action, body, qs) {
    var f = typeof window.authFetch === 'function' ? window.authFetch : fetch;
    var o = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (body) o.body = JSON.stringify(body);
    return f('/api/placement?action=' + action + (qs || ''), o).then(function (r) {
      return r.json().catch(function () { return { ok: false }; }).then(function (j) { j._st = r.status; return j; });
    });
  }
  function userGrade() { try { return typeof window.cmUserGrade === 'function' ? String(window.cmUserGrade() || '') : ''; } catch (e) { return ''; } }
  function isTeacher() { var u = window._currentUser; return userGrade() === 'teacher' || !!(u && (u.role === 'teacher' || u.grade === 'teacher')); }
  function loggedIn() { var u = window._currentUser; return !!(u && u.email); }
  function lsGet() { try { return JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (e) { return {}; } }
  function lsSet(o) { try { localStorage.setItem(LS, JSON.stringify(o)); } catch (e) {} }
  function fmtDate(v) { var t = new Date(v); return isNaN(t) ? '' : t.getFullYear() + '.' + ('0' + (t.getMonth() + 1)).slice(-2) + '.' + ('0' + t.getDate()).slice(-2); }
  var I = {
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 22V4M4 4h12l-2 4 2 4H4"/></svg>',
    target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/></svg>',
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10"/></svg>',
    redo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>'
  };
  var ST = { mastered: ['Эзэмшсэн', 'ok'], partial: ['Дунд', 'mid'], weak: ['Анхаарах', 'bad'], untested: ['—', 'na'] };

  /* ── Хэв маяг ── */
  function css() {
    if (d.getElementById('pl-css')) return;
    var s = d.createElement('style'); s.id = 'pl-css';
    s.textContent = [
      '#pl-root{font-family:"Nunito",system-ui,sans-serif;color:#211C54;max-width:760px;margin:0 auto}',
      '#pl-root *{box-sizing:border-box}',
      '.pl-hero{position:relative;overflow:hidden;border-radius:24px;padding:22px 20px;color:#fff;background:radial-gradient(circle at 90% 0,rgba(255,193,19,.28),transparent 45%),linear-gradient(135deg,#5B3BD9,#8B5CF6);box-shadow:0 18px 40px -18px rgba(91,59,217,.7)}',
      '.pl-hero h2{margin:0;font-weight:900;font-size:1.45rem;line-height:1.15}',
      '.pl-hero p{margin:6px 0 0;font-weight:700;font-size:.92rem;line-height:1.45;color:rgba(255,255,255,.9)}',
      '.pl-hero .pl-ic{position:absolute;right:16px;top:16px;width:52px;height:52px;border-radius:16px;background:rgba(255,255,255,.16);display:grid;place-items:center}',
      '.pl-hero .pl-ic svg{width:28px;height:28px}',
      '.pl-sec{margin-top:16px;background:#fff;border:1.5px solid #EEE9FC;border-radius:20px;padding:16px}',
      '.pl-h{font-weight:900;font-size:1rem;margin:0 0 10px}',
      '.pl-grades{display:flex;flex-wrap:wrap;gap:8px}',
      '.pl-g{min-width:58px;padding:10px 12px;border-radius:14px;border:1.5px solid #E4DAFF;background:#FAF8FF;color:#3d3768;font:900 .95rem/1 "Nunito",sans-serif;cursor:pointer}',
      '.pl-g.on{background:#5B3BD9;border-color:#5B3BD9;color:#fff;box-shadow:0 8px 18px -8px rgba(91,59,217,.8)}',
      '.pl-g[disabled]{opacity:.45;cursor:not-allowed}',
      '.pl-g small{display:block;font-size:.6rem;font-weight:800;margin-top:3px;opacity:.8}',
      '.pl-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:12px}',
      '.pl-fact{background:#F8F6FF;border-radius:14px;padding:10px 8px;text-align:center}',
      '.pl-fact svg{width:18px;height:18px;color:#7B52EE}',
      '.pl-fact b{display:block;font-size:1.05rem;font-weight:900;margin-top:2px}',
      '.pl-fact span{font-size:.72rem;font-weight:800;color:#6D6890}',
      '.pl-chlist{margin:12px 0 0;padding:0;list-style:none;display:flex;flex-wrap:wrap;gap:6px}',
      '.pl-chlist li{font-size:.76rem;font-weight:800;color:#4b4672;background:#F1ECFF;border-radius:999px;padding:5px 10px}',
      '.pl-note{margin-top:12px;font-size:.82rem;font-weight:700;color:#5F5A86;line-height:1.45;border-left:4px solid #C4B5FD;padding:2px 0 2px 10px}',
      '.pl-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border:0;border-radius:16px;padding:14px 20px;font:900 1rem/1 "Nunito",sans-serif;cursor:pointer}',
      '.pl-btn svg{width:18px;height:18px}',
      '.pl-btn.p{color:#fff;background:linear-gradient(135deg,#7B52EE,#5B3BD9);box-shadow:0 4px 0 #4527B8}',
      '.pl-btn.g{color:#2A1A00;background:linear-gradient(180deg,#FFD34D,#FFC113);box-shadow:0 4px 0 #C98F00}',
      '.pl-btn.s{color:#5B3BD9;background:#fff;border:1.5px solid #E4DAFF}',
      '.pl-btn[disabled]{opacity:.5;cursor:not-allowed}',
      '.pl-wide{width:100%;margin-top:14px}',
      '.pl-last{display:flex;align-items:center;gap:12px;flex-wrap:wrap}',
      '.pl-last .pl-pc{font-weight:900;font-size:1.3rem;color:#5B3BD9}',
      '.pl-last .pl-lt{flex:1;min-width:180px;font-size:.86rem;font-weight:700;color:#3d3768;line-height:1.4}',
      /* асуулт */
      '.pl-top{display:flex;align-items:center;gap:10px}',
      '.pl-stage{font-size:.74rem;font-weight:900;letter-spacing:.04em;color:#5B3BD9;background:#F1ECFF;border-radius:999px;padding:5px 10px;white-space:nowrap}',
      '.pl-num{margin-left:auto;font-weight:900;font-size:.9rem;color:#6D6890}',
      '.pl-x{width:36px;height:36px;border-radius:12px;border:1.5px solid #EEE9FC;background:#fff;color:#6D6890;display:grid;place-items:center;cursor:pointer}',
      '.pl-x svg{width:16px;height:16px}',
      '.pl-bar{height:8px;border-radius:99px;background:#EEE9FC;margin:12px 0 14px;overflow:hidden}',
      '.pl-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7B52EE,#A855F7);transition:width .3s}',
      '.pl-q{background:#fff;border:1.5px solid #EEE9FC;border-radius:22px;padding:18px 16px}',
      '.pl-chap{font-size:.76rem;font-weight:900;color:#7B52EE;text-transform:uppercase;letter-spacing:.04em}',
      '.pl-text{margin:8px 0 14px;font-size:1.12rem;font-weight:800;line-height:1.5;word-wrap:break-word}',
      '.pl-opts{display:grid;gap:10px}',
      '.pl-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;border-radius:16px;border:2px solid #E9E4FA;background:#FCFBFF;font:800 1rem/1.4 "Nunito",sans-serif;color:#211C54;cursor:pointer}',
      '.pl-opt b{width:30px;height:30px;border-radius:10px;display:grid;place-items:center;flex:none;background:#F1ECFF;color:#5B3BD9;font-weight:900}',
      '.pl-opt.on{border-color:#7B52EE;background:#F5F0FF;box-shadow:0 0 0 3px rgba(123,82,238,.15)}',
      '.pl-opt.on b{background:#7B52EE;color:#fff}',
      '.pl-foot{display:flex;gap:10px;margin-top:14px}',
      '.pl-foot .pl-btn{flex:1}',
      '.pl-mid{text-align:center;padding:34px 18px}',
      '.pl-mid .pl-big{width:72px;height:72px;margin:0 auto 12px;border-radius:22px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#22C55E,#16A34A)}',
      '.pl-mid .pl-big svg{width:38px;height:38px}',
      '.pl-mid h3{margin:0 0 6px;font-weight:900;font-size:1.25rem}',
      '.pl-mid p{margin:0;font-weight:700;color:#5F5A86;line-height:1.5}',
      '.pl-spin{width:34px;height:34px;margin:10px auto;border-radius:50%;border:4px solid #E4DAFF;border-top-color:#7B52EE;animation:plspin .8s linear infinite}',
      '@keyframes plspin{to{transform:rotate(360deg)}}',
      /* дүн */
      '.pl-res{display:flex;align-items:center;gap:16px}',
      '.pl-ring{--p:0;width:96px;height:96px;flex:none;border-radius:50%;display:grid;place-items:center;background:conic-gradient(#FFC113 calc(var(--p)*1%),rgba(255,255,255,.25) 0)}',
      '.pl-ring span{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:#5B3BD9;font-weight:900;font-size:1.35rem}',
      '.pl-start{margin-top:16px;border-radius:22px;padding:18px 16px;background:#F7F4FF;border:2px solid #C4B5FD}',
      '.pl-start .pl-k{display:inline-flex;align-items:center;gap:6px;font-size:.76rem;font-weight:900;color:#6D28D9;text-transform:uppercase;letter-spacing:.05em}',
      '.pl-start .pl-k svg{width:16px;height:16px}',
      '.pl-start h3{margin:8px 0 4px;font-weight:900;font-size:1.3rem;line-height:1.25;color:#211C54}',
      '.pl-start p{margin:0;font-weight:700;color:#4B5563;font-size:.88rem;line-height:1.45}',
      '.pl-chs{display:flex;flex-direction:column;gap:9px;margin:0;padding:0;list-style:none}',
      '.pl-chs li{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center}',
      '.pl-chs .n{font-weight:800;font-size:.9rem;line-height:1.3}',
      '.pl-chs .c{font-weight:900;font-size:.72rem;border-radius:999px;padding:4px 9px;white-space:nowrap}',
      '.pl-chs .c.ok{background:#DCFCE7;color:#166534}.pl-chs .c.mid{background:#FEF3C7;color:#92400E}.pl-chs .c.bad{background:#FEE2E2;color:#991B1B}.pl-chs .c.na{background:#F3F4F6;color:#6B7280}',
      '.pl-chs .b{grid-column:1/-1;height:7px;border-radius:99px;background:#F1ECFF;overflow:hidden}',
      '.pl-chs .b i{display:block;height:100%;border-radius:99px}',
      '.pl-chs li.f .n{color:#B45309}',
      '.pl-rev{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:8px}',
      '.pl-rev li{font-size:.88rem;font-weight:800;line-height:1.35;padding:9px 12px;border-radius:12px;background:#FFF7F7;border:1px solid #FDE2E2}',
      '.pl-rev li span{display:block;font-size:.74rem;font-weight:800;color:#9B6A6A}',
      '.pl-acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}',
      '.pl-acts .pl-btn{flex:1 1 200px}',
      /* багшийн цонх */
      '#pl-modal{position:fixed;inset:0;z-index:700;background:rgba(10,8,40,.78);display:flex;align-items:center;justify-content:center;padding:16px}',
      '#pl-modal .pl-mbox{width:100%;max-width:760px;max-height:88vh;overflow:auto;background:#fff;border-radius:22px;padding:18px;font-family:"Nunito",system-ui,sans-serif;color:#211C54}',
      '#pl-modal .pl-mh{display:flex;align-items:center;gap:10px;margin-bottom:12px}',
      '#pl-modal .pl-mh h3{margin:0;font-weight:900;font-size:1.15rem;flex:1}',
      '#pl-modal table{width:100%;border-collapse:collapse;font-size:.84rem}',
      '#pl-modal th{text-align:left;font-weight:900;color:#6D6890;font-size:.74rem;text-transform:uppercase;padding:8px 6px;border-bottom:1.5px solid #EEE9FC}',
      '#pl-modal td{padding:9px 6px;border-bottom:1px solid #F3F0FC;vertical-align:top;font-weight:700}',
      '#pl-modal td.pc{font-weight:900;color:#5B3BD9;white-space:nowrap}',
      '#pl-modal .pl-tag{display:inline-block;margin:0 4px 4px 0;font-size:.72rem;font-weight:800;background:#FEF3C7;color:#92400E;border-radius:999px;padding:2px 8px}',
      '#pl-modal .pl-sum{font-weight:800;color:#5F5A86;font-size:.86rem;margin-bottom:10px}',
      '@media (max-width:560px){.pl-text{font-size:1.02rem}.pl-hero h2{font-size:1.25rem}#pl-modal .pl-hide{display:none}}'
    ].join('\n');
    d.head.appendChild(s);
  }

  /* ── Хичээлийн замын нээлт (index.html cmPlacementSlot уншина) ── */
  function orderOf(grade, id) {
    var p = S.plan[grade]; if (!p) return -1;
    var ids = []; p.chapters.forEach(function (c) { c.topics.forEach(function (t) { ids.push(t.id); }); });
    return ids.indexOf(Number(id));
  }
  // Ахиулахаас өөрөөр өөрчлөхгүй — дахин өгөхөд эрт сэдэв гарсан ч өмнө нээсэн сэдвүүд түгжигдэхгүй
  function remember(grade, start) {
    if (!start || !start.id) return;
    var o = lsGet(), cur = o[grade];
    var a = orderOf(grade, start.id), b = cur ? orderOf(grade, cur.start) : -1;
    if (!cur || a < 0 || b < 0 || a >= b) o[grade] = { start: start.id, name: start.name || '', chapter: start.chapter || '', at: Date.now() };
    lsSet(o);
  }
  function syncMine() {
    if (S.synced || !loggedIn()) return Promise.resolve();
    S.synced = true;
    return api('GET', 'mine').then(function (j) {
      if (!j.ok || !Array.isArray(j.results)) return;
      var o = lsGet();
      j.results.forEach(function (r) {
        S.last[r.grade] = r;
        if (r.start_node && !o[r.grade]) o[r.grade] = { start: r.start_node, name: r.start_name || '', chapter: r.start_chapter || '', at: new Date(r.created_at).getTime() || Date.now() };
      });
      lsSet(o);
      try { if (typeof window.unlockNextNodes === 'function') window.unlockNextNodes(); } catch (e) {}
    }).catch(function () { S.synced = false; });
  }
  // Табыг сайтын жинхэнэ товчоор солино: switchTab нь event.target-д 'active' тавьдаг (app-mobile.js-тэй ижил арга)
  function toTab(k) {
    var b = d.querySelector('.tabs .tab-btn[onclick*="switchTab(\'' + k + '\')"]');
    if (b) b.click(); else if (typeof window.switchTab === 'function') { try { window.switchTab(k); } catch (e) {} }
  }
  function goStart(grade, start) {
    remember(grade, start);
    toTab('path');
    setTimeout(function () {
      try { if (typeof window.unlockNextNodes === 'function') window.unlockNextNodes(); } catch (e) {}
      var sl = typeof window.cmPlacementSlotOf === 'function' ? window.cmPlacementSlotOf(start.id) : 0;
      if (sl && typeof window.tryOpenLesson === 'function') window.tryOpenLesson(sl);
    }, 450);
  }

  /* ── Нүүр ── */
  function mount() {
    css();
    var tab = d.getElementById('tab-exam'); if (!tab) return false;
    ['exam-coming-soon', 'exam-start', 'exam-active', 'exam-result'].forEach(function (id) { var e = d.getElementById(id); if (e) e.style.display = 'none'; });
    root = d.getElementById('pl-root');
    if (!root) { root = d.createElement('div'); root.id = 'pl-root'; tab.appendChild(root); }
    return true;
  }
  function plan(grade) {
    if (S.plan[grade]) return Promise.resolve(S.plan[grade]);
    return api('GET', 'plan', null, '&grade=' + encodeURIComponent(grade)).then(function (j) { if (j.ok) S.plan[grade] = j; return j; });
  }
  function home() {
    if (!S.grade) { var g = userGrade(); S.grade = GRADES.indexOf(g) >= 0 ? g : (g === '11' ? '12' : '7'); }
    var g = S.grade, ug = userGrade();
    var chips = GRADES.concat(['11']).sort(function (a, b) { return a - b; }).map(function (x) {
      if (x === '11') return '<button type="button" class="pl-g" disabled>11<small>удахгүй</small></button>';
      return '<button type="button" class="pl-g' + (x === g ? ' on' : '') + '" data-g="' + x + '">' + x + '<small>' + (x === ug ? 'миний анги' : 'анги') + '</small></button>';
    }).join('');
    var last = S.last[g], loc = lsGet()[g];
    var lastHtml = '';
    if (last) {
      lastHtml = '<div class="pl-sec"><div class="pl-h">Сүүлийн дүн</div><div class="pl-last"><span class="pl-pc">' +
        esc(last.detail && last.detail.percent != null ? last.detail.percent + '%' : (last.score + '/' + last.total)) + '</span>' +
        '<span class="pl-lt">' + esc(fmtDate(last.created_at)) + (last.start_name ? ' · Эхлэх сэдэв: <b>' + esc(last.start_name) + '</b>' : ' · Бүх бүлгийг эзэмшсэн') + '</span>' +
        '<button type="button" class="pl-btn s" data-act="last">Дэлгэрэнгүй</button></div></div>';
    } else if (loc && loc.name) {
      lastHtml = '<div class="pl-sec"><div class="pl-h">Сүүлийн дүн</div><div class="pl-last"><span class="pl-lt">Эхлэх сэдэв: <b>' + esc(loc.name) + '</b>' +
        (loc.chapter ? ' (' + esc(loc.chapter) + ')' : '') + '</span></div></div>';
    }
    root.innerHTML =
      '<div class="pl-hero"><span class="pl-ic">' + I.target + '</span><h2>Түвшин тогтоох сорил</h2>' +
      '<p>Аль бүлгийг эзэмшсэн, аль сэдвээс эхлэх хэрэгтэйг тогтооно.<br>Дүнгээр чинь хичээлийн зам тэр сэдэв хүртэл нээгдэнэ.</p></div>' +
      '<div class="pl-sec"><div class="pl-h">Анги сонго</div><div class="pl-grades">' + chips + '</div>' +
      '<div id="pl-planbox"><div class="pl-spin"></div></div>' +
      '<button type="button" class="pl-btn p pl-wide" data-act="start">' + I.flag + 'Сорил эхлэх</button>' +
      '<div class="pl-note">Мэдэхгүй бодлого дээр «Мэдэхгүй» товчийг дар — таамаглахаас илүү зөв дүгнэлт гарна. Хугацаа хязгааргүй.</div></div>' +
      lastHtml;
    root.querySelectorAll('[data-g]').forEach(function (b) { b.addEventListener('click', function () { S.grade = b.getAttribute('data-g'); home(); }); });
    root.querySelector('[data-act="start"]').addEventListener('click', start);
    var lb = root.querySelector('[data-act="last"]');
    if (lb) lb.addEventListener('click', function () { S.result = fromSaved(last); S.saved = true; resultView(); });
    plan(g).then(function (j) {
      var box = d.getElementById('pl-planbox'); if (!box || S.grade !== g) return;
      if (!j || !j.ok) { box.innerHTML = '<div class="pl-note">' + esc((j && j.error) || 'Сорилын мэдээлэл ачаалж чадсангүй') + '</div>'; return; }
      var ch = j.chapters || [], n1 = j.questions || 0;
      box.innerHTML = '<div class="pl-facts">' +
        '<div class="pl-fact">' + I.layers + '<b>' + ch.length + '</b><span>бүлэг</span></div>' +
        '<div class="pl-fact">' + I.flag + '<b>' + n1 + '–' + (n1 + 8) + '</b><span>бодлого</span></div>' +
        '<div class="pl-fact">' + I.clock + '<b>' + Math.round(n1 * 0.9) + '–' + Math.round((n1 + 8) * 1.1) + '</b><span>минут</span></div></div>' +
        '<ul class="pl-chlist">' + ch.map(function (c) { return '<li>' + esc(c.name) + '</li>'; }).join('') + '</ul>';
    }).catch(function () {});
  }
  function fromSaved(r) {
    var x = r.detail || {};
    return { grade: r.grade, total: r.total, correct: r.score, percent: x.percent != null ? x.percent : Math.round(r.score * 100 / Math.max(1, r.total)),
      frontier: x.frontier, start: r.start_node ? { id: r.start_node, name: r.start_name, chapter: r.start_chapter } : null,
      chapters: x.chapters || [], review: x.review || [], topics: x.topics || [], at: r.created_at };
  }

  /* ── Сорил ── */
  function busy(msg) { root.innerHTML = '<div class="pl-q pl-mid"><div class="pl-spin"></div><p>' + esc(msg) + '</p></div>'; }
  function fail(msg, retry) {
    root.innerHTML = '<div class="pl-q pl-mid"><h3>Алдаа гарлаа</h3><p>' + esc(msg || 'Сүлжээгээ шалгаад дахин оролдоно уу.') + '</p>' +
      '<div class="pl-acts"><button type="button" class="pl-btn s" data-act="home">Буцах</button>' + (retry ? '<button type="button" class="pl-btn p" data-act="retry">Дахин оролдох</button>' : '') + '</div></div>';
    root.querySelector('[data-act="home"]').addEventListener('click', home);
    var r = root.querySelector('[data-act="retry"]'); if (r) r.addEventListener('click', retry);
  }
  function start() {
    if (S.busy) return;
    S.busy = true; busy('Бодлого бэлдэж байна…');
    plan(S.grade).catch(function () {});
    api('POST', 'start', { grade: S.grade }).then(function (j) {
      S.busy = false;
      if (!j.ok) return fail(j.error, start);
      S.t = j.t; S.stage = 1; S.qs = j.questions || []; S.k = 0; S.ans = []; S.sel = null; S.chapter = '';
      question();
    }).catch(function () { S.busy = false; fail(null, start); });
  }
  function question() {
    var q = S.qs[S.k]; if (!q) return submit();
    var n = S.qs.length, L = 'ABCD';
    root.innerHTML =
      '<div class="pl-top"><span class="pl-stage">' + (S.stage === 1 ? '1-р шат · Бүлгүүд' : '2-р шат · Нарийвчилсан') + '</span>' +
      '<span class="pl-num">' + (S.k + 1) + ' / ' + n + '</span><button type="button" class="pl-x" data-act="exit" aria-label="Сорилоос гарах">' + I.x + '</button></div>' +
      '<div class="pl-bar"><i style="width:' + Math.round(S.k * 100 / n) + '%"></i></div>' +
      '<div class="pl-q"><div class="pl-chap">' + esc(q.chapter) + '</div><div class="pl-text">' + tex(q.text) + '</div>' +
      '<div class="pl-opts">' + q.choices.map(function (c, i) {
        return '<button type="button" class="pl-opt' + (S.sel === i ? ' on' : '') + '" data-i="' + i + '"><b>' + L[i] + '</b><span>' + tex(c) + '</span></button>';
      }).join('') + '</div>' +
      '<div class="pl-foot"><button type="button" class="pl-btn s" data-act="skip">Мэдэхгүй</button>' +
      '<button type="button" class="pl-btn p" data-act="next"' + (S.sel == null ? ' disabled' : '') + '>' + (S.k + 1 === n ? 'Дуусгах' : 'Дараах') + I.arrow + '</button></div></div>';
    root.querySelectorAll('.pl-opt').forEach(function (b) {
      b.addEventListener('click', function () { S.sel = +b.getAttribute('data-i'); root.querySelectorAll('.pl-opt').forEach(function (x) { x.classList.toggle('on', x === b); }); root.querySelector('[data-act="next"]').disabled = false; });
    });
    root.querySelector('[data-act="skip"]').addEventListener('click', function () { answer(null); });
    root.querySelector('[data-act="next"]').addEventListener('click', function () { if (S.sel != null) answer(q.choices[S.sel]); });
    root.querySelector('[data-act="exit"]').addEventListener('click', function () { if (confirm('Сорилоос гарах уу? Хариултууд хадгалагдахгүй.')) home(); });
  }
  function answer(v) {
    S.ans[S.k] = v; S.k++; S.sel = null;
    if (S.k >= S.qs.length) submit(); else question();
    try { root.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) {}
  }
  function submit() {
    if (S.busy) return;
    S.busy = true; busy(S.stage === 1 ? 'Хариултыг шалгаж байна…' : 'Дүгнэлт гаргаж байна…');
    api('POST', 'submit', { t: S.t, answers: S.ans }).then(function (j) {
      S.busy = false;
      if (j.ok && j.stage === 2) {
        S.t = j.t; S.stage = 2; S.qs = j.questions || []; S.k = 0; S.ans = []; S.sel = null; S.chapter = j.chapter || '';
        return between();
      }
      if (j.ok && j.done) {
        S.result = j.result; S.saved = !!j.saved;
        if (S.result && S.result.start && S.result.grade === userGrade()) remember(S.result.grade, S.result.start);
        if (S.saved) S.last[S.result.grade] = { grade: S.result.grade, score: S.result.correct, total: S.result.total, start_node: S.result.start && S.result.start.id,
          start_name: S.result.start && S.result.start.name, start_chapter: S.result.start && S.result.start.chapter, created_at: new Date().toISOString(),
          detail: { percent: S.result.percent, frontier: S.result.frontier, chapters: S.result.chapters, review: S.result.review, topics: S.result.topics } };
        try { if (typeof window.unlockNextNodes === 'function') window.unlockNextNodes(); } catch (e) {}
        return resultView();
      }
      if (j.expired) return fail('Сорилын хугацаа дууссан. Дахин эхлүүлнэ үү.', start);
      fail(j.error, submit);
    }).catch(function () { S.busy = false; fail(null, submit); });
  }
  function between() {
    root.innerHTML = '<div class="pl-q pl-mid"><div class="pl-big">' + I.check + '</div><h3>1-р шат дууслаа</h3>' +
      '<p>Одоо <b>' + esc(S.chapter) + '</b> бүлгийг сэдэв бүрээр нь нарийвчлан шалгая — ' + S.qs.length + ' бодлого.</p>' +
      '<button type="button" class="pl-btn p pl-wide" data-act="go">Үргэлжлүүлэх' + I.arrow + '</button></div>';
    root.querySelector('[data-act="go"]').addEventListener('click', question);
  }

  /* ── Дүн ── */
  function resultView() {
    var r = S.result; if (!r) return home();
    var ug = userGrade(), mineGrade = r.grade === ug && !isTeacher();
    var startHtml;
    if (r.start) {
      // Ангийн хамгийн эхний сэдэв бол «өмнөх сэдвүүдийг эзэмшсэн» гэж бичихгүй
      var p0 = S.plan[r.grade] && S.plan[r.grade].chapters && S.plan[r.grade].chapters[0];
      var isFirst = !!(p0 && p0.topics && p0.topics[0] && +p0.topics[0].id === +r.start.id);
      startHtml = '<div class="pl-start"><span class="pl-k">' + I.flag + 'Эндээс эхэл</span><h3>' + esc(r.start.name) + '</h3>' +
        '<p>Бүлэг: <b>' + esc(r.start.chapter) + '</b>. ' + (isFirst ? 'Ангийн хамгийн эхний сэдэв — суурийг бататгаад дэс дараалан урагшилъя.'
          : 'Үүнээс өмнөх сэдвүүдийг эзэмшсэн байна — тэдгээр нь давтахад нээлттэй.') + '</p>' +
        (mineGrade ? '<button type="button" class="pl-btn g pl-wide" data-act="begin">Энэ сэдвээс эхлэх' + I.arrow + '</button>'
          : '<p style="margin-top:8px">' + (isTeacher() ? 'Сурагч өөрөө сорил өгөхөд хичээлийн зам нь энэ сэдэв хүртэл нээгдэнэ.' : 'Хичээлийн зам таны профайлын ангиар (' + esc(ug || '—') + '-р анги) харагддаг.') + '</p>') + '</div>';
    } else {
      startHtml = '<div class="pl-start"><span class="pl-k">' + I.check + 'Гайхалтай</span><h3>' + esc(r.grade) + '-р ангийн бүх бүлгийг эзэмшсэн байна</h3>' +
        '<p>Хичээлийн замаар давтлага хийж медалиа ахиулаарай, эсвэл дараагийн ангийн сорилыг өгөөд үзээрэй.</p></div>';
    }
    var col = { ok: '#22C55E', mid: '#F59E0B', bad: '#EF4444', na: '#D1D5DB' };
    var chs = (r.chapters || []).map(function (c) {
      var st = ST[c.status] || ST.untested, w = c.total ? Math.round(c.correct * 100 / c.total) : 0;
      return '<li' + (r.frontier === c.i ? ' class="f"' : '') + '><span class="n">' + esc(c.name) + '</span><span class="c ' + st[1] + '">' + st[0] + (c.total ? ' · ' + c.correct + '/' + c.total : '') + '</span>' +
        '<span class="b"><i style="width:' + Math.max(w, c.total ? 4 : 0) + '%;background:' + col[st[1]] + '"></i></span></li>';
    }).join('');
    var rev = (r.review || []).length ? '<div class="pl-sec"><div class="pl-h">Дараа нь анхаарах сэдвүүд</div><ul class="pl-rev">' +
      r.review.map(function (t) { return '<li>' + esc(t.name) + '<span>' + esc(t.chapter) + '</span></li>'; }).join('') + '</ul></div>' : '';
    root.innerHTML =
      '<div class="pl-hero"><div class="pl-res"><div class="pl-ring" style="--p:' + (r.percent || 0) + '"><span>' + (r.percent || 0) + '%</span></div>' +
      '<div><h2>' + esc(r.grade) + '-р ангийн түвшин</h2><p>' + r.correct + ' / ' + r.total + ' бодлого зөв' + (r.at ? ' · ' + esc(fmtDate(r.at)) : '') + '</p></div></div></div>' +
      startHtml +
      '<div class="pl-sec"><div class="pl-h">Бүлэг бүрээр</div><ul class="pl-chs">' + chs + '</ul></div>' + rev +
      (!S.saved && !loggedIn() ? '<div class="pl-note">Нэвтэрвэл дүн хадгалагдаж, ангийн багш тань харах боломжтой.</div>' : '') +
      '<div class="pl-acts"><button type="button" class="pl-btn s" data-act="again">' + I.redo + 'Дахин өгөх</button>' +
      '<button type="button" class="pl-btn p" data-act="path">Хичээлийн зам руу' + I.arrow + '</button></div>';
    var bg = root.querySelector('[data-act="begin"]'); if (bg) bg.addEventListener('click', function () { goStart(r.grade, r.start); });
    root.querySelector('[data-act="again"]').addEventListener('click', function () { S.grade = r.grade; home(); });
    root.querySelector('[data-act="path"]').addEventListener('click', function () { toTab('path'); });
    try { root.scrollIntoView({ block: 'start' }); } catch (e) {}
  }

  /* ── Багш: ангийн дүн ── */
  window.plShowClass = function (classroomId) {
    if (!classroomId) return;
    css();
    var m = d.getElementById('pl-modal'); if (m) m.remove();
    m = d.createElement('div'); m.id = 'pl-modal';
    m.innerHTML = '<div class="pl-mbox" role="dialog" aria-modal="true" aria-label="Түвшин тогтоох сорилын дүн"><div class="pl-mh"><h3>Түвшин тогтоох сорилын дүн</h3>' +
      '<button type="button" class="pl-x" data-act="close" aria-label="Хаах">' + I.x + '</button></div><div class="pl-mb"><div class="pl-spin"></div></div></div>';
    d.body.appendChild(m);
    var close = function () { m.remove(); };
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-act="close"]')) close(); });
    var body = m.querySelector('.pl-mb');
    api('GET', 'class', null, '&classroom_id=' + encodeURIComponent(classroomId)).then(function (j) {
      if (!j.ok) { body.innerHTML = '<div class="pl-note">' + esc(j.error || 'Алдаа гарлаа') + '</div>'; return; }
      var st = j.students || [], done = st.filter(function (s) { return s.at; });
      var rows = st.map(function (s) {
        if (!s.at) return '<tr><td>' + esc(s.name) + '</td><td colspan="4" style="color:#9CA3AF">Сорил өгөөгүй</td></tr>';
        return '<tr><td>' + esc(s.name) + '<div style="font-size:.72rem;color:#9CA3AF">' + esc(s.grade) + '-р анги · ' + esc(fmtDate(s.at)) + '</div></td>' +
          '<td class="pc">' + (s.percent != null ? s.percent + '%' : (s.score + '/' + s.total)) + '</td>' +
          '<td>' + (s.start_name ? esc(s.start_name) + '<div style="font-size:.72rem;color:#9CA3AF">' + esc(s.start_chapter || '') + '</div>' : 'Бүгдийг эзэмшсэн') + '</td>' +
          '<td class="pl-hide">' + (s.weak || []).slice(0, 4).map(function (w) { return '<span class="pl-tag">' + esc(w) + '</span>'; }).join('') + '</td></tr>';
      }).join('');
      body.innerHTML = '<div class="pl-sum">' + esc(j.classroom.name) + ' · ' + done.length + ' / ' + st.length + ' сурагч сорил өгсөн</div>' +
        (st.length ? '<table><thead><tr><th>Сурагч</th><th>Дүн</th><th>Эхлэх сэдэв</th><th class="pl-hide">Анхаарах бүлэг</th></tr></thead><tbody>' + rows + '</tbody></table>'
          : '<div class="pl-note">Энэ ангид сурагч алга.</div>') +
        '<div class="pl-note">Сурагчид «Шалгалт» табаас «Түвшин тогтоох сорил» өгнө. Дүн бүрт хамгийн сүүлд өгсөн сорил харагдана.</div>';
    }).catch(function () { body.innerHTML = '<div class="pl-note">Сүлжээний алдаа. Дахин оролдоно уу.</div>'; });
  };

  /* «Шалгалт» таб нээгдэх бүрт (index.html switchTab → initExamTab) */
  window.initExamTab = function () {
    if (!mount()) return;
    if (S.result && root.querySelector('.pl-ring')) return;   // дүнгийн дэлгэц дээр байвал хэвээр
    if (S.qs.length && S.k < S.qs.length && root.querySelector('.pl-opt')) return;   // сорил явж байвал хэвээр
    home();
    syncMine().then(function () { if (root && root.querySelector('#pl-planbox') && !S.busy) home(); });
  };
  // Нэвтэрсэн хэрэглэгчийн дүнгээр замыг шинэ төхөөрөмж дээр ч нээнэ
  setTimeout(function () { syncMine(); }, 2500);
})();
