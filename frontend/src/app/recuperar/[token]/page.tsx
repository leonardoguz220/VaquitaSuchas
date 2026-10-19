import type { Metadata } from 'next';
import { AuthShell } from '@/components/features/auth/auth-shell';
import { ResetPasswordForm } from '@/components/features/auth/reset-password-form';
import { LOGIN_PATH, RECOVER_PATH } from '@/lib/routes';

/**
 * La URL lleva el token de un solo uso: no se indexa y no se envía como `Referer` a otros
 * sitios ni a recursos externos.
 */
export const metadata: Metadata = {
  title: 'Crear una contraseña nueva',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export interface ResetPasswordPageProps {
  params: Promise<{ token: string }>;
}

/**
 * `/recuperar/[token]` (spec 003 T035, plan §6; mockup `Recuperar.dc.html`).
 * Lee el token del segmento de la ruta y se lo pasa al formulario, que solo lo envía en el
 * cuerpo de `POST /auth/password/reset` (RF-003-12). El token nunca se muestra.
 */
export default async function ResetPasswordPage({ params }: ResetPasswordPageProps) {
  const { token } = await params;

  return (
    <AuthShell
      title="Crea una nueva contraseña"
      subtitle="Elige una contraseña que no uses en otro sitio."
    >
      <ResetPasswordForm token={token} loginHref={LOGIN_PATH} recoverHref={RECOVER_PATH} />
    </AuthShell>
  );
}
