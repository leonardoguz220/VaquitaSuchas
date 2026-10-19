'use client';

import { Alert, Button } from '@/components/ui';
import { useGroupRanking } from '@/hooks/use-reputation';
import type { RankingItem, UnrankedItem } from '@/services/reputation';
import { RatingBadge } from './rating-badge';
import { REPUTATION_MESSAGES, reputationErrorMessage } from './reputation-messages';

function RankingSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">Cargando el ranking…</span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="h-20 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function streakText(streak: number): string {
  return `Racha: ${streak}`;
}

function RankedRow({ item }: { item: RankingItem }) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-surface p-3 sm:items-center sm:p-4">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft font-display text-lg font-bold text-primary-hover"
        aria-hidden="true"
      >
        {item.position}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <span className="font-bold break-words">
          <span className="sr-only">Puesto {item.position}: </span>
          {item.user.fullName}
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <RatingBadge rating={item.rating} />
          <span className="text-[15px] text-muted">{streakText(item.streak)}</span>
        </div>
      </div>
    </li>
  );
}

function UnrankedRow({ item }: { item: UnrankedItem }) {
  return (
    <li className="flex items-start gap-3 rounded-card border border-line bg-surface p-3 sm:items-center sm:p-4">
      <span
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-bg font-bold text-muted"
        aria-hidden="true"
      >
        —
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
        <span className="font-bold break-words">
          <span className="sr-only">Sin posición: </span>
          {item.user.fullName}
        </span>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <RatingBadge rating={item.rating} />
          {item.streak !== undefined && (
            <span className="text-[15px] text-muted">{streakText(item.streak)}</span>
          )}
        </div>
      </div>
    </li>
  );
}

/**
 * Pestaña **Ranking** de `/grupos/[id]` (spec 007 T026, plan §6; mockup `Ranking.dc.html`):
 * posición, nombre, nivel, estrellas y racha, en el orden que entrega la API. Los «Nuevo» van al
 * final sin posición (RF-007-09). No muestra montos ni comprobantes (RF-007-10, CA-007-11).
 */
export function GroupRankingTab({ groupId }: { groupId: string }) {
  const { status, data, error, reload } = useGroupRanking(groupId);

  return (
    <section aria-labelledby="ranking-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="ranking-title" className="font-display text-xl font-bold">
          Ranking de puntualidad
        </h2>
        <p className="text-muted">
          Ordenado por calificación de puntualidad de los últimos 12 meses. No se muestran montos ni
          comprobantes.
        </p>
      </div>

      {(status === 'loading' || status === 'redirecting') && <RankingSkeleton />}

      {status === 'error' && error && error.statusCode === 404 && (
        <Alert variant="warning" title={REPUTATION_MESSAGES.rankingNotFound}>
          Puede que ya no seas parte de este grupo.
        </Alert>
      )}

      {status === 'error' && error && error.statusCode !== 404 && (
        <Alert
          variant="error"
          title={REPUTATION_MESSAGES.rankingLoadFailed}
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {reputationErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && data && data.items.length === 0 && data.unranked.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-4 text-muted">
          Todavía nadie en el grupo tiene cobros para el ranking.
        </p>
      )}

      {status === 'success' && data && data.items.length > 0 && (
        <ol aria-label="Ranking del grupo" className="flex flex-col gap-2">
          {data.items.map((item) => (
            <RankedRow key={item.user.userId} item={item} />
          ))}
        </ol>
      )}

      {status === 'success' && data && data.unranked.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="font-bold">Sin posición todavía</h3>
          <p className="text-[15px] text-muted">
            Tienen nivel «Nuevo»: todavía no tienen cobros suficientes para una calificación.
          </p>
          <ul aria-label="Sin posición" className="flex flex-col gap-2">
            {data.unranked.map((item) => (
              <UnrankedRow key={item.user.userId} item={item} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
