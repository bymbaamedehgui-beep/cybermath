/* CyberMath — тоглоомын хост туслах (window.CMGamesHost).
   Дасгалын төв (worksheets.html, realm 'ws') ашиглана; cyber-math.com-д ч ашиглаж болно (realm 'cm', token fn).
   Энэ файл эрх ОЛГОХГҮЙ, үнэ хатуу бичихгүй — үнэ/хоногийг /api/games?action=catalog-оос авна.
   Жинхэнэ хамгаалалт серверт: api/games.js (status/launch/invite), gate/game.js (файл тоглоом), api/qpay.js (plan='game').

   API:
     META / KEYS / INLINE                 — 16 тоглоомын клиент мета (тайлбар, SVG icon, өнгө), inline тоглоомын талбар
     isKey(k), meta(k), icon(k, size)     — allowlist, мета, SVG
     dev(), fp(), headers(o)              — 'cm_device' (ws-store.js-тэй ижил) + хурууны хээ (ws-store.js wsFp-тэй ижил алгоритм)
     catalog(force, realm) → Promise<{ok, enabled, realm?, price, days, invite_hours, games}>  (enabled — тухайн realm-д төлбөртэй эсэх)
     status(o)      → Promise<{s, d}>  POST /api/games?action=status  {realm, wstoken}  (d.grades — {key: одоогийн анги})
     launch(key, o) → Promise<{s, d}>  POST /api/games?action=launch  {game, realm, wstoken, invite, grade?, topic?}  (o.sel)
     invite(key, o) → Promise<{s, d}>  POST /api/games?action=invite  {game, realm, wstoken}
     buyCreate(key, o) → Promise<{s, d}>  POST /api/qpay?action=create {wstoken, plan:'game', realm, game, game_grade?}  (o.grade)
     buyCheck(invoiceId, email) → Promise<{s, d}>  POST /api/qpay?action=check
     embedUrl(key, realm, inv, sel)       — inline тоглоом: '/?embed=<key>&realm=<realm>[&einv=<урилга>][&grade=<g>&topic=<t>]'
                                            (index.html #gp-embed)
     overlay({key, title, sub, url, sel, tools, onClose, onMessage}) → { el, frame, key, sel, close(), setUrl(url), setSel(sel), setSub(t), post(msg) }
                                            бүтэн дэлгэцийн iframe (#gameM). Esc / «Хаах» → src='about:blank'.
     takeUrlInvite(realm)                 — ?game=<key>&ginv=<токен>[&grade=&topic=] → sessionStorage 'gp_inv_<realm>' (+ 'gp_isel_<realm>'),
                                            URL-аас арилгана → {key, inv, sel?}
     getInvite(realm, key) / setInvite(realm, key, tok|null), inviteSel(realm, key) → sel | null (урилгын host-ийн анги/сэдэв)
     cardState(o), rounds(qs, o), parseInvite(search), fmt(n), ymd(v)   — цэвэр туслахууд (тест)
   Анги/сэдэв (тоглоомын бодлогын сонголт — ҮНЭ/ЭРХЭД НӨЛӨӨЛӨХГҮЙ; эрх нь тоглоом бүхэлдээ):
     GRADES ['6'..'12'] (сонгогчид харуулах), SOON {'11'} / isSoon(g) — «Тун удахгүй» (саарал, сонгогдохгүй; normGrade → null,
     хадгалсан 11 → сонголтгүй → анги дахин асууна), normGrade(v), normTopic(v), normSel({grade, topic, name}) → {grade, topic, name} | null
     sel = { grade: '6'..'12', topic: node id | '0' (бүх сэдэв), name: сэдвийн нэр ('' = бүх сэдэв) }
     MIN[key] / minFor(key)               — сэдэвт байх доод бодлогын тоо (sbh 20, myangat 15, sudoku 12, …; анхдагч 8)
     hasTopics(key)                       — сэдэв сонгох эсэх (numseq — зөвхөн анги); ALL_ONLY[grade] — зөвхөн «Бүх сэдэв» (11)
     topics(grade, force, key?) → Promise<{ok, grade, total, chapters:[{name, topics:[{id, name, n}]}]}>  GET /api/questions?game_topics=<g>
                                          (key 'mathmortal' → &hud=1 — HUD-д тохирох бодлогын тоо)
                                            (анги тус бүрд 5 мин кэш)
     topicGroups(data, key) → { total, few, allOnly, count, groups:[{name, topics:[{id, name, n}]}] }  (цэвэр; n ≥ minFor(key))
     getSel(realm, email, key) / setSel(realm, email, key, sel|null) / lastGrade(realm, email)
                                            — localStorage 'cm_game_sel_<realm>' = {'<имэйл>|<key>': {g, t, n, at}}
     selLabel(sel) → '8-р анги · <сэдэв>'   withSel(url, sel) → url + ?grade=&topic= (аль хэдийн байвал хэвээр)
   Гүүр (overlay-ийн iframe-ээс л, e.source === frame.contentWindow, ижил домэйн):
     'myangat-need-questions' / 'xpdrop-need-questions' → /api/questions?game=<g>&topic=<t>&n=15|10 (сонголтгүй бол хуучин
       параметргүй) → KaTeX → postMessage(…, location.origin). Мянгат: хялбараас хүнд рүү (difficulty) эрэмбэлнэ.
     'cm-game-locked' / 'cm-embed-close' / 'cm-embed-ready' / 'cm-embed-buy' / 'cm-embed-sel' → overlay-ийн onMessage(d)
     Parent → embed: post({type:'cm-embed-config', grade, topic}) — inline тоглоомын санг дахин ачаалалгүй солино.
     XP/шагналын мессежийг ҮЛ ТООМСОРЛОНО (Дасгалын төвийн хэрэглэгч cyber-math.com-ийн XP-гүй). */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root && typeof root === 'object') root.CMGamesHost = api;
})(typeof window !== 'undefined' ? window : null, function (W) {
  'use strict';
  var GAMES_API = '/api/games';
  var QPAY_API = '/api/qpay';
  var Q_API = '/api/questions';
  var KEY_RE = /^[a-z0-9]{2,24}$/;
  var INV_RE = /^[A-Za-z0-9_.-]{20,2048}$/;
  var CAT_TTL = 60 * 1000;

  // ───────────── 16 тоглоом (тайлбар, icon, өнгө) — нэр/төрөл/үнэ серверийн каталогоос ─────────────
  var SV = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  function m(t, k, multi, d, c, i) { return { t: t, k: k, m: !!multi, d: d, c: c, i: i }; }
  var META = {
    mathmortal: m('MATH MORTAL', 'file', true, '3D тулаан — бодлого бодож дайснаа ял', ['#7c3aed', '#c026d3'],
      '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M16 16l4 4"/><path d="M19 21l2-2"/><path d="M14.5 6.5 18 3h3v3l-3.5 3.5"/><path d="M5 14l4 4"/><path d="M7 17l-3 3"/><path d="M3 19l2 2"/>'),
    blockblast: m('Block Blast Math', 'external', false, 'Блок байрлуулж, бодлогоор оноогоо өсгө', ['#6d28d9', '#8b5cf6'],
      '<rect x="14" y="3" width="7" height="7" rx="1"/><path d="M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3"/>'),
    flagbattle: m('Flag Battle — Тэмцээн', 'external', false, 'Анги, сэдвээ сонгоод тэмцээнд оролц', ['#dc2626', '#f97316'],
      '<path d="M4 22V4"/><path d="M4 4h13l-2.5 4L17 12H4"/>'),
    songon: m('Grade Battle', 'external', false, 'Анги, сэдвээ сонгоод өрсөлд', ['#16a34a', '#22c55e'],
      '<circle cx="12" cy="15" r="6"/><path d="M8.2 10.4 5 3h4l3 5 3-5h4l-3.2 7.4"/><path d="M12 13v4"/>'),
    nicebattle: m('Nice Battle', 'external', false, 'Анги, сэдвээ сонгоод тулалд', ['#a855f7', '#ec4899'],
      '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>'),
    chessmath: m('Chess Math', 'inline', true, 'Шатар + бодлого: зөв бодвол нүүнэ', ['#1e1b4b', '#4338ca'],
      '<path d="m2 6 3.5 11h13L22 6l-5.5 5L12 4l-4.5 7z"/><path d="M5 20h14"/>'),
    daam: m('10x10 Checkers', 'inline', true, 'Даам — бодлого бодож нүүнэ', ['#78350f', '#b45309'],
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M3 12h18"/><circle cx="7.5" cy="7.5" r="2"/><circle cx="16.5" cy="16.5" r="2"/>'),
    gomoku: m('5 эгнэх Tic Tac Toe', 'inline', true, '5-ыг эгнүүлж, бодлогоор нүүдлээ ав', ['#0284c7', '#38bdf8'],
      '<path d="M3 8.5h18M3 15.5h18M8.5 3v18M15.5 3v18"/><path d="M10.5 10.5l3 3M13.5 10.5l-3 3"/>'),
    ludo: m('Ludo Math', 'inline', true, 'Шоо хаяж, бодлогоор урагшил', ['#ea580c', '#fb923c'],
      '<rect x="3" y="3" width="18" height="18" rx="3.5"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="16" cy="16" r="1.3" fill="currentColor"/>'),
    numseq: m('Тоон дараалал', 'file', false, 'Дарааллын зүй тогтлыг олж үргэлжлүүл', ['#7c3aed', '#a78bfa'],
      '<circle cx="5" cy="17" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="7" r="2"/><path d="M6.7 15.8l3.6-2.6M13.7 10.8l3.6-2.6"/>'),
    doroev: m('Дөрөв', 'inline', true, '4-ийг эгнүүлэх — Connect Four', ['#c2410c', '#e26a4a'],
      '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="8" cy="9.5" r="1.6"/><circle cx="12" cy="9.5" r="1.6"/><circle cx="16" cy="9.5" r="1.6"/><circle cx="8" cy="14.5" r="1.6"/><circle cx="12" cy="14.5" r="1.6"/><circle cx="16" cy="14.5" r="1.6"/>'),
    sbh: m('Сонго · Бод · Хож', 'inline', true, 'Сонго, бод, хож — 3–5 тоглогч', ['#0e7490', '#3aa3c4'],
      '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>'),
    play2048: m('2048', 'file', false, 'Хавтан нийлүүлж 2048-д хүр', ['#b45309', '#d9a441'],
      '<rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2"/><rect x="3" y="13" width="8" height="8" rx="2"/><rect x="13" y="13" width="8" height="8" rx="2"/>'),
    sudoku: m('Судоку', 'file', false, 'Тоон тор бөглөж логикоо хурцал', ['#334155', '#64748b'],
      '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>'),
    xpdrop: m('500 XP-ны уналт', 'file', false, 'Хариултаа сонгож оноогоо хамгаал', ['#0f766e', '#d4a72c'],
      '<circle cx="9" cy="9" r="6"/><path d="M18.1 10.4a6 6 0 1 1-7.7 7.7"/><path d="M7 7h1.5v4"/>'),
    myangat: m('Мянгат', 'file', false, 'Асуулт бүрт зөв хариулж мянгат бол', ['#1e3a8a', '#e9b54a'],
      '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.7V17c0 .6-.5 1-1 1.2C7.9 18.8 7 20.2 7 22"/><path d="M14 14.7V17c0 .6.5 1 1 1.2 1.1.6 2 2 2 3.8"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>'),
  };
  var KEYS = ['mathmortal', 'blockblast', 'flagbattle', 'songon', 'nicebattle', 'chessmath', 'daam', 'gomoku', 'ludo',
    'numseq', 'doroev', 'sbh', 'play2048', 'sudoku', 'xpdrop', 'myangat'];
  // index.html доторх тоглоом → талбар (embed горим зөвхөн эдгээрийг нээнэ)
  var INLINE = { chessmath: 'chessmath-area', daam: 'daam-area', gomoku: 'gomoku-area', ludo: 'ludo-area', doroev: 'doroev-area', sbh: 'sbh-area' };

  function has(o, k) { return typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k); }
  function isKey(k) { return typeof k === 'string' && KEY_RE.test(k) && has(META, k); }
  function meta(k) { return isKey(k) ? META[k] : null; }
  function svgOf(inner, s) { return '<svg width="' + s + '" height="' + s + '" ' + SV + '>' + inner + '</svg>'; }
  function icon(k, s) { var x = meta(k); return svgOf(x ? x.i : '', s || 22); }
  var IC = {
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    full: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    spin: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
    sel: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 12l10 5 10-5"/><path d="M2 17l10 5 10-5"/>',
  };
  function ui(n, s) { return svgOf(IC[n] || '', s || 18); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(v) {
    var d = new Date(v);
    return isNaN(d.getTime()) ? '' : d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function ls(k) { try { return W.localStorage.getItem(k); } catch (e) { return null; } }
  function lset(k, v) { try { W.localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return W.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { if (v == null) W.sessionStorage.removeItem(k); else W.sessionStorage.setItem(k, v); } catch (e) {} }

  // ───────────── анги / сэдэв (тоглоомын бодлогын сонголт — үнэ/эрхэд НӨЛӨӨЛӨХГҮЙ) ─────────────
  // URL-ийн параметр: grade=<6..12>&topic=<node_id|0>. 'g' нэрийг ХЭРЭГЛЭХГҮЙ (gate/game.js DROP_Q хасдаг).
  var GRADES = ['6', '7', '8', '9', '10', '11', '12'];
  // Сэдэвт байх доод бодлогын тоо (үүнээс цөөн сэдэв жагсаалтад гарахгүй) — тоглоом нэг тоглолтод хэдэн бодлого шаарддагаар
  var MIN = { sbh: 20, myangat: 15, sudoku: 12, xpdrop: 10, flagbattle: 10, songon: 10, nicebattle: 10, mathmortal: 4 };
  var MIN_DEF = 8;
  var TOPICLESS = { numseq: 1 };       // сэдэв хамаарахгүй (дотоод генератор — ангиар түвшин тохирно)
  var ALL_ONLY = { '11': 1 };          // эзэмшигчийн шийдвэр: 11-р ангид зөвхөн «Бүх сэдэв» (сэдвийн бодлого цөөн)
  var SOON = { '11': 1 };              // «Тун удахгүй» — сонгогчид саарал, сонгогдохгүй (сервер ч 400/үл тоомсорлоно)
  var TOPIC_TTL = 5 * 60 * 1000;
  var SEL_KEY = 'cm_game_sel_';        // + realm → {'<имэйл>|<key>': {g, t, n, at}}
  var SEL_MAX = 80;
  function normGrade(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    var s = String(v).trim();
    return GRADES.indexOf(s) >= 0 && !has(SOON, s) ? s : null;
  }
  function isSoon(v) { return (typeof v === 'string' || typeof v === 'number') && has(SOON, String(v).trim()); }
  function normTopic(v) {
    if (typeof v !== 'string' && typeof v !== 'number') return null;
    var s = String(v).trim();
    return /^\d{1,6}$/.test(s) ? String(parseInt(s, 10)) : null;
  }
  // Сэдвийн нэрийн эхэнд байгаа үсэг/тоо биш тэмдэгт (бататгалын node-ийн эможи г.м.)-ийг хасна — UI-д эможи гаргахгүй
  var LEAD_RE = null;
  try { LEAD_RE = new RegExp('^[^\\p{L}\\p{N}(«"]+', 'u'); } catch (e) { LEAD_RE = /^[^0-9A-Za-zЀ-ӿ(«"]+/; }
  function cleanName(s) { return String(s == null ? '' : s).replace(LEAD_RE, '').replace(/\s+/g, ' ').trim().slice(0, 120); }
  // { grade, topic, name } → хэвийн сонголт | null (анги буруу/байхгүй). topic буруу → '0' (бүх сэдэв).
  function normSel(o) {
    if (!o || typeof o !== 'object') return null;
    var g = normGrade(o.grade);
    if (!g) return null;
    var t = normTopic(o.topic) || '0';
    return { grade: g, topic: t, name: t !== '0' && typeof o.name === 'string' ? cleanName(o.name) : '' };
  }
  function minFor(k) { return has(MIN, k) ? MIN[k] : MIN_DEF; }
  function hasTopics(k) { return !has(TOPICLESS, k); }
  function selLabel(sel) {
    var s = normSel(sel);
    if (!s) return '';
    return s.grade + '-р анги · ' + (s.topic === '0' ? 'Бүх сэдэв' : (s.name || 'Сонгосон сэдэв'));
  }
  // url + grade/topic (аль хэдийн grade= байвал хэвээр — серверийн launch залгасан байж болно). '#…'-ийн өмнө; замгүй
  // гадны хаягт ('https://host') '/' нэмнэ.
  function withSel(url, sel) {
    var s = normSel(sel);
    if (!s || typeof url !== 'string' || !url || /[?&]grade=/.test(url)) return url;
    var h = '', i = url.indexOf('#');
    if (i >= 0) { h = url.slice(i); url = url.slice(0, i); }
    if (/^https?:\/\/[^\/?#]+$/i.test(url)) url += '/';
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'grade=' + s.grade + '&topic=' + s.topic + h;
  }
  // Ангийн сэдвийн жагсаалт (core API) — анги тус бүрд кэш. key = 'mathmortal' бол ?hud=1 (HUD-д тохирох —
  // өгүүлбэргүй, цөөн үйлдэлтэй — бодлогын тоо; MATH MORTAL өөрөө ч энэ тоогоор сэдвээ харуулдаг).
  var HUD_KEYS = { mathmortal: 1 };
  var _tp = {}, _tpAt = {}, _tpP = {};
  function topics(g, force, key) {
    var gr = normGrade(g);
    if (!gr) return Promise.reject(new Error('grade'));
    var hud = has(HUD_KEYS, key), ck = gr + (hud ? 'h' : '');
    if (!force && _tp[ck] && Date.now() - _tpAt[ck] < TOPIC_TTL) return Promise.resolve(_tp[ck]);
    if (_tpP[ck]) return _tpP[ck];
    _tpP[ck] = W.fetch(Q_API + '?game_topics=' + gr + (hud ? '&hud=1' : ''), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _tpP[ck] = null;
        if (!d || d.ok !== true || !Array.isArray(d.chapters)) throw new Error('topics');
        _tp[ck] = d; _tpAt[ck] = Date.now();
        return d;
      }, function (e) { _tpP[ck] = null; throw e; });
    return _tpP[ck];
  }
  // Цэвэр: тоглоомд тохирох сэдвүүд (n ≥ minFor(key)), бүлгээр. allOnly — сэдэв сонгохгүй (numseq / 11-р анги).
  // few — ангийн нийт тохирох бодлого доод хязгаараас цөөн (тоглоом өөрийн жишиг бодлогыг холино).
  function topicGroups(d, key) {
    var min = minFor(key), out = { total: 0, few: false, allOnly: false, count: 0, groups: [] };
    if (!d || typeof d !== 'object') return out;
    out.total = Math.max(0, Number(d.total) || 0);
    out.few = out.total < min;
    var gr = typeof d.grade === 'string' || typeof d.grade === 'number' ? String(d.grade).trim() : '';
    if (!hasTopics(key) || has(ALL_ONLY, gr) || isSoon(gr)) { out.allOnly = true; return out; }
    var seen = {};
    (Array.isArray(d.chapters) ? d.chapters : []).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var ts = [];
      (Array.isArray(c.topics) ? c.topics : []).forEach(function (t) {
        if (!t || typeof t !== 'object') return;
        var id = normTopic(t.id), n = Math.max(0, Number(t.n) || 0), nm = cleanName(t.name);
        if (!id || id === '0' || seen[id] || n < min || !nm) return;
        seen[id] = 1;
        ts.push({ id: id, name: nm, n: n });
      });
      if (ts.length) { out.groups.push({ name: cleanName(c.name), topics: ts }); out.count += ts.length; }
    });
    return out;
  }
  function rk(realm) { return realm === 'cm' ? 'cm' : 'ws'; }
  function selMap(realm) {
    try { var m0 = JSON.parse(ls(SEL_KEY + rk(realm)) || '{}'); return m0 && typeof m0 === 'object' && !Array.isArray(m0) ? m0 : {}; } catch (e) { return {}; }
  }
  function selId(email, key) { return String(email == null ? '' : email).trim().toLowerCase().slice(0, 254) + '|' + key; }
  function getSel(realm, email, key) {
    if (!isKey(key)) return null;
    var x = selMap(realm)[selId(email, key)];
    return x && typeof x === 'object' ? normSel({ grade: x.g, topic: x.t, name: x.n }) : null;
  }
  function setSel(realm, email, key, sel) {
    if (!isKey(key)) return;
    var m0 = selMap(realm), id = selId(email, key), s = normSel(sel);
    if (s) m0[id] = { g: s.grade, t: s.topic, n: s.name, at: Date.now() };
    else delete m0[id];
    var ks = Object.keys(m0);
    if (ks.length > SEL_MAX) {   // хамгийн хуучныг хасна
      ks.sort(function (a, b) { return ((m0[a] && m0[a].at) || 0) - ((m0[b] && m0[b].at) || 0); });
      ks.slice(0, ks.length - SEL_MAX).forEach(function (k) { delete m0[k]; });
    }
    lset(SEL_KEY + rk(realm), JSON.stringify(m0));
  }
  // Энэ дансны хамгийн сүүлд сонгосон анги (шинэ тоглоом худалдан авахад урьдчилан сонгоно)
  function lastGrade(realm, email) {
    var m0 = selMap(realm), pre = selId(email, ''), best = null, at = -1;
    Object.keys(m0).forEach(function (k) {
      var x = m0[k];
      if (k.indexOf(pre) !== 0 || !x || !normGrade(x.g) || !isKey(k.slice(pre.length))) return;
      if ((Number(x.at) || 0) > at) { at = Number(x.at) || 0; best = normGrade(x.g); }
    });
    return best;
  }

  // ───────────── төхөөрөмж (ws-store.js-тэй ЯГ ижил — эс бөгөөс сервер DEVICE_MISMATCH/шинэ байр гэж үзнэ) ─────────────
  function dev() {
    try {
      var v = W.localStorage.getItem('cm_device');
      if (!v || v.length < 8) {
        v = ''; var a = new Uint8Array(16);
        if (W.crypto && W.crypto.getRandomValues) W.crypto.getRandomValues(a);
        else for (var j = 0; j < 16; j++) a[j] = Math.floor(Math.random() * 256);
        for (var i = 0; i < a.length; i++) v += ('0' + a[i].toString(16)).slice(-2);
        W.localStorage.setItem('cm_device', v);
      }
      return v;
    } catch (e) { return ''; }
  }
  function fp() {
    try {
      var nv = W.navigator || {}, sc = W.screen || {}, ua = String(nv.userAgent || '');
      var tz = ''; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
      var os = /Windows/.test(ua) ? 'win' : /Android/.test(ua) ? 'and' : /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Mac/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'lin' : 'oth';
      var br = /Edg\//.test(ua) ? 'edge' : /OPR\//.test(ua) ? 'opera' : /Firefox\//.test(ua) ? 'ff' : /Chrome\//.test(ua) ? 'chr' : /Safari\//.test(ua) ? 'saf' : 'oth';
      var raw = [os, br, (sc.width || 0) + 'x' + (sc.height || 0), sc.colorDepth || 0, tz,
        String(nv.language || ''), nv.hardwareConcurrency || 0].join('|');
      var h = 2166136261;
      for (var i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = (h * 16777619) >>> 0; }
      return ('0000000' + h.toString(16)).slice(-8);
    } catch (e) { return ''; }
  }
  // Админы токен (Дасгалын төвийн 'cm_admin_token') — хугацаа дууссан бол илгээхгүй
  function adminTok() {
    var t = ls('cm_admin_token');
    if (!t) return null;
    try {
      var p = JSON.parse(W.atob(String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (p && p.exp && p.exp * 1000 < Date.now()) return null;
    } catch (e) { return null; }
    return t;
  }
  // o: { realm:'ws'|'cm', token: fn → токен, admin: bool (Bearer админ нэмэх) }
  function realmOf(o) { return o && o.realm === 'cm' ? 'cm' : 'ws'; }
  function tokenOf(o) {
    try { if (o && typeof o.token === 'function') return o.token() || null; } catch (e) { return null; }
    return realmOf(o) === 'ws' ? ls('cm_ws_token') : ls('cm_token');
  }
  function headers(o) {
    var h = {};
    var d = dev(); if (d) h['X-Device-Id'] = d;
    var f = fp(); if (f) h['X-Device-Fp'] = f;
    if (realmOf(o) === 'cm') { var t = tokenOf(o); if (t) h.Authorization = 'Bearer ' + t; }
    else if (o && o.admin) { var a = adminTok(); if (a) h.Authorization = 'Bearer ' + a; }
    return h;
  }
  function body(o, extra) {
    var b = { realm: realmOf(o) };
    if (b.realm === 'ws') { var t = tokenOf(o); if (t) b.wstoken = t; }
    Object.keys(extra || {}).forEach(function (k) { if (extra[k] != null) b[k] = extra[k]; });
    return b;
  }
  // POST JSON → { s: HTTP статус, d: хариу (object) }. Сүлжээний алдаа → reject.
  function jpost(url, b, hdr) {
    var h = { 'Content-Type': 'application/json' };
    Object.keys(hdr || {}).forEach(function (k) { if (hdr[k]) h[k] = hdr[k]; });
    return W.fetch(url, { method: 'POST', headers: h, body: JSON.stringify(b || {}), credentials: 'same-origin' })
      .then(function (r) {
        return r.json().then(function (d) { return { s: r.status, d: d && typeof d === 'object' ? d : {} }; },
          function () { return { s: r.status, d: {} }; });
      });
  }

  // realm ('ws'|'cm') → тухайн сайтын төлбөрийн төлөв (enabled). Кэш realm тус бүрд.
  var _cat = {}, _catAt = {}, _catP = {};
  function catalog(force, realm) {
    var rk = realm === 'cm' || realm === 'ws' ? realm : '';
    if (!force && _cat[rk] && Date.now() - _catAt[rk] < CAT_TTL) return Promise.resolve(_cat[rk]);
    if (_catP[rk]) return _catP[rk];
    _catP[rk] = W.fetch(GAMES_API + '?action=catalog' + (rk ? '&realm=' + rk : ''), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        _catP[rk] = null;
        if (!d || d.ok !== true || !Array.isArray(d.games)) throw new Error('catalog');
        _cat[rk] = d; _catAt[rk] = Date.now();
        return d;
      }, function (e) { _catP[rk] = null; throw e; });
    return _catP[rk];
  }
  function status(o) { return jpost(GAMES_API + '?action=status', body(o), headers(o)); }
  // o.sel = { grade, topic } — тоглоомын анги/сэдэв (сервер url-д залгаж, өөрийн эрхтэй үед game_access.grade-ийг шинэчилнэ)
  function launch(key, o) {
    o = o || {};
    var s = normSel(o.sel);
    return jpost(GAMES_API + '?action=launch', body(o, { game: key, invite: o.invite || null, grade: s ? s.grade : null, topic: s ? s.topic : null }),
      headers({ realm: o.realm, token: o.token, admin: true }));
  }
  function invite(key, o) { return jpost(GAMES_API + '?action=invite', body(o, { game: key }), headers(o)); }
  // Тоглоомын эрх худалдан авах нэхэмжлэх: дүн/имэйлийг сервер тогтооно (клиентээс зөвхөн тоглоом + realm + токен + анги).
  // o.grade — худалдан авалтад бүртгэх анги (6–12; үнэд нөлөөлөхгүй).
  function buyCreate(key, o) {
    return jpost(QPAY_API + '?action=create', body(o, { plan: 'game', game: key, game_grade: normGrade(o && o.grade) }), headers(o));
  }
  function buyCheck(invoiceId, email) { return jpost(QPAY_API + '?action=check', { invoice_id: invoiceId, email: email }, {}); }

  function embedUrl(key, realm, inv, sel) {
    if (!has(INLINE, key)) return null;
    var u = '/?embed=' + key + '&realm=' + (realm === 'cm' ? 'cm' : 'ws');
    if (typeof inv === 'string' && INV_RE.test(inv)) u += '&einv=' + encodeURIComponent(inv);
    var s = normSel(sel);
    if (s) u += '&grade=' + s.grade + '&topic=' + s.topic;
    return u;
  }

  // ───────────── урилга (?game=<key>&ginv=<токен>) — gp-s5 GPAY-тэй ижил sessionStorage формат ─────────────
  // ?game=<key>[&ginv=<токен>][&grade=<6..12>&topic=<id>] → { key, inv, sel? } (sel — host-ийн анги/сэдэв, байвал л)
  function parseInvite(search) {
    var out = { key: null, inv: null };
    var s = String(search || '');
    var km = /[?&]game=([a-z0-9]{2,24})(?=&|#|$)/.exec(s);
    if (!km || !isKey(km[1])) return out;
    out.key = km[1];
    var im = /[?&]ginv=([^&#]{20,3000})/.exec(s);
    if (im) {
      var t = '';
      try { t = decodeURIComponent(im[1]); } catch (e) { t = ''; }
      if (INV_RE.test(t)) out.inv = t;
    }
    var gm = /[?&]grade=([^&#]{1,8})/.exec(s), tm = /[?&]topic=([^&#]{1,8})/.exec(s);
    var sl = gm ? normSel({ grade: gm[1], topic: tm ? tm[1] : '0' }) : null;
    if (sl) out.sel = { grade: sl.grade, topic: sl.topic, name: '' };
    return out;
  }
  function invKey(realm) { return 'gp_inv_' + (realm === 'cm' ? 'cm' : 'ws'); }
  function invMap(realm, pre) {
    try { var m0 = JSON.parse(ssGet((pre || 'gp_inv_') + rk(realm)) || '{}'); return m0 && typeof m0 === 'object' ? m0 : {}; } catch (e) { return {}; }
  }
  function getInvite(realm, key) { var m0 = invMap(realm); return isKey(key) && typeof m0[key] === 'string' ? m0[key] : null; }
  function setInvite(realm, key, tok) {
    if (!isKey(key)) return;
    var m0 = invMap(realm);
    if (tok && INV_RE.test(tok)) m0[key] = tok; else delete m0[key];
    ssSet(invKey(realm), Object.keys(m0).length ? JSON.stringify(m0) : null);
    if (!(tok && INV_RE.test(tok))) setInviteSel(realm, key, null);
  }
  // Урилгын холбоосоор ирсэн host-ийн анги/сэдэв (sessionStorage 'gp_isel_<realm>') — найзын анхдагч сонголт
  function inviteSel(realm, key) {
    if (!isKey(key)) return null;
    var x = invMap(realm, 'gp_isel_')[key];
    return x && typeof x === 'object' ? normSel(x) : null;
  }
  function setInviteSel(realm, key, sel) {
    if (!isKey(key)) return;
    var m0 = invMap(realm, 'gp_isel_'), s = normSel(sel);
    if (s) m0[key] = { grade: s.grade, topic: s.topic }; else delete m0[key];
    ssSet('gp_isel_' + rk(realm), Object.keys(m0).length ? JSON.stringify(m0) : null);
  }
  function takeUrlInvite(realm) {
    var loc = W && W.location;
    if (!loc) return { key: null, inv: null };
    var r = parseInvite(loc.search);
    if (r.key && r.inv) setInvite(realm, r.key, r.inv);
    if (r.key && r.sel) setInviteSel(realm, r.key, r.sel);
    if (/[?&](game|ginv)=/.test(loc.search || '')) {
      try {
        var u = new URL(loc.href);
        u.searchParams.delete('game'); u.searchParams.delete('ginv');
        if (r.key) { u.searchParams.delete('grade'); u.searchParams.delete('topic'); }
        W.history.replaceState(W.history.state, '', u.pathname + u.search + u.hash);
      } catch (e) {}
    }
    return r;
  }

  // Картын төлөв (цэвэр): o = { enabled, loggedIn, admin, exp, invite, now }
  //   'free'   — GAME_PAYWALL=off (бүх тоглоом нээлттэй)      'active' — өөрийн идэвхтэй эрх (exp)
  //   'invite' — найзын урилгатай (өөрийн эрхгүй)              'admin'  — админ (туршилт)
  //   'buy'    — нэвтэрсэн, эрхгүй                              'login'  — нэвтрээгүй
  function cardState(o) {
    o = o || {};
    if (o.enabled === false) return { st: 'free' };
    var now = o.now == null ? Date.now() : o.now;
    var t = o.exp ? new Date(o.exp).getTime() : NaN;
    if (!isNaN(t) && t > now) return { st: 'active', exp: new Date(t).toISOString() };
    if (o.invite) return { st: 'invite' };
    if (o.admin) return { st: 'admin' };
    return { st: o.loggedIn ? 'buy' : 'login' };
  }

  // ───────────── асуултын гүүр (index.html-ийн myangat/xpdrop логикийн хуулбар) ─────────────
  function tex(s) {
    s = String(s == null ? '' : s);
    var K = W && W.katex;
    if (!K) return s;
    return s.replace(/\$([^$]+)\$/g, function (_, expr) {
      try { return K.renderToString(expr, { throwOnError: false, output: 'html' }); } catch (e) { return expr; }
    });
  }
  // qs: /api/questions-ийн questions → [{ text, options[4], correctIdx }]. o: { max, placeholder, shuffle:false, tex: fn }
  function rounds(qs, o) {
    o = o || {};
    var tx = typeof o.tex === 'function' ? o.tex : tex;
    var out = [];
    (Array.isArray(qs) ? qs : []).forEach(function (q) {
      if (!q || (q.type && q.type !== 'choice')) return;
      var ch = q.choices;
      if (typeof ch === 'string') { try { ch = JSON.parse(ch); } catch (e) { ch = []; } }
      if (!Array.isArray(ch) || ch.length < 2 || !q.correct) return;
      var options = ch.slice(0, 4);
      while (options.length < 4) options.push('—');
      var idx = options.indexOf(q.correct);
      if (idx === -1) {
        var ph = options.indexOf('—');
        if (ph === -1) return;
        options[ph] = q.correct; idx = ph;
      }
      out.push({ text: tx(q.text || ''), options: options.map(function (x) { return tx(x); }), correctIdx: idx });
    });
    if (o.shuffle !== false) {
      for (var i = out.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = out[i]; out[i] = out[j]; out[j] = t; }
    }
    if (o.max) out = out.slice(0, o.max);
    if (!out.length && o.placeholder) out = [{ text: 'Бодлогын сан хоосон байна', options: ['—', '—', '—', '—', '—'], correctIdx: 0 }];
    return out;
  }
  var KATEX_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css';
  var MYANGAT_CSS = '*{box-sizing:border-box}body,html{overflow-x:hidden}.stage{padding:14px 10px 12px!important;gap:10px!important}'
    + '@media (max-width:560px){header{flex-wrap:wrap!important;gap:8px!important}.brand h1{font-size:24px!important}'
    + '.brand .sub{font-size:9px!important;letter-spacing:.18em!important}.level-pill{padding:5px 10px!important;font-size:11px!important;gap:6px!important}'
    + '.level-pill b{font-size:13px!important}.qcard{padding:14px 12px 18px!important}.qcard .qtext{font-size:clamp(15px,4.4vw,22px)!important;padding:4px 0 14px!important}'
    + '.options{gap:8px!important}.opt{padding:10px 14px!important;font-size:14px!important;min-height:50px!important}.opt .letter{font-size:14px!important;width:18px!important}'
    + '.lifelines{gap:8px!important;flex-wrap:wrap!important}.ll{width:58px!important;height:58px!important}.ll .ico{font-size:16px!important}'
    + '.qbtn{padding:9px 14px!important;font-size:12px!important;letter-spacing:.02em!important}.qbtn.primary{font-size:13px!important;padding:11px 18px!important}'
    + '.qbtn.danger{font-size:11px!important;padding:8px 12px!important;white-space:normal!important;max-width:100%!important}'
    + '.play-area>div:last-child{flex-direction:column!important;gap:10px!important}}'
    + '@media (max-width:380px){.brand h1{font-size:20px!important}.ll{width:52px!important;height:52px!important;font-size:8px!important}}';
  var XPDROP_CSS = '.trapdoors{display:grid!important;grid-template-columns:repeat(4,1fr)!important;gap:14px!important;width:100%!important;max-width:none!important;padding:0 16px!important}'
    + '.trap{flex:1!important;width:100%!important;min-width:0!important;max-width:none!important}.monitor{width:100%!important;max-width:none!important}'
    + '.monitor-bezel{width:100%!important}.screen{aspect-ratio:5/3!important;width:100%!important;min-height:140px!important}'
    + '.screen-answer{font-size:clamp(1rem,3.2vw,2rem)!important;font-weight:800!important;line-height:1.2!important;padding:8px!important;word-break:break-word;overflow-wrap:anywhere;display:flex!important;align-items:center;justify-content:center;text-align:center;max-height:100%}'
    + '.screen-answer .katex,.screen-answer .katex-html{font-size:inherit!important}.q-text{font-size:clamp(1.1rem,3vw,1.6rem)!important;line-height:1.35!important;padding:0 16px}'
    + '.q-text .katex,.q-text .katex-html{font-size:inherit!important}main{width:100%!important;max-width:none!important;padding:0!important;box-sizing:border-box}'
    + 'body,#root{width:100vw!important;max-width:100vw!important;overflow-x:hidden}*{box-sizing:border-box}'
    + '@media (max-width:600px){html,body{overflow-y:auto!important;overflow-x:hidden!important;height:auto!important;min-height:100vh!important}'
    + '.stage{height:auto!important;min-height:100vh!important;overflow:visible!important;grid-template-rows:auto auto auto auto!important;padding:14px 10px 24px!important;gap:8px!important}'
    + 'main{padding:10px 0!important;align-items:stretch!important}.trapdoors{grid-template-columns:repeat(2,1fr)!important;gap:10px!important;padding:0 6px!important;max-width:100%!important}'
    + '.trap{height:auto!important;min-height:auto!important}.monitor{aspect-ratio:5/3!important;width:100%!important}.screen{aspect-ratio:5/3!important;min-height:100px!important}'
    + '.screen-answer{font-size:clamp(0.95rem,3.8vw,1.4rem)!important}.screen-letter{font-size:13px!important;top:5px!important;left:7px!important}'
    + '.bet-row{padding:4px!important;gap:3px!important;margin-top:4px!important}.bet-btn{height:26px!important;font-size:11px!important;padding:0 3px!important}'
    + '.money-pile .bill{width:46px!important;height:7px!important}.money-amount{font-size:11px!important;padding:3px 6px!important}'
    + '.q-banner{padding:12px 14px!important;min-height:auto!important;margin-top:8px!important}.q-text{font-size:clamp(0.95rem,3.6vw,1.2rem)!important;padding:0 4px!important;line-height:1.3!important}'
    + '.controls{flex-direction:column!important;gap:12px!important;align-items:stretch!important;margin-top:10px!important;padding-bottom:6px!important}'
    + '.remaining{justify-content:center!important;gap:10px!important;flex-wrap:wrap!important}.remaining .val{font-size:22px!important}.remaining .hint{display:none!important}'
    + '.controls>*:not(.remaining){display:flex!important;gap:8px!important;justify-content:center!important;flex-wrap:wrap!important}'
    + '.qbtn{padding:10px 16px!important;font-size:12px!important;letter-spacing:.04em!important;flex:1 1 auto!important;min-width:100px!important;max-width:none!important;white-space:normal!important}'
    + '.qbtn.primary{padding:12px 18px!important;font-size:13px!important;letter-spacing:.06em!important}.brand h1{font-size:22px!important}'
    + '.brand .sub{font-size:9px!important;letter-spacing:.2em!important}.header-stats{gap:6px!important}.stat-pill{padding:5px 10px!important;font-size:10px!important}'
    + '.stat-pill b{font-size:13px!important}}';
  // Ижил домэйны iframe-д style/link нэмнэ (дахин нэмэхгүй)
  function injectCss(frame, id, css, href) {
    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.head || doc.getElementById(id)) return;
      var el;
      if (href) { el = doc.createElement('link'); el.rel = 'stylesheet'; el.href = href; }
      else { el = doc.createElement('style'); el.textContent = css; }
      el.id = id;
      doc.head.appendChild(el);
    } catch (e) {}
  }
  // Сонгосон анги/сэдвээс (c.sel) тоглоомд тохирох бодлого: /api/questions?game=<g>&topic=<t>&n=<N>. Сэдвээс цөөн ирвэл
  // ангийн бүх сэдвээс (topic=0) дахин татна. Сонголтгүй (cyber-math.com / хуучин) → өмнөх шигээ параметргүй.
  var FEED_N = { myangat: 15, xpdrop: 10 };
  var DIFF_RANK = { easy: 0, medium: 1, hard: 2 };
  function qUrl(s, n) { return Q_API + '?game=' + s.grade + '&topic=' + s.topic + '&n=' + n; }
  function getQs(u) {
    return W.fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.json(); })
      .then(function (d) { return d && Array.isArray(d.questions) ? d.questions : []; });
  }
  // Мянгат: шат хялбараас хүнд рүү — difficulty-аар тогтвортой эрэмбэ (тодорхойгүй → дунд)
  function byDifficulty(qs) {
    return qs.map(function (q, i) { return { q: q, i: i, r: q && has(DIFF_RANK, q.difficulty) ? DIFF_RANK[q.difficulty] : 1 }; })
      .sort(function (a, b) { return a.r - b.r || a.i - b.i; }).map(function (x) { return x.q; });
  }
  function feedQuestions(c, kind) {
    var s = normSel(c.sel), n = FEED_N[kind] || 10;
    var p = !s ? getQs(Q_API) : getQs(qUrl(s, n)).then(function (qs) {
      if (qs.length >= n || s.topic === '0') return qs;
      // Сэдвийн бодлого дутвал ангийн бүх сэдвээс НӨХНӨ (сэдвийнх эхэнд, давхардалгүй)
      return getQs(qUrl({ grade: s.grade, topic: '0' }, n)).then(function (q2) {
        var seen = {};
        qs.forEach(function (q) { if (q && q.id != null) seen[String(q.id)] = 1; });
        return qs.concat(q2.filter(function (q) { return q && !(q.id != null && seen[String(q.id)]); })).slice(0, n);
      }, function () { return qs; });
    });
    p.then(function (qs) {
      if (CUR !== c || !c.frame || !c.frame.contentWindow) return;
      var cw = c.frame.contentWindow;
      if (kind === 'myangat') {
        cw.postMessage({ type: 'myangat-questions', questions: s ? rounds(byDifficulty(qs), { shuffle: false }) : rounds(qs) }, W.location.origin);
        injectCss(c.frame, 'katex-css-myangat', null, KATEX_CSS);
      } else {
        cw.postMessage({ type: 'xpdrop-questions', rounds: rounds(qs, { max: 10, placeholder: true }) }, W.location.origin);
        injectCss(c.frame, 'katex-css-injected', null, KATEX_CSS);
        injectCss(c.frame, 'xpdrop-custom-css', XPDROP_CSS);
      }
    }).catch(function () {});
  }

  // ───────────── overlay (#gameM) ─────────────
  var CSS = ''
    + '.gm-ov{position:fixed;inset:0;z-index:230;display:flex;flex-direction:column;background:#0f0b24;color:#fff;font-family:inherit}'
    + '.gm-bar{flex:none;display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));'
    + 'background:linear-gradient(135deg,#7B52EE,#A855F7);box-shadow:0 6px 18px -10px rgba(0,0,0,.6)}'
    + '.gm-btn{flex:none;display:inline-flex;align-items:center;gap:5px;border:0;background:rgba(255,255,255,.18);color:#fff;font-family:inherit;'
    + 'font-weight:800;font-size:.82rem;border-radius:999px;padding:.42rem .8rem;cursor:pointer;line-height:1.1}'
    + '.gm-btn:hover{background:rgba(255,255,255,.28)}.gm-btn svg{flex:none}'
    + '.gm-t{flex:1;min-width:0;display:flex;align-items:center;gap:8px;white-space:nowrap;overflow:hidden}'
    + '.gm-t .gm-ic{flex:none;width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.2)}'
    + '.gm-t b{font-weight:900;font-size:.98rem;overflow:hidden;text-overflow:ellipsis}'
    + '.gm-t small{font-weight:700;font-size:.74rem;opacity:.85;overflow:hidden;text-overflow:ellipsis}'
    + '.gm-body{position:relative;flex:1;min-height:0;background:#0f0b24}'
    + '.gm-body iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent}'
    + '.gm-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:9px;color:#d9ccff;font-weight:700;font-size:.92rem}'
    + '.gm-load svg{animation:gmspin .9s linear infinite}@keyframes gmspin{to{transform:rotate(360deg)}}'
    + 'html.gm-lock,html.gm-lock body{overflow:hidden!important}'
    + '@media (max-width:560px){.gm-btn span{display:none}.gm-btn{padding:.5rem}.gm-t small{display:none}}';
  function ensureCss() {
    if (!W || !W.document || W.document.getElementById('gm-css')) return;
    var st = W.document.createElement('style');
    st.id = 'gm-css';
    st.textContent = CSS;
    W.document.head.appendChild(st);
  }
  var CUR = null;   // { key, frame, onMessage, close }
  var _bound = false;
  function onMsg(e) {
    var c = CUR;
    if (!c || !c.frame || !e || e.source !== c.frame.contentWindow) return;
    if (e.origin !== W.location.origin) return;            // зөвхөн ижил домэйн (gate-ийн түгжээ, embed, файл тоглоом)
    var d = e.data;
    if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
    if (d.type === 'myangat-need-questions' && c.key === 'myangat') return feedQuestions(c, 'myangat');
    if (d.type === 'xpdrop-need-questions' && c.key === 'xpdrop') return feedQuestions(c, 'xpdrop');
    if (/^cm-(game-locked|embed-close|embed-ready|embed-buy|embed-sel)$/.test(d.type) && typeof c.onMessage === 'function') {
      try { c.onMessage(d); } catch (err) {}
    }
  }
  function onKey(e) { if (e.key === 'Escape' && CUR) CUR.close(); }
  function overlay(o) {
    o = o || {};
    if (CUR) CUR.close();
    ensureCss();
    var D = W.document;
    if (!_bound) { _bound = true; W.addEventListener('message', onMsg); D.addEventListener('keydown', onKey); }
    var ov = D.createElement('div');
    ov.id = 'gameM';
    ov.className = 'gm-ov';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', String(o.title || 'Тоглоом'));
    var tools = (o.tools || []).map(function (t, i) {
      return '<button type="button" class="gm-btn" data-gm-tool="' + i + '" title="' + esc(t.label) + '">' + ui(t.icon, 16) + '<span>' + esc(t.label) + '</span></button>';
    }).join('');
    ov.innerHTML = '<div class="gm-bar">'
      + '<button type="button" class="gm-btn" data-gm="close" title="Хаах (Esc)">' + ui('x', 16) + '<span>Хаах</span></button>'
      + '<div class="gm-t"><span class="gm-ic">' + icon(o.key, 18) + '</span><b>' + esc(o.title || '') + '</b>'
      + '<small' + (o.sub ? '' : ' hidden') + '>' + esc(o.sub || '') + '</small></div>'
      + tools
      + '<button type="button" class="gm-btn" data-gm="full" title="Бүтэн дэлгэц">' + ui('full', 16) + '<span>Бүтэн дэлгэц</span></button>'
      + '</div><div class="gm-body"><div class="gm-load">' + ui('spin', 20) + 'Ачаалж байна…</div>'
      + '<iframe title="' + esc(o.title || 'Тоглоом') + '" allow="autoplay; fullscreen; clipboard-write" allowfullscreen></iframe></div>';
    D.body.appendChild(ov);
    D.documentElement.classList.add('gm-lock');
    var frame = ov.querySelector('iframe');
    var load = ov.querySelector('.gm-load');
    var closed = false;
    var c = { key: o.key, frame: frame, el: ov, onMessage: o.onMessage, sel: normSel(o.sel) };
    c.close = function () {
      if (closed) return;
      closed = true;
      try { frame.src = 'about:blank'; } catch (e) {}
      if (ov.parentNode) ov.parentNode.removeChild(ov);
      D.documentElement.classList.remove('gm-lock');
      try { if (D.fullscreenElement && D.exitFullscreen) D.exitFullscreen(); } catch (e) {}
      if (CUR === c) CUR = null;
      if (typeof o.onClose === 'function') { try { o.onClose(); } catch (e) {} }
    };
    c.setUrl = function (u) { load.style.display = ''; frame.src = u; };
    // Анги/сэдэв солиход: feedQuestions дараагийн хүсэлтэд шинэ сонголтыг хэрэглэнэ
    c.setSel = function (s) { c.sel = normSel(s); };
    c.setSub = function (t) {
      var sm = ov.querySelector('.gm-t small');
      if (!sm) return;
      sm.textContent = String(t || '');
      sm.hidden = !t;
    };
    // Ижил домэйны iframe руу мессеж (cm-embed-config г.м.)
    c.post = function (msg) { try { if (frame.contentWindow) frame.contentWindow.postMessage(msg, W.location.origin); } catch (e) {} };
    frame.addEventListener('load', function () {
      load.style.display = 'none';
      if (o.key === 'myangat') injectCss(frame, 'myangat-mobile-css', MYANGAT_CSS);
    });
    ov.querySelector('[data-gm="close"]').onclick = c.close;
    ov.querySelector('[data-gm="full"]').onclick = function () {
      try {
        if (D.fullscreenElement) D.exitFullscreen();
        else if (ov.requestFullscreen) ov.requestFullscreen();
        else if (ov.webkitRequestFullscreen) ov.webkitRequestFullscreen();
      } catch (e) {}
    };
    [].forEach.call(ov.querySelectorAll('[data-gm-tool]'), function (b) {
      var t = (o.tools || [])[+b.getAttribute('data-gm-tool')];
      b.onclick = function () { if (t && typeof t.onClick === 'function') t.onClick(c); };
    });
    CUR = c;
    if (o.url) frame.src = o.url;
    return c;
  }
  function current() { return CUR; }

  return {
    META: META, KEYS: KEYS, INLINE: INLINE, isKey: isKey, meta: meta, icon: icon, ui: ui, esc: esc, fmt: fmt, ymd: ymd,
    dev: dev, fp: fp, headers: headers, body: body, adminTok: adminTok,
    catalog: catalog, status: status, launch: launch, invite: invite, buyCreate: buyCreate, buyCheck: buyCheck,
    embedUrl: embedUrl, overlay: overlay, current: current,
    parseInvite: parseInvite, takeUrlInvite: takeUrlInvite, getInvite: getInvite, setInvite: setInvite,
    inviteSel: inviteSel, setInviteSel: setInviteSel,
    GRADES: GRADES, SOON: SOON, isSoon: isSoon, MIN: MIN, ALL_ONLY: ALL_ONLY, normGrade: normGrade, normTopic: normTopic, normSel: normSel,
    minFor: minFor, hasTopics: hasTopics, selLabel: selLabel, withSel: withSel, topics: topics, topicGroups: topicGroups,
    getSel: getSel, setSel: setSel, lastGrade: lastGrade, byDifficulty: byDifficulty,
    cardState: cardState, rounds: rounds, ls: ls, lset: lset,
  };
});
