'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Button, Card, Field, Select } from '@/components/ui';
import { useAdminUsers, type AdminUserFilters } from '@/hooks/use-admin-users';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import type { AdminRole, AdminUserRow, AdminUserStatus } from '@/services/admin';
import { formatDateLaPaz } from '@/lib/dates';
import { adminUserPath } from '@/lib/routes';
import { AdminStatusBadge } from './admin-status-badge';
import { ROLE_LABEL } from './admin-labels';

const EMPTY_FILTERS: AdminUserFilters = { q: '', status: null, role: null };

/**
 * `/admin/usuarios` (plan 009 §6, RF-009-08, CA-009-07): búsqueda, filtros por estado y rol y una
 * lista paginada en tarjetas, pensada para celular. Cada fila muestra el estado con texto e ícono.
 */
export function AdminUsersView() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AdminUserStatus | ''>('');
  const [role, setRole] = useState<AdminRole | ''>('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const filters: AdminUserFilters = {
    ...EMPTY_FILTERS,
    q: debouncedSearch,
    status: status || null,
    role: role || null,
  };
  const list = useAdminUsers(filters);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-3xl tracking-tight">Usuarios</h1>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field
          name="q"
          type="search"
          label="Buscar"
          placeholder="Nombre, correo o celular"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="sm:col-span-1"
        />
        <Select
          name="status"
          label="Estado"
          value={status}
          onChange={(event) => setStatus(event.target.value as AdminUserStatus | '')}
        >
          <option value="">Todos los estados</option>
          <option value="activo">Activo</option>
          <option value="suspendido">Suspendido</option>
          <option value="baneado">Baneado</option>
        </Select>
        <Select
          name="role"
          label="Rol"
          value={role}
          onChange={(event) => setRole(event.target.value as AdminRole | '')}
        >
          <option value="">Todos los roles</option>
          <option value="usuario">Usuario</option>
          <option value="admin">Administrador</option>
        </Select>
      </div>

      {list.status === 'loading' && (
        <p role="status" className="text-muted">
          Cargando usuarios…
        </p>
      )}

      {list.status === 'error' && (
        <div className="flex flex-col gap-3">
          <Alert variant="error" title="No se pudieron cargar los usuarios">
            {list.error?.message}
          </Alert>
          <Button variant="secondary" onClick={list.reload} className="self-start">
            Reintentar
          </Button>
        </div>
      )}

      {list.status === 'success' && list.items.length === 0 && (
        <p className="text-muted">Ninguna persona coincide con esa búsqueda.</p>
      )}

      {list.status === 'success' && list.items.length > 0 && (
        <>
          <ul className="grid gap-3 sm:grid-cols-2" aria-label="Lista de usuarios">
            {list.items.map((item) => (
              <li key={item.id}>
                <UserCard user={item} />
              </li>
            ))}
          </ul>
          {list.loadMoreError && <Alert variant="error">{list.loadMoreError.message}</Alert>}
          {list.hasMore && (
            <Button
              variant="secondary"
              loading={list.isLoadingMore}
              onClick={() => void list.loadMore()}
              className="self-center"
            >
              Cargar más
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function UserCard({ user }: { user: AdminUserRow }) {
  return (
    <Link
      href={adminUserPath(user.id)}
      className="flex min-h-11 flex-col gap-2 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Card className="flex flex-col gap-2 transition-colors hover:border-primary">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-bold text-ink">{user.fullName}</span>
          <AdminStatusBadge status={user.status} />
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Celular</dt>
          <dd className="text-ink">{user.phone ?? '—'}</dd>
          <dt className="text-muted">Rol</dt>
          <dd className="text-ink">{ROLE_LABEL[user.role]}</dd>
          <dt className="text-muted">Alta</dt>
          <dd className="text-ink">{formatDateLaPaz(user.createdAt)}</dd>
        </dl>
      </Card>
    </Link>
  );
}
