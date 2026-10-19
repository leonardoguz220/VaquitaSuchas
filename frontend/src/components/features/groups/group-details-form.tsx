'use client';

import { useId, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Select, Textarea } from '@/components/ui';
import { useCreateGroup, useGroupQuote, type CreateGroupOutcome } from '@/hooks/use-create-group';
import {
  GROUP_LIMITS,
  maxSlotsFor,
  toQuoteRequest,
  validateGroupForm,
  type GroupFormContext,
  type GroupFormErrors,
  type GroupFormField,
  type GroupFormValues,
} from '@/lib/group-form';
import { isConnectionError, type ApiError } from '@/services/http';
import { GROUP_MESSAGES, groupErrorMessage } from './group-messages';
import { PaymentQrInput } from './payment-qr-input';
import { QuoteSummary } from './quote-summary';

const BILLING_DAYS = Array.from({ length: GROUP_LIMITS.maxBillingDay }, (_, index) => index + 1);

/** Orden de los campos para llevar el foco al primero con error. */
const FIELD_ORDER: GroupFormField[] = [
  'customServiceName',
  'name',
  'price',
  'exchangeRate',
  'billingDay',
  'totalSlots',
  'paymentInfoText',
];

interface FormError {
  message: string;
  canRetry: boolean;
}

function submitError(error: ApiError): FormError {
  if (isConnectionError(error)) return { message: GROUP_MESSAGES.connection, canRetry: true };
  if (error.code === 'VALIDATION_ERROR') {
    return { message: GROUP_MESSAGES.reviewForm, canRetry: false };
  }
  return { message: groupErrorMessage(error), canRetry: false };
}

export interface GroupDetailsFormProps {
  context: GroupFormContext;
  values: GroupFormValues;
  onValuesChange: (values: GroupFormValues) => void;
  qr: File | null;
  onQrChange: (file: File | null) => void;
  onBack: () => void;
  onCreated: (outcome: CreateGroupOutcome) => void;
}

/**
 * Paso 3 de "Crear suscripción" (plan 001 §6; mockup `NuevoGrupo.dc.html`): nombre, precio
 * propuesto y editable, moneda, tipo de cambio solo con USD, día de cobro, cupos con el máximo
 * del plan y datos de pago (texto y QR). "Así queda la cuota" sale de `POST /groups/quote`.
 */
export function GroupDetailsForm({
  context,
  values,
  onValuesChange,
  qr,
  onQrChange,
  onBack,
  onCreated,
}: GroupDetailsFormProps) {
  const formId = useId();
  const [errors, setErrors] = useState<GroupFormErrors>({});
  const [formError, setFormError] = useState<FormError | null>(null);
  const quoteRequest = toQuoteRequest(values, context);
  const quote = useGroupQuote(quoteRequest);
  const { submit, retry, isSubmitting } = useCreateGroup();
  const isCustom = context.planSlug === null;
  const maxSlots = maxSlotsFor(context);
  const fieldId = (field: GroupFormField) => `${formId}-${field}`;

  function update<K extends keyof GroupFormValues>(field: K, value: GroupFormValues[K]) {
    onValuesChange({ ...values, [field]: value });
    if (field in errors) setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      onCreated(result.data);
      return;
    }
    setFormError(submitError(result.error));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const validation = validateGroupForm(values, context);
    if (!validation.ok) {
      setErrors(validation.errors);
      const first = FIELD_ORDER.find((field) => validation.errors[field]);
      if (first) document.getElementById(fieldId(first))?.focus();
      return;
    }
    setErrors({});
    await handleResult(await submit({ group: validation.body, qr }));
  }

  async function handleRetry() {
    setFormError(null);
    await handleResult(await retry());
  }

  const slotsHint = isCustom
    ? `Entre ${GROUP_LIMITS.minSlots} y ${GROUP_LIMITS.maxSlots} personas, contándote.`
    : `Este plan permite hasta ${maxSlots}, contándote.`;
  const billingDay = Number(values.billingDay);
  const billingHint =
    billingDay > 28
      ? 'En los meses más cortos se cobra el último día del mes.'
      : 'Cada mes se genera el cobro ese día.';

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <form
        id={formId}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        aria-labelledby={`${formId}-title`}
        className="flex flex-col gap-5 rounded-card border border-line bg-surface p-5 sm:p-6"
      >
        <h2 id={`${formId}-title`} className="font-display text-xl font-bold">
          3. Datos del grupo
        </h2>

        {isCustom && (
          <Field
            id={fieldId('customServiceName')}
            label="Nombre del servicio"
            value={values.customServiceName}
            onChange={(event) => update('customServiceName', event.target.value)}
            maxLength={GROUP_LIMITS.nameMax}
            hint="Por ejemplo, el nombre de la plataforma que van a compartir."
            error={errors.customServiceName}
            autoComplete="off"
          />
        )}

        <Field
          id={fieldId('name')}
          label="Nombre del grupo"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          maxLength={GROUP_LIMITS.nameMax}
          hint="Así lo verán los miembros."
          error={errors.name}
          autoComplete="off"
        />

        <div className="grid gap-5 sm:grid-cols-[160px_minmax(0,1fr)]">
          <Select
            label="Moneda"
            value={values.currency}
            onChange={(event) =>
              update('currency', event.target.value as GroupFormValues['currency'])
            }
          >
            <option value="USD">USD (dólares)</option>
            <option value="BS">Bs (bolivianos)</option>
          </Select>
          <Field
            id={fieldId('price')}
            label="Precio mensual del plan"
            inputMode="decimal"
            value={values.price}
            onChange={(event) => update('price', event.target.value)}
            hint={
              isCustom
                ? 'Lo que cuesta el servicio al mes, por ejemplo 14,66.'
                : 'Propuesto por el catálogo; puedes cambiarlo.'
            }
            error={errors.price}
            autoComplete="off"
          />
        </div>

        {values.currency === 'USD' && (
          <Field
            id={fieldId('exchangeRate')}
            label="Tipo de cambio (Bs por USD)"
            inputMode="decimal"
            value={values.exchangeRate}
            onChange={(event) => update('exchangeRate', event.target.value)}
            hint="Lo defines tú y lo puedes actualizar."
            error={errors.exchangeRate}
            autoComplete="off"
          />
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            id={fieldId('billingDay')}
            label="Día de cobro"
            placeholder="Elige el día"
            value={values.billingDay}
            onChange={(event) => update('billingDay', event.target.value)}
            hint={billingHint}
            error={errors.billingDay}
          >
            {BILLING_DAYS.map((day) => (
              <option key={day} value={String(day)}>
                Día {day} de cada mes
              </option>
            ))}
          </Select>
          <Field
            id={fieldId('totalSlots')}
            label="Cupos (contándote)"
            type="number"
            inputMode="numeric"
            min={GROUP_LIMITS.minSlots}
            max={maxSlots}
            value={values.totalSlots}
            onChange={(event) => update('totalSlots', event.target.value)}
            hint={slotsHint}
            error={errors.totalSlots}
          />
        </div>

        <Textarea
          id={fieldId('paymentInfoText')}
          label="Datos de pago para los miembros (opcional)"
          value={values.paymentInfoText}
          onChange={(event) => update('paymentInfoText', event.target.value)}
          maxLength={GROUP_LIMITS.paymentInfoMax}
          hint={`Banco, cuenta y nombre. ${Array.from(values.paymentInfoText).length} de ${GROUP_LIMITS.paymentInfoMax} caracteres.`}
          error={errors.paymentInfoText}
        />

        <PaymentQrInput file={qr} onChange={onQrChange} />

        {formError && (
          <Alert
            variant="error"
            title={GROUP_MESSAGES.createFailed}
            action={
              formError.canRetry ? (
                <Button variant="secondary" onClick={() => void handleRetry()}>
                  Reintentar
                </Button>
              ) : undefined
            }
          >
            {formError.message}
          </Alert>
        )}
      </form>

      <QuoteSummary
        request={quoteRequest}
        status={quote.status}
        quote={quote.quote}
        error={quote.error}
        onRetry={quote.retry}
        actions={
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
              Atrás
            </Button>
            <Button type="submit" form={formId} loading={isSubmitting}>
              Crear suscripción
            </Button>
          </div>
        }
      />
    </div>
  );
}
