'use client';

import { useId, useState } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useAdminDispute } from '@/hooks/use-admin-disputes';
import { formatBs } from '@/lib/money';
import { formatDateTimeLaPaz } from '@/lib/dates';
import type { AdminDisputeEvidence, AdminDisputeResult } from '@/services/admin-disputes';
import { AdminActionDialog } from './admin-action-dialog';
import {
  DISPUTE_RESULT_EFFECT,
  DISPUTE_RESULT_LABEL,
  DISPUTE_TYPE_LABEL,
} from './admin-dispute-labels';

const RESULTS: AdminDisputeResult[] = ['estafa_confirmada', 'sin_falta'];

/**
 * `/admin/reclamos/[id]` (plan 009 §6, RF-009-20, CA-009-25 a 27, 30). La evidencia (chat y
 * comprobante) no se carga hasta que la persona la pide con «Ver evidencia», y ese aviso dice que
 * la apertura queda registrada. Resolver pide el resultado y un motivo de 10 a 300 caracteres.
 */
export function AdminDisputeView({ disputeId }: { disputeId: string }) {
  const ficha = useAdminDispute(disputeId);
  const [result, setResult] = useState<AdminDisputeResult | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const resolverId = useId();

  if (ficha.dispute.status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Cargando el reclamo…
      </p>
    );
  }

  if (ficha.dispute.status === 'error' || !ficha.dispute.data) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error" title="No se pudo cargar el reclamo">
          {ficha.dispute.error?.message}
        </Alert>
        <Button variant="secondary" onClick={ficha.dispute.reload} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  const dispute = ficha.dispute.data;
  const open = dispute.status === 'abierto';

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl tracking-tight">
            {DISPUTE_TYPE_LABEL[dispute.type]}
          </h1>
          {open ? (
            <Badge variant="warning">! Abierto</Badge>
          ) : (
            <Badge variant="neutral">
              ✓ Resuelto{dispute.result ? ` · ${DISPUTE_RESULT_LABEL[dispute.result]}` : ''}
            </Badge>
          )}
        </div>
        <p className="text-muted">
          Abrió <strong className="text-ink">{dispute.requesterName}</strong> (solicitante) contra{' '}
          <strong className="text-ink">{dispute.accusedName}</strong> (acusado) ·{' '}
          {dispute.groupName}
          {' · '}
          {formatDateTimeLaPaz(dispute.createdAt)} · Cuota {formatBs(dispute.quoteCents)}
          {dispute.reference ? ` · Ref. ${dispute.reference}` : ''}
        </p>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}

      <Card className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Evidencia</h2>
        {!ficha.evidenceRequested && (
          <>
            <div role="note" className="rounded-field bg-primary-soft p-3 text-sm">
              Ver la evidencia abre el chat y el comprobante privados.{' '}
              <strong>Esta apertura queda registrada en auditoría.</strong>
            </div>
            <Button variant="secondary" onClick={ficha.requestEvidence} className="self-start">
              Ver evidencia
            </Button>
          </>
        )}
        {ficha.evidenceRequested && ficha.evidence.status === 'loading' && (
          <p role="status" className="text-muted">
            Abriendo la evidencia…
          </p>
        )}
        {ficha.evidenceRequested && ficha.evidence.status === 'error' && (
          <div className="flex flex-col gap-3">
            <Alert variant="error">{ficha.evidence.error?.message}</Alert>
            <Button variant="secondary" onClick={ficha.evidence.reload} className="self-start">
              Reintentar
            </Button>
          </div>
        )}
        {ficha.evidenceRequested && ficha.evidence.status === 'success' && ficha.evidence.data && (
          <Evidence evidence={ficha.evidence.data} />
        )}
      </Card>

      {open ? (
        <Card
          as="section"
          aria-labelledby={`${resolverId}-resolver`}
          className="flex flex-col gap-4"
        >
          <h2 id={`${resolverId}-resolver`} className="text-lg font-bold">
            Resolver
          </h2>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm text-muted">Resultado</legend>
            {RESULTS.map((value) => (
              <label
                key={value}
                className="flex min-h-11 cursor-pointer gap-3 rounded-card border border-line p-4"
              >
                <input
                  type="radio"
                  name="resultado"
                  value={value}
                  checked={result === value}
                  onChange={() => setResult(value)}
                  className="mt-1 h-5 w-5"
                />
                <span>
                  <strong>{DISPUTE_RESULT_LABEL[value]}</strong>
                  <br />
                  <span className="text-sm text-muted">{DISPUTE_RESULT_EFFECT[value]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div>
            <Button disabled={!result} onClick={() => setConfirmOpen(true)}>
              Resolver reclamo
            </Button>
          </div>
        </Card>
      ) : (
        <Alert variant="info">
          Este reclamo ya está resuelto
          {dispute.result ? `: ${DISPUTE_RESULT_LABEL[dispute.result]}` : ''}.
        </Alert>
      )}

      <AdminActionDialog
        open={confirmOpen && result !== null}
        onClose={() => setConfirmOpen(false)}
        title={
          result
            ? `¿Resolver como ${DISPUTE_RESULT_LABEL[result].toLowerCase()}?`
            : 'Resolver reclamo'
        }
        description={result ? DISPUTE_RESULT_EFFECT[result] : ''}
        confirmLabel="Resolver reclamo"
        danger={result === 'estafa_confirmada'}
        onConfirm={async (reason) => {
          if (!result) return null;
          const outcome = await ficha.resolve({ result, reason });
          if (outcome?.ok) setNotice(`Reclamo resuelto: ${DISPUTE_RESULT_LABEL[result]}.`);
          return outcome;
        }}
      />
    </div>
  );
}

function Evidence({ evidence }: { evidence: AdminDisputeEvidence }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted">
        Evidencia abierta el {formatDateTimeLaPaz(evidence.openedAt)}.
      </p>

      <section aria-labelledby="linea-tiempo" className="flex flex-col gap-2">
        <h3 id="linea-tiempo" className="font-bold">
          Línea de tiempo
        </h3>
        <ol className="flex flex-col gap-1 text-sm">
          {evidence.timeline.map((item) => (
            <li key={`${item.at}-${item.label}`}>
              <span className="text-muted">{formatDateTimeLaPaz(item.at)}</span> · {item.label}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="chat-solo-lectura" className="flex flex-col gap-2">
        <h3 id="chat-solo-lectura" className="font-bold">
          Chat (solo lectura)
        </h3>
        {evidence.chat.length === 0 ? (
          <p className="text-sm text-muted">No hay mensajes en el chat.</p>
        ) : (
          <ol className="flex flex-col gap-2 text-sm">
            {evidence.chat.map((message) => (
              <li key={`${message.at}-${message.author}`}>
                <strong>{message.author}</strong> · {formatDateTimeLaPaz(message.at)}:{' '}
                {message.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="comprobante" className="flex flex-col gap-2">
        <h3 id="comprobante" className="font-bold">
          Comprobante
        </h3>
        {evidence.receipt ? (
          <a
            href={evidence.receipt.url}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 self-start text-sm font-bold"
          >
            {evidence.receipt.label} (abre en otra pestaña)
          </a>
        ) : (
          <p className="text-sm text-muted">No hay comprobante adjunto.</p>
        )}
      </section>

      <section aria-labelledby="descripciones" className="flex flex-col gap-2">
        <h3 id="descripciones" className="font-bold">
          Descripciones y respuestas
        </h3>
        {[...evidence.descriptions, ...evidence.responses].length === 0 ? (
          <p className="text-sm text-muted">Nadie ha escrito una descripción todavía.</p>
        ) : (
          <ul className="flex flex-col gap-2 text-sm">
            {evidence.descriptions.map((item) => (
              <li key={`d-${item.by}-${item.text}`}>
                <strong>{item.by}:</strong> {item.text}
              </li>
            ))}
            {evidence.responses.map((item) => (
              <li key={`r-${item.by}-${item.text}`}>
                <strong>Respuesta de {item.by}:</strong> {item.text}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
