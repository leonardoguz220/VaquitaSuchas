'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { FieldError } from '@/components/ui/field-parts';
import { useRegister } from '@/hooks/use-register';
import {
  EMPTY_REGISTER_VALUES,
  REGISTER_FIELDS,
  firstFieldWithError,
  validateRegisterForm,
  type RegisterField,
  type RegisterFieldErrors,
  type RegisterFormValues,
} from '@/lib/auth-validation';
import { REGISTER_VERIFY_PATH } from '@/lib/routes';
import type { RegisterRequest, RegisterResponse } from '@/services/auth';
import { PasswordRules } from './password-rules';
import { PolicyModal } from './policy-modal';
import { mapRegisterError, type RegisterFormError } from './register-errors';
import { saveRegisterVerification } from './verification-storage';

export interface RegisterFormProps {
  /** Contenido del modal de la política de datos (hoy, `DataPolicySummary`). */
  policyContent: ReactNode;
}

type FocusTarget = RegisterField | 'formError' | null;

const NO_FIELDS: Record<RegisterField, boolean> = {
  fullName: false,
  email: false,
  ci: false,
  password: false,
  passwordConfirmation: false,
  acceptDataPolicy: false,
};

function toRequest(values: RegisterFormValues): RegisterRequest {
  return {
    fullName: values.fullName.trim(),
    email: values.email.trim(),
    ci: values.ci.trim(),
    password: values.password,
    passwordConfirmation: values.passwordConfirmation,
    acceptDataPolicy: true,
  };
}

/**
 * Formulario de registro, paso 1 de 2 (RF-003-01, RF-003-03, RF-003-23, RNF-003-04).
 *
 * Validación: los errores de ayuda aparecen al salir de cada campo y se recalculan en vivo; las
 * reglas de la contraseña se ven siempre. El botón no se deshabilita por datos incompletos (un
 * botón deshabilitado no explica qué falta); al enviar se revisa todo, se muestran los errores
 * y el foco va al primero. El servidor vuelve a validar y sus errores (por `code`) mandan.
 */
export function RegisterForm({ policyContent }: RegisterFormProps) {
  const router = useRouter();
  const ids = {
    fullName: useId(),
    email: useId(),
    ci: useId(),
    password: useId(),
    passwordConfirmation: useId(),
    acceptDataPolicy: useId(),
    rules: useId(),
  };

  const [values, setValues] = useState<RegisterFormValues>(EMPTY_REGISTER_VALUES);
  const [touched, setTouched] = useState<Record<RegisterField, boolean>>(NO_FIELDS);
  const [serverErrors, setServerErrors] = useState<RegisterFieldErrors>({});
  const [formError, setFormError] = useState<RegisterFormError | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget }>({ target: null });

  const fieldRefs = useRef<Partial<Record<RegisterField, HTMLInputElement | null>>>({});
  const formErrorRef = useRef<HTMLDivElement>(null);

  const onSuccess = useCallback(
    (data: RegisterResponse) => {
      saveRegisterVerification(data.verification);
      router.push(REGISTER_VERIFY_PATH);
    },
    [router],
  );
  const { status, submit, retry, isSubmitting } = useRegister({ onSuccess });

  const clientErrors = useMemo(() => validateRegisterForm(values), [values]);
  const shownErrors: RegisterFieldErrors = {};
  for (const field of REGISTER_FIELDS) {
    const message = serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);
    if (message) shownErrors[field] = message;
  }

  // Mueve el foco después de pintar los errores de un envío fallido.
  useEffect(() => {
    const { target } = focusTarget;
    if (target === 'formError') formErrorRef.current?.focus();
    else if (target) fieldRefs.current[target]?.focus();
  }, [focusTarget]);

  function setField<K extends RegisterField>(field: K, value: RegisterFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    // Un error del servidor se va cuando la persona corrige ese dato.
    if (serverErrors[field]) {
      setServerErrors(({ [field]: _removed, ...rest }) => rest);
    }
  }

  const onText =
    (field: Exclude<RegisterField, 'acceptDataPolicy'>) => (event: ChangeEvent<HTMLInputElement>) =>
      setField(field, event.target.value);

  const onBlur = (field: RegisterField) => () =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      setFormError(null);
      return;
    }
    const view = mapRegisterError(result.error);
    setServerErrors(view.fieldErrors);
    setFormError(view.formError);
    const firstField = firstFieldWithError(view.fieldErrors);
    setFocusTarget({ target: firstField ?? (view.formError ? 'formError' : null) });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || status === 'success') return;

    setTouched({
      fullName: true,
      email: true,
      ci: true,
      password: true,
      passwordConfirmation: true,
      acceptDataPolicy: true,
    });
    setServerErrors({});
    setFormError(null);

    const firstInvalid = firstFieldWithError(clientErrors);
    if (firstInvalid) {
      setFocusTarget({ target: firstInvalid });
      return;
    }
    handleResult(await submit(toRequest(values)));
  }

  async function onRetry() {
    // El aviso sigue visible (con "Reintentar" cargando) hasta que llega la respuesta.
    handleResult(await retry());
  }

  const busy = isSubmitting || status === 'success';

  return (
    <>
      <form
        noValidate
        onSubmit={onSubmit}
        aria-busy={busy || undefined}
        className="flex flex-col gap-5"
      >
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
        {status === 'success' && (
          <Alert variant="success">Listo. Ahora verifica tu celular con Telegram…</Alert>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              ref={(el) => {
                fieldRefs.current.fullName = el;
              }}
              id={ids.fullName}
              name="fullName"
              label="Nombre completo"
              autoComplete="name"
              value={values.fullName}
              onChange={onText('fullName')}
              onBlur={onBlur('fullName')}
              error={shownErrors.fullName}
            />
          </div>
          <Field
            ref={(el) => {
              fieldRefs.current.email = el;
            }}
            id={ids.email}
            name="email"
            type="email"
            label="Correo"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            spellCheck={false}
            value={values.email}
            onChange={onText('email')}
            onBlur={onBlur('email')}
            error={shownErrors.email}
          />
          <Field
            ref={(el) => {
              fieldRefs.current.ci = el;
            }}
            id={ids.ci}
            name="ci"
            label="Cédula de identidad"
            inputMode="numeric"
            autoComplete="off"
            hint="Solo el número, sin extensión."
            value={values.ci}
            onChange={onText('ci')}
            onBlur={onBlur('ci')}
            error={shownErrors.ci}
          />
          <Field
            ref={(el) => {
              fieldRefs.current.password = el;
            }}
            id={ids.password}
            name="password"
            type="password"
            label="Contraseña"
            autoComplete="new-password"
            aria-describedby={ids.rules}
            value={values.password}
            onChange={onText('password')}
            onBlur={onBlur('password')}
            error={shownErrors.password}
          />
          <Field
            ref={(el) => {
              fieldRefs.current.passwordConfirmation = el;
            }}
            id={ids.passwordConfirmation}
            name="passwordConfirmation"
            type="password"
            label="Confirma la contraseña"
            autoComplete="new-password"
            value={values.passwordConfirmation}
            onChange={onText('passwordConfirmation')}
            onBlur={onBlur('passwordConfirmation')}
            error={shownErrors.passwordConfirmation}
          />
          <div className="sm:col-span-2">
            <PasswordRules id={ids.rules} password={values.password} email={values.email} />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor={ids.acceptDataPolicy}
            className="flex min-h-11 cursor-pointer items-center gap-3 text-base"
          >
            <input
              ref={(el) => {
                fieldRefs.current.acceptDataPolicy = el;
              }}
              id={ids.acceptDataPolicy}
              name="acceptDataPolicy"
              type="checkbox"
              checked={values.acceptDataPolicy}
              onChange={(event) => setField('acceptDataPolicy', event.target.checked)}
              onBlur={onBlur('acceptDataPolicy')}
              aria-invalid={shownErrors.acceptDataPolicy ? true : undefined}
              aria-describedby={
                shownErrors.acceptDataPolicy ? `${ids.acceptDataPolicy}-error` : undefined
              }
              className="size-5.5 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <span>
              Acepto la{' '}
              <button
                type="button"
                onClick={(event) => {
                  // No marca la casilla: solo abre el modal.
                  event.preventDefault();
                  event.stopPropagation();
                  setPolicyOpen(true);
                }}
                className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                política de datos
              </button>{' '}
              de Vaquita.
            </span>
          </label>
          {shownErrors.acceptDataPolicy && (
            <FieldError id={`${ids.acceptDataPolicy}-error`}>
              {shownErrors.acceptDataPolicy}
            </FieldError>
          )}
        </div>

        <div className="flex sm:justify-end">
          <Button type="submit" loading={busy} className="w-full sm:w-auto sm:px-8">
            Continuar a la verificación
          </Button>
        </div>
      </form>

      <PolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)}>
        {policyContent}
      </PolicyModal>
    </>
  );
}
