import { Badge } from '@/components/ui';
import type { JoinRequestStatus } from '@/services/join-requests';
import { JOIN_STATUS_LABEL, JOIN_STATUS_TONE } from './join-messages';

/** Estado de una solicitud con color, ícono y texto (no depende solo del color). */
export function JoinStatusBadge({ status }: { status: JoinRequestStatus }) {
  return <Badge variant={JOIN_STATUS_TONE[status]}>{JOIN_STATUS_LABEL[status]}</Badge>;
}
