import { useId, type ReactNode } from 'react';
import { Badge, Card } from '@/components/ui';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import { formatExchangeRate } from '@/lib/exchange-rate';
import { formatBs, formatPrice } from '@/lib/money';
import type { EntryWindow, GroupDetail, PaymentInfo } from '@/services/groups';

/** Aviso de RF-001-20 cuando el titular no configuró sus datos de pago. */
export const PAYMENT_INFO_MISSING = 'El titular aún no configuró sus datos de pago.';

function Section({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-display text-xl font-bold">
        {title}
      </h2>
      {children}
    </Card>
  );
}

function BreakdownStep({
  term,
  children,
  strong,
}: {
  term: string;
  children: ReactNode;
  strong?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0">
      <span className="text-muted">{term}</span>
      {strong ? <strong>{children}</strong> : <span className="font-bold">{children}</span>}
    </li>
  );
}

/**
 * Cuota y desglose (RF-001-12, RF-001-13): todo sale de `breakdown`; el frontend no divide ni
 * convierte. Lista vertical pensada para el celular.
 */
function ShareSection({ group }: { group: GroupDetail }) {
  const { breakdown } = group;
  const isOwner = group.myRole === 'titular';
  return (
    <Section title={isOwner ? 'Tu cuota de referencia' : 'Tu cuota'}>
      <p className="font-display text-4xl font-bold">
        {formatBs(group.myShareCents)}{' '}
        <span className="font-sans text-base font-normal text-muted">por mes</span>
      </p>
      <ol aria-label="Cómo se calcula" className="flex flex-col">
        <BreakdownStep term="Precio del plan">
          {formatPrice(breakdown.priceCents, breakdown.currency)}
        </BreakdownStep>
        {breakdown.currency === 'USD' && breakdown.exchangeRate && (
          <BreakdownStep term="× Tipo de cambio que definió el titular">
            {formatExchangeRate(breakdown.exchangeRate)}
          </BreakdownStep>
        )}
        <BreakdownStep term="= Total del mes" strong>
          {formatBs(breakdown.totalBsCents)}
        </BreakdownStep>
        <BreakdownStep term={`÷ ${breakdown.memberCount} miembros, contando al titular`} strong>
          {formatBs(breakdown.baseShareCents)}
        </BreakdownStep>
      </ol>
      <p className="text-[15px] text-muted">
        {isOwner
          ? `No tienes cobro propio: tu cuota es solo de referencia (${formatBs(breakdown.ownerShareCents)}, con los ${formatBs(breakdown.remainderCents)} que sobran del redondeo).`
          : 'Los centavos que sobran del redondeo los asume el titular.'}{' '}
        Si cambia el precio, el tipo de cambio o los miembros, la cuota se actualiza desde el
        siguiente cobro.
      </p>
    </Section>
  );
}

/** Ventana de ingreso (RF-001-22): abierta hasta… o se abre el…, con texto y no solo color. */
function EntryWindowSection({ window: entry }: { window: EntryWindow }) {
  return (
    <Section title="Ventana de ingreso">
      <div>
        {entry.isOpen ? (
          <Badge variant="success">Abierta</Badge>
        ) : (
          <Badge variant="neutral">Cerrada</Badge>
        )}
      </div>
      {entry.isOpen && entry.closesAt && (
        <p>Abierta hasta el {formatDateTimeLaPaz(entry.closesAt)}.</p>
      )}
      {!entry.isOpen && entry.opensAt && <p>Se abre el {formatDateLaPaz(entry.opensAt)}.</p>}
      <p className="text-[15px] text-muted">
        Solo durante los 3 primeros días de cada período se pueden abrir solicitudes de ingreso con
        el código, si hay cupo.
      </p>
      {!entry.acceptingMembers && (
        <p className="text-[15px] font-bold">El titular pausó la recepción de nuevos miembros.</p>
      )}
    </Section>
  );
}

function PaymentInfoSection({ info, isOwner }: { info: PaymentInfo; isOwner: boolean }) {
  return (
    <Section title={isOwner ? 'Tus datos de pago' : 'Datos de pago del titular'}>
      {!info.configured && (
        <p className="text-muted">
          {isOwner ? 'Aún no configuraste tus datos de pago.' : PAYMENT_INFO_MISSING}
        </p>
      )}
      {info.configured && info.qrUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración
        <img
          src={info.qrUrl}
          alt="QR de pago del titular"
          referrerPolicy="no-referrer"
          className="size-48 self-center rounded-field border border-line object-contain sm:self-start"
        />
      )}
      {info.configured && info.text && (
        <p className="break-words whitespace-pre-line">{info.text}</p>
      )}
    </Section>
  );
}

/**
 * Pestaña **Resumen** de `/grupos/[id]` (plan 001 §6; mockups `GrupoMiembro.dc.html` y
 * `Grupo.dc.html`): cuota y desglose, ventana de ingreso y datos de pago. `children` permite
 * agregar secciones del titular (por ejemplo, el código de invitación).
 */
export function GroupSummaryTab({ group, children }: { group: GroupDetail; children?: ReactNode }) {
  const isOwner = group.myRole === 'titular';
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-5">
        <ShareSection group={group} />
        {children}
      </div>
      <div className="flex flex-col gap-5">
        <PaymentInfoSection info={group.paymentInfo} isOwner={isOwner} />
        <EntryWindowSection window={group.entryWindow} />
      </div>
    </div>
  );
}
