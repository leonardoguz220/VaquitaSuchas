'use client';

import Link from 'next/link';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { RatingBadge } from '@/components/features/reputation/rating-badge';
import { Alert, Badge, Button } from '@/components/ui';
import { useListing } from '@/hooks/use-listing';
import { formatBs } from '@/lib/money';
import { LISTINGS_PATH } from '@/lib/routes';
import type { ListingView } from '@/services/listings';
import {
  billingDayText,
  LISTING_MESSAGES,
  listingErrorText,
  serviceTitle,
  slotsText,
  windowStatus,
} from './listing-messages';
import { ListingRequestPanel } from './listing-request';

function BackLink() {
  return (
    <Link
      href={LISTINGS_PATH}
      className="inline-flex min-h-11 items-center gap-1.5 self-start font-bold text-primary hover:text-primary-hover"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M15 5 8 12l7 7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {LISTING_MESSAGES.backToList}
    </Link>
  );
}

/**
 * Bloque de texto del titular. Va como texto plano con sus saltos de línea (`pre-wrap`): no se
 * interpreta como HTML ni se convierte en enlaces (RNF-008-05).
 */
function TextBlock({
  id,
  title,
  text,
  empty,
}: {
  id: string;
  title: string;
  text: string | null;
  empty: string;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-lg font-bold">
        {title}
      </h2>
      <p className="leading-relaxed whitespace-pre-wrap">{text ?? empty}</p>
    </section>
  );
}

function ListingDetail({ listing }: { listing: ListingView }) {
  const { service, owner, slotsOffered, estimatedShareCents, estimatedShareLabel, billingDay } =
    listing;
  const windowInfo = windowStatus(listing.entryWindow);

  return (
    <article
      aria-labelledby="listing-title"
      className="flex flex-col gap-6 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-4">
        <ServiceLogo
          name={service.name}
          logoUrl={service.logoUrl}
          brandColor={service.brandColor}
          size="md"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h1
            id="listing-title"
            className="font-display text-3xl leading-tight font-bold tracking-tight"
          >
            {serviceTitle(service)}
          </h1>
          <p className="text-[15px] text-muted">
            {slotsText(slotsOffered)} · {billingDayText(billingDay)}
          </p>
        </div>
      </div>

      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1 rounded-field bg-bg p-4">
          <dt className="text-[15px] text-muted">Cuota {estimatedShareLabel}</dt>
          <dd className="font-display text-2xl font-bold">{formatBs(estimatedShareCents)}</dd>
        </div>
        <div className="flex flex-col gap-1.5 rounded-field bg-bg p-4">
          <dt className="text-[15px] text-muted">{LISTING_MESSAGES.ownerLabel}</dt>
          <dd className="font-bold">{owner.fullName}</dd>
          <dd>
            <RatingBadge rating={{ level: owner.level, stars: null, starsLabel: null }} />
          </dd>
        </div>
        <div className="flex flex-col gap-1.5 rounded-field bg-bg p-4">
          <dt className="text-[15px] text-muted">{LISTING_MESSAGES.windowLabel}</dt>
          <dd>
            <Badge variant={windowInfo.tone}>{windowInfo.text}</Badge>
          </dd>
        </div>
      </dl>

      <p className="text-[15px] text-muted">{LISTING_MESSAGES.estimateNote}</p>

      <TextBlock
        id="listing-description"
        title={LISTING_MESSAGES.descriptionTitle}
        text={listing.description}
        empty={LISTING_MESSAGES.noDescription}
      />
      <TextBlock
        id="listing-conditions"
        title={LISTING_MESSAGES.conditionsTitle}
        text={listing.conditions}
        empty={LISTING_MESSAGES.noConditions}
      />
      <ListingRequestPanel listing={listing} />
    </article>
  );
}

function DetailSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <span className="sr-only">{LISTING_MESSAGES.loadingDetail}</span>
      <div className="flex items-center gap-4" aria-hidden="true">
        <div className="size-11 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        <div className="h-7 flex-1 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
      </div>
      <div
        aria-hidden="true"
        className="h-24 animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
    </div>
  );
}

/**
 * Detalle de una publicación `/cupos/[id]` (spec 008, plan §6; mockup `Cupo.dc.html`). Pedir el
 * cupo va en `ListingRequestPanel`; el reporte llega con su tarea. Un `404` (ya no existe o ya es
 * parte del grupo) se muestra con su aviso propio.
 */
export function ListingDetailView({ listingId }: { listingId: string }) {
  const { status, data, error, reload } = useListing(listingId);

  return (
    <>
      <BackLink />

      {(status === 'loading' || status === 'redirecting') && <DetailSkeleton />}

      {status === 'error' && error?.statusCode === 404 && (
        <section
          aria-labelledby="listing-gone-title"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h1 id="listing-gone-title" className="font-display text-2xl font-bold">
            {LISTING_MESSAGES.notFound}
          </h1>
          <p className="text-muted">{LISTING_MESSAGES.notFoundHint}</p>
        </section>
      )}

      {status === 'error' && error && error.statusCode !== 404 && (
        <Alert
          variant="error"
          title={listingErrorText(error).title}
          action={
            <Button variant="secondary" onClick={reload}>
              {LISTING_MESSAGES.retry}
            </Button>
          }
        >
          {listingErrorText(error).body}
        </Alert>
      )}

      {status === 'success' && data && <ListingDetail listing={data} />}
    </>
  );
}
