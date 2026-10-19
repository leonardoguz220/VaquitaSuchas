import type { Metadata } from 'next';
import { MyRequestsView } from '@/components/features/join-requests/my-requests-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Mis solicitudes' };

/**
 * `/solicitudes` "Mis solicitudes" (spec 010 T017, plan §6; mockup `Solicitudes.dc.html`). Ruta
 * protegida por `proxy.ts`: la API solo devuelve las solicitudes de la persona con sesión.
 */
export default function RequestsPage() {
  return (
    <AppPage>
      <MyRequestsView />
    </AppPage>
  );
}
