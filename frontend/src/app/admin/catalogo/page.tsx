import type { Metadata } from 'next';
import { AdminCatalogView } from '@/components/features/admin/admin-catalog-view';

export const metadata: Metadata = { title: 'Catálogo · Administración' };

/** `/admin/catalogo` (spec 009 T029, plan §6). Solo para administradores (`AdminGate`). */
export default function AdminCatalogPage() {
  return <AdminCatalogView />;
}
