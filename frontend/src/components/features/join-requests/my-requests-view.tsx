'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { RatingBadge } from '@/components/features/reputation/rating-badge';
import { Alert, Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useMyJoinRequests, type MyRequestsScope } from '@/hooks/use-join-requests';
import { formatBs } from '@/lib/money';
import { JOIN_PATH, requestPath } from '@/lib/routes';
import { FINAL_JOIN_STATUSES, type JoinRequest } from '@/services/join-requests';
import {
  finalReasonText,
  JOIN_MESSAGES,
  joinErrorMessage,
  opensAtText,
  personRating,
  ratingText,
} from './join-messages';
import { JoinStatusBadge } from './join-status-badge';
import { RequestCountdown } from './request-countdown';

const SCOPES: Array<{ value: MyRequestsScope; label: string }> = [
  { value: 'activas', label: 'Activas' },
  { value: 'historial', label: 'Historial' },
];

function RequestsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando tus solicitudes…</span>
      {[0, 1].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex h-28 items-center gap-4 rounded-card border border-line bg-surface p-5"
        >
          <div className="size-12 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 flex-1 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/** Monto de la tarjeta: la cuota fijada si ya hay cotización; si no, la estimada (RF-010-03). */
function amountOf(request: JoinRequest): { cents: number; label: string } {
  if (request.quote) {
    return {
      cents: request.quote.amountCents,
      label: request.phase.status === 'aceptada' ? 'Pagado al ingresar' : 'Cuota de ingreso fijada',
    };
  }
  return { cents: request.estimatedShareCents, label: 'Cuota estimada' };
}

/**
 * Tarjeta de una solicitud (mockup `Solicitudes.dc.html`): grupo, estado con color y texto,
 * titular con su calificación, cuota, plazo vigente con cuenta regresiva, mensajes no leídos y,
 * si la ventana del grupo está cerrada, la fecha en que se abre (RF-010-26). Todo sale de la API.
 */
function RequestCard({ request, onDeadline }: { request: JoinRequest; onDeadline: () => void }) {
  const { group, phase } = request;
  const hostRating = personRating(request.host);
  const amount = amountOf(request);
  const reason = finalReasonText(request.finalReason);
  const isFinal = FINAL_JOIN_STATUSES.includes(phase.status);
  return (
    <Link
      href={requestPath(request.id)}
      className={cx(
        'flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-ink no-underline sm:p-5',
        'transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <div className="flex flex-wrap items-start gap-3">
        <ServiceLogo
          name={group.serviceName}
          logoUrl={group.logoUrl}
          brandColor={group.brandColor}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-lg font-bold">{group.name}</span>
            <JoinStatusBadge status={phase.status} />
          </div>
          <span className="text-[15px] text-muted">Titular: {request.host.fullName}</span>
          {hostRating ? (
            <RatingBadge rating={hostRating} />
          ) : (
            <span className="text-[15px] text-muted">{ratingText(request.host)}</span>
          )}
        </div>
        <div className="flex flex-col items-end">
          <span className="font-display text-xl font-bold">{formatBs(amount.cents)}</span>
          <span className="text-[15px] text-muted">{amount.label}</span>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
        {phase.deadlineAt ? (
          <RequestCountdown
            phase={phase}
            prefix="Quedan"
            onEnd={onDeadline}
            className="font-bold"
          />
        ) : (
          <span className="text-muted">
            {reason ?? (isFinal ? JOIN_MESSAGES.readOnlyChat : '')}
          </span>
        )}
        {request.unreadCount > 0 && (
          <span className="rounded-full bg-primary px-3 py-1 font-bold text-white">
            {request.unreadCount === 1
              ? '1 mensaje nuevo'
              : `${request.unreadCount} mensajes nuevos`}
          </span>
        )}
      </div>
      {!request.entryWindow.isOpen && request.entryWindow.opensAt && (
        <p className="text-[15px]">{opensAtText(request.entryWindow.opensAt)}</p>
      )}
    </Link>
  );
}

/**
 * "Mis solicitudes" `/solicitudes` (spec 010 T017, plan §6; mockup `Solicitudes.dc.html`): las
 * solicitudes de ingreso de la persona, con filtro activas/historial aplicado por la API
 * (`GET /join-requests`). Al llegar a 0 un plazo se vuelve a pedir la lista: el servidor decide
 * el estado (CA-010-09). Cubre cargando, vacío, error y con datos.
 */
export function MyRequestsView() {
  const [scope, setScope] = useState<MyRequestsScope>('activas');
  const { status, error, reload, refresh, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useMyJoinRequests(scope);

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
            Mis solicitudes
          </h1>
          <p className="text-muted">Tus pedidos para entrar a un grupo y su chat con el titular.</p>
        </div>
        <Button href={JOIN_PATH} variant="secondary">
          Unirme con un código
        </Button>
      </div>

      <div role="group" aria-label="Filtrar solicitudes" className="flex flex-wrap gap-2">
        {SCOPES.map((item) => {
          const pressed = item.value === scope;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={pressed}
              onClick={() => setScope(item.value)}
              className={cx(
                'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-body',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                pressed
                  ? 'border-ink bg-ink font-bold text-white'
                  : 'border-field-border bg-surface text-ink hover:border-ink',
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {(status === 'loading' || status === 'redirecting') && <RequestsSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar tus solicitudes."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {joinErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && (
        <section
          aria-labelledby="requests-empty-title"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="requests-empty-title" className="font-display text-xl font-bold">
            {scope === 'activas' ? 'No tienes solicitudes activas' : 'Tu historial está vacío'}
          </h2>
          <p className="text-muted">
            {scope === 'activas'
              ? 'Pide el código de invitación al titular de un grupo y abre una solicitud.'
              : 'Aquí verás las solicitudes aceptadas, rechazadas, canceladas o expiradas.'}
          </p>
          {scope === 'activas' && (
            <Button href={JOIN_PATH} className="sm:self-start">
              Unirme con un código
            </Button>
          )}
        </section>
      )}

      {status === 'success' && items.length > 0 && (
        <ul aria-label="Tus solicitudes" className="flex flex-col gap-3">
          {items.map((request) => (
            <li key={request.id}>
              <RequestCard request={request} onDeadline={() => void refresh()} />
            </li>
          ))}
        </ul>
      )}

      {status === 'success' && loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más solicitudes.">
          {joinErrorMessage(loadMoreError)}
        </Alert>
      )}

      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          Ver más solicitudes
        </Button>
      )}
    </>
  );
}
