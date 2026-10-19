'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import { Alert, Button, Card, Field } from '@/components/ui';
import { useChangePassword } from '@/hooks/use-profile-actions';
import {
  CHANGE_PASSWORD_FIELDS,
  EMPTY_CHANGE_PASSWORD_VALUES,
  firstChangePasswordFieldWithError,
  validateChangePasswordForm,
  type ChangePasswordField,
  type ChangePasswordFieldErrors,
  type ChangePasswordFormValues,
} from '@/lib/profile-validation';
import { PasswordRules } from '../auth/password-rules';
import { PROFILE_MESSAGES, mapChangePasswordError, type ProfileFormError } from './profile-errors';

export interface ChangePasswordFormProps {
  /** Correo de la cuenta, para la regla "Distinta de tu correo". */
  email: string;
}

type FocusTarget = ChangePasswordField | 'formError' | 'notice' | null;

const NO_FIELDS: Record<ChangePasswordField, boolean> = {
  currentPassword: false,
  newPassword: false,
  newPasswordConfirmation: false,
};

/**
 * "Cambiar contraseña" de `/perfil` (RF-003-15, CA-003-16): la actual, la nueva con las reglas en
 * vivo y la confirmación. Al cambiarla, el backend cierra las demás sesiones y el proxy guarda la
 * sesión nueva de este dispositivo en la cookie (contrato 000 C).
 */
export function ChangePasswordForm({ email }: ChangePasswordFormProps) {
  const titleId = useId();
  const ids = {
    currentPassword: useId(),
    newPassword: useId(),
    newPasswordConfirmation: useId(),
    rules: useId(),
  };

  const [values, setValues] = useState<ChangePasswordFormValues>(EMPTY_CHANGE_PASSWORD_VALUES);
  const [touched, setTouched] = useState<Record<ChangePasswordField, boolean>>(NO_FIELDS);
  const [serverErrors, setServerErrors] = useState<ChangePasswordFieldErrors>({});
  const [formError, setFormError] = useState<ProfileFormError | null>(null);
  const [changed, setChanged] = useState(false);
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget }>({ target: null });

  const fieldRefs = useRef<Partial<Record<ChangePasswordField, HTMLInputElement | null>>>({});
  const formErrorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const { submit, retry, forget, isSubmitting } = useChangePassword();

  const clientErrors = useMemo(() => validateChangePasswordForm(values, email), [values, email]);
  const shownErrors: ChangePasswordFieldErrors = {};
  for (const field of CHANGE_PASSWORD_FIELDS) {
    const message = serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);
    if (message) shownErrors[field] = message;
  }

  useEffect(() => {
    const { target } = focusTarget;
    if (target === 'formError') formErrorRef.current?.focus();
    else if (target === 'notice') noticeRef.current?.focus();
    else if (target) fieldRefs.current[target]?.focus();
  }, [focusTarget]);

  const onChange = (field: ChangePasswordField) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    setChanged(false);
    if (serverErrors[field]) setServerErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const onBlur = (field: ChangePasswordField) => () =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      // Las contraseñas no quedan en memoria ni en el formulario.
      forget();
      setValues(EMPTY_CHANGE_PASSWORD_VALUES);
      setTouched(NO_FIELDS);
      setFormError(null);
      setChanged(true);
      setFocusTarget({ target: 'notice' });
      return;
    }
    const view = mapChangePasswordError(result.error);
    setServerErrors(view.fieldErrors);
    setFormError(view.formError);
    const firstField = firstChangePasswordFieldWithError(view.fieldErrors);
    setFocusTarget({ target: firstField ?? (view.formError ? 'formError' : null) });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setTouched({ currentPassword: true, newPassword: true, newPasswordConfirmation: true });
    setServerErrors({});
    setFormError(null);
    setChanged(false);
    const firstInvalid = firstChangePasswordFieldWithError(clientErrors);
    if (firstInvalid) {
      setFocusTarget({ target: firstInvalid });
      return;
    }
    handleResult(
      await submit({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
        newPasswordConfirmation: values.newPasswordConfirmation,
      }),
    );
  }

  async function onRetry() {
    handleResult(await retry());
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 id={titleId} className="font-display text-xl font-bold">
          Cambiar contraseña
        </h2>
        <p className="text-[15px] text-muted">Al cambiarla, cerramos tus otras sesiones.</p>
      </header>
      <form
        noValidate
        onSubmit={onSubmit}
        aria-labelledby={titleId}
        aria-busy={isSubmitting || undefined}
        className="flex flex-col gap-5"
      >
        {changed && (
          <div ref={noticeRef} tabIndex={-1} className="rounded-field focus:outline-none">
            <Alert variant="success">{PROFILE_MESSAGES.passwordChanged}</Alert>
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
          ref={(el) => {
            fieldRefs.current.currentPassword = el;
          }}
          id={ids.currentPassword}
          name="currentPassword"
          type="password"
          label="Contraseña actual"
          autoComplete="current-password"
          value={values.currentPassword}
          onChange={onChange('currentPassword')}
          onBlur={onBlur('currentPassword')}
          error={shownErrors.currentPassword}
        />
        <Field
          ref={(el) => {
            fieldRefs.current.newPassword = el;
          }}
          id={ids.newPassword}
          name="newPassword"
          type="password"
          label="Nueva contraseña"
          autoComplete="new-password"
          aria-describedby={ids.rules}
          value={values.newPassword}
          onChange={onChange('newPassword')}
          onBlur={onBlur('newPassword')}
          error={shownErrors.newPassword}
        />
        <Field
          ref={(el) => {
            fieldRefs.current.newPasswordConfirmation = el;
          }}
          id={ids.newPasswordConfirmation}
          name="newPasswordConfirmation"
          type="password"
          label="Confirma la nueva contraseña"
          autoComplete="new-password"
          value={values.newPasswordConfirmation}
          onChange={onChange('newPasswordConfirmation')}
          onBlur={onBlur('newPasswordConfirmation')}
          error={shownErrors.newPasswordConfirmation}
        />
        <PasswordRules id={ids.rules} password={values.newPassword} email={email} />
        <Button type="submit" loading={isSubmitting} className="w-full sm:w-auto sm:self-start">
          Cambiar contraseña
        </Button>
      </form>
    </Card>
  );
}
