'use client';

import { useCallback } from 'react';
import { transferGroupOwnership } from '@/services/admin';
import { useApiSubmit } from './use-api-submit';

/** Transferir la titularidad de un grupo (`POST …/transfer-ownership`, RF-009-24, CA-009-35). */
export function useAdminTransfer(groupId: string) {
  const request = useCallback(
    (input: { toUserId: string; reason: string }) =>
      transferGroupOwnership(groupId, input.toUserId, input.reason),
    [groupId],
  );
  return useApiSubmit(request);
}
