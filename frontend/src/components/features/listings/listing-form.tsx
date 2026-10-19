'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Textarea } from '@/components/ui';
import { LISTING_TEXT_MAX } from '@/services/listings';
import type { ListingActionOutcome } from './listing-messages';

export interface ListingFormValues {
  slotsOffered: number;
  description: string;
  conditions: string;
}

export interface ListingFormProps {
  initial?: ListingFormValues;
  submitLabel: string;
  /** Texto de ayuda del número de cupos, con los datos del grupo que entrega la API. */
  slotsHint: string;
  /** Devuelve `null` si salió bien o el resultado del error para mostrarlo. */
  onSubmit: (values: ListingFormValues) => Promise<ListingActionOutcome | null>;
  isSubmitting: boolean;
  onCancel?: () => void;
}

const EMPTY: ListingFormValues = { slotsOffered: 1, description: '', conditions: '' };

/**
 * Formulario de la publicación (RF-008-01): cupos ofrecidos, descripción y condiciones opcionales
 * de hasta 300 caracteres. La validación de aquí solo ayuda; el backend decide cuántos cupos se
 * pueden ofrecer (`422 NO_FREE_SLOTS`).
 */
export function ListingForm({
  initial = EMPTY,
  submitLabel,
  slotsHint,
  onSubmit,
  isSubmitting,
  onCancel,
}: ListingFormProps) {
  const formId = useId();
  const slotsRef = useRef<HTMLInputElement>(null);
  const [slots, setSlots] = useState(String(initial.slotsOffered));
  const [description, setDescription] = useState(initial.description);
  const [conditions, setConditions] = useState(initial.conditions);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const slotsOffered = Number(slots);
    if (!/^\d+$/.test(slots.trim()) || !Number.isInteger(slotsOffered) || slotsOffered < 1) {
      setSlotsError('Ofrece al menos 1 cupo.');
      slotsRef.current?.focus();
      return;
    }
    setSlotsError(null);
    setFormError(null);
    const outcome = await onSubmit({
      slotsOffered,
      description: description.trim(),
      conditions: conditions.trim(),
    });
    if (!outcome) return;
    if (outcome.field === 'slotsOffered') {
      setSlotsError(outcome.message);
      slotsRef.current?.focus();
    } else {
      setFormError(outcome.message);
    }
  }

  return (
    <form
      id={formId}
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      className="flex flex-col gap-4"
    >
      <Field
        ref={slotsRef}
        label="Cupos a publicar"
        type="number"
        inputMode="numeric"
        min={1}
        step={1}
        required
        value={slots}
        hint={slotsHint}
        error={slotsError}
        onChange={(event) => setSlots(event.target.value)}
        className="sm:max-w-40"
      />
      <Textarea
        label="Descripción (opcional)"
        hint={`Hasta ${LISTING_TEXT_MAX} caracteres. ${description.length} de ${LISTING_TEXT_MAX}. Se muestra como texto, sin enlaces.`}
        value={description}
        maxLength={LISTING_TEXT_MAX}
        onChange={(event) => setDescription(event.target.value)}
      />
      <Textarea
        label="Condiciones (opcional)"
        hint={`Hasta ${LISTING_TEXT_MAX} caracteres. ${conditions.length} de ${LISTING_TEXT_MAX}.`}
        value={conditions}
        maxLength={LISTING_TEXT_MAX}
        onChange={(event) => setConditions(event.target.value)}
      />
      {formError && <Alert variant="error">{formError}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
