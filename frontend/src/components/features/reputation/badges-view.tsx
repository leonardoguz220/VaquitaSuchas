'use client';

import { Alert, Badge, Button, Card } from '@/components/ui';
import { ProfileSectionNav } from '@/components/features/profile/profile-section-nav';
import { useMyBadges } from '@/hooks/use-reputation';
import { formatDateLaPaz } from '@/lib/dates';
import type { EarnedBadge, PendingBadge } from '@/services/reputation';
import { REPUTATION_MESSAGES, reputationErrorMessage } from './reputation-messages';

function BadgesSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando tus insignias…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-24 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/** Ancho de la barra para el avance que entrega la API (solo visual; el texto da el valor). */
function progressWidth({ current, target }: PendingBadge['progress']): string {
  if (target <= 0) return '0%';
  return `${Math.min(100, Math.max(0, (current / target) * 100))}%`;
}

function EarnedItem({ badge }: { badge: EarnedBadge }) {
  return (
    <li>
      <Card as="article" aria-labelledby={`badge-${badge.code}`} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`badge-${badge.code}`} className="font-display text-lg font-bold">
            {badge.name}
          </h3>
          <Badge variant="success" icon="star">
            Obtenida
          </Badge>
        </div>
        <p>{badge.description}</p>
        <p className="text-[15px] text-muted">Obtenida el {formatDateLaPaz(badge.earnedAt)}</p>
      </Card>
    </li>
  );
}

function PendingItem({ badge }: { badge: PendingBadge }) {
  const { current, target } = badge.progress;
  const progressLabel = `${current} de ${target}`;
  return (
    <li>
      <Card as="article" aria-labelledby={`badge-${badge.code}`} className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`badge-${badge.code}`} className="font-display text-lg font-bold">
            {badge.name}
          </h3>
          <Badge variant="neutral" icon="clock">
            Por obtener
          </Badge>
        </div>
        <p>{badge.description}</p>
        <p className="text-[15px] text-muted">{badge.condition}</p>
        <div className="flex items-center gap-3">
          <div
            role="progressbar"
            aria-label={`Avance de ${badge.name}`}
            aria-valuemin={0}
            aria-valuemax={target}
            aria-valuenow={current}
            aria-valuetext={progressLabel}
            className="h-3 flex-1 overflow-hidden rounded-full border border-field-border bg-bg"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: progressWidth(badge.progress) }}
            />
          </div>
          <span className="text-[15px] font-bold whitespace-nowrap">{progressLabel}</span>
        </div>
      </Card>
    </li>
  );
}

/**
 * `/perfil/insignias` (spec 007 T021, plan §6; mockup `Insignias.dc.html`): las insignias
 * obtenidas con su fecha y las que faltan con su avance. Obtenidas y pendientes se distinguen
 * por texto e icono, no solo por color (RNF-007-06). Las reglas y el avance los entrega
 * `GET /users/me/badges`; la pantalla no calcula nada.
 */
export function BadgesView() {
  const { status, data, error, reload } = useMyBadges();
  return (
    <>
      <div className="flex flex-col gap-3">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Mis insignias
        </h1>
        <ProfileSectionNav />
      </div>

      {(status === 'loading' || status === 'redirecting') && <BadgesSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title={REPUTATION_MESSAGES.badgesLoadFailed}
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
        <div className="flex flex-col gap-8">
          <section aria-labelledby="badges-earned-title" className="flex flex-col gap-3">
            <h2 id="badges-earned-title" className="font-display text-xl font-bold">
              Obtenidas ({data.earned.length})
            </h2>
            {data.earned.length === 0 ? (
              <p className="rounded-card border border-line bg-surface p-4 text-muted">
                Todavía no tienes insignias. Paga a tiempo tu próximo cobro para ganar la primera.
              </p>
            ) : (
              <ul aria-label="Insignias obtenidas" className="grid gap-3 sm:grid-cols-2">
                {data.earned.map((badge) => (
                  <EarnedItem key={badge.code} badge={badge} />
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="badges-pending-title" className="flex flex-col gap-3">
            <h2 id="badges-pending-title" className="font-display text-xl font-bold">
              Por obtener
            </h2>
            {data.pending.length === 0 ? (
              <p className="rounded-card border border-line bg-surface p-4 text-muted">
                Ya obtuviste todas las insignias disponibles.
              </p>
            ) : (
              <ul aria-label="Insignias por obtener" className="grid gap-3 sm:grid-cols-2">
                {data.pending.map((badge) => (
                  <PendingItem key={badge.code} badge={badge} />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </>
  );
}
