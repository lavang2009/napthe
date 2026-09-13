import crypto from 'node:crypto';

function getEncryptionKey() {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing APP_ENCRYPTION_KEY');
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) throw new Error('APP_ENCRYPTION_KEY must be 64 hex characters (32 bytes).');
  return key;
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
