'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Modal, Select } from '@/components/ui';
import type { CatalogActionResult, CatalogAction } from '@/hooks/use-admin-catalog';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import { formatAmountInput, parseBsToCents } from '@/lib/money';
import type { CatalogCategory, CatalogCurrency } from '@/services/catalog';
import {
  CATALOG_MAX_SLOTS,
  CATALOG_MIN_SLOTS,
  type AdminCatalogPlan,
  type AdminCatalogService,
} from '@/services/admin-catalog';

export const CATEGORY_OPTIONS: { value: CatalogCategory; label: string }[] = [
  { value: 'video', label: 'Video' },
  { value: 'musica', label: 'Música' },
  { value: 'juegos', label: 'Juegos' },
  { value: 'educacion', label: 'Educación' },
  { value: 'almacenamiento', label: 'Almacenamiento' },
  { value: 'otras', label: 'Otras' },
];

/** Qué se edita: un servicio, o un plan dentro de un servicio (alta o edición). */
export type CatalogFormTarget =
  | { kind: 'service'; service: AdminCatalogService | null }
  | { kind: 'plan'; serviceId: string; serviceName: string; plan: AdminCatalogPlan | null };

export interface AdminCatalogFormProps {
  target: CatalogFormTarget;
  onClose: () => void;
  act: (action: CatalogAction) => Promise<ApiSubmitResult<CatalogActionResult> | null>;
  /** Llamado tras guardar; `warning` trae el aviso de la API si tocó precio o cupos. */
  onSaved: (message: string, warning: string | null) => void;
}

/**
 * Alta y edición de un servicio o un plan (RF-009-04). La pantalla no calcula precios: el monto se
 * convierte a centavos y el servidor valida el slug, los cupos y los montos (RF-009-07).
 */
export function AdminCatalogForm({ target, onClose, act, onSaved }: AdminCatalogFormProps) {
  const formId = useId();
  const editing = target.kind === 'service' ? target.service !== null : target.plan !== null;
  const plan = target.kind === 'plan' ? target.plan : null;
  const service = target.kind === 'service' ? target.service : null;

  const [name, setName] = useState(service?.name ?? plan?.name ?? '');
  const [slug, setSlug] = useState(service?.slug ?? plan?.slug ?? '');
  const [category, setCategory] = useState<CatalogCategory>(service?.category ?? 'video');
  const [currency, setCurrency] = useState<CatalogCurrency>(plan?.currency ?? 'USD');
  const [price, setPrice] = useState(plan ? formatAmountInput(plan.priceCents) : '');
  const [slots, setSlots] = useState(plan ? String(plan.maxSlots) : '4');
  const [individual, setIndividual] = useState(
    plan?.individualPriceCents != null ? formatAmountInput(plan.individualPriceCents) : '',
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const title =
    target.kind === 'service'
      ? editing
        ? `Editar ${service?.name}`
        : 'Nuevo servicio'
      : editing
        ? `Editar ${plan?.name} de ${target.serviceName}`
        : `Nuevo plan de ${target.serviceName}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorText(null);

    if (target.kind === 'service') {
      setIsSaving(true);
      const action: CatalogAction = service
        ? { type: 'updateService', id: service.id, input: { name, slug, category } }
        : { type: 'createService', input: { name, slug, category } };
      const outcome = await act(action);
      setIsSaving(false);
      if (!outcome) return;
      if (outcome.ok) onSaved(`Servicio ${name.trim()} guardado.`, null);
      else setErrorText(outcome.error.message);
      return;
    }

    const priceCents = parseBsToCents(price);
    if (priceCents === null || priceCents <= 0) {
      setErrorText('Escribe un precio válido, por ejemplo 14,66.');
      return;
    }
    const maxSlots = Number(slots);
    if (
      !Number.isInteger(maxSlots) ||
      maxSlots < CATALOG_MIN_SLOTS ||
      maxSlots > CATALOG_MAX_SLOTS
    ) {
      setErrorText(`Los cupos van de ${CATALOG_MIN_SLOTS} a ${CATALOG_MAX_SLOTS}.`);
      return;
    }
    const individualCents = individual.trim() ? parseBsToCents(individual) : null;
    if (individual.trim() && (individualCents === null || individualCents <= 0)) {
      setErrorText('El precio individual debe ser un monto válido, por ejemplo 14,66.');
      return;
    }

    const input = {
      name,
      slug,
      priceCents,
      currency,
      maxSlots,
      individualPriceCents: individualCents,
    };
    setIsSaving(true);
    const outcome = plan
      ? await act({ type: 'updatePlan', id: plan.id, input })
      : await act({ type: 'createPlan', serviceId: target.serviceId, input });
    setIsSaving(false);
    if (!outcome) return;
    if (outcome.ok) onSaved(`Plan ${name.trim()} guardado.`, outcome.data.warning);
    else setErrorText(outcome.error.message);
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!isSaving) onClose();
      }}
      title={title}
      footer={
        <>
          <Button variant="secondary" disabled={isSaving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={isSaving}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        {target.kind === 'plan' && editing && (
          <Alert variant="info">{CATALOG_EDIT_WARNING_TEXT}</Alert>
        )}
        <Field
          name="name"
          label="Nombre"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSaving}
        />
        <Field
          name="slug"
          label="Slug"
          hint="Sin espacios ni tildes, por ejemplo netflix-estandar. No se repite."
          value={slug}
          onChange={(event) => setSlug(event.target.value)}
          disabled={isSaving}
        />
        {target.kind === 'service' ? (
          <Select
            name="category"
            label="Categoría"
            value={category}
            onChange={(event) => setCategory(event.target.value as CatalogCategory)}
            disabled={isSaving}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                name="currency"
                label="Moneda"
                value={currency}
                onChange={(event) => setCurrency(event.target.value as CatalogCurrency)}
                disabled={isSaving}
              >
                <option value="USD">USD</option>
                <option value="BS">Bs</option>
              </Select>
              <Field
                name="price"
                label="Precio de referencia"
                hint="Con coma decimal: 14,66"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                disabled={isSaving}
              />
            </div>
            <Field
              name="slots"
              label="Cupos máximos"
              hint={`De ${CATALOG_MIN_SLOTS} a ${CATALOG_MAX_SLOTS}, titular incluido`}
              type="number"
              min={CATALOG_MIN_SLOTS}
              max={CATALOG_MAX_SLOTS}
              value={slots}
              onChange={(event) => setSlots(event.target.value)}
              disabled={isSaving}
            />
            <Field
              name="individual"
              label="Precio individual (opcional)"
              hint="Para estimar el ahorro"
              inputMode="decimal"
              value={individual}
              onChange={(event) => setIndividual(event.target.value)}
              disabled={isSaving}
            />
          </>
        )}
        {errorText && <Alert variant="error">{errorText}</Alert>}
      </form>
    </Modal>
  );
}

const CATALOG_EDIT_WARNING_TEXT =
  'Cambiar el catálogo no modifica las suscripciones que ya existen: cada una guarda su propia copia del plan.';
