'use client';

import type { GroupDetail } from '@/services/groups';
import { ReviewQueue } from './review-queue';

/**
 * Pestaña **Cobros** de `/grupos/[id]` (plan 002 §6; mockup `Grupo.dc.html`). El titular ve la
 * cola «Por revisar» (T026).
 */
export function GroupChargesTab({ group }: { group: GroupDetail }) {
  const isOwner = group.myRole === 'titular';
  return <div className="flex flex-col gap-5">{isOwner && <ReviewQueue groupId={group.id} />}</div>;
}
