/**
 * Archivo: backend/src/utils/totp.js
 * Descripción: Implementación RFC 6238 (TOTP) compatible con Google Authenticator / Authy,
 * cifrado AES-256-GCM del secreto en reposo y códigos de recuperación de un solo uso.
 */
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
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

function base32Decode(str) {
  const clean = String(str).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
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

function getEncryptionKey() {
  const raw = process.env.TOTP_ENCRYPTION_KEY || process.env.JWT_ACCESS_SECRET || 'skilltrack_fallback_key_32_bytes';
  return crypto.createHash('sha256').update(raw).digest();
}

function encryptSecret(secretBase32) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secretBase32, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptSecret(payload) {
  const [ivHex, tagHex, encHex] = String(payload).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getEncryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}

function generateTotpSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function computeHotp(secretBase32, counter) {
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

function verifyTotpCode(secretBase32, token, lastUsedStep = null) {
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

function generateRecoveryCodes(count = 6) {
  const plainCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < count; i++) {
    const code = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    plainCodes.push(code);
    hashedCodes.push(crypto.createHash('sha256').update(code).digest('hex'));
  }
  return { plainCodes, hashedCodes };
}

function hashRecoveryCode(code) {
  return crypto.createHash('sha256').update(String(code || '').trim().toUpperCase()).digest('hex');
}

function buildOtpAuthUri(email, secretBase32) {
  const issuer = encodeURIComponent('Campus');
  const account = encodeURIComponent(email);
  return `otpauth://totp/${issuer}:${account}?secret=${secretBase32}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

function generateTOTP(secretBase32) {
  return computeHotp(secretBase32, Math.floor(Date.now() / 30000));
}

module.exports = {
  generateTotpSecret,
  encryptSecret,
  decryptSecret,
  computeHotp,
  generateTOTP,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
  buildOtpAuthUri,
};
