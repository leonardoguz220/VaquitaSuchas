'use client';

import { useId, useState } from 'react';
import { Button, Card } from '@/components/ui';
import { usePaymentQr } from '@/hooks/use-join-requests';
import { copyText } from '@/lib/clipboard';
import { formatAmountInput, formatBs } from '@/lib/money';
import type { JoinRequest } from '@/services/join-requests';
import { REQUEST_MESSAGES } from './join-messages';
import type { RequestViewer } from './request-header';

function PaymentQr({ requestId }: { requestId: string }) {
  const { status, data, error } = usePaymentQr(requestId, true);
  if (status === 'loading' || status === 'redirecting') {
    return (
      <div
        role="status"
        aria-busy="true"
        className="size-48 animate-pulse self-center rounded-field bg-line motion-reduce:animate-none sm:self-start"
      >
        <span className="sr-only">Cargando el QR de pago…</span>
      </div>
    );
  }
  if (status === 'error' || !data) {
    const deleted = error?.code === 'FILE_DELETED' || error?.statusCode === 410;
    return (
      <p className="text-[15px] text-muted">
        {deleted ? REQUEST_MESSAGES.qrDeleted : REQUEST_MESSAGES.qrFailed}
      </p>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración
    <img
      src={data.url}
      alt="QR de pago del titular"
      referrerPolicy="no-referrer"
      className="size-48 self-center rounded-field border border-line object-contain sm:self-start"
    />
  );
}

export interface PaymentInfoCardProps {
  request: JoinRequest;
  viewer: RequestViewer;
}

/**
 * Datos de pago copiados a la solicitud (RF-010-11; mockup `Solicitud.dc.html`): la cuota fijada
 * con **Copiar monto**, el QR (URL firmada, `GET …/payment-qr`) y el texto con **Copiar datos**.
 * El monto y el cálculo los entrega la API (`quote`); el texto es plano.
 */
export function PaymentInfoCard({ request, viewer }: PaymentInfoCardProps) {
  const titleId = useId();
  const [notice, setNotice] = useState('');
  const { paymentInfo, quote } = request;
  if (!paymentInfo) return null;

  async function handleCopy(text: string) {
    setNotice((await copyText(text)) ? REQUEST_MESSAGES.copied : REQUEST_MESSAGES.copyFailed);
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        {viewer === 'titular' ? 'Datos de pago enviados' : 'Paga tu cuota de ingreso'}
      </h2>
      {quote && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-bg p-4">
          <div className="flex flex-col">
            <span className="text-[15px] text-muted">Cuota fijada al enviar los datos</span>
            <span className="font-display text-3xl font-bold">{formatBs(quote.amountCents)}</span>
            <span className="text-[15px] text-muted">
              {formatBs(quote.totalBsCents)} del mes entre {quote.memberCount}{' '}
              {quote.memberCount === 1 ? 'miembro' : 'miembros'}
              {viewer === 'solicitante' ? ', contándote' : ''}
            </span>
          </div>
          {viewer === 'solicitante' && (
            <Button
              variant="secondary"
              onClick={() => void handleCopy(formatAmountInput(quote.amountCents))}
            >
              Copiar monto
            </Button>
          )}
        </div>
      )}
      {paymentInfo.qrAvailable && <PaymentQr requestId={request.id} />}
      {paymentInfo.text && (
        <div className="flex flex-col gap-3">
          <p className="break-words whitespace-pre-line">{paymentInfo.text}</p>
          {viewer === 'solicitante' && (
            <Button
              variant="secondary"
              onClick={() => void handleCopy(paymentInfo.text ?? '')}
              className="sm:self-start"
            >
              Copiar datos
            </Button>
          )}
        </div>
      )}
      <p role="status" aria-live="polite" className="text-[15px] font-bold text-primary-hover">
        {notice}
      </p>
    </Card>
  );
}
