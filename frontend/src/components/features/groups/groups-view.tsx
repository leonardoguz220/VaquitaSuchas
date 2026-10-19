'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useGroups } from '@/hooks/use-groups';
import { useHostEligibility, type HostEligibilityState } from '@/hooks/use-host-eligibility';
import { JOIN_PATH } from '@/lib/routes';
import type { GroupRole } from '@/services/groups';
import { GroupCard } from './group-card';
import { GroupLoadError } from './group-load-error';
import { HostEligibilityPanel } from './host-eligibility-panel';

export const NEW_GROUP_PATH = '/grupos/nuevo';

const FILTERS: { role: GroupRole | null; label: string }[] = [
  { role: null, label: 'Todas' },
  { role: 'titular', label: 'Soy titular' },
  { role: 'miembro', label: 'Soy miembro' },
];

const EMPTY_FILTERED: Record<GroupRole, string> = {
  titular: 'No eres titular de ningún grupo.',
  miembro: 'No eres miembro de ningún grupo.',
};

const SKELETON_CARDS = [0, 1, 2];

function GroupsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Cargando tus suscripciones…</span>
      <ul aria-hidden="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SKELETON_CARDS.map((card) => (
          <li
            key={card}
            data-testid="group-skeleton"
            className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 sm:p-5"
          >
            <div className="flex items-center gap-3">
              <div className="size-11 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
              <div className="h-5 w-32 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            </div>
            <div className="h-8 w-28 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
            <div className="h-4 w-40 animate-pulse rounded-field bg-line motion-reduce:animate-none" />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Sin habilitación o con el máximo de grupos, «Crear» abre el panel de qué falta (RF-001-21). */
function isBlocked(state: HostEligibilityState): boolean {
  return (
    state.status === 'success' && (!state.eligibility.eligible || !state.eligibility.canCreateMore)
  );
}

function CreateButton({
  label,
  blocked,
  onBlocked,
  className,
}: {
  label: string;
  blocked: boolean;
  onBlocked: () => void;
  className?: string;
}) {
  if (blocked) {
    return (
      <Button onClick={onBlocked} aria-haspopup="dialog" className={className}>
        {label}
      </Button>
    );
  }
  return (
    <Button href={NEW_GROUP_PATH} className={className}>
      {label}
    </Button>
  );
}

/**
 * Pantalla `/grupos`, «Mis suscripciones» (plan 001 §6, RF-001-19; mockup `Grupos.dc.html`).
 * El filtro por rol se resuelve en el servidor con la query `role` de `GET /groups`.
 */
export function GroupsView() {
  const [role, setRole] = useState<GroupRole | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const { state, retry } = useGroups(role);
  const { state: eligibility } = useHostEligibility();
  const blocked = isBlocked(eligibility);
  const openPanel = () => setPanelOpen(true);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Mis suscripciones
        </h1>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button variant="secondary" href={JOIN_PATH}>
            Entrar con un código
          </Button>
          <CreateButton label="Crear suscripción" blocked={blocked} onBlocked={openPanel} />
        </div>
      </header>

      <div
        role="group"
        aria-label="Filtrar por rol"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0"
      >
        {FILTERS.map((filter) => {
          const active = filter.role === role;
          return (
            <button
              key={filter.label}
              type="button"
              aria-pressed={active}
              onClick={() => setRole(filter.role)}
              className={cx(
                'inline-flex min-h-11 shrink-0 items-center rounded-full border-[1.5px] px-4 font-bold whitespace-nowrap transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink',
                active
                  ? 'border-primary bg-primary text-white'
                  : 'border-field-border bg-surface text-ink hover:border-primary hover:bg-primary-soft',
              )}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {state.status === 'loading' && <GroupsSkeleton />}
      {state.status === 'redirecting' && (
        <p role="status" className="text-muted">
          Redirigiendo para iniciar sesión…
        </p>
      )}
      {state.status === 'error' && (
        <GroupLoadError error={state.error} what="tus suscripciones" onRetry={retry} />
      )}

      {state.status === 'success' && state.items.length === 0 && role === null && (
        <section
          aria-labelledby="groups-empty-title"
          className="flex flex-col items-start gap-4 rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2 id="groups-empty-title" className="font-display text-xl font-bold">
            Aún no estás en ningún grupo
          </h2>
          <p className="text-muted">
            Crea una suscripción compartida o entra a una con el código que te pasó el titular.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <CreateButton label="Crear" blocked={blocked} onBlocked={openPanel} />
            <Button variant="secondary" href={JOIN_PATH}>
              Entrar con un código
            </Button>
          </div>
        </section>
      )}

      {state.status === 'success' && state.items.length === 0 && role !== null && (
        <div
          role="status"
          className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-5"
        >
          <p className="font-bold">{EMPTY_FILTERED[role]}</p>
          <Button variant="secondary" onClick={() => setRole(null)}>
            Ver todas
          </Button>
        </div>
      )}

      {state.status === 'success' && state.items.length > 0 && (
        <ul
          aria-label="Tus grupos"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {state.items.map((group) => (
            <li key={group.id} className="flex flex-col">
              <GroupCard group={group} />
            </li>
          ))}
        </ul>
      )}

      {eligibility.status === 'success' && (
        <HostEligibilityPanel
          open={panelOpen}
          onClose={() => setPanelOpen(false)}
          eligibility={eligibility.eligibility}
        />
      )}
    </div>
  );
}
