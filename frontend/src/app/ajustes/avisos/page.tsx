import type { Metadata } from 'next';
import { NotificationSettingsView } from '@/components/features/notifications/notification-settings-view';

export const metadata: Metadata = { title: 'Ajustes de avisos' };

/**
 * `/ajustes/avisos` (spec 005 T023, plan §6; mockup `AjustesAvisos.dc.html`). Ruta protegida por
 * `proxy.ts`: las preferencias son las de la persona con sesión.
 */
export default function NotificationSettingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <NotificationSettingsView />
    </div>
  );
}
