import { act, renderHook, waitFor } from '@testing-library/react';
import { ApiError } from '@/services/http';
import { useApiResource } from './use-api-resource';

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/grupos',
}));

beforeEach(() => {
  replace.mockReset();
  window.history.replaceState(null, '', '/grupos');
});

describe('useApiResource', () => {
  it('empieza cargando y con éxito entrega los datos', async () => {
    const load = jest.fn().mockResolvedValue({ ok: 1 });
    const { result } = renderHook(() => useApiResource(load));
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.data).toEqual({ ok: 1 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('RF-003-08: con 401 redirige a /ingresar?next=<ruta actual>', async () => {
    const load = jest.fn().mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useApiResource(load));
    await waitFor(() => expect(result.current.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos');
  });

  it('con otro error queda en error y reload vuelve a pedir', async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'))
      .mockResolvedValueOnce('datos');
    const { result } = renderHook(() => useApiResource(load));
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.code).toBe('UPSTREAM_TIMEOUT');

    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.data).toBe('datos'));
    expect(replace).not.toHaveBeenCalled();
  });

  it('envuelve un error que no es ApiError', async () => {
    const load = jest.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useApiResource(load));
    await waitFor(() => expect(result.current.error?.code).toBe('UNEXPECTED_RESPONSE'));
  });

  it('si cambia load descarta la respuesta anterior', async () => {
    let resolveFirst: (value: string) => void = () => {};
    const first = jest.fn(() => new Promise<string>((resolve) => (resolveFirst = resolve)));
    const second = jest.fn().mockResolvedValue('segundo');
    const { result, rerender } = renderHook(({ load }) => useApiResource(load), {
      initialProps: { load: first as () => Promise<string> },
    });
    rerender({ load: second });
    await waitFor(() => expect(result.current.data).toBe('segundo'));
    await act(async () => resolveFirst('primero'));
    expect(result.current.data).toBe('segundo');
  });

  it('con load null no pide nada; replace fija los datos', () => {
    const { result } = renderHook(() => useApiResource<string>(null));
    expect(result.current.status).toBe('loading');
    act(() => result.current.replace('nuevo'));
    expect(result.current).toMatchObject({ status: 'success', data: 'nuevo' });
  });
});
