import { DomainError } from '../../../shared/errors/domain-error.js';
import { allowedRoundActions, allowedRowActions } from './allowed-actions.js';
import {
  canCloseRound,
  isRowResolved,
  NEW_ROW,
  transitionRound,
  transitionRow,
  type Choice,
  type ExtraStatus,
  type RefundStatus,
  type RowAction,
  type RowContext,
  type RowState,
} from './state.js';

const NOW = new Date('2026-10-29T12:00:00Z');
const BEFORE = new Date('2026-10-30T12:00:00Z');
const AFTER = new Date('2026-10-28T12:00:00Z');

const ctx = (overrides: Partial<RowContext> = {}): RowContext => ({
  now: NOW,
  respondBy: BEFORE,
  extraDeadlineAt: BEFORE,
  refundDueAt: AFTER,
  ...overrides,
});

const state = (choice: Choice, extra: ExtraStatus, refund: RefundStatus): RowState => ({
  choice,
  extra,
  refund,
});

const expectError = (fn: () => unknown, code: string): void => {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`se esperaba ${code}`);
};

describe('transitionRow', () => {
  it('CA-011-05: cubrir abre el pago adicional', () => {
    expect(transitionRow(NEW_ROW, 'cover', ctx())).toEqual(
      state('cubrir', 'pendiente_pago', 'no_aplica'),
    );
  });

  it('CA-011-06: pedir devolución abre la devolución', () => {
    expect(transitionRow(NEW_ROW, 'requestRefund', ctx())).toEqual(
      state('devolucion', 'no_aplica', 'pendiente'),
    );
  });

  it('RF-011-04: pasado el plazo ya no se puede responder', () => {
    expectError(() => transitionRow(NEW_ROW, 'cover', ctx({ now: BEFORE })), 'DEADLINE_PASSED');
    expectError(
      () => transitionRow(NEW_ROW, 'requestRefund', ctx({ now: BEFORE })),
      'DEADLINE_PASSED',
    );
  });

  it('CA-011-07: informar, confirmar y rechazar el pago adicional', () => {
    const covering = state('cubrir', 'pendiente_pago', 'no_aplica');
    const informed = transitionRow(covering, 'pay', ctx());
    expect(informed.extra).toBe('informado');
    expect(transitionRow(informed, 'confirmPayment', ctx()).extra).toBe('confirmado');
    expect(transitionRow(informed, 'rejectPayment', ctx()).extra).toBe('pendiente_pago');
  });

  it('RF-011-10: no se informa un pago pasado el plazo de pago', () => {
    expectError(
      () =>
        transitionRow(state('cubrir', 'pendiente_pago', 'no_aplica'), 'pay', ctx({ now: BEFORE })),
      'DEADLINE_PASSED',
    );
  });

  it('CA-011-08: sin respuesta al vencer el plazo pasa a devolución', () => {
    expect(transitionRow(NEW_ROW, 'expireResponse', ctx({ now: BEFORE }))).toEqual(
      state('sin_respuesta', 'no_aplica', 'pendiente'),
    );
    expectError(() => transitionRow(NEW_ROW, 'expireResponse', ctx()), 'INVALID_TRANSITION');
  });

  it('CA-011-09: un pago sin informar vencido pasa a devolución; uno informado no vence', () => {
    expect(
      transitionRow(
        state('cubrir', 'pendiente_pago', 'no_aplica'),
        'expirePayment',
        ctx({ now: BEFORE }),
      ),
    ).toEqual(state('sin_respuesta', 'vencido', 'pendiente'));
    expectError(
      () =>
        transitionRow(
          state('cubrir', 'informado', 'no_aplica'),
          'expirePayment',
          ctx({ now: BEFORE }),
        ),
      'INVALID_TRANSITION',
    );
  });

  it('CA-011-10 y 11: registrar, confirmar y disputar la devolución', () => {
    const pending = state('devolucion', 'no_aplica', 'pendiente');
    const sent = transitionRow(pending, 'sendRefund', ctx());
    expect(sent.refund).toBe('enviada');
    expect(transitionRow(sent, 'confirmRefund', ctx()).refund).toBe('confirmada');
    expect(transitionRow(sent, 'disputeRefund', ctx()).refund).toBe('disputada');
  });

  it('RF-011-12: sin registro del titular solo se disputa tras el plazo', () => {
    const pending = state('devolucion', 'no_aplica', 'pendiente');
    expect(transitionRow(pending, 'disputeRefund', ctx({ refundDueAt: AFTER })).refund).toBe(
      'disputada',
    );
    expectError(
      () => transitionRow(pending, 'disputeRefund', ctx({ refundDueAt: BEFORE })),
      'INVALID_TRANSITION',
    );
  });

  it('CA-011-15: toda combinación estado × acción no listada se rechaza', () => {
    const choices: Choice[] = ['pendiente', 'cubrir', 'devolucion', 'sin_respuesta'];
    const extras: ExtraStatus[] = [
      'no_aplica',
      'pendiente_pago',
      'informado',
      'confirmado',
      'vencido',
    ];
    const refunds: RefundStatus[] = [
      'no_aplica',
      'pendiente',
      'enviada',
      'confirmada',
      'disputada',
    ];
    const actions: RowAction[] = [
      'cover',
      'requestRefund',
      'pay',
      'confirmPayment',
      'rejectPayment',
      'sendRefund',
      'confirmRefund',
      'disputeRefund',
      'expireResponse',
      'expirePayment',
    ];
    const late = ctx({ now: new Date('2026-12-01T00:00:00Z') });
    const final = new Set(['confirmado', 'vencido']);
    for (const choice of choices) {
      for (const extra of extras) {
        for (const refund of refunds) {
          for (const action of actions) {
            const from = state(choice, extra, refund);
            let allowed = true;
            try {
              transitionRow(from, action, late);
            } catch {
              allowed = false;
            }
            if (!allowed) continue;
            // Lo que sí se permite tiene que ser coherente con la tabla de la spec §7.
            switch (action) {
              case 'cover':
              case 'requestRefund':
              case 'expireResponse':
                expect(choice).toBe('pendiente');
                break;
              case 'pay':
              case 'expirePayment':
                expect(extra).toBe('pendiente_pago');
                break;
              case 'confirmPayment':
              case 'rejectPayment':
                expect(extra).toBe('informado');
                break;
              case 'sendRefund':
                expect(refund).toBe('pendiente');
                break;
              case 'confirmRefund':
                expect(refund).toBe('enviada');
                break;
              case 'disputeRefund':
                expect(['pendiente', 'enviada']).toContain(refund);
                break;
            }
            expect(final.has(extra) && (action === 'pay' || action === 'confirmPayment')).toBe(
              false,
            );
          }
        }
      }
    }
  });
});

describe('cierre de la ronda', () => {
  it('RF-011-14: se cierra solo cuando todas las filas están resueltas', () => {
    expect(isRowResolved(NEW_ROW)).toBe(false);
    expect(isRowResolved(state('cubrir', 'informado', 'no_aplica'))).toBe(false);
    expect(isRowResolved(state('cubrir', 'confirmado', 'no_aplica'))).toBe(true);
    expect(isRowResolved(state('devolucion', 'no_aplica', 'pendiente'))).toBe(true);
    expect(canCloseRound([state('cubrir', 'confirmado', 'no_aplica'), NEW_ROW])).toBe(false);
    expect(
      canCloseRound([
        state('cubrir', 'confirmado', 'no_aplica'),
        state('sin_respuesta', 'vencido', 'pendiente'),
      ]),
    ).toBe(true);
  });

  it('abierta pasa a cerrada o cancelada y ahí queda', () => {
    expect(transitionRound('abierta', 'close')).toBe('cerrada');
    expect(transitionRound('abierta', 'cancel')).toBe('cancelada');
    expectError(() => transitionRound('cerrada', 'close'), 'INVALID_TRANSITION');
    expectError(() => transitionRound('cancelada', 'cancel'), 'INVALID_TRANSITION');
  });
});

describe('allowedRowActions', () => {
  it('el afectado ve cubrir o devolución mientras no responde', () => {
    expect(allowedRowActions('afectado', 'abierta', NEW_ROW, false)).toEqual([
      'cover',
      'requestRefund',
    ]);
  });

  it('el afectado paga solo con el pago pendiente', () => {
    expect(
      allowedRowActions(
        'afectado',
        'abierta',
        state('cubrir', 'pendiente_pago', 'no_aplica'),
        false,
      ),
    ).toEqual(['pay']);
  });

  it('el titular confirma o rechaza un pago informado y registra devoluciones pendientes', () => {
    expect(
      allowedRowActions('titular', 'abierta', state('cubrir', 'informado', 'no_aplica'), false),
    ).toEqual(['confirmPayment', 'rejectPayment']);
    expect(
      allowedRowActions('titular', 'cerrada', state('devolucion', 'no_aplica', 'pendiente'), false),
    ).toEqual(['sendRefund']);
  });

  it('el afectado confirma o disputa la devolución enviada; disputa la pendiente tras el plazo', () => {
    expect(
      allowedRowActions('afectado', 'cerrada', state('devolucion', 'no_aplica', 'enviada'), false),
    ).toEqual(['confirmRefund', 'disputeRefund']);
    expect(
      allowedRowActions('afectado', 'cerrada', state('devolucion', 'no_aplica', 'pendiente'), true),
    ).toEqual(['disputeRefund']);
    expect(
      allowedRowActions(
        'afectado',
        'cerrada',
        state('devolucion', 'no_aplica', 'pendiente'),
        false,
      ),
    ).toEqual([]);
  });

  it('la ronda solo se cancela sin respuestas', () => {
    expect(allowedRoundActions('titular', 'abierta', [NEW_ROW, NEW_ROW])).toEqual(['cancel']);
    expect(
      allowedRoundActions('titular', 'abierta', [
        NEW_ROW,
        state('cubrir', 'pendiente_pago', 'no_aplica'),
      ]),
    ).toEqual([]);
    expect(allowedRoundActions('afectado', 'abierta', [NEW_ROW])).toEqual([]);
  });
});
