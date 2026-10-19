import { cx } from '@/components/ui/cx';
import type { EarnedBadge, PendingBadge } from '@/services/reputation';
import { BADGES_MESSAGES, earnedDateText, progressPercent, progressText } from './badges-messages';

/** Estrella de 5 puntas en un cuadro de 24 × 24 (mismo trazo que la calificación). */
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z';
/** Reloj de 20 × 20, para lo que aún no se obtuvo. */
const CLOCK_PATH =
  'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm.9 3.5v4.1l2.8 2.1-1.1 1.4-3.5-2.6V5.5h1.8Z';
/** Check dentro de un círculo de 20 × 20. */
const CHECK_PATH =
  'M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm3.8 5.3 1.3 1.3-6 6-3.4-3.4 1.3-1.3 2.1 2.1 4.7-4.7Z';

/** Un ícono decorativo: el estado se dice siempre con texto, nunca solo con el ícono. */
function StatusIcon({ path, className }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={cx('size-4 shrink-0', className)}
      fill="currentColor"
    >
      <path fillRule="evenodd" d={path} />
    </svg>
  );
}

/** Insignia ya obtenida: ícono, nombre, qué la otorga y la fecha en La Paz (RF-007-07, CA-007-08). */
export function EarnedBadgeCard({ badge }: { badge: EarnedBadge }) {
  return (
    <article className="flex flex-col items-start gap-2 rounded-card border border-line bg-surface p-5 text-ink">
      <span
        aria-hidden="true"
        className="flex size-12 items-center justify-center rounded-full bg-primary text-surface"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      </span>
      <h3 className="font-display text-lg font-bold">{badge.name}</h3>
      <p className="text-[15px] text-muted">{badge.description}</p>
      <p className="mt-auto flex flex-wrap items-center gap-1.5 text-[15px] font-bold text-status-pagado-fg">
        <StatusIcon path={CHECK_PATH} />
        {BADGES_MESSAGES.earnedLabel} {earnedDateText(badge.earnedAt)}
      </p>
    </article>
  );
}

/**
 * Insignia pendiente: condición, avance «2 de 10» y barra (RF-007-07, CA-007-09). La barra es solo
 * presentación; el progreso y la condición vienen de la API.
 */
export function PendingBadgeCard({ badge }: { badge: PendingBadge }) {
  const { current, target } = badge.progress;
  const text = progressText(current, target);
  return (
    <article className="flex flex-col gap-3 rounded-card border border-dashed border-field-border bg-surface p-5 text-ink sm:flex-row sm:items-center">
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-status-cancelado-bg text-muted"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="currentColor">
          <path d={STAR_PATH} />
        </svg>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-bold">{badge.name}</h3>
          <span className="flex items-center gap-1.5 text-[15px] font-bold text-muted">
            <StatusIcon path={CLOCK_PATH} />
            {BADGES_MESSAGES.pendingStatus}: {text}
          </span>
        </div>
        <div
          role="progressbar"
          aria-label={badge.name}
          aria-valuemin={0}
          aria-valuemax={target}
          aria-valuenow={current}
          aria-valuetext={text}
          className="h-3 w-full overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-primary"
            style={{ width: `${progressPercent(current, target)}%` }}
          />
        </div>
        <p className="text-[15px] text-muted">{badge.condition}</p>
      </div>
    </article>
  );
}
