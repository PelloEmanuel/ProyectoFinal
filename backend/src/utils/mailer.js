/**
 * Archivo: backend/src/utils/mailer.js
 * Descripción: Envío de correos electrónicos transaccionales de Campus Técnica 5
 * (verificación en 2 pasos de cuenta, recuperación de contraseña y avisos de seguridad).
 * Soporta entrega multinivel resiliente:
 * 1. Resend API vía HTTPS (puerto 443, con fallback automático a onboarding@resend.dev).
 * 2. Brevo API vía HTTPS (puerto 443, transaccional directo sin bloqueo de puertos).
 * 3. Nodemailer SMTP (Gmail / Servidor propio en puertos 587 STARTTLS o 465 SSL).
 */
const nodemailer = require('nodemailer');

function getTransporter(forcePort = null) {
  const service = process.env.SMTP_SERVICE;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS ? String(process.env.SMTP_PASS).replace(/\s+/g, '') : '';
  const port = forcePort || Number(process.env.SMTP_PORT) || 587;

  // 1. Si es Gmail, configurar con opciones optimizadas para Google App Passwords
  if (service === 'gmail' || host === 'smtp.gmail.com') {
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: port === 465 ? 465 : 587,
      secure: port === 465,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false,
      },
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

/**
 * Envío vía Resend API (HTTPS por puerto 443 estándar).
 * Si process.env.MAIL_FROM contiene un dominio no verificado (ej: campus.edu o no verificado en Resend),
 * o si Resend rechaza la llamada con 403/422 de validación de dominio,
 * reintenta inmediatamente con 'Campus Técnica 5 <onboarding@resend.dev>'.
 */
async function sendViaResend({ to, subject, text, html, forceOnboarding = false }) {
  const apiKey = String(process.env.RESEND_API_KEY || '').trim();
  if (!apiKey) return { success: false, reason: 'no_api_key' };

  try {
    const rawFrom = String(process.env.MAIL_FROM || '').trim();
    let fromAddress = 'Campus Técnica 5 <onboarding@resend.dev>';

    // Solo usar MAIL_FROM si no se fuerza onboarding y no contiene dominios de prueba/placeholder no verificados en Resend
    if (!forceOnboarding && rawFrom && !rawFrom.includes('campus.edu') && !rawFrom.includes('example.com')) {
      fromAddress = rawFrom;
    }

    console.log(`[MAILER-RESEND] Intentando envío HTTPS a ${to} desde remitente: ${fromAddress}...`);
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

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error(`[MAILER-RESEND-ERROR] Status ${resp.status}:`, data);

      // Si el error es por dominio no verificado y no estábamos usando onboarding@resend.dev, reintentar de inmediato
      const isDomainError =
        resp.status === 403 ||
        resp.status === 422 ||
        String(data.message || '').toLowerCase().includes('not verified') ||
        String(data.name || '').toLowerCase().includes('validation_error');

      if (isDomainError && fromAddress !== 'Campus Técnica 5 <onboarding@resend.dev>') {
        console.log('[MAILER-RESEND] Reintentando envío con dominio oficial onboarding@resend.dev...');
        return sendViaResend({ to, subject, text, html, forceOnboarding: true });
      }

      return { success: false, status: resp.status, error: data };
    }

    console.log(`[MAILER] ✅ Correo entregado exitosamente vía Resend API a ${to}. ID: ${data.id}`);
    return { success: true, id: data.id, provider: 'resend', from: fromAddress };
  } catch (err) {
    console.error('[MAILER-RESEND-ERROR] Error de conexión:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Envío vía Brevo API (HTTPS por puerto 443 estándar).
 */
async function sendViaBrevo({ to, subject, text, html }) {
  const apiKey = String(process.env.BREVO_API_KEY || '').trim();
  if (!apiKey) return { success: false, reason: 'no_api_key' };

  try {
    const senderEmail = process.env.BREVO_SENDER_EMAIL || process.env.SMTP_USER || 'pelloemanuel@gmail.com';
    const senderName = process.env.BREVO_SENDER_NAME || 'Campus Técnica 5';

    console.log(`[MAILER-BREVO] Enviando correo HTTPS a ${to} desde ${senderEmail}...`);
    const resp = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: senderName, email: senderEmail },
        to: [{ email: to }],
        subject,
        textContent: text,
        htmlContent: html,
      }),
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.error('[MAILER-BREVO-ERROR]', data);
      return { success: false, status: resp.status, error: data };
    }

    console.log(`[MAILER] ✅ Correo entregado exitosamente vía Brevo API a ${to}. MessageId: ${data.messageId}`);
    return { success: true, id: data.messageId, provider: 'brevo' };
  } catch (err) {
    console.error('[MAILER-BREVO-ERROR] Error de conexión:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Envío vía SMTP tradicional con soporte de puertos alternativos (587 STARTTLS / 465 SSL).
 */
async function sendViaSmtp({ to, subject, text, html }) {
  const transport = getTransporter();
  if (!transport) {
    return { success: false, error: 'no_smtp_configured' };
  }

  const fromAddress =
    (process.env.SMTP_USER && (process.env.SMTP_SERVICE === 'gmail' || process.env.SMTP_HOST === 'smtp.gmail.com'))
      ? `"Campus Técnica 5" <${process.env.SMTP_USER}>`
      : (process.env.MAIL_FROM || `"Campus Técnica 5" <${process.env.SMTP_USER || 'no-reply@campus-58oe.onrender.com'}>`);

  try {
    console.log(`[MAILER-SMTP] Enviando correo vía SMTP a ${to} desde ${fromAddress}...`);
    const info = await transport.sendMail({
      from: fromAddress,
      to,
      subject,
      text,
      html,
    });
    console.log(`[MAILER] ✅ Correo enviado exitosamente vía SMTP a ${to}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId, provider: 'smtp' };
  } catch (err) {
    console.error(`[MAILER-SMTP-ERROR] ❌ Error enviando a ${to} (puerto inicial):`, err.message);

    // Si falló por timeout o conexión bloqueada, intentar puerto alternativo (465 o 587)
    const currentPort = Number(process.env.SMTP_PORT) || 587;
    const altPort = currentPort === 587 ? 465 : 587;
    try {
      console.log(`[MAILER-SMTP] Probando puerto alternativo ${altPort} para ${to}...`);
      const altTransport = getTransporter(altPort);
      if (altTransport) {
        const altInfo = await altTransport.sendMail({
          from: fromAddress,
          to,
          subject,
          text,
          html,
        });
        console.log(`[MAILER] ✅ Correo enviado exitosamente vía SMTP puerto alternativo ${altPort} a ${to}. MessageId: ${altInfo.messageId}`);
        return { success: true, messageId: altInfo.messageId, provider: `smtp_port_${altPort}` };
      }
    } catch (altErr) {
      console.error(`[MAILER-SMTP-ERROR] ❌ Error en puerto alternativo ${altPort}:`, altErr.message);
      return { success: false, error: `${err.message} | Alt port ${altPort}: ${altErr.message}` };
    }

    return { success: false, error: err.message };
  }
}

/**
 * Pipeline de entrega resiliente con fallback encadenado.
 */
async function sendMailSafe({ to, subject, text, html }) {
  const attemptLog = {};

  // 1. Intentar con Resend API vía HTTPS (puerto 443 estándar)
  if (process.env.RESEND_API_KEY) {
    const resendResult = await sendViaResend({ to, subject, text, html });
    attemptLog.resend = resendResult;
    if (resendResult && resendResult.success) {
      return { success: true, provider: 'resend', details: resendResult };
    }
  }

  // 2. Intentar con Brevo API vía HTTPS (puerto 443 estándar)
  if (process.env.BREVO_API_KEY) {
    const brevoResult = await sendViaBrevo({ to, subject, text, html });
    attemptLog.brevo = brevoResult;
    if (brevoResult && brevoResult.success) {
      return { success: true, provider: 'brevo', details: brevoResult };
    }
  }

  // 3. Fallback a SMTP tradicional (Nodemailer / Gmail)
  if (process.env.SMTP_USER || process.env.SMTP_HOST) {
    const smtpResult = await sendViaSmtp({ to, subject, text, html });
    attemptLog.smtp = smtpResult;
    if (smtpResult && smtpResult.success) {
      return { success: true, provider: smtpResult.provider, details: smtpResult };
    }
  }

  console.error(`[MAILER-CRITICAL] ❌ No se pudo entregar el correo a ${to}. Detalle de intentos:`, JSON.stringify(attemptLog));
  return { success: false, attempts: attemptLog };
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

/**
 * Función de diagnóstico integral para verificar la conectividad de cada proveedor y probar envío real.
 */
exports.testDelivery = async (to) => {
  const result = {
    testedAt: new Date().toISOString(),
    recipient: to,
    config: {
      hasResend: Boolean(process.env.RESEND_API_KEY),
      resendKeyPrefix: process.env.RESEND_API_KEY ? `${process.env.RESEND_API_KEY.slice(0, 5)}***` : 'none',
      hasBrevo: Boolean(process.env.BREVO_API_KEY),
      mailFrom: process.env.MAIL_FROM || 'not_set',
      smtpHost: process.env.SMTP_HOST || 'none',
      smtpPort: process.env.SMTP_PORT || 'none',
      smtpUser: process.env.SMTP_USER ? `${process.env.SMTP_USER.slice(0, 3)}***` : 'none',
      smtpPassSet: Boolean(process.env.SMTP_PASS),
    },
    resend: null,
    brevo: null,
    smtpVerify: null,
    delivery: null,
  };

  // Test individual de Resend
  if (process.env.RESEND_API_KEY) {
    result.resend = await sendViaResend({
      to,
      subject: 'Prueba Resend - Campus Técnica 5',
      text: 'Este es un correo de prueba de entrega vía Resend API.',
      html: '<p>Este es un correo de prueba de entrega vía <strong>Resend API</strong>.</p>',
    });
  }

  // Test individual de Brevo
  if (process.env.BREVO_API_KEY) {
    result.brevo = await sendViaBrevo({
      to,
      subject: 'Prueba Brevo - Campus Técnica 5',
      text: 'Este es un correo de prueba de entrega vía Brevo API.',
      html: '<p>Este es un correo de prueba de entrega vía <strong>Brevo API</strong>.</p>',
    });
  }

  // Test de SMTP verify
  const transport = getTransporter();
  if (transport) {
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('transporter.verify timeout tras 6s')), 6000);
        transport.verify((err, success) => {
          clearTimeout(timeout);
          if (err) reject(err);
          else resolve(success);
        });
      });
      result.smtpVerify = { success: true };
    } catch (err) {
      result.smtpVerify = { success: false, error: err.message };
    }
  } else {
    result.smtpVerify = { success: false, error: 'no_transport' };
  }

  // Test integral de entrega con sendMailSafe
  result.delivery = await sendMailSafe({
    to,
    subject: 'Campus Técnica 5 - Diagnóstico de Entrega',
    text: 'Si estás leyendo este correo, la entrega de mensajes de Campus Técnica 5 funciona perfectamente.',
    html: '<h3>Campus Técnica 5</h3><p>Si estás leyendo este correo, la entrega de mensajes del Campus Técnica 5 funciona perfectamente.</p>',
  });

  return result;
};
