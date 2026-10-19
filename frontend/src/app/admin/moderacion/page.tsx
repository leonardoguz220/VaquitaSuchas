import type { Metadata } from 'next';
import { AdminPage } from '@/components/features/admin/admin-header';
import { AdminModerationView } from '@/components/features/admin/admin-moderation-view';

export const metadata: Metadata = { title: 'Moderación' };

/**
 * `/admin/moderacion` (spec 009 T032, plan §6; mockup `AdminModeracion.dc.html`). Protegida por
 * rol en el layout de `/admin`; la API responde `403` a quien no es administrador.
 */
export default function AdminModerationPage() {
  return (
    <AdminPage>
      <AdminModerationView />
    </AdminPage>
  );
}
