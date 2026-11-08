import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key as Buffer);
    });
  });
}

export async function hashStaffPassword(password: string): Promise<string> {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Password must contain between 12 and 256 characters.');
  const salt = randomBytes(16);
  const hash = await derive(password, salt);
  return `scrypt$16384$8$1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function verifyStaffPassword(password: string, encoded: string | null | undefined): Promise<boolean> {
  if (typeof password !== 'string' || password.length > 256 || !encoded) return false;
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt' || parts[1] !== '16384' || parts[2] !== '8' || parts[3] !== '1') return false;
  try {
    const salt = Buffer.from(parts[4], 'hex');
    const expected = Buffer.from(parts[5], 'hex');
    if (salt.length !== 16 || expected.length !== 64) return false;
    return timingSafeEqual(await derive(password, salt), expected);
  } catch { return false; }
}