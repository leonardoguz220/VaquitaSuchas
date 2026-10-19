import { act, renderHook } from '@testing-library/react';
import { requestRegisterLink, type RegisterLinkResponse } from '@/services/auth';
import { ApiError } from '@/services/http';
import { useRegisterLink, type RegisterLinkResult } from './use-register-link';

jest.mock('@/services/auth', () => ({ requestRegisterLink: jest.fn() }));

const mockedLink = jest.mocked(requestRegisterLink);

const created: RegisterLinkResponse = {
  verification: {
    telegramUrl: 'https://t.me/vaquita_bot?start=nuevo456',
    expiresAt: '2026-10-18T17:20:00.000Z',
  },
};

beforeEach(() => mockedLink.mockReset());

describe('useRegisterLink (RF-003-21)', () => {
  it('RF-003-21: con 200 devuelve la verificación nueva', async () => {
    mockedLink.mockResolvedValue(created);
    const { result } = renderHook(() => useRegisterLink());
    let outcome: RegisterLinkResult | null = null;
    await act(async () => {
      outcome = await result.current.request();
    });
    expect(outcome).toEqual({ ok: true, data: created });
    expect(result.current.isRequesting).toBe(false);
  });

  it('CA-003-29: con 429 devuelve el ApiError tal cual', async () => {
    const error = new ApiError(429, 'RATE_LIMITED', 'x', { retryAfterSeconds: 600 });
    mockedLink.mockRejectedValue(error);
    const { result } = renderHook(() => useRegisterLink());
    let outcome: RegisterLinkResult | null = null;
    await act(async () => {
      outcome = await result.current.request();
    });
    expect(outcome).toEqual({ ok: false, error });
  });

  it('RNF-003-04: mientras pide está cargando e ignora un segundo pedido', async () => {
    let resolve!: (value: RegisterLinkResponse) => void;
    mockedLink.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useRegisterLink());

    let first!: Promise<unknown>;
    act(() => {
      first = result.current.request();
    });
    expect(result.current.isRequesting).toBe(true);
    await act(async () => {
      expect(await result.current.request()).toBeNull();
    });
    expect(mockedLink).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(created);
      await first;
    });
    expect(result.current.isRequesting).toBe(false);
  });
});
