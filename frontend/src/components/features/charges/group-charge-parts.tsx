import { Badge } from '@/components/ui';
import { formatBs } from '@/lib/money';
import type { ChargePublic } from '@/services/charges';

/** Mensaje vacío de la pestaña Cobros según el rol (plan 002 §6). */
export function emptyChargesMessage(isOwner: boolean): string {
  return isOwner
    ? 'Aún no hay cobros: se generan solos en la fecha de corte'
    : 'Aún no hay cobros en este grupo';
}

/**
 * Nombre, etiquetas («Exmiembro», «Ingreso»), monto y estado de un cobro tal como llegan de la
 * API. El estado lleva color, ícono y texto.
 */
export function ChargeRowContent({
  charge,
  isFormerMember,
}: {
  charge: ChargePublic;
  isFormerMember: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="font-bold break-words">{charge.member.fullName}</span>
        {(isFormerMember || charge.origin === 'ingreso') && (
          <span className="flex flex-wrap gap-2">
            {isFormerMember && <Badge variant="neutral">Exmiembro</Badge>}
            {charge.origin === 'ingreso' && <Badge variant="info">Ingreso</Badge>}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-bold tabular-nums">{formatBs(charge.amountCents)}</span>
        <Badge variant={charge.status} />
      </div>
    </div>
  );
}

export function SkeletonLines({ label, rows = 3 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-14 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}
