import type { Metadata } from 'next';
import { ReputationView } from '@/components/features/reputation/reputation-view';

export const metadata: Metadata = { title: 'Mi reputación' };

/**
 * `/perfil/reputacion` (spec 007, plan §6; mockup `Reputacion.dc.html`). Ruta protegida: no está en
 * `PUBLIC_ROUTES`, así que `proxy.ts` redirige a `/ingresar?next=/perfil/reputacion` sin sesión.
 */
export default function ReputationPage() {
  return <ReputationView />;
}
