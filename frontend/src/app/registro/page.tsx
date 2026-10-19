import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthShell } from '@/components/features/auth/auth-shell';
import { DataPolicySummary } from '@/components/features/auth/data-policy-summary';
import { RegisterForm } from '@/components/features/auth/register-form';
import { LOGIN_PATH, buildAuthLink, type SearchParamsRecord } from '@/lib/routes';

export const metadata: Metadata = { title: 'Crear cuenta' };

export interface RegisterPageProps {
  searchParams: Promise<SearchParamsRecord>;
}

/**
 * `/registro`, paso 1 de 2 (spec 003 T023, plan §6; mockup `Registro.dc.html`).
 * Compone el esqueleto de acceso y el formulario; el envío lo hace `RegisterForm`.
 * El enlace a `/ingresar` conserva `codigo` y `next` para el invitado que llega con un código.
 */
export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const loginHref = buildAuthLink(LOGIN_PATH, await searchParams);

  return (
    <AuthShell
      step="Paso 1 de 2: tus datos"
      title="Crea tu cuenta"
      subtitle="Pedimos tu CI y un celular verificado con Telegram para que todos en el grupo sepan con quién comparten. Tu CI nunca se muestra a otros usuarios."
      footer={
        <p>
          ¿Ya tienes cuenta?{' '}
          <Link
            href={loginHref}
            className="inline-flex min-h-11 items-center font-bold text-primary underline underline-offset-2 hover:text-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            Ingresa
          </Link>
        </p>
      }
    >
      <RegisterForm policyContent={<DataPolicySummary />} />
    </AuthShell>
  );
}
