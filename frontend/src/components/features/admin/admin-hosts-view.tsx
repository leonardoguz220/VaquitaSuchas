'use client';

import { useState } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import { useAdminHosts } from '@/hooks/use-admin-hosts';
import { formatDateTimeLaPaz } from '@/lib/dates';
import type { AdminUserRow, HostEnablementRow } from '@/services/admin';
import { AdminActionDialog } from './admin-action-dialog';
import { AdminUserPicker } from './admin-user-picker';

/**
 * `/admin/titulares` (plan 009 §6, RF-009-21, CA-009-28): habilitaciones manuales vigentes, con alta
 * y baja. Cada alta o baja pide confirmación y un motivo de 10 a 300 caracteres.
 */
export function AdminHostsView() {
  const hosts = useAdminHosts();
  const [picked, setPicked] = useState<AdminUserRow | null>(null);
  const [grantOpen, setGrantOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<HostEnablementRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight">Titulares</h1>
        <p className="text-muted">
          Un usuario puede crear suscripciones si cumple la calificación y los cobros requeridos, o
          si un administrador lo habilita aquí. Así arrancan los primeros titulares.
        </p>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}

      <section aria-labelledby="vigentes" className="flex flex-col gap-3">
        <h2 id="vigentes" className="text-xl font-bold">
          Habilitaciones manuales vigentes
        </h2>
        {hosts.status === 'loading' && (
          <p role="status" className="text-muted">
            Cargando habilitaciones…
          </p>
        )}
        {hosts.status === 'error' && (
          <div className="flex flex-col gap-3">
            <Alert variant="error">{hosts.error?.message}</Alert>
            <Button variant="secondary" onClick={hosts.reload} className="self-start">
              Reintentar
            </Button>
          </div>
        )}
        {hosts.status === 'success' && hosts.data?.length === 0 && (
          <p className="text-muted">Todavía no hay habilitaciones manuales.</p>
        )}
        {hosts.status === 'success' && (hosts.data?.length ?? 0) > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2">
            {hosts.data?.map((row) => (
              <li key={row.userId}>
                <Card className="flex flex-col gap-2">
                  <span className="font-bold">{row.fullName}</span>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                    <dt className="text-muted">Motivo</dt>
                    <dd>{row.reason}</dd>
                    <dt className="text-muted">Por</dt>
                    <dd>{row.grantedBy}</dd>
                    <dt className="text-muted">Desde</dt>
                    <dd>{formatDateTimeLaPaz(row.grantedAt)}</dd>
                  </dl>
                  <Button
                    variant="secondary"
                    onClick={() => setRevokeTarget(row)}
                    className="self-start"
                  >
                    Quitar habilitación
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="alta" className="flex flex-col gap-4">
        <h2 id="alta" className="text-xl font-bold">
          Habilitar a un usuario
        </h2>
        <AdminUserPicker selected={picked} onSelect={setPicked} />
        <div>
          <Button disabled={!picked} onClick={() => setGrantOpen(true)}>
            Habilitar como titular
          </Button>
        </div>
        <p className="text-sm text-muted">Queda en auditoría con tu nombre.</p>
      </section>

      <AdminActionDialog
        open={grantOpen}
        onClose={() => setGrantOpen(false)}
        title={picked ? `¿Habilitar a ${picked.fullName} como titular?` : 'Habilitar como titular'}
        description="Podrá crear suscripciones aunque no cumpla la calificación. Queda en auditoría."
        confirmLabel="Habilitar"
        onConfirm={async (reason) => {
          if (!picked) return null;
          const outcome = await hosts.grant({ userId: picked.id, reason });
          if (outcome?.ok) {
            setNotice(`${picked.fullName} ya está habilitado como titular.`);
            setPicked(null);
          }
          return outcome;
        }}
      />

      <AdminActionDialog
        open={revokeTarget !== null}
        onClose={() => setRevokeTarget(null)}
        title={
          revokeTarget
            ? `¿Quitar la habilitación de ${revokeTarget.fullName}?`
            : 'Quitar habilitación'
        }
        description="Dejará de poder crear suscripciones, salvo que cumpla la calificación. Queda en auditoría."
        confirmLabel="Quitar habilitación"
        danger
        onConfirm={async (reason) => {
          if (!revokeTarget) return null;
          const outcome = await hosts.revoke({ userId: revokeTarget.userId, reason });
          if (outcome?.ok) setNotice(`Se quitó la habilitación de ${revokeTarget.fullName}.`);
          return outcome;
        }}
      />
    </div>
  );
}
