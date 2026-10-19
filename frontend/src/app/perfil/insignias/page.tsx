import type { Metadata } from 'next';
import { BadgesView } from '@/components/features/reputation/badges-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Mis insignias' };

/**
 * `/perfil/insignias` (spec 007 T021, plan §6; mockup `Insignias.dc.html`). Ruta protegida por
 * `proxy.ts`: la API solo devuelve las insignias de la persona con sesión.
 */
export default function BadgesPage() {
  return (
    <AppPage>
      <BadgesView />
    </AppPage>
  );
}
