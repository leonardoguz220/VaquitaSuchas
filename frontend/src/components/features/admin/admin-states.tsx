'use client';

import { Alert, Badge, Button } from '@/components/ui';
import { PANEL_PATH } from '@/lib/routes';
import type { AdminUserRole, AdminUserStatus } from '@/services/admin-users';
import type { ApiError } from '@/services/http';
import { adminLoadErrorMessage, USER_ROLE_LABEL, USER_STATUS_STYLE } from './admin-messages';

/**
 * Error al cargar una vista del panel. Con `403` (la cuenta no es administradora, CA-009-01)
 * ofrece volver al panel propio en lugar de reintentar; con otro error, «Reintentar».
 */
export function AdminLoadError({
  error,
  title,
  onRetry,
  notFound,
}: {
  error: ApiError;
  title: string;
  onRetry: () => void;
  notFound?: string;
}) {
  const forbidden = error.statusCode === 403;
  return (
    <Alert
      variant="error"
      title={forbidden ? 'No tienes acceso al panel de administración.' : title}
      action={
        forbidden ? (
          <Button variant="secondary" href={PANEL_PATH}>
            Ir a mi panel
          </Button>
        ) : (
          <Button variant="secondary" onClick={onRetry}>
            Reintentar
          </Button>
        )
      }
    >
      {adminLoadErrorMessage(error, notFound)}
    </Alert>
  );
}

/** Esqueleto de carga de una lista del panel. */
export function AdminListSkeleton({ label, rows = 4 }: { label: string; rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="flex flex-col gap-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, item) => (
        <div
          key={item}
          aria-hidden="true"
          className="h-20 animate-pulse rounded-card border border-line bg-surface motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

/** Estado de la cuenta con texto, color e ícono (no solo el color). */
export function UserStatusBadge({ status }: { status: AdminUserStatus }) {
  const style = USER_STATUS_STYLE[status];
  return (
    <Badge variant={style.tone} icon={style.icon}>
      {style.label}
    </Badge>
  );
}

/** Rol con texto; el de administrador lleva además un ícono. */
export function UserRoleBadge({ role }: { role: AdminUserRole }) {
  return (
    <Badge variant={role === 'admin' ? 'info' : 'neutral'} icon={role === 'admin' ? 'star' : 'dot'}>
      {USER_ROLE_LABEL[role]}
    </Badge>
  );
}
