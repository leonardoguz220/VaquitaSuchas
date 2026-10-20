'use client';

import { useState } from 'react';
import { RatingBadge } from '@/components/features/reputation/rating-badge';
import { Alert, Button, Card } from '@/components/ui';
import type { ApiSubmitResult } from '@/hooks/use-api-submit';
import { useAdminUser, type AdminUserAction } from '@/hooks/use-admin-user';
import { formatDateLaPaz, formatDateTimeLaPaz } from '@/lib/dates';
import type { AdminUserDetail } from '@/services/admin';
import { AdminActionDialog } from './admin-action-dialog';
import { AdminStatusBadge } from './admin-status-badge';
import { ROLE_LABEL } from './admin-labels';

type DialogKind = 'suspend' | 'reactivate' | 'ban' | 'unban' | 'promote' | 'demote';

interface DialogConfig {
  title: string;
  description: string;
  confirmLabel: string;
  danger: boolean;
  reasonRequired: boolean;
  notice: string;
}

function dialogFor(kind: DialogKind, user: AdminUserDetail): DialogConfig {
  switch (kind) {
    case 'suspend':
      return {
        title: `¿Suspender a ${user.fullName}?`,
        description:
          'Se cierran sus sesiones y no podrá ingresar. Recibirá un correo con el motivo y el contacto para apelar. Sus grupos siguen funcionando.',
        confirmLabel: 'Suspender',
        danger: true,
        reasonRequired: true,
        notice: 'La cuenta quedó suspendida.',
      };
    case 'reactivate':
      return {
        title: `¿Reactivar a ${user.fullName}?`,
        description: 'La cuenta vuelve a estar activa y podrá ingresar de nuevo.',
        confirmLabel: 'Reactivar',
        danger: false,
        reasonRequired: false,
        notice: 'La cuenta está activa otra vez.',
      };
    case 'ban':
      return {
        title: `¿Banear a ${user.fullName}?`,
        description:
          'Se cierran sus sesiones y se bloquean su correo, celular, cédula y Telegram. Se le retira de los grupos donde es miembro y los grupos que administra quedan congelados.',
        confirmLabel: 'Banear',
        danger: true,
        reasonRequired: true,
        notice: 'La cuenta quedó baneada.',
      };
    case 'unban':
      return {
        title: `¿Revertir el baneo de ${user.fullName}?`,
        description:
          'La cuenta vuelve a estar activa y se liberan su correo, celular, cédula y Telegram. Los grupos que el baneo congeló se descongelan. No se restituyen las pertenencias ni los cobros.',
        confirmLabel: 'Revertir baneo',
        danger: true,
        reasonRequired: true,
        notice: 'El baneo fue revertido.',
      };
    case 'promote':
      return {
        title: `¿Promover a ${user.fullName} a administrador?`,
        description: 'Podrá entrar a todo el panel de administración. Queda en auditoría.',
        confirmLabel: 'Promover',
        danger: false,
        reasonRequired: true,
        notice: 'Ahora es administrador.',
      };
    case 'demote':
      return {
        title: `¿Quitar el rol de administrador a ${user.fullName}?`,
        description: 'Perderá el acceso al panel de administración. Queda en auditoría.',
        confirmLabel: 'Quitar rol',
        danger: true,
        reasonRequired: true,
        notice: 'Ya no es administrador.',
      };
  }
}

function actionFor(kind: DialogKind, reason: string, user: AdminUserDetail): AdminUserAction {
  switch (kind) {
    case 'suspend':
      return { type: 'suspend', reason };
    case 'unban':
      return { type: 'unban', banId: user.ban?.id ?? '', reason };
    case 'reactivate':
      return { type: 'reactivate', reason: reason || undefined };
    case 'ban':
      return { type: 'ban', reason };
    case 'promote':
      return { type: 'role', role: 'admin', reason };
    case 'demote':
      return { type: 'role', role: 'usuario', reason };
  }
}

/**
 * `/admin/usuarios/[id]` (plan 009 §6, RF-009-09 a RF-009-19): ficha con la CI enmascarada, grupos,
 * puntualidad y las acciones de la cuenta. Cada acción sensible abre su confirmación con motivo.
 * Las acciones que no corresponden al estado actual no se muestran.
 */
export function AdminUserView({ userId }: { userId: string }) {
  const ficha = useAdminUser(userId);
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (ficha.status === 'redirecting') return null;

  if (ficha.status === 'loading') {
    return (
      <p role="status" className="text-muted">
        Cargando la ficha…
      </p>
    );
  }

  if (ficha.status === 'error' || !ficha.data) {
    return (
      <div className="flex flex-col gap-3">
        <Alert variant="error" title="No se pudo cargar la ficha">
          {ficha.error?.message}
        </Alert>
        <Button variant="secondary" onClick={ficha.reload} className="self-start">
          Reintentar
        </Button>
      </div>
    );
  }

  const user = ficha.data;
  const config = dialog ? dialogFor(dialog, user) : null;

  async function confirm(reason: string): Promise<ApiSubmitResult<unknown> | null> {
    if (!dialog) return null;
    const outcome = await ficha.act(actionFor(dialog, reason, user));
    if (outcome?.ok) {
      setNotice(dialogFor(dialog, outcome.data).notice);
      setDialog(null);
    }
    return outcome;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl tracking-tight">{user.fullName}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <AdminStatusBadge status={user.status} />
          <span className="rounded-full border border-line px-3 py-1 text-sm font-bold">
            {ROLE_LABEL[user.role]}
          </span>
        </div>
      </div>

      {notice && <Alert variant="success">{notice}</Alert>}

      {user.ban && (
        <Alert variant="error" title="Cuenta baneada">
          {`Baneada el ${formatDateTimeLaPaz(user.ban.at)} por ${user.ban.by}. Motivo: ${user.ban.reason}`}
        </Alert>
      )}
      {user.suspension && (
        <Alert variant="warning" title="Cuenta suspendida">
          {`Suspendida el ${formatDateTimeLaPaz(user.suspension.at)}. Motivo: ${user.suspension.reason}`}
        </Alert>
      )}

      <Card>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Info label="Correo" value={user.email} />
          <Info label="CI" value={user.ciMasked} />
          <Info label="Celular" value={user.phone ?? '—'} />
          <Info
            label="Último ingreso"
            value={user.lastLoginAt ? formatDateTimeLaPaz(user.lastLoginAt) : 'Nunca'}
          />
          <Info label="Alta" value={formatDateLaPaz(user.createdAt)} />
          <Info
            label="Grupos"
            value={`Titular de ${user.groupsAsHost} · miembro de ${user.groupsAsMember}`}
          />
          <Info label="Reportes recibidos" value={String(user.reportsReceived)} />
          <div className="flex flex-col gap-1">
            <dt className="text-sm text-muted">Puntualidad</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <RatingBadge rating={user.reputation} />
              <span className="text-sm text-muted">
                {user.reputation.consideredCharges} cobros considerados
              </span>
            </dd>
          </div>
          {user.hostEnablement && (
            <Info
              label="Habilitado como titular"
              value={`Por ${user.hostEnablement.by}: ${user.hostEnablement.reason}`}
            />
          )}
        </dl>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {user.status === 'activo' && (
          <Button variant="secondary" onClick={() => setDialog('suspend')}>
            Suspender
          </Button>
        )}
        {user.status === 'suspendido' && (
          <Button variant="secondary" onClick={() => setDialog('reactivate')}>
            Reactivar
          </Button>
        )}
        {user.status !== 'baneado' && (
          <Button variant="danger" onClick={() => setDialog('ban')}>
            Banear
          </Button>
        )}
        {user.status === 'baneado' && user.ban && (
          <Button variant="secondary" onClick={() => setDialog('unban')}>
            Revertir baneo
          </Button>
        )}
        {user.role === 'usuario' ? (
          <Button variant="secondary" onClick={() => setDialog('promote')}>
            Promover a administrador
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setDialog('demote')}>
            Quitar rol de administrador
          </Button>
        )}
      </div>

      {config && (
        <AdminActionDialog
          open
          onClose={() => setDialog(null)}
          title={config.title}
          description={config.description}
          confirmLabel={config.confirmLabel}
          danger={config.danger}
          reasonRequired={config.reasonRequired}
          onConfirm={confirm}
        />
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="font-bold text-ink">{value}</dd>
    </div>
  );
}
