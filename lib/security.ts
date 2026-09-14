import crypto from 'node:crypto';

function encryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('APP_ENCRYPTION_KEY_MISSING');
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('APP_ENCRYPTION_KEY_INVALID');
  return Buffer.from(raw, 'hex');
}

export function validateEncryptionKey() { encryptionKey(); return true; }

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

export function decryptSecret(payload: string) {
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < 28) throw new Error('INVALID_ENCRYPTED_VALUE');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

export function randomRequestId() {
  return `NAPTHE_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

export function md5(value: string) {
  return crypto.createHash('md5').update(value, 'utf8').digest('hex');
}

export function safeEqualHex(a: string, b: string) {
  try {
    const ab = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
  } catch { return false; }
}
