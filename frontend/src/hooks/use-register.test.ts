import { act, renderHook } from '@testing-library/react';
import { register, type RegisterRequest, type RegisterResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useRegister } from './use-register';

jest.mock('@/services/auth', () => ({ register: jest.fn() }));

const mockedRegister = jest.mocked(register);

const input: RegisterRequest = {
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ci: '7845123',
  password: 'vaquita2026',
  passwordConfirmation: 'vaquita2026',
  acceptDataPolicy: true,
};

const created: RegisterResponse = {
  verification: {
    telegramUrl: 'https://t.me/vaquita_bot?start=abc123',
    expiresAt: '2026-10-18T17:10:00.000Z',
  },
};

beforeEach(() => mockedRegister.mockReset());

describe('useRegister (RF-003-01)', () => {
  it('RF-003-01: con 201 pasa a éxito y llama a onSuccess con la verificación', async () => {
    mockedRegister.mockResolvedValue(created);
    const onSuccess = jest.fn();
    const { result } = renderHook(() => useRegister({ onSuccess }));

    await act(async () => {
      await result.current.submit(input);
    });

    expect(mockedRegister).toHaveBeenCalledWith(input);
    expect(result.current.status).toBe('success');
    expect(onSuccess).toHaveBeenCalledWith(created);
  });

  it('RF-003-01: con un error guarda el ApiError y pasa a error', async () => {
    const error = new ApiError(409, 'EMAIL_TAKEN', 'Ese correo ya está registrado.');
    mockedRegister.mockRejectedValue(error);
    const { result } = renderHook(() => useRegister());

    await act(async () => {
      await result.current.submit(input);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(error);
  });

  it('RNF-003-04: mientras envía está cargando e ignora un segundo envío', async () => {
    let resolve!: (value: RegisterResponse) => void;
    mockedRegister.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useRegister());

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.submit(input);
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => {
      expect(await result.current.submit(input)).toBeNull();
    });
    expect(mockedRegister).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(created);
      await first;
    });
    expect(result.current.status).toBe('success');
  });

  it('RF-003-01: retry vuelve a enviar el último cuerpo', async () => {
    mockedRegister
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin red'))
      .mockResolvedValueOnce(created);
    const { result } = renderHook(() => useRegister());

    await act(async () => {
      await result.current.submit(input);
    });
    await act(async () => {
      await result.current.retry();
    });

    expect(mockedRegister).toHaveBeenNthCalledWith(2, input);
    expect(result.current.status).toBe('success');
  });
});
