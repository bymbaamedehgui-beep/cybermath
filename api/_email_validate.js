/**
 * Бодит мэйл шалгалт — код илгээхгүйгээр
 *
 *   1. Syntax check (regex)
 *   2. Disposable email blocklist (түр зуурын мэйл татгалзана)
 *   3. MX record (DNS-с домейн бодит мэйл сервертэй эсэх)
 *
 * Хэрэглэх:
 *   const { validateEmail } = require('./_email_validate');
 *   const r = await validateEmail('bymba@gmail.com');
 *   // { ok: true, domain: 'gmail.com' }
 *   // { ok: false, code: 'MX_NOT_FOUND', error: '...' }
 */

const { Resolver } = require('dns').promises;

// Vercel serverless орчинд default DNS нь заримдаа найдваргүй тул explicit resolver
const dnsResolver = new Resolver();
dnsResolver.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

// ─── 1. Syntax ────────────────────────────────────────────
const EMAIL_REGEX = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;

function isValidSyntax(email) {
  if (!email || typeof email !== 'string') return false;
  if (email.length > 254) return false;
  if (email.includes('..')) return false;
  return EMAIL_REGEX.test(email);
}

// ─── 2. Disposable email domains ──────────────────────────
const DISPOSABLE = new Set([
  '10minutemail.com', '10minutemail.net', 'guerrillamail.com', 'guerrillamail.net',
  'mailinator.com', 'mailinator.net', 'mailinator.org', 'maildrop.cc',
  'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tmpmail.org', 'tmpmail.net',
  'throwawaymail.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net',
  'trashmail.com', 'trashmail.net', 'trashmail.io', 'sharklasers.com',
  'getnada.com', 'nada.email', 'inboxbear.com', 'mytrashmail.com',
  'fakeinbox.com', 'fakemail.net', 'burnermail.io', 'emailondeck.com',
  'dispostable.com', 'mailnesia.com', 'mailcatch.com', 'mailtemp.info',
  'mytemp.email', 'harakirimail.com', 'grr.la', 'spam4.me',
  'mvrht.com', 'inbox.si', 'inbox.lv', 'discard.email',
  'boximail.com', 'mail-temp.com', 'temporarymail.com', 'temporary-mail.net',
  'wegwerfmail.de', 'wegwerfemail.de', 'spamgourmet.com', 'spamgourmet.net',
  'mintemail.com', 'mailbox.in.ua', 'trbvm.com', 'objectmail.com',
  '33mail.com', 'anonbox.net', 'byom.de', 'chammy.info',
  'crazymailing.com', 'e4ward.com', 'freemail.hu', 'hidemail.de',
  'incognitomail.com', 'jetable.org', 'letthemeatspam.com',
  'meltmail.com', 'no-spam.ws', 'noclickemail.com', 'nospam.ze.tc',
  'nowmymail.com', 'onewaymail.com', 'privacy.net', 'rcpt.at',
  'safe-mail.net', 'selfdestructingmail.com', 'smellfear.com',
  'spam.la', 'spamavert.com', 'spambob.com', 'spambog.com',
  'spambox.us', 'spamex.com', 'spamfree24.org', 'spamgoes.com',
  'spamhole.com', 'spamify.com', 'spamspot.com', 'stuffmail.de',
  'tempinbox.com', 'tempomail.fr', 'tempymail.com', 'thankyou2010.com',
  'thisisnotmyrealemail.com', 'tittbit.in', 'tradermail.info',
  'trbvn.com', 'trbvo.com', 'twinmail.de', 'walala.org',
  'wg0.com', 'whatpaas.com', 'whyspam.me', 'wilemail.com',
  'wuzupmail.net', 'xoxy.net', 'xyzmail.men', 'yepmail.net',
  'yourdomain.com', 'zetmail.com',
]);

function getDomain(email) {
  const at = email.lastIndexOf('@');
  if (at === -1) return '';
  return email.slice(at + 1).toLowerCase();
}

function isDisposable(email) {
  const domain = getDomain(email);
  return DISPOSABLE.has(domain);
}

// ─── 3. MX record check ───────────────────────────────────
const MX_CACHE = new Map(); // 5 минутын caching
const MX_TTL_MS = 5 * 60 * 1000;

async function hasMxRecord(domain) {
  const cached = MX_CACHE.get(domain);
  if (cached && Date.now() - cached.at < MX_TTL_MS) return cached.ok;

  let ok = false;
  try {
    const records = await dnsResolver.resolveMx(domain);
    ok = Array.isArray(records) && records.length > 0;
  } catch (e) {
    // NODATA / ENOTFOUND — MX бүртгэлгүй. A record-т fallback (RFC 5321)
    try {
      const aRecords = await dnsResolver.resolve4(domain);
      ok = Array.isArray(aRecords) && aRecords.length > 0;
    } catch (e2) {
      ok = false;
    }
  }

  MX_CACHE.set(domain, { ok, at: Date.now() });
  return ok;
}

// ─── Main API ─────────────────────────────────────────────
async function validateEmail(email, opts = {}) {
  const checkMx = opts.checkMx !== false;

  if (!isValidSyntax(email)) {
    return { ok: false, code: 'SYNTAX', error: 'Мэйлийн формат буруу байна' };
  }

  const domain = getDomain(email);

  if (isDisposable(email)) {
    return { ok: false, code: 'DISPOSABLE', error: 'Түр зуурын мэйл хаяг хүлээн авахгүй', domain };
  }

  if (checkMx) {
    const hasMx = await hasMxRecord(domain);
    if (!hasMx) {
      return { ok: false, code: 'MX_NOT_FOUND', error: 'Тухайн домейн бодит мэйл сервертэй холбогдоогүй байна', domain };
    }
  }

  return { ok: true, domain };
}

module.exports = {
  validateEmail,
  isValidSyntax,
  isDisposable,
  hasMxRecord,
  getDomain,
};
