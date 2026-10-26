import * as audit from './admin-audit';
import { listAuditLog } from './admin-audit';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

describe('services/admin-audit.ts conectado al backend (spec 009 T025)', () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('CA-009-18: pide el log sin filtros a GET /api/admin/audit-log y devuelve la página tal cual', async () => {
    const page = {
      items: [
        {
          id: 'a1',
          adminId: 'u1',
          action: 'usuario_banear',
          targetType: 'user',
          targetId: 'u2',
          reason: 'Estafa comprobada.',
          occurredAt: '2026-10-19T14:00:00Z',
        },
      ],
      nextCursor: 'c1',
    };
    mockedRequest.mockResolvedValueOnce(page);

    await expect(listAuditLog()).resolves.toEqual(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/audit-log');
  });

  it('RF-009-18: envía acción, tipo, objeto, límite y cursor como query', async () => {
    await listAuditLog({
      action: 'reclamo_resolver',
      targetType: 'join_dispute',
      targetId: 'd1',
      adminId: 'u1',
      limit: 10,
      cursor: 'c1',
    });
    const url = new URL(String(mockedRequest.mock.calls[0][0]), 'http://x');
    expect(url.pathname).toBe('/api/admin/audit-log');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      action: 'reclamo_resolver',
      targetType: 'join_dispute',
      targetId: 'd1',
      adminId: 'u1',
      limit: '10',
      cursor: 'c1',
    });
  });

  it('RF-009-18: el rango de días se envía en ISO 8601 con hora de La Paz', async () => {
    await listAuditLog({ from: '2026-10-19', to: '2026-10-19' });
    const url = new URL(String(mockedRequest.mock.calls[0][0]), 'http://x');
    expect(url.searchParams.get('from')).toBe('2026-10-19T00:00:00-04:00');
    expect(url.searchParams.get('to')).toBe('2026-10-19T23:59:59.999-04:00');
  });

  it('CA-009-19: el módulo no ofrece ninguna operación para editar ni borrar el log', () => {
    const functions = Object.entries(audit)
      .filter(([, value]) => typeof value === 'function')
      .map(([name]) => name);
    expect(functions).toEqual(['listAuditLog']);
    expect(
      functions.filter((name) => /edit|update|patch|put|delete|borr|elimin|remove/i.test(name)),
    ).toEqual([]);
  });
});
