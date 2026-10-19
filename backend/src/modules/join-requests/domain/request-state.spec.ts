import {
  FINAL_STATUSES,
  transition,
  type RequestAction,
  type RequestStatus,
  type RequestTransitionContext,
} from './request-state.js';

const now = new Date('2026-10-10T12:00:00Z');
const past = new Date('2026-10-10T11:00:00Z');
const future = new Date('2026-10-10T13:00:00Z');

const ctx = (over: Partial<RequestTransitionContext> = {}): RequestTransitionContext => ({
  now,
  windowOpen: true,
  slotAvailable: true,
  deadlineAt: future,
  ...over,
});
// Contexto con todas las condiciones cumplidas para cada acción.
const expired = ctx({ deadlineAt: past });

const STATUSES: (RequestStatus | null)[] = [
  null,
  'abierta',
  'esperando_pago',
  'pago_informado',
  'aceptada',
  'rechazada',
  'cancelada',
  'expirada',
];
const ACTIONS: RequestAction[] = [
  'open',
  'sendPaymentData',
  'uploadProof',
  'cashPayment',
  'confirm',
  'reject',
  'cancel',
  'expire',
  'systemReject',
  'systemCancel',
];

// Tabla de RN-010-05: "estado:acción" → destino (con el contexto que cumple sus condiciones).
const VALID: Record<string, RequestStatus> = {
  'null:open': 'abierta',
  'abierta:sendPaymentData': 'esperando_pago',
  'abierta:cancel': 'cancelada',
  'abierta:expire': 'expirada',
  'esperando_pago:uploadProof': 'pago_informado',
  'esperando_pago:cashPayment': 'aceptada',
  'esperando_pago:cancel': 'cancelada',
  'esperando_pago:expire': 'expirada',
  'pago_informado:confirm': 'aceptada',
  'pago_informado:expire': 'expirada',
  'abierta:reject': 'rechazada',
  'esperando_pago:reject': 'rechazada',
  'pago_informado:reject': 'rechazada',
  'abierta:systemReject': 'rechazada',
  'esperando_pago:systemReject': 'rechazada',
  'pago_informado:systemReject': 'rechazada',
  'abierta:systemCancel': 'cancelada',
  'esperando_pago:systemCancel': 'cancelada',
  'pago_informado:systemCancel': 'cancelada',
};

describe('transition', () => {
  it('CA-010-25: solo las transiciones de RN-010-05 son válidas; el resto lanza INVALID_TRANSITION (matriz estado × acción)', () => {
    for (const status of STATUSES) {
      for (const action of ACTIONS) {
        // uploadProof necesita plazo vigente; expire necesita plazo vencido.
        const c = action === 'expire' ? expired : ctx();
        const expectedDestination = VALID[`${status}:${action}`];
        if (expectedDestination) {
          expect(transition(status, action, c)).toBe(expectedDestination);
        } else {
          expect(() => transition(status, action, c)).toThrow(
            expect.objectContaining({ code: 'INVALID_TRANSITION', httpStatus: 409 }),
          );
        }
      }
    }
  });

  it('RN-010-05: aceptada, rechazada, cancelada y expirada son finales', () => {
    for (const status of FINAL_STATUSES) {
      for (const action of ACTIONS) {
        expect(() => transition(status, action, expired)).toThrow();
        expect(() => transition(status, action, ctx())).toThrow();
      }
    }
  });

  it('RN-010-12: abrir exige ventana abierta', () => {
    expect(() => transition(null, 'open', ctx({ windowOpen: false }))).toThrow();
  });

  it('RN-010-02: enviar los datos de pago exige ventana abierta y cupo', () => {
    expect(() => transition('abierta', 'sendPaymentData', ctx({ windowOpen: false }))).toThrow();
    expect(() => transition('abierta', 'sendPaymentData', ctx({ slotAvailable: false }))).toThrow();
  });

  it('RN-010-05: subir el comprobante solo dentro del plazo de pago', () => {
    expect(() => transition('esperando_pago', 'uploadProof', expired)).toThrow();
    expect(() => transition('esperando_pago', 'uploadProof', ctx({ deadlineAt: null }))).toThrow();
  });

  it('CA-010-39: una solicitud abierta expira al terminar la ventana aunque su plazo de 24 h no haya vencido', () => {
    expect(transition('abierta', 'expire', ctx({ windowOpen: false }))).toBe('expirada');
    expect(() => transition('abierta', 'expire', ctx())).toThrow();
  });

  it('CA-010-09: esperando_pago y pago_informado expiran solo con el plazo vencido (aun con ventana cerrada)', () => {
    expect(() => transition('esperando_pago', 'expire', ctx({ windowOpen: false }))).toThrow();
    expect(
      transition('esperando_pago', 'expire', ctx({ windowOpen: false, deadlineAt: past })),
    ).toBe('expirada');
    expect(transition('pago_informado', 'expire', expired)).toBe('expirada');
  });

  it('RN-010-05: la cancelación del sistema por ingreso a otro grupo solo vale desde abierta', () => {
    expect(transition('abierta', 'systemCancel', ctx({ reason: 'otro_grupo' }))).toBe('cancelada');
    expect(() =>
      transition('esperando_pago', 'systemCancel', ctx({ reason: 'otro_grupo' })),
    ).toThrow();
  });

  it('RF-010-15: tras informar el pago el solicitante ya no puede cancelar', () => {
    expect(() => transition('pago_informado', 'cancel', ctx())).toThrow();
  });
});
