'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Modal, Textarea } from '@/components/ui';
import { useConfirmCharge, useReceiptFile, useRejectCharge } from '@/hooks/use-charges';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import { formatFileSize } from '@/lib/receipt-file';
import type { Charge, Receipt } from '@/services/charges';
import {
  CHARGE_MESSAGES,
  PAYMENT_METHOD_LABEL,
  receiptFileErrorMessage,
  reviewErrorOutcome,
} from './charge-messages';

const REASON_MIN = 5;
const REASON_MAX = 200;

/**
 * **Ver comprobante**: pide la URL firmada (10 minutos como máximo) y la abre en una pestaña
 * nueva. La pestaña se abre antes de esperar a la API para que el navegador no la bloquee.
 */
function ViewReceiptButton({ chargeId, receipt }: { chargeId: string; receipt: Receipt }) {
  const { submit, isSubmitting } = useReceiptFile(chargeId);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleView() {
    setProblem(null);
    const tab = window.open('', '_blank');
    const result = await submit(receipt.id);
    if (!result || !result.ok) {
      tab?.close();
      if (result) setProblem(receiptFileErrorMessage(result.error));
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.url;
    } else {
      window.open(result.data.url, '_blank', 'noopener,noreferrer');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        onClick={() => void handleView()}
        loading={isSubmitting}
        className="sm:self-start"
      >
        Ver comprobante
      </Button>
      {problem && <Alert variant="error">{problem}</Alert>}
    </div>
  );
}

function ReceiptDetails({ charge, receipt }: { charge: Charge; receipt: Receipt }) {
  const rows: Array<[string, string]> = [
    ['Método', PAYMENT_METHOD_LABEL[receipt.method]],
    ['Referencia', receipt.reference],
    ['Subido', formatDateTimeLaPaz(receipt.uploadedAt)],
    [
      'Archivo',
      `${receipt.mime === 'application/pdf' ? 'PDF' : 'Imagen'} · ${formatFileSize(receipt.sizeBytes)}`,
    ],
  ];
  return (
    <>
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
      {receipt.fileAvailable ? (
        <ViewReceiptButton chargeId={charge.id} receipt={receipt} />
      ) : (
        <p className="text-[15px] text-muted">{CHARGE_MESSAGES.fileDeleted}</p>
      )}
    </>
  );
}

interface RejectModalProps {
  charge: Charge;
  open: boolean;
  onClose: () => void;
  onDone: (charge: Charge) => void;
  onStale: (message: string) => void;
}

/** Modal **Rechazar** con motivo obligatorio (5 a 200) y la casilla «comprobante inválido». */
function RejectModal({ charge, open, onClose, onDone, onStale }: RejectModalProps) {
  const formId = useId();
  const checkboxId = useId();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState('');
  const [invalidReceipt, setInvalidReceipt] = useState(false);
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { submit, isSubmitting } = useRejectCharge(charge.id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN || trimmed.length > REASON_MAX) {
      setReasonError(CHARGE_MESSAGES.reasonLength);
      reasonRef.current?.focus();
      return;
    }
    setReasonError(null);
    setFormError(null);
    const result = await submit({ reason: trimmed, invalidReceipt, version: charge.version });
    if (!result) return;
    if (result.ok) {
      setReason('');
      setInvalidReceipt(false);
      onDone(result.data);
      return;
    }
    const outcome = reviewErrorOutcome(result.error);
    if (outcome.refresh) {
      onStale(outcome.message);
      return;
    }
    if (outcome.field === 'reason') setReasonError(outcome.message);
    else setFormError(outcome.message);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Rechazar comprobante"
      description="El cobro vuelve a «Pendiente» o pasa a «Atrasado» si ya venció, y el miembro puede volver a subir su comprobante."
      initialFocusRef={reasonRef}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Volver
          </Button>
          <Button type="submit" form={formId} variant="danger" loading={isSubmitting}>
            Rechazar comprobante
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
        <Textarea
          ref={reasonRef}
          label={`Motivo (lo verá ${charge.member.fullName})`}
          hint={`Entre ${REASON_MIN} y ${REASON_MAX} caracteres. ${reason.trim().length} de ${REASON_MAX}.`}
          value={reason}
          maxLength={REASON_MAX}
          required
          error={reasonError}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="flex items-start gap-3">
          <input
            id={checkboxId}
            type="checkbox"
            checked={invalidReceipt}
            onChange={(event) => setInvalidReceipt(event.target.checked)}
            className="mt-1 size-5 shrink-0 accent-primary"
          />
          <label htmlFor={checkboxId} className="flex flex-col">
            <span className="font-bold">Marcar como comprobante inválido</span>
            <span className="text-[15px] text-muted">
              Úsalo si el comprobante es falso o no corresponde a este pago.
            </span>
          </label>
        </div>
        {formError && <Alert variant="error">{formError}</Alert>}
      </form>
    </Modal>
  );
}

export interface ChargeReviewProps {
  charge: Charge;
  /** La API devolvió el cobro ya cambiado: se muestra con su aviso. */
  onChanged: (charge: Charge, message: string) => void;
  /** El cobro cambió en el servidor: se vuelve a pedir y se avisa. */
  onStale: (message: string) => void;
}

/**
 * Comprobante vigente y acciones del titular en `/cobros/[id]` (spec 002 T026, plan §6; mockup
 * `Revisar.dc.html`): **Ver comprobante**, **Confirmar pago** y **Rechazar** según
 * `allowedActions`. El frontend no decide quién puede hacerlo; el backend responde `403` si no
 * corresponde (CA-002-12) y `409` si el cobro ya cambió (CA-002-19).
 */
export function ChargeReview({ charge, onChanged, onStale }: ChargeReviewProps) {
  const titleId = useId();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const confirm = useConfirmCharge(charge.id);
  const canConfirm = charge.allowedActions.includes('confirm');
  const canReject = charge.allowedActions.includes('reject');
  const receipt = charge.currentReceipt;

  if (!receipt && !canConfirm && !canReject) return null;

  async function handleConfirm() {
    setProblem(null);
    const result = await confirm.submit({ version: charge.version });
    if (!result) return;
    if (result.ok) {
      onChanged(result.data, CHARGE_MESSAGES.confirmed);
      return;
    }
    const outcome = reviewErrorOutcome(result.error);
    if (outcome.refresh) onStale(outcome.message);
    else setProblem(outcome.message);
  }

  return (
    <Card as="section" aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="font-display text-xl font-bold">
        Comprobante de {charge.member.fullName}
      </h2>
      {receipt ? (
        <ReceiptDetails charge={charge} receipt={receipt} />
      ) : (
        <p className="text-muted">Todavía no hay un comprobante vigente.</p>
      )}
      {(canConfirm || canReject) && (
        <>
          <p className="rounded-field bg-bg p-3 text-[15px]">
            {CHARGE_MESSAGES.checkBank} Monto: <strong>{formatBs(charge.amountCents)}</strong>.
          </p>
          {problem && <Alert variant="error">{problem}</Alert>}
          <div className="flex flex-col gap-3 sm:flex-row">
            {canConfirm && (
              <Button onClick={() => void handleConfirm()} loading={confirm.isSubmitting}>
                Confirmar pago
              </Button>
            )}
            {canReject && (
              <Button variant="danger" onClick={() => setRejectOpen(true)}>
                Rechazar
              </Button>
            )}
          </div>
          <RejectModal
            charge={charge}
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            onDone={(updated) => {
              setRejectOpen(false);
              onChanged(updated, CHARGE_MESSAGES.rejected);
            }}
            onStale={(message) => {
              setRejectOpen(false);
              onStale(message);
            }}
          />
        </>
      )}
    </Card>
  );
}
