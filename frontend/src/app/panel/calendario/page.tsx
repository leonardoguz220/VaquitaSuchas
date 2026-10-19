import type { Metadata } from 'next';
import { CalendarView } from '@/components/features/dashboard/calendar-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Calendario' };

/**
 * `/panel/calendario` (spec 006 T022, plan §6; mockup `Calendario.dc.html`). Ruta protegida por
 * `proxy.ts`: la API solo devuelve los eventos de la persona con sesión.
 */
export default function CalendarPage() {
  return (
    <AppPage>
      <CalendarView />
    </AppPage>
  );
}
