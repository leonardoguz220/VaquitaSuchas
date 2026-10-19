import { formatDateTimeLaPaz } from '@/lib/dates';
import type { ChargeEvent, PublicChargeEvent } from '@/services/charges';
import { CHARGE_EVENT_LABEL } from './charge-messages';

type TimelineEvent = PublicChargeEvent | ChargeEvent;

function reasonOf(event: TimelineEvent): string | null {
  return 'reason' in event ? event.reason : null;
}

export interface ChargeTimelineProps {
  events: TimelineEvent[];
  /** Nombre accesible de la lista, por ejemplo "Historial de este cobro". */
  label: string;
}

/**
 * Línea de tiempo de un cobro (RF-002-17, CA-002-18): evento, autor ("Sistema" si no hay
 * persona) y fecha en La Paz, en el orden que entrega la API. El motivo solo aparece en la
 * versión completa (`ChargeEvent`); la pública no lo trae (RNF-002-07). Texto plano, sin HTML.
 */
export function ChargeTimeline({ events, label }: ChargeTimelineProps) {
  if (events.length === 0) {
    return <p className="text-muted">Todavía no hay movimientos en este cobro.</p>;
  }
  return (
    <ol aria-label={label} className="flex flex-col">
      {events.map((event, index) => {
        const reason = reasonOf(event);
        return (
          <li
            key={'id' in event ? event.id : `${event.type}-${event.occurredAt}-${index}`}
            className="flex gap-3 border-l-2 border-line pb-4 pl-4 last:pb-0"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-bold">{CHARGE_EVENT_LABEL[event.type]}</span>
              <span className="text-[15px] text-muted">
                {event.actor ? event.actor.fullName : 'Sistema'} ·{' '}
                <time dateTime={event.occurredAt}>{formatDateTimeLaPaz(event.occurredAt)}</time>
              </span>
              {reason && <span className="text-[15px] break-words">Motivo: {reason}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
