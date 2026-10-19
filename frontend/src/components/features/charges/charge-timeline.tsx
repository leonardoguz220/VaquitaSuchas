import { Card } from '@/components/ui';
import { formatDateTimeLaPaz } from '@/lib/dates';
import type { ChargeEvent, ChargePublicEvent } from '@/services/charges';
import { eventLabel } from './charge-labels';

export interface TimelineListProps {
  events: readonly (ChargePublicEvent | ChargeEvent)[];
  /** Muestra el motivo si el evento lo trae (detalle del cobro); el historial público no. */
  showReasons?: boolean;
  label?: string;
}

/**
 * Lista de eventos del cobro (CA-002-18): evento, autor («Sistema» si la API no trae actor) y
 * fecha en La Paz, en el orden que entrega la API.
 */
export function TimelineList({
  events,
  showReasons = false,
  label = 'Línea de tiempo',
}: TimelineListProps) {
  return (
    <ol aria-label={label} className="flex flex-col gap-4 border-l-2 border-line pl-4">
      {events.map((event, index) => {
        const reason = showReasons && 'reason' in event ? event.reason : null;
        return (
          <li
            key={'id' in event ? event.id : `${index}-${event.type}-${event.occurredAt}`}
            className="relative flex flex-col gap-0.5"
          >
            <span
              aria-hidden="true"
              className="absolute top-1.5 -left-[23px] size-3 rounded-full border-2 border-surface bg-primary"
            />
            <span className="font-bold">{eventLabel(event.type)}</span>
            <span className="text-[15px] text-muted">
              {event.actor ? event.actor.fullName : 'Sistema'} ·{' '}
              <time dateTime={event.occurredAt}>{formatDateTimeLaPaz(event.occurredAt)}</time>
            </span>
            {reason && <span className="text-[15px] break-words">{`Motivo: ${reason}`}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Tarjeta con la línea de tiempo del detalle de un cobro, con motivos. */
export function ChargeTimeline({ events }: { events: ChargeEvent[] }) {
  return (
    <Card as="section" aria-labelledby="charge-timeline" className="flex flex-col gap-4">
      <h2 id="charge-timeline" className="font-display text-xl font-bold">
        Historial de este cobro
      </h2>
      {events.length === 0 ? (
        <p className="text-muted">Todavía no hay movimientos.</p>
      ) : (
        <TimelineList events={events} showReasons />
      )}
    </Card>
  );
}
