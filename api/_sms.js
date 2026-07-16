/**
 * Sova (Codesoft) SMS gateway — sova.mn
 *
 * ENV шаардлагатай:
 *   SOVA_SMS_URL     — API endpoint (default: https://api.sova.mn/sms/send)
 *   SOVA_SMS_TOKEN   — Sova-с олгосон auth token
 *   SOVA_SMS_FROM    — Sender ID (жишээ: "CyberMath" эсвэл дугаар)
 *
 * ENV байхгүй бол mock горимд ажиллана — консолд код хэвлэнэ (development).
 */

const SMS_URL   = process.env.SOVA_SMS_URL   || 'https://api.sova.mn/sms/send';
const SMS_TOKEN = process.env.SOVA_SMS_TOKEN || '';
const SMS_FROM  = process.env.SOVA_SMS_FROM  || 'CyberMath';

/**
 * Монгол утасны дугаарыг нэгдсэн формат руу шилжүүлэх:
 *   99112233     → 97699112233
 *   99-11-22-33  → 97699112233
 *   +976 99112233→ 97699112233
 *   0-99112233   → 97699112233
 * Буруу форматад хоосон буцаана.
 */
function normalizePhone(phone) {
  if (!phone) return '';
  var d = String(phone).replace(/\D+/g, '');
  if (d.startsWith('976')) d = d.slice(3);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length !== 8) return '';
  // Mongolian mobile prefixes: 5, 6, 7, 8, 9
  if (!/^[5-9]/.test(d)) return '';
  return '976' + d;
}

function isValidMongolianPhone(phone) {
  return normalizePhone(phone).length === 11;
}

/**
 * Баталгаажуулах SMS илгээх
 *
 * @param {string} phone   — хэрэглэгчийн бичсэн утас
 * @param {string} code    — 6 оронт баталгаажуулах код
 * @param {string} name    — сурагчийн нэр (SMS-д харагдана)
 * @returns {Promise<{ok: boolean, mock?: boolean, error?: string, providerId?: string}>}
 */
async function sendVerifySMS(phone, code, name) {
  var normalized = normalizePhone(phone);
  if (!normalized) {
    return { ok: false, error: 'Утасны дугаар буруу байна' };
  }

  var text = code + ' — таны CyberMath баталгаажуулах код. 10 минутад хүчинтэй.';

  // Mock горим — production ENV байхгүй үед test-д хэвлэнэ
  if (!SMS_TOKEN) {
    console.warn('[sms:sova] SOVA_SMS_TOKEN тохируулагдаагүй — mock горим');
    console.log('[sms:mock] to=' + normalized + '  code=' + code + '  text="' + text + '"');
    return { ok: true, mock: true };
  }

  try {
    var resp = await fetch(SMS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + SMS_TOKEN,
      },
      body: JSON.stringify({
        to: normalized,
        from: SMS_FROM,
        text: text,
      }),
    });

    var data = null;
    try { data = await resp.json(); } catch (e) { data = null; }

    if (!resp.ok) {
      var err = (data && (data.error || data.message)) || ('HTTP ' + resp.status);
      console.warn('[sms:sova] илгээхэд алдаа:', err);
      return { ok: false, error: String(err) };
    }

    return {
      ok: true,
      providerId: (data && (data.id || data.messageId || data.message_id)) || null,
    };
  } catch (e) {
    console.error('[sms:sova] сүлжээ алдаа:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  sendVerifySMS: sendVerifySMS,
  normalizePhone: normalizePhone,
  isValidMongolianPhone: isValidMongolianPhone,
};
