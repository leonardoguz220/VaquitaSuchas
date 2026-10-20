import type { JoinRequestRecord } from '../repositories/requests.repository.js';
import { currentDeadline, effectiveOf } from './request-lifecycle.js';

const opened = new Date('2026-10-16T15:00:00.000Z');
const base = (over: Partial<JoinRequestRecord>): JoinRequestRecord =>
  ({
    status: 'abierta',
    openedAt: opened,
    openDeadlineAt: new Date(opened.getTime() + 24 * 3600_000),
    payDeadlineAt: null,
    decisionDeadlineAt: null,
    finalReason: null,
    ...over,
  }) as JoinRequestRecord;

describe('effectiveOf (RNF-010-03, research R1)', () => {
  it('abierta vencida a las 24 h: expirada por plazo_solicitud', () => {
    const now = new Date(opened.getTime() + 24 * 3600_000);
    expect(effectiveOf(base({}), now)).toEqual({ status: 'expirada', reason: 'plazo_solicitud' });
  });

  it('abierta cuyo plazo lo fijó el fin de la ventana: expirada por ventana_cerrada (CA-010-39)', () => {
    const windowEnd = new Date(opened.getTime() + 2 * 3600_000);
    const now = new Date(windowEnd.getTime() + 1);
    expect(effectiveOf(base({ openDeadlineAt: windowEnd }), now)).toEqual({
      status: 'expirada',
      reason: 'ventana_cerrada',
    });
  });

  it('antes del plazo se conserva el estado', () => {
    expect(effectiveOf(base({}), opened)).toEqual({ status: 'abierta', reason: null });
  });
});

describe('currentDeadline', () => {
  it('devuelve el plazo del estado almacenado y null en un estado final', () => {
    const pay = new Date('2026-10-16T15:15:00.000Z');
    expect(currentDeadline(base({ status: 'esperando_pago', payDeadlineAt: pay }))).toBe(pay);
    expect(currentDeadline(base({ status: 'cancelada' }))).toBeNull();
  });
});
