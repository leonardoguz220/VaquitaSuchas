import {
  ADMIN_AUDIT_ACTIONS,
  normalizeAction,
  normalizeTargetType,
  AUDIT_METADATA_KEYS,
  sanitizeMetadata,
} from './audit-entry.js';

describe('normalizeAction / normalizeTargetType', () => {
  it('RF-009-18: acepta las acciones del log tal cual', () => {
    for (const action of ADMIN_AUDIT_ACTIONS) expect(normalizeAction(action)).toBe(action);
  });

  it('CA-010-29: traduce los nombres punteados que usa la spec 010', () => {
    expect(normalizeAction('dispute.evidence.open')).toBe('reclamo_abrir_evidencia');
    expect(normalizeAction('dispute.resolve')).toBe('reclamo_resolver');
    expect(normalizeTargetType('dispute')).toBe('join_dispute');
  });

  it('una acción o tipo desconocido se rechaza (no se inventan acciones)', () => {
    expect(normalizeAction('borrar_todo')).toBeNull();
    expect(normalizeTargetType('algo')).toBeNull();
  });
});

describe('sanitizeMetadata (lista blanca por acción)', () => {
  const NOISE: Record<string, unknown> = {
    password: 'x',
    passwordHash: 'x',
    ci: '123',
    email: 'a@b.c',
    phone: '+591',
    token: 't',
    chatMessage: 'hola',
    receiptUrl: 'u',
    notes: 'texto libre',
    reason: 'otro motivo',
    unknownKey: 1,
  };

  it('RNF-009-03: cada acción del CHECK tiene su tabla de claves', () => {
    for (const action of ADMIN_AUDIT_ACTIONS) {
      expect(AUDIT_METADATA_KEYS[action]).toBeDefined();
    }
    expect(Object.keys(AUDIT_METADATA_KEYS).sort()).toEqual([...ADMIN_AUDIT_ACTIONS].sort());
  });

  it('RNF-009-03: por cada acción solo salen las claves declaradas, nunca las sensibles ni las no declaradas', () => {
    for (const action of ADMIN_AUDIT_ACTIONS) {
      const declared = Object.fromEntries(AUDIT_METADATA_KEYS[action].map((k) => [k, 'v1']));
      const result = sanitizeMetadata(action, { ...NOISE, ...declared });
      expect(Object.keys(result).sort()).toEqual([...AUDIT_METADATA_KEYS[action]].sort());
      for (const key of Object.keys(NOISE)) expect(result).not.toHaveProperty(key);
    }
  });

  it('RNF-009-03: la segunda red quita claves sensibles anidadas en las permitidas', () => {
    expect(
      sanitizeMetadata('usuario_banear', {
        banId: 'b1',
        effects: { frozenGroups: 1, removedMemberships: 2, email: 'a@b.c' },
      }),
    ).toEqual({ banId: 'b1', effects: { frozenGroups: 1, removedMemberships: 2 } });
  });

  it('RNF-009-03: una acción sin tabla falla en ejecución en lugar de guardar sin filtro', () => {
    expect(() => sanitizeMetadata('inventada' as never, { a: 1 })).toThrow(/no declara/);
  });

  it('metadata ausente produce un objeto vacío', () => {
    expect(sanitizeMetadata('usuario_suspender', undefined)).toEqual({});
  });
});
