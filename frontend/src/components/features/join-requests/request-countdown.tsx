'use client';

import { useServerCountdown } from '@/hooks/use-countdown';
import { formatClock, formatTimeLeft } from '@/lib/dates';
import type { JoinRequestPhase } from '@/services/join-requests';
import { JOIN_MESSAGES } from './join-messages';

/**
 * Tiempo restante con el formato del plan 010 §6: `mm:ss` para los plazos de minutos (pago y
 * decisión) y «Faltan N h» para el de 24 h de una solicitud abierta.
 */
export function formatPhaseTime(kind: JoinRequestPhase['deadlineKind'], seconds: number): string {
  return kind === 'solicitud' ? formatTimeLeft(seconds) : formatClock(seconds);
}

export interface RequestCountdownProps {
  phase: JoinRequestPhase;
  /** Al llegar a 0 se vuelve a pedir la solicitud: el servidor decide el estado. */
  onEnd?: () => void;
  /** Texto antes del reloj de minutos, por ejemplo «Quedan». */
  prefix?: string;
  className?: string;
}

/**
 * Cuenta regresiva del plazo vigente (`phase.deadlineAt`), corregida con `phase.serverNow`
 * (RNF-010-03). Solo muestra el tiempo; llegar a 0 no vence nada en el cliente. El reloj no se
 * anuncia en cada segundo.
 */
export function RequestCountdown({ phase, onEnd, prefix, className }: RequestCountdownProps) {
  const remaining = useServerCountdown(phase.deadlineAt, phase.serverNow, onEnd);
  if (remaining === null) return null;
  if (remaining === 0) {
    return (
      <span aria-live="polite" className={className}>
        {JOIN_MESSAGES.checkingDeadline}
      </span>
    );
  }
  const time = formatPhaseTime(phase.deadlineKind, remaining);
  return (
    <span role="timer" aria-live="off" className={className}>
      {prefix && phase.deadlineKind !== 'solicitud' ? `${prefix} ` : ''}
      <span className="tabular-nums">{time}</span>
    </span>
  );
}
