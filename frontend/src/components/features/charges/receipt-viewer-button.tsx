'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { FieldError } from '@/components/ui/field-parts';
import { useReceiptFile } from '@/hooks/use-receipt-file';
import { receiptFileError } from './owner-review-model';

export interface ReceiptViewerButtonProps {
  chargeId: string;
  receiptId: string;
}

/**
 * «Ver comprobante» (plan 002 §6): pide la URL firmada y la abre en una pestaña nueva. Se monta
 * solo si la API trajo el comprobante con `fileAvailable` (CA-002-13).
 */
export function ReceiptViewerButton({ chargeId, receiptId }: ReceiptViewerButtonProps) {
  const { request, isLoading } = useReceiptFile(chargeId, receiptId);
  const [error, setError] = useState<string | null>(null);
  const errorId = `receipt-file-error-${receiptId}`;

  async function handleClick() {
    setError(null);
    const result = await request();
    if (!result) return;
    if (result.ok) {
      window.open(result.data.url, '_blank', 'noopener');
      return;
    }
    setError(receiptFileError(result.error));
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        loading={isLoading}
        onClick={handleClick}
        aria-describedby={error ? errorId : undefined}
        className="w-full sm:w-auto"
      >
        Ver comprobante
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </Button>
      {error && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  );
}
