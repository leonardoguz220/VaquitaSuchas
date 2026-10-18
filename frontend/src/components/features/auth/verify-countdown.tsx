'use client';

import { useCountdown } from '@/hooks/use-countdown';
import { formatMinutesSeconds } from '@/lib/telegram-link';

export const COUNTDOWN_MESSAGES = {
  oneMinute: 'Queda menos de 1 minuto para que venza el enlace.',
  checking: 'Se acabó el tiempo del enlace. Comprobando…',
} as const;

export interface VerifyCountdownProps {
  /** ISO 8601 que entrega la API. */
  expiresAt: string;
  /** Al llegar a 0: quien lo usa pregunta al servidor si el enlace venció. */
  onEnd?: () => void;
}

function milestone(remaining: number): string {
  if (remaining === 0) return COUNTDOWN_MESSAGES.checking;
  if (remaining <= 60) return COUNTDOWN_MESSAGES.oneMinute;
  return '';
}

/**
 * Cuenta regresiva del enlace (RF-003-21). El reloj visible no se anuncia (`role="timer"`, sin
 * región viva); solo se anuncian los hitos: al quedar 1 minuto y al llegar a 0. Llegar a 0 no
 * declara vencido el enlace: eso lo decide el servidor.
 */
export function VerifyCountdown({ expiresAt, onEnd }: VerifyCountdownProps) {
  const remaining = useCountdown(expiresAt, onEnd);
  if (remaining === null) return null;

  return (
    <>
      <p className="text-[15px] text-muted">
        {remaining > 0 ? (
          <>
            El enlace vence en{' '}
            <strong role="timer" aria-live="off" className="text-ink tabular-nums">
              {formatMinutesSeconds(remaining)}
            </strong>
            .
          </>
        ) : (
          <>Comprobando si el enlace sigue vigente…</>
        )}
      </p>
      <p className="sr-only" aria-live="polite">
        {milestone(remaining)}
      </p>
    </>
  );
}
