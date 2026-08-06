// Telegram webhook — санал хүсэлтийн мэдэгдэлд Reply бичихэд хэрэглэгчид имэйлээр хариу очно.
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TG_WEBHOOK_SECRET
// Нэг удаа тохируулах: GET  /api/tg?setup=1&secret=<TG_WEBHOOK_SECRET>
const pool = require('./_db');
const { sendFeedbackReply } = require('./_email');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER = process.env.TELEGRAM_CHAT_ID;
const SECRET = process.env.TG_WEBHOOK_SECRET || '';

async function tgSend(chatId, text, replyTo) {
  if (!TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: text, reply_to_message_id: replyTo, disable_web_page_preview: true })
    });
  } catch (e) { console.error('[tg send]', e.message); }
}

module.exports = async (req, res) => {
  const q = req.query || {};

  // ── Тохируулга: webhook-ийг Telegram-д бүртгэх (нэг удаа) ──
  if (req.method === 'GET' && q.setup) {
    if (!SECRET || q.secret !== SECRET) return res.status(403).json({ ok: false, error: 'secret буруу' });
    if (!TOKEN) return res.status(400).json({ ok: false, error: 'TELEGRAM_BOT_TOKEN тохируулаагүй байна' });
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const url = `${proto}://${req.headers['host']}/api/tg?secret=${encodeURIComponent(SECRET)}`;
    try {
      const r = await fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, secret_token: SECRET, allowed_updates: ['message'], drop_pending_updates: true })
      });
      return res.status(200).json({ ok: true, webhook_url: url, telegram: await r.json() });
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  // ── Webhook update (Telegram POST) ──
  const hsecret = req.headers['x-telegram-bot-api-secret-token'] || '';
  if (SECRET && q.secret !== SECRET && hsecret !== SECRET) return res.status(403).json({ ok: false });

  let body = req.body || {};
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }

  try {
    const msg = body.message || body.edited_message;
    // Зөвхөн эзний чатаас ирсэн, тодорхой мэдэгдэлд хийсэн Reply-г боловсруулна
    if (msg && msg.reply_to_message && msg.text && (!OWNER || String(msg.chat && msg.chat.id) === String(OWNER))) {
      const rmid = msg.reply_to_message.message_id;
      const reply = String(msg.text).trim().slice(0, 2000);
      const r = await pool.query('SELECT id, contact, message FROM ws_feedback WHERE tg_msg_id=$1', [rmid]);
      if (r.rows.length && reply.length >= 1) {
        const fb = r.rows[0];
        await pool.query('UPDATE ws_feedback SET reply=$2, replied_at=NOW() WHERE id=$1', [fb.id, reply]);
        let mailed = false;
        const contact = String(fb.contact || '').trim();
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(contact)) {
          try { await sendFeedbackReply(contact, reply, fb.message); mailed = true; }
          catch (e) { console.error('[fb reply mail]', e.message); }
        }
        await tgSend(msg.chat.id, mailed ? ('✅ Хариу имэйлээр илгээлээ → ' + contact) : '💾 Хадгаллаа (имэйл байхгүй тул илгээгүй)', msg.message_id);
      } else if (!r.rows.length) {
        await tgSend(msg.chat.id, '⚠️ Энэ мэдэгдэлд холбогдох санал хүсэлт олдсонгүй.', msg.message_id);
      }
    }
  } catch (e) { console.error('[tg webhook]', e.message); }

  return res.status(200).json({ ok: true });  // Telegram дахин оролдохгүйн тулд үргэлж 200
};
