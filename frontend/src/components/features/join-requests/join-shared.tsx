'use client';

import { useEffect, useMemo } from 'react';
import { receiptFileType } from '@/lib/receipt-file';
export { groupPath } from '@/lib/routes';
import type { JoinPaymentMethod } from '@/services/join-requests';

/** Textos del comprobante de ingreso; los mismos que el comprobante de un cobro (spec 002). */
export const PROOF_MESSAGES = {
  receiptType: 'El comprobante debe ser una imagen JPG o PNG, o un PDF.',
  receiptSize: 'El archivo pesa más de 5 MB. Elige uno más liviano.',
  referenceRequired: 'Escribe la referencia que aparece en tu comprobante.',
} as const;

export const PAYMENT_METHOD_LABEL: Record<JoinPaymentMethod, string> = {
  qr: 'QR',
  transferencia: 'Transferencia',
};

/** Número con coma decimal, como las estrellas de la reputación: `4,5`. */
export function formatDecimal(value: number): string {
  return String(value).replace('.', ',');
}

/** URL local para la vista previa de una imagen; se libera al cambiar de archivo o al desmontar. */
export function useImagePreview(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file || !receiptFileType(file).startsWith('image/')) return null;
    if (typeof URL.createObjectURL !== 'function') return null;
    return URL.createObjectURL(file);
  }, [file]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

/** Vista previa del comprobante elegido: la imagen o un recuadro «PDF». */
export function FilePreview({
  file,
  previewUrl,
}: {
  file: File | null;
  previewUrl: string | null;
}) {
  if (previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
      <img
        src={previewUrl}
        alt="Vista previa del comprobante"
        className="size-24 rounded-field border border-line object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-24 shrink-0 items-center justify-center rounded-field bg-bg font-bold text-muted"
    >
      {file ? 'PDF' : 'JPG · PDF'}
    </span>
  );
}
