'use client';

import { useId, useState } from 'react';
import { Button, Card } from '@/components/ui';
import type { ChargePaymentInfo } from '@/services/charges';
import { CHARGE_MESSAGES } from './charge-messages';

async function copyText(text: string): Promise<boolean> {
  try {
    if (!navigator.clipboard) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Datos de pago del titular en el detalle del cobro (RF-002-09; mockup `Cobro.dc.html`): QR,
 * texto con **Copiar datos** y el aviso si el titular no los configuró. El texto es plano.
 */
export function ChargePaymentInfoCard({ info }: { info: ChargePaymentInfo }) {
  const titleId = useId();
  const [notice, setNotice] = useState('');
  const text = info.configured ? info.text : null;

  async function handleCopy() {
    if (!text) return;
    setNotice((await copyText(text)) ? CHARGE_MESSAGES.copied : CHARGE_MESSAGES.copyFailed);
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Datos de pago
      </h2>
      <p className="text-[15px] text-muted">{CHARGE_MESSAGES.paymentOutside}</p>
      {!info.configured && <p className="font-bold">{CHARGE_MESSAGES.paymentInfoMissing}</p>}
      {info.configured && info.qrUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración
        <img
          src={info.qrUrl}
          alt="QR de pago del titular"
          referrerPolicy="no-referrer"
          className="size-48 self-center rounded-field border border-line object-contain sm:self-start"
        />
      )}
      {text && (
        <>
          <p className="break-words whitespace-pre-line">{text}</p>
          <Button variant="secondary" onClick={() => void handleCopy()} className="sm:self-start">
            Copiar datos
          </Button>
          <p role="status" aria-live="polite" className="text-[15px] font-bold text-primary-hover">
            {notice}
          </p>
        </>
      )}
    </Card>
  );
}
