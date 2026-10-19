'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

function secondsUntil(target: number): number {
  return Math.max(0, Math.ceil((target - Date.now()) / 1000));
}

function parseTarget(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const time = Date.parse(expiresAt);
  return Number.isNaN(time) ? null : time;
}

/**
 * Segundos que faltan hasta `expiresAt` (ISO 8601 que entrega la API), actualizados cada
 * segundo; `null` si no hay fecha. Solo sirve para mostrar el tiempo: al llegar a 0 llama a
 * `onZero` una vez por fecha y deja de contar; quien lo usa vuelve a preguntar al servidor,
 * que es quien decide si el enlace venció.
 */
export function useCountdown(expiresAt: string | null, onZero?: () => void): number | null {
  const target = parseTarget(expiresAt);
  const [, setTick] = useState(0);
  const onZeroRef = useRef(onZero);

  useEffect(() => {
    onZeroRef.current = onZero;
  }, [onZero]);

  useEffect(() => {
    if (target === null) return;
    const interval = setInterval(() => {
      // Fuerza un nuevo render para recalcular los segundos con la hora actual.
      setTick((value) => value + 1);
      if (secondsUntil(target) === 0) {
        clearInterval(interval);
        onZeroRef.current?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [target]);

  return target === null ? null : secondsUntil(target);
}

function clientNow(): number {
  return Date.now();
}

/**
 * Igual que `useCountdown`, pero corrige el reloj del celular con `serverNow` (plan 010 §6): el
 * plazo se cuenta como `deadlineAt − serverNow` desde que llegó la respuesta, así un reloj
 * adelantado o atrasado no cambia lo que se muestra. Cada `serverNow` nuevo vuelve a anclar la
 * cuenta. Solo muestra el tiempo: al llegar a 0 llama a `onZero` y el servidor decide el estado.
 */
export function useServerCountdown(
  deadlineAt: string | null,
  serverNow: string | null,
  onZero?: () => void,
): number | null {
  const [anchor, setAnchor] = useState(() => ({ serverNow, receivedAt: clientNow() }));
  if (anchor.serverNow !== serverNow) {
    // Estado derivado de la respuesta anterior: se ancla de nuevo en el mismo render.
    setAnchor({ serverNow, receivedAt: clientNow() });
  }
  const localDeadline = useMemo(() => {
    const deadline = parseTarget(deadlineAt);
    if (deadline === null) return null;
    const server = parseTarget(anchor.serverNow);
    const skew = server === null ? 0 : server - anchor.receivedAt;
    return new Date(deadline - skew).toISOString();
  }, [deadlineAt, anchor]);
  return useCountdown(localDeadline, onZero);
}
