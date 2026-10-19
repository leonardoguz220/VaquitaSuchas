'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, chargeStatusLabel, type ChargeStatus } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useCalendar, useUpcomingEvents } from '@/hooks/use-dashboard';
import { monthGrid, shiftPeriod, WEEKDAYS } from '@/lib/calendar-grid';
import { formatCalendarDate, formatPeriod, lapazDayOf } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath, groupPath, PANEL_PATH } from '@/lib/routes';
import type { CalendarEvent } from '@/services/reports';
import { dashboardErrorMessage, ROLE_LABEL } from './dashboard-messages';

const KIND = {
  corte: {
    icon: '◆',
    label: 'Fecha de corte',
    className: 'bg-status-en-revision-bg text-status-en-revision-fg',
  },
  vencimiento: {
    icon: '●',
    label: 'Vencimiento',
    className: 'bg-status-pendiente-bg text-status-pendiente-fg',
  },
} as const;

function eventTitle(event: CalendarEvent): string {
  if (event.kind === 'corte') return `Corte de ${event.groupName}`;
  return event.role === 'titular'
    ? `Vencen los cobros de ${event.groupName}`
    : `Vence tu cobro de ${event.groupName}`;
}

/** Rol y monto del evento (RF-006-12): «estimado» cuando el backend lo marca así. */
function eventDetail(event: CalendarEvent): string {
  return `${ROLE_LABEL[event.role]} · ${formatBs(event.amountCents)}${event.estimated ? ' (estimado)' : ''}`;
}

function eventHref(event: CalendarEvent): string {
  return event.chargeId ? chargePath(event.chargeId) : groupPath(event.groupId);
}

function isChargeStatus(status: string | null): status is ChargeStatus {
  return status !== null && status in chargeStatusLabel;
}

function currentLaPazPeriod(): string {
  return lapazDayOf(new Date()).slice(0, 7);
}

function eventsByDay(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const map = new Map<string, CalendarEvent[]>();
  for (const event of events) map.set(event.date, [...(map.get(event.date) ?? []), event]);
  return map;
}

function KindIcon({ kind }: { kind: CalendarEvent['kind'] }) {
  return (
    <span aria-hidden="true" className="font-bold">
      {KIND[kind].icon}
    </span>
  );
}

/** Evento dentro de una celda: icono y servicio (el texto completo para lectores de pantalla). */
function CellEvent({ event }: { event: CalendarEvent }) {
  const kind = KIND[event.kind];
  return (
    <li>
      <Link
        href={eventHref(event)}
        className={cx(
          'flex min-h-6 items-center gap-1 rounded px-1 text-xs leading-tight no-underline',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary',
          kind.className,
        )}
      >
        <KindIcon kind={event.kind} />
        <span aria-hidden="true" className="hidden truncate sm:inline">
          {event.serviceName}
        </span>
        <span className="sr-only">
          {kind.label}: {event.groupName}, {eventDetail(event)}
        </span>
      </Link>
    </li>
  );
}

function MonthGrid({
  month,
  events,
  today,
}: {
  month: string;
  events: CalendarEvent[];
  today: string;
}) {
  const byDay = eventsByDay(events);
  return (
    <table className="w-full table-fixed border-separate border-spacing-1">
      <caption className="sr-only">Calendario de {formatPeriod(month)}</caption>
      <thead>
        <tr>
          {WEEKDAYS.map((day) => (
            <th key={day.short} scope="col" className="pb-1 text-[15px] font-bold text-muted">
              <abbr title={day.long} className="no-underline">
                {day.short}
              </abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {monthGrid(month).map((week, index) => (
          <tr key={index}>
            {week.map((day, dayIndex) => {
              if (!day) return <td key={`empty-${dayIndex}`} aria-hidden="true" />;
              const dayEvents = byDay.get(day) ?? [];
              const isToday = day === today;
              return (
                <td
                  key={day}
                  aria-current={isToday ? 'date' : undefined}
                  className={cx(
                    'h-16 rounded-field p-1 align-top sm:h-24',
                    isToday
                      ? 'border-2 border-primary bg-primary-soft'
                      : 'border border-line bg-surface',
                  )}
                >
                  <span className={cx('text-[15px]', isToday && 'font-bold')}>
                    {Number(day.slice(8))}
                    {isToday && <span className="sr-only"> (hoy)</span>}
                  </span>
                  {dayEvents.length > 0 && (
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {dayEvents.map((event) => (
                        <CellEvent
                          key={`${event.kind}-${event.groupId}-${event.chargeId ?? ''}`}
                          event={event}
                        />
                      ))}
                    </ul>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Fila de una lista de eventos: fecha, título, rol y monto, estado si hay cobro. */
function EventRow({ event }: { event: CalendarEvent }) {
  const kind = KIND[event.kind];
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-surface p-3 sm:p-4">
      <span
        className={cx(
          'flex min-w-14 flex-col items-center rounded-field px-2 py-1 text-center',
          kind.className,
        )}
      >
        <KindIcon kind={event.kind} />
        <span className="text-[15px] font-bold">{formatCalendarDate(event.date)}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={eventHref(event)}
          className="inline-flex min-h-11 items-center font-bold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {eventTitle(event)}
        </Link>
        <span className="text-[15px] text-muted">
          {kind.label} · {eventDetail(event)}
        </span>
        {isChargeStatus(event.status) && <Badge variant={event.status} className="self-start" />}
      </div>
    </li>
  );
}

function Upcoming() {
  const { status, data, error, reload } = useUpcomingEvents();
  return (
    <section aria-labelledby="upcoming-title" className="flex flex-col gap-3">
      <h2 id="upcoming-title" className="font-display text-xl font-bold">
        Próximos 30 días
      </h2>
      {(status === 'loading' || status === 'redirecting') && (
        <p role="status" className="rounded-card border border-line bg-surface p-4 text-muted">
          Cargando los próximos eventos…
        </p>
      )}
      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar los próximos eventos."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {dashboardErrorMessage(error)}
        </Alert>
      )}
      {status === 'success' && data && data.events.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-4 text-muted">
          No tienes cortes ni vencimientos en los próximos 30 días.
        </p>
      )}
      {status === 'success' && data && data.events.length > 0 && (
        <ul aria-label="Próximos 30 días" className="flex flex-col gap-2">
          {data.events.map((event) => (
            <EventRow
              key={`${event.date}-${event.kind}-${event.groupId}-${event.chargeId ?? ''}`}
              event={event}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const navButton =
  'inline-flex min-h-11 min-w-11 items-center justify-center rounded-field border-[1.5px] border-field-border bg-surface px-3 text-ink hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

/**
 * `/panel/calendario` (spec 006 T022, plan §6; mockup `Calendario.dc.html`): cuadrícula del mes
 * con los cortes (◆) y vencimientos (●) que entrega la API, en texto e icono además del color,
 * y la lista «Próximos 30 días» con rol y monto («estimado» cuando corresponde). Las fechas
 * (incluido el día 31 en meses cortos, CA-006-13) vienen calculadas del backend. En el celular
 * las celdas muestran solo los iconos y la lista del mes debajo da el detalle.
 */
export function CalendarView() {
  const [month, setMonth] = useState<string | null>(null);
  const { status, data, error, reload } = useCalendar(month);
  const shown = month ?? data?.month ?? currentLaPazPeriod();
  const today = lapazDayOf(new Date());

  return (
    <>
      <Link
        href={PANEL_PATH}
        className="inline-flex min-h-11 items-center gap-1 self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <span aria-hidden="true">←</span> Volver al panel
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Calendario
        </h1>
        <p className="text-muted">Tus fechas de corte y los vencimientos de tus cobros.</p>
      </div>

      <section
        aria-labelledby="calendar-month-title"
        className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 sm:p-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={navButton}
              aria-label="Mes anterior"
              onClick={() => setMonth(shiftPeriod(shown, -1))}
            >
              <span aria-hidden="true">‹</span>
            </button>
            <h2
              id="calendar-month-title"
              aria-live="polite"
              className="min-w-40 text-center font-display text-xl font-bold"
            >
              {formatPeriod(shown)}
            </h2>
            <button
              type="button"
              className={navButton}
              aria-label="Mes siguiente"
              onClick={() => setMonth(shiftPeriod(shown, 1))}
            >
              <span aria-hidden="true">›</span>
            </button>
          </div>
          <ul aria-label="Leyenda" className="flex flex-wrap gap-2 text-[15px]">
            {(['corte', 'vencimiento'] as const).map((kind) => (
              <li
                key={kind}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-3 py-1',
                  KIND[kind].className,
                )}
              >
                <KindIcon kind={kind} />
                {KIND[kind].label}
              </li>
            ))}
          </ul>
        </div>

        {(status === 'loading' || status === 'redirecting') && (
          <div role="status" aria-busy="true">
            <span className="sr-only">Cargando el calendario…</span>
            <div
              aria-hidden="true"
              className="h-80 animate-pulse rounded-field bg-line motion-reduce:animate-none"
            />
          </div>
        )}

        {status === 'error' && error && (
          <Alert
            variant="error"
            title="No pudimos cargar el calendario."
            action={
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            }
          >
            {dashboardErrorMessage(error)}
          </Alert>
        )}

        {status === 'success' && data && (
          <>
            <MonthGrid month={shown} events={data.events} today={today} />
            {data.events.length === 0 ? (
              <p className="text-muted">No hay cortes ni vencimientos en {formatPeriod(shown)}.</p>
            ) : (
              <div className="flex flex-col gap-2 sm:hidden">
                <h3 className="font-bold">Eventos de {formatPeriod(shown)}</h3>
                <ul
                  aria-label={`Eventos de ${formatPeriod(shown)}`}
                  className="flex flex-col gap-2"
                >
                  {data.events.map((event) => (
                    <EventRow
                      key={`${event.date}-${event.kind}-${event.groupId}-${event.chargeId ?? ''}`}
                      event={event}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </section>

      <Upcoming />
    </>
  );
}
