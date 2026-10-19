import type { Metadata } from 'next';
import { CreateGroupWizard } from '@/components/features/groups/create-group-wizard';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Crear suscripción' };

/**
 * `/grupos/nuevo` (spec 001 T016, plan §6; mockups `NuevoGrupoServicio.dc.html` y
 * `NuevoGrupo.dc.html`). Ruta protegida: no está en `PUBLIC_ROUTES`, así que `proxy.ts`
 * redirige a `/ingresar?next=/grupos/nuevo` sin cookie de sesión. Quien no está habilitado
 * como titular ve el panel que explica qué le falta; el backend lo valida igual (RF-001-21).
 */
export default function NewGroupPage() {
  return (
    <AppPage>
      <CreateGroupWizard />
    </AppPage>
  );
}
