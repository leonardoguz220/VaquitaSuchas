import { act, renderHook } from '@testing-library/react';
import { getUnreadCount } from '@/services/notifications';
import {
  announceNotificationsChanged,
  UNREAD_POLL_MS,
  useBellMarkAllRead,
  useUnreadCount,
} from './use-notifications';
import { markAllNotificationsRead } from '@/services/notifications';

const mockedCount = jest.mocked(getUnreadCount);
const mockedMarkAll = jest.mocked(markAllNotificationsRead);

let visibility: DocumentVisibilityState = 'visible';

function setVisibility(value: DocumentVisibilityState) {
  visibility = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Deja correr las promesas pendientes. */
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeAll(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

beforeEach(() => {
  jest.useFakeTimers();
  visibility = 'visible';
  mockedCount.mockReset();
  mockedMarkAll.mockReset();
});

afterEach(() => jest.useRealTimers());

describe('useUnreadCount (spec 005 T012, plan §6)', () => {
  it('RF-005-02: consulta el contador al montar y cada 30 s con la pestaña visible', async () => {
    mockedCount.mockResolvedValueOnce({ unreadCount: 3 }).mockResolvedValue({ unreadCount: 4 });
    const { result } = renderHook(() => useUnreadCount());
    await flush();
    expect(mockedCount).toHaveBeenCalledTimes(1);
    expect(result.current.count).toBe(3);

    await act(async () => {
      jest.advanceTimersByTime(UNREAD_POLL_MS);
    });
    await flush();
    expect(UNREAD_POLL_MS).toBe(30_000);
    expect(mockedCount).toHaveBeenCalledTimes(2);
    expect(result.current.count).toBe(4);
  });

  it('RF-005-02: con la pestaña oculta pausa el sondeo y al volver consulta enseguida', async () => {
    mockedCount.mockResolvedValue({ unreadCount: 1 });
    renderHook(() => useUnreadCount());
    await flush();
    expect(mockedCount).toHaveBeenCalledTimes(1);

    act(() => setVisibility('hidden'));
    await act(async () => {
      jest.advanceTimersByTime(UNREAD_POLL_MS * 3);
    });
    expect(mockedCount).toHaveBeenCalledTimes(1);

    act(() => setVisibility('visible'));
    await flush();
    expect(mockedCount).toHaveBeenCalledTimes(2);
    await act(async () => {
      jest.advanceTimersByTime(UNREAD_POLL_MS);
    });
    expect(mockedCount).toHaveBeenCalledTimes(3);
  });

  it('RF-005-02: si la pestaña empieza oculta no consulta hasta que se muestra', async () => {
    visibility = 'hidden';
    mockedCount.mockResolvedValue({ unreadCount: 2 });
    const { result } = renderHook(() => useUnreadCount());
    await flush();
    expect(mockedCount).not.toHaveBeenCalled();
    expect(result.current.count).toBeNull();
    act(() => setVisibility('visible'));
    await flush();
    expect(result.current.count).toBe(2);
  });

  it('CA-005-22: vuelve a consultar cuando otra pantalla anuncia un cambio', async () => {
    mockedCount.mockResolvedValueOnce({ unreadCount: 5 }).mockResolvedValue({ unreadCount: 0 });
    const { result } = renderHook(() => useUnreadCount());
    await flush();
    expect(result.current.count).toBe(5);
    act(() => announceNotificationsChanged());
    await flush();
    expect(result.current.count).toBe(0);
  });

  it('RF-005-02: si una consulta falla conserva el último número y deja de sondear al desmontar', async () => {
    mockedCount.mockResolvedValueOnce({ unreadCount: 2 }).mockRejectedValue(new Error('red'));
    const { result, unmount } = renderHook(() => useUnreadCount());
    await flush();
    await act(async () => {
      jest.advanceTimersByTime(UNREAD_POLL_MS);
    });
    await flush();
    expect(result.current.count).toBe(2);
    unmount();
    const calls = mockedCount.mock.calls.length;
    jest.advanceTimersByTime(UNREAD_POLL_MS * 2);
    expect(mockedCount).toHaveBeenCalledTimes(calls);
  });
});

describe('useBellMarkAllRead (spec 005 T012)', () => {
  it('CA-005-22: devuelve true si la API marcó todas y false con el aviso si falló', async () => {
    mockedMarkAll.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('red'));
    const { result } = renderHook(() => useBellMarkAllRead());
    let ok = false;
    await act(async () => {
      ok = await result.current.markAll();
    });
    expect(ok).toBe(true);
    expect(result.current.failed).toBe(false);
    await act(async () => {
      ok = await result.current.markAll();
    });
    expect(ok).toBe(false);
    expect(result.current.failed).toBe(true);
  });
});
