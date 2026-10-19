'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { Alert, Badge, Button, Modal } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useHostEligibility } from '@/hooks/use-create-group';
import { useGroups } from '@/hooks/use-groups';
import { formatCalendarDate } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { groupPath, JOIN_PATH, NEW_GROUP_PATH } from '@/lib/routes';
import type { GroupRole, GroupSummary, HostEligibility } from '@/services/groups';
import { groupErrorMessage } from './group-messages';
import {
  canCreateGroups,
  HostEligibilityExplanation,
  hostEligibilityTitle,
} from './host-eligibility-panel';

type RoleFilter = GroupRole | null;

const FILTERS: Array<{ value: RoleFilter; label: string }> = [
  { value: null, label: 'Todas' },
  { value: 'titular', label: 'Soy titular' },
  { value: 'miembro', label: 'Soy miembro' },
];

const EMPTY_BY_FILTER: Record<'titular' | 'miembro', string> = {
  titular: 'No eres titular de ningún grupo.',
  miembro: 'No eres miembro de ningún grupo.',
};

/**
 * **Crear suscripción** (plan 001 §6): si la API dice que no está habilitado o que ya tiene 5
 * grupos activos, abre un panel que explica qué falta; si no (o mientras no se sabe), lleva al
 * asistente, que vuelve a comprobarlo. El backend lo valida siempre (RF-001-21).
 */
function CreateGroupAction({ eligibility }: { eligibility: HostEligibility | null }) {
  const [open, setOpen] = useState(false);
  const data = eligibility;

  if (!data || canCreateGroups(data)) {
    return <Button href={NEW_GROUP_PATH}>Crear suscripción</Button>;
  }
  return (
    <>
      <Button onClick={() => setOpen(true)}>Crear suscripción</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={hostEligibilityTitle(data)}
        footer={<Button onClick={() => setOpen(false)}>Entendido</Button>}
      >
        <div className="flex flex-col gap-3">
          <HostEligibilityExplanation eligibility={data} />
        </div>
      </Modal>
    </>
  );
}

function GroupsSkeleton() {
  return (
    <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <span className="sr-only">Cargando tus suscripciones…</span>
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          aria-hidden="true"
          className="flex h-52 flex-col gap-4 rounded-card border border-line bg-surface p-5"
        >
          <div className="flex items-center gap-3">
            <div className="size-12 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="h-5 w-1/2 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          </div>
          <div className="h-8 w-1/3 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

function GroupCard({ group }: { group: GroupSummary }) {
  const closed = group.status === 'cerrado';
  return (
    <Link
      href={groupPath(group.id)}
      className={cx(
        'flex h-full flex-col gap-4 rounded-card border border-line bg-surface p-5 text-ink no-underline',
        'transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
      )}
    >
      <div className="flex items-center gap-3">
        <ServiceLogo
          name={group.serviceName}
          logoUrl={group.logoUrl}
          brandColor={group.brandColor}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-lg font-bold">{group.name}</span>
          <span className="truncate text-[15px] text-muted">{group.serviceName}</span>
        </div>
        <Badge variant={group.role === 'titular' ? 'success' : 'info'}>
          {group.role === 'titular' ? 'Titular' : 'Miembro'}
        </Badge>
      </div>
      <div className="flex flex-col">
        <span className="text-[15px] text-muted">
          {group.myShareIsReference ? 'Cuota de referencia' : 'Tu cuota'}
        </span>
        <span className="font-display text-2xl font-bold">{formatBs(group.myShareCents)}</span>
      </div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 text-[15px]">
        <span>
          {group.memberCount} de {group.totalSlots} cupos
        </span>
        {!closed && <span>Próximo corte: {formatCalendarDate(group.nextCutDate)}</span>}
      </div>
      {(closed || group.frozenReason) && (
        <div className="flex flex-wrap gap-2">
          {closed && <Badge variant="neutral">Cerrado</Badge>}
          {group.frozenReason === 'titular_baneado' && (
            <Badge variant="danger">Titular baneado</Badge>
          )}
        </div>
      )}
    </Link>
  );
}

/**
 * "Mis suscripciones" `/grupos` (spec 001 T020, plan §6; mockup `Grupos.dc.html`): tarjetas con
 * logo, rol, cuota (o cuota de referencia del titular), cupos, próximo corte y estado, todo
 * como lo entrega `GET /groups`. Filtro por rol. Cubre cargando, vacío, error y con datos.
 */
export function GroupsView() {
  const [role, setRole] = useState<RoleFilter>(null);
  const eligibility = useHostEligibility();
  const canCreate = eligibility.data !== null && canCreateGroups(eligibility.data);
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useGroups(role);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Mis suscripciones
        </h1>
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <Button href={JOIN_PATH} variant="secondary">
            Unirme con un código
          </Button>
          <CreateGroupAction eligibility={eligibility.data} />
        </div>
      </div>

      <div role="group" aria-label="Filtrar por rol" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const pressed = filter.value === role;
          return (
            <button
              key={filter.label}
              type="button"
              aria-pressed={pressed}
              onClick={() => setRole(filter.value)}
              className={cx(
                'inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-body',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                pressed
                  ? 'border-ink bg-ink font-bold text-white'
                  : 'border-field-border bg-surface text-ink hover:border-ink',
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {(status === 'loading' || status === 'redirecting') && <GroupsSkeleton />}

      {status === 'error' && error && (
        <Alert
          variant="error"
          title="No pudimos cargar tus suscripciones."
          action={
            <Button variant="secondary" onClick={reload}>
              Reintentar
            </Button>
          }
        >
          {groupErrorMessage(error)}
        </Alert>
      )}

      {status === 'success' && items.length === 0 && role && (
        <p className="rounded-card border border-line bg-surface p-5">{EMPTY_BY_FILTER[role]}</p>
      )}

      {status === 'success' && items.length === 0 && !role && (
        <section
          aria-labelledby="groups-empty-title"
          className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="groups-empty-title" className="font-display text-xl font-bold">
            Aún no estás en ningún grupo
          </h2>
          <p className="text-muted">
            Crea una suscripción para compartirla o entra a un grupo con el código que te pasaron.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            {canCreate && <Button href={NEW_GROUP_PATH}>Crear suscripción</Button>}
            <Button href={JOIN_PATH} variant={canCreate ? 'secondary' : 'primary'}>
              Entrar con un código
            </Button>
          </div>
        </section>
      )}

      {status === 'success' && items.length > 0 && (
        <ul aria-label="Tus suscripciones" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((group) => (
            <li key={group.id}>
              <GroupCard group={group} />
            </li>
          ))}
        </ul>
      )}

      {status === 'success' && loadMoreError && (
        <Alert variant="error" title="No pudimos cargar más suscripciones.">
          {groupErrorMessage(loadMoreError)}
        </Alert>
      )}

      {status === 'success' && hasMore && (
        <Button
          variant="secondary"
          onClick={() => void loadMore()}
          loading={isLoadingMore}
          className="w-full sm:w-auto sm:self-center"
        >
          Ver más suscripciones
        </Button>
      )}
    </>
  );
}
