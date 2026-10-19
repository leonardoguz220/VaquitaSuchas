'use client';

import Link from 'next/link';
import { useState } from 'react';
import { GroupChargesTab } from '@/components/features/billing/group-charges-tab';
import { GroupCollectionTab } from '@/components/features/dashboard/group-collection-tab';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { GroupRankingTab } from '@/components/features/reputation/group-ranking-tab';
import { Alert, Button, Tabs } from '@/components/ui';
import { useGroup } from '@/hooks/use-groups';
import { GROUPS_PATH } from '@/lib/routes';
import type { GroupDetail } from '@/services/groups';
import { groupErrorMessage } from './group-messages';
import { GroupMembersTab } from './group-members-tab';
import { GroupSummaryTab } from './group-summary-tab';
import { OwnerInviteSection } from './owner-invite-section';

type TabId = 'resumen' | 'miembros' | 'cobros' | 'cobranza' | 'ranking';

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Cargando el grupo…</span>
      <div aria-hidden="true" className="flex items-center gap-3">
        <div className="size-14 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        <div className="h-8 w-1/2 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
      </div>
      <div
        aria-hidden="true"
        className="h-64 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
      />
    </div>
  );
}

/** "Netflix · Estándar · 3 de 4 cupos · Cobro el día 1 de cada mes", con los datos de la API. */
export function groupSubtitle(group: GroupDetail): string {
  const parts = [group.service.name];
  if (group.service.planName) parts.push(group.service.planName);
  parts.push(`${group.breakdown.memberCount} de ${group.totalSlots} cupos`);
  parts.push(`Cobro el día ${group.billingDay} de cada mes`);
  return parts.join(' · ');
}

function BackLink() {
  return (
    <Link
      href={GROUPS_PATH}
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-field font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <span aria-hidden="true">←</span> Volver a mis suscripciones
    </Link>
  );
}

export interface GroupDetailViewProps {
  groupId: string;
}

/**
 * Detalle del grupo `/grupos/[id]` (spec 001 T020, plan §6; mockups `GrupoMiembro.dc.html` y
 * `GrupoMiembros.dc.html`) con las pestañas **Resumen** y **Miembros**; la pestaña
 * **Cobros** (spec 002 T037) muestra el resumen del mes y el historial, y el titular ve además
 * el código de invitación (T025), la cola «Por revisar» (spec 002 T026) y la pestaña
 * **Cobranza** (spec 006 T014). Todos ven la pestaña **Ranking** (spec 007 T026). Quien no
 * pertenece al grupo recibe `404` (RNF-001-01) y ve el mismo mensaje que si no existiera.
 */
export function GroupDetailView({ groupId }: GroupDetailViewProps) {
  const { status, data: group, error, reload, refresh, replace } = useGroup(groupId);
  const [tab, setTab] = useState<TabId>('resumen');

  if (status === 'loading' || status === 'redirecting') {
    return (
      <>
        <BackLink />
        <DetailSkeleton />
      </>
    );
  }

  if (status === 'error' && error) {
    const notFound = error.statusCode === 404;
    return (
      <>
        <BackLink />
        {notFound ? (
          <Alert variant="warning" title="No encontramos este grupo.">
            Puede que no exista o que no seas parte de él.
          </Alert>
        ) : (
          <Alert
            variant="error"
            title="No pudimos cargar el grupo."
            action={
              <Button variant="secondary" onClick={reload}>
                Reintentar
              </Button>
            }
          >
            {groupErrorMessage(error)}
          </Alert>
        )}
      </>
    );
  }

  if (!group) return null;
  const isOwner = group.myRole === 'titular';

  return (
    <>
      <BackLink />
      <div className="flex items-center gap-4">
        <ServiceLogo
          name={group.service.name}
          logoUrl={group.service.logoUrl}
          brandColor={group.service.brandColor}
          size="lg"
        />
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="font-display text-3xl leading-tight font-bold tracking-tight break-words sm:text-4xl">
              {group.name}
            </h1>
            <span className="rounded-full bg-primary-soft px-3 py-1 text-[15px] font-bold text-primary-hover">
              {isOwner ? 'Eres titular' : 'Eres miembro'}
            </span>
          </div>
          <p className="text-muted">{groupSubtitle(group)}</p>
        </div>
      </div>
      <Tabs
        label="Secciones del grupo"
        selectedId={tab}
        onSelect={(id) => setTab(id as TabId)}
        items={[
          {
            id: 'resumen',
            label: 'Resumen',
            content: (
              <GroupSummaryTab group={group}>
                {isOwner && (
                  <OwnerInviteSection group={group} onGroupChange={replace} onRefresh={refresh} />
                )}
              </GroupSummaryTab>
            ),
          },
          { id: 'miembros', label: 'Miembros', content: <GroupMembersTab group={group} /> },
          { id: 'cobros', label: 'Cobros', content: <GroupChargesTab group={group} /> },
          { id: 'ranking', label: 'Ranking', content: <GroupRankingTab groupId={group.id} /> },
          ...(isOwner
            ? [
                {
                  id: 'cobranza',
                  label: 'Cobranza',
                  content: <GroupCollectionTab groupId={group.id} />,
                },
              ]
            : []),
        ]}
      />
    </>
  );
}
