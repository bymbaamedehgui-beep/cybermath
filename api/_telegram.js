// Telegram bot notifier. Vercel env-д TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID тохируулна.
// Бот үүсгэх: @BotFather → /newbot. Chat ID авах: ботруу /start дараа
//   https://api.telegram.org/bot<TOKEN>/getUpdates руу ороод message.chat.id харах.
//
// 2026-11-12: prod-д бүх мэдэгдэл «fetch failed» (сүлжээний түвшин) болж хүрэхгүй байсан. Иймд глобал fetch биш https модулиар
// IPv4-ээр шууд холбогдож, оролдлого бүрт 4 сек хугацаа, сүлжээний алдаанд нэг удаа дахин оролдоно; амжилт/алдааны кодыг
// (ETIMEDOUT, ECONNRESET, HTTP 401 г.м.) логт бичнэ. auth/users/qpay/worksheets/tg/_meet бүгд үүгээр илгээнэ.
const https = require('https');

function once(method, body, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.telegram.org', path: '/bot' + token + '/' + method, method: 'POST', family: 4, timeout: 4000,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { d += c; });
      res.on('end', () => {
        let j = null;
        try { j = JSON.parse(d); } catch (e) { j = null; }
        resolve(j || { ok: false, error: 'HTTP ' + res.statusCode });
      });
    });
    req.on('timeout', () => { const e = new Error('timeout'); e.code = 'ETIMEDOUT'; req.destroy(e); });
    req.on('error', reject);
    req.end(body);
  });
}

// Bot API-ийн дурын арга (sendMessage, setWebhook, getWebhookInfo …) — хэзээ ч throw хийхгүй
async function call(method, payload) {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
  if (!token) return { ok: false, skipped: 'no env' };
  const body = JSON.stringify(payload || {});
  let j;
  try {
    try { j = await once(method, body, token); }
    catch (e1) {
      console.error('[telegram] ' + method + ' 1-р оролдлого: ' + (e1.code || '') + ' ' + e1.message);
      await new Promise((r) => setTimeout(r, 500));
      j = await once(method, body, token);
    }
  } catch (e) {
    console.error('[telegram] ' + method + ' АМЖИЛТГҮЙ: ' + (e.code || '') + ' ' + e.message);
    return { ok: false, error: e.code || e.message };
  }
  if (j && j.ok) console.log('[telegram] ' + method + ' ok');
  else console.error('[telegram] ' + method + ' татгалзав: ' + ((j && (j.description || j.error)) || '?'));
  return j;
}

async function sendTelegram(text, extra) {
  const chatId = String(process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!process.env.TELEGRAM_BOT_TOKEN || !chatId) return { ok: false, skipped: 'no env' };
  return call('sendMessage', Object.assign({
    chat_id: chatId,
    text: String(text).slice(0, 4000),
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  }, extra || {}));
}

module.exports = { sendTelegram, call };
