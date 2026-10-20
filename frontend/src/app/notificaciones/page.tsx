import type { Metadata } from 'next';
import { NotificationsView } from '@/components/features/notifications/notifications-view';

export const metadata: Metadata = { title: 'Notificaciones' };

/**
 * `/notificaciones` (spec 005 T012, plan §6; mockup `Notificaciones.dc.html`). Ruta protegida
 * por `proxy.ts`: la API solo devuelve los avisos de la persona con sesión (CA-005-21).
 */
export default function NotificationsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <NotificationsView />
    </div>
  );
}
