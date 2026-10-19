import type { Metadata } from 'next';
import { ReputationView } from '@/components/features/reputation/reputation-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Mi reputación' };

/**
 * `/perfil/reputacion` (spec 007 T015, plan §6; mockup `Reputacion.dc.html`). Ruta protegida por
 * `proxy.ts`: la API solo devuelve la reputación de la persona con sesión (RNF-007-04).
 */
export default function ReputationPage() {
  return (
    <AppPage>
      <ReputationView />
    </AppPage>
  );
}
