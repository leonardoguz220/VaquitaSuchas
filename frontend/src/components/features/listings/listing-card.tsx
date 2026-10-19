import Link from 'next/link';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { RatingBadge } from '@/components/features/reputation/rating-badge';
import { Badge } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { formatBs } from '@/lib/money';
import { listingPath } from '@/lib/routes';
import type { ListingView } from '@/services/listings';
import {
  billingDayText,
  LISTING_MESSAGES,
  serviceTitle,
  slotsText,
  windowStatus,
} from './listing-messages';

/**
 * Tarjeta de una publicación (mockup `Cupos.dc.html`, RF-008-07): servicio, cupos, cuota estimada
 * rotulada «estimada», día de cobro, titular con su nivel y el estado de la ventana. Todo sale de la
 * API; la tarjeta solo lo acomoda. Va entera como enlace al detalle.
 */
export function ListingCard({ listing }: { listing: ListingView }) {
  const { service, owner, slotsOffered, estimatedShareCents, estimatedShareLabel, billingDay } =
    listing;
  const windowInfo = windowStatus(listing.entryWindow);

  return (
    <Link
      href={listingPath(listing.id)}
      className={cx(
        'flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-4 text-ink no-underline sm:p-5',
        'transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <div className="flex items-center gap-3">
        <ServiceLogo
          name={service.name}
          logoUrl={service.logoUrl}
          brandColor={service.brandColor}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-lg font-bold">{serviceTitle(service)}</span>
          <span className="text-[15px] text-muted">
            {slotsText(slotsOffered)} · {billingDayText(billingDay)}
          </span>
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[15px] text-muted">Cuota {estimatedShareLabel}</span>
        <span className="font-display text-2xl font-bold">{formatBs(estimatedShareCents)}</span>
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
        <div className="flex flex-col gap-1.5">
          <span className="text-[15px]">
            {LISTING_MESSAGES.ownerLabel}: <strong>{owner.fullName}</strong>
          </span>
          <RatingBadge rating={{ level: owner.level, stars: null, starsLabel: null }} />
        </div>
        <Badge variant={windowInfo.tone}>{windowInfo.text}</Badge>
      </div>
    </Link>
  );
}
