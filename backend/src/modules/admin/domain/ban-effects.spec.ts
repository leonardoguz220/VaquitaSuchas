import { banEffects } from './ban-effects.js';

const user = { id: 'u1' };

describe('banEffects', () => {
  it('sin grupos: solo cancela las solicitudes que el usuario abrió', () => {
    expect(banEffects(user, [], [])).toEqual([{ kind: 'cancel_own_requests', userId: 'u1' }]);
  });

  it('RF-009-19: congela cada grupo que posee y rechaza sus solicitudes activas', () => {
    expect(banEffects(user, [{ groupId: 'g1' }, { groupId: 'g2' }], [])).toEqual([
      { kind: 'freeze_group', groupId: 'g1', frozenReason: 'titular_baneado' },
      { kind: 'reject_group_requests', groupId: 'g1', reason: 'titular_baneado' },
      { kind: 'freeze_group', groupId: 'g2', frozenReason: 'titular_baneado' },
      { kind: 'reject_group_requests', groupId: 'g2', reason: 'titular_baneado' },
      { kind: 'cancel_own_requests', userId: 'u1' },
    ]);
  });

  it('CA-009-33: miembro baneado en dos grupos sale de ambos con motivo «baneo»', () => {
    const effects = banEffects(user, [], [{ groupId: 'g3' }, { groupId: 'g4' }]);
    expect(effects.filter((e) => e.kind === 'remove_member')).toEqual([
      { kind: 'remove_member', groupId: 'g3', reason: 'baneo' },
      { kind: 'remove_member', groupId: 'g4', reason: 'baneo' },
    ]);
  });

  it('RF-009-22: un grupo propio nunca se trata también como membresía', () => {
    const effects = banEffects(user, [{ groupId: 'g1' }], [{ groupId: 'g1' }, { groupId: 'g2' }]);
    expect(effects.filter((e) => e.kind === 'remove_member')).toEqual([
      { kind: 'remove_member', groupId: 'g2', reason: 'baneo' },
    ]);
  });

  it('CA-009-33: titular y miembro a la vez produce los tres tipos de efecto', () => {
    const kinds = banEffects(user, [{ groupId: 'g1' }], [{ groupId: 'g2' }]).map((e) => e.kind);
    expect(new Set(kinds)).toEqual(
      new Set(['freeze_group', 'reject_group_requests', 'remove_member', 'cancel_own_requests']),
    );
  });
});
