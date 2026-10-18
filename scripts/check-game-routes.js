#!/usr/bin/env node
// Деплойн өмнөх статик шалгалт — тоглоомын сервер gate (gate/game.js) ба vercel.json.
//   node scripts/check-game-routes.js [vercel.json-ийн зам]     → OK (exit 0) | алдааны жагсаалт (exit 1)
// Шалгах зүйлс:
//   1) gate/game.js нь @vercel/node build, includeFiles нь хамгаалсан бүх файлыг хамарна
//   2) хамгаалсан файл (games/**, math-mortal/index.html, math-mortal/*.js|*.css) АЛЬ Ч @vercel/static build-д ороогүй
//   3) нийтийн зам бүрийн ЭХНИЙ таарах маршрут нь gate (зөв g/f) — catch-all/статик маршрутаас ӨМНӨ
//   4) math-mortal/assets/** ба cover.webp статикаар үйлчлэгдэнэ; /mortal, /math-mortal → /math-mortal/ руу redirect
//   5) GM.GAMES-ийн path-тай тоглоом бүр gate-д бүртгэлтэй, каноник зам нь таарна
//   6) ямар ч маршрут /games/... эсвэл /gate/... руу (gate-ээс бусад) шууд чиглүүлэхгүй
//   7) сайтын хуудсууд (root-ийн *.html, *.js) доторх тоглоомын холбоос (iframe src, location.href, CSS url —
//      index.html, play.html, team.html, xp.html …) нийтийн замаараа gate эсвэл статик руу шийдэгдэнэ;
//      /games/… бодит зам руу холбоогүй (нийтэд 404). CLI нь index.html-ээс бусад хэрэглэгч хуудсыг мэдээлнэ —
//      gate түгжээтэй үед (GAME_PAYWALL_REALMS-д 'cm') эдгээр нь launch тасалбаргүй бол түгжээтэй хуудас харуулна.
//   8) деплойн бэлэн байдал, realm бүрээр: launch UI бэлэн ⇔ api/_games.js DEFAULT_PAYWALL_REALMS-д орсон.
//        ws — worksheets.html (эсвэл түүний <script src="/x.js"> локал скрипт, ж: /games-host.js) /api/games?action=launch дууддаг;
//        cm — index.html (Дасгалын төвийн embed блок <script id="gp-embed"> тооцогдохгүй) ба тоглоомыг шууд ачаалдаг
//             бусад хуудас бүр (play/team/xp.html) launch дууддаг.
//      UI-гүйгээр анхдагчаар төлбөртэй бол GAME_PAYWALL_REALMS тавиагүй деплойд тэр сайтын тоглоом түгжигдэнэ (cm бол gate
//      бүх файл тоглоомыг — эрхтэй/Premium ч тоглож чадахгүй); UI бэлэн атал анхдагчид ороогүй бол тэнд бүх тоглоом үнэгүй.
//      CLI нь энэ shell-ийн GAME_PAYWALL_REALMS-ийг ч шалгана: UI бэлэн биш realm (одоо 'cm') орсон бол алдаа.
// Vercel legacy routes: эхний таарсан маршрут (continue-гүй) шийднэ; src нь ^…$-аар бэхлэгдэнэ.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GATE_SRC = 'gate/game.js';
const GATE_DEST = '/gate/game.js';

// Vercel builds/includeFiles glob → RegExp ('**' → дурын, '*' → '/'-гүй, '?' → нэг тэмдэгт)
function globToRe(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const ch = glob[i];
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        i++;
        if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
      } else re += '[^/]*';
    } else if (ch === '?') re += '[^/]';
    else re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function globMatch(glob, rel) { return globToRe(String(glob).replace(/^\.?\//, '')).test(rel); }

function routeRe(src) {
  let s = String(src);
  if (s[0] !== '^') s = '^' + s;
  if (s[s.length - 1] !== '$' || s[s.length - 2] === '\\') s = s + '$';
  return new RegExp(s);
}
// pathname → { index, route, m } | null (эхний таарсан, handle/continue-ийг алгасна)
function firstRoute(routes, pathname) {
  for (let i = 0; i < routes.length; i++) {
    const r = routes[i];
    if (!r || r.handle || r.continue || typeof r.src !== 'string') continue;
    const m = routeRe(r.src).exec(pathname);
    if (m) return { index: i, route: r, m: m };
  }
  return null;
}
// dest-ийн $n-ийг орлуулж { path, query } болгоно; redirect бол { redirect, status }
function resolveRoute(hit) {
  const r = hit.route;
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers && (r.headers.Location || r.headers.location);
    return { redirect: loc || null, status: r.status };
  }
  if (typeof r.dest !== 'string') return { path: null, query: {} };
  const d = r.dest.replace(/\$(\d+)/g, function (_, n) { return hit.m[Number(n)] || ''; });
  const i = d.indexOf('?');
  const query = {};
  if (i >= 0) new URLSearchParams(d.slice(i + 1)).forEach(function (v, k) { query[k] = v; });
  return { path: i >= 0 ? d.slice(0, i) : d, query: query };
}

function listFiles(dir, rel) {
  const out = [];
  let ents = [];
  try { ents = fs.readdirSync(path.join(dir, rel), { withFileTypes: true }); } catch (e) { return out; }
  ents.forEach(function (e) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) out.push.apply(out, listFiles(dir, r)); else out.push(r);
  });
  return out;
}

// ───────────── 7) сайтын хуудсууд дахь тоглоомын холбоос ─────────────
// Мөрийн/url() доторх: [./|/][games/]<нэр>.html, [./|/]math-mortal/…, /sbh, /mortal, /math-mortal
function refRe(gate) {
  const names = [];
  Object.keys(gate.FILES).forEach(function (g) {
    const F = gate.FILES[g];
    if (F.file) names.push(path.basename(F.file, '.html').replace(/[^A-Za-z0-9_-]/g, ''));
  });
  return new RegExp('([\'"`(])((?:\\.?/)?(?:games/)?(?:' + names.join('|') + ')\\.html|(?:\\.?/)?math-mortal/[A-Za-z0-9._/-]*' +
    '|/(?:sbh|mortal|math-mortal))(?=[?#\'"`)])', 'g');
}
// root-ийн нийтлэгдэх хуудсууд (_tmp_* г.м. '_'-аар эхэлсэн, .bak алгасна)
function rootPages(root) {
  let names = [];
  try { names = fs.readdirSync(root); } catch (e) { return []; }
  return names.filter(function (n) { return /^[^_.][^/]*\.(html|js)$/i.test(n); }).sort().map(function (n) {
    return { file: n, text: function () { return fs.readFileSync(path.join(root, n), 'utf8'); } };
  });
}
// pages: [{ file, text: string | () => string }] → [{ file, line, ref, pub }]
// root-ийн хуудсууд бүгд нэг түвшний нийтийн замаар (/, /play, /xp …) үйлчилдэг тул харьцангуй зам '/'-ээс шийдэгдэнэ.
function consumers(gate, pages) {
  const re = refRe(gate);
  const out = [];
  (pages || []).forEach(function (p) {
    const s = typeof p.text === 'function' ? p.text() : String(p.text || '');
    re.lastIndex = 0;
    let m, line = 1, at = 0;
    while ((m = re.exec(s))) {
      for (let i = at; i < m.index; i++) if (s.charCodeAt(i) === 10) line++;
      at = m.index;
      const ref = m[2];
      const pub = ref[0] === '/' ? ref : '/' + ref.replace(/^\.\//, '');
      out.push({ file: p.file, line: line, ref: ref, pub: pub });
    }
  });
  return out;
}
// Нийтийн зам → алдааны тайлбар | null (redirect-ийг 3 хүртэл дагана)
function consumerProblem(pub, ctx) {
  if (pub.indexOf('/games/') === 0) return 'хамгаалсан файлын бодит зам (нийтэд 404) — нийтийн замыг (/sudoku.html г.м.) ашиглана';
  let p = pub;
  for (let hop = 0; hop < 3; hop++) {
    const hit = firstRoute(ctx.routes, p);
    let dest = p, query = {};
    if (hit) {
      const r = resolveRoute(hit);
      if (r.redirect) { p = r.redirect; continue; }
      dest = r.path; query = r.query;
    }
    if (dest === GATE_DEST) {
      const F = Object.prototype.hasOwnProperty.call(ctx.gate.FILES, query.g) ? ctx.gate.FILES[query.g] : null;
      if (!F) return 'gate g="' + query.g + '" бүртгэлгүй';
      if (F.dir && query.f && query.f !== F.index && !fs.existsSync(path.join(ctx.root, F.dir, query.f))) return F.dir + '/' + query.f + ' файл алга';
      return null;
    }
    const rel = String(dest || '').replace(/^\//, '');
    if (rel && fs.existsSync(path.join(ctx.root, rel)) && fs.statSync(path.join(ctx.root, rel)).isFile() &&
        ctx.staticBuilds.some(function (b) { return globMatch(b.src, rel); })) return null;
    return (hit ? 'маршрут #' + hit.index + ' → ' + dest : 'маршрутгүй') + ' — нийтэд 404 болно';
  }
  return 'redirect давталт';
}

// ───────────── 8) launch UI бэлэн байдал ↔ төлбөртэй realm-ууд ─────────────
// Тоглоом эхлүүлэх хост хуудсууд: cyber-math.com (index.html) ба Дасгалын төв (worksheets.html) — 16 тоглоом хоёуланд.
const LAUNCH_HOSTS = Object.freeze(['index.html', 'worksheets.html']);
// realm → хост хуудас. Gate-ийн тоглоомыг шууд URL-аар ачаалдаг бусад хуудас (play/team/xp.html) нь cm-д хамаарна:
// gate зөвхөн 'cm' төлбөртэй үед түгжинэ (api/_games.js gateOn).
const REALM_HOSTS = Object.freeze({ ws: Object.freeze(['worksheets.html']), cm: Object.freeze(['index.html']) });
const REALM_NAMES = Object.freeze({ ws: 'Дасгалын төв', cm: 'cyber-math.com' });
// Хуудас тоглоомыг launch-аар (тасалбартай url) нээдэг эсэх: /api/games endpoint + 'launch' action хоёулаа байна.
function hasLaunch(text) {
  const s = String(text == null ? '' : text);
  return /\/api\/games\b/.test(s) && /action=launch\b|['"`]launch['"`]/.test(s);
}
// Нийтийн зам → gate-ийн g (redirect-ийг 3 хүртэл дагана) | null (статик/маршрутгүй)
function gateOf(pub, ctx) {
  let p = pub;
  for (let hop = 0; hop < 3; hop++) {
    const hit = firstRoute(ctx.routes, p);
    if (!hit) return null;
    const r = resolveRoute(hit);
    if (r.redirect) { p = r.redirect; continue; }
    return r.path === GATE_DEST && r.query.g ? r.query.g : null;
  }
  return null;
}
function textOf(p) { return !p ? '' : (typeof p.text === 'function' ? p.text() : String(p.text || '')); }
// Хуудасны ачаалдаг root-ийн локал скриптүүд (<script src="/games-host.js"> г.м.) — launch дуудлага тэнд байж болно.
// root өгөөгүй (тестийн хуурамч хуудас) бол хоосон.
function localScriptsText(text, root) {
  if (!root) return '';
  const out = [];
  const re = /<script\b[^>]*\bsrc=["']\/?([A-Za-z0-9][A-Za-z0-9._-]*\.js)["']/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    try { out.push(fs.readFileSync(path.join(root, m[1]), 'utf8')); } catch (e) { /* файл алга — тооцохгүй */ }
  }
  return out.join('\n');
}
// index.html-ийн Дасгалын төвийн embed блок (<script id="gp-embed"> — зөвхөн realm 'ws'-ийн launch) нь cyber-math.com-ийн
// өөрийн тоглоомын UI биш: түүнийг тооцвол cm UI (gp-s5) байхгүй ч index.html «бэлэн» гэж андуурагдана.
const EMBED_BLOCK_RE = /<script\b[^>]*\bid=["']gp-embed["'][^>]*>[\s\S]*?<\/script>/gi;
function withoutEmbed(text) { return String(text == null ? '' : text).replace(EMBED_BLOCK_RE, ''); }
// Хуудас (эсвэл түүний ачаалдаг локал скрипт) launch ашигладаг эсэх (embed блокийг тооцохгүй)
function pageHasLaunch(p, root) {
  const t = withoutEmbed(textOf(p));
  return hasLaunch(t) || hasLaunch(localScriptsText(t, root));
}
// pages: [{ file, text }], cons: consumers(gate, pages) (өгөөгүй бол тооцно), ctx: { routes, gate, root? }
// → { ready, missing: [{ file, why, realm }], realms: { ws: { ready, missing }, cm: { ready, missing } } }
//   ws — worksheets.html launch ашигладаг үед бэлэн.
//   cm — index.html (embed блокгүйгээр) launch ашигладаг, мөн gate-ийн тоглоомыг шууд ачаалдаг бусад хуудас бүр launch
//        ашигладаг үед бэлэн. ready = хоёулаа бэлэн. ctx.root өгвөл хуудасны <script src="/x.js"> локал скриптийг ч уншина.
function launchReadiness(pages, cons, ctx) {
  const byFile = new Map();
  (pages || []).forEach(function (p) { byFile.set(p.file, p); });
  const missing = [];
  LAUNCH_HOSTS.forEach(function (f) {
    const realm = REALM_HOSTS.ws.indexOf(f) >= 0 ? 'ws' : 'cm';
    if (!byFile.has(f)) missing.push({ file: f, why: 'хуудас алга', realm: realm });
    else if (!pageHasLaunch(byFile.get(f), ctx && ctx.root)) missing.push({ file: f, why: '/api/games?action=launch дуудлага алга', realm: realm });
  });
  const direct = {};
  (cons || consumers(ctx.gate, pages)).forEach(function (c) {
    if (LAUNCH_HOSTS.indexOf(c.file) >= 0 || !gateOf(c.pub, ctx)) return;
    (direct[c.file] = direct[c.file] || []).push(c.pub + ' (:' + c.line + ')');
  });
  Object.keys(direct).sort().forEach(function (f) {
    if (!pageHasLaunch(byFile.get(f), ctx && ctx.root)) missing.push({ file: f, why: 'тоглоомыг шууд ачаалдаг (' + direct[f].join(', ') + '), launch алга', realm: 'cm' });
  });
  const realms = {};
  Object.keys(REALM_HOSTS).forEach(function (r) {
    const m = missing.filter(function (x) { return x.realm === r; });
    realms[r] = { ready: m.length === 0, missing: m };
  });
  return { ready: missing.length === 0, missing: missing, realms: realms };
}

// → { ok, errors: [], checked: n, consumers: [{ file, line, ref, pub }], readiness: { ready, missing } | null }
// opts: { root, gate, games, pages, readiness } — pages өгвөл root-ийн хуудсыг уншихын оронд түүнийг шалгана (тест);
//       тэр үед (8) зөвхөн readiness=true бол ажиллана.
function check(vercel, opts) {
  opts = opts || {};
  const root = opts.root || ROOT;
  const gate = opts.gate || require(path.join(root, 'gate', 'game.js'));
  const GM = opts.games || require(path.join(root, 'api', '_games.js'));
  const errors = [];
  let checked = 0;
  const err = function (s) { errors.push(s); };
  const builds = Array.isArray(vercel && vercel.builds) ? vercel.builds : [];
  const routes = Array.isArray(vercel && vercel.routes) ? vercel.routes : [];

  // хамгаалсан файлууд (диск дээрх бодит жагсаалт)
  const SUB = gate.SUB_FILE_RE;
  const prot = [];
  Object.keys(gate.FILES).forEach(function (g) {
    const F = gate.FILES[g];
    if (F.file) {
      if (!fs.existsSync(path.join(root, F.file))) err('файл алга: ' + F.file + ' (' + g + ')');
      prot.push({ g: g, rel: F.file, f: null });
      if (fs.existsSync(path.join(root, path.basename(F.file)))) err('root-д хуулбар үлдсэн (статикаар нийтлэгдэнэ): ' + path.basename(F.file));
    } else {
      const idx = F.dir + '/' + F.index;
      if (!fs.existsSync(path.join(root, idx))) err('файл алга: ' + idx);
      prot.push({ g: g, rel: idx, f: 'index.html' });
      let n = 0;
      (fs.existsSync(path.join(root, F.dir)) ? fs.readdirSync(path.join(root, F.dir)) : []).forEach(function (name) {
        if (SUB.test(name)) { prot.push({ g: g, rel: F.dir + '/' + name, f: name }); n++; }
        else if (/\.(js|mjs|css|html?)$/i.test(name) && name !== F.index) err(F.dir + '/' + name + ' — gate-ийн нэрийн дүрэмд таарахгүй (хамгаалагдахгүй)');
      });
      if (!n) err(F.dir + ': js/css файл олдсонгүй');
    }
  });
  listFiles(root, 'games').forEach(function (rel) {
    if (!prot.some(function (p) { return p.rel === rel; })) err('games/ доторх бүртгэлгүй файл (gate өгөхгүй): ' + rel);
  });

  // 1) gate build + includeFiles
  const gb = builds.filter(function (b) { return b && b.src === GATE_SRC; });
  if (gb.length !== 1) err('builds: "' + GATE_SRC + '" яг нэг удаа байх ёстой (' + gb.length + ')');
  const gbuild = gb[0] || {};
  if (gbuild.use !== '@vercel/node') err('builds: ' + GATE_SRC + ' нь @vercel/node биш');
  const inc = (gbuild.config && Array.isArray(gbuild.config.includeFiles)) ? gbuild.config.includeFiles : [];
  if (!inc.length) err('builds: ' + GATE_SRC + ' config.includeFiles хоосон');
  prot.forEach(function (p) {
    checked++;
    if (!inc.some(function (gl) { return globMatch(gl, p.rel); })) err('includeFiles хамрахгүй: ' + p.rel);
  });

  // 2) хамгаалсан файл статик build-д ОРОХГҮЙ (gate-ээс бусад ямар ч build-д)
  builds.forEach(function (b) {
    if (!b || b.src === GATE_SRC || typeof b.src !== 'string') return;
    prot.forEach(function (p) {
      if (globMatch(b.src, p.rel)) err('build "' + b.src + '" (' + b.use + ') хамгаалсан файлыг нийтэлнэ: ' + p.rel);
    });
  });

  // 3) нийтийн зам → эхний маршрут нь gate
  function expectGate(pub, g, f) {
    checked++;
    const hit = firstRoute(routes, pub);
    if (!hit) { err(pub + ': маршрут алга (gate руу орохгүй)'); return; }
    const r = resolveRoute(hit);
    if (r.path !== GATE_DEST) { err(pub + ': эхний маршрут #' + hit.index + ' "' + hit.route.src + '" → ' + (r.path || r.redirect) + ' (gate биш)'); return; }
    if (r.query.g !== g) err(pub + ': g="' + r.query.g + '" (хүлээсэн ' + g + ')');
    if ((r.query.f || null) !== (f || null)) err(pub + ': f="' + r.query.f + '" (хүлээсэн ' + f + ')');
  }
  prot.forEach(function (p) {
    const F = gate.FILES[p.g];
    if (F.file) F.paths.forEach(function (pub) { expectGate(pub, p.g, null); });
    else if (p.f === 'index.html') F.paths.forEach(function (pub) { expectGate(pub, p.g, 'index.html'); });
    else expectGate('/' + F.dir + '/' + p.f, p.g, p.f);
  });
  // Хамгаалсан файлын бодит (games/…) зам нийтэд хүрэхгүй
  ['/games/', '/gate/'].forEach(function (pre) {
    routes.forEach(function (r, i) {
      if (r && typeof r.dest === 'string' && r.dest.indexOf(pre) === 0 && r.dest.indexOf(GATE_DEST) !== 0) err('маршрут #' + i + ' "' + r.src + '" → ' + r.dest + ' (gate-ийг тойрно)');
    });
  });
  prot.forEach(function (p) {
    if (p.rel.indexOf('games/') !== 0) return;
    checked++;
    const hit = firstRoute(routes, '/' + p.rel);
    if (hit) { const r = resolveRoute(hit); if (r.path && r.path !== GATE_DEST) err('/' + p.rel + ': маршрут #' + hit.index + ' → ' + r.path); }
  });

  // 4) статик хэвээр үлдэх: math-mortal/assets/**, cover.webp
  const staticBuilds = builds.filter(function (b) { return b && b.use === '@vercel/static' && typeof b.src === 'string'; });
  const assets = listFiles(root, 'math-mortal/assets');   // 'math-mortal/assets/…' хэлбэрээр
  ['math-mortal/cover.webp'].concat(assets.slice(0, 1)).forEach(function (rel) {
    checked++;
    if (!fs.existsSync(path.join(root, rel))) { err('статик файл алга: ' + rel); return; }
    if (!staticBuilds.some(function (b) { return globMatch(b.src, rel); })) err('статик build-д ороогүй: ' + rel);
    const hit = firstRoute(routes, '/' + rel);
    if (hit) {
      const r = resolveRoute(hit);
      if (r.path !== '/' + rel) err('/' + rel + ': маршрут #' + hit.index + ' → ' + (r.path || r.redirect) + ' (статик биш)');
    }
  });
  ['/mortal', '/math-mortal'].forEach(function (pub) {
    checked++;
    const hit = firstRoute(routes, pub);
    const r = hit && resolveRoute(hit);
    if (!r || r.redirect !== '/math-mortal/') err(pub + ': /math-mortal/ руу redirect биш (харьцангуй ./main.js эвдэрнэ)');
  });

  // 5) серверийн каталог ↔ gate
  Object.keys(GM.GAMES).forEach(function (k) {
    const G = GM.GAMES[k];
    if (G.kind === 'file' || G.path) {
      checked++;
      const F = gate.FILES[k];
      if (!F) { err('GAMES.' + k + ' (' + G.kind + ', ' + G.path + ') gate/game.js FILES-д алга'); return; }
      if (F.paths[0] !== G.path) err('GAMES.' + k + '.path=' + G.path + ' ≠ gate каноник ' + F.paths[0]);
    }
  });
  Object.keys(gate.FILES).forEach(function (k) { if (!GM.GAMES[k]) err('gate FILES.' + k + ' каталогт алга'); });

  // 7) сайтын хуудсууд дахь тоглоомын холбоос — нийтийн зам хэвээр gate/статик руу шийдэгдэнэ
  // хуудас бүрийг НЭГ л удаа уншина (7 ба 8 хуваалцана; index.html ~10МБ)
  const pages = (opts.pages || rootPages(root)).map(function (p) { return { file: p.file, text: textOf(p) }; });
  const cons = consumers(gate, pages);
  const ctx = { routes: routes, gate: gate, root: root, staticBuilds: staticBuilds };
  cons.forEach(function (c) {
    checked++;
    const why = consumerProblem(c.pub, ctx);
    if (why) err(c.file + ':' + c.line + ' "' + c.ref + '" → ' + why);
  });
  if (!opts.pages && !cons.some(function (c) { return c.file === 'index.html'; })) {
    err('index.html-ээс тоглоомын холбоос олдсонгүй (холбоос хайгч эвдэрсэн эсвэл index.html өөрчлөгдсөн)');
  }

  // 8) realm бүр: launch UI бэлэн ⇔ анхдагчаар төлбөртэй (api/_games.js DEFAULT_PAYWALL_REALMS) — бодит root хуудсууд;
  //    opts.pages-тэй үед opts.readiness=true бол. opts.env өгвөл (CLI: process.env) тэр орчны GAME_PAYWALL_REALMS-д
  //    орсон realm бүрийн UI бэлэн байх ёстой (ж: cm UI нэгтгэгдээгүй байхад GAME_PAYWALL_REALMS=ws,cm → алдаа).
  let readiness = null;
  if (!opts.pages || opts.readiness) {
    checked++;
    readiness = launchReadiness(pages, cons, ctx);
    const def = GM.DEFAULT_PAYWALL_REALMS;
    const missOf = function (r) { return readiness.realms[r].missing.map(function (m) { return m.file + ' — ' + m.why; }).join('; '); };
    if (!Array.isArray(def) || def.some(function (r) { return !REALM_HOSTS[r]; })) {
      err('api/_games.js DEFAULT_PAYWALL_REALMS (["ws"] г.м.) экспортлогдоогүй эсвэл буруу');
    } else {
      Object.keys(REALM_HOSTS).forEach(function (r) {
        const on = def.indexOf(r) >= 0, rr = readiness.realms[r];
        if (on && !rr.ready) {
          err(REALM_NAMES[r] + ' (realm ' + r + ') анхдагчаар төлбөртэй (api/_games.js DEFAULT_PAYWALL_REALMS) боловч launch UI бэлэн биш — ' +
            (r === 'cm' ? 'gate бүх файл тоглоомыг түгжиж, эрхтэй/Premium хэрэглэгч ч тоглож чадахгүй: '
                        : 'худалдан авах/тоглох зам байхгүй: ') + missOf(r));
        } else if (!on && rr.ready) {
          err(REALM_NAMES[r] + ' (realm ' + r + ') launch UI бэлэн (' + REALM_HOSTS[r].join(', ') + ') — api/_games.js ' +
            "DEFAULT_PAYWALL_REALMS-д '" + r + "' нэмнэ үү (эс бөгөөс GAME_PAYWALL_REALMS тавиагүй деплойд тэнд тоглоом үнэгүй)");
        }
      });
    }
    if (opts.env) {
      const raw = String(opts.env.GAME_PAYWALL_REALMS || '').trim();
      if (raw && typeof GM.parseRealms === 'function' && !GM.parseRealms(raw)) {
        err('GAME_PAYWALL_REALMS="' + raw.slice(0, 40) + '" буруу (зөвшөөрөгдөх: ws, cm — таслалаар) — анхдагч руу буцна');
      }
      const eff = typeof GM.paywallRealms === 'function' ? GM.paywallRealms(opts.env) : [];
      eff.forEach(function (r) {
        if (REALM_HOSTS[r] && !readiness.realms[r].ready) {
          err('Энэ орчны GAME_PAYWALL_REALMS-д ' + REALM_NAMES[r] + " ('" + r + "') төлбөртэй боловч launch UI бэлэн биш — " +
            (r === 'cm' ? 'cyber-math.com-ийн тоглоом, play/team/xp.html, шууд URL түгжигдэнэ: ' : '') + missOf(r) +
            (r === 'cm' ? ". GAME_PAYWALL_REALMS-аас 'cm'-ийг хас (cm UI нэгтгэгдэх хүртэл)" : ''));
        }
      });
      readiness.env = eff;
    }
  }

  return { ok: errors.length === 0, errors: errors, checked: checked, consumers: cons, readiness: readiness };
}

module.exports = { check, globToRe, globMatch, routeRe, firstRoute, resolveRoute, consumers, consumerProblem, refRe,
  LAUNCH_HOSTS, REALM_HOSTS, hasLaunch, gateOf, launchReadiness, localScriptsText, pageHasLaunch, withoutEmbed };

if (require.main === module) {
  const file = path.resolve(process.argv[2] || path.join(ROOT, 'vercel.json'));
  let v;
  try { v = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { console.error('vercel.json уншигдсангүй: ' + e.message); process.exit(1); }
  const r = check(v, { env: process.env });
  if (!r.ok) {
    console.error('АЛДАА (' + r.errors.length + '):');
    r.errors.forEach(function (s) { console.error('  - ' + s); });
    process.exit(1);
  }
  console.log('OK — тоглоомын gate маршрут/build шалгалт (' + r.checked + ' шалгалт)');
  const GM = require(path.join(ROOT, 'api', '_games.js'));
  if (r.readiness) {
    const def = GM.DEFAULT_PAYWALL_REALMS;
    Object.keys(REALM_HOSTS).forEach(function (k) {
      const rr = r.readiness.realms[k];
      console.log((def.indexOf(k) >= 0 ? 'Төлбөртэй' : 'Үнэгүй   ') + ' (анхдагч) — ' + REALM_NAMES[k] + ' (realm ' + k + '): launch UI ' +
        (rr.ready ? 'бэлэн' : 'бэлэн биш'));
      rr.missing.forEach(function (m) { console.log('    - ' + m.file + ': ' + m.why); });
    });
    console.log('  Gate (/sudoku.html г.м. шууд URL): ' + (def.indexOf('cm') >= 0 ? 'түгжээтэй' : 'нээлттэй (cyber-math.com хуучин шигээ)') +
      ' — GAME_PAYWALL_REALMS тавиагүй деплойд.');
    console.log('  Энэ shell: GAME_PAYWALL_REALMS=' + JSON.stringify(process.env.GAME_PAYWALL_REALMS || '') +
      ' → төлбөртэй: [' + GM.paywallRealms().join(', ') + '], gate ' + (GM.gateOn() ? 'түгжээтэй' : 'нээлттэй'));
    console.log('  Деплойн дараа: node scripts/verify-game-gate.js --base <url>' + (def.indexOf('cm') >= 0 ? '' : ' --expect off') +
      '   (cm-ийг Vercel-д GAME_PAYWALL_REALMS-аар асаасан бол --expect-гүй)');
    console.log('  Яаралтай үед: Instant Rollback / git revert БИШ — Vercel env GAME_PAYWALL=off (+ redeploy). Тоглоомын төлбөргүй' +
      ' хуучин хувилбар (settlePay-д plan=\'game\' салбаргүй) төлсөн атлаа олгогдоогүй тоглоомын нэхэмжлэхийг cyber-math.com' +
      ' Premium болгож олгоно (api/qpay.js settlePay-ийн тайлбар).');
  }
}
