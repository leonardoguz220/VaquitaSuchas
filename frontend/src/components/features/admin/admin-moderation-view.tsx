'use client';

import { useState } from 'react';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { useAdminModeration, type ModerationDecision } from '@/hooks/use-admin-moderation';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import type { ListingReportReason, ReportedListing } from '@/services/admin-moderation';
import { AdminActionDialog } from './admin-action-dialog';

const REASON_LABEL: Record<ListingReportReason, string> = {
  spam: 'Spam',
  datos_falsos: 'Datos falsos',
  conducta_indebida: 'Conducta indebida',
  otro: 'Otro',
};

type DecisionKind = ModerationDecision['type'];

const DECISION: Record<
  DecisionKind,
  { title: string; description: string; confirmLabel: string; danger: boolean; notice: string }
> = {
  restaurar: {
    title: '¿Restaurar la publicación?',
    description:
      'Vuelve a aparecer en Cupos libres. Queda registrado quién la restauró y por qué. Se avisa al titular.',
    confirmLabel: 'Restaurar',
    danger: false,
    notice: 'La publicación volvió a Cupos libres.',
  },
  eliminar: {
    title: '¿Eliminar la publicación?',
    description:
      'Es un cierre definitivo. Se avisa al titular de la decisión y el motivo queda en auditoría.',
    confirmLabel: 'Eliminar',
    danger: true,
    notice: 'La publicación se eliminó.',
  },
  eliminar_y_suspender: {
    title: '¿Eliminar la publicación y suspender al titular?',
    description:
      'Además de eliminarla, se suspende al titular: se cierran sus sesiones y no podrá ingresar. Se avisa al titular con el motivo.',
    confirmLabel: 'Eliminar y suspender',
    danger: true,
    notice: 'La publicación se eliminó y el titular quedó suspendido.',
  },
};

/**
 * `/admin/moderacion` (plan 009 §6, RF-009-12 a RF-009-14): publicaciones reportadas u ocultas con
 * sus motivos y comentarios. Cada decisión pide un motivo de 10 a 300 caracteres y queda registrada.
 */
export function AdminModerationView() {
  const queue = useAdminModeration();
  const [pending, setPending] = useState<{ kind: DecisionKind; listing: ReportedListing } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);

  if (queue.status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Cargando publicaciones reportadas…
      </p>
    );
  }

  if (queue.status === 'error') {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error" title="No se pudo cargar la cola">
          {queue.error?.message}
        </Alert>
        <Button variant="secondary" onClick={queue.reload} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  const items = queue.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight">Moderación de cupos libres</h1>
        <p className="text-muted">
          Con 3 reportes de personas distintas, una publicación se oculta hasta que la revises.
        </p>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}

      {items.length === 0 && <p className="text-muted">No hay publicaciones por revisar.</p>}

      <ul className="flex flex-col gap-4" aria-label="Publicaciones por revisar">
        {items.map((listing) => (
          <li key={listing.id}>
            <Card as="article" className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-bold">{listing.title}</h2>
                {listing.status === 'oculta' ? (
                  <Badge variant="danger">⛔ Oculta · {listing.reports.length} reportes</Badge>
                ) : (
                  <Badge variant="warning">
                    ! Visible · {listing.reports.length}{' '}
                    {listing.reports.length === 1 ? 'reporte' : 'reportes'}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted">
                Titular: {listing.ownerName} · publicada el {formatDateLaPaz(listing.publishedAt)}
              </p>
              <p className="text-sm">{listing.description}</p>
              <ul className="flex flex-col gap-1 text-sm">
                {listing.reports.map((report) => (
                  <li key={`${report.createdAt}-${report.reason}`}>
                    <strong>{REASON_LABEL[report.reason]}</strong>
                    {report.comment ? `: ${report.comment}` : ''} ·{' '}
                    <span className="text-muted">{formatDateTimeLaPaz(report.createdAt)}</span>
                  </li>
                ))}
              </ul>
              <div className="grid gap-2 sm:flex sm:flex-wrap">
                <Button
                  variant="secondary"
                  onClick={() => setPending({ kind: 'restaurar', listing })}
                >
                  Restaurar
                </Button>
                <Button variant="danger" onClick={() => setPending({ kind: 'eliminar', listing })}>
                  Eliminar
                </Button>
                <Button
                  variant="danger"
                  onClick={() => setPending({ kind: 'eliminar_y_suspender', listing })}
                >
                  Eliminar y suspender al titular
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      {pending && (
        <AdminActionDialog
          open
          onClose={() => setPending(null)}
          title={DECISION[pending.kind].title}
          description={DECISION[pending.kind].description}
          confirmLabel={DECISION[pending.kind].confirmLabel}
          danger={DECISION[pending.kind].danger}
          onConfirm={async (reason) => {
            const outcome = await queue.decide({
              type: pending.kind,
              listingId: pending.listing.id,
              reason,
            });
            if (outcome?.ok) setNotice(DECISION[pending.kind].notice);
            return outcome;
          }}
        />
      )}
    </div>
  );
}
