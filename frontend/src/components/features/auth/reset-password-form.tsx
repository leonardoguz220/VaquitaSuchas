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
import { Alert, Button, Field } from '@/components/ui';
import { useResetPassword } from '@/hooks/use-reset-password';
import {
  EMPTY_RESET_PASSWORD_VALUES,
  RESET_PASSWORD_FIELDS,
  firstResetPasswordFieldWithError,
  validateResetPasswordForm,
  type ResetPasswordField,
  type ResetPasswordFieldErrors,
  type ResetPasswordFormValues,
} from '@/lib/auth-validation';
import { PasswordRules } from './password-rules';
import { RECOVER_MESSAGES, mapResetPasswordError, type RecoverFormError } from './recover-errors';

export interface ResetPasswordFormProps {
  /** Token del enlace del correo. Solo viaja en el cuerpo de la petición: nunca se muestra. */
  token: string;
  /** `/ingresar`, tras cambiar la contraseña. */
  loginHref: string;
  /** `/recuperar`, para pedir otro enlace si este venció o ya se usó. */
  recoverHref: string;
}

type View = 'form' | 'done' | 'invalidLink';
type FocusTarget = ResetPasswordField | 'formError' | 'notice' | null;

const NO_FIELDS: Record<ResetPasswordField, boolean> = {
  newPassword: false,
  newPasswordConfirmation: false,
};

/**
 * Formulario de `/recuperar/[token]` (RF-003-12, RNF-003-04).
 *
 * Las reglas de la contraseña se ven en vivo; aquí no se conoce el correo, así que la regla
 * "distinta del correo" queda como nota y la decide el servidor (`WEAK_PASSWORD`). Tras el 204
 * cambia el formulario por el aviso y "Ingresar"; con `410 RESET_TOKEN_INVALID`, por el aviso de
 * enlace vencido y "Pedir otro enlace" (CA-003-11, CA-003-12).
 */
export function ResetPasswordForm({ token, loginHref, recoverHref }: ResetPasswordFormProps) {
  const ids = { newPassword: useId(), newPasswordConfirmation: useId(), rules: useId() };

  const [view, setView] = useState<View>('form');
  const [values, setValues] = useState<ResetPasswordFormValues>(EMPTY_RESET_PASSWORD_VALUES);
  const [touched, setTouched] = useState<Record<ResetPasswordField, boolean>>(NO_FIELDS);
  const [serverErrors, setServerErrors] = useState<ResetPasswordFieldErrors>({});
  const [formError, setFormError] = useState<RecoverFormError | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget }>({ target: null });

  const fieldRefs = useRef<Partial<Record<ResetPasswordField, HTMLInputElement | null>>>({});
  const formErrorRef = useRef<HTMLDivElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);

  const { submit, retry, isSubmitting } = useResetPassword();

  const clientErrors = useMemo(() => validateResetPasswordForm(values), [values]);
  const shownErrors: ResetPasswordFieldErrors = {};
  for (const field of RESET_PASSWORD_FIELDS) {
    const message = serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);
    if (message) shownErrors[field] = message;
  }

  // Mueve el foco después de pintar el aviso o los errores.
  useEffect(() => {
    const { target } = focusTarget;
    if (target === 'formError') formErrorRef.current?.focus();
    else if (target === 'notice') noticeRef.current?.focus();
    else if (target) fieldRefs.current[target]?.focus();
  }, [focusTarget]);

  const onChange = (field: ResetPasswordField) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    if (serverErrors[field]) setServerErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const onBlur = (field: ResetPasswordField) => () =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      setFormError(null);
      setView('done');
      setFocusTarget({ target: 'notice' });
      return;
    }
    const errorView = mapResetPasswordError(result.error);
    if (errorView.invalidLink) {
      setFormError(null);
      setView('invalidLink');
      setFocusTarget({ target: 'notice' });
      return;
    }
    setServerErrors(errorView.fieldErrors);
    setFormError(errorView.formError);
    const firstField = firstResetPasswordFieldWithError(errorView.fieldErrors);
    setFocusTarget({ target: firstField ?? (errorView.formError ? 'formError' : null) });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setTouched({ newPassword: true, newPasswordConfirmation: true });
    setServerErrors({});
    setFormError(null);

    const firstInvalid = firstResetPasswordFieldWithError(clientErrors);
    if (firstInvalid) {
      setFocusTarget({ target: firstInvalid });
      return;
    }
    handleResult(
      await submit({
        token,
        newPassword: values.newPassword,
        newPasswordConfirmation: values.newPasswordConfirmation,
      }),
    );
  }

  async function onRetry() {
    handleResult(await retry());
  }

  if (view === 'done') {
    return (
      <div className="flex flex-col gap-5">
        <div ref={noticeRef} tabIndex={-1} className="rounded-field focus:outline-none">
          <Alert variant="success">{RECOVER_MESSAGES.resetDone}</Alert>
        </div>
        <Button href={loginHref} fullWidth>
          Ingresar
        </Button>
      </div>
    );
  }

  if (view === 'invalidLink') {
    return (
      <div className="flex flex-col gap-5">
        <div ref={noticeRef} tabIndex={-1} className="rounded-field focus:outline-none">
          <Alert variant="error">{RECOVER_MESSAGES.resetTokenInvalid}</Alert>
        </div>
        <Button href={recoverHref} fullWidth>
          Pedir otro enlace
        </Button>
      </div>
    );
  }

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      aria-busy={isSubmitting || undefined}
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
        label="Confirma la contraseña"
        autoComplete="new-password"
        value={values.newPasswordConfirmation}
        onChange={onChange('newPasswordConfirmation')}
        onBlur={onBlur('newPasswordConfirmation')}
        error={shownErrors.newPasswordConfirmation}
      />
      <PasswordRules id={ids.rules} password={values.newPassword} />

      <Button type="submit" loading={isSubmitting} fullWidth>
        Guardar contraseña
      </Button>
    </form>
  );
}
