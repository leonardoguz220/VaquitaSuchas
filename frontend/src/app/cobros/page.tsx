import type { Metadata } from 'next';
import { MyChargesView } from '@/components/features/billing/my-charges-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Mis cobros' };

/**
 * `/cobros` "Mis cobros" (spec 002 T018, plan §6; mockup `MisCobros.dc.html`). Ruta protegida
 * por `proxy.ts`: la API solo devuelve los cobros de la persona con sesión.
 */
export default function ChargesPage() {
  return (
    <AppPage>
      <MyChargesView />
    </AppPage>
  );
}
