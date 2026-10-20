import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/features/auth/auth-shell';
import { LoginForm } from '@/components/features/auth/login-form';
import {
  RECOVER_PATH,
  REGISTER_PATH,
  buildAuthLink,
  resolvePostLoginPath,
  type SearchParamsRecord,
} from '@/lib/routes';

export const metadata: Metadata = { title: 'Ingresar' };

export interface LoginPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * `/ingresar` (spec 003 T029, plan §6; mockup `Main.dc.html`).
 * Calcula en el servidor el destino tras ingresar (`next` seguro, `/unirse?codigo=…` o `/`) y
 * los enlaces a `/recuperar` y `/registro`, que conservan `codigo` y `next`. Con sesión abierta
 * muestra igual el formulario (T038: lo decide la pantalla).
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const redirectTo = resolvePostLoginPath(params);
  const forgotHref = buildAuthLink(RECOVER_PATH, params);
  const registerHref = buildAuthLink(REGISTER_PATH, params);

  return (
    <AuthShell
      title="Ingresa a tu cuenta"
      subtitle="Usa el correo con el que te registraste."
      footer={
        <p>
          ¿Todavía no tienes cuenta?{' '}
          <Link
            href={registerHref}
            className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Crea una
          </Link>
        </p>
      }
    >
      <LoginForm redirectTo={redirectTo} forgotHref={forgotHref} />
    </AuthShell>
  );
}
