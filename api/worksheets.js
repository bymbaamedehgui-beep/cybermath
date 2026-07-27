// Хэвлэсэн дасгалын багцыг санах (DB). Хаанаас ч хариуг шалгах боломжтой.
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

// Зөвхөн админы JWT (admin:true) эсэхийг шалгах
function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const d = jwt.verify(auth.slice(7), JWT_SECRET);
    return !!(d && d.admin);
  } catch (e) { return false; }
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_sets (
        id BIGSERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        items JSONB NOT NULL DEFAULT '[]',
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`ALTER TABLE ws_sets ADD COLUMN IF NOT EXISTS note TEXT`).catch(()=>{});
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_titles (
        slug TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_hidden (
        slug TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_order (
        grp TEXT NOT NULL,
        slug TEXT NOT NULL,
        pos INT NOT NULL,
        PRIMARY KEY (grp, slug)
      )`);
    // Сэдвийг анги хооронд зөөх / хувилах — байршлын өөрчлөлт
    // kind='add'  → тухайн бүлэгт нэмж байрлуулсан (зөөсний очих тал эсвэл хувилсан)
    // kind='remove' → эх бүлгээс хассан (зөөсний гарах тал)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_place (
        grp TEXT NOT NULL,
        slug TEXT NOT NULL,
        kind TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (grp, slug, kind)
      )`);
    // Багшийн 4 оронтой PIN (имэйлээр) — тэмдэглэл устгах эрх
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_pins (
        email TEXT PRIMARY KEY,
        pin TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

    // GET — жагсаалт эсвэл нэг багц эсвэл сэдвийн нэр/нуусан/дараалал
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (req.query.titles) {
        const r = await pool.query('SELECT slug, title FROM ws_titles');
        const map = {};
        r.rows.forEach(x => { map[x.slug] = x.title; });
        const h = await pool.query('SELECT slug FROM ws_hidden');
        const o = await pool.query('SELECT grp, slug FROM ws_order ORDER BY grp, pos');
        const order = {};
        o.rows.forEach(x => { (order[x.grp] = order[x.grp] || []).push(x.slug); });
        const p = await pool.query('SELECT grp, slug, kind FROM ws_place');
        const place = { add: {}, remove: {} };
        p.rows.forEach(x => {
          const bucket = x.kind === 'remove' ? place.remove : place.add;
          (bucket[x.grp] = bucket[x.grp] || []).push(x.slug);
        });
        return res.json({ ok: true, titles: map, hidden: h.rows.map(x => x.slug), order: order, place: place });
      }
      const code = req.query.code;
      if (code) {
        const r = await pool.query('SELECT * FROM ws_sets WHERE id=$1', [parseInt(code)]);
        return res.json({ ok: true, set: r.rows[0] || null });
      }
      const r = await pool.query(
        `SELECT id, title, note, created_at, jsonb_array_length(items) AS count
         FROM ws_sets ORDER BY id DESC LIMIT 200`);
      return res.json({ ok: true, sets: r.rows });
    }

    if (req.method === 'POST') {
      const b = req.body || {};
      if (b.action === 'save') {
        const title = String(b.title || 'Дасгал').slice(0, 160);
        const note = b.note ? String(b.note).slice(0, 500) : null;
        const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
        if (!items.length) return res.status(400).json({ ok: false, error: 'Бодлого алга' });
        const r = await pool.query(
          'INSERT INTO ws_sets (title, items, note) VALUES ($1,$2,$3) RETURNING id, created_at',
          [title, JSON.stringify(items), note]
        );
        return res.json({ ok: true, code: r.rows[0].id });
      }
      // Багшийн PIN — тэмдэглэл устгах эрх (нэг удаа үүсгэнэ)
      if (b.action === 'pinStatus') {
        const email = String(b.email || '').trim().toLowerCase();
        if (!email) return res.json({ ok: true, hasPin: false });
        const r = await pool.query('SELECT 1 FROM ws_pins WHERE email=$1', [email]);
        return res.json({ ok: true, hasPin: r.rows.length > 0 });
      }
      if (b.action === 'setPin') {
        const email = String(b.email || '').trim().toLowerCase();
        const pin = String(b.pin || '');
        if (!email || !/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: '4 оронтой PIN оруулна уу' });
        const ex = await pool.query('SELECT pin FROM ws_pins WHERE email=$1', [email]);
        if (ex.rows.length) return res.json({ ok: true, existed: true });   // нэг удаа үүсгэнэ
        await pool.query('INSERT INTO ws_pins (email, pin) VALUES ($1,$2)', [email, pin]);
        return res.json({ ok: true, created: true });
      }
      if (b.action === 'delete') {
        if (!b.code) return res.status(400).json({ ok: false });
        // Админ бол чөлөөтэй; бусад тохиолдолд багшийн PIN шаардана
        if (!isAdmin(req)) {
          const email = String(b.email || '').trim().toLowerCase();
          const pin = String(b.pin || '');
          if (!email || !/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN шаардлагатай' });
          const pr = await pool.query('SELECT pin FROM ws_pins WHERE email=$1', [email]);
          if (!pr.rows.length || pr.rows[0].pin !== pin) return res.status(403).json({ ok: false, error: 'PIN буруу байна' });
        }
        await pool.query('DELETE FROM ws_sets WHERE id=$1', [parseInt(b.code)]);
        return res.json({ ok: true });
      }
      // Нэр өөрчлөх / нуух / сэргээх / дараалал — ЗӨВХӨН АДМИН
      if (['setTitle', 'resetTitle', 'hideTopic', 'unhideTopic', 'setOrder',
           'moveTopic', 'dupTopic', 'removePlacement'].indexOf(b.action) >= 0) {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ өөрчилнө' });
      }
      const clip = (s) => String(s || '').slice(0, 120);
      if (b.action === 'moveTopic') {
        const slug = clip(b.slug), from = clip(b.from), to = clip(b.to);
        if (!slug || !from || !to) return res.status(400).json({ ok: false, error: 'slug/from/to дутуу' });
        if (from === to) return res.json({ ok: true });
        // эх бүлгээс хас
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'remove') ON CONFLICT DO NOTHING`, [from, slug]);
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='add'`, [from, slug]);
        // очих бүлэгт нэм
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, [to, slug]);
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='remove'`, [to, slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'dupTopic') {
        const slug = clip(b.slug), to = clip(b.to);
        if (!slug || !to) return res.status(400).json({ ok: false, error: 'slug/to дутуу' });
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, [to, slug]);
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='remove'`, [to, slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'removePlacement') {
        const slug = clip(b.slug), grp = clip(b.grp);
        if (!slug || !grp) return res.status(400).json({ ok: false, error: 'slug/grp дутуу' });
        await pool.query(`DELETE FROM ws_place WHERE grp=$1 AND slug=$2 AND kind='add'`, [grp, slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'setOrder') {
        const grp = String(b.grp || '').slice(0, 120);
        const slugs = Array.isArray(b.slugs) ? b.slugs.slice(0, 200) : null;
        if (!grp || !slugs) return res.status(400).json({ ok: false, error: 'grp/slugs дутуу' });
        await pool.query('DELETE FROM ws_order WHERE grp=$1', [grp]);
        for (let i = 0; i < slugs.length; i++) {
          await pool.query('INSERT INTO ws_order (grp, slug, pos) VALUES ($1,$2,$3)',
            [grp, String(slugs[i]).slice(0, 120), i]);
        }
        return res.json({ ok: true });
      }
      if (b.action === 'hideTopic') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false });
        await pool.query('INSERT INTO ws_hidden (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING', [slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'unhideTopic') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_hidden WHERE slug=$1', [slug]);
        return res.json({ ok: true });
      }
      if (b.action === 'setTitle') {
        const slug = String(b.slug || '').slice(0, 120);
        const title = String(b.title || '').trim().slice(0, 160);
        if (!slug || !title) return res.status(400).json({ ok: false, error: 'slug/title дутуу' });
        await pool.query(
          `INSERT INTO ws_titles (slug, title, updated_at) VALUES ($1,$2,NOW())
           ON CONFLICT (slug) DO UPDATE SET title=EXCLUDED.title, updated_at=NOW()`,
          [slug, title]
        );
        return res.json({ ok: true });
      }
      if (b.action === 'resetTitle') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_titles WHERE slug=$1', [slug]);
        return res.json({ ok: true });
      }
      return res.status(400).json({ ok: false, error: 'Unknown action' });
    }

    res.status(405).json({ ok: false });
  } catch (e) {
    console.error('[worksheets]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
};
