// Дасгал ажлын дэвтрийн «Цахим ном» (эзэмшигч 2026-11-16: «шууд цахим ном хэлбэрээр хүмүүст харуулах … нэг нэг линк …
// хэн ч татаж авах засварлах боломжгүйгээр»). Админ дэвтрийн попапаас (ws-book.js publishEbook) хуудаслалтыг хэсэг хэсгээр
// (хэсэг бүр бие даасан gzip) байршуулна; хэн ч нэвтрэлтгүйгээр /devter/<key> (devter.html) зөвхөн уншина.
// api/worksheets.js бусад хүснэгтийн DDL-ээс ӨМНӨ дууддаг: handle() → true бол хариу өгсөн.
//   GET  ?ebook=<key>                  — нийтэлсэн хувилбар { up, n, pages, label, paper, updated } (CDN 60 сек)
//   GET  ?ebook=<key>&up=<up>&i=<k>    — k-р хэсэг: gzip байт, Content-Encoding: gzip (хөтөч өөрөө задална); хувилбар (up) бүр
//                                        өөр хаягтай тул удаан кэшилнэ. Идэвхгүй (хуучин) хувилбарын хэсэг — 404
//   POST ebook_put {key, up, i, n, data: base64 gzip} · ebook_commit {key, up, n, pages, label, paper} — ЗӨВХӨН АДМИН
// Ажлын хуудас тус бүрийн эрх (ws-store.js, api/_wsgrade.js) хэвээр — энэ нь зөвхөн админы нийтэлсэн дэвтрийн хуулбар.
const pool = require('./_db');
const { requireAdmin } = require('./_guard');

const KEY_RE = /^(?:[2-9]|1[0-2]|eesh|olimpiad)$/;     // ws-browse.js ebookKey
const UP_RE = /^[a-z0-9]{8,24}$/;
const PART_MAX = 3 * 1024 * 1024;                       // нэг хэсгийн gzip (base64 нь Vercel-ийн 4.5 МБ хүсэлтэд багтана)
const PARTS_MAX = 40;

let _ready = null;
function tables() {
  if (!_ready) {
    _ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_ebook_parts (
        key TEXT NOT NULL,
        up TEXT NOT NULL,
        i INT NOT NULL,
        data BYTEA NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (key, up, i)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS ws_ebooks (
        key TEXT PRIMARY KEY,
        up TEXT NOT NULL,
        n INT NOT NULL,
        pages INT NOT NULL DEFAULT 0,
        label TEXT NOT NULL DEFAULT '',
        paper TEXT NOT NULL DEFAULT 'a4',
        bytes INT NOT NULL DEFAULT 0,
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
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

async function handle(req, res) {
  const q = req.query || {};
  if (req.method === 'GET' && q.ebook != null) {
    const key = str(q.ebook, 20).toLowerCase();
    if (!KEY_RE.test(key)) return res.status(404).json({ ok: false, error: 'Цахим ном олдсонгүй' }), true;
    await tables();
    if (q.up == null) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600');
      const r = await pool.query('SELECT up, n, pages, label, paper, updated_at FROM ws_ebooks WHERE key=$1', [key]);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Энэ ангийн цахим ном хараахан нийтлэгдээгүй байна' }), true;
      const x = r.rows[0];
      return res.json({ ok: true, key: key, up: x.up, n: x.n, pages: x.pages, label: x.label, paper: x.paper, updated: x.updated_at }), true;
    }
    const up = str(q.up, 30), i = int(q.i);
    if (!UP_RE.test(up) || !(i >= 0 && i < PARTS_MAX)) return res.status(404).json({ ok: false, error: 'Хэсэг олдсонгүй' }), true;
    // Зөвхөн идэвхтэй хувилбарын хэсэг (нийтлэгдэж дуусаагүй эсвэл хуучирсан хувилбар — үгүй)
    const r = await pool.query(
      'SELECT p.data FROM ws_ebook_parts p JOIN ws_ebooks e ON e.key=p.key AND e.up=p.up WHERE p.key=$1 AND p.up=$2 AND p.i=$3',
      [key, up, i]);
    if (!r.rows.length) { res.setHeader('Cache-Control', 'no-store'); return res.status(404).json({ ok: false, error: 'Хэсэг олдсонгүй' }), true; }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.status(200);
    return res.end(r.rows[0].data), true;
  }

  const b = req.method === 'POST' ? (req.body || {}) : {};
  if (!/^(ebook_put|ebook_commit)$/.test(String(b.action || ''))) return false;
  if (!requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' }), true;
  const key = str(b.key, 20).toLowerCase(), up = str(b.up, 30), n = int(b.n);
  if (!KEY_RE.test(key)) return res.status(400).json({ ok: false, error: 'Анги буруу' }), true;
  if (!UP_RE.test(up) || !(n >= 1 && n <= PARTS_MAX)) return res.status(400).json({ ok: false, error: 'Хувилбар буруу' }), true;
  await tables();

  if (b.action === 'ebook_put') {
    const i = int(b.i);
    if (!(i >= 0 && i < n)) return res.status(400).json({ ok: false, error: 'Хэсгийн дугаар буруу' }), true;
    const buf = typeof b.data === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(b.data) ? Buffer.from(b.data, 'base64') : null;
    if (!buf || buf.length < 18 || buf.length > PART_MAX || buf[0] !== 0x1f || buf[1] !== 0x8b) {
      return res.status(400).json({ ok: false, error: 'Хэсэг буруу (gzip биш эсвэл хэт том)' }), true;
    }
    await pool.query(
      `INSERT INTO ws_ebook_parts (key, up, i, data) VALUES ($1,$2,$3,$4)
       ON CONFLICT (key, up, i) DO UPDATE SET data=EXCLUDED.data, created_at=NOW()`,
      [key, up, i, buf]);
    return res.json({ ok: true, i: i }), true;
  }

  // ebook_commit — бүх хэсэг ирсэн бол шинэ хувилбарыг идэвхжүүлж, тухайн ангийн бусад хувилбарын хэсгийг устгана
  const have = await pool.query('SELECT i, octet_length(data) AS sz FROM ws_ebook_parts WHERE key=$1 AND up=$2', [key, up]);
  const got = new Set(have.rows.map((x) => Number(x.i)));
  for (let k = 0; k < n; k++) if (!got.has(k)) return res.status(409).json({ ok: false, error: 'Хэсэг дутуу (' + k + ')' }), true;
  if (got.size !== n) return res.status(409).json({ ok: false, error: 'Хэсгийн тоо таарахгүй' }), true;
  const bytes = have.rows.reduce((s, x) => s + (Number(x.sz) || 0), 0);
  const pages = Math.max(0, Math.min(5000, int(b.pages) || 0)), label = str(b.label, 60).replace(/[\u0000-\u001f<>]/g, ''), paper = b.paper === 'b5' ? 'b5' : 'a4';
  await pool.query(
    `INSERT INTO ws_ebooks (key, up, n, pages, label, paper, bytes, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
     ON CONFLICT (key) DO UPDATE SET up=EXCLUDED.up, n=EXCLUDED.n, pages=EXCLUDED.pages, label=EXCLUDED.label, paper=EXCLUDED.paper,
       bytes=EXCLUDED.bytes, updated_at=NOW()`,
    [key, up, n, pages, label, paper, bytes]);
  await pool.query('DELETE FROM ws_ebook_parts WHERE key=$1 AND up<>$2', [key, up]);
  // нийтлэгдэж дуусаагүй (тасарсан) өөр ангийн хуучин хэсгүүд
  await pool.query(`DELETE FROM ws_ebook_parts p WHERE p.created_at < NOW() - INTERVAL '2 days'
    AND NOT EXISTS (SELECT 1 FROM ws_ebooks e WHERE e.key=p.key AND e.up=p.up)`).catch(() => {});
  return res.json({ ok: true, url: '/devter/' + key, pages: pages, bytes: bytes }), true;
}

module.exports = { handle, KEY_RE };
