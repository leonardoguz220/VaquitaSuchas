import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/admin-header';
import { AdminStatsView } from '@/components/features/admin/admin-stats-view';

export const metadata: Metadata = { title: 'Tablero' };

/**
 * `/admin` (spec 009 T035, plan §6; mockup `AdminPanel.dc.html`): tablero de estadísticas
 * agregadas. Protegida por rol en el layout de `/admin`; la API responde `403`.
 */
export default function AdminHomePage() {
  return (
    <AdminPage>
      <AdminStatsView />
    </AdminPage>
  );
}
