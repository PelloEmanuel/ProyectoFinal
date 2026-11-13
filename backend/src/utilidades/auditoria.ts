// Importa la conexión a la base de datos para registrar eventos en la bitácora de auditoría.
import db from '../configuracion/baseDatos';

// Define el conjunto de claves sensibles que jamás deben guardarse en texto plano dentro de los metadatos.
const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'newPassword',
  'currentPassword',
  'token',
  'refreshToken',
  'accessToken',
  'secret',
]);

// Filtra las propiedades sensibles de un objeto de metadatos y lo convierte a formato JSON seguro.
function sanitizeMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (!SENSITIVE_KEYS.has(k)) clean[k] = v;
  }
  return JSON.stringify(clean);
}

// Inserta un registro de auditoría en la tabla registros_auditoria sin interrumpir el flujo principal si falla.
export async function logAudit(
  actorUserId: number | null | undefined,
  action: string,
  entityType: string,
  entityId: number | null = null,
  metadata: Record<string, unknown> | null = null
): Promise<void> {
  try {
    await db.execute(
      'INSERT INTO registros_auditoria (actor_user_id, action, entity_type, entity_id, metadata) VALUES (?, ?, ?, ?, ?)',
      [actorUserId || null, action, entityType, entityId || null, sanitizeMetadata(metadata)]
    );
  } catch (err: any) {
    // Registra el error en consola sin bloquear la respuesta al cliente.
    console.error('Error registrando auditoría:', err.message);
  }
}
