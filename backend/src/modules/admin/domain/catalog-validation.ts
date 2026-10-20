import { isCategory } from '../../catalog/domain/categories.js';

export interface RawCatalogRow {
  /** Número de fila en el archivo (CSV: la línea; JSON: la posición desde 1). */
  row: number;
  kind?: unknown;
  fields: Record<string, unknown>;
}

export interface CatalogServiceRow {
  kind: 'service';
  row: number;
  slug: string;
  name: string;
  category: string;
  logoUrl: string | null;
  brandColor: string | null;
}

export interface CatalogPlanRow {
  kind: 'plan';
  row: number;
  serviceSlug: string;
  slug: string;
  name: string;
  priceCents: number;
  currency: 'USD' | 'BS';
  maxSlots: number;
  individualPriceCents: number | null;
  verifiedOn: string | null;
  verifiedSource: string | null;
}

export type CatalogRow = CatalogServiceRow | CatalogPlanRow;

export interface RowError {
  row: number;
  field: string;
  message: string;
}

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MIN_SLOTS = 2;
export const MAX_SLOTS = 20;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : null;

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

/** Valida un servicio suelto (alta o importación): devuelve la fila o los errores por campo. */
export function validateService(
  row: number,
  f: Record<string, unknown>,
): { value: CatalogServiceRow } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const fail = (field: string, message: string): void => void errors.push({ row, field, message });
  const slug = text(f['slug']);
  if (!slug || !SLUG.test(slug)) fail('slug', 'El slug usa minúsculas, números y guiones.');
  const name = text(f['name']);
  if (!name || name.length < 2 || name.length > 60)
    fail('name', 'El nombre tiene de 2 a 60 caracteres.');
  const category = text(f['category']);
  if (!isCategory(category)) fail('category', 'La categoría no es válida.');
  const logoUrl = text(f['logoUrl']);
  if (logoUrl !== null && !/^https:\/\/\S+$/.test(logoUrl))
    fail('logoUrl', 'El logo debe ser una URL https.');
  const brandColor = text(f['brandColor']);
  if (brandColor !== null && !COLOR.test(brandColor)) fail('brandColor', 'El color es #RRGGBB.');
  if (errors.length > 0) return { errors };
  return {
    value: {
      kind: 'service',
      row,
      slug: slug as string,
      name: name as string,
      category: category as string,
      logoUrl,
      brandColor,
    },
  };
}

/** Valida un plan suelto: cupos 2–20, montos positivos, moneda USD o BS. */
export function validatePlan(
  row: number,
  f: Record<string, unknown>,
): { value: CatalogPlanRow } | { errors: RowError[] } {
  const errors: RowError[] = [];
  const fail = (field: string, message: string): void => void errors.push({ row, field, message });
  const serviceSlug = text(f['serviceSlug']);
  if (!serviceSlug || !SLUG.test(serviceSlug)) fail('serviceSlug', 'Falta el servicio del plan.');
  const slug = text(f['slug']);
  if (!slug || !SLUG.test(slug)) fail('slug', 'El slug usa minúsculas, números y guiones.');
  const name = text(f['name']);
  if (!name || name.length < 2 || name.length > 60)
    fail('name', 'El nombre tiene de 2 a 60 caracteres.');
  const priceCents = positiveInt(f['priceCents']);
  if (priceCents === null) fail('priceCents', 'El precio debe ser un monto positivo.');
  const currency = text(f['currency'])?.toUpperCase() ?? null;
  if (currency !== 'USD' && currency !== 'BS') fail('currency', 'La moneda es USD o BS.');
  const maxSlots = f['maxSlots'];
  if (
    typeof maxSlots !== 'number' ||
    !Number.isInteger(maxSlots) ||
    maxSlots < MIN_SLOTS ||
    maxSlots > MAX_SLOTS
  ) {
    fail('maxSlots', `Los cupos van de ${MIN_SLOTS} a ${MAX_SLOTS}.`);
  }
  const individual = f['individualPriceCents'];
  const individualPriceCents =
    individual === undefined || individual === null ? null : positiveInt(individual);
  if (individual !== undefined && individual !== null && individualPriceCents === null) {
    fail('individualPriceCents', 'El precio individual debe ser un monto positivo.');
  }
  const verifiedOn = text(f['verifiedOn']);
  if (verifiedOn !== null && !DATE.test(verifiedOn)) fail('verifiedOn', 'La fecha es AAAA-MM-DD.');
  if (errors.length > 0) return { errors };
  return {
    value: {
      kind: 'plan',
      row,
      serviceSlug: serviceSlug as string,
      slug: slug as string,
      name: name as string,
      priceCents: priceCents as number,
      currency: currency as 'USD' | 'BS',
      maxSlots: maxSlots as number,
      individualPriceCents,
      verifiedOn,
      verifiedSource: text(f['verifiedSource']),
    },
  };
}

/**
 * Valida las filas de una importación (RF-009-06): cada fila por su tipo, `slug` único dentro
 * del archivo, todos los errores por fila a la vez para corregirlos juntos (CA-009-06).
 */
export function validateCatalogRows(raw: readonly RawCatalogRow[]): {
  rows: CatalogRow[];
  errors: RowError[];
} {
  const rows: CatalogRow[] = [];
  const errors: RowError[] = [];
  const seen = { service: new Set<string>(), plan: new Set<string>() };
  for (const item of raw) {
    if (item.kind !== 'service' && item.kind !== 'plan') {
      errors.push({ row: item.row, field: 'kind', message: 'El tipo es servicio o plan.' });
      continue;
    }
    const result =
      item.kind === 'service'
        ? validateService(item.row, item.fields)
        : validatePlan(item.row, item.fields);
    if ('errors' in result) {
      errors.push(...result.errors);
      continue;
    }
    if (seen[item.kind].has(result.value.slug)) {
      errors.push({
        row: item.row,
        field: 'slug',
        message: 'El slug está repetido en el archivo.',
      });
      continue;
    }
    seen[item.kind].add(result.value.slug);
    rows.push(result.value);
  }
  return { rows, errors };
}
