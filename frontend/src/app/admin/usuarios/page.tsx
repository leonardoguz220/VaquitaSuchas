import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/admin-header';
import { AdminUsersView } from '@/components/features/admin/admin-users-view';

export const metadata: Metadata = { title: 'Usuarios' };

/**
 * `/admin/usuarios` (spec 009 T017, plan §6; mockup `AdminUsuarios.dc.html`). El layout de
 * `/admin` comprueba el rol en el servidor y la API responde `403` a quien no es administrador.
 */
export default function AdminUsersPage() {
  return (
    <AdminPage>
      <AdminUsersView />
    </AdminPage>
  );
}
