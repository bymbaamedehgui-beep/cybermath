#!/usr/bin/env node
// Деплойн дараах шалгалт (preview/prod) — тоглоомын сервер gate.
//   node scripts/verify-game-gate.js --base https://cyber-math.com            (GAME_PAYWALL асаалттай үед)
//   node scripts/verify-game-gate.js --base https://<preview> --expect off   (GAME_PAYWALL=off үед)
// Зөвхөн cookie-гүй GET/HEAD хүсэлт илгээнэ (юу ч бичихгүй). Шалгах зүйлс:
//   on : хамгаалсан зам бүр 403 + X-Game-Gate: locked, ≤8KB, тоглоомын код агуулаагүй, no-store, Set-Cookie-гүй;
//        /math-mortal/<нэр>.js → 403 locked (JS биш); /games/*.html шууд → 404; /gate/game.js?g=… → 403
//   off: хамгаалсан зам бүр 200 + X-Game-Gate: off
//   үргэлж: /math-mortal/cover.webp 200 (статик), /mortal ба /math-mortal → 301 /math-mortal/
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const ROOT = path.resolve(__dirname, '..');

function get(url, method) {
  return new Promise(function (resolve, reject) {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(u, {
      method: method || 'GET',
      headers: { 'user-agent': 'cybermath-verify-game-gate/1', 'accept-encoding': 'identity' },
    }, function (res) {
      const chunks = [];
      let n = 0;
      res.on('data', function (c) { n += c.length; if (n <= 4e6) chunks.push(c); });
      res.on('end', function () { resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks), size: n }); });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(30000, function () { req.destroy(new Error('timeout')); });
    req.end();
  });
}
// Тоглоомын файлын «маркер» — файлын дундаас 48 тэмдэгт (код/өгөгдөл). Түгжээтэй хуудсанд байх ёсгүй.
function markerOf(rel) {
  try {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const mid = Math.floor(s.length / 2);
    return s.length > 200 ? s.slice(mid, mid + 48) : null;
  } catch (e) { return null; }
}

// → { ok, results: [{ path, ok, why }] }
async function verify(base, opts) {
  opts = opts || {};
  const expect = opts.expect === 'off' ? 'off' : 'on';
  const gate = opts.gate || require(path.join(ROOT, 'gate', 'game.js'));
  const b = String(base || '').replace(/\/+$/, '');
  if (!/^https?:\/\/[^/]+$/.test(b)) throw new Error('--base буруу: ' + base);
  const results = [];
  function rec(p, ok, why) { results.push({ path: p, ok: !!ok, why: ok ? '' : why }); }

  const entries = [];
  Object.keys(gate.FILES).forEach(function (g) {
    const F = gate.FILES[g];
    const rel = F.file || (F.dir + '/' + F.index);
    F.paths.forEach(function (p) { entries.push({ g: g, p: p, marker: markerOf(rel) }); });
  });
  for (const e of entries) {
    let r;
    try { r = await get(b + e.p); } catch (err) { rec(e.p, false, 'сүлжээ: ' + err.message); continue; }
    const gh = String(r.headers['x-game-gate'] || '');
    const body = r.body.toString('utf8');
    if (expect === 'off') {
      rec(e.p, r.status === 200 && gh === 'off', 'хүлээсэн 200 + off, ирсэн ' + r.status + ' ' + gh);
      continue;
    }
    const why = [];
    if (r.status !== 403) why.push('status ' + r.status);
    if (gh !== 'locked') why.push('X-Game-Gate "' + gh + '"');
    if (r.size > (gate.LOCKED_MAX || 8192)) why.push('хэмжээ ' + r.size + ' > 8KB');
    if (e.marker && body.indexOf(e.marker) >= 0) why.push('тоглоомын код агуулсан');
    if (!/no-store/.test(String(r.headers['cache-control'] || ''))) why.push('Cache-Control no-store биш');
    if (r.headers['set-cookie']) why.push('Set-Cookie тавьсан');
    rec(e.p, !why.length, why.join('; '));
  }

  // math-mortal дэд файлууд
  const mm = gate.FILES.mathmortal;
  if (mm) {
    let subs = [];
    try { subs = fs.readdirSync(path.join(ROOT, mm.dir)).filter(function (n) { return gate.SUB_FILE_RE.test(n); }); } catch (e) { subs = ['main.js']; }
    for (const n of subs) {
      const p = '/' + mm.dir + '/' + n;
      let r;
      try { r = await get(b + p); } catch (err) { rec(p, false, 'сүлжээ: ' + err.message); continue; }
      const gh = String(r.headers['x-game-gate'] || '');
      if (expect === 'off') rec(p, r.status === 200 && gh === 'off', 'хүлээсэн 200 + off, ирсэн ' + r.status + ' ' + gh);
      else rec(p, r.status === 403 && gh === 'locked' && r.size < 64 && !/\bimport\b|function/.test(r.body.toString('utf8')),
        'хүлээсэн 403 locked (кодгүй), ирсэн ' + r.status + ' ' + gh + ' ' + r.size + 'B');
    }
  }

  if (expect === 'on') {
    // Файлын бодит зам ба функцийн шууд хаяг
    for (const g of Object.keys(gate.FILES)) {
      const F = gate.FILES[g];
      if (!F.file) continue;
      const p = '/' + F.file;
      try { const r = await get(b + p); rec(p, r.status === 404, 'хүлээсэн 404 (статик хуулбар байх ёсгүй), ирсэн ' + r.status); }
      catch (err) { rec(p, false, 'сүлжээ: ' + err.message); }
    }
    const p = '/gate/game.js?g=sudoku';
    try {
      const r = await get(b + p);
      rec(p, r.status === 403 && String(r.headers['x-game-gate'] || '') === 'locked', 'хүлээсэн 403 locked, ирсэн ' + r.status);
    } catch (err) { rec(p, false, 'сүлжээ: ' + err.message); }
  }

  // Статик хэвээр
  {
    const p = '/math-mortal/cover.webp';
    try { const r = await get(b + p, 'HEAD'); rec(p, r.status === 200, 'хүлээсэн 200, ирсэн ' + r.status); }
    catch (err) { rec(p, false, 'сүлжээ: ' + err.message); }
  }
  for (const p of ['/mortal', '/math-mortal']) {
    try {
      const r = await get(b + p);
      const loc = String(r.headers.location || '');
      rec(p, (r.status === 301 || r.status === 308) && /\/math-mortal\/$/.test(loc), 'хүлээсэн 301 → /math-mortal/, ирсэн ' + r.status + ' ' + loc);
    } catch (err) { rec(p, false, 'сүлжээ: ' + err.message); }
  }
  return { ok: results.every(function (x) { return x.ok; }), results: results };
}

module.exports = { verify };

if (require.main === module) {
  const a = process.argv.slice(2);
  const arg = function (k) { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : null; };
  const base = arg('--base');
  if (!base) { console.error('Хэрэглээ: node scripts/verify-game-gate.js --base https://cyber-math.com [--expect off]'); process.exit(2); }
  verify(base, { expect: arg('--expect') || 'on' }).then(function (r) {
    r.results.forEach(function (x) { console.log((x.ok ? 'OK   ' : 'FAIL ') + x.path + (x.ok ? '' : '  — ' + x.why)); });
    console.log(r.ok ? 'OK — бүх шалгалт давлаа' : 'АЛДАА — дээрх FAIL мөрүүдийг шалгана уу');
    process.exit(r.ok ? 0 : 1);
  }).catch(function (e) { console.error(e.message); process.exit(1); });
}
