/**
 * Constantes del catálogo de administración (spec 009, RF-009-05 y RF-009-07). Viven aparte para
 * que los datos simulados de las pruebas no dependan del cliente de la API.
 */

/** Límites de cupos del contrato (RF-009-07). */
export const CATALOG_MIN_SLOTS = 2;
export const CATALOG_MAX_SLOTS = 20;

/** Aviso que devuelve la API al tocar precio o cupos de un plan (RF-009-05, CA-009-04). */
export const CATALOG_EDIT_WARNING = 'No cambia las suscripciones existentes';
