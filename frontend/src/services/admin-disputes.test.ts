import { apiRequest } from './http';
import { getAdminDisputeEvidence, listAdminDisputes, resolveAdminDispute } from './admin-disputes';
import { listAuditLog } from './admin-audit';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => {
  mockedRequest.mockReset();
  mockedRequest.mockResolvedValue({});
});

describe('services/admin-disputes (contrato 009 § Reclamos)', () => {
  it('RF-009-20: listAdminDisputes hace GET /api/admin/disputes con estado, límite y cursor', async () => {
    await listAdminDisputes();
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/disputes');
    await listAdminDisputes({ status: 'abierto', limit: 20, cursor: 'c2' });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/admin/disputes?status=abierto&limit=20&cursor=c2',
    );
  });

  it('CA-009-27: getAdminDisputeEvidence hace GET …/evidence con el id codificado', async () => {
    await getAdminDisputeEvidence('d/1');
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/disputes/d%2F1/evidence');
  });

  it('CA-009-25: resolveAdminDispute hace POST …/resolve con resultado y motivo', async () => {
    await resolveAdminDispute('d1', { result: 'estafa_confirmada', reason: 'Pruebas del banco' });
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/disputes/d1/resolve', {
      method: 'POST',
      body: { result: 'estafa_confirmada', reason: 'Pruebas del banco' },
    });
  });
});

describe('services/admin-audit (contrato 009 § Auditoría)', () => {
  it('RF-009-18: listAuditLog hace GET /api/admin/audit-log con filtros y paginación', async () => {
    await listAuditLog();
    expect(mockedRequest).toHaveBeenCalledWith('/api/admin/audit-log');
    await listAuditLog({
      adminId: 'a1',
      action: 'usuario_banear',
      targetType: 'user',
      targetId: 'u1',
      from: '2026-10-01',
      to: '2026-10-19',
      limit: 50,
      cursor: 'c3',
    });
    expect(mockedRequest).toHaveBeenLastCalledWith(
      '/api/admin/audit-log?adminId=a1&action=usuario_banear&targetType=user&targetId=u1&from=2026-10-01&to=2026-10-19&limit=50&cursor=c3',
    );
  });

  it('CA-009-19: el cliente del log solo ofrece lectura', async () => {
    const audit = await import('./admin-audit');
    expect(
      Object.keys(audit).filter(
        (name) => typeof (audit as Record<string, unknown>)[name] === 'function',
      ),
    ).toEqual(['listAuditLog']);
  });
});
