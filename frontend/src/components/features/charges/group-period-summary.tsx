import type { ReactNode } from 'react';
import { Card, Select } from '@/components/ui';
import { formatCalendarDayLaPaz, formatDueDateLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import type { BillingSummary } from '@/services/charges';
import { ChargeRowContent } from './group-charge-parts';

export function PeriodSelect({
  periods,
  value,
  onChange,
  disabled,
}: {
  periods: readonly string[];
  value: string;
  onChange: (period: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="w-full sm:w-56">
      <Select
        label="Período"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {periods.map((period) => (
          <option key={period} value={period}>
            {formatPeriod(period)}
          </option>
        ))}
      </Select>
    </div>
  );
}

function Fact({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{term}</dt>
      <dd className="text-right font-bold tabular-nums">{value}</dd>
    </div>
  );
}

/** Totales del titular tal como los entrega la API (RF-002-18): no se suman en el cliente. */
function OwnerTotals({ totals }: { totals: NonNullable<BillingSummary['ownerTotals']> }) {
  const items = [
    { label: 'Esperado', cents: totals.expectedCents },
    { label: 'Cobrado', cents: totals.collectedCents },
    { label: 'Pendiente', cents: totals.pendingCents },
    { label: 'Atrasado', cents: totals.overdueCents },
  ];
  return (
    <dl aria-label="Totales del mes" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.label}
          className="flex flex-col gap-1 rounded-card border border-line bg-surface p-4"
        >
          <dt className="text-[15px] text-muted">{item.label}</dt>
          <dd className="font-display text-xl font-bold tabular-nums">{formatBs(item.cents)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Datos del ciclo, totales (solo si la API los trae) y estado y monto de cada miembro. */
export function PeriodSummaryView({
  summary,
  reviewQueue,
}: {
  summary: BillingSummary;
  reviewQueue?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card as="div" className="flex flex-col gap-3">
        <dl aria-label="Datos del ciclo" className="flex flex-col gap-2 text-[15px]">
          <Fact term="Fecha de corte" value={formatCalendarDayLaPaz(summary.cutDate)} />
          <Fact term="Vence el" value={formatDueDateLaPaz(summary.dueAt)} />
          <Fact term="Total del mes" value={formatBs(summary.totalBsCents)} />
          <Fact term="Cuota por miembro" value={formatBs(summary.baseShareCents)} />
          <Fact term="Cuota del titular (referencia)" value={formatBs(summary.ownerShareCents)} />
        </dl>
      </Card>
      {summary.ownerTotals && <OwnerTotals totals={summary.ownerTotals} />}
      {reviewQueue}
      {summary.rows.length === 0 ? (
        <p className="text-muted">Este período no tiene cobros.</p>
      ) : (
        <ul
          aria-label="Cobros del mes"
          className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface"
        >
          {summary.rows.map((row) => (
            <li key={row.charge.id} className="px-4 py-3 sm:px-5">
              <ChargeRowContent charge={row.charge} isFormerMember={row.isFormerMember} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
