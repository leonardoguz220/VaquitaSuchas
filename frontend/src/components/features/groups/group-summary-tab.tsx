import { Alert, Badge, Button, Card } from '@/components/ui';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import { formatExchangeRate } from '@/lib/exchange-rate';
import { formatBs, formatUsd } from '@/lib/money';
import type { Breakdown, EntryWindow, GroupDetail, PaymentInfo } from '@/services/groups';
import { shareLabel } from './group-labels';

function breakdownRows(breakdown: Breakdown): { label: string; value: string }[] {
  const price =
    breakdown.currency === 'USD' ? formatUsd(breakdown.priceCents) : formatBs(breakdown.priceCents);
  const rows = [{ label: 'Precio del plan', value: price }];
  if (breakdown.currency === 'USD' && breakdown.exchangeRate) {
    rows.push({
      label: 'Tipo de cambio que definió el titular',
      value: `Bs ${formatExchangeRate(breakdown.exchangeRate)} por USD 1`,
    });
  }
  rows.push(
    { label: 'Total del mes', value: formatBs(breakdown.totalBsCents) },
    { label: 'Miembros, contando al titular', value: String(breakdown.memberCount) },
    { label: 'Cuota base de cada miembro', value: formatBs(breakdown.baseShareCents) },
    { label: 'Cuota de referencia del titular', value: formatBs(breakdown.ownerShareCents) },
    {
      label: 'Resto del redondeo (lo asume el titular)',
      value: formatBs(breakdown.remainderCents),
    },
  );
  return rows;
}

function BreakdownList({ breakdown }: { breakdown: Breakdown }) {
  return (
    <dl aria-label="Desglose de la cuota" className="flex flex-col divide-y divide-line">
      {breakdownRows(breakdown).map((row) => (
        <div key={row.label} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
          <dt className="text-muted">{row.label}</dt>
          <dd className="font-bold">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function entryWindowText(entry: EntryWindow): { badge: string; text: string } {
  if (!entry.acceptingMembers) {
    return { badge: 'No recibe miembros', text: 'Este grupo no recibe miembros nuevos.' };
  }
  if (entry.isOpen) {
    return {
      badge: 'Abierta',
      text: entry.closesAt
        ? `Abierta hasta el ${formatDateTimeLaPaz(entry.closesAt)}.`
        : 'Abierta.',
    };
  }
  return {
    badge: 'Cerrada',
    text: entry.opensAt ? `Cerrada. Se abre el ${formatDateLaPaz(entry.opensAt)}.` : 'Cerrada.',
  };
}

function EntryWindowSection({ entry }: { entry: EntryWindow }) {
  const { badge, text } = entryWindowText(entry);
  const open = entry.acceptingMembers && entry.isOpen;
  return (
    <Card as="section" aria-labelledby="group-entry-window" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="group-entry-window" className="font-display text-xl font-bold">
          Ventana de ingreso
        </h2>
        <Badge variant={open ? 'success' : 'neutral'}>{badge}</Badge>
      </div>
      <p className="font-bold">{text}</p>
      <p className="text-[15px] text-muted">
        Las solicitudes de ingreso solo se reciben durante los 3 primeros días de cada período de
        cobro, si hay cupo.
      </p>
    </Card>
  );
}

function ShortfallLinkSection({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  return (
    <Card as="section" aria-labelledby="group-shortfall" className="flex flex-col gap-3">
      <h2 id="group-shortfall" className="font-display text-xl font-bold">
        Faltante del grupo
      </h2>
      <p className="text-[15px] text-muted">
        {isOwner
          ? 'Si alguien se fue después de que el grupo pagó, avisa a los miembros para repartir lo que falta o registrar sus devoluciones.'
          : 'Aquí ves si el titular pidió cubrir lo que falta y puedes elegir pagar tu parte o pedir tu devolución.'}
      </p>
      <Button variant="secondary" href={`/grupos/${groupId}/faltante`}>
        Ver faltante
      </Button>
    </Card>
  );
}

function PaymentInfoSection({
  paymentInfo,
  isOwner,
  groupName,
}: {
  paymentInfo: PaymentInfo;
  isOwner: boolean;
  groupName: string;
}) {
  return (
    <Card as="section" aria-labelledby="group-payment-info" className="flex flex-col gap-4">
      <h2 id="group-payment-info" className="font-display text-xl font-bold">
        Datos de pago
      </h2>
      {paymentInfo.configured ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {paymentInfo.qrUrl && (
            // URL firmada de corta duración: next/image exigiría declarar el dominio de Storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={paymentInfo.qrUrl}
              alt={`QR de pago de ${groupName}`}
              referrerPolicy="no-referrer"
              className="size-48 shrink-0 self-center rounded-field border border-line bg-surface object-contain p-2 sm:self-start"
            />
          )}
          {paymentInfo.text && (
            <p className="break-words whitespace-pre-line">{paymentInfo.text}</p>
          )}
        </div>
      ) : (
        <Alert variant="info" title="Todavía no hay datos de pago.">
          {isOwner
            ? 'Carga tu QR o los datos de tu cuenta para que los miembros puedan pagarte.'
            : 'El titular todavía no cargó su QR ni los datos de su cuenta.'}
        </Alert>
      )}
    </Card>
  );
}

/**
 * Pestaña «Resumen» del detalle (RF-001-12, RF-001-13, RF-001-22; mockup `GrupoMiembro.dc.html`):
 * cuota, desglose, ventana de ingreso y datos de pago, todo tal como lo entrega la API.
 */
export function GroupSummaryTab({ group }: { group: GroupDetail }) {
  const isOwner = group.myRole === 'titular';
  return (
    <div className="flex flex-col gap-6">
      <Card as="section" aria-labelledby="group-my-share" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="group-my-share" className="text-muted">
            {shareLabel(isOwner)}
          </h2>
          <p className="font-display text-3xl font-bold">
            {formatBs(group.myShareCents)} <span className="text-lg text-muted">por mes</span>
          </p>
          {isOwner && (
            <p className="text-[15px] text-muted">
              Como titular no tienes cobro propio: esta cuota es solo de referencia.
            </p>
          )}
        </div>
        <BreakdownList breakdown={group.breakdown} />
        <p className="text-[15px] text-muted">
          Si cambia el precio, el tipo de cambio o los miembros, la cuota se actualiza desde el
          siguiente cobro.
        </p>
      </Card>
      <EntryWindowSection entry={group.entryWindow} />
      <ShortfallLinkSection groupId={group.id} isOwner={isOwner} />
      <PaymentInfoSection
        paymentInfo={group.paymentInfo}
        isOwner={isOwner}
        groupName={group.name}
      />
    </div>
  );
}
