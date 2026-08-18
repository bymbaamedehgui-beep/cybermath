const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'cybermath424@gmail.com',
    pass: 'curbqiqjrzgmgkfq'
  }
});

const FROM = 'CyberMath <cybermath424@gmail.com>';

async function sendEmail({ to, subject, html }) {
  try {
    await transporter.sendMail({ from: FROM, to, subject, html });
    return { ok: true };
  } catch (e) {
    console.error('Email error:', e.message);
    return { error: e.message };
  }
}

function sendVerifyEmail(to, code, firstName) {
  return sendEmail({
    to,
    subject: '🔐 CyberMath - Имэйл баталгаажуулалт',
    html: `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0b1a;color:#f0eeff;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#7B52EE,#A855F7);padding:32px;text-align:center;">
        <div style="font-size:2rem;">🧮</div>
        <h1 style="margin:8px 0;font-size:1.6rem;color:#fff;">CyberMath</h1>
        <p style="color:rgba(255,255,255,0.8);margin:0;">Математикийн сургалтын платформ</p>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#f0eeff;margin-bottom:8px;">Сайн байна уу, ${firstName}! 👋</h2>
        <p style="color:#c0b8e8;line-height:1.6;">Бүртгэлээ баталгаажуулахын тулд доорх кодыг оруулна уу:</p>
        <div style="background:#1e1a35;border:2px solid #7B52EE;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
          <div style="font-size:2.5rem;font-weight:900;letter-spacing:0.3em;color:#A855F7;">${code}</div>
          <p style="color:#8880aa;font-size:0.85rem;margin:8px 0 0;">10 минутын дотор оруулна уу</p>
        </div>
        <p style="color:#8880aa;font-size:0.82rem;">Хэрэв та бүртгүүлээгүй бол энэ имэйлийг үл тоомсорлоно уу.</p>
      </div>
      <div style="background:#16132b;padding:16px;text-align:center;">
        <p style="color:#8880aa;font-size:0.75rem;margin:0;">© 2025 CyberMath. Бүх эрх хуулиар хамгаалагдсан.</p>
      </div>
    </div>`
  });
}

function sendPremiumEmail(to, firstName) {
  return sendEmail({
    to,
    subject: '⭐ CyberMath Premium - Тавтай морил!',
    html: `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0b1a;color:#f0eeff;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#FFC800,#FF9600);padding:32px;text-align:center;">
        <div style="font-size:2.5rem;">⭐</div>
        <h1 style="margin:8px 0;font-size:1.6rem;color:#fff;">Premium боллоо!</h1>
      </div>
      <div style="padding:32px;">
        <h2 style="color:#f0eeff;">Баяр хүргэе, ${firstName}! 🎉</h2>
        <p style="color:#c0b8e8;line-height:1.6;">Та CyberMath Premium гишүүн болсон байна!</p>
        <a href="https://cybermath.vercel.app" style="display:block;background:linear-gradient(135deg,#FFC800,#FF9600);color:#fff;text-decoration:none;text-align:center;padding:14px;border-radius:10px;font-weight:bold;">Хичээлд орох →</a>
      </div>
    </div>`
  });
}

function sendFreeEmail(to, firstName) {
  return sendEmail({
    to,
    subject: 'CyberMath - Тарифф өөрчлөгдлөө',
    html: `<div style="font-family:Arial,sans-serif;padding:32px;">Сайн байна уу, ${firstName}! Таны бүртгэл Free тарифф руу шилжсэн байна.</div>`
  });
}

function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
function sendFeedbackReply(to, reply, original) {
  return sendEmail({
    to,
    subject: '💬 CyberMath — Таны санал хүсэлтэд хариу',
    html: `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#0d0b1a;color:#f0eeff;border-radius:16px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#7B52EE,#A855F7);padding:28px;text-align:center;">
        <div style="font-size:2rem;">💬</div>
        <h1 style="margin:8px 0;font-size:1.5rem;color:#fff;">CyberMath</h1>
        <p style="color:rgba(255,255,255,0.8);margin:0;">Санал хүсэлтийн хариу</p>
      </div>
      <div style="padding:28px;">
        <p style="color:#8880aa;font-size:0.82rem;margin:0 0 5px;">Таны илгээсэн:</p>
        <div style="background:#16132b;border-radius:10px;padding:12px 14px;color:#c0b8e8;font-size:0.88rem;white-space:pre-wrap;margin-bottom:18px;">${esc(original)}</div>
        <p style="color:#8880aa;font-size:0.82rem;margin:0 0 5px;">Манай хариу:</p>
        <div style="background:#1e1a35;border:2px solid #7B52EE;border-radius:12px;padding:16px 18px;color:#f0eeff;font-size:0.95rem;line-height:1.6;white-space:pre-wrap;">${esc(reply)}</div>
      </div>
      <div style="background:#16132b;padding:16px;text-align:center;">
        <p style="color:#8880aa;font-size:0.75rem;margin:0;">cyber-math.com · © 2025 CyberMath</p>
      </div>
    </div>`
  });
}

function sendPromoEmail(to, firstName) {
  const hi = firstName ? (firstName + ' багшаа, ') : '';
  return sendEmail({
    to,
    subject: 'CyberMath Дасгалын төв — 40% хүртэл хямдрал',
    html: `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;background:#0E0B2B;border-radius:16px;overflow:hidden">
      <div style="background:linear-gradient(135deg,#7B52EE,#A855F7);padding:22px 24px;text-align:center">
        <div style="font-size:22px;font-weight:900;color:#fff;letter-spacing:.5px">CyberMath</div>
        <div style="color:#e9e2ff;font-size:13px;margin-top:2px">Дасгалын төв</div>
      </div>
      <div style="padding:28px 24px;color:#F3F0FF;text-align:center">
        <div style="display:inline-block;background:#FFC113;color:#241B00;font-weight:900;font-size:12px;border-radius:999px;padding:5px 15px;margin-bottom:16px">БАГШДАА ЗОРИУЛСАН ОНЦГОЙ САНАЛ</div>
        <div style="font-size:42px;font-weight:900;color:#FFF587;line-height:1">40% хүртэл</div>
        <div style="font-size:17px;font-weight:800;color:#fff;margin:6px 0 2px;letter-spacing:1px">ХЯМДРАЛ</div>
        <p style="color:#c9c0f0;font-size:14px;line-height:1.65;margin:14px 6px 22px">${hi}Дасгалын төвийн бүх ажлын хуудсыг сонгосон хугацаанд <b style="color:#fff">хязгааргүй</b> хэвлээрэй. Урамшууллын кодоо доорх товчоор аваад захиалахад хямдрал автоматаар тооцогдоно.</p>
        <a href="https://cyber-math.com/promo" style="display:inline-block;background:linear-gradient(135deg,#4ade80,#22c55e);color:#052e16;font-weight:900;font-size:16px;text-decoration:none;border-radius:999px;padding:14px 34px">Хямдралын кодоо авах</a>
        <p style="color:#8a80b0;font-size:12px;margin:20px 0 0">Хугацаа хязгаартай · cyber-math.com/promo</p>
      </div>
      <div style="background:#171243;padding:14px;text-align:center;color:#6d6499;font-size:11px;line-height:1.5">Энэ имэйл нь CyberMath Дасгалын төвд бүртгэлтэй хаягт илгээгдэв.<br>cyber-math.com · © 2026 CyberMath</div>
    </div>`
  });
}

module.exports = { sendEmail, sendVerifyEmail, sendPremiumEmail, sendFreeEmail, sendFeedbackReply, sendPromoEmail };
