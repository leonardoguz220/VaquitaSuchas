import type { Metadata } from 'next';
import { ListingsView } from '@/components/features/listings/listings-view';

export const metadata: Metadata = { title: 'Cupos libres' };

/**
 * `/cupos` «Cupos libres» (spec 008 T015, plan §6; mockup `Cupos.dc.html`). Ruta protegida por
 * `proxy.ts`: la lista la arma la API para la persona con sesión.
 */
export default function ListingsPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <ListingsView />
    </div>
  );
}
