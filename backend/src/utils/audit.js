/**
 * Archivo: backend/src/utils/audit.js
 * Descripción: Registro de eventos de auditoría en la tabla audit_logs.
 * Garantiza que nunca se almacenen contraseñas, tokens ni secretos.
 */
const db = require('../config/db');

const SENSITIVE_KEYS = new Set(['password', 'password_hash', 'newPassword', 'currentPassword', 'token', 'refreshToken', 'accessToken', 'secret']);

function sanitizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const clean = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!SENSITIVE_KEYS.has(k)) clean[k] = v;
  }
  return JSON.stringify(clean);
}

async function logAudit(actorUserId, action, entityType, entityId = null, metadata = null) {
  try {
    await db.execute(
      'INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)',
      [actorUserId || null, action, entityType, entityId || null, sanitizeMetadata(metadata)]
    );
  } catch (err) {
    // No interrumpir el flujo principal si falla el log secundario
    console.error('Error registrando auditoría:', err.message);
  }
}

module.exports = { logAudit };
