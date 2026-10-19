import { canActOnUser, canRemoveAdminRole, canRevokeBan } from './admin-rules.js';
import type { AdminUserRef } from './admin-rules.js';

const admin = (id: string): AdminUserRef => ({ id, role: 'admin', status: 'activo' });
const user = (id: string, status: AdminUserRef['status'] = 'activo'): AdminUserRef => ({
  id,
  role: 'usuario',
  status,
});

describe('canActOnUser', () => {
  it('suspender y banear a un usuario normal activo se permite', () => {
    expect(canActOnUser({ actor: admin('a'), target: user('u'), action: 'suspend' })).toEqual({
      ok: true,
    });
    expect(canActOnUser({ actor: admin('a'), target: user('u'), action: 'ban' })).toEqual({
      ok: true,
    });
  });

  it('CA-009-13 (RN-009-02): no se suspende a otro administrador', () => {
    expect(canActOnUser({ actor: admin('a'), target: admin('b'), action: 'suspend' })).toEqual({
      ok: false,
      code: 'ADMIN_TARGET_FORBIDDEN',
      rule: 'RN-009-02',
    });
  });

  it('CA-009-29 (RN-009-07): no se banea a otro administrador', () => {
    expect(canActOnUser({ actor: admin('a'), target: admin('b'), action: 'ban' })).toEqual({
      ok: false,
      code: 'ADMIN_TARGET_FORBIDDEN',
      rule: 'RN-009-07',
    });
  });

  it('RN-009-02 y RN-009-07: nadie se suspende, banea ni quita el rol a sí mismo', () => {
    const me = admin('a');
    expect(canActOnUser({ actor: me, target: me, action: 'suspend' })).toMatchObject({
      ok: false,
      code: 'ADMIN_TARGET_FORBIDDEN',
      rule: 'RN-009-02',
    });
    expect(canActOnUser({ actor: me, target: me, action: 'ban' })).toMatchObject({
      ok: false,
      code: 'ADMIN_TARGET_FORBIDDEN',
      rule: 'RN-009-07',
    });
    expect(canActOnUser({ actor: me, target: me, action: 'remove_role' })).toMatchObject({
      ok: false,
      code: 'ADMIN_TARGET_FORBIDDEN',
      rule: 'RN-009-02',
    });
  });

  it('quitar el rol a otro administrador se permite aquí (el último lo cuida canRemoveAdminRole)', () => {
    expect(canActOnUser({ actor: admin('a'), target: admin('b'), action: 'remove_role' })).toEqual({
      ok: true,
    });
  });

  it('CA-009-24 (RF-009-19): reactivar a un baneado falla con USER_BANNED', () => {
    expect(
      canActOnUser({ actor: admin('a'), target: user('u', 'baneado'), action: 'reactivate' }),
    ).toEqual({ ok: false, code: 'USER_BANNED', rule: 'RF-009-19' });
  });

  it('reactivar solo aplica a suspendidos; suspender solo a activos; banear no a baneados', () => {
    const a = admin('a');
    expect(
      canActOnUser({ actor: a, target: user('u', 'suspendido'), action: 'reactivate' }),
    ).toEqual({ ok: true });
    expect(canActOnUser({ actor: a, target: user('u'), action: 'reactivate' })).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
    expect(
      canActOnUser({ actor: a, target: user('u', 'suspendido'), action: 'suspend' }),
    ).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect(
      canActOnUser({ actor: a, target: user('u', 'baneado'), action: 'suspend' }),
    ).toMatchObject({ ok: false, code: 'INVALID_TRANSITION' });
    expect(canActOnUser({ actor: a, target: user('u', 'baneado'), action: 'ban' })).toMatchObject({
      ok: false,
      code: 'INVALID_TRANSITION',
    });
    expect(canActOnUser({ actor: a, target: user('u', 'suspendido'), action: 'ban' })).toEqual({
      ok: true,
    });
  });
});

describe('canRemoveAdminRole', () => {
  it('CA-009-12 (RN-009-01): falla si deja cero administradores activos', () => {
    expect(canRemoveAdminRole({ activeAdmins: 1, target: admin('a') })).toEqual({
      ok: false,
      code: 'LAST_ADMIN',
      rule: 'RN-009-01',
    });
  });

  it('RN-009-01: con otro administrador activo se permite', () => {
    expect(canRemoveAdminRole({ activeAdmins: 2, target: admin('a') })).toEqual({ ok: true });
  });

  it('quitar el rol a quien no es administrador activo no afecta el conteo', () => {
    expect(canRemoveAdminRole({ activeAdmins: 1, target: user('u') })).toEqual({ ok: true });
  });
});

describe('canRevokeBan', () => {
  const ban = { bannedBy: 'a', revokedAt: null };

  it('CA-009-34 (RF-009-23): quien baneó no puede revertir (SAME_ADMIN)', () => {
    expect(canRevokeBan({ ban, actorId: 'a' })).toEqual({
      ok: false,
      code: 'SAME_ADMIN',
      rule: 'RF-009-23',
    });
  });

  it('CA-009-34: otro administrador sí puede revertir', () => {
    expect(canRevokeBan({ ban, actorId: 'b' })).toEqual({ ok: true });
  });

  it('un baneo ya revertido responde conflicto', () => {
    expect(canRevokeBan({ ban: { ...ban, revokedAt: new Date() }, actorId: 'b' })).toMatchObject({
      ok: false,
      code: 'ALREADY_REVOKED',
    });
  });
});
