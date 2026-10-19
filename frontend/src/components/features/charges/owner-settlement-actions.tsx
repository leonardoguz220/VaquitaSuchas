'use client';

import { useId, useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Modal } from '@/components/ui';
import { controlClass, FieldError, FieldHint, FieldLabel } from '@/components/ui/field-parts';
import { cx } from '@/components/ui/cx';
import { useOwnerReviewActions, type OwnerReviewResult } from '@/hooks/use-owner-review-actions';
import { formatBs } from '@/lib/money';
import type { Charge } from '@/services/charges';
import type { ChargeActionsContext } from './charge-detail';
import {
  MANUAL_NOTE_MAX_LENGTH,
  REASON_MAX_LENGTH,
  laPazInputToIso,
  reviewError,
  reviewSuccess,
  validateManualNote,
  validatePaidAt,
  validateReason,
  type ReviewNotice,
} from './owner-review-model';

export interface OwnerSettlementActionsProps extends ChargeActionsContext {
  charge: Charge;
  /** Aviso que queda en la página aunque este panel desaparezca tras la acción. */
  onNotice: (notice: ReviewNotice | null) => void;
}

type SettlementAction = 'manualPayment' | 'cancel';

/**
 * Pago en efectivo y cancelar (RF-002-12, RF-002-13, CA-002-14, CA-002-15; mockup de cobro). Cada
 * botón aparece solo si `allowedActions` lo trae: el frontend no decide por estado ni por rol.
 */
export function OwnerSettlementActions({
  charge,
  onChargeChange,
  onNotice,
}: OwnerSettlementActionsProps) {
  const ids = useId();
  const paidAtId = `${ids}-paid-at`;
  const noteId = `${ids}-note`;
  const reasonId = `${ids}-reason`;
  const manualFormId = `${ids}-manual-form`;
  const cancelFormId = `${ids}-cancel-form`;
  const { manualPayment, cancel, isRegistering, isCancelling } = useOwnerReviewActions({
    charge,
    onChargeChange,
  });

  const [open, setOpen] = useState<SettlementAction | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState('');
  const [paidAtError, setPaidAtError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const paidAtRef = useRef<HTMLInputElement>(null);

  const canManual = charge.allowedActions.includes('manualPayment');
  const canCancel = charge.allowedActions.includes('cancel');
  const amount = formatBs(charge.amountCents);
  const name = charge.member.fullName;
  const busy = isRegistering || isCancelling;

  function openModal(action: SettlementAction) {
    onNotice(null);
    setModalError(null);
    setPaidAtError(null);
    setNoteError(null);
    setReasonError(null);
    setOpen(action);
  }

  function closeModal() {
    if (busy) return;
    setOpen(null);
  }

  function clearModal() {
    setOpen(null);
    setPaidAt('');
    setNote('');
    setReason('');
  }

  async function finish(action: SettlementAction, result: OwnerReviewResult) {
    if (!result) return;
    if (result.ok) {
      clearModal();
      onNotice(reviewSuccess(result.charge, action));
      return;
    }
    const mapped = reviewError(result.error, action);
    if (mapped.target === 'page') {
      clearModal();
      onNotice(mapped.notice);
    } else if (mapped.target === 'reason') {
      setReasonError(mapped.message);
      reasonRef.current?.focus();
    } else {
      setModalError(mapped.message);
    }
  }

  async function handleManual(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);
    // Sin fecha, el servidor usa la hora actual (CA-002-14).
    const paidAtIso = paidAt ? laPazInputToIso(paidAt) : undefined;
    const paidAtProblem = paidAtIso ? validatePaidAt(paidAtIso, charge.issuedAt, new Date()) : null;
    const noteProblem = validateManualNote(note);
    setPaidAtError(paidAtProblem);
    setNoteError(noteProblem);
    if (paidAtProblem || noteProblem) {
      if (paidAtProblem) paidAtRef.current?.focus();
      return;
    }
    await finish(
      'manualPayment',
      await manualPayment({ note: note.trim() || undefined, paidAt: paidAtIso }),
    );
  }

  async function handleCancel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalError(null);
    const problem = validateReason(reason);
    setReasonError(problem);
    if (problem) {
      reasonRef.current?.focus();
      return;
    }
    await finish('cancel', await cancel({ reason: reason.trim() }));
  }

  if (!canManual && !canCancel) return null;

  return (
    <Card as="section" aria-labelledby={`${ids}-title`} className="flex flex-col gap-4">
      <h2 id={`${ids}-title`} className="font-display text-xl font-bold">
        Registrar el pago o cancelar
      </h2>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        {canCancel && (
          <Button
            variant="secondary"
            onClick={() => openModal('cancel')}
            className="w-full sm:w-auto"
          >
            Cancelar cobro
          </Button>
        )}
        {canManual && (
          <Button onClick={() => openModal('manualPayment')} className="w-full sm:w-auto">
            Pago en efectivo
          </Button>
        )}
      </div>

      <Modal
        open={open === 'manualPayment'}
        onClose={closeModal}
        title="Registrar pago en efectivo"
        description={`Confirmas que ${name} te pagó ${amount} en efectivo. El cobro quedará pagado.`}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isRegistering}>
              Volver
            </Button>
            <Button type="submit" form={manualFormId} loading={isRegistering}>
              Registrar pago
            </Button>
          </>
        }
      >
        <form id={manualFormId} noValidate onSubmit={handleManual} className="flex flex-col gap-4">
          {modalError && <Alert variant="error" title={modalError} />}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={paidAtId}>Fecha y hora del pago (opcional)</FieldLabel>
            <input
              ref={paidAtRef}
              id={paidAtId}
              type="datetime-local"
              value={paidAt}
              disabled={isRegistering}
              aria-invalid={paidAtError ? true : undefined}
              aria-describedby={cx(`${paidAtId}-hint`, paidAtError && `${paidAtId}-error`)}
              onChange={(event) => {
                setPaidAt(event.target.value);
                if (paidAtError) setPaidAtError(null);
              }}
              className={controlClass}
            />
            <FieldHint id={`${paidAtId}-hint`}>Vacío: ahora (hora de La Paz).</FieldHint>
            {paidAtError && <FieldError id={`${paidAtId}-error`}>{paidAtError}</FieldError>}
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={noteId}>Nota (opcional)</FieldLabel>
            <textarea
              id={noteId}
              value={note}
              rows={3}
              maxLength={MANUAL_NOTE_MAX_LENGTH}
              disabled={isRegistering}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={cx(`${noteId}-hint`, noteError && `${noteId}-error`)}
              onChange={(event) => {
                setNote(event.target.value);
                if (noteError) setNoteError(null);
              }}
              className={cx(controlClass, 'py-3')}
            />
            <FieldHint id={`${noteId}-hint`}>
              {`Hasta ${MANUAL_NOTE_MAX_LENGTH} caracteres (${note.trim().length}/${MANUAL_NOTE_MAX_LENGTH}).`}
            </FieldHint>
            {noteError && <FieldError id={`${noteId}-error`}>{noteError}</FieldError>}
          </div>
        </form>
      </Modal>

      <Modal
        open={open === 'cancel'}
        onClose={closeModal}
        title="Cancelar el cobro"
        description={`El cobro de ${name} dejará de contar como deuda. Escribe el motivo.`}
        initialFocusRef={reasonRef}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isCancelling}>
              Volver
            </Button>
            <Button type="submit" form={cancelFormId} variant="danger" loading={isCancelling}>
              Cancelar cobro
            </Button>
          </>
        }
      >
        <form id={cancelFormId} noValidate onSubmit={handleCancel} className="flex flex-col gap-4">
          {modalError && <Alert variant="error" title={modalError} />}
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor={reasonId}>Motivo</FieldLabel>
            <textarea
              ref={reasonRef}
              id={reasonId}
              value={reason}
              rows={3}
              maxLength={REASON_MAX_LENGTH}
              required
              disabled={isCancelling}
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
        </form>
      </Modal>
    </Card>
  );
}
