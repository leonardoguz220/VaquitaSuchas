import { buildGroupSummary, type GroupSummarySource } from './group-summary.js';
import { decodeGroupListCursor, encodeGroupListCursor } from './group-list-cursor.js';

const group: GroupSummarySource = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Netflix',
  serviceName: 'Netflix',
  logoUrl: null,
  brandColor: '#E50914',
  status: 'activo',
  frozenReason: null,
  totalSlots: 4,
  billingDay: 15,
  priceCents: 9000,
  currency: 'BS',
  exchangeRate: null,
};
const now = new Date('2026-10-16T15:00:00.000Z');

describe('buildGroupSummary', () => {
  it('CA-001-21: el titular de 3 miembros con Bs 90,00 ve 30,00 como referencia', () => {
    const summary = buildGroupSummary({ group, role: 'titular', memberCount: 3, now });
    expect(summary.myShareCents).toBe(3000);
    expect(summary.myShareIsReference).toBe(true);
  });

  it('CA-001-20: el miembro ve su cuota base y el titular el resto sumado', () => {
    const odd = { ...group, priceCents: 10001 };
    expect(buildGroupSummary({ group: odd, role: 'miembro', memberCount: 3, now })).toMatchObject({
      myShareCents: 3333,
      myShareIsReference: false,
    });
    expect(
      buildGroupSummary({ group: odd, role: 'titular', memberCount: 3, now }).myShareCents,
    ).toBe(3335);
  });

  it('CA-001-20: el próximo corte es una fecha de La Paz AAAA-MM-DD', () => {
    expect(buildGroupSummary({ group, role: 'miembro', memberCount: 3, now }).nextCutDate).toBe(
      '2026-11-15',
    );
    expect(
      buildGroupSummary({
        group: { ...group, billingDay: 31 },
        role: 'miembro',
        memberCount: 3,
        now,
      }).nextCutDate,
    ).toBe('2026-10-31');
  });
});

describe('cursor de la lista de grupos', () => {
  it('CA-001-20: ida y vuelta, y rechaza texto inválido', () => {
    const cursor = { joinedAt: new Date('2026-10-01T00:00:00.000Z'), groupId: group.id };
    expect(decodeGroupListCursor(encodeGroupListCursor(cursor))).toEqual(cursor);
    expect(decodeGroupListCursor('basura')).toBeNull();
  });
});
