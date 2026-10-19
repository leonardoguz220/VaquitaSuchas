'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { LevelBadge } from '@/components/features/reputation/rating-badge';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useListing } from '@/hooks/use-listings';
import { formatDateLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { LISTINGS_PATH } from '@/lib/routes';
import type { ListingView } from '@/services/listings';
import { listingTitle, PlainText } from './listing-card';
import { entryWindowText, listingLoadErrorMessage, slotsText } from './listing-messages';

function BackLink() {
  return (
    <Link
      href={LISTINGS_PATH}
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">←</span> Volver a cupos libres
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando la publicación…</span>
      <div
        aria-hidden="true"
        className="h-10 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="h-64 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
    </div>
  );
}

function Summary({ listing }: { listing: ListingView }) {
  const windowText = entryWindowText(listing.entryWindow);
  return (
    <Card as="section" aria-labelledby="listing-summary-title" className="flex flex-col gap-4">
      <h2 id="listing-summary-title" className="sr-only">
        Resumen
      </h2>
      <dl className="flex flex-col">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-3">
          <dt className="text-muted">Cuota {listing.estimatedShareLabel}</dt>
          <dd className="font-display text-3xl font-bold">
            {formatBs(listing.estimatedShareCents)}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-3">
          <dt className="text-muted">Titular</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-bold">{listing.owner.fullName}</span>
            <LevelBadge level={listing.owner.level} />
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-3">
          <dt className="text-muted">Ventana de ingreso</dt>
          <dd>
            {windowText && (
              <Badge
                variant={listing.entryWindow.isOpen ? 'success' : 'warning'}
                icon={listing.entryWindow.isOpen ? 'check' : 'clock'}
                className="whitespace-normal"
              >
                {windowText}
              </Badge>
            )}
          </dd>
        </div>
      </dl>
      <p className="text-[15px] text-muted">
        La cuota es estimada: la real depende de cuántos miembros tenga el grupo al cobrar.
      </p>
    </Card>
  );
}

function Texts({ listing }: { listing: ListingView }) {
  if (!listing.description && !listing.conditions) return null;
  return (
    <Card as="section" aria-labelledby="listing-texts-title" className="flex flex-col gap-4">
      <h2 id="listing-texts-title" className="sr-only">
        Descripción y condiciones
      </h2>
      {listing.description && (
        <div className="flex flex-col gap-1">
          <h3 className="font-bold">Descripción</h3>
          <PlainText>{listing.description}</PlainText>
        </div>
      )}
      {listing.conditions && (
        <div className="flex flex-col gap-1">
          <h3 className="font-bold">Condiciones</h3>
          <PlainText>{listing.conditions}</PlainText>
        </div>
      )}
    </Card>
  );
}

export interface ListingDetailContentProps {
  listing: ListingView;
  /** Acciones de la publicación (solicitar, reportar). */
  actions?: ReactNode;
}

/** Contenido del detalle con datos: título, resumen, textos y acciones. */
export function ListingDetailContent({ listing, actions }: ListingDetailContentProps) {
  return (
    <>
      <div className="flex items-center gap-4">
        <ServiceLogo
          name={listing.service.name}
          logoUrl={listing.service.logoUrl}
          brandColor={listing.service.brandColor}
          size="lg"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight break-words sm:text-4xl">
            {listingTitle(listing)}
          </h1>
          <p className="text-muted">
            {slotsText(listing.slotsOffered)} libres · Cobro el día {listing.billingDay}
          </p>
          <p className="text-[15px] text-muted">
            Publicado el {formatDateLaPaz(listing.publishedAt)} · Vence el{' '}
            {formatDateLaPaz(listing.expiresAt)}
          </p>
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <Summary listing={listing} />
          <Texts listing={listing} />
        </div>
        {actions && <div className="flex flex-col gap-5">{actions}</div>}
      </div>
    </>
  );
}

/**
 * `/cupos/[id]` (spec 008 T015, plan §6; mockup `Cupo.dc.html`): detalle de la publicación con
 * la cuota estimada, el titular con su nivel, la ventana de ingreso y los textos como texto plano
 * (`pre-wrap`, sin enlaces activos, RN-008-07). No muestra miembros, pagos ni código: la API no
 * los envía (CA-008-05). `404` si ya no está activa o es de un grupo propio.
 */
export function ListingDetailView({ listingId }: { listingId: string }) {
  const { status, data, error, reload } = useListing(listingId);

  if (status === 'loading' || status === 'redirecting') {
    return (
      <>
        <BackLink />
        <DetailSkeleton />
      </>
    );
  }

  if (status === 'error' && error) {
    return (
      <>
        <BackLink />
        {error.statusCode === 404 ? (
          <Alert variant="warning" title="No encontramos esta publicación.">
            Puede que ya no esté activa o que sea de un grupo en el que ya estás.
          </Alert>
        ) : (
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
      </>
    );
  }

  if (!data) return null;
  return (
    <>
      <BackLink />
      <ListingDetailContent listing={data} />
    </>
  );
}
