'use client';

import { useState } from 'react';
import { ServiceLogo } from '@/components/features/catalog/service-logo';
import { Alert, Button, Modal } from '@/components/ui';
import {
  useAdminCatalogPlans,
  useAdminCatalogServices,
  useCatalogActivation,
} from '@/hooks/use-admin-catalog';
import { formatCalendarDate } from '@/lib/dates';
import { formatPrice } from '@/lib/money';
import type { CatalogPlan, CatalogService } from '@/services/catalog';
import { isConnectionError } from '@/services/http';
import { adminLoadErrorMessage, ADMIN_MESSAGES } from './admin-messages';
import { AdminListSkeleton, AdminLoadError } from './admin-states';
import { CatalogImport } from './catalog-import';
import { PlanFormModal, ServiceFormModal } from './catalog-forms';

type Editing =
  | { kind: 'service'; service: CatalogService | null }
  | { kind: 'plan'; service: CatalogService; plan: CatalogPlan | null };

interface Deactivation {
  entity: 'service' | 'plan';
  id: string;
  label: string;
}

interface Notice {
  ok: boolean;
  message: string;
  /** Para «Deshacer» una desactivación con `activate`. */
  undo?: Deactivation;
}

function PlansPanel({
  service,
  onEdit,
  onDeactivate,
}: {
  service: CatalogService;
  onEdit: (plan: CatalogPlan | null) => void;
  onDeactivate: (plan: CatalogPlan) => void;
}) {
  const { status, data, error, reload } = useAdminCatalogPlans(service.slug);
  return (
    <div className="flex flex-col gap-3 border-t border-line pt-3">
      {status === 'loading' && (
        <p role="status" className="text-muted">
          Cargando planes…
        </p>
      )}
      {status === 'error' && error && error.statusCode === 404 && (
        <p className="text-muted">Este servicio no tiene planes activos.</p>
      )}
      {status === 'error' && error && error.statusCode !== 404 && (
        <AdminLoadError error={error} title="No pudimos cargar los planes." onRetry={reload} />
      )}
      {status === 'success' && data && (
        <ul aria-label={`Planes de ${service.name}`} className="flex flex-col gap-2">
          {data.plans.map((plan) => (
            <li
              key={plan.id}
              className="flex flex-col gap-2 rounded-field bg-bg p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-col">
                <span className="font-bold">{plan.name}</span>
                <span className="text-[15px] text-muted">
                  {formatPrice(plan.priceCents, plan.currency)} · {plan.maxSlots} cupos
                  {plan.individualPriceCents !== null &&
                    ` · individual ${formatPrice(plan.individualPriceCents, plan.currency)}`}
                  {' · '}
                  {plan.verifiedOn
                    ? `verificado el ${formatCalendarDate(plan.verifiedOn)}`
                    : 'precio por verificar'}
                </span>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  variant="secondary"
                  onClick={() => onEdit(plan)}
                  aria-label={`Editar el plan ${plan.name}`}
                >
                  Editar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => onDeactivate(plan)}
                  aria-label={`Desactivar el plan ${plan.name}`}
                >
                  Desactivar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Button
        variant="secondary"
        onClick={() => onEdit(null)}
        className="w-full sm:w-auto sm:self-start"
      >
        Nuevo plan
      </Button>
    </div>
  );
}

function ServiceItem({
  service,
  onEditService,
  onEditPlan,
  onDeactivate,
}: {
  service: CatalogService;
  onEditService: () => void;
  onEditPlan: (plan: CatalogPlan | null) => void;
  onDeactivate: (target: Deactivation) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <ServiceLogo
            name={service.name}
            logoUrl={service.logoUrl}
            brandColor={service.brandColor}
          />
          <div className="flex flex-col">
            <h3 className="font-bold break-words">{service.name}</h3>
            <span className="text-[15px] text-muted">
              {service.categoryLabel} · {service.slug}
              {service.plansCount !== undefined &&
                ` · ${service.plansCount} ${service.plansCount === 1 ? 'plan' : 'planes'}`}
            </span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? 'Ocultar planes' : 'Ver planes'}
          </Button>
          <Button
            variant="secondary"
            onClick={onEditService}
            aria-label={`Editar el servicio ${service.name}`}
          >
            Editar
          </Button>
          <Button
            variant="danger"
            onClick={() => onDeactivate({ entity: 'service', id: service.id, label: service.name })}
            aria-label={`Desactivar el servicio ${service.name}`}
          >
            Desactivar
          </Button>
        </div>
      </div>
      {expanded && (
        <PlansPanel
          service={service}
          onEdit={onEditPlan}
          onDeactivate={(plan) =>
            onDeactivate({ entity: 'plan', id: plan.id, label: `${service.name} · ${plan.name}` })
          }
        />
      )}
    </article>
  );
}

/**
 * `/admin/catalogo` (spec 009 T029, plan §6; mockup `AdminCatalogo.dc.html`): servicios y planes
 * con **crear**, **editar** (con el aviso de que no cambia las suscripciones existentes,
 * RF-009-05), **desactivar** y **activar** (deshacer), sin borrado físico (RF-009-04), e
 * importación con vista previa y errores por fila (RF-009-06). Las reglas las valida el backend.
 */
export function AdminCatalogView() {
  const { status, error, reload, refresh, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useAdminCatalogServices();
  const activation = useCatalogActivation();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirming, setConfirming] = useState<Deactivation | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [listKey, setListKey] = useState(0);

  async function changeActive(target: Deactivation, active: boolean) {
    setActionError(null);
    const response = await activation.submit({ entity: target.entity, id: target.id, active });
    if (!response) return;
    if (response.ok) {
      setConfirming(null);
      setNotice(
        active
          ? { ok: true, message: `Activaste ${target.label}. Vuelve a ofrecerse.` }
          : {
              ok: true,
              message: `Desactivaste ${target.label}. Ya no se ofrece para nuevas suscripciones; las existentes no cambian.`,
              undo: target,
            },
      );
      setListKey((current) => current + 1);
      await refresh();
      return;
    }
    const message =
      response.error.statusCode === 403
        ? ADMIN_MESSAGES.forbidden
        : isConnectionError(response.error)
          ? ADMIN_MESSAGES.connection
          : ADMIN_MESSAGES.unexpected;
    setActionError(message);
  }

  function saved(label: string, warning?: string | null) {
    setEditing(null);
    setNotice({ ok: true, message: warning ? `${label} ${warning}.` : label });
    setListKey((current) => current + 1);
    void refresh();
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Catálogo de servicios
        </h1>
        <Button
          onClick={() => {
            setNotice(null);
            setEditing({ kind: 'service', service: null });
          }}
        >
          Nuevo servicio
        </Button>
      </div>

      {notice && (
        <Alert
          variant={notice.ok ? 'success' : 'warning'}
          action={
            notice.undo ? (
              <Button
                variant="secondary"
                loading={activation.isSubmitting}
                onClick={() => notice.undo && void changeActive(notice.undo, true)}
              >
                Deshacer
              </Button>
            ) : undefined
          }
        >
          {notice.message}
        </Alert>
      )}
      {actionError && !confirming && <Alert variant="error">{actionError}</Alert>}

      <section aria-labelledby="catalogo-servicios" className="flex flex-col gap-3">
        <h2 id="catalogo-servicios" className="font-display text-xl font-bold">
          Servicios activos
        </h2>
        {(status === 'loading' || status === 'redirecting') && (
          <AdminListSkeleton label="Cargando catálogo…" />
        )}
        {status === 'error' && error && (
          <AdminLoadError error={error} title="No pudimos cargar el catálogo." onRetry={reload} />
        )}
        {status === 'success' && items.length === 0 && (
          <p className="rounded-card border border-line bg-surface p-5">
            El catálogo no tiene servicios activos. Crea uno o importa un archivo.
          </p>
        )}
        {status === 'success' && items.length > 0 && (
          <>
            <ul key={listKey} aria-label="Servicios del catálogo" className="flex flex-col gap-3">
              {items.map((service) => (
                <li key={service.id}>
                  <ServiceItem
                    service={service}
                    onEditService={() => {
                      setNotice(null);
                      setEditing({ kind: 'service', service });
                    }}
                    onEditPlan={(plan) => {
                      setNotice(null);
                      setEditing({ kind: 'plan', service, plan });
                    }}
                    onDeactivate={(target) => {
                      setActionError(null);
                      setConfirming(target);
                    }}
                  />
                </li>
              ))}
            </ul>
            {loadMoreError && <Alert variant="error">{adminLoadErrorMessage(loadMoreError)}</Alert>}
            {hasMore && (
              <Button
                variant="secondary"
                onClick={() => void loadMore()}
                loading={isLoadingMore}
                className="w-full sm:w-auto sm:self-center"
              >
                Cargar más
              </Button>
            )}
          </>
        )}
      </section>

      <CatalogImport onApplied={() => void refresh()} />

      {editing?.kind === 'service' && (
        <ServiceFormModal
          service={editing.service}
          onClose={() => setEditing(null)}
          onSaved={(result) =>
            saved(
              editing.service
                ? `Guardaste los cambios de ${result.name}.`
                : `Creaste el servicio ${result.name}.`,
              result.warning,
            )
          }
        />
      )}
      {editing?.kind === 'plan' && (
        <PlanFormModal
          service={editing.service}
          plan={editing.plan}
          onClose={() => setEditing(null)}
          onSaved={(result) =>
            saved(
              editing.plan
                ? `Guardaste los cambios del plan ${result.name}.`
                : `Creaste el plan ${result.name}.`,
              result.warning,
            )
          }
        />
      )}
      {confirming && (
        <Modal
          open
          onClose={() => setConfirming(null)}
          title={`¿Desactivar ${confirming.label}?`}
          description="Deja de ofrecerse para nuevas suscripciones. Las suscripciones existentes no cambian y no se borra nada."
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(null)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                loading={activation.isSubmitting}
                onClick={() => void changeActive(confirming, false)}
              >
                Desactivar
              </Button>
            </>
          }
        >
          {actionError && <Alert variant="error">{actionError}</Alert>}
        </Modal>
      )}
    </>
  );
}
