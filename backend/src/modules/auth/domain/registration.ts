export const REGISTER_IP_LIMIT = 10;
export const TG_TOKEN_LIMIT = 5;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
export const TOKEN_TTL_MS = 10 * 60 * 1000;
export const SECRET_TTL_MS = 24 * 60 * 60 * 1000;

export const BUCKET_REGISTER_IP = 'register:ip';
export const BUCKET_TG_TOKEN_IP = 'tg_token:ip';
export const BUCKET_TG_TOKEN_EMAIL = 'tg_token:email';

// ¿Cabe otro evento si ya hubo `count` en la ventana? (RF-003-21)
export function underLimit(count: number, limit: number): boolean {
  return count < limit;
}

// Segundos de espera hasta que el evento más antiguo de la ventana deje de contar (mínimo 1).
export function retryAfterSeconds(oldest: Date, now: Date, windowMs = RATE_WINDOW_MS): number {
  const wait = oldest.getTime() + windowMs - now.getTime();
  return Math.max(1, Math.ceil(wait / 1000));
}

export function tokenExpiry(now: Date): Date {
  return new Date(now.getTime() + TOKEN_TTL_MS);
}

export function secretExpiry(now: Date): Date {
  return new Date(now.getTime() + SECRET_TTL_MS);
}

export interface RegistrationInput {
  fullName: string;
  email: string;
  ci: string;
  password: string;
  passwordConfirmation: string;
}

export interface RegistrationFieldErrors {
  fields: Partial<Record<'fullName' | 'ci' | 'password' | 'passwordConfirmation', string[]>>;
  rules: string[];
}
