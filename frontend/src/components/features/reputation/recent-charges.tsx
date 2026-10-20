import { Badge, Card } from '@/components/ui';
import type { RecentCharge } from '@/services/reputation';
import {
  dueText,
  periodText,
  RECENT_RESULT_LABEL,
  RECENT_RESULT_TONE,
  REPUTATION_MESSAGES,
} from './reputation-messages';

function RecentItem({ charge }: { charge: RecentCharge }) {
  return (
    <li className="flex flex-col gap-2 border-t border-line py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">{charge.groupName}</span>
        <Badge variant={RECENT_RESULT_TONE[charge.result]}>
          {RECENT_RESULT_LABEL[charge.result]}
        </Badge>
      </div>
      <span className="text-[15px] text-muted">
        {charge.serviceName} · {periodText(charge.period)} · {REPUTATION_MESSAGES.dueLabel}{' '}
        {dueText(charge.dueAt)}
      </span>
      {!charge.countsForRating && <Badge variant="neutral">{REPUTATION_MESSAGES.notCounted}</Badge>}
    </li>
  );
}

/**
 * Últimos cobros con su resultado (puntual o tardío) y su vencimiento (RF-007-03, CA-007-22). Los
 * de ingreso aparecen con «No cuenta para tu calificación» y no suman a las estrellas.
 */
export function RecentCharges({ charges }: { charges: RecentCharge[] }) {
  return (
    <Card as="section" aria-labelledby="recent-title" className="flex flex-col gap-3">
      <h2 id="recent-title" className="font-display text-xl font-bold">
        {REPUTATION_MESSAGES.recentTitle}
      </h2>
      {charges.length === 0 ? (
        <p className="text-muted">{REPUTATION_MESSAGES.recentEmpty}</p>
      ) : (
        <ul aria-label={REPUTATION_MESSAGES.recentTitle} className="flex flex-col">
          {charges.map((charge) => (
            <RecentItem key={charge.chargeId} charge={charge} />
          ))}
        </ul>
      )}
    </Card>
  );
}
