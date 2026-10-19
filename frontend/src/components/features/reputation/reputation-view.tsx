'use client';

import Link from 'next/link';
import { Alert, Button } from '@/components/ui';
import { useMyReputation } from '@/hooks/use-my-reputation';
import { BADGES_PATH, PROFILE_PATH } from '@/lib/routes';
import { FormulaCard } from './formula-card';
import { HostStatusCard } from './host-status-card';
import { loadErrorOutcome, REPUTATION_MESSAGES } from './reputation-messages';
import { RatingSummary } from './rating-summary';
import { RecentCharges } from './recent-charges';

function ReputationSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{REPUTATION_MESSAGES.loading}</span>
      {[0, 1, 2].map((block) => (
        <div
          key={block}
          aria-hidden="true"
          className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <div className="h-6 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-12 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Pantalla `/perfil/reputacion` (spec 007, plan §6; mockup `Reputacion.dc.html`). Celular primero:
 * calificación, habilitación como titular, últimos cobros y la explicación de la fórmula. Todo sale
 * de `GET /users/me/reputation`; cubre cargando, error (con o sin conexión), con datos y los cobros
 * vacíos. Un `401` lleva a `/ingresar` (lo hace `useApiResource`).
 */
export function ReputationView() {
  const { status, data, error, reload } = useMyReputation();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={PROFILE_PATH}
        className="inline-flex min-h-11 items-center self-start rounded-field font-bold text-primary no-underline hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {REPUTATION_MESSAGES.backToProfile}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {REPUTATION_MESSAGES.title}
        </h1>
        <p className="text-muted">{REPUTATION_MESSAGES.intro}</p>
        <Link
          href={BADGES_PATH}
          className="inline-flex min-h-11 items-center self-start rounded-field font-bold text-primary no-underline hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {REPUTATION_MESSAGES.badgesLink}
        </Link>
      </div>

      {(status === 'loading' || status === 'redirecting') && <ReputationSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={loadErrorOutcome(error).title}
          action={
            <Button variant="secondary" onClick={reload}>
              {REPUTATION_MESSAGES.retry}
            </Button>
          }
        >
          {loadErrorOutcome(error).message}
        </Alert>
      )}

      {status === 'success' && data && (
        <>
          <RatingSummary detail={data} />
          <HostStatusCard detail={data} />
          <RecentCharges charges={data.recent} />
          <FormulaCard formula={data.formula} />
        </>
      )}
    </div>
  );
}
