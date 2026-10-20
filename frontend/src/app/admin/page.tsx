import type { Metadata } from 'next';
import { AdminStatsView } from '@/components/features/admin/admin-stats-view';

export const metadata: Metadata = { title: 'Administración' };

/** `/admin` «Tablero» (spec 009 T035, plan §6). Solo para administradores (`AdminGate`). */
export default function AdminPage() {
  return <AdminStatsView />;
}
