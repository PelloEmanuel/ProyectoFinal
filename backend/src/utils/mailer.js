const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

/** Envía el código de verificación. Sin SMTP configurado lo imprime en consola (modo desarrollo). */
exports.sendOtp = async (to, code) => {
  if (!transporter) {
    console.log(`[DEV] Código 2FA para ${to}: ${code}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to,
    subject: 'Tu código de verificación de TaskFlow',
    text: `Tu código es ${code}. Vence en 10 minutos. Si no fuiste vos, ignorá este mensaje.`,
  });
};
