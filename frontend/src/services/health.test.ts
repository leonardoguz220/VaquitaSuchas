import { getHealth, type HealthResponse } from './health';
import { apiRequest } from './http';

jest.mock('./http', () => ({ apiRequest: jest.fn() }));

const mockedRequest = jest.mocked(apiRequest);

describe('services/health (contrato 000 B, GET /health)', () => {
  beforeEach(() => mockedRequest.mockReset());

  it('RF-000-18: getHealth hace GET /api/health por el proxy y devuelve el cuerpo tal cual', async () => {
    const body: HealthResponse = {
      status: 'ok',
      version: '0.1.0',
      uptimeSeconds: 1234,
      database: { status: 'up', latencyMs: 4 },
      time: '2026-10-18T17:00:00.000Z',
    };
    mockedRequest.mockResolvedValue(body);

    await expect(getHealth()).resolves.toEqual(body);
    expect(mockedRequest).toHaveBeenCalledWith('/api/health', { signal: undefined });
  });

  it('RF-000-18: reenvía la señal de cancelación para el tiempo máximo del cliente', async () => {
    mockedRequest.mockResolvedValue({});
    const controller = new AbortController();

    await getHealth({ signal: controller.signal });

    expect(mockedRequest).toHaveBeenCalledWith('/api/health', { signal: controller.signal });
  });
});
