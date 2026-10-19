import type { Metadata } from 'next';
import { GroupsView } from '@/components/features/groups/groups-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Mis suscripciones' };

/**
 * `/grupos` "Mis suscripciones" (spec 001 T020, plan §6; mockup `Grupos.dc.html`). Ruta
 * protegida: no está en `PUBLIC_ROUTES`, así que `proxy.ts` redirige a `/ingresar?next=/grupos`
 * sin cookie de sesión. La raíz `/` lleva aquí a quien tiene sesión.
 */
export default function GroupsPage() {
  return (
    <AppPage>
      <GroupsView />
    </AppPage>
  );
}
