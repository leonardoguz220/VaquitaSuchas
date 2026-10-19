import type { Metadata } from 'next';
import { ListingsView } from '@/components/features/listings/listings-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Cupos libres' };

/**
 * `/cupos` (spec 008 T015, plan §6; mockup `Cupos.dc.html`). Ruta protegida por `proxy.ts`: solo
 * usuarios con sesión ven publicaciones (contrato 008).
 */
export default function ListingsPage() {
  return (
    <AppPage>
      <ListingsView />
    </AppPage>
  );
}
