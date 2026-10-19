'use client';

import { useCountdown } from '@/hooks/use-countdown';
import { formatTimeLeft } from '@/lib/dates';
import { CHARGE_MESSAGES } from './charge-messages';

export interface ChargeCountdownProps {
  /** `dueAt` del cobro, tal como lo entrega la API. */
  dueAt: string;
  /** Al llegar a 0 se vuelve a pedir el cobro: el servidor decide si pasó a `atrasado`. */
  onEnd?: () => void;
}

/**
 * Cuenta regresiva hasta el `dueAt` que entrega la API (plan 002 §6). Solo muestra el tiempo:
 * llegar a 0 no marca el cobro como atrasado. El reloj no se anuncia en cada segundo.
 */
export function ChargeCountdown({ dueAt, onEnd }: ChargeCountdownProps) {
  const remaining = useCountdown(dueAt, onEnd);
  if (remaining === null) return null;
  return (
    <p className="font-bold">
      {remaining > 0 ? (
        <span role="timer" aria-live="off" className="tabular-nums">
          {formatTimeLeft(remaining)}.
        </span>
      ) : (
        <span aria-live="polite">{CHARGE_MESSAGES.checkingDue}</span>
      )}
    </p>
  );
}
