import { formatDateTimeLaPaz } from '@/lib/dates';
import type { JoinTimelineEvent } from '@/services/join-requests';
import { JOIN_EVENT_LABEL } from './join-messages';

/**
 * Línea de tiempo de la solicitud (RF-010-27, CA-010-35), colapsable: tipo, autor («Sistema» si
 * no hay persona), fecha en La Paz y motivo, en el orden que entrega la API. Texto plano.
 */
export function RequestTimeline({ events }: { events: JoinTimelineEvent[] }) {
  return (
    <details className="group rounded-card border border-line bg-surface p-4 sm:p-6">
      <summary className="flex min-h-11 cursor-pointer items-center font-display text-xl font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
        Línea de tiempo ({events.length})
      </summary>
      <ol aria-label="Línea de tiempo de la solicitud" className="mt-3 flex flex-col">
        {events.map((event, index) => (
          <li
            key={`${event.type}-${event.occurredAt}-${index}`}
            className="flex flex-col gap-0.5 border-l-2 border-line pb-4 pl-4 last:pb-0"
          >
            <span className="font-bold">{JOIN_EVENT_LABEL[event.type] ?? event.type}</span>
            <span className="text-[15px] text-muted">
              {event.actor ? event.actor.fullName : 'Sistema'} ·{' '}
              <time dateTime={event.occurredAt}>{formatDateTimeLaPaz(event.occurredAt)}</time>
            </span>
            {event.reason && (
              <span className="text-[15px] break-words">Motivo: {event.reason}</span>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
