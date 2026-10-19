import { act, renderHook } from '@testing-library/react';
import { getHealth, type HealthResponse } from '@/services/health';
import { ApiError } from '@/services/http';
import { HEALTH_TIMEOUT_MS, useHealth } from './use-health';

jest.mock('@/services/health', () => ({ getHealth: jest.fn() }));

const mockedGetHealth = jest.mocked(getHealth);

const healthy: HealthResponse = {
  status: 'ok',
  version: '0.1.0',
  uptimeSeconds: 1234,
  database: { status: 'up', latencyMs: 4 },
  time: '2026-10-18T17:00:00.000Z',
};

/** Una petición que nunca responde, salvo que se cancele con la señal. */
function hangingRequest(): Promise<HealthResponse> {
  return new Promise(() => {});
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedGetHealth.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useHealth (RF-000-18, tiempo máximo de 5 s en el cliente)', () => {
  it('RF-000-18: el tiempo máximo por defecto es 5 s', () => {
    expect(HEALTH_TIMEOUT_MS).toBe(5000);
  });

  it('CA-000-10: empieza cargando y luego entrega la respuesta del backend tal cual', async () => {
    mockedGetHealth.mockResolvedValue(healthy);
    const { result } = renderHook(() => useHealth());

    expect(result.current.state).toEqual({ status: 'loading' });
    await advance(0);
    expect(result.current.state).toEqual({ status: 'success', data: healthy });
    expect(mockedGetHealth).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('RF-000-18: si la petición falla queda "unreachable"', async () => {
    mockedGetHealth.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const { result } = renderHook(() => useHealth());
    await advance(0);
    expect(result.current.state).toEqual({ status: 'unreachable' });
  });

  it('RF-000-18: si tarda más de 5 s cancela la petición y queda "unreachable"', async () => {
    mockedGetHealth.mockImplementation(hangingRequest);
    const { result } = renderHook(() => useHealth());

    await advance(HEALTH_TIMEOUT_MS - 1);
    expect(result.current.state).toEqual({ status: 'loading' });
    const signal = mockedGetHealth.mock.calls[0][0]?.signal;
    expect(signal?.aborted).toBe(false);

    await advance(1);
    expect(result.current.state).toEqual({ status: 'unreachable' });
    expect(signal?.aborted).toBe(true);
  });

  it('RF-000-18: el tiempo máximo se puede inyectar', async () => {
    mockedGetHealth.mockImplementation(hangingRequest);
    const { result } = renderHook(() => useHealth({ timeoutMs: 50 }));
    await advance(50);
    expect(result.current.state).toEqual({ status: 'unreachable' });
  });

  it('RF-000-18: retry vuelve a consultar y muestra el nuevo resultado', async () => {
    mockedGetHealth
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValueOnce(healthy);
    const { result } = renderHook(() => useHealth());
    await advance(0);
    expect(result.current.state.status).toBe('unreachable');

    act(() => result.current.retry());
    expect(result.current.isRetrying).toBe(true);
    await advance(0);
    expect(result.current.isRetrying).toBe(false);
    expect(result.current.state).toEqual({ status: 'success', data: healthy });
    expect(mockedGetHealth).toHaveBeenCalledTimes(2);
  });

  it('RF-000-18: mientras reintenta conserva el resultado anterior', async () => {
    mockedGetHealth.mockResolvedValueOnce(healthy).mockImplementationOnce(hangingRequest);
    const { result } = renderHook(() => useHealth());
    await advance(0);

    act(() => result.current.retry());
    await advance(100);
    expect(result.current.isRetrying).toBe(true);
    expect(result.current.state).toEqual({ status: 'success', data: healthy });
  });

  it('RF-000-18: al desmontar cancela la petición y no actualiza el estado', async () => {
    mockedGetHealth.mockImplementation(hangingRequest);
    const { unmount } = renderHook(() => useHealth());
    const signal = mockedGetHealth.mock.calls[0][0]?.signal;
    unmount();
    expect(signal?.aborted).toBe(true);
    await advance(HEALTH_TIMEOUT_MS * 2);
  });
});
