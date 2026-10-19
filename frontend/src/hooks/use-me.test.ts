import { act, renderHook, waitFor } from '@testing-library/react';
import { getMe, type UserSelf } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useMe } from './use-me';

const replace = jest.fn();
const router = { replace };
jest.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/grupos',
}));
jest.mock('@/services/auth', () => ({ getMe: jest.fn() }));

const mockedGetMe = jest.mocked(getMe);

const user: UserSelf = {
  id: '6f1c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ciMasked: '*****123',
  phone: '+59171234567',
  role: 'usuario',
  status: 'activo',
  lastLoginAt: '2026-10-17T22:15:00.000Z',
  createdAt: '2026-10-01T14:00:00.000Z',
};

beforeEach(() => {
  replace.mockReset();
  mockedGetMe.mockReset();
  window.history.replaceState(null, '', '/grupos');
});

describe('useMe (GET /auth/me)', () => {
  it('RF-003-08: empieza cargando y con 200 entrega el UserSelf', async () => {
    mockedGetMe.mockResolvedValue(user);
    const { result } = renderHook(() => useMe());

    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.user).toEqual(user);
    expect(mockedGetMe).toHaveBeenCalledTimes(1);
    expect(replace).not.toHaveBeenCalled();
  });

  it('RF-003-08: con 401 redirige a /ingresar?next=<ruta actual>', async () => {
    mockedGetMe.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'Inicia sesión.'));
    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe('redirecting'));
    expect(replace).toHaveBeenCalledWith('/ingresar?next=%2Fgrupos');
    expect(result.current.user).toBeNull();
  });

  it('RF-003-08: con otro error no redirige y permite reintentar', async () => {
    mockedGetMe
      .mockRejectedValueOnce(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'))
      .mockResolvedValueOnce(user);
    const { result } = renderHook(() => useMe());

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error?.code).toBe('UPSTREAM_TIMEOUT');
    expect(replace).not.toHaveBeenCalled();

    act(() => result.current.reload());
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.user).toEqual(user);
    expect(mockedGetMe).toHaveBeenCalledTimes(2);
  });
});
