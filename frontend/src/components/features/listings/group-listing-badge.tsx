'use client';

import { useEffect, useState } from 'react';
import { getGroupListingSummary } from '@/services/group-listing';

/**
 * Insignia «El grupo publicó cupos» que ven los miembros (T011, spec 008). Solo aparece si el
 * grupo tiene una publicación activa; si la consulta falla, no se muestra nada.
 */
export function GroupListingBadge({ groupId }: { groupId: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getGroupListingSummary(groupId, { signal: controller.signal })
      .then((summary) => setActive(summary.active))
      .catch(() => setActive(false));
    return () => controller.abort();
  }, [groupId]);

  if (!active) return null;
  return (
    <p className="inline-flex min-h-8 items-center self-start rounded-full bg-primary-soft px-3 text-sm font-bold text-primary">
      El grupo publicó cupos
    </p>
  );
}
