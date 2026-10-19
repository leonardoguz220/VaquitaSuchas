import type { GroupBrief } from '../repositories/charge-read.repository.js';
import type { ChargeRecord } from '../repositories/charges.repository.js';
import type { ChargeEventRecord } from '../repositories/events.repository.js';
import { presentCharge, presentPublicCharge } from './charge-presenter.js';

const OWNER = 'u-owner';
const PAYER = 'u-payer';
const names = new Map([
  [OWNER, 'Titular Suchas'],
  [PAYER, 'Ana Pagadora'],
]);

const charge = (over: Partial<ChargeRecord> = {}): ChargeRecord => ({
  id: 'c1',
  groupId: 'g1',
  userId: PAYER,
  cycleId: 'cy1',
  period: '2026-10',
  origin: 'ciclo',
  joinRequestId: null,
  status: 'pendiente',
  amountCents: 3333,
  priceCents: 10001,
  currency: 'BS',
  exchangeRate: null,
  totalBsCents: 10001,
  memberCount: 3,
  issuedAt: new Date('2026-10-15T04:00:00Z'),
  dueAt: new Date('2026-10-19T04:00:00Z'),
  firstSubmittedAt: null,
  paidAt: null,
  settledBy: null,
  settlement: null,
  manualNote: null,
  cancelledAt: null,
  cancelledBy: null,
  cancelReason: null,
  version: 1,
  ...over,
});

const group = (over: Partial<GroupBrief> = {}): GroupBrief => ({
  id: 'g1',
  ownerId: OWNER,
  name: 'Grupo',
  serviceName: 'Servicio',
  logoUrl: null,
  status: 'activo',
  frozen: false,
  paymentInfoText: 'Cuenta 123',
  paymentQrKey: null,
  ...over,
});

const rejection = (at: string, invalidReceipt: boolean): ChargeEventRecord => ({
  id: `e-${at}`,
  chargeId: 'c1',
  groupId: 'g1',
  type: 'rechazado',
  actorKind: 'usuario',
  actorId: OWNER,
  fromStatus: 'en_revision',
  toStatus: 'pendiente',
  reason: 'Borroso',
  metadata: { invalidReceipt },
  occurredAt: new Date(at),
});

const base = {
  memberActive: true,
  events: [] as ChargeEventRecord[],
  receipts: [],
  names,
  qrUrl: null,
};

describe('presentCharge', () => {
  it('RF-002-09: las acciones salen del dominio según quién consulta y el estado', () => {
    const asPayer = presentCharge({ ...base, charge: charge(), group: group(), access: 'dueno' });
    expect(asPayer.allowedActions).toEqual(['uploadReceipt']);
    const asOwner = presentCharge({ ...base, charge: charge(), group: group(), access: 'titular' });
    expect(asOwner.allowedActions).toEqual(['manualPayment', 'cancel']);
  });

  it('RF-002-09: los datos de pago solo llegan al dueño y mientras el cobro admite pago', () => {
    const open = presentCharge({
      ...base,
      charge: charge(),
      group: group(),
      access: 'dueno',
      qrUrl: 'https://qr.test/x',
    });
    expect(open.paymentInfo).toEqual({
      text: 'Cuenta 123',
      qrUrl: 'https://qr.test/x',
      configured: true,
    });
    const asTitular = presentCharge({
      ...base,
      charge: charge(),
      group: group(),
      access: 'titular',
    });
    expect(asTitular.paymentInfo).toBeNull();
    const reviewing = presentCharge({
      ...base,
      charge: charge({ status: 'en_revision' }),
      group: group(),
      access: 'dueno',
    });
    expect(reviewing.paymentInfo).toBeNull();
    const unconfigured = presentCharge({
      ...base,
      charge: charge(),
      group: group({ paymentInfoText: null }),
      access: 'dueno',
    });
    expect(unconfigured.paymentInfo).toEqual({ text: null, qrUrl: null, configured: false });
  });

  it('CA-002-07: lastRejection es el rechazo más reciente, con su marca de comprobante inválido', () => {
    const view = presentCharge({
      ...base,
      charge: charge(),
      group: group(),
      access: 'dueno',
      events: [rejection('2026-10-16T10:00:00Z', false), rejection('2026-10-17T10:00:00Z', true)],
    });
    expect(view.lastRejection).toEqual({
      reason: 'Borroso',
      invalidReceipt: true,
      at: '2026-10-17T10:00:00.000Z',
    });
    expect(
      presentCharge({ ...base, charge: charge(), group: group(), access: 'dueno' }).lastRejection,
    ).toBeNull();
  });

  it('RN-002-11: marca como ex miembro a quien ya no está en el grupo', () => {
    const view = presentCharge({
      ...base,
      memberActive: false,
      charge: charge({ status: 'atrasado' }),
      group: group(),
      access: 'dueno_retirado',
    });
    expect(view.member).toEqual({ userId: PAYER, fullName: 'Ana Pagadora', isFormerMember: true });
    expect(view.allowedActions).toEqual(['uploadReceipt']);
  });

  it('RF-002-05: un grupo congelado no permite ninguna acción', () => {
    const view = presentCharge({
      ...base,
      charge: charge(),
      group: group({ frozen: true }),
      access: 'dueno',
    });
    expect(view.allowedActions).toEqual([]);
  });

  it('RF-002-02: el dinero sale en centavos enteros y las fechas en ISO UTC', () => {
    const view = presentCharge({ ...base, charge: charge(), group: group(), access: 'titular' });
    expect(view.amountCents).toBe(3333);
    expect(view.totalBsCents).toBe(10001);
    expect(view.dueAt).toBe('2026-10-19T04:00:00.000Z');
    expect(view.paidAt).toBeNull();
  });
});

describe('presentPublicCharge', () => {
  it('CA-002-17: la vista pública no lleva comprobantes, referencias, motivos ni notas', () => {
    const view = presentPublicCharge({
      charge: charge({
        status: 'pagado',
        manualNote: 'nota privada',
        cancelReason: 'motivo privado',
      }),
      memberActive: true,
      events: [rejection('2026-10-16T10:00:00Z', true)],
      names,
    });
    const json = JSON.stringify(view);
    for (const secret of ['Borroso', 'nota privada', 'motivo privado', 'receipts', 'reference']) {
      expect(json).not.toContain(secret);
    }
    expect(view).not.toHaveProperty('currentReceipt');
    expect(view).not.toHaveProperty('allowedActions');
  });

  it('CA-002-18: la línea de tiempo trae evento, autor y fecha; el sistema no tiene autor', () => {
    const view = presentPublicCharge({
      charge: charge(),
      memberActive: false,
      events: [
        rejection('2026-10-16T10:00:00Z', false),
        { ...rejection('2026-10-17T10:00:00Z', false), type: 'atrasado', actorId: null },
      ],
      names,
    });
    expect(view.member).toEqual({ userId: PAYER, fullName: 'Ana Pagadora', isFormerMember: true });
    expect(view.timeline).toEqual([
      {
        type: 'rechazado',
        actor: { userId: OWNER, fullName: 'Titular Suchas' },
        occurredAt: '2026-10-16T10:00:00.000Z',
      },
      { type: 'atrasado', actor: null, occurredAt: '2026-10-17T10:00:00.000Z' },
    ]);
  });
});
