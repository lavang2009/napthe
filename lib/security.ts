import crypto from 'node:crypto';

function getEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error('APP_ENCRYPTION_KEY_MISSING');
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) throw new Error('APP_ENCRYPTION_KEY_INVALID: phải là đúng 64 ký tự hex.');
  return Buffer.from(raw, 'hex');
}

export function validateEncryptionKey() {
  getEncryptionKey();
  return true;
}

export function encryptSecret(value: string) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptSecret(payload: string) {
  const key = getEncryptionKey();
  const raw = Buffer.from(payload, 'base64');
  if (raw.length < 28) throw new Error('Encrypted value is invalid.');
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export function randomRequestId() {
  return `NAPTHE_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
}
