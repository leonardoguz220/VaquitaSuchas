import type { Metadata } from 'next';
import { HistoryView } from '@/components/features/dashboard/history-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Historial' };

/**
 * `/panel/historial` (spec 006 T026, plan §6; mockup `Historial.dc.html`). Ruta protegida por
 * `proxy.ts`: la API solo devuelve los cobros de la persona con sesión.
 */
export default function HistoryPage() {
  return (
    <AppPage>
      <HistoryView />
    </AppPage>
  );
}
