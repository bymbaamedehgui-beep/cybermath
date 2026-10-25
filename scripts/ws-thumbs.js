#!/usr/bin/env node
// Дасгалын төвийн картын жижиг зураг: assets/thumbs/<нэр>.webp + assets/thumbs/index.json ({ slug: hash }).
// ws-browse.js index.json-ийг уншиж картын .wbc-a4 дотор зургийг харуулна (зураггүй хуудсанд бүдүүвч хэвээр).
//   node scripts/ws-thumbs.js                 → зураггүй (шинэ) хуудсуудыг л нөхнө
//   node scripts/ws-thumbs.js --all           → бүгдийг дахин
//   node scripts/ws-thumbs.js a.html b.html   → заасан хуудсуудыг
// Шаардлага: puppeteer-core (суугаагүй бол: npm i --no-save puppeteer-core) + Edge/Chrome (CHROME_PATH).
// Хуудсыг ?qr=1 (сурагчийн горим — хариугүй, түгжээгүй) горимоор локал серверээс нээж #sheet-ийн дээд хэсгийг авна.
// /api/* хүсэлт бүр хоосон хариутай — prod руу юу ч явахгүй. KaTeX/фонт CDN-ээс ачаална.
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'thumbs');
const INDEX = path.join(OUT, 'index.json');
const W = 400;          // зургийн өргөн (px): картад ~200px → retina-д 2x
const RATIO = 0.62;     // өндөр / өргөн — хуудасны дээд хэсэг (гарчиг + эхний бодлогууд)
const CONC = 6;
const CHROME = process.env.CHROME_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

let puppeteer;
try { puppeteer = require('puppeteer-core'); } catch (e) { console.error('puppeteer-core олдсонгүй: npm i --no-save puppeteer-core'); process.exit(1); }

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
function serve() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = new URL(req.url, 'http://x');
      if (u.pathname.startsWith('/api/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end('{}'); }
      let p = decodeURIComponent(u.pathname);
      if (p === '/') p = '/index.html';
      if (!path.extname(p)) p += '.html';                 // /worksheets → worksheets.html
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      fs.readFile(f, (err, buf) => {
        if (err) { res.writeHead(404); return res.end(); }
        res.writeHead(200, { 'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' });
        res.end(buf);
      });
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv));
  });
}

const thumbName = (slug) => slug.replace(/\.html$/, '').replace(/[\\/]/g, '__') + '.webp';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function catalogSlugs(browser, base) {
  const p = await browser.newPage();
  await prep(p);
  await p.goto(base + '/worksheets.html', { waitUntil: 'load', timeout: 90000 });
  await p.waitForFunction(() => window.LIST && window.LIST.length > 0, { timeout: 30000 });
  const slugs = await p.evaluate(() => {
    const s = new Set();
    [window.LIST || [], window.CAMB || []].forEach((D) => D.forEach((g) => g[1].forEach((w) => s.add(w[0]))));
    return Array.from(s);
  });
  await p.close();
  return slugs;
}

// Локал сервер + хуудасны CDN (KaTeX/MathJax/фонт)-оос бусад хүсэлтийг хаана — analytics/prod API хүлээлгэхгүй
const ALLOW = /^https?:\/\/(127\.0\.0\.1[:/]|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)/;
async function prep(page) {
  await page.setViewport({ width: 1000, height: 1400 });
  await page.setRequestInterception(true);
  page.on('request', (req) => (ALLOW.test(req.url()) || req.url().startsWith('data:') ? req.continue() : req.respond({ status: 200, contentType: 'application/json', body: '{}' })));
}
async function shot(page, base, slug) {
  await page.goto(base + '/' + slug + '?qr=1', { waitUntil: 'load', timeout: 45000 });
  await page.waitForFunction(() => { const s = document.querySelector('#sheet'); return !s || s.children.length > 0; }, { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => Promise.race([   // MathJax-ийн promise заримдаа хэзээ ч дуусдаггүй — 5 секундээс илүү хүлээхгүй
    Promise.all([
      document.fonts ? document.fonts.ready : null,
      window.MathJax && MathJax.startup && MathJax.startup.promise ? MathJax.startup.promise : null,
    ]),
    new Promise((ok) => setTimeout(ok, 5000)),
  ]));
  await sleep(250);
  const box = await page.evaluate(async (ratio) => {
    let el = document.querySelector('#sheet') || document.querySelector('.sheet, .page, .paper, main');
    if (!el) {   // тусгай загвар: хэрэгслийн мөрийн (.bar) дараах хамгийн том элемент
      const kids = Array.from(document.body.children).filter((k) => !k.matches('.bar, script, style') && k.getBoundingClientRect().height > 200);
      el = kids[0] || document.body;
    }
    const r = el.getBoundingClientRect(), h = Math.min(r.height, r.width * ratio);
    // CyberMath тамга — ажлын хуудсан дээрхтэй ижил загвар (ws-store.js mkWm), гэхдээ хуудасны голд биш ЗУРГИЙН голд,
    // жижиг зурагт бүдгэрдэг тул ~2 дахин тод. Хуудсын өөрийн тамгыг нуух (устгавал watchSheet дахин нэмнэ);
    // #sheet-гүй тусгай хуудсанд ч ижил тамга гарна.
    el.querySelectorAll('.cm-wm').forEach((n) => { n.style.display = 'none'; });
    const wm = document.createElement('div');
    wm.style.cssText = 'position:absolute;left:50%;top:' + Math.round(h / 2) + 'px;z-index:5;pointer-events:none;text-align:center;width:max-content;transform:translate(-50%,-50%) rotate(-9deg)';
    wm.innerHTML = '<img src="/assets/cybermath-mascot.svg" alt="" style="display:block;margin:0 auto;width:250px;opacity:.18">'
      + '<div style="font:900 136px/1 \'Segoe UI\',Arial,sans-serif;letter-spacing:1px;color:rgba(123,82,238,.16);white-space:nowrap">cybermath</div>'
      + '<div style="font:800 32px/1 \'Segoe UI\',Arial,sans-serif;letter-spacing:1px;color:rgba(123,82,238,.18);margin-top:8px;white-space:nowrap">cyber-math.com</div>';
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(wm);
    const img = wm.querySelector('img');
    if (img && !img.complete) await new Promise((ok) => { img.onload = img.onerror = ok; setTimeout(ok, 3000); });
    return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: h };
  }, RATIO);
  if (!box || box.w < 200 || box.h < 60) throw new Error('хуудасны хэсэг олдсонгүй');
  return page.screenshot({ type: 'webp', quality: 72, clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: W / box.w } });
}

(async () => {
  const args = process.argv.slice(2);
  const all = args.includes('--all');
  const only = args.filter((a) => !a.startsWith('--'));
  fs.mkdirSync(OUT, { recursive: true });
  let index = {};
  try { index = JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch (e) {}

  const srv = await serve();
  const base = 'http://127.0.0.1:' + srv.address().port;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--hide-scrollbars'] });
  try {
    const slugs = await catalogSlugs(browser, base);
    if (slugs.length < 100) throw new Error('каталог дутуу ачаалагдлаа (' + slugs.length + ')');
    const exists = slugs.filter((s) => fs.existsSync(path.join(ROOT, s)));
    const todo = only.length ? exists.filter((s) => only.includes(s))
      : exists.filter((s) => all || !index[s] || !fs.existsSync(path.join(OUT, thumbName(s))));
    console.log('каталог ' + slugs.length + ', файлтай ' + exists.length + ', зураг авах ' + todo.length);

    let done = 0, failed = [];
    const queue = todo.slice();
    const limit = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error('timeout')), ms))]);
    async function worker() {
      let page = await browser.newPage();
      await prep(page);
      for (;;) {
        const slug = queue.shift(); if (!slug) break;
        try {
          const buf = await limit(shot(page, base, slug), +process.env.THUMB_TIMEOUT || 40000);   // нэг хуудас гацвал бусдыг нь зогсоохгүй
          fs.writeFileSync(path.join(OUT, thumbName(slug)), buf);
          index[slug] = crypto.createHash('md5').update(buf).digest('hex').slice(0, 8);
          if (done % 25 === 0) fs.writeFileSync(INDEX, JSON.stringify(index));   // явцын дундуур зогсвол дахин эхлэхэд үргэлжилнэ
        } catch (e) {
          failed.push(slug + ': ' + (e.message || e).toString().slice(0, 80));
          try { await page.close(); } catch (e2) {}
          page = await browser.newPage(); await prep(page);
        }
        if (++done % 50 === 0) console.log('  ' + done + '/' + todo.length);
      }
      await page.close();
    }
    await Promise.all(Array.from({ length: Math.min(CONC, todo.length || 1) }, worker));

    // Каталогт байхгүй болсон хуудсын бичлэгийг индексээс хасна (файл нь үлдэж болно)
    const keep = new Set(exists), out = {};
    Object.keys(index).sort().forEach((k) => { if (keep.has(k) && fs.existsSync(path.join(OUT, thumbName(k)))) out[k] = index[k]; });
    fs.writeFileSync(INDEX, JSON.stringify(out));
    console.log('бэлэн: ' + (done - failed.length) + ' зураг, индекс ' + Object.keys(out).length + (failed.length ? ', алдаа ' + failed.length : ''));
    failed.slice(0, 20).forEach((f) => console.log('  ✗ ' + f));
  } finally {
    await browser.close();
    srv.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
