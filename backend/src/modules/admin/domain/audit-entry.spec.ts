import {
  ADMIN_AUDIT_ACTIONS,
  normalizeAction,
  normalizeTargetType,
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

describe('sanitizeMetadata', () => {
  it('RNF-009-03: elimina CI, contraseñas, tokens, chats y comprobantes, a cualquier profundidad', () => {
    const result = sanitizeMetadata({
      before: { status: 'activo', ci: 'x', passwordHash: 'x' },
      after: { status: 'suspendido', nested: [{ accessToken: 'x', ok: 1 }] },
      chatMessage: 'x',
      receiptUrl: 'x',
      email: 'a@b.c',
      groupId: 'g1',
    });
    expect(result).toEqual({
      before: { status: 'activo' },
      after: { status: 'suspendido', nested: [{ ok: 1 }] },
      groupId: 'g1',
    });
  });

  it('metadata ausente produce un objeto vacío', () => {
    expect(sanitizeMetadata(undefined)).toEqual({});
  });
});
