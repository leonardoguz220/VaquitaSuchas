'use client';

import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useUpdateName } from '@/hooks/use-profile-actions';
import { validateFullName } from '@/lib/profile-validation';
import type { UserSelf } from '@/services/auth';
import { PROFILE_MESSAGES, mapUpdateNameError, type ProfileFormError } from './profile-errors';

export interface NameFormProps {
  /** Nombre actual, tal como lo entrega la API. */
  fullName: string;
  /** Recibe el `UserSelf` que devolvió `PATCH /users/me`. */
  onSaved: (user: UserSelf) => void;
}

type FocusTarget = 'field' | 'formError' | 'notice' | null;

/**
 * Nombre editable del perfil (RF-003-14, CA-003-14). Valida en vivo el largo (2 a 80) como
 * ayuda; el servidor decide. Tras guardar muestra el nombre que devolvió la API.
 */
export function NameForm({ fullName, onSaved }: NameFormProps) {
  const fieldId = useId();
  const [value, setValue] = useState(fullName);
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [formError, setFormError] = useState<ProfileFormError | null>(null);
  const [saved, setSaved] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget }>({ target: null });

  const fieldRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const { submit, retry, isSubmitting } = useUpdateName();

  const clientError = validateFullName(value);
  const shownError = serverError ?? (touched ? clientError : undefined);

  useEffect(() => {
    const { target } = focusTarget;
    if (target === 'field') fieldRef.current?.focus();
    else if (target === 'formError') formErrorRef.current?.focus();
    else if (target === 'notice') noticeRef.current?.focus();
  }, [focusTarget]);

  function onChange(event: ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value);
    setServerError(null);
    setSaved(false);
  }

  function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      onSaved(result.data);
      setValue(result.data.fullName);
      setTouched(false);
      setFormError(null);
      setSaved(true);
      setFocusTarget({ target: 'notice' });
      return;
    }
    const view = mapUpdateNameError(result.error);
    setServerError(view.fieldError);
    setFormError(view.formError);
    setFocusTarget({ target: view.fieldError ? 'field' : 'formError' });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setTouched(true);
    setServerError(null);
    setFormError(null);
    setSaved(false);
    if (clientError) {
      setFocusTarget({ target: 'field' });
      return;
    }
    handleResult(await submit({ fullName: value.trim() }));
  }

  async function onRetry() {
    handleResult(await retry());
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-label="Tu nombre"
      aria-busy={isSubmitting || undefined}
      className="flex flex-col gap-4"
    >
      {saved && (
        <div ref={noticeRef} tabIndex={-1} className="rounded-field focus:outline-none">
          <Alert variant="success">{PROFILE_MESSAGES.nameSaved}</Alert>
        </div>
      )}
      {formError && (
        <div ref={formErrorRef} tabIndex={-1} className="rounded-field focus:outline-none">
          <Alert
            variant="error"
            action={
              formError.kind === 'connection' ? (
                <Button variant="secondary" onClick={onRetry} loading={isSubmitting}>
                  Reintentar
                </Button>
              ) : undefined
            }
          >
            {formError.message}
          </Alert>
        </div>
      )}
      <Field
        ref={fieldRef}
        id={fieldId}
        name="fullName"
        label="Nombre completo"
        autoComplete="name"
        value={value}
        onChange={onChange}
        onBlur={() => setTouched(true)}
        error={shownError}
      />
      <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto sm:self-start">
        Guardar nombre
      </Button>
    </form>
  );
}
