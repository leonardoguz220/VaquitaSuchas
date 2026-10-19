import type { Metadata } from 'next';
import { ChargePageView } from '@/components/features/charges/charge-page';

export const metadata: Metadata = { title: 'Cobro' };

export interface ChargePageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/cobros/[id]` (plan 002 §6, T018; mockup `Cobro.dc.html`, solo la parte de lectura). Ruta
 * protegida; un cobro ajeno responde `404` y el de otro miembro del grupo `403`.
 */
export default async function ChargePage({ params }: ChargePageProps) {
  const { id } = await params;
  return <ChargePageView chargeId={id} />;
}
