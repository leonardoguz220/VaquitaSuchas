'use client';

import Link from 'next/link';
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
} from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useCountdown } from '@/hooks/use-countdown';
import { useLogin } from '@/hooks/use-login';
import {
  EMPTY_LOGIN_VALUES,
  LOGIN_FIELDS,
  firstLoginFieldWithError,
  validateLoginForm,
  type LoginField,
  type LoginFieldErrors,
  type LoginFormValues,
} from '@/lib/auth-validation';
import type { LoginRequest } from '@/services/auth';
import {
  LOGIN_ERROR_MESSAGES,
  formatWaitTime,
  mapLoginError,
  type LoginFormError,
} from './login-errors';

export interface LoginFormProps {
  /**
   * A dónde ir tras ingresar, ya validado por `resolvePostLoginPath` (ruta interna segura de
   * `next`, `/unirse?codigo=…` o `/`).
   */
  redirectTo: string;
  /** Enlace a `/recuperar` que conserva `codigo` y `next`. */
  forgotHref: string;
}

type FocusTarget = LoginField | 'formError' | null;

const NO_FIELDS: Record<LoginField, boolean> = { email: false, password: false };

function toRequest(values: LoginFormValues): LoginRequest {
  return { email: values.email.trim(), password: values.password };
}

/**
 * Formulario de `/ingresar` (RF-003-06, RNF-003-02, RNF-003-04).
 *
 * Validación de ayuda mínima (correo con forma y contraseña no vacía): los errores aparecen al
 * salir de cada campo; al enviar se revisa todo y el foco va al primero con error. El servidor
 * decide y sus errores se muestran por `code`; las credenciales incorrectas dan un aviso
 * genérico arriba, sin señalar cuál de los dos datos falló.
 */
export function LoginForm({ redirectTo, forgotHref }: LoginFormProps) {
  const router = useRouter();
  const ids = { email: useId(), password: useId() };

  const [values, setValues] = useState<LoginFormValues>(EMPTY_LOGIN_VALUES);
  const [touched, setTouched] = useState<Record<LoginField, boolean>>(NO_FIELDS);
  const [serverErrors, setServerErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<LoginFormError | null>(null);
  const [focusTarget, setFocusTarget] = useState<{ target: FocusTarget }>({ target: null });
  /** Fin de la espera tras `RATE_LIMITED` (ahora + `retryAfterSeconds`); solo en memoria. */
  const [cooldownUntil, setCooldownUntil] = useState<string | null>(null);
  /** Única región `aria-live`: anuncia el inicio y el fin de la espera, no cada segundo. */
  const [announcement, setAnnouncement] = useState('');

  const fieldRefs = useRef<Partial<Record<LoginField, HTMLInputElement | null>>>({});
  const formErrorRef = useRef<HTMLDivElement>(null);

  const onSuccess = useCallback(() => router.replace(redirectTo), [router, redirectTo]);
  const { status, submit, retry, isSubmitting } = useLogin({ onSuccess });

  const onCooldownEnd = useCallback(() => setAnnouncement(LOGIN_ERROR_MESSAGES.rateLimitReady), []);
  const remaining = useCountdown(cooldownUntil, onCooldownEnd);
  const remainingSeconds = remaining ?? 0;
  const cooling = remainingSeconds > 0;

  const clientErrors = useMemo(() => validateLoginForm(values), [values]);
  const shownErrors: LoginFieldErrors = {};
  for (const field of LOGIN_FIELDS) {
    const message = serverErrors[field] ?? (touched[field] ? clientErrors[field] : undefined);
    if (message) shownErrors[field] = message;
  }

  // Mueve el foco después de pintar los errores de un envío fallido.
  useEffect(() => {
    const { target } = focusTarget;
    if (target === 'formError') formErrorRef.current?.focus();
    else if (target) fieldRefs.current[target]?.focus();
  }, [focusTarget]);

  const onChange = (field: LoginField) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setValues((current) => ({ ...current, [field]: value }));
    // Un error del servidor se va cuando la persona corrige ese dato.
    if (serverErrors[field]) setServerErrors(({ [field]: _removed, ...rest }) => rest);
  };

  const onBlur = (field: LoginField) => () =>
    setTouched((current) => (current[field] ? current : { ...current, [field]: true }));

  function handleResult(result: Awaited<ReturnType<typeof submit>>) {
    if (!result) return;
    if (result.ok) {
      setFormError(null);
      return;
    }
    const view = mapLoginError(result.error);
    const seconds = view.formError?.retryAfterSeconds;
    if (view.formError?.kind === 'rateLimited' && seconds !== undefined) {
      setCooldownUntil(new Date(Date.now() + seconds * 1000).toISOString());
      setAnnouncement(view.formError.message);
    }
    setServerErrors(view.fieldErrors);
    setFormError(view.formError);
    const firstField = firstLoginFieldWithError(view.fieldErrors);
    setFocusTarget({ target: firstField ?? (view.formError ? 'formError' : null) });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || status === 'success' || cooling) return;

    setTouched({ email: true, password: true });
    setServerErrors({});
    setFormError(null);
    setCooldownUntil(null);
    setAnnouncement('');

    const firstInvalid = firstLoginFieldWithError(clientErrors);
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
    <form
      noValidate
      onSubmit={onSubmit}
      aria-busy={busy || undefined}
      className="flex flex-col gap-5"
    >
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {formError && (
        <div ref={formErrorRef} tabIndex={-1} className="rounded-field focus:outline-none">
          {formError.kind === 'rateLimited' ? (
            // role="presentation" evita que el aviso (role="alert") anuncie cada segundo.
            <Alert variant="error" role="presentation">
              {cooling ? (
                <>
                  Hiciste demasiados intentos. Espera{' '}
                  <span role="timer" aria-live="off" className="font-bold tabular-nums">
                    {formatWaitTime(remainingSeconds)}
                  </span>{' '}
                  para volver a intentarlo.
                </>
              ) : (
                LOGIN_ERROR_MESSAGES.rateLimitReady
              )}
            </Alert>
          ) : (
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
          )}
        </div>
      )}

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
        onChange={onChange('email')}
        onBlur={onBlur('email')}
        error={shownErrors.email}
      />

      <div className="flex flex-col gap-1">
        <Field
          ref={(el) => {
            fieldRefs.current.password = el;
          }}
          id={ids.password}
          name="password"
          type="password"
          label="Contraseña"
          autoComplete="current-password"
          value={values.password}
          onChange={onChange('password')}
          onBlur={onBlur('password')}
          error={shownErrors.password}
        />
        <div className="flex justify-end">
          <Link
            href={forgotHref}
            className="inline-flex min-h-11 items-center text-[15px] font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
      </div>

      <Button
        type="submit"
        loading={busy}
        disabled={cooling}
        aria-disabled={cooling || undefined}
        fullWidth
      >
        Ingresar
      </Button>
    </form>
  );
}
