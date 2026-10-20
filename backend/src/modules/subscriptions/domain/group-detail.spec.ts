import { buildBreakdown, buildGroupDetail, type GroupDetailSource } from './group-detail.js';

const group: GroupDetailSource = {
  id: 'g1',
  name: 'Netflix del depa',
  status: 'activo',
  frozenReason: null,
  createdAt: new Date('2026-10-16T15:00:00Z'),
  serviceName: 'Netflix',
  planName: 'Premium',
  catalogPlanId: 'p1',
  logoUrl: null,
  brandColor: '#E50914',
  billingDay: 15,
  totalSlots: 4,
  priceCents: 1000,
  currency: 'USD',
  exchangeRate: '6.9600',
  acceptingMembers: true,
  paymentInfoText: null,
  inviteCode: 'ABCDEFGH',
  version: 1,
};

const owner = {
  userId: 'u1',
  fullName: 'Ana',
  role: 'titular' as const,
  phone: '+59170000001',
  joinedAt: new Date('2026-10-16T15:00:00Z'),
};

describe('buildBreakdown', () => {
  it('RN-001-02 y RF-001-11: USD 10,00 a 6,96 entre 3: base 23,20, titular 23,20 y resto 0', () => {
    expect(buildBreakdown(group, 3)).toMatchObject({
      totalBsCents: 6960,
      baseShareCents: 2320,
      ownerShareCents: 2320,
      remainderCents: 0,
    });
  });

  it('RN-001-02: el resto de centavos va al titular y la suma cuadra', () => {
    const b = buildBreakdown(
      { ...group, currency: 'BS', exchangeRate: null, priceCents: 10001 },
      3,
    );
    expect(b.baseShareCents).toBe(3333);
    expect(b.ownerShareCents).toBe(3335);
    expect(b.baseShareCents * 2 + b.ownerShareCents).toBe(b.totalBsCents);
  });
});

describe('buildGroupDetail', () => {
  const now = new Date('2026-10-16T16:00:00Z');

  it('RF-001-06: el código de invitación solo lo ve el titular', () => {
    const asOwner = buildGroupDetail({
      group,
      members: [owner],
      viewerRole: 'titular',
      paymentQrUrl: null,
      now,
    });
    const asMember = buildGroupDetail({
      group,
      members: [owner],
      viewerRole: 'miembro',
      paymentQrUrl: null,
      now,
    });
    expect(asOwner.inviteCode).toBe('ABCDEFGH');
    expect('inviteCode' in asMember).toBe(false);
  });

  it('RN-001-10: la cuota del titular es de referencia (base más resto)', () => {
    const detail = buildGroupDetail({
      group: { ...group, currency: 'BS', exchangeRate: null, priceCents: 10001 },
      members: [
        owner,
        { ...owner, userId: 'u2', role: 'miembro' },
        { ...owner, userId: 'u3', role: 'miembro' },
      ],
      viewerRole: 'titular',
      paymentQrUrl: null,
      now,
    });
    expect(detail.myShareCents).toBe(3335);
  });

  it('RF-001-22: un grupo recién creado tiene la ventana de ingreso abierta', () => {
    const detail = buildGroupDetail({
      group,
      members: [owner],
      viewerRole: 'titular',
      paymentQrUrl: null,
      now,
    });
    expect(detail.entryWindow.isOpen).toBe(true);
    expect(detail.entryWindow.closesAt).not.toBeNull();
    expect(detail.service.isCustom).toBe(false);
  });

  it('RF-001-20: sin texto ni QR los datos de pago no están configurados', () => {
    const detail = buildGroupDetail({
      group,
      members: [owner],
      viewerRole: 'titular',
      paymentQrUrl: null,
      now,
    });
    expect(detail.paymentInfo).toEqual({ text: null, qrUrl: null, configured: false });
  });
});
