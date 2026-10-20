'use client';

import Link from 'next/link';
import { Alert, Button } from '@/components/ui';
import { useMyBadges } from '@/hooks/use-my-badges';
import { REPUTATION_PATH } from '@/lib/routes';
import { EarnedBadgeCard, PendingBadgeCard } from './badge-card';
import { BADGES_MESSAGES, badgesErrorOutcome } from './badges-messages';

function BadgesSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{BADGES_MESSAGES.loading}</span>
      {[0, 1].map((block) => (
        <div key={block} aria-hidden="true" className="flex flex-col gap-4">
          <div className="h-6 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-36 w-full animate-pulse rounded-card bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

/**
 * Pantalla `/perfil/insignias` (spec 007, RF-007-07; mockup `Insignias.dc.html`). Celular primero:
 * insignias obtenidas con su fecha y pendientes con su condición y su avance. Todo sale de
 * `GET /users/me/badges`; cubre cargando, vacío, error (con o sin conexión) y con datos.
 */
export function BadgesView() {
  const { status, data, error, reload } = useMyBadges();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={REPUTATION_PATH}
        className="inline-flex min-h-11 items-center self-start rounded-field font-bold text-primary no-underline hover:text-primary-hover hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        {BADGES_MESSAGES.backToReputation}
      </Link>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          {BADGES_MESSAGES.title}
        </h1>
        <p className="text-muted">{BADGES_MESSAGES.intro}</p>
      </div>

      {(status === 'loading' || status === 'redirecting') && <BadgesSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={badgesErrorOutcome(error).title}
          action={
            <Button variant="secondary" onClick={reload}>
              {BADGES_MESSAGES.retry}
            </Button>
          }
        >
          {badgesErrorOutcome(error).message}
        </Alert>
      )}

      {status === 'success' && data && (
        <>
          <section aria-labelledby="earned-title" className="flex flex-col gap-4">
            <h2 id="earned-title" className="font-display text-xl font-bold">
              {BADGES_MESSAGES.earnedTitle} ({data.earned.length})
            </h2>
            {data.earned.length === 0 ? (
              <p className="rounded-card border border-line bg-surface p-5 text-muted">
                {BADGES_MESSAGES.earnedEmpty}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {data.earned.map((badge) => (
                  <li key={badge.code}>
                    <EarnedBadgeCard badge={badge} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {data.pending.length > 0 && (
            <section aria-labelledby="pending-title" className="flex flex-col gap-4">
              <h2 id="pending-title" className="font-display text-xl font-bold">
                {BADGES_MESSAGES.pendingTitle}
              </h2>
              <ul className="flex flex-col gap-3">
                {data.pending.map((badge) => (
                  <li key={badge.code}>
                    <PendingBadgeCard badge={badge} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
