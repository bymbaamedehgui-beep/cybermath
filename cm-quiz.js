/* CyberMath — бодлогын дэлгэцийн (#quiz-modal) шинэ харагдац, C загвар (html.cmx үед). Хэв маяг: cm-ui.css «Бодлогын дэлгэц».
   Бодлогын логикийг ӨӨРЧЛӨХГҮЙ: index.html-ийн renderQuestion / checkAnswer / showResults-ийн зурсан элементүүд (id, onclick,
   selectOption(i), check-btn) яг хэвээр. Энд зөвхөн тэдгээрийг байрлуулж, нэмэлт хийнэ:
   — компьютерт 2 багана: зүүн «бодлогын хуудас» (дэвтрийн тор), баруун хариулт; утсанд нэг багана
   — Онол / Тайлбар / График / Зураг / Ноорог нэг мөрөнд шошготой, Алдаа мэдэгдэх буланд
   — A–D тэмдэг, 1–9 ба Enter товч (бичих талбар дээр биш үед), зам маягийн явц + аватар, зүрх ба дараалсан зөв (combo)
   — буруу хариулахад «AI багшаас асуух» (одоогийн toggleAppChat / sendAppChat), эможиг SVG/үгээр
   MathLive математик гар (fill, загвартай нөхөх, томьёо) хөндөгдөхгүй. Унтраах: ?ui=old (cm-ui.js-тэй ижил). */
(function () {
  'use strict';
  var d = document, H = d.documentElement;
  if (window.top !== window.self || H.classList.contains('cm-embed')) return;
  try { if (/[?&]ui=old(&|$)/.test(location.search) || localStorage.getItem('cm_ui') === 'old') return; } catch (e) {}

  function S(p, f) {
    return '<svg viewBox="0 0 24 24" fill="' + (f ? 'currentColor' : 'none') + '" stroke="' + (f ? 'none' : 'currentColor') +
      '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  var IC = {
    heart: S('<path d="M12 20.6s-7.6-4.5-9.4-9.1C1.3 8.2 3.5 4.8 7 4.8c2 0 3.4 1 5 2.9 1.6-1.9 3-2.9 5-2.9 3.5 0 5.7 3.4 4.4 6.7-1.8 4.6-9.4 9.1-9.4 9.1Z"/>', 1),
    flame: S('<path d="M12.6 2.2c.6 3.1 3.1 4.7 4.6 7.2 1.3 2.2 1.3 4.9-.1 7.1A6 6 0 0 1 6 14.8c-.3-2.4.7-4.2 2.2-5.6.2 1.5.9 2.5 1.9 3-.4-3.6.5-7 2.5-10Z"/>', 1),
    check: S('<path d="m5 12.5 4.5 4.5L19 7.5"/>'),
    x: S('<path d="M7 7l10 10M17 7 7 17"/>'),
    spark: S('<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.6L12 15.2l-1.8-4.6L5.5 9l4.7-1.4L12 3Z"/><path d="M19 15l.8 2 2 .8-2 .8L19 21l-.8-2.4-2-.8 2-.8L19 15Z"/>'),
    gem: S('<path d="M6 3h12l4 6-10 12L2 9l4-6Z"/><path d="M2 9h20M12 21 8 9l4-6 4 6-4 12"/>')
  };
  // Хэрэгслийн товчнууд (index.html renderQuestion-ийн title-аар): Онол, Алдаа мэдэгдэх, Memo → «Ноорог»
  var TOOL_LABEL = { 'Онол': 'Онол', 'Memo': 'Ноорог' };

  var modal = null, content = null, busy = false, combo = 0, lastN = 0, counted = {};
  function on() { return H.classList.contains('cmx'); }
  function txt(el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; }
  // KaTeX-ийг TeX эх рүү буцааж энгийн бичвэр болгоно (AI багшид илгээх)
  function plain(el) {
    if (!el) return '';
    var c = el.cloneNode(true);
    [].forEach.call(c.querySelectorAll('.katex'), function (k) {
      var a = k.querySelector('annotation[encoding="application/x-tex"]');
      k.parentNode.replaceChild(d.createTextNode(a ? ' $' + a.textContent + '$ ' : k.textContent), k);
    });
    [].forEach.call(c.querySelectorAll('.cmq-ltr, .feedback-icon, button'), function (x) { x.parentNode.removeChild(x); });
    return c.textContent.replace(/\s+/g, ' ').trim();
  }

  /* ── Эможиг SVG/үгээр (зөвхөн товч, хариуны тэмдэг, дүнгийн хэсэгт — урвалын мөрөнд хүрэхгүй) ── */
  var EMO = [[/💡\s*/g, ''], [/📐\s*/g, ''], [/\(\s*5\s*💎\s*\)/g, '(5 алмааз)'], [/💎/g, ' алмааз'], [/🔄\s*/g, ''], [/✅\s*/g, ''], [/❌\s*/g, '']];
  function cleanText(root) {
    if (!root) return;
    var w = d.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (t) {
      var v = t.nodeValue, o = v;
      EMO.forEach(function (r) { v = v.replace(r[0], r[1]); });
      if (v !== o) t.nodeValue = v;
    });
  }
  function cleanEmoji() {
    ['hint-btn', 'graph-btn', 'qimage-btn', 'check-btn'].forEach(function (id) { cleanText(content.querySelector('#' + id)); });
    [].forEach.call(content.querySelectorAll('.feedback-icon'), function (s) {
      var ok = s.parentNode && s.parentNode.classList.contains('correct-fb');
      if (!s.querySelector('svg')) s.innerHTML = ok ? IC.check : IC.x;
    });
    [].forEach.call(content.querySelectorAll('.results-card .result-stat, .results-card > button, .results-card .check-btn'), cleanText);
    // Нөхөх бодлогын зааварт («💡 Math товчлуурыг…») — сонголт/томьёонд эдгээр эможи байхгүй
    cleanText(content.querySelector('.cmq-ans'));
  }

  /* ── Асуултын дэлгэц ── */
  function myAv() { var e = d.getElementById('nav-avatar-inner'); return e ? e.innerHTML : ''; }
  function qNum() { var m = /(\d+)\s*\/\s*(\d+)/.exec(txt(content.querySelector('.question-counter'))); return m ? +m[1] : 0; }
  function enhanceQ() {
    var n = qNum();
    if (n === 1 && lastN !== 1) { combo = 0; counted = {}; }   // шинэ хичээл
    lastN = n;
    var header = content.querySelector('.quiz-header');
    if (!content.querySelector('.cmq-cols')) {
      var cols = d.createElement('div'); cols.className = 'cmq-cols';
      var L = d.createElement('div'); L.className = 'cmq-paper';
      var R = d.createElement('div'); R.className = 'cmq-ans';
      [].slice.call(content.children).forEach(function (el) {
        if (el === header) return;
        var right = el.id === 'feedback' || el.classList.contains('feedback-bar') || el.id === 'options' || el.classList.contains('options-grid') ||
          el.id === 'check-btn' || el.classList.contains('check-btn');
        (right ? R : L).appendChild(el);
      });
      // Шувуу (дүрийн илэрхийлэл хэвээр) — хуудасны толгойд
      var cw = L.querySelector('.char-wrap'); if (cw && cw.parentNode !== L) cw.parentNode.classList.add('cmq-char');
      // Хэрэгслийн мөр: Онол, Тайлбар, График, Зураг, Ноорог — нэг мөрөнд; Алдаа мэдэгдэх — буланд
      var memoBtn = L.querySelector('button[onclick="toggleMemo()"]'), row = memoBtn && memoBtn.parentNode;
      var bar = d.createElement('div'); bar.className = 'cmq-bar';
      var qt = L.querySelector('.question-text');
      if (row && row !== L) {
        [].slice.call(row.querySelectorAll('button')).forEach(function (b) {
          var t = b.getAttribute('title') || '';
          if (/Алдаа/.test(t)) { b.classList.add('cmq-flag'); L.insertBefore(b, L.firstChild); return; }
          if (TOOL_LABEL[t] && !b.querySelector('.cmq-tl')) { var s = d.createElement('span'); s.className = 'cmq-tl'; s.textContent = TOOL_LABEL[t]; b.appendChild(s); }
          if (/Memo/.test(t)) b.classList.add('cmq-memo');
          bar.appendChild(b);
        });
        if (!row.children.length) row.parentNode.removeChild(row);
      }
      // L хараахан баримтад залгагдаагүй тул getElementById биш L дотроос хайна
      ['hint-btn', 'graph-btn', 'qimage-btn'].forEach(function (id) {
        var b = L.querySelector('#' + id); if (b) bar.insertBefore(b, bar.querySelector('.cmq-memo'));
      });
      if (qt && qt.nextSibling) L.insertBefore(bar, qt.nextSibling); else L.appendChild(bar);
      // Хариултын гарчиг
      var opts = R.querySelectorAll('.option-btn');
      var ah = d.createElement('div'); ah.className = 'cmq-ah';
      ah.innerHTML = '<b>' + (opts.length ? 'Хариултаа сонго' : R.querySelector('.cmg') ? 'Графикаа байгуул' : 'Хариултаа бич') + '</b>' +
        (opts.length ? '<small><kbd>1</kbd>–<kbd>' + Math.min(9, opts.length) + '</kbd> товчоор ч болно</small>' : '');
      R.insertBefore(ah, R.firstChild);
      [].forEach.call(opts, function (b, i) {
        if (b.querySelector('.cmq-ltr')) return;
        var s = d.createElement('span'); s.className = 'cmq-ltr'; s.setAttribute('aria-hidden', 'true'); s.textContent = 'ABCDEFGHI'.charAt(i);
        b.insertBefore(s, b.firstChild);
      });
      cols.appendChild(L); cols.appendChild(R);
      content.appendChild(cols);
    }
    // Зам маягийн явц: аватар дүүргэлтийн үзүүрт
    var pb = header && header.querySelector('.quiz-progress-bar'), fill = pb && pb.querySelector('.quiz-progress-fill');
    if (pb && fill) {
      var me = pb.querySelector('.cmq-me');
      if (!me) { me = d.createElement('span'); me.className = 'cmq-me'; me.setAttribute('aria-hidden', 'true'); me.innerHTML = myAv(); pb.appendChild(me); }
      me.style.left = (fill.style.width || '0%');
    }
    hud(header);
    feedback();
  }
  function hud(header) {
    if (!header) return;
    var h = header.querySelector('.cmq-hud');
    if (!h) {
      h = d.createElement('div'); h.className = 'cmq-hud';
      var close = header.querySelector('.close-btn'); header.insertBefore(h, close || null);
    }
    var hearts = txt(d.getElementById('heart-count')), key = combo + '|' + hearts;
    if (h.getAttribute('data-k') === key) return;   // innerHTML-ийг харьцуулахгүй (SVG сериализаци өөр → давталт)
    h.setAttribute('data-k', key);
    h.innerHTML = (combo >= 2 ? '<span class="c" title="Дараалсан зөв хариулт">' + IC.flame + '×' + combo + '</span>' : '') +
      (hearts ? '<span class="h" title="Зүрх">' + IC.heart + hearts + '</span>' : '');
  }
  /* Хариу шалгасны дараа: combo, «AI багшаас асуух» */
  function feedback() {
    var fb = content.querySelector('#feedback'); if (!fb) return;
    var ok = fb.classList.contains('correct-fb'), bad = fb.classList.contains('wrong-fb'), n = lastN;
    if ((ok || bad) && !counted[n]) { counted[n] = 1; combo = ok ? combo + 1 : 0; hud(content.querySelector('.quiz-header')); }
    if (bad && !fb.querySelector('.cmq-ai') && typeof window.sendAppChat === 'function') {
      var b = d.createElement('button'); b.type = 'button'; b.className = 'cmq-ai'; b.innerHTML = IC.spark + 'AI багшаас асуух';
      b.addEventListener('click', askAI);
      fb.appendChild(b);
    }
  }
  function askAI() {
    var q = plain(content.querySelector('.question-text'));
    var mine = plain(content.querySelector('.option-btn.wrong')), right = plain(content.querySelector('.option-btn.correct'));
    var msg = 'Энэ бодлогыг ойлгоход тусална уу: ' + q + (mine ? ' Миний хариулт: ' + mine + '.' : '') + (right ? ' Зөв хариу: ' + right + '.' : '') +
      ' Яагаад ингэж гарахыг алхам алхмаар тайлбарлаж өгнө үү.';
    try { if (!window._appChatOpen && typeof window.toggleAppChat === 'function') window.toggleAppChat(); } catch (e) {}
    try { window.sendAppChat(msg); } catch (e) {}
  }

  function enhance() {
    if (!content || busy) return;
    busy = true;
    try {
      var isQ = !!content.querySelector('.question-text') && !!content.querySelector('#check-btn');
      var isR = !!content.querySelector('.results-card');
      var act = on();
      modal.classList.toggle('cmq', act);
      modal.classList.toggle('cmq-q', act && isQ);
      modal.classList.toggle('cmq-r', act && isR);
      if (act) {
        if (isQ) enhanceQ();
        cleanEmoji();
      }
    } catch (e) { try { console.warn('cm-quiz', e); } catch (x) {} }
    busy = false;
  }
  /* 1–9: сонголт, Enter: Шалгах/Дараагийнх — бичих талбар, товч дээр фокустай үед хөндөхгүй */
  function onKey(e) {
    if (!on() || !modal || !modal.classList.contains('open') || !modal.classList.contains('cmq-q')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || tag === 'math-field' || (t && t.isContentEditable)) return;
    if (/^[1-9]$/.test(e.key)) {
      var o = content.querySelector('#opt-' + (+e.key - 1));
      if (o && !o.disabled) { e.preventDefault(); o.click(); }
    } else if (e.key === 'Enter' && tag !== 'button' && tag !== 'a') {
      var c = content.querySelector('#check-btn');
      if (c && !c.disabled) { e.preventDefault(); c.click(); }
    }
  }
  function init() {
    modal = d.getElementById('quiz-modal'); content = d.getElementById('quiz-content');
    if (!modal || !content) return;
    new MutationObserver(function () { enhance(); }).observe(content, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    new MutationObserver(function () { enhance(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
    new MutationObserver(function () { enhance(); }).observe(H, { attributes: true, attributeFilter: ['class'] });
    d.addEventListener('keydown', onKey);
    enhance();
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', init); else init();
})();
