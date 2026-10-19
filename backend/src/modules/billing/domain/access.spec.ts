import { allowedActions, groupStateOf, resolveAccess } from './access.js';

const group = { ownerId: 'owner' };
const charge = { userId: 'ana', status: 'pendiente' as const };

describe('resolveAccess', () => {
  it('CA-002-12: el titular del grupo tiene acceso completo', () => {
    expect(
      resolveAccess({ user: { id: 'owner' }, charge, group, membership: { active: true } }),
    ).toBe('titular');
  });

  it('CA-002-12: el dueño del cobro, miembro activo, es dueno', () => {
    expect(
      resolveAccess({ user: { id: 'ana' }, charge, group, membership: { active: true } }),
    ).toBe('dueno');
  });

  it('CA-002-31: el dueño retirado con cobro atrasado o en revisión es dueno_retirado', () => {
    for (const status of ['atrasado', 'en_revision'] as const) {
      expect(
        resolveAccess({
          user: { id: 'ana' },
          charge: { userId: 'ana', status },
          group,
          membership: { active: false },
        }),
      ).toBe('dueno_retirado');
    }
  });

  it('CA-002-32: el dueño retirado sin deuda pendiente no ve nada (ninguno)', () => {
    for (const status of ['pendiente', 'pagado', 'cancelado'] as const) {
      expect(
        resolveAccess({
          user: { id: 'ana' },
          charge: { userId: 'ana', status },
          group,
          membership: { active: false },
        }),
      ).toBe('ninguno');
    }
  });

  it('CA-002-13: otro miembro activo es miembro (403 en detalle y comprobante)', () => {
    expect(
      resolveAccess({ user: { id: 'luis' }, charge, group, membership: { active: true } }),
    ).toBe('miembro');
  });

  it('CA-002-23: quien no pertenece al grupo es ninguno (404)', () => {
    expect(resolveAccess({ user: { id: 'x' }, charge, group, membership: null })).toBe('ninguno');
    expect(resolveAccess({ user: { id: 'x' }, charge, group, membership: { active: false } })).toBe(
      'ninguno',
    );
  });
});

describe('allowedActions', () => {
  it('CA-002-12: el titular confirma o rechaza en revisión, y cobra o cancela lo abierto', () => {
    expect(allowedActions('titular', 'en_revision', 'activo')).toEqual(['confirm', 'reject']);
    expect(allowedActions('titular', 'pendiente', 'activo')).toEqual(['manualPayment', 'cancel']);
    expect(allowedActions('titular', 'atrasado', 'activo')).toEqual(['manualPayment', 'cancel']);
    expect(allowedActions('titular', 'pagado', 'activo')).toEqual([]);
  });

  it('CA-002-12: el dueño del cobro solo sube comprobante y nunca confirma el suyo', () => {
    expect(allowedActions('dueno', 'pendiente', 'activo')).toEqual(['uploadReceipt']);
    expect(allowedActions('dueno', 'atrasado', 'activo')).toEqual(['uploadReceipt']);
    expect(allowedActions('dueno', 'en_revision', 'activo')).toEqual([]);
    expect(allowedActions('dueno_retirado', 'atrasado', 'activo')).toEqual(['uploadReceipt']);
  });

  it('CA-002-13: los demás miembros y los ajenos no tienen acciones', () => {
    expect(allowedActions('miembro', 'pendiente', 'activo')).toEqual([]);
    expect(allowedActions('ninguno', 'pendiente', 'activo')).toEqual([]);
  });

  it('RF-002: un grupo cerrado sigue permitiendo saldar cobros; uno congelado no permite nada', () => {
    expect(allowedActions('titular', 'en_revision', 'cerrado')).toEqual(['confirm', 'reject']);
    expect(allowedActions('titular', 'en_revision', 'congelado')).toEqual([]);
    expect(allowedActions('dueno', 'pendiente', 'congelado')).toEqual([]);
  });

  it('RF-002-05: el estado del grupo congelado manda sobre el cerrado y el activo', () => {
    expect(groupStateOf({ status: 'activo', frozen: false })).toBe('activo');
    expect(groupStateOf({ status: 'cerrado', frozen: false })).toBe('cerrado');
    expect(groupStateOf({ status: 'cerrado', frozen: true })).toBe('congelado');
    expect(groupStateOf({ status: 'activo', frozen: true })).toBe('congelado');
  });
});
