/**
 * Datos simulados que respetan el contrato 010 (`contracts/api.md`), solo para las pruebas.
 * Nombres, montos y fechas son inventados.
 */
import type { JoinRequest } from '../join-requests';

/** Hora del servidor en las respuestas simuladas: 18 oct 2026, 14:41 en La Paz. */
export const SERVER_NOW = '2026-10-18T18:41:00.000Z';

/** Solicitud `abierta` de Ana al grupo de Rodrigo, vista por Ana (solicitante). */
export const openRequest: JoinRequest = {
  id: 'jr1',
  group: {
    id: 'g7',
    name: 'Max de amigos',
    serviceName: 'Max',
    planName: 'Estándar',
    logoUrl: null,
    brandColor: '#4B2A8C',
    billingDay: 17,
  },
  applicant: { userId: 'u2', fullName: 'Ana Quispe Mamani', stars: null, level: null },
  host: { userId: 'u5', fullName: 'Rodrigo Salazar Paz', stars: 4.5, level: 'Muy bueno' },
  source: 'codigo',
  phase: {
    status: 'abierta',
    // Vence al cerrar la ventana: 19 oct 23:59:59 en La Paz (instante exclusivo 20 oct 00:00).
    deadlineAt: '2026-10-20T04:00:00.000Z',
    deadlineKind: 'solicitud',
    serverNow: SERVER_NOW,
  },
  openedAt: '2026-10-18T18:20:00.000Z',
  estimatedShareCents: 2100,
  quote: null,
  paymentInfo: null,
  extended: false,
  proof: null,
  entryWindow: { isOpen: true, opensAt: null, closesAt: '2026-10-20T03:59:59.000Z' },
  finalReason: null,
  rejectReason: null,
  rejectedAsFalse: false,
  chargeId: null,
  unreadCount: 0,
  disputes: [],
  canOpenDispute: null,
  allowedActions: ['cancel', 'sendMessage'],
  timeline: [
    {
      type: 'abierta',
      actor: { userId: 'u2', fullName: 'Ana Quispe Mamani' },
      fromStatus: null,
      toStatus: 'abierta',
      reason: null,
      occurredAt: '2026-10-18T18:20:00.000Z',
    },
  ],
  version: 1,
};

/** La misma solicitud `esperando_pago`, con la cuota fijada en Bs 21,00 y 12:34 de plazo. */
export const awaitingPaymentRequest: JoinRequest = {
  ...openRequest,
  phase: {
    status: 'esperando_pago',
    deadlineAt: '2026-10-18T18:53:34.000Z',
    deadlineKind: 'pago',
    serverNow: SERVER_NOW,
  },
  quote: {
    amountCents: 2100,
    priceCents: 8400,
    currency: 'BS',
    exchangeRate: null,
    totalBsCents: 8400,
    memberCount: 4,
  },
  paymentInfo: { text: 'BNB · Cuenta 4502-117733 · Rodrigo Salazar Paz', qrAvailable: true },
  unreadCount: 2,
  allowedActions: ['uploadProof', 'cancel', 'sendMessage'],
  timeline: [
    ...openRequest.timeline,
    {
      type: 'datos_pago_enviados',
      actor: { userId: 'u5', fullName: 'Rodrigo Salazar Paz' },
      fromStatus: 'abierta',
      toStatus: 'esperando_pago',
      reason: null,
      occurredAt: '2026-10-18T18:41:00.000Z',
    },
  ],
  version: 2,
};

/** Solicitud `aceptada` (historial): pagó Bs 19,80 al entrar a "Spotify depa". */
export const acceptedRequest: JoinRequest = {
  ...openRequest,
  id: 'jr3',
  group: {
    id: 'g2',
    name: 'Spotify depa',
    serviceName: 'Spotify',
    planName: 'Familiar',
    logoUrl: null,
    brandColor: '#14743A',
    billingDay: 18,
  },
  host: { userId: 'u1', fullName: 'Marco Vargas Rojas', stars: null, level: null },
  phase: { status: 'aceptada', deadlineAt: null, deadlineKind: null, serverNow: SERVER_NOW },
  openedAt: '2026-09-18T15:00:00.000Z',
  estimatedShareCents: 1980,
  quote: {
    amountCents: 1980,
    priceCents: 1707,
    currency: 'USD',
    exchangeRate: '6.9600',
    totalBsCents: 11881,
    memberCount: 6,
  },
  finalReason: 'confirmada',
  chargeId: 'c9',
  allowedActions: [],
  version: 5,
};

/** Construye una solicitud a partir de `openRequest` con los cambios indicados. */
export function joinRequest(overrides: Partial<JoinRequest> = {}): JoinRequest {
  return { ...openRequest, ...overrides };
}
