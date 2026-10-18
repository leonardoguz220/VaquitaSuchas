import { act, renderHook } from '@testing-library/react';
import { getTelegramOutbox, simulateTelegram } from '@/services/dev-telegram';
import { ApiError } from '@/services/http';
import { useDevTelegram, type SimulateResult } from './use-dev-telegram';

jest.mock('@/services/dev-telegram', () => ({
  simulateTelegram: jest.fn(),
  getTelegramOutbox: jest.fn(),
}));

const mockedSimulate = jest.mocked(simulateTelegram);
const mockedOutbox = jest.mocked(getTelegramOutbox);

beforeEach(() => {
  mockedSimulate.mockReset();
  mockedOutbox.mockReset();
});

describe('useDevTelegram (pantalla /dev/telegram)', () => {
  it('RF-003-21: simulate envía el cuerpo y devuelve ok', async () => {
    mockedSimulate.mockResolvedValue(undefined);
    const { result } = renderHook(() => useDevTelegram());
    let outcome: SimulateResult | null = null;
    await act(async () => {
      outcome = await result.current.simulate({ kind: 'start', telegramUserId: 1001, token: 't' });
    });
    expect(mockedSimulate).toHaveBeenCalledWith({
      kind: 'start',
      telegramUserId: 1001,
      token: 't',
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.sending).toBeNull();
  });

  it('RF-003-21: simulate devuelve el ApiError si el backend falla', async () => {
    const error = new ApiError(404, 'NOT_FOUND', 'x');
    mockedSimulate.mockRejectedValue(error);
    const { result } = renderHook(() => useDevTelegram());
    let outcome: SimulateResult | null = null;
    await act(async () => {
      outcome = await result.current.simulate({ kind: 'start', telegramUserId: 1 });
    });
    expect(outcome).toEqual({ ok: false, error });
  });

  it('RF-003-21: loadOutbox pasa por cargando y guarda la respuesta tal cual', async () => {
    const data = [{ text: 'Hola' }];
    let resolve!: (value: unknown) => void;
    mockedOutbox.mockReturnValue(new Promise((r) => (resolve = r)));
    const { result } = renderHook(() => useDevTelegram());

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.loadOutbox(1001);
    });
    expect(result.current.outbox).toEqual({ kind: 'loading' });
    await act(async () => {
      resolve(data);
      await pending;
    });
    expect(mockedOutbox).toHaveBeenCalledWith(1001);
    expect(result.current.outbox).toEqual({ kind: 'data', data });
  });

  it('RF-003-21: loadOutbox guarda el error', async () => {
    const error = new ApiError(503, 'SERVICE_UNAVAILABLE', 'x');
    mockedOutbox.mockRejectedValue(error);
    const { result } = renderHook(() => useDevTelegram());
    await act(async () => {
      await result.current.loadOutbox(1001);
    });
    expect(result.current.outbox).toEqual({ kind: 'error', error });
  });
});
