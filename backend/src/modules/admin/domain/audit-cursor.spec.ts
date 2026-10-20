import { decodeAuditCursor, encodeAuditCursor } from './audit-cursor.js';

const ID = '3f2b8c1e-0a4d-4e7b-9c55-6d1f2a3b4c5d';

describe('cursor del log de auditoría', () => {
  it('RF-009-18: ida y vuelta conservando los microsegundos', () => {
    const cursor = { occurredAt: '2026-10-18T12:00:00.123456Z', id: ID };
    expect(decodeAuditCursor(encodeAuditCursor(cursor))).toEqual(cursor);
  });

  it('un cursor mal formado es inválido', () => {
    expect(decodeAuditCursor('basura')).toBeNull();
    expect(decodeAuditCursor(Buffer.from('2026-10-18|x').toString('base64url'))).toBeNull();
    expect(decodeAuditCursor(Buffer.from(`no-es-fecha|${ID}`).toString('base64url'))).toBeNull();
  });
});
