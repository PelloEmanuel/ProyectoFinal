// Importa el módulo criptográfico nativo de Node.js para cálculos HMAC-SHA1 y cifrado AES-256-GCM.
import crypto from 'crypto';

// Define el alfabeto estándar RFC 4648 utilizado para codificar secretos TOTP en Base32.
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// Define la estructura devuelta al verificar un código TOTP de 6 dígitos.
export interface ResultadoVerificacionTotp {
  valid: boolean;
  step: number | null;
}

// Define la estructura devuelta al generar códigos de recuperación de un solo uso.
export interface CodigosRecuperacion {
  plainCodes: string[];
  hashedCodes: string[];
}

// Codifica un buffer binario en una cadena Base32 compatible con Google Authenticator y Authy.
function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

// Decodifica una cadena Base32 y devuelve su representación en un Buffer de bytes.
function base32Decode(str: string): Buffer {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i++) {
    const idx = BASE32_ALPHABET.indexOf(clean[i]);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// Deriva una clave simétrica de 32 bytes mediante SHA-256 para cifrar secretos TOTP en reposo.
function getEncryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET || 'skilltrack_fallback_key_32_bytes';
  return crypto.createHash('sha256').update(raw).digest();
}

// Cifra el secreto Base32 utilizando AES-256-GCM con vector de inicialización aleatorio.
export function encryptSecret(secretBase32: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

// Descifra el secreto TOTP almacenado en la base de datos verificando la etiqueta de autenticidad GCM.
export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, encHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

// Genera un nuevo secreto aleatorio de 20 bytes codificado en Base32.
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

// Calcula un código HOTP/TOTP de 6 dígitos según el estándar RFC 4226 / RFC 6238 para un contador dado.
export function computeHotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1000000;
  return String(code).padStart(6, '0');
}

// Verifica si el código ingresado coincide con la ventana temporal actual o adyacente (±30 segundos).
export function verifyTotpCode(
  secretBase32: string,
  token: string,
  lastUsedStep: number | null = null
): ResultadoVerificacionTotp {
  const clean = String(token || '').trim();
  if (!/^\d{6}$/.test(clean)) return { valid: false, step: null };
  const currentStep = Math.floor(Date.now() / 30000);
  for (const offset of [0, -1, 1]) {
    const step = currentStep + offset;
    if (lastUsedStep !== null && Number(lastUsedStep) > step) continue;
    if (computeHotp(secretBase32, step) === clean) {
      return { valid: true, step };
    }
  }
  return { valid: false, step: null };
}

// Genera un lote de códigos de recuperación en texto plano junto con sus hashes SHA-256.
export function generateRecoveryCodes(count: number = 6): CodigosRecuperacion {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    plainCodes.push(code);
    hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { plainCodes, hashedCodes };
}

// Calcula el hash SHA-256 normalizado de un código de recuperación ingresado por el usuario.
export function hashRecoveryCode(code: string): string {
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

// Construye la URI estándar otpauth:// para generar el código QR en aplicaciones autenticadoras.
export function buildOtpAuthUri(email: string, secretBase32: string): string {
  const issuer = encodeURIComponent('Campus');
  const account = encodeURIComponent(email);
  return `otpauth://totp/${issuer}:${account}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

// Genera el código TOTP de 6 dígitos correspondiente al instante actual.
export function generateTOTP(secretBase32: string): string {
  return computeHotp(secretBase32, Math.floor(Date.now() / 30000));
}
