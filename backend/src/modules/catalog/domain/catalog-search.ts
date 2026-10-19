export const MAX_SEARCH_LENGTH = 60;

/**
 * Clave de búsqueda: recorta, pasa a minúsculas, quita tildes (NFD) y colapsa espacios.
 * Equivale a `immutable_unaccent(lower(texto))` de la base (vista `catalog_service_search`).
 */
export function normalizeSearchTerm(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/\s+/g, ' ')
    .slice(0, MAX_SEARCH_LENGTH);
}

/** Escapa `\`, `%` y `_` para usar el texto dentro de un `LIKE ... ESCAPE '\'`. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, '\\$&');
}
