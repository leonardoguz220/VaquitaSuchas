'use client';

import { useState } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import type { PaymentInfo } from '@/services/groups';

type CopyFeedback = { variant: 'success' | 'error'; message: string } | null;

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function PaymentInfoNotice({ paymentInfo }: { paymentInfo: PaymentInfo | null }) {
  if (paymentInfo === null) {
    return (
      <Alert variant="info" title="Este cobro no muestra datos de pago.">
        Los datos de pago del titular solo se muestran mientras el cobro se puede pagar.
      </Alert>
    );
  }
  return (
    <Alert variant="info" title="Todavía no hay datos de pago.">
      El titular todavía no cargó su QR ni los datos de su cuenta. Pídeselos antes de pagar.
    </Alert>
  );
}

/**
 * Datos de pago del grupo en el detalle del cobro (RF-002-09, CA-001-23): texto con «Copiar» y
 * QR, o un aviso si la API no los entrega (`null`) o el titular no los cargó.
 */
export function ChargePaymentInfo({ paymentInfo }: { paymentInfo: PaymentInfo | null }) {
  const [feedback, setFeedback] = useState<CopyFeedback>(null);
  const configured = paymentInfo?.configured === true;

  async function copy(text: string) {
    setFeedback(
      (await copyText(text))
        ? { variant: 'success', message: 'Datos de pago copiados.' }
        : { variant: 'error', message: 'No pudimos copiar los datos. Cópialos a mano.' },
    );
  }

  return (
    <Card as="section" aria-labelledby="charge-payment-info" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="charge-payment-info" className="font-display text-xl font-bold">
          Datos de pago
        </h2>
        <p className="text-[15px] text-muted">
          Paga fuera de Vaquita, por transferencia o QR. Vaquita no recibe ni guarda dinero.
        </p>
      </div>
      {configured && paymentInfo ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          {paymentInfo.qrUrl && (
            // URL firmada de corta duración: next/image exigiría declarar el dominio de Storage.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={paymentInfo.qrUrl}
              alt="QR de pago del titular"
              referrerPolicy="no-referrer"
              className="size-48 shrink-0 self-center rounded-field border border-line bg-surface object-contain p-2 sm:self-start"
            />
          )}
          {paymentInfo.text && (
            <div className="flex flex-col items-start gap-3">
              <p className="break-words whitespace-pre-line">{paymentInfo.text}</p>
              <Button
                variant="secondary"
                onClick={() => copy(paymentInfo.text as string)}
                className="w-full sm:w-auto"
              >
                Copiar datos
              </Button>
              {feedback && <Alert variant={feedback.variant} title={feedback.message} />}
            </div>
          )}
        </div>
      ) : (
        <PaymentInfoNotice paymentInfo={paymentInfo} />
      )}
    </Card>
  );
}
