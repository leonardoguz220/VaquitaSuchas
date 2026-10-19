import type { Metadata } from 'next';
import { ChargeDetailView } from '@/components/features/billing/charge-detail-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Cobro' };

export interface ChargePageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/cobros/[id]` (spec 002 T018, plan §6; mockups `Cobro.dc.html` y `Revisar.dc.html`). Ruta
 * protegida por `proxy.ts`. El backend decide quién ve el cobro (`403` / `404`).
 */
export default async function ChargePage({ params }: ChargePageProps) {
  const { id } = await params;
  return (
    <AppPage>
      <ChargeDetailView chargeId={id} />
    </AppPage>
  );
}
