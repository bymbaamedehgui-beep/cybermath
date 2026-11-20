// ЭЕШ математикийн эх хувилбаруудыг (eesh-YYYY.html) eyeshcheck «ЭЕШ сан»-д импортлох JSON болгоно:
// [{ subject, year, variant, title, exam:{ sec1Count, sec1Key, sec1Scores, topics, useSec2, sec2Config }, material }]
// material — eyesh-link.js-ийн хэвлэх/онлайн материал (gzip+base64), exam — api/_eyesh.js normExam-ийн гаралт.
// Хэрэглээ: node scripts/eesh-bank-export.js <гаралт.json> [он …]   (Edge + puppeteer-core: scripts/vid/node_modules)
// eyeshcheck → Admin → «ЭЕШ сан» → «JSON сонгох».
const http = require('http'), fs = require('fs'), path = require('path'), Module = require('module');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2];
const YEARS = process.argv.slice(3).map(Number).filter(Boolean);
if (!OUT) { console.error('Хэрэглээ: node scripts/eesh-bank-export.js <гаралт.json> [2022 2023 2024 2025]'); process.exit(1); }
const years = YEARS.length ? YEARS : [2022, 2023, 2024, 2025];
const PUP = ['scripts/vid/node_modules/puppeteer-core', '../cybermath-backend/scripts/vid/node_modules/puppeteer-core'].map(p => path.resolve(ROOT, p)).find(p => fs.existsSync(p));
const puppeteer = require(PUP);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));

// api/_eyesh.js-ийг өгөгдлийн сангүйгээр (normExam цэвэр функц)
const realLoad = Module._load;
Module._load = function (req, parent, ...rest) { if (/[\\/]_db(\.js)?$/.test(req) || req === './_db') return {}; return realLoad.call(this, req, parent, ...rest); };
const EY = require(path.join(ROOT, 'api', '_eyesh.js'));
Module._load = realLoad;

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (u.startsWith('/api/')) { res.writeHead(401, { 'content-type': 'application/json' }); return res.end('{}'); }
  const f = path.join(ROOT, u === '/' ? 'index.html' : u);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(8794, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: EDGE, headless: 'new', args: ['--edge-skip-compat-layer-relaunch', '--no-first-run'] });
  const items = [];
  for (const year of years) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 1600 });
    await page.goto(`http://127.0.0.1:8794/eesh-${year}.html`, { waitUntil: 'networkidle0', timeout: 60000 });
    await page.waitForFunction(() => window.EYESH && typeof window.build === 'function' && document.querySelector('#sheet .katex'), { timeout: 60000 });
    const r = await page.evaluate(async () => {
      const E = window.EYESH;
      window.build('orig');   // эх даалгавар (хуудас санасан/санамсаргүй хувилбараар нээгдэж болно)
      await new Promise(res => setTimeout(res, 400));
      E._set({ n: 1, sel1: 'cur', sel2: 'cur' });
      const ex = E.buildExam();
      const mat = await E._material();
      return { ex, mat, both: E.both };
    });
    await page.close();
    if (!r.ex || !r.mat) { console.error(`${year}: шалгалт/материал гарсангүй`, !!r.ex, !!r.mat); continue; }
    if (r.ex.p1.v !== 'orig' || (r.ex.p2 && r.ex.p2.v !== 'orig')) { console.error(`${year}: эх хувилбар биш (${r.ex.p1.v}/${r.ex.p2 && r.ex.p2.v})`); continue; }
    const n = EY.normExam(r.ex);
    if (!n.ok) { console.error(`${year}: ${n.error}`); continue; }
    const e = n.exam;
    items.push({ subject: 'Математик', year, variant: 'A', title: `Математик ЭЕШ ${year} · эх хувилбар`,
      exam: { sec1Count: e.sec1Count, sec1Key: e.sec1Key, sec1Scores: e.sec1Scores, topics: e.topics, useSec2: e.useSec2, sec2Config: e.sec2Config }, material: r.mat });
    console.log(`${year}: ${e.sec1Count} тест${e.useSec2 ? ' + 2-р хэсэг' : ''}, материал ${(r.mat.length / 1024).toFixed(0)} KB`);
  }
  await browser.close();
  server.close();
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(items));
  console.log(`${items.length} хувилбар → ${OUT}`);
  process.exit(items.length === years.length ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
