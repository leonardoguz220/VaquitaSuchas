'use client';

import { useState } from 'react';
import { REPORT_REASONS } from '@/components/features/listings/listing-messages';
import { Alert, Badge, Button } from '@/components/ui';
import { useModerateListing, useReportedListings } from '@/hooks/use-admin-listings';
import { formatDateLaPaz } from '@/lib/dates';
import type { ModerationAction, ReportedListing } from '@/services/admin-listings';
import { adminActionOutcome, adminLoadErrorMessage } from './admin-messages';
import { AdminListSkeleton, AdminLoadError } from './admin-states';
import { ReasonModal, type ReasonModalResult } from './reason-modal';

const REASON_LABEL = Object.fromEntries(
  REPORT_REASONS.map((option) => [option.value, option.label]),
) as Record<string, string>;

interface ActionCopy {
  button: string;
  title: (name: string) => string;
  description: string;
  confirm: string;
  done: (name: string) => string;
}

const ACTIONS: Record<ModerationAction, ActionCopy> = {
  restore: {
    button: 'Restaurar',
    title: (name) => `¿Restaurar ${name}?`,
    description:
      'Vuelve a la búsqueda de cupos y su contador de reportes empieza de nuevo. Se avisa al titular con el motivo.',
    confirm: 'Restaurar',
    done: (name) => `Restauraste ${name}. Vuelve a la búsqueda.`,
  },
  delete: {
    button: 'Eliminar',
    title: (name) => `¿Eliminar ${name}?`,
    description: 'La publicación se cierra de forma definitiva. Se avisa al titular con el motivo.',
    confirm: 'Eliminar',
    done: (name) => `Eliminaste ${name}. Se avisó al titular.`,
  },
  'delete-and-suspend': {
    button: 'Eliminar y suspender al titular',
    title: (name) => `¿Eliminar ${name} y suspender al titular?`,
    description:
      'La publicación se cierra y el titular queda suspendido: se cierran sus sesiones y no podrá ingresar. Sus grupos siguen funcionando y recibe un correo con el motivo.',
    confirm: 'Eliminar y suspender',
    done: (name) => `Eliminaste ${name} y suspendiste al titular.`,
  },
};

function listingTitle(listing: ReportedListing): string {
  const plan = listing.service.planName ? ` · ${listing.service.planName}` : '';
  const slots = `${listing.slotsOffered} ${listing.slotsOffered === 1 ? 'cupo' : 'cupos'}`;
  return `${listing.service.name}${plan} · ${slots}`;
}

function StatusBadge({ listing }: { listing: ReportedListing }) {
  const count = `${listing.reportCount} ${listing.reportCount === 1 ? 'reporte' : 'reportes'}`;
  return listing.status === 'oculta' ? (
    <Badge variant="danger" icon="x">
      Oculta · {count}
    </Badge>
  ) : (
    <Badge variant="warning" icon="eye">
      Visible · {count}
    </Badge>
  );
}

function ListingItem({
  listing,
  onAction,
}: {
  listing: ReportedListing;
  onAction: (action: ModerationAction) => void;
}) {
  const title = listingTitle(listing);
  const actions: ModerationAction[] =
    listing.status === 'oculta'
      ? ['restore', 'delete', 'delete-and-suspend']
      : ['delete', 'delete-and-suspend'];
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold break-words">{title}</h2>
        <StatusBadge listing={listing} />
      </div>
      <p className="text-[15px] text-muted">
        Titular: {listing.owner.fullName} · publicada el {formatDateLaPaz(listing.publishedAt)}
        {listing.hiddenAt && <> · oculta el {formatDateLaPaz(listing.hiddenAt)}</>}
      </p>
      {listing.description && (
        <p className="break-words whitespace-pre-wrap">{listing.description}</p>
      )}
      {listing.conditions && (
        <p className="break-words whitespace-pre-wrap">
          <span className="text-muted">Condiciones: </span>
          {listing.conditions}
        </p>
      )}
      <ul
        aria-label={`Reportes de ${title}`}
        className="flex flex-col gap-1 border-l-2 border-line pl-3"
      >
        {listing.reports.map((report, index) => (
          <li key={`${report.createdAt}-${index}`} className="break-words">
            <span className="font-bold">{REASON_LABEL[report.reason] ?? report.reason}</span>
            {report.comment && <>: {report.comment}</>} · {formatDateLaPaz(report.createdAt)}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {actions.map((action) => (
          <Button
            key={action}
            variant={action === 'restore' ? 'secondary' : 'danger'}
            onClick={() => onAction(action)}
            aria-label={`${ACTIONS[action].button}: ${title}`}
          >
            {ACTIONS[action].button}
          </Button>
        ))}
      </div>
    </article>
  );
}

/**
 * `/admin/moderacion` (spec 009 T032, plan §6; mockup `AdminModeracion.dc.html`): publicaciones de
 * cupos reportadas u ocultas con los motivos y comentarios de los reportes (RF-009-12), y las
 * acciones **Restaurar**, **Eliminar** y **Eliminar y suspender al titular**, cada una con
 * confirmación y motivo (RF-009-13). El backend avisa al titular (RF-009-14). Todo el contenido de
 * las personas se muestra como texto.
 */
export function AdminModerationView() {
  const { status, error, reload, refresh, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useReportedListings();
  const { submit } = useModerateListing();
  const [pending, setPending] = useState<{
    listing: ReportedListing;
    action: ModerationAction;
  } | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);

  async function confirm(reason: string): Promise<ReasonModalResult> {
    if (!pending) return null;
    const title = listingTitle(pending.listing);
    const response = await submit({
      listingId: pending.listing.id,
      action: pending.action,
      reason,
    });
    if (!response) return null;
    if (response.ok) {
      setPending(null);
      setNotice({ ok: true, message: ACTIONS[pending.action].done(title) });
      await refresh();
      return { ok: true };
    }
    const outcome = adminActionOutcome(response.error);
    if (outcome.refresh) {
      setPending(null);
      setNotice({ ok: false, message: outcome.message });
      await refresh();
      return null;
    }
    return { ok: false, message: outcome.message, field: outcome.field };
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Moderación de cupos libres
        </h1>
        <p className="text-muted">
          Con 3 reportes de personas distintas, una publicación se oculta hasta que la revises.
        </p>
      </div>

      {notice && <Alert variant={notice.ok ? 'success' : 'warning'}>{notice.message}</Alert>}

      {(status === 'loading' || status === 'redirecting') && (
        <AdminListSkeleton label="Cargando publicaciones reportadas…" />
      )}
      {status === 'error' && error && (
        <AdminLoadError
          error={error}
          title="No pudimos cargar las publicaciones reportadas."
          onRetry={reload}
        />
      )}
      {status === 'success' && items.length === 0 && (
        <p className="rounded-card border border-line bg-surface p-5">
          No hay publicaciones reportadas ni ocultas. Todo en orden.
        </p>
      )}
      {status === 'success' && items.length > 0 && (
        <>
          <ul aria-label="Publicaciones reportadas" className="flex flex-col gap-3">
            {items.map((listing) => (
              <li key={listing.id}>
                <ListingItem
                  listing={listing}
                  onAction={(action) => {
                    setNotice(null);
                    setPending({ listing, action });
                  }}
                />
              </li>
            ))}
          </ul>
          {loadMoreError && <Alert variant="error">{adminLoadErrorMessage(loadMoreError)}</Alert>}
          {hasMore && (
            <Button
              variant="secondary"
              onClick={() => void loadMore()}
              loading={isLoadingMore}
              className="w-full sm:w-auto sm:self-center"
            >
              Cargar más
            </Button>
          )}
        </>
      )}

      {pending && (
        <ReasonModal
          title={ACTIONS[pending.action].title(listingTitle(pending.listing))}
          description={ACTIONS[pending.action].description}
          confirmLabel={ACTIONS[pending.action].confirm}
          confirmVariant={pending.action === 'restore' ? 'primary' : 'danger'}
          onConfirm={confirm}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
