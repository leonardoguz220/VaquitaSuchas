/**
 * Datos simulados que respetan el contrato 002 (`contracts/api.md`), solo para las pruebas.
 * Nombres, montos y fechas son inventados.
 */
import type { Charge, MyCharge, Receipt } from '../charges';

/** Cobro `pendiente` de Ana (miembro) en "Spotify depa", visto por ella. */
export const pendingCharge: Charge = {
  id: 'c1',
  groupId: 'g2',
  period: '2026-10',
  origin: 'ciclo',
  member: { userId: 'u2', fullName: 'Ana Quispe Mamani', isFormerMember: false },
  amountCents: 1980,
  status: 'pendiente',
  // Vence al terminar el 21 oct en La Paz (instante exclusivo: 22 oct 00:00 -04:00).
  dueAt: '2026-10-22T04:00:00.000Z',
  paidAt: null,
  cycleId: 'cy1',
  issuedAt: '2026-10-18T04:00:00.000Z',
  firstSubmittedAt: null,
  priceCents: 1707,
  currency: 'USD',
  exchangeRate: '6.9600',
  totalBsCents: 11881,
  memberCount: 6,
  settlement: null,
  settledBy: null,
  manualNote: null,
  cancelReason: null,
  lastRejection: null,
  currentReceipt: null,
  receipts: [],
  timeline: [
    {
      id: 'e1',
      type: 'generado',
      actor: null,
      fromStatus: null,
      toStatus: 'pendiente',
      reason: null,
      occurredAt: '2026-10-18T04:00:00.000Z',
    },
  ],
  paymentInfo: {
    text: 'BNB · Cuenta 4501-998877 · Marco Vargas Rojas',
    qrUrl: 'https://storage.vaquita.test/qr/firmado?token=abc',
    configured: true,
  },
  allowedActions: ['uploadReceipt'],
  version: 1,
};

export const currentReceipt: Receipt = {
  id: 'r1',
  uploadedAt: '2026-10-19T14:42:00.000Z',
  uploadedBy: { userId: 'u2', fullName: 'Ana Quispe Mamani' },
  method: 'transferencia',
  reference: 'TRF-889102',
  mime: 'image/jpeg',
  sizeBytes: 880640,
  status: 'vigente',
  fileAvailable: true,
};

/** El mismo cobro ya `en_revision`, visto por el titular (Marco). */
export const reviewCharge: Charge = {
  ...pendingCharge,
  status: 'en_revision',
  firstSubmittedAt: '2026-10-19T14:42:00.000Z',
  currentReceipt,
  receipts: [currentReceipt],
  timeline: [
    ...pendingCharge.timeline,
    {
      id: 'e2',
      type: 'comprobante_subido',
      actor: { userId: 'u2', fullName: 'Ana Quispe Mamani' },
      fromStatus: 'pendiente',
      toStatus: 'en_revision',
      reason: null,
      occurredAt: '2026-10-19T14:42:00.000Z',
    },
  ],
  paymentInfo: null,
  allowedActions: ['confirm', 'reject'],
  version: 2,
};

/** Ítem de "Mis cobros". */
export function myCharge(overrides: Partial<MyCharge> = {}): MyCharge {
  return {
    ...pendingCharge,
    group: { id: 'g2', name: 'Spotify depa', serviceName: 'Spotify', logoUrl: null },
    ...overrides,
  };
}
