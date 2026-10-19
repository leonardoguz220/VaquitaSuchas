import type { Metadata } from 'next';
import { AdminAuditView } from '@/components/features/admin/admin-audit-view';

export const metadata: Metadata = { title: 'Auditoría · Administración' };

/** `/admin/auditoria` (spec 009 T024, plan §6). Solo para administradores (`AdminShell` → `AdminGate`). */
export default function AdminAuditPage() {
  return <AdminAuditView />;
}
