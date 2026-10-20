import { transition, type ChargeAction, type ChargeStatus } from './charge-state.js';

const dueAt = new Date('2026-10-19T04:00:00Z');
const before = { now: new Date('2026-10-18T12:00:00Z'), dueAt };
const after = { now: new Date('2026-10-19T04:00:00Z'), dueAt };

const STATUSES: (ChargeStatus | null)[] = [
  null,
  'pendiente',
  'en_revision',
  'pagado',
  'atrasado',
  'cancelado',
];
const ACTIONS: ChargeAction[] = [
  'generate',
  'entryPaid',
  'uploadReceipt',
  'markOverdue',
  'confirm',
  'reject',
  'manualPayment',
  'cancel',
];

// Transiciones válidas de RN-002-01 (con el contexto "después del vencimiento" para markOverdue/reject).
const VALID: Record<string, ChargeStatus> = {
  'null:generate': 'pendiente',
  'null:entryPaid': 'pagado',
  'pendiente:uploadReceipt': 'en_revision',
  'atrasado:uploadReceipt': 'en_revision',
  'pendiente:markOverdue': 'atrasado',
  'en_revision:confirm': 'pagado',
  'en_revision:reject': 'atrasado', // vencido
  'pendiente:manualPayment': 'pagado',
  'atrasado:manualPayment': 'pagado',
  'pendiente:cancel': 'cancelado',
  'atrasado:cancel': 'cancelado',
};

describe('transition', () => {
  it('CA-002-21: solo las transiciones de RN-002-01 son válidas; el resto lanza INVALID_TRANSITION (matriz estado × acción)', () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        const expected = VALID[`${status}:${action}`];
        if (expected) {
          expect(transition(status, action, after)).toBe(expected);
        } else {
          expect(() => transition(status, action, after)).toThrow(
            expect.objectContaining({ code: 'INVALID_TRANSITION', httpStatus: 409 }),
          );
        }
      }
    }
  });

  it('RN-002-01: rechazar un cobro vigente lo devuelve a pendiente', () => {
    expect(transition('en_revision', 'reject', before)).toBe('pendiente');
  });

  it('CA-002-30: rechazar un cobro ya vencido lo deja atrasado (now >= dueAt)', () => {
    expect(transition('en_revision', 'reject', after)).toBe('atrasado');
  });

  it('CA-002-29: un cobro en_revision nunca pasa a atrasado por el vencimiento', () => {
    expect(() => transition('en_revision', 'markOverdue', after)).toThrow();
  });

  it('RN-002-01: markOverdue exige que haya pasado el vencimiento', () => {
    expect(() => transition('pendiente', 'markOverdue', before)).toThrow();
    expect(transition('pendiente', 'markOverdue', after)).toBe('atrasado');
  });

  it('CA-002-11: pagado y cancelado son estados finales', () => {
    for (const status of ['pagado', 'cancelado'] as const) {
      for (const action of ACTIONS) {
        expect(() => transition(status, action, after)).toThrow();
      }
    }
  });

  it('CA-002-31: un cobro atrasado puede recibir comprobante y quedar en revisión', () => {
    expect(transition('atrasado', 'uploadReceipt', after)).toBe('en_revision');
  });
});
