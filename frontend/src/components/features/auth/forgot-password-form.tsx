'use client';

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useForgotPassword } from '@/hooks/use-forgot-password';
import { validateForgotPasswordForm, type ForgotPasswordFieldErrors } from '@/lib/auth-validation';
import { RECOVER_MESSAGES, mapForgotPasswordError, type RecoverFormError } from './recover-errors';

export interface ForgotPasswordFormProps {
  /** Enlace a `/ingresar` que conserva `codigo` y `next`. */
  loginHref: string;
}

type View = 'form' | 'sent';
type FocusTarget = 'email' | 'formError' | 'sent' | null;

/**
 * Formulario de `/recuperar` (RF-003-10, RF-003-18, RNF-003-04).
 *
 * Tras el 202 cambia el formulario por un aviso con un texto fijo del cliente, el mismo exista
 * o no la cuenta (CA-003-09): nunca muestra el `message` del servidor. El `429 RATE_LIMITED` sí
 * se muestra (CA-003-13), porque el contador es por correo escrito y no revela la cuenta.
 */
export function ForgotPasswordForm({ loginHref }: ForgotPasswordFormProps) {
  const emailId = useId();
  const [view, setView] = useState<View>('form');
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [serverErrors, setServerErrors] = useState<ForgotPasswordFieldErrors>({});
  const [formError, setFormError] = useState<RecoverFormError | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget }>({ target: null });

  const emailRef = useRef<HTMLInputElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const sentRef = useRef<HTMLDivElement>(null);

  const { submit, retry, isSubmitting } = useForgotPassword();

  const clientErrors = useMemo(() => validateForgotPasswordForm({ email }), [email]);
  const emailError = serverErrors.email ?? (touched ? clientErrors.email : undefined);

  // Mueve el foco después de pintar el aviso o los errores.
  useEffect(() => {
    const { target } = focusTarget;
    if (target === 'email') emailRef.current?.focus();
    else if (target === 'formError') formErrorRef.current?.focus();
    else if (target === 'sent') sentRef.current?.focus();
  }, [focusTarget]);

  function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      // El cuerpo de la respuesta no se usa: el aviso es siempre el mismo (CA-003-09).
      setFormError(null);
      setView('sent');
      setFocusTarget({ target: 'sent' });
      return;
    }
    const errorView = mapForgotPasswordError(result.error);
    setServerErrors(errorView.fieldErrors);
    setFormError(errorView.formError);
    if (errorView.fieldErrors.email) setFocusTarget({ target: 'email' });
    else if (errorView.formError) setFocusTarget({ target: 'formError' });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    setTouched(true);
    setServerErrors({});
    setFormError(null);

    if (clientErrors.email) {
      setFocusTarget({ target: 'email' });
      return;
    }
    handleResult(await submit({ email: email.trim() }));
  }

  async function onRetry() {
    handleResult(await retry());
  }

  function onSendAgain() {
    setView('form');
    setFocusTarget({ target: 'email' });
  }

  if (view === 'sent') {
    return (
      <div className="flex flex-col gap-5">
        <div ref={sentRef} tabIndex={-1} className="rounded-field focus:outline-none">
          <Alert variant="success" title={RECOVER_MESSAGES.forgotSent}>
            {RECOVER_MESSAGES.forgotSentHint}
          </Alert>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row-reverse">
          <Button href={loginHref} fullWidth>
            Volver a ingresar
          </Button>
          <Button variant="secondary" onClick={onSendAgain} fullWidth>
            Enviar de nuevo
          </Button>
        </div>
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
        ref={emailRef}
        id={emailId}
        name="email"
        type="email"
        label="Correo"
        autoComplete="email"
        inputMode="email"
        autoCapitalize="none"
        spellCheck={false}
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (serverErrors.email) setServerErrors({});
        }}
        onBlur={() => setTouched(true)}
        error={emailError}
      />

      <div className="flex flex-col gap-2">
        <Button type="submit" loading={isSubmitting} fullWidth>
          Enviarme el enlace
        </Button>
        <p className="text-[15px] text-muted">Puedes pedir hasta 3 enlaces por hora.</p>
      </div>
    </form>
  );
}
