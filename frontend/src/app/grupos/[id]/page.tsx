import type { Metadata } from 'next';
import { GroupPageView } from '@/components/features/groups/group-page';

export const metadata: Metadata = { title: 'Grupo' };

export interface GroupPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/grupos/[id]` (plan 001 §6, T020 y T025; mockups `GrupoMiembro.dc.html`, `GrupoMiembros.dc.html`
 * y `Grupo.dc.html`). Ruta protegida; un grupo ajeno responde `404` y se muestra «Grupo no
 * encontrado». El titular ve además el panel del código de invitación.
 */
export default async function GroupPage({ params }: GroupPageProps) {
  const { id } = await params;
  return <GroupPageView groupId={id} />;
}
