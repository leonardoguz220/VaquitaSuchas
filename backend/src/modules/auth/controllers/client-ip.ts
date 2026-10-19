import type { Request } from 'express';

/** IP de quien llama: primer valor de X-Forwarded-For (proxy del frontend) o la del socket. */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.ip || 'unknown';
}
