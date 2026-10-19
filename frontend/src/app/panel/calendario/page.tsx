import type { Metadata } from 'next';
import { CalendarView } from '@/components/features/dashboard/calendar-view';

export const metadata: Metadata = { title: 'Calendario' };

/**
 * `/panel/calendario` (spec 006 T022, plan §6; mockup `Calendario.dc.html`). Ruta protegida por
 * `proxy.ts`: la API solo devuelve los eventos de la persona con sesión.
 */
export default function CalendarPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <CalendarView />
    </div>
  );
}
