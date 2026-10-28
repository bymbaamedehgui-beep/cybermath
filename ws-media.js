/* Дасгалын төв — «Интерактив» (#intSec, хаяг #interactive) ба «Видео» (#vidSec, #videos) таб (ws-browse.js-ийн дээд цэс).
   Интерактив: interactive/<id>.html — сайтын өөрийн жишээ (доорх INT) + админы нэмсэн HTML код (ws_interactive). Админы HTML-ийг
   sandbox iframe-д (allow-same-origin-гүй) зурна — сайтын нэвтрэлт, localStorage-т хүрэхгүй.
   Видео: ажлын хуудас бүрийн жишээ видео (ws_videos): анги → бүлэг → сэдэв → хуудас. YouTube / Vimeo / Google Drive холбоос эсвэл
   файл — хөтчөөс Vercel Blob руу шууд (функцээр дамжихгүй тул том файл болно). Өгөгдөл: api/_media.js. Ажлын хуудсан дээрх
   «Жишээ видео» товч — ws-store.js. */
(function () {
  'use strict';
  var IS = document.getElementById('intSec'), VS = document.getElementById('vidSec');
  if (window.WSM || !IS || !VS) return;
  var API = '/api/worksheets', BLOB_ESM = 'https://esm.sh/@vercel/blob@2.8.0/client?target=es2020';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var ICO = {
    play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5.5v13l10.5-6.5z"/></svg>',
    plus: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    full: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    ext: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    doc: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>',
    edit: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
    del: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="m6 9 6 6 6-6"/></svg>',
    search: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    film: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></svg>'
  };

  /* ───────── Интерактив: сайтын өөрийн жишээ ───────── */
  var CAT = [['all', 'Бүгд'], ['geo', 'Геометр'], ['alg', 'Алгебр'], ['fn', 'Функц'], ['trig', 'Тригонометр'], ['prob', 'Магадлал'], ['own', 'Нэмэлт']];
  var INT = [
    { id: 'pythagoras', c: 'geo', g: '8–9', t: 'Пифагорын теоремын баталгаа', d: 'Дөрвөн гурвалжныг зөөж байрлуулахад a² + b² = c² болохыг нүдээр харна.' },
    { id: 'triangle-angles', c: 'geo', g: '6–7', t: 'Гурвалжны өнцгүүдийн нийлбэр', d: 'Оройг чирээд өнцгүүдийн нийлбэр үргэлж 180° хэвээр байгааг баталгаатай нь үзнэ.' },
    { id: 'inscribed-angle', c: 'geo', g: '9–10', t: 'Тойрогт багтсан өнцөг', d: 'Багтсан өнцөг нь ижил нумд тулсан төв өнцгийн хагас болохыг туршина.' },
    { id: 'circle-area', c: 'geo', g: '6–8', t: 'Дугуйн талбайн томьёо', d: 'Дугуйг секторуудад хувааж тэгш өнцөгт болгоход S = πr² гарна.' },
    { id: 'geo-transform', c: 'geo', g: '7–9', t: 'Геометр хувиргалт', d: 'Параллель зөөлт, эргүүлэлт, тэгш хэм, гомотетийг координатын хавтгайд туршина.' },
    { id: 'algebra-squares', c: 'alg', g: '7–8', t: 'Товчилсон үржвэрийн томьёо', d: '(a + b)², (a − b)², a² − b² томьёог талбайгаар баталж харуулна.' },
    { id: 'gauss-sum', c: 'alg', g: '6–10', t: 'Натурал тоонуудын нийлбэр', d: '1 + 2 + … + n, сондгой тоонуудын нийлбэр ба арифметик прогрессийг дүрсээр.' },
    { id: 'linear', c: 'fn', g: '8–9', t: 'Шугаман функц y = kx + b', d: 'Хоёр цэгийг чирж налалт, огтлолын цэг, параллель ба перпендикуляр шулууныг судална.' },
    { id: 'quadratic', c: 'fn', g: '9–10', t: 'Квадрат функцийн график', d: 'a, b, c-г өөрчлөхөд оройн цэг, тэгш хэмийн тэнхлэг, шийд хэрхэн хөдлөхийг харна.' },
    { id: 'func-transform', c: 'fn', g: '9–11', t: 'Функцийн графикийн хувиргалт', d: 'y = A·f(k(x − m)) + n — параллель зөөлт, сунгалт, шахалт, тэгш хэм.' },
    { id: 'unit-circle', c: 'trig', g: '9–11', t: 'Нэгж тойрог: sin, cos, tg', d: 'Цэгийг тойрог дээр гүйлгэхэд sin, cos, tg-ийн утга ба синусоид хэрхэн үүсэхийг үзнэ.' },
    { id: 'probability', c: 'prob', g: '6–10', t: 'Магадлал ба туршилт', d: 'Зоос, шоо мянга мянган удаа хаяж давтамж магадлалд ойртохыг (их тооны хууль) харна.' }
  ];
  // Картын бүдүүвч зураг (16:9)
  var BG = '<rect width="160" height="90" fill="#F3EEFF"/>';
  var TH = {
    pythagoras: BG + '<rect x="48" y="13" width="64" height="64" fill="#fff" stroke="#14214A" stroke-width="1.6"/><path d="M48 13h24L48 53zM112 13v24L72 13zM112 77H88l24-40zM48 77V53l40 24z" fill="#FFC93C" stroke="#14214A" stroke-width="1.2"/><path d="M72 13l40 24-24 40-40-24z" fill="#7B52EE" fill-opacity=".28" stroke="#5a32d6" stroke-width="1.6"/><text x="80" y="49" font-size="11" font-weight="800" fill="#5a32d6" text-anchor="middle" font-family="Segoe UI,Arial">c²</text>',
    'triangle-angles': BG + '<path d="M30 72h100L75 18z" fill="#fff" stroke="#14214A" stroke-width="1.8" stroke-linejoin="round"/><path d="M30 72h14a14 14 0 0 0-5.04-10.75z" fill="#7B52EE"/><path d="M130 72h-14a14 14 0 0 1 4.01-9.8z" fill="#FFC93C"/><path d="M75 18l9.99 9.8a14 14 0 0 1-18.95.95z" fill="#d946ef"/><text x="80" y="62" font-size="13" font-weight="900" fill="#14214A" text-anchor="middle" font-family="Segoe UI,Arial">180°</text>',
    'inscribed-angle': BG + '<circle cx="80" cy="47" r="32" fill="#fff" stroke="#14214A" stroke-width="1.6"/><path d="M52.3 63L80 15l27.7 48" fill="none" stroke="#7B52EE" stroke-width="2"/><path d="M52.3 63L80 47l27.7 16" fill="#FFC93C" fill-opacity=".45" stroke="#d97706" stroke-width="1.8"/><circle cx="80" cy="47" r="2.6" fill="#14214A"/><circle cx="80" cy="15" r="3.2" fill="#7B52EE"/><circle cx="52.3" cy="63" r="3" fill="#14214A"/><circle cx="107.7" cy="63" r="3" fill="#14214A"/>',
    'circle-area': BG + '<g transform="translate(40 45)" stroke="#fff" stroke-width=".8"><path d="M0 0L26 0A26 26 0 0 0 18.4-18.4z" fill="#7B52EE"/><path d="M0 0L18.4-18.4A26 26 0 0 0 0-26z" fill="#FFC93C"/><path d="M0 0L0-26A26 26 0 0 0-18.4-18.4z" fill="#7B52EE"/><path d="M0 0L-18.4-18.4A26 26 0 0 0-26 0z" fill="#FFC93C"/><path d="M0 0L-26 0A26 26 0 0 0-18.4 18.4z" fill="#7B52EE"/><path d="M0 0L-18.4 18.4A26 26 0 0 0 0 26z" fill="#FFC93C"/><path d="M0 0L0 26A26 26 0 0 0 18.4 18.4z" fill="#7B52EE"/><path d="M0 0L18.4 18.4A26 26 0 0 0 26 0z" fill="#FFC93C"/></g><path d="M80 58l8-26 8 26 8-26 8 26 8-26 8 26 8-26 8 26" fill="none" stroke="#14214A" stroke-width="1.4"/><path d="M80 58l8-26h48l8 26z" fill="#7B52EE" fill-opacity=".18"/><text x="114" y="72" font-size="10" font-weight="800" fill="#5a32d6" text-anchor="middle" font-family="Segoe UI,Arial">πr</text>',
    'geo-transform': BG + '<path d="M80 8v74" stroke="#14214A" stroke-width="1.2" stroke-dasharray="4 3"/><path d="M40 70V22l26 10-26 10" fill="#7B52EE" fill-opacity=".3" stroke="#5a32d6" stroke-width="1.8" stroke-linejoin="round"/><path d="M120 70V22l-26 10 26 10" fill="#FFC93C" fill-opacity=".55" stroke="#d97706" stroke-width="1.8" stroke-linejoin="round"/><path d="M66 32h28M40 22h80" stroke="#d946ef" stroke-width="1" stroke-dasharray="2 3"/>',
    'algebra-squares': BG + '<rect x="50" y="15" width="38" height="38" fill="#7B52EE" fill-opacity=".35" stroke="#14214A" stroke-width="1.2"/><rect x="88" y="15" width="22" height="38" fill="#FFC93C" stroke="#14214A" stroke-width="1.2"/><rect x="50" y="53" width="38" height="22" fill="#FFC93C" stroke="#14214A" stroke-width="1.2"/><rect x="88" y="53" width="22" height="22" fill="#d946ef" fill-opacity=".45" stroke="#14214A" stroke-width="1.2"/><g font-family="Segoe UI,Arial" font-weight="800" font-size="10" text-anchor="middle" fill="#14214A"><text x="69" y="37">a²</text><text x="99" y="37">ab</text><text x="69" y="67">ab</text><text x="99" y="67">b²</text></g>',
    'gauss-sum': BG + '<g stroke="#fff" stroke-width="1"><path d="M40 70h12v-12H40zM52 70h12V46H52zM64 70h12V34H64zM76 70h12V22H76zM88 70h12V10H88z" fill="#7B52EE"/><path d="M40 58h12V10H40zM52 46h12V10H52zM64 34h12V10H64zM76 22h12V10H76z" fill="#FFC93C"/></g><text x="124" y="46" font-size="11" font-weight="900" fill="#14214A" text-anchor="middle" font-family="Segoe UI,Arial">n(n+1)</text><path d="M110 50h28" stroke="#14214A" stroke-width="1.2"/><text x="124" y="62" font-size="11" font-weight="900" fill="#14214A" text-anchor="middle" font-family="Segoe UI,Arial">2</text>',
    linear: BG + '<path d="M20 10v72M12 62h136M40 10v72M60 10v72M80 10v72M100 10v72M120 10v72M140 10v72M12 22h136M12 42h136M12 82h136" stroke="#E2D9FB" stroke-width=".8"/><path d="M20 10v72M12 62h136" stroke="#14214A" stroke-width="1.2"/><path d="M14 80L146 14" stroke="#7B52EE" stroke-width="2.4"/><path d="M60 60h40V40" fill="none" stroke="#d946ef" stroke-width="1.6" stroke-dasharray="3 2"/><circle cx="60" cy="60" r="3.4" fill="#FFC93C" stroke="#14214A"/><circle cx="100" cy="40" r="3.4" fill="#FFC93C" stroke="#14214A"/>',
    quadratic: BG + '<path d="M20 70h120M80 8v78" stroke="#14214A" stroke-width="1.1"/><path d="M80 8v78" stroke="#d946ef" stroke-width="1" stroke-dasharray="3 3"/><path d="M38 14Q80 118 122 14" fill="none" stroke="#7B52EE" stroke-width="2.4"/><circle cx="80" cy="66" r="3.4" fill="#FFC93C" stroke="#14214A"/><circle cx="54.5" cy="49.5" r="2.6" fill="#14214A"/><circle cx="105.5" cy="49.5" r="2.6" fill="#14214A"/>',
    'func-transform': BG + '<path d="M16 72h128M50 8v78" stroke="#14214A" stroke-width="1.1"/><path d="M26 14Q50 118 74 14" fill="none" stroke="#9A95B8" stroke-width="1.6" stroke-dasharray="4 3"/><path d="M78 6Q104 92 130 6" fill="none" stroke="#7B52EE" stroke-width="2.4"/><path d="M58 52h26" stroke="#d946ef" stroke-width="1.8"/><path d="M80 47l6 5-6 5" fill="none" stroke="#d946ef" stroke-width="1.8" stroke-linejoin="round"/>',
    'unit-circle': BG + '<circle cx="48" cy="45" r="30" fill="#fff" stroke="#14214A" stroke-width="1.4"/><path d="M14 45h68M48 11v68" stroke="#14214A" stroke-width=".8"/><path d="M48 45L67.3 22" stroke="#7B52EE" stroke-width="2"/><path d="M48 45h19.3" stroke="#FFC93C" stroke-width="3"/><path d="M67.3 45V22" stroke="#d946ef" stroke-width="2.6"/><circle cx="67.3" cy="22" r="3.2" fill="#7B52EE"/><path d="M92 45h60" stroke="#14214A" stroke-width=".8"/><path d="M92 45c7.5-40 22.5-40 30 0s22.5 40 30 0" fill="none" stroke="#d946ef" stroke-width="2"/>',
    probability: BG + '<rect x="22" y="22" width="46" height="46" rx="10" fill="#fff" stroke="#14214A" stroke-width="1.8"/><g fill="#7B52EE"><circle cx="34" cy="34" r="4"/><circle cx="56" cy="34" r="4"/><circle cx="45" cy="45" r="4"/><circle cx="34" cy="56" r="4"/><circle cx="56" cy="56" r="4"/></g><g fill="#FFC93C" stroke="#14214A" stroke-width="1"><rect x="84" y="40" width="9" height="32"/><rect x="96" y="30" width="9" height="42"/><rect x="108" y="36" width="9" height="36"/><rect x="120" y="28" width="9" height="44"/><rect x="132" y="38" width="9" height="34"/></g><path d="M80 34h66" stroke="#d946ef" stroke-width="1.4" stroke-dasharray="4 3"/>',
    own: BG + '<rect x="40" y="16" width="80" height="58" rx="9" fill="#fff" stroke="#14214A" stroke-width="1.6"/><path d="M40 28h80" stroke="#14214A" stroke-width="1.2"/><circle cx="47" cy="22" r="2" fill="#d946ef"/><circle cx="54" cy="22" r="2" fill="#FFC93C"/><path d="M70 40l-9 9 9 9M90 40l9 9-9 9M84 37l-8 24" fill="none" stroke="#7B52EE" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
  };
  function thumb(id) { return '<svg viewBox="0 0 160 90" aria-hidden="true">' + (TH[id] || TH.own) + '</svg>'; }

  var DATA = { videos: [], ints: [], ok: false }, ST = { cat: 'all', g: -1, all: false, q: '' };
  function admin() { return typeof isAdmin === 'function' && !!isAdmin(); }
  function hdr() { var t = ''; try { t = localStorage.getItem('cm_admin_token') || ''; } catch (e) {} return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }; }
  function say(m) { if (typeof toast === 'function') toast(m); else alert(m); }
  function post(body) {
    return fetch(API, { method: 'POST', headers: hdr(), body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok || !j.ok) throw new Error(j.error || ('Алдаа ' + r.status)); return j; }); });
  }
  function load(fresh) {
    return fetch(API + '?media=1' + (fresh ? '&t=' + Date.now() : '')).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) throw new Error('media');
      DATA.videos = j.videos || []; DATA.ints = j.ints || []; DATA.ok = true;
    });
  }
  function bySlug() { var m = {}; DATA.videos.forEach(function (v) { (m[v.slug] = m[v.slug] || []).push(v); }); return m; }

  /* ───────── Цонх (modal) ───────── */
  var OPEN = null;
  function modal(title, cls, actions) {
    close();
    var ov = document.createElement('div'); ov.className = 'wsm-ov';
    ov.innerHTML = '<div class="wsm-box ' + (cls || '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '"><div class="wsm-hd"><b>' + esc(title) + '</b>' + (actions || '')
      + '<button type="button" class="wsm-x" data-close aria-label="Хаах">' + ICO.x + '</button></div><div class="wsm-bd"></div></div>';
    document.body.appendChild(ov);
    var prev = document.documentElement.style.overflow; document.documentElement.style.overflow = 'hidden';
    var onKey = function (e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.addEventListener('click', function (e) { if (e.target === ov || e.target.closest('[data-close]')) close(); });
    OPEN = { el: ov, body: ov.querySelector('.wsm-bd'), off: function () { document.removeEventListener('keydown', onKey); document.documentElement.style.overflow = prev; } };
    var x = ov.querySelector('.wsm-x'); if (x) x.focus();
    return OPEN;
  }
  function close() { if (!OPEN) return; var o = OPEN; OPEN = null; o.off(); o.el.remove(); }
  function fullscreen(el) { var f = el.requestFullscreen || el.webkitRequestFullscreen; if (f) try { f.call(el); } catch (e) {} }

  /* ───────── Интерактив таб ───────── */
  function intItems() {
    var own = DATA.ints.map(function (x) { return { own: true, id: x.id, c: 'own', g: x.grade, t: x.title, d: x.descr, slug: x.slug }; });
    return INT.concat(own);
  }
  function renderInt() {
    var all = intItems(), adm = admin();
    var cats = CAT.filter(function (c) { return c[0] === 'all' || all.some(function (it) { return it.c === c[0]; }); });
    if (!cats.some(function (c) { return c[0] === ST.cat; })) ST.cat = 'all';
    var list = all.filter(function (it) { return ST.cat === 'all' || it.c === ST.cat; });
    var h = '<div class="wsm-bar"><div class="wsm-chips" role="tablist">' + cats.map(function (c) {
      var n = c[0] === 'all' ? all.length : all.filter(function (it) { return it.c === c[0]; }).length;
      return '<button type="button" class="wsm-chip' + (ST.cat === c[0] ? ' on' : '') + '" data-cat="' + c[0] + '">' + esc(c[1]) + '<small>' + n + '</small></button>';
    }).join('') + '</div>' + (adm ? '<button type="button" class="gbtn" data-int-add>' + ICO.plus + 'HTML нэмэх</button>' : '') + '</div>';
    h += '<div class="wsm-icards">' + list.map(function (it) {
      var key = it.own ? 'db:' + it.id : it.id, cat = CAT.filter(function (c) { return c[0] === it.c; })[0];
      return '<article class="wsm-ic" data-int="' + esc(key) + '" tabindex="0" role="button" aria-label="' + esc(it.t) + '">'
        + '<span class="wsm-ith">' + thumb(it.own ? 'own' : it.id) + '<i class="wsm-go">' + ICO.play + '</i></span>'
        + '<span class="wsm-ib"><b>' + esc(it.t) + '</b>' + (it.d ? '<small>' + esc(it.d) + '</small>' : '')
        + '<span class="wsm-im">' + (it.g ? '<span class="wsm-tag">' + esc(it.g) + '-р анги</span>' : '') + (cat && cat[0] !== 'own' ? '<span class="wsm-tag c">' + esc(cat[1]) + '</span>' : '') + '</span></span>'
        + (it.own && adm ? '<span class="wsm-adm"><button type="button" data-int-edit="' + it.id + '">' + ICO.edit + 'Засах</button><button type="button" data-int-del="' + it.id + '">' + ICO.del + 'Устгах</button></span>' : '')
        + '</article>';
    }).join('') + '</div>';
    IS.querySelector('#intBody').innerHTML = h;
    var cn = document.getElementById('intCount'); if (cn) cn.textContent = all.length + ' жишээ';
  }
  function openInt(key) {
    var own = /^db:/.test(key), it = intItems().filter(function (x) { return (x.own ? 'db:' + x.id : x.id) === key; })[0];
    if (!it) return;
    var src = own ? '' : '/interactive/' + it.id + '.html';
    var m = modal(it.t, 'int', '<button type="button" class="wsm-hb" data-full>' + ICO.full + '<span>Бүтэн дэлгэц</span></button>'
      + (src ? '<a class="wsm-hb" href="' + src + '" target="_blank" rel="noopener">' + ICO.ext + '<span>Шинэ цонхонд</span></a>' : ''));
    var f = document.createElement('iframe');
    f.title = it.t; f.setAttribute('allow', 'fullscreen');
    if (own) {
      f.setAttribute('sandbox', 'allow-scripts allow-modals allow-popups allow-forms');   // allow-same-origin-гүй — сайтын өгөгдөлд хүрэхгүй
      m.body.innerHTML = '<div class="wsm-load">Ачаалж байна…</div>';
      fetch(API + '?int_html=' + it.id + (admin() ? '&t=' + Date.now() : '')).then(function (r) { return r.json(); }).then(function (j) {
        if (OPEN !== m) return;
        if (!j || !j.ok) { m.body.innerHTML = '<div class="wsm-load">Олдсонгүй</div>'; return; }
        m.body.innerHTML = ''; f.srcdoc = j.html; m.body.appendChild(f);
      }).catch(function () { if (OPEN === m) m.body.innerHTML = '<div class="wsm-load">Сүлжээний алдаа</div>'; });
    } else { f.src = src; m.body.appendChild(f); }
    m.el.querySelector('[data-full]').onclick = function () { fullscreen(m.body); };
  }
  // Админ: HTML код нэмэх / засах (урьдчилан харах — sandbox)
  function editInt(id) {
    var it = id ? DATA.ints.filter(function (x) { return x.id === id; })[0] : null;
    var m = modal(it ? 'Интерактив засах' : 'Интерактив HTML нэмэх', 'form');
    m.body.innerHTML = '<div class="wsm-form two"><div class="wsm-fcol">'
      + '<label class="wsm-f"><span>Нэр</span><input data-k="title" maxlength="160" placeholder="Ж: Гурвалжны медиан"></label>'
      + '<label class="wsm-f"><span>Тайлбар (карт дээр)</span><input data-k="descr" maxlength="400" placeholder="Нэг өгүүлбэр"></label>'
      + '<div class="wsm-frow"><label class="wsm-f"><span>Анги</span><input data-k="grade" maxlength="20" placeholder="8–9"></label>'
      + '<label class="wsm-f"><span>Дараалал</span><input data-k="pos" type="number" min="0" max="9999" value="0"></label></div>'
      + '<label class="wsm-f grow"><span>HTML код <em>— бүтэн хуудас (&lt;!doctype html&gt; …) эсвэл хэсэг</em></span><textarea data-k="html" spellcheck="false" placeholder="&lt;!doctype html&gt;…"></textarea></label>'
      + '<div class="wsm-frow"><label class="wsm-file">' + ICO.doc + '<span>HTML файл сонгох</span><input type="file" accept=".html,.htm,text/html" hidden></label>'
      + '<button type="button" class="wsm-btn2" data-prev>Урьдчилан харах</button></div>'
      + '<div class="wsm-err" role="alert"></div><div class="wsm-acts"><button type="button" class="gbtn" data-save>Хадгалах</button><button type="button" class="wsm-btn2" data-close>Болих</button></div>'
      + '</div><div class="wsm-prev"><div class="wsm-load">«Урьдчилан харах» дарж шалгана уу</div></div></div>';
    var q = function (k) { return m.body.querySelector('[data-k="' + k + '"]'); }, err = m.body.querySelector('.wsm-err');
    if (it) { q('title').value = it.title; q('descr').value = it.descr; q('grade').value = it.grade; q('pos').value = it.pos || 0; }
    var preview = function () {
      var pv = m.body.querySelector('.wsm-prev'), f = document.createElement('iframe');
      f.setAttribute('sandbox', 'allow-scripts allow-modals allow-popups allow-forms'); f.srcdoc = q('html').value; pv.innerHTML = ''; pv.appendChild(f);
    };
    if (it) {
      q('html').value = 'Ачаалж байна…'; q('html').disabled = true;
      fetch(API + '?int_html=' + it.id + '&t=' + Date.now()).then(function (r) { return r.json(); }).then(function (j) { q('html').value = (j && j.html) || ''; q('html').disabled = false; preview(); })
        .catch(function () { q('html').value = ''; q('html').disabled = false; err.textContent = 'HTML-ийг ачаалж чадсангүй'; });
    }
    m.body.querySelector('.wsm-file input').onchange = function () {
      var fl = this.files && this.files[0]; if (!fl) return;
      var rd = new FileReader(); rd.onload = function () { q('html').value = String(rd.result || ''); if (!q('title').value) q('title').value = fl.name.replace(/\.html?$/i, ''); preview(); };
      rd.readAsText(fl);
    };
    m.body.querySelector('[data-prev]').onclick = preview;
    m.body.querySelector('[data-save]').onclick = function () {
      var b = this; err.textContent = '';
      if (!q('title').value.trim()) { err.textContent = 'Нэр оруулна уу'; return; }
      if (!q('html').value.trim()) { err.textContent = 'HTML код оруулна уу'; return; }
      b.disabled = true; b.textContent = 'Хадгалж байна…';
      post({ action: 'int_save', id: it ? it.id : undefined, title: q('title').value, descr: q('descr').value, grade: q('grade').value, pos: +q('pos').value || 0, html: q('html').value })
        .then(function () { return load(true); }).then(function () { close(); renderInt(); say('Хадгаллаа'); })
        .catch(function (e) { err.textContent = e.message; b.disabled = false; b.textContent = 'Хадгалах'; });
    };
  }
  IS.addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-cat]'))) { ST.cat = el.getAttribute('data-cat'); renderInt(); return; }
    if (t.closest('[data-int-add]')) { editInt(0); return; }
    if ((el = t.closest('[data-int-edit]'))) { editInt(+el.getAttribute('data-int-edit')); return; }
    if ((el = t.closest('[data-int-del]'))) {
      var id = +el.getAttribute('data-int-del'), it = DATA.ints.filter(function (x) { return x.id === id; })[0];
      if (!it || !confirm('«' + it.title + '»-ийг устгах уу?')) return;
      post({ action: 'int_del', id: id }).then(function () { return load(true); }).then(renderInt).catch(function (er) { say(er.message); });
      return;
    }
    if ((el = t.closest('[data-int]'))) openInt(el.getAttribute('data-int'));
  });
  IS.addEventListener('keydown', function (e) { var el = e.target.closest && e.target.closest('[data-int]'); if (el && (e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); openInt(el.getAttribute('data-int')); } });

  /* ───────── Видео таб ───────── */
  // Тоглуулагчийн хаяг ба жижиг зураг (сервер api/_media.js videoUrl-ээр шалгасан хаяг)
  function embedOf(url) {
    var u; try { u = new URL(url); } catch (e) { return null; }
    var h = u.hostname.replace(/^(www|m)\./, ''), id = null;
    if (h === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
    else if (/(^|\.)youtube(-nocookie)?\.com$/.test(h)) id = u.searchParams.get('v') || (u.pathname.match(/\/(embed|shorts|live)\/([^/?#]+)/) || [])[2];
    if (id && /^[\w-]{6,20}$/.test(id)) {
      var st = parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '', 10);
      return { kind: 'frame', src: 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&modestbranding=1&autoplay=1' + (st > 0 ? '&start=' + st : ''), img: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg' };
    }
    if (/(^|\.)vimeo\.com$/.test(h)) { var vm = u.pathname.match(/(\d{5,})/); if (vm) return { kind: 'frame', src: 'https://player.vimeo.com/video/' + vm[1] + '?autoplay=1', img: '' }; }
    if (h === 'drive.google.com') {
      var dm = (u.pathname.match(/\/file\/d\/([\w-]+)/) || [])[1] || u.searchParams.get('id');
      if (dm) return { kind: 'frame', src: 'https://drive.google.com/file/d/' + dm + '/preview', img: 'https://drive.google.com/thumbnail?id=' + dm + '&sz=w480' };
    }
    return { kind: 'file', src: url, img: '' };
  }
  function titles() {   // slug → ажлын хуудасны нэр (бүх анги)
    var m = {}; if (!window.WSB) return m;
    WSB.groups().forEach(function (g) { (g[1] || []).forEach(function (w) { if (!m[w[0]]) m[w[0]] = WSB.titleOf(w); }); });
    return m;
  }
  function isMath(label) { return /^\d+-р анги$/.test(label); }
  function vidGrade() {
    if (!window.WSB) return -1;
    var gs = WSB.groups(); if (ST.g >= 0 && ST.g < gs.length) return ST.g;
    var saved = null; try { saved = localStorage.getItem('wsm_vgrade'); } catch (e) {}
    if (saved != null && +saved >= 0 && +saved < gs.length) return (ST.g = +saved);
    if (WSB.state && WSB.state.g >= 0) return (ST.g = WSB.state.g);
    var bs = bySlug(), best = -1;
    gs.forEach(function (g, i) { if (best < 0 && (g[1] || []).some(function (w) { return bs[w[0]]; })) best = i; });
    return (ST.g = best >= 0 ? best : 0);
  }
  function vcard(v, wt, adm) {
    var e = embedOf(v.url) || {};
    return '<article class="wsm-vc" data-vid="' + v.id + '" tabindex="0" role="button" aria-label="' + esc(v.title || wt) + '">'
      + '<span class="wsm-vth">' + (e.img ? '<img src="' + esc(e.img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="wsm-vph"><em>Видео</em></span>') + '<i class="wsm-go">' + ICO.play + '</i></span>'
      + '<span class="wsm-vb"><b>' + esc(v.title || wt) + '</b>' + (v.title ? '<small>' + esc(wt) + '</small>' : '') + '</span>'
      + (adm ? '<span class="wsm-adm"><button type="button" data-vid-edit="' + v.id + '">' + ICO.edit + 'Засах</button><button type="button" data-vid-del="' + v.id + '">' + ICO.del + 'Устгах</button></span>' : '')
      + '</article>';
  }
  function renderVid() {
    var body = VS.querySelector('#vidBody'), cn = document.getElementById('vidCount');
    if (cn) cn.textContent = DATA.videos.length ? DATA.videos.length + ' видео' : '';
    if (!window.WSB) { body.innerHTML = '<div class="wsm-empty">Ачаалж байна…</div>'; return; }
    var gs = WSB.groups(), gi = vidGrade(), d = gi >= 0 ? WSB.gdata(gi) : null, bs = bySlug(), adm = admin(), TT = titles();
    var q = ST.q.toLowerCase(), showAll = adm && ST.all;
    var math = [], other = []; gs.forEach(function (g, i) { (isMath(g[0]) ? math : other).push(i); });
    var cnt = function (i) { var n = 0; (gs[i][1] || []).forEach(function (w) { n += (bs[w[0]] || []).length; }); return n; };
    var opt = function (i) { var n = cnt(i); return '<option value="' + i + '"' + (i === gi ? ' selected' : '') + '>' + esc(gs[i][0]) + (n ? ' · ' + n + ' видео' : '') + '</option>'; };
    var h = '<div class="wsm-vtop"><label class="wsm-gsel"><select aria-label="Анги сонгох"><optgroup label="Математик">' + math.map(opt).join('') + '</optgroup>'
      + (other.length ? '<optgroup label="Бусад">' + other.map(opt).join('') + '</optgroup>' : '') + '</select>' + ICO.down + '</label>'
      + '<label class="wsm-srch">' + ICO.search + '<input type="search" placeholder="Сэдэв, хуудас хайх…" value="' + esc(ST.q) + '" autocomplete="off"></label>'
      + (adm ? '<label class="wsm-sw"><input type="checkbox" data-all' + (ST.all ? ' checked' : '') + '><span>Видеогүй хуудсуудыг харуулах (нэмэх)</span></label>' : '') + '</div>';
    if (!d) { body.innerHTML = h + '<div class="wsm-empty">Ангиа сонгоно уу</div>'; return; }
    var match = function (w, vs) { if (!q) return true; var s = (TT[w[0]] || '') + ' ' + vs.map(function (v) { return v.title; }).join(' '); return s.toLowerCase().indexOf(q) >= 0; };
    var sec = function (title, list, lvl) {     // нэг сэдэв: видеотой хуудсуудын карт (+ админ: бүх хуудасны мөр)
      var cards = [], rows = [];
      list.forEach(function (w) {
        var vs = bs[w[0]] || [], wt = TT[w[0]] || w[1];
        if (!match(w, vs) && !(q && title.toLowerCase().indexOf(q) >= 0)) return;
        vs.forEach(function (v) { cards.push(vcard(v, wt, adm)); });
        if (showAll) rows.push('<div class="wsm-row"><a href="/' + esc(w[0]) + '" target="_blank" rel="noopener">' + ICO.doc + '<span>' + esc(wt) + '</span></a><em>' + (vs.length ? vs.length + ' видео' : 'видеогүй') + '</em>'
          + '<button type="button" class="wsm-add" data-vid-add="' + esc(w[0]) + '">' + ICO.plus + 'Видео</button></div>');
      });
      if (!cards.length && !rows.length) return '';
      return '<div class="wsm-tp"><' + lvl + '>' + esc(title) + '</' + lvl + '>' + (cards.length ? '<div class="wsm-vcards">' + cards.join('') + '</div>' : '') + (rows.length ? '<div class="wsm-rows">' + rows.join('') + '</div>' : '') + '</div>';
    };
    var out = '';
    d.chapters.concat(d.extras).forEach(function (c) {
      var inner = '';
      if (c.own && c.own.length) inner += sec(c.kids.length ? 'Бүлгийн хуудсууд' : (c.exam ? 'Жишиг ба шалгалт' : c.title), c.own, 'h4');
      c.kids.forEach(function (k) { inner += sec(k.exam ? 'Бүлгийн жишиг ба шалгалт' : ((k.num ? k.num + ' ' : '') + k.title), WSB.deepItems(k), 'h4'); });
      if (inner) out += '<section class="wsm-ch"><h3>' + (c.roman ? '<span>' + esc(c.roman) + '</span>' : '') + esc(c.exam ? 'Жишиг ба шалгалт' : c.title) + '</h3>' + inner + '</section>';
    });
    if (d.rest.length) { var r = sec('Бусад хуудас', d.rest, 'h4'); if (r) out += '<section class="wsm-ch"><h3>Бусад</h3>' + r + '</section>'; }
    if (!out) out = '<div class="wsm-empty">' + ICO.film + '<b>' + (q ? 'Хайлтад тохирох видео алга' : esc(d.label) + '-д видео хараахан нэмэгдээгүй байна') + '</b>'
      + (adm && !q ? '<span>«Видеогүй хуудсуудыг харуулах»-ыг асааж ажлын хуудас бүрт видео нэмнэ үү.</span>' : (q ? '' : '<span>Удахгүй нэмэгдэнэ — өөр ангийг сонгож үзээрэй.</span>')) + '</div>';
    body.innerHTML = h + out;
  }
  function playVid(id) {
    var v = DATA.videos.filter(function (x) { return x.id === id; })[0]; if (!v) return;
    var TT = titles(), wt = TT[v.slug] || v.slug, e = embedOf(v.url);
    var m = modal(v.title || wt, 'vid', '<a class="wsm-hb" href="/' + esc(v.slug) + '" target="_blank" rel="noopener">' + ICO.doc + '<span>Ажлын хуудас</span></a>');
    var same = DATA.videos.filter(function (x) { return x.slug === v.slug; });
    m.body.innerHTML = '<div class="wsm-player"></div><div class="wsm-pinfo"><small>Ажлын хуудас</small><a href="/' + esc(v.slug) + '" target="_blank" rel="noopener">' + esc(wt) + '</a>'
      + (same.length > 1 ? '<div class="wsm-plist">' + same.map(function (x, i) { return '<button type="button" class="wsm-chip' + (x.id === v.id ? ' on' : '') + '" data-pv="' + x.id + '">' + esc(x.title || ('Видео ' + (i + 1))) + '</button>'; }).join('') + '</div>' : '') + '</div>';
    var pl = m.body.querySelector('.wsm-player');
    if (e && e.kind === 'frame') pl.innerHTML = '<iframe src="' + esc(e.src) + '" title="' + esc(v.title || wt) + '" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>';
    else pl.innerHTML = '<video src="' + esc(v.url) + '" controls autoplay playsinline controlsList="nodownload" preload="metadata"></video>';
    m.body.addEventListener('click', function (ev) { var b = ev.target.closest('[data-pv]'); if (b) playVid(+b.getAttribute('data-pv')); });
  }
  // Админ: видео нэмэх / засах — холбоос эсвэл файл (Vercel Blob, хөтчөөс шууд)
  function editVid(slug, id) {
    var v = id ? DATA.videos.filter(function (x) { return x.id === id; })[0] : null; if (v) slug = v.slug;
    var TT = titles(), m = modal(v ? 'Видео засах' : 'Видео нэмэх', 'form vf');
    m.body.innerHTML = '<div class="wsm-form"><div class="wsm-f"><span>Ажлын хуудас</span><div class="wsm-ws">' + ICO.doc + esc(TT[slug] || slug) + '</div></div>'
      + '<label class="wsm-f"><span>Гарчиг</span><input data-k="title" maxlength="160" placeholder="Ж: Жишээ 1 — бутархай хураах"></label>'
      + '<div class="wsm-seg" role="tablist"><button type="button" class="on" data-src="link">Холбоос</button><button type="button" data-src="file">Файл байршуулах</button></div>'
      + '<label class="wsm-f" data-pane="link"><span>Видео холбоос</span><input data-k="url" inputmode="url" placeholder="https://youtu.be/…"><em>YouTube (нийтэд биш «Unlisted» байж болно), Vimeo, Google Drive (холбоостой хүн үзэх эрхтэй) эсвэл .mp4</em></label>'
      + '<div class="wsm-f" data-pane="file" hidden><span>Видео файл</span><label class="wsm-file big">' + ICO.film + '<span>mp4 / webm / mov сонгох (1.5 ГБ хүртэл)</span><input type="file" accept="video/mp4,video/webm,video/quicktime" hidden></label>'
      + '<div class="wsm-prog" hidden><i></i><b>0%</b></div></div>'
      + '<div class="wsm-err" role="alert"></div><div class="wsm-acts"><button type="button" class="gbtn" data-save>Хадгалах</button><button type="button" class="wsm-btn2" data-close>Болих</button></div></div>';
    var q = function (k) { return m.body.querySelector('[data-k="' + k + '"]'); }, err = m.body.querySelector('.wsm-err'), mode = 'link', file = null;
    if (v) { q('title').value = v.title; q('url').value = v.url; }
    m.body.querySelector('.wsm-seg').onclick = function (e) {
      var b = e.target.closest('[data-src]'); if (!b) return; mode = b.getAttribute('data-src');
      [].forEach.call(this.children, function (x) { x.classList.toggle('on', x === b); });
      [].forEach.call(m.body.querySelectorAll('[data-pane]'), function (p) { p.hidden = p.getAttribute('data-pane') !== mode; });
    };
    m.body.querySelector('[data-pane="file"] input').onchange = function () {
      file = this.files && this.files[0] || null;
      this.parentNode.querySelector('span').textContent = file ? file.name + ' · ' + (file.size / 1048576).toFixed(1) + ' МБ' : 'mp4 / webm / mov сонгох (1.5 ГБ хүртэл)';
      if (file && !q('title').value) q('title').value = file.name.replace(/\.[a-z0-9]+$/i, '');
    };
    var save = function (url) { return post({ action: 'vid_save', id: v ? v.id : undefined, slug: slug, title: q('title').value, url: url, pos: v ? v.pos : DATA.videos.filter(function (x) { return x.slug === slug; }).length }); };
    m.body.querySelector('[data-save]').onclick = function () {
      var b = this; err.textContent = '';
      var done = function () { return load(true).then(function () { close(); renderVid(); say('Видео хадгалагдлаа'); }); };
      var fail = function (e) { err.textContent = e && e.message || 'Алдаа'; b.disabled = false; b.textContent = 'Хадгалах'; };
      if (mode === 'link') {
        var u = q('url').value.trim(); if (!u) { err.textContent = 'Холбоос оруулна уу'; return; }
        b.disabled = true; b.textContent = 'Хадгалж байна…'; save(u).then(done).catch(fail); return;
      }
      if (!file) { err.textContent = 'Видео файл сонгоно уу'; return; }
      var type = file.type || (/\.webm$/i.test(file.name) ? 'video/webm' : /\.mov$/i.test(file.name) ? 'video/quicktime' : 'video/mp4');
      var pg = m.body.querySelector('.wsm-prog'), bar = pg.querySelector('i'), pct = pg.querySelector('b');
      b.disabled = true; b.textContent = 'Байршуулж байна…'; pg.hidden = false;
      post({ action: 'vid_token', name: file.name, type: type, size: file.size }).then(function (tk) {
        // import() — хуучин хөтөч энэ файлыг задлахдаа алдаа өгөхгүйн тулд Function-оор
        return (new Function('u', 'return import(u)'))(BLOB_ESM).then(function (mod) {
          return mod.put(tk.pathname, file, { access: 'public', token: tk.token, contentType: type, multipart: file.size > 64 * 1048576,
            onUploadProgress: function (p) { var x = Math.round(p.percentage || 0); bar.style.width = x + '%'; pct.textContent = x + '%'; } });
        });
      }).then(function (r) { b.textContent = 'Хадгалж байна…'; return save(r.url); }).then(done).catch(fail);
    };
  }
  VS.addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = t.closest('[data-vid-add]'))) { editVid(el.getAttribute('data-vid-add'), 0); return; }
    if ((el = t.closest('[data-vid-edit]'))) { editVid('', +el.getAttribute('data-vid-edit')); return; }
    if ((el = t.closest('[data-vid-del]'))) {
      var id = +el.getAttribute('data-vid-del'), v = DATA.videos.filter(function (x) { return x.id === id; })[0];
      if (!v || !confirm('«' + (v.title || 'Видео') + '»-г устгах уу?' + (/\.public\.blob\.vercel-storage\.com/.test(v.url) ? ' Байршуулсан файл ч устна.' : ''))) return;
      post({ action: 'vid_del', id: id }).then(function () { return load(true); }).then(renderVid).catch(function (er) { say(er.message); });
      return;
    }
    if ((el = t.closest('[data-vid]'))) playVid(+el.getAttribute('data-vid'));
  });
  VS.addEventListener('keydown', function (e) { var el = e.target.closest && e.target.closest('[data-vid]'); if (el && (e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); playVid(+el.getAttribute('data-vid')); } });
  VS.addEventListener('change', function (e) {
    if (e.target.matches('.wsm-gsel select')) { ST.g = +e.target.value; try { localStorage.setItem('wsm_vgrade', ST.g); } catch (er) {} renderVid(); }
    else if (e.target.matches('[data-all]')) { ST.all = e.target.checked; renderVid(); }
  });
  var qT = null;
  VS.addEventListener('input', function (e) {
    if (!e.target.matches('.wsm-srch input')) return;
    var v = e.target.value; clearTimeout(qT);
    qT = setTimeout(function () { ST.q = v.trim(); renderVid(); var i = VS.querySelector('.wsm-srch input'); if (i) { i.focus(); i.setSelectionRange(v.length, v.length); } }, 200);
  });

  /* ───────── Загвар ───────── */
  var CSS = [
    '#intSec,#vidSec,.wsm-ov{--m-p:#7B52EE;--m-pd:#5B3BD9;--m-ink:#211C54;--m-mut:#8A85A8;--m-line:#ECE7FA}',
    '.int-wrap{background:linear-gradient(135deg,#f5f0ff,#fff7e6);border-color:#eadcff}.int-wrap .game-head .tag{background:linear-gradient(135deg,#7B52EE,#f59e0b)}',
    '.vid-wrap{background:linear-gradient(135deg,#fff1f6,#f5f0ff);border-color:#f5d0e6}.vid-wrap .game-head .tag{background:linear-gradient(135deg,#e11d74,#7B52EE)}',
    '.wsm-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 14px}.wsm-bar .gbtn{margin-left:auto}',
    '.wsm-chips{display:flex;gap:6px;flex-wrap:wrap;min-width:0}',
    '.wsm-chip{display:inline-flex;align-items:center;gap:6px;border:1.5px solid var(--m-line);background:#fff;color:#4b4566;font:inherit;font-weight:800;font-size:.82rem;border-radius:999px;padding:.38rem .8rem;cursor:pointer}',
    '.wsm-chip small{font-size:.7rem;font-weight:900;color:var(--m-mut)}.wsm-chip:hover{border-color:#cbbcf7}',
    '.wsm-chip.on{background:var(--m-ink);border-color:var(--m-ink);color:#fff}.wsm-chip.on small{color:#c4bdf0}',
    '.wsm-icards{display:grid;grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:14px}',
    '.wsm-ic,.wsm-vc{position:relative;display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid var(--m-line);border-radius:16px;overflow:hidden;cursor:pointer;box-shadow:0 10px 24px -20px rgba(60,30,150,.6);transition:transform .15s,box-shadow .15s,border-color .15s}',
    '.wsm-ic:hover,.wsm-vc:hover{transform:translateY(-2px);border-color:#d6c8ff;box-shadow:0 18px 32px -20px rgba(60,30,150,.7)}',
    '.wsm-ic:focus-visible,.wsm-vc:focus-visible{outline:3px solid #A78BFA;outline-offset:2px}',
    '.wsm-ith,.wsm-vth{position:relative;display:block;aspect-ratio:16/9;overflow:hidden;background:#F3EEFF}',
    '.wsm-ith svg{display:block;width:100%;height:100%}',
    '.wsm-vth img{display:block;width:100%;height:100%;object-fit:cover}',
    '.wsm-vph{position:absolute;inset:0;background:radial-gradient(circle at 75% 20%,rgba(217,70,239,.45),transparent 55%),linear-gradient(135deg,#211C54,#5B3BD9)}',
    '.wsm-vph em{position:absolute;left:10px;bottom:8px;font-style:normal;font-weight:900;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.75)}',
    '.wsm-go{position:absolute;right:10px;bottom:10px;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#7B52EE,#d946ef);box-shadow:0 8px 18px -8px rgba(60,20,120,.8);opacity:.94;transition:transform .15s}',
    '.wsm-ic:hover .wsm-go,.wsm-vc:hover .wsm-go{transform:scale(1.08)}',
    '.wsm-vc .wsm-go{left:50%;top:50%;right:auto;bottom:auto;width:46px;height:46px;transform:translate(-50%,-50%);background:rgba(17,24,58,.72)}',
    '.wsm-vc:hover .wsm-go{transform:translate(-50%,-50%) scale(1.08);background:#e11d74}',
    '.wsm-ib,.wsm-vb{display:flex;flex-direction:column;gap:5px;padding:11px 13px 13px;min-width:0}',
    '.wsm-ib b,.wsm-vb b{font-weight:900;font-size:.93rem;line-height:1.3;color:var(--m-ink)}',
    '.wsm-ib small,.wsm-vb small{font-size:.78rem;line-height:1.4;color:#6f6a8c}',
    '.wsm-im{display:flex;gap:5px;flex-wrap:wrap;margin-top:auto;padding-top:3px}',
    '.wsm-tag{font-size:.68rem;font-weight:900;border-radius:999px;padding:.16rem .55rem;background:#F1EDFF;color:#5B3BD9}.wsm-tag.c{background:#FFF4D6;color:#9a5b00}',
    '.wsm-adm{display:flex;gap:6px;padding:0 13px 12px}',
    '.wsm-adm button,.wsm-add{display:inline-flex;align-items:center;gap:5px;border:1.5px solid var(--m-line);background:#fff;color:var(--m-pd);font:inherit;font-weight:800;font-size:.76rem;border-radius:999px;padding:.3rem .7rem;cursor:pointer}',
    '.wsm-adm button:hover,.wsm-add:hover{border-color:var(--m-p)}.wsm-adm [data-int-del]:hover,.wsm-adm [data-vid-del]:hover{border-color:#e11d48;color:#e11d48}',
    // видео таб
    '.wsm-vtop{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:4px 0 16px}',
    '.wsm-gsel{position:relative;flex:0 1 260px;min-width:180px}.wsm-gsel select{width:100%;-webkit-appearance:none;appearance:none;height:44px;border:0;border-radius:13px;padding:0 38px 0 14px;background:var(--m-ink);color:#fff;font:inherit;font-weight:900;font-size:.95rem;cursor:pointer}',
    '.wsm-gsel svg{position:absolute;right:13px;top:50%;transform:translateY(-50%);color:#fff;pointer-events:none}',
    '.wsm-srch{position:relative;flex:1 1 220px;min-width:0}.wsm-srch input{width:100%;height:44px;border:1.5px solid var(--m-line);border-radius:13px;background:#fff;padding:0 12px 0 36px;font:inherit;font-weight:700;font-size:.88rem;color:var(--m-ink);outline:none;box-sizing:border-box}',
    '.wsm-srch input:focus{border-color:var(--m-p)}.wsm-srch svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);color:var(--m-mut)}',
    '.wsm-sw{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:.82rem;color:#4b4566;cursor:pointer;background:#fff;border:1.5px dashed #d6c8ff;border-radius:12px;padding:.5rem .8rem}',
    '.wsm-ch{margin:0 0 18px;padding:14px 16px 6px;background:#fff;border:1px solid var(--m-line);border-radius:18px}',
    '.wsm-ch h3{display:flex;align-items:center;gap:10px;margin:0 0 10px;font-size:1.02rem;font-weight:900;color:var(--m-ink)}',
    '.wsm-ch h3 span{min-width:34px;height:28px;padding:0 8px;border-radius:9px;display:grid;place-items:center;background:var(--m-ink);color:#FFC93C;font-size:.85rem;box-sizing:border-box}',
    '.wsm-tp{margin:0 0 12px}.wsm-tp h4{margin:0 0 8px;font-size:.86rem;font-weight:900;color:var(--m-pd)}',
    '.wsm-vcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}',
    '.wsm-rows{display:flex;flex-direction:column;gap:4px;margin-top:8px}',
    '.wsm-row{display:flex;align-items:center;gap:10px;padding:6px 8px 6px 10px;border-radius:10px;background:#F8F6FE}',
    '.wsm-row a{flex:1;min-width:0;display:flex;align-items:center;gap:7px;color:var(--m-ink);font-weight:700;font-size:.84rem;text-decoration:none}',
    '.wsm-row a span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.wsm-row a svg{flex:none;color:var(--m-mut)}',
    '.wsm-row em{font-style:normal;font-size:.72rem;font-weight:800;color:var(--m-mut);white-space:nowrap}',
    '.wsm-empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:40px 16px;background:#fff;border:1px dashed #d9cdf7;border-radius:18px;color:#6f6a8c;font-size:.88rem}',
    '.wsm-empty svg{color:#b9a9e8}.wsm-empty b{color:var(--m-ink);font-size:1rem}',
    // цонх
    '.wsm-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(17,24,58,.62);animation:wsmIn .15s ease}',
    '@keyframes wsmIn{from{opacity:0}to{opacity:1}}',
    '.wsm-ov [hidden]{display:none!important}',
    '.wsm-box{display:flex;flex-direction:column;width:min(1100px,100%);height:min(92vh,860px);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 30px 80px -30px rgba(0,0,0,.6);font-family:inherit}',
    '.wsm-box.vid{width:min(980px,100%);height:auto;max-height:94vh}.wsm-box.form{width:min(1100px,100%)}.wsm-box.form.vf{width:min(560px,100%);height:auto;max-height:94vh}',
    '.wsm-hd{display:flex;align-items:center;gap:8px;padding:10px 10px 10px 18px;border-bottom:1px solid var(--m-line,#ECE7FA)}',
    '.wsm-hd b{flex:1;min-width:0;font-weight:900;font-size:1rem;color:#211C54;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '.wsm-hb{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px;border:1.5px solid #ECE7FA;border-radius:11px;background:#fff;color:#5B3BD9;font:inherit;font-weight:800;font-size:.8rem;text-decoration:none;cursor:pointer;white-space:nowrap}',
    '.wsm-hb:hover{border-color:#7B52EE}',
    '.wsm-x{flex:none;width:38px;height:38px;border:0;border-radius:11px;background:#F3F0FF;color:#211C54;display:grid;place-items:center;cursor:pointer}.wsm-x:hover{background:#E7E0FF}',
    '.wsm-bd{position:relative;flex:1;min-height:0;overflow:auto;background:#fbfaff}',
    '.wsm-box.int .wsm-bd{overflow:hidden}.wsm-bd>iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:#fff}',
    '.wsm-bd:fullscreen{background:#fff}',
    '.wsm-load{display:grid;place-items:center;height:100%;min-height:160px;color:#8A85A8;font-weight:800}',
    '.wsm-player{position:relative;width:100%;aspect-ratio:16/9;max-height:72vh;background:#000}',
    '.wsm-player iframe,.wsm-player video{position:absolute;inset:0;width:100%;height:100%;border:0;background:#000}',
    '.wsm-pinfo{display:flex;flex-direction:column;gap:3px;padding:12px 16px 16px}',
    '.wsm-pinfo small{font-size:.72rem;font-weight:800;color:#8A85A8;text-transform:uppercase;letter-spacing:.06em}',
    '.wsm-pinfo a{color:#211C54;font-weight:900;text-decoration:none}.wsm-pinfo a:hover{color:#5B3BD9}',
    '.wsm-plist{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
    // маягт
    '.wsm-form{display:flex;flex-direction:column;gap:12px;padding:16px 18px 18px}',
    '.wsm-form.two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;height:100%;box-sizing:border-box}',
    '.wsm-fcol{display:flex;flex-direction:column;gap:11px;min-height:0}',
    '.wsm-f{display:flex;flex-direction:column;gap:5px;min-width:0}.wsm-f.grow{flex:1;min-height:160px}',
    '.wsm-f>span{font-size:.78rem;font-weight:900;color:#4b4566}.wsm-f>span em,.wsm-f>em{font-style:normal;font-weight:600;font-size:.74rem;color:#8A85A8}',
    '.wsm-f input,.wsm-f textarea{width:100%;box-sizing:border-box;border:1.5px solid #ECE7FA;border-radius:11px;background:#fff;padding:9px 11px;font:inherit;font-size:.88rem;color:#211C54;outline:none}',
    '.wsm-f input:focus,.wsm-f textarea:focus{border-color:#7B52EE}',
    '.wsm-f textarea{flex:1;min-height:150px;resize:vertical;font:12.5px/1.45 Consolas,"Cascadia Mono",monospace;white-space:pre;tab-size:2}',
    '.wsm-frow{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.wsm-frow .wsm-f{flex:1 1 120px}',
    '.wsm-ws{display:flex;align-items:center;gap:7px;padding:9px 11px;border-radius:11px;background:#F6F4FD;font-weight:800;font-size:.86rem;color:#211C54}',
    '.wsm-seg{display:flex;gap:4px;padding:4px;border-radius:12px;background:#F3F0FF}.wsm-seg button{flex:1;border:0;border-radius:9px;padding:8px;background:transparent;font:inherit;font-weight:800;font-size:.84rem;color:#6f6a8c;cursor:pointer}',
    '.wsm-seg button.on{background:#fff;color:#5B3BD9;box-shadow:0 4px 10px -6px rgba(60,30,150,.5)}',
    '.wsm-file{display:inline-flex;align-items:center;gap:7px;border:1.5px dashed #cbbcf7;border-radius:11px;padding:8px 12px;background:#faf8ff;color:#5B3BD9;font-weight:800;font-size:.82rem;cursor:pointer}',
    '.wsm-file.big{justify-content:center;flex-direction:column;padding:22px 12px;text-align:center}.wsm-file:hover{border-color:#7B52EE}',
    '.wsm-prog{position:relative;height:22px;border-radius:999px;background:#F3F0FF;overflow:hidden}.wsm-prog i{position:absolute;left:0;top:0;bottom:0;width:0;background:linear-gradient(90deg,#7B52EE,#d946ef);transition:width .2s}',
    '.wsm-prog b{position:relative;display:block;text-align:center;font-size:.74rem;line-height:22px;color:#211C54}',
    '.wsm-btn2{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:1.5px solid #ECE7FA;background:#fff;color:#5B3BD9;font:inherit;font-weight:800;font-size:.82rem;border-radius:999px;padding:.5rem 1rem;cursor:pointer}',
    '.wsm-acts{display:flex;gap:8px;justify-content:flex-end}.wsm-err{min-height:1em;color:#e11d48;font-weight:800;font-size:.82rem}',
    '.wsm-prev{position:relative;min-height:260px;border:1px solid #ECE7FA;border-radius:14px;overflow:hidden;background:#fff}.wsm-prev iframe{position:absolute;inset:0;width:100%;height:100%;border:0}',
    '@media (max-width:760px){.wsm-form.two{display:flex;height:auto}.wsm-prev{height:60vh}}',
    '@media (max-width:640px){.wsm-ov{padding:0}.wsm-box,.wsm-box.vid,.wsm-box.form.vf{width:100%;height:100%;max-height:none;border-radius:0}.wsm-hb span{display:none}.wsm-hb{padding:0 10px}',
    '.wsm-icards{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.wsm-ib small{display:none}.wsm-ib{padding:9px 10px 11px}.wsm-ib b{font-size:.85rem}',
    '.wsm-vcards{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px}.wsm-ch{padding:12px 12px 4px}.wsm-gsel{flex:1 1 100%}}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'wsm-css'; st.textContent = CSS; document.head.appendChild(st);

  function render() { renderInt(); renderVid(); }
  IS.hidden = false; VS.hidden = false;
  render();
  load(admin()).then(render).catch(function () { render(); });
  // Каталогийн өгөгдөл (дэд бүлэг, нэр) хожуу ачаалагдвал видео табыг дахин зурна
  if (window.WSB && typeof window.renderCatalog === 'function') {
    var _rc = window.renderCatalog;
    window.renderCatalog = function () { var r = _rc.apply(this, arguments); try { renderVid(); } catch (e) {} return r; };
  }
  window.WSM = { reload: function () { return load(true).then(render); }, embedOf: embedOf, play: playVid, open: openInt };
})();
