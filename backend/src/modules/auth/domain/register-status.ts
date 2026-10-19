import type { VerificationOutcome } from './phone-verification.js';

export type RejectionCode =
  | 'REGISTRATION_NOT_ALLOWED'
  | 'PHONE_NOT_BOLIVIAN'
  | 'PHONE_ALREADY_REGISTERED'
  | 'TELEGRAM_ALREADY_REGISTERED';

export type RegisterStatus =
  | { status: 'pending'; expiresAt: string }
  | { status: 'expired' }
  | { status: 'rejected'; code: RejectionCode };

export interface LatestToken {
  expiresAt: Date;
  usedAt: Date | null;
  outcome: VerificationOutcome | null;
}

// Estado del sondeo de una cuenta sin verificar según su último token (RF-003-21).
// `telegramTaken` indica si la cuenta de Telegram que inició el token ya pertenece a otra cuenta.
export function registerStatus(
  token: LatestToken | null,
  telegramTaken: boolean,
  now: Date,
): RegisterStatus {
  if (!token) return { status: 'expired' };
  switch (token.outcome) {
    case 'rechazado_no_boliviano':
      return { status: 'rejected', code: 'PHONE_NOT_BOLIVIAN' };
    case 'rechazado_bloqueado':
      return { status: 'rejected', code: 'REGISTRATION_NOT_ALLOWED' };
    case 'rechazado_duplicado':
      return {
        status: 'rejected',
        code: telegramTaken ? 'TELEGRAM_ALREADY_REGISTERED' : 'PHONE_ALREADY_REGISTERED',
      };
    default:
      break;
  }
  // Contacto ajeno, token usado sin resultado o vencido: hay que pedir un enlace nuevo.
  if (token.usedAt !== null || token.expiresAt.getTime() <= now.getTime()) {
    return { status: 'expired' };
  }
  return { status: 'pending', expiresAt: token.expiresAt.toISOString() };
}
