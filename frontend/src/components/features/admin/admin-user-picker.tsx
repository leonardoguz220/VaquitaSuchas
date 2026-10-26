'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Field } from '@/components/ui';
import { useAdminUserSearch } from '@/hooks/use-admin-user-search';
import { ROLE_LABEL } from './admin-labels';
import type { AdminUserRow } from '@/services/admin';

/**
 * Busca a una persona por nombre o correo para elegirla (habilitar como titular, transferir la
 * titularidad). La búsqueda se hace al pulsar «Buscar», no mientras se escribe.
 */
export function AdminUserPicker({
  selected,
  onSelect,
}: {
  selected: AdminUserRow | null;
  onSelect: (user: AdminUserRow) => void;
}) {
  const [text, setText] = useState('');
  const { data, status, error, search, reload, term } = useAdminUserSearch();
  const items = data?.items ?? [];

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search(text);
  }

  return (
    <div className="flex flex-col gap-3">
      <form
        role="search"
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="flex-1">
          <Field
            name="persona"
            type="search"
            label="Buscar persona"
            hint="Nombre o correo, de al menos 2 letras"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {selected && (
        <p className="text-sm">
          Elegida: <strong>{selected.fullName}</strong> · {ROLE_LABEL[selected.role]}
        </p>
      )}

      {status === 'loading' && (
        <p role="status" className="text-sm text-muted">
          Buscando…
        </p>
      )}
      {status === 'error' && (
        <div className="flex flex-col gap-2">
          <Alert variant="error">{error?.message}</Alert>
          <Button variant="secondary" onClick={reload} className="self-start">
            Reintentar
          </Button>
        </div>
      )}
      {status === 'success' && term.length >= 2 && items.length === 0 && (
        <p className="text-sm text-muted">No encontramos a nadie con esa búsqueda.</p>
      )}
      {status === 'success' && items.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Resultados de la búsqueda">
          {items.map((user) => {
            const isSelected = selected?.id === user.id;
            return (
              <li key={user.id}>
                <button
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => onSelect(user)}
                  className={`flex min-h-11 w-full items-center justify-between gap-3 rounded-field border px-4 py-2 text-left ${
                    isSelected ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
                  }`}
                >
                  <span className="font-bold">{user.fullName}</span>
                  <span className="text-sm text-muted">
                    {ROLE_LABEL[user.role]} · {isSelected ? 'Elegida' : 'Elegir'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
