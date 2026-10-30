/**
 * Archivo: backend/src/utils/mailer.js
 * Descripción: Envío de correos electrónicos transaccionales de SkillTrack
 * (verificación de cuenta, recuperación de contraseña y avisos de seguridad).
 * No expone tokens sensibles en registros de producción.
 */
const nodemailer = require('nodemailer');

let transporter = null;
if (process.env.SMTP_HOST) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function sendMailSafe({ to, subject, text }) {
  if (!transporter) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[MAIL-DEV] Destinatario: ${to} | Asunto: ${subject}`);
    }
    return false;
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || 'SkillTrack <no-reply@skilltrack.edu>',
    to,
    subject,
    text,
  });
  return true;
}

exports.sendVerificationEmail = async (to, token) => {
  const baseUrl = process.env.APP_PUBLIC_URL || 'https://campus-58oe.onrender.com';
  return sendMailSafe({
    to,
    subject: 'Campus Técnica 5 - Código de Verificación en 2 Pasos',
    text: `¡Hola!\n\nTu código de verificación en 2 pasos para acceder al Campus Escolar es:\n\n${token}\n\nIngresá este código de 6 dígitos en la pantalla de verificación para completar tu registro y acceder al campus.\n\nEste código vence en 24 horas.\n\nSi no creaste una cuenta, podés desestimar este mensaje.`,
  });
};

exports.sendPasswordResetEmail = async (to, token) => {
  return sendMailSafe({
    to,
    subject: 'SkillTrack - Recuperación de contraseña',
    text: `Recibimos una solicitud para restablecer tu contraseña en SkillTrack.\n\nCódigo temporal de recuperación: ${token}\n\nEste código vence en 30 minutos. Si no solicitaste el cambio, ignorá este correo.`,
  });
};
