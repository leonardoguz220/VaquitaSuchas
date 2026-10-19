import { allowedActions, type AllowedActionsInput } from './allowed-actions.js';

// Tabla de acciones por rol (plan §7) y RNF-010-01: el cliente solo dibuja `allowedActions`.
const base: AllowedActionsInput = {
  role: 'solicitante',
  status: 'abierta',
  extended: false,
  windowOpen: true,
  slotAvailable: true,
  canOpenDispute: false,
  canRespondDispute: false,
};

describe('allowedActions (plan §7, RNF-010-01)', () => {
  it('solicitante en abierta: cancelar y escribir', () => {
    expect(allowedActions(base)).toEqual(['cancel', 'sendMessage']);
  });

  it('solicitante en esperando_pago: comprobante, cancelar y escribir', () => {
    expect(allowedActions({ ...base, status: 'esperando_pago' })).toEqual([
      'uploadProof',
      'cancel',
      'sendMessage',
    ]);
  });

  it('solicitante en pago_informado: solo escribir (no puede cancelar, CA-010-18)', () => {
    expect(allowedActions({ ...base, status: 'pago_informado' })).toEqual(['sendMessage']);
  });

  it('el solicitante nunca puede enviar datos de pago, confirmar ni rechazar (403, CA-010-20)', () => {
    for (const status of ['abierta', 'esperando_pago', 'pago_informado'] as const) {
      const actions = allowedActions({ ...base, status });
      for (const forbidden of ['sendPaymentData', 'extend', 'confirm', 'cashPayment', 'reject']) {
        expect(actions).not.toContain(forbidden);
      }
    }
  });

  it('titular en abierta: enviar datos de pago, rechazar y escribir', () => {
    expect(allowedActions({ ...base, role: 'titular' })).toEqual([
      'sendPaymentData',
      'reject',
      'sendMessage',
    ]);
  });

  it('titular en abierta sin cupo o con la ventana cerrada no puede enviar datos de pago (CA-010-38)', () => {
    expect(allowedActions({ ...base, role: 'titular', slotAvailable: false })).toEqual([
      'reject',
      'sendMessage',
    ]);
    expect(allowedActions({ ...base, role: 'titular', windowOpen: false })).toEqual([
      'reject',
      'sendMessage',
    ]);
  });

  it('titular en esperando_pago: prorrogar (una vez), efectivo, rechazar y escribir', () => {
    const input = { ...base, role: 'titular' as const, status: 'esperando_pago' as const };
    expect(allowedActions(input)).toEqual(['extend', 'cashPayment', 'reject', 'sendMessage']);
    expect(allowedActions({ ...input, extended: true })).toEqual([
      'cashPayment',
      'reject',
      'sendMessage',
    ]);
  });

  it('titular en pago_informado: confirmar, rechazar y escribir', () => {
    expect(allowedActions({ ...base, role: 'titular', status: 'pago_informado' })).toEqual([
      'confirm',
      'reject',
      'sendMessage',
    ]);
  });

  it('en estado final el chat es de solo lectura y solo quedan los reclamos (CA-010-24)', () => {
    for (const status of ['aceptada', 'rechazada', 'cancelada', 'expirada'] as const) {
      expect(allowedActions({ ...base, status })).toEqual([]);
      expect(allowedActions({ ...base, status, canOpenDispute: true })).toEqual(['openDispute']);
      expect(allowedActions({ ...base, role: 'titular', status, canRespondDispute: true })).toEqual(
        ['respondDispute'],
      );
    }
  });
});
