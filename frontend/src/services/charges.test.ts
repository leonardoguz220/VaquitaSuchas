import { pendingCharge } from './__fixtures__/charges';
import { getCharge, listMyCharges } from './charges';
import { apiRequest } from './http';

jest.mock('./http', () => ({
  ...jest.requireActual('./http'),
  apiRequest: jest.fn(),
}));

const mockedRequest = jest.mocked(apiRequest);

beforeEach(() => mockedRequest.mockReset());

describe('services/charges (contrato 002): lectura', () => {
  it('RF-002-15: listMyCharges hace GET /api/me/charges sin filtros', async () => {
    const page = { items: [], nextCursor: null };
    mockedRequest.mockResolvedValue(page);
    await expect(listMyCharges()).resolves.toBe(page);
    expect(mockedRequest).toHaveBeenCalledWith('/api/me/charges');
  });

  it('RF-002-15: listMyCharges manda estado, período, grupo, límite y cursor en la query', async () => {
    mockedRequest.mockResolvedValue({ items: [], nextCursor: null });
    await listMyCharges({
      status: 'atrasado',
      period: '2026-10',
      groupId: 'g2',
      limit: 20,
      cursor: 'abc',
    });
    expect(mockedRequest).toHaveBeenCalledWith(
      '/api/me/charges?status=atrasado&period=2026-10&groupId=g2&limit=20&cursor=abc',
    );
  });

  it('CA-002-23: getCharge hace GET /api/charges/:id con el id codificado', async () => {
    mockedRequest.mockResolvedValue(pendingCharge);
    await expect(getCharge('c/1')).resolves.toBe(pendingCharge);
    expect(mockedRequest).toHaveBeenCalledWith('/api/charges/c%2F1');
  });
});
