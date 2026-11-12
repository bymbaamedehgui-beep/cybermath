// Telegram мэдэгдэл — api/_telegram.js (2026-11-12: prod-д бүх илгээлт «fetch failed» болж хүрэхгүй байсан → https + IPv4 + хугацаа +
// нэг удаа дахин оролдлого). Сүлжээ ашиглахгүй: https.request-ийг орлуулна.
// Ажиллуулах: node --test tests/telegram.test.js
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const https = require('https');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');
const TG = require('../api/_telegram.js');

// script: оролдлого бүрийн үр дүн — { err: 'ECONNRESET' } эсвэл { json: {...} }
function fakeHttps(script) {
  const seen = [];
  https.request = function (opts, cb) {
    const step = script[Math.min(seen.length, script.length - 1)];
    const req = new EventEmitter();
    req.destroy = (e) => req.emit('error', e);
    req.end = (body) => {
      seen.push({ opts, body: JSON.parse(body) });
      setImmediate(() => {
        if (step.err) { const e = new Error('socket hang up'); e.code = step.err; return req.emit('error', e); }
        const res = new EventEmitter();
        res.statusCode = 200; res.setEncoding = () => {};
        cb(res);
        res.emit('data', JSON.stringify(step.json));
        res.emit('end');
      });
    };
    return req;
  };
  return seen;
}
const ORIG = https.request;
function withEnv(fn) {
  return async () => {
    const t = process.env.TELEGRAM_BOT_TOKEN, c = process.env.TELEGRAM_CHAT_ID;
    process.env.TELEGRAM_BOT_TOKEN = ' 123:abc \n'; process.env.TELEGRAM_CHAT_ID = '42';
    try { await fn(); } finally {
      https.request = ORIG;
      if (t === undefined) delete process.env.TELEGRAM_BOT_TOKEN; else process.env.TELEGRAM_BOT_TOKEN = t;
      if (c === undefined) delete process.env.TELEGRAM_CHAT_ID; else process.env.TELEGRAM_CHAT_ID = c;
    }
  };
}

test('env байхгүй бол юу ч илгээхгүй', async () => {
  const t = process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_BOT_TOKEN;
  const seen = fakeHttps([{ json: { ok: true } }]);
  const r = await TG.sendTelegram('x');
  https.request = ORIG; if (t !== undefined) process.env.TELEGRAM_BOT_TOKEN = t;
  assert.strictEqual(r.skipped, 'no env');
  assert.strictEqual(seen.length, 0);
});

test('IPv4, хугацаатай, токеныг trim хийж, HTML горимоор илгээнэ', withEnv(async () => {
  const seen = fakeHttps([{ json: { ok: true, result: { message_id: 7 } } }]);
  const r = await TG.sendTelegram('<b>Шинэ</b> бүртгэл', { reply_to_message_id: 3 });
  assert.strictEqual(r.result.message_id, 7);
  assert.strictEqual(seen.length, 1);
  const o = seen[0].opts;
  assert.deepStrictEqual([o.hostname, o.path, o.family, o.method], ['api.telegram.org', '/bot123:abc/sendMessage', 4, 'POST']);
  assert.ok(o.timeout > 0 && o.timeout <= 5000);
  assert.deepStrictEqual(seen[0].body, { chat_id: '42', text: '<b>Шинэ</b> бүртгэл', parse_mode: 'HTML', disable_web_page_preview: true, reply_to_message_id: 3 });
}));

test('сүлжээний алдаанд нэг удаа дахин оролдоно; хоёулаа бүтэлгүйтвэл throw хийхгүй', withEnv(async () => {
  let seen = fakeHttps([{ err: 'ECONNRESET' }, { json: { ok: true, result: { message_id: 9 } } }]);
  assert.strictEqual((await TG.sendTelegram('x')).ok, true);
  assert.strictEqual(seen.length, 2);
  seen = fakeHttps([{ err: 'ETIMEDOUT' }]);
  const r = await TG.sendTelegram('x');
  assert.deepStrictEqual(r, { ok: false, error: 'ETIMEDOUT' });
  assert.strictEqual(seen.length, 2, 'зөвхөн нэг дахин оролдлого');
}));

test('Telegram татгалзвал (401) дахин оролдохгүй, хариуг буцаана', withEnv(async () => {
  const seen = fakeHttps([{ json: { ok: false, error_code: 401, description: 'Unauthorized' } }]);
  const r = await TG.sendTelegram('x');
  assert.strictEqual(r.error_code, 401);
  assert.strictEqual(seen.length, 1);
}));

test('бүх мэдэгдэл _telegram.js-ээр (глобал fetch-ээр Telegram руу шууд хандахгүй)', () => {
  const API = path.join(__dirname, '..', 'api');
  const direct = fs.readdirSync(API).filter((f) => f.endsWith('.js') && f !== '_telegram.js')
    .filter((f) => /fetch\([^)]*api\.telegram\.org/.test(fs.readFileSync(path.join(API, f), 'utf8')));
  assert.deepStrictEqual(direct, []);
});
