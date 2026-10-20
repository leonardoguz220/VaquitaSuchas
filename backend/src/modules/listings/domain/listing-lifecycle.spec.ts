import { canPublish, expiresAt, isExpired, nextStatus } from './listing-lifecycle.js';

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
