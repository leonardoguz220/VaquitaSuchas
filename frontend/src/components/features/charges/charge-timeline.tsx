import { Card } from '@/components/ui';
import { formatDateTimeLaPaz } from '@/lib/dates';
import type { ChargeEvent } from '@/services/charges';
import { eventLabel } from './charge-labels';

/**
 * Línea de tiempo del cobro (CA-002-18): evento, autor («Sistema» si la API no trae actor) y
 * fecha en La Paz, en el orden que entrega la API.
 */
export function ChargeTimeline({ events }: { events: ChargeEvent[] }) {
  return (
    <Card as="section" aria-labelledby="charge-timeline" className="flex flex-col gap-4">
      <h2 id="charge-timeline" className="font-display text-xl font-bold">
        Historial de este cobro
      </h2>
      {events.length === 0 ? (
        <p className="text-muted">Todavía no hay movimientos.</p>
      ) : (
        <ol
          aria-label="Línea de tiempo"
          className="flex flex-col gap-4 border-l-2 border-line pl-4"
        >
          {events.map((event) => (
            <li key={event.id} className="relative flex flex-col gap-0.5">
              <span
                aria-hidden="true"
                className="absolute top-1.5 -left-[23px] size-3 rounded-full border-2 border-surface bg-primary"
              />
              <span className="font-bold">{eventLabel(event.type)}</span>
              <span className="text-[15px] text-muted">
                {event.actor ? event.actor.fullName : 'Sistema'} ·{' '}
                <time dateTime={event.occurredAt}>{formatDateTimeLaPaz(event.occurredAt)}</time>
              </span>
              {event.reason && (
                <span className="text-[15px] break-words">{`Motivo: ${event.reason}`}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
