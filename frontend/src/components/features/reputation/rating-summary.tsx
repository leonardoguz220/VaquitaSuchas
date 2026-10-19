import { Card } from '@/components/ui';
import type { ReputationDetail } from '@/services/reputation';
import { RatingBadge } from './rating-badge';
import { chargesMissingForRating, REPUTATION_MESSAGES } from './reputation-messages';

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-field bg-bg p-3 sm:p-4">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="font-display text-2xl font-bold">{value}</dd>
    </div>
  );
}

/**
 * Tarjeta con la calificación (estrellas, valor y nivel), cuántos cobros faltan si es «Nuevo» y el
 * detalle de los cobros considerados (RF-007-01, RF-007-02, RF-007-03). Muestra los números tal
 * como llegan de la API.
 */
export function RatingSummary({ detail }: { detail: ReputationDetail }) {
  const isNew = detail.stars === null;
  const missing = chargesMissingForRating(detail.consideredCount);

  return (
    <Card as="section" aria-labelledby="rating-title" className="flex flex-col gap-5">
      <h2 id="rating-title" className="font-display text-xl font-bold">
        {REPUTATION_MESSAGES.ratingTitle}
      </h2>
      <RatingBadge rating={detail} size="lg" />
      {isNew && missing > 0 && (
        <p className="text-body">
          {REPUTATION_MESSAGES.newRating} Te faltan <strong>{missing}</strong>{' '}
          {missing === 1 ? 'cobro considerado' : 'cobros considerados'} para tener estrellas.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Cobros considerados" value={detail.consideredCount} />
        <Stat label="Puntuales" value={detail.punctualCount} />
        <Stat label="Tardíos" value={detail.lateCount} />
        <Stat label="Racha actual" value={detail.currentStreak} />
      </dl>
    </Card>
  );
}
