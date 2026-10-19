import type { Metadata } from 'next';
import { AdminDisputeView } from '@/components/features/admin/admin-dispute-view';

export const metadata: Metadata = { title: 'Reclamo · Administración' };

export interface AdminDisputePageProps {
  params: Promise<{ id: string }>;
}

/** `/admin/reclamos/[id]` (spec 009 T024, plan §6). Solo para administradores (`AdminGate`). */
export default async function AdminDisputePage({ params }: AdminDisputePageProps) {
  const { id } = await params;
  return <AdminDisputeView disputeId={id} />;
}
