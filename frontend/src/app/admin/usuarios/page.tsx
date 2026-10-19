import type { Metadata } from 'next';
import { AdminUsersView } from '@/components/features/admin/admin-users-view';

export const metadata: Metadata = { title: 'Usuarios · Administración' };

/** `/admin/usuarios` (spec 009 T017). Solo para administradores (`AdminGate`). */
export default function AdminUsersPage() {
  return <AdminUsersView />;
}
