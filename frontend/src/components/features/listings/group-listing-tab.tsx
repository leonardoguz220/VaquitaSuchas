'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card, Modal } from '@/components/ui';
import {
  useCreateListing,
  useOwnerListing,
  useRenewListing,
  useUpdateListing,
  useWithdrawListing,
} from '@/hooks/use-listings';
import { formatDateLaPaz } from '@/lib/dates';
import type { GroupDetail } from '@/services/groups';
import type { OwnerListing } from '@/services/listings';
import { ListingCard } from './listing-card';
import { ListingForm, type ListingFormValues } from './listing-form';
import {
  LISTING_MESSAGES,
  listingActionOutcome,
  listingLoadErrorMessage,
  slotsText,
  type ListingActionOutcome,
} from './listing-messages';

type Notice = { variant: 'success' | 'warning' | 'error'; text: string };

function TabSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-4">
      <span className="sr-only">Cargando la publicación…</span>
      <div
        aria-hidden="true"
        className="h-48 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
    </div>
  );
}

/** «3 de 4 cupos ocupados»: los datos del grupo que ya entrega la API, sin restar en el cliente. */
function slotsHint(group: GroupDetail): string {
  return `El grupo tiene ${group.breakdown.memberCount} de ${group.totalSlots} cupos ocupados. Puedes ofrecer los que estén libres.`;
}

/** La publicación sigue vigente para el titular (las retiradas o cerradas ya no se gestionan). */
function isManageable(listing: OwnerListing | null): listing is OwnerListing {
  return (
    listing !== null &&
    (listing.status === 'activa' || listing.status === 'oculta' || listing.status === 'expirada')
  );
}

function StatusLine({ listing }: { listing: OwnerListing }) {
  switch (listing.status) {
    case 'activa':
      return (
        <div className="flex flex-col gap-2">
          <Badge variant="success" icon="check" className="self-start">
            Activa
          </Badge>
          <p className="font-bold">
            Publicación activa hasta el {formatDateLaPaz(listing.expiresAt)}.
          </p>
        </div>
      );
    case 'oculta':
      return (
        <div className="flex flex-col gap-2">
          <Badge variant="danger" icon="alert" className="self-start">
            Oculta por reportes
          </Badge>
          <p className="font-bold">
            Tu publicación está oculta
            {listing.hiddenAt ? ` desde el ${formatDateLaPaz(listing.hiddenAt)}` : ''} mientras un
            administrador la revisa. No aparece en la búsqueda.
          </p>
        </div>
      );
    default:
      return (
        <div className="flex flex-col gap-2">
          <Badge variant="neutral" icon="x" className="self-start">
            Expirada
          </Badge>
          <p className="font-bold">
            Tu publicación venció el {formatDateLaPaz(listing.expiresAt)}. Renuévala para que vuelva
            a aparecer en la búsqueda.
          </p>
        </div>
      );
  }
}

interface ListingStatusCardProps {
  group: GroupDetail;
  listing: OwnerListing;
  onChanged: (listing: OwnerListing | null, notice: Notice) => void;
  onStale: (message: string) => void;
}

function ListingStatusCard({ group, listing, onChanged, onStale }: ListingStatusCardProps) {
  const [editing, setEditing] = useState(false);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const renew = useRenewListing(group.id);
  const update = useUpdateListing(group.id);
  const withdraw = useWithdrawListing(group.id);
  const canRenew = listing.status === 'activa' || listing.status === 'expirada';
  const canEdit = listing.status === 'activa' || listing.status === 'oculta';

  function handleError(outcome: ListingActionOutcome) {
    if (outcome.refresh) onStale(outcome.message);
    else setProblem(outcome.message);
  }

  async function handleRenew() {
    setProblem(null);
    const result = await renew.submit();
    if (!result) return;
    if (result.ok) {
      onChanged(result.data, {
        variant: 'success',
        text: `Renovaste la publicación hasta el ${formatDateLaPaz(result.data.expiresAt)}.`,
      });
      return;
    }
    handleError(listingActionOutcome(result.error));
  }

  async function handleWithdraw() {
    setProblem(null);
    const result = await withdraw.submit();
    if (!result) return;
    setConfirmWithdraw(false);
    if (result.ok) {
      onChanged(null, {
        variant: 'success',
        text: 'Retiraste la publicación. Las solicitudes en curso siguen su trámite.',
      });
      return;
    }
    handleError(listingActionOutcome(result.error));
  }

  async function handleUpdate(values: ListingFormValues): Promise<ListingActionOutcome | null> {
    const result = await update.submit({ ...values, version: listing.version });
    if (!result) return null;
    if (result.ok) {
      setEditing(false);
      onChanged(result.data, { variant: 'success', text: 'Guardamos los cambios.' });
      return null;
    }
    const outcome = listingActionOutcome(result.error);
    if (outcome.refresh) {
      setEditing(false);
      onStale(outcome.message);
      return null;
    }
    return outcome;
  }

  return (
    <Card as="section" aria-labelledby="listing-status-title" className="flex flex-col gap-4">
      <h3 id="listing-status-title" className="font-display text-xl font-bold">
        Tu publicación
      </h3>
      <StatusLine listing={listing} />
      <dl className="grid grid-cols-1 gap-2 text-[15px] sm:grid-cols-3">
        <div className="flex gap-1 sm:flex-col">
          <dt className="text-muted">Cupos ofrecidos:</dt>
          <dd className="font-bold">{slotsText(listing.slotsOffered)}</dd>
        </div>
        <div className="flex gap-1 sm:flex-col">
          <dt className="text-muted">Solicitudes en curso:</dt>
          <dd className="font-bold">{listing.openRequests}</dd>
        </div>
        <div className="flex gap-1 sm:flex-col">
          <dt className="text-muted">Reportes:</dt>
          <dd className="font-bold">{listing.reportCount}</dd>
        </div>
      </dl>
      {problem && <Alert variant="error">{problem}</Alert>}
      {!editing && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {canRenew && (
            <Button onClick={() => void handleRenew()} loading={renew.isSubmitting}>
              Renovar 30 días
            </Button>
          )}
          {canEdit && (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
          )}
          <Button variant="danger" onClick={() => setConfirmWithdraw(true)}>
            Retirar
          </Button>
        </div>
      )}
      {editing && (
        <ListingForm
          initial={{
            slotsOffered: listing.slotsOffered,
            description: listing.description ?? '',
            conditions: listing.conditions ?? '',
          }}
          submitLabel="Guardar cambios"
          slotsHint={slotsHint(group)}
          onSubmit={handleUpdate}
          isSubmitting={update.isSubmitting}
          onCancel={() => setEditing(false)}
        />
      )}
      <Modal
        open={confirmWithdraw}
        onClose={() => setConfirmWithdraw(false)}
        title="¿Retirar la publicación?"
        description="Dejará de aparecer en la búsqueda de cupos. Las solicitudes que ya están en curso siguen su trámite."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmWithdraw(false)}>
              Volver
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleWithdraw()}
              loading={withdraw.isSubmitting}
            >
              Retirar publicación
            </Button>
          </>
        }
      />
    </Card>
  );
}

function PublishCard({
  group,
  onPublished,
  onStale,
}: {
  group: GroupDetail;
  onPublished: (listing: OwnerListing) => void;
  onStale: (message: string) => void;
}) {
  const create = useCreateListing(group.id);

  async function handlePublish(values: ListingFormValues): Promise<ListingActionOutcome | null> {
    const result = await create.submit({
      slotsOffered: values.slotsOffered,
      ...(values.description ? { description: values.description } : {}),
      ...(values.conditions ? { conditions: values.conditions } : {}),
    });
    if (!result) return null;
    if (result.ok) {
      onPublished(result.data);
      return null;
    }
    const outcome = listingActionOutcome(result.error);
    if (outcome.refresh) {
      onStale(outcome.message);
      return null;
    }
    return outcome;
  }

  return (
    <Card as="section" aria-labelledby="listing-publish-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="listing-publish-title" className="font-display text-xl font-bold">
          Publicar cupos libres
        </h3>
        <p className="text-muted">
          Tu grupo aparecerá en «Cupos libres» durante 30 días. Quien quiera entrar te enviará una
          solicitud, y tú decides. Nadie verá los datos de los miembros ni tus datos de pago.
        </p>
      </div>
      <ListingForm
        submitLabel="Publicar cupos"
        slotsHint={slotsHint(group)}
        onSubmit={handlePublish}
        isSubmitting={create.isSubmitting}
      />
    </Card>
  );
}

/**
 * Pestaña **Publicar cupos** de `/grupos/[id]` para el titular (spec 008 T011, plan §6; mockup
 * `PublicarCupos.dc.html`): publicar, ver el estado (activa hasta, oculta, expirada), **Renovar**,
 * **Editar** y **Retirar**, con la vista previa que arma la API tal como la verá el público y el
 * aviso fijo de que aceptar a alguien cambia la cuota de todos (RN-008-03).
 */
export function GroupListingTab({ group }: { group: GroupDetail }) {
  const { status, data, error, reload, refresh, replace } = useOwnerListing(group.id);
  const [notice, setNotice] = useState<Notice | null>(null);

  function handleStale(message: string) {
    setNotice({ variant: 'warning', text: message });
    void refresh();
  }

  return (
    <section aria-labelledby="listing-tab-title" className="flex flex-col gap-5">
      <h2 id="listing-tab-title" className="sr-only">
        Publicar cupos
      </h2>
      <Alert variant="info">{LISTING_MESSAGES.shareChangeNotice}</Alert>
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}

      {(status === 'loading' || status === 'redirecting') && <TabSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar la publicación."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {listingLoadErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && !isManageable(data) && (
        <PublishCard
          group={group}
          onPublished={(listing) => {
            replace(listing);
            setNotice({
              variant: 'success',
              text: `Publicaste ${slotsText(listing.slotsOffered)} hasta el ${formatDateLaPaz(listing.expiresAt)}.`,
            });
          }}
          onStale={handleStale}
        />
      )}

      {status === 'success' && isManageable(data) && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <ListingStatusCard
            key={data.version}
            group={group}
            listing={data}
            onChanged={(listing, next) => {
              replace(listing);
              setNotice(next);
            }}
            onStale={handleStale}
          />
          <section aria-labelledby="listing-preview-title" className="flex flex-col gap-3">
            <h3 id="listing-preview-title" className="font-display text-xl font-bold">
              Así la verán
            </h3>
            {data.preview ? (
              <ListingCard listing={data.preview} showTexts headingLevel="h3" />
            ) : (
              <p className="rounded-card border border-line bg-surface p-4 text-muted">
                La vista previa no está disponible ahora.
              </p>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
