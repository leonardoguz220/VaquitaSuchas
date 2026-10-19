import type { Metadata } from 'next';
import { HistoryView } from '@/components/features/dashboard/history-view';

export const metadata: Metadata = { title: 'Historial' };

/**
 * `/panel/historial` (spec 006 T026, plan §6; mockup `Historial.dc.html`). Ruta protegida por
 * `proxy.ts`: la API solo devuelve los cobros de la persona con sesión.
 */
export default function HistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <HistoryView />
    </div>
  );
}
