import { useId, type ReactNode } from 'react';
import { PAYMENT_METHOD_LABEL } from '@/components/features/billing/charge-messages';
import { Card } from '@/components/ui';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatFileSize } from '@/lib/receipt-file';
import type { JoinProof } from '@/services/join-requests';

export interface ProofSummaryProps {
  proof: JoinProof;
  /** Acciones extra (por ejemplo, «Ver comprobante» del titular). */
  children?: ReactNode;
}

/** Comprobante informado (RF-010-13): método, referencia, fecha en La Paz y archivo. */
export function ProofSummary({ proof, children }: ProofSummaryProps) {
  const titleId = useId();
  const rows: Array<[string, string]> = [
    ['Método', PAYMENT_METHOD_LABEL[proof.method]],
    ['Referencia', proof.reference],
    ['Subido', formatDateTimeLaPaz(proof.uploadedAt)],
    [
      'Archivo',
      `${proof.mime === 'application/pdf' ? 'PDF' : 'Imagen'} · ${formatFileSize(proof.sizeBytes)}`,
    ],
  ];
  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Comprobante de ingreso
      </h2>
      <dl className="flex flex-col">
        {rows.map(([term, value]) => (
          <div
            key={term}
            className="flex items-baseline justify-between gap-3 border-b border-line py-2.5 last:border-b-0"
          >
            <dt className="text-muted">{term}</dt>
            <dd className="font-bold break-all">{value}</dd>
          </div>
        ))}
      </dl>
      {children}
    </Card>
  );
}
