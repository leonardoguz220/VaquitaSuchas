import { act, renderHook } from '@testing-library/react';
import { ApiError } from '@/services/http';
import { useApiSubmit } from './use-api-submit';

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/perfil',
}));

beforeEach(() => {
  replace.mockReset();
  window.history.replaceState(null, '', '/perfil');
});

describe('useApiSubmit (envíos del perfil, T039)', () => {
  it('RNF-003-04: marca el envío en curso y devuelve la respuesta', async () => {
    let resolve: (value: string) => void = () => {};
    const request = jest.fn(() => new Promise<string>((r) => (resolve = r)));
    const { result } = renderHook(() => useApiSubmit(request));

    let pending: Promise<unknown> = Promise.resolve();
    act(() => {
      pending = result.current.submit({ a: 1 });
    });
    expect(result.current.isSubmitting).toBe(true);

    await act(async () => {
      resolve('ok');
      await pending;
    });
    await expect(pending).resolves.toEqual({ ok: true, data: 'ok' });
    expect(result.current.isSubmitting).toBe(false);
  });

  it('RNF-003-04: ignora un segundo envío mientras hay uno en curso', async () => {
    const request = jest.fn(() => new Promise<string>(() => {}));
    const { result } = renderHook(() => useApiSubmit(request));
    act(() => {
      void result.current.submit(1);
    });
    let second: unknown;
    await act(async () => {
      second = await result.current.submit(2);
    });
    expect(second).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('RNF-003-04: con un error devuelve el ApiError tal cual y Reintentar reenvía el mismo cuerpo', async () => {
    const error = new ApiError(0, 'NETWORK_ERROR', 'x');
    const request = jest.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useApiSubmit(request));

    let first: unknown;
    await act(async () => {
      first = await result.current.submit({ fullName: 'Ana' });
    });
    expect(first).toEqual({ ok: false, error });

    let second: unknown;
    await act(async () => {
      second = await result.current.retry();
    });
    expect(second).toEqual({ ok: true, data: 'ok' });
    expect(request).toHaveBeenNthCalledWith(2, { fullName: 'Ana' });
  });

  it('RF-003-08: con 401 redirige a /ingresar?next=/perfil y devuelve null', async () => {
    const request = jest.fn().mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useApiSubmit(request));
    let outcome: unknown = 'sin valor';
    await act(async () => {
      outcome = await result.current.submit({});
    });
    expect(outcome).toBeNull();
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil');
  });

  it('RF-003-15: forget olvida el último cuerpo y Reintentar ya no envía nada', async () => {
    const request = jest.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useApiSubmit(request));
    await act(async () => {
      await result.current.submit({ currentPassword: 'x' });
    });
    act(() => result.current.forget());
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.retry();
    });
    expect(outcome).toBeNull();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
