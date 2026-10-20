import type { Metadata } from 'next';
import { BadgesView } from '@/components/features/reputation/badges-view';

export const metadata: Metadata = { title: 'Mis insignias' };

/**
 * `/perfil/insignias` (spec 007, RF-007-07; mockup `Insignias.dc.html`). Ruta protegida: no está en
 * `PUBLIC_ROUTES`, así que `proxy.ts` redirige a `/ingresar?next=/perfil/insignias` sin sesión.
 */
export default function BadgesPage() {
  return <BadgesView />;
}
