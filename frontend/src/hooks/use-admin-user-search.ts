'use client';

import { useCallback, useState } from 'react';
import { listAdminUsers, type AdminUserRow } from '@/services/admin';
import { useApiResource } from './use-api-resource';

/** Resultados que se muestran al buscar a alguien para habilitarlo o transferirle la titularidad. */
export const ADMIN_USER_SEARCH_LIMIT = 5;

/**
 * Busca usuarios por nombre o correo al pulsar «Buscar». No busca mientras se escribe ni con menos
 * de dos letras; la lista la arma la API.
 */
export function useAdminUserSearch() {
  const [submitted, setSubmitted] = useState('');
  const load = useCallback(
    () =>
      submitted.length < 2
        ? Promise.resolve({ items: [] as AdminUserRow[], nextCursor: null })
        : listAdminUsers({ q: submitted, limit: ADMIN_USER_SEARCH_LIMIT }),
    [submitted],
  );
  const resource = useApiResource(load);
  const search = useCallback((term: string) => setSubmitted(term.trim()), []);
  return { ...resource, search, term: submitted };
}
