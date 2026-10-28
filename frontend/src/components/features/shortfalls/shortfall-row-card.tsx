'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Select, Textarea } from '@/components/ui';
import { useApiSubmit } from '@/hooks/use-api-submit';
import { formatDateTimeLaPaz } from '@/lib/dates';
import { formatBs } from '@/lib/money';
import {
  confirmShortfallPayment,
  confirmShortfallRefund,
  disputeShortfallRefund,
  payShortfallExtra,
  rejectShortfallPayment,
  respondToShortfall,
  sendShortfallRefund,
  type PaymentMethod,
  type RefundMethod,
  type ShortfallRow,
} from '@/services/shortfalls';
import {
  CHOICE_LABEL,
  EXTRA_LABEL,
  REFUND_LABEL,
  REFRESH_CODES,
  shortfallErrorMessage,
} from './shortfall-labels';

export interface RowCardProps {
  row: ShortfallRow;
  /** La API devolvió la fila ya cambiada. */
  onChanged: (row: ShortfallRow) => void;
  /** La fila cambió en el servidor: se vuelve a pedir la ronda. */
  onStale: () => void;
}

type Run = () => Promise<ShortfallRow>;
const runAction = (run: Run): Promise<ShortfallRow> => run();

/** Una fila de la ronda con las acciones que la API permite (`allowedActions`). */
export function ShortfallRowCard({ row, onChanged, onStale }: RowCardProps) {
  const { submit, isSubmitting } = useApiSubmit<Run, ShortfallRow>(runAction);
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState('qr');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const can = (action: ShortfallRow['allowedActions'][number]): boolean =>
    row.allowedActions.includes(action);

  async function run(request: Run) {
    setError(null);
    const result = await submit(request);
    if (!result) return;
    if (result.ok) {
      setReference('');
      setReason('');
      onChanged(result.data);
      return;
    }
    setError(shortfallErrorMessage(result.error));
    if (REFRESH_CODES.has(result.error.code)) onStale();
  }

  function onSubmit(handler: () => void) {
    return (event: FormEvent) => {
      event.preventDefault();
      handler();
    };
  }

  const version = row.version;
  const status = [EXTRA_LABEL[row.extra.status], REFUND_LABEL[row.refund.status]].filter(Boolean);

  return (
    <Card
      as="article"
      aria-label={`Faltante de ${row.member.fullName}`}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{row.member.fullName}</h3>
        <Badge variant={row.choice === 'pendiente' ? 'warning' : 'info'}>
          {CHOICE_LABEL[row.choice]}
        </Badge>
      </div>
      <dl className="grid grid-cols-2 gap-2 text-[15px]">
        <dt className="text-muted">Pagó</dt>
        <dd className="text-right font-bold">{formatBs(row.paidCents)}</dd>
        <dt className="text-muted">Debe agregar</dt>
        <dd className="text-right font-bold">{formatBs(row.extraDueCents)}</dd>
        {row.extra.deadlineAt && row.extra.status === 'pendiente_pago' && (
          <>
            <dt className="text-muted">Pagar hasta</dt>
            <dd className="text-right">{formatDateTimeLaPaz(row.extra.deadlineAt)}</dd>
          </>
        )}
        {row.refund.amountCents !== null && (
          <>
            <dt className="text-muted">Devolución</dt>
            <dd className="text-right font-bold">{formatBs(row.refund.amountCents)}</dd>
          </>
        )}
      </dl>
      {status.length > 0 && <p className="text-[15px] text-muted">{status.join(' · ')}</p>}
      {row.extra.rejectReason && row.extra.status === 'pendiente_pago' && (
        <Alert variant="warning">Pago rechazado: {row.extra.rejectReason}</Alert>
      )}
      {row.refund.disputeReason && (
        <Alert variant="error">Motivo de la disputa: {row.refund.disputeReason}</Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {(can('cover') || can('requestRefund')) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {can('cover') && (
            <Button
              loading={isSubmitting}
              onClick={() =>
                void run(() => respondToShortfall(row.id, { choice: 'cubrir', version }))
              }
            >
              Cubrir mi parte ({formatBs(row.extraDueCents)})
            </Button>
          )}
          {can('requestRefund') && (
            <Button
              variant="secondary"
              loading={isSubmitting}
              onClick={() =>
                void run(() => respondToShortfall(row.id, { choice: 'devolucion', version }))
              }
            >
              Pedir mi devolución y salir del grupo
            </Button>
          )}
        </div>
      )}

      {(can('pay') || can('sendRefund')) && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={onSubmit(
            () =>
              void run(() =>
                can('pay')
                  ? payShortfallExtra(row.id, {
                      method: method as PaymentMethod,
                      reference,
                      version,
                    })
                  : sendShortfallRefund(row.id, {
                      method: method as RefundMethod,
                      reference,
                      version,
                    }),
              ),
          )}
        >
          <Select label="Método" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="qr">QR</option>
            <option value="transferencia">Transferencia</option>
            {can('sendRefund') && <option value="efectivo">Efectivo</option>}
          </Select>
          <Field
            label="Referencia de la transacción"
            maxLength={100}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <Button type="submit" loading={isSubmitting}>
            {can('pay') ? 'Informar mi pago' : 'Registrar devolución hecha'}
          </Button>
        </form>
      )}

      {can('confirmPayment') && (
        <div className="flex flex-col gap-3">
          <Button
            loading={isSubmitting}
            onClick={() => void run(() => confirmShortfallPayment(row.id, { version }))}
          >
            Confirmar pago adicional
          </Button>
        </div>
      )}
      {(can('rejectPayment') || can('disputeRefund')) && (
        <form
          noValidate
          className="flex flex-col gap-3"
          onSubmit={onSubmit(
            () =>
              void run(() =>
                can('rejectPayment')
                  ? rejectShortfallPayment(row.id, { reason, version })
                  : disputeShortfallRefund(row.id, { reason, version }),
              ),
          )}
        >
          <Textarea
            label={can('rejectPayment') ? 'Motivo del rechazo' : 'Motivo de la disputa'}
            maxLength={300}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button type="submit" variant="danger" loading={isSubmitting}>
            {can('rejectPayment') ? 'Rechazar pago' : 'Disputar devolución'}
          </Button>
        </form>
      )}
      {can('confirmRefund') && (
        <Button
          loading={isSubmitting}
          onClick={() => void run(() => confirmShortfallRefund(row.id, { version }))}
        >
          Confirmar que recibí mi devolución
        </Button>
      )}
    </Card>
  );
}
