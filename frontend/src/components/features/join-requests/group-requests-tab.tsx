'use client';

import Link from 'next/link';
import { RatingBadge } from '@/components/features/reputation/rating-badge';
import { Alert, Button, Card } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useGroupJoinRequests } from '@/hooks/use-join-requests';
import { requestPath } from '@/lib/routes';
import type { GroupJoinRequestsPage, JoinRequest } from '@/services/join-requests';
import { joinErrorMessage, opensAtText, personRating, ratingText } from './join-messages';
import { JoinStatusBadge } from './join-status-badge';
import { RequestCountdown } from './request-countdown';

export const GROUP_REQUESTS_MESSAGES = {
  empty: 'Todavía no hay solicitudes para este grupo.',
  loading: 'Cargando las solicitudes del grupo…',
  loadMore: 'Ver más solicitudes',
} as const;

function SlotsSummary({ slots }: { slots: GroupJoinRequestsPage['slots'] }) {
  const items: Array<[string, number]> = [
    ['Cupos', slots.total],
    ['Miembros', slots.members],
    ['Reservados', slots.reserved],
    ['Disponibles', slots.available],
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map(([term, value]) => (
        <div key={term} className="flex flex-col rounded-field bg-bg p-3">
          <dt className="text-[15px] text-muted">{term}</dt>
          <dd className="font-display text-2xl font-bold tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Una solicitud de la cola: solicitante, calificación, estado y plazo, todo de la API. */
function HostRequestCard({
  request,
  onDeadline,
}: {
  request: JoinRequest;
  onDeadline: () => void;
}) {
  const { applicant, phase, entryWindow } = request;
  const applicantRating = personRating(applicant);
  return (
    <Link
      href={requestPath(request.id)}
      className={cx(
        'flex flex-col gap-2 rounded-card border border-line bg-surface p-4 text-ink no-underline sm:p-5',
        'transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-bold break-words">{applicant.fullName}</span>
        <JoinStatusBadge status={phase.status} />
      </div>
      {applicantRating ? (
        <RatingBadge rating={applicantRating} />
      ) : (
        <span className="text-[15px] text-muted">{ratingText(applicant)}</span>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[15px]">
        {phase.deadlineAt ? (
          <RequestCountdown
            phase={phase}
            prefix="Quedan"
            onEnd={onDeadline}
            className="font-bold"
          />
        ) : (
          <span className="text-muted">Sin plazo activo</span>
        )}
        {request.unreadCount > 0 && (
          <span className="rounded-full bg-primary px-3 py-1 font-bold text-white">
            {request.unreadCount === 1
              ? '1 mensaje nuevo'
              : `${request.unreadCount} mensajes nuevos`}
          </span>
        )}
      </div>
      {!entryWindow.isOpen && entryWindow.opensAt && (
        <p className="text-[15px]">{opensAtText(entryWindow.opensAt)}</p>
      )}
    </Link>
  );
}

/**
 * Pestaña Solicitudes del titular en `/grupos/[id]` (spec 010 T018, RF-010-26): cupos del grupo y
 * la cola de solicitudes, de la más antigua a la más reciente (`GET /groups/:id/join-requests`).
 * Cubre cargando, vacío, error y con datos; al llegar a 0 un plazo se vuelve a pedir la cola.
 */
export function GroupRequestsTab({ groupId }: { groupId: string }) {
  const {
    status,
    error,
    reload,
    refresh,
    firstPage,
    items,
    hasMore,
    loadMore,
    isLoadingMore,
    loadMoreError,
  } = useGroupJoinRequests(groupId);

  if (status === 'loading' || status === 'redirecting') {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{GROUP_REQUESTS_MESSAGES.loading}</span>
        <div
          aria-hidden="true"
          className="h-24 animate-pulse rounded-card bg-line motion-reduce:animate-none"
        />
        <div
          aria-hidden="true"
          className="h-28 animate-pulse rounded-card bg-line motion-reduce:animate-none"
        />
      </div>
    );
  }

  if (status === 'error' && error) {
    return (
      <Alert
        variant="error"
        title="No pudimos cargar las solicitudes."
        action={
          <Button variant="secondary" onClick={reload}>
            Reintentar
          </Button>
        }
      >
        {joinErrorMessage(error)}
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {firstPage && <SlotsSummary slots={firstPage.slots} />}
      {items.length === 0 ? (
        <Card as="section" className="text-muted">
          {GROUP_REQUESTS_MESSAGES.empty}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((request) => (
            <li key={request.id}>
              <HostRequestCard request={request} onDeadline={() => void refresh()} />
            </li>
          ))}
        </ul>
      )}
      {loadMoreError && <Alert variant="error">{joinErrorMessage(loadMoreError)}</Alert>}
      {hasMore && (
        <Button variant="secondary" loading={isLoadingMore} onClick={() => void loadMore()}>
          {GROUP_REQUESTS_MESSAGES.loadMore}
        </Button>
      )}
    </div>
  );
}
