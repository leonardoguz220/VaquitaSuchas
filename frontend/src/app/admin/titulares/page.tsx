import type { Metadata } from 'next';
import { AdminHostsView } from '@/components/features/admin/admin-hosts-view';

export const metadata: Metadata = { title: 'Titulares · Administración' };

/** `/admin/titulares` (spec 009 T021, plan §6). Solo para administradores (`AdminGate`). */
export default function AdminHostsPage() {
  return <AdminHostsView />;
}
