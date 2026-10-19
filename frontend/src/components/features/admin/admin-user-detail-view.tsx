'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { RatingBadge } from '@/components/features/reputation/rating-badge';
import { Alert, Button, Card, Field, type ButtonVariant } from '@/components/ui';
import { useHostEnablementAction, useTransferOwnership } from '@/hooks/use-admin-hosts';
import { useAdminUser, useAdminUserAction, type AdminUserAction } from '@/hooks/use-admin-users';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { ADMIN_USERS_PATH } from '@/lib/routes';
import type { AdminUserDetail, AdminUserRow } from '@/services/admin-users';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import { adminActionOutcome } from './admin-messages';
import { AdminLoadError, UserRoleBadge, UserStatusBadge } from './admin-states';
import { AdminUserPicker } from './admin-user-picker';
import { ReasonModal, type ReasonModalResult } from './reason-modal';

type UserActionKind = 'suspend' | 'reactivate' | 'ban' | 'revokeBan' | 'promote' | 'demote';
type ActionKind = UserActionKind | 'enableHost' | 'revokeHost' | 'transfer';

interface ActionCopy {
  button: string;
  title: (name: string) => string;
  description: string;
  confirm: string;
  variant: ButtonVariant;
  reasonRequired: boolean;
  done: (name: string) => string;
}

/** Textos de cada acción sensible (RNF-009-02); los efectos los aplica el backend. */
const ACTIONS: Record<ActionKind, ActionCopy> = {
  suspend: {
    button: 'Suspender',
    title: (name) => `¿Suspender a ${name}?`,
    description:
      'Se cierran sus sesiones y no podrá ingresar. Sus grupos siguen funcionando y los miembros ven un aviso. Recibirá un correo con el motivo y cómo apelar.',
    confirm: 'Suspender',
    variant: 'danger',
    reasonRequired: true,
    done: (name) => `Suspendiste a ${name}.`,
  },
  reactivate: {
    button: 'Reactivar',
    title: (name) => `¿Reactivar a ${name}?`,
    description:
      'Podrá volver a ingresar. Sus datos, grupos y cobros no cambiaron durante la suspensión.',
    confirm: 'Reactivar',
    variant: 'primary',
    reasonRequired: false,
    done: (name) => `Reactivaste a ${name}.`,
  },
  ban: {
    button: 'Banear',
    title: (name) => `¿Banear a ${name}?`,
    description:
      'Se cierran sus sesiones y se bloquean su correo, su celular, su cédula y su cuenta de Telegram. Sale de los grupos donde es miembro y los grupos que administra quedan en solo lectura. Solo otro administrador puede revertirlo.',
    confirm: 'Banear',
    variant: 'danger',
    reasonRequired: true,
    done: (name) => `Baneaste a ${name}.`,
  },
  revokeBan: {
    button: 'Revertir baneo',
    title: (name) => `¿Revertir el baneo de ${name}?`,
    description:
      'La cuenta vuelve a estar activa y se liberan sus datos bloqueados. Los grupos que este baneo congeló se descongelan; no vuelve a los grupos de los que salió. Debe hacerlo un administrador distinto del que baneó.',
    confirm: 'Revertir baneo',
    variant: 'primary',
    reasonRequired: true,
    done: (name) => `Revertiste el baneo de ${name}.`,
  },
  promote: {
    button: 'Promover a administrador',
    title: (name) => `¿Promover a ${name} a administrador?`,
    description: 'Tendrá acceso a todo el panel de administración.',
    confirm: 'Promover',
    variant: 'primary',
    reasonRequired: true,
    done: (name) => `${name} ahora es administrador.`,
  },
  demote: {
    button: 'Quitar rol de administrador',
    title: (name) => `¿Quitar el rol de administrador a ${name}?`,
    description: 'Vuelve a ser usuario. Siempre debe quedar al menos un administrador.',
    confirm: 'Quitar rol',
    variant: 'danger',
    reasonRequired: true,
    done: (name) => `${name} ya no es administrador.`,
  },
  enableHost: {
    button: 'Habilitar como titular',
    title: (name) => `¿Habilitar a ${name} como titular?`,
    description: 'Podrá crear suscripciones aunque su calificación sea menor al umbral.',
    confirm: 'Habilitar',
    variant: 'primary',
    reasonRequired: true,
    done: (name) => `Habilitaste a ${name} como titular.`,
  },
  revokeHost: {
    button: 'Quitar habilitación de titular',
    title: (name) => `¿Quitar la habilitación de ${name}?`,
    description: 'Desde ahora solo podrá crear suscripciones si su calificación lo permite.',
    confirm: 'Quitar habilitación',
    variant: 'danger',
    reasonRequired: true,
    done: (name) => `Quitaste la habilitación de ${name}.`,
  },
  transfer: {
    button: 'Transferir titularidad',
    title: (name) => `¿Transferir un grupo de ${name}?`,
    description:
      'Solo se puede mientras el titular está suspendido y a pedido de los miembros. El nuevo titular debe ser miembro activo del grupo y estar habilitado como titular.',
    confirm: 'Transferir',
    variant: 'danger',
    reasonRequired: true,
    done: () => 'Transferiste la titularidad del grupo.',
  },
};

/**
 * Acciones que se ofrecen según el estado y el rol que entrega la API. Solo ordena la interfaz:
 * el backend valida cada acción (RN-009-02, CA-009-24) y la pantalla muestra su error.
 */
function availableActions(user: AdminUserDetail): ActionKind[] {
  const actions: ActionKind[] = [];
  if (user.status === 'baneado') {
    if (user.ban) actions.push('revokeBan');
    return actions;
  }
  if (user.role === 'admin') {
    actions.push('demote');
  } else {
    if (user.status === 'activo') actions.push('suspend');
    if (user.status === 'suspendido') actions.push('reactivate');
    actions.push('ban', 'promote');
  }
  actions.push(user.hostEnablement ? 'revokeHost' : 'enableHost');
  if (user.status === 'suspendido' && user.groupsAsHost > 0) actions.push('transfer');
  return actions;
}

function toRequest(kind: UserActionKind, user: AdminUserDetail, reason: string): AdminUserAction {
  switch (kind) {
    case 'suspend':
      return { kind: 'suspend', reason };
    case 'reactivate':
      return { kind: 'reactivate', ...(reason ? { reason } : {}) };
    case 'ban':
      return { kind: 'ban', reason };
    case 'revokeBan':
      return { kind: 'revokeBan', banId: user.ban?.id ?? '', reason };
    case 'promote':
      return { kind: 'role', role: 'admin', reason };
    case 'demote':
      return { kind: 'role', role: 'usuario', reason };
  }
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line py-3 last:border-b-0 sm:grid sm:grid-cols-[200px_1fr] sm:gap-4">
      <dt className="text-[15px] text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">Cargando la ficha…</span>
      <div aria-hidden="true" className="h-10 w-2/3 animate-pulse rounded-field bg-line" />
      <div
        aria-hidden="true"
        className="h-72 animate-pulse rounded-card border border-line bg-surface"
      />
    </div>
  );
}

function plural(value: number, one: string, many: string) {
  return `${value} ${value === 1 ? one : many}`;
}

/** Aviso de la situación de la cuenta: baneo o suspensión vigente, con su motivo como texto. */
function AccountNotice({ user }: { user: AdminUserDetail }) {
  if (user.status === 'baneado') {
    return (
      <Alert variant="error" title="Cuenta baneada">
        {user.ban ? (
          <>
            Desde el {formatDateTimeLaPaz(user.ban.bannedAt)}. Motivo: {user.ban.reason}
          </>
        ) : (
          'Sus datos están bloqueados para nuevos registros.'
        )}
      </Alert>
    );
  }
  if (user.status === 'suspendido') {
    return (
      <Alert variant="warning" title="Cuenta suspendida">
        {user.suspension ? (
          <>
            Desde el {formatDateTimeLaPaz(user.suspension.suspendedAt)}. Motivo:{' '}
            {user.suspension.reason}
          </>
        ) : (
          'No puede ingresar hasta que la reactiven.'
        )}
      </Alert>
    );
  }
  return null;
}

/**
 * `/admin/usuarios/[id]` (spec 009 T017, plan §6; mockup `AdminUsuarios.dc.html`): ficha con la
 * CI enmascarada tal como llega (CA-009-36), sin contraseñas ni comprobantes (CA-009-08), grupos
 * y nivel de puntualidad (RF-009-09), y las acciones **Suspender**, **Reactivar**, **Banear**,
 * **Revertir baneo**, **Promover/Quitar rol**, **Habilitar como titular** y, con el titular
 * suspendido, **Transferir titularidad** (spec 009 T021, RF-009-24), cada una con modal de
 * confirmación y motivo de 10 a 300 caracteres con contador (RNF-009-02). Todo queda en auditoría
 * en el servidor.
 */
export function AdminUserDetailView({ userId }: { userId: string }) {
  const { status, data: user, error, reload, refresh } = useAdminUser(userId);
  const { submit } = useAdminUserAction(userId);
  const hostAction = useHostEnablementAction();
  const transferAction = useTransferOwnership();
  const [open, setOpen] = useState<ActionKind | null>(null);
  const [notice, setNotice] = useState<{ message: string; ok: boolean } | null>(null);
  const [groupId, setGroupId] = useState('');
  const [newHost, setNewHost] = useState<AdminUserRow | null>(null);

  function openAction(kind: ActionKind) {
    setNotice(null);
    setGroupId('');
    setNewHost(null);
    setOpen(kind);
  }

  function run(
    kind: ActionKind,
    target: AdminUserDetail,
    reason: string,
  ): Promise<ApiSubmitResult<void> | null> {
    switch (kind) {
      case 'enableHost':
      case 'revokeHost':
        return hostAction.submit({ userId: target.id, enable: kind === 'enableHost', reason });
      case 'transfer':
        return transferAction.submit({
          groupId: groupId.trim(),
          toUserId: newHost?.id ?? '',
          reason,
        });
      default:
        return submit(toRequest(kind, target, reason));
    }
  }

  async function confirm(kind: ActionKind, reason: string): Promise<ReasonModalResult> {
    if (!user) return null;
    const response = await run(kind, user, reason);
    if (!response) return null;
    if (response.ok) {
      setOpen(null);
      setNotice({ ok: true, message: ACTIONS[kind].done(user.fullName) });
      await refresh();
      return { ok: true };
    }
    if (kind === 'transfer' && response.error.statusCode === 404) {
      return {
        ok: false,
        message: 'No encontramos ese grupo. Revisa el identificador.',
        field: null,
      };
    }
    const outcome = adminActionOutcome(response.error);
    if (outcome.refresh) {
      setOpen(null);
      setNotice({ ok: false, message: outcome.message });
      await refresh();
      return null;
    }
    return { ok: false, message: outcome.message, field: outcome.field };
  }

  return (
    <>
      <Link href={ADMIN_USERS_PATH} className="inline-flex min-h-11 items-center self-start">
        Volver a usuarios
      </Link>

      {(status === 'loading' || status === 'redirecting') && <DetailSkeleton />}

      {status === 'error' && error && (
        <AdminLoadError
          error={error}
          title="No pudimos cargar la ficha."
          onRetry={reload}
          notFound="No encontramos a este usuario."
        />
      )}

      {status === 'success' && user && (
        <>
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-3xl leading-tight font-bold tracking-tight break-words sm:text-4xl">
              {user.fullName}
            </h1>
            <div className="flex flex-wrap gap-2">
              <UserStatusBadge status={user.status} />
              <UserRoleBadge role={user.role} />
            </div>
          </div>

          {notice && <Alert variant={notice.ok ? 'success' : 'warning'}>{notice.message}</Alert>}
          <AccountNotice user={user} />

          <Card as="section" aria-labelledby="ficha-datos" className="p-4 sm:p-6">
            <h2 id="ficha-datos" className="mb-2 font-display text-xl font-bold">
              Datos de la cuenta
            </h2>
            <dl>
              <Row label="Correo">{user.email}</Row>
              <Row label="Celular">{formatPhone(user.phone)}</Row>
              <Row label="Cédula de identidad">
                <span aria-label={`Cédula enmascarada: ${user.ciMasked}`}>{user.ciMasked}</span>
              </Row>
              <Row label="Fecha de registro">{formatDateLaPaz(user.createdAt)}</Row>
              <Row label="Último ingreso">
                {user.lastLoginAt ? formatDateTimeLaPaz(user.lastLoginAt) : 'Nunca ingresó'}
              </Row>
              <Row label="Grupos">
                Titular de {plural(user.groupsAsHost, 'grupo', 'grupos')} · miembro de{' '}
                {plural(user.groupsAsMember, 'grupo', 'grupos')}
              </Row>
              <Row label="Puntualidad">
                <span className="flex flex-col gap-1">
                  <RatingBadge
                    rating={{ level: user.reputation.level, stars: user.reputation.stars }}
                  />
                  <span className="text-[15px] text-muted">
                    {plural(
                      user.reputation.consideredCharges,
                      'cobro considerado',
                      'cobros considerados',
                    )}
                  </span>
                </span>
              </Row>
              <Row label="Reportes recibidos">{user.reportsReceived}</Row>
              <Row label="Habilitación como titular">
                {user.hostEnablement ? (
                  <>
                    Habilitado por un administrador desde el{' '}
                    {formatDateLaPaz(user.hostEnablement.enabledAt)}. Motivo:{' '}
                    {user.hostEnablement.reason}
                  </>
                ) : (
                  'Sin habilitación manual'
                )}
              </Row>
            </dl>
          </Card>

          <section aria-labelledby="ficha-acciones" className="flex flex-col gap-3">
            <h2 id="ficha-acciones" className="font-display text-xl font-bold">
              Acciones
            </h2>
            {user.role === 'admin' && user.status !== 'baneado' && (
              <p className="text-muted">
                Para suspender o banear a un administrador, primero quítale el rol.
              </p>
            )}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {availableActions(user).map((kind) => (
                <Button
                  key={kind}
                  variant={ACTIONS[kind].variant === 'danger' ? 'danger' : 'secondary'}
                  onClick={() => openAction(kind)}
                >
                  {ACTIONS[kind].button}
                </Button>
              ))}
            </div>
          </section>

          {open && (
            <ReasonModal
              title={ACTIONS[open].title(user.fullName)}
              description={ACTIONS[open].description}
              confirmLabel={ACTIONS[open].confirm}
              confirmVariant={ACTIONS[open].variant}
              reasonRequired={ACTIONS[open].reasonRequired}
              validate={
                open === 'transfer'
                  ? () =>
                      !groupId.trim()
                        ? 'Escribe el identificador del grupo.'
                        : !newHost
                          ? 'Elige al nuevo titular.'
                          : null
                  : undefined
              }
              onConfirm={(reason) => confirm(open, reason)}
              onClose={() => setOpen(null)}
            >
              {open === 'transfer' && (
                <>
                  <Field
                    label="Identificador del grupo"
                    hint="Lo envían los miembros al pedir la transferencia."
                    value={groupId}
                    onChange={(event) => setGroupId(event.target.value)}
                    autoComplete="off"
                  />
                  <AdminUserPicker
                    label="Buscar al nuevo titular por nombre o correo"
                    selected={newHost}
                    onSelect={setNewHost}
                  />
                </>
              )}
            </ReasonModal>
          )}
        </>
      )}
    </>
  );
}
