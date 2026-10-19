import type { Metadata } from 'next';
import { AdminDisputesView } from '@/components/features/admin/admin-disputes-view';

export const metadata: Metadata = { title: 'Reclamos · Administración' };

/** `/admin/reclamos` (spec 009 T024, plan §6). Solo para administradores (`AdminGate`). */
export default function AdminDisputesPage() {
  return <AdminDisputesView />;
}
