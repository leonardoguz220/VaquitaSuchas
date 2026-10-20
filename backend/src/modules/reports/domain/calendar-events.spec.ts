import { describe, expect, it } from '@jest/globals';
import {
  calendarEventsFor,
  daysLate,
  type CalendarCharge,
  type CalendarGroup,
} from './calendar-events.js';

const group = (over: Partial<CalendarGroup> = {}): CalendarGroup => ({
  groupId: 'g1',
  groupName: 'Netflix',
  serviceName: 'Netflix',
  role: 'miembro',
  billingDay: 31,
  closed: false,
  memberCount: 3,
  totalBsCents: 10000,
  ...over,
});

const today = new Date('2026-02-10T16:00:00Z');

describe('calendarEventsFor', () => {
  it('CA-006-13: día de cobro 31 en febrero cae el 28', () => {
    const [event] = calendarEventsFor('2026-02', [group()], [], today);
    expect(event).toMatchObject({ kind: 'corte', date: '2026-02-28', estimated: true });
  });

  it('CA-006-13: en un año bisiesto cae el 29', () => {
    const [event] = calendarEventsFor('2028-02', [group()], [], new Date('2028-02-01T12:00:00Z'));
    expect(event?.date).toBe('2028-02-29');
  });

  it('estima la cuota con splitShares: miembro la base, titular con el resto', () => {
    const [member] = calendarEventsFor('2026-03', [group()], [], today);
    const [owner] = calendarEventsFor('2026-03', [group({ role: 'titular' })], [], today);
    expect(member?.amountCents).toBe(3333);
    expect(owner?.amountCents).toBe(3334);
  });

  it('usa el monto del cobro existente y no lo marca estimado', () => {
    const charge: CalendarCharge = {
      chargeId: 'c1',
      groupId: 'g1',
      period: '2026-02',
      amountCents: 2500,
      status: 'pendiente',
      dueAt: new Date('2026-03-04T04:00:00Z'),
    };
    const events = calendarEventsFor('2026-02', [group()], [charge], today);
    expect(events[0]).toMatchObject({
      kind: 'corte',
      amountCents: 2500,
      estimated: false,
      chargeId: 'c1',
    });
  });

  it('agrega el vencimiento (último día de pago) de cobros abiertos del mes', () => {
    const charge: CalendarCharge = {
      chargeId: 'c1',
      groupId: 'g1',
      period: '2026-02',
      amountCents: 2500,
      status: 'atrasado',
      dueAt: new Date('2026-03-04T04:00:00Z'), // exclusivo: último día de pago es el 3
    };
    const march = calendarEventsFor('2026-03', [group()], [charge], today);
    expect(march.find((e) => e.kind === 'vencimiento')).toMatchObject({
      date: '2026-03-03',
      chargeId: 'c1',
    });
  });

  it('ignora cobros ya pagados o cancelados', () => {
    const charge: CalendarCharge = {
      chargeId: 'c1',
      groupId: 'g1',
      period: '2026-02',
      amountCents: 2500,
      status: 'pagado',
      dueAt: new Date('2026-03-04T04:00:00Z'),
    };
    const march = calendarEventsFor('2026-03', [group()], [charge], today);
    expect(march.some((e) => e.kind === 'vencimiento')).toBe(false);
  });

  it('un grupo cerrado aparece solo en meses pasados', () => {
    const closed = group({ closed: true });
    expect(calendarEventsFor('2026-01', [closed], [], today)).toHaveLength(1);
    expect(calendarEventsFor('2026-03', [closed], [], today)).toHaveLength(0);
  });
});

describe('daysLate', () => {
  it('cuenta días de calendario de La Paz desde el vencimiento', () => {
    const dueAt = new Date('2026-03-04T04:00:00Z');
    expect(daysLate(dueAt, new Date('2026-03-04T05:00:00Z'))).toBe(0);
    expect(daysLate(dueAt, new Date('2026-03-07T20:00:00Z'))).toBe(3);
  });

  it('nunca es negativo', () => {
    expect(daysLate(new Date('2026-03-04T04:00:00Z'), new Date('2026-03-01T12:00:00Z'))).toBe(0);
  });
});
