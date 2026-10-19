import { act, renderHook } from '@testing-library/react';
import { login, type LoginRequest, type LoginResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useLogin } from './use-login';

jest.mock('@/services/auth', () => ({ login: jest.fn() }));

const mockedLogin = jest.mocked(login);

const input: LoginRequest = { email: 'ana.quispe@gmail.com', password: 'vaquita2026' };

// Respuesta 200 tal como llega al navegador: el proxy ya quitó sessionToken.
const ok: LoginResponse = {
  user: {
    id: '6f1c2a9e-1b2c-4d3e-8f9a-0b1c2d3e4f5a',
    fullName: 'Ana Quispe Mamani',
    email: 'ana.quispe@gmail.com',
    ciMasked: '*****123',
    phone: '+59171234567',
    role: 'usuario',
    status: 'activo',
    lastLoginAt: null,
    createdAt: '2026-10-18T14:00:00.000Z',
  },
};

beforeEach(() => mockedLogin.mockReset());

describe('useLogin (RF-003-06)', () => {
  it('RF-003-06: con 200 pasa a éxito y llama a onSuccess con el usuario', async () => {
    mockedLogin.mockResolvedValue(ok);
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useLogin({ onSuccess }));

    await act(async () => {
      await result.current.submit(input);
    });

    expect(mockedLogin).toHaveBeenCalledWith(input);
    expect(result.current.status).toBe('success');
    expect(onSuccess).toHaveBeenCalledWith(ok);
  });

  it('CA-003-05: con INVALID_CREDENTIALS guarda el ApiError y pasa a error', async () => {
    const error = new ApiError(401, 'INVALID_CREDENTIALS', 'Correo o contraseña incorrectos.');
    mockedLogin.mockRejectedValue(error);
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useLogin({ onSuccess }));

    await act(async () => {
      expect(await result.current.submit(input)).toEqual({ ok: false, error });
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(error);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('RNF-003-04: mientras envía está cargando e ignora un segundo envío', async () => {
    let resolve!: (value: LoginResponse) => void;
    mockedLogin.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useLogin());

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.submit(input);
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => {
      expect(await result.current.submit(input)).toBeNull();
    });
    expect(mockedLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(ok);
      await first;
    });
    expect(result.current.status).toBe('success');
  });

  it('RNF-003-04: retry vuelve a enviar el último cuerpo', async () => {
    mockedLogin
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin red'))
      .mockResolvedValueOnce(ok);
    const { result } = renderHook(() => useLogin());

    await act(async () => {
      expect(await result.current.retry()).toBeNull();
    });
    await act(async () => {
      await result.current.submit(input);
    });
    await act(async () => {
      await result.current.retry();
    });

    expect(mockedLogin).toHaveBeenNthCalledWith(2, input);
    expect(result.current.status).toBe('success');
  });
});
