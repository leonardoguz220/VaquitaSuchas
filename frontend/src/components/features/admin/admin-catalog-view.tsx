'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useAdminCatalog } from '@/hooks/use-admin-catalog';
import { formatBs, formatUsd } from '@/lib/money';
import type { AdminCatalogPlan, AdminCatalogService } from '@/services/admin-catalog';
import { AdminActionDialog } from './admin-action-dialog';
import { AdminCatalogImport } from './admin-catalog-import';
import { AdminCatalogForm, CATEGORY_OPTIONS, type CatalogFormTarget } from './admin-catalog-form';

type ToggleTarget =
  | { kind: 'service'; service: AdminCatalogService }
  | { kind: 'plan'; plan: AdminCatalogPlan; serviceName: string };

/**
 * `/admin/catalogo` (plan 009 §6, RF-009-04, RF-009-05): servicios y planes con alta, edición y
 * activación. Editar precio o cupos muestra el aviso de que no cambia las suscripciones existentes.
 * Cada estado va con texto e ícono (RNF-009-02).
 */
export function AdminCatalogView() {
  const catalog = useAdminCatalog();
  const [formTarget, setFormTarget] = useState<CatalogFormTarget | null>(null);
  const [toggle, setToggle] = useState<ToggleTarget | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  if (catalog.status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Cargando el catálogo…
      </p>
    );
  }

  if (catalog.status === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error" title="No se pudo cargar el catálogo">
          {catalog.error?.message}
        </Alert>
        <Button variant="secondary" onClick={catalog.reload} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  const services = catalog.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl tracking-tight">Catálogo de servicios</h1>
        <Button onClick={() => setFormTarget({ kind: 'service', service: null })}>
          Nuevo servicio
        </Button>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}
      {warning && <Alert variant="info">{warning}</Alert>}

      <AdminCatalogImport
        importPreview={catalog.importPreview}
        importApply={catalog.importApply}
        isPreviewing={catalog.isPreviewing}
        isApplying={catalog.isApplying}
        onApplied={(message) => {
          setNotice(message);
          setWarning(null);
        }}
      />

      {services.length === 0 && (
        <p className="text-muted">Todavía no hay servicios en el catálogo.</p>
      )}

      <ul className="flex flex-col gap-4" aria-label="Servicios del catálogo">
        {services.map((service) => (
          <li key={service.id}>
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-bold">{service.name}</h2>
                  <span className="text-sm text-muted">
                    {CATEGORY_OPTIONS.find((option) => option.value === service.category)?.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StateBadge active={service.active} />
                  <Button
                    variant="secondary"
                    onClick={() => setFormTarget({ kind: 'service', service })}
                  >
                    Editar servicio
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setToggle({ kind: 'service', service })}
                  >
                    {service.active ? 'Desactivar servicio' : 'Activar servicio'}
                  </Button>
                </div>
              </div>

              <ul className="flex flex-col gap-2" aria-label={`Planes de ${service.name}`}>
                {service.plans.map((plan) => (
                  <li
                    key={plan.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-field border border-line p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-bold">{plan.name}</span>
                      <span className="text-sm text-muted">
                        {formatPrice(plan)} · {plan.maxSlots} cupos
                      </span>
                      {plan.verifiedOn === null && (
                        <Badge variant="warning">! Precio por verificar</Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StateBadge active={plan.active} />
                      <Button
                        variant="secondary"
                        onClick={() =>
                          setFormTarget({
                            kind: 'plan',
                            serviceId: service.id,
                            serviceName: service.name,
                            plan,
                          })
                        }
                      >
                        Editar plan
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setToggle({ kind: 'plan', plan, serviceName: service.name })}
                      >
                        {plan.active ? 'Desactivar plan' : 'Activar plan'}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>

              <div>
                <Button
                  variant="secondary"
                  onClick={() =>
                    setFormTarget({
                      kind: 'plan',
                      serviceId: service.id,
                      serviceName: service.name,
                      plan: null,
                    })
                  }
                >
                  Nuevo plan
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {formTarget && (
        <AdminCatalogForm
          target={formTarget}
          onClose={() => setFormTarget(null)}
          act={catalog.act}
          onSaved={(message, saveWarning) => {
            setNotice(message);
            setWarning(saveWarning);
            setFormTarget(null);
          }}
        />
      )}

      <AdminActionDialog
        open={toggle !== null}
        onClose={() => setToggle(null)}
        withReason={false}
        reasonRequired={false}
        title={toggleTitle(toggle)}
        description={toggleDescription(toggle)}
        confirmLabel={toggle && isActive(toggle) ? 'Desactivar' : 'Activar'}
        danger={toggle !== null && isActive(toggle)}
        onConfirm={async () => {
          if (!toggle) return null;
          const nextActive = !isActive(toggle);
          const outcome = await catalog.act(
            toggle.kind === 'service'
              ? { type: 'setServiceActive', id: toggle.service.id, active: nextActive }
              : { type: 'setPlanActive', id: toggle.plan.id, active: nextActive },
          );
          if (outcome?.ok) {
            setNotice(`${toggleName(toggle)} ${nextActive ? 'activado' : 'desactivado'}.`);
            setWarning(null);
          }
          return outcome;
        }}
      />
    </div>
  );
}

function StateBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge variant="success">✓ Activo</Badge>
  ) : (
    <Badge variant="neutral">✕ Inactivo</Badge>
  );
}

function formatPrice(plan: AdminCatalogPlan): string {
  return plan.currency === 'USD' ? formatUsd(plan.priceCents) : formatBs(plan.priceCents);
}

function isActive(target: ToggleTarget): boolean {
  return target.kind === 'service' ? target.service.active : target.plan.active;
}

function toggleName(target: ToggleTarget): string {
  return target.kind === 'service' ? target.service.name : target.plan.name;
}

function toggleTitle(target: ToggleTarget | null): string {
  if (!target) return '';
  const verb = isActive(target) ? 'Desactivar' : 'Activar';
  return `¿${verb} ${toggleName(target)}?`;
}

function toggleDescription(target: ToggleTarget | null): string {
  if (!target) return '';
  return isActive(target)
    ? 'Dejará de ofrecerse a los titulares para nuevas suscripciones. Las suscripciones que ya existen no cambian.'
    : 'Volverá a ofrecerse a los titulares para nuevas suscripciones.';
}
