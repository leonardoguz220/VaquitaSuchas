'use client';

import { closeGroup, transferOwnership, type GroupDetail } from '@/services/groups';
import { useApiSubmit } from './use-api-submit';

export interface TransferOwnershipInput {
  groupId: string;
  toUserId: string;
}

const transferRequest = ({ groupId, toUserId }: TransferOwnershipInput): Promise<GroupDetail> =>
  transferOwnership(groupId, toUserId);

/** `POST /groups/:id/transfer-ownership` (RF-001-17). Devuelve el grupo con el nuevo rol del titular. */
export function useTransferOwnership() {
  return useApiSubmit(transferRequest);
}

/** `POST /groups/:id/close` (RF-001-18): el grupo queda de solo lectura. */
export function useCloseGroup() {
  return useApiSubmit(closeGroup);
}
