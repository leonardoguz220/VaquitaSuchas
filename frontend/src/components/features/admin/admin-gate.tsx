'use client';

import type { ReactNode } from 'react';
import { Alert, Button } from '@/components/ui';
import { PANEL_PATH } from '@/lib/routes';
import { useMe } from '@/hooks/use-me';

/**
 * Solo deja pasar a una persona con rol `admin` (RNF-009-01, CA-009-01). `proxy.ts` solo mira la
 * cookie de sesión, así que el rol se comprueba aquí con `GET /auth/me`; el servidor igual
 * responde `403` a cada llamada de `/admin`. Un usuario normal ve un aviso de `403` con enlace a
 * su panel, sin datos de administración.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const me = useMe();

  if (me.status === 'redirecting') return null;

  if (me.status === 'loading') {
    return (
      <p role="status" className="px-4 py-10 text-center text-muted">
        Cargando el panel…
      </p>
    );
  }

  if (me.status === 'error') {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <Alert variant="error" title="No se pudo comprobar tu acceso">
          Revisa tu conexión e inténtalo otra vez.
        </Alert>
        <Button variant="secondary" onClick={me.reload} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  if (me.user?.role !== 'admin') {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-10">
        <p className="text-sm font-bold text-muted">Error 403 · Sin acceso</p>
        <h1 className="font-display text-3xl tracking-tight">
          Esta pantalla es solo para administradores
        </h1>
        <p className="text-muted">
          Si necesitas algo de administración, escribe al equipo de Vaquita.
        </p>
        <Button href={PANEL_PATH} className="self-start">
          Ir a mi panel
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
