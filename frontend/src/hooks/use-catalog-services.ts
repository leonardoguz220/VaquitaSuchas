'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CATALOG_PAGE_SIZE,
  listCategories,
  listServices,
  type CatalogCategory,
  type CatalogCategoryOption,
  type CatalogService,
} from '@/services/catalog';
import { toApiError, type ApiError } from '@/services/http';
import { useUnauthorizedRedirect } from './use-unauthorized-redirect';

/** Espera tras la última tecla antes de buscar (RF-004-04). */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * `loading`: cargando. `success`: llegó la lista (puede venir vacía). `error`: falló por otra
 * causa (aviso con Reintentar). `redirecting`: llegó un `401` y se va a `/ingresar?next=…`.
 */
export type CatalogServicesState =
  | { status: 'loading' }
  | { status: 'success'; items: CatalogService[]; nextCursor: string | null }
  | { status: 'error'; error: ApiError }
  | { status: 'redirecting' };

/** Chips de categoría. Si fallan, no se muestran y la lista sigue funcionando. */
export type CatalogCategoriesState =
  | { status: 'loading' }
  | { status: 'success'; items: CatalogCategoryOption[] }
  | { status: 'error' };

export interface UseCatalogServicesResult {
  state: CatalogServicesState;
  /** Vuelve a pedir la lista desde el principio (botón «Reintentar»). */
  retry: () => void;
  /** Pide la página siguiente si `nextCursor` no es `null`. */
  loadMore: () => void;
  isLoadingMore: boolean;
  loadMoreFailed: boolean;
  /** Texto de búsqueda tal como lo escribe la persona (máximo 60 caracteres). */
  query: string;
  setQuery: (value: string) => void;
  /** Categoría elegida; `null` = todas. */
  category: CatalogCategory | null;
  setCategory: (value: CatalogCategory | null) => void;
  categories: CatalogCategoriesState;
}

const LOADING: CatalogServicesState = { status: 'loading' };

/** Carga las categorías para los chips (`GET /catalog/categories`, RF-004-03). */
function useCatalogCategories(): CatalogCategoriesState {
  const [state, setState] = useState<CatalogCategoriesState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    listCategories({ signal: controller.signal }).then(
      (page) => {
        if (!controller.signal.aborted) setState({ status: 'success', items: page.items });
      },
      () => {
        if (!controller.signal.aborted) setState({ status: 'error' });
      },
    );
    return () => controller.abort();
  }, []);

  return state;
}

/**
 * Listado del selector de servicio (`GET /catalog/services`, RF-004-04) con búsqueda, filtro de
 * categoría y «Ver más». La búsqueda espera 250 ms tras la última tecla. Cada cambio de filtro
 * vuelve a pedir la lista desde el principio y cancela lo que estuviera en curso.
 */
export function useCatalogServices(): UseCatalogServicesResult {
  const [state, setState] = useState<CatalogServicesState>(LOADING);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [category, setCategory] = useState<CatalogCategory | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadMoreFailed, setLoadMoreFailed] = useState(false);
  const redirectIfUnauthorized = useUnauthorizedRedirect();
  // En una ref para que un cambio de ruta no vuelva a pedir la lista.
  const redirectRef = useRef(redirectIfUnauthorized);
  const moreController = useRef<AbortController | null>(null);
  // Búsqueda ya aplicada a la lista: evita recargar si el texto vuelve al mismo valor.
  const appliedQuery = useRef('');
  const categories = useCatalogCategories();

  /** Deja la lista en cargando y cancela «Ver más» en curso; lo llaman los cambios de filtro. */
  const resetList = useCallback(() => {
    moreController.current?.abort();
    setIsLoadingMore(false);
    setLoadMoreFailed(false);
    setState(LOADING);
  }, []);

  useEffect(() => {
    redirectRef.current = redirectIfUnauthorized;
  }, [redirectIfUnauthorized]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const next = query.trim();
      if (next === appliedQuery.current) return;
      appliedQuery.current = next;
      resetList();
      setDebouncedQuery(next);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, resetList]);

  const fail = useCallback((caught: unknown): CatalogServicesState => {
    const error = toApiError(caught);
    return redirectRef.current(error) ? { status: 'redirecting' } : { status: 'error', error };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    listServices(
      { category: category ?? undefined, q: debouncedQuery || undefined },
      { signal: controller.signal },
    ).then(
      (page) => {
        if (!controller.signal.aborted) {
          setState({ status: 'success', items: page.items, nextCursor: page.nextCursor });
        }
      },
      (caught: unknown) => {
        if (!controller.signal.aborted) setState(fail(caught));
      },
    );
    return () => {
      controller.abort();
      moreController.current?.abort();
    };
  }, [attempt, category, debouncedQuery, fail]);

  const retry = useCallback(() => {
    resetList();
    setAttempt((current) => current + 1);
  }, [resetList]);

  const changeCategory = useCallback(
    (value: CatalogCategory | null) => {
      if (value === category) return;
      resetList();
      setCategory(value);
    },
    [category, resetList],
  );

  const loadMore = useCallback(() => {
    if (state.status !== 'success' || state.nextCursor === null || isLoadingMore) return;
    const controller = new AbortController();
    moreController.current = controller;
    setIsLoadingMore(true);
    setLoadMoreFailed(false);
    listServices(
      {
        category: category ?? undefined,
        q: debouncedQuery || undefined,
        cursor: state.nextCursor,
        limit: CATALOG_PAGE_SIZE,
      },
      { signal: controller.signal },
    ).then(
      (page) => {
        if (controller.signal.aborted) return;
        setState((current) =>
          current.status === 'success'
            ? {
                status: 'success',
                items: [...current.items, ...page.items],
                nextCursor: page.nextCursor,
              }
            : current,
        );
        setIsLoadingMore(false);
      },
      (caught: unknown) => {
        if (controller.signal.aborted) return;
        setIsLoadingMore(false);
        if (redirectRef.current(toApiError(caught))) setState({ status: 'redirecting' });
        else setLoadMoreFailed(true);
      },
    );
  }, [state, isLoadingMore, category, debouncedQuery]);

  return {
    state,
    retry,
    loadMore,
    isLoadingMore,
    loadMoreFailed,
    query,
    setQuery,
    category,
    setCategory: changeCategory,
    categories,
  };
}
