import type { Metadata } from 'next';
import { ListingDetailView } from '@/components/features/listings/listing-detail-view';

export const metadata: Metadata = { title: 'Cupo libre' };

export interface ListingPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/cupos/[id]` detalle de un cupo libre (spec 008 T015, plan §6; mockup `Cupo.dc.html`). Ruta
 * protegida por `proxy.ts`. La API decide qué publicaciones existen para cada persona (`404`).
 */
export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-12">
      <ListingDetailView listingId={id} />
    </div>
  );
}
