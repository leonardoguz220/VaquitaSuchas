import { dueAtFor, isOverdue } from './due-date.js';

const lp = (iso: string): Date => new Date(`${iso}-04:00`);

describe('dueAtFor', () => {
  const cut = { year: 2026, month: 10, day: 15 };

  it('RF-002-03: emitido en el corte vence al inicio del día corte+4 en La Paz', () => {
    expect(dueAtFor(cut, lp('2026-10-15T00:00:00')).toISOString()).toBe('2026-10-19T04:00:00.000Z');
  });

  it('RF-002-03: emitido tarde vence 3 días después de la emisión (el mayor de los dos)', () => {
    const issued = lp('2026-10-20T10:30:00');
    expect(dueAtFor(cut, issued).toISOString()).toBe(
      new Date(issued.getTime() + 3 * 86_400_000).toISOString(),
    );
  });

  it('RF-002-03: cruza fin de mes (corte 30 de nov → 4 de dic)', () => {
    const due = dueAtFor({ year: 2026, month: 11, day: 30 }, lp('2026-11-30T00:00:00'));
    expect(due.toISOString()).toBe('2026-12-04T04:00:00.000Z');
  });
});

describe('isOverdue', () => {
  const charge = { dueAt: new Date('2026-10-19T04:00:00Z') };

  it('RN-002-04: now >= dueAt es atrasado; un milisegundo antes no', () => {
    expect(isOverdue(charge, new Date('2026-10-19T03:59:59.999Z'))).toBe(false);
    expect(isOverdue(charge, new Date('2026-10-19T04:00:00.000Z'))).toBe(true);
    expect(isOverdue(charge, new Date('2026-10-20T00:00:00Z'))).toBe(true);
  });
});
