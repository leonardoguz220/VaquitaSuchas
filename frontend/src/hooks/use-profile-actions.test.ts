import { act, renderHook } from '@testing-library/react';
import { logout } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useLogout } from './use-profile-actions';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/perfil',
}));
jest.mock('@/services/auth', () => ({ logout: jest.fn(), changePassword: jest.fn() }));
jest.mock('@/services/users', () => ({ updateMe: jest.fn() }));

const mockedLogout = jest.mocked(logout);

beforeEach(() => {
  replace.mockReset();
  mockedLogout.mockReset();
});

describe('useLogout (POST /auth/logout)', () => {
  it('RF-003-07: cierra la sesión y va a /ingresar', async () => {
    mockedLogout.mockResolvedValue(undefined);
    const { result } = renderHook(() => useLogout());
    await act(async () => {
      await result.current.logOut();
    });
    expect(mockedLogout).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/ingresar');
  });

  it('RF-003-07: va a /ingresar aunque el backend falle (el proxy borra la cookie igual)', async () => {
    mockedLogout.mockRejectedValue(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    const { result } = renderHook(() => useLogout());
    await act(async () => {
      await result.current.logOut();
    });
    expect(replace).toHaveBeenCalledWith('/ingresar');
  });

  it('RNF-003-04: un segundo toque mientras cierra no vuelve a llamar al backend', async () => {
    mockedLogout.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useLogout());
    act(() => {
      void result.current.logOut();
    });
    expect(result.current.isLoggingOut).toBe(true);
    await act(async () => {
      await Promise.race([result.current.logOut(), Promise.resolve()]);
    });
    expect(mockedLogout).toHaveBeenCalledTimes(1);
  });
});
