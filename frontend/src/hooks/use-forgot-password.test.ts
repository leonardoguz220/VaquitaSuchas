import { act, renderHook } from '@testing-library/react';
import { forgotPassword, type ForgotPasswordResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useForgotPassword } from './use-forgot-password';

jest.mock('@/services/auth', () => ({ forgotPassword: jest.fn() }));

const mockedForgot = jest.mocked(forgotPassword);

const input = { email: 'ana.quispe@gmail.com' };
const ok: ForgotPasswordResponse = {
  message: 'Si el correo está registrado, recibirás un enlace en unos minutos.',
};

beforeEach(() => mockedForgot.mockReset());

describe('useForgotPassword (RF-003-10)', () => {
  it('RF-003-10: con 202 pasa a éxito y devuelve la respuesta', async () => {
    mockedForgot.mockResolvedValue(ok);
    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      expect(await result.current.submit(input)).toEqual({ ok: true, data: ok });
    });

    expect(mockedForgot).toHaveBeenCalledWith(input);
    expect(result.current.status).toBe('success');
  });

  it('CA-003-13: con RATE_LIMITED guarda el ApiError y pasa a error', async () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 600 });
    mockedForgot.mockRejectedValue(error);
    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      expect(await result.current.submit(input)).toEqual({ ok: false, error });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(error);
  });

  it('RNF-003-04: mientras envía está cargando e ignora un segundo envío', async () => {
    let resolve!: (value: ForgotPasswordResponse) => void;
    mockedForgot.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useForgotPassword());

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.submit(input);
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => {
      expect(await result.current.submit(input)).toBeNull();
    });
    expect(mockedForgot).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolve(ok);
      await first;
    });
    expect(result.current.status).toBe('success');
  });

  it('RNF-003-04: retry vuelve a enviar el último cuerpo', async () => {
    mockedForgot
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'Sin red'))
      .mockResolvedValueOnce(ok);
    const { result } = renderHook(() => useForgotPassword());

    await act(async () => {
      expect(await result.current.retry()).toBeNull();
    });
    await act(async () => {
      await result.current.submit(input);
    });
    await act(async () => {
      await result.current.retry();
    });

    expect(mockedForgot).toHaveBeenNthCalledWith(2, input);
    expect(result.current.status).toBe('success');
  });
});
