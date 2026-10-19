import { effectiveState, type EffectiveStateInput } from './effective-state.js';

const now = new Date('2026-10-10T12:00:00Z');
const at = (min: number): Date => new Date(now.getTime() + min * 60_000);

const base = (over: Partial<EffectiveStateInput>): EffectiveStateInput => ({
  status: 'abierta',
  openDeadlineAt: at(60),
  payDeadlineAt: null,
  decisionDeadlineAt: null,
  ...over,
});

describe('effectiveState', () => {
  it('CA-010-39: abierta cuando termina la ventana se evalúa como expirada', () => {
    expect(effectiveState(base({ windowEndsAt: at(0) }), now)).toEqual({
      status: 'expirada',
      reason: 'ventana_cerrada',
    });
  });

  it('RN-010-06: abierta con las 24 h cumplidas es expirada por plazo de solicitud', () => {
    expect(effectiveState(base({ openDeadlineAt: at(-1) }), now)).toEqual({
      status: 'expirada',
      reason: 'plazo_solicitud',
    });
  });

  it('RN-010-12: abierta dentro de plazo y ventana sigue abierta', () => {
    expect(effectiveState(base({ windowEndsAt: at(30) }), now)).toEqual({
      status: 'abierta',
      reason: null,
    });
  });

  it('CA-010-09: esperando_pago vencido es expirada/plazo_pago; vigente no cambia', () => {
    expect(effectiveState(base({ status: 'esperando_pago', payDeadlineAt: at(0) }), now)).toEqual({
      status: 'expirada',
      reason: 'plazo_pago',
    });
    expect(
      effectiveState(base({ status: 'esperando_pago', payDeadlineAt: at(1) }), now).status,
    ).toBe('esperando_pago');
  });

  it('CA-010-15: pago_informado vencido es expirada/titular_sin_respuesta', () => {
    expect(
      effectiveState(base({ status: 'pago_informado', decisionDeadlineAt: at(-5) }), now),
    ).toEqual({
      status: 'expirada',
      reason: 'titular_sin_respuesta',
    });
  });

  it('RNF-010-03: una solicitud esperando_pago con ventana cerrada puede completarse con sus plazos', () => {
    expect(
      effectiveState(
        base({ status: 'esperando_pago', payDeadlineAt: at(5), windowEndsAt: at(-10) }),
        now,
      ).status,
    ).toBe('esperando_pago');
  });

  it('RN-010-05: los estados finales no cambian y conservan su motivo guardado', () => {
    expect(
      effectiveState(base({ status: 'rechazada', finalReason: 'rechazo_titular' }), now),
    ).toEqual({
      status: 'rechazada',
      reason: 'rechazo_titular',
    });
  });
});
