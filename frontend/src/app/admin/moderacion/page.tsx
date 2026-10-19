import type { Metadata } from 'next';
import { AdminModerationView } from '@/components/features/admin/admin-moderation-view';

export const metadata: Metadata = { title: 'Moderación · Administración' };

/** `/admin/moderacion` (spec 009 T032, plan §6). Solo para administradores (`AdminGate`). */
export default function AdminModerationPage() {
  return <AdminModerationView />;
}
