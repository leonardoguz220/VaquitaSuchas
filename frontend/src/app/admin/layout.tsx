import type { ReactNode } from 'react';
import { AdminShell } from '@/components/features/admin/admin-shell';

/** Marco de `/admin` (spec 009, plan §6): cabecera de administración y control de rol. */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
