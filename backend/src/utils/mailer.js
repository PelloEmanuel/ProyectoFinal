/**
 * Archivo: backend/src/utils/mailer.js
 * Descripción: Envío de correos electrónicos transaccionales de Campus Técnica 5
 * (verificación en 2 pasos de cuenta, recuperación de contraseña y avisos de seguridad).
 */
const nodemailer = require('nodemailer');

function getTransporter() {
  const service = process.env.SMTP_SERVICE;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT) || 587;

  // 1. Si es Gmail, usar directamente service: 'gmail' (optimizado para puertos y handshake de Google)
  if (service === 'gmail' || host === 'smtp.gmail.com') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }

  // 2. Si hay host y credenciales genéricas (puerto 465 SSL o 587 STARTTLS)
  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass } : undefined,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false,
      },
    });
  }
  return null;
}

exports.getTransporter = getTransporter;

exports.isConfigured = () => {
  return Boolean(
    process.env.RESEND_API_KEY ||
    process.env.BREVO_API_KEY ||
    process.env.SMTP_SERVICE ||
    (process.env.SMTP_HOST && process.env.SMTP_USER)
  );
};

async function sendViaResend({ to, subject, text, html }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return false;
  try {
    const fromAddress = process.env.MAIL_FROM || 'Campus Técnica 5 <onboarding@resend.dev>';
    console.log(`[MAILER-RESEND] Enviando correo HTTPS a ${to} desde ${fromAddress}...`);
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [to],
        subject,
        text,
        html,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      console.error('[MAILER-RESEND-ERROR] Respuesta de Resend:', data);
      return false;
    }
    console.log(`[MAILER] ✅ Correo entregado exitosamente vía Resend API a ${to}. ID: ${data.id}`);
    return true;
  } catch (err) {
    console.error('[MAILER-RESEND-ERROR] Error de conexión:', err.message);
    return false;
  }
}

async function sendMailSafe({ to, subject, text, html }) {
  // 1. Resend API vía HTTPS (puerto 443 estándar, inmune a bloqueos de puertos SMTP en Render Free Tier)
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ to, subject, text, html });
  }

  // 2. Servidor SMTP tradicional (puerto 465 SSL o 587 STARTTLS)
  const transport = getTransporter();
  if (!transport) {
    console.error(`[MAILER] ⚠️ No hay servidor SMTP configurado (SMTP_HOST o SMTP_SERVICE). No se pudo enviar correo a ${to}.`);
    return false;
  }
  try {
    const fromAddress =
      process.env.MAIL_FROM ||
      (process.env.SMTP_USER ? `"Campus Técnica 5" <${process.env.SMTP_USER}>` : '"Campus Técnica 5" <no-reply@campus-tecnica-5.edu>');

    const info = await transport.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });
    console.log(`[MAILER] ✅ Correo enviado exitosamente a ${to}. MessageId: ${info.messageId}`);
    return true;
  } catch (err) {
    console.error(`[MAILER-ERROR] ❌ Error al enviar correo a ${to}:`, err.message);
    return false;
  }
}

exports.sendVerificationEmail = async (to, token) => {
  const subject = 'Campus Técnica 5 - Código de Verificación en 2 Pasos';
  const text = `¡Hola!\n\nTu código de verificación en 2 pasos para acceder al Campus de la Técnica 5 es:\n\n${token}\n\nIngresá este código de 6 dígitos manualmente en la pantalla de verificación para completar tu acceso.\n\nEste código vence en 24 horas.\n\nSi no intentaste ingresar, podés desestimar este mensaje.`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 22px;">
        <h2 style="color: #1e293b; margin: 0; font-size: 22px; font-weight: 800;">Campus Técnica 5</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">Escuela de Educación Secundaria Técnica N° 5</p>
      </div>
      <div style="margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 14px 0; line-height: 22px;">
          Hola, recibimos una solicitud para verificar tu cuenta e ingresar al Campus Escolar.
        </p>
        <p style="color: #475569; font-size: 13px; margin: 0 0 10px 0;">
          Tu código de seguridad de 6 dígitos es:
        </p>
      </div>
      <div style="background-color: #f1f5f9; border: 2px dashed #93c5fd; border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 22px;">
        <div style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #1d4ed8; font-family: monospace;">
          ${token}
        </div>
        <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0; font-weight: 600;">
          Ingresá este código manualmente en la pantalla de verificación
        </p>
      </div>
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <p style="color: #92400e; font-size: 12px; margin: 0; line-height: 18px;">
          ⏱️ Este código es de uso único y tiene una validez de 24 horas.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 11px; text-align: center; margin: 0; border-top: 1px solid #f1f5f9; padding-top: 14px;">
        Si no solicitaste este código, asegurate de que nadie más tenga acceso a tu cuenta.
      </p>
    </div>
  `;
  return sendMailSafe({ to, subject, text, html });
};

exports.sendPasswordResetEmail = async (to, token) => {
  const subject = 'Campus Técnica 5 - Código de Recuperación de Contraseña';
  const text = `Recibimos una solicitud para restablecer tu contraseña en el Campus de la Técnica 5.\n\nTu código temporal de recuperación es:\n\n${token}\n\nIngresalo manualmente junto con tu nueva contraseña.\n\nEste código vence en 30 minutos. Si no solicitaste el cambio, ignorá este correo.`;
  const html = `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 540px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 14px; background-color: #ffffff;">
      <div style="text-align: center; border-bottom: 2px solid #dc2626; padding-bottom: 16px; margin-bottom: 22px;">
        <h2 style="color: #1e293b; margin: 0; font-size: 22px; font-weight: 800;">Campus Técnica 5</h2>
        <p style="color: #64748b; font-size: 13px; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.5px;">Recuperación de Contraseña</p>
      </div>
      <div style="margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin: 0 0 14px 0; line-height: 22px;">
          Recibimos una solicitud para restablecer la contraseña de tu cuenta.
        </p>
        <p style="color: #475569; font-size: 13px; margin: 0 0 10px 0;">
          Tu código temporal de recuperación es:
        </p>
      </div>
      <div style="background-color: #fef2f2; border: 2px dashed #fca5a5; border-radius: 12px; padding: 22px; text-align: center; margin-bottom: 22px;">
        <div style="font-size: 38px; font-weight: 900; letter-spacing: 8px; color: #b91c1c; font-family: monospace;">
          ${token}
        </div>
        <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0; font-weight: 600;">
          Ingresalo manualmente junto con tu nueva contraseña
        </p>
      </div>
      <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
        <p style="color: #92400e; font-size: 12px; margin: 0; line-height: 18px;">
          ⏱️ Este código vence en 30 minutos. Si no solicitaste este cambio, podés ignorar este correo; tu contraseña actual no será modificada.
        </p>
      </div>
    </div>
  `;
  return sendMailSafe({ to, subject, text, html });
};
