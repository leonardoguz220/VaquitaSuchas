import type { Metadata } from 'next';
import { ShortfallPageView } from '@/components/features/shortfalls/shortfall-page';

export const metadata: Metadata = { title: 'Faltante del grupo' };

export interface ShortfallPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/grupos/[id]/faltante` (spec 011). Ruta protegida: un grupo ajeno responde `404`. El titular
 * cotiza y avisa; los miembros afectados responden.
 */
export default async function ShortfallPage({ params }: ShortfallPageProps) {
  const { id } = await params;
  return <ShortfallPageView groupId={id} />;
}
