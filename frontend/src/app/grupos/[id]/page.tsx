import type { Metadata } from 'next';
import { GroupDetailView } from '@/components/features/groups/group-detail';

export const metadata: Metadata = { title: 'Grupo' };

export interface GroupPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/grupos/[id]` (plan 001 §6, T020; mockups `GrupoMiembro.dc.html` y `GrupoMiembros.dc.html`).
 * Ruta protegida; un grupo ajeno responde `404` y se muestra «Grupo no encontrado».
 */
export default async function GroupPage({ params }: GroupPageProps) {
  const { id } = await params;
  return <GroupDetailView groupId={id} />;
}
