/**
 * Datos simulados que respetan el contrato 005 (`contracts/api.md`), solo para las pruebas.
 * Nombres, montos y fechas son inventados.
 */
import type { AppNotification, NotificationsPage } from '../notifications';

export function notification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'n1',
    type: 'cobro_generado',
    category: 'recordatorios',
    title: 'Se generó tu cobro de octubre',
    body: 'Spotify depa · Bs 19,80 · vence el 21 oct.',
    link: '/cobros/c1',
    readAt: null,
    // 18 oct 2026, 10:30 en La Paz.
    createdAt: '2026-10-18T14:30:00.000Z',
    ...overrides,
  };
}

export const unreadCharge = notification();

export const unreadProof = notification({
  id: 'n2',
  type: 'comprobante_subido',
  category: 'titular',
  title: 'Luis Mamani subió un comprobante',
  body: 'Netflix de la familia · lleva más de 48 horas sin revisar.',
  link: '/cobros/c7',
  createdAt: '2026-10-17T14:30:00.000Z',
});

export const readConfirmed = notification({
  id: 'n3',
  type: 'pago_confirmado',
  category: 'resoluciones',
  title: 'Tu pago fue confirmado',
  body: 'Disney+ primos · octubre · Bs 22,10',
  link: null,
  readAt: '2026-10-13T16:00:00.000Z',
  createdAt: '2026-10-13T15:00:00.000Z',
});

export function notificationsPage(overrides: Partial<NotificationsPage> = {}): NotificationsPage {
  return {
    items: [unreadCharge, unreadProof, readConfirmed],
    nextCursor: null,
    unreadCount: 2,
    ...overrides,
  };
}
