// Хэвлэсэн дасгалын багцыг санах (DB). Хаанаас ч хариуг шалгах боломжтой.
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { sendVerifyEmail, sendFeedbackReply } = require('./_email');
const JWT_SECRET = process.env.JWT_SECRET || 'cybermath-default-secret-change-in-prod';

// Дасгалын төвийн нэвтрэлт — имэйл + нууц үг + баталгаажуулах код (тусдаа ws_login)
function wsSign(email) { return jwt.sign({ email: String(email).toLowerCase(), ws: true }, JWT_SECRET, { expiresIn: '400d' }); }
function wsEmailFromToken(t) { try { const d = jwt.verify(String(t || ''), JWT_SECRET); return (d && d.ws && d.email) ? String(d.email).toLowerCase() : null; } catch (e) { return null; } }
// Санал хүсэлтийн мөрүүдэд харилцан ярианы thread-ийг нэг багц query-ээр хавсаргана
async function attachThreads(rows) {
  const ids = rows.map(f => f.id);
  let byFb = {};
  if (ids.length) {
    const m = await pool.query('SELECT fb_id, sender, text, created_at FROM ws_feedback_msg WHERE fb_id = ANY($1) ORDER BY created_at ASC', [ids]);
    m.rows.forEach(x => { (byFb[x.fb_id] = byFb[x.fb_id] || []).push({ sender: x.sender, text: x.text, at: x.created_at }); });
  }
  return rows.map(f => {
    let thread = byFb[f.id] || [];
    if (thread.length === 0 && f.reply) thread = [{ sender: 'admin', text: f.reply, at: f.replied_at }]; // хуучин ганц reply
    return { id: f.id, message: f.message, contact: f.contact, created_at: f.created_at, replied_at: f.replied_at, thread };
  });
}
function gen6() { return Math.floor(100000 + Math.random() * 900000).toString(); }
async function ensureWsLogin() {
  await pool.query(`CREATE TABLE IF NOT EXISTS ws_login (
    email TEXT PRIMARY KEY,
    pass_hash TEXT NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    code TEXT,
    code_exp TIMESTAMPTZ,
    name TEXT,
    phone TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS name TEXT`).catch(()=>{});
  await pool.query(`ALTER TABLE ws_login ADD COLUMN IF NOT EXISTS phone TEXT`).catch(()=>{});
}

// Зөвхөн админы JWT (admin:true) эсэхийг шалгах
function isAdmin(req) {
  const auth = req.headers.authorization || req.headers.Authorization || '';
  if (!auth.startsWith('Bearer ')) return false;
  try {
    const d = jwt.verify(auth.slice(7), JWT_SECRET);
    return !!(d && d.admin);
  } catch (e) { return false; }
}

// Санал хүсэлт ирэхэд Telegram-аар мэдэгдэх (env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID)
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN, chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chat, text: text, parse_mode: 'HTML', disable_web_page_preview: true })
    });
    return await r.json();   // { ok, result: { message_id, ... } }
  } catch (e) { console.error('[telegram]', e.message); return null; }
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
    await pool.query(`ALTER TABLE ws_sets ADD COLUMN IF NOT EXISTS owner TEXT`).catch(()=>{});
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
    // Хэрэглэгчийн санал хүсэлт
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_feedback (
        id BIGSERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        contact TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    await pool.query(`ALTER TABLE ws_feedback ADD COLUMN IF NOT EXISTS reply TEXT`);
    await pool.query(`ALTER TABLE ws_feedback ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ`);
    await pool.query(`ALTER TABLE ws_feedback ADD COLUMN IF NOT EXISTS tg_msg_id BIGINT`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_feedback_msg (
      id BIGSERIAL PRIMARY KEY,
      fb_id BIGINT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_fbmsg_fb ON ws_feedback_msg(fb_id)`);
    // Ажлын хуудас бүрийн сэтгэгдэл ба reaction (slug-аар түлхүүрлэнэ)
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_comments (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      name TEXT,
      email TEXT,
      body TEXT NOT NULL,
      is_admin BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wsc_slug ON ws_comments(slug)`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_reactions (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL,
      user_key TEXT NOT NULL,
      reaction TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(slug, user_key)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wsr_slug ON ws_reactions(slug)`);
    // Сургалт (Event) — зарлал + бүртгэл + төлбөр
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_events (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      descr TEXT,
      price INT DEFAULT 20000,
      slots JSONB DEFAULT '[]'::jsonb,
      active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS ws_event_regs (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL,
      email TEXT NOT NULL,
      name TEXT,
      phone TEXT,
      slot TEXT,
      amount INT,
      paid BOOLEAN DEFAULT FALSE,
      invoice_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      paid_at TIMESTAMPTZ,
      UNIQUE(event_id, email)
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_wser_event ON ws_event_regs(event_id)`);
    // Ээлжит хичээлийн төлөвлөгөө (багш бүр өөрийн, хувийн)
    await pool.query(`CREATE TABLE IF NOT EXISTS lesson_plans (
      id BIGSERIAL PRIMARY KEY,
      owner_email TEXT NOT NULL,
      title TEXT NOT NULL,
      grade TEXT,
      ldate TEXT,
      duration TEXT,
      objectives TEXT,
      flow TEXT,
      homework TEXT,
      worksheets JSONB DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_lp_owner ON lesson_plans(owner_email)`);
    // Тохиргоо (announce гэх мэт key/value)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_settings (
        skey TEXT PRIMARY KEY,
        sval TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Ажлын хуудасны заавар/тайлбарын ерөнхий загвар (зөвхөн админ засна, бүгд харна)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_instr (
        slug TEXT PRIMARY KEY,
        edits JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Ангийн доторх дэд бүлэг (зөвхөн админ үүсгэнэ, бүгд харна). Гишүүнчлэл нь ws_place(grp='sg:'+id, kind='add')
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ws_subgroups (
        id BIGSERIAL PRIMARY KEY,
        grade TEXT NOT NULL,
        name TEXT NOT NULL,
        pos INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
    // Бүлэг дотор бүлэг (nest) — эцэг дэд бүлгийн id (null бол дээд түвшин)
    await pool.query(`ALTER TABLE ws_subgroups ADD COLUMN IF NOT EXISTS parent_id BIGINT`).catch(() => {});

    // GET — жагсаалт эсвэл нэг багц эсвэл сэдвийн нэр/нуусан/дараалал
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      // Ажлын хуудасны заавар загвар авах — нээлттэй (бүх хэрэглэгч харна)
      if (req.query.instr) {
        const slug = String(req.query.instr || '').toLowerCase().slice(0, 120);
        const r = await pool.query('SELECT edits FROM ws_instr WHERE slug=$1', [slug]);
        return res.json({ ok: true, edits: r.rows.length ? (r.rows[0].edits || {}) : {} });
      }
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
        const ann = await pool.query(`SELECT sval FROM ws_settings WHERE skey='announce'`);
        const announce = ann.rows.length ? (ann.rows[0].sval || '') : '';
        let subgroups = [];
        try {
          const sg = await pool.query('SELECT id, grade, name, pos, parent_id FROM ws_subgroups ORDER BY grade, pos, id');
          subgroups = sg.rows.map(x => ({ id: Number(x.id), grade: x.grade, name: x.name, pos: x.pos, parent: x.parent_id != null ? Number(x.parent_id) : null }));
        } catch (e) {}
        return res.json({ ok: true, titles: map, hidden: h.rows.map(x => x.slug), order: order, place: place, announce: announce, subgroups: subgroups });
      }
      const owner = req.query.owner ? String(req.query.owner).slice(0, 80) : null;
      const code = req.query.code;
      if (code) {
        const r = await pool.query('SELECT * FROM ws_sets WHERE id=$1', [parseInt(code)]);
        const row = r.rows[0] || null;
        // Эзэмшигчтэй тэмдэглэлийг зөвхөн эзэмшигч нь харна (хуучин эзэмшигчгүй нь нээлттэй)
        if (row && row.owner && row.owner !== owner) return res.json({ ok: true, set: null });
        return res.json({ ok: true, set: row });
      }
      // Жагсаалт: зөвхөн тухайн төхөөрөмжийн (эзэмшигчийн) хадгалсан хуудсууд
      const r = owner
        ? await pool.query(
            `SELECT id, title, note, created_at, jsonb_array_length(items) AS count
             FROM ws_sets WHERE owner=$1 ORDER BY id DESC LIMIT 200`, [owner])
        : { rows: [] };
      return res.json({ ok: true, sets: r.rows });
    }

    if (req.method === 'POST') {
      const b = req.body || {};

      // ── Дасгалын төвийн нэвтрэлт: бүртгэл → код → баталгаажуулах → нэвтрэх ──
      if (['ws_register','ws_verify','ws_login','ws_resend','ws_forgot','ws_reset'].indexOf(b.action) >= 0) {
        await ensureWsLogin();
        const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Зөв имэйл оруулна уу' });

        if (b.action === 'ws_login') {
          const r = await pool.query('SELECT pass_hash, verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, notFound: true, error: 'Бүртгэлгүй имэйл' });
          const okp = await bcrypt.compare(String(b.pass || ''), r.rows[0].pass_hash);
          if (!okp) return res.status(401).json({ ok: false, error: 'Нууц үг буруу' });
          if (!r.rows[0].verified) return res.status(403).json({ ok: false, needVerify: true, error: 'Имэйл баталгаажаагүй' });
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_register') {
          const pass = String(b.pass || '');
          const name = b.name ? String(b.name).trim().slice(0, 80) : null;
          const phone = b.phone ? String(b.phone).trim().slice(0, 20) : null;
          if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });
          const ex = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]);
          if (ex.rows.length && ex.rows[0].verified) return res.status(400).json({ ok: false, existed: true, error: 'Энэ имэйл бүртгэлтэй байна. Нэвтэрнэ үү.' });
          const code = gen6(), exp = new Date(Date.now() + 10 * 60 * 1000), hash = await bcrypt.hash(pass, 10);
          await pool.query(
            `INSERT INTO ws_login (email, pass_hash, verified, code, code_exp, name, phone) VALUES ($1,$2,FALSE,$3,$4,$5,$6)
             ON CONFLICT (email) DO UPDATE SET pass_hash=EXCLUDED.pass_hash, code=EXCLUDED.code, code_exp=EXCLUDED.code_exp, name=EXCLUDED.name, phone=EXCLUDED.phone`,
            [email, hash, code, exp.toISOString(), name, phone]);
          try { await sendVerifyEmail(email, code, name || ''); } catch (e) { console.error('[ws mail]', e.message); }
          return res.json({ ok: true, needVerify: true });
        }
        if (b.action === 'ws_forgot') {
          const r = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Бүртгэлгүй имэйл' });
          const code = gen6(), exp = new Date(Date.now() + 10 * 60 * 1000);
          await pool.query('UPDATE ws_login SET code=$2, code_exp=$3 WHERE email=$1', [email, code, exp.toISOString()]);
          try { await sendVerifyEmail(email, code, ''); } catch (e) {}
          return res.json({ ok: true });
        }
        if (b.action === 'ws_reset') {
          const pass = String(b.pass || '');
          if (pass.length < 6) return res.status(400).json({ ok: false, error: 'Нууц үг 6+ тэмдэгт байх ёстой' });
          const r = await pool.query('SELECT code, code_exp FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Бүртгэлгүй' });
          if (String(r.rows[0].code) !== String(b.code || '')) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
          if (new Date(r.rows[0].code_exp) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
          const hash = await bcrypt.hash(pass, 10);
          await pool.query('UPDATE ws_login SET pass_hash=$2, verified=TRUE, code=NULL WHERE email=$1', [email, hash]);
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_verify') {
          const r = await pool.query('SELECT code, code_exp, verified, name, phone FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Хэрэглэгч олдсонгүй' });
          if (r.rows[0].verified) return res.json({ ok: true, token: wsSign(email), email: email });
          if (String(r.rows[0].code) !== String(b.code || '')) return res.status(400).json({ ok: false, error: 'Код буруу байна' });
          if (new Date(r.rows[0].code_exp) < new Date()) return res.status(400).json({ ok: false, error: 'Кодын хугацаа дууссан' });
          await pool.query('UPDATE ws_login SET verified=TRUE, code=NULL WHERE email=$1', [email]);
          // Шинэ хэрэглэгч бүртгүүлсэн — Telegram мэдэгдэл
          try {
            const u = r.rows[0];
            const msg = '🆕 <b>Дасгалын төв — шинэ бүртгэл</b>\n\n'
              + '👤 ' + (u.name || '(нэргүй)') + '\n'
              + '📧 ' + email + (u.phone ? ('\n📱 ' + u.phone) : '');
            sendTelegram(msg).catch(() => {});
          } catch (e) {}
          return res.json({ ok: true, token: wsSign(email), email: email });
        }
        if (b.action === 'ws_resend') {
          const r = await pool.query('SELECT verified FROM ws_login WHERE email=$1', [email]);
          if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Бүртгэлгүй' });
          if (r.rows[0].verified) return res.json({ ok: true, alreadyVerified: true });
          const code = gen6(), exp = new Date(Date.now() + 10 * 60 * 1000);
          await pool.query('UPDATE ws_login SET code=$2, code_exp=$3 WHERE email=$1', [email, code, exp.toISOString()]);
          try { await sendVerifyEmail(email, code, ''); } catch (e) {}
          return res.json({ ok: true, needVerify: true });
        }
      }

      if (b.action === 'save') {
        const title = String(b.title || 'Дасгал').slice(0, 160);
        const note = b.note ? String(b.note).slice(0, 500) : null;
        const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
        if (!items.length) return res.status(400).json({ ok: false, error: 'Бодлого алга' });
        const owner = b.owner ? String(b.owner).slice(0, 80) : null;
        const r = await pool.query(
          'INSERT INTO ws_sets (title, items, note, owner) VALUES ($1,$2,$3,$4) RETURNING id, created_at',
          [title, JSON.stringify(items), note, owner]
        );
        return res.json({ ok: true, code: r.rows[0].id });
      }
      // Дасгалын төвийн нэгдсэн 4 оронтой PIN — тэмдэглэл устгах эрх (нэг удаа үүсгэнэ)
      const WS_PIN_KEY = '*';
      if (b.action === 'pinStatus') {
        const r = await pool.query('SELECT 1 FROM ws_pins WHERE email=$1', [WS_PIN_KEY]);
        return res.json({ ok: true, hasPin: r.rows.length > 0 });
      }
      if (b.action === 'setPin') {
        const pin = String(b.pin || '');
        if (!/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: '4 оронтой PIN оруулна уу' });
        const ex = await pool.query('SELECT pin FROM ws_pins WHERE email=$1', [WS_PIN_KEY]);
        if (ex.rows.length) return res.json({ ok: true, existed: true });   // нэг удаа үүсгэнэ
        await pool.query('INSERT INTO ws_pins (email, pin) VALUES ($1,$2)', [WS_PIN_KEY, pin]);
        return res.json({ ok: true, created: true });
      }
      if (b.action === 'delete') {
        if (!b.code) return res.status(400).json({ ok: false });
        // PIN заавал шаардана (админ ч мөн адил)
        const pin = String(b.pin || '');
        if (!/^\d{4}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN шаардлагатай' });
        const pr = await pool.query('SELECT pin FROM ws_pins WHERE email=$1', [WS_PIN_KEY]);
        if (!pr.rows.length || pr.rows[0].pin !== pin) return res.status(403).json({ ok: false, error: 'PIN буруу байна' });
        // Зөвхөн өөрийн (эзэмшигчийн) тэмдэглэлийг устгана; хуучин эзэмшигчгүй нь нээлттэй
        const owner = b.owner ? String(b.owner).slice(0, 80) : null;
        await pool.query('DELETE FROM ws_sets WHERE id=$1 AND (owner IS NULL OR owner=$2)', [parseInt(b.code), owner]);
        return res.json({ ok: true });
      }
      // Санал хүсэлт — нээлттэй (Telegram-аар мэдэгдэнэ)
      if (b.action === 'feedback') {
        const message = String(b.message || '').trim().slice(0, 2000);
        const contact = b.contact ? String(b.contact).trim().slice(0, 160) : null;
        if (message.length < 2) return res.status(400).json({ ok: false, error: 'Санал хүсэлтээ бичнэ үү' });
        const ins = await pool.query('INSERT INTO ws_feedback (message, contact) VALUES ($1,$2) RETURNING id', [message, contact]);
        const fbId = ins.rows[0].id;
        const tg = '📩 <b>CyberMath — Шинэ санал хүсэлт</b>\n\n' + message +
          (contact ? ('\n\n👤 ' + contact) : '') +
          '\n\n<i>↩ Энэ мессежид Reply бичвэл хэрэглэгчид имэйлээр хариу очно</i>';
        const tgRes = await sendTelegram(tg);
        const mid = tgRes && tgRes.result && tgRes.result.message_id;
        if (mid) { try { await pool.query('UPDATE ws_feedback SET tg_msg_id=$2 WHERE id=$1', [fbId, mid]); } catch (e) {} }
        return res.json({ ok: true });
      }
      // Хэрэглэгч өөрийн явуулсан хүсэлт + админы хариуг харах (нэвтэрсэн хэрэглэгч)
      if (b.action === 'feedback_mine') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.json({ ok: true, feedback: [] });
        const r = await pool.query(
          'SELECT id, message, contact, reply, replied_at, created_at FROM ws_feedback WHERE lower(contact)=$1 ORDER BY created_at DESC LIMIT 50',
          [email]);
        return res.json({ ok: true, feedback: await attachThreads(r.rows) });
      }
      // Хэрэглэгч өөрийн санал хүсэлтэд нэмэлт зурвас бичих (нэвтэрсэн)
      if (b.action === 'feedback_add') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const id = parseInt(b.id, 10);
        const text = String(b.text || '').trim().slice(0, 2000);
        if (!id || text.length < 1) return res.status(400).json({ ok: false, error: 'Зурвасаа бичнэ үү' });
        const r = await pool.query('SELECT id FROM ws_feedback WHERE id=$1 AND lower(contact)=$2', [id, email]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
        await pool.query('INSERT INTO ws_feedback_msg (fb_id, sender, text) VALUES ($1,$2,$3)', [id, 'user', text]);
        const tg = '💬 <b>Хэрэглэгчийн шинэ зурвас</b> (' + email + ')\n\n' + text +
          '\n\n<i>↩ Энэ мессежид Reply бичээд хариулна уу</i>';
        const tr = await sendTelegram(tg);
        const mid = tr && tr.result && tr.result.message_id;
        if (mid) { try { await pool.query('UPDATE ws_feedback SET tg_msg_id=$2 WHERE id=$1', [id, mid]); } catch (e) {} }
        return res.json({ ok: true });
      }
      // ─── Ажлын хуудсын сэтгэгдэл ба reaction (slug-аар) ───
      const REACTS = ['like', 'love', 'haha', 'wow', 'sad', 'clap'];
      const clSlug = (s) => String(s || '').slice(0, 120).toLowerCase().replace(/[^a-z0-9._-]/g, '');
      if (b.action === 'wsc_list') {
        const slug = clSlug(b.slug);
        if (!slug) return res.json({ ok: true, comments: [], reactions: { counts: {}, mine: null } });
        const ukey = String(b.ukey || '').slice(0, 100);
        const c = await pool.query('SELECT id, name, body, is_admin, created_at FROM ws_comments WHERE slug=$1 ORDER BY created_at ASC LIMIT 400', [slug]);
        const rc = await pool.query('SELECT reaction, COUNT(*)::int AS n FROM ws_reactions WHERE slug=$1 GROUP BY reaction', [slug]);
        const counts = {}; rc.rows.forEach(r => { counts[r.reaction] = r.n; });
        let mine = null;
        if (ukey) { const m = await pool.query('SELECT reaction FROM ws_reactions WHERE slug=$1 AND user_key=$2', [slug, ukey]); mine = m.rows[0] ? m.rows[0].reaction : null; }
        return res.json({ ok: true, comments: c.rows.map(x => ({ id: x.id, name: x.name, body: x.body, is_admin: x.is_admin, at: x.created_at })), reactions: { counts, mine } });
      }
      if (b.action === 'wsc_add') {
        const slug = clSlug(b.slug);
        const body = String(b.body || '').trim().slice(0, 1000);
        if (!slug || body.length < 1) return res.status(400).json({ ok: false, error: 'Сэтгэгдлээ бичнэ үү' });
        const email = wsEmailFromToken(b.token);
        const adminFlag = isAdmin(req);
        const name = adminFlag ? 'CyberMath ✔' : (email || String(b.name || '').trim().slice(0, 60) || 'Зочин');
        const ins = await pool.query('INSERT INTO ws_comments (slug, name, email, body, is_admin) VALUES ($1,$2,$3,$4,$5) RETURNING id, created_at', [slug, name, email || null, body, adminFlag]);
        try { await sendTelegram('💬 <b>Ажлын хуудсанд сэтгэгдэл</b> (' + slug + ')\n\n<b>' + name + ':</b> ' + body); } catch (e) {}
        return res.json({ ok: true, comment: { id: ins.rows[0].id, name, body, is_admin: adminFlag, at: ins.rows[0].created_at } });
      }
      if (b.action === 'wsc_react') {
        const slug = clSlug(b.slug);
        const ukey = String(b.ukey || '').slice(0, 100);
        const reaction = String(b.reaction || '');
        if (!slug || !ukey) return res.status(400).json({ ok: false });
        if (!reaction) {
          await pool.query('DELETE FROM ws_reactions WHERE slug=$1 AND user_key=$2', [slug, ukey]);
        } else {
          if (REACTS.indexOf(reaction) < 0) return res.status(400).json({ ok: false, error: 'invalid' });
          await pool.query('INSERT INTO ws_reactions (slug, user_key, reaction) VALUES ($1,$2,$3) ON CONFLICT (slug, user_key) DO UPDATE SET reaction=EXCLUDED.reaction, updated_at=NOW()', [slug, ukey, reaction]);
        }
        const rc = await pool.query('SELECT reaction, COUNT(*)::int AS n FROM ws_reactions WHERE slug=$1 GROUP BY reaction', [slug]);
        const counts = {}; rc.rows.forEach(r => { counts[r.reaction] = r.n; });
        return res.json({ ok: true, counts, mine: reaction || null });
      }
      if (b.action === 'wsc_delete') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_comments WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      // ─── Сургалт (Event) ───
      const normSlots = (v) => {
        let arr = v;
        if (typeof v === 'string') arr = v.split('\n');
        if (!Array.isArray(arr)) arr = [];
        return arr.map(s => String(s || '').trim()).filter(Boolean).slice(0, 20);
      };
      // Идэвхтэй сургалт(ууд) + нэвтэрсэн бол миний бүртгэл — НЭЭЛТТЭЙ
      if (b.action === 'event_active') {
        const r = await pool.query('SELECT id, title, descr, price, slots FROM ws_events WHERE active=TRUE ORDER BY created_at DESC LIMIT 10');
        const email = wsEmailFromToken(b.token);
        let mine = {};
        if (email && r.rows.length) {
          const ids = r.rows.map(x => x.id);
          const m = await pool.query('SELECT event_id, slot, paid FROM ws_event_regs WHERE event_id = ANY($1) AND lower(email)=$2', [ids, email]);
          m.rows.forEach(x => { mine[x.event_id] = { slot: x.slot, paid: x.paid }; });
        }
        return res.json({ ok: true, events: r.rows.map(x => ({ id: x.id, title: x.title, descr: x.descr, price: x.price, slots: x.slots || [], myreg: mine[x.id] || null })) });
      }
      // Сургалтад бүртгүүлэх — ЗААВАЛ НЭВТЭРСЭН
      if (b.action === 'event_register') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Эхлээд нэвтэрнэ үү' });
        const eid = parseInt(b.event_id, 10);
        const slot = String(b.slot || '').trim().slice(0, 120);
        const phone = String(b.phone || '').trim().slice(0, 40);
        const name = String(b.name || '').trim().slice(0, 80) || null;
        const ev = await pool.query('SELECT id, title, price, slots, active FROM ws_events WHERE id=$1', [eid]);
        if (!ev.rows.length || !ev.rows[0].active) return res.status(404).json({ ok: false, error: 'Сургалт олдсонгүй' });
        const slots = (ev.rows[0].slots || []).map(String);
        if (!slot || slots.indexOf(slot) < 0) return res.status(400).json({ ok: false, error: 'Цагаа сонгоно уу' });
        const price = ev.rows[0].price || 20000;
        // Аль хэдийн төлсөн бол дахин бүртгэхгүй
        const ex = await pool.query('SELECT paid FROM ws_event_regs WHERE event_id=$1 AND lower(email)=$2', [eid, email]);
        if (ex.rows.length && ex.rows[0].paid) return res.json({ ok: true, already: true });
        await pool.query(
          `INSERT INTO ws_event_regs (event_id, email, name, phone, slot, amount)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (event_id, email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, slot=EXCLUDED.slot, amount=EXCLUDED.amount`,
          [eid, email, name, phone, slot, price]);
        try { await sendTelegram('📝 <b>Сургалтын бүртгэл</b> (' + ev.rows[0].title + ')\n\n👤 ' + (name || email) + '\n🕒 ' + slot + (phone ? ('\n📞 ' + phone) : '') + '\n💰 ' + price + '₮ — <i>төлбөр хүлээгдэж байна</i>'); } catch (e) {}
        return res.json({ ok: true, price: price, title: ev.rows[0].title, email: email });
      }
      // ── Админ: сургалт удирдах ──
      if (b.action === 'event_list') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const r = await pool.query(`SELECT e.id, e.title, e.descr, e.price, e.slots, e.active, e.created_at,
          (SELECT COUNT(*)::int FROM ws_event_regs r WHERE r.event_id=e.id) AS reg_count,
          (SELECT COUNT(*)::int FROM ws_event_regs r WHERE r.event_id=e.id AND r.paid) AS paid_count
          FROM ws_events e ORDER BY e.created_at DESC LIMIT 100`);
        return res.json({ ok: true, events: r.rows });
      }
      if (b.action === 'event_save') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const title = String(b.title || '').trim().slice(0, 200);
        if (!title) return res.status(400).json({ ok: false, error: 'Гарчиг оруулна уу' });
        const descr = String(b.descr || '').trim().slice(0, 3000);
        const price = Math.max(0, parseInt(b.price, 10) || 20000);
        const slots = JSON.stringify(normSlots(b.slots));
        const active = b.active === false ? false : true;
        const id = parseInt(b.id, 10);
        if (id) {
          await pool.query('UPDATE ws_events SET title=$2, descr=$3, price=$4, slots=$5::jsonb, active=$6 WHERE id=$1', [id, title, descr, price, slots, active]);
          return res.json({ ok: true, id });
        }
        const ins = await pool.query('INSERT INTO ws_events (title, descr, price, slots, active) VALUES ($1,$2,$3,$4::jsonb,$5) RETURNING id', [title, descr, price, slots, active]);
        return res.json({ ok: true, id: ins.rows[0].id });
      }
      if (b.action === 'event_delete') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false });
        await pool.query('DELETE FROM ws_event_regs WHERE event_id=$1', [id]);
        await pool.query('DELETE FROM ws_events WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      if (b.action === 'event_regs') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const eid = parseInt(b.event_id, 10);
        const r = await pool.query('SELECT id, name, email, phone, slot, paid, created_at, paid_at FROM ws_event_regs WHERE event_id=$1 ORDER BY paid DESC, created_at ASC LIMIT 1000', [eid]);
        return res.json({ ok: true, regs: r.rows });
      }
      // ─── Ээлжит хичээлийн төлөвлөгөө (нэвтэрсэн багш, хувийн) ───
      if (b.action === 'lp_list') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const r = await pool.query(
          `SELECT id, title, grade, ldate, updated_at,
                  COALESCE(jsonb_array_length(worksheets),0) AS ws_count
           FROM lesson_plans WHERE lower(owner_email)=$1 ORDER BY updated_at DESC LIMIT 300`, [email]);
        return res.json({ ok: true, plans: r.rows });
      }
      if (b.action === 'lp_get') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const id = parseInt(b.id, 10);
        const r = await pool.query('SELECT * FROM lesson_plans WHERE id=$1 AND lower(owner_email)=$2', [id, email]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
        return res.json({ ok: true, plan: r.rows[0] });
      }
      if (b.action === 'lp_save') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const title = String(b.title || '').trim().slice(0, 200);
        if (!title) return res.status(400).json({ ok: false, error: 'Сэдэв оруулна уу' });
        const grade = String(b.grade || '').slice(0, 40);
        const ldate = String(b.ldate || '').slice(0, 40);
        const duration = String(b.duration || '').slice(0, 40);
        const objectives = String(b.objectives || '').slice(0, 4000);
        const flow = String(b.flow || '').slice(0, 8000);
        const homework = String(b.homework || '').slice(0, 4000);
        let ws = Array.isArray(b.worksheets) ? b.worksheets : [];
        ws = ws.slice(0, 40).map(w => ({
          slug: String((w && w.slug) || '').slice(0, 120),
          title: String((w && w.title) || '').slice(0, 200),
          role: (w && w.role === 'homework') ? 'homework' : 'practice'
        })).filter(w => w.slug);
        const wsJson = JSON.stringify(ws);
        const id = parseInt(b.id, 10);
        if (id) {
          const upd = await pool.query(
            `UPDATE lesson_plans SET title=$3, grade=$4, ldate=$5, duration=$6, objectives=$7, flow=$8, homework=$9, worksheets=$10::jsonb, updated_at=NOW()
             WHERE id=$1 AND lower(owner_email)=$2 RETURNING id`,
            [id, email, title, grade, ldate, duration, objectives, flow, homework, wsJson]);
          if (!upd.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
          return res.json({ ok: true, id: id });
        }
        const ins = await pool.query(
          `INSERT INTO lesson_plans (owner_email, title, grade, ldate, duration, objectives, flow, homework, worksheets)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id`,
          [email, title, grade, ldate, duration, objectives, flow, homework, wsJson]);
        return res.json({ ok: true, id: ins.rows[0].id });
      }
      if (b.action === 'lp_delete') {
        const email = wsEmailFromToken(b.token);
        if (!email) return res.status(401).json({ ok: false, error: 'Нэвтэрнэ үү' });
        const id = parseInt(b.id, 10);
        await pool.query('DELETE FROM lesson_plans WHERE id=$1 AND lower(owner_email)=$2', [id, email]);
        return res.json({ ok: true });
      }
      // Ажлын хуудасны заавар загвар авах — нээлттэй
      if (b.action === 'instr_get') {
        const slug = String(b.slug || '').toLowerCase().slice(0, 120);
        const r = await pool.query('SELECT edits FROM ws_instr WHERE slug=$1', [slug]);
        return res.json({ ok: true, edits: r.rows.length ? (r.rows[0].edits || {}) : {} });
      }
      // Ажлын хуудасны заавар загвар хадгалах — ЗӨВХӨН АДМИН (бүх хэрэглэгчид харагдана)
      if (b.action === 'instr_save') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const slug = String(b.slug || '').toLowerCase().slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false, error: 'slug дутуу' });
        let edits = b.edits && typeof b.edits === 'object' ? b.edits : {};
        // хэт том бичвэрээс хамгаалах
        const clean = {};
        Object.keys(edits).slice(0, 60).forEach(k => { clean[String(k).slice(0, 8)] = String(edits[k] == null ? '' : edits[k]).slice(0, 4000); });
        await pool.query(
          `INSERT INTO ws_instr (slug, edits, updated_at) VALUES ($1,$2::jsonb,NOW())
           ON CONFLICT (slug) DO UPDATE SET edits=EXCLUDED.edits, updated_at=NOW()`,
          [slug, JSON.stringify(clean)]);
        return res.json({ ok: true, edits: clean });
      }
      // Мэдээллийн зурвас (announce) авах — нээлттэй
      if (b.action === 'getAnnounce') {
        const r = await pool.query(`SELECT sval FROM ws_settings WHERE skey='announce'`);
        return res.json({ ok: true, announce: r.rows.length ? (r.rows[0].sval || '') : '' });
      }
      // Мэдээлэл тохируулах + санал хүсэлт харах — ЗӨВХӨН АДМИН
      if (b.action === 'setAnnounce') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const text = String(b.text || '').slice(0, 500);
        await pool.query(
          `INSERT INTO ws_settings (skey, sval, updated_at) VALUES ('announce',$1,NOW())
           ON CONFLICT (skey) DO UPDATE SET sval=EXCLUDED.sval, updated_at=NOW()`, [text]);
        return res.json({ ok: true, announce: text });
      }
      if (b.action === 'feedback_list') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const r = await pool.query('SELECT id, message, contact, reply, replied_at, created_at FROM ws_feedback ORDER BY created_at DESC LIMIT 300');
        return res.json({ ok: true, feedback: await attachThreads(r.rows) });
      }
      // Санал хүсэлтэд хариу бичих — ЗӨВХӨН АДМИН (олон зурвас; имэйлтэй бол имэйлээр илгээнэ)
      if (b.action === 'feedback_reply') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        const reply = String(b.reply || '').trim().slice(0, 2000);
        if (!id || reply.length < 1) return res.status(400).json({ ok: false, error: 'Хариу бичнэ үү' });
        const r = await pool.query('SELECT contact, message FROM ws_feedback WHERE id=$1', [id]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'Олдсонгүй' });
        await pool.query('INSERT INTO ws_feedback_msg (fb_id, sender, text) VALUES ($1,$2,$3)', [id, 'admin', reply]);
        await pool.query('UPDATE ws_feedback SET reply=$2, replied_at=NOW() WHERE id=$1', [id, reply]);
        const contact = String(r.rows[0].contact || '').trim();
        let mailed = false;
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
          try { await sendFeedbackReply(contact, reply, r.rows[0].message); mailed = true; } catch (e) { console.error('[fb reply mail]', e.message); }
        }
        return res.json({ ok: true, mailed: mailed });
      }
      // Санал хүсэлт устгах — ЗӨВХӨН АДМИН
      if (b.action === 'feedback_delete') {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'id дутуу' });
        await pool.query('DELETE FROM ws_feedback_msg WHERE fb_id=$1', [id]);
        await pool.query('DELETE FROM ws_feedback WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      // Нэр өөрчлөх / нуух / сэргээх / дараалал — ЗӨВХӨН АДМИН
      if (['setTitle', 'resetTitle', 'hideTopic', 'unhideTopic', 'purgeTopic', 'setOrder',
           'moveTopic', 'dupTopic', 'removePlacement',
           'sg_create', 'sg_rename', 'sg_delete', 'sg_assign', 'sg_unassign', 'sg_reorder'].indexOf(b.action) >= 0) {
        if (!isAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ өөрчилнө' });
      }
      // ── Ангийн доторх дэд бүлэг (админ) ──
      if (b.action === 'sg_create') {
        const grade = String(b.grade || '').slice(0, 120), name = String(b.name || '').trim().slice(0, 80);
        if (!grade || !name) return res.status(400).json({ ok: false, error: 'grade/name дутуу' });
        const mx = await pool.query('SELECT COALESCE(MAX(pos),0)+1 AS p FROM ws_subgroups WHERE grade=$1', [grade]);
        const ins = await pool.query('INSERT INTO ws_subgroups (grade, name, pos) VALUES ($1,$2,$3) RETURNING id', [grade, name, mx.rows[0].p]);
        return res.json({ ok: true, id: Number(ins.rows[0].id), grade: grade, name: name });
      }
      if (b.action === 'sg_rename') {
        const id = parseInt(b.id, 10), name = String(b.name || '').trim().slice(0, 80);
        if (!id || !name) return res.status(400).json({ ok: false, error: 'id/name дутуу' });
        await pool.query('UPDATE ws_subgroups SET name=$2 WHERE id=$1', [id, name]);
        return res.json({ ok: true });
      }
      if (b.action === 'sg_delete') {
        const id = parseInt(b.id, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'id дутуу' });
        const lbl = 'sg:' + id;
        await pool.query(`DELETE FROM ws_place WHERE grp=$1`, [lbl]);
        await pool.query(`DELETE FROM ws_order WHERE grp=$1`, [lbl]);
        // Хүүхэд дэд бүлгүүдийг дээд түвшинд гаргана (устгахгүй)
        await pool.query('UPDATE ws_subgroups SET parent_id=NULL WHERE parent_id=$1', [id]).catch(() => {});
        await pool.query('DELETE FROM ws_subgroups WHERE id=$1', [id]);
        return res.json({ ok: true });
      }
      // Дэд бүлгийг өөр дэд бүлэг рүү (эцэг болгох) эсвэл дээд түвшинд гаргах
      if (b.action === 'sg_setparent') {
        const id = parseInt(b.id, 10);
        const parent = (b.parent === null || b.parent === undefined || b.parent === '') ? null : parseInt(b.parent, 10);
        if (!id) return res.status(400).json({ ok: false, error: 'id дутуу' });
        if (parent !== null) {
          if (parent === id) return res.status(400).json({ ok: false, error: 'Өөр лүүгээ зөөх боломжгүй' });
          const rows = (await pool.query('SELECT id, grade, parent_id FROM ws_subgroups')).rows;
          const byId = {};
          rows.forEach(r => { byId[Number(r.id)] = { grade: r.grade, parent: r.parent_id != null ? Number(r.parent_id) : null }; });
          if (!byId[id] || !byId[parent]) return res.status(400).json({ ok: false, error: 'олдсонгүй' });
          if (byId[id].grade !== byId[parent].grade) return res.status(400).json({ ok: false, error: 'Өөр ангийн бүлэг' });
          let cur = parent, guard = 0;
          while (cur !== null && guard++ < 100) { if (cur === id) return res.status(400).json({ ok: false, error: 'Мөчлөг үүсэхээр байна' }); cur = byId[cur] ? byId[cur].parent : null; }
        }
        await pool.query('UPDATE ws_subgroups SET parent_id=$2 WHERE id=$1', [id, parent]);
        return res.json({ ok: true });
      }
      // Ажлын хуудсыг дэд бүлэгт оноох — зөвхөн ТУХАЙН АНГИЙН бусад дэд бүлгээс хасч, энэ бүлэгт нэмнэ (өөр анги дахь ижил хуудсанд хүрэхгүй)
      if (b.action === 'sg_assign') {
        const id = parseInt(b.id, 10), slug = String(b.slug||'').slice(0,120);
        if (!id || !slug) return res.status(400).json({ ok: false, error: 'id/slug дутуу' });
        await pool.query(`DELETE FROM ws_place WHERE slug=$1 AND kind='add' AND grp IN (SELECT 'sg:'||id FROM ws_subgroups WHERE grade=(SELECT grade FROM ws_subgroups WHERE id=$2))`, [slug, id]);
        await pool.query(`INSERT INTO ws_place (grp, slug, kind) VALUES ($1,$2,'add') ON CONFLICT DO NOTHING`, ['sg:' + id, slug]);
        return res.json({ ok: true });
      }
      // Дэд бүлгээс хасах — from='sg:ID' өгвөл зөвхөн тэрнээс, эсэхийг тухайн ангийн дэд бүлгүүдээс
      if (b.action === 'sg_unassign') {
        const slug = String(b.slug||'').slice(0,120), from = String(b.from||'').slice(0,120);
        if (!slug) return res.status(400).json({ ok: false, error: 'slug дутуу' });
        if (/^sg:\d+$/.test(from)) {
          const fid = parseInt(from.slice(3), 10);
          await pool.query(`DELETE FROM ws_place WHERE slug=$1 AND kind='add' AND grp IN (SELECT 'sg:'||id FROM ws_subgroups WHERE grade=(SELECT grade FROM ws_subgroups WHERE id=$2))`, [slug, fid]);
        } else {
          await pool.query(`DELETE FROM ws_place WHERE slug=$1 AND kind='add' AND grp=$2`, [slug, from]);
        }
        return res.json({ ok: true });
      }
      if (b.action === 'sg_reorder') {
        const grade = String(b.grade || '').slice(0, 120);
        const ids = Array.isArray(b.ids) ? b.ids.slice(0, 60) : null;
        if (!grade || !ids) return res.status(400).json({ ok: false, error: 'grade/ids дутуу' });
        for (let i = 0; i < ids.length; i++) {
          await pool.query('UPDATE ws_subgroups SET pos=$3 WHERE id=$1 AND grade=$2', [parseInt(ids[i], 10), grade, i]);
        }
        return res.json({ ok: true });
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
      // Бүрмөсөн устгах: бүх байршил, дараалал, нэрийн өөрчлөлтийг устгаж, каталогоос нуух.
      // seed-ийн sg_seeded_pairs хамгаалалт нь дахин нэмэхээс сэргийлнэ (устгасныг сэргээхгүй).
      if (b.action === 'purgeTopic') {
        const slug = String(b.slug || '').slice(0, 120);
        if (!slug) return res.status(400).json({ ok: false, error: 'slug дутуу' });
        await pool.query('DELETE FROM ws_place WHERE slug=$1', [slug]);
        await pool.query('DELETE FROM ws_order WHERE slug=$1', [slug]);
        await pool.query('DELETE FROM ws_titles WHERE slug=$1', [slug]);
        await pool.query('INSERT INTO ws_hidden (slug) VALUES ($1) ON CONFLICT (slug) DO NOTHING', [slug]);
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
