import type { Metadata } from 'next';
import { DashboardView } from '@/components/features/dashboard/dashboard-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Panel' };

/**
 * `/panel` (spec 006 T012, plan §6; mockup `Panel.dc.html`). Ruta protegida por `proxy.ts`: la
 * API solo devuelve los datos de la persona con sesión (CA-006-18).
 */
export default function PanelPage() {
  return (
    <AppPage>
      <DashboardView />
    </AppPage>
  );
}
