import { act, renderHook } from '@testing-library/react';
import type { UserSelf } from '@/services/auth';
import { ApiError } from '@/services/http';
import {
  getPhoneChangeStatus,
  startPhoneChange,
  type PhoneChangeResponse,
  type PhoneChangeStatusResponse,
} from '@/services/users';
import { PHONE_CHANGE_POLL_MS, usePhoneChange } from './use-phone-change';

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/perfil',
}));
jest.mock('@/services/users', () => ({
  startPhoneChange: jest.fn(),
  getPhoneChangeStatus: jest.fn(),
}));

const mockedStart = jest.mocked(startPhoneChange);
const mockedStatus = jest.mocked(getPhoneChangeStatus);

const link: PhoneChangeResponse = {
  verification: {
    telegramUrl: 'https://t.me/vaquita_bot?start=cel789',
    expiresAt: '2026-10-18T17:10:00.000Z',
  },
};
const pending: PhoneChangeStatusResponse = { status: 'pending' };

const user: UserSelf = {
  id: '6f1c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ciMasked: '*****123',
  phone: '+59176543210',
  role: 'usuario',
  status: 'activo',
  lastLoginAt: '2026-10-17T22:15:00.000Z',
  createdAt: '2026-10-01T14:00:00.000Z',
};

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

async function started() {
  mockedStart.mockResolvedValue(link);
  const hook = renderHook(() => usePhoneChange());
  await act(async () => {
    await hook.result.current.start();
  });
  return hook;
}

beforeEach(() => {
  jest.useFakeTimers();
  replace.mockReset();
  mockedStart.mockReset();
  mockedStatus.mockReset();
  window.history.replaceState(null, '', '/perfil');
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => jest.useRealTimers());

describe('usePhoneChange (RF-003-14, sondeo cada 2 s)', () => {
  it('RF-003-14: no consulta nada hasta que se pide el cambio', async () => {
    const { result } = renderHook(() => usePhoneChange());
    await advance(10_000);
    expect(result.current.view).toEqual({ kind: 'idle' });
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it('RF-003-14: start pide el enlace y queda esperando con telegramUrl y expiresAt', async () => {
    const { result } = await started();
    expect(mockedStart).toHaveBeenCalledTimes(1);
    expect(result.current.view).toEqual({
      kind: 'pending',
      telegramUrl: link.verification.telegramUrl,
      expiresAt: link.verification.expiresAt,
    });
  });

  it('RF-003-14: consulta cada 2 s mientras está pending', async () => {
    mockedStatus.mockResolvedValue(pending);
    await started();
    expect(PHONE_CHANGE_POLL_MS).toBe(2000);
    await advance(1999);
    expect(mockedStatus).toHaveBeenCalledTimes(0);
    await advance(1);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    await advance(4000);
    expect(mockedStatus).toHaveBeenCalledTimes(3);
  });

  it('RF-003-14: nunca superpone consultas; la siguiente se programa al terminar la anterior', async () => {
    let resolve: (value: PhoneChangeStatusResponse) => void = () => {};
    mockedStatus.mockImplementation(() => new Promise((r) => (resolve = r)));
    await started();
    await advance(2000);
    await advance(10_000);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    await act(async () => resolve(pending));
    await advance(2000);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RF-003-14: verified entrega el UserSelf nuevo y detiene el sondeo', async () => {
    mockedStatus.mockResolvedValue({ status: 'verified', user });
    const { result } = await started();
    await advance(2000);
    expect(result.current.view).toEqual({ kind: 'verified', user });
    await advance(10_000);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('CA-003-15: rejected entrega el code y detiene el sondeo', async () => {
    mockedStatus.mockResolvedValue({ status: 'rejected', code: 'PHONE_NOT_BOLIVIAN' });
    const { result } = await started();
    await advance(2000);
    expect(result.current.view).toEqual({ kind: 'rejected', code: 'PHONE_NOT_BOLIVIAN' });
    await advance(10_000);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('CA-003-32: expired detiene el sondeo y start pide un enlace nuevo sin ocultar la tarjeta', async () => {
    mockedStatus.mockResolvedValueOnce({ status: 'expired' }).mockResolvedValue(pending);
    const { result } = await started();
    await advance(2000);
    expect(result.current.view).toEqual({ kind: 'expired' });

    let resolveLink: (value: PhoneChangeResponse) => void = () => {};
    mockedStart.mockImplementationOnce(() => new Promise((r) => (resolveLink = r)));
    act(() => {
      void result.current.start();
    });
    expect(result.current.isStarting).toBe(true);
    expect(result.current.view).toEqual({ kind: 'expired' });
    await act(async () => resolveLink(link));
    expect(result.current.view.kind).toBe('pending');
    await advance(2000);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RNF-003-04: un error de conexión no detiene el sondeo y queda en issue', async () => {
    mockedStatus
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockResolvedValue(pending);
    const { result } = await started();
    await advance(2000);
    expect(result.current.issue).toBe('connection');
    await advance(2000);
    expect(result.current.issue).toBeNull();
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RF-003-08: un 401 al consultar redirige a /ingresar?next=/perfil y detiene el sondeo', async () => {
    mockedStatus.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    await started();
    await advance(2000);
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fperfil');
    await advance(10_000);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('CA-003-32: cancel vuelve a idle, deja de consultar y descarta una respuesta tardía', async () => {
    let resolve: (value: PhoneChangeStatusResponse) => void = () => {};
    mockedStatus.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { result } = await started();
    await advance(2000);
    act(() => result.current.cancel());
    await act(async () => resolve({ status: 'verified', user }));
    expect(result.current.view).toEqual({ kind: 'idle' });
    await advance(10_000);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('RF-003-14: si falla el primer pedido de enlace vuelve a idle con el error', async () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 120 });
    mockedStart.mockRejectedValue(error);
    const { result } = renderHook(() => usePhoneChange());
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.view).toEqual({ kind: 'idle' });
    expect(result.current.startError).toBe(error);
    expect(mockedStatus).not.toHaveBeenCalled();
  });

  it('RF-003-14: pausa con la pestaña oculta y consulta enseguida al volver', async () => {
    mockedStatus.mockResolvedValue(pending);
    await started();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(10_000);
    expect(mockedStatus).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await advance(0);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });
});
