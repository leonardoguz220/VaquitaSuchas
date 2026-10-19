'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui';
import { useUpdateGroup } from '@/hooks/use-update-group';
import type { GroupCurrency, GroupDetail } from '@/services/groups';
import { BILLING_DAYS, MAX_SLOTS, MIN_SLOTS } from './new-group-form-model';
import { SETTINGS_MESSAGES, settingsErrorView } from './group-settings-errors';
import {
  buildSettingsPatch,
  settingsValuesOf,
  type SettingsErrors,
  type SettingsValues,
} from './group-settings-model';

type Notice = { variant: 'success' | 'info' | 'error'; message: string } | null;

export interface GroupSettingsFormProps {
  group: GroupDetail;
  /** Recibe el grupo que devuelve la API, o el recargado tras un conflicto. */
  onGroupChange: (group: GroupDetail) => void;
  /** Con el grupo cerrado o congelado, el formulario queda en solo lectura (CA-001-16). */
  disabled: boolean;
}

/**
 * Formulario de edición del titular (T034, RF-001-14): nombre, precio, moneda, tipo de cambio,
 * día de cobro y cupos. Solo envía lo que cambió (`PATCH /groups/:id` con `version`). Antes de
 * guardar explica que el día de cobro nuevo rige desde el siguiente corte. Ante `409` recarga el
 * grupo y avisa; ante un cupo bajo los miembros lo marca en el campo.
 */
export function GroupSettingsForm({ group, onGroupChange, disabled }: GroupSettingsFormProps) {
  const [values, setValues] = useState<SettingsValues>(() => settingsValuesOf(group));
  const [errors, setErrors] = useState<SettingsErrors>({});
  const [notice, setNotice] = useState<Notice>(null);
  const { save, pending } = useUpdateGroup(group, onGroupChange);

  // Cuando la API devuelve otro grupo (guardado o recarga por conflicto), el formulario muestra ese.
  const [shownGroup, setShownGroup] = useState(group);
  if (shownGroup !== group) {
    setShownGroup(group);
    setValues(settingsValuesOf(group));
  }

  const billingDayChanged = values.billingDay !== String(group.billingDay);
  const usesRate = values.currency === 'USD';

  function set<K extends keyof SettingsValues>(field: K, value: SettingsValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const patch = buildSettingsPatch(values, group);
    if (!patch.ok) {
      setErrors(patch.errors);
      setNotice(null);
      return;
    }
    setErrors({});
    if (Object.keys(patch.input).length === 0) {
      setNotice({ variant: 'info', message: 'No hay cambios que guardar.' });
      return;
    }
    const result = await save(patch.input);
    if (!result) return;
    if (result.ok) {
      setNotice({ variant: 'success', message: 'Cambios guardados.' });
      return;
    }
    if (result.stale) {
      setNotice({ variant: 'error', message: SETTINGS_MESSAGES.stale });
      return;
    }
    const view = settingsErrorView(result.error);
    if (view.field) {
      setErrors({ [view.field]: view.message });
      setNotice(null);
    } else {
      setNotice({ variant: 'error', message: view.message });
    }
  }

  return (
    <form
      aria-labelledby="group-settings-form-title"
      onSubmit={onSubmit}
      noValidate
      className="flex flex-col gap-4"
    >
      <h3 id="group-settings-form-title" className="font-display text-lg font-bold">
        Datos del grupo
      </h3>
      <p className="text-[15px] text-muted">
        Cambiar el precio o el tipo de cambio no altera los cobros que ya se generaron.
      </p>

      <Field
        label="Nombre del grupo"
        name="name"
        value={values.name}
        onChange={(event) => set('name', event.target.value)}
        error={errors.name}
        disabled={disabled}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={`Precio (${values.currency === 'USD' ? 'USD' : 'Bs'})`}
          name="price"
          inputMode="decimal"
          value={values.price}
          onChange={(event) => set('price', event.target.value)}
          hint="Con coma decimal, por ejemplo 14,66."
          error={errors.price}
          disabled={disabled}
        />
        <Select
          label="Moneda"
          name="currency"
          value={values.currency}
          onChange={(event) => set('currency', event.target.value as GroupCurrency)}
          disabled={disabled}
        >
          <option value="BS">Bolivianos (Bs)</option>
          <option value="USD">Dólares (USD)</option>
        </Select>
      </div>

      {usesRate && (
        <Field
          label="Tipo de cambio (Bs por USD)"
          name="exchangeRate"
          inputMode="decimal"
          value={values.exchangeRate}
          onChange={(event) => set('exchangeRate', event.target.value)}
          hint="Por ejemplo 6,96."
          error={errors.exchangeRate}
          disabled={disabled}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label="Día de cobro"
          name="billingDay"
          value={values.billingDay}
          onChange={(event) => set('billingDay', event.target.value)}
          error={errors.billingDay}
          disabled={disabled}
        >
          {BILLING_DAYS.map((day) => (
            <option key={day} value={day}>
              Día {day}
            </option>
          ))}
        </Select>
        <Field
          label="Cupos (contándote)"
          name="totalSlots"
          inputMode="numeric"
          value={values.totalSlots}
          onChange={(event) => set('totalSlots', event.target.value)}
          hint={`Entre ${MIN_SLOTS} y ${MAX_SLOTS}.`}
          error={errors.totalSlots}
          disabled={disabled}
        />
      </div>

      {billingDayChanged && (
        <Alert variant="info" title="Así cambia el día de cobro">
          El día {values.billingDay} rige desde el siguiente corte. Los cobros que ya se generaron
          conservan su fecha.
        </Alert>
      )}

      {notice && (
        <Alert
          variant={notice.variant}
          title={notice.message}
          role={notice.variant === 'error' ? 'alert' : 'status'}
        />
      )}

      <Button
        type="submit"
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className="w-full sm:w-auto sm:self-start"
      >
        Guardar cambios
      </Button>
    </form>
  );
}
