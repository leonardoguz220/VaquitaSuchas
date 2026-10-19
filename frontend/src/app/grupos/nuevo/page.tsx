import type { Metadata } from 'next';
import { NewGroupWizard } from '@/components/features/groups/new-group-wizard';

export const metadata: Metadata = { title: 'Crear suscripción' };

/**
 * `/grupos/nuevo` (plan 001 §6; mockup `NuevoGrupoServicio.dc.html`). Ruta protegida: sin la
 * cookie de sesión `proxy.ts` redirige a `/ingresar`, y un `401` de la API hace lo mismo desde
 * los hooks. Pasos 1 y 2 de la spec 004 (T011); el paso 3 es la spec 001 (T016).
 */
export default function NewGroupPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
        Crear suscripción
      </h1>
      <NewGroupWizard />
    </div>
  );
}
