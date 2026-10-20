import type { Metadata } from 'next';
import { DashboardView } from '@/components/features/dashboard/dashboard-view';

export const metadata: Metadata = { title: 'Panel' };

/**
 * `/panel` (spec 006 T012, plan §6; mockup `Panel.dc.html`). Ruta protegida por `proxy.ts`: la
 * API solo devuelve los datos de la persona con sesión (CA-006-18).
 */
export default function PanelPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <DashboardView />
    </div>
  );
}
