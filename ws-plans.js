/* Дасгалын төвийн хугацаат багц сонгогч — worksheets.html openBuy ба ws-store.js түгжээний цонх (api/_wsoffer.js-тэй нийцтэй).
   • 1 сар — нэг анги (9,900₮); 3 сар → 3 анги сонгоно; 6 сар → 6 анги; 12 сар → бүх анги. ЭЕШ хуудсанд «ЭЕШ багц» нэмэгдэнэ.
   • Хямдрал зөвхөн худалдан авалт хийгээгүй дансанд 7 хоног (сервер offer.until) — тоолуур серверийн цагаар, 0 болмогц
     жинхэнэ үнэ рүү шилжинэ. Аль нь ашигтайг «нэг анги сард …₮», хэмнэлт, «Хамгийн ашигтай» тэмдгээр харуулна.
   • Үнийг ЗӨВХӨН харуулна — төлөх дүнг сервер (qpay create) тогтооно.
   WSPLANS.mount(el, {st, grade, pack, key, lockKey, onChange}) → {update(st, o), sel(), setPct(pct), destroy()} */
(function () {
  if (window.WSPLANS) return;
  var DEF_GRADES = ['2-р анги', '3-р анги', '4-р анги', '5-р анги', '6-р анги', '7-р анги', '8-р анги', '9-р анги', '10-р анги', '11-р анги', '12-р анги', 'ЭЕШ', 'Олимпиад'];
  var DEF_BUNDLES = [{ months: 3, grades: 3, price: 39900 }, { months: 6, grades: 6, price: 69900 }, { months: 12, grades: 'all', price: 119900 }];
  var CLOCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9.5 2.5h5"/></svg>';
  var GIFT = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2zM12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>';
  var CSS = '.wpl{text-align:left}'
    + '.wpl-off{display:flex;align-items:center;gap:8px;background:transparent;border-left:3px solid #ec4899;border-radius:8px;padding:7px 10px;margin:0 0 10px;font-size:.82rem;color:#3a2d5e;line-height:1.4}'
    + '.wpl-off>svg{flex:none;color:#ec4899}'
    + '.wpl-cd{font-variant-numeric:tabular-nums;color:#db2777;font-weight:900;white-space:nowrap}'
    + '.wpl-list{display:flex;flex-direction:column;gap:8px}'
    + '.wpl-o{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:1px 10px;width:100%;box-sizing:border-box;margin:0;text-align:left;cursor:pointer;font-family:inherit;border:1.6px solid #ece6fb;background:#fff;border-radius:13px;padding:.58rem .75rem;transition:border-color .12s,background .12s}'
    + '.wpl-o[aria-pressed="true"]{border-color:#7B52EE;background:#f7f3ff;box-shadow:0 6px 16px -10px rgba(123,82,238,.9)}'
    + '.wpl-o[disabled]{opacity:.4;cursor:not-allowed}'
    + '.wpl-t{font-weight:900;font-size:.95rem;color:#2a2250}'
    + '.wpl-s{display:block;font-weight:700;font-size:.74rem;color:#7a7390;margin-top:1px}'
    + '.wpl-p{text-align:right;white-space:nowrap;line-height:1.15}'
    + '.wpl-p b{font-size:1rem;font-weight:900;color:#16a34a}'
    + '.wpl-p s{display:block;font-size:.74rem;color:#b3a9cf;font-weight:800}'
    + '.wpl-u{grid-column:1/-1;font-size:.74rem;font-weight:800;color:#5a32d6;margin-top:2px}'
    + '.wpl-best{position:absolute;top:-9px;right:12px;background:linear-gradient(135deg,#7B52EE,#A855F7);color:#fff;font-size:.66rem;font-weight:900;border-radius:999px;padding:2px 9px;white-space:nowrap}'
    + '.wpl-pick{margin:12px 0 0}'
    + '.wpl-pt{display:flex;justify-content:space-between;gap:8px;font-size:.8rem;font-weight:800;color:#3a2d5e;margin-bottom:7px}'
    + '.wpl-pt .wpl-need{color:#db2777}'
    + '.wpl-chips{display:flex;flex-wrap:wrap;gap:6px}'
    + '.wpl-c{cursor:pointer;font-family:inherit;font-weight:800;font-size:.8rem;border:1.5px solid #e7ddff;background:#fff;color:#5a32d6;border-radius:999px;padding:.36rem .72rem;min-width:44px;margin:0}'
    + '.wpl-c[aria-pressed="true"]{background:linear-gradient(135deg,#7B52EE,#A855F7);border-color:#7B52EE;color:#fff}'
    + '.wpl-c[disabled]{opacity:.38;cursor:not-allowed}'
    + '.wpl-all{font-size:.78rem;font-weight:700;color:#7a7390;margin-top:10px;line-height:1.4}'
    + '.wpl-sum{margin-top:12px;text-align:center}'
    + '.wpl-big{font-size:1.6rem;font-weight:900;color:#16a34a;line-height:1.25}'
    + '.wpl-big small{font-size:.82rem;color:#7a7390;font-weight:700}'
    + '.wpl-big s{font-size:1rem;color:#b3a9cf;font-weight:800}'
    + '.wpl-pct{display:inline-block;background:#dcfce7;color:#16a34a;font-size:.72rem;font-weight:800;border-radius:999px;padding:2px 8px;vertical-align:middle}'
    + '.wpl-save{font-size:.8rem;font-weight:800;color:#db2777;margin-top:2px}'
    + '.wpl-tip{display:flex;align-items:center;gap:8px;margin-top:9px;font-size:.8rem;color:#3a2d5e;border:1px dashed #d9ccff;border-radius:11px;padding:7px 9px;text-align:left;line-height:1.4}'
    + '.wpl-tip>span{flex:1;min-width:0}'
    + '.wpl-tip button{flex:none;font-family:inherit;font-weight:800;font-size:.76rem;border:0;border-radius:999px;padding:.38rem .75rem;cursor:pointer;color:#fff;background:linear-gradient(135deg,#7B52EE,#A855F7)}'
    + '@media (max-width:380px){.wpl-o{padding:.52rem .6rem}.wpl-t{font-size:.9rem}.wpl-p b{font-size:.92rem}.wpl-big{font-size:1.4rem}}';

  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(g) { return String(g).replace(/ анги$/, ''); }
  // "6-р анги" → "6-р ангийн", "ЭЕШ" → "ЭЕШ-ийн" (харьяалахын тийн ялгал)
  function gGen(g) { g = String(g || ''); if (/анги$/.test(g)) return g.replace(/анги$/, 'ангийн'); if (/хэл$/.test(g)) return g + 'ний'; return g ? g + '-ийн' : g; }
  function injectCss() {
    if (document.getElementById('wpl-css')) return;
    var st = document.createElement('style'); st.id = 'wpl-css'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }
  function two(n) { return (n < 10 ? '0' : '') + n; }
  function cdText(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400); s -= d * 86400;
    var h = Math.floor(s / 3600); s -= h * 3600; var m = Math.floor(s / 60); s -= m * 60;
    return (d > 0 ? d + ' өдөр ' : '') + two(h) + ':' + two(m) + ':' + two(s);
  }

  function mount(root, cfg) {
    cfg = cfg || {};
    injectCss();
    // pct — промо (бүх сонголтод), pctB — багцад (промо ба найзын урилгын их нь; урилга 1 сарын эрхэд хамаарахгүй — сервертэй ижил)
    var S = null, key = cfg.key || null, pct = 0, pctB = 0, picks = {}, timer = null, dead = false, touched = false;
    var grade = cfg.grade || null, pack = cfg.pack || null;
    function data(st) {
      st = st || {};
      var per = Number(st.grade_per_month) || 9900;
      var list = (st.grade_list && st.grade_list.length) ? st.grade_list.slice() : DEF_GRADES.slice();
      var nAll = list.filter(function (g) { return /^\d+-р анги$/.test(g); }).length || 11;
      var bundles = (st.bundles && st.bundles.length ? st.bundles : DEF_BUNDLES).map(function (b) {
        var cnt = b.grades === 'all' ? (b.count || nAll) : (b.count || b.grades);
        var lst = b.list || cnt * b.months * per;
        return { months: b.months, all: b.grades === 'all', count: cnt, list: lst, price: b.price != null ? b.price : lst };
      });
      var off = st.offer || { eligible: true, anon: true, days: 7 };
      var until = off.until ? Date.parse(off.until) : 0;
      return { per: per, list: list, bundles: bundles, eligible: !!off.eligible, anon: !!off.anon, customer: !!off.customer, until: until,
        days: off.days || 7, skew: st.server_now ? Number(st.server_now) - Date.now() : 0 };
    }
    function left() { return S.until ? S.until - (Date.now() + S.skew) : 0; }
    // Хямдрал: нэвтрээгүй (шинэ бүртгэлд), худалдан авч байсан хэрэглэгч (тоолуургүй), шинэ хэрэглэгч (7 хоногийн тоолуур дуустал)
    function on() { return S.eligible && (S.anon || S.customer || left() > 0); }
    function opts() {
      var o = [{ k: 'm1', months: 1, count: 1, list: S.per, price: S.per }];
      if (pack) o.push({ k: 'pack', months: 1, count: 1, list: pack.price, price: pack.price, pack: true });
      S.bundles.forEach(function (b) {
        o.push({ k: 'm' + b.months, months: b.months, count: b.count, all: b.all, list: b.list, price: on() ? Math.min(b.price, b.list) : b.list });
      });
      // Ажлын хуудас ангигүй (каталог/богино замаар тодорхойгүй) — ангиар авсан эрх тэр хуудсыг нээхгүй тул зөвхөн бүх анги
      if (cfg.page && !grade) o = o.filter(function (x) { return x.all; });
      return o;
    }
    function find(k) { var o = opts(); for (var i = 0; i < o.length; i++) if (o[i].k === k) return o[i]; return null; }
    function unit(o) { return o.price / (o.count * o.months); }
    function need(k) { return k === 'm1' ? (grade ? 0 : 1) : (k === 'm3' || k === 'm6') ? (find(k) || {}).count || 0 : 0; }
    function picked(k) {
      if (!picks[k]) picks[k] = (grade && (k === 'm3' || k === 'm6') && S.list.indexOf(grade) >= 0) ? [grade] : [];
      return picks[k];
    }
    function best() {                                       // нэг анги × нэг сарын хамгийн хямд (9,900-аас хямд) багц
      var b = null;
      opts().forEach(function (o) { if (!o.pack && unit(o) < S.per - 1 && (!b || unit(o) < unit(b))) b = o; });
      return b;
    }
    function title(o) {
      if (o.pack) return { t: 'ЭЕШ багц', s: 'ажлын хуудас + ЭЕШ шалгагч · 1 сар' };
      if (o.k === 'm1') return { t: '1 сар', s: grade ? grade : '1 анги сонгоно' };
      if (o.all) return { t: o.months + ' сар', s: 'Бүх анги' };
      return { t: o.months + ' сар', s: o.count + ' анги сонгоно' };
    }
    function optHtml(o, bestK) {
      var tt = title(o), sel = o.k === key, dis = cfg.lockKey && cfg.lockKey !== o.k;
      var disc = o.list > o.price;
      var off = disc ? Math.round((1 - o.price / o.list) * 100) : 0;
      return '<button type="button" class="wpl-o" data-k="' + o.k + '" aria-pressed="' + (sel ? 'true' : 'false') + '"' + (dis ? ' disabled' : '') + '>'
        + (bestK === o.k ? '<span class="wpl-best">Хамгийн ашигтай</span>' : '')
        + '<span><span class="wpl-t">' + esc(tt.t) + '</span><span class="wpl-s">' + esc(tt.s) + '</span></span>'
        + '<span class="wpl-p">' + (disc ? '<s>' + fmt(o.list) + '₮</s>' : '') + '<b>' + fmt(o.price) + '₮</b></span>'
        + (disc && !o.pack ? '<span class="wpl-u">1 анги сард ' + fmt(unit(o)) + '₮ · −' + off + '%</span>' : '')
        + '</button>';
    }
    function offHtml() {
      if (!on()) return '';
      if (S.anon) return '<div class="wpl-off">' + GIFT + '<span>Шинэ хэрэглэгчид бүртгүүлснээс хойш <b>' + S.days + ' хоног</b> багцын хямдрал</span></div>';
      if (S.customer) return '<div class="wpl-off">' + GIFT + '<span><b>Байнгын хэрэглэгчийн хямдрал</b> — багцыг жинхэнэ үнээс хямд авна</span></div>';
      if (!S.until) return '';
      return '<div class="wpl-off">' + CLOCK + '<span>Багцын хямдрал дуусахад <b class="wpl-cd">' + cdText(left()) + '</b></span></div>';
    }
    function pickHtml() {
      var o = find(key); if (!o) return '';
      if (o.all) return '<div class="wpl-all">Бүх анги (' + esc(numRange()) + '-р анги)' + (extra().length ? ', ' + esc(extra().join(', ')) : '') + ' — сонгох шаардлагагүй</div>';
      var n = need(key); if (!n) return '';
      var have = picked(key), full = have.length >= n;
      return '<div class="wpl-pick"><div class="wpl-pt"><span>' + n + ' анги сонгоно уу</span><span class="' + (full ? '' : 'wpl-need') + '">' + have.length + '/' + n + '</span></div>'
        + '<div class="wpl-chips">' + S.list.map(function (g) {
          var on1 = have.indexOf(g) >= 0;
          return '<button type="button" class="wpl-c" data-g="' + esc(g) + '" aria-pressed="' + (on1 ? 'true' : 'false') + '"' + (!on1 && full ? ' disabled' : '') + '>' + esc(short(g)) + '</button>';
        }).join('') + '</div></div>';
    }
    function numRange() {                                   // "2–12"
      var n = S.list.filter(function (g) { return /^\d+-р анги$/.test(g); }).map(function (g) { return parseInt(g, 10); });
      return n.length ? Math.min.apply(null, n) + '–' + Math.max.apply(null, n) : '2–12';
    }
    function extra() { return S.list.filter(function (g) { return !/^\d+-р анги$/.test(g); }); }
    function sumHtml() {
      var o = find(key); if (!o) return '';
      var p = pctOf(o), base = o.price, fin = p > 0 ? Math.round(base * (100 - p) / 100) : base;
      var per = o.k === 'm1' ? '1 сар' : o.pack ? '1 сар' : o.months + ' сар · ' + (o.all ? 'бүх анги' : o.count + ' анги');
      var save = o.list - fin;
      return '<div class="wpl-sum"><div class="wpl-big">' + (p > 0 ? '<s>' + fmt(base) + '₮</s> ' : '') + fmt(fin) + '₮ <small>/ ' + per + '</small>'
        + (p > 0 ? ' <span class="wpl-pct">-' + p + '%</span>' : '') + '</div>'
        + (save > 0 && !o.pack ? '<div class="wpl-save">' + fmt(save) + '₮ хэмнэнэ</div>' : '') + '</div>';
    }
    function tipHtml() {
      var o = find(key); if (!o || o.pack || !on()) return '';
      var ladder = { m1: 'm3', m3: 'm6', m6: 'm12' }, nx = find(ladder[o.k]);
      if (!nx) return o.k === 'm12' ? '<div class="wpl-tip"><span>Хамгийн ашигтай сонголт: нэг анги сард <b>' + fmt(unit(o)) + '₮</b></span></div>' : '';
      var add = nx.price - o.price;
      return '<div class="wpl-tip"><span>' + (add > 0 ? 'Ердөө <b>+' + fmt(add) + '₮</b>-өөр ' : '') + '<b>' + nx.months + ' сар · ' + (nx.all ? 'бүх анги' : nx.count + ' анги')
        + '</b> — нэг анги сард ' + fmt(unit(nx)) + '₮</span><button type="button" data-go="' + nx.k + '">Сонгох</button></div>';
    }
    function render() {
      if (dead || !S) return;
      var o = opts(), b = best();
      if (!find(key)) key = cfg.lockKey && find(cfg.lockKey) ? cfg.lockKey : o[0].k;
      // Дахин зурахад гарын товчлуурын фокус алдагдахгүй (ижил сонголт/ангийн товч руу буцаана)
      var ae = document.activeElement, fk = null;
      if (ae && root.contains && root.contains(ae)) fk = ae.getAttribute('data-k') ? '[data-k="' + ae.getAttribute('data-k') + '"]'
        : ae.getAttribute('data-g') ? '[data-g="' + esc(ae.getAttribute('data-g')) + '"]' : null;
      root.innerHTML = '<div class="wpl">' + offHtml() + '<div class="wpl-list">' + o.map(function (x) { return optHtml(x, b && b.k); }).join('') + '</div>'
        + pickHtml() + sumHtml() + tipHtml() + '</div>';
      [].forEach.call(root.querySelectorAll('.wpl-o'), function (el) {
        el.onclick = function () { if (el.disabled) return; touched = true; key = el.getAttribute('data-k'); render(); fire(); };
      });
      [].forEach.call(root.querySelectorAll('.wpl-c'), function (el) {
        el.onclick = function () {
          if (el.disabled) return;
          touched = true;
          var g = el.getAttribute('data-g'), arr = picked(key), i = arr.indexOf(g);
          if (i >= 0) arr.splice(i, 1); else if (arr.length < need(key)) arr.push(g);
          render(); fire();
        };
      });
      var go = root.querySelector('[data-go]');
      if (go) go.onclick = function () { if (cfg.lockKey) return; touched = true; key = go.getAttribute('data-go'); render(); fire(); };
      if (fk) { var f = root.querySelector(fk); if (f && f.focus) { try { f.focus(); } catch (e) {} } }
      tick();
    }
    function tick() {
      if (timer) { clearInterval(timer); timer = null; }
      if (!S || S.anon || !S.eligible || !S.until) return;
      timer = setInterval(function () {
        // цонх хаагдсан (DOM-оос салсан) эсвэл destroy — тоолуур зогсоно
        if (dead || root.isConnected === false) { clearInterval(timer); timer = null; return; }
        var cd = root.querySelector('.wpl-cd');
        if (left() <= 0) { clearInterval(timer); timer = null; S.eligible = false; render(); fire(); return; }
        if (cd) cd.textContent = cdText(left());
      }, 1000);
    }
    function pctOf(o) { return o.pack ? 0 : o.k === 'm1' ? pct : pctB; }
    function sel() {
      var o = find(key) || {};
      var n = need(key), arr = (key === 'm3' || key === 'm6' || (key === 'm1' && !grade)) ? picked(key).slice() : [];
      var p = o.k ? pctOf(o) : 0;
      return { key: key, months: o.months || 1, plan: o.pack ? 'eeshpack' : key === 'm1' ? 'wsgrade' : 'wsbundle',
        grade: key === 'm1' ? (grade || arr[0] || null) : null, grades: (key === 'm3' || key === 'm6') ? arr : null,
        all: !!o.all, count: o.count || 1, list: o.list || 0, base: o.price || 0,
        price: p > 0 ? Math.round((o.price || 0) * (100 - p) / 100) : (o.price || 0),
        need: n, have: arr.length, ready: !!o.k && (!n || arr.length === n), discount: on() && o.list > o.price };
    }
    function fire() { if (typeof cfg.onChange === 'function') { try { cfg.onChange(sel()); } catch (e) {} } }
    var api = {
      update: function (st, o) {
        o = o || {};
        // Хуудасны анги хожуу тодорхойлогдвол (wsstatus) — хэрэглэгч сонголт хийгээгүй үед анхдагчийг дахин тогтооно
        if ('grade' in o && (o.grade || null) !== grade) { grade = o.grade || null; picks = {}; if (!touched) key = cfg.key || null; }
        if ('pack' in o) pack = o.pack || null;
        S = data(st);
        if (!key) key = cfg.lockKey || (grade ? 'm1' : cfg.page ? 'm12' : (on() ? 'm3' : 'm1'));
        render(); fire();
      },
      sel: sel,
      // setPct(промо %, багцын % — заавал биш, анхдагч нь промо)
      setPct: function (p, pb) {
        function cl(x) { return Math.max(0, Math.min(100, Number(x) || 0)); }
        pct = cl(p); pctB = pb == null ? pct : cl(pb); render(); fire();
      },
      destroy: function () { dead = true; if (timer) { clearInterval(timer); timer = null; } }
    };
    if (cfg.st !== undefined) api.update(cfg.st);
    return api;
  }
  window.WSPLANS = { mount: mount, gGen: gGen, fmt: fmt, cdText: cdText };
})();
