'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useCharge } from '@/hooks/use-charges';
import { formatDateTimeLaPaz, formatDeadlineLaPaz, formatPeriod } from '@/lib/dates';
import { formatExchangeRate } from '@/lib/exchange-rate';
import { formatBs, formatPrice } from '@/lib/money';
import { CHARGES_PATH } from '@/lib/routes';
import type { Charge, ChargeAction } from '@/services/charges';
import { ChargeCountdown } from './charge-countdown';
import { CHARGE_MESSAGES, chargeErrorMessage } from './charge-messages';
import { ChargePaymentInfoCard } from './charge-payment-info';
import { ChargeTimeline } from './charge-timeline';
import { ReceiptUpload } from './receipt-upload';

/** Acciones que solo ofrece el backend al titular del grupo (contrato 002, `allowedActions`). */
const OWNER_ACTIONS: ChargeAction[] = ['confirm', 'reject', 'manualPayment', 'cancel'];

/** Indica si la API le ofrece a quien consulta alguna acción de titular sobre el cobro. */
export function hasOwnerActions(charge: Pick<Charge, 'allowedActions'>): boolean {
  return charge.allowedActions.some((action) => OWNER_ACTIONS.includes(action));
}

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

function BackLink() {
  return (
    <Link
      href={CHARGES_PATH}
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">←</span> Volver a mis cobros
    </Link>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando el cobro…</span>
      <div
        aria-hidden="true"
        className="h-10 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
      <div
        aria-hidden="true"
        className="h-56 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
    </div>
  );
}

/** Vencimiento, cuenta regresiva o fecha de pago según el `status` de la API. */
function DueLine({ charge, onDue }: { charge: Charge; onDue: () => void }) {
  switch (charge.status) {
    case 'pendiente':
      return (
        <div className="flex flex-col gap-1">
          <p>Vence el {formatDeadlineLaPaz(charge.dueAt)}.</p>
          <ChargeCountdown dueAt={charge.dueAt} onEnd={onDue} />
          <p className="text-[15px] text-muted">{CHARGE_MESSAGES.overdueWarning}</p>
        </div>
      );
    case 'en_revision':
      return (
        <p>
          Vence el {formatDeadlineLaPaz(charge.dueAt)}. El comprobante está en revisión: el titular
          lo confirmará o lo rechazará.
        </p>
      );
    case 'atrasado':
      return <p className="font-bold">Venció el {formatDeadlineLaPaz(charge.dueAt)}.</p>;
    case 'pagado':
      return (
        <div className="flex flex-col gap-1">
          {charge.paidAt && <p>Pagado el {formatDateTimeLaPaz(charge.paidAt)}.</p>}
          {charge.settlement === 'manual' && <p>Pago en efectivo registrado por el titular.</p>}
          {charge.settlement === 'ingreso' && <p>Es el pago de ingreso al grupo.</p>}
          {charge.manualNote && <p className="break-words">Nota: {charge.manualNote}</p>}
        </div>
      );
    case 'cancelado':
      return (
        <div className="flex flex-col gap-1">
          <p>El titular canceló este cobro: ya no cuenta como deuda.</p>
          {charge.cancelReason && <p className="break-words">Motivo: {charge.cancelReason}</p>}
        </div>
      );
  }
}

/** Copia del cobro (RF-002-02): precio, tipo de cambio, total y miembros, tal como los guardó. */
function SnapshotList({ charge }: { charge: Charge }) {
  const rows: Array<[string, string]> = [
    ['Precio del plan', formatPrice(charge.priceCents, charge.currency)],
  ];
  if (charge.currency === 'USD' && charge.exchangeRate) {
    rows.push(['Tipo de cambio', formatExchangeRate(charge.exchangeRate)]);
  }
  rows.push(['Total del mes', formatBs(charge.totalBsCents)]);
  rows.push(['Miembros, contando al titular', String(charge.memberCount)]);
  rows.push(['Emitido', formatDateTimeLaPaz(charge.issuedAt)]);
  return (
    <dl className="flex flex-col">
      {rows.map(([term, value]) => (
        <div
          key={term}
          className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
        >
          <dt className="text-muted">{term}</dt>
          <dd className="font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface ChargeDetailContentProps {
  charge: Charge;
  /** Vuelve a pedir el cobro sin pasar por "cargando". */
  onRefresh: () => void;
  /** Acciones según `allowedActions` (subir comprobante, revisar). */
  actions?: ReactNode;
}

/** Contenido del detalle con datos (separado para componer las acciones de cada rol). */
export function ChargeDetailContent({ charge, onRefresh, actions }: ChargeDetailContentProps) {
  const ownerView = hasOwnerActions(charge);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Cobro de {formatPeriod(charge.period)}
        </h1>
        <p className="text-muted">A nombre de {charge.member.fullName}</p>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-4xl font-bold">{formatBs(charge.amountCents)}</span>
          <Badge variant={charge.status} />
        </div>
      </div>

      {charge.member.isFormerMember && charge.status === 'atrasado' && !ownerView && (
        <Alert variant="error">{CHARGE_MESSAGES.formerMemberDebt}</Alert>
      )}

      {charge.lastRejection && (
        <Alert variant="warning" title="El titular rechazó el último comprobante.">
          <p className="break-words">Motivo: {charge.lastRejection.reason}</p>
          {charge.lastRejection.invalidReceipt && <p>Lo marcó como comprobante inválido.</p>}
          <p className="text-[15px]">{formatDateTimeLaPaz(charge.lastRejection.at)}</p>
        </Alert>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-5">
          <Section title="Estado">
            <DueLine charge={charge} onDue={onRefresh} />
          </Section>
          {actions}
          <Section title="Historial de este cobro">
            <ChargeTimeline events={charge.timeline} label="Historial de este cobro" />
          </Section>
        </div>
        <div className="flex flex-col gap-5">
          {charge.paymentInfo && !ownerView && <ChargePaymentInfoCard info={charge.paymentInfo} />}
          <Section title="Cómo se calculó">
            <SnapshotList charge={charge} />
          </Section>
        </div>
      </div>
    </>
  );
}

export interface ChargeDetailViewProps {
  chargeId: string;
}

/**
 * Detalle del cobro `/cobros/[id]` (spec 002 T018, plan §6; mockup `Cobro.dc.html`): monto,
 * estado con color y texto, vencimiento con cuenta regresiva, datos de pago del titular, motivo
 * del último rechazo (CA-002-07) y línea de tiempo. `403` (cobro de otro miembro) y `404`
 * (ajeno, CA-002-23) muestran su aviso; el frontend no decide quién puede verlo. Con
 * `uploadReceipt` en `allowedActions` muestra la subida del comprobante (T022).
 */
export function ChargeDetailView({ chargeId }: ChargeDetailViewProps) {
  const { status, data: charge, error, reload, refresh, replace } = useCharge(chargeId);
  const [notice, setNotice] = useState<{ variant: 'success' | 'warning'; text: string } | null>(
    null,
  );

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
        {error.statusCode === 404 && (
          <Alert variant="warning" title="No encontramos este cobro.">
            Puede que no exista o que no sea de un grupo tuyo.
          </Alert>
        )}
        {error.statusCode === 403 && (
          <Alert variant="warning" title="Este cobro es de otro miembro.">
            Solo lo ven la persona que debe pagarlo y el titular del grupo.
          </Alert>
        )}
        {error.statusCode !== 404 && error.statusCode !== 403 && (
          <Alert
            variant="error"
            title="No pudimos cargar el cobro."
            action={
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            }
          >
            {chargeErrorMessage(error)}
          </Alert>
        )}
      </>
    );
  }

  if (!charge) return null;
  return (
    <>
      <BackLink />
      {notice && <Alert variant={notice.variant}>{notice.text}</Alert>}
      <ChargeDetailContent
        charge={charge}
        onRefresh={() => void refresh()}
        actions={
          charge.allowedActions.includes('uploadReceipt') && (
            <ReceiptUpload
              charge={charge}
              onUploaded={(updated) => {
                replace(updated);
                setNotice({ variant: 'success', text: CHARGE_MESSAGES.uploaded });
              }}
              onStale={(message) => {
                setNotice({ variant: 'warning', text: message });
                void refresh();
              }}
            />
          )
        }
      />
    </>
  );
}
