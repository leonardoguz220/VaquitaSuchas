import type { Metadata } from 'next';
import { NotificationsView } from '@/components/features/notifications/notifications-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Notificaciones' };

/**
 * `/notificaciones` (spec 005 T012, plan §6; mockup `Notificaciones.dc.html`). Ruta protegida
 * por `proxy.ts`: la API solo devuelve los avisos de la persona con sesión (CA-005-21).
 */
export default function NotificationsPage() {
  return (
    <AppPage>
      <NotificationsView />
    </AppPage>
  );
}
