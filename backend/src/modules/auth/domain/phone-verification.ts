import { normalizeBolivianPhone } from './phone.js';

export type VerificationOutcome =
  | 'verificado'
  | 'rechazado_no_boliviano'
  | 'rechazado_contacto_ajeno'
  | 'rechazado_duplicado'
  | 'rechazado_bloqueado';

export interface ContactCheck {
  /** Cuenta de Telegram que escribe al bot. */
  fromTelegramId: number;
  /** Dueño del contacto compartido (puede faltar si no es de Telegram). */
  contactUserId: number | undefined;
  phoneNumber: string;
  /** ¿Las huellas del celular o de Telegram están bloqueadas? */
  blocked: boolean;
  phoneTaken: boolean;
  telegramTaken: boolean;
}

export interface ContactDecision {
  outcome: VerificationOutcome;
  /** Celular normalizado (solo cuando se verifica). */
  phone?: string;
}

// Orden de RF-003-21: (a) contacto propio, (b) celular boliviano, (c) no bloqueado, (d) no usado.
export function decideContact(check: ContactCheck): ContactDecision {
  if (check.contactUserId !== check.fromTelegramId) return { outcome: 'rechazado_contacto_ajeno' };
  const phone = normalizeBolivianPhone(check.phoneNumber);
  if (!phone) return { outcome: 'rechazado_no_boliviano' };
  if (check.blocked) return { outcome: 'rechazado_bloqueado' };
  if (check.phoneTaken || check.telegramTaken) return { outcome: 'rechazado_duplicado' };
  return { outcome: 'verificado', phone };
}
