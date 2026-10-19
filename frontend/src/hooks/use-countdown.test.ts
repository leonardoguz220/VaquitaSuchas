import { act, renderHook } from '@testing-library/react';
import { useCountdown } from './use-countdown';

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
