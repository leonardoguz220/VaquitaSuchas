'use client';

import { Card } from '@/components/ui';
import { useCountdown } from '@/hooks/use-countdown';
import { formatDateTimeLaPaz, formatDueDateLaPaz, formatRemaining } from '@/lib/dates';
import type { Charge } from '@/services/charges';

function Countdown({ dueAt }: { dueAt: string }) {
  const remaining = useCountdown(dueAt);
  if (remaining === null) return null;
  if (remaining === 0) {
    return <p className="text-[15px] text-muted">El plazo de pago terminó.</p>;
  }
  return (
    <p className="text-[15px] text-muted">
      Faltan{' '}
      <strong role="timer" aria-live="off" className="text-ink">
        {formatRemaining(remaining)}
      </strong>
      . Si no pagas a tiempo, se te retira del grupo.
    </p>
  );
}

function settledText(charge: Charge): string | null {
  const by = charge.settledBy?.fullName;
  if (charge.settlement === 'ingreso') return by ? `Pago de ingreso confirmado por ${by}.` : null;
  if (charge.settlement === 'manual') return by ? `Pago registrado a mano por ${by}.` : null;
  return by ? `Confirmado por ${by}.` : null;
}

/**
 * Vencimiento del cobro (RF-002-09): fecha en La Paz y, si está `pendiente`, cuenta regresiva.
 * El reloj solo informa: llegar a 0 no cambia el estado, eso lo decide el servidor.
 */
export function ChargeDue({ charge }: { charge: Charge }) {
  const due = formatDueDateLaPaz(charge.dueAt);
  return (
    <Card as="section" aria-labelledby="charge-due" className="flex flex-col gap-2">
      <h2 id="charge-due" className="font-display text-xl font-bold">
        Vencimiento
      </h2>
      {charge.status === 'pendiente' && (
        <>
          <p className="font-bold">{`Vence el ${due}`}</p>
          <Countdown dueAt={charge.dueAt} />
        </>
      )}
      {charge.status === 'en_revision' && (
        <>
          <p className="font-bold">{`Vencimiento: ${due}`}</p>
          <p className="text-[15px] text-muted">El titular está revisando el comprobante.</p>
        </>
      )}
      {charge.status === 'atrasado' && <p className="font-bold">{`Venció el ${due}`}</p>}
      {charge.status === 'pagado' && (
        <>
          <p className="font-bold">
            {charge.paidAt ? `Pagado el ${formatDateTimeLaPaz(charge.paidAt)}` : 'Pagado'}
          </p>
          {settledText(charge) && <p className="text-[15px] text-muted">{settledText(charge)}</p>}
          {charge.manualNote && (
            <p className="text-[15px] break-words">{`Nota: ${charge.manualNote}`}</p>
          )}
        </>
      )}
      {charge.status === 'cancelado' && (
        <>
          <p className="font-bold">{`Cancelado · vencía el ${formatDueDateLaPaz(charge.dueAt)}`}</p>
          {charge.cancelReason && (
            <p className="text-[15px] break-words">{`Motivo: ${charge.cancelReason}`}</p>
          )}
        </>
      )}
    </Card>
  );
}
