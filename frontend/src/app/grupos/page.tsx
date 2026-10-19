import type { Metadata } from 'next';
import { GroupsView } from '@/components/features/groups/groups-view';

export const metadata: Metadata = { title: 'Mis suscripciones' };

/**
 * `/grupos` (plan 001 §6, T020; mockup `Grupos.dc.html`). Ruta protegida: sin la cookie de
 * sesión `proxy.ts` redirige a `/ingresar`, y un `401` de la API hace lo mismo desde los hooks.
 */
export default function GroupsPage() {
  return <GroupsView />;
}
