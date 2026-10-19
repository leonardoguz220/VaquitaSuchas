import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/admin-header';
import { AdminUserDetailView } from '@/components/features/admin/admin-user-detail-view';

export const metadata: Metadata = { title: 'Ficha de usuario' };

interface AdminUserPageProps {
  params: Promise<{ id: string }>;
}

/**
 * `/admin/usuarios/[id]` (spec 009 T017, plan §6; mockup `AdminUsuarios.dc.html`). Protegida por
 * rol en el layout de `/admin`; la API responde `403` y `404`.
 */
export default async function AdminUserPage({ params }: AdminUserPageProps) {
  const { id } = await params;
  return (
    <AdminPage>
      <AdminUserDetailView userId={id} />
    </AdminPage>
  );
}
