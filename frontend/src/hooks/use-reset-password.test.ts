import { act, renderHook } from '@testing-library/react';
import { resetPassword, type ResetPasswordRequest } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useResetPassword } from './use-reset-password';

jest.mock('@/services/auth', () => ({ resetPassword: jest.fn() }));

const mockedReset = jest.mocked(resetPassword);

const input: ResetPasswordRequest = {
  token: 'q3Vx9kPz-token-de-prueba',
  newPassword: 'nuevaclave2026',
  newPasswordConfirmation: 'nuevaclave2026',
};

beforeEach(() => mockedReset.mockReset());

describe('useResetPassword (RF-003-12)', () => {
  it('RF-003-12: con 204 pasa a éxito', async () => {
    mockedReset.mockResolvedValue(undefined);
    const { result } = renderHook(() => useResetPassword());

    await act(async () => {
      expect(await result.current.submit(input)).toEqual({ ok: true });
    });
    expect(mockedReset).toHaveBeenCalledWith(input);
    expect(result.current.status).toBe('success');
  });

  it('CA-003-12: con RESET_TOKEN_INVALID guarda el ApiError y pasa a error', async () => {
    const error = new ApiError(410, 'RESET_TOKEN_INVALID', 'x', { canRequestNew: true });
    mockedReset.mockRejectedValue(error);
    const { result } = renderHook(() => useResetPassword());

    await act(async () => {
      expect(await result.current.submit(input)).toEqual({ ok: false, error });
    });
    expect(result.current.status).toBe('error');
    expect(result.current.error).toBe(error);
  });

  it('RNF-003-04: ignora un segundo envío y retry reenvía el último cuerpo', async () => {
    let reject!: (reason: unknown) => void;
    mockedReset
      .mockReturnValueOnce(new Promise((_, r) => (reject = r)))
      .mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useResetPassword());

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.submit(input);
    });
    expect(result.current.isSubmitting).toBe(true);
    await act(async () => {
      expect(await result.current.submit(input)).toBeNull();
    });
    await act(async () => {
      reject(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
      await first;
    });
    expect(result.current.status).toBe('error');

    await act(async () => {
      await result.current.retry();
    });
    expect(mockedReset).toHaveBeenCalledTimes(2);
    expect(mockedReset).toHaveBeenNthCalledWith(2, input);
    expect(result.current.status).toBe('success');
  });
});
