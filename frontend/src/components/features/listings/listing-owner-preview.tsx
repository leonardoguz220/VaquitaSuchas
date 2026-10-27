import { Card } from '@/components/ui';
import { formatDateLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import type { ListingFormValues } from './listing-owner-model';
import { billingDayText, slotsText } from './listing-messages';

export interface ListingOwnerPreviewProps {
  serviceName: string;
  planName: string | null;
  ownerName: string;
  billingDay: number;
  values: ListingFormValues;
  /** Cuota estimada que entregó la API; `null` si todavía no hay publicación (no se muestra la línea). */
  estimatedShareCents: number | null;
  /** Fin de la publicación que entregó la API; `null` si todavía no hay publicación. */
  expiresAt: string | null;
}

/**
 * «Así la verán» (mockup PublicarCupos): cómo aparece la publicación en la búsqueda. El texto se
 * muestra tal cual lo escribió el titular; la cuota la pone la API y se rotula «estimada».
 */
export function ListingOwnerPreview({
  serviceName,
  planName,
  ownerName,
  billingDay,
  values,
  estimatedShareCents,
  expiresAt,
}: ListingOwnerPreviewProps) {
  const slots = Number(values.slotsOffered);
  const description = values.description.trim();
  const conditions = values.conditions.trim();

  return (
    <Card as="section" aria-labelledby="listing-preview-title" className="flex flex-col gap-3">
      <h3 id="listing-preview-title" className="font-display text-lg font-bold">
        Así la verán
      </h3>
      <article className="flex flex-col gap-2 rounded-field border border-line bg-bg p-4">
        <p className="font-bold">
          {serviceName}
          {planName ? ` · ${planName}` : ''}
        </p>
        <p className="text-[15px] text-muted">
          {Number.isInteger(slots) && slots > 0 ? slotsText(slots) : 'Cupos por definir'} ·{' '}
          {billingDayText(billingDay)}
        </p>
        {estimatedShareCents !== null && (
          <p className="text-[15px]">
            Cuota <span className="font-bold">{formatBs(estimatedShareCents)}</span>{' '}
            <span className="text-muted">estimada</span>
          </p>
        )}
        <p className="text-[15px] text-muted">Titular: {ownerName}</p>
        {description && <p className="text-[15px] whitespace-pre-line">{description}</p>}
        {conditions && <p className="text-[15px] whitespace-pre-line text-muted">{conditions}</p>}
        {expiresAt && (
          <p className="text-[15px] text-muted">Abierta hasta el {formatDateLaPaz(expiresAt)}</p>
        )}
      </article>
    </Card>
  );
}
