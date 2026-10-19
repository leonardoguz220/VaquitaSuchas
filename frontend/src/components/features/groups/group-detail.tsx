'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { GroupChargesTab } from '@/components/features/charges/group-charges-tab';
import { GroupCollectionTab } from '@/components/features/dashboard/group-collection-tab';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { GroupRankingTab } from '@/components/features/reputation/group-ranking-tab';
import { Badge, Button, Card } from '@/components/ui';
import { useGroup } from '@/hooks/use-group';
import type { GroupDetail } from '@/services/groups';
import { GroupLoadError } from './group-load-error';
import { groupStatusTags } from './group-labels';
import { GroupMembersTab } from './group-members-tab';
import { GroupSummaryTab } from './group-summary-tab';
import { GroupTabs, panelId, tabId, type GroupTab } from './group-tabs';

const GROUPS_PATH = '/grupos';
const TABS_PREFIX = 'grupo';

/**
 * Pestañas de T020, Cobros (002 T037), Ranking (007 T026) y Cobranza del titular (006 T014).
 * Solicitudes y Ajustes se agregan en sus tareas.
 */
type GroupTabId = 'resumen' | 'miembros' | 'cobros' | 'ranking' | 'cobranza' | 'publicar';

const TABS: readonly GroupTab<GroupTabId>[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'miembros', label: 'Miembros' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'ranking', label: 'Ranking' },
];

const OWNER_TABS: readonly GroupTab<GroupTabId>[] = [
  ...TABS,
  { id: 'cobranza', label: 'Cobranza' },
  { id: 'publicar', label: 'Publicar cupos' },
];

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">Cargando el grupo…</span>
      <div aria-hidden="true" className="flex items-center gap-3">
        <div className="size-11 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        <div className="h-8 w-48 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
      </div>
      <div
        aria-hidden="true"
        className="h-12 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none"
      />
      {[0, 1].map((card) => (
        <div
          key={card}
          aria-hidden="true"
          className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <div className="h-6 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-full animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          <div className="h-5 w-2/3 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function NotFound() {
  return (
    <Card
      as="section"
      aria-labelledby="group-not-found"
      className="flex flex-col items-start gap-3"
    >
      <h1 id="group-not-found" className="font-display text-2xl font-bold">
        Grupo no encontrado
      </h1>
      <p className="text-muted">Este grupo no existe o no eres parte de él.</p>
      <Button href={GROUPS_PATH}>Ir a Mis suscripciones</Button>
    </Card>
  );
}

function GroupHeader({ group }: { group: GroupDetail }) {
  const { service } = group;
  const facts = [
    service.planName ? `${service.name} · ${service.planName}` : service.name,
    `${group.breakdown.memberCount} de ${group.totalSlots} cupos`,
    `Cobro el día ${group.billingDay} de cada mes`,
  ];
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <ServiceLogo
          name={service.name}
          logoUrl={service.logoUrl}
          brandColor={service.brandColor}
        />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-3xl leading-tight font-bold tracking-tight break-words sm:text-4xl">
            {group.name}
          </h1>
          <div className="flex flex-wrap gap-2">
            <Badge variant={group.myRole === 'titular' ? 'success' : 'neutral'}>
              {group.myRole === 'titular' ? 'Eres titular' : 'Eres miembro'}
            </Badge>
            {groupStatusTags(group.status, group.frozenReason).map((tag) => (
              <Badge key={tag.label} variant={tag.variant}>
                {tag.label}
              </Badge>
            ))}
          </div>
        </div>
      </div>
      <p className="text-[15px] text-muted">{facts.join(' · ')}</p>
    </header>
  );
}

export interface OwnerPanelActions {
  /** Muestra el grupo que devolvió la API tras un cambio del titular. */
  onGroupChange: (group: GroupDetail) => void;
}

export interface GroupDetailViewProps {
  groupId: string;
  /**
   * Panel que solo ve el titular, entre la cabecera y las pestañas (el del código de invitación
   * de T025).
   */
  ownerPanel?: (group: GroupDetail, actions: OwnerPanelActions) => ReactNode;
  /** Cola «Por revisar» del titular dentro de la pestaña Cobros (002 T026). */
  reviewQueue?: (group: GroupDetail) => ReactNode;
  /** Pestaña «Publicar cupos» del titular (008 T011). */
  listingTab?: (group: GroupDetail) => ReactNode;
  /** Insignia «El grupo publicó cupos» que ven los miembros (008 T011). */
  memberBadge?: (group: GroupDetail) => ReactNode;
}

/**
 * Pantalla `/grupos/[id]` (plan 001 §6): cabecera del grupo y pestañas Resumen, Miembros y Cobros.
 * Un `404` de la API (grupo ajeno o inexistente) muestra «Grupo no encontrado» (CA-001-10).
 */
export function GroupDetailView({
  groupId,
  ownerPanel,
  reviewQueue,
  listingTab,
  memberBadge,
}: GroupDetailViewProps) {
  const { state, retry, update } = useGroup(groupId);
  const [tab, setTab] = useState<GroupTabId>('resumen');

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={GROUPS_PATH}
        className="inline-flex min-h-11 items-center self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        <span aria-hidden="true">←&nbsp;</span>Mis suscripciones
      </Link>

      {state.status === 'loading' && <DetailSkeleton />}
      {state.status === 'redirecting' && (
        <p role="status" className="text-muted">
          Redirigiendo para iniciar sesión…
        </p>
      )}
      {state.status === 'not_found' && <NotFound />}
      {state.status === 'error' && (
        <GroupLoadError error={state.error} what="el grupo" onRetry={retry} />
      )}

      {state.status === 'success' && (
        <>
          <GroupHeader group={state.group} />
          {state.group.myRole === 'titular' && ownerPanel?.(state.group, { onGroupChange: update })}
          {state.group.myRole !== 'titular' && memberBadge?.(state.group)}
          <GroupTabs
            idPrefix={TABS_PREFIX}
            label="Secciones del grupo"
            tabs={state.group.myRole === 'titular' ? OWNER_TABS : TABS}
            selected={tab}
            onSelect={setTab}
          />
          <div
            role="tabpanel"
            id={panelId(TABS_PREFIX, tab)}
            aria-labelledby={tabId(TABS_PREFIX, tab)}
            tabIndex={0}
            className="focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            {tab === 'resumen' && <GroupSummaryTab group={state.group} />}
            {tab === 'miembros' && <GroupMembersTab members={state.group.members} />}
            {tab === 'cobros' && (
              <GroupChargesTab
                groupId={state.group.id}
                isOwner={state.group.myRole === 'titular'}
                reviewQueue={reviewQueue?.(state.group)}
              />
            )}
            {tab === 'ranking' && <GroupRankingTab groupId={state.group.id} />}
            {tab === 'cobranza' && state.group.myRole === 'titular' && (
              <GroupCollectionTab groupId={state.group.id} />
            )}
            {tab === 'publicar' && state.group.myRole === 'titular' && listingTab?.(state.group)}
          </div>
        </>
      )}
    </div>
  );
}
