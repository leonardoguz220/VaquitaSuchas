import {
  buildGroupSummary,
  decodeGroupCursor,
  encodeGroupCursor,
  type GroupSummarySource,
} from './group-summary.js';

const base: GroupSummarySource = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Netflix del depa',
  status: 'activo',
  frozenReason: null,
  serviceName: 'Netflix',
  logoUrl: null,
  brandColor: null,
  totalSlots: 4,
  priceCents: 9000,
  currency: 'BS',
  exchangeRate: null,
  billingDay: 15,
  memberCount: 3,
  role: 'titular',
};
const NOW = new Date('2026-10-16T15:00:00.000Z');

describe('buildGroupSummary', () => {
  it('CA-001-21 y RN-001-10: el titular de un grupo de Bs 90,00 entre 3 ve Bs 30,00 como referencia', () => {
    expect(buildGroupSummary(base, NOW)).toMatchObject({
      role: 'titular',
      myShareCents: 3000,
      myShareIsReference: true,
    });
  });

  it('CA-001-20: el miembro ve su cuota base y no es una referencia; el resto va a quien paga', () => {
    const uneven = { ...base, priceCents: 10001, role: 'miembro' as const };
    expect(buildGroupSummary(uneven, NOW)).toMatchObject({
      myShareCents: 3333,
      myShareIsReference: false,
    });
    expect(buildGroupSummary({ ...uneven, role: 'titular' }, NOW).myShareCents).toBe(3335);
  });

  it('RF-001-19: nextCutDate es el siguiente corte en fecha de La Paz', () => {
    expect(buildGroupSummary(base, NOW).nextCutDate).toBe('2026-11-15');
    expect(buildGroupSummary({ ...base, billingDay: 31 }, NOW).nextCutDate).toBe('2026-10-31');
  });

  it('RF-001-19: expone frozenReason y los cupos', () => {
    expect(buildGroupSummary({ ...base, frozenReason: 'titular_baneado' }, NOW)).toMatchObject({
      frozenReason: 'titular_baneado',
      memberCount: 3,
      totalSlots: 4,
    });
  });
});

describe('cursor de grupos', () => {
  it('ida y vuelta, y rechaza basura', () => {
    const cursor = { createdAt: new Date('2026-09-02T16:00:00.123Z'), id: base.id };
    expect(decodeGroupCursor(encodeGroupCursor(cursor))).toEqual(cursor);
    expect(decodeGroupCursor('xx')).toBeNull();
    expect(decodeGroupCursor(Buffer.from('no-fecha|' + base.id).toString('base64url'))).toBeNull();
  });
});
