'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';
import { Alert, Button, Field, Modal, Select } from '@/components/ui';
import { useSaveCatalogPlan, useSaveCatalogService } from '@/hooks/use-admin-catalog';
import { formatAmountInput, parseBsToCents } from '@/lib/money';
import type { CatalogWriteResult } from '@/services/admin-catalog';
import type {
  CatalogCategory,
  CatalogCurrency,
  CatalogPlan,
  CatalogService,
} from '@/services/catalog';
import { catalogErrorOutcome, CATALOG_COPY_NOTICE } from './admin-messages';

/** Categorías cerradas (RF-004-03). */
export const CATEGORY_OPTIONS: Array<{ value: CatalogCategory; label: string }> = [
  { value: 'video', label: 'Video' },
  { value: 'musica', label: 'Música' },
  { value: 'juegos', label: 'Juegos' },
  { value: 'educacion', label: 'Educación' },
  { value: 'almacenamiento', label: 'Almacenamiento' },
  { value: 'otras', label: 'Otras' },
];

/** Formato del `slug` (RN-004-04). Solo ayuda: el backend valida. */
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;

type Errors = Record<string, string>;

function urlOk(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function FormModal({
  title,
  editing,
  formId,
  isSubmitting,
  onClose,
  formError,
  children,
  onSubmit,
}: {
  title: string;
  editing: boolean;
  formId: string;
  isSubmitting: boolean;
  onClose: () => void;
  formError: string | null;
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
        {editing && <Alert variant="warning">{CATALOG_COPY_NOTICE}</Alert>}
        {children}
        {formError && <Alert variant="error">{formError}</Alert>}
      </form>
    </Modal>
  );
}

/**
 * Crear o editar un servicio del catálogo (RF-009-04): nombre, código (`slug`), categoría, logo y
 * color de marca opcionales. Un `slug` repetido lo rechaza la API con `409` (CA-009-03).
 */
export function ServiceFormModal({
  service,
  onSaved,
  onClose,
}: {
  service: CatalogService | null;
  onSaved: (result: CatalogWriteResult<CatalogService>) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const { submit, isSubmitting } = useSaveCatalogService();
  const [values, setValues] = useState({
    name: service?.name ?? '',
    slug: service?.slug ?? '',
    category: service?.category ?? ('video' as CatalogCategory),
    logoUrl: service?.logoUrl ?? '',
    brandColor: service?.brandColor ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  function validate(): Errors {
    const next: Errors = {};
    const name = values.name.trim();
    if (name.length < 2 || name.length > 60) next.name = 'Escribe un nombre de 2 a 60 caracteres.';
    if (!SLUG.test(values.slug.trim()))
      next.slug = 'Usa minúsculas, números y guiones, por ejemplo «prime-video».';
    if (values.logoUrl.trim() && !urlOk(values.logoUrl.trim()))
      next.logoUrl = 'Usa una dirección que empiece con https://.';
    if (values.brandColor.trim() && !COLOR.test(values.brandColor.trim()))
      next.brandColor = 'Usa el formato #RRGGBB, por ejemplo #E50914.';
    return next;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;
    const response = await submit({
      id: service?.id ?? null,
      values: {
        name: values.name.trim(),
        slug: values.slug.trim(),
        category: values.category,
        logoUrl: values.logoUrl.trim() || null,
        brandColor: values.brandColor.trim() || null,
      },
    });
    if (!response) return;
    if (response.ok) {
      onSaved(response.data);
      return;
    }
    const outcome = catalogErrorOutcome(response.error);
    if (outcome.field) setErrors({ [outcome.field]: outcome.message });
    else setFormError(outcome.message);
  }

  return (
    <FormModal
      title={service ? `Editar ${service.name}` : 'Nuevo servicio'}
      editing={Boolean(service)}
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      formError={formError}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <Field
        label="Nombre"
        value={values.name}
        maxLength={60}
        error={errors.name}
        onChange={(event) => setValues({ ...values, name: event.target.value })}
      />
      <Field
        label="Código (slug)"
        hint="Único en el catálogo. Minúsculas, números y guiones."
        value={values.slug}
        error={errors.slug}
        autoComplete="off"
        onChange={(event) => setValues({ ...values, slug: event.target.value })}
      />
      <Select
        label="Categoría"
        value={values.category}
        onChange={(event) =>
          setValues({ ...values, category: event.target.value as CatalogCategory })
        }
      >
        {CATEGORY_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
      <Field
        label="Logo (opcional)"
        hint="Dirección pública https del logo."
        type="url"
        value={values.logoUrl}
        error={errors.logoUrl}
        onChange={(event) => setValues({ ...values, logoUrl: event.target.value })}
      />
      <Field
        label="Color de marca (opcional)"
        hint="Formato #RRGGBB."
        value={values.brandColor}
        error={errors.brandColor}
        onChange={(event) => setValues({ ...values, brandColor: event.target.value })}
      />
    </FormModal>
  );
}

/**
 * Crear o editar un plan (RF-009-04): nombre, código, precio de referencia y moneda, cupos de 2 a
 * 20 (titular incluido), precio individual opcional y fecha de verificación. Al editar avisa que
 * no cambia las suscripciones existentes (RF-009-05, CA-009-04).
 */
export function PlanFormModal({
  service,
  plan,
  onSaved,
  onClose,
}: {
  service: CatalogService;
  plan: CatalogPlan | null;
  onSaved: (result: CatalogWriteResult<CatalogPlan>) => void;
  onClose: () => void;
}) {
  const formId = useId();
  const { submit, isSubmitting } = useSaveCatalogPlan();
  const [values, setValues] = useState({
    name: plan?.name ?? '',
    slug: plan?.slug ?? '',
    price: plan ? formatAmountInput(plan.priceCents) : '',
    currency: plan?.currency ?? ('USD' as CatalogCurrency),
    maxSlots: plan ? String(plan.maxSlots) : '',
    individualPrice:
      plan?.individualPriceCents != null ? formatAmountInput(plan.individualPriceCents) : '',
    verifiedOn: plan?.verifiedOn ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found: Errors = {};
    const name = values.name.trim();
    if (name.length < 2 || name.length > 60) found.name = 'Escribe un nombre de 2 a 60 caracteres.';
    if (!SLUG.test(values.slug.trim()))
      found.slug = 'Usa minúsculas, números y guiones, por ejemplo «netflix-premium».';
    const priceCents = parseBsToCents(values.price.trim());
    if (priceCents === null || priceCents <= 0)
      found.price = 'Escribe un monto positivo, por ejemplo 14,66.';
    const maxSlots = Number(values.maxSlots);
    if (!Number.isInteger(maxSlots) || maxSlots < 2 || maxSlots > 20)
      found.maxSlots = 'Los cupos van de 2 a 20, titular incluido.';
    const individual = values.individualPrice.trim();
    const individualCents = individual ? parseBsToCents(individual) : null;
    if (individual && (individualCents === null || individualCents <= 0))
      found.individualPrice = 'Escribe un monto positivo o déjalo vacío.';
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0 || priceCents === null) return;
    const response = await submit({
      id: plan?.id ?? null,
      values: {
        serviceId: service.id,
        name,
        slug: values.slug.trim(),
        priceCents,
        currency: values.currency,
        maxSlots,
        individualPriceCents: individualCents,
        verifiedOn: values.verifiedOn || null,
      },
    });
    if (!response) return;
    if (response.ok) {
      onSaved(response.data);
      return;
    }
    const outcome = catalogErrorOutcome(response.error);
    if (outcome.field) setErrors({ [outcome.field]: outcome.message });
    else setFormError(outcome.message);
  }

  return (
    <FormModal
      title={plan ? `Editar ${service.name} · ${plan.name}` : `Nuevo plan de ${service.name}`}
      editing={Boolean(plan)}
      formId={formId}
      isSubmitting={isSubmitting}
      onClose={onClose}
      formError={formError}
      onSubmit={(event) => void handleSubmit(event)}
    >
      <Field
        label="Nombre del plan"
        value={values.name}
        maxLength={60}
        error={errors.name}
        onChange={(event) => setValues({ ...values, name: event.target.value })}
      />
      <Field
        label="Código (slug)"
        hint="Único en el catálogo. Minúsculas, números y guiones."
        value={values.slug}
        error={errors.slug}
        autoComplete="off"
        onChange={(event) => setValues({ ...values, slug: event.target.value })}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Precio de referencia"
          hint="Con coma decimal, por ejemplo 14,66."
          inputMode="decimal"
          value={values.price}
          error={errors.price}
          onChange={(event) => setValues({ ...values, price: event.target.value })}
        />
        <Select
          label="Moneda"
          value={values.currency}
          onChange={(event) =>
            setValues({ ...values, currency: event.target.value as CatalogCurrency })
          }
        >
          <option value="USD">USD</option>
          <option value="BS">Bs</option>
        </Select>
      </div>
      <Field
        label="Cupos máximos"
        hint="De 2 a 20, titular incluido."
        type="number"
        inputMode="numeric"
        min={2}
        max={20}
        value={values.maxSlots}
        error={errors.maxSlots}
        onChange={(event) => setValues({ ...values, maxSlots: event.target.value })}
      />
      <Field
        label="Precio individual (opcional)"
        hint="En la misma moneda, para estimar el ahorro."
        inputMode="decimal"
        value={values.individualPrice}
        error={errors.individualPrice}
        onChange={(event) => setValues({ ...values, individualPrice: event.target.value })}
      />
      <Field
        label="Precio verificado el (opcional)"
        type="date"
        value={values.verifiedOn}
        onChange={(event) => setValues({ ...values, verifiedOn: event.target.value })}
      />
    </FormModal>
  );
}
