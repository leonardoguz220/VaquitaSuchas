import type { Metadata } from 'next';
import { AdminDisputesView } from '@/components/features/admin/admin-disputes-view';
import { AdminPage } from '@/components/features/admin/admin-header';

export const metadata: Metadata = { title: 'Reclamos' };

/**
 * `/admin/reclamos` (spec 009 T024, plan §6; mockup `AdminReclamo.dc.html`). Protegida por rol en
 * el layout de `/admin`; la API responde `403` a quien no es administrador.
 */
export default function AdminDisputesPage() {
  return (
    <AdminPage>
      <AdminDisputesView />
    </AdminPage>
  );
}
