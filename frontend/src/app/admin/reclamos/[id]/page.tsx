import type { Metadata } from 'next';
import { AdminDisputeDetailView } from '@/components/features/admin/admin-dispute-detail-view';
import { AdminPage } from '@/components/features/admin/admin-header';

export const metadata: Metadata = { title: 'Reclamo' };

interface AdminDisputePageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/admin/reclamos/[id]` (spec 009 T024, plan §6; mockup `AdminReclamo.dc.html`). La evidencia
 * solo se pide al pulsar «Ver evidencia» y cada apertura queda en la auditoría (CA-009-27).
 */
export default async function AdminDisputePage({ params }: AdminDisputePageProps) {
  const { id } = await params;
  return (
    <AdminPage>
      <AdminDisputeDetailView disputeId={id} />
    </AdminPage>
  );
}
