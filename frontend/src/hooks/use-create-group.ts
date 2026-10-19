'use client';

import {
  createGroup,
  updatePaymentInfo,
  type CreateGroupRequest,
  type GroupDetail,
} from '@/services/groups';
import { toApiError, type ApiError } from '@/services/http';
import { useApiSubmit } from './use-api-submit';

export interface CreateGroupInput {
  request: CreateGroupRequest;
  /** Imagen del QR: se sube después de crear el grupo con `PUT /groups/:id/payment-info`. */
  qr: File | null;
}

export interface CreateGroupOutcome {
  group: GroupDetail;
  /** El grupo se creó pero el QR no se pudo subir; `null` si no hubo QR o se subió bien. */
  qrError: ApiError | null;
}

async function createWithQr({ request, qr }: CreateGroupInput): Promise<CreateGroupOutcome> {
  const group = await createGroup(request);
  if (!qr) return { group, qrError: null };
  try {
    const { paymentInfo } = await updatePaymentInfo(group.id, { qr });
    return { group: { ...group, paymentInfo }, qrError: null };
  } catch (caught) {
    return { group, qrError: toApiError(caught) };
  }
}

/** `POST /groups` y, si hay QR, `PUT /groups/:id/payment-info` (RF-001-01, RF-001-20). */
export function useCreateGroup() {
  return useApiSubmit(createWithQr);
}
