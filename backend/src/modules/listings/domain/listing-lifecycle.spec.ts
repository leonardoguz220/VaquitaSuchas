import {
  canPublish,
  expiresAt,
  isExpired,
  nextStatus,
  reconcileAction,
  type ReconcileInput,
} from './listing-lifecycle.js';

const open = { status: 'activo', frozen: false, acceptingMembers: true } as const;

describe('canPublish', () => {
  it('RF-008-01: grupo activo con cupos libres puede publicar', () => {
    expect(canPublish({ group: open, freeSlots: 2, requested: 2 })).toBeNull();
  });

  it('CA-008-02: grupo lleno se rechaza', () => {
    expect(canPublish({ group: open, freeSlots: 0, requested: 1 })).toBe('NO_FREE_SLOTS');
  });

  it('CA-008-02: ofrecer más que los libres se rechaza', () => {
    expect(canPublish({ group: open, freeSlots: 1, requested: 2 })).toBe('NO_FREE_SLOTS');
  });

  it('RF-008-01: 0 cupos es inválido', () => {
    expect(canPublish({ group: open, freeSlots: 2, requested: 0 })).toBe('INVALID_SLOTS');
  });

  it('RF-008-01: grupo cerrado, congelado o sin recibir miembros se rechaza', () => {
    expect(canPublish({ group: { ...open, status: 'cerrado' }, freeSlots: 1, requested: 1 })).toBe(
      'GROUP_CLOSED',
    );
    expect(canPublish({ group: { ...open, frozen: true }, freeSlots: 1, requested: 1 })).toBe(
      'GROUP_FROZEN',
    );
    expect(
      canPublish({ group: { ...open, acceptingMembers: false }, freeSlots: 1, requested: 1 }),
    ).toBe('GROUP_NOT_ACCEPTING');
  });
});

describe('expiresAt', () => {
  it('RF-008-05: vence 30 días después', () => {
    expect(expiresAt(new Date('2026-10-01T12:00:00Z')).toISOString()).toBe(
      '2026-10-31T12:00:00.000Z',
    );
  });

  it('CA-008-14: más de 30 días → vencida; justo a los 30 también (<=)', () => {
    const published = new Date('2026-10-01T12:00:00Z');
    const exp = expiresAt(published);
    expect(isExpired(exp, new Date('2026-10-31T12:00:00Z'))).toBe(true);
    expect(isExpired(exp, new Date('2026-10-31T11:59:59Z'))).toBe(false);
  });
});

describe('nextStatus', () => {
  it('RF-008-01: publicar crea una activa', () => {
    expect(nextStatus(null, 'publish')).toBe('activa');
    expect(nextStatus('activa', 'publish')).toBeNull();
  });

  it('CA-008-14: activa vence a expirada', () => {
    expect(nextStatus('activa', 'expire')).toBe('expirada');
  });

  it('RF-008-05: renovar sirve para activa y expirada, no para oculta', () => {
    expect(nextStatus('expirada', 'renew')).toBe('activa');
    expect(nextStatus('activa', 'renew')).toBe('activa');
    expect(nextStatus('oculta', 'renew')).toBeNull();
  });

  it('RF-008-18: ocultar y restaurar', () => {
    expect(nextStatus('activa', 'hide')).toBe('oculta');
    expect(nextStatus('oculta', 'restore')).toBe('activa');
    expect(nextStatus('expirada', 'hide')).toBeNull();
  });

  it('RF-008-05: retirada y cerrada son finales', () => {
    for (const action of ['hide', 'restore', 'expire', 'renew', 'withdraw', 'close'] as const) {
      expect(nextStatus('retirada', action)).toBeNull();
      expect(nextStatus('cerrada', action)).toBeNull();
    }
  });

  it('RF-008-05: retirar y cerrar desde estados vivos', () => {
    expect(nextStatus('oculta', 'withdraw')).toBe('retirada');
    expect(nextStatus('expirada', 'withdraw')).toBe('retirada');
    expect(nextStatus('activa', 'close')).toBe('cerrada');
    expect(nextStatus('expirada', 'close')).toBeNull();
  });
});

describe('reconcileAction', () => {
  const now = new Date('2026-10-20T12:00:00Z');
  const base: ReconcileInput = {
    listing: { status: 'activa', slotsOffered: 2, expiresAt: new Date('2026-11-01T00:00:00Z') },
    group: { status: 'activo', frozen: false, totalSlots: 5, members: 2 },
    ownerBanned: false,
    now,
  };
  const with_ = (patch: {
    listing?: Partial<ReconcileInput['listing']>;
    group?: Partial<ReconcileInput['group']>;
    ownerBanned?: boolean;
  }): ReconcileInput => ({
    ...base,
    ...(patch.ownerBanned === undefined ? {} : { ownerBanned: patch.ownerBanned }),
    listing: { ...base.listing, ...patch.listing },
    group: { ...base.group, ...patch.group },
  });

  it('RN-008-04: al día no hace nada', () => {
    expect(reconcileAction(base)).toEqual({ kind: 'none' });
  });

  it('CA-008-14: activa vencida pasa a expirada; oculta vencida no cambia', () => {
    const expiresAtPast = new Date('2026-10-20T12:00:00Z');
    expect(reconcileAction(with_({ listing: { expiresAt: expiresAtPast } }))).toEqual({
      kind: 'expire',
    });
    expect(
      reconcileAction(with_({ listing: { status: 'oculta', expiresAt: expiresAtPast } })),
    ).toEqual({ kind: 'none' });
  });

  it('CA-008-16: grupo cerrado o congelado y titular baneado cierran', () => {
    expect(reconcileAction(with_({ group: { status: 'cerrado' } }))).toEqual({
      kind: 'close',
      reason: 'grupo_cerrado',
    });
    expect(reconcileAction(with_({ group: { frozen: true } }))).toEqual({
      kind: 'close',
      reason: 'grupo_congelado',
    });
    expect(reconcileAction(with_({ ownerBanned: true }))).toEqual({
      kind: 'close',
      reason: 'grupo_congelado',
    });
  });

  it('RN-008-04: recorta los cupos a los libres y cierra por grupo lleno', () => {
    expect(reconcileAction(with_({ group: { members: 4 } }))).toEqual({
      kind: 'adjust',
      slotsOffered: 1,
    });
    expect(reconcileAction(with_({ group: { members: 5 } }))).toEqual({
      kind: 'close',
      reason: 'grupo_lleno',
    });
    expect(reconcileAction(with_({ group: { totalSlots: 3, members: 4 } }))).toEqual({
      kind: 'close',
      reason: 'grupo_lleno',
    });
  });

  it('RN-008-04: una expirada solo baja cupos y nunca se cierra; retirada y cerrada no cambian', () => {
    const expired = { status: 'expirada' } as const;
    expect(reconcileAction(with_({ listing: expired, group: { members: 4 } }))).toEqual({
      kind: 'adjust',
      slotsOffered: 1,
    });
    expect(reconcileAction(with_({ listing: expired, group: { members: 5 } }))).toEqual({
      kind: 'none',
    });
    expect(
      reconcileAction(with_({ listing: { status: 'cerrada' }, group: { status: 'cerrado' } })),
    ).toEqual({ kind: 'none' });
    expect(reconcileAction(with_({ listing: { status: 'retirada' }, ownerBanned: true }))).toEqual({
      kind: 'none',
    });
  });
});
