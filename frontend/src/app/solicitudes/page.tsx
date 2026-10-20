import type { Metadata } from 'next';
import { MyRequestsView } from '@/components/features/join-requests/my-requests-view';

export const metadata: Metadata = { title: 'Mis solicitudes' };

/**
 * `/solicitudes` "Mis solicitudes" (spec 010 T017, plan §6; mockup `Solicitudes.dc.html`). Ruta
 * protegida por `proxy.ts`: la API solo devuelve las solicitudes de la persona con sesión.
 */
export default function RequestsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <MyRequestsView />
    </div>
  );
}
