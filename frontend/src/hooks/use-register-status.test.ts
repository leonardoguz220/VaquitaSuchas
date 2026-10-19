import { act, renderHook } from '@testing-library/react';
import { getRegisterStatus, type RegisterStatusResponse, type UserSelf } from '@/services/auth';
import { ApiError } from '@/services/http';
import { REGISTER_STATUS_POLL_MS, useRegisterStatus } from './use-register-status';

jest.mock('@/services/auth', () => ({ getRegisterStatus: jest.fn() }));

const mockedStatus = jest.mocked(getRegisterStatus);

const pending: RegisterStatusResponse = {
  status: 'pending',
  expiresAt: '2026-10-18T17:10:00.000Z',
};

const user: UserSelf = {
  id: '6f1c2a9e-0d3b-4c1e-9a77-2b5f0e8d4c11',
  fullName: 'Ana Quispe Mamani',
  email: 'ana.quispe@gmail.com',
  ciMasked: '****123',
  phone: '+59171234567',
  role: 'usuario',
  status: 'activo',
  lastLoginAt: null,
  createdAt: '2026-10-18T17:00:00.000Z',
};

/** Deja que se resuelvan las promesas pendientes sin mover el reloj. */
async function flush() {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  mockedStatus.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useRegisterStatus (RF-003-21, sondeo cada 2 s)', () => {
  it('RF-003-21: el sondeo es cada 2 s', () => {
    expect(REGISTER_STATUS_POLL_MS).toBe(2000);
  });

  it('RF-003-21: consulta al montar y luego cada 2 s mientras el estado es pending', async () => {
    mockedStatus.mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());

    expect(result.current.view).toEqual({ kind: 'loading' });
    await flush();
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    expect(result.current.view).toEqual({ kind: 'pending', expiresAt: pending.expiresAt });

    await advance(1999);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
    await advance(2000);
    expect(mockedStatus).toHaveBeenCalledTimes(3);
  });

  it.each<[string, RegisterStatusResponse, object]>([
    ['expired', { status: 'expired' }, { kind: 'expired' }],
    [
      'rejected',
      { status: 'rejected', code: 'PHONE_ALREADY_REGISTERED' },
      { kind: 'rejected', code: 'PHONE_ALREADY_REGISTERED' },
    ],
    ['verified', { status: 'verified', user }, { kind: 'verified', user }],
  ])('RF-003-21: se detiene cuando el servidor responde %s', async (_name, body, view) => {
    mockedStatus.mockResolvedValueOnce(pending).mockResolvedValueOnce(body);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();
    await advance(REGISTER_STATUS_POLL_MS);

    expect(result.current.view).toEqual(view);
    await advance(REGISTER_STATUS_POLL_MS * 5);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RF-003-21: con 401 pasa a inactivo y deja de consultar', async () => {
    mockedStatus.mockRejectedValue(new ApiError(401, 'UNAUTHENTICATED', 'x'));
    const { result } = renderHook(() => useRegisterStatus());
    await flush();

    expect(result.current.view).toEqual({ kind: 'inactive' });
    await advance(REGISTER_STATUS_POLL_MS * 5);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('RNF-003-04: un error de conexión no detiene el sondeo y avisa; al volver la red se quita el aviso', async () => {
    mockedStatus
      .mockResolvedValueOnce(pending)
      .mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'))
      .mockRejectedValueOnce(new ApiError(504, 'UPSTREAM_TIMEOUT', 'x'))
      .mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();

    await advance(REGISTER_STATUS_POLL_MS);
    expect(result.current.issue).toBe('connection');
    expect(result.current.view.kind).toBe('pending');
    await advance(REGISTER_STATUS_POLL_MS);
    expect(result.current.issue).toBe('connection');
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(4);
    expect(result.current.issue).toBeNull();
  });

  it('RNF-003-04: sin conexión desde el inicio sigue cargando y reintenta', async () => {
    mockedStatus.mockRejectedValueOnce(new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'));
    mockedStatus.mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();
    expect(result.current.view).toEqual({ kind: 'loading' });
    expect(result.current.issue).toBe('connection');

    await advance(REGISTER_STATUS_POLL_MS);
    expect(result.current.view.kind).toBe('pending');
  });

  it('RNF-003-04: un error inesperado del servidor tampoco detiene el sondeo', async () => {
    mockedStatus.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    mockedStatus.mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();
    expect(result.current.issue).toBe('server');
    await advance(REGISTER_STATUS_POLL_MS);
    expect(result.current.issue).toBeNull();
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RF-003-21: no superpone peticiones: no lanza otra mientras una está en vuelo', async () => {
    let resolveFirst!: (value: RegisterStatusResponse) => void;
    mockedStatus.mockReturnValueOnce(new Promise((r) => (resolveFirst = r)));
    mockedStatus.mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();

    await advance(REGISTER_STATUS_POLL_MS * 4);
    act(() => {
      result.current.refresh();
    });
    expect(mockedStatus).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFirst(pending);
      await jest.advanceTimersByTimeAsync(0);
    });
    expect(mockedStatus).toHaveBeenCalledTimes(1);
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RF-003-21: se detiene al desmontar', async () => {
    mockedStatus.mockResolvedValue(pending);
    const { unmount } = renderHook(() => useRegisterStatus());
    await flush();
    unmount();
    await advance(REGISTER_STATUS_POLL_MS * 5);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('RF-003-21: pausa con la pestaña oculta y consulta enseguida al volver', async () => {
    mockedStatus.mockResolvedValue(pending);
    renderHook(() => useRegisterStatus());
    await flush();

    setVisibility('hidden');
    await advance(REGISTER_STATUS_POLL_MS * 5);
    expect(mockedStatus).toHaveBeenCalledTimes(1);

    setVisibility('visible');
    await flush();
    expect(mockedStatus).toHaveBeenCalledTimes(2);
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(3);
  });

  it('RF-003-21: al volver la pestaña no reanuda si el estado ya es final', async () => {
    mockedStatus.mockResolvedValue({ status: 'expired' });
    renderHook(() => useRegisterStatus());
    await flush();
    setVisibility('hidden');
    setVisibility('visible');
    await advance(REGISTER_STATUS_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });

  it('RF-003-21: refresh consulta una vez más aunque el estado sea final (el servidor manda)', async () => {
    mockedStatus.mockResolvedValueOnce({ status: 'expired' }).mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();
    expect(result.current.view.kind).toBe('expired');

    act(() => {
      result.current.refresh();
    });
    await flush();
    expect(result.current.view).toEqual({ kind: 'pending', expiresAt: pending.expiresAt });
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(3);
  });

  it('RF-003-21: restart vuelve a esperar con el nuevo vencimiento y reanuda el sondeo', async () => {
    mockedStatus.mockResolvedValueOnce({ status: 'expired' }).mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();

    act(() => {
      result.current.restart('2026-10-18T17:20:00.000Z');
    });
    expect(result.current.view).toEqual({ kind: 'pending', expiresAt: '2026-10-18T17:20:00.000Z' });
    await advance(REGISTER_STATUS_POLL_MS);
    expect(mockedStatus).toHaveBeenCalledTimes(2);
  });

  it('RF-003-21: markInactive pasa a inactivo y detiene el sondeo', async () => {
    mockedStatus.mockResolvedValue(pending);
    const { result } = renderHook(() => useRegisterStatus());
    await flush();
    act(() => {
      result.current.markInactive();
    });
    expect(result.current.view).toEqual({ kind: 'inactive' });
    await advance(REGISTER_STATUS_POLL_MS * 3);
    expect(mockedStatus).toHaveBeenCalledTimes(1);
  });
});
