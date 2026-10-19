'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card } from '@/components/ui';
import { useHostEnablementAction, useHostEnablements } from '@/hooks/use-admin-hosts';
import { formatDateLaPaz } from '@/lib/dates';
import { adminUserPath } from '@/lib/routes';
import type { HostEnablementRow } from '@/services/admin-hosts';
import type { AdminUserRow } from '@/services/admin-users';
import { adminActionOutcome, adminLoadErrorMessage } from './admin-messages';
import { AdminListSkeleton, AdminLoadError } from './admin-states';
import { AdminUserPicker } from './admin-user-picker';
import { ReasonModal, type ReasonModalResult } from './reason-modal';

type Pending =
  | { kind: 'enable'; userId: string; fullName: string }
  | { kind: 'revoke'; userId: string; fullName: string };

function EnablementItem({
  row,
  onRevoke,
}: {
  row: HostEnablementRow;
  onRevoke: (row: HostEnablementRow) => void;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          href={adminUserPath(row.user.id)}
          className="inline-flex min-h-11 items-center font-bold break-words"
        >
          {row.user.fullName}
        </Link>
        <p className="break-words">
          <span className="text-muted">Motivo: </span>
          {row.reason}
        </p>
        <p className="text-[15px] text-muted">
          Por {row.enabledBy.fullName} · desde el {formatDateLaPaz(row.enabledAt)}
        </p>
      </div>
      <Button
        variant="danger"
        onClick={() => onRevoke(row)}
        aria-label={`Quitar la habilitación de ${row.user.fullName}`}
        className="w-full sm:w-auto"
      >
        Quitar
      </Button>
    </article>
  );
}

/**
 * `/admin/titulares` (spec 009 T021, plan §6; mockup `AdminTitulares.dc.html`): habilitaciones
 * manuales vigentes con **Quitar**, y **Habilitar a un usuario** buscándolo por nombre o correo.
 * Cada cambio pide confirmación con un motivo de 10 a 300 caracteres y queda en auditoría
 * (RF-009-21). La habilitación manual no depende de la calificación (RF-007-17, CA-009-28).
 */
export function AdminHostsView() {
  const { status, error, reload, refresh, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useHostEnablements();
  const { submit } = useHostEnablementAction();
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; message: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);

  async function confirm(action: Pending, reason: string): Promise<ReasonModalResult> {
    const response = await submit({
      userId: action.userId,
      enable: action.kind === 'enable',
      reason,
    });
    if (!response) return null;
    if (response.ok) {
      setPending(null);
      setNotice({
        ok: true,
        message:
          action.kind === 'enable'
            ? `Habilitaste a ${action.fullName} como titular.`
            : `Quitaste la habilitación de ${action.fullName}.`,
      });
      if (action.kind === 'enable') {
        setSelected(null);
        setPickerKey((current) => current + 1);
      }
      await refresh();
      return { ok: true };
    }
    const outcome = adminActionOutcome(response.error);
    if (outcome.refresh) {
      setPending(null);
      setNotice({ ok: false, message: outcome.message });
      await refresh();
      return null;
    }
    return { ok: false, message: outcome.message, field: outcome.field };
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
          Habilitación de titulares
        </h1>
        <p className="text-muted">
          Un usuario puede crear suscripciones si tiene 4,5 estrellas con al menos 6 cobros
          considerados, o si un administrador lo habilita aquí. Así arrancan los primeros titulares.
        </p>
      </div>

      {notice && <Alert variant={notice.ok ? 'success' : 'warning'}>{notice.message}</Alert>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-start">
        <section aria-labelledby="titulares-vigentes" className="flex flex-col gap-3">
          <h2 id="titulares-vigentes" className="font-display text-xl font-bold">
            Habilitaciones manuales vigentes
          </h2>
          {(status === 'loading' || status === 'redirecting') && (
            <AdminListSkeleton label="Cargando habilitaciones…" rows={3} />
          )}
          {status === 'error' && error && (
            <AdminLoadError
              error={error}
              title="No pudimos cargar las habilitaciones."
              onRetry={reload}
            />
          )}
          {status === 'success' && items.length === 0 && (
            <p className="rounded-card border border-line bg-surface p-5">
              No hay habilitaciones manuales vigentes. Habilita a alguien con el formulario.
            </p>
          )}
          {status === 'success' && items.length > 0 && (
            <>
              <ul aria-label="Habilitaciones vigentes" className="flex flex-col gap-3">
                {items.map((row) => (
                  <li key={row.id}>
                    <EnablementItem
                      row={row}
                      onRevoke={(target) => {
                        setNotice(null);
                        setPending({
                          kind: 'revoke',
                          userId: target.user.id,
                          fullName: target.user.fullName,
                        });
                      }}
                    />
                  </li>
                ))}
              </ul>
              {loadMoreError && (
                <Alert variant="error">{adminLoadErrorMessage(loadMoreError)}</Alert>
              )}
              {hasMore && (
                <Button
                  variant="secondary"
                  onClick={() => void loadMore()}
                  loading={isLoadingMore}
                  className="w-full sm:w-auto sm:self-center"
                >
                  Cargar más
                </Button>
              )}
            </>
          )}
        </section>

        <Card
          as="section"
          aria-labelledby="titulares-habilitar"
          className="flex flex-col gap-4 p-4 sm:p-6"
        >
          <h2 id="titulares-habilitar" className="font-display text-xl font-bold">
            Habilitar a un usuario
          </h2>
          <AdminUserPicker
            key={pickerKey}
            label="Buscar usuario por nombre o correo"
            selected={selected}
            onSelect={setSelected}
          />
          <Button
            disabled={!selected}
            onClick={() => {
              if (!selected) return;
              setNotice(null);
              setPending({ kind: 'enable', userId: selected.id, fullName: selected.fullName });
            }}
          >
            {selected ? `Habilitar a ${selected.fullName}` : 'Habilitar'}
          </Button>
          <p className="text-[15px] text-muted">Queda en auditoría con tu nombre.</p>
        </Card>
      </div>

      {pending && (
        <ReasonModal
          title={
            pending.kind === 'enable'
              ? `¿Habilitar a ${pending.fullName} como titular?`
              : `¿Quitar la habilitación de ${pending.fullName}?`
          }
          description={
            pending.kind === 'enable'
              ? 'Podrá crear suscripciones aunque su calificación sea menor al umbral.'
              : 'Desde ahora solo podrá crear suscripciones si su calificación lo permite.'
          }
          confirmLabel={pending.kind === 'enable' ? 'Habilitar' : 'Quitar habilitación'}
          confirmVariant={pending.kind === 'enable' ? 'primary' : 'danger'}
          onConfirm={(reason) => confirm(pending, reason)}
          onClose={() => setPending(null)}
        />
      )}
    </>
  );
}
