'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Select } from '@/components/ui';
import { useAdminUsers, type AdminUserFilters } from '@/hooks/use-admin-users';
import { formatDateLaPaz } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { adminUserPath } from '@/lib/routes';
import type { AdminUserRole, AdminUserRow, AdminUserStatus } from '@/services/admin-users';
import { adminLoadErrorMessage } from './admin-messages';
import { AdminListSkeleton, AdminLoadError, UserRoleBadge, UserStatusBadge } from './admin-states';

const STATUS_OPTIONS: Array<{ value: AdminUserStatus; label: string }> = [
  { value: 'activo', label: 'Activo' },
  { value: 'suspendido', label: 'Suspendido' },
  { value: 'baneado', label: 'Baneado' },
];

const ROLE_OPTIONS: Array<{ value: AdminUserRole; label: string }> = [
  { value: 'usuario', label: 'Usuario' },
  { value: 'admin', label: 'Administrador' },
];

/** Una persona: tarjeta en el celular y fila en pantalla ancha, sin tabla ancha (RNF-009-06). */
function UserRowItem({ user }: { user: AdminUserRow }) {
  return (
    <article className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-4">
      <div className="flex min-w-0 flex-col">
        <Link
          href={adminUserPath(user.id)}
          className="inline-flex min-h-11 items-center font-bold break-words"
        >
          {user.fullName}
        </Link>
        <span className="text-[15px] break-all text-muted">{user.email}</span>
      </div>
      <dl className="flex flex-col text-[15px]">
        <div className="flex gap-1">
          <dt className="text-muted">Celular:</dt>
          <dd>{formatPhone(user.phone)}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-muted">Alta:</dt>
          <dd>{formatDateLaPaz(user.createdAt)}</dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2 sm:contents">
        <UserRoleBadge role={user.role} />
        <UserStatusBadge status={user.status} />
      </div>
    </article>
  );
}

/**
 * `/admin/usuarios` (spec 009 T017, plan §6; mockup `AdminUsuarios.dc.html`): búsqueda por nombre
 * o correo (la API ignora tildes y mayúsculas, CA-009-07), filtros por estado y rol, y lista
 * paginada con estado y rol (RF-009-08). Cada persona abre su ficha.
 */
export function AdminUsersView() {
  const [draft, setDraft] = useState('');
  const [filters, setFilters] = useState<AdminUserFilters>({});
  const { status, error, reload, items, hasMore, loadMore, isLoadingMore, loadMoreError } =
    useAdminUsers(filters);
  const filtered = Boolean(filters.q || filters.status || filters.role);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = draft.trim();
    setFilters((current) => ({ ...current, q: q || undefined }));
  }

  function clearFilters() {
    setDraft('');
    setFilters({});
  }

  return (
    <>
      <h1 className="font-display text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
        Usuarios
      </h1>

      <section aria-label="Búsqueda y filtros" className="flex flex-col gap-3">
        <form
          role="search"
          onSubmit={handleSearch}
          className="flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Field
              label="Buscar por nombre o correo"
              type="search"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </div>
          <Button type="submit">Buscar</Button>
        </form>
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label="Estado"
            value={filters.status ?? ''}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                status: (event.target.value || undefined) as AdminUserStatus | undefined,
              }))
            }
          >
            <option value="">Todos los estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
          <Select
            label="Rol"
            value={filters.role ?? ''}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                role: (event.target.value || undefined) as AdminUserRole | undefined,
              }))
            }
          >
            <option value="">Todos los roles</option>
            {ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      </section>

      {(status === 'loading' || status === 'redirecting') && (
        <AdminListSkeleton label="Cargando usuarios…" />
      )}

      {status === 'error' && error && (
        <AdminLoadError error={error} title="No pudimos cargar los usuarios." onRetry={reload} />
      )}

      {status === 'success' && items.length === 0 && (
        <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5">
          <p className="font-bold">
            {filters.q
              ? `No encontramos usuarios con «${filters.q}».`
              : filtered
                ? 'No hay usuarios con esos filtros.'
                : 'Todavía no hay usuarios registrados.'}
          </p>
          {filtered && (
            <>
              <p className="text-muted">Prueba con otro nombre, otro correo u otros filtros.</p>
              <Button
                variant="secondary"
                onClick={clearFilters}
                className="w-full sm:w-auto sm:self-start"
              >
                Quitar filtros
              </Button>
            </>
          )}
        </div>
      )}

      {status === 'success' && items.length > 0 && (
        <>
          <ul aria-label="Usuarios" className="flex flex-col gap-3">
            {items.map((user) => (
              <li key={user.id}>
                <UserRowItem user={user} />
              </li>
            ))}
          </ul>
          {loadMoreError && <Alert variant="error">{adminLoadErrorMessage(loadMoreError)}</Alert>}
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
    </>
  );
}
