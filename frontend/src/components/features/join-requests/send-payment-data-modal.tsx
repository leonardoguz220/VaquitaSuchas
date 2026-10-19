'use client';

import { useId, useState, type FormEvent } from 'react';
import { PaymentQrInput } from '@/components/features/groups/payment-qr-input';
import { Alert, Button, Modal, Textarea } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import { useSendPaymentData } from '@/hooks/use-join-requests';
import { formatBs } from '@/lib/money';
import type { JoinRequest } from '@/services/join-requests';
import { actionErrorOutcome, REQUEST_MESSAGES } from './join-messages';

const TEXT_MAX = 500;

type Source = 'grupo' | 'otros';

const SOURCES: Array<{ value: Source; label: string; hint: string }> = [
  {
    value: 'grupo',
    label: 'Los datos de pago del grupo',
    hint: 'El texto y el QR que configuraste en el grupo.',
  },
  {
    value: 'otros',
    label: 'Otros datos solo para esta solicitud',
    hint: 'Un texto o un QR distinto (JPG o PNG hasta 2 MB).',
  },
];

export interface SendPaymentDataModalProps {
  request: JoinRequest;
  open: boolean;
  onClose: () => void;
  /** La API devolvió la solicitud en `esperando_pago`. */
  onSent: (request: JoinRequest) => void;
  /** La solicitud cambió en el servidor: se vuelve a pedir y se avisa. */
  onStale: (message: string) => void;
}

/**
 * **Enviar datos de pago** (RF-010-11; mockup `SolicitudAbierta.dc.html`): el titular elige los
 * datos del grupo o envía otros (texto o QR). La cuota la fija el servidor al enviar; aquí solo se
 * muestra la estimada que entrega la API. Sin cupo (`NO_SLOTS_AVAILABLE`) la solicitud sigue
 * abierta (RF-010-12).
 */
export function SendPaymentDataModal({
  request,
  open,
  onClose,
  onSent,
  onStale,
}: SendPaymentDataModalProps) {
  const formId = useId();
  const [source, setSource] = useState<Source>('grupo');
  const [text, setText] = useState('');
  const [qr, setQr] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { submit, isSubmitting } = useSendPaymentData(request.id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const trimmed = text.trim();
    if (source === 'otros' && !trimmed && !qr) {
      setFormError(REQUEST_MESSAGES.customPaymentEmpty);
      return;
    }
    const input =
      source === 'grupo'
        ? { version: request.version }
        : {
            ...(trimmed ? { text: trimmed } : {}),
            ...(qr ? { qr } : {}),
            version: request.version,
          };
    const result = await submit(input);
    if (!result) return;
    if (result.ok) {
      setText('');
      setQr(null);
      setSource('grupo');
      onSent(result.data);
      return;
    }
    const outcome = actionErrorOutcome(result.error);
    if (outcome.refresh) onStale(outcome.message);
    else setFormError(outcome.message);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Enviar datos de pago"
      description="Al enviarlos se fija la cuota, se reserva un cupo y la persona tiene 15 minutos para pagar y subir su comprobante."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" form={formId} loading={isSubmitting}>
            Enviar datos de pago
          </Button>
        </>
      }
    >
      <form
        id={formId}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-4"
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 font-bold">¿Qué datos le envías?</legend>
          {SOURCES.map((item) => (
            <label
              key={item.value}
              className={cx(
                'flex min-h-11 cursor-pointer items-start gap-3 rounded-field border-[1.5px] p-3',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-primary',
                source === item.value ? 'border-ink' : 'border-field-border',
              )}
            >
              <input
                type="radio"
                name="payment-source"
                value={item.value}
                checked={source === item.value}
                onChange={() => setSource(item.value)}
                className="mt-1 size-4 accent-primary"
              />
              <span className="flex flex-col">
                <span className="font-bold">{item.label}</span>
                <span className="text-[15px] text-muted">{item.hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {source === 'otros' && (
          <>
            <Textarea
              label="Datos de pago (opcional si subes un QR)"
              hint={`Hasta ${TEXT_MAX} caracteres. ${text.trim().length} de ${TEXT_MAX}.`}
              value={text}
              maxLength={TEXT_MAX}
              onChange={(event) => setText(event.target.value)}
            />
            <PaymentQrInput file={qr} onChange={setQr} />
          </>
        )}
        <p className="rounded-field bg-bg p-3 text-[15px]">
          Cuota estimada: <strong>{formatBs(request.estimatedShareCents)}</strong>. La cuota final
          la fija el sistema al enviar.
        </p>
        {formError && <Alert variant="error">{formError}</Alert>}
      </form>
    </Modal>
  );
}
