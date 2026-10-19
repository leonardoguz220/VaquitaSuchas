import type { Metadata } from 'next';
import { Logo } from '@/components/features/brand/logo';
import { SystemStatus } from '@/components/features/status/system-status';

export const metadata: Metadata = { title: 'Estado del sistema' };

/**
 * `/estado` (RF-000-18, CA-000-10; plan 000 §6): ruta pública que muestra el resultado de
 * `GET /health` a través del proxy `/api`. Sirve para comprobar de punta a punta el entorno
 * local y el de staging (CA-000-14).
 */
export default function StatusPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <Logo />
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight">
          Estado del sistema
        </h1>
        <p className="text-muted">
          Comprueba si el frontend, el backend y la base de datos de Vaquita están respondiendo.
        </p>
      </header>
      <SystemStatus />
    </div>
  );
}
