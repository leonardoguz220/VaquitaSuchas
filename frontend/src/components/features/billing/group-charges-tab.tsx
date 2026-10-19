'use client';

import Link from 'next/link';
import { useId, useState, type ReactNode } from 'react';
import { Alert, Badge, Button, Card, Select } from '@/components/ui';
import { useBillingSummary, useGroupCharges } from '@/hooks/use-charges';
import { formatCalendarDate, formatDeadlineLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath } from '@/lib/routes';
import type { GroupChargeItem, OwnerTotals, PeriodSummary } from '@/services/charges';
import type { GroupDetail } from '@/services/groups';
import { chargeDueText, chargeErrorMessage } from './charge-messages';
import { ChargeTimeline } from './charge-timeline';
import { ReviewQueue } from './review-queue';

/** Estado vacío del grupo sin cobros (plan 002 §6). */
export const NO_CHARGES_YET = 'Aún no hay cobros: se generan solos en la fecha de corte';

function Section({
  title,
  children,
  headerExtra,
}: {
  title: string;
  children: ReactNode;
  headerExtra?: ReactNode;
}) {
  const titleId = useId();
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id={titleId} className="font-display text-xl font-bold">
          {title}
        </h2>
        {headerExtra}
      </div>
      {children}
    </Card>
  );
}

function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div
        aria-hidden="true"
        className="h-32 animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
    </div>
  );
}

/** Totales del titular (RF-002-18): los cuatro montos que entrega la API, sin sumar nada. */
function OwnerTotalsList({ totals }: { totals: OwnerTotals }) {
  const items: Array<[string, number]> = [
    ['Esperado', totals.expectedCents],
    ['Cobrado', totals.collectedCents],
    ['Pendiente (incluye en revisión)', totals.pendingCents],
    ['Atrasado', totals.overdueCents],
  ];
  return (
    <dl aria-label="Totales del período" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(([term, cents]) => (
        <div key={term} className="flex flex-col gap-1 rounded-field bg-bg p-3">
          <dt className="text-[15px] text-muted">{term}</dt>
          <dd className="font-display text-xl font-bold">{formatBs(cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Cuota del período tal como quedó en el ciclo (RN-002-09). */
function CycleShare({ summary }: { summary: PeriodSummary }) {
  const rows: Array<[string, string]> = [
    ['Total del mes', formatBs(summary.totalBsCents)],
    ['Miembros, contando al titular', String(summary.memberCount)],
    ['Cada miembro', formatBs(summary.baseShareCents)],
    ['Parte del titular (referencia)', formatBs(summary.ownerShareCents)],
  ];
  return (
    <dl className="flex flex-col">
      {rows.map(([term, value]) => (
        <div
          key={term}
          className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0"
        >
          <dt className="text-muted">{term}</dt>
          <dd className="font-bold">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SummaryBody({ summary, isOwner }: { summary: PeriodSummary; isOwner: boolean }) {
  return (
    <>
      <p className="text-[15px] text-muted">
        Corte: {formatCalendarDate(summary.cutDate)} · Vence: {formatDeadlineLaPaz(summary.dueAt)}
      </p>
      {summary.cycleType === 'inicial' && (
        <p className="text-[15px]">
          Es el período en que se creó el grupo: no hay cobros regulares; solo aparecen los pagos de
          ingreso.
        </p>
      )}
      {summary.ownerTotals && <OwnerTotalsList totals={summary.ownerTotals} />}
      {summary.rows.length === 0 ? (
        <p className="text-muted">No hay cobros de miembros en este período.</p>
      ) : (
        <ul aria-label="Estado por miembro" className="flex flex-col">
          {summary.rows.map(({ charge, isFormerMember }) => (
            <li
              key={charge.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line py-3 last:border-b-0"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                {isOwner ? (
                  <Link
                    href={chargePath(charge.id)}
                    className="inline-flex min-h-11 items-center self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  >
                    {charge.member.fullName}
                  </Link>
                ) : (
                  <span className="font-bold">{charge.member.fullName}</span>
                )}
                {isFormerMember && (
                  <span className="text-[15px] text-muted">Ya no es miembro del grupo</span>
                )}
              </div>
              <span className="font-bold">{formatBs(charge.amountCents)}</span>
              <Badge variant={charge.status} />
            </li>
          ))}
        </ul>
      )}
      <details className="group">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Cuota de este período
        </summary>
        <CycleShare summary={summary} />
      </details>
    </>
  );
}

/**
 * Resumen del mes (RF-002-16, RF-002-18; CA-002-17, CA-002-20): selector con los períodos que
 * entrega la API, estado y monto por miembro (sin comprobantes ni referencias) y, para el
 * titular, los totales que calcula el backend.
 */
function MonthSummary({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const [period, setPeriod] = useState<string | null>(null);
  const { status, data: summary, error, reload } = useBillingSummary(groupId, period);
  // Se recuerdan los períodos para que el selector no desaparezca mientras carga otro.
  const [periods, setPeriods] = useState<string[]>([]);
  const latest = summary?.availablePeriods;
  if (latest && latest.length > 0 && latest.join() !== periods.join()) setPeriods(latest);
  const selected = period ?? summary?.period ?? '';
  const options = periods.length > 0 ? periods : selected ? [selected] : [];

  const selector =
    options.length > 0 ? (
      <div className="w-full sm:w-56">
        <Select
          label="Período"
          value={selected}
          onChange={(event) => setPeriod(event.target.value)}
        >
          {options.map((value) => (
            <option key={value} value={value}>
              {formatPeriod(value)}
            </option>
          ))}
        </Select>
      </div>
    ) : null;

  const title = summary
    ? `Cobros de ${formatPeriod(summary.period).toLowerCase()}`
    : 'Cobros del mes';

  return (
    <Section title={title} headerExtra={selector}>
      {(status === 'loading' || status === 'redirecting') && (
        <Skeleton label="Cargando el resumen del mes…" />
      )}
      {status === 'error' && error && error.statusCode === 404 && (
        <p className="text-muted">{NO_CHARGES_YET}.</p>
      )}
      {status === 'error' && error && error.statusCode !== 404 && (
        <Alert
          variant="error"
          title="No pudimos cargar el resumen del mes."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {chargeErrorMessage(error)}
        </Alert>
      )}
      {status === 'success' && summary && <SummaryBody summary={summary} isOwner={isOwner} />}
    </Section>
  );
}

function HistoryItem({ charge, isOwner }: { charge: GroupChargeItem; isOwner: boolean }) {
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-bold">
            {charge.member.fullName} · {formatPeriod(charge.period)}
          </span>
          <span className="text-[15px] text-muted">{chargeDueText(charge)}</span>
        </div>
        <span className="font-bold">{formatBs(charge.amountCents)}</span>
        <Badge variant={charge.status} />
      </div>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-bold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
          Línea de tiempo
        </summary>
        <ChargeTimeline
          events={charge.timeline}
          label={`Línea de tiempo de ${charge.member.fullName}, ${formatPeriod(charge.period)}`}
        />
        {isOwner && (
          <Link
            href={chargePath(charge.id)}
            className="mt-2 inline-flex min-h-11 items-center rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Ver el cobro
          </Link>
        )}
      </details>
    </li>
  );
}

/** Historial del grupo (RF-002-17, CA-002-18), paginado por la API, con la línea de tiempo. */
function ChargeHistory({ groupId, isOwner }: { groupId: string; isOwner: boolean }) {
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useGroupCharges(groupId);

  return (
    <Section title="Historial del grupo">
      {(status === 'loading' || status === 'redirecting') && (
        <Skeleton label="Cargando el historial…" />
      )}
      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar el historial."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {chargeErrorMessage(error)}
        </Alert>
      )}
      {status === 'success' && items.length === 0 && (
        <p className="text-muted">{NO_CHARGES_YET}.</p>
      )}
      {status === 'success' && items.length > 0 && (
        <ul aria-label="Cobros del grupo" className="flex flex-col">
          {items.map((charge) => (
            <HistoryItem key={charge.id} charge={charge} isOwner={isOwner} />
          ))}
        </ul>
      )}
      {status === 'success' && loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más cobros.">
          {chargeErrorMessage(loadMoreError)}
        </Alert>
      )}
      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="sm:self-start"
        >
          Ver más cobros
        </Button>
      )}
    </Section>
  );
}

/**
 * Pestaña **Cobros** de `/grupos/[id]` (spec 002 T037, plan §6; mockup `Grupo.dc.html`): el
 * titular ve primero la cola «Por revisar» (T026); todos ven el resumen del mes con su selector
 * de período y el historial del grupo. Nada se calcula en el cliente.
 */
export function GroupChargesTab({ group }: { group: GroupDetail }) {
  const isOwner = group.myRole === 'titular';
  return (
    <div className="flex flex-col gap-5">
      {isOwner && <ReviewQueue groupId={group.id} />}
      <MonthSummary groupId={group.id} isOwner={isOwner} />
      <ChargeHistory groupId={group.id} isOwner={isOwner} />
    </div>
  );
}
