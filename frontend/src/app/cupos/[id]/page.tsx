import type { Metadata } from 'next';
import { ListingDetailView } from '@/components/features/listings/listing-detail-view';
import { AppPage } from '@/components/features/shell/app-header';

export const metadata: Metadata = { title: 'Cupo libre' };

interface ListingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/cupos/[id]` (spec 008 T015, plan §6; mockup `Cupo.dc.html`). Ruta protegida por `proxy.ts`;
 * la API responde `404` si la publicación no está activa, es propia o ya es miembro del grupo.
 */
export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  return (
    <AppPage>
      <ListingDetailView listingId={id} />
    </AppPage>
  );
}
