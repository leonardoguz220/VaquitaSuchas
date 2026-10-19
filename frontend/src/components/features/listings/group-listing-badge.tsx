'use client';

import { Badge } from '@/components/ui';
import { useGroupListingSummary } from '@/hooks/use-listings';
import { formatDateLaPaz } from '@/lib/dates';
import { slotsText } from './listing-messages';

/**
 * Insignia «El grupo publicó cupos» para un miembro en `/grupos/[id]` (spec 008 T011, plan §6),
 * con el `GroupListingSummary` de `GET /groups/:id/listing`. Es solo informativa: si no hay
 * publicación activa o la carga falla, no muestra nada.
 */
export function GroupListingBadge({ groupId }: { groupId: string }) {
  const { status, data } = useGroupListingSummary(groupId);
  if (status !== 'success' || !data || !data.active) return null;
  const details = [
    data.slotsOffered !== null ? slotsText(data.slotsOffered) : null,
    data.expiresAt ? `hasta el ${formatDateLaPaz(data.expiresAt)}` : null,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <Badge variant="info" icon="info" className="self-start whitespace-normal">
      El grupo publicó cupos{details ? ` · ${details}` : ''}
    </Badge>
  );
}
