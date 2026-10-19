import { Badge, type BadgeTone } from '@/components/ui';
import type { AdminUserStatus } from '@/services/admin';
import { USER_STATUS_LABEL } from './admin-labels';

const TONE: Record<AdminUserStatus, BadgeTone> = {
  activo: 'success',
  suspendido: 'warning',
  baneado: 'danger',
};

/** Estado de una cuenta con texto e ícono; el color solo refuerza (RNF-009-02). */
export function AdminStatusBadge({ status }: { status: AdminUserStatus }) {
  return <Badge variant={TONE[status]}>{USER_STATUS_LABEL[status]}</Badge>;
}
