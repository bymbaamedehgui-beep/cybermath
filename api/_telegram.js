// Telegram bot notifier. Vercel env-д TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID тохируулна.
// Бот үүсгэх: @BotFather → /newbot. Chat ID авах: ботруу /start дараа
//   https://api.telegram.org/bot<TOKEN>/getUpdates руу ороод message.chat.id харах.

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, skipped: 'no env' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: String(text).slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    return await r.json();
  } catch (e) {
    console.error('[telegram]', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = { sendTelegram };
