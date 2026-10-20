import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/features/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/features/auth/forgot-password-form';
import { LOGIN_PATH, buildAuthLink, type SearchParamsRecord } from '@/lib/routes';

export const metadata: Metadata = { title: 'Recuperar contraseña' };

export interface RecoverPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * `/recuperar` (spec 003 T035, plan §6; mockup `Recuperar.dc.html`).
 * Pide el correo y siempre muestra el mismo aviso de éxito (RF-003-10). Los enlaces a
 * `/ingresar` conservan `codigo` y `next` para quien llegó desde una invitación.
 */
export default async function RecoverPage({ searchParams }: RecoverPageProps) {
  const loginHref = buildAuthLink(LOGIN_PATH, await searchParams);

  return (
    <AuthShell
      title="¿Olvidaste tu contraseña?"
      subtitle="Escribe tu correo y te enviaremos un enlace para crear una nueva. El enlace sirve una sola vez y vence en 30 minutos."
      footer={
        <p>
          ¿Recordaste tu contraseña?{' '}
          <Link
            href={loginHref}
            className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Ingresa
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm loginHref={loginHref} />
    </AuthShell>
  );
}
