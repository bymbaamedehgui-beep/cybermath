// Дасгалын төв — слайд тоглуулагч (PowerPoint → анимейшнтэй видео, AES-128 HLS). Хувиргагч: tools/ppt/ppt2hls.js
//
//   GET  ?action=list                    (нийтийн) → { ok, decks:[{id,title,grade,topic,slides,steps,duration,poster,preview}] }
//   GET  ?action=list&all=1  (Bearer admin)          → нуусан ч орно (+hidden, sort, created_at)
//   POST ?action=open  {id, wstoken}     (+ x-device-id) → { ok, id, title, grade, slides, full, preview, holds, starts,
//                                                          duration, m3u8, mark }
//        full=false (эрхгүй / нэвтрээгүй) → эхний preview слайд л (holds ба плейлист тасарна)
//        src = /api/wsppt?action=m3u8&t=<10 мин JWT> (hls.js ба Safari-ийн native HLS хоёулаа URL-аар ачаална)
//   GET  ?action=m3u8&t=<jwt>                        → плейлист (preview бол тасалсан); түлхүүрийн URI = ?action=key&k=<JWT>
//   GET  ?action=key&k=<jwt>                         → 16 байт түлхүүр (no-store) — түлхүүр DB-д л хадгалагдана
//   POST ?action=admin_update {id, title?, grade?, topic?, sg_id?, sort?, hidden?, preview_slides?}   (Bearer admin)
//   POST ?action=admin_delete {id}                   (Bearer admin) — Blob файлуудыг ч устгана
//
//   POST ?action=mine  {wstoken}                     → { ok, price, owned:{id: expires_at} }  (сагс/товчны төлөв)
//   GET  ?action=admin_purchases (Bearer admin)      → сүүлийн худалдан авалтууд (ws_ppt_purchases)
//   POST ?action=admin_grant {email, ids, days}      (Bearer admin) — мөнгөгүй олголт (орлогод орохгүй)
//
// Эрх: слайд бүр ТУСДАА худалдан авна — 1 хичээл × 1 сар (PPT_PRICE, анхдагч 1900₮), сагсаар нэг нэхэмжлэхээр
// (api/qpay.js plan='ppt' → api/_wsppt_pay.js). PPT_WS_INCLUDED=1 бол ажлын хуудасны эрх (бүх анги / тухайн анги /
// туршилт) ч бүтнээр үзүүлнэ. Эрхгүй бол эхний preview_slides слайд. WS_PAYWALL=off → бүгд нээлттэй.
// Төхөөрөмжийн хязгаар (api/_wsdev.js checkReq) ажлын хуудастай ижил. DB алдаа → 503.
'use strict';
const pool = require('./_db');
const jwt = require('jsonwebtoken');
const guard = require('./_guard');
const WG = require('./_wsgrade');
const WT = require('./_wstrial');
const WDEV = require('./_wsdev');
const { DDL } = require('./_wsppt_sql');
const PP = require('./_wsppt_pay');

let ready = null;
function ensure() {
  if (!ready) ready = pool.query(DDL).catch(function (e) {
    if (e && (e.code === '23505' || e.code === '42P07')) return;
    ready = null; throw e;
  });
  return ready;
}
const intId = v => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
function verifyTok(t, typ) {
  try {
    const p = jwt.verify(String(t || ''), guard.jwtSecret(), { algorithms: ['HS256'] });
    return p && p.typ === typ && intId(p.pk) ? p : null;
  } catch (e) { return null; }
}
const asArr = v => (Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : []));

function maskEmail(e) {
  const s = String(e || ''); const at = s.indexOf('@');
  if (at < 1) return s;
  const u = s.slice(0, at);
  return (u.length <= 3 ? u[0] + '**' : u.slice(0, 3) + '***' + u.slice(-1)) + s.slice(at);
}

/* Эрх: { full, email, reason, until? } — reason: 'off' | 'admin' | 'ppt' | 'all' | 'grade' | 'trial' | 'login' | 'buy' | 'device'
   Слайд нь ТУСДАА бүтээгдэхүүн: тухайн хичээлийг худалдан авсан (ws_ppt_access, 1 сар) бол бүтнээр.
   PPT_WS_INCLUDED=1 үед ажлын хуудасны эрх (бүх анги / тухайн анги / туршилт) ч бүтэн үзүүлнэ. */
async function access(req, b, grade, id) {
  if (process.env.WS_PAYWALL === 'off') return { full: true, reason: 'off' };
  if (guard.requireAdmin(req)) return { full: true, reason: 'admin' };
  const tok = b.wstoken ? String(b.wstoken) : '';
  const email = guard.wsEmail(tok);
  if (!email) return { full: false, reason: 'login' };
  const tokDev = (guard.wsPayload(tok) || {}).dev || null;
  const dchk = await WDEV.checkReq(req, email, tok, tokDev);
  if (!dchk.ok && dchk.error !== 'NO_DEVICE') return { full: false, email, reason: 'device' };
  const until = await PP.expiryFor(email, id);
  if (until) return { full: true, email, reason: 'ppt', until };
  if (!PP.wsIncluded()) return { full: false, email, reason: 'buy' };
  const a = await pool.query('SELECT 1 FROM ws_access WHERE email=$1 AND expires_at > NOW()', [email]);
  if (a.rows.length) return { full: true, email, reason: 'all' };
  const owned = (await WG.activeGrades(email)).map(x => x.grade);
  if (owned.indexOf(grade) >= 0) return { full: true, email, reason: 'grade' };
  let trial = null;
  try { trial = await WT.status(email, req, { dev: WDEV.deviceIdFrom(req) || tokDev }); } catch (e) { console.error('[wsppt trial]', e.message); }
  if (trial && trial.active) return { full: true, email, reason: 'trial', trialUntil: trial.until };
  return { full: false, email, reason: 'buy' };
}

/* Плейлистийг preview-ийн төгсгөл (cut сек) хүртэл таслана — тухайн хугацааг агуулсан хэсэг хүртэл. */
function cutPlaylist(m3u8, cut) {
  const L = m3u8.split('\n'), out = [];
  let t = 0, pendingInf = null;
  for (const line of L) {
    if (/^#EXT-X-ENDLIST/.test(line)) continue;
    if (/^#EXTINF:/.test(line)) { pendingInf = line; continue; }
    if (pendingInf && line && !line.startsWith('#')) {
      if (t >= cut) break;
      out.push(pendingInf, line);
      t += parseFloat(pendingInf.slice(8)) || 0;
      pendingInf = null;
      continue;
    }
    if (!pendingInf) out.push(line);
  }
  out.push('#EXT-X-ENDLIST');
  return out.join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String((req.query && req.query.action) || '');
  try {
    await ensure();

    if (req.method === 'GET' && action === 'list') {
      const all = req.query.all === '1' && guard.requireAdmin(req);
      const r = await pool.query(`SELECT id, title, grade, topic, sg_id, sort, hidden, slides, steps, duration, poster, preview_slides, created_at
        FROM ws_ppt ${all ? '' : 'WHERE hidden = FALSE'} ORDER BY grade, sort, id`);
      return res.json({ ok: true, price: PP.pptPrice(), days: PP.PPT_DAYS, decks: r.rows.map(d => Object.assign({
        id: d.id, title: d.title, grade: d.grade, topic: d.topic, sg: d.sg_id, slides: d.slides, steps: d.steps,
        duration: Math.round(d.duration), poster: d.poster, preview: d.preview_slides,
      }, all ? { hidden: d.hidden, sort: d.sort, created_at: d.created_at } : {})) });
    }

    if (req.method === 'GET' && action === 'm3u8') {
      const p = verifyTok(req.query.t, 'pptm');
      if (!p) return res.status(403).end();
      const r = await pool.query('SELECT m3u8, starts, duration, slides FROM ws_ppt WHERE id=$1', [p.pk]);
      if (!r.rows.length) return res.status(404).end();
      const d = r.rows[0];
      let m3u8 = d.m3u8;
      if (!p.full) { const st = asArr(d.starts); m3u8 = cutPlaylist(m3u8, p.pv < st.length ? st[p.pv] : d.duration); }
      const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0];
      const base = proto + '://' + String(req.headers['x-forwarded-host'] || req.headers.host || 'cyber-math.com');
      const k = jwt.sign({ typ: 'pptk', pk: p.pk }, guard.jwtSecret(), { expiresIn: 600, algorithm: 'HS256' });
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.status(200).send(m3u8.replace(/__KEY__/g, base + '/api/wsppt?action=key&k=' + encodeURIComponent(k)));
    }

    if (req.method === 'GET' && action === 'key') {
      const p = verifyTok(req.query.k, 'pptk');
      if (!p) return res.status(403).end();
      const r = await pool.query('SELECT key_hex FROM ws_ppt WHERE id=$1', [p.pk]);
      if (!r.rows.length) return res.status(404).end();
      res.setHeader('Content-Type', 'application/octet-stream');
      return res.status(200).send(Buffer.from(r.rows[0].key_hex, 'hex'));
    }

    if (req.method === 'GET' && action === 'admin_purchases') {
      if (!guard.requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      await PP.ensure();
      const r = await pool.query('SELECT invoice_id, email, ppt_ids, n, amount, days, created_at FROM ws_ppt_purchases ORDER BY created_at DESC LIMIT 200');
      const t = await pool.query("SELECT COUNT(*)::int n, COALESCE(SUM(amount),0)::int s, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int n30, COALESCE(SUM(amount) FILTER (WHERE created_at > NOW() - INTERVAL '30 days'),0)::int s30 FROM ws_ppt_purchases");
      const act = await pool.query('SELECT COUNT(DISTINCT email)::int users, COUNT(*)::int rows FROM ws_ppt_access WHERE expires_at > NOW()');
      return res.json({ ok: true, price: PP.pptPrice(), totals: t.rows[0], active: act.rows[0], purchases: r.rows });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });
    const b = req.body || {};

    if (action === 'mine') {
      const email = guard.wsEmail(b.wstoken ? String(b.wstoken) : '');
      if (!email) return res.json({ ok: true, price: PP.pptPrice(), owned: {}, login: false });
      return res.json({ ok: true, price: PP.pptPrice(), owned: await PP.owned(email), login: true, all: PP.wsIncluded() || undefined });
    }

    if (action === 'admin_grant') {
      if (!guard.requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'Зөв имэйл оруулна уу' });
      const ids = PP.normIds(b.ids);
      if (!ids.length) return res.status(400).json({ ok: false, error: 'Слайд сонгоно уу' });
      const days = Math.max(1, Math.min(366, parseInt(b.days, 10) || PP.PPT_DAYS));
      await PP.ensure();
      return res.json({ ok: true, expires: await PP.grant(email, ids, days) });
    }

    if (action === 'open') {
      const id = intId(b.id);
      if (!id) return res.status(400).json({ ok: false, error: 'id' });
      const r = await pool.query('SELECT * FROM ws_ppt WHERE id=$1', [id]);
      const d = r.rows[0];
      if (!d || (d.hidden && !guard.requireAdmin(req))) return res.status(404).json({ ok: false, error: 'Слайд олдсонгүй' });
      const acc = await access(req, b, d.grade, id);
      if (acc.reason === 'device') return res.json({ ok: false, deviceBlocked: true, error: 'Төхөөрөмжийн хязгаар' });
      const holds = asArr(d.holds), starts = asArr(d.starts);
      const prev = Math.max(0, Math.min(d.slides, d.preview_slides | 0));
      const full = acc.full;
      if (!full && !prev) return res.json({ ok: true, id, title: d.title, grade: d.grade, slides: d.slides, full: false, preview: 0,
        reason: acc.reason, holds: [], starts: [], src: null });
      const H = full ? holds : holds.filter(h => h[2] <= prev);
      const t = jwt.sign({ typ: 'pptm', pk: id, full: !!full, pv: prev }, guard.jwtSecret(), { expiresIn: 600, algorithm: 'HS256' });
      return res.json({
        ok: true, id, title: d.title, grade: d.grade, topic: d.topic, slides: d.slides, full, preview: prev,
        reason: acc.reason, trialUntil: acc.trialUntil || null, until: acc.until || null, price: PP.pptPrice(), poster: d.poster || null, holds: H, starts: full ? starts : starts.slice(0, prev),
        duration: d.duration, src: '/api/wsppt?action=m3u8&t=' + encodeURIComponent(t),
        mark: acc.email ? maskEmail(acc.email) : null,
      });
    }

    if (action === 'admin_update' || action === 'admin_delete') {
      if (!guard.requireAdmin(req)) return res.status(401).json({ ok: false, error: 'Зөвхөн админ' });
      const id = intId(b.id);
      if (!id) return res.status(400).json({ ok: false, error: 'id' });
      if (action === 'admin_delete') {
        const r = await pool.query('DELETE FROM ws_ppt WHERE id=$1 RETURNING blobs', [id]);
        if (!r.rows.length) return res.status(404).json({ ok: false, error: 'олдсонгүй' });
        let removed = 0;
        const urls = asArr(r.rows[0].blobs);
        if (urls.length && process.env.BLOB_READ_WRITE_TOKEN) {
          try {
            const { del } = require('@vercel/blob');
            for (let i = 0; i < urls.length; i += 100) { await del(urls.slice(i, i + 100), { token: process.env.BLOB_READ_WRITE_TOKEN }); removed += Math.min(100, urls.length - i); }
          } catch (e) { console.error('[wsppt blob del]', e.message); }
        }
        return res.json({ ok: true, removed });
      }
      const sets = [], vals = [];
      const add = (col, v) => { vals.push(v); sets.push(col + '=$' + vals.length); };
      if (typeof b.title === 'string' && b.title.trim()) add('title', b.title.trim().slice(0, 200));
      if (typeof b.grade === 'string' && b.grade.trim()) add('grade', b.grade.trim().slice(0, 40));
      if (b.topic !== undefined) add('topic', b.topic ? String(b.topic).trim().slice(0, 200) : null);
      if (b.sort !== undefined && Number.isFinite(+b.sort)) add('sort', Math.round(+b.sort));
      if (b.sg_id !== undefined) add('sg_id', intId(b.sg_id));
      if (b.hidden !== undefined) add('hidden', !!b.hidden);
      if (b.preview_slides !== undefined && Number.isFinite(+b.preview_slides)) add('preview_slides', Math.max(0, Math.min(50, Math.round(+b.preview_slides))));
      if (!sets.length) return res.status(400).json({ ok: false, error: 'өөрчлөх зүйл алга' });
      vals.push(id);
      const r = await pool.query('UPDATE ws_ppt SET ' + sets.join(', ') + ' WHERE id=$' + vals.length + ' RETURNING id', vals);
      if (!r.rows.length) return res.status(404).json({ ok: false, error: 'олдсонгүй' });
      return res.json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'action' });
  } catch (e) {
    console.error('[wsppt]', e.message);
    return res.status(503).json({ ok: false, error: 'Түр алдаа гарлаа' });
  }
};
