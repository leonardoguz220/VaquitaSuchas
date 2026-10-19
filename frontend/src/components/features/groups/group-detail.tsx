'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { GroupChargesTab } from '@/components/features/charges/group-charges-tab';
import { GroupCollectionTab } from '@/components/features/dashboard/group-collection-tab';
import { ServiceLogo } from '@/components/features/catalog/ServiceLogo';
import { GroupRankingTab } from '@/components/features/reputation/group-ranking-tab';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useGroup } from '@/hooks/use-group';
import type { GroupDetail } from '@/services/groups';
import { GroupLoadError } from './group-load-error';
import { groupStatusTags } from './group-labels';
import { GroupMembersTab } from './group-members-tab';
import { GroupSettingsTab } from './group-settings-tab';
import { LeaveGroupPanel } from './leave-group-panel';
import { GroupSummaryTab } from './group-summary-tab';
import { GroupTabs, panelId, tabId, type GroupTab } from './group-tabs';

const GROUPS_PATH = '/grupos';
const SEARCH_PATH = '/cupos';
const TABS_PREFIX = 'grupo';

/**
 * Pestañas de T020, Cobros (002 T037), Ranking (007 T026), Cobranza del titular (006 T014) y
 * Solicitudes del titular (010 T018). Ajustes (T029: recepción de miembros).
 */
type GroupTabId =
  | 'resumen'
  | 'miembros'
  | 'cobros'
  | 'ranking'
  | 'cobranza'
  | 'solicitudes'
  | 'publicar'
  | 'ajustes';

const TABS: readonly GroupTab<GroupTabId>[] = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'miembros', label: 'Miembros' },
  { id: 'cobros', label: 'Cobros' },
  { id: 'ranking', label: 'Ranking' },
];

const OWNER_TABS: readonly GroupTab<GroupTabId>[] = [
  ...TABS,
  { id: 'solicitudes', label: 'Solicitudes' },
  { id: 'cobranza', label: 'Cobranza' },
  { id: 'publicar', label: 'Publicar cupos' },
  { id: 'ajustes', label: 'Ajustes' },
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

/**
 * Banners de solo lectura (RF-001-18, plan §6): un grupo cerrado no genera cobros y un grupo con
 * titular baneado queda sin dueño activo; ambos solo se consultan. El de titular baneado ofrece
 * buscar otro grupo (spec 008, `/cupos`). Los textos salen del estado que entrega la API.
 */
export function ReadOnlyNotices({ group }: { group: GroupDetail }) {
  return (
    <>
      {group.status === 'cerrado' && (
        <Alert variant="info" title="Grupo cerrado: solo lectura">
          Ya no genera cobros ni recibe miembros. Puedes consultar su historial.
        </Alert>
      )}
      {group.frozenReason === 'titular_baneado' && (
        <Alert
          variant="warning"
          title="El titular fue baneado: solo lectura"
          action={
            <Button variant="secondary" href={SEARCH_PATH}>
              Buscar otro grupo
            </Button>
          }
        >
          Este grupo no tiene un titular activo, así que no se puede cambiar nada desde aquí.
        </Alert>
      )}
    </>
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
  /** Pestaña «Solicitudes» del titular: cupos y cola de solicitudes (010 T018). */
  requestsTab?: (group: GroupDetail) => ReactNode;
  /** Pestaña «Publicar cupos» del titular (008 T011). */
  listingTab?: (group: GroupDetail) => ReactNode;
  /** Insignia «El grupo publicó cupos» que ven los miembros (008 T011). */
  memberBadge?: (group: GroupDetail) => ReactNode;
  /** Acciones de administración sobre el grupo; cada panel decide si lo muestra (spec 009 T021). */
  adminPanel?: (group: GroupDetail) => ReactNode;
}

/**
 * Pantalla `/grupos/[id]` (plan 001 §6): cabecera del grupo y pestañas Resumen, Miembros y Cobros.
 * Un `404` de la API (grupo ajeno o inexistente) muestra «Grupo no encontrado» (CA-001-10).
 */
export function GroupDetailView({
  groupId,
  ownerPanel,
  reviewQueue,
  requestsTab,
  listingTab,
  memberBadge,
  adminPanel,
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
          <ReadOnlyNotices group={state.group} />
          {state.group.myRole === 'titular' && ownerPanel?.(state.group, { onGroupChange: update })}
          {state.group.myRole !== 'titular' && memberBadge?.(state.group)}
          {adminPanel?.(state.group)}
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
            {tab === 'miembros' && <GroupMembersTab group={state.group} onGroupChange={update} />}
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
            {tab === 'solicitudes' &&
              state.group.myRole === 'titular' &&
              requestsTab?.(state.group)}
            {tab === 'publicar' && state.group.myRole === 'titular' && listingTab?.(state.group)}
            {tab === 'ajustes' && state.group.myRole === 'titular' && (
              <GroupSettingsTab group={state.group} onGroupChange={update} />
            )}
          </div>
          {state.group.myRole === 'miembro' &&
            state.group.status === 'activo' &&
            state.group.frozenReason === null && <LeaveGroupPanel group={state.group} />}
        </>
      )}
    </div>
  );
}
