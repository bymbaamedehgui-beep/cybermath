// cyber-math.com Тоглоомын төв — Premium-гүй хэрэглэгчийн тоглоомын туршилт (2026-11-06 эзэмшигч:
// «Premium авсан хүмүүст тоглоомууд үнэгүй … заавал premium авч байж л тоглох … орсны дараа 2 минутын дараа
// худалдан авах цонх руу үсэрдэг»; туршилт тоглоом бүрт ГАНЦ Л удаа; найзын өрөө / ангийн уралдаанд нэгдсэн хүн хязгааргүй).
//
// Туршилтыг (subject, game_key)-ээр НЭГ удаа бүртгэнэ: subject = 'u:<имэйл>' (нэвтэрсэн) ба 'd:<төхөөрөмж>' (клиентийн
// санамсаргүй id). Хоёулаа ирвэл хоёуланд нь бичиж, аль нэг нь ашигласан бол туршилт дууссан гэж үзнэ (бүртгэл солих /
// localStorage цэвэрлэх нь шинэ туршилт өгөхгүй — ws-ийн 5 минутын туршилттай ижил зарчим). Цаг = DB-ийн NOW().
// Энэ модуль эрх ОЛГОХГҮЙ (Premium/тоглоомын эрх qpay.js-д) — зөвхөн туршилтын цагийг тоолно; хязгаарыг клиент хэрэгжүүлнэ.
//   env CM_GAME_GATE=off            → бүх тоглоом үнэгүй (kill-switch)
//   env CM_GAME_PREVIEW_SECONDS     → туршилтын урт (анхдагч 120)
'use strict';
const pool = require('./_db');

// Ангийн тэмцээн/өрөөтэй гадны тоглоомууд — дотор нь «өрөө үүсгэх» ба «нэгдэх»-ийг ялгах боломжгүй (өөр домэйн) тул
// нэгдсэн сурагчийг хаахгүйн тулд одоохондоо үнэгүй үлдээнэ.
const FREE_KEYS = Object.freeze(['blockblast', 'flagbattle', 'songon', 'nicebattle']);

function gateOn(env) {
  const v = String((env || process.env).CM_GAME_GATE || '').trim().toLowerCase();
  return !(v === 'off' || v === 'false' || v === '0' || v === 'no');
}
function previewSeconds(env) {
  const n = parseInt((env || process.env).CM_GAME_PREVIEW_SECONDS, 10);
  return Number.isFinite(n) && n >= 10 && n <= 3600 ? n : 120;
}
function isFree(key) { return FREE_KEYS.indexOf(key) >= 0; }
// Клиентийн төхөөрөмжийн id — 16–64 тэмдэгт [a-z0-9_-]
function cleanDevice(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return /^[a-z0-9_-]{16,64}$/.test(s) ? s : null;
}
function subjectsOf(email, device) {
  const out = [];
  if (email) out.push('u:' + String(email).trim().toLowerCase().slice(0, 254));
  const d = cleanDevice(device);
  if (d) out.push('d:' + d);
  return out;
}

let _ready = null;
function ensureTable() {
  if (!_ready) {
    _ready = pool.query(`CREATE TABLE IF NOT EXISTS cm_game_previews (
      subject TEXT NOT NULL,
      game_key TEXT NOT NULL,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (subject, game_key)
    )`).catch(function (e) { _ready = null; throw e; });
  }
  return _ready;
}

// Туршилт эхлүүлэх/үргэлжлүүлэх. → { ok:true, until, now } (идэвхтэй) | { ok:false, used:true, until, now } (дууссан)
// Анх удаа бол бүх subject-д NOW()-оор бичнэ; аль нэг subject өмнө нь эхлүүлсэн бол хамгийн эртний цагаар тооцно.
async function start(subjects, key, seconds) {
  await ensureTable();
  const r = await pool.query(
    `WITH ins AS (
       INSERT INTO cm_game_previews (subject, game_key)
       SELECT s, $2 FROM unnest($1::text[]) AS s
       ON CONFLICT (subject, game_key) DO NOTHING
       RETURNING started_at
     )
     SELECT LEAST((SELECT MIN(started_at) FROM ins),
                  (SELECT MIN(started_at) FROM cm_game_previews WHERE game_key = $2 AND subject = ANY($1::text[]))) AS started_at,
            NOW() AS now`, [subjects, key]);
  const row = r.rows[0] || {};
  const now = new Date(row.now || Date.now());
  const until = new Date(new Date(row.started_at || now).getTime() + seconds * 1000);
  return { ok: until > now, used: !(until > now), until: until, now: now };
}

// Тоглоом бүрийн төлөв: { used: [key…], active: { key: until } }
async function status(subjects, seconds) {
  await ensureTable();
  const r = await pool.query(
    `SELECT game_key, MIN(started_at) AS started_at, NOW() AS now FROM cm_game_previews
      WHERE subject = ANY($1::text[]) GROUP BY game_key`, [subjects]);
  const used = [], active = {};
  r.rows.forEach(function (x) {
    const until = new Date(new Date(x.started_at).getTime() + seconds * 1000);
    if (until > new Date(x.now)) active[x.game_key] = until.toISOString(); else used.push(x.game_key);
  });
  return { used: used, active: active };
}

module.exports = { FREE_KEYS, gateOn, previewSeconds, isFree, cleanDevice, subjectsOf, ensureTable, start, status };
