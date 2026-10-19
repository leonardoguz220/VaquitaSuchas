'use client';

import Link from 'next/link';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { ProfileSectionNav } from '@/components/features/profile/profile-section-nav';
import { useMyReputation } from '@/hooks/use-reputation';
import { formatDeadlineLaPaz, formatPeriod } from '@/lib/dates';
import { chargePath, NEW_GROUP_PATH } from '@/lib/routes';
import type {
  HostRatingStatus,
  ReputationDetail,
  ReputationRecentCharge,
} from '@/services/reputation';
import { RatingBadge, starsText } from './rating-badge';
import {
  chargesText,
  formatExactStars,
  formatStarsNumber,
  REPUTATION_MESSAGES,
  reputationErrorMessage,
  RESULT_LABEL,
} from './reputation-messages';

/**
 * Mínimo de cobros considerados para tener estrellas (RF-007-02). Solo se usa para explicar el
 * nivel «Nuevo»; quien decide el nivel es la API. [NECESITA ACLARACIÓN] en `tasks.md` (T015).
 */
const RATING_MIN_CONSIDERED = 3;

function ReputationSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando tu reputación…</span>
      {[0, 1, 2].map((card) => (
        <div
          key={card}
          aria-hidden="true"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <div className="h-7 w-48 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function SummaryCard({ reputation }: { reputation: ReputationDetail }) {
  const stats = [
    { label: 'Considerados', value: reputation.consideredCount },
    { label: 'Puntuales', value: reputation.punctualCount },
    { label: 'Tardíos', value: reputation.lateCount },
    { label: 'Racha actual', value: reputation.currentStreak },
  ];
  return (
    <Card as="section" aria-labelledby="reputation-summary-title" className="flex flex-col gap-5">
      <h2 id="reputation-summary-title" className="sr-only">
        Tu calificación
      </h2>
      <RatingBadge rating={reputation} size="lg" />
      {reputation.stars === null ? (
        <p className="text-muted">
          Todavía no tienes estrellas: tienes {chargesText(reputation.consideredCount)}{' '}
          {reputation.consideredCount === 1 ? 'considerado' : 'considerados'} y se necesitan al
          menos {RATING_MIN_CONSIDERED} para calcular tu calificación.
        </p>
      ) : (
        reputation.exactStars && (
          <p className="text-[15px] text-muted">
            Valor exacto: {formatExactStars(reputation.exactStars)} de 5. Se muestra redondeado a
            media estrella.
          </p>
        )
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1 rounded-field bg-bg p-3">
            <dt className="text-[15px] text-muted">{stat.label}</dt>
            <dd className="font-display text-2xl font-bold">{stat.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[15px] text-muted">Cobros de los últimos 12 meses.</p>
    </Card>
  );
}

function hostSourceText(host: HostRatingStatus, reputation: ReputationDetail): string {
  if (host.source === 'manual') {
    return 'Un administrador te habilitó como titular. Esta habilitación no depende de tu calificación.';
  }
  return `Tienes ${starsText(reputation)} con ${chargesText(reputation.consideredCount)} considerados (se piden ${formatStarsNumber(host.minStars)} estrellas y al menos ${host.minConsideredCharges}).`;
}

function HostCard({ reputation }: { reputation: ReputationDetail }) {
  const { host } = reputation;
  const current =
    reputation.stars === null
      ? `Hoy tu nivel es «Nuevo» con ${chargesText(reputation.consideredCount)} ${reputation.consideredCount === 1 ? 'considerado' : 'considerados'}.`
      : `Hoy tienes ${starsText(reputation)} con ${chargesText(reputation.consideredCount)} ${reputation.consideredCount === 1 ? 'considerado' : 'considerados'}.`;
  return (
    <Card as="section" aria-labelledby="reputation-host-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="reputation-host-title" className="font-display text-xl font-bold">
          {host.eligible ? 'Puedes crear suscripciones' : 'Todavía no puedes crear suscripciones'}
        </h2>
        <Badge variant={host.eligible ? 'success' : 'neutral'} icon={host.eligible ? 'check' : 'x'}>
          {host.eligible ? 'Habilitado como titular' : 'Sin habilitar'}
        </Badge>
      </div>
      {host.eligible ? (
        <>
          <p>{hostSourceText(host, reputation)}</p>
          <Button
            href={NEW_GROUP_PATH}
            variant="secondary"
            className="w-full sm:w-auto sm:self-start"
          >
            Crear una suscripción
          </Button>
        </>
      ) : (
        <>
          <p>
            Para ser titular necesitas{' '}
            <strong>{formatStarsNumber(host.minStars)} estrellas o más</strong> con al menos{' '}
            <strong>{host.minConsideredCharges} cobros considerados</strong>, o que un administrador
            te habilite.
          </p>
          <p className="text-muted">{current}</p>
          {host.missing.length > 0 && (
            <ul aria-label="Lo que te falta" className="flex list-disc flex-col gap-1 pl-6">
              {host.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

function RecentRow({ charge }: { charge: ReputationRecentCharge }) {
  const result = RESULT_LABEL[charge.result];
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={chargePath(charge.chargeId)}
          className="inline-flex min-h-11 items-center font-bold text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {charge.groupName}
        </Link>
        <span className="text-[15px] text-muted">
          {charge.serviceName} · {formatPeriod(charge.period)} · Vencía el{' '}
          {formatDeadlineLaPaz(charge.dueAt)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant={charge.result === 'puntual' ? 'success' : 'danger'}
          icon={charge.result === 'puntual' ? 'check' : 'alert'}
        >
          {result}
        </Badge>
        {!charge.countsForRating && (
          <Badge variant="neutral" icon="minus">
            Excluido, no cuenta
          </Badge>
        )}
      </div>
    </li>
  );
}

function RecentCard({ recent }: { recent: ReputationRecentCharge[] }) {
  return (
    <Card as="section" aria-labelledby="reputation-recent-title" className="flex flex-col gap-2">
      <h2 id="reputation-recent-title" className="font-display text-xl font-bold">
        Últimos cobros
      </h2>
      {recent.length === 0 ? (
        <p className="text-muted">
          Todavía no tienes cobros considerados. Aparecerán aquí cuando pagues o venza tu primer
          cobro como miembro.
        </p>
      ) : (
        <ul aria-label="Últimos cobros" className="flex flex-col">
          {recent.map((charge) => (
            <RecentRow key={charge.chargeId} charge={charge} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function FormulaCard({ formula }: { formula: ReputationDetail['formula'] }) {
  return (
    <Card as="section" aria-labelledby="reputation-formula-title" className="flex flex-col gap-2">
      <h2 id="reputation-formula-title" className="font-display text-xl font-bold">
        ¿Cómo se calcula?
      </h2>
      <p className="whitespace-pre-line">{formula.text}</p>
      <p>
        <strong>Ejemplo:</strong> {formula.example}
      </p>
      <p className="text-[15px] text-muted">
        La fórmula es la misma para todas las personas (reglas versión {formula.version}).
      </p>
    </Card>
  );
}

/**
 * `/perfil/reputacion` (spec 007 T015, plan §6; mockup `Reputacion.dc.html`): estrellas con su
 * valor y nivel, detalle de cobros considerados, habilitación como titular, últimos cobros con
 * resultado y vencimiento, y la fórmula con su ejemplo. Todo sale de `GET /users/me/reputation`;
 * la pantalla no calcula nada. Los textos de la API se muestran como texto, nunca como HTML.
 */
export function ReputationView() {
  const { status, data, error, reload } = useMyReputation();
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Mi reputación
        </h1>
        <ProfileSectionNav />
      </div>

      {(status === 'loading' || status === 'redirecting') && <ReputationSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={REPUTATION_MESSAGES.loadFailed}
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {reputationErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && data && (
        <div className="flex flex-col gap-6">
          <SummaryCard reputation={data} />
          <HostCard reputation={data} />
          <RecentCard recent={data.recent} />
          <FormulaCard formula={data.formula} />
        </div>
      )}
    </>
  );
}
