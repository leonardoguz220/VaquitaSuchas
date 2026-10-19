'use client';

import { GroupLoadError } from '@/components/features/groups/group-load-error';
import { Alert, Card } from '@/components/ui';
import { useGroupRanking } from '@/hooks/use-group-ranking';
import type { ApiError } from '@/services/http';
import type { GroupRanking, RankingItem, RankingUnranked } from '@/services/reputation';
import { RatingBadge } from './rating-badge';
import { RANKING_MESSAGES, rankingPositionLabel, streakLabel } from './ranking-messages';

export interface GroupRankingTabProps {
  groupId: string;
}

function RankingSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{RANKING_MESSAGES.loading}</span>
      {[0, 1, 2].map((row) => (
        <div
          key={row}
          aria-hidden="true"
          className="h-16 w-full animate-pulse rounded-card bg-line motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/** Fila de un miembro con posición: el número, el nombre, la calificación y la racha. */
function RankedRow({ item }: { item: RankingItem }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
      <span className="w-10 font-display text-2xl font-bold text-muted">
        <span className="sr-only">{rankingPositionLabel(item.position)}: </span>
        {item.position}
      </span>
      <span className="min-w-0 flex-1 basis-40 font-bold break-words">{item.user.fullName}</span>
      <RatingBadge rating={item.rating} />
      <span className="text-[15px] text-muted">{streakLabel(item.streak)}</span>
    </li>
  );
}

/** Miembro «Nuevo»: sin posición ni racha, solo nombre y nivel. */
function UnrankedRow({ entry }: { entry: RankingUnranked }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
      <span className="min-w-0 flex-1 basis-40 font-bold break-words">{entry.user.fullName}</span>
      <RatingBadge rating={entry.rating} />
    </li>
  );
}

function RankingView({ ranking }: { ranking: GroupRanking }) {
  return (
    <div className="flex flex-col gap-6">
      <p className="text-[15px] text-muted">{RANKING_MESSAGES.intro}</p>

      {ranking.items.length === 0 ? (
        <Card as="section" aria-label="Ranking del grupo">
          <p className="text-muted">{RANKING_MESSAGES.empty}</p>
        </Card>
      ) : (
        <ol
          aria-label="Ranking del grupo"
          className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
        >
          {ranking.items.map((item) => (
            <RankedRow key={item.user.userId} item={item} />
          ))}
        </ol>
      )}

      {ranking.unranked.length > 0 && (
        <section aria-labelledby="ranking-unranked" className="flex flex-col gap-3">
          <h2 id="ranking-unranked" className="font-display text-xl font-bold">
            {RANKING_MESSAGES.unrankedTitle}
          </h2>
          <p className="text-[15px] text-muted">{RANKING_MESSAGES.unrankedHint}</p>
          <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {ranking.unranked.map((entry) => (
              <UnrankedRow key={entry.user.userId} entry={entry} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RankingError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  if (error.statusCode === 404) {
    return (
      <Alert variant="error" title={RANKING_MESSAGES.notFoundTitle}>
        {RANKING_MESSAGES.notFound}
      </Alert>
    );
  }
  if (error.statusCode === 403) {
    return (
      <Alert variant="error" title={RANKING_MESSAGES.notMemberTitle}>
        {RANKING_MESSAGES.notMember}
      </Alert>
    );
  }
  return <GroupLoadError error={error} what="el ranking" onRetry={onRetry} />;
}

/**
 * Pestaña Ranking de `/grupos/[id]` (spec 007, RF-007-09 a 11; mockup `Ranking.dc.html`). Muestra el
 * orden que entrega `GET /groups/:groupId/ranking` sin reordenar; los «Nuevo» van al final sin
 * posición. No hay montos ni comprobantes (CA-007-12).
 */
export function GroupRankingTab({ groupId }: GroupRankingTabProps) {
  const { status, data, error, reload } = useGroupRanking(groupId);

  if (status === 'success' && data) return <RankingView ranking={data} />;
  if (status === 'redirecting') {
    return (
      <p role="status" className="text-muted">
        {RANKING_MESSAGES.redirecting}
      </p>
    );
  }
  if (status === 'error' && error) return <RankingError error={error} onRetry={reload} />;
  return <RankingSkeleton />;
}
