import type { Metadata } from 'next';
import { AdminCatalogView } from '@/components/features/admin/admin-catalog-view';
import { AdminPage } from '@/components/features/admin/admin-header';

export const metadata: Metadata = { title: 'Catálogo' };

/**
 * `/admin/catalogo` (spec 009 T029, plan §6; mockup `AdminCatalogo.dc.html`). Protegida por rol en
 * el layout de `/admin`; la API responde `403` a quien no es administrador.
 */
export default function AdminCatalogPage() {
  return (
    <AdminPage>
      <AdminCatalogView />
    </AdminPage>
  );
}
