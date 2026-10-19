import type { Metadata } from 'next';
import { AdminAuditView } from '@/components/features/admin/admin-audit-view';
import { AdminPage } from '@/components/features/admin/admin-header';

export const metadata: Metadata = { title: 'Auditoría' };

/**
 * `/admin/auditoria` (spec 009 T024, plan §6; mockup `AdminAuditoria.dc.html`). Protegida por rol
 * en el layout de `/admin`; el log es de solo lectura (CA-009-19).
 */
export default function AdminAuditPage() {
  return (
    <AdminPage>
      <AdminAuditView />
    </AdminPage>
  );
}
