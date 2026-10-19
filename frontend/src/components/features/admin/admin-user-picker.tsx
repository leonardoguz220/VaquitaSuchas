'use client';

import { useId, useState, type KeyboardEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useAdminUserSearch } from '@/hooks/use-admin-users';
import type { AdminUserRow } from '@/services/admin-users';
import { adminLoadErrorMessage, USER_STATUS_STYLE } from './admin-messages';

export interface AdminUserPickerProps {
  /** Texto del campo de búsqueda. */
  label: string;
  selected: AdminUserRow | null;
  onSelect: (user: AdminUserRow | null) => void;
}

/**
 * Elegir a una persona buscándola por nombre o correo (`GET /admin/users?q=…`), para habilitarla
 * como titular o transferirle un grupo (plan 009 §6). No es un `<form>` propio porque puede ir
 * dentro del formulario de un modal: «Enter» en el campo busca sin enviar el formulario.
 */
export function AdminUserPicker({ label, selected, onSelect }: AdminUserPickerProps) {
  const groupName = useId();
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const { status, data, error, reload } = useAdminUserSearch(query);

  function search() {
    const q = draft.trim();
    onSelect(null);
    setQuery(q);
    if (q && q === query) reload();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    search();
  }

  const items = data?.items ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field
            label={label}
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <Button type="button" variant="secondary" onClick={search}>
          Buscar persona
        </Button>
      </div>

      {query && (status === 'loading' || status === 'redirecting') && (
        <p role="status" className="text-muted">
          Buscando…
        </p>
      )}
      {query && status === 'error' && error && (
        <Alert variant="error">{adminLoadErrorMessage(error)}</Alert>
      )}
      {query && status === 'success' && items.length === 0 && (
        <p role="status" className="text-muted">
          No encontramos a nadie con «{query}».
        </p>
      )}
      {query && status === 'success' && items.length > 0 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-bold">Elige a la persona</legend>
          {items.map((user) => (
            <label
              key={user.id}
              className="flex min-h-11 items-center gap-3 rounded-field border border-line px-3 py-2"
            >
              <input
                type="radio"
                name={groupName}
                value={user.id}
                checked={selected?.id === user.id}
                onChange={() => onSelect(user)}
                className="size-5 shrink-0 accent-primary"
              />
              <span className="flex min-w-0 flex-col">
                <span className="font-bold break-words">{user.fullName}</span>
                <span className="text-[15px] break-all text-muted">
                  {user.email} · {USER_STATUS_STYLE[user.status].label}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  );
}
