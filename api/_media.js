// Дасгалын төвийн «Видео» (ажлын хуудас бүрийн жишээ видео) ба «Интерактив» (админы нэмсэн HTML жишээ/баталгаа) цэсний өгөгдөл.
// api/worksheets.js бусад хүснэгтийн DDL-ээс ӨМНӨ дууддаг: handle() → true бол хариу өгсөн.
//   GET  ?media=1             — бүх видео + админы интерактив (html-гүй); CDN 60 сек (админ ?t=… нэмж шинээр авна)
//   GET  ?media_slug=<slug>   — нэг ажлын хуудасны видео (ws-store.js-ийн «Жишээ видео» товч)
//   GET  ?int_html=<id>       — админы интерактивын HTML (хөтөч sandbox iframe-ийн srcdoc-д зурна — сайтын нэвтрэлтэд хүрэхгүй)
//   POST vid_save {id?, slug, title, url, pos?} · vid_del {id} · vid_token {name, type, size} — админ
//        (vid_token: Vercel Blob руу хөтчөөс шууд байршуулах client token — функцээр дамжихгүй тул том файл болно)
//   POST int_save {id?, title, descr, grade, slug?, html} · int_del {id} — админ
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

const VID_MAX = 1536 * 1024 * 1024;       // 1.5 ГБ
const VID_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
const INT_HTML_MAX = 600 * 1024;

function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  try { const d = jwt.verify(auth.slice(7), JWT_SECRET); return !!(d && d.admin); } catch (e) { return false; }
}

let _ready = null;
function tables() {
  if (!_ready) {
    _ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_videos (
        id BIGSERIAL PRIMARY KEY,
        slug TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        url TEXT NOT NULL,
        pos INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_ws_videos_slug ON ws_videos(slug)');
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_interactive (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        descr TEXT NOT NULL DEFAULT '',
        grade TEXT NOT NULL DEFAULT '',
        slug TEXT,
        html TEXT NOT NULL,
        pos INT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    })().catch((e) => {
      if (e && (e.code === '23505' || e.code === '42P07')) return;
      _ready = null; throw e;
    });
  }
  return _ready;
}

const str = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const slugOk = (s) => /^[a-z0-9][a-z0-9._-]{0,118}$/i.test(s);
const isBlobUrl = (u) => { try { const h = new URL(u).hostname; return /\.public\.blob\.vercel-storage\.com$/.test(h); } catch (e) { return false; } };

// Зөвшөөрөгдөх видео хаяг: YouTube, Vimeo, Google Drive, Vercel Blob эсвэл https://….mp4/webm (тоглуулагч нь ws-media.js embedOf)
function videoUrl(raw) {
  const s = str(raw, 600);
  if (!s || /\s/.test(s)) return null;
  let u; try { u = new URL(s); } catch (e) { return null; }
  if (u.protocol !== 'https:') return null;
  const h = u.hostname.toLowerCase();
  if (/(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|^youtu\.be$/.test(h)) return s;
  if (/(^|\.)vimeo\.com$/.test(h)) return s;
  if (h === 'drive.google.com') return s;
  if (isBlobUrl(s)) return s;
  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return s;
  return null;
}

async function handle(req, res) {
  const q = req.query || {};
  if (req.method === 'GET' && (q.media || q.media_slug || q.int_html)) {
    await tables();
    if (q.int_html) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      const r = await pool.query('SELECT html FROM ws_interactive WHERE id=$1', [parseInt(q.int_html, 10) || 0]);
      return res.json({ ok: !!r.rows.length, html: r.rows.length ? r.rows[0].html : '' }), true;
    }
    res.setHeader('Cache-Control', q.t ? 'no-store' : 'public, s-maxage=60, stale-while-revalidate=300');
    if (q.media_slug) {
      const r = await pool.query('SELECT id, slug, title, url, pos FROM ws_videos WHERE slug=$1 ORDER BY pos, id', [str(q.media_slug, 120).toLowerCase()]);
      return res.json({ ok: true, videos: r.rows.map(row) }), true;
    }
    const v = await pool.query('SELECT id, slug, title, url, pos FROM ws_videos ORDER BY slug, pos, id');
    const i = await pool.query('SELECT id, title, descr, grade, slug, pos, updated_at FROM ws_interactive ORDER BY pos, id');
    return res.json({ ok: true, videos: v.rows.map(row), ints: i.rows.map((x) => ({ id: Number(x.id), title: x.title, descr: x.descr, grade: x.grade, slug: x.slug || '', pos: x.pos, v: +new Date(x.updated_at) || 0 })) }), true;
  }
  const b = req.method === 'POST' ? (req.body || {}) : {};
  if (!/^(vid_save|vid_del|vid_token|int_save|int_del)$/.test(String(b.action || ''))) return false;
  if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' }), true;
  await tables();

  if (b.action === 'vid_token') {
    const tok = process.env.BLOB_READ_WRITE_TOKEN;
    if (!tok) return res.status(503).json({ ok: false, error: 'Файл байршуулах сан тохируулаагүй — YouTube холбоосоор нэмнэ үү' }), true;
    const type = str(b.type, 60).toLowerCase(), size = Number(b.size) || 0;
    if (VID_TYPES.indexOf(type) < 0) return res.status(400).json({ ok: false, error: 'Зөвхөн mp4 / webm / mov видео' }), true;
    if (size <= 0 || size > VID_MAX) return res.status(400).json({ ok: false, error: 'Видео 1.5 ГБ-аас бага байх ёстой' }), true;
    const base = str(b.name, 80).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'video';
    const ext = type === 'video/webm' ? 'webm' : type === 'video/quicktime' ? 'mov' : 'mp4';
    const pathname = 'ws-video/' + base + '.' + ext;
    const { generateClientTokenFromReadWriteToken } = require('@vercel/blob/client');
    const clientToken = await generateClientTokenFromReadWriteToken({
      token: tok, pathname, addRandomSuffix: true, allowedContentTypes: VID_TYPES, maximumSizeInBytes: VID_MAX,
      validUntil: Date.now() + 60 * 60 * 1000
    });
    return res.json({ ok: true, token: clientToken, pathname }), true;
  }

  if (b.action === 'vid_save') {
    const slug = str(b.slug, 120).toLowerCase(), url = videoUrl(b.url), title = str(b.title, 160);
    if (!slugOk(slug)) return res.status(400).json({ ok: false, error: 'Ажлын хуудас буруу' }), true;
    if (!url) return res.status(400).json({ ok: false, error: 'Видео холбоос буруу (YouTube, Vimeo, Google Drive эсвэл .mp4)' }), true;
    const pos = Number.isFinite(+b.pos) ? Math.max(0, Math.min(9999, Math.round(+b.pos))) : 0;
    let r;
    if (b.id) r = await pool.query('UPDATE ws_videos SET slug=$2, title=$3, url=$4, pos=$5 WHERE id=$1 RETURNING id, slug, title, url, pos', [parseInt(b.id, 10) || 0, slug, title, url, pos]);
    else r = await pool.query('INSERT INTO ws_videos (slug, title, url, pos) VALUES ($1,$2,$3,$4) RETURNING id, slug, title, url, pos', [slug, title, url, pos]);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Видео олдсонгүй' }), true;
    return res.json({ ok: true, video: row(r.rows[0]) }), true;
  }

  if (b.action === 'vid_del') {
    const r = await pool.query('DELETE FROM ws_videos WHERE id=$1 RETURNING url', [parseInt(b.id, 10) || 0]);
    // Сайтад байршуулсан файл бол Blob-оос ч устгана (өөр мөр ижил файлыг заагаагүй үед)
    const url = r.rows.length ? r.rows[0].url : '';
    if (url && isBlobUrl(url) && process.env.BLOB_READ_WRITE_TOKEN) {
      const same = await pool.query('SELECT 1 FROM ws_videos WHERE url=$1 LIMIT 1', [url]);
      if (!same.rows.length) { try { await require('@vercel/blob').del(url); } catch (e) { console.error('[media blob del]', e.message); } }
    }
    return res.json({ ok: true, deleted: r.rows.length }), true;
  }

  if (b.action === 'int_save') {
    const title = str(b.title, 160), html = String(b.html == null ? '' : b.html);
    if (!title) return res.status(400).json({ ok: false, error: 'Нэр оруулна уу' }), true;
    if (!html.trim()) return res.status(400).json({ ok: false, error: 'HTML код хоосон байна' }), true;
    if (html.length > INT_HTML_MAX) return res.status(400).json({ ok: false, error: 'HTML 600 КБ-аас их байна' }), true;
    const slug = str(b.slug, 120).toLowerCase();
    const vals = [title, str(b.descr, 400), str(b.grade, 20), slug && slugOk(slug) ? slug : null, html, Math.max(0, Math.min(9999, Math.round(+b.pos || 0)))];
    let r;
    if (b.id) r = await pool.query('UPDATE ws_interactive SET title=$2, descr=$3, grade=$4, slug=$5, html=$6, pos=$7, updated_at=NOW() WHERE id=$1 RETURNING id', [parseInt(b.id, 10) || 0].concat(vals));
    else r = await pool.query('INSERT INTO ws_interactive (title, descr, grade, slug, html, pos) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', vals);
    if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' }), true;
    return res.json({ ok: true, id: Number(r.rows[0].id) }), true;
  }

  if (b.action === 'int_del') {
    const r = await pool.query('DELETE FROM ws_interactive WHERE id=$1', [parseInt(b.id, 10) || 0]);
    return res.json({ ok: true, deleted: r.rowCount }), true;
  }
  return false;
}
function row(x) { return { id: Number(x.id), slug: x.slug, title: x.title, url: x.url, pos: x.pos }; }

module.exports = { handle, videoUrl };
