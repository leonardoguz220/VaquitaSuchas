import Link from 'next/link';
import { useId } from 'react';
import { formatCalendarDayLaPaz, formatPeriod } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { chargePath } from '@/components/features/charges/charge-labels';
import type { CollectionSummary } from '@/services/reports';

function daysLateText(days: number): string {
  return `${days} ${days === 1 ? 'día' : 'días'} de atraso`;
}

/**
 * Barra de lo cobrado (RF-006-06, RNF-006-05): el porcentaje lo calcula el backend y se muestra
 * en texto; la barra es decorativa y tiene borde, para no depender del color.
 */
function CollectedBar({ percent }: { percent: number }) {
  const width = Math.min(100, Math.max(0, percent));
  return (
    <div
      aria-hidden="true"
      className="h-3 w-full overflow-hidden rounded-full border border-field-border bg-bg"
    >
      <div className="h-full bg-primary" style={{ width: `${width}%` }} />
    </div>
  );
}

/**
 * Cobranza de un grupo del titular (RF-006-06; CA-006-09; mockup `Panel.dc.html`): esperado,
 * cobrado, en revisión y pendiente como los entrega la API, el porcentaje cobrado en texto y los
 * miembros atrasados con enlace a su cobro. No suma ni calcula nada.
 */
export function CollectionCard({
  summary,
  headingLevel = 3,
  showPeriod = true,
}: {
  summary: CollectionSummary;
  headingLevel?: 2 | 3;
  showPeriod?: boolean;
}) {
  const titleId = useId();
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const percentText =
    summary.percentCollected === null ? 'sin monto esperado' : `${summary.percentCollected} %`;
  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-col gap-0.5">
        <Heading id={titleId} className="font-display text-lg font-bold">
          {summary.groupName}
        </Heading>
        {showPeriod && (
          <p className="text-[15px] text-muted">
            {summary.serviceName} · {formatPeriod(summary.period)}
          </p>
        )}
      </div>
      <p className="font-bold">
        Cobrado {formatBs(summary.collectedCents)} de {formatBs(summary.expectedCents)} ·{' '}
        {percentText}
      </p>
      {summary.percentCollected !== null && <CollectedBar percent={summary.percentCollected} />}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-[15px] sm:grid-cols-3">
        <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
          <dt className="text-muted">Esperado</dt>
          <dd className="font-bold">{formatBs(summary.expectedCents)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
          <dt className="text-muted">Pendiente</dt>
          <dd className="font-bold">{formatBs(summary.pendingCents)}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:flex-col sm:justify-start">
          <dt className="text-muted">En revisión</dt>
          <dd className="font-bold">{formatBs(summary.inReviewCents)}</dd>
        </div>
      </dl>
      {summary.lateMembers.length === 0 ? (
        <p className="text-[15px] text-muted">Nadie está atrasado.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] font-bold">Atrasados</p>
          <ul aria-label={`Atrasados de ${summary.groupName}`} className="flex flex-col gap-2">
            {summary.lateMembers.map((member) => (
              <li
                key={member.chargeId}
                className="flex flex-col gap-1 rounded-field bg-status-atrasado-bg px-3 py-2 text-status-atrasado-fg sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <span className="font-bold">{member.fullName}</span> ·{' '}
                  {formatBs(member.amountCents)} · venció el{' '}
                  {formatCalendarDayLaPaz(member.dueDate)} · {daysLateText(member.daysLate)}
                </span>
                <Link
                  href={chargePath(member.chargeId)}
                  aria-label={`Revisar el cobro de ${member.fullName}`}
                  className="inline-flex min-h-11 items-center font-bold text-status-atrasado-fg underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Revisar
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
