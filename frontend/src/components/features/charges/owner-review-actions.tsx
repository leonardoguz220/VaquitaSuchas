'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Modal } from '@/components/ui';
import { controlClass, FieldError, FieldHint, FieldLabel } from '@/components/ui/field-parts';
import { cx } from '@/components/ui/cx';
import { useOwnerReviewActions } from '@/hooks/use-owner-review-actions';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import type { Charge, Receipt } from '@/services/charges';
import type { ChargeActionsContext } from './charge-detail';
import {
  REASON_MAX_LENGTH,
  reviewError,
  reviewSuccess,
  validateReason,
  type ReviewAction,
  type ReviewNotice,
} from './owner-review-model';
import { ReceiptViewerButton } from './receipt-viewer-button';

export interface OwnerReviewActionsProps extends ChargeActionsContext {
  charge: Charge;
  /** Aviso que queda en la página aunque este panel desaparezca tras la acción. */
  onNotice: (notice: ReviewNotice | null) => void;
}

const METHOD_LABEL: Record<Receipt['method'], string> = {
  qr: 'QR',
  transferencia: 'Transferencia',
};

function ReceiptFacts({ receipt }: { receipt: Receipt }) {
  const rows = [
    { term: 'Método', value: METHOD_LABEL[receipt.method] },
    { term: 'Referencia', value: receipt.reference },
    {
      term: 'Subido',
      value: `${formatDateTimeLaPaz(receipt.uploadedAt)} por ${receipt.uploadedBy.fullName}`,
    },
  ];
  return (
    <dl aria-label="Datos del comprobante" className="flex flex-col divide-y divide-line">
      {rows.map((row) => (
        <div key={row.term} className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
          <dt className="text-muted">{row.term}</dt>
          <dd className="font-bold break-all">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Confirmar, rechazar y ver el comprobante (RF-002-10, RF-002-11; plan 002 §6; mockup
 * `Revisar.dc.html`). Cada botón aparece solo si `allowedActions` lo trae: el frontend no decide
 * por estado ni por rol.
 */
export function OwnerReviewActions({ charge, onChargeChange, onNotice }: OwnerReviewActionsProps) {
  const ids = useId();
  const reasonId = `${ids}-reason`;
  const formId = `${ids}-reject-form`;
  const { confirm, reject, isConfirming, isRejecting } = useOwnerReviewActions({
    charge,
    onChargeChange,
  });

  const [open, setOpen] = useState<ReviewAction | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [invalidReceipt, setInvalidReceipt] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const canConfirm = charge.allowedActions.includes('confirm');
  const canReject = charge.allowedActions.includes('reject');
  const receipt = charge.currentReceipt;
  const amount = formatBs(charge.amountCents);
  const name = charge.member.fullName;
  const busy = isConfirming || isRejecting;

  function openModal(action: ReviewAction) {
    onNotice(null);
    setModalError(null);
    setReasonError(null);
    setOpen(action);
  }

  function closeModal() {
    if (busy) return;
    setOpen(null);
  }

  async function finish(action: ReviewAction, result: Awaited<ReturnType<typeof confirm>>) {
    if (!result) return;
    if (result.ok) {
      setOpen(null);
      setReason('');
      setInvalidReceipt(false);
      onNotice(reviewSuccess(result.charge, action));
      return;
    }
    const mapped = reviewError(result.error, action);
    if (mapped.target === 'page') {
      setOpen(null);
      onNotice(mapped.notice);
    } else if (mapped.target === 'reason') {
      setReasonError(mapped.message);
      reasonRef.current?.focus();
    } else {
      setModalError(mapped.message);
    }
  }

  async function handleConfirm() {
    setModalError(null);
    await finish('confirm', await confirm());
  }

  async function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);
    const problem = validateReason(reason);
    setReasonError(problem);
    if (problem) {
      reasonRef.current?.focus();
      return;
    }
    await finish('reject', await reject({ reason: reason.trim(), invalidReceipt }));
  }

  return (
    <Card as="section" aria-labelledby={`${ids}-title`} className="flex flex-col gap-4">
      <h2 id={`${ids}-title`} className="font-display text-xl font-bold">
        Revisar el comprobante
      </h2>
      {receipt && <ReceiptFacts receipt={receipt} />}
      {receipt?.fileAvailable && (
        <ReceiptViewerButton chargeId={charge.id} receiptId={receipt.id} />
      )}
      {canConfirm && (
        <p className="text-[15px] text-muted">
          {`Revisa en tu banco que llegaron ${amount}${receipt ? ' con esa referencia' : ''} antes de confirmar.`}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {canReject && (
          <Button
            variant="secondary"
            onClick={() => openModal('reject')}
            className="w-full sm:w-auto"
          >
            Rechazar
          </Button>
        )}
        {canConfirm && (
          <Button onClick={() => openModal('confirm')} className="w-full sm:w-auto">
            Confirmar pago
          </Button>
        )}
      </div>

      <Modal
        open={open === 'confirm'}
        onClose={closeModal}
        title="¿Confirmar el pago?"
        description={`Confirmas que recibiste ${amount} de ${name}. El cobro quedará pagado y el comprobante, confirmado.`}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isConfirming}>
              Volver
            </Button>
            <Button onClick={handleConfirm} loading={isConfirming}>
              Confirmar pago
            </Button>
          </>
        }
      >
        {modalError && <Alert variant="error" title={modalError} />}
      </Modal>

      <Modal
        open={open === 'reject'}
        onClose={closeModal}
        title="Rechazar el comprobante"
        description={`El cobro vuelve a «Pendiente» o pasa a «Atrasado» si ya venció. ${name} verá el motivo.`}
        initialFocusRef={reasonRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isRejecting}>
              Volver
            </Button>
            <Button type="submit" form={formId} variant="danger" loading={isRejecting}>
              Rechazar comprobante
            </Button>
          </>
        }
      >
        <form id={formId} noValidate onSubmit={handleReject} className="flex flex-col gap-4">
          {modalError && <Alert variant="error" title={modalError} />}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={reasonId}>{`Motivo (lo verá ${name})`}</FieldLabel>
            <textarea
              ref={reasonRef}
              id={reasonId}
              value={reason}
              rows={3}
              maxLength={REASON_MAX_LENGTH}
              required
              disabled={isRejecting}
              aria-invalid={reasonError ? true : undefined}
              aria-describedby={cx(`${reasonId}-hint`, reasonError && `${reasonId}-error`)}
              onChange={(event) => {
                setReason(event.target.value);
                if (reasonError) setReasonError(null);
              }}
              className={cx(controlClass, 'py-3')}
            />
            <FieldHint id={`${reasonId}-hint`}>
              {`Entre 5 y ${REASON_MAX_LENGTH} caracteres (${reason.trim().length}/${REASON_MAX_LENGTH}).`}
            </FieldHint>
            {reasonError && <FieldError id={`${reasonId}-error`}>{reasonError}</FieldError>}
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={invalidReceipt}
              disabled={isRejecting}
              onChange={(event) => setInvalidReceipt(event.target.checked)}
              className="size-5.5 shrink-0 cursor-pointer accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            />
            <span>Comprobante inválido</span>
          </label>
        </form>
      </Modal>
    </Card>
  );
}
