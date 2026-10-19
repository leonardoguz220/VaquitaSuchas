'use client';

import { leaveGroup } from '@/services/groups';
import { useApiSubmit } from './use-api-submit';

/** `POST /groups/:id/leave` (RF-001-16): el miembro abandona el grupo; `204` sin cuerpo. */
export function useLeaveGroup() {
  return useApiSubmit(leaveGroup);
}
