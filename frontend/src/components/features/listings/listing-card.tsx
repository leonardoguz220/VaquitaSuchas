import Link from 'next/link';
import type { ReactNode } from 'react';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { LevelBadge } from '@/components/features/reputation/rating-badge';
import { Badge } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { formatBs } from '@/lib/money';
import type { ListingView } from '@/services/listings';
import { entryWindowText, slotsText } from './listing-messages';

/** Texto libre de la publicación: texto plano con saltos de línea, sin HTML ni enlaces (RN-008-07). */
export function PlainText({ children, className }: { children: string; className?: string }) {
  return <p className={cx('break-words whitespace-pre-wrap', className)}>{children}</p>;
}

/** Título con el servicio y el plan: «Prime Video · Estándar». */
export function listingTitle(listing: Pick<ListingView, 'service'>): string {
  return [listing.service.name, listing.service.planName].filter(Boolean).join(' · ');
}

export interface ListingCardProps {
  listing: ListingView;
  /** Enlace al detalle (`/cupos/[id]`); sin él, la tarjeta es solo una vista previa. */
  href?: string;
  /** Muestra la descripción y las condiciones completas. */
  showTexts?: boolean;
  /** Nivel del encabezado del título (por defecto `h3`). */
  headingLevel?: 'h2' | 'h3';
  footer?: ReactNode;
  className?: string;
}

/**
 * Tarjeta de una publicación de cupos (plan 008 §6; mockups `Cupos.dc.html` y
 * `PublicarCupos.dc.html`): servicio, cupos, **cuota estimada** con su rótulo, día de cobro,
 * titular con su nivel (texto e icono) y estado de la ventana de ingreso. Nunca muestra miembros
 * ni datos de pago (RF-008-04): la API no los envía.
 */
export function ListingCard({
  listing,
  href,
  showTexts = false,
  headingLevel: Heading = 'h3',
  footer,
  className,
}: ListingCardProps) {
  const windowText = entryWindowText(listing.entryWindow);
  const title = listingTitle(listing);
  return (
    <article
      aria-label={title}
      className={cx(
        'flex flex-col gap-3 rounded-card border border-line bg-surface p-4 text-ink sm:p-5',
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <ServiceLogo
          name={listing.service.name}
          logoUrl={listing.service.logoUrl}
          brandColor={listing.service.brandColor}
        />
        <div className="flex min-w-0 flex-col">
          <Heading className="font-display text-lg leading-tight font-bold break-words">
            {href ? (
              <Link
                href={href}
                className="inline-flex min-h-11 items-center text-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {title}
              </Link>
            ) : (
              title
            )}
          </Heading>
          <span className="text-[15px] text-muted">
            {slotsText(listing.slotsOffered)} · Cobro el día {listing.billingDay}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-field bg-bg px-3 py-2">
        <span className="text-[15px] text-muted">Cuota {listing.estimatedShareLabel}</span>
        <span className="font-display text-2xl font-bold">
          {formatBs(listing.estimatedShareCents)}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px]">
          Titular: <span className="font-bold">{listing.owner.fullName}</span>
        </span>
        <LevelBadge level={listing.owner.level} />
      </div>
      {windowText && (
        <Badge
          variant={listing.entryWindow.isOpen ? 'success' : 'warning'}
          icon={listing.entryWindow.isOpen ? 'check' : 'clock'}
          className="self-start whitespace-normal"
        >
          {windowText}
        </Badge>
      )}
      {showTexts && listing.description && <PlainText>{listing.description}</PlainText>}
      {showTexts && listing.conditions && (
        <div className="flex flex-col gap-1">
          <span className="text-[15px] font-bold">Condiciones</span>
          <PlainText className="text-[15px]">{listing.conditions}</PlainText>
        </div>
      )}
      {footer}
    </article>
  );
}
