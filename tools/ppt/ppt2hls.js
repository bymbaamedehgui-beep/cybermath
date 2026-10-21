// PPT тоглуулагч — локал хувиргагч (deploy-д орохгүй; PowerPoint суусан Windows дээр ажиллана).
//
//   node tools/ppt/ppt2hls.js <файл.pptx> --grade "9-р анги" [--title "..."] [--topic "..."] [--preview 2]
//   node tools/ppt/ppt2hls.js --dir <export хавтас> ...      (export.ps1 аль хэдийн ажилласан бол)
//   --dry : зөвхөн шинжилгээ + HLS (Blob/DB-д юу ч бичихгүй) · --analyze : зөвхөн зогсох цэг · --hidden : нуусан төлөвтэй оруулна · --sg <ws_subgroups.id> : бүлгийн мөрөнд харуулна
//
// Алхам: export.ps1 (PowerPoint → MP4, товшилт бүрийн өмнө Gap сек, слайдын төгсгөлд EndHold сек хөдөлгөөнгүй)
//   → freezedetect-ээр завсруудыг олж «зогсох цэг» (hold) болгоно (уртаар нь ангилж, слайдын товшилтын тоотой тулгана)
//   → H.264 дахин кодлоод AES-128-аар шифрлэсэн HLS → Vercel Blob → ws_ppt мөр (түлхүүр зөвхөн DB-д).
// env: DATABASE_URL, BLOB_READ_WRITE_TOKEN (.env.local эсвэл орчноос)
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
function loadEnv(f) {
  try {
    fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach(function (L) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(L.trim()); if (!m || process.env[m[1]]) return;
      let v = m[2].trim(); if ((v[0] === '"' && v.slice(-1) === '"') || (v[0] === "'" && v.slice(-1) === "'")) v = v.slice(1, -1);
      process.env[m[1]] = v;
    });
  } catch (e) { /* байхгүй бол алгасна */ }
}
loadEnv(path.join(__dirname, '.env.local'));
loadEnv(path.join(ROOT, '.env.local'));
loadEnv(path.join(ROOT, '..', 'cybermath-backend', '.env.local'));

function ffmpegPath() {
  for (const base of [ROOT, path.join(ROOT, '..', 'cybermath-backend')]) {
    try { return require(require.resolve('ffmpeg-static', { paths: [base] })); } catch (e) { /* дараагийнх */ }
  }
  return 'ffmpeg';
}
const FF = ffmpegPath();

/* ── args ── */
const argv = process.argv.slice(2);
function opt(name, def) { const i = argv.indexOf('--' + name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; }
const flag = name => argv.indexOf('--' + name) >= 0;
const DRY = flag('dry');
const pptx = argv[0] && !argv[0].startsWith('--') ? path.resolve(argv[0]) : null;
let DIR = opt('dir', null);

function log(s) { process.stdout.write(s + '\n'); }
function die(s) { console.error('АЛДАА: ' + s); process.exit(1); }

/* ── 1. PowerPoint экспорт ── */
if (!DIR) {
  if (!pptx || !fs.existsSync(pptx)) die('pptx файл олдсонгүй');
  DIR = path.join(os.tmpdir(), 'cm-ppt-' + crypto.createHash('md5').update(pptx).digest('hex').slice(0, 10));
  if (!fs.existsSync(path.join(DIR, 'export.json'))) {
    log('PowerPoint → MP4 …');
    const r = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'export.ps1'),
      '-Pptx', pptx, '-Out', DIR], { stdio: 'inherit' });
    if (r.status !== 0) die('export.ps1 амжилтгүй');
  } else log('Өмнөх экспортыг ашиглав: ' + DIR);
}
DIR = path.resolve(DIR);
const EXP = JSON.parse(fs.readFileSync(path.join(DIR, 'export.json'), 'utf8').replace(/^﻿/, ''));
const GAP = Number(EXP.gap), END = Number(EXP.endHold);
const SLIDES = (Array.isArray(EXP.slides) ? EXP.slides : [EXP.slides]).filter(s => !s.hidden);
const SRC = path.join(DIR, 'deck.mp4');
if (!fs.existsSync(SRC)) die('deck.mp4 алга (-PerSlide горимын экспортыг HLS болгохгүй)');

/* ── 2. Зогсох цэг илрүүлэх (доод ирмэгийн өнгөт зурвас) ── */
function probe(f) {
  const r = spawnSync(FF, ['-hide_banner', '-i', f], { encoding: 'utf8' });
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(r.stderr || ''), v = /Video:.*?(\d{3,5})x(\d{3,5})/.exec(r.stderr || '');
  const fps = /([\d.]+) fps/.exec(r.stderr || '');
  if (!m || !v) die('видео уншиж чадсангүй: ' + f);
  return { dur: (+m[1]) * 3600 + (+m[2]) * 60 + parseFloat(m[3]), w: +v[1], h: +v[2], fps: fps ? parseFloat(fps[1]) : 25 };
}
const PR = probe(SRC), DUR = PR.dur;
const MARK_PX = Math.ceil(PR.h * Number(EXP.markH || 0.012));
const CROP = MARK_PX + 3 + ((PR.h - MARK_PX - 3) % 2);          // тайрах мөр (тэгш өндөр үлдэнэ)
// Кадр бүрийн зурвасын дундаж өнгө (зурвасын дотор талын 3 мөр, хажуугийн 5%-ийг орхино)
const rr = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-i', SRC, '-an',
  '-vf', 'crop=iw*0.9:' + Math.max(1, MARK_PX - 3) + ':iw*0.05:ih-' + (MARK_PX - 1) + ',scale=1:1:flags=area,format=rgb24',
  '-vsync', 'passthrough', '-f', 'rawvideo', '-'], { maxBuffer: 1 << 30 });
if (rr.status !== 0) die('зурвас уншиж чадсангүй');
const RAW = rr.stdout, NF = Math.floor(RAW.length / 3), FPS = PR.fps;
const near = (i, R, G, B) => Math.abs(RAW[i * 3] - R) + Math.abs(RAW[i * 3 + 1] - G) + Math.abs(RAW[i * 3 + 2] - B) < 90;
const cls = new Array(NF);
for (let i = 0; i < NF; i++) cls[i] = near(i, 255, 0, 255) ? 'G' : near(i, 0, 255, 255) ? 'E' : '-';
// Урсгал (run) — 1 кадрын шуугианыг тооцохгүй
const RUNS = [];
for (let i = 0; i < NF;) { let j = i; while (j < NF && cls[j] === cls[i]) j++; if (cls[i] !== '-' && j - i >= 2) RUNS.push({ t: cls[i], a: i, b: j }); i = j; }
// Хөрш ижил төрлийн урсгалыг (шилжилтийн дунд тасарсан) нэгтгэнэ
for (let i = RUNS.length - 1; i > 0; i--) if (RUNS[i].t === RUNS[i - 1].t && RUNS[i].a - RUNS[i - 1].b <= 2) { RUNS[i - 1].b = RUNS[i].b; RUNS.splice(i, 1); }
const T = i => +(i / FPS).toFixed(3);
const HOLDS = [], STARTS = [0];
let si = 0, gInSlide = 0, warn = [];
RUNS.forEach(function (r) {
  if (si >= SLIDES.length) { warn.push('илүү тэмдэг ' + r.t + '@' + T(r.a)); return; }
  if (r.t === 'G') { gInSlide++; HOLDS.push([T(r.a + 1), T(r.b), si + 1]); }
  else {
    if (gInSlide !== SLIDES[si].clicks) warn.push('слайд ' + SLIDES[si].n + ': товшилт ' + SLIDES[si].clicks + ', тэмдэг ' + gInSlide);
    HOLDS.push([T(r.a + 1), T(r.b), si + 1]);
    si++; gInSlide = 0;
    if (si < SLIDES.length) STARTS.push(T(r.b));
  }
});
if (si !== SLIDES.length) warn.push('слайдын төгсгөл ' + si + '/' + SLIDES.length);
log('Хугацаа ' + DUR.toFixed(1) + 'с · кадр ' + NF + ' · слайд ' + SLIDES.length + ' · зогсох цэг ' + HOLDS.length +
  ' · тайрах ' + CROP + 'px' + (warn.length ? '\n  АНХААР: ' + warn.slice(0, 20).join('\n  АНХААР: ') : ''));
if (warn.length && !flag('force')) die('тэмдэг слайдтай таарсангүй (--force-оор үргэлжлүүлж болно)');
fs.writeFileSync(path.join(DIR, 'holds.json'), JSON.stringify({ holds: HOLDS, starts: STARTS, duration: DUR }, null, 1));
if (flag('analyze')) process.exit(0);

/* ── 3. HLS (AES-128) ── */
const HLS = path.join(DIR, 'hls');
fs.rmSync(HLS, { recursive: true, force: true }); fs.mkdirSync(HLS);
const KEY = crypto.randomBytes(16), IV = crypto.randomBytes(16).toString('hex');
fs.writeFileSync(path.join(HLS, 'k.key'), KEY);
fs.writeFileSync(path.join(HLS, 'keyinfo'), '__KEY__\n' + path.join(HLS, 'k.key') + '\n' + IV + '\n');
// Үргэлжлэх цэг бүр + слайдын эхлэлд keyframe → seek нь яг тэр хүрээнээс эхэлнэ
const KF = Array.from(new Set(HOLDS.map(h => h[1]).concat(STARTS))).filter(t => t > 0 && t < DUR).sort((a, b) => a - b);
fs.writeFileSync(path.join(HLS, 'kf.txt'), KF.map(t => t.toFixed(3)).join(','));
log('H.264 + HLS кодлож байна …');
const enc = spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-i', SRC, '-an',
  '-vf', 'crop=iw:ih-' + CROP + ':0:0,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-profile:v', 'high',
  '-g', '250', '-keyint_min', '1', '-sc_threshold', '0', '-force_key_frames', KF.map(t => t.toFixed(3)).join(',') || '0',
  '-f', 'hls', '-hls_time', '6', '-hls_playlist_type', 'vod', '-hls_key_info_file', path.join(HLS, 'keyinfo'),
  '-hls_segment_filename', path.join(HLS, 'seg_%04d.ts'), path.join(HLS, 'index.m3u8')], { stdio: 'inherit' });
if (enc.status !== 0) die('ffmpeg HLS амжилтгүй');
// Нүүр зураг — эхний зогсох цэгийн хүрээ (зөвхөн 1-р слайд, нээлттэй байж болно)
spawnSync(FF, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(HOLDS[0] ? HOLDS[0][0] : 0), '-i', SRC,
  '-frames:v', '1', '-vf', 'crop=iw:ih-' + CROP + ':0:0,scale=640:-2', '-q:v', '4', path.join(HLS, 'poster.jpg')], { stdio: 'inherit' });
const segs = fs.readdirSync(HLS).filter(f => /^seg_\d+\.ts$/.test(f)).sort();
const bytes = segs.reduce((a, f) => a + fs.statSync(path.join(HLS, f)).size, 0);
log('HLS: ' + segs.length + ' хэсэг, ' + (bytes / 1e6).toFixed(1) + ' MB');
if (DRY) { log('--dry: ' + HLS); process.exit(0); }

/* ── 4. Blob + DB ── */
const GRADE = opt('grade', null);
if (!GRADE) die('--grade заавал ("9-р анги" г.м.)');
const TITLE = opt('title', (EXP.source || 'Слайд').replace(/\.pptx?$/i, ''));
const TOPIC = opt('topic', null);
const PREVIEW = Math.max(0, parseInt(opt('preview', '2'), 10) || 0);
if (!process.env.BLOB_READ_WRITE_TOKEN) die('BLOB_READ_WRITE_TOKEN алга');
if (!process.env.DATABASE_URL) die('DATABASE_URL алга');

(async function () {
  const { put } = require(require.resolve('@vercel/blob', { paths: [ROOT] }));
  const { Client } = require(require.resolve('pg', { paths: [ROOT, path.join(ROOT, '..', 'cybermath-backend')] }));
  const tag = crypto.randomBytes(9).toString('hex');
  const urls = {}, blobs = [];
  let done = 0;
  const files = segs.concat(['poster.jpg']);
  async function up(f) {
    const ct = f.endsWith('.jpg') ? 'image/jpeg' : 'video/mp2t';
    for (let a = 1; a <= 4; a++) {
      try {
        const r = await put('ppt/' + tag + '/' + f, fs.readFileSync(path.join(HLS, f)),
          { access: 'public', addRandomSuffix: true, contentType: ct, token: process.env.BLOB_READ_WRITE_TOKEN, cacheControlMaxAge: 31536000 });
        urls[f] = r.url; blobs.push(r.url); done++;
        if (done % 10 === 0 || done === files.length) log('  upload ' + done + '/' + files.length);
        return;
      } catch (e) { if (a === 4) throw e; await new Promise(r => setTimeout(r, 1500 * a)); }
    }
  }
  for (let i = 0; i < files.length; i += 6) await Promise.all(files.slice(i, i + 6).map(up));
  // Плейлистийн хэсгүүдийг Blob-ын бүтэн URL болгоно; түлхүүрийн URI (__KEY__)-г API нээх бүрд богино хугацааны токеноор солино
  const m3u8 = fs.readFileSync(path.join(HLS, 'index.m3u8'), 'utf8').split(/\r?\n/)
    .map(L => (/^seg_\d+\.ts$/.test(L.trim()) ? urls[L.trim()] : L)).join('\n');
  if (/seg_\d+\.ts/.test(m3u8.replace(/https:\/\/\S+/g, ''))) die('плейлистэд солигдоогүй хэсэг үлдэв');

  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(require(path.join(ROOT, 'api', '_wsppt_sql.js')).DDL);
  const r = await c.query(
    `INSERT INTO ws_ppt (title, grade, topic, sort, slides, steps, duration, holds, starts, m3u8, key_hex, poster, blobs, preview_slides, source, hidden, sg_id)
     VALUES ($1,$2,$3,(SELECT COALESCE(MAX(sort),0)+1 FROM ws_ppt WHERE grade=$2),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
    [TITLE, GRADE, TOPIC, SLIDES.length, HOLDS.length, DUR, JSON.stringify(HOLDS), JSON.stringify(STARTS), m3u8,
      KEY.toString('hex'), urls['poster.jpg'], JSON.stringify(blobs), PREVIEW, EXP.source || null, flag('hidden'), parseInt(opt('sg', ''), 10) || null]);
  await c.end();
  log('OK — ws_ppt id=' + r.rows[0].id + '  «' + TITLE + '» (' + GRADE + ')  https://cyber-math.com/ppt.html?id=' + r.rows[0].id);
})().catch(e => die(e.stack || e.message));
