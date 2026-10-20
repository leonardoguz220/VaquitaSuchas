import { entryWindow } from './entry-window.js';

const lp = (iso: string): Date => new Date(`${iso}-04:00`);
const group = { billingDay: 10, createdAt: lp('2026-01-01T09:00:00') };

describe('entryWindow', () => {
  it('CA-001-26: corte el día 10, abierta el 13 a las 23:59:59', () => {
    const w = entryWindow(group, lp('2026-10-13T23:59:59'));
    expect(w.isOpen).toBe(true);
    expect(w.start).toEqual(lp('2026-10-10T00:00:00'));
    expect(w.endExclusive).toEqual(lp('2026-10-14T00:00:00'));
    expect(w.closesAt).toEqual(lp('2026-10-13T23:59:59'));
    expect(w.opensAt).toBeNull();
  });

  it('CA-001-26: cerrada el 14 a las 00:00, con la fecha de la próxima apertura', () => {
    const w = entryWindow(group, lp('2026-10-14T00:00:00'));
    expect(w.isOpen).toBe(false);
    expect(w.opensAt).toEqual(lp('2026-11-10T00:00:00'));
    expect(w.closesAt).toBeNull();
  });

  it('CA-001-26: abre justo al comenzar el día del corte', () => {
    expect(entryWindow(group, lp('2026-10-09T23:59:59')).isOpen).toBe(false);
    expect(entryWindow(group, lp('2026-10-10T00:00:00')).isOpen).toBe(true);
  });

  it('CA-001-27: grupo nuevo creado a mitad del día tiene ventana inicial hasta el día 3 siguiente completo', () => {
    const created = lp('2026-10-12T15:30:00');
    const g = { billingDay: 25, createdAt: created };
    expect(entryWindow(g, lp('2026-10-12T15:30:00')).isOpen).toBe(true);
    expect(entryWindow(g, lp('2026-10-15T23:59:59')).isOpen).toBe(true);
    expect(entryWindow(g, lp('2026-10-15T23:59:59')).start).toEqual(created);
    expect(entryWindow(g, lp('2026-10-16T00:00:00')).isOpen).toBe(false);
    expect(entryWindow(g, lp('2026-10-16T00:00:00')).opensAt).toEqual(lp('2026-10-25T00:00:00'));
  });

  it('CA-001-27: un corte posterior dentro de la ventana inicial la prolonga', () => {
    const g = { billingDay: 13, createdAt: lp('2026-10-12T15:30:00') };
    const w = entryWindow(g, lp('2026-10-14T10:00:00'));
    expect(w.isOpen).toBe(true);
    expect(w.start).toEqual(lp('2026-10-12T15:30:00'));
    expect(w.endExclusive).toEqual(lp('2026-10-17T00:00:00'));
  });

  it('RF-001-22: windowDays configurable', () => {
    expect(entryWindow(group, lp('2026-10-14T12:00:00'), 5).isOpen).toBe(true);
  });

  it('CA-001-17: día 31 en febrero abre el 28', () => {
    const g = { billingDay: 31, createdAt: lp('2026-01-01T00:00:00') };
    expect(entryWindow(g, lp('2026-02-28T08:00:00')).isOpen).toBe(true);
    expect(entryWindow(g, lp('2026-02-27T08:00:00')).opensAt).toEqual(lp('2026-02-28T00:00:00'));
  });
});
