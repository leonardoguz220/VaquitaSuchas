import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/admin-header';
import { AdminHostsView } from '@/components/features/admin/admin-hosts-view';

export const metadata: Metadata = { title: 'Titulares' };

/**
 * `/admin/titulares` (spec 009 T021, plan §6; mockup `AdminTitulares.dc.html`). Protegida por rol
 * en el layout de `/admin`; la API responde `403` a quien no es administrador.
 */
export default function AdminHostsPage() {
  return (
    <AdminPage>
      <AdminHostsView />
    </AdminPage>
  );
}
