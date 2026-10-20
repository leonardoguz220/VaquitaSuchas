import type { Metadata } from 'next';
import { ProfileView } from '@/components/features/profile/profile-view';

export const metadata: Metadata = { title: 'Mi perfil' };

/**
 * `/perfil` (spec 003 T039, plan §6; mockup `Perfil.dc.html`). Ruta protegida: no está en
 * `PUBLIC_ROUTES`, así que `proxy.ts` redirige a `/ingresar?next=/perfil` sin cookie de sesión.
 */
export default function ProfilePage() {
  return <ProfileView />;
}
