'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { controlClass, FieldError, FieldHint, FieldLabel } from '@/components/ui/field-parts';
import { useCreateGroup, type CreateGroupOutcome } from '@/hooks/use-create-group';
import { useGroupQuote } from '@/hooks/use-group-quote';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import type { GroupCurrency } from '@/services/groups';
import { mapCreateGroupError, type NewGroupFormError } from './new-group-errors';
import {
  BILLING_DAYS,
  initialValues,
  isCustom,
  maxSlotsFor,
  MIN_SLOTS,
  PAYMENT_TEXT_MAX,
  toQuoteRequest,
  validateGroupForm,
  type GroupFormErrors,
  type GroupFormValues,
  type NewGroupChoice,
} from './new-group-form-model';
import { QrUpload } from './qr-upload';
import { QuotePanel } from './quote-panel';

function PaymentTextField({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>Datos de pago para los miembros (opcional)</FieldLabel>
      <textarea
        id={id}
        name="paymentInfoText"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={PAYMENT_TEXT_MAX}
        rows={3}
        placeholder="Banco, número de cuenta y nombre del titular de la cuenta"
        aria-invalid={error ? true : undefined}
        aria-describedby={cx(`${id}-hint`, error && `${id}-error`)}
        className={cx(controlClass, 'py-3')}
      />
      <FieldHint id={`${id}-hint`}>
        Los ven los miembros en la pantalla de cobro. {value.length}/{PAYMENT_TEXT_MAX} caracteres.
      </FieldHint>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

export interface NewGroupFormProps {
  choice: NewGroupChoice;
  /** Sin habilitación (RF-001-21) o con 5 grupos activos (RN-001-14): no se puede enviar. */
  blocked: boolean;
  onBack: () => void;
  onCreated: (outcome: CreateGroupOutcome) => void;
  /** El backend respondió que el usuario no puede crear: hay que mostrar qué le falta. */
  onEligibilityProblem: () => void;
}

/**
 * Paso 3 de `/grupos/nuevo` (plan 001 §6; mockup `NuevoGrupo.dc.html`). La cuota se pide a
 * `POST /groups/quote`; el frontend no la calcula.
 */
export function NewGroupForm({
  choice,
  blocked,
  onBack,
  onCreated,
  onEligibilityProblem,
}: NewGroupFormProps) {
  const [values, setValues] = useState<GroupFormValues>(() => initialValues(choice));
  const [errors, setErrors] = useState<GroupFormErrors>({});
  const [formError, setFormError] = useState<NewGroupFormError | null>(null);
  const [qr, setQr] = useState<File | null>(null);
  const [focusRequest, setFocusRequest] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const create = useCreateGroup();
  const quoteRequest = toQuoteRequest(values, choice);
  const quote = useGroupQuote(quoteRequest);
  const maxSlots = maxSlotsFor(choice);
  const isUsd = values.currency === 'USD';

  useEffect(() => {
    if (focusRequest === 0) return;
    formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [focusRequest]);

  function set<K extends keyof GroupFormValues>(field: K, value: GroupFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function handleResult(result: ApiSubmitResult<CreateGroupOutcome> | null) {
    if (result === null) return;
    if (result.ok) {
      onCreated(result.data);
      return;
    }
    const view = mapCreateGroupError(result.error);
    setErrors(view.fieldErrors);
    setFormError(view.formError);
    if (view.eligibilityProblem) onEligibilityProblem();
    if (Object.keys(view.fieldErrors).length > 0) setFocusRequest((count) => count + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (blocked) return;
    setFormError(null);
    const validation = validateGroupForm(values, choice);
    if (!validation.ok) {
      setErrors(validation.errors);
      setFocusRequest((count) => count + 1);
      return;
    }
    handleResult(await create.submit({ request: validation.request, qr }));
  }

  async function retry() {
    setFormError(null);
    handleResult(await create.retry());
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
      <form
        ref={formRef}
        noValidate
        onSubmit={handleSubmit}
        aria-label="Datos del grupo"
        className="flex flex-col gap-5"
      >
        {isCustom(choice) && (
          <Field
            label="Nombre del servicio"
            name="customServiceName"
            value={values.customServiceName}
            onChange={(event) => set('customServiceName', event.target.value)}
            placeholder="Ej.: Canva Pro"
            error={errors.customServiceName}
            autoComplete="off"
          />
        )}
        <Field
          label="Nombre del grupo"
          name="name"
          value={values.name}
          onChange={(event) => set('name', event.target.value)}
          placeholder="Ej.: Netflix del depa"
          error={errors.name}
          autoComplete="off"
        />
        <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-start gap-3">
          <Select
            label="Moneda"
            name="currency"
            value={values.currency}
            onChange={(event) => {
              set('currency', event.target.value as GroupCurrency);
              setErrors((current) => ({ ...current, exchangeRate: undefined }));
            }}
          >
            <option value="USD">USD</option>
            <option value="BS">Bs</option>
          </Select>
          <Field
            label="Precio mensual"
            name="price"
            inputMode="decimal"
            value={values.price}
            onChange={(event) => set('price', event.target.value)}
            placeholder="0,00"
            hint={isCustom(choice) ? undefined : 'Propuesto por el catálogo; puedes cambiarlo.'}
            error={errors.price}
            autoComplete="off"
          />
        </div>
        {isUsd && (
          <Field
            label="Tipo de cambio (Bs por USD)"
            name="exchangeRate"
            inputMode="decimal"
            value={values.exchangeRate}
            onChange={(event) => set('exchangeRate', event.target.value)}
            placeholder="6,96"
            hint="Lo defines tú y lo puedes actualizar."
            error={errors.exchangeRate}
            autoComplete="off"
          />
        )}
        <Select
          label="Día de cobro"
          name="billingDay"
          value={values.billingDay}
          onChange={(event) => set('billingDay', event.target.value)}
          hint={
            Number(values.billingDay) > 28
              ? 'En los meses que no tienen ese día se cobra el último día del mes.'
              : undefined
          }
          error={errors.billingDay}
        >
          {BILLING_DAYS.map((day) => (
            <option key={day} value={String(day)}>
              Día {day} de cada mes
            </option>
          ))}
        </Select>
        <Field
          label="Cupos (contándote)"
          name="totalSlots"
          type="number"
          inputMode="numeric"
          min={MIN_SLOTS}
          max={maxSlots}
          value={values.totalSlots}
          onChange={(event) => set('totalSlots', event.target.value)}
          hint={
            isCustom(choice)
              ? `Entre ${MIN_SLOTS} y ${maxSlots}.`
              : `Este plan permite hasta ${maxSlots}.`
          }
          error={errors.totalSlots}
        />
        <PaymentTextField
          value={values.paymentInfoText}
          error={errors.paymentInfoText}
          onChange={(value) => set('paymentInfoText', value)}
        />
        <QrUpload file={qr} onChange={setQr} />

        {formError && (
          <Alert
            variant="error"
            title={formError.message}
            action={
              formError.kind === 'connection' ? (
                <Button variant="secondary" onClick={retry} className="w-full sm:w-auto">
                  Reintentar
                </Button>
              ) : undefined
            }
          />
        )}

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <Button variant="secondary" onClick={onBack} className="w-full sm:w-auto">
            Volver
          </Button>
          <Button
            type="submit"
            loading={create.isSubmitting}
            disabled={blocked}
            className="w-full sm:w-auto"
          >
            Crear suscripción
          </Button>
        </div>
      </form>

      <div className="lg:sticky lg:top-6">
        <QuotePanel
          state={quote.state}
          request={quoteRequest}
          onRetry={quote.retry}
          needsExchangeRate={isUsd}
        />
      </div>
    </div>
  );
}
