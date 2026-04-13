const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'cybermath424@gmail.com',
    pass: 'fmfu zlsc wznf evfn'
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

module.exports = { sendVerifyEmail, sendPremiumEmail, sendFreeEmail };
