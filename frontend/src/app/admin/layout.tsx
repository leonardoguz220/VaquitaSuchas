import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { ADMIN_PATH, buildLoginRedirect, PANEL_PATH } from '@/lib/routes';
import { SESSION_COOKIE } from '@/lib/session-cookies';
import { checkAdminAccess } from '@/services/admin-access';

export const metadata: Metadata = {
  title: { default: 'Administración', template: '%s · Admin · Vaquita' },
  robots: { index: false, follow: false },
};

/**
 * Protección por rol de todas las rutas `/admin` **en el servidor** (RF-009-01, plan 009 §6).
 * `proxy.ts` solo comprueba que exista la cookie de sesión y el JWT no lleva el rol, así que este
 * layout pide `GET /auth/me` al backend antes de mostrar nada: sin sesión válida lleva a
 * `/ingresar`; quien no es administrador va a su panel (spec 009 §9: «`403` y redirección a su
 * panel»); si no se puede comprobar, no muestra el panel. La API igualmente responde `403` en
 * cada endpoint de administración (CA-009-01) y las pantallas lo manejan.
 */
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const cookieStore = await cookies();
  const access = await checkAdminAccess(cookieStore.get(SESSION_COOKIE)?.value);
  if (access === 'unauthenticated') redirect(buildLoginRedirect(ADMIN_PATH, ''));
  if (access === 'forbidden') redirect(PANEL_PATH);
  if (access === 'unavailable') {
    return (
      <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 py-10 sm:px-6">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
          Administración
        </h1>
        <Alert
          variant="error"
          title="No pudimos comprobar tu acceso."
          action={
            <Button variant="secondary" href={ADMIN_PATH}>
              Reintentar
            </Button>
          }
        >
          El servidor no respondió. Espera unos segundos y vuelve a intentarlo.
        </Alert>
      </div>
    );
  }
  return children;
}
