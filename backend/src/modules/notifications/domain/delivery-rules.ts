import { toLaPazParts } from '../../../shared/domain/la-paz.js';
import type { NotificationCategory, SendTiming } from './catalog.js';

// Envíos por canal (spec 005, RF-005-17, RF-005-20, RN-005-04, RNF-005-03). Funciones puras: el
// servicio las llama al crear el aviso (`deliveryPlan`) y de nuevo al enviarlo (`inSendWindow`).

export const DELIVERY_CHANNELS = ['email', 'telegram'] as const;
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** Canales que hoy crean envíos. Telegram (parte C) se suma aquí sin tocar el resto del diseño. */
export const ENABLED_CHANNELS: readonly DeliveryChannel[] = ['email'];

export const SKIP_REASONS = [
  'preferencia_desactivada',
  'usuario_suspendido',
  'telegram_bloqueado',
  'correo_rebotado',
  'aviso_cancelado',
] as const;
export type SkipReason = (typeof SKIP_REASONS)[number];

export type CategorySwitches = Record<NotificationCategory, boolean>;

export interface DeliveryPreferences {
  email: CategorySwitches;
  telegram: CategorySwitches;
  telegramBlockedAt: Date | null;
  emailBouncedAt: Date | null;
}

const ALL_ON: CategorySwitches = {
  recordatorios: true,
  resoluciones: true,
  titular: true,
  grupo: true,
};

/** Valores por defecto (RF-005-27): todo encendido. */
export const DEFAULT_PREFERENCES: DeliveryPreferences = {
  email: { ...ALL_ON },
  telegram: { ...ALL_ON },
  telegramBlockedAt: null,
  emailBouncedAt: null,
};

export interface DeliveryUser {
  status: 'activo' | 'suspendido' | 'baneado' | string;
}

export type DeliveryDecision =
  | { channel: DeliveryChannel; status: 'pending'; respectWindow: boolean }
  | { channel: DeliveryChannel; status: 'skipped'; respectWindow: boolean; reason: SkipReason };

/**
 * Por canal: `pending` o `skipped` con motivo (CA-005-11, RN-005-04). Un usuario suspendido o
 * inactivo no recibe nada; un correo rebotado o un bot bloqueado cortan su canal; después manda el
 * interruptor de la categoría. `respectWindow` solo para los recordatorios (RNF-005-03).
 */
export function deliveryPlan(
  notification: { category: NotificationCategory; timing: SendTiming },
  prefs: DeliveryPreferences,
  user: DeliveryUser,
  channels: readonly DeliveryChannel[] = ENABLED_CHANNELS,
): DeliveryDecision[] {
  const respectWindow = notification.timing === 'ventana';
  return channels.map((channel): DeliveryDecision => {
    const skip = (reason: SkipReason): DeliveryDecision => ({
      channel,
      status: 'skipped',
      respectWindow,
      reason,
    });
    if (user.status !== 'activo') return skip('usuario_suspendido');
    if (channel === 'email' && prefs.emailBouncedAt) return skip('correo_rebotado');
    if (channel === 'telegram' && prefs.telegramBlockedAt) return skip('telegram_bloqueado');
    if (!prefs[channel][notification.category]) return skip('preferencia_desactivada');
    return { channel, status: 'pending', respectWindow };
  });
}

/** Ventana de envío de los recordatorios: de 08:00 a 19:59:59 de La Paz (CA-005-24). */
export const WINDOW_START_HOUR = 8;
export const WINDOW_END_HOUR = 20;

export function inSendWindow(now: Date): boolean {
  const { hour } = toLaPazParts(now);
  return hour >= WINDOW_START_HOUR && hour < WINDOW_END_HOUR;
}

/** Próxima apertura de la ventana (08:00 de La Paz): hoy si aún no abrió, si no mañana. */
export function nextWindowOpening(now: Date): Date {
  if (inSendWindow(now)) return now;
  const p = toLaPazParts(now);
  const days = p.hour < WINDOW_START_HOUR ? 0 : 1;
  // La Paz es UTC−4 todo el año (RN-000-01): las 08:00 locales son las 12:00 UTC.
  return new Date(Date.UTC(p.year, p.month - 1, p.day + days, WINDOW_START_HOUR + 4, 0, 0, 0));
}
