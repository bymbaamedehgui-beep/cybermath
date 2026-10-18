// Тоглоомын API — каталог, эрхийн төлөв, тоглоом эхлүүлэх (launch тасалбар), олон тоглогчийн урилга.
// Эрх (realm, email, game_key)-ээр тусдаа (api/_games.js): 'ws' = Дасгалын төв (body.wstoken, ws:true),
// 'cm' = cyber-math.com (Authorization: Bearer cm_token, tv шалгана). Нэг realm-ийн токен нөгөөд хүчингүй.
// Энэ endpoint эрх ОЛГОХГҮЙ — зөвхөн уншиж, тасалбар/урилга гаргана (олголт: api/qpay.js settlePay + админ).
//
//   GET  ?action=catalog[&realm=ws|cm]         (нийтийн) → { ok, enabled, realm?, price, days, invite_hours, games:[{key,title,kind,multi}] }
//                                              (enabled = GM.paywallOn(realm); realm байхгүй бол gate-ийн төлөв)
//   POST ?action=status  {realm, wstoken?}     → { ok, enabled, realm, email, premium, price, days, games:{key: expires_at} }
//   POST ?action=launch  {game, realm, wstoken?, invite?}   (+ x-device-id толгой — урилгаар нэгдэхэд төхөөрөмж уяна)
//        Дараалал: Bearer admin → нэвтэрсэн бөгөөд өөрийн эрхтэй (урилга ЗАРЦУУЛАХГҮЙ) → урилга → 401/403/402.
//        эрхтэй   → { ok:true, game, kind, via, expires_at?, url? }
//                   kind='file'     → url = <тоглоомын зам>?t=<launch тасалбар> (gate түгжээтэй үед; нээлттэй бол шууд зам;
//                                     120 сек, нэг удаагийн jti — gate шалгана;
//                                     sub = тунгалаг 'u:…' — имэйл URL-д орохгүй; sx = эрхийн дуусах огноо)
//                   kind='inline'   → url байхгүй (клиент gate)
//                   kind='external' → url = гадны хаяг (клиент gate)
//        эрхгүй   → 402 { ok:false, needBuy:true, price, days }
//        invite   → host-ийн урилга (олон тоглогчтой тоглоом): өөрийн эрхгүй, нэвтрээгүй ч зөвшөөрнө. Урилга анх нэгдсэн
//                   төхөөрөмж(үүд)-д уягдана (≤ GAMES[g].guests; өөр төхөөрөмж → 403 reason 'full'), нийт ачаалалт
//                   ≤ GAME_INVITE_USES. Тасалбарын sub='inv:<jti>' → gate богино (30 мин) сесс (GM.sessionExp).
//                   invite '' / null → урилгагүй гэж үзнэ.
//   POST ?action=invite  {game, realm, wstoken?} (зөвхөн multi тоглоом, зөвхөн эрхтэй host; host нэг тоглоомд өдөрт
//        GAME_INVITE_DAILY (5) урилга) → { ok:true, game, realm, invite, expires_at, max_uses, guests, url }
//        (url = найздаа илгээх харьцангуй холбоос)
//
// Дасгалын төвийн токен: 2 төхөөрөмжийн хязгаар (api/_wsdev.js checkReq — wsstatus-ийн логик) status/launch/invite бүгдэд.
// DB алдаа → 503 (fail-closed). Төлбөр асаалттай эсэх нь realm-ээр: GM.paywallOn(realm) — env GAME_PAYWALL_REALMS
// (тавиагүй → GM.DEFAULT_PAYWALL_REALMS = ['ws']: эхний ээлжинд Дасгалын төвд л), GAME_PAYWALL=off → бүгд нээлттэй.
// Төлбөргүй realm-д launch нэвтрэлт шаардахгүй (via 'off'), файл тоглоомд gate түгжээтэй үед л тасалбар (launchOut).
// catalog ?realm=ws|cm → тухайн realm-ийн enabled; realm-гүй → gate-ийн төлөв (GM.gateOn()).
'use strict';
const guard = require('./_guard');
const GM = require('./_games');
const WDEV = require('./_wsdev');

const MSG = {
  login: 'Тоглохын тулд эхлээд нэвтэрнэ үү.',
  game: 'Тоглоом олдсонгүй',
  bad: 'Хүсэлт буруу байна',
  rate: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.',
  tmp: 'Түр алдаа гарлаа. Дахин оролдоно уу.',
  multi: 'Энэ тоглоом олон тоглогчтой биш тул урилга үүсгэх боломжгүй.',
  invite: 'Урилга хүчингүй эсвэл хугацаа нь дууссан байна. Найзаасаа шинэ урилга аваарай.',
  inviteUsed: 'Энэ урилгаар нэгдэх боломж дууссан байна. Найзаасаа шинэ урилга аваарай.',
  inviteFull: 'Энэ урилгаар өөр төхөөрөмжөөс аль хэдийн нэгдсэн байна. Найзаасаа шинэ урилга аваарай.',
  inviteRealm: 'Энэ урилга өөр сайтынх байна.',
  mismatch: 'Энэ нэвтрэлт өөр төхөөрөмжийнх байна. Энэ төхөөрөмж дээрээ дахин нэвтэрнэ үү.',
};
function msgDeviceLimit(max) {
  return 'Энэ бүртгэл аль хэдийн ' + max + ' төхөөрөмж дээр нэвтэрсэн байна. Шинэ төхөөрөмж нэмэхийн тулд хуучнаас нь нэгийг салгана уу.';
}
function msgNeedBuy(price) {
  return 'Энэ тоглоомыг тоглохын тулд 1 сарын эрх (' + price + '₮) авна уу.';
}
function msgInviteDaily(n) {
  return 'Энэ тоглоомын урилгын өдрийн хязгаар (' + n + ') дууссан. Өмнө илгээсэн урилгаа ашиглана уу эсвэл маргааш дахин оролдоно уу.';
}
function msgInvite(reason) {
  if (reason === 'used_up') return MSG.inviteUsed;
  if (reason === 'full') return MSG.inviteFull;
  if (reason === 'realm') return MSG.inviteRealm;
  return MSG.invite;
}
// Урилгаар нэгдэж буй найзын төхөөрөмжийн түлхүүр: x-device-id (Дасгалын төвийн cm_device-тэй ижил), байхгүй бол ip|ua.
// Утга нь хэрэглэгчийн мэдэлд ч хязгаар нь «ялгаатай түлхүүрийн тоо ≤ guests» тул өөр утга илгээх нь шинэ байр л эзэлнэ.
function inviteDevKey(req, ip) {
  const d = WDEV.deviceIdFrom(req);
  if (d) return 'd:' + d;
  const h = (req && req.headers) || {};
  return 'h:' + ip + '|' + String(h['user-agent'] || '').slice(0, 200);
}
// Урилгыг нээх хуудас (харьцангуй; клиент location.origin-оо урд нь залгана)
const INVITE_PAGE = Object.freeze({ cm: '/', ws: '/worksheets' });

function bodyOf(req) {
  let b = req && req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {};
}
function gameKeyOf(v) {
  const k = typeof v === 'string' ? v.trim() : '';
  return GM.isGame(k) ? k : null;
}
function fail(status, body) { return { ok: false, status: status, body: Object.assign({ ok: false }, body) }; }

// Хэрэглэгч таних. realm-ийн токеныг л хүлээн авна:
//   cm → GM.cmUser (Bearer, tv; admin/ws/uid токен татгалзана), ws → guard.wsPayload(body.wstoken) + 2 төхөөрөмжийн хязгаар.
// → { ok:true, realm, email } | fail(...). DB алдаа → throw (дуудагч 503).
async function identify(req, b, realm) {
  if (realm === 'cm') {
    const u = await GM.cmUser(req);
    const email = u && GM.normEmail(u.email);
    if (!email) return fail(401, { needLogin: true, error: MSG.login });
    return { ok: true, realm: 'cm', email: email };
  }
  const p = guard.wsPayload(b.wstoken);
  const email = p && GM.normEmail(p.email);
  if (!email) return fail(401, { needLogin: true, error: MSG.login });
  const d = await WDEV.checkReq(req, email, b.wstoken, p.dev || null);
  if (!d.ok) {
    return fail(403, {
      needLogin: true, deviceBlocked: true, reason: d.error || 'DEVICE_LIMIT',
      max: d.max || WDEV.MAX_DEVICES,
      error: d.error === 'DEVICE_MISMATCH' ? MSG.mismatch : msgDeviceLimit(d.max || WDEV.MAX_DEVICES),
      devices: (d.devices || []).map(function (x) { return { id: x.device_id, label: x.label, last_seen: x.last_seen }; }),
    });
  }
  return { ok: true, realm: 'ws', email: email };
}

// Амжилттай launch-ийн хариу. who = { r, sub, sx? } — эрхтэй хэрэглэгч/урилга/админ; who=null — realm төлбөргүй (via 'off').
// sub: GM.subjectOf(...) | 'inv:<jti>' | 'admin' | 'open' — имэйл ХЭЗЭЭ Ч биш (signTicket шалгана).
// Файл тоглоомын тасалбар зөвхөн gate түгжээтэй үед (GM.gateOn() — 'cm' төлбөртэй). Эхний ээлжинд ('ws' л төлбөртэй)
// gate нээлттэй тул ws-ийн эрхтэй хэрэглэгчид ч шууд зам (gate ?t=-г зүгээр л 302-оор цэвэрлэх байсан).
// Gate түгжээтэй атал энэ realm төлбөргүй бол (ж: GAME_PAYWALL_REALMS=cm үеийн ws) нэвтрэлтгүй 'open' тасалбар —
// эс бөгөөс тасалбаргүй url түгжээтэй хуудас харуулна.
function launchOut(key, who, via, expiresAt, realm) {
  const G = GM.GAMES[key];
  const o = { ok: true, game: key, kind: G.kind, via: via };
  if (expiresAt) o.expires_at = new Date(expiresAt).toISOString();
  if (G.kind === 'file') {
    if (!who && realm) who = { r: realm, sub: 'open' };
    if (who && GM.gateOn()) {
      const t = GM.signTicket({ g: key, r: who.r, sub: who.sub, sx: who.sx || null });
      o.url = G.path + '?t=' + encodeURIComponent(t.token);
      o.ticket_ttl = GM.TICKET_TTL;
    } else {
      o.url = G.path;
    }
  } else if (G.kind === 'external') {
    o.url = G.url;
  }
  return o;
}

async function limited(key, max, win) { return !(await guard.rateLimit(key, max, win)); }

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Device-Id, X-Device-Fp');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const action = String(((req.query || {}).action) || '');

  try {
    // ── Каталог (нийтийн, DB-гүй) ──
    if (action === 'catalog') {
      if (req.method !== 'GET') return res.status(405).json({ ok: false, error: MSG.bad });
      res.setHeader('Cache-Control', 'public, max-age=60');
      // ?realm=ws|cm → тухайн сайтын төлбөрийн төлөв (URL-аар ялгарах тул public кэш зөв); байхгүй бол gate-ийн төлөв
      const cr = GM.normRealm((req.query || {}).realm);
      const out = {
        ok: true, enabled: GM.paywallOn(cr), price: GM.gamePrice(), days: GM.GAME_DAYS,
        invite_hours: GM.INVITE_TTL / 3600, games: GM.publicCatalog(),
      };
      if (cr) out.realm = cr;
      return res.json(out);
    }

    res.setHeader('Cache-Control', 'no-store');
    if (guard.secretMissing(res)) return;
    if (action !== 'status' && action !== 'launch' && action !== 'invite') return res.status(400).json({ ok: false, error: MSG.bad });
    if (req.method !== 'POST' && !(action === 'status' && req.method === 'GET')) return res.status(405).json({ ok: false, error: MSG.bad });

    const b = bodyOf(req);
    const q = req.query || {};
    const realm = GM.normRealm(b.realm != null ? b.realm : q.realm);
    if (!realm) return res.status(400).json({ ok: false, error: MSG.bad });
    const ip = guard.clientIp(req);

    // ── Эрхийн төлөв ──
    if (action === 'status') {
      if (await limited('games_st_ip:' + ip, 300, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
      const id = await identify(req, b, realm);
      if (!id.ok) return res.status(id.status).json(id.body);
      const games = await GM.activeGames(realm, id.email);
      const premium = realm === 'cm' ? await GM.isCmPremium(id.email) : false;
      return res.json({
        ok: true, enabled: GM.paywallOn(realm), realm: realm, email: id.email, premium: premium,
        price: GM.gamePrice(), days: GM.GAME_DAYS, games: games,
      });
    }

    const key = gameKeyOf(b.game);
    if (!key) return res.status(400).json({ ok: false, error: MSG.game });
    const G = GM.GAMES[key];

    // ── Тоглоом эхлүүлэх ──
    if (action === 'launch') {
      if (await limited('games_l_ip:' + ip, 300, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
      // Kill-switch / энэ realm-д төлбөргүй: бүгд нээлттэй (одоогийнх шиг) — нэвтрэлт, тасалбар шаардахгүй
      if (!GM.paywallOn(realm)) return res.json(launchOut(key, null, 'off', null, realm));

      // Админ (туршилт)
      if (guard.requireAdmin(req)) return res.json(launchOut(key, { r: realm, sub: 'admin' }, 'admin', null));

      // invite: '' / null → урилгагүй; мөр биш бол 400
      const invTok = b.invite == null || b.invite === '' ? null : b.invite;
      if (invTok !== null && typeof invTok !== 'string') return res.status(400).json({ ok: false, error: MSG.bad });

      // 1) Нэвтэрсэн бөгөөд өөрийн эрхтэй бол урилгыг ЗАРЦУУЛАХГҮЙ (хүчингүй урилга эрхтэй хэрэглэгчийг хаахгүй).
      //    Токенгүй бол identify DB-д хандалгүй 401 буцаана.
      const id = await identify(req, b, realm);
      if (id.ok) {
        if (await limited('games_l:' + realm + ':' + id.email.slice(0, 254), 60, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
        const ent = await GM.entitlement(realm, id.email, key);
        if (ent.ok) {
          return res.json(launchOut(key, { r: realm, sub: GM.subjectOf(realm, id.email), sx: ent.expires_at }, ent.via, ent.expires_at));
        }
      }

      // 2) Урилгаар нэгдэх (зөвхөн multi тоглоом; host-ийн эрх ОДОО хүчинтэй; урилга найзын төхөөрөмжид уягдана)
      if (invTok !== null) {
        if (await limited('games_ij_ip:' + ip, 60, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
        const inv = await GM.redeemInvite(invTok, realm, key, inviteDevKey(req, ip));
        if (!inv.ok) return res.status(403).json({ ok: false, inviteInvalid: true, reason: inv.reason, error: msgInvite(inv.reason) });
        return res.json(launchOut(key, { r: realm, sub: 'inv:' + inv.jti, sx: inv.expires_at }, 'invite', null));
      }

      if (!id.ok) return res.status(id.status).json(id.body);
      const price = GM.gamePrice();
      return res.status(402).json({ ok: false, needBuy: true, game: key, realm: realm, price: price, days: GM.GAME_DAYS, error: msgNeedBuy(price) });
    }

    // ── Олон тоглогчийн урилга (зөвхөн эрхтэй host) ──
    if (!G.multi) return res.status(400).json({ ok: false, error: MSG.multi });
    if (await limited('games_inv_ip:' + ip, 120, 600)) return res.status(429).json({ ok: false, error: MSG.rate });
    const id = await identify(req, b, realm);
    if (!id.ok) return res.status(id.status).json(id.body);
    const page = INVITE_PAGE[realm] + '?game=' + encodeURIComponent(key);
    if (!GM.paywallOn(realm)) {
      // Бүгд нээлттэй үед урилгын токен хэрэггүй — найз шууд тоглоно
      return res.json({ ok: true, game: key, realm: realm, via: 'off', invite: null, expires_at: null, max_uses: null, guests: null, url: page });
    }
    const ent = await GM.entitlement(realm, id.email, key);
    if (!ent.ok) {
      const price = GM.gamePrice();
      return res.status(402).json({ ok: false, needBuy: true, game: key, realm: realm, price: price, days: GM.GAME_DAYS, error: msgNeedBuy(price) });
    }
    // Host нэг тоглоомд өдөрт GAME_INVITE_DAILY (эрхтэй үед л тоолно — эрх авахаас өмнөх оролдлого хязгаарыг идэхгүй)
    const daily = GM.inviteDaily();
    if (await limited('games_inv_d:' + realm + ':' + key + ':' + id.email.slice(0, 254), daily, 86400)) {
      return res.status(429).json({ ok: false, inviteLimit: true, max: daily, error: msgInviteDaily(daily) });
    }
    const inv = await GM.createInvite(realm, id.email, key);
    return res.json({
      ok: true, game: key, realm: realm, via: ent.via, invite: inv.token,
      expires_at: inv.expires_at.toISOString(), max_uses: inv.max_uses, guests: inv.guests,
      url: page + '&ginv=' + encodeURIComponent(inv.token),
    });
  } catch (e) {
    console.error('[games]', action, e && e.message);
    return res.status(503).json({ ok: false, error: MSG.tmp });
  }
};
