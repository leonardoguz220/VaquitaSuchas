import type { Metadata } from 'next';
import { GroupDetailView } from '@/components/features/groups/group-detail-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Grupo' };

export interface GroupPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/grupos/[id]` (spec 001 T020, plan §6; mockups `GrupoMiembro.dc.html` y
 * `GrupoMiembros.dc.html`). Ruta protegida por `proxy.ts`. El backend responde `404` a quien
 * no es miembro activo (RNF-001-01); la pantalla no distingue si el grupo existe.
 */
export default async function GroupPage({ params }: GroupPageProps) {
  const { id } = await params;
  return (
    <AppPage>
      <GroupDetailView groupId={id} />
    </AppPage>
  );
}
