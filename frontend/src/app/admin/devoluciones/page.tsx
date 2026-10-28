import type { Metadata } from 'next';
import { AdminRefundDisputesView } from '@/components/features/admin/admin-refund-disputes-view';

export const metadata: Metadata = { title: 'Devoluciones · Administración' };

/** `/admin/devoluciones` (spec 011 T017). Solo para administradores (`AdminGate`). */
export default function AdminRefundDisputesPage() {
  return <AdminRefundDisputesView />;
}
