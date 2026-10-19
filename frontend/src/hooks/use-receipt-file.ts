'use client';

import { useCallback } from 'react';
import { getReceiptFile, type ReceiptFile } from '@/services/charges';
import { useApiSubmit } from './use-api-submit';

/**
 * `GET /charges/:chargeId/receipts/:receiptId/file`: pide la URL firmada (dura hasta 10 min)
 * cada vez que se quiere ver el archivo; no se guarda. `410 FILE_DELETED` si ya se borró.
 */
export function useReceiptFile(chargeId: string, receiptId: string) {
  const request = useCallback(() => getReceiptFile(chargeId, receiptId), [chargeId, receiptId]);
  const { submit, isSubmitting } = useApiSubmit<void, ReceiptFile>(request);
  return { request: submit, isLoading: isSubmitting };
}
