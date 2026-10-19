import type { Metadata } from 'next';
import { NotificationSettingsView } from '@/components/features/notifications/notification-settings-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Ajustes de avisos' };

/**
 * `/ajustes/avisos` (spec 005 T023, plan §6; mockup `AjustesAvisos.dc.html`). Ruta protegida por
 * `proxy.ts`: las preferencias son las de la persona con sesión.
 */
export default function NotificationSettingsPage() {
  return (
    <AppPage>
      <NotificationSettingsView />
    </AppPage>
  );
}
