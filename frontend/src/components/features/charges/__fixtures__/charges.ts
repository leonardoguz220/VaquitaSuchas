/**
 * Datos de prueba fieles a `specs/002-cobros-y-pagos/contracts/api.md`. Solo los importan las
 * pruebas. Nombres y montos inventados.
 */
import type { Charge, ChargeEvent, MyCharge } from '@/services/charges';

const ana = { userId: 'u-ana', fullName: 'Ana Quispe Mamani' };
const marco = { userId: 'u-marco', fullName: 'Marco Vargas Rojas' };

const events: ChargeEvent[] = [
  {
    id: 'e-1',
    type: 'generado',
    actor: null,
    fromStatus: null,
    toStatus: 'pendiente',
    reason: null,
    occurredAt: '2026-10-18T04:00:00.000Z',
  },
  {
    id: 'e-2',
    type: 'comprobante_subido',
    actor: ana,
    fromStatus: 'pendiente',
    toStatus: 'en_revision',
    reason: null,
    occurredAt: '2026-10-18T14:30:00.000Z',
  },
  {
    id: 'e-3',
    type: 'rechazado',
    actor: marco,
    fromStatus: 'en_revision',
    toStatus: 'pendiente',
    reason: 'El monto no coincide.',
    occurredAt: '2026-10-18T22:05:00.000Z',
  },
];

/** Cobro `pendiente` con un rechazo previo y datos de pago completos. Monto a propósito «raro». */
export const pendingCharge: Charge = {
  id: 'c-pend',
  groupId: 'g-spotify',
  cycleId: 'cy-1',
  period: '2026-10',
  origin: 'ciclo',
  member: { ...ana, isFormerMember: false },
  amountCents: 1981,
  status: 'pendiente',
  issuedAt: '2026-10-18T04:00:00.000Z',
  dueAt: '2026-10-22T03:59:00.000Z',
  paidAt: null,
  firstSubmittedAt: '2026-10-18T14:30:00.000Z',
  priceCents: 1707,
  currency: 'USD',
  exchangeRate: '6.9600',
  totalBsCents: 11881,
  memberCount: 6,
  settlement: null,
  settledBy: null,
  manualNote: null,
  cancelReason: null,
  lastRejection: {
    reason: 'El monto no coincide.',
    invalidReceipt: true,
    at: '2026-10-18T22:05:00.000Z',
  },
  currentReceipt: null,
  receipts: [],
  timeline: events,
  paymentInfo: {
    text: 'BNB · Cuenta 4501-998877',
    qrUrl: 'https://storage.example/qr.png',
    configured: true,
  },
  allowedActions: ['uploadReceipt'],
  version: 3,
};

export const paidCharge: Charge = {
  ...pendingCharge,
  id: 'c-paid',
  status: 'pagado',
  paidAt: '2026-10-13T19:40:00.000Z',
  settlement: 'comprobante',
  settledBy: marco,
  lastRejection: null,
  paymentInfo: null,
  allowedActions: [],
};

function listItem(charge: Charge, group: MyCharge['group']): MyCharge {
  const { receipts: _receipts, ...rest } = charge;
  void _receipts;
  return { ...rest, group };
}

const spotify = { id: 'g-spotify', name: 'Spotify depa', serviceName: 'Spotify', logoUrl: null };

export const myPending = listItem(pendingCharge, spotify);
export const myPaid = listItem(paidCharge, {
  id: 'g-disney',
  name: 'Disney+ primos',
  serviceName: 'Disney+',
  logoUrl: null,
});
export const myOverdueFormer: MyCharge = {
  ...listItem(
    {
      ...pendingCharge,
      id: 'c-over',
      groupId: 'g-paramount',
      period: '2026-09',
      status: 'atrasado',
      amountCents: 1420,
      dueAt: '2026-09-09T03:59:00.000Z',
      lastRejection: null,
    },
    { id: 'g-paramount', name: 'Paramount+ del curso', serviceName: 'Paramount+', logoUrl: null },
  ),
  member: { ...ana, isFormerMember: true },
};
export const myInReview = listItem(
  { ...pendingCharge, id: 'c-rev', status: 'en_revision', lastRejection: null },
  spotify,
);
export const myCancelled = listItem(
  { ...pendingCharge, id: 'c-canc', status: 'cancelado', lastRejection: null },
  spotify,
);
