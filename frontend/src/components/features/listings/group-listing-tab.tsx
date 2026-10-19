'use client';

import { useId, useState } from 'react';
import { Alert, Button, Card, Modal } from '@/components/ui';
import { useOwnerListing } from '@/hooks/use-owner-listing';
import type { GroupDetail } from '@/services/groups';
import {
  EMPTY_LISTING_FORM,
  LISTING_FIXED_NOTICE,
  formValuesOf,
  listingStatusText,
  ownerListingErrorText,
  toListingInput,
  type ListingFormValues,
} from './listing-owner-model';
import { ListingOwnerForm } from './listing-owner-form';
import { ListingOwnerPreview } from './listing-owner-preview';
import { slotsText, serviceTitle } from './listing-messages';

interface Notice {
  variant: 'success' | 'error';
  title: string;
}

/**
 * Pestaña «Publicar cupos» del titular (RF-008-01, RF-008-05, RF-008-06; mockup PublicarCupos).
 * Muestra el estado que entrega la API, las acciones que corresponden y la vista previa. No
 * calcula cuotas ni estados: la cuota y las fechas vienen de la API.
 */
export function GroupListingTab({ group }: { group: GroupDetail }) {
  const ids = useId();
  const { state, busy, save, renew, retire, reload } = useOwnerListing(group.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ListingFormValues>(EMPTY_LISTING_FORM);
  const [serverError, setServerError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [retireOpen, setRetireOpen] = useState(false);

  const listing = state.status === 'ready' ? state.listing : null;
  // Cupos libres para mostrar: total menos miembros activos (la API valida el tope real).
  const freeSlots = Math.max(0, group.totalSlots - group.members.length);
  const ownerName = group.members.find((member) => member.role === 'titular')?.fullName ?? '';
  const formActive = listing === null || editing;
  const previewValues = listing && !editing ? formValuesOf(listing) : draft;

  function startEditing() {
    if (!listing) return;
    setDraft(formValuesOf(listing));
    setServerError(null);
    setNotice(null);
    setEditing(true);
  }

  async function handleSave(values: ListingFormValues) {
    const creating = listing === null;
    setServerError(null);
    setNotice(null);
    const result = await save(toListingInput(values));
    if (result.ok) {
      setEditing(false);
      setNotice({
        variant: 'success',
        title: creating ? 'Publicación creada' : 'Cambios guardados',
      });
    } else {
      setServerError(ownerListingErrorText(result.error));
    }
  }

  async function handleRenew() {
    setNotice(null);
    const result = await renew();
    setNotice(
      result.ok
        ? { variant: 'success', title: 'Publicación renovada por 30 días' }
        : { variant: 'error', title: ownerListingErrorText(result.error) },
    );
  }

  async function handleRetire() {
    const result = await retire();
    setRetireOpen(false);
    setNotice(
      result.ok
        ? { variant: 'success', title: 'Publicación retirada' }
        : { variant: 'error', title: ownerListingErrorText(result.error) },
    );
  }

  return (
    <section aria-labelledby={`${ids}-title`} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id={`${ids}-title`} className="font-display text-xl font-bold">
          Cupos libres
        </h2>
        <p className="text-[15px] text-muted">{LISTING_FIXED_NOTICE}</p>
      </div>

      {state.status === 'loading' && (
        <p role="status" aria-busy="true" className="text-muted">
          Cargando la publicación…
        </p>
      )}

      {state.status === 'error' && (
        <Alert variant="error" title="No pudimos cargar la publicación">
          <Button variant="secondary" onClick={() => reload()} className="mt-3">
            Reintentar
          </Button>
        </Alert>
      )}

      {state.status === 'ready' && (
        <>
          {notice && <Alert variant={notice.variant} title={notice.title} />}

          {listing && !editing && (
            <Card
              as="section"
              aria-label="Estado de la publicación"
              className="flex flex-col gap-4"
            >
              <p className="font-bold">{listingStatusText(listing)}</p>
              <p className="text-[15px] text-muted">
                {`${slotsText(listing.slotsOffered)} · ${listing.openRequests} solicitudes abiertas`}
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {(listing.status === 'activa' || listing.status === 'expirada') && (
                  <Button onClick={handleRenew} loading={busy} className="w-full sm:w-auto">
                    Renovar 30 días
                  </Button>
                )}
                {(listing.status === 'activa' || listing.status === 'oculta') && (
                  <Button
                    variant="secondary"
                    onClick={startEditing}
                    disabled={busy}
                    className="w-full sm:w-auto"
                  >
                    Editar publicación
                  </Button>
                )}
                <Button
                  variant="secondary"
                  onClick={() => setRetireOpen(true)}
                  disabled={busy}
                  className="w-full sm:w-auto"
                >
                  Retirar
                </Button>
              </div>
            </Card>
          )}

          {formActive && (
            <Card as="section" aria-label={listing ? 'Editar publicación' : 'Publicar cupos'}>
              <ListingOwnerForm
                values={draft}
                onChange={setDraft}
                freeSlots={freeSlots}
                submitLabel={listing ? 'Guardar cambios' : 'Publicar cupos'}
                busy={busy}
                serverError={serverError}
                onSubmit={handleSave}
                onCancel={listing ? () => setEditing(false) : undefined}
              />
            </Card>
          )}

          <ListingOwnerPreview
            serviceName={serviceTitle(group.service)}
            planName={null}
            ownerName={ownerName}
            billingDay={group.billingDay}
            values={previewValues}
            estimatedShareCents={listing?.preview?.estimatedShareCents ?? null}
            expiresAt={listing?.expiresAt ?? null}
          />

          <Modal
            open={retireOpen}
            onClose={() => {
              if (!busy) setRetireOpen(false);
            }}
            title="¿Retirar la publicación?"
            description="Deja de aparecer en la búsqueda. Las solicitudes en curso siguen su flujo."
            footer={
              <>
                <Button variant="secondary" onClick={() => setRetireOpen(false)} disabled={busy}>
                  Volver
                </Button>
                <Button variant="danger" onClick={handleRetire} loading={busy}>
                  Sí, retirar
                </Button>
              </>
            }
          />
        </>
      )}
    </section>
  );
}
