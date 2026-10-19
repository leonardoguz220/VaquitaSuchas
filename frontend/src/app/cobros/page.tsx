import type { Metadata } from 'next';
import { MyChargesView } from '@/components/features/charges/my-charges-view';

export const metadata: Metadata = { title: 'Mis cobros' };

/**
 * `/cobros` (plan 002 §6, T018; mockup `MisCobros.dc.html`). Ruta protegida: sin la cookie de
 * sesión `proxy.ts` redirige a `/ingresar`, y un `401` de la API hace lo mismo desde los hooks.
 */
export default function ChargesPage() {
  return <MyChargesView />;
}
