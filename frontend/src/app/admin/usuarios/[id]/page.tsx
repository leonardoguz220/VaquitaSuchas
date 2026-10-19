import type { Metadata } from 'next';
import { AdminUserView } from '@/components/features/admin/admin-user-view';

export const metadata: Metadata = { title: 'Ficha de usuario · Administración' };

export interface AdminUserPageProps {
  params: Promise<{ id: string }>;
}

/** `/admin/usuarios/[id]` (spec 009 T017, plan §6). Solo para administradores (`AdminGate`). */
export default async function AdminUserPage({ params }: AdminUserPageProps) {
  const { id } = await params;
  return <AdminUserView userId={id} />;
}
