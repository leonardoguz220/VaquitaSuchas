'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';
import { useProofFile } from '@/hooks/use-join-requests';
import type { ApiError } from '@/services/http';
import { joinErrorMessage } from './join-messages';

export const PROOF_FILE_MESSAGES = {
  deleted: 'El comprobante ya no está disponible.',
  popupBlocked: 'Permite las ventanas emergentes de Vaquita para ver el comprobante.',
} as const;

function proofErrorMessage(error: ApiError): string {
  return error.code === 'FILE_DELETED' || error.statusCode === 404 || error.statusCode === 410
    ? PROOF_FILE_MESSAGES.deleted
    : joinErrorMessage(error);
}

export interface ProofFileButtonProps {
  requestId: string;
}

/**
 * «Ver comprobante» del titular (RF-010-13). Pide el enlace firmado de 10 minutos como máximo
 * (`GET …/proof/file`) y lo abre en una pestaña nueva. La pestaña se abre antes de pedir el
 * enlace, porque los navegadores bloquean las ventanas que se abren después de una espera.
 */
export function ProofFileButton({ requestId }: ProofFileButtonProps) {
  const { submit, isSubmitting } = useProofFile(requestId);
  const [message, setMessage] = useState<string | null>(null);

  async function handleOpen() {
    setMessage(null);
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setMessage(PROOF_FILE_MESSAGES.popupBlocked);
      return;
    }
    const result = await submit(undefined);
    if (!result) {
      tab.close();
      return;
    }
    if (!result.ok) {
      tab.close();
      setMessage(proofErrorMessage(result.error));
      return;
    }
    tab.opener = null;
    tab.location.href = result.data.url;
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Button variant="secondary" loading={isSubmitting} onClick={() => void handleOpen()}>
        Ver comprobante
      </Button>
      {message && (
        <p role="alert" className="text-[15px] text-danger">
          {message}
        </p>
      )}
    </div>
  );
}
