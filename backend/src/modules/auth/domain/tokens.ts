import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export type TokenState = 'usable' | 'expired' | 'used';

export function tokenIsUsable(
  token: { expiresAt: Date; usedAt: Date | null },
  now: Date,
): TokenState {
  if (token.usedAt !== null) return 'used';
  return token.expiresAt.getTime() > now.getTime() ? 'usable' : 'expired';
}

// 32 bytes aleatorios en base64url (se envía por correo; en la base solo va su hash).
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenHashesEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
