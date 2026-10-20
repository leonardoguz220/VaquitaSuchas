import { act, renderHook } from '@testing-library/react';
import { useCountdown, useServerCountdown } from './use-countdown';

const NOW = new Date('2026-10-18T17:00:00.000Z');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => jest.useRealTimers());

describe('useCountdown (RF-003-21, cuenta regresiva de 10 minutos)', () => {
  it('RF-003-21: cuenta los segundos que faltan hasta expiresAt de la API', () => {
    const { result } = renderHook(() => useCountdown('2026-10-18T17:10:00.000Z'));
    expect(result.current).toBe(600);
    act(() => {
      jest.advanceTimersByTime(18_000);
    });
    expect(result.current).toBe(582);
  });

  it('RF-003-21: no baja de 0 y llama a onZero una sola vez', () => {
    const onZero = jest.fn();
    const { result } = renderHook(() => useCountdown('2026-10-18T17:00:03.000Z', onZero));
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(result.current).toBe(0);
    expect(onZero).toHaveBeenCalledTimes(1);
  });

  it('RF-003-21: si expiresAt ya pasó, queda en 0 y avisa una vez', () => {
    const onZero = jest.fn();
    const { result } = renderHook(() => useCountdown('2026-10-18T16:00:00.000Z', onZero));
    expect(result.current).toBe(0);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(onZero).toHaveBeenCalledTimes(1);
  });

  it('RF-003-21: con un expiresAt nuevo vuelve a contar y puede avisar otra vez', () => {
    const onZero = jest.fn();
    const { result, rerender } = renderHook(({ at }) => useCountdown(at, onZero), {
      initialProps: { at: '2026-10-18T17:00:01.000Z' as string | null },
    });
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(onZero).toHaveBeenCalledTimes(1);
    rerender({ at: '2026-10-18T17:10:02.000Z' });
    expect(result.current).toBe(600);
    act(() => {
      jest.advanceTimersByTime(600_000);
    });
    expect(onZero).toHaveBeenCalledTimes(2);
  });

  it('RF-003-21: sin expiresAt (o inválido) devuelve null y no programa nada', () => {
    const onZero = jest.fn();
    const { result, rerender } = renderHook(({ at }) => useCountdown(at, onZero), {
      initialProps: { at: null as string | null },
    });
    expect(result.current).toBeNull();
    rerender({ at: 'no-es-fecha' });
    expect(result.current).toBeNull();
    act(() => {
      jest.advanceTimersByTime(5000);
    });
    expect(onZero).not.toHaveBeenCalled();
  });
});

describe('useServerCountdown (plan 010 §6, cuenta regresiva con serverNow)', () => {
  it('RNF-010-03: corrige un reloj del celular atrasado con la hora del servidor', () => {
    // El servidor va 5 minutos adelante: faltan 10 min, no 15.
    const { result } = renderHook(() =>
      useServerCountdown('2026-10-18T17:15:00.000Z', '2026-10-18T17:05:00.000Z'),
    );
    expect(result.current).toBe(600);
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(result.current).toBe(596);
  });

  it('RNF-010-03: corrige un reloj adelantado y avisa al llegar a 0', () => {
    const onZero = jest.fn();
    const { result } = renderHook(() =>
      useServerCountdown('2026-10-18T16:50:03.000Z', '2026-10-18T16:50:00.000Z', onZero),
    );
    expect(result.current).toBe(3);
    act(() => {
      jest.advanceTimersByTime(4000);
    });
    expect(result.current).toBe(0);
    expect(onZero).toHaveBeenCalledTimes(1);
  });

  it('RNF-010-03: sin deadlineAt no cuenta nada', () => {
    const { result } = renderHook(() => useServerCountdown(null, '2026-10-18T17:00:00.000Z'));
    expect(result.current).toBeNull();
  });

  it('RNF-010-03: un serverNow nuevo vuelve a anclar la cuenta', () => {
    const { result, rerender } = renderHook(
      ({ server }) => useServerCountdown('2026-10-18T17:10:00.000Z', server),
      {
        initialProps: { server: '2026-10-18T17:00:00.000Z' },
      },
    );
    expect(result.current).toBe(600);
    rerender({ server: '2026-10-18T17:08:00.000Z' });
    expect(result.current).toBe(120);
  });
});
