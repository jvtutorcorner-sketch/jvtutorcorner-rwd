// lib/auth/password.ts
// Password hashing via Node's built-in scrypt — no extra dependency required.
// Format: scrypt$<saltHex>$<hashHex>. Values without this prefix are legacy
// plaintext passwords predating this change; isHashed() lets callers detect
// and lazily migrate them on next successful login.

import crypto from 'crypto';

const SCRYPT_KEYLEN = 64;
const PREFIX = 'scrypt';

export function isHashed(stored: string): boolean {
  return typeof stored === 'string' && stored.startsWith(`${PREFIX}$`);
}

export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN).toString('hex');
  return `${PREFIX}$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!isHashed(stored)) {
    // Legacy plaintext profile — compare directly so existing users can still log in.
    return plain === stored;
  }
  const [, salt, hashHex] = stored.split('$');
  if (!salt || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(plain, salt, SCRYPT_KEYLEN);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}
