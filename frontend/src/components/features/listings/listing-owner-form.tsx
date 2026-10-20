'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert, Button } from '@/components/ui';
import { controlClass, FieldError, FieldHint, FieldLabel } from '@/components/ui/field-parts';
import { cx } from '@/components/ui/cx';
import {
  LISTING_TEXT_MAX,
  validateListingForm,
  type ListingFormValues,
} from './listing-owner-model';

export interface ListingOwnerFormProps {
  values: ListingFormValues;
  onChange: (values: ListingFormValues) => void;
  /** Cupos libres del grupo: tope de ayuda; la API vuelve a validarlo. */
  freeSlots: number;
  submitLabel: string;
  busy: boolean;
  /** Error de la última petición, ya traducido. */
  serverError: string | null;
  onSubmit: (values: ListingFormValues) => void;
  onCancel?: () => void;
}

/** Formulario de cupos, descripción y condiciones de la publicación (RF-008-01). */
export function ListingOwnerForm({
  values,
  onChange,
  freeSlots,
  submitLabel,
  busy,
  serverError,
  onSubmit,
  onCancel,
}: ListingOwnerFormProps) {
  const ids = useId();
  const [touched, setTouched] = useState(false);
  const errors = validateListingForm(values, freeSlots);
  const hasErrors = Object.keys(errors).length > 0;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setTouched(true);
    if (!hasErrors) onSubmit(values);
  }

  function update(field: keyof ListingFormValues, value: string) {
    onChange({ ...values, [field]: value });
  }

  const slotsId = `${ids}-slots`;
  const descriptionId = `${ids}-description`;
  const conditionsId = `${ids}-conditions`;

  return (
    <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
      {serverError && <Alert variant="error" title={serverError} />}

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={slotsId}>Cupos a publicar</FieldLabel>
        <input
          id={slotsId}
          type="number"
          inputMode="numeric"
          min={1}
          max={Math.max(freeSlots, 1)}
          value={values.slotsOffered}
          disabled={busy}
          aria-invalid={touched && errors.slotsOffered ? true : undefined}
          aria-describedby={cx(
            `${slotsId}-hint`,
            touched && errors.slotsOffered && `${slotsId}-error`,
          )}
          onChange={(event) => update('slotsOffered', event.target.value)}
          className={cx(controlClass, 'sm:max-w-40')}
        />
        <FieldHint id={`${slotsId}-hint`}>
          {freeSlots > 0 ? `Tienes ${freeSlots} libres.` : 'No hay cupos libres ahora.'}
        </FieldHint>
        {touched && errors.slotsOffered && (
          <FieldError id={`${slotsId}-error`}>{errors.slotsOffered}</FieldError>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={descriptionId}>Descripción</FieldLabel>
        <textarea
          id={descriptionId}
          rows={3}
          value={values.description}
          disabled={busy}
          maxLength={LISTING_TEXT_MAX}
          aria-invalid={touched && errors.description ? true : undefined}
          aria-describedby={cx(
            `${descriptionId}-hint`,
            touched && errors.description && `${descriptionId}-error`,
          )}
          onChange={(event) => update('description', event.target.value)}
          className={cx(controlClass, 'py-3')}
        />
        <FieldHint id={`${descriptionId}-hint`}>
          {`${values.description.length}/${LISTING_TEXT_MAX} caracteres.`}
        </FieldHint>
        {touched && errors.description && (
          <FieldError id={`${descriptionId}-error`}>{errors.description}</FieldError>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor={conditionsId}>Condiciones</FieldLabel>
        <textarea
          id={conditionsId}
          rows={3}
          value={values.conditions}
          disabled={busy}
          maxLength={LISTING_TEXT_MAX}
          aria-invalid={touched && errors.conditions ? true : undefined}
          aria-describedby={cx(
            `${conditionsId}-hint`,
            touched && errors.conditions && `${conditionsId}-error`,
          )}
          onChange={(event) => update('conditions', event.target.value)}
          className={cx(controlClass, 'py-3')}
        />
        <FieldHint id={`${conditionsId}-hint`}>
          {`${values.conditions.length}/${LISTING_TEXT_MAX} caracteres.`}
        </FieldHint>
        {touched && errors.conditions && (
          <FieldError id={`${conditionsId}-error`}>{errors.conditions}</FieldError>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {onCancel && (
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
        )}
        <Button type="submit" loading={busy} className="w-full sm:w-auto">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
