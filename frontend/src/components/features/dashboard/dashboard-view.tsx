'use client';

import { useState, type ReactNode } from 'react';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { Alert, Badge, Button, Select } from '@/components/ui';
import { useDashboard, type DashboardFilters } from '@/hooks/use-dashboard';
import { useGroups } from '@/hooks/use-groups';
import { formatPeriod } from '@/lib/dates';
import { formatBs, formatSignedBs } from '@/lib/money';
import { JOIN_PATH, NEW_GROUP_PATH, PANEL_CALENDAR_PATH } from '@/lib/routes';
import type { DashboardSummary, SpendLine } from '@/services/reports';
import { ChargeLinesSection } from './charge-lines-section';
import { DashboardCharts } from './dashboard-charts';
import { CollectionCard } from './collection-card';
import {
  chargesCount,
  DASHBOARD_MESSAGES,
  dashboardErrorMessage,
  ROLE_LABEL,
} from './dashboard-messages';

/** Pantallas del panel que ya existen. */
const PANEL_LINKS = [{ href: PANEL_CALENDAR_PATH, label: 'Calendario' }];

function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <span className="sr-only">Cargando tu panel…</span>
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-32 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

function Tile({
  title,
  value,
  badge,
  children,
}: {
  title: string;
  value: string;
  badge?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-bold text-muted">{title}</h2>
        {badge}
      </div>
      <p className="font-display text-3xl leading-tight font-bold">{value}</p>
      {children}
    </section>
  );
}

function AlertIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="mt-0.5 size-4 shrink-0"
      fill="currentColor"
    >
      <path d="M10 1.8 19 18H1L10 1.8Zm-.9 5.7v5h1.8v-5H9.1Zm.9 8.3a1.1 1.1 0 1 0 0-2.2 1.1 1.1 0 0 0 0 2.2Z" />
    </svg>
  );
}

/** Ahorro estimado (RF-006-03, RN-006-03; CA-006-05, CA-006-21): todo viene de la API. */
function SavingsTile({ savings }: { savings: DashboardSummary['savings'] }) {
  return (
    <Tile
      title="Ahorro estimado"
      value={
        savings.totalCents === null ? DASHBOARD_MESSAGES.noData : formatSignedBs(savings.totalCents)
      }
      badge={<Badge variant="info">Estimado</Badge>}
    >
      <p className="text-[15px] text-muted">{DASHBOARD_MESSAGES.savingsEstimated}</p>
      {savings.lines.length > 0 && (
        <ul aria-label="Ahorro por suscripción" className="flex flex-col gap-1 text-[15px]">
          {savings.lines.map((line) => (
            <li key={line.groupId} className="flex justify-between gap-3">
              <span>{line.serviceName}</span>
              <span className="font-bold">{formatSignedBs(line.savingsCents)}</span>
            </li>
          ))}
        </ul>
      )}
      {savings.withoutData.length > 0 && (
        <ul aria-label="Suscripciones sin dato" className="flex flex-col gap-1 text-[15px]">
          {savings.withoutData.map((item) => (
            <li key={item.groupId} className="flex justify-between gap-3">
              <span>{item.serviceName}</span>
              <span className="text-muted">{DASHBOARD_MESSAGES.noData}</span>
            </li>
          ))}
        </ul>
      )}
      {savings.negativeNote && (
        <p className="flex gap-1.5 rounded-field bg-status-pendiente-bg px-3 py-2 text-[15px] text-status-pendiente-fg">
          <AlertIcon />
          <span>
            <span className="font-bold">Nota: </span>
            {savings.negativeNote}
          </span>
        </p>
      )}
    </Tile>
  );
}

function SpendLineRow({ line }: { line: SpendLine }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <ServiceLogo name={line.serviceName} logoUrl={line.logoUrl} brandColor={null} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-bold">{line.groupName}</span>
        <span className="text-[15px] text-muted">
          {line.serviceName} · {ROLE_LABEL[line.role]}
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-display text-lg font-bold">{formatBs(line.costCents)}</span>
        <span className="text-[15px] text-muted">
          {line.paidCents === null
            ? DASHBOARD_MESSAGES.ownerReference
            : `Pagado: ${formatBs(line.paidCents)}`}
        </span>
      </div>
    </li>
  );
}

function EmptyNoGroups() {
  return (
    <section
      aria-labelledby="panel-empty-title"
      className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="panel-empty-title" className="font-display text-xl font-bold">
        Aún no tienes suscripciones
      </h2>
      <p className="text-muted">
        Crea un grupo para compartir una suscripción o únete a uno con el código que te pasaron.
        Aquí verás tu gasto, tu ahorro y lo que debes.
      </p>
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
        <Button href={NEW_GROUP_PATH}>Crear un grupo</Button>
        <Button href={JOIN_PATH} variant="secondary">
          Unirme con un código
        </Button>
      </div>
    </section>
  );
}

/** Tarjetas y desglose del mes elegido (RF-006-02 a RF-006-05). */
function DashboardContent({
  data,
  filters,
}: {
  data: DashboardSummary;
  filters: DashboardFilters;
}) {
  return (
    <>
      {data.isEmpty && (
        <Alert variant="info" title={`No hay cobros en ${formatPeriod(data.month)}.`}>
          Elige otro mes o revisa tus suscripciones. Lo que debes de otros meses sigue abajo.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile title="Gasto del mes" value={formatBs(data.spend.totalCents)}>
          <p className="text-[15px] text-muted">Pagado: {formatBs(data.spend.paidCents)}</p>
        </Tile>
        <SavingsTile savings={data.savings} />
        <Tile title="Debes" value={formatBs(data.debts.totalCents)}>
          <p className="text-[15px] text-muted">
            {chargesCount(data.debts.count)} pendientes o atrasados
          </p>
          <p className="text-[15px] text-muted">
            En revisión: {formatBs(data.debts.inReviewCents)} ·{' '}
            {chargesCount(data.debts.inReviewCount)}
          </p>
        </Tile>
        {data.owed && (
          <Tile
            title="Te deben"
            value={formatBs(data.owed.totalCents)}
            badge={<Badge variant="neutral">Titular</Badge>}
          >
            <p className="text-[15px] text-muted">
              {chargesCount(data.owed.count)} de tus miembros
            </p>
            {data.owed.groups.length > 0 && (
              <ul aria-label="Te deben por grupo" className="flex flex-col gap-1 text-[15px]">
                {data.owed.groups.map((group) => (
                  <li key={group.groupId} className="flex justify-between gap-3">
                    <span>
                      {group.groupName} · {chargesCount(group.count)}
                    </span>
                    <span className="font-bold">{formatBs(group.totalCents)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Tile>
        )}
      </div>

      {data.spend.lines.length > 0 && (
        <section
          aria-labelledby="spend-lines-title"
          className="flex flex-col rounded-card border border-line bg-surface p-4 sm:p-5"
        >
          <h2 id="spend-lines-title" className="font-display text-xl font-bold">
            Gasto por suscripción
          </h2>
          <ul aria-label="Gasto por suscripción" className="divide-y divide-line">
            {data.spend.lines.map((line) => (
              <SpendLineRow key={line.groupId} line={line} />
            ))}
          </ul>
          <p className="flex justify-between gap-3 border-t border-line pt-3 font-bold">
            <span>Total del mes</span>
            <span>{formatBs(data.spend.totalCents)}</span>
          </p>
        </section>
      )}

      {data.collection.length > 0 && (
        <section aria-labelledby="collection-title" className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h2 id="collection-title" className="font-display text-xl font-bold">
              Cobranza de tus grupos
            </h2>
            <p className="text-[15px] text-muted">
              {formatPeriod(data.month)} · los grupos donde eres titular.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {data.collection.map((summary) => (
              <CollectionCard key={summary.groupId} summary={summary} />
            ))}
          </div>
        </section>
      )}

      <ChargeLinesSection list="debts" />
      <ChargeLinesSection list="in_review" />
      {data.owed && <ChargeLinesSection list="owed" />}

      <DashboardCharts filters={filters} month={data.month} />
    </>
  );
}

/** Opciones del mes: las de la API y, si no está entre ellas, el mes mostrado. */
function monthOptions(data: DashboardSummary | null, month: string | null): string[] {
  if (!data) return month ? [month] : [];
  return data.availableMonths.includes(data.month)
    ? data.availableMonths
    : [data.month, ...data.availableMonths];
}

/**
 * `/panel` (spec 006 T012, plan §6; mockup `Panel.dc.html`): selector de mes y filtro por
 * suscripción aplicados por la API; tarjetas de gasto (con lo pagado), ahorro estimado («sin
 * dato» y nota si es negativo), lo que debes (con «En revisión» aparte) y lo que te deben (solo
 * titular); listas con acceso a cada cobro. Celular primero: las tarjetas se apilan. El cliente
 * no suma ni calcula: muestra los centavos de la API con `formatBs`.
 */
export function DashboardView() {
  const [month, setMonth] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const { status, data, error, reload } = useDashboard({ month, groupId });
  const groups = useGroups();
  const months = monthOptions(data, month);
  const noGroups = status === 'success' && data !== null && !data.hasGroups;

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Panel
        </h1>
        <p className="text-muted">Tu gasto, tu ahorro y lo que debes, mes a mes.</p>
      </div>
      <nav aria-label="Secciones del panel" className="flex flex-wrap gap-2">
        {PANEL_LINKS.map((link) => (
          <Button key={link.href} href={link.href} variant="secondary">
            {link.label}
          </Button>
        ))}
      </nav>

      {!noGroups && (
        <div className="grid gap-4 sm:grid-cols-2 lg:max-w-2xl">
          <Select
            label="Mes"
            value={month ?? data?.month ?? ''}
            disabled={months.length === 0}
            onChange={(event) => setMonth(event.target.value || null)}
          >
            {months.length === 0 && <option value="">Mes actual</option>}
            {months.map((value) => (
              <option key={value} value={value}>
                {formatPeriod(value)}
              </option>
            ))}
          </Select>
          <Select
            label="Suscripción"
            value={groupId ?? ''}
            onChange={(event) => setGroupId(event.target.value || null)}
          >
            <option value="">Todas las suscripciones</option>
            {groups.items.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {(status === 'loading' || status === 'redirecting') && <DashboardSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar tu panel."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {dashboardErrorMessage(error)}
        </Alert>
      )}

      {noGroups && <EmptyNoGroups />}

      {status === 'success' && data && data.hasGroups && (
        <DashboardContent data={data} filters={{ month, groupId }} />
      )}
    </>
  );
}
